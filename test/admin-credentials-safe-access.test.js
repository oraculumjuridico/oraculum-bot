"use strict"

const test = require("node:test")
const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const {
  deriveKey,
  encryptJson,
  decryptJson,
  profileFromUser,
  hashToken,
  formatBrazilianDate,
  vaultPage,
  createCredentialsVault
} = require("../src/domain/credentials-vault")

const server = fs.readFileSync(path.join(__dirname, "..", "server.js"), "utf8")
const hubspotCore = fs.readFileSync(path.join(__dirname, "..", "src", "domain", "hubspot-core.js"), "utf8")

test("menu do caso sincroniza o cofre interno sem expor senha", () => {
  assert.match(server, /casoCredenciais:\s*"adm_caso_credenciais"/)
  assert.match(server, /sincronizarCofreCasoSegura\(item\.u\)/)
  assert.match(server, /createCredentialsVault/)
  assert.doesNotMatch(server, /ADMIN_CREDENTIALS_VAULT_URL/)
  assert.doesNotMatch(hubspotCore, /password_ciphertext|password_iv|password_tag/)
})

test("criptografia autentica perfil e rejeita chave incorreta", () => {
  const encrypted = encryptJson({ cpf: "123", password: "segredo" }, deriveKey("mestra forte"))
  assert.deepEqual(decryptJson(encrypted, deriveKey("mestra forte")), { cpf: "123", password: "segredo" })
  assert.throws(() => decryptJson(encrypted, deriveKey("outra chave")))
  assert.doesNotMatch(encrypted.ciphertext, /segredo|123/)
})

test("perfil automático usa somente campos operacionais permitidos", () => {
  const profile = profileFromUser({
    numeroCaso: "PRV.1",
    negocioId: "10",
    contatoId: "20",
    nome: "Cliente Teste",
    cpf: "123",
    dataNascimento: "1980-04-15",
    nomeMae: "Maria Teste",
    nomePai: "João Teste",
    endereco: "Rua Segura",
    numeroEndereco: "42",
    complementoEndereco: "Casa",
    bairro: "Centro",
    senha: "NUNCA",
    password: "NUNCA"
  })
  assert.equal(profile.name, "Cliente Teste")
  assert.equal(profile.cpf, "123")
  assert.equal(profile.birthDate, "15/04/1980")
  assert.equal(profile.motherName, "Maria Teste")
  assert.equal(profile.fatherName, "João Teste")
  assert.equal(profile.street, "Rua Segura")
  assert.equal(profile.addressNumber, "42")
  assert.equal(Object.hasOwn(profile, "senha"), false)
  assert.equal(Object.hasOwn(profile, "password"), false)
})

test("datas técnicas são exibidas no padrão brasileiro sem alterar o valor persistido no HubSpot", () => {
  assert.equal(formatBrazilianDate("1980-04-15"), "15/04/1980")
  assert.equal(formatBrazilianDate("1980-04-15T00:00:00.000Z"), "15/04/1980")
  assert.equal(formatBrazilianDate("5/4/1980"), "05/04/1980")
  assert.equal(formatBrazilianDate("1980-99-40"), "1980-99-40")
  assert.match(server, /formatBrazilianDate\(u\.dataNascimento/)
})

test("cofre apenas lê o telefone e não possui operação de atualização de Contato", () => {
  const vaultSource = fs.readFileSync(path.join(__dirname, "..", "src", "domain", "credentials-vault.js"), "utf8")
  assert.match(vaultSource, /user\.whatsappContato \|\| user\._numero/)
  assert.doesNotMatch(vaultSource, /hsAtualizarContato|crm\/v3\/objects\/contacts|axios\.(?:patch|post|put)/)
  assert.match(server, /resolveCurrentUser/)
})

test("token é comparado por hash e página não contém dados de cliente", () => {
  assert.equal(hashToken("token"), hashToken("token"))
  assert.notEqual(hashToken("token"), hashToken("outro"))
  const html = vaultPage("nonce-seguro")
  assert.match(html, /senha mestre administrativa/)
  assert.match(html, /nonce="nonce-seguro"/)
  assert.match(html, /data-copy/)
  assert.match(html, /navigator\.clipboard\.writeText/)
  assert.doesNotMatch(html, /Cliente Teste|123\.456/)
})

test("HubSpot recebe somente link e marcador operacional idempotente", () => {
  assert.match(hubspotCore, /ORACULUM_OPERATIONAL/)
  assert.match(hubspotCore, /findByDealAndMarker/)
  assert.match(hubspotCore, /A senha não é armazenada nesta nota/)
})

test("registro no Neon é idempotente por Negócio e mantém token estável", async () => {
  let row = null
  const pool = {
    async query(sql, params = []) {
      if (/CREATE TABLE/.test(sql)) return { rows: [] }
      if (/INSERT INTO oraculum_case_credentials/.test(sql)) {
        if (!row) {
          row = {
            access_token_ciphertext: params[1], access_token_iv: params[2], access_token_tag: params[3],
            access_token_hash: params[4], deal_id: params[5], profile_ciphertext: params[8],
            profile_iv: params[9], profile_tag: params[10]
          }
        } else {
          row.profile_ciphertext = params[8]
          row.profile_iv = params[9]
          row.profile_tag = params[10]
        }
        return { rows: [{
          access_token_ciphertext: row.access_token_ciphertext,
          access_token_iv: row.access_token_iv,
          access_token_tag: row.access_token_tag
        }], rowCount: 1 }
      }
      if (/access_token_hash = \$1/.test(sql)) {
        return { rows: row?.access_token_hash === params[0] ? [row] : [] }
      }
      throw new Error("SQL inesperado no teste")
    }
  }
  const vault = createCredentialsVault({
    pool,
    baseUrl: "https://oraculum.example",
    masterSecret: "senha-administrativa",
    validateMasterPassword: value => value === "senha-administrativa"
  })
  await vault.initialize()
  const first = await vault.ensureCase({ negocioId: "deal-1", numeroCaso: "PRV.1", nome: "Nome Inicial" })
  const second = await vault.ensureCase({ negocioId: "deal-1", numeroCaso: "PRV.1", nome: "Nome Atualizado" })
  assert.equal(first.url, second.url)
  assert.equal(first.url.startsWith("https://oraculum.example/admin/credenciais/"), true)
  assert.doesNotMatch(row.profile_ciphertext, /Nome Atualizado/)
  assert.ok(await vault.findByToken(first.token))
})
