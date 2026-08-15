"use strict"

const crypto = require("node:crypto")

const SESSION_TTL_MS = 10 * 60 * 1000
const LOGIN_WINDOW_MS = 15 * 60 * 1000
const LOGIN_MAX_FAILURES = 5

function text(value, max = 500) {
  return String(value ?? "").trim().slice(0, max)
}

function formatBrazilianDate(value) {
  const raw = text(value, 80)
  if (!raw) return ""
  let match = raw.match(/^(\d{4})-(\d{2})-(\d{2})(?:T.*)?$/)
  if (match && validDateParts(match[1], match[2], match[3])) return `${match[3]}/${match[2]}/${match[1]}`
  match = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/)
  if (match && validDateParts(match[3], match[2], match[1])) return `${match[1].padStart(2, "0")}/${match[2].padStart(2, "0")}/${match[3]}`
  if (/^\d{11,13}$/.test(raw)) {
    const date = new Date(Number(raw))
    if (!Number.isNaN(date.getTime())) {
      return new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" }).format(date)
    }
  }
  return raw
}

function validDateParts(yearValue, monthValue, dayValue) {
  const year = Number(yearValue)
  const month = Number(monthValue)
  const day = Number(dayValue)
  const date = new Date(Date.UTC(year, month - 1, day))
  return year >= 1900 && year <= new Date().getUTCFullYear() &&
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
}

function firstText(...values) {
  for (const value of values) {
    const found = text(value)
    if (found) return found
  }
  return ""
}

function deriveKey(masterSecret) {
  const secret = text(masterSecret, 4096)
  if (!secret) throw new Error("CREDENTIALS_VAULT_MASTER_SECRET_REQUIRED")
  return crypto.scryptSync(secret, "oraculum-credentials-vault-v1", 32)
}

function encryptJson(value, key) {
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv)
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()])
  return {
    ciphertext: ciphertext.toString("base64"),
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64")
  }
}

function decryptJson(record, key) {
  if (!record?.ciphertext || !record?.iv || !record?.tag) return null
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(record.iv, "base64"))
  decipher.setAuthTag(Buffer.from(record.tag, "base64"))
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(record.ciphertext, "base64")),
    decipher.final()
  ])
  return JSON.parse(plaintext.toString("utf8"))
}

function profileFromUser(user = {}) {
  const motherName = firstText(user.nomeMae, user.nome_mae, user.motherName, user.filiacao?.mae, user.filiacao?.mother)
  const fatherName = firstText(user.nomePai, user.nome_pai, user.fatherName, user.filiacao?.pai, user.filiacao?.father)
  const parentage = typeof user.filiacao === "string" ? text(user.filiacao, 500) : ""
  return {
    caseNumber: text(user.numeroCaso, 80),
    dealId: text(user.negocioId, 80),
    contactId: text(user.contatoId, 80),
    name: text(user.nome || user.nomeCompleto || user.nomeContato, 200),
    cpf: text(user.cpf || user._cpf, 20),
    birthDate: formatBrazilianDate(user.dataNascimento || user.nascimento || user.data_nascimento || user.date_of_birth),
    motherName,
    fatherName,
    parentage,
    rg: firstText(user.rg, user.numeroRg, user.numero_rg),
    maritalStatus: firstText(user.estadoCivil, user.estado_civil),
    profession: firstText(user.profissao, user.ocupacao),
    nitPis: firstText(user.nit, user.pis, user.nitPis, user.nit_pis),
    phone: text(user.whatsappContato || user._numero, 40),
    email: text(user.email, 254),
    city: text(user.cidade, 120),
    state: text(user.uf, 10),
    postalCode: text(user.cep, 20),
    street: firstText(user.endereco, user.address, user.logradouro),
    addressNumber: firstText(user.numeroEndereco, user.numero_endereco),
    addressComplement: firstText(user.complementoEndereco, user.complemento_endereco),
    district: firstText(user.bairro),
    addressReference: firstText(user.referenciaEndereco, user.referencia_endereco),
    driveUrl: text(user.pastaDriveLink, 1000)
  }
}

function hashToken(token) {
  return crypto.createHash("sha256").update(String(token || ""), "utf8").digest("hex")
}

function cookieValue(req, name) {
  const cookies = String(req.headers.cookie || "").split(";")
  for (const item of cookies) {
    const [key, ...parts] = item.trim().split("=")
    if (key === name) return decodeURIComponent(parts.join("="))
  }
  return ""
}

function createCredentialsVault({ pool, baseUrl, masterSecret, validateMasterPassword, logger = () => {} }) {
  if (!pool) throw new Error("CREDENTIALS_VAULT_DATABASE_REQUIRED")
  const key = deriveKey(masterSecret)
  const sessions = new Map()
  const failures = new Map()
  const publicBaseUrl = text(baseUrl, 1000).replace(/\/+$/, "")

  async function initialize() {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS oraculum_case_credentials (
        id UUID PRIMARY KEY,
        access_token_ciphertext TEXT NOT NULL,
        access_token_iv VARCHAR(64) NOT NULL,
        access_token_tag VARCHAR(64) NOT NULL,
        access_token_hash CHAR(64) UNIQUE NOT NULL,
        deal_id VARCHAR(80) UNIQUE NOT NULL,
        contact_id VARCHAR(80),
        case_number VARCHAR(80) NOT NULL,
        profile_ciphertext TEXT NOT NULL,
        profile_iv VARCHAR(64) NOT NULL,
        profile_tag VARCHAR(64) NOT NULL,
        password_ciphertext TEXT,
        password_iv VARCHAR(64),
        password_tag VARCHAR(64),
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `)
  }

  function urlForToken(token) {
    const path = `/admin/credenciais/${encodeURIComponent(token)}`
    return publicBaseUrl ? `${publicBaseUrl}${path}` : path
  }

  async function ensureCase(user = {}) {
    const dealId = text(user.negocioId, 80)
    const caseNumber = text(user.numeroCaso, 80)
    if (!dealId || !caseNumber) return { ok: false, reason: "case_identity_incomplete" }
    const profile = encryptJson(profileFromUser(user), key)
    const candidateToken = crypto.randomBytes(32).toString("base64url")
    const encryptedToken = encryptJson({ token: candidateToken }, key)
    const persisted = await pool.query(`
      INSERT INTO oraculum_case_credentials (
        id, access_token_ciphertext, access_token_iv, access_token_tag, access_token_hash,
        deal_id, contact_id, case_number, profile_ciphertext, profile_iv, profile_tag
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
      ON CONFLICT (deal_id) DO UPDATE SET
        contact_id = EXCLUDED.contact_id,
        case_number = EXCLUDED.case_number,
        profile_ciphertext = EXCLUDED.profile_ciphertext,
        profile_iv = EXCLUDED.profile_iv,
        profile_tag = EXCLUDED.profile_tag,
        updated_at = CURRENT_TIMESTAMP
      RETURNING access_token_ciphertext, access_token_iv, access_token_tag
    `, [
      crypto.randomUUID(), encryptedToken.ciphertext, encryptedToken.iv, encryptedToken.tag,
      hashToken(candidateToken), dealId, text(user.contatoId, 80) || null, caseNumber,
      profile.ciphertext, profile.iv, profile.tag
    ])
    const storedToken = persisted.rows?.[0]
    const token = decryptJson({
      ciphertext: storedToken?.access_token_ciphertext,
      iv: storedToken?.access_token_iv,
      tag: storedToken?.access_token_tag
    }, key)?.token
    if (!token) throw new Error("CREDENTIALS_VAULT_TOKEN_NOT_RETURNED")
    return { ok: true, url: urlForToken(token), token }
  }

  async function findByToken(token) {
    const value = text(token, 128)
    if (!value) return null
    const response = await pool.query(`
      SELECT * FROM oraculum_case_credentials
      WHERE access_token_hash = $1
      LIMIT 1
    `, [hashToken(value)])
    return response.rows?.[0] || null
  }

  function authenticatedSession(req, token) {
    const sessionId = cookieValue(req, "oraculum_vault_session")
    const session = sessions.get(sessionId)
    if (!session || session.expiresAt <= Date.now() || session.tokenHash !== hashToken(token)) {
      if (sessionId) sessions.delete(sessionId)
      return null
    }
    return session
  }

  function failureKey(req, token) {
    return `${req.ip || req.socket?.remoteAddress || "-"}:${hashToken(token)}`
  }

  function loginAllowed(req, token) {
    const id = failureKey(req, token)
    const current = failures.get(id)
    if (!current || Date.now() - current.startedAt > LOGIN_WINDOW_MS) {
      failures.delete(id)
      return true
    }
    return current.count < LOGIN_MAX_FAILURES
  }

  function recordFailure(req, token) {
    const id = failureKey(req, token)
    const current = failures.get(id)
    failures.set(id, !current || Date.now() - current.startedAt > LOGIN_WINDOW_MS
      ? { count: 1, startedAt: Date.now() }
      : { ...current, count: current.count + 1 })
  }

  function setNoStore(res) {
    res.setHeader("Cache-Control", "no-store, max-age=0")
    res.setHeader("Pragma", "no-cache")
    res.setHeader("Referrer-Policy", "no-referrer")
    res.setHeader("X-Robots-Tag", "noindex, nofollow")
  }

  async function login(req, res) {
    setNoStore(res)
    const token = text(req.params.token, 128)
    if (!await findByToken(token)) return res.sendStatus(404)
    if (!loginAllowed(req, token)) return res.status(429).json({ ok: false })
    const password = String(req.body?.masterPassword || "")
    if (!validateMasterPassword(password)) {
      recordFailure(req, token)
      logger("vault_login_denied")
      return res.status(401).json({ ok: false })
    }
    failures.delete(failureKey(req, token))
    const sessionId = crypto.randomBytes(32).toString("base64url")
    const csrf = crypto.randomBytes(24).toString("base64url")
    sessions.set(sessionId, { tokenHash: hashToken(token), csrf, expiresAt: Date.now() + SESSION_TTL_MS })
    res.setHeader("Set-Cookie", `oraculum_vault_session=${sessionId}; Max-Age=600; Path=/admin/credenciais/${encodeURIComponent(token)}; HttpOnly; Secure; SameSite=Strict`)
    return res.json({ ok: true, csrf })
  }

  async function data(req, res) {
    setNoStore(res)
    const token = text(req.params.token, 128)
    const session = authenticatedSession(req, token)
    if (!session) return res.status(401).json({ ok: false })
    const record = await findByToken(token)
    if (!record) return res.sendStatus(404)
    const profile = decryptJson({
      ciphertext: record.profile_ciphertext,
      iv: record.profile_iv,
      tag: record.profile_tag
    }, key)
    const password = record.password_ciphertext ? decryptJson({
      ciphertext: record.password_ciphertext,
      iv: record.password_iv,
      tag: record.password_tag
    }, key)?.password || "" : ""
    return res.json({ ok: true, profile, password, csrf: session.csrf })
  }

  async function savePassword(req, res) {
    setNoStore(res)
    const token = text(req.params.token, 128)
    const session = authenticatedSession(req, token)
    const informedCsrf = String(req.headers["x-csrf-token"] || "")
    const csrfOk = session && informedCsrf.length === session.csrf.length &&
      crypto.timingSafeEqual(Buffer.from(session.csrf), Buffer.from(informedCsrf))
    if (!csrfOk) {
      return res.sendStatus(403)
    }
    const password = String(req.body?.password || "")
    if (password.length > 500) return res.status(400).json({ ok: false })
    const encrypted = password ? encryptJson({ password }, key) : { ciphertext: null, iv: null, tag: null }
    const updated = await pool.query(`
      UPDATE oraculum_case_credentials
      SET password_ciphertext=$1, password_iv=$2, password_tag=$3, updated_at=CURRENT_TIMESTAMP
      WHERE access_token_hash=$4
    `, [encrypted.ciphertext, encrypted.iv, encrypted.tag, hashToken(token)])
    if (!updated.rowCount) return res.sendStatus(404)
    logger("vault_password_updated")
    return res.json({ ok: true })
  }

  return { initialize, ensureCase, findByToken, login, data, savePassword }
}

function vaultPage(nonce = "") {
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Dados e credenciais do cliente</title><style>body{font-family:system-ui;background:#f5f3ef;color:#252019;margin:0}.box{max-width:680px;margin:5vh auto;background:#fff;padding:24px;border-radius:16px;box-shadow:0 8px 30px #0002}h1{font-size:1.35rem}.row{padding:10px 0;border-bottom:1px solid #eee}.label{color:#71685e;font-size:.8rem}.value-line{display:flex;align-items:center;gap:8px}.value{font-size:1rem;overflow-wrap:anywhere;flex:1}input{box-sizing:border-box;width:100%;padding:12px;margin:8px 0;border:1px solid #bbb;border-radius:8px}button{padding:11px 16px;border:0;border-radius:8px;background:#8b6b22;color:white;font-weight:700;margin:4px 4px 4px 0}.copy-field{padding:7px 10px;margin:0;background:#eee;color:#3d372f;font-size:1rem}.secondary{background:#666}.hidden{display:none}.error{color:#a40000}</style></head><body><main class="box"><h1>🔐 Dados e credenciais do cliente</h1><section id="login"><p>Digite a senha mestre administrativa para abrir este registro.</p><input id="master" type="password" autocomplete="current-password"><button id="unlock">Desbloquear</button><p id="error" class="error"></p></section><section id="record" class="hidden"><div id="profile"></div><h2>Acesso Gov.br / Meu INSS</h2><label class="label" for="password">Senha</label><input id="password" type="password" autocomplete="off"><button id="reveal" class="secondary">Mostrar</button><button id="copy">Copiar</button><button id="save">Salvar senha</button><p id="status"></p></section></main><script nonce="${text(nonce, 100)}">const base=location.pathname;let csrf="";const $=id=>document.getElementById(id);const esc=s=>String(s??"").replace(/[&<>\"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));async function load(){const r=await fetch(base+"/dados",{credentials:"same-origin"});if(!r.ok)return;const d=await r.json();csrf=d.csrf;$("login").classList.add("hidden");$("record").classList.remove("hidden");const p=d.profile||{};const address=[p.street,p.addressNumber,p.addressComplement,p.district].filter(Boolean).join(", ");const rows=[["Caso",p.caseNumber],["Nome",p.name],["CPF",p.cpf],["RG",p.rg],["Nascimento",p.birthDate],["Nome da mãe",p.motherName],["Nome do pai",p.fatherName],["Filiação",p.parentage],["Estado civil",p.maritalStatus],["Profissão",p.profession],["NIT/PIS",p.nitPis],["Telefone",p.phone],["E-mail",p.email],["Endereço",address],["Cidade/UF",[p.city,p.state].filter(Boolean).join(" - ")],["CEP",p.postalCode],["Referência",p.addressReference],["Pasta no Drive",p.driveUrl]];$("profile").innerHTML=rows.map((x,i)=>'<div class="row"><div class="label">'+esc(x[0])+'</div><div class="value-line"><div class="value">'+esc(x[1]||"Não informado")+'</div>'+(x[1]?'<button class="copy-field" data-copy="'+i+'" type="button" title="Copiar '+esc(x[0])+'" aria-label="Copiar '+esc(x[0])+'">📋</button>':'')+'</div></div>').join("");document.querySelectorAll("[data-copy]").forEach(button=>button.onclick=async()=>{const item=rows[Number(button.dataset.copy)];await navigator.clipboard.writeText(String(item[1]));$("status").textContent=item[0]+" copiado."});$("password").value=d.password||"";}$("unlock").onclick=async()=>{const r=await fetch(base+"/entrar",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({masterPassword:$("master").value})});$("master").value="";if(!r.ok){$("error").textContent=r.status===429?"Muitas tentativas. Aguarde alguns minutos.":"Senha incorreta.";return}await load()};$("reveal").onclick=()=>{$("password").type=$("password").type==="password"?"text":"password"};$("copy").onclick=async()=>{await navigator.clipboard.writeText($("password").value);$("status").textContent="Senha copiada."};$("save").onclick=async()=>{const r=await fetch(base+"/senha",{method:"POST",credentials:"same-origin",headers:{"content-type":"application/json","x-csrf-token":csrf},body:JSON.stringify({password:$("password").value})});$("status").textContent=r.ok?"Senha atualizada com segurança.":"Não foi possível salvar."};load();</script></body></html>`
}

module.exports = {
  createCredentialsVault,
  deriveKey,
  encryptJson,
  decryptJson,
  profileFromUser,
  hashToken,
  formatBrazilianDate,
  vaultPage
}
