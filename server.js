// ================================================================
//  ORACULUM ADVOCACIA — v6.2
//  WhatsApp · HubSpot · Google Drive · AssemblyAI · Groq AI
// ================================================================
require("dotenv").config()

const express    = require("express")
const axios      = require("axios")
const { google } = require("googleapis")
const fs         = require("fs")
const path       = require("path")

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
const DATA_DIR = path.join(__dirname, "data")
const USERS_STATE_FILE = path.join(DATA_DIR, "users-state.json")

const HS_PIPELINE = "default"
const STAGES = {
  INICIO: "inicio",
  AREA: "area",
  CLIENTE: "cliente",
  AGUARDANDO_URGENTE: "aguardando_urgente",
  URGENTE_AUDIO_CONFIRMA: "urgente_audio_confirma",
  URGENTE_AUDIO_ERRO_TRANSCRICAO: "urgente_audio_erro_transcricao",
  COLETA_DESC: "coleta_desc",
  COLETA_DESC_AUDIO: "coleta_desc_audio",
  DESC_CONFIRMA: "desc_confirma",
  DESC_ERRO_TRANSCRICAO: "desc_erro_transcricao",
  SUGESTAO_FLUXO_OUTRO: "sugestao_fluxo_outro",
  EXPLICAR_TUDO_OFERTA: "explicar_tudo_oferta",
  AUDIO_FLUXO_CONFIRMA: "audio_fluxo_confirma",
  CONFIRMAR_ENTRADA: "confirmar_entrada",
  CONFIRMACAO: "confirmacao",
  MENU_CORRECAO: "menu_correcao",
  CORRIGIR_VALOR: "corrigir_valor",
  CORRIGIR_UF: "corrigir_uf",
  CORRIGIR_SEL: "corrigir_sel",
  INICIO_RETORNO: "inicio_retorno",
  NOVO_CASO_CONFIRMA: "novo_caso_confirma",
  RETOMADA_AUTOMATICA: "retomada_automatica"
}
const HS_STAGE = {
  LEAD: "appointmentscheduled",
  CADASTRO: "qualifiedtobuy",
  ANALISE: "presentationscheduled",
  AGUARDANDO_DOCS: "decisionmakerboughtin",
  DOCS: "contractsent",
  AGENDAMENTO: "1343040832",
  PROTOCOLO: "1343040098",
  PROCESSO: "1337291921",
  FINAL: "1343039663"
}

const monitor = { conversas: 0, cadastros: 0, erros: [], inicio: new Date() }
function logErro(tipo, msg) {
  monitor.erros.push({ tipo, msg, ts: new Date().toISOString() })
  if (monitor.erros.length > 100) monitor.erros.shift()
  console.error(`[${tipo.toUpperCase()}] ${msg}`)
}

const users = {}
let persistUsersTimeout = null
const mensagensProcessadas = new Map()

function mensagemJaProcessada(messageId) {
  if (!messageId) return false
  const agora = Date.now()
  for (const [id, ts] of mensagensProcessadas.entries()) {
    if (agora - ts > 10 * 60 * 1000) mensagensProcessadas.delete(id)
  }
  if (mensagensProcessadas.has(messageId)) return true
  mensagensProcessadas.set(messageId, agora)
  return false
}

function novoUsuario(nomeWA) {
  return {
    stage: "inicio", etapa: "inicio", nomeWA,
    nome: null, regiao: null, cidade: null, uf: null,
    area: null, tipo: null, situacao: null, subTipo: null, detalhe: null,
    urgencia: "normal", semReceber: false,
    contribuicao: null, recebeBeneficio: null, descricao: null,
    whatsappVerificado: false, telefoneEhDoCliente: null, whatsappContato: null,
    nomeConfirmado: false,
    contatoId: null, negocioId: null, numeroCaso: null,
    pastaDriveId: null, pastaDriveLink: null,
    score: 0, documentosEnviados: false,
    docsEntregues: [], docAtualIdx: 0, ultimoArqId: null, ultimoArqNome: null,
    corrigirCampo: null, historiaIA: [],
    lastPergunta: null, lastPerguntaPayload: null,
    leadIncompletoCapturado: false,
    audiosDescCorrigidos: [],
    assuntoResumo: null,
    _ofereceuExplicarTudo: false,
    _sugestaoFluxo: null,
    _proximoStageAposDescricao: null,
    _proximaPerguntaAposDescricao: null,
    _entradaPendenteTipo: null, _entradaPendenteValor: null, _entradaPendenteOrigem: null,
    aguardandoRetomada: false,
    temCadastroCompleto: false,
    jaOfereceuRetomada: false,
    jaIncentivouDescricao: false,
    _retomadaEhLeadFrio: false,
    _descOrigemStage: null,
    _audioFluxoTexto: null, _audioFluxoAcao: null, _audioFluxoResposta: null,
    _urgenteAudioBuffer: null, _urgenteAudioMime: null, _urgenteAudioNome: null, _urgenteAudioTexto: null,
    modoDigitando: false,
    timer: null, timerIncentivoDescricao: null, ultimaMsg: Date.now()
  }
}

function garantirDiretorioDados() {
  try { fs.mkdirSync(DATA_DIR, { recursive: true }) }
  catch (e) { logErro("persistencia", "mkdir: " + e.message) }
}

function serializarUsers() {
  const saida = {}
  for (const [from, u] of Object.entries(users)) {
    saida[from] = {
      ...u,
      timer: null,
      timerIncentivoDescricao: null,
      _audioDescBuffer: null
    }
  }
  return saida
}

function persistirUsersAgora() {
  try {
    garantirDiretorioDados()
    fs.writeFileSync(USERS_STATE_FILE, JSON.stringify({
      savedAt: new Date().toISOString(),
      users: serializarUsers()
    }, null, 2), "utf8")
  } catch (e) {
    logErro("persistencia", "salvarUsers: " + e.message)
  }
}

function agendarPersistenciaUsers() {
  if (persistUsersTimeout) clearTimeout(persistUsersTimeout)
  persistUsersTimeout = setTimeout(() => {
    persistUsersTimeout = null
    persistirUsersAgora()
  }, 300)
}

function hidratarUsuarioPersistido(data) {
  const base = novoUsuario(data?.nomeWA || "Cliente")
  const hidratado = { ...base, ...data, timer: null, timerIncentivoDescricao: null }
  if (!Array.isArray(hidratado.docsEntregues)) hidratado.docsEntregues = []
  if (!Array.isArray(hidratado.historiaIA)) hidratado.historiaIA = []
  if (!Array.isArray(hidratado.audiosDescCorrigidos)) hidratado.audiosDescCorrigidos = []
  if (!hidratado.lastPerguntaPayload || typeof hidratado.lastPerguntaPayload.texto !== "string") {
    hidratado.lastPerguntaPayload = null
  }
  hidratado._audioDescBuffer = null
  hidratado._audioDescMime = hidratado._audioDescMime || null
  hidratado._audioDescNome = hidratado._audioDescNome || null
  hidratado.assuntoResumo = hidratado.assuntoResumo || null
  hidratado._ofereceuExplicarTudo = Boolean(hidratado._ofereceuExplicarTudo)
  hidratado._sugestaoFluxo = hidratado._sugestaoFluxo || null
  hidratado._proximoStageAposDescricao = hidratado._proximoStageAposDescricao || null
  hidratado._proximaPerguntaAposDescricao = hidratado._proximaPerguntaAposDescricao || null
  hidratado._entradaPendenteTipo = hidratado._entradaPendenteTipo || null
  hidratado._entradaPendenteValor = hidratado._entradaPendenteValor || null
  hidratado._entradaPendenteOrigem = hidratado._entradaPendenteOrigem || null
  hidratado.aguardandoRetomada = Boolean(hidratado.aguardandoRetomada)
  hidratado.temCadastroCompleto = Boolean(hidratado.temCadastroCompleto || podeMostrarMenuCliente(hidratado))
  hidratado.etapa = hidratado.etapa || hidratado.stage || STAGES.INICIO
  hidratado.jaOfereceuRetomada = Boolean(hidratado.jaOfereceuRetomada)
  hidratado.jaIncentivouDescricao = Boolean(hidratado.jaIncentivouDescricao)
  hidratado._retomadaEhLeadFrio = Boolean(hidratado._retomadaEhLeadFrio)
  hidratado._audioFluxoTexto = hidratado._audioFluxoTexto || null
  hidratado._audioFluxoAcao = hidratado._audioFluxoAcao || null
  hidratado._audioFluxoResposta = hidratado._audioFluxoResposta || null
  hidratado._urgenteAudioBuffer = null
  hidratado._urgenteAudioMime = hidratado._urgenteAudioMime || null
  hidratado._urgenteAudioNome = hidratado._urgenteAudioNome || null
  hidratado._urgenteAudioTexto = hidratado._urgenteAudioTexto || null
  hidratado.modoDigitando = Boolean(hidratado.modoDigitando)
  return hidratado
}

function carregarUsersPersistidos() {
  try {
    if (!fs.existsSync(USERS_STATE_FILE)) return
    const raw = fs.readFileSync(USERS_STATE_FILE, "utf8")
    if (!raw.trim()) return
    const parsed = JSON.parse(raw)
    const savedUsers = parsed?.users || {}
    for (const [from, data] of Object.entries(savedUsers)) users[from] = hidratarUsuarioPersistido(data)
    monitor.conversas = Math.max(monitor.conversas, Object.keys(users).length)
    console.log(`[PERSISTENCIA] ${Object.keys(savedUsers).length} conversa(s) restaurada(s)`)
  } catch (e) {
    logErro("persistencia", "carregarUsers: " + e.message)
  }
}

function getUser(from, nomeWA) {
  if (!users[from]) {
    users[from] = novoUsuario(nomeWA)
    monitor.conversas++
    agendarPersistenciaUsers()
  }
  return users[from]
}

// Formata texto livre para o CRM: Title Case + sem acentos
function toTitleCase(str) {
  return str.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/(?:^|\s)\S/g, c => c.toUpperCase())
    .trim()
}
function formatarNome(str) {
  if (!str) return str
  return str.trim().replace(/\s+/g, " ").toLowerCase()
    .replace(/(?:^|\s)\S/g, c => c.toUpperCase())
}
function formatarCidade(str) {
  if (!str) return str
  return str.trim().replace(/\s+/g, " ").toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/(?:^|\s)\S/g, c => c.toUpperCase())
    .normalize()
}

function normalizarTextoCRM(str) {
  if (!str) return str
  let texto = String(str)
    .replace(/\r/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/ *\n */g, "\n")
    .trim()

  texto = texto.replace(/(^|[.!?]\s+|\n+)([a-zà-ÿ])/g, (_, prefixo, letra) => `${prefixo}${letra.toUpperCase()}`)
  return texto
}

function gerarCaso(area) {
  const b = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }))
  const p = (n, l = 2) => String(n).padStart(l, "0")
  const prefixos = { "INSS": "PREV", "Trabalhista": "TRAB", "Outros": "CONS", "Revisão": "DOCS", "Revisao": "DOCS" }
  const prefixo = prefixos[area] || "CASO"
  const num = `${String(b.getFullYear()).slice(2)}${p(b.getMonth()+1)}${p(b.getDate())}${p(b.getHours())}${p(b.getMinutes())}${p(Math.floor(Math.random()*1000), 3)}`
  return `${prefixo}-${num}`
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

function resumoCaso(u) {
  return [
    `👤 Nome: ${u.nome || "—"}`,
    `📍 Cidade: ${u.cidade || "—"}${u.uf ? " - " + u.uf : ""}`,
    `⚖️ Área: ${u.area || "—"}`,
    u.tipo      ? `📋 Tipo: ${u.tipo}` : null,
    u.situacao  ? `📌 Situação: ${u.situacao}` : null,
    u.subTipo   ? `🔎 Detalhe: ${u.subTipo}` : null,
    u.detalhe   ? `ℹ️ Info: ${u.detalhe}` : null,
    `⚡ Urgência: ${u.urgencia === "alta" ? "Alta 🔴" : "Normal 🟡"}`,
    `💼 Contribuiu ao INSS: ${u.contribuicao || "—"}`,
    `🏥 Recebe benefício: ${u.recebeBeneficio || "—"}`,
    u.descricao ? `💬 Descrição: ${u.descricao}` : null,
  ].filter(Boolean).join("\n")
}

const DOCS_BASE = [
  {
    id:"doc_rg", label:"RG ou CNH",
    folhas:["Frente","Verso"],
    dica:"📸 Coloque sobre mesa escura. Envie a FRENTE primeiro, depois o VERSO. Sem reflexo, sem partes cortadas."
  },
  {
    id:"doc_cpf", label:"CPF",
    folhas:["Frente"],
    opcional: true,
    dica:"📸 Se o CPF já aparece no RG ou CNH, pode pular. Se tiver o cartão separado, tire foto nítida."
  },
  {
    id:"doc_res", label:"Comprovante de Residência",
    folhas:["Foto do documento"],
    dica:"📸 Conta de luz, água ou telefone dos últimos 3 meses. Foto completa, todos os dados visíveis."
  }
]
const DOCS_EXTRA = {
  "aposentadoria": [
    { id:"doc_ctps", label:"Carteira de Trabalho", folhas:["Folha de rosto","Páginas com empregos — envie cada uma"],
      dica:"📒 Fotografe a folha de rosto (seus dados) e TODAS as páginas com registros de emprego, uma foto por página. Frente e verso se tiver anotação dos dois lados." },
    { id:"doc_cnis", label:"Extrato CNIS (Meu INSS)", folhas:["Todas as páginas"],
      dica:"📱 App Meu INSS → Extrato de Contribuições. Tire print de TODAS as páginas ou salve como PDF e envie aqui." },
    { id:"doc_hol", label:"Holerites (12 meses)", folhas:["Cada holerite separado"],
      dica:"💰 Envie um holerite por foto. Se digitais, print de cada um. Valores devem estar legíveis." }
  ],
  "bpc": [
    { id:"doc_laudo", label:"Laudo Médico Atualizado", folhas:["Todas as páginas"],
      dica:"🏥 Todas as páginas do laudo, sem partes cortadas. Validade máxima: 6 meses." },
    { id:"doc_renda", label:"Declaração de Renda Familiar", folhas:["Foto do documento"],
      dica:"📄 Pode ser feita no CRAS ou pelo app Meu INSS. Envie completa." },
    { id:"doc_nasc", label:"Certidão de Nascimento", folhas:["Frente","Verso"],
      dica:"📜 Documento original, frente e verso, sobre fundo escuro." }
  ],
  "incapacidade": [
    { id:"doc_atst", label:"Atestado Médico Recente", folhas:["Foto do documento"],
      dica:"🏥 Foto completa com CRM do médico visível. Máximo 90 dias de validade." },
    { id:"doc_exam", label:"Exames e Laudos", folhas:["Cada exame separado"],
      dica:"🔬 Um exame por foto. Resultados devem estar completamente legíveis." },
    { id:"doc_ctps", label:"Carteira de Trabalho", folhas:["Folha de rosto","Páginas com empregos"],
      dica:"📒 Folha de rosto + todas as páginas com anotações, uma por vez." }
  ],
  "dependentes": [
    { id:"doc_obito", label:"Certidão de Óbito", folhas:["Frente","Verso"],
      dica:"📜 Documento original, frente e verso, sobre fundo escuro." },
    { id:"doc_nasc", label:"Certidão de Nascimento", folhas:["Frente","Verso"],
      dica:"📜 Documento original, frente e verso." }
  ],
  "negado": [
    { id:"doc_indf", label:"Carta de Indeferimento do INSS", folhas:["Todas as páginas"],
      dica:"📄 Foto completa. Se pelo app Meu INSS, print de todas as telas." },
    { id:"doc_ant", label:"Documentos do Pedido Anterior", folhas:["Cada documento separado"],
      dica:"📁 Todos os documentos do pedido anterior ao INSS, um por foto." }
  ],
  "cortado": [
    { id:"doc_susp", label:"Carta de Suspensão do Benefício", folhas:["Todas as páginas"],
      dica:"📄 Foto da notificação completa recebida do INSS." },
    { id:"doc_laudo", label:"Laudos Médicos Recentes", folhas:["Cada laudo separado"],
      dica:"🏥 Laudos com até 6 meses. Todas as páginas de cada laudo." }
  ],
  "demissao": [
    { id:"doc_ctps", label:"Carteira de Trabalho", folhas:["Folha de rosto","Páginas com empregos"],
      dica:"📒 Folha de rosto + todas as páginas com anotações de emprego." },
    { id:"doc_demit", label:"Carta de Demissão", folhas:["Todas as páginas"],
      dica:"📄 Documento completo, assinado pela empresa." },
    { id:"doc_hol", label:"Últimos 3 Holerites", folhas:["Holerite mais recente","Holerite 2","Holerite 3"],
      dica:"💰 Um holerite por foto, valores legíveis." },
    { id:"doc_fgts", label:"Extrato FGTS", folhas:["Todas as páginas"],
      dica:"📱 App FGTS → Extratos. Todas as páginas ou PDF." }
  ],
  "direitos": [
    { id:"doc_ctps", label:"Carteira de Trabalho", folhas:["Folha de rosto","Páginas com empregos"],
      dica:"📒 Folha de rosto + todas as páginas com registros." },
    { id:"doc_hol", label:"Holerites", folhas:["Cada holerite separado"],
      dica:"💰 Um por foto, todos legíveis." },
    { id:"doc_fgts", label:"Extrato FGTS", folhas:["Todas as páginas"],
      dica:"📱 App FGTS → Extratos. Todas as páginas." },
    { id:"doc_ctr", label:"Contrato de Trabalho", folhas:["Cada página separada"],
      dica:"📝 Todas as páginas assinadas, frente e verso." }
  ],
  "acidente": [
    { id:"doc_cat", label:"CAT (Comunicação de Acidente)", folhas:["Todas as páginas"],
      dica:"📋 Documento CAT completo. Se não tiver, informe ao advogado." },
    { id:"doc_atst", label:"Atestado Médico", folhas:["Foto do documento"],
      dica:"🏥 Foto nítida com CRM do médico visível." },
    { id:"doc_ctps", label:"Carteira de Trabalho", folhas:["Folha de rosto","Páginas com empregos"],
      dica:"📒 Folha de rosto + páginas com registros." }
  ],
  "assedio": [
    { id:"doc_print", label:"Prints ou Registros", folhas:["Cada print separado"],
      dica:"📱 Um print por foto, organizados por data." },
    { id:"doc_test", label:"Nomes de Testemunhas", folhas:["Mensagem de texto"],
      dica:"✍️ Digite aqui os nomes e telefones de quem presenciou os fatos." },
    { id:"doc_hol", label:"Contracheques", folhas:["Cada um separado"],
      dica:"💰 Um por foto, legíveis." }
  ],
  "revisao": [
    { id:"doc_orig", label:"Documento para Revisão", folhas:["Cada página separada"],
      dica:"📄 Todas as páginas em fotos separadas, ou envie como PDF." }
  ]
}
function getDocumentosLista(area, tipo) {
  const chave = (tipo || area || "outros").toLowerCase()
  const extra = DOCS_EXTRA[chave] || [{ id:"doc_out", label:"Documentos do seu caso", folhas:["Cada documento separado"], dica:"📸 Envie os documentos relacionados ao seu caso." }]
  return chave === "revisao" ? extra : [...DOCS_BASE, ...extra]
}
function getDocumentos(area, tipo) {
  return getDocumentosLista(area, tipo).map(d => "- " + d.label).join("\n")
}

function getTelefoneContato(from, u) {
  if (u.telefoneEhDoCliente === false && u.whatsappContato) return u.whatsappContato
  return u.whatsappContato || from
}

function identificarEtapaAtual(u, payload) {
  const origem = payload?.perguntaId || u?.stage || ""

  if (ehStageDescricaoCaso(origem) || ehStageDescricaoCaso(u?.stage)) return "descricao_caso"
  if (["coleta_nome", "__coleta_nome_legado__", "coleta_tel_outro"].includes(origem) || ["coleta_nome", "__coleta_nome_legado__", "coleta_tel_outro"].includes(u?.stage)) return "nome"
  if (["coleta_cidade", "coleta_cidade_regiao", "__coleta_cidade_legado__"].includes(origem) || ["coleta_cidade", "coleta_cidade_regiao", "__coleta_cidade_legado__"].includes(u?.stage)) return "cidade"
  if (
    origem === "documentos" ||
    /documentos do caso/i.test(payload?.texto || "") ||
    (payload?.opcoes || []).some(o => ["docs_reenviar", "docs_maisFotos", "docs_proxdoc", "doc_cpf_skip"].includes(o.id))
  ) return "documentos"
  if (origem === STAGES.AREA || origem === "area") return "area"

  return origem || "pergunta"
}

function salvarEtapa(u, etapa) {
  if (!u) return etapa
  u.etapa = etapa === "inicio" ? "area" : etapa
  console.log("📍 Salvando etapa:", u.etapa)
  return u.etapa
}

function registrarUltimaPergunta(u, payload) {
  if (!u || !payload?.texto || payload.registrarPergunta === false) return
  if (u.stage === STAGES.RETOMADA_AUTOMATICA) return
  const deveSalvar = payload.opcoes?.length || payload.texto.includes("?") || u.stage !== "cliente"
  if (!deveSalvar) return
  u.lastPergunta = payload.perguntaId || u.stage || "pergunta"
  salvarEtapa(u, identificarEtapaAtual(u, payload))
  u.lastPerguntaPayload = { texto: payload.texto, opcoes: payload.opcoes || null }
}

function limparDadosCasoAtual(u, { preservarNome = true } = {}) {
  const nomePreservado = preservarNome && u.nomeConfirmado ? u.nome : null
  limparTimerIncentivoDescricao(u)
  Object.assign(u, {
    stage: "inicio",
    etapa: "inicio",
    nome: nomePreservado,
    regiao: null, cidade: null, uf: null,
    area: null, tipo: null, situacao: null, subTipo: null, detalhe: null,
    urgencia: "normal", semReceber: false,
    contribuicao: null, recebeBeneficio: null, descricao: null,
    negocioId: null, numeroCaso: null,
    pastaDriveId: null, pastaDriveLink: null,
    score: 0, documentosEnviados: false,
    docsEntregues: [], docAtualIdx: 0, ultimoArqId: null, ultimoArqNome: null,
    corrigirCampo: null, historiaIA: [],
    lastPergunta: null, lastPerguntaPayload: null,
    leadIncompletoCapturado: false,
    audiosDescCorrigidos: [],
    assuntoResumo: null,
    _ofereceuExplicarTudo: false,
    _sugestaoFluxo: null,
    _proximoStageAposDescricao: null,
    _proximaPerguntaAposDescricao: null,
    _entradaPendenteTipo: null, _entradaPendenteValor: null, _entradaPendenteOrigem: null,
    aguardandoRetomada: false,
    temCadastroCompleto: false,
    jaOfereceuRetomada: false,
    jaIncentivouDescricao: false,
    _retomadaEhLeadFrio: false,
    _regiao: null, _descTemp: null,
    _audioDescBuffer: null, _audioDescMime: null, _audioDescNome: null,
    _descOrigemStage: null,
    _audioFluxoTexto: null, _audioFluxoAcao: null, _audioFluxoResposta: null,
    _urgenteAudioBuffer: null, _urgenteAudioMime: null, _urgenteAudioNome: null, _urgenteAudioTexto: null,
    modoDigitando: false
  })
  agendarPersistenciaUsers()
}

function deveAtivarModoDigitando(payload) {
  const texto = String(payload?.texto || "").toLowerCase()
  if (!texto) return false
  return (
    texto.includes("me explique o que está acontecendo") ||
    texto.includes("me explique o que est") ||
    texto.includes("pode digitar ou enviar um áudio") ||
    texto.includes("pode digitar ou enviar um audio") ||
    texto.includes("digite sua mensagem ou envie um áudio agora") ||
    texto.includes("digite sua mensagem ou envie um audio agora") ||
    texto.includes("descreva brevemente")
  )
}

function enviarOpcoesPadrao(_from, modo = "documentos") {
  if (modo === "retorno_docs") {
    return [
      { id: "m_docs", title: "📎 Enviar documentos" },
      { id: "m_inicio", title: "Menu do cliente" },
      { id: "m_encerrar", title: "👋 Encerrar" }
    ]
  }
  return [
    { id: "docs_depois", title: "⏭️ Enviar depois" },
    { id: "m_inicio", title: "Menu do cliente" },
    { id: "m_encerrar", title: "👋 Encerrar" }
  ]
}

function formatarTelefoneExibicao(numero) {
  const n = String(numero || "").replace(/\D/g, "")
  if (n.length === 11) return `(${n.slice(0,2)}) ${n.slice(2,7)}-${n.slice(7)}`
  if (n.length === 10) return `(${n.slice(0,2)}) ${n.slice(2,6)}-${n.slice(6)}`
  return n
}

function limparTextoSomenteLetras(texto) {
  return String(texto || "")
    .replace(/[^A-Za-zÀ-ÿ\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function prepararConfirmacaoEntrada(from, u, tipo, valor, origem) {
  u._entradaPendenteTipo = tipo
  u._entradaPendenteValor = valor
  u._entradaPendenteOrigem = origem
  u.stage = STAGES.CONFIRMAR_ENTRADA
  iniciarTimer(from)
  const label = tipo === "telefone" ? formatarTelefoneExibicao(valor) : valor
  return {
    texto: `Você informou: ${label}\nEstá correto?`,
    opcoes: [
      { id: "entrada_ok", title: "✅ Confirmar" },
      { id: "entrada_corrigir", title: "✏️ Corrigir" }
    ]
  }
}

function limparEntradaPendente(u) {
  u._entradaPendenteTipo = null
  u._entradaPendenteValor = null
  u._entradaPendenteOrigem = null
}

function resetarSessaoAtendimento(u) {
  const base = novoUsuario(u.nomeWA || "Cliente")
  Object.assign(u, base)
  agendarPersistenciaUsers()
}

function responderEncerramento(u) {
  limparTimer(u)
  resetarSessaoAtendimento(u)
  return {
    texto: "Perfeito! Seu atendimento foi encerrado. Quando quiser, é só me chamar novamente 🙂",
    opcoes: null,
    registrarPergunta: false
  }
}

function encerrarAtendimento(u) {
  return responderEncerramento(u)
}

function stageAceitaTextoLivre(stage) {
  return new Set([
    "coleta_tel_outro",
    "coleta_tel_wpp",
    "coleta_tel_wpp_contato",
    "coleta_nome",
    "coleta_cidade_regiao",
    "coleta_cidade",
    "__coleta_nome_legado__",
    "__coleta_cidade_legado__",
    "trab_out_desc",
    "out_desc",
    STAGES.COLETA_DESC,
    STAGES.COLETA_DESC_AUDIO,
    STAGES.AGUARDANDO_URGENTE,
    STAGES.CORRIGIR_VALOR,
    STAGES.CONFIRMAR_ENTRADA
  ]).has(stage)
}

function getNomeAtualizado(u) {
  const nome = (u?.nome && String(u.nome).trim()) || (u?.nomeHubspot && String(u.nomeHubspot).trim()) || "cliente"
  return nome
}

function getPrimeiroNome(u) {
  return getNomeAtualizado(u).split(" ").filter(Boolean)[0] || "cliente"
}

function temLeadEmAberto(u) {
  return u?.negocioStageId === HS_STAGE.LEAD
}

function podeMostrarMenuCliente(u) {
  return Boolean(u?.numeroCaso) && !temLeadEmAberto(u)
}

function menuPrincipal(u) {
  const nome = getPrimeiroNome(u)
  return {
    texto: `Que bom te ver novamente, ${nome} 😊\nComo posso te ajudar hoje?`,
    opcoes: [
      { id: "area_inss", title: "🏥 INSS" },
      { id: "area_trab", title: "💼 Trabalhista" },
      { id: "area_outros", title: "📋 Outros" }
    ],
    perguntaId: "area"
  }
}

function telaArea(u = null) {
  return {
    texto: "⚖️ Bem-vindo à *Oraculum Advocacia*!\n\nMe chamo *Beatriz*, sou sua assistente virtual 😊\n\nComo posso te ajudar hoje?",
    opcoes: [
      { id: "area_inss", title: "🏥 INSS" },
      { id: "area_trab", title: "💼 Trabalhista" },
      { id: "area_outros", title: "📋 Outros" }
    ]
  }
}

function avancarAposTelefoneConfirmado(from, u) {
  if (u.nomeConfirmado && u.nome) {
    u.stage = "coleta_regiao"
    iniciarTimer(from)
    return telaRegioes()
  }
  u.stage = "coleta_nome"
  u.etapa = "nome"
  iniciarTimer(from)
  return { texto: "✍️ Qual é o seu *nome completo*?", opcoes: null }
}

function retomarUltimaPergunta(u) {
  if (u.stage === STAGES.RETOMADA_AUTOMATICA) return null
  if (u.lastPerguntaPayload) return u.lastPerguntaPayload
  return null
}

function perguntarNome(u) {
  u.stage = "coleta_nome"
  u.etapa = "nome"
  return { texto: "âœï¸ Qual Ã© o seu *nome completo*?", opcoes: null }
}

function perguntarCidade(u, stage = null) {
  const stageCidade = stage || (u?._regiao || u?.uf ? "coleta_cidade_regiao" : "coleta_cidade")
  u.stage = stageCidade
  u.etapa = "cidade"
  if (stageCidade === "coleta_cidade_regiao") {
    return { texto: "Digite a cidade onde vocÃª mora", opcoes: null }
  }
  return { texto: "ðŸ“ Em qual *cidade* vocÃª mora?", opcoes: null }
}

function perguntarDescricao(u, stage = STAGES.COLETA_DESC_AUDIO) {
  entrarEtapaDescricao(u, stage)
  return telaDescreverCaso()
}

function perguntarDocumentos(u) {
  u.etapa = "documentos"
  return telaEnvioDoc(u)
}

function retomarFluxo(u) {
  const etapa = u.etapa || u.lastPergunta || u.stage || STAGES.AREA
  console.log("🔁 Retomando etapa:", etapa)

  if (!u.etapa || u.etapa === "inicio") {
    console.log("🔁 Etapa inválida/inicio → redirecionando para área")
    u.stage = STAGES.AREA
    salvarEtapa(u, "area")
    return menuPrincipal(u)
  }

  switch (etapa) {
    case STAGES.AREA:
    case "area":
      u.stage = STAGES.AREA
      return { ...telaArea(), perguntaId: "area" }
    case "coleta_nome":
      u.stage = "coleta_nome"
      return { texto: "✍️ Qual é o seu *nome completo*?", opcoes: null }
    case "coleta_regiao":
      u.stage = "coleta_regiao"
      return telaRegioes()
    case "coleta_uf":
      u.stage = "coleta_uf"
      return telaUFsRegiao(u._regiao || "reg_n")
    case "coleta_cidade_regiao":
    case "coleta_cidade":
      u.stage = etapa
      return { texto: "Digite a cidade onde você mora", opcoes: null }
    case "coleta_contrib":
    case "coleta_contrib_regiao":
    case "coleta_contrib_regiao_v2":
      u.stage = etapa
      return {
        texto: "Selecione uma opção:",
        opcoes: [
          { id: "col_c1", title: "Nunca" },
          { id: "col_c2", title: "Pouco tempo" },
          { id: "col_c3", title: "Mais de 1 ano" },
          { id: "col_c4", title: "Muitos anos" }
        ]
      }
    case "__coleta_benef_regiao_v2__":
    case "coleta_benef":
      u.stage = etapa
      return {
        texto: "Você já recebe algum benefício do INSS?",
        opcoes: [
          { id: "col_b1", title: "Sim" },
          { id: "col_b2", title: "Não" }
        ]
      }
    case STAGES.COLETA_DESC:
    case STAGES.COLETA_DESC_AUDIO:
    case "descricao_caso":
    case "trab_out_desc":
    case "out_desc":
      entrarEtapaDescricao(u, ehStageDescricaoCaso(u.stage) ? u.stage : STAGES.COLETA_DESC_AUDIO)
      return telaDescreverCaso()
    case STAGES.DESC_CONFIRMA:
      u.stage = STAGES.DESC_CONFIRMA
      if (!u._descTemp) return telaDescreverCaso()
      return {
        texto: `Entendi assim:\n\n"${u._descTemp}"\n\nEstá correto?`,
        opcoes: [
          { id: "desc_ok", title: "✅ Confirmar" },
          { id: "desc_corrigir", title: "✏️ Corrigir" }
        ]
      }
    case STAGES.CONFIRMACAO:
      u.stage = STAGES.CONFIRMACAO
      return tela_confirmacao(u)
    case STAGES.CLIENTE:
    case "cliente":
      u.stage = STAGES.CLIENTE
      return menuCliente(u)
    default: {
      const ultimaPergunta = retomarUltimaPergunta(u)
      if (ultimaPergunta) {
        u.stage = etapa
        return ultimaPergunta
      }
      if (u.numeroCaso) {
        u.stage = STAGES.CLIENTE
        return menuCliente(u)
      }
      u.stage = STAGES.AREA
      return { ...telaArea(), perguntaId: "area" }
    }
  }
}

function perguntarNome(u) {
  u.stage = "coleta_nome"
  salvarEtapa(u, "nome")
  return { texto: "✍️ Qual é o seu *nome completo*?", opcoes: null }
}

function perguntarCidade(u, stage = null) {
  const stageCidade = stage || (u?._regiao || u?.uf ? "coleta_cidade_regiao" : "coleta_cidade")
  u.stage = stageCidade
  salvarEtapa(u, "cidade")
  if (stageCidade === "coleta_cidade_regiao") {
    return { texto: "Digite a cidade onde você mora", opcoes: null }
  }
  return { texto: "📍 Em qual *cidade* você mora?", opcoes: null }
}

function perguntarDescricao(u, stage = STAGES.COLETA_DESC_AUDIO) {
  entrarEtapaDescricao(u, stage)
  salvarEtapa(u, "descricao_caso")
  return telaDescreverCaso()
}

function perguntarDocumentos(u) {
  salvarEtapa(u, "documentos")
  return telaEnvioDoc(u)
}

function respostaRecomecoMenuPrincipal(u) {
  const tela = menuPrincipal(u)
  return {
    ...tela,
    texto: "Perfeito 😊 então vamos recomeçar.\n\nEscolha uma área que melhor define sua situação 👇"
  }
}

function retomarFluxo(u) {
  const etapa = u.etapa || u.lastPergunta || u.stage || STAGES.AREA
  console.log("🔁 Retomando etapa:", etapa)

  if (!u.etapa || u.etapa === "inicio") {
    console.log("🔁 Etapa inválida/inicio → redirecionando para área")
    u.stage = STAGES.AREA
    salvarEtapa(u, "area")
    return menuPrincipal(u)
  }

  switch (etapa) {
    case STAGES.AREA:
    case "area":
      u.stage = STAGES.AREA
      salvarEtapa(u, "area")
      return menuPrincipal(u)
    case "nome":
    case "coleta_nome":
      return perguntarNome(u)
    case "cidade":
      return perguntarCidade(u)
    case "coleta_regiao":
      u.stage = "coleta_regiao"
      return telaRegioes()
    case "coleta_uf":
      u.stage = "coleta_uf"
      return telaUFsRegiao(u._regiao || "reg_n")
    case "coleta_cidade_regiao":
    case "coleta_cidade":
      return perguntarCidade(u, etapa)
    case "coleta_contrib":
    case "coleta_contrib_regiao":
    case "coleta_contrib_regiao_v2":
      u.stage = etapa
      return {
        texto: "Selecione uma opção:",
        opcoes: [
          { id: "col_c1", title: "Nunca" },
          { id: "col_c2", title: "Pouco tempo" },
          { id: "col_c3", title: "Mais de 1 ano" },
          { id: "col_c4", title: "Muitos anos" }
        ]
      }
    case "__coleta_benef_regiao_v2__":
    case "coleta_benef":
      u.stage = etapa
      return {
        texto: "Você já recebe algum benefício do INSS?",
        opcoes: [
          { id: "col_b1", title: "Sim" },
          { id: "col_b2", title: "Não" }
        ]
      }
    case STAGES.COLETA_DESC:
    case STAGES.COLETA_DESC_AUDIO:
    case "descricao_caso":
    case "trab_out_desc":
    case "out_desc":
      return perguntarDescricao(u, ehStageDescricaoCaso(u.stage) ? u.stage : STAGES.COLETA_DESC_AUDIO)
    case "documentos":
      return perguntarDocumentos(u)
    case STAGES.DESC_CONFIRMA:
      u.stage = STAGES.DESC_CONFIRMA
      salvarEtapa(u, "descricao_caso")
      if (!u._descTemp) return telaDescreverCaso()
      return {
        texto: `Entendi assim:\n\n"${u._descTemp}"\n\nEstá correto?`,
        opcoes: [
          { id: "desc_ok", title: "✅ Confirmar" },
          { id: "desc_corrigir", title: "✏️ Corrigir" }
        ]
      }
    case STAGES.CONFIRMACAO:
      u.stage = STAGES.CONFIRMACAO
      return tela_confirmacao(u)
    case STAGES.CLIENTE:
    case "cliente":
      if (!podeMostrarMenuCliente(u)) {
        u.stage = STAGES.AREA
        salvarEtapa(u, "area")
        return menuPrincipal(u)
      }
      u.stage = STAGES.CLIENTE
      return menuCliente(u)
    default: {
      console.log("⚠️ Etapa inválida:", etapa)
      const ultimaPergunta = retomarUltimaPergunta(u)
      if (ultimaPergunta) return ultimaPergunta
      u.stage = STAGES.AREA
      salvarEtapa(u, "area")
      return respostaRecomecoMenuPrincipal(u)
    }
  }
}

function pularDescricaoPorAgora(from, u) {
  u.jaIncentivouDescricao = true
  salvarEtapa(u, "descricao_caso")
  u._descTemp = null
  u._audioDescBuffer = null
  u._audioDescMime = null
  u._audioDescNome = null

  if (u._descOrigemStage === "trab_out_desc" || u._descOrigemStage === "out_desc" || u.stage === "trab_out_desc" || u.stage === "out_desc") {
    u._descOrigemStage = null
    u.stage = "gatilho"
    iniciarTimer(from)
    return {
      texto: "Sem problemas 😊 podemos continuar e você envia depois",
      opcoes: [{ id: "cont", title: "▶️ Continuar" }]
    }
  }

  if (u._proximoStageAposDescricao) {
    const proximoStage = u._proximoStageAposDescricao
    const proximaPergunta = u._proximaPerguntaAposDescricao
    u._proximoStageAposDescricao = null
    u._proximaPerguntaAposDescricao = null
    u._descOrigemStage = null
    u.stage = proximoStage
    iniciarTimer(from)
    if (proximoStage === STAGES.CONFIRMACAO) {
      const tela = tela_confirmacao(u)
      return { texto: `Sem problemas 😊 podemos continuar e você envia depois\n\n${tela.texto}`, opcoes: tela.opcoes }
    }
    if (proximaPergunta) {
      return { texto: `Sem problemas 😊 podemos continuar e você envia depois\n\n${proximaPergunta.texto}`, opcoes: proximaPergunta.opcoes || null }
    }
  }

  u._descOrigemStage = null
  u.stage = STAGES.CONFIRMACAO
  iniciarTimer(from)
  return {
    texto: "Sem problemas 😊 podemos continuar e você envia depois",
    opcoes: [{ id: "cont", title: "▶️ Continuar" }]
  }
}

function deveCapturarLeadIncompleto(u) {
  if (u?.leadIncompletoCapturado) return false
  if (u?.numeroCaso) return false
  return true
}

function pularDescricaoPorAgora(from, u) {
  u.jaIncentivouDescricao = true
  u.etapa = "descricao_caso"
  u._descTemp = null
  u._audioDescBuffer = null
  u._audioDescMime = null
  u._audioDescNome = null

  if (u._descOrigemStage === "trab_out_desc" || u._descOrigemStage === "out_desc" || u.stage === "trab_out_desc" || u.stage === "out_desc") {
    u._descOrigemStage = null
    u.stage = "gatilho"
    iniciarTimer(from)
    return {
      texto: "Sem problemas 😊 podemos continuar e você envia depois",
      opcoes: [{ id: "cont", title: "▶️ Continuar" }]
    }
  }

  if (u._proximoStageAposDescricao) {
    const proximoStage = u._proximoStageAposDescricao
    const proximaPergunta = u._proximaPerguntaAposDescricao
    u._proximoStageAposDescricao = null
    u._proximaPerguntaAposDescricao = null
    u._descOrigemStage = null
    u.stage = proximoStage
    iniciarTimer(from)
    if (proximoStage === STAGES.CONFIRMACAO) {
      const tela = tela_confirmacao(u)
      return { texto: `Sem problemas 😊 podemos continuar e você envia depois\n\n${tela.texto}`, opcoes: tela.opcoes }
    }
    if (proximaPergunta) {
      return { texto: `Sem problemas 😊 podemos continuar e você envia depois\n\n${proximaPergunta.texto}`, opcoes: proximaPergunta.opcoes || null }
    }
  }

  u._descOrigemStage = null
  u.stage = STAGES.CONFIRMACAO
  iniciarTimer(from)
  const tela = tela_confirmacao(u)
  return { texto: `Sem problemas 😊 podemos continuar e você envia depois\n\n${tela.texto}`, opcoes: tela.opcoes }
}

function ehStageDescricaoCaso(stage) {
  return [STAGES.COLETA_DESC, STAGES.COLETA_DESC_AUDIO, "trab_out_desc", "out_desc"].includes(stage)
}

function entrarEtapaDescricao(u, stage = STAGES.COLETA_DESC_AUDIO) {
  u.stage = stage
  u.etapa = "descricao_caso"
  u.jaIncentivouDescricao = false
}

function limparTimer(u) {
  if (u.timer) { clearTimeout(u.timer); u.timer = null }
}

function limparTimerIncentivoDescricao(u) {
  if (u?.timerIncentivoDescricao) {
    clearTimeout(u.timerIncentivoDescricao)
    u.timerIncentivoDescricao = null
  }
}

function agendarIncentivoDescricao(from) {
  const u = users[from]
  if (!u) return

  limparTimerIncentivoDescricao(u)

  if (u.etapa !== "descricao_caso") return
  if (!ehStageDescricaoCaso(u.stage)) return
  if (u.jaIncentivouDescricao) return

  const ultimaMsgBase = Number(u.ultimaMsg || 0)
  const espera = u.modoDigitando ? 3 * 60 * 1000 : 2 * 60 * 1000

  u.timerIncentivoDescricao = setTimeout(async () => {
    const atual = users[from]
    if (!atual) return
    if (atual.etapa !== "descricao_caso") return
    if (!ehStageDescricaoCaso(atual.stage)) return
    if (atual.jaIncentivouDescricao) return
    if (Number(atual.ultimaMsg || 0) !== ultimaMsgBase) return

    atual.jaIncentivouDescricao = true
    atual.timerIncentivoDescricao = null
    agendarPersistenciaUsers()

    await enviar(
      from,
      "Posso te ajudar nisso 😊\nSe preferir, pode mandar um áudio ou escrever do seu jeito.\n\nQuer continuar agora ou prefere fazer isso depois?",
      [
        { id: "desc_incentivo_continuar", title: "Continuar agora" },
        { id: "desc_incentivo_depois", title: "Enviar depois" },
        { id: "desc_incentivo_menu", title: "Menu principal" },
        { id: "desc_incentivo_encerrar", title: "Encerrar" }
      ],
      false
    )
  }, espera)
}

function iniciarTimer(from) {
  const u = users[from]
  if (!u) return
  limparTimer(u)
  agendarIncentivoDescricao(from)
  // Se cliente está gravando áudio ou descrevendo o caso, dar mais tempo antes de interromper
  const estaDescrevendo = u.stage === "coleta_desc_audio" || u.stage === "coleta_desc"
  const t1Base = estaDescrevendo ? 5 * 60 * 1000 : 5 * 60 * 1000
  const t1 = t1Base + (u.modoDigitando ? 3 * 60 * 1000 : 0)
  u.timer = setTimeout(async () => {
    if (!users[from]) return
    if (u.modoDigitando) {
      console.log("Usuário em modo digitação, não interromper")
      u.modoDigitando = false
      iniciarTimer(from)
      return
    }
    await enviar(from, "Oi 😊, fiquei te esperando.\nQuer continuar de onde parou ou recomeçar?\n\n• Continuar\n• Recomeçar\n• Encerrar", [
      { id: "cont_retomar", title: "Continuar" },
      { id: "recomecar", title: "Recomeçar" },
      { id: "m_encerrar", title: "Encerrar" }
    ], false)
    u.aguardandoRetomada = true
    u.timer = setTimeout(async () => {
      if (!users[from]) return
      if (u.modoDigitando) {
        console.log("Usuário ainda marcado em modo digitação no abandono final, seguindo com captura:", from)
        u.modoDigitando = false
      }
      u.aguardandoRetomada = false
      await enviar(from, "Vou pausar por agora, tudo bem? Quando quiser, é só me chamar por aqui. 😊", null, false)
      await capturarLeadIncompleto(from, u)
      limparDadosCasoAtual(u)
      agendarPersistenciaUsers()
    }, 5 * 60 * 1000)
  }, t1)
}

function restaurarTimersPersistidos() {
  const agora = Date.now()
  for (const [from, u] of Object.entries(users)) {
    if (!u || !u.stage || u.stage === STAGES.INICIO) continue
    const ultimaMsg = Number(u.ultimaMsg || 0)
    if (!ultimaMsg || agora - ultimaMsg > 30 * 60 * 1000) continue
    iniciarTimer(from)
  }
}

const HS = () => ({ Authorization: `Bearer ${HUBSPOT_TOKEN}`, "Content-Type": "application/json" })
const hubspotClient = {
  crm: {
    deals: {
      basicApi: {
        update: async (dealId, body) => {
          const stageId = body?.properties?.dealstage
          console.log("Mudando etapa para:", stageId)
          return axios.patch(
            `https://api.hubapi.com/crm/v3/objects/deals/${dealId}`,
            body,
            { headers: HS() }
          )
        }
      }
    }
  }
}

async function hsBuscarPorPhone(phone) {
  try {
    const res = await axios.post(
      "https://api.hubapi.com/crm/v3/objects/contacts/search",
      {
        filterGroups: [{ filters: [{ propertyName: "phone", operator: "EQ", value: phone }] }],
        properties: ["firstname", "numero_caso", "area_juridica"]
      },
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

async function hsAtualizarContato(contactId, props = {}) {
  if (!contactId) return null
  try {
    await axios.patch(
      `https://api.hubapi.com/crm/v3/objects/contacts/${contactId}`,
      { properties: props },
      { headers: HS() }
    )
    return contactId
  } catch (e) {
    logErro("hubspot", "atualizarContato: " + (e.response?.data?.message || e.message))
    return null
  }
}

async function hsCriarNegocio(u) {
  try {
    const opts = arguments[1] || {}
    const stage = opts.stage || HS_STAGE.LEAD
    const dealname = opts.dealname || `${u.nome} — ${u.area} — ${u.numeroCaso}`
    const res = await axios.post(
      "https://api.hubapi.com/crm/v3/objects/deals",
      { properties: { dealname, pipeline: HS_PIPELINE, dealstage: stage } },
      { headers: HS() }
    )
    return res.data.id
  } catch (e) { logErro("hubspot", "criarNegocio: " + (e.response?.data?.message || e.message)); return null }
}

async function hsCriarNegocio(u) {
  try {
    const opts = arguments[1] || {}
    const stage = opts.stage || HS_STAGE.LEAD
    const nomeCliente = u.nome || u.nomeWA || "Cliente"
    const dealname = opts.dealname || `${nomeCliente} - ${u.area || "Atendimento"}${u.numeroCaso ? " - " + u.numeroCaso : ""}`
    const properties = {
      dealname,
      pipeline: HS_PIPELINE,
      dealstage: stage,
      hubspot_owner_id: "90513737",
      area_juridica: u.area || "",
      resumo_cliente: u.assuntoResumo || u.descricao || "",
      descricao_completa: u.descricao || u.assuntoResumo || "",
      urgencia: u.urgencia || "normal",
      cidade: u.cidade || "",
      pasta_drive: u.pastaDriveLink || "",
      origem_atendimento: "whatsapp"
    }
    const res = await axios.post(
      "https://api.hubapi.com/crm/v3/objects/deals",
      { properties },
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

// Estágios considerados "finalizados" no HubSpot — negócios nesses estágios são ignorados
function filtrarPropsHubSpot(props = {}) {
  return Object.fromEntries(
    Object.entries(props).filter(([, value]) => {
      if (value === null || value === undefined) return false
      if (typeof value === "string" && !value.trim()) return false
      return true
    })
  )
}

async function hsAtualizarContato(contactId, props = {}) {
  const propsValidas = filtrarPropsHubSpot(props)
  if (!contactId || !Object.keys(propsValidas).length) return null
  try {
    await axios.patch(
      `https://api.hubapi.com/crm/v3/objects/contacts/${contactId}`,
      { properties: propsValidas },
      { headers: HS() }
    )
    return contactId
  } catch (e) {
    logErro("hubspot", "atualizarContato: " + (e.response?.data?.message || e.message))
    return null
  }
}

async function hsAtualizarNegocio(dealId, props = {}) {
  const propsValidas = filtrarPropsHubSpot(props)
  if (!dealId || !Object.keys(propsValidas).length) return null
  try {
    await axios.patch(
      `https://api.hubapi.com/crm/v3/objects/deals/${dealId}`,
      { properties: propsValidas },
      { headers: HS() }
    )
    return dealId
  } catch (e) {
    logErro("hubspot", "atualizarNegocio: " + (e.response?.data?.message || e.message))
    return null
  }
}

async function sincronizarContatoNegocioHubSpot(u) {
  if (!u) return
  if (typeof u.nome === "string" && u.nome.trim()) u.nomeHubspot = u.nome.trim()

  const contatoProps = filtrarPropsHubSpot({
    firstname: u.nome,
    city: u.cidade
  })

  if (u.contatoId && Object.keys(contatoProps).length) {
    await hsAtualizarContato(u.contatoId, contatoProps)
  }

  if (u.negocioId && typeof u.nome === "string" && u.nome.trim()) {
    await hsAtualizarNegocio(u.negocioId, {
      dealname: `Lead WhatsApp - ${u.nome.trim()}`
    })
  }
}

const HS_STAGES_FINALIZADOS = new Set([HS_STAGE.FINAL])

async function hsBuscarNegociosDoContato(contactId) {
  try {
    const res = await axios.get(
      `https://api.hubapi.com/crm/v3/objects/contacts/${contactId}/associations/deals`,
      { headers: HS() }
    )
    const dealIds = (res.data?.results || []).map(r => r.id)
    return dealIds
  } catch (e) {
    logErro("hubspot", "buscarNegociosDoContato: " + (e.response?.data?.message || e.message))
    return []
  }
}

async function hsBuscarNegocioAbertoDoContato(contactId) {
  const negocio = await hsBuscarNegocioAbertoInfoDoContato(contactId)
  return negocio?.id || null
}

async function hsBuscarNegocioAbertoInfoDoContato(contactId) {
  try {
    const dealIds = await hsBuscarNegociosDoContato(contactId)
    if (!dealIds.length) return null

    for (const dealId of dealIds) {
      try {
        const res = await axios.get(
          `https://api.hubapi.com/crm/v3/objects/deals/${dealId}?properties=dealstage,dealname,closedate`,
          { headers: HS() }
        )
        const stage = res.data?.properties?.dealstage
        if (stage && !HS_STAGES_FINALIZADOS.has(stage)) {
          console.log("Negócio existente encontrado:", dealId)
          return {
            id: dealId,
            stageId: stage,
            dealname: res.data?.properties?.dealname || null
          }
        }
      } catch {}
    }
    return null
  } catch (e) {
    logErro("hubspot", "buscarNegocioAberto: " + (e.response?.data?.message || e.message))
    return null
  }
}

async function hsAtualizarEtapaNegocio(dealId, stageId) {
  if (!dealId) return
  try {
    await hubspotClient.crm.deals.basicApi.update(dealId, {
      properties: { dealstage: stageId }
    })
  } catch (e) { logErro("hubspot", "atualizarEtapaNegocio: " + (e.response?.data?.message || e.message)) }
}

async function hsMoverStage(nId, stage) {
  if (!nId) return
  return hsAtualizarEtapaNegocio(nId, stage)
}

function detalharErroHubspot(e) {
  return JSON.stringify({
    message: e?.message || null,
    status: e?.response?.status || null,
    data: e?.response?.data || null,
    stack: e?.stack || null
  })
}

async function capturarLeadIncompleto(from, u) {
  try {
    console.log("🔥 INICIO captura:", from)
    const sessao = u || users[from] || null
    console.log("Sessão encontrada?", !!sessao)

    if (!sessao) {
      console.log("⚠️ Sem sessão ativa, seguindo captura com fallback pelo telefone")
    }

    if (sessao && !deveCapturarLeadIncompleto(sessao)) {
      if (sessao.leadIncompletoCapturado) console.log("❌ Lead já capturado anteriormente, abortando captura")
      if (sessao.numeroCaso) console.log("❌ Sessão já possui número de caso, abortando captura")
      return null
    }

    const lead = sessao || {
      nome: null,
      nomeWA: null,
      area: null,
      numeroCaso: null,
      pastaDriveLink: null,
      contatoId: null,
      negocioId: null,
      stage: "sem_sessao"
    }

    const telefone = getTelefoneContato(from, lead)
    const nome = lead.nome || lead.nomeWA || "Lead WhatsApp"
    const area = lead.area || "Atendimento inicial"
    console.log("📌 Criando lead com nome:", nome, "telefone:", from)
    let contatoId = lead.contatoId || null
    let negocioId = null

    if (!contatoId) {
      console.log("➡️ Indo criar contato...")
      console.log("Criando contato...")
      let existente = null
      try {
        existente = await hsBuscarPorPhone(telefone)
      } catch (e) {
        console.error("Erro ao buscar contato no HubSpot:", detalharErroHubspot(e))
      }
      if (existente?.properties?.firstname && !lead.nomeHubspot) lead.nomeHubspot = existente.properties.firstname
      contatoId = existente?.id || null
    } else {
      console.log("Contato já vinculado na sessão:", contatoId)
    }

    if (!contatoId) {
      try {
        contatoId = await hsCriarContato(telefone, {
          ...lead,
          nome,
          area,
          numeroCaso: null,
          pastaDriveLink: null
        })
      } catch (e) {
        console.error("Erro ao criar contato no HubSpot:", detalharErroHubspot(e))
        throw e
      }
    } else {
      console.log("Contato reutilizado:", contatoId)
      await hsAtualizarContato(contatoId, { firstname: nome, phone: telefone })
    }
    if (sessao) sessao.contatoId = contatoId

    if (contatoId) {
      try {
        negocioId = await hsBuscarNegocioAbertoDoContato(contatoId)
      } catch (e) {
        console.error("Erro ao buscar negócio aberto no HubSpot:", detalharErroHubspot(e))
      }
    }

    if (!negocioId && lead.negocioId) {
      console.log("Negócio presente na sessão sem confirmação no HubSpot, recriando:", lead.negocioId)
    }

    if (!negocioId) {
      console.log("➡️ Indo criar negócio...")
      console.log("Criando negócio...")
      try {
        negocioId = await hsCriarNegocio({
          ...lead,
          nome,
          area,
          numeroCaso: "LEAD-INCOMPLETO"
        }, {
          stage: HS_STAGE.LEAD,
          dealname: `Lead WhatsApp - ${nome}`
        })
      } catch (e) {
        console.error("Erro ao criar negócio no HubSpot:", detalharErroHubspot(e))
        throw e
      }
    } else {
      console.log("Negócio reutilizado:", negocioId)
    }
    if (sessao) sessao.negocioId = negocioId || null

    if (contatoId && negocioId) {
      await hsAssociar(contatoId, negocioId)
      await hsCriarNota(
        contatoId,
        "LEAD INCOMPLETO",
        `Lead capturado por inatividade.\nNome: ${nome}\nTelefone: ${telefone}\nÁrea: ${lead.area || "Não informada"}\nStage interno: ${lead.stage}`
      )
    } else {
      console.log("Captura incompleta no HubSpot:", { contatoId, negocioId, from })
    }

    if (sessao) sessao.leadIncompletoCapturado = true
    return { contatoId, negocioId }
  } catch (err) {
    console.log("❌ ERRO capturaLead:", err.response?.data || err.message || err)
    console.error("Erro completo em capturarLeadIncompleto:", detalharErroHubspot(err))
    logErro("hubspot", "capturarLeadIncompleto: " + (err.response?.data?.message || err.message))
    return null
  }
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

// IDs das subpastas por área — crie estas pastas no Drive e coloque os IDs no .env
// DRIVE_ID_INSS, DRIVE_ID_TRAB, DRIVE_ID_OUTROS
// Se não configurados, usa a pasta raiz de clientes
function escapeDriveQueryValue(value) {
  return String(value || "").replace(/\\/g, "\\\\").replace(/'/g, "\\'")
}

function getNomePastaArea(area, situacao, tipo) {
  if (area === "INSS") return "Previdenciário"
  if (area === "Trabalhista") return "Trabalhista"
  if (situacao === "Consultoria juridica") return "Consulta Jurídica"
  if (situacao === "Revisao de documentos" || tipo === "revisao") return "Revisão de documentos"
  return "Outros"
}

async function obterOuCriarPastaArea(area, situacao, tipo) {
  const drive = getDrive()
  const nomeArea = getNomePastaArea(area, situacao, tipo)
  const query = [
    "mimeType = 'application/vnd.google-apps.folder'",
    `name = '${escapeDriveQueryValue(nomeArea)}'`,
    `'${DRIVE_PASTA_CLIENTES_ID}' in parents`,
    "trashed = false"
  ].join(" and ")

  const existentes = await drive.files.list({
    q: query,
    fields: "files(id,name,webViewLink)",
    pageSize: 1
  })

  if (existentes.data.files?.length) return existentes.data.files[0]

  const criada = await drive.files.create({
    requestBody: {
      name: nomeArea,
      mimeType: "application/vnd.google-apps.folder",
      parents: [DRIVE_PASTA_CLIENTES_ID]
    },
    fields: "id,name,webViewLink"
  })

  console.log(`[DRIVE] Pasta da area criada: ${criada.data.name}`)
  return criada.data
}

async function criarPastaCliente(numeroCaso, nome, area, situacao, tipo) {
  try {
    const nomeArea = getNomePastaArea(area, situacao, tipo)
    const pastaArea = await obterOuCriarPastaArea(area, situacao, tipo)
    const pastaAreaId = pastaArea?.id || DRIVE_PASTA_CLIENTES_ID
    const res = await getDrive().files.create({
      requestBody: { name: `${numeroCaso} - ${nome}`, mimeType: "application/vnd.google-apps.folder", parents: [pastaAreaId] },
      fields: "id,name,webViewLink"
    })
    console.log(`[DRIVE] Pasta criada: ${res.data.name} (área: ${nomeArea})`)
    return res.data
  } catch (e) { logErro("drive", "criarPasta: " + e.message); return null }
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
    await tornarArquivoPublicoDrive(res.data.id)
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

async function tornarArquivoPublicoDrive(fileId) {
  if (!fileId) return null
  const drive = getDrive()
  await drive.permissions.create({
    fileId,
    requestBody: {
      role: "reader",
      type: "anyone"
    }
  })
  return `https://drive.google.com/uc?export=download&id=${fileId}`
}

async function transcrever(buffer, mimeType, contexto = {}) {
  try {
    console.log(`[ASSEMBLYAI] Iniciando transcricao | origem=${contexto.origem || "desconhecida"} | mime=${mimeType || "nao informado"} | bytes=${buffer?.length || 0}`)
    const up = await axios.post(
      "https://api.assemblyai.com/v2/upload",
      buffer,
      { headers: { authorization: ASSEMBLYAI_KEY, "content-type": "application/octet-stream" } }
    )
    const tr = await axios.post(
      "https://api.assemblyai.com/v2/transcript",
      { audio_url: up.data.upload_url, language_code: "pt", speech_models: ["universal-2"] },
      { headers: { authorization: ASSEMBLYAI_KEY } }
    )
    for (let i = 0; i < 18; i++) {
      await new Promise(r => setTimeout(r, 5000))
      const p = await axios.get(`https://api.assemblyai.com/v2/transcript/${tr.data.id}`, { headers: { authorization: ASSEMBLYAI_KEY } })
      console.log(`[ASSEMBLYAI] Poll ${i + 1}/18 | status=${p.data.status}`)
      if (p.data.status === "completed") return p.data.text || ""
      if (p.data.status === "error") {
        logErro("assemblyai", `transcript error: ${p.data.error || "sem detalhe"}`)
        return null
      }
    }
    logErro("assemblyai", "transcricao expirou aguardando processamento")
    return null
  } catch (e) {
    logErro("assemblyai", `HTTP ${e.response?.status || "sem_status"}: ${e.response?.data?.error || e.response?.data?.message || e.message}`)
    return null
  }
}

async function respostaIA(u, pergunta) {
  if (!GROQ_KEY) return null
  try {
    const sistema = `Você é Beatriz, assistente virtual da Oraculum Advocacia. Responda dúvidas jurídicas de forma clara e acessível para leigos. Áreas: INSS, Trabalhista, Família, Cível. Nunca prometa resultados. Seja objetiva e empática. Dados do cliente: Área: ${u.area || "não informado"} | Caso: ${u.numeroCaso || "não cadastrado"}.`
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
  if (!fileId) return
  try { await getDrive().files.delete({ fileId }); console.log(`[DRIVE] Excluído: ${fileId}`) }
  catch (e) { logErro("drive", "excluir: " + e.message) }
}

async function excluirPastaDriveSeVazia(folderId) {
  if (!folderId) return
  try {
    const drive = getDrive()
    const res = await drive.files.list({
      q: `'${folderId}' in parents and trashed = false`,
      fields: "files(id)",
      pageSize: 1
    })
    if (res.data.files?.length) return
    await drive.files.delete({ fileId: folderId })
    console.log(`[DRIVE] Pasta temporária excluída: ${folderId}`)
  } catch (e) {
    logErro("drive", "excluirPastaVazia: " + e.message)
  }
}

async function uploadPastaAudio(pastaDriveId, nomeCliente, nomePasta, buffer, mimeType) {
  // Cria subpasta "Áudios - <nomePasta>" dentro da pasta do cliente
  try {
    const drive = getDrive()
    const pasta = await drive.files.create({
      requestBody: { name: `Áudios - ${nomePasta}`, mimeType: "application/vnd.google-apps.folder", parents: [pastaDriveId] },
      fields: "id"
    })
    const ext = mimeType?.includes("ogg") ? ".ogg" : mimeType?.includes("mpeg") ? ".mp3" : ".ogg"
    const nomeArq = `Audio - ${nomeCliente}${ext}`
    const fs = require("fs"), path = require("path"), os = require("os")
    const tmp = path.join(os.tmpdir(), `orac_audio_${Date.now()}`)
    fs.writeFileSync(tmp, buffer)
    const res = await drive.files.create({
      requestBody: { name: nomeArq, parents: [pasta.data.id] },
      media: { mimeType: mimeType || "audio/ogg", body: fs.createReadStream(tmp) },
      fields: "id,name,webViewLink"
    })
    try { fs.unlinkSync(tmp) } catch {}
    const directDownloadUrl = await tornarArquivoPublicoDrive(res.data.id)
    console.log(`[DRIVE] Áudio: ${res.data.name}`)
    return { ...res.data, directDownloadUrl, folderId: pasta.data.id }
  } catch (e) { logErro("drive", "uploadAudio: " + e.message); return null }
}

async function salvarAudioTranscritoNoCaso(u, nomeCliente, buffer, mimeType, status) {
  if (!u?.pastaDriveId || !buffer) return null
  const nomePasta = status === "corrigido" ? "Áudios Transcritos Corrigidos" : "Áudios Transcritos Confirmados"
  return uploadPastaAudio(u.pastaDriveId, nomeCliente || "cliente", nomePasta, buffer, mimeType)
}

async function baixarMidia(mediaId) {
  try {
    const info = await axios.get(`https://graph.facebook.com/v19.0/${mediaId}`, { headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}` } })
    const file = await axios.get(info.data.url, { headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}` }, responseType: "arraybuffer" })
    const buffer = Buffer.from(file.data)
    console.log(`[WHATSAPP] Midia baixada | mime=${info.data.mime_type || "application/octet-stream"} | bytes=${buffer.length}`)
    return { buffer, mimeType: info.data.mime_type || "application/octet-stream" }
  } catch (e) { logErro("whatsapp", "baixarMidia: " + e.message); return null }
}

async function digitando(to) {
  try {
    await axios.post(`https://graph.facebook.com/v19.0/${PHONE_NUMBER_ID}/messages`,
      { messaging_product:"whatsapp", to, type:"text", text:{ body:"..." } },
      { headers:{ Authorization:`Bearer ${WHATSAPP_TOKEN}`, "Content-Type":"application/json" } })
  } catch {}
  await new Promise(r => setTimeout(r, 3200))
}

function normalizarTituloOpcaoWhatsApp(title, maxChars) {
  let texto = String(title || "").trim()
  texto = texto
    .replace(/\p{Extended_Pictographic}/gu, "")
    .replace(/[\u200D\uFE0F]/g, "")
    .replace(/[•·]/g, " ")
    .replace(/\*/g, "")
    .replace(/\s+/g, " ")
    .trim()
  if (!texto) texto = "Opção"
  return Array.from(texto).slice(0, maxChars).join("")
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
        interactive: { type: "button", body: { text: texto }, action: { buttons: opcoes.map(o => ({ type: "reply", reply: { id: o.id, title: normalizarTituloOpcaoWhatsApp(o.title, 20) } })) } }
      }
    } else {
      const sections = []
      for (let i = 0; i < opcoes.length; i += 10)
        sections.push({ title: "Opções", rows: opcoes.slice(i, i + 10).map(o => ({ id: o.id, title: normalizarTituloOpcaoWhatsApp(o.title, 24) })) })
      body = {
        messaging_product: "whatsapp", to, type: "interactive",
        interactive: { type: "list", body: { text: texto }, action: { button: "Ver opções", sections } }
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
  return { texto:"Selecione sua Região no Brasil", opcoes:[
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
  const telefoneContato = getTelefoneContato(from, u)
  const numeroCaso = gerarCaso(u.area)
  u.negocioId = null
  u.numeroCaso  = numeroCaso
  u.score       = calcScore(u)
  u.docsEntregues = []; u.docAtualIdx = 0; u.ultimoArqId = null

  const pasta      = await criarPastaCliente(numeroCaso, u.nome, u.area, u.situacao, u.tipo)
  u.pastaDriveId   = pasta?.id || null
  u.pastaDriveLink = pasta?.webViewLink || null

  const existente = await hsBuscarPorPhone(telefoneContato)
  if (existente?.properties?.firstname && !u.nomeHubspot) u.nomeHubspot = existente.properties.firstname
  let contatoId   = existente?.id || null
  if (!contatoId) contatoId = await hsCriarContato(telefoneContato, u)
  else console.log("Contato encontrado no HubSpot:", contatoId)
  u.contatoId = contatoId

  let negocioId = u.negocioId || null
  if (!negocioId && contatoId) {
    // Verificação externa: buscar negócio em aberto no HubSpot mesmo sem sessão ativa
    const negocioExistente = await hsBuscarNegocioAbertoDoContato(contatoId)
    if (negocioExistente) {
      negocioId = negocioExistente
      u.negocioId = negocioId
      console.log("Negócio existente encontrado:", negocioId)
    }
  }
  if (!negocioId) {
    console.log("Nenhum negócio encontrado, criando novo")
    negocioId = await hsCriarNegocio(u)
    u.negocioId = negocioId
  } else {
    console.log("Negócio já existe, evitando duplicidade:", negocioId)
  }
  if (contatoId && negocioId) await hsAssociar(contatoId, negocioId)

  if (contatoId) {
    await hsCriarNota(contatoId, "CADASTRO COMPLETO", resumoCaso(u) + `\n\nScore: ${u.score}\nDrive: ${u.pastaDriveLink || "—"}\nWhatsApp: ${telefoneContato}`)
  }

  // Salvar áudio de descrição guardado antes do cadastro
  if (u._audioDescBuffer && u.pastaDriveId) {
    try {
      await uploadPastaAudio(u.pastaDriveId, u._audioDescNome || "cliente", "Áudios Transcritos Confirmados", u._audioDescBuffer, u._audioDescMime)
      u._audioDescBuffer = null; u._audioDescMime = null; u._audioDescNome = null
      console.log("[DRIVE] Áudio de descrição salvo após cadastro")
    } catch (e) { logErro("drive", "salvarAudioDesc: " + e.message) }
  }

  if (u.audiosDescCorrigidos?.length && u.pastaDriveId) {
    try {
      for (const audio of u.audiosDescCorrigidos) {
        if (!audio?.buffer) continue
        await uploadPastaAudio(u.pastaDriveId, audio.nome || "cliente", "Áudios Transcritos Corrigidos", audio.buffer, audio.mimeType)
      }
      u.audiosDescCorrigidos = []
      console.log("[DRIVE] Áudios corrigidos salvos após cadastro")
    } catch (e) { logErro("drive", "salvarAudiosCorrigidos: " + e.message) }
  }

  u.stage = "cliente"
  u.leadIncompletoCapturado = false
  agendarPersistenciaUsers()
  return numeroCaso
}

function tela_confirmacao(u) {
  return {
    texto: `✅ *Confira seus dados antes de confirmar:*\n\n${resumoCaso(u)}\n\nTudo está correto?`,
    opcoes: [
      { id: "conf_ok", title: "✅ Confirmar" },
      { id: "conf_corrigir", title: "✏️ Corrigir dados" },
      { id: "conf_menu", title: "🏠 Menu principal" }
    ]
  }
}

function menuCliente(u) {
  const nomeExib = getPrimeiroNome(u)
  const prioridade = u.urgencia === "alta" ? "\n🔴 Prioridade: Alta" : ""
  return {
    texto: `Que bom te ver novamente, ${nomeExib} 😊\nAqui estão suas opções:${u.numeroCaso ? `\n\n📄 Caso: *${u.numeroCaso}*` : ""}${u.area ? `\n⚖️ Área: ${u.area}` : ""}${prioridade}`,
    opcoes: [
      { id: "m_status",  title: "📊 Status do caso" },
      { id: "m_docs",    title: "📎 Enviar documentos" },
      { id: "m_adv",     title: "👨‍⚖️ Falar c/ advogado" },
      { id: "m_novocaso", title: "➕ Novo caso" },
      { id: "m_encerrar", title: "👋 Encerrar" }
    ]
  }
}

function getDocsPendentes(u) {
  const lista = getDocumentosLista(u.area, u.tipo || u.situacao)
  return lista.filter(d => !(u.docsEntregues || []).includes(d.id))
}

function telaConcluido(u) {
  const nome1 = (u.nome || u.nomeWA).split(" ")[0]
  return {
    texto: `🎉 *Muito bem, ${nome1}!*\n\nTodos os documentos foram enviados com sucesso! Nossa equipe já pode analisar seu caso com prioridade.\n\nEntraremos em contato em breve pelo WhatsApp. 💬\n\n📁 Caso: *${u.numeroCaso}*\n⏱️ Retorno em até *2 dias úteis*.`,
    opcoes: [{ id:"m_adv", title:"👨‍⚖️ Falar c/ advogado" }, { id:"m_status", title:"📊 Status" }, { id:"m_inicio", title:"Menu do cliente" }, { id:"m_encerrar", title:"👋 Encerrar" }]
  }
}

function telaEnvioDoc(u) {
  const pendentes = getDocsPendentes(u)
  if (pendentes.length === 0) return telaConcluido(u)

  const lista    = getDocumentosLista(u.area, u.tipo || u.situacao)
  const total    = lista.length
  const entregue = total - pendentes.length
  const barras   = "🟢".repeat(entregue) + "🔴".repeat(pendentes.length)
  const doc      = pendentes[0]
  const folhas   = doc.folhas || ["Foto do documento"]
  const fIdx     = u.docAtualIdx || 0
  const folha    = folhas[fIdx] || `Foto ${fIdx + 1}`
  const totalF   = folhas.length

  let texto = `📋 *Documentos do caso*\n${barras} ${entregue}/${total}\n\n`
  texto += `📌 *Agora:* ${doc.label}\n`
  texto += `📄 *Envie:* ${folha}`
  if (totalF > 1) texto += ` (${fIdx + 1} de ${totalF})`
  texto += `\n\n💡 *Dica:* ${doc.dica}`
  texto += `\n\n📲 *Tire a foto ou PDF e envie aqui.*`

  // CPF é opcional — oferecer opção de pular
  if (doc.id === "doc_cpf") {
    texto += "\n\n💡 *Se o seu CPF já aparece no RG ou CNH, pode pular este documento.*"
    return {
      texto,
      opcoes: enviarOpcoesPadrao(null)
    }
  }

  return {
    texto,
    opcoes: enviarOpcoesPadrao(null)
  }
}

function responderComTimer(from, payload) {
  iniciarTimer(from)
  return payload
}

function telaDescreverCaso() {
  return {
    texto: "✍️ Pode me contar um pouco mais sobre seu caso?\nVocê pode digitar ou enviar um áudio 😊",
    opcoes: [
      { id: "desc_incentivo_depois", title: "Enviar depois" },
      { id: "desc_incentivo_menu", title: "Menu principal" }
    ]
  }
}

function telaConfirmarUrgente(transcricao) {
  return {
    texto: `🎙️ *Áudio recebido e transcrito!*\n\n📝 *Transcrição:*\n\n"${transcricao.slice(0, 400)}${transcricao.length > 400 ? "..." : ""}"\n\nConfirme ou corrija as informações.`,
    opcoes: [{ id:"urg_audio_ok", title:"✅ Confirmar" }, { id:"urg_audio_corrigir", title:"✏️ Corrigir" }]
  }
}

function telaExplicarTudo() {
  return {
    texto: "Se quiser, agora você pode me contar tudo sobre a solicitação.\n\nPode digitar ou enviar um áudio com os detalhes completos.",
    opcoes: [
      { id: "explicar_tudo", title: "📝 Quero explicar tudo" },
      { id: "seguir_fluxo", title: "➡️ Seguir com perguntas" }
    ]
  }
}

function telaAudioNoFluxo(transcricao, recomendacao) {
  const preview = (transcricao || "").length > 320 ? transcricao.slice(0, 320) + "..." : (transcricao || "")
  return {
    texto: `ðŸŽ™ï¸ *Entendi este Ã¡udio:*\n\n"${preview}"\n\nMinha recomendaÃ§Ã£o agora Ã© *${recomendacao || "continuar o atendimento"}*.\n\nComo vocÃª quer seguir?`,
    opcoes: [
      { id: "audio_fluxo_seguir", title: "âœ… Seguir recomendaÃ§Ã£o" },
      { id: "audio_fluxo_recomecar", title: "ðŸ”„ RecomeÃ§ar" },
      { id: "audio_fluxo_encerrar", title: "ðŸ‘‹ Encerrar" }
    ]
  }
}

function executarRecomecoFluxo(from, u) {
  limparDadosCasoAtual(u)
  u.stage = STAGES.AREA
  iniciarTimer(from)
  return { ...telaArea(), perguntaId: "area" }
}

function executarEncerramentoFluxo(u) {
  limparTimer(u)
  const nome1 = (u.nome || u.nomeWA).split(" ")[0]
  limparDadosCasoAtual(u)
  return { texto: `Tudo bem, ${nome1}. Vou encerrar por aqui.\n\nQuando quiser retomar, Ã© sÃ³ me chamar novamente.`, opcoes: null, registrarPergunta: false }
}

function deveOferecerExplicarTudo(u) {
  return Boolean(u?.assuntoResumo) && !u?._ofereceuExplicarTudo && u.descricao === u.assuntoResumo
}

function prepararOfertaExplicarTudo(from, u, proximoStage, proximaPergunta) {
  u._ofereceuExplicarTudo = true
  u._proximoStageAposDescricao = proximoStage
  u._proximaPerguntaAposDescricao = proximaPergunta
  u.stage = STAGES.EXPLICAR_TUDO_OFERTA
  iniciarTimer(from)
  return { texto: "âœ… Certo! Vamos registrar sua solicitaÃ§Ã£o.", opcoes: [{ id: "cont", title: "â–¶ï¸ Continuar" }] }
}

function prepararOfertaExplicarTudoFinal(from, u, proximoStage, proximaPergunta) {
  u._ofereceuExplicarTudo = true
  u._proximoStageAposDescricao = proximoStage
  u._proximaPerguntaAposDescricao = proximaPergunta
  u.stage = STAGES.EXPLICAR_TUDO_OFERTA
  iniciarTimer(from)
  return telaExplicarTudo()
}

function telaAudioNoFluxo(transcricao, recomendacao) {
  const preview = (transcricao || "").length > 320 ? transcricao.slice(0, 320) + "..." : (transcricao || "")
  return {
    texto: `Audio transcrito:\n\n"${preview}"\n\nMinha recomendacao agora e *${recomendacao || "continuar o atendimento"}*.\n\nComo voce quer seguir?`,
    opcoes: [
      { id: "audio_fluxo_seguir", title: "Seguir recomendacao" },
      { id: "audio_fluxo_recomecar", title: "Recomecar" },
      { id: "audio_fluxo_encerrar", title: "Encerrar" }
    ]
  }
}

function executarEncerramentoFluxo(u) {
  limparTimer(u)
  const nome1 = (u.nome || u.nomeWA).split(" ")[0]
  limparDadosCasoAtual(u)
  return { texto: `Tudo bem, ${nome1}. Vou encerrar por aqui.\n\nQuando quiser retomar, e so me chamar novamente.`, opcoes: null, registrarPergunta: false }
}

function prepararOfertaExplicarTudo(from, u, proximoStage, proximaPergunta) {
  u._ofereceuExplicarTudo = true
  u._proximoStageAposDescricao = proximoStage
  u._proximaPerguntaAposDescricao = proximaPergunta
  u.stage = STAGES.EXPLICAR_TUDO_OFERTA
  iniciarTimer(from)
  return telaExplicarTudo()
}

function iniciarConfirmacaoDescricao(from, u, texto, origemStage) {
  u._descTemp = normalizarTextoCRM(texto)
  u._descOrigemStage = origemStage
  u.stage = STAGES.DESC_CONFIRMA
  iniciarTimer(from)
  const preview = u._descTemp.length > 400 ? u._descTemp.slice(0, 400) + "..." : u._descTemp
  return {
    texto: `📝 *Você descreveu:*\n\n"${preview}"\n\nEstá correto?`,
    opcoes: [
      { id: "desc_ok", title: "✅ Confirmar" },
      { id: "desc_corrigir", title: "✏️ Corrigir" }
    ]
  }
}

function respostaAposConfirmarDescricao(from, u) {
  if (u._descOrigemStage === "trab_out_desc" || u._descOrigemStage === "out_desc") {
    u.assuntoResumo = normalizarTextoCRM(u.descricao || u._descTemp || "")
    u.descricao = u.assuntoResumo
    u._descOrigemStage = null
    return prepararFluxoResumoOutro(from, u)
  }

  if (u._proximoStageAposDescricao) {
    const proximoStage = u._proximoStageAposDescricao
    const proximaPergunta = u._proximaPerguntaAposDescricao
    u._proximoStageAposDescricao = null
    u._proximaPerguntaAposDescricao = null
    u._descOrigemStage = null
    u.stage = proximoStage
    iniciarTimer(from)
    if (proximoStage === STAGES.CONFIRMACAO) return tela_confirmacao(u)
    if (proximaPergunta) return proximaPergunta
    return { texto: "Perfeito. Vou considerar esses detalhes no atendimento.", opcoes: [{ id: "cont", title: "▶️ Continuar" }] }
  }

  u.stage = "confirmacao"
  u._descOrigemStage = null
  iniciarTimer(from)
  return tela_confirmacao(u)
}

async function classificarResumoOutro(u, resumo) {
  if (!GROQ_KEY || !resumo) return null
  try {
    const contexto = u.area === "Trabalhista"
      ? `Categorias possíveis: demissao, direitos, acidente, assedio, generico.`
      : `Categorias possíveis: consultoria_inss, consultoria_trabalhista, consultoria_outra, revisao_contrato, revisao_processo, revisao_outro, generico.`

    const system = `Classifique resumos curtos de atendimento jurídico. Responda apenas JSON válido com as chaves "categoria", "confianca" e "rotulo". ${contexto}`
    const user = `Área atual: ${u.area}\nResumo: ${resumo}`
    const res = await axios.post(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        model: "llama-3.1-8b-instant",
        messages: [{ role: "system", content: system }, { role: "user", content: user }],
        temperature: 0.1,
        max_tokens: 120,
        response_format: { type: "json_object" }
      },
      { headers: { Authorization: `Bearer ${GROQ_KEY}`, "Content-Type": "application/json" } }
    )
    const content = res.data.choices?.[0]?.message?.content || "{}"
    const parsed = JSON.parse(content)
    if (!parsed?.categoria) return null
    return parsed
  } catch (e) {
    logErro("groq", "classificarResumoOutro: " + e.message)
    return null
  }
}

function aplicarSugestaoFluxoOutro(u, categoria) {
  if (u.area === "Trabalhista") {
    if (categoria === "demissao") { u.situacao = "Demissao"; u.tipo = "demissao"; return { stage: "trab_dem_tipo", texto: "Como foi a demissão?", opcoes: [{ id: "td_s", title: "Sem justa causa" }, { id: "td_c", title: "Com justa causa" }, { id: "td_p", title: "Pedido de demissão" }] } }
    if (categoria === "direitos") { u.situacao = "Direitos nao pagos"; u.tipo = "direitos"; return { stage: "trab_dir_tipo", texto: "💰 Qual direito não foi pago?", opcoes: [{ id: "tdr_f", title: "💼 FGTS" }, { id: "tdr_fe", title: "🏖️ Férias" }, { id: "tdr_13", title: "🎁 13º salário" }, { id: "tdr_h", title: "⏰ Horas extras" }, { id: "tdr_o", title: "📋 Outro" }] } }
    if (categoria === "acidente") { u.situacao = "Acidente de trabalho"; u.tipo = "acidente"; return { stage: "trab_acid_af", texto: "🏥 Você se afastou pelo INSS?", opcoes: [{ id: "af_s", title: "✅ Sim" }, { id: "af_n", title: "❌ Não" }] } }
    if (categoria === "assedio") { u.situacao = "Assedio moral"; u.tipo = "assedio"; return { stage: "trab_ass_s", texto: "😰 O assédio ainda está acontecendo?", opcoes: [{ id: "as_s", title: "⚠️ Sim, ainda acontece" }, { id: "as_n", title: "✅ Não, já parou" }] } }
    u.situacao = "Outros"; u.tipo = "outros"
    return { stage: "gatilho", texto: "✅ Certo! Vamos registrar seu caso.", opcoes: [{ id: "cont", title: "▶️ Continuar" }] }
  }

  if (categoria === "consultoria_inss") { u.situacao = "Consultoria juridica"; u.subTipo = "INSS"; return { stage: "gatilho", texto: "✅ Entendi. Vamos seguir com essa consultoria.", opcoes: [{ id: "cont", title: "▶️ Continuar" }] } }
  if (categoria === "consultoria_trabalhista") { u.situacao = "Consultoria juridica"; u.subTipo = "Trabalhista"; return { stage: "gatilho", texto: "✅ Entendi. Vamos seguir com essa consultoria.", opcoes: [{ id: "cont", title: "▶️ Continuar" }] } }
  if (categoria === "consultoria_outra") { u.situacao = "Consultoria juridica"; u.subTipo = "Outra área"; return { stage: "gatilho", texto: "✅ Entendi. Vamos seguir com essa consultoria.", opcoes: [{ id: "cont", title: "▶️ Continuar" }] } }
  if (categoria === "revisao_contrato") { u.situacao = "Revisao de documentos"; u.tipo = "revisao"; u.subTipo = "Contrato"; return { stage: "gatilho", texto: "✅ Entendi. Vamos seguir com a revisão.", opcoes: [{ id: "cont", title: "▶️ Continuar" }] } }
  if (categoria === "revisao_processo") { u.situacao = "Revisao de documentos"; u.tipo = "revisao"; u.subTipo = "Processo"; return { stage: "gatilho", texto: "✅ Entendi. Vamos seguir com a revisão.", opcoes: [{ id: "cont", title: "▶️ Continuar" }] } }
  if (categoria === "revisao_outro") { u.situacao = "Revisao de documentos"; u.tipo = "revisao"; u.subTipo = "Outro"; return { stage: "gatilho", texto: "✅ Entendi. Vamos seguir com a revisão.", opcoes: [{ id: "cont", title: "▶️ Continuar" }] } }
  u.situacao = "Outro assunto"
  return { stage: "gatilho", texto: "✅ Certo! Vamos registrar sua solicitação.", opcoes: [{ id: "cont", title: "▶️ Continuar" }] }
}

async function prepararFluxoResumoOutro(from, u) {
  const sugestao = await classificarResumoOutro(u, u.assuntoResumo)
  if (sugestao?.categoria && Number(sugestao.confianca || 0) >= 0.6 && sugestao.categoria !== "generico") {
    u._sugestaoFluxo = sugestao
    u.stage = STAGES.SUGESTAO_FLUXO_OUTRO
    iniciarTimer(from)
    return {
      texto: `Isso parece se encaixar em *${sugestao.rotulo || sugestao.categoria}*.\n\nQuer seguir por esse caminho?`,
      opcoes: [
        { id: "sug_fluxo", title: "✅ Seguir por esse caminho" },
        { id: "sug_nao", title: "✏️ Corrigir categoria" }
      ]
    }
  }

  u._sugestaoFluxo = null
  u.stage = "gatilho"
  u._proximaPerguntaAposDescricao = { texto: "✅ Certo! Vamos registrar sua solicitação.", opcoes: [{ id: "cont", title: "▶️ Continuar" }] }
  iniciarTimer(from)
  return telaExplicarTudo()
}

async function classificarAcaoAudioFluxo(u, texto) {
  const fallback = (() => {
    const lower = String(texto || "").toLowerCase()
    if (/(encerrar|encerra|tchau|obrigad|finaliz|fechar|fecha|por hoje|ate logo|atÃ© logo|ate mais|atÃ© mais)/.test(lower)) {
      return { acao: "encerrar", recomendacao: "encerrar este atendimento" }
    }
    if (/(recome|comecar de novo|comeÃ§ar de novo|novo atendimento|do zero|reiniciar|trocar de assunto|outro assunto)/.test(lower)) {
      return { acao: "recomecar", recomendacao: "recomeÃ§ar o atendimento" }
    }
    return { acao: "continuar", recomendacao: "continuar no fluxo atual" }
  })()

  if (!GROQ_KEY || !texto) return fallback
  try {
    const system = `Classifique a intenÃ§Ã£o principal de um Ã¡udio recebido no meio de um atendimento jurÃ­dico. Responda apenas JSON vÃ¡lido com as chaves "acao" e "recomendacao". "acao" deve ser exatamente uma destas: continuar, recomecar, encerrar.`
    const user = `Stage atual: ${u.stage}\nÃrea: ${u.area || "nÃ£o definida"}\nTexto transcrito: ${texto}`
    const res = await axios.post(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        model: "llama-3.1-8b-instant",
        messages: [{ role: "system", content: system }, { role: "user", content: user }],
        temperature: 0.1,
        max_tokens: 80,
        response_format: { type: "json_object" }
      },
      { headers: { Authorization: `Bearer ${GROQ_KEY}`, "Content-Type": "application/json" } }
    )
    const parsed = JSON.parse(res.data.choices?.[0]?.message?.content || "{}")
    if (!["continuar", "recomecar", "encerrar"].includes(parsed?.acao)) return fallback
    return {
      acao: parsed.acao,
      recomendacao: parsed.recomendacao || fallback.recomendacao
    }
  } catch (e) {
    logErro("groq", "classificarAcaoAudioFluxo: " + e.message)
    return fallback
  }
}

function processarRetomadaOuReinicio(from, u, text, buttonId = "") {
  const msg = String(text || "").toLowerCase().trim()
  const botao = String(buttonId || "").trim()
  const opcoesAtuais = new Set((u.lastPerguntaPayload?.opcoes || []).map(o => o.id))
  const contextoDescricao = opcoesAtuais.has("desc_incentivo_continuar") || opcoesAtuais.has("desc_incentivo_menu") || opcoesAtuais.has("desc_incentivo_encerrar")
  const contextoRetomada = opcoesAtuais.has("ret_auto_continuar") || opcoesAtuais.has("ret_auto_menu") || opcoesAtuais.has("cont_retomar") || opcoesAtuais.has("recomecar")

  if (botao === "desc_incentivo_continuar" || (contextoDescricao && msg.includes("continuar"))) {
    const stageDescricao = ehStageDescricaoCaso(u.stage) ? u.stage : STAGES.COLETA_DESC_AUDIO
    entrarEtapaDescricao(u, stageDescricao)
    iniciarTimer(from)
    return telaDescreverCaso()
  }

  if (text === "desc_incentivo_depois") {
    return pularDescricaoPorAgora(from, u)
  }

  if (
    botao === "desc_incentivo_menu" ||
    botao === "ret_auto_menu" ||
    ((contextoDescricao || contextoRetomada) && msg.includes("menu"))
  ) {
    u.jaIncentivouDescricao = true
    if (u._retomadaEhLeadFrio) {
      u._retomadaEhLeadFrio = false
      u.negocioStageId = HS_STAGE.LEAD
      u.stage = STAGES.AREA
      salvarEtapa(u, "area")
      iniciarTimer(from)
      return respostaRecomecoMenuPrincipal(u)
    }
    if (!podeMostrarMenuCliente(u)) {
      u.stage = STAGES.AREA
      salvarEtapa(u, "area")
      iniciarTimer(from)
      return respostaRecomecoMenuPrincipal(u)
    }
    u.stage = STAGES.CLIENTE
    iniciarTimer(from)
    return menuCliente(u)
  }

  if (
    botao === "desc_incentivo_encerrar" ||
    botao === "m_encerrar" ||
    ((contextoDescricao || contextoRetomada) && msg.includes("encerrar"))
  ) {
    return executarEncerramentoFluxo(u)
  }

  if (
    botao === "ret_auto_continuar" ||
    botao === "cont_retomar" ||
    (contextoRetomada && msg.includes("continuar"))
  ) {
    u._retomadaEhLeadFrio = false
    const resposta = retomarFluxo(u)
    iniciarTimer(from)
    return resposta
  }

  if (text === "recomecar") {
    limparDadosCasoAtual(u)
    u.stage = STAGES.AREA
    salvarEtapa(u, "area")
    iniciarTimer(from)
    return respostaRecomecoMenuPrincipal(u)
  }

  if (text === "audio_fluxo_encerrar") {
    return executarEncerramentoFluxo(u)
  }

  return null
}

async function verificarRetomadaAutomatica(from, u) {
  if (!u) return null
  if (u.jaOfereceuRetomada) return null
  if (u.negocioId || u.numeroCaso) return null
  if (![STAGES.INICIO, STAGES.AREA].includes(u.stage)) return null

  console.log("🔁 Verificando retomada para:", from)
  const contato = await hsBuscarPorPhone(getTelefoneContato(from, u))
  if (!contato?.id) return null

  console.log("Contato encontrado:", contato.id)
  const negocio = await hsBuscarNegocioAbertoInfoDoContato(contato.id)
  if (!negocio?.id) return null

  console.log("Negócio aberto encontrado:", negocio.id)
  u.contatoId = contato.id
  u.negocioId = negocio.id
  u.nomeHubspot = contato.properties?.firstname || u.nomeHubspot || null
  u.nome = u.nome || u.nomeHubspot || u.nomeWA
  u.numeroCaso = u.numeroCaso || contato.properties?.numero_caso || "Em andamento"
  u.area = u.area || contato.properties?.area_juridica || "Atendimento em andamento"
  u.negocioStageId = negocio.stageId || u.negocioStageId || null
  u.stage = STAGES.RETOMADA_AUTOMATICA
  u.jaOfereceuRetomada = true
  u._retomadaEhLeadFrio = u.negocioStageId === HS_STAGE.LEAD

  if (u._retomadaEhLeadFrio) {
    return {
      texto: `Que bom te ver novamente, ${getPrimeiroNome(u)} 😊\nVi que você iniciou um atendimento, mas não concluiu.\n\nComo prefere continuar?`,
      opcoes: [
        { id: "ret_auto_continuar", title: "Cont. atendimento" },
        { id: "ret_auto_menu", title: "Menu principal" },
        { id: "m_encerrar", title: "Encerrar" }
      ]
    }
  }

  return {
    texto: `Que bom te ver novamente, ${getPrimeiroNome(u)} 😊\nQuer continuar seu atendimento de onde parou?`,
    opcoes: [
      { id: "ret_auto_continuar", title: "Cont. atendimento" },
      { id: "ret_auto_menu", title: "Menu principal" },
      { id: "m_encerrar", title: "Encerrar" }
    ]
  }
}

async function processarMidia(from, nomeWA, u, msgObj, tipo, ehAudio, ehDoc) {
  if (!(ehAudio || ehDoc)) return null
  if (![STAGES.CLIENTE, STAGES.AGUARDANDO_URGENTE, STAGES.COLETA_DESC_AUDIO, "trab_out_desc", "out_desc"].includes(u.stage)) return null

  const mediaId  = msgObj?.[tipo]?.id
  const nomeArq  = msgObj?.document?.filename || (tipo === "image" ? `imagem_${Date.now()}.jpg` : `audio_${Date.now()}`)
  const mimeType = msgObj?.[tipo]?.mime_type || "application/octet-stream"

  if (!mediaId) {
    return responderComTimer(from, { texto: "Nao consegui identificar o arquivo. Tente enviar novamente como foto ou PDF.", opcoes: [{ id:"m_docs", title:"Tentar novamente" }, { id:"m_inicio", title:"Menu principal" }] })
  }
  if (!u.pastaDriveId && ![STAGES.COLETA_DESC_AUDIO, "trab_out_desc", "out_desc"].includes(u.stage)) {
    return responderComTimer(from, { texto: "⏳ Sua pasta está sendo preparada. Aguarde um instante e tente novamente.", opcoes: [{ id:"m_docs", title:"Tentar novamente" }, { id:"m_inicio", title:"Menu principal" }] })
  }

  const midia = await baixarMidia(mediaId)
  if (!midia) {
    return responderComTimer(from, { texto: "❌ Não consegui baixar o arquivo. Tente reenviar.", opcoes: [{ id:"m_docs", title:"Tentar novamente" }, { id:"m_inicio", title:"Menu principal" }] })
  }

  if (ehAudio) {
    await enviar(from, "🎙️ Áudio recebido! Transcrevendo, aguarde...", null, false)
    const eUrg = u.stage === STAGES.AGUARDANDO_URGENTE
    const eDescricao = u.stage === STAGES.COLETA_DESC_AUDIO
    const eDescricaoLivre = ["trab_out_desc", "out_desc"].includes(u.stage)
    const nomePasta = eUrg ? "Mensagem Urgente" : (eDescricao ? "Descricao do Caso" : "Audio Geral")
    const prNome = formatarNome(u.nome || nomeWA || "cliente").split(" ")[0]
    const ultNome = formatarNome(u.nome || nomeWA || "").split(" ").filter(Boolean).slice(-1)[0] || ""
    const nomeCliente = ultNome && ultNome !== prNome ? `${prNome} ${ultNome}` : prNome

    let arquivoAud = null
    if (u.pastaDriveId && !eDescricao && !eDescricaoLivre && !eUrg) {
      arquivoAud = await uploadPastaAudio(u.pastaDriveId, nomeCliente, nomePasta, midia.buffer, midia.mimeType)
    }
    const trans = await transcrever(midia.buffer, midia.mimeType, { origem: eUrg ? "urgente" : (eDescricao || eDescricaoLivre ? "descricao" : "cliente") })

    if (eUrg) {
      if (!trans) {
        u._urgenteAudioBuffer = midia.buffer
        u._urgenteAudioMime = midia.mimeType
        u._urgenteAudioNome = nomeCliente
        u._urgenteAudioTexto = null
        u.stage = STAGES.URGENTE_AUDIO_ERRO_TRANSCRICAO
        return responderComTimer(from, {
          texto: "Não consegui transcrever o áudio. Tente novamente ou envie por texto.",
          opcoes: [{ id: "urg_audio_corrigir", title: "✏️ Corrigir" }]
        })
      }

      u._urgenteAudioBuffer = midia.buffer
      u._urgenteAudioMime = midia.mimeType
      u._urgenteAudioNome = nomeCliente
      u._urgenteAudioTexto = normalizarTextoCRM(trans)
      u.stage = STAGES.URGENTE_AUDIO_CONFIRMA
      return responderComTimer(from, telaConfirmarUrgente(u._urgenteAudioTexto))
    }

    if (eDescricao || eDescricaoLivre) {
      if (!trans) {
        const origemDescricao = u.stage
        u.stage = STAGES.DESC_ERRO_TRANSCRICAO
        u._descOrigemStage = origemDescricao
        return responderComTimer(from, {
          texto: "Não consegui transcrever o áudio. Tente novamente ou envie por texto.",
          opcoes: [{ id: "desc_corrigir", title: "✏️ Corrigir" }]
        })
      }

      u._audioDescBuffer = midia.buffer
      u._audioDescMime = midia.mimeType
      u._audioDescNome = nomeCliente
      return iniciarConfirmacaoDescricao(from, u, trans, eDescricaoLivre ? u.stage : STAGES.COLETA_DESC_AUDIO)
    }

    if (!eDescricao) {
      await hsCriarNota(
        u.contatoId,
        eUrg ? "ÁUDIO URGENTE" : `ÁUDIO — ${nomePasta.toUpperCase()}`,
        `De: ${u.nome} (${from})\nCaso: ${u.numeroCaso}\n\n${trans ? `Transcrição:\n"${trans}"` : "Transcrição indisponível"}${arquivoAud ? `\nDrive: ${arquivoAud.webViewLink}` : ""}`
      )
    }
    u.documentosEnviados = true
    salvarEtapa(u, "documentos")
    if (u.stage === STAGES.AGUARDANDO_URGENTE) u.stage = STAGES.CLIENTE

    const msgAudio = trans
      ? `✅ Áudio salvo!\n\n🗣️ O que entendemos:\n"${trans.slice(0, 300)}${trans.length > 300 ? "..." : ""}"`
      : "✅ Áudio salvo na pasta do caso.\nNossa equipe vai ouvir em breve."
    return responderComTimer(from, { texto: msgAudio, opcoes: [{ id:"m_docs", title:"📎 Enviar documentos" }, { id:"m_adv", title:"👨‍⚖️ Advogado" }, { id:"m_inicio", title:"Menu principal" }] })
  }

  await hsMoverStage(u.negocioId, HS_STAGE.DOCS)
  if (!u.docsEntregues) u.docsEntregues = []

  const pendentes = getDocsPendentes(u)
  const docAtual = pendentes[0]
  const folhas = docAtual?.folhas || ["Foto"]
  const fIdx = u.docAtualIdx || 0
  const folha = folhas[fIdx] || `Foto ${fIdx + 1}`
  const prN = formatarNome(u.nome || nomeWA || "cliente").split(" ")[0]
  const ulN = formatarNome(u.nome || nomeWA || "").split(" ").filter(Boolean).slice(-1)[0] || ""
  const nCli = ulN && ulN !== prN ? `${prN} ${ulN}` : prN
  const lblD = docAtual ? docAtual.label : "Documento"
  const ext2 = (nomeArq || "").split(".").pop()
  const nArqFinal = `${lblD} - ${folha} - ${nCli}${ext2 && ext2.length <= 4 ? "."+ext2 : ".jpg"}`

  const arquivo = await uploadDrive(u.pastaDriveId, nArqFinal, midia.buffer, midia.mimeType)
  if (!arquivo) {
    return responderComTimer(from, { texto: "❌ Não consegui salvar. Pode tentar novamente?", opcoes: [{ id:"m_docs", title:"Tentar novamente" }, { id:"m_adv", title:"Falar com advogado" }, { id:"m_inicio", title:"Menu principal" }] })
  }

  u.ultimoArqId = arquivo.id
  u.ultimoArqNome = nArqFinal
  u.documentosEnviados = true
  salvarEtapa(u, "documentos")
  if (u.stage === STAGES.AGUARDANDO_URGENTE) u.stage = STAGES.CLIENTE

  await hsCriarNota(u.contatoId, "DOCUMENTO RECEBIDO", `De: ${u.nome} (${from})\nCaso: ${u.numeroCaso}\nArquivo: ${nArqFinal}\nDrive: ${arquivo.webViewLink}`)

  u.docAtualIdx = fIdx + 1
  return responderComTimer(from, {
    texto: `✅ *${lblD} — ${folha}* recebida!\n📁 Salvo como: ${nArqFinal}\n\nO que deseja fazer agora?`,
    opcoes: [
      { id:"docs_reenviar", title:"🔄 Reenviar esta foto" },
      { id:"docs_maisFotos", title:"📸 Mais fotos deste doc" },
      { id:"docs_proxdoc", title:"✅ Próximo documento" },
      { id:"docs_depois", title:"⏭️ Enviar depois" }
    ]
  })
}

async function processarAudioNoFluxo(from, nomeWA, u, msgObj, tipo, ehAudio) {
  if (!ehAudio) return null
  if (u.numeroCaso) return null
  if ([
    STAGES.CLIENTE,
    STAGES.AGUARDANDO_URGENTE,
    STAGES.COLETA_DESC_AUDIO,
    STAGES.DESC_CONFIRMA,
    STAGES.DESC_ERRO_TRANSCRICAO,
    STAGES.SUGESTAO_FLUXO_OUTRO,
    STAGES.EXPLICAR_TUDO_OFERTA,
    STAGES.URGENTE_AUDIO_CONFIRMA,
    STAGES.URGENTE_AUDIO_ERRO_TRANSCRICAO,
    STAGES.AUDIO_FLUXO_CONFIRMA,
    "trab_out_desc",
    "out_desc",
    "inicio",
    "inicio_retorno"
  ].includes(u.stage)) return null

  const mediaId = msgObj?.[tipo]?.id
  if (!mediaId) return null

  const midia = await baixarMidia(mediaId)
  if (!midia) return responderComTimer(from, { texto: "NÃ£o consegui baixar esse Ã¡udio. Pode tentar novamente?", opcoes: null })

  await enviar(from, "ðŸŽ™ï¸ Ãudio recebido! Transcrevendo, aguarde...", null, false)
  const transcricao = await transcrever(midia.buffer, midia.mimeType, { origem: "fluxo" })
  if (!transcricao) {
    const ultimaPergunta = retomarUltimaPergunta(u)
    if (ultimaPergunta) return responderComTimer(from, {
      texto: "NÃ£o consegui entender esse Ã¡udio agora. Vou te manter no ponto em que estÃ¡vamos.",
      opcoes: [{ id: "cont_retomar", title: "â–¶ï¸ Continuar" }, { id: "recomecar", title: "ðŸ”„ RecomeÃ§ar" }]
    })
    return responderComTimer(from, { texto: "NÃ£o consegui entender esse Ã¡udio agora. Se preferir, responda por texto.", opcoes: null })
  }

  const decisao = await classificarAcaoAudioFluxo(u, transcricao)
  u._audioFluxoTexto = normalizarTextoCRM(transcricao)
  u._audioFluxoAcao = decisao.acao
  u._audioFluxoResposta = decisao.recomendacao
  u.stage = STAGES.AUDIO_FLUXO_CONFIRMA
  return responderComTimer(from, telaAudioNoFluxo(u._audioFluxoTexto, u._audioFluxoResposta))
}

async function processarAudioNoFluxo(from, nomeWA, u, msgObj, tipo, ehAudio) {
  if (!ehAudio) return null
  if (u.numeroCaso) return null
  if ([
    STAGES.CLIENTE,
    STAGES.AGUARDANDO_URGENTE,
    STAGES.COLETA_DESC_AUDIO,
    STAGES.DESC_CONFIRMA,
    STAGES.DESC_ERRO_TRANSCRICAO,
    STAGES.SUGESTAO_FLUXO_OUTRO,
    STAGES.EXPLICAR_TUDO_OFERTA,
    STAGES.URGENTE_AUDIO_CONFIRMA,
    STAGES.URGENTE_AUDIO_ERRO_TRANSCRICAO,
    STAGES.AUDIO_FLUXO_CONFIRMA,
    "trab_out_desc",
    "out_desc",
    "inicio",
    "inicio_retorno"
  ].includes(u.stage)) return null

  const mediaId = msgObj?.[tipo]?.id
  if (!mediaId) return null

  const midia = await baixarMidia(mediaId)
  if (!midia) {
    return responderComTimer(from, { texto: "Nao consegui baixar esse audio. Pode tentar novamente?", opcoes: null })
  }

  await enviar(from, "Audio recebido! Transcrevendo, aguarde...", null, false)
  const transcricao = await transcrever(midia.buffer, midia.mimeType, { origem: "fluxo" })
  if (!transcricao) {
    const ultimaPergunta = retomarUltimaPergunta(u)
    if (ultimaPergunta) {
      return responderComTimer(from, {
        texto: "Nao consegui entender esse audio agora. Vou te manter no ponto em que estavamos.",
        opcoes: [
          { id: "cont_retomar", title: "Continuar" },
          { id: "recomecar", title: "Recomecar" },
          { id: "audio_fluxo_encerrar", title: "Encerrar" }
        ]
      })
    }
    return responderComTimer(from, { texto: "Nao consegui entender esse audio agora. Se preferir, responda por texto.", opcoes: null })
  }

  const decisao = await classificarAcaoAudioFluxo(u, transcricao)
  u._audioFluxoTexto = normalizarTextoCRM(transcricao)
  u._audioFluxoAcao = decisao.acao
  u._audioFluxoResposta = decisao.recomendacao
  u.stage = STAGES.AUDIO_FLUXO_CONFIRMA
  return responderComTimer(from, telaAudioNoFluxo(u._audioFluxoTexto, u._audioFluxoResposta))
}

async function processarUrgenciaOuCorrecao(from, u, text, ehDoc, ehAudio) {
  if (u.stage === STAGES.AGUARDANDO_URGENTE && text && !ehDoc && !ehAudio) {
    if (/^[a-z][a-z0-9_]{1,20}$/.test(text)) {
      u.stage = STAGES.CLIENTE
    } else {
      const mensagemUrgente = normalizarTextoCRM(text)
      await hsCriarNota(u.contatoId, "MENSAGEM URGENTE", `De: ${u.nome} (${from})\nCaso: ${u.numeroCaso}\nArea: ${u.area}\n\n${mensagemUrgente}`)
      await hsMoverStage(u.negocioId, HS_STAGE.ANALISE)
      u.stage = STAGES.CLIENTE
      return responderComTimer(from, { texto: `✅ *Mensagem registrada com urgência!*\n\nNossa equipe será notificada imediatamente. ⚡\n\n📄 Caso: *${u.numeroCaso}*`, opcoes: [{ id:"m_status", title:"📊 Status do caso" }, { id:"m_docs", title:"📎 Enviar documentos" }, { id:"m_inicio", title:"🏠 Menu principal" }] })
    }
  }

  if (u.stage === STAGES.CORRIGIR_VALOR && text) {
    if (u.corrigirCampo) {
      if (u.corrigirCampo === "nome") u[u.corrigirCampo] = formatarNome(text.trim())
      else if (u.corrigirCampo === "cidade") u[u.corrigirCampo] = formatarCidade(text.trim())
      else u[u.corrigirCampo] = normalizarTextoCRM(text)
      await sincronizarContatoNegocioHubSpot(u)
      u.corrigirCampo = null
    }
    u.stage = STAGES.CONFIRMACAO
    return responderComTimer(from, tela_confirmacao(u))
  }

  if (u.stage === STAGES.CORRIGIR_UF) {
    if (REGIOES[text]) { u._regiao = text; return responderComTimer(from, telaUFsRegiao(text)) }
    const val = UF_MAP[text]
    if (val) { u.uf = val; u.stage = STAGES.CONFIRMACAO; return responderComTimer(from, tela_confirmacao(u)) }
    return responderComTimer(from, telaRegioes())
  }

  if (u.stage === STAGES.CORRIGIR_SEL) {
    const mc = { cc_nunca: "Nunca", cc_pouco: "Pouco tempo", cc_1ano: "Mais de 1 ano", cc_muito: "Muitos anos" }
    const mb = { cb_sim: "Sim", cb_nao: "Não" }
    const val = mc[text] || mb[text]
    if (val && u.corrigirCampo) {
      u[u.corrigirCampo] = val
      u.corrigirCampo = null
      u.stage = STAGES.CONFIRMACAO
      return responderComTimer(from, tela_confirmacao(u))
    }
  }

  if (u.stage === STAGES.CONFIRMACAO) {
    if (text === "conf_ok") {
      const numeroCaso = await finalizarCadastro(from, u)
      const docs = getDocumentos(u.area, u.tipo || u.situacao)
      return responderComTimer(from, {
        texto: `🎉 *Cadastro realizado com sucesso!*\n\n📄 *Número do caso:* \`${numeroCaso}\`\n\nUm especialista em *${u.area}* vai analisar sua solicitação e entrará em contato em breve pelo WhatsApp. 💬\n\n⏱️ Prazo estimado: *2 dias úteis*\n\n---\n📋 *Documentos que podem ser necessários:*\n${docs}\n\nVocê pode enviar agora ou depois — fica à vontade!`,
        opcoes: [{ id: "m_docs", title: "📎 Enviar documentos" }, { id: "m_inicio", title: "Menu do cliente" }, { id: "m_encerrar", title: "👋 Encerrar" }]
      })
    }
    if (text === "conf_corrigir") {
      u.stage = STAGES.MENU_CORRECAO
      return responderComTimer(from, {
        texto: "✏️ Qual informação deseja corrigir?",
        opcoes: [
          { id: "cor_nome", title: "👤 Nome" },
          { id: "cor_cidade", title: "📍 Cidade" },
          { id: "cor_uf", title: "🗺️ Estado" },
          { id: "cor_contrib", title: "💼 Contribuição INSS" },
          { id: "cor_benef", title: "🏥 Recebe benefício" },
          { id: "cor_desc", title: "💬 Descrição" }
        ]
      })
    }
    if (text === "conf_menu") {
      u.stage = STAGES.AREA
      salvarEtapa(u, "area")
      return responderComTimer(from, respostaRecomecoMenuPrincipal(u))
    }
  }

  if (u.stage === STAGES.MENU_CORRECAO) {
    if (text === "cor_nome")   { u.corrigirCampo = "nome"; u.stage = STAGES.CORRIGIR_VALOR; return responderComTimer(from, { texto: "Digite o nome correto:", opcoes: null }) }
    if (text === "cor_cidade") { u.corrigirCampo = "cidade"; u.stage = STAGES.CORRIGIR_VALOR; return responderComTimer(from, { texto: "Digite a cidade correta:", opcoes: null }) }
    if (text === "cor_uf")     { u.stage = STAGES.CORRIGIR_UF; return responderComTimer(from, telaRegioes()) }
    if (text === "cor_desc")   { u.corrigirCampo = "descricao"; u.stage = STAGES.CORRIGIR_VALOR; return responderComTimer(from, { texto: "Digite a descrição correta:", opcoes: null }) }
    if (text === "cor_contrib") {
      u.corrigirCampo = "contribuicao"
      u.stage = STAGES.CORRIGIR_SEL
      return responderComTimer(from, { texto: "Corrija a informação sobre contribuição ao INSS:", opcoes: [{ id: "cc_nunca", title: "Nunca" }, { id: "cc_pouco", title: "Pouco tempo" }, { id: "cc_1ano", title: "Mais de 1 ano" }, { id: "cc_muito", title: "Muitos anos" }] })
    }
    if (text === "cor_benef") {
      u.corrigirCampo = "recebeBeneficio"
      u.stage = STAGES.CORRIGIR_SEL
      return responderComTimer(from, { texto: "Você recebe algum benefício?", opcoes: [{ id: "cb_sim", title: "Sim" }, { id: "cb_nao", title: "Não" }] })
    }
  }

  return null
}

async function processar(from, nomeWA, text, msgObj) {
  const u    = getUser(from, nomeWA)
  u.ultimaMsg = Date.now()
  u.modoDigitando = false
  u.temCadastroCompleto = Boolean(u.temCadastroCompleto || podeMostrarMenuCliente(u))
  limparTimer(u)
  limparTimerIncentivoDescricao(u)

  const tipo    = msgObj?.type
  const ehAudio = tipo === "audio"
  const ehDoc   = tipo === "document" || tipo === "image"

  const buttonId = msgObj?.interactive?.button_reply?.id || msgObj?.interactive?.list_reply?.id || ""
  const textoRetomada = String(msgObj?.text?.body || msgObj?.interactive?.button_reply?.title || msgObj?.interactive?.list_reply?.title || text || "").toLowerCase().trim()

  if (u.aguardandoRetomada) {
    const msg = textoRetomada

    if (
      buttonId === "cont_retomar" ||
      buttonId === "ret_auto_continuar" ||
      msg.includes("continuar") ||
      msg.includes("cont")
    ) {
      u.aguardandoRetomada = false
      iniciarTimer(from)
      return retomarFluxo(u)
    }

    if (buttonId === "recomecar" || msg.includes("recome")) {
      u.aguardandoRetomada = false
      if (u.temCadastroCompleto) {
        u.stage = STAGES.CLIENTE
        iniciarTimer(from)
        return menuCliente(u)
      }
      limparDadosCasoAtual(u)
      u.stage = STAGES.AREA
      salvarEtapa(u, "area")
      iniciarTimer(from)
      return menuPrincipal(u)
    }

    if (buttonId === "m_encerrar" || msg.includes("encerrar")) {
      u.aguardandoRetomada = false
      return encerrarAtendimento(u)
    }
  }

  const respostaRetomada = processarRetomadaOuReinicio(from, u, text, buttonId)
  if (respostaRetomada) return respostaRetomada

  const respostaRetomadaAutomatica = await verificarRetomadaAutomatica(from, u)
  if (respostaRetomadaAutomatica) return respostaRetomadaAutomatica

  const respostaMidia = await processarMidia(from, nomeWA, u, msgObj, tipo, ehAudio, ehDoc)
  if (respostaMidia) return respostaMidia

  const respostaAudioFluxo = await processarAudioNoFluxo(from, nomeWA, u, msgObj, tipo, ehAudio)
  if (respostaAudioFluxo) return respostaAudioFluxo

  const respostaUrgenciaOuCorrecao = await processarUrgenciaOuCorrecao(from, u, text, ehDoc, ehAudio)
  if (respostaUrgenciaOuCorrecao) return respostaUrgenciaOuCorrecao

  if (text === "m_encerrar") {
    return responderEncerramento(u)
  }

  if (!ehAudio && !ehDoc && text && u.lastPerguntaPayload?.opcoes?.length && !stageAceitaTextoLivre(u.stage)) {
    const opcoesValidas = new Set((u.lastPerguntaPayload.opcoes || []).map(o => o.id))
    if (!opcoesValidas.has(text)) {
      const respLivre = GROQ_KEY ? await respostaIA(u, text) : null
      return responderComTimer(from, {
        texto: `${respLivre ? respLivre + "\n\n" : ""}Entendi 👍 Vamos continuar de onde paramos.\n\n${u.lastPerguntaPayload.texto}`,
        opcoes: u.lastPerguntaPayload.opcoes
      })
    }
  }

  if (u.stage === STAGES.CONFIRMAR_ENTRADA) {
    if (text === "entrada_corrigir") {
      const origem = u._entradaPendenteOrigem
      const tipo = u._entradaPendenteTipo
      limparEntradaPendente(u)
      u.stage = origem
      iniciarTimer(from)
      if (tipo === "nome") return { texto: origem === "coleta_tel_outro" ? "Tudo bem! Qual é o nome completo da pessoa que está sendo atendida?" : "✍️ Qual é o seu *nome completo*?", opcoes: null }
      if (tipo === "telefone") return { texto: origem === "coleta_tel_wpp_contato" ? "Qual é o WhatsApp com DDD da pessoa que será atendida?" : `Qual é o WhatsApp com DDD de *${u.nome}* para contato da equipe?`, opcoes: null }
      if (tipo === "cidade") return { texto: origem === "coleta_cidade_regiao" ? "Digite a cidade onde você mora" : "📍 Em qual *cidade* você mora?", opcoes: null }
    }
    if (text === "entrada_ok") {
      const origem = u._entradaPendenteOrigem
      const tipo = u._entradaPendenteTipo
      const valor = u._entradaPendenteValor
      limparEntradaPendente(u)
      if (tipo === "nome") {
        u.nome = valor
        u.nomeConfirmado = true
        await sincronizarContatoNegocioHubSpot(u)
        if (origem === "coleta_tel_outro") {
          u.stage = "coleta_tel_wpp"; iniciarTimer(from)
          return { texto: `Qual é o WhatsApp com DDD de *${u.nome}* para contato da equipe?`, opcoes: null }
        }
        u.stage = "coleta_regiao"; iniciarTimer(from)
        return telaRegioes()
      }
      if (tipo === "telefone") {
        u.whatsappContato = valor
        if (origem === "coleta_tel_wpp_contato") {
          u.stage = "coleta_nome"; iniciarTimer(from)
          return { texto: "✍️ Qual é o *nome completo* da pessoa que será atendida?", opcoes: null }
        }
        u.stage = "area"; iniciarTimer(from)
        return {
          texto: `Anotado! 👍\n\nAgora, qual área precisa de ajuda para *${u.nome}*?`,
          opcoes: [{ id: "area_inss", title: "🏥 INSS" }, { id: "area_trab", title: "💼 Trabalhista" }, { id: "area_outros", title: "📋 Outros" }]
        }
      }
      if (tipo === "cidade") {
        u.cidade = valor
        await sincronizarContatoNegocioHubSpot(u)
        if (origem === "coleta_cidade_regiao") {
          u.stage = "coleta_contrib_regiao_v2"; iniciarTimer(from)
          return { texto: "Você já contribuiu para o INSS?", opcoes: [{ id:"col_c1", title:"Nunca" }, { id:"col_c2", title:"Pouco tempo" }, { id:"col_c3", title:"Mais de 1 ano" }, { id:"col_c4", title:"Muitos anos" }] }
        }
        if (origem === "__coleta_cidade_legado__") {
          u.stage = "coleta_regiao"; iniciarTimer(from)
          return telaRegioes()
        }
        u.stage = "coleta_contrib"; iniciarTimer(from)
        return { texto: "💼 Você já contribuiu para o INSS?", opcoes: [{ id:"col_c1", title:"❌ Nunca" }, { id:"col_c2", title:"⏰ Pouco tempo" }, { id:"col_c3", title:"📅 Mais de 1 ano" }, { id:"col_c4", title:"🏆 Muitos anos" }] }
      }
    }
    iniciarTimer(from)
    return {
      texto: "Use uma das opções abaixo para confirmar ou corrigir.",
      opcoes: [
        { id: "entrada_ok", title: "✅ Confirmar" },
        { id: "entrada_corrigir", title: "✏️ Corrigir" }
      ]
    }
  }

  // NOVO CASO CONFIRMA — verificar se o telefone é do cliente
  if (u.stage === "novo_caso_confirma") {
    if (text === "nc_meu") {
      u.whatsappVerificado = true
      u.telefoneEhDoCliente = true
      u.whatsappContato = from
      u.stage = "area"; iniciarTimer(from)
      return {
        texto: `Ótimo! Vamos abrir um novo caso. 😊\n\nQual área precisa de ajuda?`,
        opcoes: [{ id: "area_inss", title: "🏥 INSS" }, { id: "area_trab", title: "💼 Trabalhista" }, { id: "area_outros", title: "📋 Outros" }]
      }
    }
    if (text === "nc_outro") {
      u.whatsappVerificado = true
      u.telefoneEhDoCliente = false
      u.nome = null; u.regiao = null; u.cidade = null; u.uf = null
      u.stage = "coleta_tel_outro"; iniciarTimer(from)
      return { texto: "Tudo bem! Qual é o nome completo da pessoa que está sendo atendida?", opcoes: null }
    }
  }
  if (u.stage === "coleta_tel_outro" && text) {
    const nomeLimpo = formatarNome(limparTextoSomenteLetras(text))
    if (!nomeLimpo || nomeLimpo.length < 3) return responderComTimer(from, { texto: "Informe um nome válido usando apenas letras e espaços.", opcoes: null })
    return prepararConfirmacaoEntrada(from, u, "nome", nomeLimpo, "coleta_tel_outro")
  }
  if (u.stage === "coleta_tel_wpp" && text) {
    const telefone = text.replace(/\D/g, "")
    if (![10,11].includes(telefone.length)) return responderComTimer(from, { texto: "Informe um WhatsApp válido com DDD, contendo 10 ou 11 dígitos.", opcoes: null })
    return prepararConfirmacaoEntrada(from, u, "telefone", telefone, "coleta_tel_wpp")
  }

  // COLETA
  if (u.stage === "coleta_nome" && text) {
    const nomeLimpo = formatarNome(limparTextoSomenteLetras(text))
    if (!nomeLimpo || nomeLimpo.length < 3) return responderComTimer(from, { texto: "Informe um nome válido usando apenas letras e espaços.", opcoes: null })
    return prepararConfirmacaoEntrada(from, u, "nome", nomeLimpo, "coleta_nome")
  }
  if (u.stage === "coleta_regiao") {
    if (!REGIOES[text]) { iniciarTimer(from); return telaRegioes() }
    u._regiao = text; u.regiao = REGIOES[text].label; u.stage = "coleta_uf"; iniciarTimer(from)
    return telaUFsRegiao(text)
  }
  if (u.stage === "coleta_uf") {
    const val = UF_MAP[text]
    if (!val) { iniciarTimer(from); return telaUFsRegiao(u._regiao || "reg_n") }
    u.uf = val; u.stage = "coleta_cidade_regiao"; iniciarTimer(from)
    return { texto: "Digite a cidade onde você mora", opcoes: null }
  }
  if (u.stage === "coleta_cidade_regiao" && text) {
    const cidadeLimpa = formatarCidade(limparTextoSomenteLetras(text))
    if (!cidadeLimpa || cidadeLimpa.length < 2) return responderComTimer(from, { texto: "Informe uma cidade válida usando apenas letras e espaços.", opcoes: null })
    return prepararConfirmacaoEntrada(from, u, "cidade", cidadeLimpa, "coleta_cidade_regiao")
  }
  if (u.stage === "coleta_contrib_regiao_v2") {
    const m = { col_c1: "Nunca", col_c2: "Pouco tempo", col_c3: "Mais de 1 ano", col_c4: "Muitos anos" }
    if (!m[text]) { iniciarTimer(from); return { texto: "Selecione uma opção:", opcoes: Object.entries(m).map(([id, title]) => ({ id, title })) } }
    u.contribuicao = m[text]; u.stage = "coleta_benef"; iniciarTimer(from)
    return { texto: "Você já recebe algum benefício do INSS?", opcoes: [{ id: "col_b1", title: "Sim, recebo" }, { id: "col_b2", title: "Não recebo" }] }
  }
  if (u.stage === "__coleta_benef_regiao_v2__") {
    const m = { col_b1: "Sim", col_b2: "Não" }
    if (!m[text]) { iniciarTimer(from); return { texto: "Selecione uma opção:", opcoes: [{ id: "col_b1", title: "Sim" }, { id: "col_b2", title: "Não" }] } }
    u.recebeBeneficio = m[text]
    if (deveOferecerExplicarTudo(u)) {
      return prepararOfertaExplicarTudoFinal(from, u, STAGES.CONFIRMACAO, null)
    }
    entrarEtapaDescricao(u, STAGES.COLETA_DESC_AUDIO); iniciarTimer(from)
    return { texto: "📝 *Me explique o que está acontecendo.*\n\nQuanto mais detalhes, melhor! 😊\n\n🎙️ Pode *digitar* ou *enviar um áudio* — escolha como preferir.\n\n💡 Se for áudio, fique à vontade para explicar com calma. Tenho todo o tempo do mundo!", opcoes: null }
  }
  if (u.stage === STAGES.DESC_ERRO_TRANSCRICAO) {
    if (text === "desc_corrigir") {
      u._descTemp = null
      entrarEtapaDescricao(u, u._descOrigemStage === "explicar_tudo" ? STAGES.COLETA_DESC_AUDIO : (u._descOrigemStage || STAGES.COLETA_DESC_AUDIO))
      iniciarTimer(from)
      return telaDescreverCaso()
    }
    iniciarTimer(from)
    return {
      texto: "Não consegui transcrever o áudio. Toque em *Corrigir* para enviar outro áudio ou digite sua descrição.",
      opcoes: [
        { id: "desc_corrigir", title: "✏️ Corrigir" }
      ]
    }
  }
  if (u.stage === "coleta_contrib_regiao") {
    const m = { col_c1: "Nunca", col_c2: "Pouco tempo", col_c3: "Mais de 1 ano", col_c4: "Muitos anos" }
    if (!m[text]) { iniciarTimer(from); return { texto: "Selecione uma opção:", opcoes: Object.entries(m).map(([id, title]) => ({ id, title })) } }
    u.contribuicao = m[text]; u.stage = "coleta_benef"; iniciarTimer(from)
    return { texto: "🏥 Você já recebe algum benefício do INSS?", opcoes: [{ id: "col_b1", title: "✅ Sim, recebo" }, { id: "col_b2", title: "❌ Não recebo" }] }
  }
  if (u.stage === "coleta_cidade" && text) {
    const cidadeLimpa = formatarCidade(limparTextoSomenteLetras(text))
    if (!cidadeLimpa || cidadeLimpa.length < 2) return responderComTimer(from, { texto: "Informe uma cidade válida usando apenas letras e espaços.", opcoes: null })
    return prepararConfirmacaoEntrada(from, u, "cidade", cidadeLimpa, "coleta_cidade")
  }
  if (u.stage === "__coleta_nome_legado__" && text) {
    const nomeLimpo = formatarNome(limparTextoSomenteLetras(text))
    if (!nomeLimpo || nomeLimpo.length < 3) return responderComTimer(from, { texto: "Informe um nome válido usando apenas letras e espaços.", opcoes: null })
    return prepararConfirmacaoEntrada(from, u, "nome", nomeLimpo, "coleta_nome")
  }
  if (u.stage === "__coleta_cidade_legado__" && text) {
    const cidadeLimpa = formatarCidade(limparTextoSomenteLetras(text))
    if (!cidadeLimpa || cidadeLimpa.length < 2) return responderComTimer(from, { texto: "Informe uma cidade válida usando apenas letras e espaços.", opcoes: null })
    return prepararConfirmacaoEntrada(from, u, "cidade", cidadeLimpa, "__coleta_cidade_legado__")
  }
  if (u.stage === "__coleta_regiao_legado__") {
    if (!REGIOES[text]) { iniciarTimer(from); return telaRegioes() }
    u._regiao = text; u.stage = "coleta_uf"; iniciarTimer(from)
    return telaUFsRegiao(text)
  }
  if (u.stage === "__coleta_uf_legado__") {
    const val = UF_MAP[text]
    if (!val) { iniciarTimer(from); return telaUFsRegiao(u._regiao || "reg_n") }
    u.uf = val; u.stage = "coleta_contrib"; iniciarTimer(from)
    return { texto: "💼 Você já contribuiu para o INSS?", opcoes: [{ id:"col_c1", title:"❌ Nunca" }, { id:"col_c2", title:"⏰ Pouco tempo" }, { id:"col_c3", title:"📅 Mais de 1 ano" }, { id:"col_c4", title:"🏆 Muitos anos" }] }
  }
  if (u.stage === "coleta_contrib") {
    const m = { col_c1: "Nunca", col_c2: "Pouco tempo", col_c3: "Mais de 1 ano", col_c4: "Muitos anos" }
    if (!m[text]) { iniciarTimer(from); return { texto: "Selecione uma opção:", opcoes: Object.entries(m).map(([id, title]) => ({ id, title })) } }
    u.contribuicao = m[text]; u.stage = "coleta_benef"; iniciarTimer(from)
    return { texto: "🏥 Você já recebe algum benefício do INSS?", opcoes: [{ id: "col_b1", title: "✅ Sim, recebo" }, { id: "col_b2", title: "❌ Não recebo" }] }
  }
  if (u.stage === "coleta_benef") {
    const m = { col_b1: "Sim", col_b2: "Não" }
    if (!m[text]) { iniciarTimer(from); return { texto: "Selecione uma opção:", opcoes: [{ id: "col_b1", title: "Sim" }, { id: "col_b2", title: "Não" }] } }
    u.recebeBeneficio = m[text]
    if (deveOferecerExplicarTudo(u)) {
      return prepararOfertaExplicarTudoFinal(from, u, STAGES.CONFIRMACAO, null)
    }
    entrarEtapaDescricao(u, STAGES.COLETA_DESC_AUDIO); iniciarTimer(from)
    return { texto: "📝 *Me explique o que está acontecendo.*\n\nQuanto mais detalhes, melhor! 😊\n\n🎙️ Pode *digitar* ou *enviar um áudio* — escolha como preferir.\n\n💡 Se for áudio, fique à vontade para explicar com calma. Tenho todo o tempo do mundo!", opcoes: null }
  }
  if ((u.stage === "coleta_desc" || u.stage === "coleta_desc_audio") && text) {
    return iniciarConfirmacaoDescricao(from, u, text, STAGES.COLETA_DESC_AUDIO)
  }

  // DESC_CONFIRMA — confirmar ou voltar para descrição
  if (u.stage === "desc_confirma") {
    if (text === "desc_ok") {
      u.descricao = normalizarTextoCRM((u._descTemp || "").trim())
      u._descTemp  = null
      return respostaAposConfirmarDescricao(from, u)
    }
    if (text === "desc_corrigir") {
      if (u._audioDescBuffer) {
        u.audiosDescCorrigidos.push({
          buffer: u._audioDescBuffer,
          mimeType: u._audioDescMime,
          nome: u._audioDescNome
        })
      }
      u._descTemp = null
      u._audioDescBuffer = null
      u._audioDescMime = null
      u._audioDescNome = null
      entrarEtapaDescricao(u, u._descOrigemStage === "explicar_tudo" ? STAGES.COLETA_DESC_AUDIO : (u._descOrigemStage || STAGES.COLETA_DESC_AUDIO))
      iniciarTimer(from)
      return telaDescreverCaso()
    }
    iniciarTimer(from)
    return {
      texto: "Use uma das opções abaixo para confirmar ou corrigir a transcrição.",
      opcoes: [
        { id: "desc_ok", title: "✅ Confirmar" },
        { id: "desc_corrigir", title: "✏️ Corrigir" }
      ]
    }
  }

  // GATILHO → URGENCIA → COLETA
  if (u.stage === "gatilho") {
    u.stage = "urgencia"; iniciarTimer(from)
    return { texto: "💰 Isso está te prejudicando *financeiramente* hoje?", opcoes: [{ id: "urg_sim", title: "⚠️ Sim, está" }, { id: "urg_nao", title: "✅ Não, consigo esperar" }] }
  }
  if (u.stage === "urgencia") {
    if (text === "urg_sim") { u.urgencia = "alta"; u.score += 3 }
    if (u.whatsappVerificado) return avancarAposTelefoneConfirmado(from, u)
    u.stage = "coleta_verif_tel"; iniciarTimer(from)
    return {
      texto: `📱 Esse número *${from}* é o seu WhatsApp?\n\nPreciso saber para que nossa equipe entre em contato corretamente.`,
      opcoes: [
        { id: "tel_meu",   title: "✅ Sim, é meu" },
        { id: "tel_outro", title: "👤 Não, é de outra pessoa" }
      ]
    }
  }
  if (u.stage === "coleta_verif_tel") {
    if (text === "tel_outro") {
      u.whatsappVerificado = true
      u.telefoneEhDoCliente = false
      u.stage = "coleta_tel_wpp_contato"; iniciarTimer(from)
      return { texto: "Qual é o WhatsApp com DDD da pessoa que será atendida?", opcoes: null }
    }
    u.whatsappVerificado = true
    u.telefoneEhDoCliente = true
    u.whatsappContato = from
    return avancarAposTelefoneConfirmado(from, u)
  }
  if (u.stage === "coleta_tel_wpp_contato" && text) {
    const telefone = text.replace(/\D/g, "")
    if (![10,11].includes(telefone.length)) return responderComTimer(from, { texto: "Informe um WhatsApp válido com DDD, contendo 10 ou 11 dígitos.", opcoes: null })
    return prepararConfirmacaoEntrada(from, u, "telefone", telefone, "coleta_tel_wpp_contato")
  }

  if (u.stage === STAGES.URGENTE_AUDIO_ERRO_TRANSCRICAO) {
    if (text === "urg_audio_corrigir") {
      if (u._urgenteAudioBuffer) {
        await salvarAudioTranscritoNoCaso(u, u._urgenteAudioNome, u._urgenteAudioBuffer, u._urgenteAudioMime, "corrigido")
      }
      u._urgenteAudioBuffer = null
      u._urgenteAudioMime = null
      u._urgenteAudioNome = null
      u._urgenteAudioTexto = null
      u.stage = STAGES.AGUARDANDO_URGENTE
      iniciarTimer(from)
      return { texto: `📩 *Mensagem urgente*\n\nDigite sua mensagem ou envie um áudio agora.\n\nTudo será registrado imediatamente e um advogado será notificado. ⚡\n\n📄 Caso: *${u.numeroCaso}*`, opcoes: null }
    }
  }

  if (u.stage === STAGES.URGENTE_AUDIO_CONFIRMA) {
    if (text === "urg_audio_ok") {
      await salvarAudioTranscritoNoCaso(u, u._urgenteAudioNome, u._urgenteAudioBuffer, u._urgenteAudioMime, "confirmado")
      await hsCriarNota(
        u.contatoId,
        "ÁUDIO URGENTE",
        `De: ${u.nome} (${from})\nCaso: ${u.numeroCaso}\n\nTranscrição:\n"${u._urgenteAudioTexto || "Transcrição indisponível"}"`
      )
      await hsMoverStage(u.negocioId, HS_STAGE.ANALISE)
      u._urgenteAudioBuffer = null
      u._urgenteAudioMime = null
      u._urgenteAudioNome = null
      u._urgenteAudioTexto = null
      u.stage = STAGES.CLIENTE
      return responderComTimer(from, { texto: `✅ *Mensagem registrada com urgência!*\n\nNossa equipe será notificada imediatamente. ⚡\n\n📄 Caso: *${u.numeroCaso}*`, opcoes: [{ id:"m_status", title:"📊 Status do caso" }, { id:"m_docs", title:"📎 Enviar documentos" }, { id:"m_inicio", title:"🏠 Menu principal" }] })
    }
    if (text === "urg_audio_corrigir") {
      await salvarAudioTranscritoNoCaso(u, u._urgenteAudioNome, u._urgenteAudioBuffer, u._urgenteAudioMime, "corrigido")
      u._urgenteAudioBuffer = null
      u._urgenteAudioMime = null
      u._urgenteAudioNome = null
      u._urgenteAudioTexto = null
      u.stage = STAGES.AGUARDANDO_URGENTE
      iniciarTimer(from)
      return { texto: `📩 *Mensagem urgente*\n\nDigite sua mensagem ou envie um áudio agora.\n\nTudo será registrado imediatamente e um advogado será notificado. ⚡\n\n📄 Caso: *${u.numeroCaso}*`, opcoes: null }
    }
    return responderComTimer(from, telaConfirmarUrgente(u._urgenteAudioTexto || ""))
  }

  if (u.stage === STAGES.AUDIO_FLUXO_CONFIRMA) {
    const acao = u._audioFluxoAcao || "continuar"
    if (text === "audio_fluxo_recomecar") {
      u._audioFluxoTexto = null
      u._audioFluxoAcao = null
      u._audioFluxoResposta = null
      return executarRecomecoFluxo(from, u)
    }
    if (text === "audio_fluxo_encerrar") {
      u._audioFluxoTexto = null
      u._audioFluxoAcao = null
      u._audioFluxoResposta = null
      return executarEncerramentoFluxo(u)
    }
    if (text === "audio_fluxo_seguir") {
      u._audioFluxoTexto = null
      u._audioFluxoResposta = null
      u._audioFluxoAcao = null
      if (acao === "recomecar") return executarRecomecoFluxo(from, u)
      if (acao === "encerrar") return executarEncerramentoFluxo(u)
      const ultimaPergunta = retomarUltimaPergunta(u)
      if (ultimaPergunta) {
        iniciarTimer(from)
        return ultimaPergunta
      }
      u.stage = STAGES.AREA
      iniciarTimer(from)
      return { ...telaArea(), perguntaId: "area" }
    }
    return responderComTimer(from, telaAudioNoFluxo(u._audioFluxoTexto || "", u._audioFluxoResposta || "continuar o atendimento"))
  }

  if (u.stage === STAGES.SUGESTAO_FLUXO_OUTRO) {
    if (text === "sug_fluxo" && u._sugestaoFluxo?.categoria) {
      const proxima = aplicarSugestaoFluxoOutro(u, u._sugestaoFluxo.categoria)
      u._sugestaoFluxo = null
      u.stage = proxima.stage
      iniciarTimer(from)
      return { texto: proxima.texto, opcoes: proxima.opcoes }
    }
    if (text === "sug_nao") {
      u._sugestaoFluxo = null
      u.stage = "gatilho"
      iniciarTimer(from)
      return { texto: "Certo! Vamos registrar sua solicitacao.", opcoes: [{ id: "cont", title: "Continuar" }] }
    }
  }

  if (u.stage === STAGES.EXPLICAR_TUDO_OFERTA) {
    if (text === "explicar_tudo") {
      u._descOrigemStage = "explicar_tudo"
      u.stage = STAGES.COLETA_DESC_AUDIO
      iniciarTimer(from)
      return telaDescreverCaso()
    }
    if (text === "seguir_fluxo") {
      const proximoStage = u._proximoStageAposDescricao || "gatilho"
      const proximaPergunta = u._proximaPerguntaAposDescricao
      u._proximoStageAposDescricao = null
      u._proximaPerguntaAposDescricao = null
      u.stage = proximoStage
      iniciarTimer(from)
      if (proximoStage === STAGES.CONFIRMACAO) return tela_confirmacao(u)
      if (proximaPergunta) return proximaPergunta
      return { texto: "Certo! Vamos registrar sua solicitacao.", opcoes: [{ id: "cont", title: "Continuar" }] }
    }
    iniciarTimer(from)
    return telaExplicarTudo()
  }

  if (u.stage === STAGES.SUGESTAO_FLUXO_OUTRO) {
    if (text === "sug_fluxo" && u._sugestaoFluxo?.categoria) {
      const proxima = aplicarSugestaoFluxoOutro(u, u._sugestaoFluxo.categoria)
      u._sugestaoFluxo = null
      u.stage = proxima.stage
      iniciarTimer(from)
      return { texto: proxima.texto, opcoes: proxima.opcoes }
    }
    if (text === "sug_nao") {
      u._sugestaoFluxo = null
      u.stage = "gatilho"
      iniciarTimer(from)
      return { texto: "âœ… Certo! Vamos registrar sua solicitaÃ§Ã£o.", opcoes: [{ id: "cont", title: "â–¶ï¸ Continuar" }] }
    }
  }

  if (u.stage === STAGES.EXPLICAR_TUDO_OFERTA) {
    if (text === "explicar_tudo") {
      u._descOrigemStage = "explicar_tudo"
      u.stage = STAGES.COLETA_DESC_AUDIO
      iniciarTimer(from)
      return telaDescreverCaso()
    }
    if (text === "seguir_fluxo") {
      const proximoStage = u._proximoStageAposDescricao || "gatilho"
      const proximaPergunta = u._proximaPerguntaAposDescricao
      u._proximoStageAposDescricao = null
      u._proximaPerguntaAposDescricao = null
      u.stage = proximoStage
      iniciarTimer(from)
      if (proximoStage === STAGES.CONFIRMACAO) return tela_confirmacao(u)
      if (proximaPergunta) return proximaPergunta
      return { texto: "âœ… Certo! Vamos registrar sua solicitaÃ§Ã£o.", opcoes: [{ id: "cont", title: "â–¶ï¸ Continuar" }] }
    }
    iniciarTimer(from)
    return telaExplicarTudo()
  }

  if (u.stage === STAGES.SUGESTAO_FLUXO_OUTRO) {
    if (text === "sug_fluxo" && u._sugestaoFluxo?.categoria) {
      const proxima = aplicarSugestaoFluxoOutro(u, u._sugestaoFluxo.categoria)
      u._sugestaoFluxo = null
      u.stage = proxima.stage
      iniciarTimer(from)
      return { texto: proxima.texto, opcoes: proxima.opcoes }
    }
    if (text === "sug_nao") {
      u._sugestaoFluxo = null
      u.stage = "gatilho"
      u._proximaPerguntaAposDescricao = { texto: "✅ Certo! Vamos registrar sua solicitação.", opcoes: [{ id: "cont", title: "▶️ Continuar" }] }
      iniciarTimer(from)
      return { texto: "âœ… Certo! Vamos registrar sua solicitaÃ§Ã£o.", opcoes: [{ id: "cont", title: "â–¶ï¸ Continuar" }] }
    }
  }

  if (u.stage === STAGES.EXPLICAR_TUDO_OFERTA) {
    if (text === "explicar_tudo") {
      u._descOrigemStage = "explicar_tudo"
      u.stage = STAGES.COLETA_DESC_AUDIO
      iniciarTimer(from)
      return telaDescreverCaso()
    }
    if (text === "seguir_fluxo") {
      const proximoStage = u._proximoStageAposDescricao || "gatilho"
      const proximaPergunta = u._proximaPerguntaAposDescricao || { texto: "✅ Certo! Vamos registrar sua solicitação.", opcoes: [{ id: "cont", title: "▶️ Continuar" }] }
      u._proximoStageAposDescricao = null
      u._proximaPerguntaAposDescricao = null
      u.stage = proximoStage
      iniciarTimer(from)
      return proximaPergunta
    }
    iniciarTimer(from)
    return telaExplicarTudo()
  }

  // INICIO
  if (u.stage === "inicio") {
    if (podeMostrarMenuCliente(u)) {
      // Cliente retornando — perguntar se quer acompanhar ou abrir novo caso
      u.stage = "inicio_retorno"; iniciarTimer(from)
      const nomeExib = getPrimeiroNome(u)
      return {
        texto: `Que bom te ver novamente, ${nomeExib} 😊\n\nVocê já possui um atendimento conosco.\n\n📄 Caso: *${u.numeroCaso}*\n⚖️ Área: ${u.area}\n\nO que deseja fazer?`,
        opcoes: [
          { id: "ret_acompanhar", title: "📊 Acompanhar meu caso" },
          { id: "ret_novo",       title: "➕ Abrir novo caso" }
        ]
      }
    }
    u.stage = "area"; iniciarTimer(from)
    if (u.nome || u.nomeHubspot) return menuPrincipal(u)
    return { ...telaArea(), perguntaId: "area" }
  }

  // RETORNO — cliente escolhe entre acompanhar ou novo caso
  if (u.stage === "inicio_retorno") {
    if (text === "ret_acompanhar") {
      if (!podeMostrarMenuCliente(u)) {
        u.stage = "area"; iniciarTimer(from)
        return menuPrincipal(u)
      }
      u.stage = "cliente"; iniciarTimer(from)
      return menuCliente(u)
    }
    if (text === "ret_novo") {
      limparDadosCasoAtual(u)
      u.stage = "area"
      iniciarTimer(from)
      return {
        texto: `📋 Certo, ${u.nome ? u.nome.split(" ")[0] : u.nomeWA}! Vamos abrir um novo caso.\n\nQual área precisa de ajuda?`,
        opcoes: [{ id: "area_inss", title: "🏥 INSS" }, { id: "area_trab", title: "💼 Trabalhista" }, { id: "area_outros", title: "📋 Outros" }]
      }
    }
  }

  // AREA
  if (u.stage === "area") {
    if (text === "area_inss") { u.area = "INSS"; u.stage = "inss_menu"; iniciarTimer(from); return { texto: "✅ Certo, vamos cuidar do seu caso!\nQual dessas situações descreve o que está acontecendo?", opcoes: [{ id: "i_novo", title: "🆕 Novo benefício" }, { id: "i_negado", title: "❌ Benefício negado" }, { id: "i_cortado", title: "✂️ Benefício cortado" }] } }
    if (text === "area_trab") { u.area = "Trabalhista"; u.stage = "trab_menu"; iniciarTimer(from); return { texto: "💼 Qual é o seu caso trabalhista?", opcoes: [{ id: "t_dem", title: "👔 Fui demitido" }, { id: "t_dir", title: "💰 Direitos não pagos" }, { id: "t_acid", title: "🚑 Acidente de trabalho" }, { id: "t_ass", title: "😰 Assédio moral" }, { id: "t_out", title: "📋 Outro" }] } }
    if (text === "area_outros") { u.area = "Outros"; u.stage = "outros_menu"; iniciarTimer(from); return { texto: "📋 Como posso te ajudar?", opcoes: [{ id: "o_consul", title: "⚖️ Consultoria jurídica" }, { id: "o_rev", title: "📄 Revisão de documentos" }, { id: "o_out", title: "💬 Outro assunto" }] } }
  }

  // INSS MENU
  if (u.stage === "inss_menu") {
    if (text === "i_novo")    { u.situacao = "novo";    u.stage = "inss_novo";    iniciarTimer(from); return { texto: "🏥 Qual benefício você deseja solicitar?", opcoes: [{ id: "in_apos", title: "👴 Aposentadoria" }, { id: "in_bpc", title: "🤝 BPC / LOAS" }, { id: "in_incap", title: "🏥 Incapacidade" }, { id: "in_dep", title: "👨‍👩‍👧 Dependentes" }, { id: "in_out", title: "📋 Outros" }] } }
    if (text === "i_negado")  { u.situacao = "negado";  u.score += 1; u.stage = "inss_neg_tipo"; iniciarTimer(from); return { texto: "❌ Qual benefício foi negado?", opcoes: [{ id: "ign_apos", title: "👴 Aposentadoria" }, { id: "ign_bpc", title: "🤝 BPC / LOAS" }, { id: "ign_incap", title: "🏥 Incapacidade" }, { id: "ign_dep", title: "👨‍👩‍👧 Dependentes" }, { id: "ign_out", title: "📋 Outros" }] } }
    if (text === "i_cortado") { u.situacao = "cortado"; u.score += 2; u.stage = "inss_cort_tipo"; iniciarTimer(from); return { texto: "✂️ Qual benefício foi cortado?", opcoes: [{ id: "ic_apos", title: "👴 Aposentadoria" }, { id: "ic_bpc", title: "🤝 BPC / LOAS" }, { id: "ic_incap", title: "🏥 Incapacidade" }, { id: "ic_dep", title: "👨‍👩‍👧 Dependentes" }, { id: "ic_out", title: "📋 Outros" }] } }
  }

  // INSS NOVO
  if (u.stage === "inss_novo") {
    const m = { in_apos: "aposentadoria", in_bpc: "bpc", in_incap: "incapacidade", in_dep: "dependentes", in_out: "inss_outros" }
    u.tipo = m[text] || "outros"
    if (text === "in_apos") { u.stage = "inss_apos"; iniciarTimer(from); return { texto: "👴 Qual tipo de aposentadoria?", opcoes: [{ id: "ia_idade", title: "📅 Por idade" }, { id: "ia_tempo", title: "📋 Tempo contribuição" }, { id: "ia_esp", title: "⭐ Especial" }] } }
    if (text === "in_bpc")  { u.stage = "inss_bpc";  iniciarTimer(from); return { texto: "🤝 BPC/LOAS — Qual opção?", opcoes: [{ id: "ib_id", title: "👴 Idoso" }, { id: "ib_def", title: "♿ Deficiência" }] } }
    if (text === "in_incap"){ u.stage = "inss_inc";  iniciarTimer(from); return { texto: "🏥 Qual benefício por incapacidade?", opcoes: [{ id: "ii_aux", title: "🩺 Auxílio-doença" }, { id: "ii_inv", title: "⚠️ Aposentadoria por invalidez" }] } }
    if (text === "in_dep")  { u.stage = "inss_dep";  iniciarTimer(from); return { texto: "👨‍👩‍👧 Qual benefício para dependentes?", opcoes: [{ id: "id_pen", title: "🕊️ Pensão por morte" }, { id: "id_rec", title: "🔒 Auxílio-reclusão" }, { id: "id_out", title: "📋 Outro" }] } }
    if (text === "in_out")  { u.stage = "inss_out";  iniciarTimer(from); return { texto: "📋 Qual opção?", opcoes: [{ id: "io_rev", title: "🔄 Revisão de benefício" }, { id: "io_ctc", title: "📜 Certidão de contribuição" }, { id: "io_pla", title: "🎯 Planejamento" }] } }
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
    return { texto: "📋 Você já deu entrada nesse pedido no INSS?", opcoes: [{ id:"ja_s", title:"Sim" }, { id:"ja_n", title:"Não" }] }
  }
  if (u.stage === "inss_ja") {
    u.detalhe = text === "ja_s" ? "Sim, já deu entrada no INSS" : "Ainda não deu entrada"
    u.stage   = "gatilho"; iniciarTimer(from)
    return { texto: "💡 Casos como o seu são bem comuns aqui.\n\nMuitas vezes conseguimos resolver mais rápido do que a pessoa imagina! 💪", opcoes: [{ id: "cont", title: "▶️ Continuar" }] }
  }

  // INSS NEGADO
  if (u.stage === "inss_neg_tipo") {
    const m = { ign_apos: "Aposentadoria", ign_bpc: "BPC/LOAS", ign_incap: "Incapacidade", ign_dep: "Dependentes", ign_out: "Outros" }
    u.subTipo = m[text] || text; u.stage = "inss_neg_quando"; iniciarTimer(from)
    return { texto: "📅 Quando o benefício foi negado?", opcoes: [{ id: "nq_rec", title: "🕐 Menos de 30 dias" }, { id: "nq_ant", title: "📅 Mais de 30 dias" }] }
  }
  if (u.stage === "inss_neg_quando") {
    u.detalhe = text === "nq_rec" ? "Negado ha menos de 30 dias" : "Negado ha mais de 30 dias"
    u.stage   = "gatilho"; iniciarTimer(from)
    return { texto: "🔍 Vamos analisar seu caso com muito cuidado!", opcoes: [{ id: "cont", title: "▶️ Continuar" }] }
  }

  // INSS CORTADO
  if (u.stage === "inss_cort_tipo") {
    const m = { ic_apos: "Aposentadoria", ic_bpc: "BPC/LOAS", ic_incap: "Incapacidade", ic_dep: "Dependentes", ic_out: "Outros" }
    u.subTipo = m[text] || text; u.stage = "inss_cort_mot"; iniciarTimer(from)
    return { texto: "❓ Você sabe o motivo do corte?", opcoes: [{ id: "cm_n", title: "🤷 Não sei" }, { id: "cm_p", title: "🏥 Falta de perícia" }, { id: "cm_r", title: "💰 Renda acima" }, { id: "cm_o", title: "📋 Outro" }] }
  }
  if (u.stage === "inss_cort_mot") {
    const m = { cm_n: "Motivo desconhecido", cm_p: "Falta de pericia", cm_r: "Renda acima do permitido", cm_o: "Outro" }
    u.detalhe = m[text] || text; u.stage = "inss_cort_rec"; iniciarTimer(from)
    return { texto: "⚠️ Você está sem receber agora?", opcoes: [{ id: "sr_s", title: "🔴 Sim, sem renda" }, { id: "sr_n", title: "🟡 Ainda recebo algo" }] }
  }
  if (u.stage === "inss_cort_rec") {
    if (text === "sr_s") { u.semReceber = true; u.urgencia = "alta"; u.score += 3 }
    u.stage = "inss_cort_qdo"; iniciarTimer(from)
    return { texto: "📅 Quando o benefício foi cortado?", opcoes: [{ id: "cq_r", title: "🕐 Menos de 30 dias" }, { id: "cq_a", title: "📅 Mais de 30 dias" }] }
  }
  if (u.stage === "inss_cort_qdo") {
    u.detalhe += " | " + (text === "cq_r" ? "Cortado ha menos de 30 dias" : "Cortado ha mais de 30 dias")
    u.stage = "gatilho"; iniciarTimer(from)
    return { texto: "💪 Vamos verificar a melhor forma de resolver isso!", opcoes: [{ id: "cont", title: "▶️ Continuar" }] }
  }

  // TRABALHISTA
  if (u.stage === "trab_menu") {
    if (text === "t_dem")  { u.situacao = "Demissao";          u.tipo = "demissao";  u.stage = "trab_dem_tipo"; iniciarTimer(from); return { texto: "Como foi a demissão?", opcoes: [{ id: "td_s", title: "Sem justa causa" }, { id: "td_c", title: "Com justa causa" }, { id: "td_p", title: "Pedido de demissão" }] } }
    if (text === "t_dir")  { u.situacao = "Direitos nao pagos"; u.tipo = "direitos";  u.stage = "trab_dir_tipo"; iniciarTimer(from); return { texto: "💰 Qual direito não foi pago?", opcoes: [{ id: "tdr_f", title: "💼 FGTS" }, { id: "tdr_fe", title: "🏖️ Férias" }, { id: "tdr_13", title: "🎁 13º salário" }, { id: "tdr_h", title: "⏰ Horas extras" }, { id: "tdr_o", title: "📋 Outro" }] } }
    if (text === "t_acid") { u.situacao = "Acidente de trabalho"; u.tipo = "acidente"; u.stage = "trab_acid_af"; iniciarTimer(from); return { texto: "🏥 Você se afastou pelo INSS?", opcoes: [{ id: "af_s", title: "✅ Sim" }, { id: "af_n", title: "❌ Não" }] } }
    if (text === "t_ass")  { u.situacao = "Assedio moral";       u.tipo = "assedio";  u.stage = "trab_ass_s"; iniciarTimer(from); return { texto: "😰 O assédio ainda está acontecendo?", opcoes: [{ id: "as_s", title: "⚠️ Sim, ainda acontece" }, { id: "as_n", title: "✅ Não, já parou" }] } }
    if (text === "t_out")  { u.situacao = "Outros";              u.tipo = "outros";   entrarEtapaDescricao(u, "trab_out_desc"); iniciarTimer(from); return { texto: "✍️ Descreva brevemente seu caso trabalhista:\n\n💡 Pode digitar ou enviar um áudio.", opcoes: null } }
  }
  if (u.stage === "trab_dem_tipo") {
    const m = { td_s: "Sem justa causa", td_c: "Com justa causa", td_p: "Pedido de demissao" }
    u.subTipo = m[text] || text; u.stage = "trab_dem_verb"; iniciarTimer(from)
    return { texto: "💵 Você recebeu todas as verbas rescisórias?", opcoes: [{ id: "tv_s", title: "✅ Sim, recebi" }, { id: "tv_n", title: "❌ Não recebi" }] }
  }
  if (u.stage === "trab_dem_verb") {
    u.detalhe = text === "tv_s" ? "Verbas pagas" : "Verbas nao pagas"; u.stage = "trab_dem_qdo"; iniciarTimer(from)
    return { texto: "⏰ Há quanto tempo foi a demissão?", opcoes: [{ id: "dq_r", title: "🕐 Menos de 30 dias" }, { id: "dq_a", title: "📅 Mais de 30 dias" }] }
  }
  if (u.stage === "trab_dem_qdo") {
    u.detalhe += " | " + (text === "dq_r" ? "menos de 30 dias" : "mais de 30 dias")
    u.stage = "gatilho"; iniciarTimer(from)
    return { texto: "💡 Casos como o seu são bem comuns aqui! 💪", opcoes: [{ id: "cont", title: "▶️ Continuar" }] }
  }
  if (u.stage === "trab_dir_tipo") {
    const m = { tdr_f: "FGTS", tdr_fe: "Ferias", tdr_13: "13 salario", tdr_h: "Horas extras", tdr_o: "Outro" }
    u.subTipo = m[text] || text; u.stage = "trab_dir_pend"; iniciarTimer(from)
    return { texto: "⏳ Isso ainda está pendente?", opcoes: [{ id: "pnd_s", title: "⚠️ Sim, pendente" }, { id: "pnd_n", title: "✅ Já encerrado" }] }
  }
  if (u.stage === "trab_dir_pend") {
    u.detalhe = text === "pnd_s" ? "Pendente" : "Encerrado"
    u.stage = "gatilho"; iniciarTimer(from)
    return { texto: "💡 Casos como o seu são bem comuns aqui! 💪", opcoes: [{ id: "cont", title: "▶️ Continuar" }] }
  }
  if (u.stage === "trab_acid_af") {
    u.subTipo = text === "af_s" ? "Com afastamento INSS" : "Sem afastamento"
    u.stage = "gatilho"; iniciarTimer(from)
    return { texto: "💡 Casos como o seu são bem comuns aqui! 💪", opcoes: [{ id: "cont", title: "▶️ Continuar" }] }
  }
  if (u.stage === "trab_ass_s") {
    u.subTipo = text === "as_s" ? "Assedio em curso" : "Assedio encerrado"; u.stage = "trab_ass_prov"; iniciarTimer(from)
    return { texto: "📂 Você possui provas ou testemunhas?", opcoes: [{ id: "pv_s", title: "✅ Sim, tenho provas" }, { id: "pv_n", title: "❌ Não tenho" }] }
  }
  if (u.stage === "trab_ass_prov") {
    u.detalhe = text === "pv_s" ? "Com provas/testemunhas" : "Sem provas"
    u.stage = "gatilho"; iniciarTimer(from)
    return { texto: "💡 Casos como o seu são bem comuns aqui! 💪", opcoes: [{ id: "cont", title: "▶️ Continuar" }] }
  }
  if (u.stage === "trab_out_desc" && text) {
    return iniciarConfirmacaoDescricao(from, u, text, "trab_out_desc")
  }

  // OUTROS
  if (u.stage === "outros_menu") {
    if (text === "o_consul") { u.situacao = "Consultoria juridica"; u.stage = "out_cons_tipo"; iniciarTimer(from); return { texto: "⚖️ Sobre qual área precisa de orientação?", opcoes: [{ id: "oc_i", title: "🏥 INSS" }, { id: "oc_t", title: "💼 Trabalhista" }, { id: "oc_o", title: "📋 Outra área" }] } }
    if (text === "o_rev")    { u.situacao = "Revisao de documentos"; u.tipo = "revisao"; u.stage = "out_rev_tipo"; iniciarTimer(from); return { texto: "📄 Qual tipo de documento para revisão?", opcoes: [{ id: "or_c", title: "📝 Contrato" }, { id: "or_p", title: "⚖️ Processo" }, { id: "or_o", title: "📋 Outro" }] } }
    if (text === "o_out")    { u.situacao = "Outro assunto"; entrarEtapaDescricao(u, "out_desc"); iniciarTimer(from); return { texto: "💬 Descreva brevemente o que precisa:\n\n💡 Pode digitar ou enviar um áudio.", opcoes: null } }
  }
  if (u.stage === "out_cons_tipo") {
    const m = { oc_i: "INSS", oc_t: "Trabalhista", oc_o: "Outro" }
    u.subTipo = m[text] || text; u.stage = "gatilho"; iniciarTimer(from)
    return { texto: "💡 Casos como o seu são bem comuns aqui! 💪", opcoes: [{ id: "cont", title: "▶️ Continuar" }] }
  }
  if (u.stage === "out_rev_tipo") {
    const m = { or_c: "Contrato", or_p: "Processo", or_o: "Outro" }
    u.subTipo = m[text] || text; u.stage = "gatilho"; iniciarTimer(from)
    return { texto: "💡 Casos como o seu são bem comuns aqui! 💪", opcoes: [{ id: "cont", title: "▶️ Continuar" }] }
  }
  if (u.stage === "out_desc" && text) {
    return iniciarConfirmacaoDescricao(from, u, text, "out_desc")
  }

  // MENU CLIENTE
  if (u.stage === "cliente") {
    if (!podeMostrarMenuCliente(u)) {
      u.stage = "area"
      salvarEtapa(u, "area")
      iniciarTimer(from)
      return respostaRecomecoMenuPrincipal(u)
    }
    if (text === "m_status") {
      iniciarTimer(from)
      const stLbl  = u.urgencia === "alta" ? "⚡ Análise prioritária" : "🔍 Em análise"
      const totD   = getDocumentosLista(u.area, u.tipo || u.situacao).length
      const entD   = (u.docsEntregues || []).length
      const dInfo  = entD >= totD ? "\n✅ Documentos: todos entregues" : `\n📋 Documentos: ${entD} de ${totD} entregues`
      const sitStr = u.situacao ? `${u.situacao}${u.subTipo ? " — " + u.subTipo : ""}` : "—"
      const txt = [
        "📊 *Status do seu caso*","",
        `🔢 Número: *${u.numeroCaso}*`,
        `⚖️ Área: ${u.area}`,
        `📋 Situação: ${sitStr}`,
        `🚦 Status: ${stLbl}`,
        `${u.urgencia==="alta"?"🔴":"🟡"} Prioridade: ${u.urgencia==="alta"?"Alta":"Normal"}`,
        dInfo,"",
        "Nossa equipe está avaliando seu caso com atenção. Assim que houver novidades, entraremos em contato pelo WhatsApp. 💬","",
        "⏱️ Prazo estimado: até *2 dias úteis*."
      ].join("\n")
      return { texto: txt, opcoes: [{ id:"m_docs", title:"📎 Enviar documentos" }, { id:"m_adv", title:"👨‍⚖️ Advogado" }, { id:"m_inicio", title:"Menu do cliente" }, { id:"m_encerrar", title:"👋 Encerrar" }] }
    }
    if (text === "doc_cpf_skip") {
      // Pular CPF — já está no RG
      if (!u.docsEntregues) u.docsEntregues = []
      u.docsEntregues.push("doc_cpf")
      u.docAtualIdx = 0
      u.ultimoArqId = null
      const telaCpf = telaEnvioDoc(u)
      iniciarTimer(from)
      return telaCpf
    }
    if (text === "m_docs") {
      await hsMoverStage(u.negocioId, HS_STAGE.DOCS)
      salvarEtapa(u, "documentos")
      if (!u.docsEntregues) u.docsEntregues = []
      u.docAtualIdx = u.docAtualIdx || 0
      const tela = telaEnvioDoc(u)
      iniciarTimer(from)
      return tela
    }
    if (text === "docs_reenviar") {
      salvarEtapa(u, "documentos")
      if (u.ultimoArqId) {
        await excluirDrive(u.ultimoArqId)
        u.ultimoArqId = null; u.ultimoArqNome = null
        u.docAtualIdx = Math.max(0, (u.docAtualIdx || 1) - 1)
      }
      const pend2 = getDocsPendentes(u)
      const d2    = pend2[0]
      const f2    = (d2?.folhas || ["Foto"])[u.docAtualIdx || 0] || "Foto"
      iniciarTimer(from)
      return { texto: `🔄 Foto anterior removida!\n\nEnvie novamente: *${f2}* do *${d2?.label || "documento"}*\n\n💡 Boa iluminação, sem reflexo, tudo enquadrado.`, opcoes: null }
    }
    if (text === "docs_maisFotos") {
      salvarEtapa(u, "documentos")
      // Não avança para o próximo documento — permanece no atual
      const pend3  = getDocsPendentes(u)
      const d3     = pend3[0]
      const fAtual = (d3?.folhas || ["Foto"])[u.docAtualIdx || 0] || `Foto ${(u.docAtualIdx||0)+1}`
      iniciarTimer(from)
      return { texto: `📸 Ok! Envie mais uma foto de *${d3?.label || "documento"}*\n\nFoto atual: *${fAtual}*\n\n💡 Mesmas orientações: boa iluminação, sem reflexo, enquadrado corretamente.`, opcoes: null }
    }
    if (text === "docs_proxdoc") {
      salvarEtapa(u, "documentos")
      const pend4 = getDocsPendentes(u)
      if (pend4.length > 0) u.docsEntregues.push(pend4[0].id)
      u.docAtualIdx = 0
      u.ultimoArqId = null
      const tela4 = telaEnvioDoc(u)
      iniciarTimer(from)
      return tela4
    }
    if (text === "docs_depois") {
      const nome1 = (u.nome || u.nomeWA).split(" ")[0]
      iniciarTimer(from)
      return { texto: `Sem problema, ${nome1}! 😊\n\nQuando tiver os documentos, é só voltar aqui e tocar em *"Enviar documentos"*.\n\n📁 Caso: *${u.numeroCaso}*`, opcoes: enviarOpcoesPadrao(from, "retorno_docs") }
    }
    if (text === "m_adv") {
      iniciarTimer(from)
      return { texto: "👨‍⚖️ *Falar com advogado*\n\nComo prefere ser atendido?", opcoes: [{ id: "adv_ag", title: "📅 Agendar ligação" }, { id: "adv_urg", title: "⚠️ Mensagem urgente" }, { id: "m_inicio", title: "Menu do cliente" }, { id: "m_encerrar", title: "👋 Encerrar" }] }
    }
    if (text === "adv_ag") {
      await hsMoverStage(u.negocioId, HS_STAGE.AGENDAMENTO)
      await hsCriarNota(u.contatoId, "AGENDAMENTO SOLICITADO", `${u.nome} (${from}) solicitou agendamento.\nCaso: ${u.numeroCaso} | Área: ${u.area}\nLink: ${MEETINGS}`)
      iniciarTimer(from)
      return {
        texto: `📅 *Agendar ligação com advogado*\n\nClique no link abaixo para escolher o melhor horário:\n\n🔗 ${MEETINGS}\n\n✅ Após agendar, você receberá uma *confirmação aqui no WhatsApp* com data e horário.\n\n💡 Dica: Escolha um horário em que você esteja disponível para receber a ligação.\n\n📄 Caso: *${u.numeroCaso}*`,
        opcoes: [
          { id: "adv_urg",  title: "📩 Mensagem urgente" },
          { id: "m_status", title: "📊 Status do caso" },
            { id: "m_inicio", title: "Menu do cliente" },
            { id: "m_encerrar", title: "👋 Encerrar" }
        ]
      }
    }
    if (text === "adv_urg") {
      u.stage = "aguardando_urgente"; iniciarTimer(from)
      return { texto: `📩 *Mensagem urgente*\n\nDigite sua mensagem ou envie um áudio agora.\n\nTudo será registrado imediatamente e um advogado será notificado. ⚡\n\n📄 Caso: *${u.numeroCaso}*`, opcoes: null }
    }
    if (text === "m_novocaso") {
      const nomeExibicao = u.nome
      const cidadeExibicao = u.cidade
      const ufExibicao = u.uf
      limparDadosCasoAtual(u)
      u.nome = nomeExibicao
      u.nomeConfirmado = Boolean(nomeExibicao)
      u.stage = "novo_caso_confirma"
      iniciarTimer(from)
      return {
        texto: `➕ *Abrir novo caso*\n\nVou usar seus dados cadastrados:\n\n👤 ${nomeExibicao || "Nome não informado"}\n📍 ${cidadeExibicao || "Cidade não informada"}${ufExibicao ? " - " + ufExibicao : ""}\n\nEsse telefone *${from}* é o seu número? Ou está entrando em contato por outra pessoa?`,
        opcoes: [
          { id: "nc_meu",    title: "✅ É meu número" },
          { id: "nc_outro",  title: "👤 É de outra pessoa" }
        ]
      }
    }
    if (text === "m_encerrar") {
      return responderEncerramento(u)
    }
    if (text === "m_inicio") {
      iniciarTimer(from)
      if (podeMostrarMenuCliente(u)) return menuCliente(u)
      u.stage = "area"
      salvarEtapa(u, "area")
      return respostaRecomecoMenuPrincipal(u)
    }
    // Detectar intencao de encerrar antes de passar para IA
    if (text) {
      const lower = text.toLowerCase()
      const palavrasEncerrar = ["encerrar","encerra","tchau","ate logo","boa noite","boa tarde","bom dia","obrigado","obrigada","ate mais","pode encerrar","finalizar","finalize","fecha","fechar","ate breve","por hoje"]
      if (palavrasEncerrar.some(p => lower.includes(p))) {
        const nome1 = (u.nome || u.nomeWA).split(" ")[0]
        limparTimer(u)
        return { texto: `Foi um prazer, ${nome1}! Seu caso ${u.numeroCaso} está registrado.\n\nQualquer coisa, é só mandar mensagem. Até logo!`, opcoes: null }
      }
    }
    // Groq IA para perguntas livres
    if (text && GROQ_KEY) {
      const resp = await respostaIA(u, text)
      if (resp) { iniciarTimer(from); return { texto: resp, opcoes: [{ id:"m_status", title:"Status do caso" }, { id:"m_adv", title:"Falar com advogado" }, { id:"m_encerrar", title:"Encerrar atendimento" }, { id:"m_inicio", title:"Menu principal" }] } }
    }
    iniciarTimer(from); return menuCliente(u)
  }

  // FALLBACK
  u.stage = "area"; iniciarTimer(from)
  salvarEtapa(u, "area")
  return respostaRecomecoMenuPrincipal(u)
}

app.get("/", (_, res) => res.send("Oraculum v6.2"))
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
    if (mensagemJaProcessada(message.id)) return res.sendStatus(200)
    const from   = message.from
    const nomeWA = value?.contacts?.[0]?.profile?.name || "Cliente"
    const text   = (message.text?.body || message.interactive?.button_reply?.id || message.interactive?.list_reply?.id || "").trim()
    const resposta = await processar(from, nomeWA, text, message)
    if (deveAtivarModoDigitando(resposta) && users[from]) {
      users[from].modoDigitando = true
      iniciarTimer(from)
    }
    const { texto, opcoes } = resposta
    registrarUltimaPergunta(users[from], resposta)
    agendarPersistenciaUsers()
    if (texto) await enviar(from, texto, opcoes)
    return res.sendStatus(200)
  } catch (err) { logErro("geral", err.message); return res.sendStatus(500) }
})

const PORT = process.env.PORT || 10000
carregarUsersPersistidos()
restaurarTimersPersistidos()
// ──────────────────────────────────────────────────────────────────
// ROTA /agendamento — confirmação de ligação agendada
// Como usar GRATUITAMENTE (sem pagar HubSpot):
//   Opção 1: Make.com (gratuito, 1000 ops/mês):
//     - Crie cenário: HubSpot "Meeting Booked" → HTTP POST → https://seu-dominio.onrender.com/agendamento
//     - Body: { "phone": "{{contact.phone}}", "name": "{{contact.firstname}}", "datetime": "{{meeting.startTime}}", "meetingLink": "{{meeting.joinUrl}}" }
//   Opção 2: n8n (auto-hospedado, 100% gratuito):
//     - Trigger HubSpot → HTTP Request para esta rota
//   Opção 3: Zapier free tier (100 tarefas/mês)
// ──────────────────────────────────────────────────────────────────
app.post("/agendamento", async (req, res) => {
  try {
    const { phone, name, datetime, meetingLink, caseid } = req.body
    if (!phone) return res.sendStatus(400)
    const numero = phone.replace(/\D/g, "")
    const nomeCliente = name || "cliente"
    const dataHora    = datetime || "em breve"
    const linkReag    = meetingLink || MEETINGS

    // Formatar data se vier em ISO
    let dataFormatada = dataHora
    try {
      if (dataHora.includes("T")) {
        const d = new Date(dataHora)
        dataFormatada = d.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" })
      }
    } catch {}

    const msg = [
      "📅 *Agendamento confirmado!*",
      "",
      `✅ Olá, *${nomeCliente}*! Sua ligação com um especialista da Oraculum está confirmada.`,
      "",
      `🗓️ *Data e horário:* ${dataFormatada}`,
      "",
      "📞 Nosso advogado vai te ligar no número cadastrado. Deixe o celular por perto!",
      "",
      "Precisa reagendar?",
      `🔗 ${linkReag}`,
      "",
      "Estamos à disposição! ⚖️"
    ].join("\n")

    await enviar(numero, msg, null, false)

    // Se tiver número do caso, atualizar stage no HubSpot
    if (caseid) {
      for (const [from, u] of Object.entries(users)) {
        if (u.numeroCaso === caseid && u.negocioId) {
          await hsMoverStage(u.negocioId, HS_STAGE.AGENDAMENTO)
          agendarPersistenciaUsers()
          break
        }
      }
    }

    return res.sendStatus(200)
  } catch (e) { logErro("agendamento", e.message); return res.sendStatus(500) }
})

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    persistirUsersAgora()
    process.exit(0)
  })
}

process.on("beforeExit", persistirUsersAgora)

app.listen(PORT, () => console.log(`Oraculum v6.2 — porta ${PORT}`))
