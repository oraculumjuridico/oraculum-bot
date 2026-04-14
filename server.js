// ================================================================
//  ORACULUM ADVOCACIA — v5.0
//  WhatsApp · HubSpot · Google Drive · AssemblyAI · Groq AI
// ================================================================
require("dotenv").config()

const express    = require("express")
const axios      = require("axios")
const { google } = require("googleapis")

const app = express()
app.use(express.json())

const {
  VERIFY_TOKEN, WHATSAPP_TOKEN, PHONE_NUMBER_ID,
  HUBSPOT_TOKEN,
  GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN,
  DRIVE_PASTA_CLIENTES_ID,
  ASSEMBLYAI_KEY, GROQ_KEY
} = process.env

const MEETINGS = "https://meetings.hubspot.com/oraculum"

const HS_PIPELINE = "default"
const HS_STAGE = {
  lead: "appointmentscheduled", agendamento: "qualifiedtobuy",
  triagem: "presentationscheduled", docs: "decisionmakerboughtin",
  protocolo: "contractsent", andamento: "closedwon",
  finalizado: "closedlost", desistiu: "1337291921", perdido: "1337291922"
}

const monitor = { conversas: 0, cadastros: 0, erros: [], inicio: new Date() }
function logErro(tipo, msg) {
  monitor.erros.push({ tipo, msg, ts: new Date().toISOString() })
  if (monitor.erros.length > 100) monitor.erros.shift()
  console.error(`[${tipo.toUpperCase()}] ${msg}`)
}

const users = {}

function novoUsuario(nomeWA) {
  return {
    stage: "inicio", nomeWA,
    nome: null, cidade: null, uf: null,
    area: null, tipo: null, situacao: null, subTipo: null, detalhe: null,
    urgencia: "normal", semReceber: false,
    contribuicao: null, recebeBeneficio: null, descricao: null,
    contatoId: null, negocioId: null, numeroCaso: null,
    pastaDriveId: null, pastaDriveLink: null,
    score: 0, documentosEnviados: false,
    docsEntregues: [], docPaginaAtual: 0,
    ultimoArquivoId: null, ultimoArquivoNome: null,
    corrigirCampo: null, historiaIA: [],
    timer: null, ultimaMsg: Date.now()
  }
}

function getUser(from, nomeWA) {
  if (!users[from]) { users[from] = novoUsuario(nomeWA); monitor.conversas++ }
  return users[from]
}

function gerarCaso() {
  const b = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }))
  const p = (n, l = 2) => String(n).padStart(l, "0")
  return `${String(b.getFullYear()).slice(2)}${p(b.getMonth()+1)}${p(b.getDate())}${p(b.getHours())}${p(b.getMinutes())}${p(Math.floor(Math.random()*1000), 3)}`
}

function calcScore(u) {
  let s = 0
  if (u.urgencia === "alta") s += 3
  if (u.semReceber) s += 3
  if (u.situacao === "cortado") s += 2
  if (u.situacao === "negado") s += 1
  if (u.documentosEnviados) s += 2
  return s
}

function situacaoLegivel(u) {
  if (!u.situacao) return "—"
  const map = {
    "novo":    "Solicitação de novo benefício",
    "negado":  "Benefício negado pelo INSS",
    "cortado": "Benefício suspenso/cortado"
  }
  const base = map[u.situacao] || u.situacao
  return u.subTipo ? `${base} — ${u.subTipo}` : base
}

function resumoCaso(u) {
  return [
    `👤 Nome: ${u.nome || "—"}`,
    `📍 Cidade: ${u.cidade || "—"}${u.uf ? " - " + u.uf : ""}`,
    `⚖️ Área: ${u.area || "—"}`,
    u.situacao ? `📋 Situação: ${situacaoLegivel(u)}` : null,
    u.detalhe  ? `ℹ️ Info: ${u.detalhe}` : null,
    `${u.urgencia === "alta" ? "🔴" : "🟡"} Urgência: ${u.urgencia === "alta" ? "Alta" : "Normal"}`,
    u.contribuicao    ? `🏛️ Contribuiu ao INSS: ${u.contribuicao}` : null,
    u.recebeBeneficio ? `💳 Recebe benefício: ${u.recebeBeneficio}` : null,
    u.descricao       ? `📝 Descrição: ${u.descricao}` : null,
  ].filter(Boolean).join("\n")
}

const DOCS_BASE = [
  { id:"doc_rg",  label:"RG ou CNH",                   folhas:["Frente","Verso"],         dica:"📸 Coloque o RG/CNH sobre mesa escura. Envie a FRENTE primeiro, depois o VERSO. Sem reflexo, imagem bem enquadrada." },
  { id:"doc_cpf", label:"CPF",                          folhas:["Frente"],                dica:"📸 Foto nítida do cartão CPF, ou print do app Meu CPF. Tudo visível, sem partes cortadas." },
  { id:"doc_res", label:"Comprovante de Residência",     folhas:["Página completa"],       dica:"📸 Conta de luz, água ou telefone dos últimos 3 meses. Foto completa, todos os dados visíveis." }
]
const DOCS_EXTRA = {
  "aposentadoria": [
    { id:"doc_ctps", label:"Carteira de Trabalho (CTPS)", folhas:["Folha de rosto","Páginas com registros de emprego"], dica:"📸 Fotografe a folha de rosto (seus dados pessoais) e TODAS as páginas com anotações de emprego, uma de cada vez. Frente e verso se necessário." },
    { id:"doc_cnis", label:"Extrato CNIS (Meu INSS)",     folhas:["Todas as páginas"],                                  dica:"📱 Abra o app Meu INSS → Extrato de Contribuições. Tire print de TODAS as páginas ou salve o PDF e envie aqui." },
    { id:"doc_hol",  label:"Holerites últimos 12 meses",  folhas:["Cada holerite separado"],                            dica:"📸 Envie um holerite por foto. Se digitais, print de cada um. Todos os dados devem estar legíveis." }
  ],
  "bpc": [
    { id:"doc_laudo", label:"Laudo Médico Atualizado",       folhas:["Todas as páginas"],  dica:"📸 Foto nítida de todas as páginas do laudo, sem partes cortadas. Validade máxima: 6 meses." },
    { id:"doc_renda", label:"Declaração de Renda Familiar",  folhas:["Página completa"],   dica:"📄 Pode ser feita no CRAS ou pelo app Meu INSS. Envie o documento completo." },
    { id:"doc_nasc",  label:"Certidão de Nascimento",        folhas:["Frente","Verso"],    dica:"📸 Documento original, frente e verso, sobre fundo escuro." }
  ],
  "incapacidade": [
    { id:"doc_atst", label:"Atestado Médico Recente",  folhas:["Página completa"],          dica:"📸 Foto completa com CRM do médico visível. Deve ter no máximo 90 dias." },
    { id:"doc_exam", label:"Exames e Laudos",           folhas:["Cada exame separado"],     dica:"📸 Fotografe cada exame em foto separada. Resultados devem estar legíveis." },
    { id:"doc_ctps", label:"Carteira de Trabalho",      folhas:["Folha de rosto","Páginas com registros"], dica:"📸 Folha de rosto + todas as páginas com anotações, uma por vez." }
  ],
  "dependentes": [
    { id:"doc_obito", label:"Certidão de Óbito",       folhas:["Frente","Verso"], dica:"📸 Documento original, frente e verso, sobre fundo escuro." },
    { id:"doc_nasc",  label:"Certidão de Nascimento",  folhas:["Frente","Verso"], dica:"📸 Documento original, frente e verso, sobre fundo escuro." }
  ],
  "negado": [
    { id:"doc_indf", label:"Carta de Indeferimento do INSS",   folhas:["Todas as páginas"],      dica:"📸 Foto da carta completa. Se pelo app Meu INSS, print de todas as telas." },
    { id:"doc_ant",  label:"Documentos do Pedido Anterior",    folhas:["Cada documento separado"], dica:"📸 Todos os documentos que você entregou anteriormente ao INSS." }
  ],
  "cortado": [
    { id:"doc_susp",  label:"Carta de Suspensão do Benefício", folhas:["Todas as páginas"],  dica:"📸 Foto da notificação completa recebida do INSS." },
    { id:"doc_laudo", label:"Laudos Médicos Recentes",          folhas:["Cada laudo separado"], dica:"📸 Laudos com no máximo 6 meses. Fotografe todas as páginas de cada laudo." }
  ],
  "demissao": [
    { id:"doc_ctps",  label:"Carteira de Trabalho",    folhas:["Folha de rosto","Páginas com registros"], dica:"📸 Folha de rosto + todas as páginas com anotações, uma por vez." },
    { id:"doc_demit", label:"Carta de Demissão",       folhas:["Todas as páginas"],                        dica:"📸 Foto do documento completo, assinado pela empresa." },
    { id:"doc_hol",   label:"Últimos 3 Holerites",     folhas:["Holerite 1","Holerite 2","Holerite 3"],   dica:"📸 Um holerite por foto. Todos os valores devem estar legíveis." },
    { id:"doc_fgts",  label:"Extrato FGTS",             folhas:["Todas as páginas"],                        dica:"📱 App FGTS → Extratos. Print de todas as páginas ou PDF completo." }
  ],
  "direitos": [
    { id:"doc_ctps", label:"Carteira de Trabalho",   folhas:["Folha de rosto","Páginas com registros"], dica:"📸 Folha de rosto + todas as páginas com registros." },
    { id:"doc_hol",  label:"Holerites",              folhas:["Cada holerite separado"],                  dica:"📸 Um holerite por foto, todos legíveis." },
    { id:"doc_fgts", label:"Extrato FGTS",           folhas:["Todas as páginas"],                        dica:"📱 App FGTS → Extratos. Todas as páginas." },
    { id:"doc_ctr",  label:"Contrato de Trabalho",   folhas:["Cada página separada"],                    dica:"📸 Todas as páginas do contrato assinado, frente e verso." }
  ],
  "acidente": [
    { id:"doc_cat",  label:"CAT (Comunicação de Acidente)", folhas:["Todas as páginas"],                        dica:"📸 Foto do documento CAT completo. Se não tiver, informe ao advogado." },
    { id:"doc_atst", label:"Atestado Médico",                folhas:["Página completa"],                        dica:"📸 Foto nítida com CRM do médico visível." },
    { id:"doc_ctps", label:"Carteira de Trabalho",           folhas:["Folha de rosto","Páginas com registros"], dica:"📸 Folha de rosto + páginas com registros." }
  ],
  "assedio": [
    { id:"doc_print", label:"Prints ou Registros",   folhas:["Cada print separado"], dica:"📸 Prints de mensagens, e-mails ou provas. Um por foto, organizados por data." },
    { id:"doc_test",  label:"Nomes de Testemunhas",  folhas:["Mensagem de texto"],  dica:"✍️ Digite aqui os nomes e telefones das pessoas que presenciaram os fatos." },
    { id:"doc_hol",   label:"Contracheques",          folhas:["Cada um separado"],   dica:"📸 Um contracheque por foto, todos legíveis." }
  ],
  "revisao": [
    { id:"doc_orig", label:"Documento para Revisão", folhas:["Cada página separada"], dica:"📸 Foto nítida de todas as páginas. Ou envie como PDF." }
  ]
}
function getDocumentosLista(area, tipo) {
  const chave = (tipo || area || "outros").toLowerCase()
  const extra = DOCS_EXTRA[chave] || [{ id:"doc_out", label:"Documentos do seu caso", folhas:["Página 1"], dica:"📸 Envie o documento relacionado ao seu caso." }]
  return chave === "revisao" ? extra : [...DOCS_BASE, ...extra]
}
function getDocumentos(area, tipo) {
  return getDocumentosLista(area, tipo).map(d => "• " + d.label).join("\n")
}

function limparTimer(u) {
  if (u.timer) { clearTimeout(u.timer); u.timer = null }
}

function iniciarTimer(from) {
  const u = users[from]
  if (!u) return
  limparTimer(u)
  u.timer = setTimeout(async () => {
    if (!users[from]) return
    await enviar(from, "👋 Oi! Fiquei te esperando... Posso te ajudar a continuar?", null)
    u.timer = setTimeout(async () => {
      if (!users[from]) return
      await enviar(from, "⏸️ Vou pausar por agora. Se precisar, é só responder aqui!", null)
      u.timer = setTimeout(async () => {
        if (!users[from]) return
        await enviar(from, "👋 Encerrando por inatividade. Quando quiser continuar, é só mandar uma mensagem. Até logo! 😊", null)
        const nomeWA = users[from].nomeWA
        users[from] = novoUsuario(nomeWA)
      }, 2 * 60 * 1000)
    }, 3 * 60 * 1000)
  }, 2 * 60 * 1000)
}

const HS = () => ({ Authorization: `Bearer ${HUBSPOT_TOKEN}`, "Content-Type": "application/json" })

async function hsBuscarPorPhone(phone) {
  try {
    const res = await axios.post(
      "https://api.hubapi.com/crm/v3/objects/contacts/search",
      { filterGroups: [{ filters: [{ propertyName: "phone", operator: "EQ", value: phone }] }] },
      { headers: HS() }
    )
    return res.data.results?.[0] || null
  } catch { return null }
}

async function hsCriarContato(from, u) {
  const props = { firstname: u.nome, phone: from, city: u.cidade || "" }
  const custom = {
    numero_caso: u.numeroCaso, area_juridica: u.area,
    situacao_caso: [u.situacao, u.subTipo].filter(Boolean).join(" > "),
    status_caso: u.urgencia === "alta" ? "urgente" : "em analise",
    pasta_drive: u.pastaDriveLink || ""
  }
  try {
    const res = await axios.post("https://api.hubapi.com/crm/v3/objects/contacts", { properties: { ...props, ...custom } }, { headers: HS() })
    monitor.cadastros++
    return res.data.id
  } catch {
    try {
      const res = await axios.post("https://api.hubapi.com/crm/v3/objects/contacts", { properties: props }, { headers: HS() })
      monitor.cadastros++
      return res.data.id
    } catch (e) { logErro("hubspot", "criarContato: " + (e.response?.data?.message || e.message)); return null }
  }
}

async function hsCriarNegocio(u) {
  try {
    const stage = u.urgencia === "alta" ? HS_STAGE.triagem : HS_STAGE.lead
    const res = await axios.post(
      "https://api.hubapi.com/crm/v3/objects/deals",
      { properties: { dealname: `${u.nome} — ${u.area} — ${u.numeroCaso}`, pipeline: HS_PIPELINE, dealstage: stage } },
      { headers: HS() }
    )
    return res.data.id
  } catch (e) { logErro("hubspot", "criarNegocio: " + (e.response?.data?.message || e.message)); return null }
}

async function hsAssociar(cId, nId) {
  try {
    await axios.put(`https://api.hubapi.com/crm/v3/objects/deals/${nId}/associations/contacts/${cId}/deal_to_contact`, {}, { headers: HS() })
  } catch (e) { logErro("hubspot", "associar: " + (e.response?.data?.message || e.message)) }
}

async function hsMoverStage(nId, stage) {
  if (!nId) return
  try {
    await axios.patch(`https://api.hubapi.com/crm/v3/objects/deals/${nId}`, { properties: { dealstage: stage } }, { headers: HS() })
  } catch (e) { logErro("hubspot", "moverStage: " + (e.response?.data?.message || e.message)) }
}

async function hsCriarNota(cId, tipo, corpo) {
  if (!cId) return
  try {
    const res = await axios.post(
      "https://api.hubapi.com/crm/v3/objects/notes",
      { properties: { hs_note_body: `[${tipo}]\n\n${corpo}`, hs_timestamp: String(Date.now()) } },
      { headers: HS() }
    )
    await axios.put(`https://api.hubapi.com/crm/v3/objects/notes/${res.data.id}/associations/contacts/${cId}/note_to_contact`, {}, { headers: HS() })
  } catch (e) { logErro("hubspot", "criarNota: " + (e.response?.data?.message || e.message)) }
}

function getDrive() {
  const oauth2 = new google.auth.OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, "urn:ietf:wg:oauth:2.0:oob")
  oauth2.setCredentials({ refresh_token: GOOGLE_REFRESH_TOKEN })
  return google.drive({ version: "v3", auth: oauth2 })
}

async function criarPastaCliente(numeroCaso, nome) {
  try {
    const res = await getDrive().files.create({
      requestBody: { name: `${numeroCaso} - ${nome}`, mimeType: "application/vnd.google-apps.folder", parents: [DRIVE_PASTA_CLIENTES_ID] },
      fields: "id,name,webViewLink"
    })
    console.log(`[DRIVE] Pasta: ${res.data.name}`)
    return res.data
  } catch (e) { logErro("drive", e.message); return null }
}

async function uploadDrive(pastaId, nome, buffer, mimeType) {
  const fs      = require("fs")
  const path    = require("path")
  const os      = require("os")
  const seguro  = nome.replace(/[^a-zA-Z0-9._-]/g, "_")
  const tmpPath = path.join(os.tmpdir(), `oraculum_${Date.now()}_${seguro}`)
  try {
    if (!buffer || buffer.length === 0) {
      logErro("drive", `upload "${nome}": buffer vazio`)
      return null
    }
    fs.writeFileSync(tmpPath, buffer)
    const drive = getDrive()
    const res   = await drive.files.create({
      requestBody: { name: nome, parents: [pastaId] },
      media: { mimeType: mimeType || "application/octet-stream", body: fs.createReadStream(tmpPath) },
      fields: "id,name,webViewLink"
    })
    console.log(`[DRIVE] Upload OK: ${res.data.name} (${res.data.id})`)
    return res.data
  } catch (e) {
    const status  = e.response?.status || "sem_status"
    const detalhe = e.response?.data?.error?.message || e.response?.data?.message || e.message
    logErro("drive", `upload "${nome}" [HTTP ${status}]: ${detalhe}`)
    return null
  } finally {
    try { fs.unlinkSync(tmpPath) } catch {}
  }
}

async function transcrever(buffer, mimeType) {
  try {
    const up = await axios.post("https://api.assemblyai.com/v2/upload", buffer, {
      headers: { authorization: ASSEMBLYAI_KEY, "content-type": mimeType || "audio/ogg", "transfer-encoding": "chunked" }
    })
    const tr = await axios.post("https://api.assemblyai.com/v2/transcript", { audio_url: up.data.upload_url, language_code: "pt" }, { headers: { authorization: ASSEMBLYAI_KEY } })
    for (let i = 0; i < 12; i++) {
      await new Promise(r => setTimeout(r, 5000))
      const p = await axios.get(`https://api.assemblyai.com/v2/transcript/${tr.data.id}`, { headers: { authorization: ASSEMBLYAI_KEY } })
      if (p.data.status === "completed") return p.data.text || ""
      if (p.data.status === "error") return null
    }
    return null
  } catch (e) { logErro("assemblyai", e.message); return null }
}

async function respostaIA(u, pergunta) {
  if (!GROQ_KEY) return null
  try {
    const sistema = `Voce e Beatriz, assistente virtual da Oraculum Advocacia. Responda duvidas juridicas de forma clara e acessivel para leigos. Areas: INSS, Trabalhista, Familia, Civel. Nunca prometa resultados. Seja objetiva e empatica. Dados do cliente: Area: ${u.area || "nao informado"} | Caso: ${u.numeroCaso || "nao cadastrado"}.`
    u.historiaIA.push({ role: "user", content: pergunta })
    if (u.historiaIA.length > 10) u.historiaIA = u.historiaIA.slice(-10)
    const res = await axios.post(
      "https://api.groq.com/openai/v1/chat/completions",
      { model: "llama-3.1-8b-instant", messages: [{ role: "system", content: sistema }, ...u.historiaIA], max_tokens: 400, temperature: 0.7 },
      { headers: { Authorization: `Bearer ${GROQ_KEY}`, "Content-Type": "application/json" } }
    )
    const resposta = res.data.choices[0].message.content
    u.historiaIA.push({ role: "assistant", content: resposta })
    return resposta
  } catch (e) { logErro("groq", e.message); return null }
}

async function excluirDrive(fileId) {
  try { await getDrive().files.delete({ fileId }); console.log(`[DRIVE] Excluído: ${fileId}`) }
  catch (e) { logErro("drive", "excluir: " + e.message) }
}

async function digitando(to) {
  try {
    await axios.post(
      `https://graph.facebook.com/v19.0/${PHONE_NUMBER_ID}/messages`,
      { messaging_product:"whatsapp", to, type:"text", text:{ body:"..." } },
      { headers:{ Authorization:`Bearer ${WHATSAPP_TOKEN}`, "Content-Type":"application/json" } }
    )
  } catch {}
  await new Promise(r => setTimeout(r, 3200))
}

async function baixarMidia(mediaId) {
  try {
    const info = await axios.get(`https://graph.facebook.com/v19.0/${mediaId}`, { headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}` } })
    const file = await axios.get(info.data.url, { headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}` }, responseType: "arraybuffer" })
    return { buffer: Buffer.from(file.data), mimeType: info.data.mime_type || "application/octet-stream" }
  } catch (e) { logErro("whatsapp", "baixarMidia: " + e.message); return null }
}

async function enviar(to, texto, opcoes = null, comDelay = true) {
  try {
    if (comDelay) await digitando(to)
    let body
    if (!opcoes || opcoes.length === 0) {
      body = { messaging_product: "whatsapp", to, type: "text", text: { body: texto } }
    } else if (opcoes.length <= 3) {
      body = {
        messaging_product: "whatsapp", to, type: "interactive",
        interactive: { type: "button", body: { text: texto }, action: { buttons: opcoes.map(o => ({ type: "reply", reply: { id: o.id, title: String(o.title).slice(0, 20) } })) } }
      }
    } else {
      const sections = []
      for (let i = 0; i < opcoes.length; i += 10)
        sections.push({ title: "Opcoes", rows: opcoes.slice(i, i + 10).map(o => ({ id: o.id, title: String(o.title).slice(0, 24) })) })
      body = {
        messaging_product: "whatsapp", to, type: "interactive",
        interactive: { type: "list", body: { text: texto }, action: { button: "Ver opcoes", sections } }
      }
    }
    await axios.post(`https://graph.facebook.com/v19.0/${PHONE_NUMBER_ID}/messages`, body, {
      headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}`, "Content-Type": "application/json" }
    })
  } catch (e) { logErro("whatsapp", `>${to}: ` + (e.response?.data?.error?.message || e.message)) }
}

const UF_MAP = {
  uf_ac:"AC", uf_al:"AL", uf_am:"AM", uf_ap:"AP", uf_ba:"BA", uf_ce:"CE",
  uf_df:"DF", uf_es:"ES", uf_go:"GO", uf_ma:"MA", uf_mg:"MG", uf_ms:"MS",
  uf_mt:"MT", uf_pa:"PA", uf_pb:"PB", uf_pe:"PE", uf_pi:"PI", uf_pr:"PR",
  uf_rj:"RJ", uf_rn:"RN", uf_ro:"RO", uf_rr:"RR", uf_rs:"RS", uf_sc:"SC",
  uf_se:"SE", uf_sp:"SP", uf_to:"TO"
}
const REGIOES = {
  reg_n:  { label:"Norte",        ufs:[["uf_ac","AC"],["uf_am","AM"],["uf_ap","AP"],["uf_pa","PA"],["uf_ro","RO"],["uf_rr","RR"],["uf_to","TO"]] },
  reg_ne: { label:"Nordeste",     ufs:[["uf_al","AL"],["uf_ba","BA"],["uf_ce","CE"],["uf_ma","MA"],["uf_pb","PB"],["uf_pe","PE"],["uf_pi","PI"],["uf_rn","RN"],["uf_se","SE"]] },
  reg_co: { label:"Centro-Oeste", ufs:[["uf_df","DF"],["uf_go","GO"],["uf_ms","MS"],["uf_mt","MT"]] },
  reg_se: { label:"Sudeste",      ufs:[["uf_es","ES"],["uf_mg","MG"],["uf_rj","RJ"],["uf_sp","SP"]] },
  reg_s:  { label:"Sul",          ufs:[["uf_pr","PR"],["uf_rs","RS"],["uf_sc","SC"]] }
}
function telaRegioes() {
  return { texto:"Selecione sua regiao:", opcoes:[
    { id:"reg_n", title:"Norte" }, { id:"reg_ne", title:"Nordeste" },
    { id:"reg_co", title:"Centro-Oeste" }, { id:"reg_se", title:"Sudeste" },
    { id:"reg_s", title:"Sul" }
  ]}
}
function telaUFsRegiao(regId) {
  const reg = REGIOES[regId]
  if (!reg) return telaRegioes()
  return { texto: reg.label + " — escolha seu estado:", opcoes: reg.ufs.map(([id,title]) => ({ id, title })) }
}

async function finalizarCadastro(from, u) {
  const numeroCaso = gerarCaso()
  u.numeroCaso      = numeroCaso
  u.score           = calcScore(u)
  u.docsEntregues   = []
  u.docPaginaAtual  = 0

  const pasta      = await criarPastaCliente(numeroCaso, u.nome)
  u.pastaDriveId   = pasta?.id || null
  u.pastaDriveLink = pasta?.webViewLink || null

  const existente = await hsBuscarPorPhone(from)
  let contatoId   = existente?.id || null
  if (!contatoId) contatoId = await hsCriarContato(from, u)
  else console.log(`[HUBSPOT] Contato existente: ${contatoId}`)
  u.contatoId = contatoId

  const negocioId = await hsCriarNegocio(u)
  u.negocioId     = negocioId
  if (contatoId && negocioId) await hsAssociar(contatoId, negocioId)

  if (contatoId) {
    await hsCriarNota(contatoId, "CADASTRO COMPLETO", resumoCaso(u) + `\n\nScore: ${u.score}\nDrive: ${u.pastaDriveLink || "—"}\nWhatsApp: ${from}`)
  }

  u.stage = "cliente"
  return numeroCaso
}

function tela_confirmacao(u) {
  return {
    texto: `📋 *Confira suas informações:*\n\n${resumoCaso(u)}\n\n✅ Tudo está correto?`,
    opcoes: [{ id:"conf_ok", title:"✅ Confirmar" }, { id:"conf_corrigir", title:"✏️ Corrigir dados" }]
  }
}

function menuCliente(u) {
  const partes   = (u.nome || u.nomeWA).split(" ")
  const nomeExib = partes.length > 1 ? `${partes[0]} ${partes[partes.length - 1]}` : partes[0]
  const prio     = u.urgencia === "alta" ? "\n🔴 Prioridade: Alta" : ""
  return {
    texto: `👋 Olá, ${nomeExib}!\n\nBem-vindo(a) de volta à *Oraculum Advocacia*. 💼\n\n📁 Caso: *${u.numeroCaso}*\n⚖️ Área: ${u.area}${prio}\n\nComo posso te ajudar hoje?`,
    opcoes: [{ id:"m_status", title:"📊 Status do caso" }, { id:"m_docs", title:"📎 Enviar documentos" }, { id:"m_adv", title:"👨‍⚖️ Falar c/ advogado" }, { id:"m_encerrar", title:"Encerrar atendimento" }]
  }
}

function getDocsPendentes(u) {
  const lista = getDocumentosLista(u.area, u.tipo || u.situacao)
  return lista.filter(d => !(u.docsEntregues || []).includes(d.id))
}

function telaConcluido(u) {
  const nome1 = (u.nome || u.nomeWA).split(" ")[0]
  return {
    texto: `🎉 *Parabéns, ${nome1}!*\n\nTodos os documentos foram enviados com sucesso!\n\nNossa equipe já pode analisar seu caso com prioridade. Em breve entraremos em contato pelo WhatsApp. 💬\n\n📁 Caso: *${u.numeroCaso}*\n⏱️ Prazo de retorno: até *2 dias úteis*.`,
    opcoes: [{ id:"m_adv", title:"👨‍⚖️ Falar c/ advogado" }, { id:"m_status", title:"📊 Status do caso" }, { id:"m_inicio", title:"Menu principal" }]
  }
}

function telaEnvioDoc(u) {
  const pendentes = getDocsPendentes(u)
  if (pendentes.length === 0) return telaConcluido(u)

  const doc      = pendentes[0]
  const lista    = getDocumentosLista(u.area, u.tipo || u.situacao)
  const total    = lista.length
  const entregue = total - pendentes.length
  const barras   = "🟢".repeat(entregue) + "🔴".repeat(pendentes.length)

  const folhas      = doc.folhas || ["Página 1"]
  const folhaIdx    = u.docPaginaAtual || 0
  const folhaAtual  = folhas[folhaIdx] || `Página ${folhaIdx + 1}`
  const totalFolhas = folhas.length

  let texto = `📋 *Documentos do caso*\n${barras} ${entregue}/${total}\n\n`
  texto += `📌 *Documento atual:* ${doc.label}\n`
  texto += `📄 *Envie agora:* ${folhaAtual}`
  if (totalFolhas > 1) texto += ` (${folhaIdx+1} de ${totalFolhas})`
  texto += `\n\n💡 *Dica:* ${doc.dica}`
  texto += `\n\n📲 *Tire a foto ou envie o PDF agora.*`
  if (totalFolhas > 1) texto += `\nSe precisar enviar mais de uma foto deste documento, basta enviar aqui.`

  const opcoes = []
  if (folhaIdx + 1 < totalFolhas) {
    opcoes.push({ id:"docs_proxfolha", title:`✅ Enviei a ${folhaAtual}` })
  } else {
    opcoes.push({ id:"docs_proxdoc", title:"✅ Documento concluído" })
  }
  opcoes.push({ id:"docs_depois", title:"⏭️ Enviar depois" })

  return { texto, opcoes }
}

async function processar(from, nomeWA, text, msgObj) {
  const u    = getUser(from, nomeWA)
  u.ultimaMsg = Date.now()
  limparTimer(u)

  const tipo    = msgObj?.type
  const ehAudio = tipo === "audio"
  const ehDoc   = tipo === "document" || tipo === "image"

  // MIDIA
  if ((ehAudio || ehDoc) && (u.stage === "cliente" || u.stage === "aguardando_urgente")) {
    const mediaId  = msgObj?.[tipo]?.id
    const nomeArq  = msgObj?.document?.filename || (tipo === "image" ? `imagem_${Date.now()}.jpg` : `audio_${Date.now()}`)
    const mimeType = msgObj?.[tipo]?.mime_type || "application/octet-stream"

    if (!mediaId) {
      iniciarTimer(from)
      return { texto: "Nao consegui identificar o arquivo. Tente enviar novamente como foto ou PDF.", opcoes: [{ id:"m_docs", title:"Tentar novamente" }, { id:"m_inicio", title:"Menu principal" }] }
    }
    if (!u.pastaDriveId) {
      iniciarTimer(from)
      return { texto: "Sua pasta esta sendo preparada. Aguarde um instante e tente novamente.", opcoes: [{ id:"m_docs", title:"Tentar novamente" }, { id:"m_inicio", title:"Menu principal" }] }
    }

    const midia = await baixarMidia(mediaId)
    if (!midia) {
      iniciarTimer(from)
      return { texto: "❌ Não consegui baixar o arquivo. Tente reenviar.", opcoes: [{ id:"m_docs", title:"Tentar novamente" }, { id:"m_inicio", title:"Menu principal" }] }
    }

    if (ehAudio) {
      await enviar(from, "🎙️ Áudio recebido! Transcrevendo, aguarde um momento...", null, false)
      const arquivoAudio = await uploadDrive(u.pastaDriveId, `audio_${Date.now()}.ogg`, midia.buffer, midia.mimeType)
      const trans = await transcrever(midia.buffer, midia.mimeType)
      const eUrg  = u.stage === "aguardando_urgente"
      await hsCriarNota(u.contatoId, eUrg ? "ÁUDIO URGENTE" : "ÁUDIO RECEBIDO",
        `De: ${u.nome} (${from})\nCaso: ${u.numeroCaso}\n\n${trans ? `Transcrição:\n"${trans}"` : "Transcrição indisponível"}${arquivoAudio ? `\nDrive: ${arquivoAudio.webViewLink}` : ""}`)
      if (eUrg) await hsMoverStage(u.negocioId, HS_STAGE.triagem)
      u.documentosEnviados = true
      if (u.stage === "aguardando_urgente") u.stage = "cliente"
      const msgAudio = trans
        ? `✅ Áudio salvo!\n\n🗣️ Entendemos o seguinte:\n"${trans.slice(0, 300)}${trans.length > 300 ? "..." : ""}"`
        : `✅ Áudio salvo na pasta do caso ${u.numeroCaso}.\nNossa equipe vai ouvir em breve.`
      iniciarTimer(from)
      return { texto: msgAudio, opcoes: [{ id:"m_docs", title:"📎 Enviar documentos" }, { id:"m_adv", title:"👨‍⚖️ Falar c/ advogado" }, { id:"m_inicio", title:"Menu principal" }] }
    }

    // Documento / imagem
    await hsMoverStage(u.negocioId, HS_STAGE.docs)
    if (!u.docsEntregues) u.docsEntregues = []

    const pendAntes   = getDocsPendentes(u)
    const docAtual    = pendAntes[0]
    const folhas      = docAtual?.folhas || ["Página"]
    const folhaIdx    = u.docPaginaAtual || 0
    const folhaAtual  = folhas[folhaIdx] || `Página ${folhaIdx + 1}`
    const totalFolhas = folhas.length

    // Nome do arquivo: "RG ou CNH - Frente - José Silva.jpg"
    const primeiroNome = (u.nome || u.nomeWA || "cliente").split(" ")[0]
    const sobrenome    = (u.nome || u.nomeWA || "").split(" ").filter(Boolean).slice(-1)[0] || ""
    const nomeCliente  = sobrenome && sobrenome !== primeiroNome ? `${primeiroNome} ${sobrenome}` : primeiroNome
    const labelDoc     = docAtual ? docAtual.label : "Documento"
    const ext          = (nomeArq || "").split(".").pop()
    const nomeArqFinal = `${labelDoc} - ${folhaAtual} - ${nomeCliente}${ext && ext.length <= 4 ? "."+ext : ".jpg"}`

    const arquivo = await uploadDrive(u.pastaDriveId, nomeArqFinal, midia.buffer, midia.mimeType)
    if (!arquivo) {
      iniciarTimer(from)
      return { texto: "❌ Não consegui salvar o arquivo. Pode tentar novamente?", opcoes: [{ id:"m_docs", title:"Tentar novamente" }, { id:"m_adv", title:"Falar com advogado" }, { id:"m_inicio", title:"Menu principal" }] }
    }

    u.ultimoArquivoId   = arquivo.id
    u.ultimoArquivoNome = nomeArqFinal

    await hsCriarNota(u.contatoId, "DOCUMENTO RECEBIDO",
      `De: ${u.nome} (${from})\nCaso: ${u.numeroCaso}\nArquivo: ${nomeArqFinal}\nDrive: ${arquivo.webViewLink}`)
    u.documentosEnviados = true
    if (u.stage === "aguardando_urgente") u.stage = "cliente"

    // Avançar página
    u.docPaginaAtual = folhaIdx + 1
    const temProximaFolha = u.docPaginaAtual < totalFolhas
    const proximaFolha    = folhas[u.docPaginaAtual] || `Página ${u.docPaginaAtual + 1}`

    iniciarTimer(from)

    if (temProximaFolha) {
      return {
        texto: `✅ *${folhaAtual} do ${labelDoc} recebida com sucesso!*\n📁 "${nomeArqFinal}"\n\nAgora envie: *${proximaFolha}*\n\n💡 Mesma orientação: boa iluminação, sem reflexo, tudo enquadrado.\n\nSe a foto não ficou boa, pode reenviar antes de continuar.`,
        opcoes: [{ id:"docs_reenviar", title:"🔄 Reenviar esta foto" }, { id:"docs_depois", title:"⏭️ Enviar depois" }]
      }
    } else {
      // Documento concluído
      u.docsEntregues.push(docAtual.id)
      u.docPaginaAtual = 0
      const novoPendentes = getDocsPendentes(u)
      if (novoPendentes.length === 0) return telaConcluido(u)
      const proxDoc = novoPendentes[0]
      return {
        texto: `✅ *${labelDoc} concluído!* ${totalFolhas > 1 ? "Todas as "+totalFolhas+" fotos foram" : "A foto foi"} salva(s) com sucesso.\n\n📂 *Próximo documento:*\n➡️ *${proxDoc.label}*\n\n${proxDoc.dica}\n\nQuando estiver pronto, envie a foto ou PDF.`,
        opcoes: [{ id:"docs_depois", title:"⏭️ Enviar depois" }, { id:"m_inicio", title:"Menu principal" }]
      }
    }
  }

  // URGENTE TEXTO — ignora cliques em botão (id curto como "m_inicio")
  if (u.stage === "aguardando_urgente" && text && !ehDoc && !ehAudio) {
    // Se for id de botão, sai do modo urgente e redireciona normalmente
    if (/^[a-z][a-z0-9_]{1,20}$/.test(text)) {
      u.stage = "cliente"
      // deixa cair para o bloco MENU CLIENTE abaixo
    } else {
      await hsCriarNota(u.contatoId, "MENSAGEM URGENTE", `De: ${u.nome} (${from})\nCaso: ${u.numeroCaso}\nArea: ${u.area}\n\n${text}`)
      await hsMoverStage(u.negocioId, HS_STAGE.triagem)
      u.stage = "cliente"
      iniciarTimer(from)
      return { texto: `✅ Mensagem registrada com urgência!\n\nNossa equipe será notificada em breve.\n\n📁 Caso: ${u.numeroCaso}`, opcoes: [{ id:"m_status", title:"Status do caso" }, { id:"m_docs", title:"Enviar documentos" }, { id:"m_inicio", title:"Menu principal" }] }
    }
  }

  // CORRIGIR VALOR LIVRE
  if (u.stage === "corrigir_valor" && text) {
    if (u.corrigirCampo) { u[u.corrigirCampo] = text.trim(); u.corrigirCampo = null }
    u.stage = "confirmacao"
    iniciarTimer(from)
    return tela_confirmacao(u)
  }

  // CORRIGIR UF
  if (u.stage === "corrigir_uf") {
    if (REGIOES[text]) { u._regiao = text; iniciarTimer(from); return telaUFsRegiao(text) }
    const val = UF_MAP[text]
    if (val) { u.uf = val; u.stage = "confirmacao"; iniciarTimer(from); return tela_confirmacao(u) }
    iniciarTimer(from)
    return telaRegioes()
  }

  // CORRIGIR CONTRIBUICAO/BENEFICIO
  if (u.stage === "corrigir_sel") {
    const mc = { cc_nunca: "Nunca", cc_pouco: "Pouco tempo", cc_1ano: "Mais de 1 ano", cc_muito: "Muitos anos" }
    const mb = { cb_sim: "Sim", cb_nao: "Nao" }
    const val = mc[text] || mb[text]
    if (val && u.corrigirCampo) { u[u.corrigirCampo] = val; u.corrigirCampo = null; u.stage = "confirmacao"; iniciarTimer(from); return tela_confirmacao(u) }
  }

  // CONFIRMACAO
  if (u.stage === "confirmacao") {
    if (text === "conf_ok") {
      const numeroCaso = await finalizarCadastro(from, u)
      const docs = getDocumentos(u.area, u.tipo || u.situacao)
      iniciarTimer(from)
      return {
        texto: `🎉 *Cadastro realizado com sucesso!*\n\n📁 Número do caso: *${numeroCaso}*\n\nUm especialista em ${u.area} vai analisar seu caso e entrar em contato em breve. ⏱️\n\n📋 *Documentos necessários:*\n${docs}\n\nDeseja enviar os documentos agora?`,
        opcoes: [{ id: "m_docs", title: "Enviar documentos" }, { id: "m_inicio", title: "Menu principal" }, { id: "m_encerrar", title: "Encerrar atendimento" }]
      }
    }
    if (text === "conf_corrigir") {
      u.stage = "menu_correcao"; iniciarTimer(from)
      return {
        texto: "✏️ Qual informação deseja corrigir?",
        opcoes: [
          { id: "cor_nome",    title: "Nome" },
          { id: "cor_cidade",  title: "Cidade" },
          { id: "cor_uf",      title: "Estado" },
          { id: "cor_contrib", title: "Contrib. INSS" },
          { id: "cor_benef",   title: "Recebe beneficio" },
          { id: "cor_desc",    title: "Descricao" }
        ]
      }
    }
  }

  // MENU CORRECAO
  if (u.stage === "menu_correcao") {
    if (text === "cor_nome")   { u.corrigirCampo = "nome";   u.stage = "corrigir_valor"; iniciarTimer(from); return { texto: "Digite o nome correto:", opcoes: null } }
    if (text === "cor_cidade") { u.corrigirCampo = "cidade"; u.stage = "corrigir_valor"; iniciarTimer(from); return { texto: "Digite a cidade correta:", opcoes: null } }
    if (text === "cor_uf")     { u.stage = "corrigir_uf"; iniciarTimer(from); return telaRegioes() }
    if (text === "cor_desc")   { u.corrigirCampo = "descricao"; u.stage = "corrigir_valor"; iniciarTimer(from); return { texto: "Digite a descricao correta:", opcoes: null } }
    if (text === "cor_contrib") {
      u.corrigirCampo = "contribuicao"; u.stage = "corrigir_sel"; iniciarTimer(from)
      return { texto: "Corrija a informacao sobre contribuicao ao INSS:", opcoes: [{ id: "cc_nunca", title: "Nunca" }, { id: "cc_pouco", title: "Pouco tempo" }, { id: "cc_1ano", title: "Mais de 1 ano" }, { id: "cc_muito", title: "Muitos anos" }] }
    }
    if (text === "cor_benef") {
      u.corrigirCampo = "recebeBeneficio"; u.stage = "corrigir_sel"; iniciarTimer(from)
      return { texto: "Voce recebe algum beneficio?", opcoes: [{ id: "cb_sim", title: "Sim" }, { id: "cb_nao", title: "Nao" }] }
    }
  }

  // COLETA
  if (u.stage === "coleta_nome" && text) {
    u.nome = text.trim(); u.stage = "coleta_cidade"; iniciarTimer(from)
    return { texto: "📍 Em qual cidade você mora?", opcoes: null }
  }
  if (u.stage === "coleta_cidade" && text) {
    u.cidade = text.trim(); u.stage = "coleta_regiao"; iniciarTimer(from)
    return telaRegioes()
  }
  if (u.stage === "coleta_regiao") {
    if (!REGIOES[text]) { iniciarTimer(from); return telaRegioes() }
    u._regiao = text; u.stage = "coleta_uf"; iniciarTimer(from)
    return telaUFsRegiao(text)
  }
  if (u.stage === "coleta_uf") {
    const val = UF_MAP[text]
    if (!val) { iniciarTimer(from); return telaUFsRegiao(u._regiao || "reg_n") }
    u.uf = val; u.stage = "coleta_contrib"; iniciarTimer(from)
    return { texto: "🏛️ Você já contribuiu para o INSS?", opcoes: [{ id:"col_c1", title:"Nunca contribuí" }, { id:"col_c2", title:"Pouco tempo" }, { id:"col_c3", title:"Mais de 1 ano" }, { id:"col_c4", title:"Muitos anos" }] }
  }
  if (u.stage === "coleta_contrib") {
    const m = { col_c1:"Nunca contribuí", col_c2:"Pouco tempo", col_c3:"Mais de 1 ano", col_c4:"Muitos anos" }
    if (!m[text]) { iniciarTimer(from); return { texto: "Selecione uma opcao:", opcoes: Object.entries(m).map(([id, title]) => ({ id, title })) } }
    u.contribuicao = m[text]; u.stage = "coleta_benef"; iniciarTimer(from)
    return { texto: "💳 Você já recebe algum benefício do INSS atualmente?", opcoes: [{ id:"col_b1", title:"Sim, recebo" }, { id:"col_b2", title:"Não recebo" }] }
  }
  if (u.stage === "coleta_benef") {
    const m = { col_b1: "Sim", col_b2: "Nao" }
    if (!m[text]) { iniciarTimer(from); return { texto: "Selecione uma opcao:", opcoes: [{ id: "col_b1", title: "Sim" }, { id: "col_b2", title: "Nao" }] } }
    u.recebeBeneficio = m[text]; u.stage = "coleta_desc"; iniciarTimer(from)
    return { texto: "📝 Me explique brevemente o que está acontecendo.\n\nQuanto mais detalhes você der, melhor nossos especialistas vão entender seu caso:", opcoes: null }
  }
  if (u.stage === "coleta_desc" && text) {
    u.descricao = text.trim(); u.stage = "confirmacao"; iniciarTimer(from)
    return tela_confirmacao(u)
  }

  // GATILHO → URGENCIA → COLETA
  if (u.stage === "gatilho") {
    u.stage = "urgencia"; iniciarTimer(from)
    return { texto: "💰 Isso está te prejudicando financeiramente hoje?", opcoes: [{ id:"urg_sim", title:"Sim, muito" }, { id:"urg_nao", title:"Ainda não" }] }
  }
  if (u.stage === "urgencia") {
    if (text === "urg_sim") { u.urgencia = "alta"; u.score += 3 }
    u.stage = "coleta_nome"; iniciarTimer(from)
    return { texto: "📝 Ótimo! Vamos registrar seu caso.\n\nQual é o seu nome completo?", opcoes: null }
  }

  // INICIO
  if (u.stage === "inicio") {
    if (u.numeroCaso) {
      u.stage = "cliente"; iniciarTimer(from)
      return menuCliente(u)
    }
    u.stage = "area"; iniciarTimer(from)
    return {
      texto: "👋 Olá! Bem-vindo(a) à *Oraculum Advocacia*! ⚖️\n\nMeu nome é *Beatriz*, sua assistente virtual. Estou aqui para te ajudar de forma rápida e segura. 😊\n\nSobre qual área você precisa de ajuda?",
      opcoes: [{ id:"area_inss", title:"🏛️ INSS" }, { id:"area_trab", title:"💼 Trabalhista" }, { id:"area_outros", title:"📋 Outros" }]
    }
  }

  // AREA
  if (u.stage === "area") {
    if (text === "area_inss") { u.area = "INSS"; u.stage = "inss_menu"; iniciarTimer(from); return { texto: "Certo, vamos cuidar do seu caso.\nQual dessas situacoes descreve o que esta acontecendo?", opcoes: [{ id: "i_novo", title: "Novo beneficio" }, { id: "i_negado", title: "Beneficio negado" }, { id: "i_cortado", title: "Beneficio cortado" }] } }
    if (text === "area_trab") { u.area = "Trabalhista"; u.stage = "trab_menu"; iniciarTimer(from); return { texto: "Qual e o seu caso trabalhista?", opcoes: [{ id: "t_dem", title: "Fui demitido" }, { id: "t_dir", title: "Direitos nao pagos" }, { id: "t_acid", title: "Acidente de trabalho" }, { id: "t_ass", title: "Assedio moral" }, { id: "t_out", title: "Outro" }] } }
    if (text === "area_outros") { u.area = "Outros"; u.stage = "outros_menu"; iniciarTimer(from); return { texto: "Como posso te ajudar?", opcoes: [{ id: "o_consul", title: "Consultoria juridica" }, { id: "o_rev", title: "Revisao de documentos" }, { id: "o_out", title: "Outro assunto" }] } }
  }

  // INSS MENU
  if (u.stage === "inss_menu") {
    if (text === "i_novo")    { u.situacao = "Solicitação de novo benefício"; u.stage = "inss_novo";    iniciarTimer(from); return { texto: "📋 Qual benefício você deseja solicitar?", opcoes: [{ id:"in_apos", title:"🏖️ Aposentadoria" }, { id:"in_bpc", title:"♿ BPC / LOAS" }, { id:"in_incap", title:"🏥 Incapacidade" }, { id:"in_dep", title:"👨‍👩‍👧 Dependentes" }, { id:"in_out", title:"📋 Outros" }] } }
    if (text === "i_negado")  { u.situacao = "Benefício negado pelo INSS"; u.score += 1; u.stage = "inss_neg_tipo"; iniciarTimer(from); return { texto: "Qual beneficio foi negado?", opcoes: [{ id: "ign_apos", title: "Aposentadoria" }, { id: "ign_bpc", title: "BPC / LOAS" }, { id: "ign_incap", title: "Incapacidade" }, { id: "ign_dep", title: "Dependentes" }, { id: "ign_out", title: "Outros" }] } }
    if (text === "i_cortado") { u.situacao = "Benefício suspenso/cortado"; u.score += 2; u.stage = "inss_cort_tipo"; iniciarTimer(from); return { texto: "Qual beneficio foi cortado?", opcoes: [{ id: "ic_apos", title: "Aposentadoria" }, { id: "ic_bpc", title: "BPC / LOAS" }, { id: "ic_incap", title: "Incapacidade" }, { id: "ic_dep", title: "Dependentes" }, { id: "ic_out", title: "Outros" }] } }
  }

  // INSS NOVO
  if (u.stage === "inss_novo") {
    const m = { in_apos: "aposentadoria", in_bpc: "bpc", in_incap: "incapacidade", in_dep: "dependentes", in_out: "inss_outros" }
    u.tipo = m[text] || "outros"
    if (text === "in_apos") { u.stage = "inss_apos"; iniciarTimer(from); return { texto: "Qual tipo de aposentadoria?", opcoes: [{ id: "ia_idade", title: "Por idade" }, { id: "ia_tempo", title: "Tempo contribuicao" }, { id: "ia_esp", title: "Especial" }] } }
    if (text === "in_bpc")  { u.stage = "inss_bpc";  iniciarTimer(from); return { texto: "Qual opcao?", opcoes: [{ id: "ib_id", title: "Idoso" }, { id: "ib_def", title: "Deficiencia" }] } }
    if (text === "in_incap"){ u.stage = "inss_inc";  iniciarTimer(from); return { texto: "Qual beneficio?", opcoes: [{ id: "ii_aux", title: "Auxilio-doenca" }, { id: "ii_inv", title: "Invalidez" }] } }
    if (text === "in_dep")  { u.stage = "inss_dep";  iniciarTimer(from); return { texto: "Qual beneficio?", opcoes: [{ id: "id_pen", title: "Pensao por morte" }, { id: "id_rec", title: "Aux. reclusao" }, { id: "id_out", title: "Outro" }] } }
    if (text === "in_out")  { u.stage = "inss_out";  iniciarTimer(from); return { texto: "Qual opcao?", opcoes: [{ id: "io_rev", title: "Revisao beneficio" }, { id: "io_ctc", title: "Certidao contrib." }, { id: "io_pla", title: "Planejamento" }] } }
  }

  // INSS subtipos → INSS_JA
  if (["inss_apos","inss_bpc","inss_inc","inss_dep","inss_out"].includes(u.stage)) {
    const m = {
      ia_idade: "Por idade", ia_tempo: "Tempo de contribuicao", ia_esp: "Especial",
      ib_id: "Idoso", ib_def: "Pessoa com deficiencia",
      ii_aux: "Auxilio-doenca", ii_inv: "Aposentadoria por invalidez",
      id_pen: "Pensao por morte", id_rec: "Auxilio-reclusao", id_out: "Outro",
      io_rev: "Revisao de beneficio", io_ctc: "Certidao de tempo de contribuicao", io_pla: "Planejamento de aposentadoria"
    }
    u.subTipo = m[text] || text; u.stage = "inss_ja"; iniciarTimer(from)
    return { texto: "📋 Você já deu entrada nesse pedido no INSS?", opcoes: [{ id:"ja_s", title:"✅ Sim, já dei entrada" }, { id:"ja_n", title:"❌ Ainda não dei entrada" }] }
  }
  if (u.stage === "inss_ja") {
    u.detalhe = text === "ja_s" ? "Já deu entrada" : "Ainda não deu entrada"
    u.stage   = "gatilho"; iniciarTimer(from)
    return { texto: "Casos como o seu sao bem comuns aqui. Muitas vezes conseguimos resolver mais rapido do que a pessoa imagina.", opcoes: [{ id: "cont", title: "Continuar" }] }
  }

  // INSS NEGADO
  if (u.stage === "inss_neg_tipo") {
    const m = { ign_apos: "Aposentadoria", ign_bpc: "BPC/LOAS", ign_incap: "Incapacidade", ign_dep: "Dependentes", ign_out: "Outros" }
    u.subTipo = m[text] || text; u.stage = "inss_neg_quando"; iniciarTimer(from)
    return { texto: "Quando o beneficio foi negado?", opcoes: [{ id: "nq_rec", title: "Menos de 30 dias" }, { id: "nq_ant", title: "Mais de 30 dias" }] }
  }
  if (u.stage === "inss_neg_quando") {
    u.detalhe = text === "nq_rec" ? "Negado ha menos de 30 dias" : "Negado ha mais de 30 dias"
    u.stage   = "gatilho"; iniciarTimer(from)
    return { texto: "Vamos analisar seu caso com cuidado.", opcoes: [{ id: "cont", title: "Continuar" }] }
  }

  // INSS CORTADO
  if (u.stage === "inss_cort_tipo") {
    const m = { ic_apos: "Aposentadoria", ic_bpc: "BPC/LOAS", ic_incap: "Incapacidade", ic_dep: "Dependentes", ic_out: "Outros" }
    u.subTipo = m[text] || text; u.stage = "inss_cort_mot"; iniciarTimer(from)
    return { texto: "Voce sabe o motivo do corte?", opcoes: [{ id: "cm_n", title: "Nao sei" }, { id: "cm_p", title: "Falta de pericia" }, { id: "cm_r", title: "Renda acima" }, { id: "cm_o", title: "Outro" }] }
  }
  if (u.stage === "inss_cort_mot") {
    const m = { cm_n: "Motivo desconhecido", cm_p: "Falta de pericia", cm_r: "Renda acima do permitido", cm_o: "Outro" }
    u.detalhe = m[text] || text; u.stage = "inss_cort_rec"; iniciarTimer(from)
    return { texto: "Voce esta sem receber agora?", opcoes: [{ id: "sr_s", title: "Sim, sem renda" }, { id: "sr_n", title: "Ainda recebo algo" }] }
  }
  if (u.stage === "inss_cort_rec") {
    if (text === "sr_s") { u.semReceber = true; u.urgencia = "alta"; u.score += 3 }
    u.stage = "inss_cort_qdo"; iniciarTimer(from)
    return { texto: "Quando o beneficio foi cortado?", opcoes: [{ id: "cq_r", title: "Menos de 30 dias" }, { id: "cq_a", title: "Mais de 30 dias" }] }
  }
  if (u.stage === "inss_cort_qdo") {
    u.detalhe += " | " + (text === "cq_r" ? "Cortado ha menos de 30 dias" : "Cortado ha mais de 30 dias")
    u.stage = "gatilho"; iniciarTimer(from)
    return { texto: "Vamos verificar a melhor forma de resolver isso.", opcoes: [{ id: "cont", title: "Continuar" }] }
  }

  // TRABALHISTA
  if (u.stage === "trab_menu") {
    if (text === "t_dem")  { u.situacao = "Demissao";          u.tipo = "demissao";  u.stage = "trab_dem_tipo"; iniciarTimer(from); return { texto: "Como foi a demissao?", opcoes: [{ id: "td_s", title: "Sem justa causa" }, { id: "td_c", title: "Com justa causa" }, { id: "td_p", title: "Pedido de demissao" }] } }
    if (text === "t_dir")  { u.situacao = "Direitos nao pagos"; u.tipo = "direitos";  u.stage = "trab_dir_tipo"; iniciarTimer(from); return { texto: "Qual direito nao foi pago?", opcoes: [{ id: "tdr_f", title: "FGTS" }, { id: "tdr_fe", title: "Ferias" }, { id: "tdr_13", title: "13 salario" }, { id: "tdr_h", title: "Horas extras" }, { id: "tdr_o", title: "Outro" }] } }
    if (text === "t_acid") { u.situacao = "Acidente de trabalho"; u.tipo = "acidente"; u.stage = "trab_acid_af"; iniciarTimer(from); return { texto: "Voce se afastou pelo INSS?", opcoes: [{ id: "af_s", title: "Sim" }, { id: "af_n", title: "Nao" }] } }
    if (text === "t_ass")  { u.situacao = "Assedio moral";       u.tipo = "assedio";  u.stage = "trab_ass_s"; iniciarTimer(from); return { texto: "O assedio ainda esta acontecendo?", opcoes: [{ id: "as_s", title: "Sim" }, { id: "as_n", title: "Nao" }] } }
    if (text === "t_out")  { u.situacao = "Outros";              u.tipo = "outros";   u.stage = "trab_out_desc"; iniciarTimer(from); return { texto: "Descreva brevemente seu caso trabalhista:", opcoes: null } }
  }
  if (u.stage === "trab_dem_tipo") {
    const m = { td_s: "Sem justa causa", td_c: "Com justa causa", td_p: "Pedido de demissao" }
    u.subTipo = m[text] || text; u.stage = "trab_dem_verb"; iniciarTimer(from)
    return { texto: "Voce recebeu todas as verbas rescisórias?", opcoes: [{ id: "tv_s", title: "Sim, recebi" }, { id: "tv_n", title: "Nao recebi" }] }
  }
  if (u.stage === "trab_dem_verb") {
    u.detalhe = text === "tv_s" ? "Verbas pagas" : "Verbas nao pagas"; u.stage = "trab_dem_qdo"; iniciarTimer(from)
    return { texto: "Ha quanto tempo foi a demissao?", opcoes: [{ id: "dq_r", title: "Menos de 30 dias" }, { id: "dq_a", title: "Mais de 30 dias" }] }
  }
  if (u.stage === "trab_dem_qdo") {
    u.detalhe += " | " + (text === "dq_r" ? "menos de 30 dias" : "mais de 30 dias")
    u.stage = "gatilho"; iniciarTimer(from)
    return { texto: "Casos como o seu sao bem comuns aqui.", opcoes: [{ id: "cont", title: "Continuar" }] }
  }
  if (u.stage === "trab_dir_tipo") {
    const m = { tdr_f: "FGTS", tdr_fe: "Ferias", tdr_13: "13 salario", tdr_h: "Horas extras", tdr_o: "Outro" }
    u.subTipo = m[text] || text; u.stage = "trab_dir_pend"; iniciarTimer(from)
    return { texto: "Isso ainda esta pendente?", opcoes: [{ id: "pnd_s", title: "Sim, pendente" }, { id: "pnd_n", title: "Ja encerrado" }] }
  }
  if (u.stage === "trab_dir_pend") {
    u.detalhe = text === "pnd_s" ? "Pendente" : "Encerrado"
    u.stage = "gatilho"; iniciarTimer(from)
    return { texto: "Casos como o seu sao bem comuns aqui.", opcoes: [{ id: "cont", title: "Continuar" }] }
  }
  if (u.stage === "trab_acid_af") {
    u.subTipo = text === "af_s" ? "Com afastamento INSS" : "Sem afastamento"
    u.stage = "gatilho"; iniciarTimer(from)
    return { texto: "Casos como o seu sao bem comuns aqui.", opcoes: [{ id: "cont", title: "Continuar" }] }
  }
  if (u.stage === "trab_ass_s") {
    u.subTipo = text === "as_s" ? "Assedio em curso" : "Assedio encerrado"; u.stage = "trab_ass_prov"; iniciarTimer(from)
    return { texto: "Voce possui provas ou testemunhas?", opcoes: [{ id: "pv_s", title: "Sim" }, { id: "pv_n", title: "Nao" }] }
  }
  if (u.stage === "trab_ass_prov") {
    u.detalhe = text === "pv_s" ? "Com provas/testemunhas" : "Sem provas"
    u.stage = "gatilho"; iniciarTimer(from)
    return { texto: "Casos como o seu sao bem comuns aqui.", opcoes: [{ id: "cont", title: "Continuar" }] }
  }
  if (u.stage === "trab_out_desc" && text) {
    if (!u.descricao) u.descricao = text
    u.stage = "gatilho"; iniciarTimer(from)
    return { texto: "Certo. Vamos registrar seu caso.", opcoes: [{ id: "cont", title: "Continuar" }] }
  }

  // OUTROS
  if (u.stage === "outros_menu") {
    if (text === "o_consul") { u.situacao = "Consultoria juridica"; u.stage = "out_cons_tipo"; iniciarTimer(from); return { texto: "Sobre qual area precisa de orientacao?", opcoes: [{ id: "oc_i", title: "INSS" }, { id: "oc_t", title: "Trabalhista" }, { id: "oc_o", title: "Outro" }] } }
    if (text === "o_rev")    { u.situacao = "Revisao de documentos"; u.tipo = "revisao"; u.stage = "out_rev_tipo"; iniciarTimer(from); return { texto: "Qual tipo de documento?", opcoes: [{ id: "or_c", title: "Contrato" }, { id: "or_p", title: "Processo" }, { id: "or_o", title: "Outro" }] } }
    if (text === "o_out")    { u.situacao = "Outro assunto"; u.stage = "out_desc"; iniciarTimer(from); return { texto: "Descreva brevemente o que precisa:", opcoes: null } }
  }
  if (u.stage === "out_cons_tipo") {
    const m = { oc_i: "INSS", oc_t: "Trabalhista", oc_o: "Outro" }
    u.subTipo = m[text] || text; u.stage = "gatilho"; iniciarTimer(from)
    return { texto: "Casos como o seu sao bem comuns aqui.", opcoes: [{ id: "cont", title: "Continuar" }] }
  }
  if (u.stage === "out_rev_tipo") {
    const m = { or_c: "Contrato", or_p: "Processo", or_o: "Outro" }
    u.subTipo = m[text] || text; u.stage = "gatilho"; iniciarTimer(from)
    return { texto: "Casos como o seu sao bem comuns aqui.", opcoes: [{ id: "cont", title: "Continuar" }] }
  }
  if (u.stage === "out_desc" && text) {
    if (!u.descricao) u.descricao = text
    u.stage = "gatilho"; iniciarTimer(from)
    return { texto: "Certo. Vamos registrar seu caso.", opcoes: [{ id: "cont", title: "Continuar" }] }
  }

  // MENU CLIENTE
  if (u.stage === "cliente") {
    if (text === "m_status") {
      iniciarTimer(from)
      const statusLabel = u.urgencia === "alta" ? "⚡ Análise prioritária" : "🔍 Em análise"
      const totalDocs   = getDocumentosLista(u.area, u.tipo||u.situacao).length
      const entregDocs  = (u.docsEntregues||[]).length
      const docInfo     = entregDocs >= totalDocs ? "\n✅ Documentos: todos entregues" : `\n📋 Documentos: ${entregDocs} de ${totalDocs} entregues`
      const texto = [
        "📊 *Status do seu caso*","",
        `🔢 Número: *${u.numeroCaso}*`,
        `⚖️ Área: ${u.area}`,
        `📋 Situação: ${situacaoLegivel(u)}`,
        `🚦 Status: ${statusLabel}`,
        `${u.urgencia==="alta"?"🔴":"🟡"} Prioridade: ${u.urgencia==="alta"?"Alta":"Normal"}`,
        docInfo,"",
        "Sua solicitação está sendo avaliada com toda atenção. Assim que houver novidades, entraremos em contato pelo WhatsApp. 💬","",
        "⏱️ Prazo estimado de retorno: até *2 dias úteis*."
      ].join("\n")
      return { texto, opcoes: [{ id:"m_docs", title:"📎 Enviar documentos" }, { id:"m_adv", title:"👨‍⚖️ Falar c/ advogado" }, { id:"m_inicio", title:"Menu principal" }] }
    }
    if (text === "m_docs") {
      await hsMoverStage(u.negocioId, HS_STAGE.docs)
      if (!u.docsEntregues) u.docsEntregues = []
      u.docPaginaAtual = u.docPaginaAtual || 0
      const tela = telaEnvioDoc(u)
      iniciarTimer(from)
      return tela
    }
    if (text === "docs_reenviar") {
      if (u.ultimoArquivoId) {
        await excluirDrive(u.ultimoArquivoId)
        u.ultimoArquivoId = null; u.ultimoArquivoNome = null
        u.docPaginaAtual = Math.max(0, (u.docPaginaAtual||1) - 1)
      }
      const pend = getDocsPendentes(u)
      const doc  = pend[0]
      const folhas = doc?.folhas || ["Página 1"]
      const folha  = folhas[u.docPaginaAtual] || `Página ${u.docPaginaAtual+1}`
      iniciarTimer(from)
      return { texto: `🔄 Foto anterior removida!\n\nEnvie novamente: *${folha}* do *${doc?.label||"documento"}*\n\n💡 Boa iluminação, sem reflexo, tudo enquadrado.`, opcoes: null }
    }
    if (text === "docs_proxfolha") {
      u.docPaginaAtual = (u.docPaginaAtual||0) + 1
      iniciarTimer(from)
      return telaEnvioDoc(u)
    }
    if (text === "docs_proxdoc") {
      const pend = getDocsPendentes(u)
      if (pend.length > 0) u.docsEntregues.push(pend[0].id)
      u.docPaginaAtual = 0
      iniciarTimer(from)
      return telaEnvioDoc(u)
    }
    if (text === "docs_depois") {
      const nome1 = (u.nome || u.nomeWA).split(" ")[0]
      iniciarTimer(from)
      return { texto: `Sem problema, ${nome1}! 😊\n\nQuando tiver os documentos, é só voltar aqui e tocar em *"Enviar documentos"*.\n\n📁 Caso: *${u.numeroCaso}*`, opcoes: [{ id:"m_docs", title:"📎 Enviar documentos" }, { id:"m_status", title:"Status do caso" }, { id:"m_inicio", title:"Menu principal" }] }
    }
    if (text === "m_adv") {
      iniciarTimer(from)
      return { texto: "👨‍⚖️ *Falar com advogado*\n\nComo você prefere ser atendido?", opcoes: [{ id:"adv_ag", title:"📅 Agendar ligação" }, { id:"adv_urg", title:"🚨 Mensagem urgente" }, { id:"m_inicio", title:"Menu principal" }] }
    }
    if (text === "adv_ag") {
      await hsMoverStage(u.negocioId, HS_STAGE.agendamento)
      await hsCriarNota(u.contatoId, "AGENDAMENTO SOLICITADO", `${u.nome} (${from}) solicitou agendamento.\nCaso: ${u.numeroCaso} | Area: ${u.area}\nLink: ${MEETINGS}`)
      iniciarTimer(from)
      return { texto: `📅 *Agendamento de ligação*\n\n1️⃣ Toque no link abaixo\n2️⃣ Escolha o dia e horário\n3️⃣ Coloque seu e-mail para a confirmação\n\n🔗 ${MEETINGS}\n\nAssim que confirmar, enviaremos os detalhes aqui no WhatsApp também. 💬\n\n📁 Caso: *${u.numeroCaso}*`, opcoes: [{ id:"adv_urg", title:"🚨 Mensagem urgente" }, { id:"m_status", title:"Status do caso" }, { id:"m_inicio", title:"Menu principal" }] }
    }
    if (text === "adv_urg") {
      u.stage = "aguardando_urgente"; iniciarTimer(from)
      return { texto: `🚨 *Mensagem urgente*\n\nDigite sua mensagem ou envie um áudio.\nTudo será registrado e notificado imediatamente à equipe.\n\n📁 Caso: *${u.numeroCaso}*`, opcoes: null }
    }
    if (text === "m_encerrar") {
      limparTimer(u)
      const nome1 = (u.nome || u.nomeWA).split(" ")[0]
      return { texto: `👋 Foi um prazer te atender, ${nome1}!\n\nSeu caso está registrado sob o número *${u.numeroCaso}*.\n\nSempre que precisar, é só mandar uma mensagem. Até logo! 😊`, opcoes: null }
    }
    if (text === "m_inicio") {
      iniciarTimer(from); return menuCliente(u)
    }
    // Detectar intencao de encerrar antes de passar para IA
    if (text) {
      const lower = text.toLowerCase()
      const palavrasEncerrar = ["encerrar","encerra","tchau","ate logo","boa noite","boa tarde","bom dia","obrigado","obrigada","ate mais","pode encerrar","finalizar","finalize","fecha","fechar","ate breve","por hoje"]
      if (palavrasEncerrar.some(p => lower.includes(p))) {
        const nome1 = (u.nome || u.nomeWA).split(" ")[0]
        limparTimer(u)
        return { texto: `👋 Foi um prazer, ${nome1}!\n\nSeu caso *${u.numeroCaso}* está registrado. Qualquer coisa, é só mandar uma mensagem. Até logo! 😊`, opcoes: null }
      }
    }
    // Groq IA para perguntas livres
    if (text && GROQ_KEY) {
      const resp = await respostaIA(u, text)
      if (resp) { iniciarTimer(from); return { texto: resp, opcoes: [{ id:"m_status", title:"📊 Status" }, { id:"m_adv", title:"👨‍⚖️ Advogado" }, { id:"m_encerrar", title:"Encerrar" }, { id:"m_inicio", title:"Menu principal" }] } }
    }
    iniciarTimer(from); return menuCliente(u)
  }

  // FALLBACK
  u.stage = "area"; iniciarTimer(from)
  return { texto: "👋 Olá! Vamos começar. Como posso te ajudar?", opcoes: [{ id:"area_inss", title:"🏛️ INSS" }, { id:"area_trab", title:"💼 Trabalhista" }, { id:"area_outros", title:"📋 Outros" }] }
}

app.get("/", (_, res) => res.send("Oraculum v6.0"))
app.get("/health", (_, res) => res.json({ status: "ok", uptime: Math.floor((Date.now() - monitor.inicio) / 1000), conversas: monitor.conversas, cadastros: monitor.cadastros, ativos: Object.keys(users).length, erros: monitor.erros.slice(-10), ram_mb: (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(1) }))
app.get("/webhook", (req, res) => {
  if (req.query["hub.mode"] && req.query["hub.verify_token"] === VERIFY_TOKEN) return res.status(200).send(req.query["hub.challenge"])
  return res.sendStatus(403)
})
app.post("/webhook", async (req, res) => {
  try {
    const value   = req.body.entry?.[0]?.changes?.[0]?.value
    const message = value?.messages?.[0]
    if (!message) return res.sendStatus(200)
    const from   = message.from
    const nomeWA = value?.contacts?.[0]?.profile?.name || "Cliente"
    const text   = (message.text?.body || message.interactive?.button_reply?.id || message.interactive?.list_reply?.id || "").trim()
    const { texto, opcoes } = await processar(from, nomeWA, text, message)
    if (texto) await enviar(from, texto, opcoes)
    return res.sendStatus(200)
  } catch (err) { logErro("geral", err.message); return res.sendStatus(500) }
})

const PORT = process.env.PORT || 10000
// Webhook de confirmação de agendamento (HubSpot → WhatsApp)
app.post("/agendamento", async (req, res) => {
  try {
    const { phone, name, datetime, meetingLink } = req.body
    if (!phone) return res.sendStatus(400)
    const numero = phone.replace(/\D/g, "")
    const dataHora = datetime || "em breve"
    await enviar(numero,
      `📅 *Agendamento confirmado!*\n\n✅ Olá, ${name||"cliente"}! Sua ligação com um especialista da Oraculum Advocacia está confirmada.\n\n🗓️ Data/Horário: *${dataHora}*\n\nCaso precise reagendar, acesse:\n🔗 ${meetingLink||MEETINGS}\n\nEstamos à disposição! 💼`,
      null, false)
    return res.sendStatus(200)
  } catch (e) { logErro("agendamento", e.message); return res.sendStatus(500) }
})

app.listen(PORT, () => console.log(`Oraculum v6.0 — porta ${PORT}`))
