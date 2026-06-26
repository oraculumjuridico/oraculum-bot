// ================================================================
//  ORACULUM ADVOCACIA — v6.4
//  WhatsApp · HubSpot · Google Drive · AssemblyAI · Groq AI
// ================================================================

// ================================================================
//  CONFIG / INIT
// ================================================================

// ================================================================
require("dotenv").config()

const express    = require("express")
const axios      = require("axios")
const { google } = require("googleapis")
const path       = require("path")
const { gerarAudioAtendente } = require("./tts")
const nodemailer = require("nodemailer")
const {
  sanitizarTextoEntrada,
  normalizarStageKey,
  normalizarTextoGatilho,
  ehMensagemEntradaGlobal,
  normalizarNomeCidadeBusca,
  formatarNome,
  formatarCidade,
  normalizarTextoCRM,
  limparTextoSomenteLetras
} = require("./src/utils/text")
const {
  DOCS_EXTRA,
  getDocumentosListaCaso,
  getDocumentosCaso,
  criarContextoDocsCasoAtual,
  aplicarContextoDocsCasoAtual,
  detectarComandoDocumento,
  marcarStatusDocumento,
  garantirListasDocumentos,
  calcularStatusDocumentos,
  getDocsPendentes,
  getDocsFaltantesReenviaveis,
  reabrirDocsFaltantesReenviaveis,
  getDocumentoAtualGuia,
  documentoAtualAceitaTexto,
  textoIndicaDocumentoAusente
} = require("./src/domain/documents-core")
const {
  fraseEnvioDocumentoAudio,
  textoAudioTelaDocumentoCaso,
  imagemPorAreaTipo,
  imagemPorCaso,
  telaDocsPendentesComImagem,
  montarStatusDocumentosVisual,
  telaEnvioDoc,
  IMAGEM_DOCS_FINAL_URL
} = require("./src/domain/documents-ui")
const {
  descricaoRelacaoTerceiroPreAtendimento,
  perguntaAtualPreAtendimento,
  gerarMensagemAcolhimento
} = require("./src/domain/pre-atendimento-ui")
const {
  textoNormalizadoPreAtendimento,
  pareceCasoParaTerceiroPreAtendimento,
  relacaoTerceiroPreAtendimento,
  parecePedidoAdvogadoDiretoPreAtendimento,
  parecePerguntaFuncionalPreAtendimento,
  classificarEntradaPreAtendimento,
  respostaCurtaDuvidaPreAtendimento
} = require("./src/domain/pre-atendimento-classifier")
const {
  classificarAreaAudio
} = require("./src/domain/area-audio-classifier")
const {
  classificarResumoOutro,
  aplicarClassificacaoJuridica,
  gerarPerguntaEsclarecimentoRelato,
  acumularRelato,
  deveEsclarecerRelato,
  aplicarSugestaoFluxoOutro,
  classificarAcaoAudioFluxo,
  extrairNomeAudio,
  extrairCidadeAudio,
  extrairCampoCorrecaoIA,
  consolidarDescricaoCorrecaoIA,
  gerarResumoDescricaoConfirmacao
} = require("./src/domain/audio-legal-ai")
const {
  calcScore,
  scoreEmocional,
  definirTemperatura,
  getTemperaturaLeadHubSpot,
  mapearTemperatura,
  mapearPrioridade,
  mapearTipoCaso
} = require("./src/domain/lead-temperature")
const {
  opcoesStatusCliente,
  montarBarraStatusCliente,
  montarBlocoAgendamentoStatus,
  montarBlocoDocumentosStatus,
  montarTextoStatusCliente,
  montarAudioStatusCliente
} = require("./src/domain/cliente-status-ui")
const {
  configurarClientMenuUi,
  iconeAreaJuridica,
  textoAudioCasosCliente,
  textoAudioResumoCasosCliente,
  deveMostrarBoasVindasMenuCliente,
  textoAudioOpcoesMenuCliente,
  textoAudioSelecaoCaso,
  montarCasosMenuCliente,
  menuCliente
} = require("./src/domain/client-menu-ui")
const {
  montarTextoResumoRetomada
} = require("./src/domain/retomada-summary")
const {
  checklistProducaoAdmin,
  textoResumoDiarioOperacional
} = require("./src/domain/admin-summary-ui")
const {
  configurarAdminCaseUi,
  idadeUltimaInteracaoAdmin,
  minutosParaTexto,
  labelIdadeAdmin,
  resumoCasoAdmin,
  tituloOpcaoCasoAdmin,
  opcoesAposAcaoCasoAdmin
} = require("./src/domain/admin-case-ui")
const {
  numeroPorExtenso,
  formatarSlot,
  formatarSlotAudio
} = require("./src/domain/calendar-format")
const {
  buscarHorariosDisponiveis,
  criarEventoConsulta,
  obterEstadoEventoConsulta
} = require("./src/domain/calendar-scheduling")
const {
  estadoPorExtenso,
  mapearRegiaoPorUF,
  buscarCidadePorNome,
  buscarPorCEP,
  abreviarCidadeBotao
} = require("./src/domain/geo-search")
const {
  criarPastaCliente,
  uploadDrive,
  marcarArquivoDriveSubstituido,
  renomearArquivoDrive,
  uploadPastaAudio,
  salvarAudioTranscritoNoCaso
} = require("./src/domain/drive-files")
const {
  configurarLogging,
  logDebug,
  logContextoExecucao,
  logErro
} = require("./src/utils/logging")
const {
  digitando,
  enviar,
  enviarTemplateWhatsApp,
  enviarAudio,
  enviarImagemWhatsApp,
  ultimosAudiosEnviados
} = require("./src/domain/whatsapp-transport")
const {
  validarAssinaturaMeta,
  validarWebhookInterno
} = require("./src/domain/webhook-security")
const {
  configurarStatePersistence,
  serializarEstado,
  desserializarEstado,
  persistirUsersAgora,
  agendarPersistenciaUsers,
  hidratarUsuarioPersistido,
  carregarUsersPersistidos
} = require("./src/domain/state-persistence")
const {
  transcrever
} = require("./src/domain/assemblyai-transcription")
const {
  configurarHubSpotCore,
  HS,
  hsBuscarPorPhone,
  hsCriarContato,
  hsCriarNegocio,
  hsAssociar,
  filtrarPropsHubSpot,
  hsAtualizarContato,
  hsAtualizarNegocio,
  hsCriarNota,
  hsCriarNotaNegocio
} = require("./src/domain/hubspot-core")
const {
  configurarHubSpotSync,
  hsAtualizarNegocioComEstado,
  atualizarDealstage,
  sincronizarNegocio,
  restaurarEstadoNegocioHubSpot,
  deveSincronizarEstadoHubSpot,
  sincronizarContatoNegocioHubSpot,
  hsBuscarNegocioAbertoDoContato,
  hsBuscarNegocioAbertoInfoDoContato,
  hsListarNegociosAtivosDoContato,
  hsAtualizarEtapaNegocio,
  hsMoverStage,
  hsMoverStageSeguro
} = require("./src/domain/hubspot-sync")
const {
  configurarGroqClientReplies,
  respostaIA,
  respostaIACliente
} = require("./src/domain/groq-client-replies")
const {
  configurarAdminAuth,
  ehWhatsAppAdmin,
  chaveAdminWhatsApp,
  logSegurancaAdmin,
  senhaAdminConfigurada,
  senhaAdminValida,
  adminWhatsAppBloqueado,
  registrarFalhaSenhaAdmin,
  adminWhatsAppAutenticado,
  telaSenhaAdminWhatsApp,
  autenticarAdminWhatsApp,
  bloquearAdminWhatsApp
} = require("./src/domain/admin-auth")

const {
  primeiroNomeCliente,
  getTelefoneContato,
  normalizarNumeroWhatsAppEnvio,
  normalizarTelefone,
  primeiroEUltimoNome,
  normalizarNomeComparacao,
  formatarTelefoneExibicao,
  formatarTelefoneAudio,
  ehNomeAparente,
  extrairNomeDaCorrecaoExplicita,
  parecePuraNegacaoSemNome,
  getPrimeiroNome,
  getPrimeiroNomeRetomada
} = require("./src/domain/phone-name")

const app = express()
const AXIOS_TIMEOUT_MS = Number(process.env.AXIOS_TIMEOUT_MS || 15000)
axios.defaults.timeout = Number.isFinite(AXIOS_TIMEOUT_MS) && AXIOS_TIMEOUT_MS > 0 ? AXIOS_TIMEOUT_MS : 15000
app.use(express.json({
  limit: "1mb",
  verify: (req, _res, buf) => {
    req.rawBody = Buffer.from(buf)
  }
}))
app.use("/audios", express.static(path.join(__dirname, "audios")))

// ================================================================
//  NOTIFICAÇÕES — WhatsApp pessoal + E-mail
// ================================================================
const WHATSAPP_ADMIN   = process.env.WHATSAPP_ADMIN   || ""
const HUBSPOT_PORTAL   = process.env.HUBSPOT_PORTAL   || "51306019"
const GMAIL_USER       = process.env.GMAIL_USER       || ""
const GMAIL_PASS       = process.env.GMAIL_PASS       || ""
const WHATSAPP_TEMPLATE_TERCEIRO = process.env.WHATSAPP_TEMPLATE_TERCEIRO || ""
const WHATSAPP_TEMPLATE_LANG     = process.env.WHATSAPP_TEMPLATE_LANG     || "pt_BR"
const WHATSAPP_TEMPLATE_TERCEIRO_IMAGEM_URL = process.env.WHATSAPP_TEMPLATE_TERCEIRO_IMAGEM_URL || ""
const AUTO_REENGAJAMENTO = String(process.env.AUTO_REENGAJAMENTO || "").toLowerCase() === "true"

// Parceiros por área — adicione aqui quando fechar parceria
// Exemplo: { whatsapp: "5581999999999", email: "parceiro@email.com" }
const PARCEIROS_AREA = {
  // familia: { whatsapp: "", email: "" },
  // penal:   { whatsapp: "", email: "" },
}

function linkHubSpot(negocioId) {
  if (!negocioId) return ""
  return `https://app.hubspot.com/contacts/${HUBSPOT_PORTAL}/deal/${negocioId}`
}

function criarTransporteEmail() {
  if (!GMAIL_USER || !GMAIL_PASS) return null
  return nodemailer.createTransport({
    service: "gmail",
    auth: { user: GMAIL_USER, pass: GMAIL_PASS }
  })
}

async function enviarEmailNotificacao({ assunto, tituloCard, linhas, negocioId }) {
  const transporte = criarTransporteEmail()
  if (!transporte) return
  const link = linkHubSpot(negocioId)
  const itensHtml = linhas.map(l => `<tr><td style="padding:6px 0;color:#555;font-size:14px;">${l}</td></tr>`).join("")
  const html = `
  <div style="background:#f5f0e8;padding:30px;font-family:Arial,sans-serif;">
    <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.1);">
      <div style="background:linear-gradient(135deg,#C9A84C,#a07830);padding:24px 32px;text-align:center;">
        <p style="margin:0;color:#fff;font-size:11px;letter-spacing:2px;text-transform:uppercase;">Oráculum Advocacia</p>
        <h1 style="margin:8px 0 0;color:#fff;font-size:20px;font-weight:700;">${tituloCard}</h1>
      </div>
      <div style="padding:28px 32px;">
        <table width="100%" cellpadding="0" cellspacing="0">${itensHtml}</table>
        ${link ? `<div style="margin-top:24px;text-align:center;"><a href="${link}" style="background:#C9A84C;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:14px;">Ver no HubSpot →</a></div>` : ""}
      </div>
      <div style="background:#f9f6f0;padding:14px 32px;text-align:center;font-size:11px;color:#999;">
        Oráculum Advocacia e Consultoria Jurídica · oraculum.juridico@gmail.com
      </div>
    </div>
  </div>`
  try {
    await transporte.sendMail({ from: `"Oráculum Bot" <${GMAIL_USER}>`, to: GMAIL_USER, subject: assunto, html })
  } catch (e) {
    console.error("[email] Falha ao enviar:", e.message)
  }
}

async function enviarWhatsAppAdmin(mensagem) {
  const destino = normalizarNumeroWhatsAppEnvio(WHATSAPP_ADMIN)
  if (!destino) return
  try {
    await axios.post(
      `https://graph.facebook.com/v19.0/${PHONE_NUMBER_ID}/messages`,
      { messaging_product: "whatsapp", to: destino, type: "text", text: { body: mensagem } },
      { headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}`, "Content-Type": "application/json" } }
    )
  } catch (e) {
    const msg = e.response?.data?.error?.message || e.message
    console.error("[whatsapp-admin] Falha ao notificar:", msg)
  }
}

async function enviarWhatsAppAdmin_para(numero, mensagem) {
  const destino = normalizarNumeroWhatsAppEnvio(numero)
  if (!destino) return
  try {
    await axios.post(
      `https://graph.facebook.com/v19.0/${PHONE_NUMBER_ID}/messages`,
      { messaging_product: "whatsapp", to: destino, type: "text", text: { body: mensagem } },
      { headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}`, "Content-Type": "application/json" } }
    )
  } catch (e) {
    console.error("[whatsapp-parceiro] Falha ao notificar:", e.message)
  }
}

async function notificarMensagemUrgente(u, mensagem, negocioId) {
  const area = u.area || "—"
  const caso = u.numeroCaso || "—"
  const nome = u.nome || "—"
  const cidade = u.cidade ? `${u.cidade}${u.uf ? " - " + u.uf : ""}` : "—"
  const link = linkHubSpot(negocioId)

  // WhatsApp pessoal
  const textoWA = `⚡ *Mensagem urgente* — Caso ${caso}\n\n👤 ${nome}\n📍 ${cidade}\n⚖️ Área: ${area}\n📩 "${mensagem.slice(0, 200)}${mensagem.length > 200 ? "..." : ""}"\n\n🔗 ${link}`
  await enviarWhatsAppAdmin(textoWA)

  // E-mail
  await enviarEmailNotificacao({
    assunto: `⚡ Mensagem urgente — ${nome} (Caso ${caso})`,
    tituloCard: "⚡ Mensagem Urgente Recebida",
    linhas: [
      `<b>👤 Cliente:</b> ${nome}`,
      `<b>📍 Cidade:</b> ${cidade}`,
      `<b>⚖️ Área:</b> ${area}`,
      `<b>📄 Caso:</b> ${caso}`,
      `<b>📩 Mensagem:</b><br><div style="background:#fff8e1;border-left:3px solid #C9A84C;padding:10px 14px;margin-top:6px;font-style:italic;">${mensagem.replace(/\n/g, "<br>")}</div>`
    ],
    negocioId
  })

  // Notificar parceiro se área configurada
  const area_key = (area || "").toLowerCase().replace(/\s+/g, "_")
  const parceiro = PARCEIROS_AREA[area_key]
  if (parceiro?.whatsapp) await enviarWhatsAppAdmin_para(parceiro.whatsapp, textoWA)
}

async function notificarAgendamento(u, slot, duracao, negocioId) {
  const nome = u.nome || "—"
  const caso = u.numeroCaso || "—"
  const area = u.area || "—"
  const cidade = u.cidade ? `${u.cidade}${u.uf ? " - " + u.uf : ""}` : "—"
  const dataHora = slot ? formatarSlot(slot) : "—"
  const duracaoLabel = duracao === 60 ? "1 hora" : `${duracao || 30} minutos`
  const link = linkHubSpot(negocioId)

  // WhatsApp pessoal
  const textoWA = `📅 *Agendamento confirmado* — Caso ${caso}\n\n👤 ${nome}\n📍 ${cidade}\n⚖️ Área: ${area}\n🕐 ${dataHora} (${duracaoLabel})\n\n🔗 ${link}`
  await enviarWhatsAppAdmin(textoWA)

  // E-mail
  await enviarEmailNotificacao({
    assunto: `📅 Agendamento — ${nome} (Caso ${caso})`,
    tituloCard: "📅 Consulta Agendada",
    linhas: [
      `<b>👤 Cliente:</b> ${nome}`,
      `<b>📍 Cidade:</b> ${cidade}`,
      `<b>⚖️ Área:</b> ${area}`,
      `<b>📄 Caso:</b> ${caso}`,
      `<b>🕐 Data/Hora:</b> ${dataHora}`,
      `<b>⏱️ Duração:</b> ${duracaoLabel}`
    ],
    negocioId
  })
}

const {
  VERIFY_TOKEN, WHATSAPP_TOKEN, PHONE_NUMBER_ID,
  HUBSPOT_TOKEN,
  GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN,
  DRIVE_PASTA_CLIENTES_ID,
  GROQ_KEY
} = process.env

const DATA_DIR = path.join(__dirname, "data")
const USERS_STATE_FILE = path.join(DATA_DIR, "users-state.json")

const HS_PIPELINE = "default"

// ================================================================
//  STATE (users, persistência)
// ================================================================

const monitor = { conversas: 0, cadastros: 0, erros: [], inicio: new Date() }
const DEBUG_LOGS = String(process.env.DEBUG_LOGS || "").toLowerCase() === "true"
configurarLogging({ monitor, DEBUG_LOGS })
const FALLBACK_PROCESSAMENTO_TEXTO = "Tive uma dificuldade para entender sua mensagem agora. Pode mandar de novo ou escrever em poucas palavras?"
const MESSAGE_DEDUPE_WINDOW_MS = 10 * 60 * 1000
const MESSAGE_DEDUPE_FALLBACK_WINDOW_MS = 15 * 1000

function sortearAtendente() {
  const atendentes = [
    "Helena",
    "Clara",
    "Beatriz",
    "Isabela",
    "Mariana"
  ]
  return atendentes[Math.floor(Math.random() * atendentes.length)]
}
configurarGroqClientReplies({
  sortearAtendente
})

function criarRespostaFallbackProcessamento() {
  return {
    texto: FALLBACK_PROCESSAMENTO_TEXTO,
    opcoes: null,
    registrarPergunta: false
  }
}

function obterBaseUrlPublica() {
  return sanitizarTextoEntrada(
    process.env.PUBLIC_BASE_URL ||
    process.env.APP_URL ||
    process.env.RENDER_EXTERNAL_URL ||
    process.env.NGROK_URL ||
    ""
  ).replace(/\/+$/, "")
}

function montarUrlPublica(caminho) {
  const base = obterBaseUrlPublica()
  const pathUrl = `/${sanitizarTextoEntrada(caminho).replace(/^\/+/, "")}`
  if (!base) {
    console.warn(`[CONFIG] PUBLIC_BASE_URL/APP_URL/NGROK_URL ausente; URL relativa gerada: ${pathUrl}`)
    return pathUrl
  }
  return `${base}${pathUrl}`
}

function urlAudioAtendente(arquivo) {
  return montarUrlPublica(`/audios/atendentes/${path.basename(arquivo)}`)
}

function etapaValida(etapa) {
  if (!etapa) return false
  const e = String(etapa).toLowerCase().trim()
  return ETAPAS_VALIDAS.has(e)
}

const users = {}
const mensagensProcessadas = new Map()
const sessoesAdminWhatsApp = new Map()
// Fila por usuário — garante que mensagens simultâneas sejam processadas em ordem,
// sem perda de conteúdo quando o cliente envia várias mensagens rapidamente.
const filasMensagens = new Map()
const sessoesAdminAutenticadas = new Map()
const tentativasAdminWhatsApp = new Map()
const revisoesCasosAdmin = new Map()
configurarAdminAuth({
  WHATSAPP_ADMIN,
  sessoesAdminWhatsApp,
  sessoesAdminAutenticadas,
  tentativasAdminWhatsApp,
  normalizarNumeroWhatsAppEnvio
})

function criarChaveMensagemDuplicada(from, text, msgObj = null) {
  const numero = sanitizarTextoEntrada(from) || "-"
  const tipo = sanitizarTextoEntrada(msgObj?.type || "text").toLowerCase() || "text"
  const texto = sanitizarTextoEntrada(text).toLowerCase() || "-"
  const timestamp = sanitizarTextoEntrada(msgObj?.timestamp)
  const janela = timestamp || String(Math.floor(Date.now() / MESSAGE_DEDUPE_FALLBACK_WINDOW_MS))
  return `fallback:${numero}:${tipo}:${texto}:${janela}`
}

function mensagemJaProcessada(messageId, fallbackKey = "") {
  const agora = Date.now()
  for (const [id, ts] of mensagensProcessadas.entries()) {
    if (agora - ts > MESSAGE_DEDUPE_WINDOW_MS) mensagensProcessadas.delete(id)
  }

  const chaves = [sanitizarTextoEntrada(messageId), sanitizarTextoEntrada(fallbackKey)].filter(Boolean)
  if (!chaves.length) return false
  if (chaves.some(chave => mensagensProcessadas.has(chave))) return true

  for (const chave of chaves) mensagensProcessadas.set(chave, agora)
  return false
}

function novoUsuario(nomeWA) {
  return {
    stage: "acolhimento", etapa: STAGES.AUDIO_AGUARDANDO, nomeWA,
    nomePerfilWhatsApp: nomeWA || "Cliente",
    origemCaptacao: "whatsapp",
    nome: null, regiao: null, cidade: null, uf: null,
    area: null, tipo: null, situacao: null, subTipo: null, detalhe: null,
    _docKey: null,
    urgencia: "normal", semReceber: false,
    contribuicao: null, recebeBeneficio: null, descricao: null,
    whatsappVerificado: false, telefoneEhDoCliente: null, whatsappContato: null,
    atendimentoParaTerceiro: false, relacaoComAtendido: null, papelContato: null,
    _nomeTitularPendente: null, _nomeTitularOrigem: null,
    nomeConfirmado: false,
    contatoId: null, negocioId: null, numeroCaso: null,
    pastaDriveId: null, pastaDriveLink: null,
    score: 0, documentosEnviados: false,
    docsEntregues: [], docsAusentes: [], docsPulados: [], docsParciais: [], docsDispensados: [],
    docAtualIdx: 0, ultimoArqId: null, ultimoArqNome: null,
    corrigirCampo: null, historiaIA: [],
    lastPergunta: null, lastPerguntaPayload: null,
    leadIncompletoCapturado: false,
    audiosDescCorrigidos: [],
    assuntoResumo: null,
    _ofereceuExplicarTudo: false,
    _sugestaoFluxo: null,
    _hubspotSyncSnapshot: null,
    _proximoStageAposDescricao: null,
    _proximaPerguntaAposDescricao: null,
    _entradaPendenteTipo: null, _entradaPendenteValor: null, _entradaPendenteOrigem: null,
    atendente: null,
    aguardandoRetomada: false,
    temCadastroCompleto: false,
    jaOfereceuRetomada: false,
    jaIncentivouDescricao: false,
    _retomadaEhLeadFrio: false,
    _stageRetomadaOriginal: null,
    _negocioStageIdPendente: null,
    _fluxoEncerrado: false,
    _descOrigemStage: null,
    _audioFluxoTexto: null, _audioFluxoAcao: null, _audioFluxoResposta: null,
    _urgenteAudioBuffer: null, _urgenteAudioMime: null, _urgenteAudioNome: null, _urgenteAudioTexto: null,
    _retornarParaConfirmacao: false,
    _origemConfirmacao: null,
    _correcaoPendenteCampo: null,
    _correcaoPendenteValor: null,
    _correcaoPendenteExtra: null,
    _correcaoPendenteSubcampo: null,
    _historicoDescricao: [],
    _resumoDescricaoIA: null,
    _resumoDescricaoIABase: null,
    _casoAnteriorCliente: null,
    _casoRecemAberto: false,
    _contextoDocsCasoAtual: null,
    processing: false,
    modoDigitando: false,
    modoTexto: false,
    aguardandoResposta: false,
    _jaEsclareceuRelato: false,
    _jaAcolheuSofrimento: false,
    timer: null, timerIncentivoDescricao: null, ultimaMsg: Date.now()
  }
}

async function resolverUsuarioPorHubSpot(from, nomeWA) {
  const contato = await hsBuscarPorPhone(from)
  const sessaoAtual = users[from] || null
  let u = null
  const nomePerfilWhatsApp = nomeWA || sessaoAtual?.nomePerfilWhatsApp || "Cliente"
  const nomeBase = contato?.id ? (nomeWA || sessaoAtual?.nomeWA || "Cliente") : "Cliente"
  const podeReutilizarSessaoLocalSemHubSpot = Boolean(
    !contato?.id &&
    sessaoAtual &&
    sessaoAtual._hubspotSemContato &&
    !sessaoAtual.contatoId &&
    !sessaoAtual.negocioId &&
    !sessaoAtual.numeroCaso
  )

  if (contato?.id) {
    if (!sessaoAtual) {
      users[from] = novoUsuario(nomeBase)
      monitor.conversas++
    }
    u = users[from]
    u._hubspotSemContato = false
    u.nomeHubspot = contato.properties?.firstname || u.nomeHubspot || null
  } else if (podeReutilizarSessaoLocalSemHubSpot) {
    u = sessaoAtual
  } else {
    if (sessaoAtual) {
      limparTimer(sessaoAtual)
      limparTimerIncentivoDescricao(sessaoAtual)
    } else {
      monitor.conversas++
    }
    u = novoUsuario(nomeBase)
    users[from] = u
    u._hubspotSemContato = true
  }

  if (!u._numero && from) u._numero = from
  u.nomeWA = nomeBase
  u.nomePerfilWhatsApp = nomePerfilWhatsApp
  if (!contato?.id) {
    // Só zera o nome se ainda não foi confirmado pelo usuário nesta sessão
    if (!u.nomeConfirmado) {
      u.nome = null
      u.nomeHubspot = null
    }
    u.nomeConfirmado = u.nomeConfirmado || false
    u._hubspotSemContato = true
  } else {
    u._hubspotSemContato = false
  }
  u._numero = from
  agendarPersistenciaUsers()

  return { contato, u }
}

function salvarEtapa(numero, etapa) {
  const u = users[numero]
  if (!u) return STAGES.AUDIO_AGUARDANDO

const etapaNormalizada = String(etapa).toLowerCase().trim()

if (!etapaValida(etapaNormalizada)) {
  logErro("estado", `Tentativa de salvar etapa invalida para ${numero}: ${etapaNormalizada}`)
  return obterEtapaSegura(numero)
}

u.etapa = etapaNormalizada
  logDebug("📍 Salvando etapa:", u.etapa)
  return u.etapa
}

function obterEtapaSegura(numero) {
  const u = users[numero]
  const etapaAtual = u?.etapa
  if (etapaValida(etapaAtual)) return etapaAtual
  logDebug(`⚠️ Fallback de etapa para relato livre: ${numero} (${etapaAtual || "vazia"})`)
  if (u) u.etapa = STAGES.AUDIO_AGUARDANDO
  return STAGES.AUDIO_AGUARDANDO
}

function podeRetomar(numero) {
  return !users[numero]?.aguardandoResposta
}

// Formata texto livre para o CRM: Title Case + sem acentos

function setStage(u, newStage) {
  const stageAtual = normalizarStageKey(u?.stage)
  const stageNormalizado = normalizarStageKey(newStage)

  if (!STAGE_VALUES.has(stageNormalizado)) {
    logErro("STAGE_INVALIDO", "stage inválido detectado")
    logContextoExecucao({
      from: u?._numero,
      stage: stageAtual || "-",
      flow: "setStage",
      msg: stageNormalizado || sanitizarTextoEntrada(newStage) || "-"
    })
    return u?.stage
  }

  if (stageNormalizado === STAGES.CLIENTE && !u?.numeroCaso) {
    logDebug("[BLOCK] acesso indevido ao menu cliente sem numeroCaso")
    Reflect.set(u, "stage", STAGES.AUDIO_AGUARDANDO)
    void atualizarDealstage(u)
    return u.stage
  }

  logDebug(`[TRANSITION] ${stageAtual || "-"} -> ${stageNormalizado} | USER: ${u?._numero || "-"}`)
  Reflect.set(u, "stage", stageNormalizado)
  void atualizarDealstage(u)
  return u.stage
}

// ================================================================
//  STAGES
// ================================================================

const STAGES = {
  INICIO: "inicio",
  // Novo fluxo humanizado
  ACOLHIMENTO: "acolhimento",
  ESCOLHA_CANAL: "escolha_canal",
  AUDIO_OPCOES: "audio_opcoes",
  AUDIO_AGUARDANDO: "audio_aguardando",
  AUDIO_PROCESSANDO: "audio_processando",
  AUDIO_CONFIRMAR_TRANSCRICAO: "audio_confirmar_transcricao",
  AUDIO_CONFIRMAR_AREA: "audio_confirmar_area",
  AUDIO_CONFIRMAR_AREA_CANAL: "audio_confirmar_area_canal",
  AUDIO_CONFIRMAR_DADOS: "audio_confirmar_dados",
  ACOLHIMENTO_MODO: "acolhimento_modo",
  ACOLHIMENTO_PARA_QUEM: "acolhimento_para_quem",
  ACOLHIMENTO_NOME_CONTATO: "acolhimento_nome_contato",
  ACOLHIMENTO_CONFIRMA_NOME_CONTATO: "acolhimento_confirma_nome_contato",
  ACOLHIMENTO_NOME: "acolhimento_nome",
  ACOLHIMENTO_CONFIRMA_NOME: "acolhimento_confirma_nome",
  ACOLHIMENTO_CONFIRMA_TITULAR_NOME: "acolhimento_confirma_titular_nome",
  ACOLHIMENTO_CONFIRMA_WHATSAPP: "acolhimento_confirma_whatsapp",
  ACOLHIMENTO_CONFIRMA_WHATSAPP_OUTRO: "acolhimento_confirma_whatsapp_outro",
  ACOLHIMENTO_CIDADE: "acolhimento_cidade",
  ACOLHIMENTO_CEP: "acolhimento_cep",
  ESCOLHA_AREA: "escolha_area",
  ENTENDIMENTO_INICIAL: "entendimento_inicial",
  DIRECIONAMENTO: "direcionamento",
  // Fim novo fluxo
  AREA: "area",
  NOME: "nome",
  CIDADE: "cidade",
  DESCRICAO_CASO: "descricao_caso",
  DOCUMENTOS: "documentos",
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
  AGENDAMENTO_HORARIO: "agendamento_horario",
  AGENDAMENTO_DURACAO: "agendamento_duracao",
  AGENDAMENTO_CONFIRMAR: "agendamento_confirmar",
  AUDIO_FLUXO_CONFIRMA: "audio_fluxo_confirma",
  CONFIRMAR_ENTRADA: "confirmar_entrada",
  CONFIRMACAO: "confirmacao",
  MENU_CORRECAO: "menu_correcao",
  CORRIGIR_VALOR: "corrigir_valor",
  CORRIGIR_UF: "corrigir_uf",
  CORRIGIR_SEL: "corrigir_sel",
  CONFIRMAR_CORRECAO: "confirmar_correcao",
  INICIO_RETORNO: "inicio_retorno",
  NOVO_CASO_CONFIRMA: "novo_caso_confirma",
  RETOMADA_AUTOMATICA: "retomada_automatica",
  RETOMADA_MENU: "retomada_menu",
  RESUMO_ATENDIMENTO: "resumo_atendimento",
  RESUMO_RETOMADA: "resumo_retomada",
  COLETA_NOME: "coleta_nome",
  COLETA_REGIAO: "coleta_regiao",
  COLETA_UF: "coleta_uf",
  COLETA_CIDADE: "coleta_cidade",
  COLETA_CIDADE_REGIAO: "coleta_cidade_regiao",
  COLETA_CONTRIB: "coleta_contrib",
  COLETA_CONTRIB_REGIAO: "coleta_contrib_regiao",
  COLETA_CONTRIB_REGIAO_V2: "coleta_contrib_regiao_v2",
  COLETA_BENEF: "coleta_benef",
  COLETA_BENEF_REGIAO_V2: "__coleta_benef_regiao_v2__",
  COLETA_NOME_LEGADO: "__coleta_nome_legado__",
  COLETA_CIDADE_LEGADO: "__coleta_cidade_legado__",
  COLETA_REGIAO_LEGADO: "__coleta_regiao_legado__",
  COLETA_UF_LEGADO: "__coleta_uf_legado__",
  COLETA_VERIF_TEL: "coleta_verif_tel",
  COLETA_TEL_OUTRO: "coleta_tel_outro",
  COLETA_TEL_WPP: "coleta_tel_wpp",
  COLETA_TEL_WPP_CONTATO: "coleta_tel_wpp_contato",
  COLETA_TEL_WPP_CONFIRMA: "coleta_tel_wpp_confirma",
  GATILHO: "gatilho",
  URGENCIA: "urgencia",
  INSS_MENU: "inss_menu",
  INSS_NOVO: "inss_novo",
  INSS_NEG_TIPO: "inss_neg_tipo",
  INSS_CORT_TIPO: "inss_cort_tipo",
  INSS_APOS: "inss_apos",
  INSS_BPC: "inss_bpc",
  INSS_INC: "inss_inc",
  INSS_DEP: "inss_dep",
  INSS_OUT: "inss_out",
  INSS_JA: "inss_ja",
  INSS_NEG_QUANDO: "inss_neg_quando",
  INSS_CORT_MOT: "inss_cort_mot",
  INSS_CORT_REC: "inss_cort_rec",
  INSS_CORT_QDO: "inss_cort_qdo",
  TRAB_MENU: "trab_menu",
  TRAB_DEM_TIPO: "trab_dem_tipo",
  TRAB_DEM_VERB: "trab_dem_verb",
  TRAB_DEM_QDO: "trab_dem_qdo",
  TRAB_DIR_TIPO: "trab_dir_tipo",
  TRAB_DIR_PEND: "trab_dir_pend",
  TRAB_ACID_AF: "trab_acid_af",
  TRAB_ASS_S: "trab_ass_s",
  TRAB_ASS_PROV: "trab_ass_prov",
  TRAB_OUT_DESC: "trab_out_desc",
  OUTROS_MENU: "outros_menu",
  OUT_CONS_TIPO: "out_cons_tipo",
  OUT_REV_TIPO: "out_rev_tipo",
  OUT_DESC: "out_desc",
  ASSESSORIA_INICIAL: "assessoria_inicial",
  CORRIGIR_DADOS: "corrigir_dados",
  // Mini-stages de edição com retorno automático para confirmação
  EDITAR_NOME: "editar_nome",
  EDITAR_CIDADE: "editar_cidade",
  EDITAR_AREA: "editar_area",
  EDITAR_SITUACAO: "editar_situacao",
  EDITAR_DETALHE: "editar_detalhe",
  EDITAR_URGENCIA: "editar_urgencia",
  EDITAR_DESCRICAO: "editar_descricao",
  CONFIRMAR_CORRECAO_NOME: "confirmar_correcao_nome",
  CONFIRMAR_CORRECAO_CIDADE: "confirmar_correcao_cidade",
  // Revalidação progressiva após Recomeçar
  REVALIDA_NOME: "revalida_nome",
  REVALIDA_CIDADE: "revalida_cidade",
  REVALIDA_WHATSAPP: "revalida_whatsapp"
}

const STAGE_VALUES = new Set(Object.values(STAGES).map(normalizarStageKey))
const ETAPAS_NAO_RETOMAVEIS = new Set([
  STAGES.INICIO,
  STAGES.CLIENTE,
  STAGES.RETOMADA_AUTOMATICA,
  STAGES.RETOMADA_MENU,
  STAGES.RESUMO_ATENDIMENTO,
  STAGES.RESUMO_RETOMADA,
  STAGES.INICIO_RETORNO
].map(normalizarStageKey))
const ETAPAS_VALIDAS = new Set([...STAGE_VALUES].filter(stage => !ETAPAS_NAO_RETOMAVEIS.has(stage)))
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
configurarStatePersistence({
  DATA_DIR,
  USERS_STATE_FILE,
  users,
  monitor,
  novoUsuario,
  gerarBriefingCaso,
  podeMostrarMenuCliente,
  etapaValida,
  STAGES
})

// ================================================================
//  NOVO FLUXO HUMANIZADO - FUNÇÕES AUXILIARES
// ================================================================

async function telaConfirmarTranscricao(from, atendente, transcricao, area) {
  const preview = String(transcricao || "").trim()
  const previewExibir = preview.slice(0, 360) + (preview.length > 360 ? "..." : "")

  try {
    const ogg = await gerarAudioAtendente(atendente,
      `Recebi seu áudio. Ouvi o seguinte: "${preview.slice(0, 200)}${preview.length > 200 ? "..." : ""}". Está correto? Se quiser, pode confirmar, enviar um novo áudio ou corrigir digitando.`)
    await enviarAudio(from, urlAudioAtendente(ogg))
    await new Promise(r => setTimeout(r, 4000))
  } catch (e) { logErro("tts", "Falha áudio confirmar transcrição", e) }

  return {
    texto: `🎙️ *Recebi seu áudio!*\n\nIsto é o que entendi:\n\n_"${previewExibir}"_\n\nO que deseja fazer?`,
    opcoes: [
      { id: "audio_transcricao_ok", title: "✅ Confirmar envio" },
      { id: "audio_transcricao_novo", title: "🔁 Enviar novo áudio" },
      { id: "audio_transcricao_texto", title: "✍️ Corrigir digitando" }
    ]
  }
}

async function telaConfirmarArea(from, atendente, area) {
  try {
    const ogg = await gerarAudioAtendente(atendente,
      `Identifiquei que seu caso é sobre ${area}. Você tem duas opções. Primeira: Sim, está certo. Segunda: Explicar melhor a situação, se a área parecer errada.`)
    await enviarAudio(from, urlAudioAtendente(ogg))
    await new Promise(r => setTimeout(r, 4000))
  } catch (e) { logErro("tts", "Falha áudio confirmar área", e) }

  return {
    texto: `⚖️ Identifiquei que seu caso é sobre *${area || "Outros"}*.\n\nEstá correto?`,
    opcoes: [
      { id: "audio_area_sim", title: "✅ Sim, está certo" },
      { id: "audio_area_nao", title: "✏️ Explicar melhor" }
    ]
  }
}

async function telaConfirmarAreaAudio(from, u, origemTexto = false) {
  try {
    const textoAudio = origemTexto
      ? `Identifiquei que seu caso é sobre ${u.area || "Outros"}. Está correto? Primeira opção: Sim, está certo. Segunda opção: Explicar melhor a situação. Terceira opção: Corrigir o texto.`
      : `Identifiquei que seu caso é sobre ${u.area || "Outros"}. Está correto? Primeira opção: Sim, está certo. Segunda opção: Explicar melhor a situação.`
    const ogg = await gerarAudioAtendente(u.atendente, textoAudio)
    await enviarAudio(from, urlAudioAtendente(ogg))
    await new Promise(r => setTimeout(r, 4000))
  } catch (e) { logErro("tts", "Falha áudio confirmar área audio", e) }

  const opcoes = origemTexto
    ? [
        { id: "audio_area_canal_sim", title: "✅ Sim, está certo" },
        { id: "audio_area_canal_nao", title: "✏️ Explicar melhor" },
        { id: "audio_transcricao_texto", title: "✏️ Corrigir texto" }
      ]
    : [
        { id: "audio_area_canal_sim", title: "✅ Sim, está certo" },
        { id: "audio_area_canal_nao", title: "✏️ Explicar melhor" }
      ]

  return {
    texto: `⚖️ Identifiquei que seu caso é sobre *${u.area || "Outros"}*.\n\nEstá correto?`,
    opcoes
  }
}

function formatarSituacaoJuridica(situacao, tipo, subTipo) {
  const mapa = {
    // INSS
    "cortado":               "Benefício previdenciário cancelado indevidamente",
    "negado":                "Benefício previdenciário indeferido pelo INSS",
    "novo":                  "Solicitação de novo benefício previdenciário",
    "revisao":               "Revisão de benefício previdenciário",
    // Trabalhista
    "Demissao":              "Demissão sem justa causa",
    "demissao":              "Demissão sem justa causa",
    "Direitos nao pagos":    "Direitos trabalhistas não pagos",
    "direitos nao pagos":    "Direitos trabalhistas não pagos",
    "Acidente de trabalho":  "Acidente de trabalho com afastamento",
    "acidente de trabalho":  "Acidente de trabalho com afastamento",
    "Assedio moral":         "Assédio moral no ambiente de trabalho",
    "assedio moral":         "Assédio moral no ambiente de trabalho",
    // Outros
    "Consultoria juridica":  "Consultoria jurídica especializada",
    "consultoria juridica":  "Consultoria jurídica especializada",
    "Revisao de documentos": "Revisão e análise de documentos jurídicos",
    "revisao de documentos": "Revisão e análise de documentos jurídicos",
    "Outro assunto":         "Outro assunto jurídico",
    "Outros":                "Outros casos jurídicos",
    "outros":                "Outros casos jurídicos",
  }
  const chave = (situacao || tipo || subTipo || "").trim()
  return mapa[chave] || (chave
    ? chave.charAt(0).toUpperCase() + chave.slice(1).replace(/_/g, " ")
    : "—")
}

function formatarDetalheJuridico(detalhe, assuntoResumo, descricao = "") {
  const d = (detalhe || assuntoResumo || descricao || "").trim()
  if (!d) return "—"
  const limite = d.length > 140 ? d.slice(0, 137).trimEnd() + "..." : d
  const texto = limite.charAt(0).toUpperCase() + limite.slice(1)
  return texto.endsWith(".") || texto.endsWith("!") || texto.endsWith("?")
    ? texto
    : texto + "."
}

async function telaConfirmarDadosAudio(from, u) {
  // No fluxo de terceiro, quem está no WhatsApp é nomeContato (ex: José),
  // não a pessoa atendida (u.nome = Alberina).
  const primeiroNome = u.atendimentoParaTerceiro && u.nomeContato
    ? u.nomeContato.split(" ")[0]
    : primeiroNomeCliente(u) || "você"
  const primeiroNomeAtendido = u.atendimentoParaTerceiro && u.nome
    ? u.nome.split(" ")[0]
    : null
  const urgenciaLabel = { alta: "Alta 🔴", normal: "Moderada 🟡", baixa: "Baixa 🟢" }
  const urgenciaVoz   = { alta: "alta", normal: "moderada", baixa: "baixa" }

  // Só envia áudio se o usuário NÃO está no modo texto
  if (!u.modoTexto) {
    try {
      const situacaoVoz = formatarSituacaoJuridica(u.situacao, u.tipo, u.subTipo)
      const detalheVoz  = formatarDetalheJuridico(u.detalhe, u.assuntoResumo, u.descricao || u._audioCanalTranscricao || u._resumoDescricaoIA)
      const cidadeVoz   = u.cidade && u.uf
        ? `${u.cidade}, ${estadoPorExtenso(u.uf) || u.uf}`
        : u.cidade || "não informada"
      const areaVoz = u.area || "não identificada"
      const urgVoz  = urgenciaVoz[u.urgencia] || "moderada"
      const whatsappVoz = formatarTelefoneAudio(u.whatsappContato || from || "")
      const briefingVoz = gerarBriefingCaso(u)
      const proximaEtapaVoz = proximaEtapaConfirmacao(u, briefingVoz)

      const _comSofrimento = u._jaAcolheuSofrimento === true
      let textoAudio = _comSofrimento
        ? `${primeiroNome ? primeiroNome + ", " : ""}vou confirmar os dados registrados. `
        : primeiroNomeAtendido
          ? `${primeiroNome}, vou confirmar os dados de ${primeiroNomeAtendido} com você. `
          : `${primeiroNome}, vou confirmar seus dados com você. `
      textoAudio += _comSofrimento
        ? `O caso envolve ${areaVoz}, com urgência ${urgVoz}. `
        : `Entendi que o caso envolve ${areaVoz}, com urgência ${urgVoz}. Depois da confirmação, ${proximaEtapaVoz}. `
      textoAudio += `Nome: ${u.nome || "não informado"}. `
      textoAudio += `WhatsApp: ${whatsappVoz}. `
      textoAudio += `Cidade: ${cidadeVoz}. `
      textoAudio += `Área jurídica: ${areaVoz}. `
      if (situacaoVoz && situacaoVoz !== "—") textoAudio += `Situação: ${situacaoVoz}. `
      if (detalheVoz  && detalheVoz  !== "—") textoAudio += `Detalhe: ${detalheVoz}. `
      textoAudio += `Urgência: ${urgVoz}. `
      textoAudio += _comSofrimento
        ? `Confirme quando estiver pronto. Primeira opção: Confirmar. Segunda opção: Corrigir dados. Terceira opção: Voltar.`
        : `Tudo está correto? Primeira opção: Confirmar. Segunda opção: Corrigir dados. Terceira opção: Voltar.`

      const ogg = await gerarAudioAtendente(u.atendente, textoAudio)
      await enviarAudio(from, urlAudioAtendente(ogg))
      // Delay proporcional ao tamanho do áudio (fluxo "para terceiro" tem texto mais longo
      // e 8s fixos não eram suficientes, fazendo a tela de confirmação atropelar o áudio).
      const delayAudio = Math.max(8000, textoAudio.length * 55)
      await new Promise(r => setTimeout(r, delayAudio))
    } catch (e) { logErro("tts", "Falha áudio confirmar dados", e) }
  }

  // Para terceiro: nome deve ser sempre o da pessoa atendida (u.nome), nunca do contato.
  // Se u.nome estiver vazio num fluxo de terceiro, sinaliza explicitamente para o usuário corrigir.
  const nome = u.atendimentoParaTerceiro
    ? (u.nome || "⚠️ não informado — corrija antes de confirmar")
    : (u.nome || u.nomeContato || "—")
  const whatsapp = formatarTelefoneExibicao(u.whatsappContato || from || "")
  // formato padronizado de cidade - "Cidade, UF"
  const cidade = u.cidade && u.uf ? `${u.cidade}, ${u.uf}` : u.cidade || "—"
  const descPreview = await gerarResumoDescricaoConfirmacao(u)

  const situacaoFormatada = formatarSituacaoJuridica(u.situacao, u.tipo, u.subTipo)
  const detalheBase = u.detalhe || u.assuntoResumo || descPreview || u.descricao || u._audioCanalTranscricao
  const detalheFormatado  = formatarDetalheJuridico(detalheBase, null)

  // Tom sóbrio na tela quando sofrimento foi detectado
  const _camposTela = [
    `👤 *Nome:* ${nome}`,
    (u.atendimentoParaTerceiro && u.nomeContato) ? `👥 *Aberto por:* ${u.nomeContato}` : null,
    `📱 WhatsApp: *${whatsapp || "—"}*`,
    `📍 *Cidade:* ${cidade}`,
    `⚖️ *Área:* ${u.area || "—"}`,
    situacaoFormatada && situacaoFormatada !== "—" ? `📌 *Situação:* ${situacaoFormatada}` : null,
    detalheFormatado  && detalheFormatado  !== "—" ? `🔎 *Detalhe:* ${detalheFormatado}`  : null,
    `⚡ *Urgência:* ${urgenciaLabel[u.urgencia] || "Moderada 🟡"}`,
    descPreview && descPreview !== "—" ? `💬 *Descrição:* ${descPreview}` : null,
  ].filter(Boolean).join("\n")
  const textoConfirmacao = u._jaAcolheuSofrimento
    ? `●●●●●● Etapa 6 de 6 · *Confirmação*\n\n*Confira seus dados:*\n\n${_camposTela}\n\nQuando confirmar, seu caso será registrado e nossa equipe será notificada.`
    : `●●●●●● ✅ Etapa 6 de 6 · *Confirmação*\n\n✅ *Confira seus dados antes de confirmar:*\n\n${_camposTela}\n\n*Ao confirmar, seu caso será registrado oficialmente e nossa equipe será notificada.*\n\nTudo está correto?`
  const opcoesConfirmacao = [
    { id: "audio_dados_confirmar", title: "✅ Confirmar" },
    { id: "audio_dados_corrigir", title: "✏️ Corrigir" },
    { id: "conf_menu", title: "⬅️ Voltar" }
  ]
  const imagemUrl = IMAGEM_CONFIRMACAO_URL || "https://i.imgur.com/JhM9azm.png"
  try {
    await enviarImagemWhatsApp(from, imagemUrl, textoConfirmacao, opcoesConfirmacao)
    return { texto: null, opcoes: null }
  } catch (e) {
    logErro("confirmacao", "Falha ao enviar imagem de confirmacao audio", e)
    return { texto: textoConfirmacao, opcoes: opcoesConfirmacao }
  }
}

async function enviarAudioPedidoCidade(from, atendente, opcoes = {}) {
  const { nomeTerceiro = null } = opcoes
  if (!from || !atendente) return
  try {
    const texto = nomeTerceiro
      ? `Agora preciso saber onde ${nomeTerceiro} mora. Você pode enviar um CEP, digitar o nome da cidade, ou enviar um áudio falando o nome da cidade.`
      : `Agora preciso saber onde você mora. Você pode enviar um CEP, digitar o nome da sua cidade, ou enviar um áudio falando o nome da cidade.`
    const ogg = await gerarAudioAtendente(atendente, texto)
    await enviarAudio(from, urlAudioAtendente(ogg))
    ultimosAudiosEnviados.set(String(from), Date.now())
    await new Promise(r => setTimeout(r, 3000))
  } catch (e) { logErro("tts", "Falha áudio cidade", e) }
}

async function enviarAudioConfirmacaoLocalizacao(from, atendente, cidade, uf, regiao, origem = "cidade") {
  try {
    const estadoAudio = estadoPorExtenso(uf)
    const ogg = await gerarAudioAtendente(atendente,
      `Encontrei! ${cidade}, estado de ${estadoAudio}, região ${regiao}. Está correto? Se não estiver, me diga a cidade correta agora. Pode falar ou digitar.`)
    await enviarAudio(from, urlAudioAtendente(ogg))
    await new Promise(r => setTimeout(r, 4000))
  } catch (e) { logErro("tts", origem === "cep" ? "Falha áudio CEP" : "Falha áudio cidade", e) }
}

async function respostaAposCidade(from, u) {
  const primeiroNome = primeiroNomeCliente(u) || "você"
  if (u._audioCanalTranscricao || u.descricao) {
    setStage(u, STAGES.AUDIO_CONFIRMAR_DADOS)
    iniciarTimer(from)
    return await telaConfirmarDadosAudio(from, u)
  }

  setStage(u, STAGES.AUDIO_AGUARDANDO)
  iniciarTimer(from)

  const ehTerceiro = Boolean(u.atendimentoParaTerceiro || u._novoCasoParaTerceiro)
  const primeiroNomeAtendido = ehTerceiro && u.nome ? u.nome.split(" ")[0] : null

  const textoTela = primeiroNomeAtendido
    ? `●●●●●● 📝 Etapa 6 de 6 · *Relato*\n\nAgora me conte a situação de *${primeiroNomeAtendido}* com detalhes para eu preparar o caso.\n\n💬 Você pode responder por mensagem de texto ou, se preferir, enviar um áudio. 🎙️`
    : `●●●●●● 📝 Etapa 6 de 6 · *Relato*\n\nAgora me conte sua situação com detalhes para eu preparar seu caso, *${primeiroNome}*.\n\n💬 Você pode responder por mensagem de texto ou, se preferir, enviar um áudio. 🎙️`

  if (!u.modoTexto) {
    try {
      const textoAudio = primeiroNomeAtendido
        ? `Agora me conte a situação de ${primeiroNomeAtendido} com detalhes para eu preparar o caso. Pode enviar um áudio ou digitar.`
        : `Agora me conte sua situação com detalhes para eu preparar seu caso, ${primeiroNome}. Pode enviar um áudio ou digitar.`
      const ogg = await gerarAudioAtendente(u.atendente, textoAudio)
      await enviarAudio(from, urlAudioAtendente(ogg))
      await new Promise(r => setTimeout(r, 3000))
    } catch (e) { logErro("tts", "Falha áudio pedido relato", e) }
  }

  return { texto: textoTela, opcoes: null, semAudio: true }
}

// ================================================================
//  HELPERS
// ================================================================

function detectarReferenciaTerceiro(texto = "") {
  const t = normalizarTextoGatilho(texto)
  if (!t) return null

  const refs = [
    { re: /\b(minha|da minha|pra minha|para minha)\s+mae\b|\b(mae dela|mae dele)\b/, relacao: "mae", label: "mãe" },
    { re: /\b(meu|do meu|pro meu|para meu)\s+pai\b|\b(pai dela|pai dele)\b/, relacao: "pai", label: "pai" },
    { re: /\b(minha|da minha|pra minha|para minha)\s+filha\b|\b(filha dela|filha dele)\b/, relacao: "filha", label: "filha" },
    { re: /\b(meu|do meu|pro meu|para meu)\s+filho\b|\b(filho dela|filho dele)\b/, relacao: "filho", label: "filho" },
    { re: /\b(minha|da minha|pra minha|para minha)\s+esposa\b|\b(minha|da minha)\s+mulher\b/, relacao: "esposa", label: "esposa" },
    { re: /\b(meu|do meu|pro meu|para meu)\s+esposo\b|\b(meu|do meu)\s+marido\b/, relacao: "esposo", label: "esposo" },
    { re: /\b(minha|da minha|pra minha|para minha)\s+irma\b|\birma dela|irma dele\b/, relacao: "irma", label: "irmã" },
    { re: /\b(meu|do meu|pro meu|para meu)\s+irmao\b|\birmao dela|irmao dele\b/, relacao: "irmao", label: "irmão" },
    { re: /\b(minha|da minha|pra minha|para minha)\s+avo\b|\b(meu|do meu|pro meu|para meu)\s+avo\b|\bavos?\b/, relacao: "avo", label: "avó/avô" },
    { re: /\b(outra pessoa|terceiro|terceira pessoa|parente|familiar|cliente e outra pessoa)\b/, relacao: "terceiro", label: "outra pessoa" }
  ]

  return refs.find(item => item.re.test(t)) || null
}

function textoContextoTitularCaso(u = {}) {
  const partes = [
    u.descricao,
    u._audioCanalTranscricao,
    u.assuntoResumo,
    u._descTemp,
    u._resumoDescricaoIA
  ].filter(Boolean).join(" ")
  return normalizarTextoCRM(partes || "")
}

function detectarAmbiguidadeTitularNome(u = {}, texto = "") {
  const atual = detectarReferenciaTerceiro(texto)
  const previo = detectarReferenciaTerceiro(textoContextoTitularCaso(u))
  const ref = atual || previo
  if (!ref) return null

  const textoNorm = normalizarTextoGatilho(texto)
  const falaNomeDeTerceiro =
    /\b(nome (dela|dele|da minha|do meu)|ela se chama|ele se chama|chama ela|chama ele|o nome e|o nome é)\b/.test(textoNorm)

  return {
    relacao: ref.relacao,
    label: ref.label,
    origem: atual ? "mensagem_atual" : "contexto_do_relato",
    falaNomeDeTerceiro
  }
}

async function telaEscolhaModo(from, u, { comAudio = false } = {}) {
  // ○●○○○○ Etapa 1 de 6 — escolha do modo de comunicação.
  // Definida aqui, antes do relato, para que nenhum áudio seja enviado
  // a quem prefere texto e vice-versa.
  setStage(u, STAGES.ACOLHIMENTO_MODO)
  iniciarTimer(from)
  // Reapresentação (ex: resposta não reconhecida pelo detector de modo):
  // ACOLHIMENTO_MODO ainda não tem u.modoTexto definido, então o áudio
  // é sempre enviado junto com o texto, independentemente da preferência.
  if (comAudio) {
    try {
      const ogg = await gerarAudioAtendente(u.atendente,
        `Não entendi sua resposta. Como prefere ser atendido durante este processo? Primeira opção: ouvir e responder por áudio, onde vou te guiando com perguntas em voz, uma de cada vez. Segunda opção: ler e digitar, onde você vê as perguntas por escrito e responde no seu ritmo.`)
      await enviarAudio(from, urlAudioAtendente(ogg))
      await new Promise(r => setTimeout(r, 4000))
    } catch (e) { logErro("tts", "Falha áudio reapresentação escolha modo", e) }
  }
  const texto = `●○○○○○ 📡 *Etapa 1 de 6 · Atendimento*\n\nComo prefere ser atendido durante este processo?\n\n🎧 *Ouvir e responder* — vou te guiando com perguntas em áudio, uma de cada vez.\n\n✍️ *Ler e digitar* — você vê as perguntas por escrito e responde no seu ritmo.`
  const opcoes = [
    { id: "modo_audio", title: "🎧 Ouvir áudio" },
    { id: "modo_texto", title: "✍️ Ler e digitar" }
  ]
  if (IMAGEM_ASSESSORIA_INICIAL_URL) {
    const enviada = await enviarImagemWhatsApp(from, IMAGEM_ASSESSORIA_INICIAL_URL, texto, opcoes)
    if (enviada) return { texto: null, opcoes: null, semAudio: true }
  }
  return { texto, opcoes, semAudio: true }
}

async function telaParaQuem(from, u) {
  // Pergunta universal: o atendimento é para o próprio contato ou para outra pessoa?
  // Dispara para todos os clientes novos — com ou sem detecção prévia de terceiro no relato.
  const relacao = u.relacaoComAtendido
  const mapaRelacao = {
    // chaves sem acento (valores antigos)
    mae: "sua mãe", pai: "seu pai", filho: "seu filho", filha: "sua filha",
    esposa: "sua esposa", esposo: "seu esposo", conjuge: "seu cônjuge",
    irmao: "seu irmão", irma: "sua irmã", avo: "seu avô/avó", terceiro: "outra pessoa",
    // chaves com acento (valores retornados por relacaoTerceiroPreAtendimento)
    "mãe": "sua mãe", "irmão": "seu irmão", "irmã": "sua irmã",
    "avó": "sua avó", "avô": "seu avô",
    amiga: "sua amiga", amigo: "seu amigo",
    tia: "sua tia", tio: "seu tio",
    sobrinha: "sua sobrinha", sobrinho: "seu sobrinho",
    neta: "sua neta", neto: "seu neto",
    vizinha: "sua vizinha", vizinho: "seu vizinho"
  }
  const labelRelacao = mapaRelacao[relacao] || null

  setStage(u, STAGES.ACOLHIMENTO_PARA_QUEM)
  iniciarTimer(from)

  // Texto e áudio adaptados: quando o relato mencionou alguém, personaliza; senão, genérico.
  const textoAudio = labelRelacao
    ? `Só uma pergunta rápida antes de começar. Você está aqui para cuidar do seu próprio caso, ou vai abrir um atendimento para ${labelRelacao}? Primeira opção: É para mim. Segunda opção: É para ${labelRelacao}.`
    : `Só uma pergunta rápida antes de começar. Você está aqui para cuidar do seu próprio caso, ou vai abrir um atendimento para outra pessoa, como um familiar ou amigo? Primeira opção: É para mim. Segunda opção: É para outra pessoa.`

  if (!u.modoTexto) {
    try {
      const ogg = await gerarAudioAtendente(u.atendente, textoAudio)
      await enviarAudio(from, urlAudioAtendente(ogg))
      await new Promise(r => setTimeout(r, 4000))
    } catch (e) { logErro("tts", "Falha áudio para_quem", e) }
  }

  const textoTela = labelRelacao
    ? `💬 *Só uma pergunta rápida antes de começar...*\n\nVocê está aqui para cuidar do seu próprio caso, ou quer abrir um atendimento para *${labelRelacao}*?`
    : `💬 *Só uma pergunta rápida antes de começar...*\n\nVocê está aqui para cuidar do seu próprio caso, ou quer abrir um atendimento para outra pessoa, um familiar ou amigo?`

  return {
    texto: textoTela,
    opcoes: [
      { id: "para_quem_eu", title: "🙋 É para mim" },
      { id: "para_quem_outro", title: labelRelacao ? `👤 É para ${labelRelacao}` : "👤 É para outra pessoa" }
    ]
  }
}

async function perguntarTitularNomePreCadastro(from, u, nomeLimpo, contexto = {}) {
  u._nomeTemp = nomeLimpo
  u._nomeTitularPendente = contexto
  setStage(u, STAGES.ACOLHIMENTO_CONFIRMA_TITULAR_NOME)
  iniciarTimer(from)

  const alvo = contexto?.label || "outra pessoa"
  const textoAudio = `Só para eu preencher corretamente: ${nomeLimpo} é o seu nome, ou é o nome da pessoa atendida, ${alvo}? Se o nome estiver errado, me diga o nome correto agora.`
  if (!u.modoTexto) {
    try {
      const ogg = await gerarAudioAtendente(u.atendente, `Só para eu preencher corretamente: ${nomeLimpo} é o seu nome, ou é o nome da pessoa atendida, ${alvo}? Primeira opção: é meu nome. Segunda opção: é o nome da pessoa atendida. Se o nome estiver errado, me diga o nome correto agora.`)
      await enviarAudio(from, urlAudioAtendente(ogg))
      await new Promise(r => setTimeout(r, 4000))
    } catch (e) { logErro("tts", "Falha áudio titular nome", e) }
  }

  return {
    texto: `●●○○○○ 👤 Etapa 2 de 6 · *Nome*\n\n✅ Entendi o nome *${nomeLimpo}*.\n\nComo você mencionou ${alvo}, preciso confirmar para não cadastrar errado:\n\nEsse é o seu nome ou o nome da pessoa atendida?\n\n_Se o nome estiver errado, é só me dizer o nome correto agora. 🎙️_`,
    opcoes: [
      { id: "nome_titular_contato", title: "🙋 Meu nome" },
      { id: "nome_titular_atendido", title: "👤 Pessoa atendida" }
    ]
  }
}

function gerarCaso(area) {
  const b = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }))
  const p = (n, l = 2) => String(n).padStart(l, "0")
  const siglas = {
    "INSS":        "PRV",
    "Trabalhista": "CLT",
    "Família":     "FAM",
    "Consumidor":  "CDC",
    "Penal":       "PEN",
    "Civil":       "CIV",
    "Imobiliário": "IMO",
    "Outros":      "OUT",
    "Revisão":     "OUT",
    "Revisao":     "OUT",
  }
  const prefixo = siglas[area] || "OUT"
  const num = `${String(b.getFullYear()).slice(2)}${p(b.getMonth()+1)}${p(b.getDate())}`
  const rand = p(Math.floor(Math.random()*1000), 3)
  return `${prefixo}.${num}.${rand}`
}

function gerarBriefingCaso(u = {}) {
  const statusDocs = calcularStatusDocumentos(u)
  const scoreBase = calcScore(u)
  const emocional = scoreEmocional(u)
  const relato = sanitizarTextoEntrada(u._resumoDescricaoIA || u.assuntoResumo || u.descricao || u._audioCanalTranscricao)
  const cidade = u.cidade ? `${u.cidade}${u.uf ? " - " + u.uf : ""}` : ""
  const stage = u.negocioStageId || mapearStageParaDealstage(u) || u.stage || ""
  const proximaAcao = (() => {
    if (!u.numeroCaso) return "Concluir pre-atendimento e gerar caso."
    if (u._eventoCalendarId || stage === HS_STAGE.AGENDAMENTO) return "Acompanhar consulta agendada."
    if (statusDocs.faltantesCriticos.length > 0) return "Cobrar documentos faltantes."
    if (stage === HS_STAGE.ANALISE) return "Revisar analise juridica inicial."
    if (stage === HS_STAGE.PROTOCOLO) return "Acompanhar protocolo."
    if (stage === HS_STAGE.PROCESSO) return "Acompanhar andamento processual."
    if (stage === HS_STAGE.FINAL) return "Caso encerrado."
    return "Revisar caso no HubSpot."
  })()

  return {
    numeroCaso: u.numeroCaso || null,
    nome: u.nome || u.nomeWA || u.nomePerfilWhatsApp || "Cliente",
    whatsapp: u._numero || u.whatsappContato || null,
    cidade: cidade || null,
    area: u.area || null,
    situacao: u.situacao || u.tipo || null,
    detalhe: u.detalhe || u.subTipo || null,
    urgencia: u.urgencia || "normal",
    stage,
    stageLabel: labelStageAdmin(stage),
    relato: relato || null,
    scoreOperacional: scoreBase,
    scoreEmocional: emocional,
    documentos: {
      total: statusDocs.total,
      recebidos: statusDocs.recebidos.length,
      faltantesCriticos: statusDocs.faltantesCriticos.map(doc => doc.label),
      pendentesFluxo: statusDocs.pendentesFluxo.map(doc => doc.label)
    },
    consultaAtiva: Boolean(u._eventoCalendarId || stage === HS_STAGE.AGENDAMENTO),
    hubspot: u.negocioId ? linkHubSpot(u.negocioId) : null,
    drive: u.pastaDriveLink || null,
    proximaAcao
  }
}

function resumoCaso(u) {
  return [
    `👤 Nome: ${u.nome || "—"}`,
    `📍 Cidade: ${u.cidade || "—"}${u.uf ? " - " + u.uf : ""}`,
    `⚖️ Área: ${u.area || "—"}`,
    u.tipo      ? `📌 Tipo: ${u.tipo}` : null,
    u.situacao  ? `📌 Situação: ${u.situacao}` : null,
    u.subTipo   ? `🔎 Detalhe: ${u.subTipo}` : null,
    u.detalhe   ? `ℹ️ Info: ${u.detalhe}` : null,
    `⚡ Urgência: ${{ alta: "Alta 🔴", normal: "Moderada 🟡", baixa: "Baixa 🟢" }[u.urgencia] || "Moderada 🟡"}`,
    `💼 Contribuiu ao INSS: ${u.contribuicao || "—"}`,
    `🏥 Recebe benefício: ${u.recebeBeneficio || "—"}`,
    u.descricao ? `💬 Descrição: ${u.descricao}` : null,
  ].filter(Boolean).join("\n")
}

function getHubSpotResumoCliente(u) {
  const briefing = gerarBriefingCaso(u)
  const emocional = scoreEmocional(u)
  const statusDocs = calcularStatusDocumentos(u)
  const faltantesCriticos = statusDocs.faltantesCriticos.length
  const docsTexto = faltantesCriticos > 0
    ? `${faltantesCriticos} documento${faltantesCriticos === 1 ? "" : "s"} faltante${faltantesCriticos === 1 ? "" : "s"}`
    : "Documentos completos"
  const proximaAcao = briefing.proximaAcao || "Revisar caso no HubSpot"
  const urgenciaLabel = { alta: "Alta", normal: "Moderada", baixa: "Baixa" }[u?.urgencia] || "Moderada"
  const stageLabel = briefing.stageLabel || labelStageAdmin(briefing.stage)
  return `Proxima acao: ${proximaAcao}; Stage: ${stageLabel}; Urgencia: ${urgenciaLabel}; Risco emocional: ${emocional.nivel}; ${docsTexto}`
}

function getHubSpotDescricaoCompleta(u) {
  const briefing = gerarBriefingCaso(u)
  const relatoLivre = normalizarTextoCRM(u.descricao || u._audioCanalTranscricao || "")
  const resumoIA = normalizarTextoCRM(u._resumoDescricaoIA || u.assuntoResumo || "")
  const documentosFaltantes = briefing.documentos.faltantesCriticos.length
    ? briefing.documentos.faltantesCriticos.join(", ")
    : "Nenhum documento critico pendente"
  const contato = briefing.whatsapp || u.whatsappContato || u._numero || ""
  const campos = [
    "Painel operacional:",
    `Proxima acao: ${briefing.proximaAcao}`,
    `Stage: ${briefing.stageLabel}`,
    `Urgencia: ${ { alta: "Alta", normal: "Moderada", baixa: "Baixa" }[u?.urgencia] || "Moderada" }`,
    `Risco emocional: ${briefing.scoreEmocional.nivel} (${briefing.scoreEmocional.valor}/10)`,
    `Documentos: ${briefing.documentos.recebidos}/${briefing.documentos.total || 0} recebidos; faltantes criticos: ${documentosFaltantes}`,
    `Consulta ativa: ${briefing.consultaAtiva ? "sim" : "nao"}`,
    briefing.drive ? `Drive: ${briefing.drive}` : null,
    briefing.hubspot ? `HubSpot: ${briefing.hubspot}` : null,
    "",
    "Resumo juridico-operacional:",
    `Fatos: ${resumoFatosJuridico(u, briefing)}`,
    `Pedido do cliente: ${pedidoClienteJuridico(u, briefing)}`,
    `Risco/prazo: ${riscoPrazoJuridico(u, briefing)}`,
    `Documentos essenciais: ${documentosEssenciaisJuridico(briefing)}`,
    `Proxima acao sugerida: ${briefing.proximaAcao}`,
    "",
    relatoLivre ? `Relato livre:\n${relatoLivre}` : null,
    resumoIA && resumoIA !== relatoLivre ? `Resumo IA:\n${resumoIA}` : null,
    "Dados do caso:",
    briefing.numeroCaso ? `Caso: ${briefing.numeroCaso}` : null,
    briefing.nome ? `Cliente: ${briefing.nome}` : null,
    contato ? `WhatsApp: ${contato}` : null,
    briefing.area ? `Area: ${briefing.area}` : null,
    briefing.situacao ? `Situacao: ${briefing.situacao}` : null,
    briefing.detalhe ? `Detalhe: ${briefing.detalhe}` : null,
    briefing.cidade ? `Cidade: ${briefing.cidade}` : null,
    `Score operacional: ${briefing.scoreOperacional}`,
    `Documentos faltantes: ${documentosFaltantes}`
  ]
  return campos.filter(Boolean).join("\n")
}

function restaurarTipoCasoHubSpot(valor) {
  if (!valor || typeof valor !== "string") return {}

  const [area, tipo] = valor.split("_")

  const areaMap = {
    inss: "area_inss",
    trab: "area_trab",
    familia: "area_familia",
    consumidor: "area_consumidor",
    penal: "area_penal",
    civil: "area_civil",
    imovel: "area_imovel",
    outros: "area_outros",
  }

  return {
    area: areaMap[area] || null,
    tipo: tipo || null,
  }
}

function getHubSpotDealStateProps(u) {
  const temperatura = getTemperaturaLeadHubSpot(u)
  const stageBot = normalizarStageKey(u?.stage)
  const etapaBot = (stageBot === STAGES.AUDIO_AGUARDANDO && !usuarioTemRelatoParaRetomada(u))
    ? ""
    : stageBot
  return filtrarPropsHubSpot({
    description: typeof u?.descricao === "string" ? normalizarTextoCRM(u.descricao) : u?.descricao,
    resumo_cliente: getHubSpotResumoCliente(u),
    descricao_completa: getHubSpotDescricaoCompleta(u),
    estado_bot_snapshot: serializarEstado(u),
    etapa_do_bot: etapaBot,
    tipo_de_caso: mapearTipoCaso(u),
    temperatura_lead: mapearTemperatura(temperatura),
    hs_priority: mapearPrioridade(temperatura),
    // urgencia normalizada e consistente
    urgencia: { alta: "Alta", normal: "Moderada", baixa: "Baixa" }[u?.urgencia] || "Moderada",
    area_juridica: u.area || "",
    cidade: u.cidade || "",
    pasta_drive: u.pastaDriveLink || "",
    origem_atendimento: sanitizarTextoEntrada(u?.origemCaptacao) || "whatsapp"
  })
}

function getHubSpotDealProps(u, extraProps = {}) {
  return filtrarPropsHubSpot({
    ...extraProps,
    ...getHubSpotDealStateProps(u)
  })
}

function mapearStageParaDealstage(u) {
  const stageAtual = normalizarStageKey(u?.stage)
  const stageRetomada = typeof obterStageRetomadaOriginal === "function" ? obterStageRetomadaOriginal(u) : null
  const stageBaseNormalizado = [STAGES.RETOMADA_AUTOMATICA, STAGES.RETOMADA_MENU, STAGES.RESUMO_ATENDIMENTO, STAGES.RESUMO_RETOMADA].includes(stageAtual)
    ? normalizarStageKey(stageRetomada)
    : stageAtual
  const stageBase = stageBaseNormalizado || ""

  // Proteção global — nunca regride de stage avançado independente do stageBase
  const stagesAvancados = [HS_STAGE.AGENDAMENTO, HS_STAGE.PROTOCOLO, HS_STAGE.PROCESSO, HS_STAGE.FINAL]
  if (stagesAvancados.includes(u?.negocioStageId)) return null

  if (stageBase === STAGES.CLIENTE || stageBase === STAGES.DOCUMENTOS) {
    const pendentes = getDocsPendentes(u)
    const statusDocs = calcularStatusDocumentos(u)
    if (u?.documentosEnviados === true && pendentes.length === 0 && statusDocs.faltantesCriticos.length === 0) return HS_STAGE.DOCS
    if (u?._docsClienteGuiado || u?.etapa === "documentos") return HS_STAGE.AGUARDANDO_DOCS
    if (u?.documentosEnviados === true) return HS_STAGE.AGUARDANDO_DOCS
    return HS_STAGE.ANALISE
  }
  if (stageBase === STAGES.COLETA_DESC_AUDIO || stageBase === STAGES.DESCRICAO_CASO) return HS_STAGE.ANALISE
  if (stageBase === STAGES.INICIO) return HS_STAGE.LEAD
  if (stageBase === STAGES.AREA || stageBase.includes("menu")) return HS_STAGE.CADASTRO
  if (stageBase.includes("coleta") || stageBase.includes("confirmar") || stageBase === STAGES.CONFIRMACAO) return HS_STAGE.CADASTRO

  return null
}

function getLabelOrigemCaptacao(u) {
  const origem = sanitizarTextoEntrada(u?.origemCaptacao).toLowerCase()
  if (origem === "instagram") return "Instagram"
  if (origem === "facebook") return "Facebook"
  if (origem === "site" || origem === "pagina_oficial" || origem === "pagina-oficial") return "Site"
  return "WPP"
}

function getNomeDeal(u) {
  const temperatura = definirTemperatura(u)
  const origem = getLabelOrigemCaptacao(u)

  // Quando já tem número de caso — nome completo
  if (u?.numeroCaso) {
    const primeiroNome = getPrimeiroNome(u) || null
    const tipoCase = u?.situacao
      ? u.situacao.charAt(0).toUpperCase() + u.situacao.slice(1)
      : u?.area || "Jurídico"
    const nomeLabel = primeiroNome ? ` · ${primeiroNome}` : ""
    return `${u.numeroCaso}${nomeLabel} · ${tipoCase}`
  }

  // Sem número de caso — progressão por temperatura
  const primeiroNome = getPrimeiroNome(u) || null
  const areaLabel = u?.area || null
  const tipoLabel = u?.situacao
    ? u.situacao.charAt(0).toUpperCase() + u.situacao.slice(1)
    : areaLabel

  if (temperatura === "quente") {
    const extra = tipoLabel ? ` · ${tipoLabel}` : ""
    const nome = primeiroNome ? ` · ${primeiroNome}` : ""
    return `🟢 Lead via ${origem}${nome}${extra}`
  }

if (temperatura === "morno") {
  const nome = primeiroNome ? ` · ${primeiroNome}` : ""
  const area = u?.area ? ` · ${u.area}` : ""
  return `🟡 Lead via ${origem}${nome}${area}`
}

  return `⚪ Lead via ${origem}`
}

configurarHubSpotCore({
  monitor,
  HS_STAGE,
  HS_PIPELINE,
  getNomeDeal,
  getHubSpotDealStateProps
})

function getNotaLead(u) {
  const temperatura = definirTemperatura(u)
  const stageAtual = sanitizarTextoEntrada(u?.stage) || "não informado"

  const simbolo = temperatura === "quente" ? "🟢" : temperatura === "morno" ? "🟡" : "⚪"
  const label   = temperatura === "quente" ? "QUENTE" : temperatura === "morno" ? "MORNO" : "FRIO"
  const interpretacao =
    temperatura === "quente"
      ? "Preencheu todos os dados — pronto para contato imediato."
      : temperatura === "morno"
        ? "Informou nome e cidade — precisa de abordagem para concluir."
        : "Entrou mas não preencheu informações — requer nurturing."

  return [
    "🤖 Lead gerado via bot",
    "",
    `${simbolo} Temperatura: ${label}`,
    `📍 Etapa do bot: ${stageAtual}`,
    u?.nome   ? `👤 Nome: ${u.nome}` : null,
    u?.cidade ? `📍 Cidade: ${u.cidade}${u.uf ? " - " + u.uf : ""}` : null,
    u?.area   ? `⚖️ Área: ${u.area}` : null,
    "",
    "🧠 Interpretação:",
    interpretacao
  ].filter(Boolean).join("\n")
}


function ehFinalizacaoCasoTerceiro(u) {
  // Fluxo clássico: cliente existente abre caso para outra pessoa
  const fluxoClassico = Boolean(
    u?._novoCasoParaTerceiro &&
    u?._casoAnteriorCliente &&
    u?.telefoneEhDoCliente === false &&
    normalizarNumeroWhatsAppEnvio(u?.whatsappContato)
  )
  // Fluxo novo: usuário novo que veio pelo ACOLHIMENTO_PARA_QUEM
  const fluxoNovo = Boolean(
    u?.atendimentoParaTerceiro &&
    !u?._casoAnteriorCliente &&
    u?.telefoneEhDoCliente === false &&
    normalizarNumeroWhatsAppEnvio(u?.whatsappContato)
  )
  return fluxoClassico || fluxoNovo
}

function telaVoltarConfirmacaoTerceiro(u, origem = "texto") {
  const nomeTerceiro = primeiroNomeCliente(u) || "a pessoa atendida"
  const confirmarId = origem === "audio" ? "terceiro_audio_conf_continuar" : "terceiro_conf_continuar"
  const corrigirId = origem === "audio" ? "audio_dados_corrigir" : "conf_corrigir"
  // Cenário D: cliente cadastrado abre caso para terceiro — tem menu próprio para voltar
  // Cenário B: novo cliente abre caso para terceiro — não tem menu, apenas cancela
  const temCasoAnterior = Boolean(u._casoAnteriorCliente)
  const cancelarTitle = temCasoAnterior ? "🏠 Meu menu" : "↩️ Cancelar atendimento"
  const textoTela = temCasoAnterior
    ? `⬅️ *Antes de voltar*\n\nEste atendimento é para *${nomeTerceiro}*.\n\nPara evitar misturar este caso com o seu atendimento original, escolha uma opção abaixo:`
    : `⬅️ *Atendimento para outra pessoa*\n\nVocê está abrindo um caso para *${nomeTerceiro}*.\n\nO que deseja fazer?`
  return {
    texto: textoTela,
    opcoes: [
      { id: confirmarId, title: "✅ Ver confirmação" },
      { id: corrigirId, title: "✏️ Corrigir dados" },
      { id: "terceiro_cancelar_menu", title: cancelarTitle }
    ]
  }
}

function criarSnapshotCasoCliente(u) {
  if (!u) return null
  return {
    numeroCaso: u.numeroCaso || null,
    negocioId: u.negocioId || null,
    contatoId: u.contatoId || null,
    negocioStageId: u.negocioStageId || null,
    pastaDriveId: u.pastaDriveId || null,
    pastaDriveLink: u.pastaDriveLink || null,
    nome: u.nome || null,
    nomeConfirmado: Boolean(u.nomeConfirmado),
    cidade: u.cidade || null,
    uf: u.uf || null,
    regiao: u.regiao || null,
    area: u.area || null,
    tipo: u.tipo || null,
    _docKey: u._docKey || null,
    situacao: u.situacao || null,
    subTipo: u.subTipo || null,
    detalhe: u.detalhe || null,
    urgencia: u.urgencia || "normal",
    semReceber: Boolean(u.semReceber),
    descricao: u.descricao || null,
    assuntoResumo: u.assuntoResumo || null,
    _audioCanalTranscricao: u._audioCanalTranscricao || null,
    whatsappVerificado: Boolean(u.whatsappVerificado),
    telefoneEhDoCliente: u.telefoneEhDoCliente ?? null,
    whatsappContato: u.whatsappContato || null,
    modoTexto: Boolean(u.modoTexto),
    docsEntregues: Array.isArray(u.docsEntregues) ? [...u.docsEntregues] : [],
    docsAusentes: Array.isArray(u.docsAusentes) ? [...u.docsAusentes] : [],
    docsPulados: Array.isArray(u.docsPulados) ? [...u.docsPulados] : [],
    docsParciais: Array.isArray(u.docsParciais) ? [...u.docsParciais] : [],
    docsDispensados: Array.isArray(u.docsDispensados) ? [...u.docsDispensados] : [],
    docAtualIdx: u.docAtualIdx || 0,
    documentosEnviados: Boolean(u.documentosEnviados),
    ultimoArqId: u.ultimoArqId || null,
    ultimoArqNome: u.ultimoArqNome || null
  }
}

function restaurarCasoAnteriorCliente(u, fromAtual = null) {
  const caso = u?._casoAnteriorCliente
  if (!caso?.numeroCaso) return false
  const numeroAtual = sanitizarTextoEntrada(fromAtual || u._numero)

  Object.assign(u, {
    stage: STAGES.CLIENTE,
    etapa: STAGES.CLIENTE,
    _numero: numeroAtual || u._numero || null,
    numeroCaso: caso.numeroCaso,
    negocioId: caso.negocioId || null,
    contatoId: caso.contatoId || null,
    negocioStageId: caso.negocioStageId || null,
    pastaDriveId: caso.pastaDriveId || null,
    pastaDriveLink: caso.pastaDriveLink || null,
    nome: caso.nome || u.nome || null,
    nomeConfirmado: Boolean(caso.nomeConfirmado),
    cidade: caso.cidade || null,
    uf: caso.uf || null,
    regiao: caso.regiao || null,
    area: caso.area || null,
    tipo: caso.tipo || null,
    _docKey: caso._docKey || null,
    situacao: caso.situacao || null,
    subTipo: caso.subTipo || null,
    detalhe: caso.detalhe || null,
    urgencia: caso.urgencia || "normal",
    semReceber: Boolean(caso.semReceber),
    descricao: caso.descricao || null,
    assuntoResumo: caso.assuntoResumo || null,
    _audioCanalTranscricao: caso._audioCanalTranscricao || null,
    whatsappVerificado: Boolean(caso.whatsappVerificado),
    telefoneEhDoCliente: caso.telefoneEhDoCliente ?? null,
    whatsappContato: caso.whatsappContato || null,
    modoTexto: Boolean(caso.modoTexto),
    docsEntregues: Array.isArray(caso.docsEntregues) ? [...caso.docsEntregues] : [],
    docsAusentes: Array.isArray(caso.docsAusentes) ? [...caso.docsAusentes] : [],
    docsPulados: Array.isArray(caso.docsPulados) ? [...caso.docsPulados] : [],
    docsParciais: Array.isArray(caso.docsParciais) ? [...caso.docsParciais] : [],
    docsDispensados: Array.isArray(caso.docsDispensados) ? [...caso.docsDispensados] : [],
    docAtualIdx: caso.docAtualIdx || 0,
    documentosEnviados: Boolean(caso.documentosEnviados),
    ultimoArqId: caso.ultimoArqId || null,
    ultimoArqNome: caso.ultimoArqNome || null,
    _novoCasoDeCliente: false,
    _novoCasoParaTerceiro: false,
    _casoAnteriorCliente: null,
    temCadastroCompleto: true,
    leadIncompletoCapturado: false,
    _entradaPendenteTipo: null,
    _entradaPendenteValor: null,
    _entradaPendenteOrigem: null,
    aguardandoResposta: false,
    aguardandoRetomada: false,
    lastPergunta: null,
    lastPerguntaPayload: null,
    _ultimoMenuClienteAt: Date.now()
  })

  agendarPersistenciaUsers()
  return true
}

async function voltarMenuCasoAnteriorCliente(from, u) {
  if (!restaurarCasoAnteriorCliente(u, from)) return null
  iniciarTimer(from)
  return await menuClienteComAudio(from, u)
}

function temDadosUteisTerceiroIncompleto(u) {
  if (!u?._novoCasoParaTerceiro) return false
  return Boolean(
    sanitizarTextoEntrada(u.nome) ||
    sanitizarTextoEntrada(u.whatsappContato) ||
    sanitizarTextoEntrada(u._audioCanalTranscricao) ||
    sanitizarTextoEntrada(u.descricao) ||
    sanitizarTextoEntrada(u.assuntoResumo)
  )
}

async function capturarLeadTerceiroIncompleto(from, u, motivo = "interrupcao") {
  if (!u?._novoCasoParaTerceiro || u._leadTerceiroIncompletoCapturado) return null
  if (!temDadosUteisTerceiroIncompleto(u)) return null

  const casoAnterior = u._casoAnteriorCliente || null
  const nomeQuemAbriu = primeiroEUltimoNome(casoAnterior?.nome || "")
  const telefoneTerceiro = normalizarNumeroWhatsAppEnvio(u.whatsappContato)
  const nomeTerceiro = sanitizarTextoEntrada(u.nome)
  const relato = sanitizarTextoEntrada(u._audioCanalTranscricao || u.descricao || u.assuntoResumo)
  const telefoneCaptura = telefoneTerceiro || normalizarNumeroWhatsAppEnvio(from)

  const lead = {
    ...u,
    numeroCaso: null,
    contatoId: null,
    negocioId: null,
    pastaDriveId: null,
    pastaDriveLink: null,
    nome: nomeTerceiro || (nomeQuemAbriu ? `Indicado por ${nomeQuemAbriu}` : "Lead indicado"),
    nomeWA: nomeTerceiro || u.nomeWA || "Lead indicado",
    nomePerfilWhatsApp: nomeTerceiro || u.nomePerfilWhatsApp || "Lead indicado",
    whatsappContato: telefoneTerceiro || null,
    telefoneEhDoCliente: telefoneTerceiro ? false : true,
    area: u.area || "Atendimento de terceiro",
    descricao: relato || u.descricao || null,
    assuntoResumo: u.assuntoResumo || relato || null,
    stage: `terceiro_incompleto_${normalizarStageKey(u.stage) || "interrompido"}`,
    leadIncompletoCapturado: false,
    _casoAnteriorCliente: null
  }

  const linhas = [
    `Lead incompleto de caso para terceiro.`,
    `Motivo: ${motivo}`,
    `Aberto por: ${nomeQuemAbriu || "cliente original"} (${from})`,
    `Telefone de captura: ${telefoneCaptura}`,
    `Telefone informado do terceiro: ${telefoneTerceiro || "nao informado"}`,
    `Nome do terceiro: ${nomeTerceiro || "nao informado"}`,
    `Relato: ${relato || "nao informado"}`,
    `Caso original: ${casoAnterior?.numeroCaso || "nao informado"}`
  ]
  const nota = linhas.join("\n")

  let contatoId = null
  const existente = await hsBuscarPorPhone(telefoneCaptura).catch(e => {
    logErro("hubspot", "buscar contato terceiro incompleto: " + e.message)
    return null
  })
  contatoId = existente?.id || null
  if (!contatoId) {
    contatoId = await hsCriarContato(telefoneCaptura, lead)
  } else if (telefoneTerceiro && nomeTerceiro) {
    const nomeExistenteHS = existente?.properties?.firstname || ""
    if (normalizarNomeComparacao(nomeExistenteHS) === normalizarNomeComparacao(nomeTerceiro)) {
      logDebug("[HUBSPOT] Lead terceiro incompleto associado a contato existente do proprio terceiro.")
    } else {
      logDebug("[HUBSPOT] Lead terceiro incompleto com telefone ja existente; nome do contato preservado.")
    }
  }
  if (!contatoId) return null

  const negocioId = await hsCriarNegocio(lead, {
    stage: HS_STAGE.LEAD,
    dealname: `🟡 Terceiro incompleto · ${nomeTerceiro || nomeQuemAbriu || "Indicação"}`
  })
  if (negocioId) {
    await hsAssociar(contatoId, negocioId)
    await hsCriarNotaNegocio(negocioId, "LEAD INCOMPLETO - CASO PARA TERCEIRO", nota)
  }
  await hsCriarNota(contatoId, "LEAD INCOMPLETO - CASO PARA TERCEIRO", nota)
  u._leadTerceiroIncompletoCapturado = true
  return { contatoId, negocioId }
}

async function cancelarNovoCasoClienteEVoltarMenu(from, u, motivo = "cancelado") {
  await capturarLeadTerceiroIncompleto(from, u, motivo).catch(e =>
    logErro("hubspot", "capturarLeadTerceiroIncompleto: " + e.message)
  )
  const tinhaDados = temDadosUteisTerceiroIncompleto(u)
  if (!restaurarCasoAnteriorCliente(u, from)) return null
  iniciarTimer(from)
  await enviarAudioModoVoz(
    from,
    u,
    tinhaDados
      ? "Tudo bem. Pausei a abertura desse caso para outra pessoa e registrei as informações já enviadas. Vou te levar de volta ao seu menu."
      : "Tudo bem. Cancelei a abertura desse caso para outra pessoa e vou te levar de volta ao seu menu.",
    "cancelar novo caso terceiro"
  )
  return {
    texto: tinhaDados
      ? `🕒 *Atendimento pausado*\n\nRegistrei as informações já enviadas sobre o caso da outra pessoa.\n\nAgora você voltou para o seu menu do cliente.`
      : `✅ *Abertura cancelada*\n\nNenhum dado foi salvo porque você ainda não tinha informado nome, WhatsApp ou a situação da outra pessoa.\n\nAgora você voltou para o seu menu do cliente.`,
    opcoes: [
      { id: "m_inicio", title: "🏠 Meu menu" },
      { id: "m_novocaso", title: "➕ Abrir outro" },
      { id: "m_encerrar", title: "👋 Encerrar" }
    ]
  }
}

async function registrarCasoTerceiroNoWhatsAppInformado(from, u, numeroCaso, casoAnterior = null) {
  const telefoneTerceiro = normalizarNumeroWhatsAppEnvio(u.whatsappContato)
  if (!telefoneTerceiro || telefoneTerceiro === normalizarNumeroWhatsAppEnvio(from)) return false
  const nomeQuemAbriu = (casoAnterior?.nome || u.nomeContato || "").split(" ")[0].trim() || ""
  const estadoBase = desserializarEstado(serializarEstado(u)) || {}

  const estadoTerceiro = {
    ...estadoBase,
    stage: STAGES.CLIENTE,
    etapa: STAGES.CLIENTE,
    _numero: telefoneTerceiro,
    _novoCasoDeCliente: false,
    _novoCasoParaTerceiro: false,
    _casoAnteriorCliente: null,
    telefoneEhDoCliente: true,
    whatsappContato: telefoneTerceiro,
    whatsappVerificado: true,
    temCadastroCompleto: true,
    _aguardandoReconhecimentoTerceiro: true,
    aguardandoResposta: false,
    aguardandoRetomada: false,
    lastPergunta: null,
    lastPerguntaPayload: null
  }
  users[telefoneTerceiro] = { ...novoUsuario(u.nome || "Cliente"), ...estadoTerceiro }

  let enviado = false
  if (WHATSAPP_TEMPLATE_TERCEIRO) {
    const imagemTemplateTerceiro = WHATSAPP_TEMPLATE_TERCEIRO_IMAGEM_URL
    enviado = await enviarTemplateWhatsApp(telefoneTerceiro, WHATSAPP_TEMPLATE_TERCEIRO, [
      primeiroNomeCliente(u) || u.nome || "tudo bem",
      nomeQuemAbriu || "uma pessoa próxima",
      numeroCaso,
      u.area || "Jurídico"
    ], WHATSAPP_TEMPLATE_LANG, { headerImageUrl: imagemTemplateTerceiro })
  }

  if (!enviado) {
    enviado = await enviar(telefoneTerceiro,
      `Olá, *${primeiroNomeCliente(u) || u.nome || "tudo bem"}*!\n\nUm novo atendimento jurídico foi aberto para você pela *Oráculum Advocacia*${nomeQuemAbriu ? ` a pedido de *${nomeQuemAbriu}*` : ""}.\n\n📄 *Número do caso:* \`\`\`${numeroCaso}\`\`\`\n⚖️ *Área:* ${u.area ? "Direito " + u.area : "Jurídico"}\n\nA continuidade deste atendimento será feita por este WhatsApp.\n\nVocê reconhece esse atendimento?\n\n━━━━━━━━━━━━━━━\n_Seus dados são tratados com sigilo e utilizados exclusivamente para fins jurídicos, conforme a LGPD._`,
      [
        { id: "terceiro_reconhece", title: "✅ Reconheço" },
        { id: "terceiro_nao_reconhece", title: "❌ Não reconheço" }
      ]
    )
  }

  if (!enviado) {
    logErro("whatsapp", `Falha ao avisar terceiro sobre novo caso: ${telefoneTerceiro}`)
    if (u.negocioId) {
      await hsCriarNotaNegocio(
        u.negocioId,
        "ALERTA - NOTIFICACAO AO TERCEIRO NAO ENVIADA",
        `Não foi possível enviar a notificação automática ao WhatsApp informado (${telefoneTerceiro}). Provável janela de 24h fechada ou template ausente/não aprovado.`
      )
    }
  }

  agendarPersistenciaUsers()
  return enviado
}

async function finalizarCadastroTerceiroEVoltarOrigem(from, u, numeroCaso, casoAnterior = null) {
  const nomeTerceiro = u.nome || "a pessoa informada"
  const areaTerceiro = u.area || "Atendimento"
  const docs = getDocumentosListaCaso(u).map(d => `· ${d.label}`).join("\n")
  const notificacaoTerceiroEnviada = await registrarCasoTerceiroNoWhatsAppInformado(from, u, numeroCaso, casoAnterior)

  if (casoAnterior) {
    u._casoAnteriorCliente = casoAnterior
    restaurarCasoAnteriorCliente(u, from)
  } else {
    // Fluxo novo: usuário sem caso anterior — encerrar sessão limpa
    u._fluxoEncerrado = true
    setStage(u, STAGES.AUDIO_AGUARDANDO)
  }

  const avisoNotificacao = notificacaoTerceiroEnviada
    ? ""
    : "\n\n⚠️ O WhatsApp informado ficou registrado, mas a notificação automática pode não ter sido entregue agora."
  const texto = `🎉 *Caso de ${nomeTerceiro} registrado com sucesso!*\n\n📄 *Número do caso:* \`\`\`${numeroCaso}\`\`\`\n\n_Guarde esse número. É com ele que identificamos o atendimento._\n\nSeu caso foi encaminhado a um especialista em *Direito ${areaTerceiro}*, que fará a análise e entrará em contato em breve.\n\n⏱️ Prazo estimado: até 2 dias úteis\n━━━━━━━━━━━━━━━\n📋 *Documentos que podem ser necessários:*\n${docs}\n\nVocê pode enviar agora ou depois pelo WhatsApp informado.${avisoNotificacao}`
  const opcoes = casoAnterior
    ? [
        { id: "m_inicio", title: "🏠 Meu menu" },
        { id: "m_novocaso", title: "➕ Abrir outro" },
        { id: "m_encerrar", title: "👋 Encerrar" }
      ]
    : [
        { id: "m_encerrar", title: "👋 Encerrar" }
      ]

  if (IMAGEM_CASO_REGISTRADO_URL) {
    const enviada = await enviarImagemWhatsApp(from, IMAGEM_CASO_REGISTRADO_URL, texto, opcoes)
    if (enviada) return { texto: null, opcoes: null }
  }

  return {
    texto,
    opcoes
  }
}

async function encerrarNovoCasoClienteEVoltarMenu(from, u) {
  await capturarLeadTerceiroIncompleto(from, u, "encerramento_manual").catch(e =>
    logErro("hubspot", "capturarLeadTerceiroIncompleto encerramento: " + e.message)
  )
  const tinhaDados = temDadosUteisTerceiroIncompleto(u)
  if (!restaurarCasoAnteriorCliente(u, from)) return null
  await enviarAudioModoVoz(
    from,
    u,
    tinhaDados
      ? "Tudo bem. Encerrei este novo atendimento e registrei as informações já enviadas. Vou te levar de volta ao menu do cliente."
      : "Tudo bem. Encerrei este novo atendimento e vou te levar de volta ao menu do cliente.",
    "encerrar novo caso cliente"
  )
  u._menuClienteJaApresentado = true
  iniciarTimer(from)
  return menuCliente(u)
}

function usuarioTemRelatoParaRetomada(u) {
  return Boolean(
    sanitizarTextoEntrada(u?._audioCanalTranscricao) ||
    sanitizarTextoEntrada(u?.descricao) ||
    sanitizarTextoEntrada(u?.assuntoResumo) ||
    sanitizarTextoEntrada(u?._descTemp) ||
    sanitizarTextoEntrada(u?._relatoAnterior)
  )
}

function identificarEtapaAtual(u, payload) {
  const origem = payload?.perguntaId || u?.stage || ""

  if (ehStageDescricaoCaso(origem) || ehStageDescricaoCaso(u?.stage)) return "descricao_caso"
  if (["coleta_nome", "__coleta_nome_legado__", "coleta_tel_outro"].includes(origem) || ["coleta_nome", "__coleta_nome_legado__", "coleta_tel_outro"].includes(u?.stage)) return "nome"
  if (["coleta_cidade", "coleta_cidade_regiao", "__coleta_cidade_legado__"].includes(origem) || ["coleta_cidade", "coleta_cidade_regiao", "__coleta_cidade_legado__"].includes(u?.stage)) return "cidade"
  if (
    origem === "documentos" ||
    /documentos do caso/i.test(payload?.texto || "") ||
    (payload?.opcoes || []).some(o => ["docs_reenviar", "docs_maisFotos", "docs_proxdoc", "docs_pular_doc", "docs_rg_verso_junto", "docs_rg_sem_verso", "docs_enviar_faltantes", "docs_ver_status", "doc_cpf_skip", "docs_confirmar_envio_extra"].includes(o.id))
  ) return "documentos"
  if (origem === STAGES.AREA || origem === "area") return "area"

  return origem || "pergunta"
}

function registrarUltimaPergunta(u, payload) {
  if (!u || !payload?.texto || payload.registrarPergunta === false) return
  if (u.stage === STAGES.RETOMADA_AUTOMATICA) return
  if ([STAGES.RETOMADA_MENU, STAGES.RESUMO_ATENDIMENTO, STAGES.RESUMO_RETOMADA].includes(u.stage)) {
    u.lastPerguntaPayload = { texto: payload.texto, opcoes: payload.opcoes || null }
    u.aguardandoResposta = true
    return
  }
  const deveSalvar = payload.opcoes?.length || payload.texto.includes("?") || u.stage !== "cliente"
  if (!deveSalvar) return
  u.lastPergunta = payload.perguntaId || u.stage || "pergunta"
  if (u.stage === STAGES.AUDIO_AGUARDANDO && !usuarioTemRelatoParaRetomada(u)) {
    u.lastPerguntaPayload = { texto: payload.texto, opcoes: payload.opcoes || null }
    u.aguardandoResposta = true
    return
  }
  // Só salvar etapa se o stage atual for uma etapa válida (não está em ETAPAS_NAO_RETOMAVEIS)
  // Ex: stage "cliente" não é retomável — apenas registrar o payload sem tentar persistir a etapa
  const etapaParaSalvar = identificarEtapaAtual(u, payload)
  if (etapaValida(etapaParaSalvar)) {
    salvarEtapa(u._numero, etapaParaSalvar)
  }
  u.lastPerguntaPayload = { texto: payload.texto, opcoes: payload.opcoes || null }
  u.aguardandoResposta = true
}

function limparDadosCasoAtual(u, { preservarNome = true, marcarFluxoEncerrado = false } = {}) {
  const nomePreservado = preservarNome && u.nomeConfirmado ? u.nome : null
  const _stageAntes = u.stage
  const _etapaAntes = u.etapa
  const _stageRetomadaOriginalAntes = u._stageRetomadaOriginal
  const _stageRetomadaPreservado = obterStageRetomadaOriginal(u)
  const _atendenteAntes = u.atendente
  const _nomeConfirmadoAntes = Boolean(u.nomeConfirmado)
  const _areaAntes = u.area || null
  const _areaDetectadaAntes = u._areaDetectada || null
  const _situacaoAntes = u.situacao || null
  const _cidadeAntes = u.cidade || null
  const _ufAntes = u.uf || null
  const _regiaoAntes = u.regiao || null
  const _urgenciaAntes = u.urgencia || null
  const _descricaoAntes = u.descricao || null
  const _audioCanalTranscricaoAntes = u._audioCanalTranscricao || null
  const _negocioIdAntes = u.negocioId || null
  const _contatoIdAntes = u.contatoId || null
  limparTimerIncentivoDescricao(u)
  Object.assign(u, {
    stage: "inicio",
    etapa: STAGES.AUDIO_AGUARDANDO,
    nome: nomePreservado,
    regiao: null, cidade: null, uf: null,
    area: null, tipo: null, situacao: null, subTipo: null, detalhe: null,
    _docKey: null,
    urgencia: "normal", semReceber: false,
    contribuicao: null, recebeBeneficio: null, descricao: null,
    contatoId: null, negocioId: null, numeroCaso: null,
    pastaDriveId: null, pastaDriveLink: null,
    score: 0, documentosEnviados: false,
    docsEntregues: [], docsAusentes: [], docsPulados: [], docsParciais: [], docsDispensados: [],
    docAtualIdx: 0, ultimoArqId: null, ultimoArqNome: null,
    corrigirCampo: null, historiaIA: [],
    lastPergunta: null, lastPerguntaPayload: null,
    leadIncompletoCapturado: false,
    audiosDescCorrigidos: [],
    assuntoResumo: null,
    _ofereceuExplicarTudo: false,
    _sugestaoFluxo: null,
    _hubspotSyncSnapshot: null,
    _proximoStageAposDescricao: null,
    _proximaPerguntaAposDescricao: null,
    _entradaPendenteTipo: null, _entradaPendenteValor: null, _entradaPendenteOrigem: null,
    aguardandoRetomada: false,
    temCadastroCompleto: false,
    jaOfereceuRetomada: false,
    jaIncentivouDescricao: false,
    _retomadaEhLeadFrio: false,
    _stageRetomadaOriginal: null,
    _negocioStageIdPendente: null,
    _fluxoEncerrado: Boolean(marcarFluxoEncerrado),
    _regiao: null, _descTemp: null,
    _novoCasoParaTerceiro: false,
    _contextoDocsCasoAtual: null,
    _audioDescBuffer: null, _audioDescMime: null, _audioDescNome: null,
    _descOrigemStage: null,
    _audioFluxoTexto: null, _audioFluxoAcao: null, _audioFluxoResposta: null,
    _urgenteAudioBuffer: null, _urgenteAudioMime: null, _urgenteAudioNome: null, _urgenteAudioTexto: null,
    modoDigitando: false,
    aguardandoResposta: false,
    _jaEsclareceuRelato: false,
    _jaAcolheuSofrimento: false
  })
  if (marcarFluxoEncerrado) {
    const _stageTecnicoRetomada = [
      STAGES.RETOMADA_AUTOMATICA,
      STAGES.RETOMADA_MENU,
      STAGES.RESUMO_RETOMADA,
      STAGES.RESUMO_ATENDIMENTO
    ].includes(_stageAntesNormalizado)
    u.etapa = etapaValida(_etapaAntes) ? normalizarStageKey(_etapaAntes) : _stageRetomadaPreservado
    u._stageRetomadaOriginal = _stageTecnicoRetomada
      ? (_stageRetomadaPreservado || _stageRetomadaOriginalAntes || u.etapa)
      : (_stageRetomadaPreservado || _stageAntesNormalizado || u.etapa)
    u.atendente = _atendenteAntes || null
    u.nome = nomePreservado || null
    u.nomeConfirmado = _nomeConfirmadoAntes
    u.area = _areaAntes
    u._areaDetectada = _areaDetectadaAntes
    u.situacao = _situacaoAntes
    u.cidade = _cidadeAntes
    u.uf = _ufAntes
    u.regiao = _regiaoAntes
    u.urgencia = _urgenciaAntes || "normal"
    u.descricao = _descricaoAntes
    u._audioCanalTranscricao = _audioCanalTranscricaoAntes
    u.negocioId = _negocioIdAntes
    u.contatoId = _contatoIdAntes
  }
  agendarPersistenciaUsers()
}

function limparDadosAtendimento(u) {
  limparTimerIncentivoDescricao(u)
  Object.assign(u, {
    stage: "inicio",
    etapa: STAGES.AUDIO_AGUARDANDO,
    regiao: null, cidade: null, uf: null,
    area: null, tipo: null, situacao: null, subTipo: null, detalhe: null,
    _docKey: null,
    urgencia: "normal", semReceber: false,
    contribuicao: null, recebeBeneficio: null, descricao: null,
    pastaDriveId: null, pastaDriveLink: null,
    score: 0, documentosEnviados: false,
    docsEntregues: [], docsAusentes: [], docsPulados: [], docsParciais: [], docsDispensados: [],
    docAtualIdx: 0, ultimoArqId: null, ultimoArqNome: null,
    corrigirCampo: null,
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
    _stageRetomadaOriginal: null,
    _negocioStageIdPendente: null,
    _fluxoEncerrado: false,
    _regiao: null, _descTemp: null,
    _audioDescBuffer: null, _audioDescMime: null, _audioDescNome: null,
    _descOrigemStage: null,
    _audioFluxoTexto: null, _audioFluxoAcao: null, _audioFluxoResposta: null,
    _urgenteAudioBuffer: null, _urgenteAudioMime: null, _urgenteAudioNome: null, _urgenteAudioTexto: null,
    modoDigitando: false,
    aguardandoResposta: false,
    _jaAcolheuSofrimento: false
  })
  agendarPersistenciaUsers()
}

function prepararNovaEntradaAposFluxoEncerrado(u, nomeWA = "") {
  if (!u) return
  limparTimer(u)
  limparTimerIncentivoDescricao(u)

  const numero            = u._numero || null
  const nomeBase          = sanitizarTextoEntrada(u.nomeWA || nomeWA || "Cliente") || "Cliente"
  const nomePerfilWhatsApp = sanitizarTextoEntrada(u.nomePerfilWhatsApp || nomeWA || nomeBase) || "Cliente"
  const nomeHubspot       = u.nomeHubspot || null
  const hubspotSemContato = Boolean(u._hubspotSemContato)
  const processing        = Boolean(u.processing)

  // Preserva dados do cliente cadastrado
  const numeroCaso        = u.numeroCaso || null
  const negocioId         = u.negocioId || null
  const contatoId         = u.contatoId || null
  const nome              = u.nome || null
  const nomeConfirmado    = Boolean(u.nomeConfirmado)
  const area              = u.area || null
  const situacao          = u.situacao || null
  const urgencia          = u.urgencia || null
  const cidade            = u.cidade || null
  const uf                = u.uf || null
  const regiao            = u.regiao || null
  const docsEntregues     = u.docsEntregues || null
  const docsAusentes      = u.docsAusentes || null
  const docsPulados       = u.docsPulados || null
  const docsParciais      = u.docsParciais || null
  const docsDispensados   = u.docsDispensados || null
  const quantidadeCasos   = u.quantidadeCasos || null
  const temCadastroCompleto = Boolean(u.temCadastroCompleto)
  const modoTexto           = Boolean(u.modoTexto)

  Object.assign(u, novoUsuario(nomeBase), {
    _numero:              numero,
    nomeWA:               nomeBase,
    nomePerfilWhatsApp,
    nomeHubspot,
    _hubspotSemContato:   hubspotSemContato,
    processing,
    _fluxoEncerrado:      false,
    ultimaMsg:            Date.now(),
    // Restaura dados do cliente
    numeroCaso,
    negocioId,
    contatoId,
    nome,
    nomeConfirmado,
    area,
    situacao,
    urgencia,
    cidade,
    uf,
    regiao,
    docsEntregues,
    docsAusentes,
    docsPulados,
    docsParciais,
    docsDispensados,
    quantidadeCasos,
    temCadastroCompleto,
    modoTexto,
    atendente: u.atendente || null,
    _stageRetomadaOriginal: u._stageRetomadaOriginal || null,
    _areaDetectada: u._areaDetectada || null,
    _audioCanalTranscricao: u._audioCanalTranscricao || null,
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
      { id: "m_inicio", title: "🏠 Menu do cliente" }
    ]
  }
  return [
    { id: "docs_pular_doc", title: "Não tenho este" },
    { id: "docs_depois", title: "Continuar depois" },
      { id: "m_inicio", title: "🏠 Menu do cliente" }
  ]
}

async function prepararConfirmacaoEntrada(from, u, tipo, valor, origem) {
  u._entradaPendenteTipo = tipo
  u._entradaPendenteValor = valor
  u._entradaPendenteOrigem = origem
  setStage(u, STAGES.CONFIRMAR_ENTRADA)
  iniciarTimer(from)
  const label = tipo === "telefone" ? formatarTelefoneExibicao(valor) : valor
  const labelAudio = tipo === "telefone" ? formatarTelefoneAudio(valor) : valor
  const contextoAudio = origem === "coleta_tel_outro"
    ? "confirmar nome terceiro"
    : tipo === "telefone"
      ? "confirmar telefone"
      : tipo === "cidade"
        ? "confirmar cidade"
        : "confirmar entrada"
  const textoAudio = tipo === "nome"
    ? `Entendi. O nome informado foi ${labelAudio}. Está correto? Se sim, toque em Confirmar. Se não estiver, me diga o nome correto agora, pode falar ou digitar.`
    : tipo === "telefone"
      ? `O número informado foi ${labelAudio}. Está correto? Se sim, toque em Confirmar. Se não estiver, me diga o número correto agora, pode falar ou digitar.`
      : tipo === "cidade"
        ? `Você informou ${labelAudio}. Está correto? Se sim, toque em Confirmar. Se não estiver, me diga a cidade correta agora, pode falar ou digitar.`
        : `Você informou ${labelAudio}. Está correto? Se sim, toque em Confirmar. Se não estiver, me diga a informação correta agora, pode falar ou digitar.`
  await enviarAudioModoVoz(from, u, textoAudio, contextoAudio)
  const barra = tipo === "nome"
      ? "●●○○○○ 👤 Etapa 2 de 6 · *Nome*\n\n"
    : tipo === "telefone"
      ? "●●●●○○ 📱 Etapa 4 de 6 · *WhatsApp*\n\n"
    : tipo === "cidade"
        ? "●●●●●○ 📍 Etapa 5 de 6 · *Cidade*\n\n"
      : ""
  return {
    texto: `${barra}Você informou: *${label}*\nEstá correto? Se não estiver, é só me dizer a informação correta agora. Pode falar ou digitar. 🎙️`,
    opcoes: [
      { id: "entrada_ok", title: "✅ Confirmar" }
    ]
  }
}

function limparEntradaPendente(u) {
  u._entradaPendenteTipo = null
  u._entradaPendenteValor = null
  u._entradaPendenteOrigem = null
}

function resetarSessaoAtendimento(u) {
  const _stageAntes = u.stage
  const _atendenteAntes = u.atendente
  const _nomeAntes = u.nomeConfirmado ? u.nome : null
  const _nomeConfirmadoAntes = Boolean(u.nomeConfirmado)
  const _areaAntes = u.area || null
  const _areaDetectadaAntes = u._areaDetectada || null
  const _situacaoAntes = u.situacao || null
  const _cidadeAntes = u.cidade || null
  const _ufAntes = u.uf || null
  const _regiaoAntes = u.regiao || null
  const _urgenciaAntes = u.urgencia || null
  const _descricaoAntes = u.descricao || null
  const _audioCanalAntes = u._audioCanalTranscricao || null
  const _negocioIdAntes = u.negocioId || null
  const _contatoIdAntes = u.contatoId || null
  const _modoTextoAntes = Boolean(u.modoTexto)
  const base = novoUsuario(u.nomeWA || "Cliente")
  Object.assign(u, base)
  u._fluxoEncerrado = true
  u._stageRetomadaOriginal = _stageAntes || null
  u.atendente = _atendenteAntes || null
  u.nome = _nomeAntes
  u.nomeConfirmado = _nomeConfirmadoAntes
  u.area = _areaAntes
  u._areaDetectada = _areaDetectadaAntes
  u.situacao = _situacaoAntes
  u.cidade = _cidadeAntes
  u.uf = _ufAntes
  u.regiao = _regiaoAntes
  u.urgencia = _urgenciaAntes || "normal"
  u.descricao = _descricaoAntes
  u._audioCanalTranscricao = _audioCanalAntes
  u.negocioId = _negocioIdAntes
  u.contatoId = _contatoIdAntes
  u.modoTexto = _modoTextoAntes
  agendarPersistenciaUsers()
}

function responderEncerramento(u) {
  limparTimer(u)
  resetarSessaoAtendimento(u)
  // mensagem de encerramento mais humana, com emoji e nome
  // Quando atendimento para terceiro, fala com quem está no WhatsApp (nomeContato)
  const primeiroNome = (u.atendimentoParaTerceiro && u.nomeContato)
    ? u.nomeContato.split(" ")[0]
    : (primeiroNomeCliente(u) || "")
  const saudacao = primeiroNome ? `, ${primeiroNome}` : ""
  return {
    texto: `👋 Foi um prazer te atender${saudacao}! 😊\n\nSeu atendimento foi encerrado. Qualquer coisa, é só me chamar aqui — estou sempre disponível para ajudar. Até logo! 💙`,
    opcoes: null,
    registrarPergunta: false
  }
}

/**
 * Encerra o atendimento garantindo captura do lead no HubSpot.
 * Se o usuário ainda não é cliente (sem numeroCaso), captura antes de encerrar.
 */
async function encerrarComCaptura(from, u) {
  if (u?._casoAnteriorCliente && !u.numeroCaso) {
    const menuAnterior = await encerrarNovoCasoClienteEVoltarMenu(from, u)
    if (menuAnterior) return menuAnterior
  }
  if (u && !u.numeroCaso && !u.leadIncompletoCapturado) {
    await capturarLeadIncompleto(from, u).catch(e =>
      logErro("hubspot", "encerrarComCaptura: " + e.message)
    )
  }
  if (!u.modoTexto && from) {
    try {
      const primeiroNome = (u.atendimentoParaTerceiro && u.nomeContato)
        ? u.nomeContato.split(" ")[0]
        : (primeiroNomeCliente(u) || "")
      const textoAudio = primeiroNome
        ? `Foi um prazer te atender, ${primeiroNome}! Qualquer coisa, é só me chamar. Até logo!`
        : `Foi um prazer te atender! Qualquer coisa, é só me chamar. Até logo!`
      const ogg = await gerarAudioAtendente(u.atendente, textoAudio)
      await enviarAudio(from, urlAudioAtendente(ogg))
      await new Promise(r => setTimeout(r, 1500))
    } catch (e) { logErro("tts", "Falha áudio encerramento", e) }
  }
  return responderEncerramento(u)
}

async function encerrarAtendimento(from, u) {
  if (u?.numeroCaso) return encerrarClienteCadastrado(from, u)
  salvarEtapa(u._numero, u.stage)
  return encerrarComCaptura(from, u)
}

async function encerrarClienteCadastrado(from, u) {
  limparTimer(u)
  limparTimerIncentivoDescricao(u)
  const primeiroNome = (u.atendimentoParaTerceiro && u.nomeContato)
    ? u.nomeContato.split(" ")[0]
    : (primeiroNomeCliente(u) || "você")
  setStage(u, STAGES.CLIENTE)
  u._fluxoEncerrado = false
  u.aguardandoResposta = false
  u.aguardandoRetomada = false
  u.jaOfereceuRetomada = false
  u.lastPergunta = null
  u.lastPerguntaPayload = null
  agendarPersistenciaUsers()
  await enviarAudioModoVoz(
    from,
    u,
    `Tudo certo, ${primeiroNome}. Quando precisar, é só me chamar por aqui.`,
    "encerrar cliente cadastrado"
  )
  return {
    texto: `Tudo certo, *${primeiroNome}*. Quando precisar, é só me chamar por aqui.`,
    opcoes: null,
    registrarPergunta: false
  }
}

async function executarEncerramentoFluxo(from, u) {
  if (u?.numeroCaso) return encerrarClienteCadastrado(from, u)
  if (u?._casoAnteriorCliente && !u.numeroCaso) {
    const menuAnterior = await encerrarNovoCasoClienteEVoltarMenu(from, u)
    if (menuAnterior) return menuAnterior
  }
  limparTimer(u)
  const primeiroNome = (u.atendimentoParaTerceiro && u.nomeContato)
    ? u.nomeContato.split(" ")[0]
    : (primeiroNomeCliente(u) || "você")
  if (!u.numeroCaso && !u.leadIncompletoCapturado) {
    await capturarLeadIncompleto(from, u).catch(e =>
      logErro("hubspot", "executarEncerramentoFluxo: " + e.message)
    )
  }
  limparDadosCasoAtual(u, { marcarFluxoEncerrado: true })
  if (!u.modoTexto && from) {
    try {
      const textoAudio = primeiroNome !== "você"
        ? `Tudo bem, ${primeiroNome}! Quando quiser retomar, é só me chamar.`
        : `Tudo bem! Quando quiser retomar, é só me chamar.`
      const ogg = await gerarAudioAtendente(u.atendente, textoAudio)
      await enviarAudio(from, urlAudioAtendente(ogg))
      await new Promise(r => setTimeout(r, 1000))
    } catch (e) { logErro("tts", "Falha áudio encerramento", e) }
  }
  return { texto: `Tudo bem, ${primeiroNome}! 😊 Quando quiser retomar, é só me chamar.`, opcoes: null, registrarPergunta: false }
}

async function executarRecomecoFluxo(from, u) {
  if (podeMostrarMenuCliente(u)) {
    setStage(u, STAGES.CLIENTE)
    iniciarTimer(from)
    return await menuClienteComAudio(from, u)
  }

  u._audioFluxoTexto = null
  u._audioFluxoAcao = null
  u._audioFluxoResposta = null
  u._revalidandoCampos = true
  u.aguardandoResposta = false
  u.aguardandoRetomada = false
  if (!u.atendente) u.atendente = sortearAtendente()
  setStage(u, STAGES.AUDIO_AGUARDANDO)
  iniciarTimer(from)

  const primeiroNome = (u.atendimentoParaTerceiro && u.nomeContato)
    ? u.nomeContato.split(" ")[0]
    : (primeiroNomeCliente(u) || "")
  const saudacao = primeiroNome ? `, ${primeiroNome}` : ""
  const textoAudio = `Tudo bem${saudacao}. Vamos recomeçar com calma. Pode me contar sua situação novamente${complementoModo}. Estou aqui para ajudar você.`
  if (!u.modoTexto && from) {
    try {
      const ogg = await gerarAudioAtendente(u.atendente, textoAudio)
      await enviarAudio(from, urlAudioAtendente(ogg))
      await new Promise(r => setTimeout(r, 3000))
    } catch (e) { logErro("tts", "Falha áudio recomeçar fluxo", e) }
  }

  return {
    texto: `🔄 Tudo bem${saudacao} 😊\n\nVamos *recomeçar* com calma.\n\nPode me contar sua situação novamente${complementoModo}. Estou aqui para ajudar você.`,
    opcoes: null
  }
}

function stageAceitaTextoLivre(stage) {
  return new Set([
    "coleta_tel_outro",
    "coleta_tel_wpp",
    "coleta_tel_wpp_contato",
    STAGES.COLETA_DESC,
    STAGES.COLETA_DESC_AUDIO,
    STAGES.AGUARDANDO_URGENTE,
    STAGES.CORRIGIR_VALOR,
    STAGES.CONFIRMAR_ENTRADA,
    STAGES.AUDIO_AGUARDANDO,
    STAGES.ACOLHIMENTO_CONFIRMA_NOME,
    STAGES.ACOLHIMENTO_CONFIRMA_NOME_CONTATO,
    STAGES.ACOLHIMENTO_CONFIRMA_TITULAR_NOME,
    STAGES.ACOLHIMENTO_CONFIRMA_WHATSAPP,
    STAGES.ACOLHIMENTO_CONFIRMA_WHATSAPP_OUTRO,
    STAGES.ASSESSORIA_INICIAL,
    STAGES.CONFIRMAR_CORRECAO_NOME,
    STAGES.CONFIRMAR_CORRECAO_CIDADE
  ]).has(stage)
}

function ehStageFluxoAntigo(stage) {
  return new Set([
    STAGES.AREA,
    STAGES.ESCOLHA_CANAL,
    STAGES.ESCOLHA_AREA,
    STAGES.ENTENDIMENTO_INICIAL,
    STAGES.DIRECIONAMENTO,
    STAGES.AUDIO_OPCOES,
    STAGES.GATILHO,
    STAGES.URGENCIA,
    STAGES.COLETA_NOME_LEGADO,
    STAGES.COLETA_REGIAO,
    STAGES.COLETA_REGIAO_LEGADO,
    STAGES.COLETA_UF,
    STAGES.COLETA_UF_LEGADO,
    STAGES.COLETA_CIDADE,
    STAGES.COLETA_CIDADE_LEGADO,
    STAGES.COLETA_CIDADE_REGIAO,
    STAGES.COLETA_CONTRIB,
    STAGES.COLETA_CONTRIB_REGIAO,
    STAGES.COLETA_CONTRIB_REGIAO_V2,
    STAGES.COLETA_BENEF,
    STAGES.COLETA_BENEF_REGIAO_V2,
    STAGES.COLETA_VERIF_TEL,
    STAGES.INSS_MENU,
    STAGES.INSS_NOVO,
    STAGES.INSS_NEG_TIPO,
    STAGES.INSS_CORT_TIPO,
    STAGES.INSS_APOS,
    STAGES.INSS_BPC,
    STAGES.INSS_INC,
    STAGES.INSS_DEP,
    STAGES.INSS_OUT,
    STAGES.INSS_JA,
    STAGES.INSS_NEG_QUANDO,
    STAGES.INSS_CORT_MOT,
    STAGES.INSS_CORT_REC,
    STAGES.INSS_CORT_QDO,
    STAGES.TRAB_MENU,
    STAGES.TRAB_DEM_TIPO,
    STAGES.TRAB_DEM_VERB,
    STAGES.TRAB_DEM_QDO,
    STAGES.TRAB_DIR_TIPO,
    STAGES.TRAB_DIR_PEND,
    STAGES.TRAB_ACID_AF,
    STAGES.TRAB_ASS_S,
    STAGES.TRAB_ASS_PROV,
    STAGES.OUTROS_MENU,
    STAGES.OUT_CONS_TIPO,
    STAGES.OUT_REV_TIPO,
    STAGES.OUT_DESC,
    STAGES.TRAB_OUT_DESC,
    STAGES.SUGESTAO_FLUXO_OUTRO,
    STAGES.EXPLICAR_TUDO_OFERTA
  ].map(normalizarStageKey)).has(normalizarStageKey(stage))
}

function migrarFluxoAntigoParaRelatoLivre(u) {
  if (!u || u.numeroCaso || !ehStageFluxoAntigo(u.stage)) return false
  logDebug(`[LEGADO] ${u.stage} -> ${STAGES.AUDIO_AGUARDANDO} | USER: ${u._numero || "-"}`)
  setStage(u, STAGES.AUDIO_AGUARDANDO)
  salvarEtapa(u._numero, STAGES.AUDIO_AGUARDANDO)
  u.lastPergunta = null
  u.lastPerguntaPayload = null
  u._stageRetomadaOriginal = null
  return true
}

function podeMostrarMenuCliente(u) {
  return Boolean(u?.numeroCaso)
}

function getNumeroCasoOficialDoNegocio(negocio) {
  return sanitizarTextoEntrada(negocio?.properties?.numero_de_caso) || null
}

async function avancarAposTelefoneConfirmado(from, u) {
  if (u.nomeConfirmado && u.nome) {
    iniciarTimer(from)
    // suprimirAudio=true: a confirmação do telefone já enviou áudio antes desta chamada
    return await flowAcolhimentoCidade(u, { from, suprimirAudio: true })
  }
  setStage(u, STAGES.ACOLHIMENTO_NOME)
  salvarEtapa(u._numero || from, STAGES.ACOLHIMENTO_NOME)
  iniciarTimer(from)
  await enviarAudioModoVoz(
    from,
    u,
    "Para continuar, me diga o nome completo da pessoa atendida. Pode falar em áudio ou digitar.",
    "telefone confirmado nome"
  )
  return { texto: "●●○○○○ 👤 Etapa 2 de 6 · *Nome*\n\n😊 Para continuar, qual é o *nome completo* da pessoa atendida?", opcoes: null }
}

function retomarUltimaPergunta(u) {
  if (u.stage === STAGES.RETOMADA_AUTOMATICA) return null
  if (u.lastPerguntaPayload) return u.lastPerguntaPayload
  return null
}

function reapresentarPerguntaAtual(u) {
  return retomarUltimaPergunta(u)
}

async function perguntarNome(u) {
  const from = u._numero || ""
  if (u._vindoDeRetomada && !u.modoTexto && from) {
    u._vindoDeRetomada = false
    try {
      const textoRetomada = `Certo! Você estava na etapa de informar seu nome. Qual é o seu nome completo?`
      const ogg = await gerarAudioAtendente(u.atendente, textoRetomada)
      await enviarAudio(from, urlAudioAtendente(ogg))
      await new Promise(r => setTimeout(r, 2000))
    } catch (e) { logErro("tts", "Falha áudio retomada nome", e) }
  }
  setStage(u, STAGES.ACOLHIMENTO_NOME)
  salvarEtapa(u._numero, "nome")
  return { texto: "●●○○○○ 👤 Etapa 2 de 6 · *Nome*\n\n😊 Fico feliz em poder ajudar! Para começar, qual é o seu *nome completo*?", opcoes: null }
}

// Equivalente ao ACOLHIMENTO_NOME_CONTATO para o fluxo "para mim".
// Entra via ACOLHIMENTO_PARA_QUEM → "É para mim" e prepara o stage ACOLHIMENTO_NOME.
async function perguntarNomeProprio(from, u) {
  setStage(u, STAGES.ACOLHIMENTO_NOME)
  iniciarTimer(from)
  const audioNome = `Entendido! Vou registrar o caso em seu nome. Para comecar, qual e o seu nome completo? Pode falar em audio ou digitar.`
  if (!u.modoTexto) {
    try {
      const ogg = await gerarAudioAtendente(u.atendente, audioNome)
      await enviarAudio(from, urlAudioAtendente(ogg))
      await new Promise(r => setTimeout(r, 3500))
    } catch (e) { logErro("tts", "Falha audio nome proprio", e) }
  }
  return {
    texto: `●●○○○○ 👤 Etapa 2 de 6 · *Nome*\n\n🙋 *Atendimento para você*\n\nQual é o seu *nome completo*?\n\n_Digite ou envie um áudio com seu nome._ 🎙️`,
    opcoes: null
  }
}

// Pede o relato do caso após a coleta do(s) nome(s), antes de WhatsApp e cidade.
// Chamada quando o novo usuário veio pelo fluxo para_quem → nome(s) sem ter relatado ainda.
async function pedirRelatoAposNome(from, u) {
  // Quando atendimentoParaTerceiro: quem está no WhatsApp é u.nomeContato (ex: José),
  // quem vai ser atendido é u.nome (ex: Alberina).
  // A saudação é para quem está no WhatsApp; o "alvo" do relato é quem vai ser atendido.
  const primeiroNomeWhats = u.atendimentoParaTerceiro
    ? (u.nomeContato ? u.nomeContato.split(" ")[0] : "")
    : (primeiroNomeCliente(u) || "")
  const saudacao = primeiroNomeWhats ? `, ${primeiroNomeWhats}` : ""

  const primeiroNomeAtendido = u.atendimentoParaTerceiro
    ? (u.nome ? u.nome.split(" ")[0] : "a pessoa atendida")
    : null

  const alvoAudio = u.atendimentoParaTerceiro
    ? `o que está acontecendo com ${primeiroNomeAtendido}`
    : "a sua situação"

  // Sinalizar que o nome já foi coletado e confirmado neste fluxo,
  // para que proximaConfirmacaoProgressiva não o reclame.
  u._revalidandoCampos = true
  u._aguardandoRelatoAposNome = true
  if (!Array.isArray(u._revalidaConfirmados)) u._revalidaConfirmados = []
  if (!u._revalidaConfirmados.includes("nome")) u._revalidaConfirmados.push("nome")

  setStage(u, STAGES.AUDIO_AGUARDANDO)
  iniciarTimer(from)

  if (!u.modoTexto) {
    try {
      const ogg = await gerarAudioAtendente(u.atendente,
        `Entendido${saudacao}! Agora me conta ${alvoAudio}. Pode falar em áudio ou digitar, do jeito que for mais fácil para você.`)
      await enviarAudio(from, urlAudioAtendente(ogg))
      await new Promise(r => setTimeout(r, 4000))
    } catch (e) { logErro("tts", "Falha áudio relato pós-nome", e) }
  }

  const textoAlvoTela = u.atendimentoParaTerceiro
    ? `o que está acontecendo com *${primeiroNomeAtendido}*`
    : "a *sua situação*"

  const textoRelato = `●●●○○○ 📝 *Etapa 3 de 6 · Relato*\n\n📝 *Agora me conta o caso${saudacao}*\n\nMe conta ${textoAlvoTela} com detalhes.\n\nPode falar em áudio 🎙️ ou digitar 💬, do jeito que for mais fácil pra você.\n\n_Vou preparar tudo para o advogado já chegar pronto para te atender._ ⚖️`

  if (process.env.IMAGEM_RELATO_URL) {
    try {
      const enviada = await enviarImagemWhatsApp(from, process.env.IMAGEM_RELATO_URL, textoRelato, null)
      if (enviada) return { texto: null, opcoes: null }
    } catch (e) { logErro("imagem", "Falha ao enviar imagem relato pós-nome", e) }
  }

  return { texto: textoRelato, opcoes: null }
}

function perguntarCidade(u, stage = null) {
  const stageCidade = stage || STAGES.ACOLHIMENTO_CIDADE
  setStage(u, stageCidade)
  salvarEtapa(u._numero, "acolhimento_cidade")
  const primeiroNomeAtendido = u.atendimentoParaTerceiro && u.nome ? u.nome.split(" ")[0] : null
  const textoCidade = primeiroNomeAtendido
    ? `Em qual *cidade* ${primeiroNomeAtendido} mora?\n\nSe preferir, pode informar o *CEP* também.`
    : `Em qual *cidade* você mora?\n\nSe preferir, pode informar o *CEP* também.`
  return { texto: `●●●●●○ 📍 Etapa 5 de 6 · *Cidade*\n\n${textoCidade}`, opcoes: null }
}

function perguntarDescricao(u, stage = STAGES.COLETA_DESC_AUDIO) {
  entrarEtapaDescricao(u, stage)
  salvarEtapa(u._numero, "descricao_caso")
  return telaDescreverCaso()
}

async function perguntarDocumentos(from, u) {
  salvarEtapa(u._numero, "documentos")
  setStage(u, STAGES.CLIENTE)
  garantirListasDocumentos(u)
  u.docAtualIdx = u.docAtualIdx || 0
  u._docsClienteGuiado = false
  await enviarIntroDocumentos(from, u)
  return null
}

async function enviarTelaDocumentosCaso(from, u) {
  salvarEtapa(u._numero, "documentos")
  setStage(u, STAGES.CLIENTE)
  garantirListasDocumentos(u)
  u.docAtualIdx = u.docAtualIdx || 0
  u._docsClienteGuiado = true
  const tela = telaEnvioDoc(u, enviarOpcoesPadrao)
  await enviarGuiaDocs(from, u, tela)
  return null
}

function respostaRecomecoMenuPrincipal(u) {
  const primeiroNome = primeiroNomeCliente(u) || ""
  const saudacao = primeiroNome ? `, ${primeiroNome}` : ""
  setStage(u, STAGES.AUDIO_AGUARDANDO)
  return {
    texto: `Tudo bem${saudacao} 🙂\n\nVamos recomeçar com calma.\n\nPode me contar sua situação novamente${u?.modoTexto ? " por texto" : " por áudio ou texto"}. Estou aqui para ajudar você.`,
    opcoes: null
  }
}

async function iniciarFluxoRelatoLivre(from, u, { boasVindas = true } = {}) {
  if (!u.atendente) u.atendente = sortearAtendente()
  setStage(u, STAGES.AUDIO_AGUARDANDO)
  iniciarTimer(from)

  if (boasVindas) {
    try {
      await enviarImagemWhatsApp(from, "https://i.imgur.com/ztcFIuG.png", `Olá 😊\n\nSeja muito bem-vindo(a) à *Oráculum Advocacia.*\n\nEu sou *${u.atendente}* e vou acompanhar você durante este atendimento. Nossa equipe atua nas áreas *Previdenciária*, *Trabalhista* e em outras demandas jurídicas, sempre com atenção e cuidado com o seu caso. 💙\n\n⚖️ *Ao final do cadastro, você poderá falar diretamente com um advogado.*\n\nVocê pode digitar *recomeçar* ou *encerrar* a qualquer momento.\n\nConte comigo.\n\n━━━━━━━━━━━━━━━\n_Seus dados são tratados com sigilo e utilizados exclusivamente para fins jurídicos, conforme a LGPD._`)
    } catch (e) {
      logErro("boas-vindas", "Falha ao enviar imagem de boas-vindas", e)
      await enviar(from, `Olá 😊\n\nSeja muito bem-vindo(a) à *Oráculum Advocacia.*\n\nEu sou *${u.atendente}* e vou acompanhar você durante este atendimento. Nossa equipe atua nas áreas *Previdenciária*, *Trabalhista* e em outras demandas jurídicas, sempre com atenção e cuidado com o seu caso. 💙\n\n⚖️ *Ao final do cadastro, você poderá falar diretamente com um advogado.*\n\nVocê pode digitar *recomeçar* ou *encerrar* a qualquer momento.\n\nConte comigo.\n\n━━━━━━━━━━━━━━━\n_Seus dados são tratados com sigilo e utilizados exclusivamente para fins jurídicos, conforme a LGPD._`)
    }
    // Áudio de boas-vindas + pergunta de modo em um único envio (evita dois áudios seguidos)
    try {
      const ogg = await gerarAudioAtendente(u.atendente,
        `Olá! Meu nome é ${u.atendente} e vou acompanhar você neste atendimento. Ao final do cadastro, você poderá falar diretamente com um advogado. A qualquer momento você pode dizer recomeçar ou encerrar se precisar. Agora me diga: como prefere ser atendido durante este processo? Primeira opção: ouvir e responder por áudio, onde vou te guiando com perguntas em voz. Segunda opção: ler e digitar, onde você vê as perguntas por escrito e responde no seu ritmo.`)
      await enviarAudio(from, urlAudioAtendente(ogg))
      await new Promise(r => setTimeout(r, 5000))
    } catch (e) { logErro("tts", "Falha áudio boas-vindas+modo", e) }
  } else {
    // Sem boas-vindas: envia apenas o áudio da pergunta de modo (só se modoTexto não foi definido)
    if (!u.modoTexto) {
      try {
        const ogg = await gerarAudioAtendente(u.atendente,
          `Como prefere ser atendido durante este processo? Primeira opção: ouvir e responder por áudio, onde vou te guiando com perguntas em voz, uma de cada vez. Segunda opção: ler e digitar, onde você vê as perguntas por escrito e responde no seu ritmo.`)
        await enviarAudio(from, urlAudioAtendente(ogg))
        await new Promise(r => setTimeout(r, 4000))
      } catch (e) { logErro("tts", "Falha áudio escolha modo", e) }
    }
  }

  // Após as boas-vindas, pergunta o modo de atendimento preferido (etapa 1 de 6)
  return await telaEscolhaModo(from, u)
}


function deveCapturarLeadIncompleto(u) {
  if (u?.leadIncompletoCapturado) return false
  if (u?.numeroCaso) return false
  // Não capturar lead se ainda está no fluxo inicial (antes de qualquer interação relevante)
  const stagesIniciais = new Set([
    "audio_processando", "audio_confirmar_transcricao",
    "audio_confirmar_area_canal", "escolha_canal",
    "acolhimento"
    // audio_aguardando e assessoria_inicial removidos:
    // usuario que chegou ate esses stages ja relatou e tem dados capturáveis
  ])
  if (stagesIniciais.has(String(u?.stage || "").toLowerCase())) return false
  // não bloquear captura por ausência de nome —
  // o fallback "Lead WhatsApp" é aplicado em capturarLeadIncompleto
  return true
}

async function pularDescricaoPorAgora(from, u) {
  u.jaIncentivouDescricao = true
  salvarEtapa(u._numero, "descricao_caso")
  u._descTemp = null
  u._audioDescBuffer = null
  u._audioDescMime = null
  u._audioDescNome = null

  if (u._descOrigemStage === "trab_out_desc" || u._descOrigemStage === "out_desc" || u.stage === "trab_out_desc" || u.stage === "out_desc") {
    u._descOrigemStage = null
    setStage(u, "gatilho")
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
    setStage(u, proximoStage)
    iniciarTimer(from)
    if (proximoStage === STAGES.CONFIRMACAO) {
      await sincronizarNegocio(u)
      const tela = await telaConfirmacaoComImagem(from, u)
      return { texto: `Sem problemas 😊 podemos continuar e você envia depois\n\n${tela.texto}`, opcoes: tela.opcoes }
    }
    if (proximaPergunta) {
      return { texto: `Sem problemas 😊 podemos continuar e você envia depois\n\n${proximaPergunta.texto}`, opcoes: proximaPergunta.opcoes || null }
    }
  }

  u._descOrigemStage = null
  setStage(u, STAGES.CONFIRMACAO)
  iniciarTimer(from)
  await sincronizarNegocio(u)
  const tela = await telaConfirmacaoComImagem(from, u)
      return { texto: `Sem problemas 😊 podemos continuar e você envia depois\n\n${tela.texto}`, opcoes: tela.opcoes }
}

function ehStageDescricaoCaso(stage) {
  return [STAGES.COLETA_DESC, STAGES.COLETA_DESC_AUDIO, "trab_out_desc", "out_desc"].includes(stage)
}

function entrarEtapaDescricao(u, stage = STAGES.COLETA_DESC_AUDIO) {
  setStage(u, stage)
  salvarEtapa(u._numero, "descricao_caso")
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

  if (obterEtapaSegura(u._numero) !== "descricao_caso") return
  if (!ehStageDescricaoCaso(u.stage)) return
  if (u.jaIncentivouDescricao) return

  const ultimaMsgBase = Number(u.ultimaMsg || 0)
  const espera = u.modoDigitando ? 3 * 60 * 1000 : 2 * 60 * 1000

  u.timerIncentivoDescricao = setTimeout(async () => {
    const atual = users[from]
    if (!atual) return
    if (obterEtapaSegura(atual._numero) !== "descricao_caso") return
    if (!ehStageDescricaoCaso(atual.stage)) return
    if (atual.jaIncentivouDescricao) return
    if (Number(atual.ultimaMsg || 0) !== ultimaMsgBase) return

    atual.jaIncentivouDescricao = true
    atual.timerIncentivoDescricao = null
    atual.aguardandoResposta = true
    agendarPersistenciaUsers()

    // Áudio no incentivo de descrição se modo voz
    const textoIncentivo = `Posso te ajudar nisso. Se preferir, pode mandar um áudio ou escrever do seu jeito. Quer continuar agora ou prefere fazer isso depois?`
    if (!atual.modoTexto && atual.atendente) {
      try {
        const ogg = await gerarAudioAtendente(atual.atendente, textoIncentivo)
        await enviarAudio(from, urlAudioAtendente(ogg))
        await new Promise(r => setTimeout(r, 2000))
      } catch (e) { logErro("tts", "Falha áudio incentivo descrição", e) }
    }
    await enviar(
      from,
      "Posso te ajudar nisso 😊\nSe preferir, pode mandar um áudio ou escrever do seu jeito.\n\nQuer continuar agora ou prefere fazer isso depois?",
      [
        { id: "desc_incentivo_continuar", title: "▶️ Continuar agora" },
        { id: "desc_incentivo_depois",    title: "⏭️ Enviar depois" },
        { id: "desc_incentivo_menu",      title: "🏠 Menu do cliente" },
        { id: "desc_incentivo_encerrar",  title: "👋 Encerrar" }
      ],
      false
    )
  }, espera)
}

function iniciarTimer(from) {
  const u = users[from]
  if (!u) return
  limparTimer(u)

  if (u.numeroCaso) {
    u.timer = setTimeout(() => {
      const atual = users[from]
      if (!atual) return
      atual.aguardandoResposta = false
      atual.aguardandoRetomada = false
      atual.modoDigitando = false
      atual.timer = null
      agendarPersistenciaUsers()
    }, 30 * 60 * 1000)
    return
  }

  agendarIncentivoDescricao(from)

  // Para clientes com sofrimento detectado: pausa em 10 min (dobro) + abandono em 20 min.
  // Razão: a pessoa pode precisar de mais tempo para se organizar emocionalmente
  // sem sentir que o atendimento foi encerrado por falta de resposta rápida.
  const temSofrimentoAtivo = u._jaAcolheuSofrimento === true
  const t1 = (temSofrimentoAtivo ? 10 : 5) * 60 * 1000 + (u.modoDigitando ? 3 * 60 * 1000 : 0)
  const t2 = (temSofrimentoAtivo ? 20 : 10) * 60 * 1000

  if (!AUTO_REENGAJAMENTO) {
    u.timer = setTimeout(() => {
      const atual = users[from]
      if (!atual) return
      atual.aguardandoResposta = false
      atual.aguardandoRetomada = false
      atual.modoDigitando = false
      atual.timer = null
      agendarPersistenciaUsers()
    }, t1 + t2)
    return
  }

  u.timer = setTimeout(async () => {
    if (!users[from]) return
    if (u.modoDigitando) {
      u.modoDigitando = false
      iniciarTimer(from)
      return
    }

    if (u._casoAnteriorCliente && !u.numeroCaso) {
      const primeiroNomePausaTerceiro = primeiroNomeCliente(u._casoAnteriorCliente) || ""
      const saudacaoPausaTerceiro = primeiroNomePausaTerceiro ? `, ${primeiroNomePausaTerceiro}` : ""
      const textoPausaTerceiro = `Oi${saudacaoPausaTerceiro}. A abertura do caso para outra pessoa ficou pausada. Você quer continuar de onde parou ou cancelar e voltar ao seu menu?`
      if (!u.modoTexto && u.atendente) {
        try {
          const ogg = await gerarAudioAtendente(u.atendente, textoPausaTerceiro)
          await enviarAudio(from, urlAudioAtendente(ogg))
          await new Promise(r => setTimeout(r, 2000))
        } catch (e) { logErro("tts", "Falha áudio pausa terceiro", e) }
      }
      const _labelCancelarTimer = "🏠 Meu menu"
      await enviar(from, `🕒 *Abertura de caso pausada*\n\nOi${saudacaoPausaTerceiro} 😊\n\nVocê estava abrindo um atendimento para outra pessoa.\n\nComo deseja continuar?`, [
        { id: "cont_retomar", title: "▶️ Continuar" },
      { id: "terceiro_cancelar_menu", title: _labelCancelarTimer },
      { id: "m_encerrar", title: "👋 Encerrar" }
      ], false)

      u.aguardandoResposta = true
      u.aguardandoRetomada = true

      u.timer = setTimeout(async () => {
        if (!users[from]) return
        if (u.modoDigitando) u.modoDigitando = false
        u.aguardandoRetomada = false
        u.aguardandoResposta = false
        const resposta = await cancelarNovoCasoClienteEVoltarMenu(from, u, "inatividade")
        if (resposta) await enviar(from, resposta.texto, resposta.opcoes || null, false)
        agendarPersistenciaUsers()
      }, t2)
      return
    }

    // Mensagem de pausa — diferenciada se sofrimento foi detectado nesta sessão
    const primeiroNomePausa = primeiroNomeCliente(u) || ""
    const saudacaoPausa = primeiroNomePausa ? `, ${primeiroNomePausa}` : ""
    const pausaComSofrimento = u._jaAcolheuSofrimento === true
    const textoPausa = pausaComSofrimento
      ? `Oi${saudacaoPausa}, estou por aqui. Sei que o que você me contou é difícil. Seu atendimento ficou salvo — quando quiser continuar, é só me chamar.`
      : `Oi${saudacaoPausa} 😊 Fiquei te esperando. Seu progresso está salvo. Como deseja continuar?`
    const textoTelaPausa = pausaComSofrimento
      ? `💙 *Aqui quando você precisar*\n\nOi${saudacaoPausa}. Estou por aqui.\n\n_Sei que o que você me contou é difícil. Seu atendimento ficou salvo — continue quando se sentir pronto._\n\nComo deseja continuar?`
      : `🕒 *Atendimento pausado*\n\nOi${saudacaoPausa} 😊 Fiquei te esperando.\n\n📌 Seu progresso está salvo.\n\nComo deseja continuar?`
    if (!u.modoTexto && u.atendente) {
      try {
        const ogg = await gerarAudioAtendente(u.atendente, textoPausa)
        await enviarAudio(from, urlAudioAtendente(ogg))
        await new Promise(r => setTimeout(r, 2000))
      } catch (e) { logErro("tts", "Falha áudio pausa", e) }
    }
    await enviar(from, textoTelaPausa, [
        { id: "cont_retomar", title: "▶️ Continuar" },
      { id: "recomecar",    title: "🔄 Recomeçar" },
      { id: "m_encerrar", title: "👋 Encerrar" }
    ], false)

    // salvar o stage exato do momento da pausa para que cont_retomar
    // restaure o stage correto (ex: AUDIO_AGUARDANDO) e não apenas o payload visual
    u._stageRetomadaOriginal = u.stage
    u.aguardandoResposta = true
    u.aguardandoRetomada = true

    u.timer = setTimeout(async () => {
      if (!users[from]) return
      if (u.modoDigitando) u.modoDigitando = false

      u.aguardandoRetomada = false
      u.aguardandoResposta = false

      // Mensagem de abandono — diferenciada se sofrimento foi detectado nesta sessão
      const primeiroNomeAb = primeiroNomeCliente(u) || ""
      const saudacaoAb = primeiroNomeAb ? `, ${primeiroNomeAb}` : ""
      const abandonoComSofrimento = u._jaAcolheuSofrimento === true
      const textoAbandono = abandonoComSofrimento
        ? `Tudo bem${saudacaoAb}. Vou ficar por aqui. Quando você estiver pronto para continuar, é só me chamar. Cuide-se.`
        : `Tudo bem${saudacaoAb}. Vou pausar por agora. Quando quiser continuar, é só me chamar aqui. Estou à disposição. 😊`
      const textoTelaAbandono = abandonoComSofrimento
        ? `💙 Tudo bem${saudacaoAb}.\n\nFico por aqui. Quando você estiver pronto para continuar, é só me chamar.\n\n_Cuide-se._`
        : `Tudo bem${saudacaoAb}. Vou pausar por agora. 😊\n\nQuando quiser continuar, é só me chamar aqui. Estou à disposição!`
      if (!u.modoTexto && u.atendente) {
        try {
          const ogg = await gerarAudioAtendente(u.atendente, textoAbandono)
          await enviarAudio(from, urlAudioAtendente(ogg))
          await new Promise(r => setTimeout(r, 2000))
        } catch (e) { logErro("tts", "Falha áudio abandono", e) }
      }
      await enviar(from, textoTelaAbandono, null, false)

      await capturarLeadIncompleto(from, u)
      limparDadosCasoAtual(u, { preservarNome: false, marcarFluxoEncerrado: true })
      agendarPersistenciaUsers()
    }, t2)
  }, t1)
}

function restaurarTimersPersistidos() {
  const agora = Date.now()
  let restaurados = 0

  for (const [from, u] of Object.entries(users)) {
    if (!u || u._fluxoEncerrado) continue
    u._numero = from
    limparTimer(u)
    limparTimerIncentivoDescricao(u)

    const ultimaMsg = Number(u.ultimaMsg || 0)
    const idade = ultimaMsg ? agora - ultimaMsg : Infinity
    const janelaRecente = u.numeroCaso ? 30 * 60 * 1000 : 15 * 60 * 1000
    if (idade > janelaRecente) continue

    iniciarTimer(from)
    restaurados++
  }

  if (restaurados) logDebug(`[PERSISTENCIA] ${restaurados} timer(s) restaurado(s)`)
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
  return { texto:"🗺️ *Selecione sua região no Brasil*", opcoes:[
    { id:"reg_n", title:"🌳 Norte" }, { id:"reg_ne", title:"☀️ Nordeste" },
    { id:"reg_co", title:"🌾 Centro-Oeste" }, { id:"reg_se", title:"🏙️ Sudeste" },
    { id:"reg_s", title:"🌲 Sul" }
  ]}
}
function telaUFsRegiao(regId) {
  const reg = REGIOES[regId]
  if (!reg) return telaRegioes()
  return { texto: `📍 *${reg.label}*\n\nEscolha seu estado:`, opcoes: reg.ufs.map(([id,title]) => ({ id, title: `📍 ${title}` })) }
}

function criarCtx({ from = "", nomeWA = "", text = "", msgObj = null, buttonId = "", tipo = "", ehAudio = false, ehDoc = false, timestamp = Date.now() } = {}) {
  return {
    from: sanitizarTextoEntrada(from),
    nomeWA: sanitizarTextoEntrada(nomeWA),
    text: String(text ?? "").trim(),
    msgObj,
    buttonId: sanitizarTextoEntrada(buttonId),
    isAudio: ehAudio,
    isImage: sanitizarTextoEntrada(tipo) === "image",
    messageId: sanitizarTextoEntrada(msgObj?.id),
    timestamp
  }
}

// ================================================================
//  SERVICES (IA, áudio, integrações)
// ================================================================

const hubspotClient = {
  crm: {
    deals: {
      basicApi: {
        update: async (dealId, body) => {
          const stageId = body?.properties?.dealstage
          logDebug("Mudando etapa para:", stageId)
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
configurarHubSpotSync({
  HUBSPOT_TOKEN,
  HS_STAGE,
  hubspotClient,
  getHubSpotDealProps,
  getHubSpotDealStateProps,
  getNomeDeal,
  mapearStageParaDealstage,
  getNumeroCasoOficialDoNegocio,
  restaurarTipoCasoHubSpot,
  etapaValida,
  serializarEstado,
  desserializarEstado,
  hidratarUsuarioPersistido
})

function textoOuTraco(valor) {
  return sanitizarTextoEntrada(valor) || "-"
}

function resumoFatosJuridico(u = {}, briefing = gerarBriefingCaso(u)) {
  const area = textoOuTraco(briefing.area)
  const situacao = formatarSituacaoJuridica(briefing.situacao, u.tipo, u.subTipo)
  const cidade = textoOuTraco(briefing.cidade)
  const relato = textoOuTraco(briefing.relato)
  return `Caso de ${area}, em ${cidade}. Situacao informada: ${textoOuTraco(situacao)}. Relato-base: ${relato}`
}

function pedidoClienteJuridico(u = {}, briefing = gerarBriefingCaso(u)) {
  const relato = normalizarTextoGatilho([
    briefing.relato,
    u.descricao,
    u._audioCanalTranscricao,
    u.assuntoResumo,
    u.situacao,
    u.detalhe
  ].filter(Boolean).join(" "))

  if (/\b(aposentadoria|bpc|beneficio|inss|auxilio|pericia)\b/.test(relato)) {
    return "Analisar beneficio previdenciario e orientar providencias/documentos."
  }
  if (/\b(demissao|verbas|salario|fgts|rescisao|trabalho|emprego|assedi)\b/.test(relato)) {
    return "Avaliar direitos trabalhistas, valores pendentes e proxima medida."
  }
  if (/\b(pensao|guarda|divorcio|alimentos|filho|familia)\b/.test(relato)) {
    return "Avaliar medida familiar cabivel e documentos para analise."
  }
  if (/\b(divida|cobranca|produto|servico|banco|negativacao|consumidor)\b/.test(relato)) {
    return "Analisar relacao de consumo, provas e possibilidade de solucao."
  }
  if (/\b(despejo|aluguel|imovel|locacao|posse|condominio)\b/.test(relato)) {
    return "Avaliar situacao imobiliaria, risco imediato e documentos do imovel."
  }
  return "Analisar viabilidade juridica e orientar os proximos passos."
}

function riscoPrazoJuridico(u = {}, briefing = gerarBriefingCaso(u)) {
  const urgencia = u.urgencia || briefing.urgencia || "normal"
  const emocional = briefing.scoreEmocional?.nivel || "baixo"
  if (urgencia === "alta") return "Prioridade alta. Verificar prazo, risco imediato e necessidade de resposta humana rapida."
  if (emocional === "alto") return "Risco emocional alto. Recomendada revisao humana cuidadosa mesmo sem prazo confirmado."
  if (briefing.consultaAtiva) return "Consulta ativa. Conferir pauta e documentos antes do atendimento."
  return "Sem prazo critico confirmado no pre-atendimento. Revisar documentos e validar viabilidade."
}

function documentosEssenciaisJuridico(briefing = {}) {
  const faltantes = briefing.documentos?.faltantesCriticos || []
  if (!faltantes.length) return "Nenhum documento critico pendente no checklist atual."
  const lista = faltantes.slice(0, 5).join(", ")
  return faltantes.length > 5 ? `${lista} e outros ${faltantes.length - 5}.` : lista
}

function proximaEtapaConfirmacao(u = {}, briefing = gerarBriefingCaso(u)) {
  if (u.urgencia === "alta") return "nossa equipe sera avisada para priorizar a analise inicial"
  if ((briefing.documentos?.faltantesCriticos || []).length > 0) return "o caso sera registrado e voce podera enviar os documentos por aqui"
  return "o caso sera registrado oficialmente para analise da equipe"
}

// Estágios considerados "finalizados" no HubSpot — negócios nesses estágios são ignorados


function calcularStageAposAgendamento(u) {
  const statusDocs = calcularStatusDocumentos(u)
  const recebeuAlgumDocumento = Boolean(u?.documentosEnviados) || statusDocs.recebidos.length > 0
  if (!recebeuAlgumDocumento) return HS_STAGE.ANALISE
  if (statusDocs.faltantesCriticos.length > 0) return HS_STAGE.AGUARDANDO_DOCS
  return HS_STAGE.DOCS
}

function localizarUsuarioAgendamento({ eventId = "", dealId = "", phone = "" } = {}) {
  const evento = sanitizarTextoEntrada(eventId)
  const negocio = sanitizarTextoEntrada(dealId)
  const numero = normalizarNumeroWhatsAppEnvio(phone)

  for (const [from, u] of Object.entries(users)) {
    if (evento && u?._eventoCalendarId === evento) return { from, u }
    if (negocio && String(u?.negocioId || "") === negocio) return { from, u }
    if (numero && normalizarNumeroWhatsAppEnvio(from) === numero) return { from, u }
    if (numero && normalizarNumeroWhatsAppEnvio(u?.whatsappContato) === numero) return { from, u }
  }

  return { from: null, u: null }
}

async function liberarAgendamentoERecalcularStage(u, motivo = "agendamento_liberado") {
  if (!u) return { atualizado: false, motivo: "usuario_nao_encontrado" }

  const eventoAnterior = u._eventoCalendarId || null
  if (eventoAnterior) {
    u._ultimoEventoCalendarId = eventoAnterior
    u._ultimoEventoCalendarMotivo = motivo
    u._ultimoEventoCalendarLiberadoEm = new Date().toISOString()
  }
  u._eventoCalendarId = null

  const stageAtual = sanitizarTextoEntrada(u.negocioStageId)
  const stagesNaoRecalcular = [HS_STAGE.PROTOCOLO, HS_STAGE.PROCESSO, HS_STAGE.FINAL]
  if (stagesNaoRecalcular.includes(stageAtual)) {
    agendarPersistenciaUsers()
    return { atualizado: true, stageAlterado: false, motivo, eventoAnterior, stageAtual }
  }

  const novoStage = calcularStageAposAgendamento(u)
  let hubspotTentado = false
  let hubspotAtualizado = null
  if (u.negocioId && novoStage && stageAtual !== novoStage) {
    hubspotTentado = true
    const atualizado = await hsAtualizarNegocioComEstado(u, { dealstage: novoStage })
    hubspotAtualizado = Boolean(atualizado)
    if (atualizado) {
      u.negocioStageId = novoStage
      u._hubspotSyncSnapshot = null
    }
  } else if (novoStage) {
    u.negocioStageId = novoStage
  }

  agendarPersistenciaUsers()
  return {
    atualizado: true,
    stageAlterado: stageAtual !== novoStage,
    motivo,
    eventoAnterior,
    stageAnterior: stageAtual,
    novoStage,
    hubspotTentado,
    hubspotAtualizado
  }
}

function labelStageAdmin(stage) {
  const mapa = {
    [HS_STAGE.LEAD]: "🟡 Lead",
    [HS_STAGE.CADASTRO]: "📝 Cadastro",
    [HS_STAGE.ANALISE]: "🔎 Analise",
    [HS_STAGE.AGUARDANDO_DOCS]: "📎 Docs pendentes",
    [HS_STAGE.DOCS]: "📁 Docs recebidos",
    [HS_STAGE.AGENDAMENTO]: "📅 Consulta",
    [HS_STAGE.PROTOCOLO]: "📮 Protocolo",
    [HS_STAGE.PROCESSO]: "⚖️ Processo",
    [HS_STAGE.FINAL]: "✅ Encerrado"
  }
  return mapa[stage] || sanitizarTextoEntrada(stage) || "⚪ Sem stage"
}

const ADMIN_IDS = {
  menu: "adm_menu",
  prioridades: "adm_prioridades",
  agenda: "adm_agenda",
  casos: "adm_casos",
  alertas: "adm_alertas",
  casosNovos: "adm_casos_novos",
  casosAnalise: "adm_casos_analise",
  casosDocs: "adm_casos_docs",
  alertasCriticos: "adm_alertas_criticos",
  alertasParados: "adm_alertas_parados",
  alertasDocs: "adm_alertas_docs",
  alertasAgenda: "adm_alertas_agenda",
  alertasUrgentes: "adm_alertas_urgentes",
  alertasSemResposta: "adm_alertas_sem_resposta",
  resumo: "adm_resumo_diario",
  casoLinks: "adm_caso_links",
  casoPedirDocs: "adm_caso_pedir_docs",
  casoLembrete: "adm_caso_lembrete",
  casoRevisado: "adm_caso_revisado",
  casoMarcarUrgente: "adm_caso_marcar_urg",
  casoEnviarAnalise: "adm_caso_enviar_analise",
  cancelarConsulta: "adm_cancelar_consulta",
  cancelarSim: "adm_cancelar_sim",
  cancelarNao: "adm_cancelar_nao"
}
configurarAdminCaseUi({
  ADMIN_IDS,
  labelStageAdmin
})

const ADMIN_REVISADO_TTL_MS = 6 * 60 * 60 * 1000

function montarNotificacaoCancelamentoClienteAdmin({ from, u, dataHora, eventoId, resultado } = {}) {
  const novoStage = resultado?.novoStage || u?.negocioStageId
  const stageAnterior = resultado?.stageAnterior || resultado?.stageAtual || ""
  const hubspotLink = u?.negocioId ? linkHubSpot(u.negocioId) : ""
  const hubspotOk = !resultado?.hubspotTentado || resultado?.hubspotAtualizado === true
  const precisaRevisar = !resultado?.atualizado || !hubspotOk || !u?.negocioId
  const statusOperacional = precisaRevisar
    ? "⚠️ *Ação recomendada:* revisar manualmente no HubSpot/agenda."
    : "✅ *Nenhuma ação manual necessária.*\nO evento foi removido, o stage foi recalculado e o caso ficou na etapa correta."

  return [
    precisaRevisar ? "⚠️ *Cancelamento precisa de revisão*" : "❌ *Consulta cancelada pelo cliente*",
    "",
    `👤 ${u?.nome || "Cliente"}`,
    `📄 Caso: ${u?.numeroCaso || "-"}`,
    `⚖️ Área: ${u?.area || "-"}`,
    `📅 Consulta: ${dataHora || "-"}`,
    `📱 WhatsApp: ${from || "-"}`,
    `📌 Novo status: ${labelStageAdmin(novoStage)}`,
    stageAnterior && stageAnterior !== novoStage ? `🔁 Antes: ${labelStageAdmin(stageAnterior)}` : "",
    eventoId ? `🗓️ Evento: ${eventoId}` : "",
    hubspotLink ? `🔗 HubSpot: ${hubspotLink}` : "🔗 HubSpot: negócio não identificado",
    "",
    statusOperacional
  ].filter(Boolean).join("\n")
}

function normalizarItemAdminLocal(from, u, negocio = null, contato = null) {
  const props = negocio?.properties || {}
  const snapshot = desserializarEstado(props.estado_bot_snapshot) || {}
  const urgenciaProps = sanitizarTextoEntrada(props.urgencia).toLowerCase()
  const telefone = normalizarNumeroWhatsAppEnvio(contato?.properties?.phone || from || snapshot._numero || snapshot.whatsappContato)
  const base = hidratarUsuarioPersistido({
    ...snapshot,
    nome: snapshot.nome || contato?.properties?.firstname || props.dealname || u?.nome || "Cliente",
    nomeWA: snapshot.nomeWA || contato?.properties?.firstname || u?.nomeWA || "Cliente",
    contatoId: contato?.id || snapshot.contatoId || u?.contatoId || null,
    negocioId: negocio?.id || snapshot.negocioId || u?.negocioId || null,
    negocioStageId: negocio?.stageId || props.dealstage || snapshot.negocioStageId || u?.negocioStageId || null,
    numeroCaso: getNumeroCasoOficialDoNegocio(negocio) || snapshot.numeroCaso || u?.numeroCaso || null,
    area: snapshot.area || props.area_juridica || u?.area || null,
    urgencia: snapshot.urgencia || ({ alta: "alta", moderada: "normal", baixa: "baixa" }[urgenciaProps]) || u?.urgencia || "normal",
    descricao: snapshot.descricao || props.description || props.descricao_completa || u?.descricao || null,
    assuntoResumo: snapshot.assuntoResumo || props.resumo_cliente || u?.assuntoResumo || null,
    _eventoCalendarId: snapshot._eventoCalendarId || u?._eventoCalendarId || null
  })
  base._numero = telefone || from || null
  return { from: telefone || from || "", u: base, negocio, contato }
}

async function hsAdminBuscarContatoDoNegocio(dealId) {
  try {
    const assoc = await axios.get(
      `https://api.hubapi.com/crm/v3/objects/deals/${dealId}/associations/contacts`,
      { headers: HS() }
    )
    const contactId = assoc.data?.results?.[0]?.id
    if (!contactId) return null
    const contato = await axios.get(
      `https://api.hubapi.com/crm/v3/objects/contacts/${contactId}?properties=firstname,phone`,
      { headers: HS() }
    )
    return contato.data || null
  } catch (e) {
    logErro("admin_hubspot", "buscarContatoDoNegocio: " + (e.response?.data?.message || e.message))
    return null
  }
}

async function hsAdminBuscarNegociosPorStages(stages = [], limit = 50) {
  const valores = stages.filter(Boolean)
  if (!valores.length) return []
  try {
    const res = await axios.post(
      "https://api.hubapi.com/crm/v3/objects/deals/search",
      {
        filterGroups: [{ filters: [{ propertyName: "dealstage", operator: "IN", values: valores }] }],
        sorts: [{ propertyName: "createdate", direction: "DESCENDING" }],
        properties: [
          "dealstage", "dealname", "createdate", "closedate", "description",
          "resumo_cliente", "descricao_completa", "area_juridica", "estado_bot_snapshot",
          "etapa_do_bot", "tipo_de_caso", "temperatura_lead", "hs_priority", "numero_de_caso",
          "urgencia"
        ],
        limit
      },
      { headers: HS() }
    )
    return (res.data?.results || []).map(n => ({
      id: n.id,
      stageId: n.properties?.dealstage || null,
      createdate: n.properties?.createdate || null,
      properties: n.properties || {}
    }))
  } catch (e) {
    logErro("admin_hubspot", "buscarNegociosPorStages: " + (e.response?.data?.message || e.message))
    return []
  }
}

async function mapearComLimite(itens = [], limite = 5, fn) {
  const entrada = Array.isArray(itens) ? itens : []
  const max = Math.max(1, Number(limite) || 1)
  const saida = new Array(entrada.length)
  let idx = 0

  async function worker() {
    while (idx < entrada.length) {
      const atual = idx++
      saida[atual] = await fn(entrada[atual], atual)
    }
  }

  await Promise.all(Array.from({ length: Math.min(max, entrada.length) }, worker))
  return saida
}

async function hsAdminItensPorStages(stages = [], limit = 30) {
  const negocios = await hsAdminBuscarNegociosPorStages(stages, limit)
  return mapearComLimite(negocios, 5, async (negocio) => {
    const contato = await hsAdminBuscarContatoDoNegocio(negocio.id)
    return normalizarItemAdminLocal(contato?.properties?.phone || "", null, negocio, contato)
  })
}

async function adminItensAtivosHubSpot(limit = 50) {
  const stagesAtivos = Object.values(HS_STAGE).filter(stage => stage !== HS_STAGE.FINAL)
  return hsAdminItensPorStages(stagesAtivos, limit)
}

async function adminFonteCasos(filtro = () => true, stages = Object.values(HS_STAGE).filter(stage => stage !== HS_STAGE.FINAL), limit = 30) {
  const itensHubSpot = await hsAdminItensPorStages(stages, limit)
  const vistos = new Set(itensHubSpot.map(item => String(item.u?.negocioId || item.negocio?.id || "")).filter(Boolean))
  const locais = usuariosAdminOrdenados(filtro).filter(item => {
    const id = String(item.u?.negocioId || "")
    return !id || !vistos.has(id)
  })
  return [...itensHubSpot, ...locais].filter(({ u }) => u && filtro(u))
}

async function adminResumoOperacional() {
  const ativos = await adminItensAtivosHubSpot(100)
  const memoria = usuariosAdminOrdenados()
  const todos = [...ativos]
  const vistos = new Set(ativos.map(item => String(item.u?.negocioId || "")).filter(Boolean))
  for (const item of memoria) {
    const id = String(item.u?.negocioId || "")
    if (!id || !vistos.has(id)) todos.push(item)
  }

  return {
    fonte: ativos.length ? "HubSpot + memoria local" : "memoria local",
    totalClientes: todos.filter(({ u }) => Boolean(u.numeroCaso)).length,
    consultasAtivas: todos.filter(({ u }) => u.negocioStageId === HS_STAGE.AGENDAMENTO || Boolean(u._eventoCalendarId)).length,
    docsPendentes: todos.filter(({ u }) => calcularStatusDocumentos(u).faltantesCriticos.length > 0 && Boolean(u.numeroCaso)).length,
    urgentes: todos.filter(({ u }) => u.urgencia === "alta" || u.stage === STAGES.AGUARDANDO_URGENTE || u.hs_priority === "high").length,
    analise: todos.filter(({ u }) => u.negocioStageId === HS_STAGE.ANALISE && Boolean(u.numeroCaso)).length,
    todos
  }
}

function gerarAlertasOperacionaisAdmin(item) {
  const u = item?.u || {}
  const briefing = gerarBriefingCaso(u)
  const idade = idadeUltimaInteracaoAdmin(u)
  const alertas = []

  if (u._solicitouHumano === true && !u._fluxoEncerrado) {
    alertas.push({
      tipo: "humano_solicitado",
      peso: 90,
      texto: "Cliente pediu atendimento humano",
      acao: "Retomar contato humano ou revisar o pre-atendimento."
    })
  }

  if ((briefing.urgencia === "alta" || briefing.scoreEmocional.nivel === "alto") && !u._fluxoEncerrado) {
    alertas.push({
      tipo: "critico",
      peso: 100 + briefing.scoreEmocional.valor,
      texto: "Urgencia ou risco emocional alto",
      acao: "Responder ou revisar com prioridade."
    })
  }

  if (!briefing.numeroCaso && idade > 2 * 60 * 60 * 1000 && !u._fluxoEncerrado) {
    alertas.push({
      tipo: "lead_parado",
      peso: 85,
      texto: `Lead sem caso parado ha ${labelIdadeAdmin(idade)}`,
      acao: "Retomar pre-atendimento ou marcar como revisado."
    })
  }

  if (briefing.numeroCaso && briefing.documentos.faltantesCriticos.length > 0 && idade > 24 * 60 * 60 * 1000) {
    alertas.push({
      tipo: "docs_24h",
      peso: 75 + briefing.documentos.faltantesCriticos.length,
      texto: `Docs criticos pendentes sem movimento ha ${labelIdadeAdmin(idade)}`,
      acao: "Pedir documentos pelo admin."
    })
  }

  if (briefing.consultaAtiva) {
    alertas.push({
      tipo: "consulta",
      peso: 45,
      texto: "Consulta ativa",
      acao: "Conferir pauta, documentos e links antes do atendimento."
    })
  }

  if (briefing.stage === HS_STAGE.ANALISE && idade > 24 * 60 * 60 * 1000 && !casoAdminRevisado(item)) {
    alertas.push({
      tipo: "analise_parada",
      peso: 55,
      texto: `Caso em analise sem revisao ha ${labelIdadeAdmin(idade)}`,
      acao: "Revisar briefing e marcar como revisado."
    })
  }

  return alertas.sort((a, b) => b.peso - a.peso)
}

function maiorAlertaOperacionalAdmin(item) {
  return gerarAlertasOperacionaisAdmin(item)[0] || null
}

async function gerarResumoDiarioOperacional({ limite = 10 } = {}) {
  const resumo = await adminResumoOperacional()
  const briefings = resumo.todos
    .filter(({ u }) => Boolean(u))
    .map(({ from, u }) => {
      const item = { from, u }
      return {
        from,
        u,
        briefing: gerarBriefingCaso(u),
        alertas: gerarAlertasOperacionaisAdmin(item)
      }
    })

  const ordenarPorRisco = (a, b) =>
    (b.briefing.scoreEmocional.valor - a.briefing.scoreEmocional.valor) ||
    (b.briefing.scoreOperacional - a.briefing.scoreOperacional)

  const urgentes = briefings
    .filter(item => item.briefing.urgencia === "alta" || item.briefing.scoreEmocional.nivel === "alto")
    .sort(ordenarPorRisco)
    .slice(0, limite)

  const docsPendentes = briefings
    .filter(item => item.briefing.numeroCaso && item.briefing.documentos.faltantesCriticos.length > 0)
    .sort((a, b) => b.briefing.documentos.faltantesCriticos.length - a.briefing.documentos.faltantesCriticos.length)
    .slice(0, limite)

  const consultas = briefings
    .filter(item => item.briefing.consultaAtiva)
    .slice(0, limite)

  const recentes = briefings
    .filter(item => item.briefing.numeroCaso)
    .slice(0, limite)

  const alertasOperacionais = briefings
    .filter(item => item.alertas.length > 0)
    .sort((a, b) => (b.alertas[0]?.peso || 0) - (a.alertas[0]?.peso || 0))
    .slice(0, limite)

  const proximasAcoes = briefings
    .filter(item => item.briefing.proximaAcao && item.briefing.stage !== HS_STAGE.FINAL)
    .sort((a, b) =>
      ((b.alertas[0]?.peso || 0) - (a.alertas[0]?.peso || 0)) ||
      (b.briefing.scoreOperacional - a.briefing.scoreOperacional)
    )
    .slice(0, 3)

  return {
    geradoEm: new Date().toISOString(),
    fonte: resumo.fonte,
    totais: {
      casosClientes: resumo.totalClientes,
      consultasAtivas: resumo.consultasAtivas,
      emAnalise: resumo.analise,
      documentosPendentes: resumo.docsPendentes,
      alertasUrgentes: resumo.urgentes,
      itensAnalisados: briefings.length
    },
    filas: {
      urgentes,
      documentosPendentes: docsPendentes,
      consultasAtivas: consultas,
      recentes,
      alertasOperacionais,
      proximasAcoes
    },
    checklistProducao: checklistProducaoAdmin()
  }
}

function usuariosAdminOrdenados(filtro = () => true) {
  return Object.entries(users)
    .filter(([, u]) => u && filtro(u))
    .sort((a, b) => Number(b[1]?.ultimaMsg || 0) - Number(a[1]?.ultimaMsg || 0))
    .map(([from, u]) => ({ from, u }))
}

function salvarListaCasosAdmin(from, itens, origem = ADMIN_IDS.casos) {
  const chaveAdmin = normalizarNumeroWhatsAppEnvio(from)
  if (!chaveAdmin) return
  const sessaoAtual = sessoesAdminWhatsApp.get(chaveAdmin) || {}
  sessoesAdminWhatsApp.set(chaveAdmin, {
    ...sessaoAtual,
    casos: itens,
    casoSelecionado: null,
    origemCasos: origem,
    listaAtiva: "casos",
    ts: Date.now()
  })
}

function obterCasoAdmin(from, idx = null) {
  const chaveAdmin = normalizarNumeroWhatsAppEnvio(from)
  const sessao = sessoesAdminWhatsApp.get(chaveAdmin)
  if (!sessao) return null

  const indice = idx === null || idx === undefined ? sessao.casoSelecionado : idx
  const item = sessao.casos?.[indice]
  if (!item) return null
  sessao.casoSelecionado = indice
  sessao.ts = Date.now()
  sessoesAdminWhatsApp.set(chaveAdmin, sessao)
  return item
}

function prepararSessaoClienteAcaoAdmin(item) {
  const u = item?.u
  const destino = normalizarNumeroWhatsAppEnvio(item?.from || u?._numero || u?.whatsappContato)
  if (!u || !destino) return ""

  const atual = users[destino] || novoUsuario(u.nomeWA || u.nome || "Cliente")
  Object.assign(atual, hidratarUsuarioPersistido({
    ...atual,
    ...u,
    _numero: destino,
    whatsappContato: u.whatsappContato || destino,
    stage: u.numeroCaso ? STAGES.CLIENTE : (u.stage || atual.stage),
    etapa: u.etapa || atual.etapa || STAGES.AUDIO_AGUARDANDO,
    _fluxoEncerrado: false,
    aguardandoRetomada: false,
    jaOfereceuRetomada: false,
    processing: false
  }))
  atual._numero = destino
  atual.processing = false
  atual.timer = null
  atual.timerIncentivoDescricao = null
  users[destino] = atual
  item.from = destino
  item.u = atual
  agendarPersistenciaUsers()
  return destino
}

function chaveCasoAdmin(item) {
  const u = item?.u || item || {}
  return sanitizarTextoEntrada(
    u.negocioId ||
    u.numeroCaso ||
    item?.from ||
    u._numero ||
    u.whatsappContato ||
    ""
  )
}

function limparRevisoesCasosAdmin() {
  const agora = Date.now()
  for (const [chave, revisao] of revisoesCasosAdmin.entries()) {
    if (!revisao?.ate || revisao.ate <= agora) revisoesCasosAdmin.delete(chave)
  }
}

function obterRevisaoCasoAdmin(item) {
  limparRevisoesCasosAdmin()
  const chave = chaveCasoAdmin(item)
  if (!chave) return null
  return revisoesCasosAdmin.get(chave) || null
}

function casoAdminRevisado(item) {
  return Boolean(obterRevisaoCasoAdmin(item))
}

function marcarCasoAdminRevisado(from, item) {
  const chave = chaveCasoAdmin(item)
  if (!chave) return null
  const revisao = {
    por: chaveAdminWhatsApp(from) || null,
    em: new Date().toISOString(),
    ate: Date.now() + ADMIN_REVISADO_TTL_MS
  }
  revisoesCasosAdmin.set(chave, revisao)
  return revisao
}

function motivoPrioridadeAdmin(u, briefing = gerarBriefingCaso(u)) {
  const motivos = []
  if (briefing.scoreEmocional.nivel === "alto" || briefing.urgencia === "alta") motivos.push("urgente emocional")
  if (briefing.documentos.faltantesCriticos.length) motivos.push(`${briefing.documentos.faltantesCriticos.length} doc(s) critico(s)`)
  if (!briefing.numeroCaso) motivos.push("pre-cadastro")
  const idade = Date.now() - Number(u?.ultimaMsg || 0)
  if (idade > 2 * 60 * 60 * 1000 && !u?._fluxoEncerrado && u?.stage !== STAGES.CLIENTE) motivos.push(`sem resposta ha ${minutosParaTexto(idade)}`)
  if (briefing.consultaAtiva) motivos.push("consulta futura")
  return motivos.slice(0, 2).join(" + ") || briefing.proximaAcao || "acompanhar"
}

function scorePrioridadeAdmin({ u }) {
  const briefing = gerarBriefingCaso(u)
  let score = briefing.scoreOperacional || 0
  score += (briefing.scoreEmocional.valor || 0) * 10
  if (briefing.urgencia === "alta") score += 40
  if (briefing.documentos.faltantesCriticos.length) score += 20 + briefing.documentos.faltantesCriticos.length * 5
  if (!briefing.numeroCaso) score += 10
  const idade = Date.now() - Number(u?.ultimaMsg || 0)
  if (idade > 2 * 60 * 60 * 1000 && !u?._fluxoEncerrado && u?.stage !== STAGES.CLIENTE) score += 25
  if (briefing.consultaAtiva) score += 8
  return score
}

async function gerarPrioridadesAdmin(limite = 10) {
  const resumo = await adminResumoOperacional()
  return resumo.todos
    .filter(({ u }) => Boolean(u))
    .map(item => ({ ...item, prioridadeScore: scorePrioridadeAdmin(item) }))
    .filter(item => !casoAdminRevisado(item))
    .filter(item => item.prioridadeScore > 0)
    .sort((a, b) => b.prioridadeScore - a.prioridadeScore)
    .slice(0, limite)
}

function linhaPrioridadeAdmin(item, idx) {
  const u = item.u
  const briefing = gerarBriefingCaso(u)
  const caso = briefing.numeroCaso ? `📄 Caso ${briefing.numeroCaso}` : "📄 Sem caso"
  return [
    `${idx}. 👤 *${briefing.nome || "Cliente"}*`,
    `   🚩 ${motivoPrioridadeAdmin(u, briefing)}`,
    `   ${caso} · ${briefing.stageLabel}`,
    `   🎯 Acao: ${briefing.proximaAcao || "acompanhar"}`
  ].join("\n")
}

function textoDetalheCasoAdmin(item) {
  const { from, u } = item
  const briefing = gerarBriefingCaso(u)
  const docs = briefing.documentos
  const revisao = obterRevisaoCasoAdmin(item)
  const consulta = briefing.consultaAtiva
    ? "Ativa"
    : "Nao agendada"
  const alerta = maiorAlertaOperacionalAdmin(item)
  const relato = sanitizarTextoEntrada(briefing.relato || briefing.resumo || u.descricao || u.assuntoResumo)
  const relatoCurto = relato ? relato.slice(0, 700) + (relato.length > 700 ? "..." : "") : "Sem relato consolidado."
  return [
    `👤 *${briefing.nome || "Cliente"}*`,
    "",
    `📄 Caso: ${briefing.numeroCaso || "sem caso"}`,
    `📱 WhatsApp: ${from || briefing.whatsapp || "-"}`,
    `⚖️ Area: ${briefing.area || "nao definida"}`,
    `📌 Status: ${briefing.stageLabel}`,
    `💬 Emocional: ${briefing.scoreEmocional.nivel}/${briefing.scoreEmocional.valor}`,
    `📎 Docs: ${docs.faltantesCriticos.length ? `${docs.faltantesCriticos.length} faltante(s)` : "sem critico faltante"}`,
    `📅 Consulta: ${consulta}`,
    alerta ? `🚨 Alerta: ${alerta.texto}` : "",
    revisao ? `✅ Revisado: ate ${new Date(revisao.ate).toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" })}` : "",
    briefing.hubspot ? `🔗 HubSpot: ${briefing.hubspot}` : "",
    briefing.drive ? `🗂️ Drive: ${briefing.drive}` : "",
    "",
    "🧾 *Relato*",
    relatoCurto,
    "",
    "🎯 *Proxima acao*",
    briefing.proximaAcao || "Acompanhar caso."
  ].filter(Boolean).join("\n")
}

async function telaAdminPrincipal() {
  const resumo = await adminResumoOperacional()
  const semResposta = resumo.todos.filter(({ u }) => {
    const idade = Date.now() - Number(u.ultimaMsg || 0)
    return idade > 2 * 60 * 60 * 1000 && !u._fluxoEncerrado && u.stage !== STAGES.CLIENTE
  }).length

  return {
    texto: [
      "⚖️ *Admin Oraculum*",
      "",
      "📍 *Prioridade agora*",
      `🚨 ${resumo.urgentes} urgente(s)`,
      `📎 ${resumo.docsPendentes} com docs pendentes`,
      `📅 ${resumo.consultasAtivas} consulta(s) futura(s)`,
      `🔎 ${resumo.analise} em analise`,
      semResposta ? `⏳ ${semResposta} sem resposta ha mais de 2h` : "✅ Sem fila parada acima de 2h",
      "",
      `🧭 Fonte: ${resumo.fonte}`,
      "🔐 Sessao expira em 30 min sem uso.",
      "",
      "Escolha por onde agir."
    ].join("\n"),
    opcoes: [
      { id: ADMIN_IDS.prioridades, title: "📌 Prioridades" },
      { id: ADMIN_IDS.agenda, title: "📅 Agenda" },
      { id: ADMIN_IDS.casos, title: "📂 Casos" },
      { id: ADMIN_IDS.alertas, title: "🚨 Alertas" },
      { id: ADMIN_IDS.resumo, title: "📊 Resumo" }
    ],
    registrarPergunta: false
  }
}

async function telaAdminPrioridades(from) {
  const itens = await gerarPrioridadesAdmin(10)
  salvarListaCasosAdmin(from, itens, ADMIN_IDS.prioridades)
  if (!itens.length) {
    return {
      texto: "📌 *Prioridades*\n\n✅ Nao encontrei casos com risco operacional relevante agora.",
      opcoes: [
        { id: ADMIN_IDS.menu, title: "🏠 Menu admin" },
        { id: ADMIN_IDS.casos, title: "📂 Casos" }
      ],
      registrarPergunta: false
    }
  }

  const linhas = itens.map((item, idx) => linhaPrioridadeAdmin(item, idx + 1))
  return {
    texto: ["📌 *Prioridades*", "", ...linhas, "", "Toque em um caso para ver o detalhe."].join("\n\n"),
    opcoes: itens.map((item, idx) => ({
      id: `admin_caso_${idx}`,
      title: tituloOpcaoCasoAdmin(item, idx)
    })),
    registrarPergunta: false
  }
}

async function telaAdminCasos() {
  const resumo = await adminResumoOperacional()
  const novos = resumo.todos.filter(({ u }) => [HS_STAGE.LEAD, HS_STAGE.CADASTRO].includes(u.negocioStageId) || (!u.numeroCaso && u.stage !== STAGES.CLIENTE)).length
  const analise = resumo.analise
  const docs = resumo.docsPendentes

  return {
    texto: [
      "📂 *Casos*",
      "",
      `🆕 Novos/pre-cadastro: ${novos}`,
      `🔎 Em analise: ${analise}`,
      `📎 Com documentos pendentes: ${docs}`,
      "",
      "Escolha uma fila."
    ].join("\n"),
    opcoes: [
      { id: ADMIN_IDS.casosNovos, title: "🆕 Novos" },
      { id: ADMIN_IDS.casosAnalise, title: "🔎 Analise" },
      { id: ADMIN_IDS.casosDocs, title: "📎 Docs" }
    ],
    registrarPergunta: false
  }
}

async function telaAdminAlertas() {
  const resumo = await adminResumoOperacional()
  const criticos = resumo.todos.filter(({ u }) => {
    const emocional = scoreEmocional(u)
    return u.urgencia === "alta" || u.stage === STAGES.AGUARDANDO_URGENTE || emocional.nivel === "alto"
  }).length
  const parados = resumo.todos.filter(({ u }) => {
    const idade = Date.now() - Number(u.ultimaMsg || 0)
    return idade > 2 * 60 * 60 * 1000 && !u._fluxoEncerrado && u.stage !== STAGES.CLIENTE
  }).length
  const docs = resumo.docsPendentes
  const agenda = resumo.consultasAtivas

  return {
    texto: [
      "🚨 *Alertas*",
      "",
      `🔥 Criticos: ${criticos}`,
      `⏳ Parados: ${parados}`,
      `📎 Docs: ${docs}`,
      `📅 Agenda: ${agenda}`,
      "",
      "Escolha uma fila para agir."
    ].join("\n"),
    opcoes: [
      { id: ADMIN_IDS.alertasCriticos, title: "🔥 Criticos" },
      { id: ADMIN_IDS.alertasParados, title: "⏳ Parados" },
      { id: ADMIN_IDS.alertasDocs, title: "📎 Docs" },
      { id: ADMIN_IDS.alertasAgenda, title: "📅 Agenda" },
      { id: ADMIN_IDS.resumo, title: "📊 Resumo" }
    ],
    registrarPergunta: false
  }
}

function telaAdminListaCasos(from, titulo, itens, vazio, voltar = ADMIN_IDS.casos) {
  salvarListaCasosAdmin(from, itens, voltar)
  if (!itens.length) {
    return {
      texto: `${titulo}\n\n${vazio}`,
      opcoes: [
        { id: voltar, title: "⬅️ Voltar" },
        { id: ADMIN_IDS.menu, title: "🏠 Menu admin" }
      ],
      registrarPergunta: false
    }
  }

  const linhas = itens.slice(0, 10).map((item, idx) => resumoCasoAdmin(item, idx + 1))
  return {
    texto: [titulo, "", ...linhas, "", "Toque em um caso para ver o detalhe operacional."].join("\n\n"),
    opcoes: itens.slice(0, 10).map((item, idx) => ({
      id: `admin_caso_${idx}`,
      title: tituloOpcaoCasoAdmin(item, idx)
    })),
    registrarPergunta: false
  }
}

async function telaAdminCasosNovos(from) {
  const filtro = u => [HS_STAGE.LEAD, HS_STAGE.CADASTRO].includes(u.negocioStageId) || (!u.numeroCaso && u.stage !== STAGES.CLIENTE)
  const itens = await adminFonteCasos(filtro, [HS_STAGE.LEAD, HS_STAGE.CADASTRO], 30)
  return telaAdminListaCasos(from, "🆕 *Novos casos e pre-cadastros*", itens, "✅ Nao encontrei novos casos ou pre-cadastros parados.", ADMIN_IDS.casos)
}

async function telaAdminCasosAnalise(from) {
  const filtro = u => u.negocioStageId === HS_STAGE.ANALISE && Boolean(u.numeroCaso)
  const itens = await adminFonteCasos(filtro, [HS_STAGE.ANALISE], 30)
  return telaAdminListaCasos(from, "🔎 *Casos em analise*", itens, "✅ Nao encontrei casos em analise no HubSpot nem na memoria atual.", ADMIN_IDS.casos)
}

async function telaAdminCasosDocumentos(from) {
  const filtro = u => calcularStatusDocumentos(u).faltantesCriticos.length > 0 && Boolean(u.numeroCaso)
  const itens = await adminFonteCasos(filtro, [HS_STAGE.AGUARDANDO_DOCS, HS_STAGE.ANALISE, HS_STAGE.DOCS], 50)
  return telaAdminListaCasos(from, "📎 *Casos com documentos pendentes*", itens, "✅ Nao encontrei casos com documentos criticos pendentes.", ADMIN_IDS.casos)
}

async function telaAdminAlertasUrgentes(from) {
  const filtro = u => u.urgencia === "alta" || u.stage === STAGES.AGUARDANDO_URGENTE || scoreEmocional(u).nivel === "alto"
  const itens = await adminFonteCasos(filtro, Object.values(HS_STAGE).filter(stage => stage !== HS_STAGE.FINAL), 50)
  return telaAdminListaCasos(from, "🔥 *Alertas criticos*", itens, "✅ Nao encontrei alerta critico no HubSpot nem na memoria atual.", ADMIN_IDS.alertas)
}

async function telaAdminAlertasSemResposta(from) {
  const filtro = u => {
    const idade = Date.now() - Number(u.ultimaMsg || 0)
    return idade > 2 * 60 * 60 * 1000 && !u._fluxoEncerrado && u.stage !== STAGES.CLIENTE
  }
  const itens = await adminFonteCasos(filtro, [HS_STAGE.LEAD, HS_STAGE.CADASTRO, HS_STAGE.ANALISE], 50)
  return telaAdminListaCasos(from, "⏳ *Casos parados*", itens, "✅ Nao encontrei pre-atendimentos parados ha mais de 2 horas.", ADMIN_IDS.alertas)
}

async function telaAdminAlertasDocs(from) {
  const filtro = u => calcularStatusDocumentos(u).faltantesCriticos.length > 0 && Boolean(u.numeroCaso)
  const itens = await adminFonteCasos(filtro, [HS_STAGE.AGUARDANDO_DOCS, HS_STAGE.ANALISE, HS_STAGE.DOCS], 50)
  return telaAdminListaCasos(from, "📎 *Alertas de documentos*", itens, "✅ Nao encontrei documentos criticos pendentes.", ADMIN_IDS.alertas)
}

async function telaAdminAlertasAgenda(from) {
  const filtro = u => u.negocioStageId === HS_STAGE.AGENDAMENTO || Boolean(u._eventoCalendarId)
  const itens = await adminFonteCasos(filtro, [HS_STAGE.AGENDAMENTO], 50)
  return telaAdminListaCasos(from, "📅 *Alertas de agenda*", itens, "✅ Nao encontrei consultas futuras ativas.", ADMIN_IDS.alertas)
}

async function telaAdminResumoDiario() {
  const resumo = await gerarResumoDiarioOperacional({ limite: 10 })

  return {
    texto: textoResumoDiarioOperacional(resumo),
    opcoes: [
      { id: ADMIN_IDS.alertas, title: "🚨 Alertas" },
      { id: ADMIN_IDS.casos, title: "📂 Casos" },
      { id: ADMIN_IDS.menu, title: "🏠 Menu admin" }
    ],
    registrarPergunta: false
  }
}

function telaDetalheCasoAdmin(from, idx) {
  const item = obterCasoAdmin(from, idx)
  if (!item) {
    return {
      texto: "Nao encontrei esse caso na lista atual. Abra *Prioridades* ou *Casos* para atualizar.",
      opcoes: [
        { id: ADMIN_IDS.prioridades, title: "Prioridades" },
        { id: ADMIN_IDS.casos, title: "Casos" }
      ],
      registrarPergunta: false
    }
  }

  const chaveAdmin = normalizarNumeroWhatsAppEnvio(from)
  const sessao = sessoesAdminWhatsApp.get(chaveAdmin) || {}
  const voltar = sessao.origemCasos || ADMIN_IDS.prioridades

  return {
    texto: textoDetalheCasoAdmin(item),
    opcoes: [
      { id: ADMIN_IDS.casoRevisado, title: "✅ Revisado" },
      { id: ADMIN_IDS.casoMarcarUrgente, title: "🚨 Marcar urgente" },
      { id: ADMIN_IDS.casoEnviarAnalise, title: "📝 Enviar analise" },
      { id: ADMIN_IDS.casoPedirDocs, title: "📎 Pedir docs" },
      { id: ADMIN_IDS.casoLembrete, title: "🔔 Lembrete" },
      { id: ADMIN_IDS.casoLinks, title: "🔗 Links" },
      { id: voltar, title: "⬅️ Voltar" },
      { id: ADMIN_IDS.agenda, title: "📅 Agenda" },
      { id: ADMIN_IDS.menu, title: "🏠 Menu admin" }
    ],
    registrarPergunta: false
  }
}

function telaLinksCasoAdmin(from) {
  const item = obterCasoAdmin(from)
  if (!item) {
    return {
      texto: "Nao encontrei o caso selecionado. Abra *Prioridades* ou *Casos* para atualizar.",
      opcoes: [
        { id: ADMIN_IDS.prioridades, title: "Prioridades" },
        { id: ADMIN_IDS.casos, title: "Casos" }
      ],
      registrarPergunta: false
    }
  }

  const { u } = item
  return {
    texto: [
      "🔗 *Links do caso*",
      "",
      `👤 Cliente: ${u.nome || u.nomeWA || "Cliente"}`,
      `📄 Caso: ${u.numeroCaso || "-"}`,
      u.negocioId ? `🔗 HubSpot: ${linkHubSpot(u.negocioId)}` : "⚠️ HubSpot: nao encontrado",
      u.pastaDriveLink ? `🗂️ Drive: ${u.pastaDriveLink}` : "⚠️ Drive: nao encontrado",
      item.from ? `📱 WhatsApp: ${item.from}` : ""
    ].filter(Boolean).join("\n"),
    opcoes: [
      { id: ADMIN_IDS.casoRevisado, title: "✅ Revisado" },
      { id: ADMIN_IDS.prioridades, title: "📌 Prioridades" },
      { id: ADMIN_IDS.menu, title: "🏠 Menu admin" }
    ],
    registrarPergunta: false
  }
}

async function marcarCasoRevisadoAdmin(from) {
  const item = obterCasoAdmin(from)
  if (!item) {
    return {
      texto: "Nao encontrei o caso selecionado. Abra *Prioridades* ou *Casos* para atualizar.",
      opcoes: [
        { id: ADMIN_IDS.prioridades, title: "Prioridades" },
        { id: ADMIN_IDS.casos, title: "Casos" }
      ],
      registrarPergunta: false
    }
  }

  const revisao = marcarCasoAdminRevisado(from, item)
  const ate = revisao
    ? new Date(revisao.ate).toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" })
    : "algumas horas"
  return {
    texto: [
      "✅ *Caso marcado como revisado.*",
      "",
      `👤 Cliente: ${item.u?.nome || item.u?.nomeWA || "Cliente"}`,
      `📄 Caso: ${item.u?.numeroCaso || "-"}`,
      `📌 Ele sai de *Prioridades* ate ${ate}.`
    ].join("\n"),
    opcoes: [
      { id: ADMIN_IDS.prioridades, title: "📌 Prioridades" },
      { id: ADMIN_IDS.casos, title: "📂 Casos" },
      { id: ADMIN_IDS.menu, title: "🏠 Menu admin" }
    ],
    registrarPergunta: false
  }
}

async function pedirDocsCasoAdmin(from) {
  const item = obterCasoAdmin(from)
  if (!item) {
    return {
      texto: "Nao encontrei o caso selecionado. Abra *Prioridades* ou *Casos* para atualizar.",
      opcoes: [{ id: ADMIN_IDS.prioridades, title: "Prioridades" }],
      registrarPergunta: false
    }
  }

  const { u } = item
  const destino = prepararSessaoClienteAcaoAdmin(item)
  const statusDocs = calcularStatusDocumentos(u)
  const faltantes = statusDocs.faltantesCriticos.slice(0, 8)
  if (!destino) {
    return {
      texto: "Nao encontrei WhatsApp do cliente para pedir documentos com seguranca.",
      opcoes: opcoesAposAcaoCasoAdmin(),
      registrarPergunta: false
    }
  }
  if (!faltantes.length) {
    return {
      texto: "Esse caso nao tem documento critico pendente no status atual.",
      opcoes: opcoesAposAcaoCasoAdmin(),
      registrarPergunta: false
    }
  }

  const nome = primeiroNomeCliente(u) || "cliente"
  const lista = faltantes.map(doc => `- ${doc.label}`).join("\n")
  const enviadoCliente = await enviar(
    destino,
    [
      `Oi, *${nome}*. Passando para lembrar dos documentos que ainda faltam no seu caso:`,
      "",
      lista,
      "",
      "Quando puder, envie por aqui no WhatsApp. Se tiver dificuldade, pode mandar foto aos poucos."
    ].join("\n"),
    [
      { id: "docs_pedido_admin", title: "Enviar docs" },
      { id: "m_inicio", title: "Menu cliente" }
    ],
    false
  )

  let notaContato = false
  let notaNegocio = false
  if (enviadoCliente) {
    const corpo = `Pedido de documentos enviado pelo WhatsApp admin.\nCaso: ${u.numeroCaso || "-"}\nDocumentos:\n${lista}`
    notaContato = u.contatoId ? await hsCriarNota(u.contatoId, "PEDIDO DE DOCUMENTOS PELO ADMIN", corpo) : false
    notaNegocio = u.negocioId ? await hsCriarNotaNegocio(u.negocioId, "PEDIDO DE DOCUMENTOS PELO ADMIN", corpo) : false
  }

  return {
    texto: [
      "*Pedido de documentos*",
      "",
      `📨 Cliente avisado: ${enviadoCliente ? "✅ ok" : "❌ falhou"}`,
      `👤 Nota contato: ${notaContato ? "✅ ok" : "⚠️ nao registrada"}`,
      `📄 Nota negocio: ${notaNegocio ? "✅ ok" : "⚠️ nao registrada"}`,
      "",
      `📎 Documentos: ${faltantes.length}`
    ].join("\n"),
    opcoes: opcoesAposAcaoCasoAdmin(),
    registrarPergunta: false
  }
}

async function marcarCasoUrgenteAdmin(from) {
  const item = obterCasoAdmin(from)
  if (!item) {
    return {
      texto: "Nao encontrei o caso selecionado. Abra *Prioridades* ou *Casos* para atualizar.",
      opcoes: [{ id: ADMIN_IDS.prioridades, title: "Prioridades" }],
      registrarPergunta: false
    }
  }

  const { u } = item
  const anterior = u.urgencia || "normal"
  u.urgencia = "alta"
  const briefing = gerarBriefingCaso(u)
  let notaContato = false
  let notaNegocio = false
  const corpo = `Caso marcado como urgente pelo admin.\nCaso: ${u.numeroCaso || "-"}\nUrgencia anterior: ${anterior}\nProxima acao: ${briefing.proximaAcao || "revisar com prioridade"}`
  if (u.contatoId) notaContato = await hsCriarNota(u.contatoId, "CASO MARCADO URGENTE", corpo)
  if (u.negocioId) notaNegocio = await hsCriarNotaNegocio(u.negocioId, "CASO MARCADO URGENTE", corpo)

  return {
    texto: [
      "🚨 *Caso marcado como urgente.*",
      "",
      `👤 Cliente: ${u.nome || u.nomeWA || "Cliente"}`,
      `📄 Caso: ${u.numeroCaso || "-"}`,
      `⚡ Urgencia: ${u.urgencia}`,
      "",
      `👤 Nota contato: ${notaContato ? "✅ ok" : "⚠️ nao registrada"}`,
      `📄 Nota negocio: ${notaNegocio ? "✅ ok" : "⚠️ nao registrada"}`
    ].join("\n"),
    opcoes: opcoesAposAcaoCasoAdmin(),
    registrarPergunta: false
  }
}

async function enviarAnaliseCasoAdmin(from) {
  const item = obterCasoAdmin(from)
  if (!item) {
    return {
      texto: "Nao encontrei o caso selecionado. Abra *Prioridades* ou *Casos* para atualizar.",
      opcoes: [{ id: ADMIN_IDS.prioridades, title: "Prioridades" }],
      registrarPergunta: false
    }
  }

  const { u } = item
  const briefing = gerarBriefingCaso(u)
  const textoAnalise = [
    `Analise operacional pelo admin`,
    `Cliente: ${briefing.nome}`,
    `Caso: ${briefing.numeroCaso || "sem caso"}`,
    `Area: ${briefing.area || "-"}`,
    `Status: ${briefing.stageLabel}`,
    `Urgencia: ${briefing.urgencia}`,
    `Docs faltantes: ${briefing.documentos.faltantesCriticos.length}`,
    `Proxima acao: ${briefing.proximaAcao}`,
    `HubSpot: ${briefing.hubspot || "-"}`,
    `Drive: ${briefing.drive || "-"}`
  ].join("\n")

  let notaContato = false
  let notaNegocio = false
  if (u.contatoId) notaContato = await hsCriarNota(u.contatoId, "ANALISE OPERACIONAL - ADMIN", textoAnalise)
  if (u.negocioId) notaNegocio = await hsCriarNotaNegocio(u.negocioId, "ANALISE OPERACIONAL - ADMIN", textoAnalise)

  return {
    texto: [
      "📝 *Analise registrada no HubSpot.*",
      "",
      `👤 Cliente: ${briefing.nome}`,
      `📄 Caso: ${briefing.numeroCaso || "-"}`,
      `🎯 Proxima acao: ${briefing.proximaAcao}`,
      `👤 Nota contato: ${notaContato ? "✅ ok" : "⚠️ nao registrada"}`,
      `📄 Nota negocio: ${notaNegocio ? "✅ ok" : "⚠️ nao registrada"}`
    ].join("\n"),
    opcoes: opcoesAposAcaoCasoAdmin(),
    registrarPergunta: false
  }
}

async function enviarLembreteCasoAdmin(from) {
  const item = obterCasoAdmin(from)
  if (!item) {
    return {
      texto: "Nao encontrei o caso selecionado. Abra *Prioridades* ou *Casos* para atualizar.",
      opcoes: [{ id: ADMIN_IDS.prioridades, title: "Prioridades" }],
      registrarPergunta: false
    }
  }

  const { u } = item
  const destino = prepararSessaoClienteAcaoAdmin(item)
  if (!destino) {
    return {
      texto: "Nao encontrei WhatsApp do cliente para enviar lembrete com seguranca.",
      opcoes: opcoesAposAcaoCasoAdmin(),
      registrarPergunta: false
    }
  }

  const briefing = gerarBriefingCaso(u)
  const nome = primeiroNomeCliente(u) || "cliente"
  const enviadoCliente = await enviar(
    destino,
    [
      `Oi, *${nome}*. Passando para lembrar do andamento do seu caso *${u.numeroCaso || ""}*.`,
      "",
      briefing.proximaAcao || "Nossa equipe segue acompanhando seu atendimento.",
      "",
      "Se precisar falar com a equipe, responda por aqui mesmo."
    ].join("\n"),
    [{ id: "m_inicio", title: "Menu cliente" }],
    false
  )

  let notaContato = false
  let notaNegocio = false
  if (enviadoCliente) {
    const corpo = `Lembrete operacional enviado pelo WhatsApp admin.\nCaso: ${u.numeroCaso || "-"}\nProxima acao: ${briefing.proximaAcao || "-"}`
    notaContato = u.contatoId ? await hsCriarNota(u.contatoId, "LEMBRETE PELO ADMIN", corpo) : false
    notaNegocio = u.negocioId ? await hsCriarNotaNegocio(u.negocioId, "LEMBRETE PELO ADMIN", corpo) : false
  }

  return {
    texto: [
      "*Lembrete do caso*",
      "",
      `📨 Cliente avisado: ${enviadoCliente ? "✅ ok" : "❌ falhou"}`,
      `👤 Nota contato: ${notaContato ? "✅ ok" : "⚠️ nao registrada"}`,
      `📄 Nota negocio: ${notaNegocio ? "✅ ok" : "⚠️ nao registrada"}`
    ].join("\n"),
    opcoes: opcoesAposAcaoCasoAdmin(),
    registrarPergunta: false
  }
}

function resumoConsultaAdmin(item, idx = null) {
  const partes = []
  if (idx !== null) partes.push(`${idx}.`)
  partes.push(`👤 ${item.u?.nome || "Cliente"}`)
  const quando = item.inicio ? formatarSlot(new Date(item.inicio)) : "horario nao encontrado"
  return `${partes.join(" ")} · 📅 ${quando}`
}

async function obterConsultasAtivasAdmin() {
  const consultas = []
  const vistos = new Set()

  const itensHubSpot = await hsAdminItensPorStages([HS_STAGE.AGENDAMENTO], 30)
  for (const item of itensHubSpot) {
    const u = item.u
    const eventId = sanitizarTextoEntrada(u?._eventoCalendarId)
    let estado = null
    if (eventId) {
      try {
        estado = await obterEstadoEventoConsulta(eventId)
      } catch (e) {
        logErro("admin_whatsapp", "Falha ao consultar evento HubSpot: " + e.message)
      }
      if (estado?.cancelado || estado?.passou) continue
    }

    const chave = String(u?.negocioId || item.negocio?.id || eventId || item.from || "")
    if (chave) vistos.add(chave)
    consultas.push({
      from: item.from,
      u,
      eventId,
      inicio: estado?.inicio || null,
      fim: estado?.fim || null,
      negocioId: u.negocioId || item.negocio?.id || null,
      contatoId: u.contatoId || item.contato?.id || null,
      fonte: "HubSpot"
    })
  }

  for (const [from, u] of Object.entries(users)) {
    if (!u?._eventoCalendarId) continue
    const chave = String(u.negocioId || u._eventoCalendarId || from)
    if (vistos.has(chave)) continue

    let estado = null
    try {
      estado = await obterEstadoEventoConsulta(u._eventoCalendarId)
    } catch (e) {
      logErro("admin_whatsapp", "Falha ao consultar evento: " + e.message)
    }

    if (estado?.cancelado || estado?.passou) continue
    consultas.push({
      from,
      u,
      eventId: u._eventoCalendarId,
      inicio: estado?.inicio || null,
      fim: estado?.fim || null,
      negocioId: u.negocioId || null,
      contatoId: u.contatoId || null,
      fonte: "Memoria"
    })
  }

  consultas.sort((a, b) => {
    const da = a.inicio ? new Date(a.inicio).getTime() : Number.MAX_SAFE_INTEGER
    const db = b.inicio ? new Date(b.inicio).getTime() : Number.MAX_SAFE_INTEGER
    return da - db
  })

  return consultas
}

async function telaConsultasAdmin(from) {
  const consultas = await obterConsultasAtivasAdmin()
  const chaveAdmin = normalizarNumeroWhatsAppEnvio(from)
  const sessaoAtual = sessoesAdminWhatsApp.get(chaveAdmin) || {}
  sessoesAdminWhatsApp.set(chaveAdmin, { ...sessaoAtual, consultas, selecionada: null, listaAtiva: "consultas", ts: Date.now() })

  if (!consultas.length) {
    return {
      texto: "📅 *Consultas futuras*\n\n✅ Nao encontrei consultas futuras ativas no HubSpot nem na memoria local.",
      opcoes: [
        { id: ADMIN_IDS.menu, title: "🏠 Menu admin" },
        { id: ADMIN_IDS.casos, title: "📂 Casos" }
      ],
      registrarPergunta: false
    }
  }

  const linhas = consultas.slice(0, 10).map((item, idx) => resumoConsultaAdmin(item, idx + 1))
  return {
    texto: ["📅 *Consultas futuras*", "", ...linhas, "", "Toque em uma consulta para ver as acoes."].join("\n"),
    opcoes: consultas.slice(0, 10).map((item, idx) => ({
      id: `admin_consulta_${idx}`,
      title: `${idx + 1}. ${(item.u?.nome || "Cliente").slice(0, 16)}`
    })),
    registrarPergunta: false
  }
}

function obterItemAdmin(from, idx = null) {
  const chaveAdmin = normalizarNumeroWhatsAppEnvio(from)
  const sessao = sessoesAdminWhatsApp.get(chaveAdmin)
  if (!sessao) return null

  const indice = idx === null || idx === undefined ? sessao.selecionada : idx
  const item = sessao.consultas?.[indice]
  if (!item) return null
  sessao.selecionada = indice
  sessao.ts = Date.now()
  sessoesAdminWhatsApp.set(chaveAdmin, sessao)
  return item
}

function telaDetalheConsultaAdmin(from, idx) {
  const item = obterItemAdmin(from, idx)
  if (!item) {
    return {
      texto: "Nao encontrei essa consulta na lista atual. Envie *consultas* para atualizar.",
      opcoes: [{ id: ADMIN_IDS.agenda, title: "Atualizar" }],
      registrarPergunta: false
    }
  }

  const u = item.u
  const dataHora = item.inicio ? formatarSlot(new Date(item.inicio)) : "horario nao encontrado"
  const texto = [
    "📅 *Consulta selecionada*",
    "",
    `👤 Cliente: ${u.nome || "Cliente"}`,
    `📄 Caso: ${u.numeroCaso || "-"}`,
    `📱 WhatsApp: ${item.from || "-"}`,
    `⚖️ Area: ${u.area || "-"}`,
    `🕒 Data: ${dataHora}`,
    `🧭 Fonte: ${item.fonte || "-"}`,
    item.negocioId ? `🔗 HubSpot: ${linkHubSpot(item.negocioId)}` : ""
  ].filter(Boolean).join("\n")

  const opcoes = item.eventId
    ? [
      { id: ADMIN_IDS.cancelarConsulta, title: "❌ Cancelar" },
      { id: ADMIN_IDS.agenda, title: "🔄 Atualizar" }
    ]
    : [
      { id: ADMIN_IDS.agenda, title: "🔄 Atualizar" },
      { id: ADMIN_IDS.casos, title: "📂 Casos" }
    ]

  return {
    texto,
    opcoes,
    registrarPergunta: false
  }
}

function telaConfirmarCancelamentoAdmin(from) {
  const item = obterItemAdmin(from)
  if (!item) {
    return {
      texto: "Nao encontrei a consulta selecionada. Envie *consultas* para atualizar.",
      opcoes: [{ id: ADMIN_IDS.agenda, title: "Atualizar" }],
      registrarPergunta: false
    }
  }

  const u = item.u
  if (!item.eventId && !u?._eventoCalendarId) {
    return {
      texto: "Essa consulta esta no HubSpot, mas nao encontrei o ID do evento Calendar para cancelar com seguranca. Abra o HubSpot ou atualize a agenda.",
      opcoes: [
        { id: ADMIN_IDS.agenda, title: "Atualizar" },
        { id: ADMIN_IDS.casos, title: "Casos" }
      ],
      registrarPergunta: false
    }
  }
  const dataHora = item.inicio ? formatarSlot(new Date(item.inicio)) : "horario nao encontrado"
  return {
    texto: `❌ *Confirmar cancelamento?*\n\n👤 Cliente: *${u.nome || "Cliente"}*\n🕒 Consulta: *${dataHora}*`,
    opcoes: [
      { id: ADMIN_IDS.cancelarSim, title: "❌ Cancelar" },
      { id: ADMIN_IDS.cancelarNao, title: "⬅️ Voltar" },
      { id: ADMIN_IDS.agenda, title: "📅 Consultas" }
    ],
    registrarPergunta: false
  }
}

async function cancelarConsultaAdmin(from) {
  const item = obterItemAdmin(from)
  if (!item) {
    return {
      texto: "Nao encontrei a consulta selecionada. Envie *consultas* para atualizar.",
      opcoes: [{ id: ADMIN_IDS.agenda, title: "Atualizar" }],
      registrarPergunta: false
    }
  }

  const { u } = item
  const eventoId = u._eventoCalendarId || item.eventId
  let calendarOk = false
  if (eventoId) {
    try {
      const cal = getCalendar()
      await cal.events.delete({ calendarId: CALENDAR_ID, eventId: eventoId })
      calendarOk = true
    } catch (e) {
      const status = e?.code || e?.response?.status || e?.status
      if (status !== 404 && status !== 410) {
        logErro("admin_whatsapp", "Falha ao deletar evento: " + e.message, e)
        return {
          texto: "Nao consegui cancelar o evento no Google Calendar. Tente novamente em instantes.",
          opcoes: [
            { id: ADMIN_IDS.cancelarSim, title: "Tentar de novo" },
            { id: ADMIN_IDS.agenda, title: "Atualizar" }
          ],
          registrarPergunta: false
        }
      }
      calendarOk = true
    }
  }

  const dataHora = item.inicio ? formatarSlot(new Date(item.inicio)) : "data anterior"
  const resultado = await liberarAgendamentoERecalcularStage(u, "cancelado_admin_whatsapp")
  let notaHubSpotOk = false
  if (u.contatoId) {
    notaHubSpotOk = await hsCriarNota(
      u.contatoId,
      "CONSULTA CANCELADA PELO WHATSAPP ADMIN",
      `Consulta cancelada pelo WhatsApp admin.\nCaso: ${u.numeroCaso || "-"}\nData: ${dataHora}\nEvento: ${eventoId || "-"}`
    )
  }

  let clienteAvisadoOk = false
  if (item.from) {
    const nome = primeiroNomeCliente(u) || "cliente"
    clienteAvisadoOk = await enviar(
      item.from,
      `Consulta cancelada, *${nome}*.\n\nSua consulta de *${dataHora}* foi cancelada.\n\nQuando quiser remarcar, toque em *Agendar consulta* no menu do cliente.`,
      null,
      false
    )
  }

  const chaveAdmin = normalizarNumeroWhatsAppEnvio(from)
  sessoesAdminWhatsApp.delete(chaveAdmin)

  return {
    texto: [
      "✅ *Consulta cancelada.*",
      "",
      `👤 Cliente: ${u.nome || "Cliente"}`,
      `📄 Caso: ${u.numeroCaso || "-"}`,
      `🕒 Data: ${dataHora}`,
      resultado?.novoStage ? `📌 Novo stage: ${labelStageAdmin(resultado.novoStage)}` : "",
      "",
      "🧾 *Auditoria*",
      `📅 Calendar: ${calendarOk ? "✅ ok" : "⚠️ sem evento"}`,
      `🔗 HubSpot stage: ${resultado?.hubspotTentado ? (resultado?.hubspotAtualizado ? "✅ ok" : "❌ falhou") : "⚪ sem alteracao"}`,
      `📝 Nota HubSpot: ${notaHubSpotOk ? "✅ ok" : "⚠️ nao registrada"}`,
      `📨 Cliente avisado: ${clienteAvisadoOk ? "✅ ok" : "⚠️ nao enviado"}`
    ].filter(Boolean).join("\n"),
    opcoes: [{ id: ADMIN_IDS.agenda, title: "📅 Consultas" }],
    registrarPergunta: false
  }
}

async function obterConsultaAtivaCliente(u) {
  if (!u?._eventoCalendarId) return null
  const estado = await obterEstadoEventoConsulta(u._eventoCalendarId)
  if (estado?.cancelado || estado?.passou) {
    await liberarAgendamentoERecalcularStage(
      u,
      estado?.cancelado ? "evento_cancelado_cliente_verificacao" : "consulta_passada_cliente_verificacao"
    )
    return null
  }
  return estado
}

async function cancelarEventoConsultaUsuario(u, motivo = "consulta_cancelada", eventoId = null) {
  const idEvento = sanitizarTextoEntrada(eventoId || u?._eventoCalendarId)
  if (idEvento) {
    try {
      const cal = getCalendar()
      await cal.events.delete({ calendarId: CALENDAR_ID, eventId: idEvento })
    } catch (e) {
      const status = e?.code || e?.response?.status || e?.status
      if (status !== 404 && status !== 410) throw e
    }
  }

  return await liberarAgendamentoERecalcularStage(u, motivo)
}

async function processarAdminWhatsApp(from, text) {
  const comando = normalizarTextoGatilho(text)

  if (["sair", "bloquear", "logout"].includes(comando)) {
    bloquearAdminWhatsApp(from)
    return {
      texto: "Acesso admin bloqueado. Para abrir novamente, envie qualquer mensagem e digite a senha.",
      opcoes: null,
      registrarPergunta: false,
      audio: false
    }
  }

  if (!adminWhatsAppAutenticado(from)) {
    if (!senhaAdminConfigurada()) {
      logSegurancaAdmin(from, "configuracao de senha ausente")
      return telaSenhaAdminWhatsApp({ configuracaoAusente: true })
    }
    if (adminWhatsAppBloqueado(from)) {
      return telaSenhaAdminWhatsApp({ bloqueado: true })
    }
    if (senhaAdminValida(text)) {
      autenticarAdminWhatsApp(from)
      return await telaAdminPrioridades(from)
    }
    const tentativaInvalida = Boolean(sanitizarTextoEntrada(text))
    if (tentativaInvalida) registrarFalhaSenhaAdmin(from)
    return telaSenhaAdminWhatsApp({
      tentativaInvalida,
      bloqueado: adminWhatsAppBloqueado(from)
    })
  }

  if (["", "admin", "menu", "inicio", "admin_menu", ADMIN_IDS.menu].includes(comando)) {
    return await telaAdminPrincipal()
  }

  if (["prioridades", "prioridade", "admin_prioridades", ADMIN_IDS.prioridades].includes(comando)) {
    return await telaAdminPrioridades(from)
  }

  if (["consultas", "consulta", "agenda", "agendamentos", "admin_consultas", ADMIN_IDS.agenda].includes(comando)) {
    return await telaConsultasAdmin(from)
  }

  if (["admin_casos", ADMIN_IDS.casos].includes(comando)) return await telaAdminCasos()
  if (["admin_casos_novos", ADMIN_IDS.casosNovos].includes(comando)) return await telaAdminCasosNovos(from)
  if (["admin_casos_analise", ADMIN_IDS.casosAnalise].includes(comando)) return await telaAdminCasosAnalise(from)
  if (["admin_casos_docs", ADMIN_IDS.casosDocs].includes(comando)) return await telaAdminCasosDocumentos(from)

  if (["admin_alertas", ADMIN_IDS.alertas].includes(comando)) return await telaAdminAlertas()
  if (["admin_alertas_criticos", "admin_alertas_urgentes", ADMIN_IDS.alertasCriticos, ADMIN_IDS.alertasUrgentes].includes(comando)) return await telaAdminAlertasUrgentes(from)
  if (["admin_alertas_parados", "admin_alertas_sem_resposta", ADMIN_IDS.alertasParados, ADMIN_IDS.alertasSemResposta].includes(comando)) return await telaAdminAlertasSemResposta(from)
  if (["admin_alertas_docs", ADMIN_IDS.alertasDocs].includes(comando)) return await telaAdminAlertasDocs(from)
  if (["admin_alertas_agenda", ADMIN_IDS.alertasAgenda].includes(comando)) return await telaAdminAlertasAgenda(from)
  if (["admin_resumo_diario", ADMIN_IDS.resumo].includes(comando)) return await telaAdminResumoDiario()

  const matchConsulta = comando.match(/^admin_consulta_(\d+)$/)
  if (matchConsulta) return telaDetalheConsultaAdmin(from, Number(matchConsulta[1]))

  const matchCaso = comando.match(/^admin_caso_(\d+)$/)
  if (matchCaso) return telaDetalheCasoAdmin(from, Number(matchCaso[1]))

  if (/^\d+$/.test(comando)) {
    const sessaoAdmin = sessoesAdminWhatsApp.get(normalizarNumeroWhatsAppEnvio(from))
    if (sessaoAdmin?.listaAtiva === "casos") {
      const itemCaso = obterCasoAdmin(from, Number(comando) - 1)
      if (itemCaso) return telaDetalheCasoAdmin(from)
      return {
        texto: "⚠️ Nao encontrei esse caso na lista atual.\n\nAbra *Prioridades* ou *Casos* para atualizar a lista.",
        opcoes: [
          { id: ADMIN_IDS.prioridades, title: "📌 Prioridades" },
          { id: ADMIN_IDS.casos, title: "📂 Casos" },
          { id: ADMIN_IDS.menu, title: "🏠 Menu admin" }
        ],
        registrarPergunta: false
      }
    }
    if (sessaoAdmin?.listaAtiva === "consultas") {
      return telaDetalheConsultaAdmin(from, Number(comando) - 1)
    }
    return {
      texto: "⚠️ Nao ha uma lista ativa para esse numero.\n\nAbra *Agenda*, *Prioridades* ou *Casos* primeiro.",
      opcoes: [
        { id: ADMIN_IDS.agenda, title: "📅 Agenda" },
        { id: ADMIN_IDS.prioridades, title: "📌 Prioridades" },
        { id: ADMIN_IDS.casos, title: "📂 Casos" }
      ],
      registrarPergunta: false
    }
  }
  if (["admin_cancelar_consulta", ADMIN_IDS.cancelarConsulta].includes(comando)) return telaConfirmarCancelamentoAdmin(from)
  if (["admin_cancelar_nao", ADMIN_IDS.cancelarNao].includes(comando)) return telaDetalheConsultaAdmin(from)
  if (["admin_cancelar_sim", ADMIN_IDS.cancelarSim].includes(comando)) return await cancelarConsultaAdmin(from)
  if (["admin_caso_links", ADMIN_IDS.casoLinks].includes(comando)) return telaLinksCasoAdmin(from)
  if (["admin_caso_pedir_docs", ADMIN_IDS.casoPedirDocs].includes(comando)) return await pedirDocsCasoAdmin(from)
  if (["admin_caso_lembrete", ADMIN_IDS.casoLembrete].includes(comando)) return await enviarLembreteCasoAdmin(from)
  if (["admin_caso_marcar_urg", ADMIN_IDS.casoMarcarUrgente].includes(comando)) return await marcarCasoUrgenteAdmin(from)
  if (["admin_caso_enviar_analise", ADMIN_IDS.casoEnviarAnalise].includes(comando)) return await enviarAnaliseCasoAdmin(from)
  if (["admin_caso_revisado", ADMIN_IDS.casoRevisado].includes(comando)) return await marcarCasoRevisadoAdmin(from)

  const menu = await telaAdminPrincipal()
  return {
    ...menu,
    texto: [
      "Nao reconheci esse comando admin.",
      "",
      menu.texto
    ].join("\n")
  }
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
    logDebug("[CAPTURA] inicio:", from)
    const sessao = u || users[from] || null
    logDebug("[CAPTURA] sessao ativa:", Boolean(sessao))

    if (sessao && !sessao.atendente) sessao.atendente = sortearAtendente()

    if (!sessao) {
      logDebug("⚠️ Sem sessão ativa, seguindo captura com fallback pelo telefone")
    }

    if (sessao && !deveCapturarLeadIncompleto(sessao)) {
      if (sessao.leadIncompletoCapturado) logDebug("? Lead já capturado anteriormente, abortando captura")
      if (sessao.numeroCaso) logDebug("? Sessão já possui número de caso, abortando captura")
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
    // sempre usar fallback "Lead WhatsApp" ou "Contato sem nome" quando nome ausente
    const nome = (lead.nome && String(lead.nome).trim() && lead.nome !== "cliente" && lead.nome !== "você")
      ? lead.nome
      : (lead.nomePerfilWhatsApp && String(lead.nomePerfilWhatsApp).trim())
        ? lead.nomePerfilWhatsApp
        : (lead.nomeWA && String(lead.nomeWA).trim())
          ? lead.nomeWA
          : "Lead WhatsApp"
    const area = lead.area || "Atendimento inicial"
    logDebug("📌 Criando lead com nome:", nome, "telefone:", from)
    let contatoId = null
    let negocioId = null

    logDebug("➡️ Validando contato no HubSpot antes de qualquer reaproveitamento...")
    let existente = null
    try {
      existente = await hsBuscarPorPhone(telefone)
    } catch (e) {
      console.error("Erro ao buscar contato no HubSpot:", detalharErroHubspot(e))
    }
    if (existente?.properties?.firstname && !lead.nomeHubspot) lead.nomeHubspot = existente.properties.firstname
    contatoId = existente?.id || null

    if (!contatoId) {
      // SEMPRE criar contato mesmo sem nome — usar fallback
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
        // segunda tentativa mínima — só telefone + nome fallback
        try {
          const res = await axios.post(
            "https://api.hubapi.com/crm/v3/objects/contacts",
            { properties: { firstname: nome, phone: telefone } },
            { headers: HS() }
          )
          contatoId = res.data.id
          monitor.cadastros++
        } catch (e2) {
          console.error("Erro na segunda tentativa de criar contato:", detalharErroHubspot(e2))
        }
      }
    } else {
      logDebug("Contato confirmado no HubSpot:", contatoId)
      await hsAtualizarContato(contatoId, { firstname: nome, phone: telefone })
    }
    if (sessao) sessao.contatoId = contatoId
    if (sessao && contatoId) sessao._hubspotSemContato = false

    if (!contatoId) {
      logDebug("Falha ao criar/obter contato no HubSpot. Cancelando criacao de negocio:", { from, telefone })
      logErro("hubspot", `capturarLeadIncompleto sem contato para ${from}`)
      return null
    }

    // verificar negócio existente ANTES de criar novo — evitar duplicatas
    if (contatoId) {
      try {
        negocioId = await hsBuscarNegocioAbertoDoContato(contatoId)
      } catch (e) {
        console.error("Erro ao buscar negócio aberto no HubSpot:", detalharErroHubspot(e))
      }
    }

    // também checar se já existe negocioId na sessão antes de criar novo
    if (!negocioId && sessao?.negocioId) {
      negocioId = sessao.negocioId
      logDebug("Negócio reutilizado da sessão:", negocioId)
    }

    if (!negocioId) {
      logDebug("➡️ Indo criar negócio...")
      const temperatura = definirTemperatura(lead)
      const nomeDeal = getNomeDeal(lead)
      const notaLead = getNotaLead(lead)

      logDebug("🌡️ Temperatura do lead:", temperatura)
      try {
        const negocioCriadoId = await hsCriarNegocio({
          ...lead,
          nome,
          area,
          numeroCaso: "LEAD-INCOMPLETO"
        }, {
          stage: HS_STAGE.LEAD,
          dealname: nomeDeal
        })
        negocioId = negocioCriadoId

        if (negocioCriadoId) {
          await hsCriarNotaNegocio(negocioCriadoId, "CLASSIFICACAO DE LEAD", notaLead)
        }
      } catch (e) {
        console.error("Erro ao criar negócio no HubSpot:", detalharErroHubspot(e))
        throw e
      }
    } else {
      logDebug("Negócio reutilizado:", negocioId)
    }
    if (sessao) sessao.negocioId = negocioId || null
    if (sessao?.negocioId) await sincronizarNegocio(sessao)

    if (contatoId && negocioId) {
      await hsAssociar(contatoId, negocioId)
      await hsCriarNota(
        contatoId,
        "LEAD INCOMPLETO",
        `Lead capturado por inatividade.\nNome: ${nome}\nTelefone: ${telefone}\nÁrea: ${lead.area || "Não informada"}\nStage interno: ${lead.stage}`
      )
    } else {
      logDebug("Captura incompleta no HubSpot:", { contatoId, negocioId, from })
    }

    if (sessao) sessao.leadIncompletoCapturado = true
    return { contatoId, negocioId }
  } catch (err) {
    logDebug("? ERRO capturaLead:", err.response?.data || err.message || err)
    console.error("Erro completo em capturarLeadIncompleto:", detalharErroHubspot(err))
    logErro("hubspot", "capturarLeadIncompleto: " + (err.response?.data?.message || err.message))
    return null
  }
}

const CALENDAR_ID = "oraculum.juridico@gmail.com"

function getCalendar() {
  const oauth2 = new google.auth.OAuth2(
    GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET,
    "urn:ietf:wg:oauth:2.0:oob"
  )
  oauth2.setCredentials({ refresh_token: GOOGLE_REFRESH_TOKEN })
  return google.calendar({ version: "v3", auth: oauth2 })
}

async function baixarMidia(mediaId) {
  try {
    const info = await axios.get(`https://graph.facebook.com/v19.0/${mediaId}`, { headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}` } })
    const file = await axios.get(info.data.url, { headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}` }, responseType: "arraybuffer" })
    const buffer = Buffer.from(file.data)
    logDebug(`[WHATSAPP] Midia baixada | mime=${info.data.mime_type || "application/octet-stream"} | bytes=${buffer.length}`)
    return { buffer, mimeType: info.data.mime_type || "application/octet-stream" }
  } catch (e) { logErro("whatsapp", "baixarMidia: " + e.message); return null }
}

const IMAGEM_MENU_CLIENTE_URL = process.env.IMAGEM_MENU_CLIENTE_URL || ""
const IMAGEM_GUIA_DOCS_URL = process.env.IMAGEM_GUIA_DOCS_URL || ""
const IMAGEM_CONFIRMACAO_URL = process.env.IMAGEM_CONFIRMACAO_URL || ""
const IMAGEM_CASO_REGISTRADO_URL = process.env.IMAGEM_CASO_REGISTRADO_URL || ""
const IMAGEM_NOVO_CASO_URL = process.env.IMAGEM_NOVO_CASO_URL || ""
const IMAGEM_ASSESSORIA_INICIAL_URL = process.env.IMAGEM_ASSESSORIA_INICIAL_URL || ""
const IMAGEM_POS_RELATO_URL = process.env.IMAGEM_POS_RELATO_URL || ""
const IMAGEM_SELECAO_CASO_URL = process.env.IMAGEM_SELECAO_CASO_URL || ""
const IMAGEM_ADV_URL = process.env.IMAGEM_ADV_URL || ""
const IMAGEM_ADV_HORARIOS_URL = process.env.IMAGEM_ADV_HORARIOS_URL || ""
const IMAGEM_ADV_URGENTE_URL = process.env.IMAGEM_ADV_URGENTE_URL || ""
const IMAGEM_STATUS_URL = process.env.IMAGEM_STATUS_URL || ""
const IMAGEM_ADV_AGENDADO_URL = process.env.IMAGEM_ADV_AGENDADO_URL || ""
const IMAGEM_ADV_URGENTE_REGISTRADA_URL = process.env.IMAGEM_ADV_URGENTE_REGISTRADA_URL || ""
const IMAGEM_DOC_AVULSO_URL = process.env.IMAGEM_DOC_AVULSO_URL || ""
const IMAGEM_DOC_ANEXADO_URL = process.env.IMAGEM_DOC_ANEXADO_URL || ""
const IMAGEM_ENVIO_EXTRA_URL = process.env.IMAGEM_ENVIO_EXTRA_URL || ""

const CAPTION_GUIA_DOCS = "📎 Guia rápido: veja como fotografar e enviar seu documento com segurança."
const IMAGEM_DOC_RECEBIDO_URL = "https://i.imgur.com/91SqyKX.png"
const TEXTO_INTRO_DOCS = [
  "📎 *Antes de enviar seus documentos*",
  "",
  "Para que nossa equipe consiga analisar tudo com segurança, envie fotos nítidas, completas e sem reflexo.",
  "",
  "Coloque o documento sobre uma superfície plana, em local bem iluminado, enquadre todas as bordas e envie uma foto por vez. Se preferir, também pode enviar PDF.",
  "",
  "Quando estiver pronto, toque em *Entendi, continuar*."
].join("\n")
const AUDIO_GUIA_DOCS_TEXTO = "Antes de enviar seus documentos, veja estas orientações. Coloque o documento sobre uma superfície plana, em local bem iluminado, tire a foto enquadrando o documento inteiro e envie aqui pelo WhatsApp. Se a foto já estiver salva no celular, toque no clipe, abra a galeria e selecione. Seus documentos são tratados com sigilo e segurança. Na tela, você tem três opções: Entendi, para continuar para a lista do seu caso; Continuar depois, se quiser deixar para outro momento; ou Menu do cliente, para voltar."

function textoAudioConfirmacaoDados(u) {
  const primeiroNome = primeiroNomeCliente(u) || "você"
  const cidade = u.cidade && u.uf ? `${u.cidade}, ${u.uf}` : u.cidade || "não informada"
  const situacao = formatarSituacaoJuridica(u.situacao, u.tipo, u.subTipo)
  const urgencia = ({ alta: "alta", normal: "moderada", baixa: "baixa" })[u.urgencia] || "moderada"
  // Tom sóbrio quando sofrimento foi detectado — sem encorajamento
  const fechamento = u._jaAcolheuSofrimento
    ? "Se tudo estiver certo, confirme para registrar o caso. Se precisar corrigir algo, escolha Corrigir. Para voltar, use a opção Voltar."
    : "Se tudo estiver certo, confirme para registrar o caso e permitir que o advogado comece a análise. Se precisar corrigir algo, escolha Corrigir. Para voltar, use a opção Voltar."
  return `${primeiroNome}, revise os dados antes de confirmar. Nome: ${u.nome || "não informado"}. Cidade: ${cidade}. Área: ${u.area || "não informada"}. Situação: ${situacao || "não informada"}. Urgência: ${urgencia}. ${fechamento}`
}

async function enviarTelaImagemOuTexto(from, imageUrl, texto, opcoes = null, chamadaOpcoes = "👇 *Escolha uma opção abaixo:*") {
  const payload = aplicarEmojiTelaCliente(from, { texto, opcoes })
  const textoTela = payload.texto
  const opcoesTela = payload.opcoes || null
  await enviarAudioAutomaticoTela(from, users[from], payload, "tela direta")

  const opcoesImagem = Array.isArray(opcoesTela) && opcoesTela.length <= 3 ? opcoesTela : null
  if (imageUrl) {
    const enviada = await enviarImagemWhatsApp(from, imageUrl, textoTela, opcoesImagem)
    if (enviada) {
      if (Array.isArray(opcoesTela) && opcoesTela.length > 3) {
        await new Promise(r => setTimeout(r, 500))
        return aplicarEmojiTelaCliente(from, { texto: chamadaOpcoes, opcoes: opcoesTela })
      }
      return { texto: null, opcoes: null }
    }
  }
  return { texto: textoTela, opcoes: opcoesTela }
}

async function enviarGuiaDocs(from, u, tela) {
  try {
    const payload = typeof tela === "string" ? { texto: tela, opcoes: null } : (tela || {})

    await enviarAudioModoVoz(from, u, textoAudioTelaDocumentoCaso(u), "documentos caso")
    if (u?.modoTexto === false) await new Promise(r => setTimeout(r, 2500))

    const imageUrl = payload.imagemUrl || imagemPorCaso(u) || imagemPorAreaTipo(u?.area, u?.tipo, u?.situacao, u?.detalhe)
    const imagemEnviada = imageUrl
      ? await enviarImagemWhatsApp(from, imageUrl, payload.texto || CAPTION_GUIA_DOCS, payload.opcoes || null)
      : false

    if (!imagemEnviada && payload.texto) {
      await enviar(from, payload.texto, payload.opcoes || null, false)
    }
  } catch (e) {
    logErro("guia_docs", "Falha ao enviar guia", e)
    const payload = typeof tela === "string" ? { texto: tela, opcoes: null } : (tela || {})
    if (payload.texto) await enviar(from, payload.texto, payload.opcoes || null, false)
  }
}

async function enviarIntroDocumentos(from, u) {
  const opcoes = [
    { id: "docs_intro_ok", title: "✅ Entendi" },
    { id: "docs_depois", title: "Continuar depois" },
      { id: "m_inicio", title: "🏠 Menu do cliente" }
  ]
  try {
    if (!u?.modoTexto && u?.atendente) {
      try {
        const ogg = await gerarAudioAtendente(u.atendente, AUDIO_GUIA_DOCS_TEXTO)
        await enviarAudio(from, urlAudioAtendente(ogg))
        await new Promise(r => setTimeout(r, 12000))
      } catch (e) {
        logErro("tts", "intro docs áudio", e)
      }
    }
    const enviada = IMAGEM_GUIA_DOCS_URL
      ? await enviarImagemWhatsApp(from, IMAGEM_GUIA_DOCS_URL, TEXTO_INTRO_DOCS, opcoes)
      : false
    if (!enviada) {
      await enviar(from, TEXTO_INTRO_DOCS, opcoes, false)
    }
  } catch (e) {
    logErro("intro_docs", "Falha ao enviar introducao de documentos", e)
    await enviar(from, TEXTO_INTRO_DOCS, opcoes, false)
  }
}

async function prepararFluxoResumoOutro(from, u) {
  const sugestao = await classificarResumoOutro(u, u.assuntoResumo)
  if (sugestao?.categoria && Number(sugestao.confianca || 0) >= 0.6 && sugestao.categoria !== "generico") {
    aplicarSugestaoFluxoOutro(u, sugestao.categoria)
  }

  u._sugestaoFluxo = null
  u._proximaPerguntaAposDescricao = null
  setStage(u, STAGES.CONFIRMACAO)
  iniciarTimer(from)
  await sincronizarNegocio(u)
  return await telaConfirmacaoComImagem(from, u)
}

async function detectarEncerramentoPorAudio(from, u, msgObj, tipo) {
  const mediaId = msgObj?.[tipo]?.id
  if (!mediaId) return null

  const midia = await baixarMidia(mediaId)
  if (!midia) return null

  const transcricao = await transcrever(midia.buffer, midia.mimeType, { origem: "intencao_encerrar" })
  if (!transcricao) return null

  const decisao = await classificarAcaoAudioFluxo(u, transcricao)
  if (decisao?.acao !== "encerrar") return null

  logDebug(`[AUDIO_ENCERRAR] Intenção de encerrar detectada | USER: ${from} | STAGE: ${u?.stage || "-"} | MSG: "${sanitizarTextoEntrada(transcricao)}"`)
  return executarEncerramentoFluxo(from, u)
}

// ================================================================
//  FLOWS (funções separadas por etapa)
// ================================================================

async function finalizarCadastro(from, u) {
  const telefoneContato = getTelefoneContato(from, u)
  const ehTerceiro = u.telefoneEhDoCliente === false
  const ehNovoCasoCliente = Boolean(u._novoCasoDeCliente)
  if (u.numeroCaso) {
    logDebug("? Sessão já possui número de caso, reutilizando existente")
  } else {
    u.numeroCaso = gerarCaso(u.area)
  }
  const numeroCaso = u.numeroCaso
  u.score       = calcScore(u)
  u.docsEntregues = []; u.docsAusentes = []; u.docsPulados = []; u.docsParciais = []; u.docsDispensados = []
  u.docAtualIdx = 0; u.ultimoArqId = null

  const pasta      = await criarPastaCliente(numeroCaso, u.nome, u.area, u.situacao, u.tipo)
  u.pastaDriveId   = pasta?.id || null
  u.pastaDriveLink = pasta?.webViewLink || null

  const existente = await hsBuscarPorPhone(telefoneContato)
  if (existente?.properties?.firstname && !u.nomeHubspot) u.nomeHubspot = existente.properties.firstname
  let contatoId   = existente?.id || null

  const nomeExistenteHS = existente?.properties?.firstname || ""
  const nomeTerceiro = (u.nome || "").trim()
  // Se o telefone informado para terceiro já existe com outro nome, preserva o contato.
  // O nome divergente fica registrado no negócio/nota, sem sobrescrever nem duplicar contato.
  const telefoneJaEhDeOutro = ehTerceiro && contatoId &&
    nomeExistenteHS &&
    normalizarNomeComparacao(nomeExistenteHS) !== normalizarNomeComparacao(nomeTerceiro)

  if (telefoneJaEhDeOutro) {
    logDebug(`[HUBSPOT] Telefone do terceiro ja existe com outro nome (${nomeExistenteHS}). Preservando contato e registrando divergencia no negocio.`)
  } else if (!contatoId) {
    contatoId = await hsCriarContato(telefoneContato, u)
  } else {
    logDebug("Contato encontrado no HubSpot:", contatoId)
    // Para caso próprio do cliente: nome confirmado sobrepõe o anterior no HubSpot
    // Para caso de terceiro: só atualiza se o contato já é do terceiro (mesmo nome)
    if (u.nomeConfirmado && u.nome && !ehTerceiro) {
      await hsAtualizarContato(contatoId, { firstname: u.nome })
    }
  }
  u.contatoId = contatoId
  if (contatoId) u._hubspotSemContato = false

  let negocioId = u.negocioId || null
  if (!negocioId && contatoId && !ehNovoCasoCliente) {
    const negocioExistente = await hsBuscarNegocioAbertoDoContato(contatoId)
    if (negocioExistente) {
      negocioId = negocioExistente
      u.negocioId = negocioId
      logDebug("Negócio existente encontrado:", negocioId)
    }
  }

  const dealnameFinal = ehTerceiro
    ? `Terceiro - ${u.area || "Atendimento"} - ${numeroCaso}${nomeTerceiro ? " - " + nomeTerceiro : ""}`
    : `Cliente - ${u.area || "Atendimento"} - ${numeroCaso}`

  if (!negocioId) {
    logDebug("Nenhum negócio encontrado, criando novo")
    negocioId = await hsCriarNegocio(u, { dealname: dealnameFinal, stage: HS_STAGE.ANALISE })
    u.negocioId = negocioId
  } else {
    logDebug("Negócio já existe, atualizando dealname:", negocioId)
    u.negocioId = negocioId
    await hubspotClient.crm.deals.basicApi.update(u.negocioId, {
      properties: {
        dealname: dealnameFinal
      }
    })
  }
  if (u.negocioId && u.numeroCaso) {
    await hubspotClient.crm.deals.basicApi.update(u.negocioId, {
      properties: {
        numero_de_caso: u.numeroCaso
      }
    })
    await hubspotClient.crm.deals.basicApi.update(u.negocioId, {
      properties: {
        dealname: dealnameFinal
      }
    })
    await hsAtualizarEtapaNegocio(u.negocioId, HS_STAGE.ANALISE)
    u.negocioStageId = HS_STAGE.ANALISE
  }
  if (contatoId && negocioId) await hsAssociar(contatoId, negocioId)
  await hsAtualizarNegocio(u.negocioId, getHubSpotDealStateProps(u))

  if (contatoId) {
    await hsCriarNota(contatoId, "CADASTRO COMPLETO", resumoCaso(u) + `\n\nScore: ${u.score}\nDrive: ${u.pastaDriveLink || "—"}\nWhatsApp: ${telefoneContato}`)
    if (u.negocioId) {
      await hsCriarNotaNegocio(u.negocioId, "CADASTRO COMPLETO", resumoCaso(u) + `\n\nScore: ${u.score}\nDrive: ${u.pastaDriveLink || "—"}\nWhatsApp: ${telefoneContato}`)
    }
    if (telefoneJaEhDeOutro) {
      const notaDivergencia = [
        "Caso para terceiro com telefone ja existente no HubSpot.",
        `Nome atual do contato: ${nomeExistenteHS || "nao informado"}`,
        `Nome informado neste atendimento: ${nomeTerceiro || "nao informado"}`,
        `Telefone informado: ${telefoneContato}`,
        "O nome do contato foi preservado para evitar sobrescrever o verdadeiro dono do numero."
      ].join("\n")
      await hsCriarNota(contatoId, "DIVERGENCIA DE NOME - CASO PARA TERCEIRO", notaDivergencia)
      if (u.negocioId) await hsCriarNotaNegocio(u.negocioId, "DIVERGENCIA DE NOME - CASO PARA TERCEIRO", notaDivergencia)
    }
  }

  // Salvar áudio de descrição guardado antes do cadastro
  if (u._audioDescBuffer && u.pastaDriveId) {
    try {
      await uploadPastaAudio(u.pastaDriveId, u._audioDescNome || "cliente", "Áudios Transcritos Confirmados", u._audioDescBuffer, u._audioDescMime)
      u._audioDescBuffer = null; u._audioDescMime = null; u._audioDescNome = null
      logDebug("[DRIVE] Áudio de descrição salvo após cadastro")
    } catch (e) { logErro("drive", "salvarAudioDesc: " + e.message) }
  }

  if (u.audiosDescCorrigidos?.length && u.pastaDriveId) {
    try {
      for (const audio of u.audiosDescCorrigidos) {
        if (!audio?.buffer) continue
        await uploadPastaAudio(u.pastaDriveId, audio.nome || "cliente", "Áudios Transcritos Corrigidos", audio.buffer, audio.mimeType)
      }
      u.audiosDescCorrigidos = []
      logDebug("[DRIVE] Áudios corrigidos salvos após cadastro")
    } catch (e) { logErro("drive", "salvarAudiosCorrigidos: " + e.message) }
  }

  Reflect.set(u, "stage", STAGES.CLIENTE)
  u._novoCasoDeCliente = false
  u._casoAnteriorCliente = null
  u.leadIncompletoCapturado = false
  agendarPersistenciaUsers()
  return numeroCaso
}

async function tela_confirmacao(u) {
  const urgenciaLabel = { alta: "Alta 🔴", normal: "Moderada 🟡", baixa: "Baixa 🟢" }
  const cidade = u.cidade && u.uf ? `${u.cidade}, ${u.uf}` : u.cidade || "—"
  const whatsapp = formatarTelefoneExibicao(u.whatsappContato || u._numero || "")
  // sempre gerar resumo via IA, não apenas quando cache existe
  const descExibir = (u.descricao || u._audioCanalTranscricao)
    ? await gerarResumoDescricaoConfirmacao(u)
    : "—"
  // Para terceiro: nome deve ser sempre o da pessoa atendida (u.nome), nunca do contato.
  const nome = u.atendimentoParaTerceiro
    ? (u.nome || "⚠️ não informado — corrija antes de confirmar")
    : (u.nome || u.nomeContato || "—")
  const situacaoFormatada = formatarSituacaoJuridica(u.situacao, u.tipo, u.subTipo)
  const detalheBase = u.detalhe || u.assuntoResumo || descExibir || u.descricao || u._audioCanalTranscricao
  const detalheFormatado = formatarDetalheJuridico(detalheBase, null)

  const linhas = [
    `👤 *Nome:* ${nome}`,
    (u.atendimentoParaTerceiro && u.nomeContato) ? `👥 *Aberto por:* ${u.nomeContato}` : null,
    `📱 WhatsApp: *${whatsapp || "—"}*`,
    `📍 *Cidade:* ${cidade}`,
    `⚖️ *Área:* ${u.area || "—"}`,
    situacaoFormatada && situacaoFormatada !== "—" ? `📌 *Situação:* ${situacaoFormatada}` : null,
    detalheFormatado  && detalheFormatado  !== "—" ? `🔎 *Detalhe:* ${detalheFormatado}`  : null,
    `⚡ *Urgência:* ${urgenciaLabel[u.urgencia] || "Moderada 🟡"}`,
    descExibir && descExibir !== "—" ? `💬 *Descrição:* ${descExibir}` : null,
  ].filter(Boolean).join("\n")

  // Quando sofrimento foi detectado: texto de confirmação mais sóbrio,
  // sem frases de encorajamento. A pessoa só precisa confirmar ou corrigir.
  const sofrimentoNaSessao = u._jaAcolheuSofrimento === true
  const textoIntroConf = sofrimentoNaSessao
    ? `●●●●●● Etapa 6 de 6 · *Confirmação*\n\n*Confira seus dados:*\n\n${linhas}\n\nQuando confirmar, seu caso será registrado e nossa equipe será notificada.`
    : `●●●●●● ✅ Etapa 6 de 6 · *Confirmação*\n\n✅ *Confira seus dados antes de confirmar:*\n\n${linhas}\n\n*Ao confirmar, seu caso será registrado oficialmente e nossa equipe será notificada.*\n\nTudo está correto?`
  return {
    texto: textoIntroConf,
    opcoes: [
      { id: "conf_ok",       title: "✅ Confirmar" },
      { id: "conf_corrigir", title: "✏️ Corrigir" },
      { id: "conf_menu",     title: "⬅️ Voltar" }
    ]
  }
}

async function telaConfirmacaoComImagem(from, u) {
  const tela = await tela_confirmacao(u)
  const imagemUrl = IMAGEM_CONFIRMACAO_URL || "https://i.imgur.com/JhM9azm.png"
  await enviarAudioModoVoz(from, u, textoAudioConfirmacaoDados(u), "confirmacao dados")
  try {
    await enviarImagemWhatsApp(from, imagemUrl, tela.texto, tela.opcoes)
    return { texto: null, opcoes: null }
  } catch (e) {
    logErro("confirmacao", "Falha ao enviar imagem de confirmacao", e)
    return tela
  }
}

// ------------------------------------------------------------------
// Helper: retornar para a tela de confirmação correta após edição
// u._origemConfirmacao = "audio" | "texto"
// ------------------------------------------------------------------
async function voltarParaConfirmacao(from, u) {
  u._retornarParaConfirmacao = false
  await sincronizarNegocio(u)
  iniciarTimer(from)

  // Invalidar cache de resumo para forçar regerar com dados atualizados
  u._resumoDescricaoIA = null
  u._resumoDescricaoIABase = null

  if (u._origemConfirmacao === "audio") {
    // Modo voz: usa telaConfirmarDadosAudio que já respeita modoTexto internamente
    setStage(u, STAGES.AUDIO_CONFIRMAR_DADOS)
    return await telaConfirmarDadosAudio(from, u)
  }

  // Modo texto padrão
  setStage(u, STAGES.CONFIRMACAO)
  return await telaConfirmacaoComImagem(from, u)
}

function limparCorrecaoPendente(u) {
  u._correcaoPendenteCampo = null
  u._correcaoPendenteValor = null
  u._correcaoPendenteExtra = null
  u._correcaoPendenteSubcampo = null
}

function formatarValorCorrecao(campo, valor, extra = {}) {
  if (campo === "cidade") {
    const cidade = extra.cidade || valor
    return `${cidade}${extra.uf ? `, ${extra.uf}` : ""}${extra.regiao ? ` (${extra.regiao})` : ""}`
  }
  return sanitizarTextoEntrada(valor) || "—"
}

async function pedirCampoCorrecao(from, u, aviso = "") {
  limparCorrecaoPendente(u)
  setStage(u, STAGES.CORRIGIR_DADOS)
  iniciarTimer(from)
  const prefixo = aviso ? `${aviso}\n\n` : ""
  const texto = `${prefixo}✏️ *O que você gostaria de corrigir?*\n\n_Diga ou digite o que está errado. Por exemplo: "meu nome está errado", "a cidade está errada" ou "o WhatsApp está errado"._`
  if (!u.modoTexto) {
    try {
      const ogg = await gerarAudioAtendente(u.atendente,
        `Tudo bem. Me diga o que deseja corrigir. Pode falar em áudio ou digitar.`)
      await enviarAudio(from, urlAudioAtendente(ogg))
      await new Promise(r => setTimeout(r, 2500))
    } catch (e) { logErro("tts", "Falha áudio perguntar correcao", e) }
  }
  return responderComTimer(from, { texto, opcoes: null })
}

async function reabrirCorrecaoPendente(from, u) {
  const campo = u._correcaoPendenteCampo
  if (!campo) return pedirCampoCorrecao(from, u)

  const config = {
    nome: {
      stage: STAGES.EDITAR_NOME,
      texto: "●●○○○○ 👤 Etapa 2 de 6 · *Nome*\n\n😊 Fico feliz em poder ajudar! Para começar, qual é o seu nome completo?\n\n_Digite ou envie um áudio com seu nome._",
      audio: "Tudo bem. Me diga somente o nome completo."
    },
    cidade: {
      stage: STAGES.EDITAR_CIDADE,
      texto: "📍 *Em qual cidade você mora?*\n\n_Digite a cidade com o estado, por exemplo: Recife Pernambuco, ou informe o CEP com oito dígitos._",
      audio: "Tudo bem. Me diga sua cidade com o estado, por exemplo Recife Pernambuco, ou informe o CEP com oito dígitos."
    },
    situacao: {
      stage: STAGES.EDITAR_SITUACAO,
      texto: "📌 *Qual é a situação correta?*\n\n_Descreva brevemente ou envie um áudio._",
      audio: "Tudo bem. Me conte a situação correta do seu caso."
    },
    detalhe: {
      stage: STAGES.EDITAR_DETALHE,
      texto: "🔎 *Qual é o detalhe correto?*\n\n_Digite ou envie um áudio._",
      audio: "Tudo bem. Me diga o detalhe correto do caso."
    },
    descricao: {
      stage: STAGES.EDITAR_DESCRICAO,
      texto: "💬 *Qual é a descrição correta do seu caso?*\n\n_Digite ou envie um áudio com a descrição atualizada._",
      audio: "Tudo bem. Me conte a descrição correta do seu caso. Vou juntar com o relato anterior e organizar tudo."
    }
  }

  if (campo === "area") {
    u._correcaoPendenteCampo = null
    u._correcaoPendenteValor = null
    u._correcaoPendenteExtra = null
    return pedirCampoCorrecao(from, u, "A área jurídica é definida pela análise do relato. Se ela parecer errada, corrija a descrição do caso com mais detalhes.")
  }

  const cfg = config[campo]
  if (!cfg) return pedirCampoCorrecao(from, u)
  setStage(u, cfg.stage)
  iniciarTimer(from)
  if (!u.modoTexto) {
    try {
      const ogg = await gerarAudioAtendente(u.atendente, cfg.audio)
      await enviarAudio(from, urlAudioAtendente(ogg))
      await new Promise(r => setTimeout(r, 3000))
    } catch (e) { logErro("tts", "Falha áudio reabrir correcao", e) }
  }
  return responderComTimer(from, { texto: cfg.texto, opcoes: null })
}

async function responderFalhaAudioCorrecao(from, u, textoFallback = "Não consegui ouvir com clareza. Pode enviar outro áudio ou digitar?") {
  if (!u.modoTexto) {
    try {
      const ogg = await gerarAudioAtendente(u.atendente, textoFallback)
      await enviarAudio(from, urlAudioAtendente(ogg))
      await new Promise(r => setTimeout(r, 3000))
    } catch (e) { logErro("tts", "Falha áudio fallback correcao", e) }
  }
  return responderComTimer(from, { texto: textoFallback, opcoes: null })
}

async function prepararConfirmacaoCorrecao(from, u, campo, valor, extra = {}) {
  u._correcaoPendenteCampo = campo
  u._correcaoPendenteValor = valor
  u._correcaoPendenteExtra = extra || null

  if (campo === "nome") {
    setStage(u, STAGES.CONFIRMAR_CORRECAO_NOME)
    iniciarTimer(from)
    // Determinar se é o nome do contato (quem está no WhatsApp) ou da pessoa atendida
    const subcampoNome = u._correcaoPendenteSubcampo || "nome"
    const ehNomeContato = subcampoNome === "nomeContato"
    const textoConfNome = ehNomeContato
      ? `●●○○○○ 👤 Etapa 2 de 6 · *Nome*\n\n✅ Seu nome é *${valor}*.\n\nEstá correto? Se não estiver, é só me dizer o nome certo agora. Pode falar ou digitar. 🎙️`
      : `●●○○○○ 👤 Etapa 2 de 6 · *Nome*\n\n✅ O nome da pessoa atendida é *${valor}*.\n\nEstá correto? Se não estiver, é só me dizer o nome certo agora. Pode falar ou digitar. 🎙️`
    const audioConfNome = ehNomeContato
      ? `${valor}. Esse é o seu nome correto?`
      : `${valor}. Esse é o nome correto da pessoa atendida?`
    if (!u.modoTexto) {
      try {
        const ogg = await gerarAudioAtendente(u.atendente, audioConfNome)
        await enviarAudio(from, urlAudioAtendente(ogg))
        await new Promise(r => setTimeout(r, 3500))
      } catch (e) { logErro("tts", "Falha áudio confirmar correção nome", e) }
    }
    return responderComTimer(from, {
      texto: textoConfNome,
      opcoes: [{ id: "nome_correcao_confirmar", title: "✅ Sim, está certo" }]
    })
  }

  if (campo === "cidade") {
    const cidadeExib = extra?.cidade || valor
    const ufExib = extra?.uf || ""
    const regiaoExib = extra?.regiao || ""
    const textoExib = `${cidadeExib}${ufExib ? `, ${ufExib}` : ""}${regiaoExib ? ` (${regiaoExib})` : ""}`
    const textoAudio = `${cidadeExib}${ufExib ? `, ${estadoPorExtenso(ufExib) || ufExib}` : ""}. Está correto?`
    setStage(u, STAGES.CONFIRMAR_CORRECAO_CIDADE)
    iniciarTimer(from)
    if (!u.modoTexto) {
      try {
        const ogg = await gerarAudioAtendente(u.atendente, textoAudio)
        await enviarAudio(from, urlAudioAtendente(ogg))
        await new Promise(r => setTimeout(r, 3500))
      } catch (e) { logErro("tts", "Falha áudio confirmar correção cidade", e) }
    }
    return responderComTimer(from, {
      texto: `●●●●●○ 📍 Etapa 5 de 6 · *Cidade*\n\n✅ Localizei: *${textoExib}*.\n\nEstá correto? Se não estiver, é só me dizer a cidade certa agora. Pode falar ou digitar. 🎙️`,
      opcoes: [{ id: "cidade_correcao_confirmar", title: "✅ Sim, está certo" }]
    })
  }

  // Demais campos (situacao, detalhe, descricao): aplica direto como antes
  return await aplicarCorrecaoPendente(from, u)
}

async function aplicarCorrecaoPendente(from, u) {
  const campo = u._correcaoPendenteCampo
  const valor = u._correcaoPendenteValor
  const extra = u._correcaoPendenteExtra || {}
  if (!campo) return pedirCampoCorrecao(from, u)

  if (campo === "nome") {
    const subcampoNome = u._correcaoPendenteSubcampo || "nome"
    if (subcampoNome === "nomeContato") {
      u.nomeContato = valor
    } else {
      u.nome = valor
      u.nomeConfirmado = true
    }
  } else if (campo === "cidade") {
    u.cidade = extra.cidade || valor
    u.uf = extra.uf || u.uf
    u.regiao = extra.regiao || u.regiao
  } else if (campo === "situacao") {
    u.situacao = valor
  } else if (campo === "detalhe") {
    u.detalhe = valor
  } else if (campo === "descricao") {
    if (!Array.isArray(u._historicoDescricao)) u._historicoDescricao = []
    if (u.descricao) {
      u._historicoDescricao.push({ texto: u.descricao, ts: new Date().toISOString() })
    }
    u._resumoDescricaoIA = null
    u._resumoDescricaoIABase = null
    u.descricao = extra.descricao || valor
    u._audioCanalTranscricao = u.descricao
    if (extra.area) {
      u.area = extra.area
      u._areaDetectada = extra.area
    }
    if (extra.situacao) u.situacao = extra.situacao
    if (extra.detalhe) u.detalhe = extra.detalhe
    if (extra.urgencia) {
      u.urgencia = extra.urgencia
      u.semReceber = extra.urgencia === "alta"
    }
  }

  const campoAplicado = campo
  limparCorrecaoPendente(u)
  if (campoAplicado === "descricao") {
    const aviso = "Atualizei o resumo do seu caso com base na nova descrição. Também revisei área, situação, detalhe e urgência quando necessário."
    if (!u.modoTexto) {
      try {
        const ogg = await gerarAudioAtendente(u.atendente, aviso)
        await enviarAudio(from, urlAudioAtendente(ogg))
        await new Promise(r => setTimeout(r, 3000))
      } catch (e) { logErro("tts", "Falha áudio aviso descrição consolidada", e) }
    }
    await enviar(from, `✅ ${aviso}`, null, false)
  }
  // Se o relato ainda não foi dado (usuário interrompeu o pré-atendimento para corrigir
  // um dado antes de relatar), sempre volta para pedirRelatoAposNome independentemente
  // de _retornarParaConfirmacao — que só deve valer após o relato existir.
  const relatoAusente = !u.numeroCaso && !u._audioCanalTranscricao && !u.descricao
  if (relatoAusente) {
    return await pedirRelatoAposNome(from, u)
  }
  // Se o cliente ainda não chegou à tela de confirmação, retomar a coleta
  // no próximo campo que falta em vez de exibir uma confirmação incompleta.
  if (!u._retornarParaConfirmacao && !u.numeroCaso) {
    if (!u.whatsappVerificado) return responderComTimer(from, await flowAcolhimentoConfirmaWhatsapp(u, { from }))
    // suprimirAudio quando campo=descricao pois já foi enviado áudio de aviso acima
    if (!u.cidade) return responderComTimer(from, await flowAcolhimentoCidade(u, { from, suprimirAudio: campoAplicado === "descricao" }))
  }
  return await voltarParaConfirmacao(from, u)
}

async function iniciarAgendamento(from, u) {
  await enviar(from, "🔍 Buscando horários disponíveis...", null, false)

  let slots = []
  let temMais = false
  let pagina = 0
  try {
    const resultado = await buscarHorariosDisponiveis(u._paginaSlots || 0)
    slots = resultado.slots
    temMais = resultado.temMais
    pagina = resultado.pagina
  } catch (e) {
    logErro("calendar", "Erro ao buscar horários: " + e.message)
  }

  if (!slots || slots.length === 0) {
    await enviarAudioModoVoz(from, u, "No momento não encontrei horários disponíveis. Você pode deixar uma mensagem urgente para nossa equipe ou voltar ao menu do cliente.", "sem horários")
    return {
      texto: `😔 Não encontrei horários disponíveis no momento.\n\nVocê pode deixar uma mensagem urgente para nossa equipe ou voltar ao menu do cliente.`,
      opcoes: [
        { id: "adv_urg", title: "⚠️ Mensagem urgente" },
      { id: "m_inicio", title: "🏠 Menu do cliente" }
      ]
    }
  }

  // Salva slots no estado do usuário
  u._slotsDisponiveis = slots.map(s => s.toISOString())
  u._paginaSlots = pagina

  // Monta opções (máximo 8 para não ultrapassar limite da lista)
  const opcoes = slots.slice(0, 8).map((slot, i) => ({
    id: `slot_${i}`,
    title: formatarSlot(slot)
  }))

  if (pagina > 0) {
    opcoes.unshift({ id: "slots_pagina_anterior", title: "⬅️ Horários anteriores" })
  }

  if (temMais) {
    opcoes.push({ id: "slots_proxima_pagina", title: "➡️ Ver mais horários" })
  }
  opcoes.push({ id: "m_inicio", title: "🏠 Menu do cliente" })

  await enviarAudioModoVoz(from, u, "Vou mostrar os horários disponíveis para você. Toque em uma das opções para escolher o melhor horário.", "horários")

  setStage(u, STAGES.AGENDAMENTO_HORARIO)
  iniciarTimer(from)

  return await enviarTelaImagemOuTexto(
    from,
    IMAGEM_ADV_HORARIOS_URL,
    `📅 *Horários disponíveis:*\n\nEscolha o melhor para você:`,
    opcoes,
    "📅 *Toque no melhor horário para você.*"
  )
}

function textoAudioOpcoes(opcoes = [], prefixo = "") {
  const lista = Array.isArray(opcoes) ? opcoes.filter(o => sanitizarTextoEntrada(o?.title)) : []
  if (!lista.length) return ""
  const ordinais = ["Primeira", "Segunda", "Terceira", "Quarta", "Quinta", "Sexta", "Setima", "Oitava", "Nona", "Decima"]
  const corpo = lista.map((opcao, idx) => {
    const ordinal = ordinais[idx] || `${idx + 1}a`
    return `${ordinal} opcao: ${removerFormatacaoParaAudio(opcao.title).replace(/[.!?;:]+$/g, "")}`
  }).join(". ")
  return `${prefixo ? `${prefixo}: ` : ""}${corpo}.`
}

function telaAdvogadoCliente() {
  return {
    texto: "👨‍⚖️ *Falar com advogado*\n\nVocê pode agendar uma ligação ou deixar uma mensagem urgente para nossa equipe.",
    opcoes: [
      { id: "adv_agendar_ligacao", title: "📅 Agendar ligação" },
        { id: "adv_urg", title: "⚠️ Mensagem urgente" },
      { id: "m_inicio", title: "🏠 Menu do cliente" }
    ]
  }
}

// Enquanto a preferência de canal ainda não foi definida (ACOLHIMENTO e
// ACOLHIMENTO_MODO), o sistema deve sempre enviar áudio + texto, independente
// de u.modoTexto — a preferência só é respeitada após a escolha em ACOLHIMENTO_MODO.
function deveForcarAudioPreModo(u) {
  return u?.stage === STAGES.ACOLHIMENTO || u?.stage === STAGES.ACOLHIMENTO_MODO
}

async function enviarAudioModoVoz(from, u, texto, contexto = "cliente") {
  if (!from || !u?.atendente) return
  if (u?.modoTexto !== false && !deveForcarAudioPreModo(u)) return
  try {
    const ogg = await gerarAudioAtendente(u.atendente, texto)
    await enviarAudio(from, urlAudioAtendente(ogg))
    ultimosAudiosEnviados.set(String(from), Date.now())
    await new Promise(r => setTimeout(r, 2500))
  } catch (e) { logErro("tts", `Falha áudio ${contexto}`, e) }
}

function removerFormatacaoParaAudio(texto = "") {
  return sanitizarTextoEntrada(texto)
    .replace(/\bCNIS\b/gi, "extrato de contribuições do Meu INSS")
    .replace(/```/g, " ")
    .replace(/[*_~`]/g, "")
    .replace(/[•·]/g, ". ")
    .replace(/[━─]+/g, ". ")
    .replace(/[●○]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function textoAudioAutomatico(payload = {}) {
  const textoBase = removerFormatacaoParaAudio(payload?.texto || "")
  const opcoes = Array.isArray(payload?.opcoes) ? payload.opcoes.slice(0, 4) : []
  const textoOpcoes = opcoes.length ? ` ${textoAudioOpcoes(opcoes, "Opcoes na tela")}` : ""
  const combinado = `${textoBase}${textoOpcoes}`.trim()
  if (combinado.length <= 850) return combinado
  return combinado.slice(0, 847).replace(/\s+\S*$/, "") + "..."
}

function textoTemMarcadorVisual(texto = "") {
  const t = sanitizarTextoEntrada(texto)
  if (!t) return true
  if (/^[●○◯⚪✅❌⚠⏳⌛📌📍📎📩📄📊📱📋📅📆📁📂📞📲💬💡💰🏥🏛⚖🔎🔍🔢🎉🎙👀👂👤👋🏠➕✍✏🕒]/u.test(t)) return true
  return /^\p{Extended_Pictographic}/u.test(t)
}

function aplicarEmojiTelaCliente(from, payload = {}) {
  if (!payload?.texto || ehContatoAdmin(from)) return payload
  if (payload.semEmoji === true || textoTemMarcadorVisual(payload.texto)) return payload
  return { ...payload, texto: `💬 ${payload.texto}` }
}

function ehContatoAdmin(from) {
  const a = normalizarNumeroWhatsAppEnvio(from)
  const b = normalizarNumeroWhatsAppEnvio(WHATSAPP_ADMIN)
  return Boolean(a && b && a === b)
}

async function enviarAudioAutomaticoTela(from, u, payload, contexto = "tela") {
  if (!from || !u || !u.atendente || ehContatoAdmin(from)) return
  const forcarPreModo = deveForcarAudioPreModo(u)
  if (u.modoTexto !== false && !forcarPreModo) return
  if (!payload?.texto) return
  if (payload.audio === false || payload.semAudio === true) return
  const agora = Date.now()
  const ultimoAudio = Number(ultimosAudiosEnviados.get(String(from)) || 0)
  if (ultimoAudio && agora - ultimoAudio < 12000) return
  const textoAudio = textoAudioAutomatico(payload)
  if (!textoAudio) return
  await enviarAudioModoVoz(from, u, textoAudio, `auto ${contexto}`)
}

async function responderTelaComAudio(from, u, payload, textoAudio, contexto = "cliente") {
  await enviarAudioModoVoz(from, u, textoAudio, contexto)
  return responderComTimer(from, payload)
}

function saudacaoPorHorarioCliente(data = new Date()) {
  const hora = Number(new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    hour12: false
  }).format(data))
  if (hora >= 5 && hora < 12) return "Bom dia"
  if (hora >= 12 && hora < 18) return "Boa tarde"
  if (hora >= 18 && hora < 24) return "Boa noite"
  return "Boa madrugada"
}

configurarClientMenuUi({
  formatarSituacaoJuridica,
  serializarEstado,
  desserializarEstado,
  restaurarTipoCasoHubSpot,
  getNumeroCasoOficialDoNegocio,
  podeMostrarMenuCliente,
  respostaRecomecoMenuPrincipal,
  saudacaoPorHorarioCliente,
  textoAudioOpcoes
})

// Detecta gênero pelo nome via IA e retorna saudação adequada
async function saudacaoGenero(nome) {
  try {
    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 10,
        messages: [{
          role: "user",
          content: `Responda SOMENTE com a letra M (masculino) ou F (feminino) com base no primeiro nome: "${nome}". Sem nenhum outro texto.`
        }]
      })
    })
    const data = await resp.json()
    const letra = (data?.content?.[0]?.text || "").trim().toUpperCase()
    if (letra === "F") return "Seja bem-vinda"
    return "Seja bem-vindo"
  } catch (e) {
    return "Seja bem-vindo"
  }
}

async function menuClienteComAudio(from, u) {
  const primeiroNome = primeiroNomeCliente(u) || "cliente"
  const primeiraApresentacao = !u._menuClienteJaApresentado
  const saudacao = saudacaoPorHorarioCliente()
  const negocios = u.contatoId ? await hsListarNegociosAtivosDoContato(u.contatoId) : []
  const casosCliente = montarCasosMenuCliente(u, negocios)
  const temPainel = casosCliente.length > 1 && u._mostrarPainelCasosCliente
  const temVariosCasos = casosCliente.length > 1
  const casoSelecionadoAudio = u._casoSelecionadoAudio
  const boasVindas = !temPainel && deveMostrarBoasVindasMenuCliente(u)
  const resumoCasosAudio = temVariosCasos
    ? `Você tem ${casosCliente.length} atendimentos: ${textoAudioResumoCasosCliente(casosCliente)}.`
    : `Seu atendimento atual é sobre ${formatarSituacaoJuridica(u.situacao, u.tipo, u.subTipo) || u.area || "seu caso"}.`
  u._menuClienteBoasVindas = boasVindas
  u._casoSelecionadoAudio = null
  const tela = menuCliente(u, casosCliente)
  const opcoesAudioMenu = textoAudioOpcoesMenuCliente(tela.opcoes)
  const textoAudioMenu = temPainel
    ? `${textoAudioSelecaoCaso(u._acaoPendente)} ${textoAudioCasosCliente(casosCliente)}`
    : casoSelecionadoAudio
    ? `Você selecionou o caso de ${casoSelecionadoAudio.area || "Atendimento"}, número ${casoSelecionadoAudio.numeroCaso}. ${opcoesAudioMenu}`
    : boasVindas
    ? `${saudacao}, ${primeiroNome}! ${await saudacaoGenero(u.nome || primeiroNome)} de volta à Oráculum. ${resumoCasosAudio} ${opcoesAudioMenu}`
    : `${saudacao}, ${primeiroNome}! ${resumoCasosAudio} ${opcoesAudioMenu}`

  if (temPainel) {
    await enviarAudioModoVoz(from, u, textoAudioMenu, "menu cliente")
  }

  let menuEnviado = false
  if (temPainel && IMAGEM_SELECAO_CASO_URL) {
    const imagemEnviada = await enviarImagemWhatsApp(from, IMAGEM_SELECAO_CASO_URL, tela.texto, null)
    if (imagemEnviada) {
      menuEnviado = true
      await new Promise(r => setTimeout(r, 1000))
    }
  } else if (!temPainel && IMAGEM_MENU_CLIENTE_URL) {
    const imagemEnviada = await enviarImagemWhatsApp(from, IMAGEM_MENU_CLIENTE_URL, tela.texto, null)
    if (imagemEnviada) {
      menuEnviado = true
      await new Promise(r => setTimeout(r, 1000))
    }
  }
  if (!menuEnviado) {
    await enviar(from, tela.texto, null, false)
    await new Promise(r => setTimeout(r, 500))
  }
  registrarUltimaPergunta(u, tela)
  if (!temPainel) {
    await enviarAudioModoVoz(from, u, textoAudioMenu, "menu cliente")
    await new Promise(r => setTimeout(r, 5000))
  }
  if (Array.isArray(tela.opcoes) && tela.opcoes.length) {
    const chamadaOpcoes = temPainel
      ? "📂 *Toque no caso sobre o qual deseja continuar.*"
      : "👇 *Escolha uma opção abaixo para continuar com seu atendimento.*"
    await enviar(from, chamadaOpcoes, tela.opcoes, false)
    await new Promise(r => setTimeout(r, 500))
  }
  if (!temPainel) u._ultimoMenuClienteAt = Date.now()
  u._menuClienteBoasVindas = false
  u._menuClienteJaApresentado = true
  return null
}

async function abrirSelecaoCasoParaAcao(from, u, acao) {
  // se o cliente veio direto da tela de confirmação do caso recém-aberto,
  // não exibir seleção — o contexto é óbvio: a ação é para o caso atual
  if (u._casoRecemAberto) {
    u._casoRecemAberto = false
    return false
  }
  if (u._menuClienteCasoAtivo && u.negocioId) return false
  const negocios = u.contatoId ? await hsListarNegociosAtivosDoContato(u.contatoId) : []
  const casosCliente = montarCasosMenuCliente(u, negocios)
  if (casosCliente.length <= 1) return false
  u._casosMenuCliente = casosCliente
  u._acaoPendente = acao
  u._mostrarPainelCasosCliente = true
  u._menuClienteCasoAtivo = false
  iniciarTimer(from)
  return await menuClienteComAudio(from, u)
}

async function executarAcaoPendenteCliente(from, u) {
  const acao = u._acaoPendente || null
  u._acaoPendente = null
  u._mostrarPainelCasosCliente = false
  u._docsClienteGuiado = false

  if (acao === "status") return await telaStatusCliente(from, u)
  if (acao === "documentos") return await executarIntencaoCliente(from, u, "documentos", "m_docs")
  if (acao === "advogado") return await telaAdvogadoClienteComAudio(from, u)
  return await menuClienteComAudio(from, u)
}

async function telaAdvogadoClienteComAudio(from, u) {
  const tela = telaAdvogadoCliente()
  await enviarAudioModoVoz(
    from,
    u,
    `Você pode agendar uma ligação com um advogado ou deixar uma mensagem urgente para nossa equipe. ${textoAudioOpcoes(tela.opcoes)}`,
    "menu advogado cliente"
  )
  return await enviarTelaImagemOuTexto(from, IMAGEM_ADV_URL, tela.texto, tela.opcoes)
}

async function telaStatusCliente(from, u) {
  let stageAtualHS = u.negocioStageId || null
  let negocioAtual = null
  if (u.negocioId) {
    try {
      const res = await axios.get(
        `https://api.hubapi.com/crm/v3/objects/deals/${u.negocioId}?properties=dealstage,createdate`,
        { headers: { Authorization: `Bearer ${HUBSPOT_TOKEN}` } }
      )
      stageAtualHS = res.data?.properties?.dealstage || stageAtualHS
      negocioAtual = res.data || null
      u.negocioStageId = stageAtualHS
    } catch (e) { logErro("hubspot", "Falha consulta stage status", e) }
  }

  // Buscar data da consulta no Google Calendar se houver evento agendado
  let consultaDataHora = null
  let consultaPassou = false
  if (u._eventoCalendarId) {
    try {
      const cal = getCalendar()
      const ev = await cal.events.get({ calendarId: CALENDAR_ID, eventId: u._eventoCalendarId })
      if (ev.data?.status === "cancelled") {
        logDebug(`[CALENDAR] Evento ${u._eventoCalendarId} cancelado - agendamento removido da memoria`)
        const liberacao = await liberarAgendamentoERecalcularStage(u, "evento_cancelado_calendar")
        if (liberacao.novoStage) stageAtualHS = liberacao.novoStage
      } else {
        const dtInicio = ev.data?.start?.dateTime || ev.data?.start?.date || null
        if (dtInicio) {
          consultaDataHora = new Date(dtInicio)
          consultaPassou = consultaDataHora < new Date()
        }
      }
    } catch (e) {
      logDebug('[CALENDAR-ERR] code=' + e?.code + ' status=' + e?.status + ' res=' + e?.response?.status + ' msg=' + String(e?.message).slice(0,80))
      if (e?.code === 404 || e?.response?.status === 404 || e?.status === 404) {
        logDebug(`[CALENDAR] Evento ${u._eventoCalendarId} não encontrado — agendamento removido da memória`)
        const liberacao = await liberarAgendamentoERecalcularStage(u, "evento_nao_encontrado_calendar")
        if (liberacao.novoStage) stageAtualHS = liberacao.novoStage
      } else {
        logErro("calendar", "Falha ao buscar evento para status: " + e.message)
      }
    }
  }
  // Agendamento ativo = evento existe E data ainda não passou
  const temAgendamentoAtivo = Boolean(u._eventoCalendarId) && !consultaPassou

  // Documentos
  const statusDocs = calcularStatusDocumentos(u)
  const temFaltantesCriticos = statusDocs.faltantesCriticos.length > 0
  const todosDocsEnviados = !temFaltantesCriticos

  const barra = montarBarraStatusCliente({
    stageAtualHS,
    todosDocsEnviados,
    temFaltantesCriticos,
    temAgendamentoAtivo,
    temEventoCalendar: Boolean(u._eventoCalendarId),
    consultaPassou
  })

  // Tipo do caso
  const tipoCasoFormatado = formatarSituacaoJuridica(u.situacao, u.tipo, u.subTipo)

  // Bloco de agendamento — só aparece se data não passou
  const blocoAgendamento = montarBlocoAgendamentoStatus(temAgendamentoAtivo, consultaDataHora)

  // Bloco de documentos — sempre aparece
  const blocoDocumentos = montarBlocoDocumentosStatus(statusDocs, temFaltantesCriticos)

  const iconeArea = iconeAreaJuridica(u.area || "")

  const textoStatus = montarTextoStatusCliente({
    numeroCaso: u.numeroCaso,
    iconeArea,
    area: u.area,
    tipoCasoFormatado,
    barra,
    blocoAgendamento,
    blocoDocumentos
  })

  // Áudio — narra o estado completo para quem não lê
  const nomesDocStatus = statusDocs.faltantesCriticos.map(d => d.label)
  const listaAudioStatus = temFaltantesCriticos
    ? (nomesDocStatus.length === 1
      ? nomesDocStatus[0]
      : nomesDocStatus.slice(0, -1).join(", ") + " e " + nomesDocStatus[nomesDocStatus.length - 1])
    : ""
  const acaoAudio = montarAudioStatusCliente({
    stageAtualHS,
    temAgendamentoAtivo,
    consultaDataHoraAudio: temAgendamentoAtivo && consultaDataHora ? formatarSlotAudio(consultaDataHora) : "",
    documentosFaltantesQtd: temFaltantesCriticos ? nomesDocStatus.length : 0,
    documentosFaltantesAudio: removerFormatacaoParaAudio(listaAudioStatus)
  })

  await enviarAudioModoVoz(from, u, acaoAudio, "status cliente")

  return await enviarTelaImagemOuTexto(
    from,
    IMAGEM_STATUS_URL,
    textoStatus,
    opcoesStatusCliente(stageAtualHS, temFaltantesCriticos, temAgendamentoAtivo)
  )
}

async function telaConfirmarCancelamentoConsultaCliente(from, u) {
  let estado = null
  try {
    estado = await obterConsultaAtivaCliente(u)
  } catch (e) {
    logErro("calendar", "Falha ao verificar consulta para cancelamento: " + e.message, e)
  }

  if (!estado?.inicio) {
    await enviarAudioModoVoz(
      from,
      u,
      "Não encontrei uma consulta futura ativa para cancelar. Vou mostrar o status atualizado do seu caso.",
      "cancelamento consulta sem agenda"
    )
    return await telaStatusCliente(from, u)
  }

  const dataConsulta = new Date(estado.inicio)
  const dataHora = formatarSlot(dataConsulta)
  const dataHoraAudio = formatarSlotAudio(dataConsulta)
  u._cancelamentoConsultaPendente = {
    eventId: u._eventoCalendarId,
    inicio: estado.inicio,
    ts: Date.now()
  }
  iniciarTimer(from)

  await enviarAudioModoVoz(
    from,
    u,
    `Você quer cancelar sua consulta de ${dataHoraAudio}? Se confirmar, o horário será removido da agenda e nossa equipe será avisada.`,
    "confirmar cancelamento consulta"
  )

  return {
    texto: `❌ *Cancelar consulta*\n\nVocê quer cancelar sua consulta de *${dataHora}*?\n\n_Se confirmar, o horário será removido da agenda e nossa equipe será avisada._`,
    opcoes: [
      { id: "cliente_cancelar_consulta_sim", title: "✅ Sim, cancelar" },
      { id: "m_status", title: "⬅️ Voltar" }
    ]
  }
}

async function cancelarConsultaCliente(from, u) {
  const pendente = u._cancelamentoConsultaPendente || {}
  let estado = null
  try {
    estado = await obterConsultaAtivaCliente(u)
  } catch (e) {
    logErro("calendar", "Falha ao revalidar consulta para cancelamento: " + e.message, e)
  }

  const eventoAtual = sanitizarTextoEntrada(u._eventoCalendarId)
  const eventoPendente = sanitizarTextoEntrada(pendente.eventId)
  if (!estado?.inicio || (eventoPendente && eventoAtual && eventoPendente !== eventoAtual)) {
    u._cancelamentoConsultaPendente = null
    await enviarAudioModoVoz(
      from,
      u,
      "A consulta mudou ou não está mais ativa. Vou mostrar o status atualizado do seu caso.",
      "cancelamento consulta revalidacao"
    )
    return await telaStatusCliente(from, u)
  }

  const dataConsulta = new Date(estado.inicio)
  const dataHora = formatarSlot(dataConsulta)
  const dataHoraAudio = formatarSlotAudio(dataConsulta)
  try {
    const resultado = await cancelarEventoConsultaUsuario(u, "cancelado_cliente_whatsapp", eventoAtual)
    u._cancelamentoConsultaPendente = null

    if (u.contatoId) {
      await hsCriarNota(
        u.contatoId,
        "CONSULTA CANCELADA PELO CLIENTE NO WHATSAPP",
        `Consulta cancelada pelo cliente no WhatsApp.\nCaso: ${u.numeroCaso || "-"}\nData: ${dataHora}\nEvento: ${eventoAtual || "-"}`
      )
    }

    await enviarWhatsAppAdmin(montarNotificacaoCancelamentoClienteAdmin({
      from,
      u,
      dataHora,
      eventoId: eventoAtual,
      resultado
    }))

    iniciarTimer(from)
    await enviarAudioModoVoz(
      from,
      u,
      `Pronto. Sua consulta de ${dataHoraAudio} foi cancelada. Quando quiser marcar outro horário, toque em agendar consulta ou volte ao menu do cliente.`,
      "consulta cancelada cliente"
    )

    return {
      texto: [
        "✅ *Consulta cancelada*",
        "",
        `Sua consulta de *${dataHora}* foi cancelada.`,
        "",
        "Quando quiser marcar outro horário, toque em *Agendar consulta*."
      ].join("\n"),
      opcoes: [
        { id: "adv_agendar_ligacao", title: "📅 Agendar consulta" },
        { id: "m_status", title: "📊 Ver status" },
        { id: "m_inicio", title: "🏠 Menu do cliente" }
      ],
      registrarPergunta: false,
      _resultadoCancelamento: resultado
    }
  } catch (e) {
    logErro("calendar", "Falha ao cancelar consulta pelo cliente: " + e.message, e)
    await enviarAudioModoVoz(
      from,
      u,
      "Não consegui cancelar a consulta agora. Nossa equipe pode ajudar você pelo WhatsApp.",
      "erro cancelamento consulta cliente"
    )
    return {
      texto: "⚠️ *Não consegui cancelar a consulta agora.*\n\nTente novamente em instantes ou fale com nossa equipe.",
      opcoes: [
        { id: "cliente_cancelar_consulta_sim", title: "🔄 Tentar de novo" },
        { id: "m_adv", title: "👨‍⚖️ Falar equipe" },
        { id: "m_status", title: "⬅️ Voltar" }
      ],
      registrarPergunta: false
    }
  }
}

function detectarIntencaoCliente(texto = "") {
  const t = normalizarTextoGatilho(texto)
  if (!t) return null
  if (/^(oi|ola|olá|menu|inicio|início|bom dia|boa tarde|boa noite)$/.test(t)) return "menu"
  if (/\b(cancel|desmarc|desmarca|desist|nao quero|não quero)\b/.test(t) && /\b(consulta|agendamento|agenda|ligacao|ligação|horario|horário)\b/.test(t)) return "cancelar_consulta"
  if (/\b(cancel|desist|nao quero mais|não quero mais|nao preciso mais|não preciso mais|encerrar caso|fechar caso)\b/.test(t)) return "cancelar"
  if (/\b(obrigad|valeu|tchau|ate logo|ate mais|até logo|até mais|por hoje|encerrar|finalizar|fechar)\b/.test(t)) return "despedida"
  if (/\b(urgente|urgencia|urgência|prazo|intimad|amanha|amanhã|hoje|liminar|audiencia|audiência)\b/.test(t)) return "urgente"
  if (/\b(agend|marcar|ligacao|ligação|consulta|horario|horário)\b/.test(t)) return "agendar"
  if (/\b(advogad|falar com|especialista|atendente|humano)\b/.test(t)) return "advogado"
  if (/\b(document|doc|foto|pdf|anex|enviar arquivo|mandar arquivo)\b/.test(t)) return "documentos"
  if (/\b(status|andamento|meu caso|processo|situacao do caso|situação do caso)\b/.test(t)) return "status"
  if (/\b(novo caso|outro caso|abrir caso|nova situacao|nova situação|situacao nova|situação nova|outro problema|outro atendimento|abrir outro atendimento)\b/.test(t)) return "novo_caso"
  return null
}


function pareceDuvidaCasoAtualOuNovo(texto = "") {
  const t = normalizarTextoGatilho(texto)
  if (!t) return false
  const falaCasoAtual = /\b(caso atual|processo atual|meu processo|meu caso|nesse processo|neste processo)\b/.test(t)
  const falaNovo = /\b(novo|nova|outro|outra|abrir|atendimento|situacao nova|situação nova|preciso abrir)\b/.test(t)
  const perguntaEncaixe = /\b(entra|encaixa|serve|faz parte|preciso|devo)\b/.test(t)
  return falaCasoAtual && falaNovo && perguntaEncaixe
}

function pareceNovaSituacaoCliente(texto = "") {
  const t = normalizarTextoGatilho(texto)
  if (t.length < 160) return false
  return /\b(inss|aposent|beneficio|benefício|trabalho|demiss|acidente|familia|família|divorcio|divórcio|pensao|pensão|consumidor|compra|cobranca|cobrança|vizinho|imovel|imóvel|contrato|processo)\b/.test(t)
}

function telaAudioClienteCasoAtualOuNovo(transcricao) {
  const preview = sanitizarTextoEntrada(transcricao).slice(0, 360)
  return {
    texto: `🎙️ *Recebi seu áudio.*\n\nParece que você contou uma situação com detalhes:\n\n"${preview}${transcricao.length > 360 ? "..." : ""}"\n\nEssa mensagem é sobre o caso atual ou você quer abrir um novo caso?`,
    opcoes: [
      { id: "audio_cliente_caso_atual", title: "📄 Caso atual" },
      { id: "audio_cliente_novo_caso", title: "➕ Novo caso" },
      { id: "m_inicio", title: "🏠 Menu do cliente" }
    ]
  }
}

function telaClienteCasoAtualOuNovo(mensagem, origem = "mensagem") {
  const preview = sanitizarTextoEntrada(mensagem).slice(0, 360)
  const titulo = origem === "audio" ? "🎙️ *Recebi seu áudio.*" : "💬 *Entendi sua dúvida.*"
  return {
    texto: `${titulo}\n\nParece que você quer saber se esta situação entra no caso atual ou se precisa abrir outro atendimento:\n\n"${preview}${mensagem.length > 360 ? "..." : ""}"\n\nEssa mensagem é sobre o caso atual ou você quer abrir um novo caso?`,
    opcoes: [
      { id: "audio_cliente_caso_atual", title: "📄 Caso atual" },
      { id: "audio_cliente_novo_caso", title: "➕ Novo caso" },
      { id: "m_inicio", title: "🏠 Menu do cliente" }
    ]
  }
}

async function confirmarAberturaNovoCasoCliente(from, u) {
  const textoNovoCaso = `➕ *Abrir novo caso*\n\nVocê quer iniciar um novo atendimento separado do caso atual?\n\nSeu caso atual continuará registrado, mas esta conversa passará a coletar uma nova situação.`
  const opcoesNovoCaso = [
    { id: "novo_caso_confirmar", title: "✅ Sim, abrir" },
      { id: "m_inicio", title: "🏠 Menu do cliente" }
  ]
  await enviarAudioModoVoz(
    from,
    u,
    `Você quer iniciar um novo atendimento separado do caso atual? Seu caso atual continuará registrado, mas esta conversa passará a coletar uma nova situação. ${textoAudioOpcoes(opcoesNovoCaso)}`,
    "confirmar novo caso cliente"
  )
  if (IMAGEM_NOVO_CASO_URL) {
    const enviada = await enviarImagemWhatsApp(from, IMAGEM_NOVO_CASO_URL, textoNovoCaso, opcoesNovoCaso)
    if (enviada) return { texto: null, opcoes: null }
  }
  return { texto: textoNovoCaso, opcoes: opcoesNovoCaso }
}

async function abrirNovoCasoCliente(from, u) {
  const nomeExibicao = u.nome
  const cidadeExibicao = u.cidade
  const ufExibicao = u.uf
  const regiaoExibicao = u.regiao
  if (!u._casoAnteriorCliente) u._casoAnteriorCliente = criarSnapshotCasoCliente(u)
  limparDadosCasoAtual(u)
  u._novoCasoDeCliente = true
  u.atendimentoParaTerceiro = false
  u.nomeContato = null
  u.relacaoComAtendido = null
  u.papelContato = null
  u.nome = nomeExibicao
  u.nomeConfirmado = Boolean(nomeExibicao)
  u._cidadeClienteAnterior = cidadeExibicao || null
  u._ufClienteAnterior = ufExibicao || null
  u._regiaoClienteAnterior = regiaoExibicao || null
  setStage(u, STAGES.NOVO_CASO_CONFIRMA)
  iniciarTimer(from)
  const opcoesNovoCasoCliente = [
    { id: "nc_meu", title: "✅ É para mim" },
    { id: "nc_outro", title: "👤 É para outra pessoa" },
    { id: "m_inicio", title: "🏠 Menu do cliente" }
  ]
  await enviarAudioModoVoz(
    from,
    u,
    `Vamos abrir um novo caso. O caso atual continua registrado. ${textoAudioOpcoes(opcoesNovoCasoCliente)}`,
    "novo caso cliente"
  )
  return {
    texto: `➕ *Abrir novo caso*\n\nEscolha como deseja abrir este novo atendimento:\n\n✅ *É meu número*\nO novo caso será aberto em seu nome, usando seus dados cadastrados.\n\n👤 *É de outra pessoa*\nVamos abrir um atendimento separado para outra pessoa. Primeiro você contará a situação, depois informará os dados dela. A continuidade será pelo WhatsApp dessa pessoa.\n\n🏠 *Menu do cliente*\nCancela esta abertura e volta ao seu menu, sem alterar seu caso atual.\n\n*Dados que temos de você:*\n👤 *${nomeExibicao || "Nome não informado"}*\n📍 ${cidadeExibicao || "Cidade não informada"}${ufExibicao ? " - " + ufExibicao : ""}`,
    opcoes: opcoesNovoCasoCliente
  }
}

async function iniciarMensagemUrgenteCliente(from, u) {
  const conforto = await gerarConfortoUrgenteCliente(u)
  await enviarAudioModoVoz(
    from,
    u,
    `${conforto} Pode deixar sua mensagem urgente agora. Você pode digitar ou enviar um áudio. Nossa equipe será notificada.`,
    "mensagem urgente cliente"
  )
  setStage(u, STAGES.AGUARDANDO_URGENTE)
  iniciarTimer(from)
  return await enviarTelaImagemOuTexto(
    from,
    IMAGEM_ADV_URGENTE_URL,
    `📩 *Mensagem urgente*\n\n${conforto}\n\nDigite sua mensagem ou envie um áudio agora.\n\nTudo será registrado imediatamente e nossa equipe será notificada. ⚡\n\n📄 Caso: *${u.numeroCaso}*\n\n⏱️ _Prazo de retorno: até 4 horas em dias úteis._`,
    null
  )
}

async function gerarConfortoUrgenteCliente(u) {
  const fallback = "Sinto muito que isso esteja preocupando você. Vou registrar com cuidado."
  if (!GROQ_KEY) return fallback
  try {
    const prompt = `Escreva UMA frase curta de acolhimento para cliente jurídico preocupado.
Área: ${u.area || "não informada"}.
Situação: ${u.situacao || u.detalhe || "não informada"}.
Regras: máximo 16 palavras, sem promessa de resultado, sem urgência artificial, linguagem simples, texto puro.`
    const res = await axios.post(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        model: "llama-3.1-8b-instant",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 60,
        temperature: 0.6
      },
      { headers: { Authorization: `Bearer ${GROQ_KEY}`, "Content-Type": "application/json" } }
    )
    const frase = sanitizarTextoEntrada(res.data?.choices?.[0]?.message?.content || "")
      .replace(/^["'“”]+|["'“”]+$/g, "")
      .split("\n")
      .map(l => l.trim())
      .filter(Boolean)[0]
    return frase && frase.length <= 140 ? frase : fallback
  } catch (e) {
    logErro("groq", "gerarConfortoUrgenteCliente: " + e.message)
    return fallback
  }
}

async function respostaUrgenteRegistradaComAudio(from, u, contexto = "mensagem urgente registrada") {
  const agora = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" })
  await enviarAudioModoVoz(
    from,
    u,
    "Sua mensagem urgente foi registrada. Nossa equipe será notificada e retornará em até 4 horas em dias úteis. Você pode agendar uma ligação ou voltar ao menu do cliente.",
    contexto
  )
  return responderComTimer(from, await enviarTelaImagemOuTexto(
    from,
    IMAGEM_ADV_URGENTE_REGISTRADA_URL,
    `✅ *Mensagem registrada com urgência!*\n\n🕐 Registrada às: *${agora}*\n⏱️ Prazo de retorno: *até 4 horas* em dias úteis.\n\nNossa equipe foi notificada. ⚡\n\n📄 Caso: *${u.numeroCaso}*`,
    [
      { id: "adv_agendar_ligacao", title: "📅 Agendar ligação" },
      { id: "m_inicio", title: "🏠 Menu do cliente" }
    ]
  ))
}

async function aproveitarRelatoAudioClienteNovoCaso(from, u) {
  const relatoPendente = sanitizarTextoEntrada(u._audioClientePendenteTexto || "")
  if (!relatoPendente) return null

  u._audioClientePendenteTexto = null
  u._audioClientePendenteArquivo = null
  u._audioCanalTranscricao = normalizarTextoCRM(relatoPendente)
  if (!Array.isArray(u.historiaIA)) u.historiaIA = []
  u.historiaIA.push({ role: "user", content: relatoPendente })

  await enviar(from, "📖 Vou aproveitar o relato que você já enviou para iniciar este novo caso.")

  const classificacao = await classificarAreaAudio(u._audioCanalTranscricao)
  aplicarClassificacaoJuridica(u, classificacao)
  iniciarTimer(from)
  return await flowAssessoriaInicial(u, { from, origem: "audio_cliente_novo_caso" })
}

async function proximaEtapaNovoCasoClienteAposModo(from, u) {
  if (!u._novoCasoDeCliente) return null
  if (u._novoCasoParaTerceiro) {
    if (!u.nomeConfirmado || !u.nome) {
      setStage(u, "coleta_tel_outro")
      iniciarTimer(from)
      if (!u.modoTexto) {
        await enviarAudioModoVoz(from, u, "Agora preciso do nome completo da pessoa que será atendida. Pode falar em áudio ou digitar.", "novo caso terceiro nome")
      }
      return {
        texto: "●●○○○○ 👤 Etapa 2 de 6 · *Nome*\n\nQual é o nome completo da pessoa que será atendida?",
        opcoes: null
      }
    }
    if (!u.whatsappContato || !u.whatsappVerificado) {
      setStage(u, "coleta_tel_wpp")
      iniciarTimer(from)
      if (!u.modoTexto) {
        await enviarAudioModoVoz(from, u, `Agora preciso do WhatsApp com DDD de ${primeiroNomeCliente(u) || "essa pessoa"}.`, "novo caso terceiro whatsapp")
      }
      return {
        texto: `●●●●○○ 📱 Etapa 4 de 6 · *WhatsApp*\n\nQual é o WhatsApp com DDD de *${primeiroNomeCliente(u) || "essa pessoa"}* para contato da equipe?`,
        opcoes: null
      }
    }
    return await flowAcolhimentoCidade(u, { from })
  }
  if (u.nomeConfirmado && u.nome && u.whatsappVerificado && (u.cidade || u.uf || u.regiao)) {
    setStage(u, STAGES.AUDIO_CONFIRMAR_DADOS)
    iniciarTimer(from)
    return await telaConfirmarDadosAudio(from, u)
  }
  if (!u.nomeConfirmado || !u.nome) {
    setStage(u, STAGES.ACOLHIMENTO_NOME)
    iniciarTimer(from)
    if (!u.modoTexto) {
      await enviarAudioModoVoz(from, u, "Preciso confirmar o nome da pessoa deste novo caso. Qual é o nome completo?", "novo caso nome")
    }
    return {
      texto: "●●○○○○ 👤 Etapa 2 de 6 · *Nome*\n\nQual é o nome completo da pessoa deste novo caso?",
      opcoes: null
    }
  }
  if (!u.whatsappVerificado) {
    return await flowAcolhimentoConfirmaWhatsapp(u, { from })
  }
  return await flowAcolhimentoCidade(u, { from })
}

async function executarIntencaoCliente(from, u, intencao, textoOriginal = "") {
  if (!intencao) return null
  if (intencao !== "documentos") u._docsClienteGuiado = false
  if (intencao === "menu") return await menuClienteComAudio(from, u)
  if (intencao === "status") return await telaStatusCliente(from, u)
  if (intencao === "documentos") {
    garantirListasDocumentos(u)
    const pendentes = getDocsPendentes(u)
    const faltantes = getDocsFaltantesReenviaveis(u)
    if (pendentes.length === 0 && faltantes.length === 0 && u.documentosEnviados) {
      await enviarAudioModoVoz(
        from,
        u,
        "Seus documentos já estão completos. Deseja enviar algo adicional, como uma foto mais nítida ou um complemento?",
        "documentos já completos"
      )
      iniciarTimer(from)
      const telaDocsCompletos = {
        texto: "📎 *Envio de documentos*\n\nSeus documentos já estão completos. Deseja enviar algo adicional, como uma foto mais nítida ou um complemento?",
        opcoes: [
          { id: "docs_confirmar_envio_extra", title: "✅ Sim, enviar" },
          { id: "m_inicio", title: "🏠 Menu do cliente" }
        ]
      }
      if (IMAGEM_DOCS_FINAL_URL) {
        await enviarImagemWhatsApp(from, IMAGEM_DOCS_FINAL_URL, telaDocsCompletos.texto, telaDocsCompletos.opcoes)
        return null
      }
      return telaDocsCompletos
    }
    await hsMoverStage(u.negocioId, HS_STAGE.AGUARDANDO_DOCS)
    u.negocioStageId = HS_STAGE.AGUARDANDO_DOCS
    salvarEtapa(u._numero, "documentos")
    setStage(u, STAGES.CLIENTE)
    u.docAtualIdx = u.docAtualIdx || 0
    u._docsClienteGuiado = false
    await enviarIntroDocumentos(from, u)
    iniciarTimer(from)
    return null
  }
  if (intencao === "advogado") return await telaAdvogadoClienteComAudio(from, u)
  if (intencao === "agendar") {
    if (u.negocioId) { await hsMoverStage(u.negocioId, HS_STAGE.AGENDAMENTO); u.negocioStageId = HS_STAGE.AGENDAMENTO }
    return await iniciarAgendamento(from, u)
  }
  if (intencao === "cancelar_consulta") return await telaConfirmarCancelamentoConsultaCliente(from, u)
  if (intencao === "urgente") return await iniciarMensagemUrgenteCliente(from, u)
  if (intencao === "novo_caso") return await confirmarAberturaNovoCasoCliente(from, u)
  if (intencao === "despedida") return await encerrarClienteCadastrado(from, u)
  if (intencao === "cancelar") {
    await hsCriarNota(u.contatoId, "PEDIDO DE CANCELAMENTO OU DESISTENCIA", `De: ${u.nome || "-"} (${from})\nCaso: ${u.numeroCaso || "-"}\n\nMensagem: ${textoOriginal || "-"}`)
    await enviarAudioModoVoz(from, u, "Entendi. Para cancelar ou encerrar um caso, fale com nossa equipe. Você pode falar com um advogado ou voltar ao menu do cliente.", "cancelamento cliente")
    return {
      texto: "📌 *Entendi.*\n\nPara cancelar ou encerrar um caso, fale com nossa equipe.",
      opcoes: [
      { id: "m_adv",      title: "👨‍⚖️ Falar com advogado" },
      { id: "m_inicio", title: "🏠 Menu do cliente" }
      ]
    }
  }
  return null
}


function sairContextoDocumentosCliente(u) {
  if (!u) return
  u._docsClienteGuiado = false
  setStage(u, STAGES.CLIENTE)
  u.etapa = STAGES.CLIENTE
  u.lastPergunta = null
  u.lastPerguntaPayload = null
  u.aguardandoResposta = false
}

function responderComTimer(from, payload) {
  iniciarTimer(from)
  return payload
}

function telaDescreverCaso() {
  return {
    texto: "●●●●●○ 📝 Etapa 5 de 6 · *Descrição*\n\n✍️ Pode me contar um pouco mais sobre seu caso?\nVocê pode digitar ou enviar um áudio 😊",
    opcoes: [
      { id: "desc_incentivo_depois", title: "⏳ Enviar depois" },
        { id: "desc_incentivo_menu",      title: "🏠 Menu do cliente" },
    ]
  }
}

function telaConfirmarUrgente(transcricao) {
  return {
    texto: `🎙️ *Áudio recebido e transcrito!*\n\n📝 *Transcrição:*\n\n"${transcricao.slice(0, 400)}${transcricao.length > 400 ? "..." : ""}"\n\nConfirme ou corrija as informações.`,
    opcoes: [{ id:"urg_audio_ok", title:"✅ Confirmar" }, { id:"urg_audio_corrigir", title:"✏️ Corrigir" }, { id: "m_inicio", title: "🏠 Menu do cliente" }]
  }
}

async function telaConfirmarUrgenteComAudio(from, u, transcricao) {
  try {
    const ogg = await gerarAudioAtendente(u.atendente,
      `Recebi sua mensagem! Ouvi o que você disse.
    Você tem três opções.
    Primeira: Confirmar, para enviar essa mensagem para nossa equipe.
    Segunda: Corrigir, se quiser gravar novamente.
    Terceira: Menu do cliente, para voltar ao menu principal.`)
    await enviarAudio(from, urlAudioAtendente(ogg))
    await new Promise(r => setTimeout(r, 4000))
  } catch (e) { logErro("tts", "Falha áudio confirmar urgente", e) }

  return telaConfirmarUrgente(transcricao)
}

function deveOferecerExplicarTudo(u) {
  if (!u) return false
  if (u._ofereceuExplicarTudo) return false
  return !u.descricao && !u._descTemp
}

function prepararOfertaExplicarTudoFinal(from, u, proximoStage, proximaPergunta) {
  u._ofereceuExplicarTudo = true
  u._proximoStageAposDescricao = proximoStage
  u._proximaPerguntaAposDescricao = proximaPergunta
  setStage(u, STAGES.COLETA_DESC_AUDIO)
  iniciarTimer(from)
  return telaDescreverCaso()
}

function telaAudioNoFluxo(transcricao, recomendacao) {
  const preview = (transcricao || "").length > 320 ? transcricao.slice(0, 320) + "..." : (transcricao || "")
  return {
    texto: `🎙️ *Áudio transcrito*\n\n"${preview}"\n\nMinha recomendação agora é *${recomendacao || "continuar o atendimento"}*.\n\nComo você quer seguir?`,
    opcoes: [
      { id: "audio_fluxo_seguir", title: "✅ Seguir recomendação" },
      { id: "audio_fluxo_recomecar", title: "🔄 Recomeçar" },
      { id: "audio_fluxo_encerrar", title: "👋 Encerrar" }
    ]
  }
}

function iniciarConfirmacaoDescricao(from, u, texto, origemStage) {
  u._descTemp = normalizarTextoCRM(texto)
  u._descOrigemStage = origemStage
  setStage(u, STAGES.DESC_CONFIRMA)
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

async function respostaAposConfirmarDescricao(from, u) {
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
    setStage(u, proximoStage)
    iniciarTimer(from)
    if (proximoStage === STAGES.CONFIRMACAO) {
      await sincronizarNegocio(u)
      return await telaConfirmacaoComImagem(from, u)
    }
    if (proximaPergunta) return proximaPergunta
    return { texto: "Perfeito. Vou considerar esses detalhes no atendimento.", opcoes: [{ id: "cont", title: "▶️ Continuar" }] }
  }

  setStage(u, "confirmacao")
  u._descOrigemStage = null
  iniciarTimer(from)
  await sincronizarNegocio(u)
  return await telaConfirmacaoComImagem(from, u)
}

async function flowInicio(u, ctx) {
  const from = ctx?.from || u._numero || ""
  if (podeMostrarMenuCliente(u)) {
    setStage(u, STAGES.INICIO_RETORNO)
    const nomeExib = getPrimeiroNomeRetomada(u)
    await enviarAudioModoVoz(
      from,
      u,
      `Que bom te ver novamente, ${nomeExib}. Voce ja possui um atendimento conosco. Na tela, escolha acompanhar meu caso ou abrir novo caso.`,
      "inicio retorno"
    )
    return {
        texto: `Que bom te ver novamente, *${nomeExib}* 😊\n\nVocê já possui um atendimento conosco.\n\n📄 Caso: *${u.numeroCaso}*\n⚖️ Área: ${u.area}\n\nO que deseja fazer?`,
      opcoes: [
        { id: "ret_acompanhar", title: "📊 Acompanhar meu caso" },
        { id: "ret_novo", title: "➕ Abrir novo caso" }
      ]
    }
  }
  return await iniciarFluxoRelatoLivre(from, u, { boasVindas: true })
}

async function flowInicioRetorno(u, ctx) {
  setStage(u, STAGES.INICIO_RETORNO)
  const nomeExib = getPrimeiroNomeRetomada(u)
  await enviarAudioModoVoz(
    ctx?.from || u?._numero || "",
    u,
    `Que bom te ver novamente, ${nomeExib}. Voce ja possui um atendimento conosco. Na tela, escolha acompanhar meu caso ou abrir novo caso.`,
    "inicio retorno"
  )
  return {
        texto: `Que bom te ver novamente, *${nomeExib}* 😊\n\nVocê já possui um atendimento conosco.\n\n📄 Caso: *${u.numeroCaso}*\n⚖️ Área: ${u.area}\n\nO que deseja fazer?`,
    opcoes: [
        { id: "ret_acompanhar", title: "📊 Acompanhar meu caso" },
      { id: "ret_novo", title: "➕ Abrir novo caso" }
    ]
  }
}

function obterStageRetomadaOriginal(u) {
  const candidatos = [
    u?._stageRetomadaOriginal,
    obterEtapaSegura(u?._numero),
    u?.etapa,
    u?.lastPergunta,
    u?.stage
  ]

  for (const candidato of candidatos) {
    const etapa = normalizarStageKey(candidato)
    if (!etapaValida(etapa)) continue
    if ([STAGES.RETOMADA_AUTOMATICA, STAGES.RETOMADA_MENU, STAGES.RESUMO_ATENDIMENTO, STAGES.RESUMO_RETOMADA].includes(etapa)) continue
    return etapa
  }

  return STAGES.AUDIO_AGUARDANDO
}

function obterCamposResumo(u) {
  const formatarResumoValor = valor => {
    const texto = sanitizarTextoEntrada(valor)
    if (!texto) return null

    const mapa = {
      area_inss: "INSS",
      area_trab: "Trabalhista",
      area_familia: "Família",
      area_consumidor: "Consumidor",
      area_penal: "Penal",
      area_civil: "Civil",
      area_imovel: "Imobiliário",
      area_outros: "Outros"
    }

    if (mapa[texto]) return mapa[texto]

    return texto
      .replace(/_/g, " ")
      .split(" ")
      .filter(Boolean)
      .map(parte => parte.charAt(0).toUpperCase() + parte.slice(1))
      .join(" ")
  }

  const possuiResumoValido = valor => {
    const texto = sanitizarTextoEntrada(valor)
    return !!texto && !/^nao informado$/i.test(texto) && !!formatarResumoValor(valor)
  }

  const campos = []

  if (possuiResumoValido(u?.area)) campos.push({ key: "area", label: "Área", valor: u.area })
  if (possuiResumoValido(u?.tipo)) campos.push({ key: "tipo", label: "Tipo", valor: u.tipo })
  if (possuiResumoValido(u?.situacao)) campos.push({ key: "situacao", label: "Situação", valor: u.situacao })
  if (possuiResumoValido(u?.regiao)) campos.push({ key: "regiao", label: "Região", valor: u.regiao })
  if (possuiResumoValido(u?.uf)) campos.push({ key: "uf", label: "Estado", valor: u.uf })
  if (possuiResumoValido(u?.cidade)) campos.push({ key: "cidade", label: "Cidade", valor: u.cidade })
  if (possuiResumoValido(u?.descricao)) campos.push({ key: "descricao", label: "Descrição", valor: u.descricao })

  return campos
}

async function flowMenuCorrecaoRetomada(u, ctx) {
  const camposResumo = obterCamposResumo(u)

  if (camposResumo.length === 0) {
    await enviarAudioModoVoz(
      ctx?.from || u?._numero || "",
      u,
      "Nao encontrei dados para corrigir no resumo. Toque em continuar para seguir o atendimento.",
      "correcao retomada vazia"
    )
    return {
      texto: "âœï¸ Nenhum dado para corrigir no resumo.",
      opcoes: [{ id: "rr_continuar", title: "▶️ Continuar" }]
    }
  }

  const opcoes = camposResumo.map(campo => ({
    id: `rr_corr_${campo.key}`,
    title: `✏️ ${campo.label}`
  }))

  opcoes.push({ id: "rr_corr_voltar", title: "⬅️ Voltar ao resumo" })

  await enviarAudioModoVoz(
    ctx?.from || u?._numero || "",
    u,
    `Qual informacao voce deseja corrigir? As opcoes aparecem na tela: ${camposResumo.map(c => c.label).join(", ")}. Tambem pode voltar ao resumo.`,
    "menu correcao retomada"
  )

  return {
    texto: "✏️ Qual informação deseja corrigir?",
    opcoes: opcoes
  }
}

async function flowRetomadaAutomatica(u, ctx = {}) {
  if (!etapaValida(u?._stageRetomadaOriginal)) {
    u._stageRetomadaOriginal = obterStageRetomadaOriginal(u)
  }
  setStage(u, STAGES.RETOMADA_MENU)
  const from = ctx.from || u._numero || ""
  const nome = getPrimeiroNomeRetomada(u)
  if (!u.modoTexto && from) {
    try {
      const textoAudio = nome
        ? `Oi, ${nome}! Fiquei te esperando. Seu atendimento ficou salvo. Você tem três opções: a primeira é continuar de onde parou, a segunda é recomeçar do início, e a terceira é encerrar o atendimento. Qual delas você escolhe?`
        : `Oi! Fiquei te esperando. Seu atendimento ficou salvo. Você tem três opções: a primeira é continuar de onde parou, a segunda é recomeçar do início, e a terceira é encerrar o atendimento. Qual delas você escolhe?`
      const ogg = await gerarAudioAtendente(u.atendente, textoAudio)
      await enviarAudio(from, urlAudioAtendente(ogg))
      await new Promise(r => setTimeout(r, 2000))
    } catch (e) { logErro("tts", "Falha áudio retomada automática", e) }
  }
  return {
    texto: `🕒 *Atendimento pausado*\n\nOi${nome ? `, *${nome}*` : ""} 😊 Fiquei te esperando.\n\n📌 Seu atendimento ficou salvo.\n\nComo deseja continuar?`,
    opcoes: [
      { id: "rm_continuar", title: "▶️ Continuar" },
      { id: "rm_recomecar", title: "🔄 Recomeçar" },
      { id: "m_encerrar", title: "👋 Encerrar" }
    ],
    perguntaId: STAGES.RETOMADA_MENU
  }
}

async function flowRetomadaMenu(u, ctx = {}) {
  if (!etapaValida(u?._stageRetomadaOriginal)) {
    u._stageRetomadaOriginal = obterStageRetomadaOriginal(u)
  }
  setStage(u, STAGES.RETOMADA_MENU)
  const from = ctx.from || u._numero || ""
  const nome = getPrimeiroNomeRetomada(u)
  if (!u.modoTexto && from) {
    try {
      const textoAudio = nome
        ? `Oi, ${nome}! Fiquei te esperando. Seu atendimento ficou salvo. Você tem três opções: a primeira é continuar de onde parou, a segunda é recomeçar do início, e a terceira é encerrar o atendimento. Qual delas você escolhe?`
        : `Oi! Fiquei te esperando. Seu atendimento ficou salvo. Você tem três opções: a primeira é continuar de onde parou, a segunda é recomeçar do início, e a terceira é encerrar o atendimento. Qual delas você escolhe?`
      const ogg = await gerarAudioAtendente(u.atendente, textoAudio)
      await enviarAudio(from, urlAudioAtendente(ogg))
      await new Promise(r => setTimeout(r, 2000))
    } catch (e) { logErro("tts", "Falha áudio retomada menu", e) }
  }
  return {
    texto: `🕒 *Atendimento pausado*\n\nOi${nome ? `, *${nome}*` : ""} 😊 Fiquei te esperando.\n\n📌 Seu atendimento ficou salvo.\n\nComo deseja continuar?`,
    opcoes: [
      { id: "rm_continuar", title: "▶️ Continuar" },
      { id: "rm_recomecar", title: "🔄 Recomeçar" },
      { id: "m_encerrar", title: "👋 Encerrar" }
    ],
    perguntaId: STAGES.RETOMADA_MENU
  }
}

async function flowResumoRetomada(u, ctx = {}) {
  if (!etapaValida(u?._stageRetomadaOriginal)) {
    u._stageRetomadaOriginal = obterStageRetomadaOriginal(u)
  }
  setStage(u, STAGES.RESUMO_RETOMADA)
  const from = ctx.from || u._numero || ""
  const nome = getPrimeiroNomeRetomada(u)
  if (!u.modoTexto && from) {
    try {
      const stageResumo = u?._stageRetomadaOriginal || u?.stage || ""
      const labelEtapa = {
        acolhimento_nome: "informar seu nome",
        acolhimento_confirma_nome: "confirmar seu nome",
        acolhimento_confirma_whatsapp: "confirmar seu WhatsApp",
        acolhimento_cidade: "informar sua cidade",
        audio_confirmar_dados: "confirmação dos dados",
        assessoria_inicial: "escolher como você prefere ser atendido",
        coleta_desc: "descrever seu caso",
        gatilho: "avaliação de urgência",
        confirmacao: "confirmação final dos dados"
      }
      const etapaLegivel = labelEtapa[stageResumo] || "uma das etapas do atendimento"
      const textoOriginal = sanitizarTextoEntrada(u?.assuntoResumo || u?.descricao || u?._audioCanalTranscricao)
      let fraseRelato = ""
      if (textoOriginal && GROQ_KEY) {
        try {
          const resposta = await axios.post("https://api.groq.com/openai/v1/chat/completions", {
            model: "llama-3.1-8b-instant",
            messages: [
              { role: "system", content: "Você é um assistente jurídico. Resuma o relato do cliente em UMA frase curtíssima, no estilo 'que você foi agredido por um vizinho' ou 'sobre um problema com seu empregador'. Não use termos técnicos. Comece sempre com 'que você'." },
              { role: "user", content: textoOriginal }
            ],
            max_tokens: 80,
            temperature: 0.3
          }, { headers: { Authorization: `Bearer ${GROQ_KEY}` } })
          fraseRelato = resposta.data.choices?.[0]?.message?.content?.trim() || ""
        } catch (e) {
          logErro("groq", "Falha resumo relato no áudio da retomada", e)
          fraseRelato = textoOriginal ? textoOriginal.slice(0, 120) : ""
        }
      }
      const itensFeitos = []
      if (u.nome || u.nomeHubspot) itensFeitos.push(`nos informou seu nome como ${u.nome || u.nomeHubspot}`)
      if (u.cidade) itensFeitos.push(`nos disse que mora em ${u.cidade}`)
      if (fraseRelato) itensFeitos.push(`nos contou ${fraseRelato}`)
      const resumoFeito = itensFeitos.length > 0
        ? ` Você já ${itensFeitos.join(", ")}.`
        : ""
      const relatoAudio = fraseRelato
        ? ` Você nos contou ${fraseRelato}.`
        : ""
      const textoAudio = nome
        ? `${nome}, você parou na etapa de ${etapaLegivel}.${relatoAudio} Quer continuar, corrigir algo, recomeçar ou encerrar?`
        : `Você parou na etapa de ${etapaLegivel}.${relatoAudio} Quer continuar, corrigir algo, recomeçar ou encerrar?`
      const ogg = await gerarAudioAtendente(u.atendente, textoAudio)
      await enviarAudio(from, urlAudioAtendente(ogg))
      await new Promise(r => setTimeout(r, 2000))
    } catch (e) { logErro("tts", "Falha áudio resumo retomada", e) }
  }
  return {
    texto: await montarTextoResumoRetomada(u, sortearAtendente),
    opcoes: [
      { id: "rr_continuar", title: "✅ Continuar" },
      { id: "rr_corrigir", title: "✏️ Corrigir algo" },
      { id: "rr_recomecar", title: "🔄 Recomeçar" },
      { id: "rr_encerrar", title: "👋 Encerrar" }
    ],
    perguntaId: STAGES.RESUMO_RETOMADA
  }
}

async function flowResumoAtendimento(u, ctx) {
  if (!etapaValida(u?._stageRetomadaOriginal)) {
    u._stageRetomadaOriginal = obterStageRetomadaOriginal(u)
  }

  setStage(u, STAGES.RESUMO_ATENDIMENTO)
  const from = ctx?.from || u?._numero || ""
  const texto = await montarTextoResumoRetomada(u, sortearAtendente)
  await enviarAudioModoVoz(
    from,
    u,
    "Vou relembrar seu atendimento anterior. Confira o resumo na tela e escolha se deseja continuar, corrigir, recomecar ou encerrar.",
    "resumo atendimento"
  )
  return {
    texto,
    opcoes: [
      { id: "ra_continuar", title: "✅ Sim, continuar" },
      { id: "ra_corrigir", title: "✏️ Corrigir" },
      { id: "ra_recomecar", title: "🔄 Recomeçar" },
      { id: "ra_encerrar", title: "👋 Encerrar" }
    ],
    perguntaId: STAGES.RESUMO_ATENDIMENTO
  }
}

function reiniciarFluxoRetomada(u) {
  Object.assign(u, {
    stage: STAGES.INICIO,
    tipo: null,
    area: null,
    descricao: null,
    temCadastroCompleto: false,
    numeroCaso: null,
    situacao: null,
    subTipo: null,
    detalhe: null,
    documentosEnviados: false,
    lastPergunta: null,
    lastPerguntaPayload: null,
    aguardandoResposta: false,
    aguardandoRetomada: false,
    jaOfereceuRetomada: false,
    _retomadaEhLeadFrio: false,
    _stageRetomadaOriginal: null
  })
}

function respostaOpcaoInvalidaRetomada() {
  return {
    texto: "Não entendi. Escolha uma opção do menu 👇",
    opcoes: [
      { id: "rm_continuar", title: "▶️ Continuar atendimento" },
      { id: "rm_recomecar", title: "🔄 Recomeçar" },
      { id: "m_encerrar", title: "👋 Encerrar" }
    ],
    perguntaId: STAGES.RETOMADA_MENU
  }
}

async function responderImprevistoPreAtendimento(from, u, stage, tipo, textoOriginal = "") {
  const pergunta = perguntaAtualPreAtendimento(stage, u)
  let texto = ""
  let audio = ""

  // Se o tipo for 'relato' mas o texto indica claramente que é caso de terceira pessoa,
  // tratar como 'terceiro' para não cadastrar o nome do remetente por engano.
  try {
    if (tipo === "relato") {
      const ehTerceiro = pareceCasoParaTerceiroPreAtendimento(textoOriginal) || (relacaoTerceiroPreAtendimento(textoOriginal) !== "pessoa atendida")
      if (ehTerceiro) tipo = "terceiro"
    }
  } catch (e) { /* silencioso: não quebrar fluxo se algo falhar */ }

  if (tipo === "terceiro") {
    const relacao = relacaoTerceiroPreAtendimento(textoOriginal)
    const alvoTexto = descricaoRelacaoTerceiroPreAtendimento(relacao)
    u.atendimentoParaTerceiro = true
    u.telefoneEhDoCliente = false
    u._nomeTitularOrigem = "atendido"
    u.relacaoComAtendido = relacao
    u._nomeTemp = null
    // Preservar o relato que veio antecipado para não perder após coletar nomes
    const relatoExtraido = normalizarTextoCRM(textoOriginal)
    if (relatoExtraido && !u._audioCanalTranscricao) {
      u._audioCanalTranscricao = relatoExtraido
      u._relatoAntecipadoPreAtendimento = relatoExtraido
    }
    setStage(u, STAGES.ACOLHIMENTO_NOME_CONTATO)
    salvarEtapa(u._numero || from, STAGES.ACOLHIMENTO_NOME_CONTATO)
    texto = `*👥 Atendimento para outra pessoa*\n\n✅ Combinado! Só me diga uma coisa antes: *qual é o seu nome*?\n\nPreciso saber quem está aqui no WhatsApp cuidando desse caso. 😊\n\n_Digite ou envie um áudio com seu nome._ 🎙️`
    audio = `Entendi! Vamos registrar o atendimento para ${alvoTexto}. Antes de continuar, preciso saber o seu nome — de quem está aqui no WhatsApp. Pode falar ou digitar.`
    return await responderTelaComAudio(
      from,
      u,
      {
        texto,
        opcoes: [
          { id: "pre_nome_informar", title: "👤 Informar nome" },
          { id: "pre_mim_continuar", title: "🙋 É para mim" }
        ]
      },
      audio,
      "pre atendimento terceiro pede nome contato"
    )
  } else if (tipo === "advogado_direto" || tipo === "duvida") {
    // Se sofrimento foi detectado nesta sessão, a resposta ao pedido de advogado
    // precisa ser empática, não burocrática — reconhece a urgência emocional e
    // enquadra o cadastro como cuidado, não como barreira.
    let resposta
    if (u._jaAcolheuSofrimento && tipo === "advogado_direto") {
      resposta = "Entendo que você quer falar com alguém agora, e vou garantir que isso aconteça. Para que o advogado chegue já sabendo tudo sobre sua situação e possa te ajudar de verdade, preciso registrar algumas informações antes — leva poucos minutos."
    } else {
      resposta = respostaCurtaDuvidaPreAtendimento(textoOriginal)
    }
    texto = `💬 ${resposta}\n\n${pergunta.texto}`
    audio = `${resposta} ${pergunta.audio}`
  } else if (tipo === "relato") {
    const relato = normalizarTextoCRM(textoOriginal)
    if (relato && !u.descricao) {
      u.descricao = relato
      u._relatoAntecipadoPreAtendimento = relato
    }
    texto = `📝 Entendi e guardei essa informação sobre a situação.\n\n${pergunta.texto}`
    audio = `Entendi e guardei essa informação sobre a situação. ${pergunta.audio}`
  } else {
    texto = `🤔 Não consegui entender se isso era uma resposta da etapa ou uma dúvida.\n\n${pergunta.texto}`
    audio = `Não consegui entender se isso era uma resposta da etapa ou uma dúvida. ${pergunta.audio}`
  }

  iniciarTimer(from)
  return await responderTelaComAudio(
    from,
    u,
    { texto, opcoes: pergunta.opcoes },
    audio,
    "imprevisto pre atendimento"
  )
}

async function redirecionarCorrecaoPreAtendimento(from, u, campo) {
  const campoNorm = sanitizarTextoEntrada(campo || "").toLowerCase()

  // Verdadeiro se o cliente já tem dados suficientes para exibir a tela de confirmação
  // (nome confirmado E cidade coletada). Se faltar algum, ao terminar a edição o fluxo
  // retoma normalmente pela sequência de coleta, não pela tela de confirmação.
  const jaTemDadosParaConfirmacao = () => !!(u.nomeConfirmado && u.cidade)

  // Helper: ir para mini-stage de edição com retorno à confirmação
  const irParaEditar = async (stage, textoMsg, textoAudio) => {
    u._retornarParaConfirmacao = jaTemDadosParaConfirmacao()
    u._origemConfirmacao = u.modoTexto ? "texto" : "audio"
    setStage(u, stage)
    iniciarTimer(from)
    if (!u.modoTexto && textoAudio) {
      try {
        const ogg = await gerarAudioAtendente(u.atendente, textoAudio)
        await enviarAudio(from, urlAudioAtendente(ogg))
        await new Promise(r => setTimeout(r, 3000))
      } catch (e) { logErro("tts", "Falha áudio redirecionarCorrecao", e) }
    }
    return responderComTimer(from, { texto: textoMsg, opcoes: null })
  }

  if (campoNorm === "nome") {
    // No fluxo para terceiro, quando ambos os nomes já foram coletados, perguntar
    // qual dos dois o usuário quer corrigir antes de abrir o editor.
    if (u.atendimentoParaTerceiro && u.nomeContato && u.nome) {
      const primeiroNomeContato = u.nomeContato.split(" ")[0]
      const primeiroNomeAtendido = u.nome.split(" ")[0]
      u._retornarParaConfirmacao = jaTemDadosParaConfirmacao()
      u._origemConfirmacao = u.modoTexto ? "texto" : "audio"
      setStage(u, STAGES.EDITAR_NOME)
      iniciarTimer(from)
      if (!u.modoTexto) {
        try {
          const ogg = await gerarAudioAtendente(u.atendente,
            `Entendido! Qual nome você quer corrigir? Primeira opção: seu nome, ${primeiroNomeContato}. Segunda opção: o nome da pessoa atendida, ${primeiroNomeAtendido}.`)
          await enviarAudio(from, urlAudioAtendente(ogg))
          await new Promise(r => setTimeout(r, 4000))
        } catch (e) { logErro("tts", "Falha áudio qual nome corrigir", e) }
      }
      return responderComTimer(from, {
        texto: `●●○○○○ 👤 Etapa 2 de 6 · *Nome*\n\nQual nome você quer corrigir?`,
        opcoes: [
          { id: "corr_nome_contato", title: `🙋 Meu nome (${primeiroNomeContato})` },
          { id: "corr_nome_atendido", title: `👤 Nome de ${primeiroNomeAtendido}` }
        ]
      })
    }
    // Fluxo para si, ou para terceiro mas com apenas um nome coletado: vai direto
    const ehNomeContato = u.atendimentoParaTerceiro && u.nomeContato && !u.nome
    u._correcaoPendenteSubcampo = ehNomeContato ? "nomeContato" : "nome"
    return await irParaEditar(
      STAGES.EDITAR_NOME,
      `●●○○○○ 👤 Etapa 2 de 6 · *Nome*\n\nEntendido! Qual é o nome correto?\n\n_Digite ou envie um áudio com o nome completo._`,
      `Entendido! Me diga o nome correto, pode falar ou digitar.`
    )
  }
  if (campoNorm === "whatsapp") {
    u._retornarParaConfirmacao = jaTemDadosParaConfirmacao()
    u._origemConfirmacao = u.modoTexto ? "texto" : "audio"
    u._corrigindoWhatsappConfirmacao = jaTemDadosParaConfirmacao()
    setStage(u, STAGES.REVALIDA_WHATSAPP)
    iniciarTimer(from)
    const numeroAtual = formatarTelefoneExibicao(getTelefoneContato(from, u))
    if (!u.modoTexto) {
      try {
        const digitosAudio = String(getTelefoneContato(from, u) || "").replace(/\D/g, "").split("").join(" ")
        const ogg = await gerarAudioAtendente(u.atendente,
          `Entendido! Seu WhatsApp está como ${digitosAudio}. Se quiser usar outro número, é só falar ou digitar com DDD agora.`)
        await enviarAudio(from, urlAudioAtendente(ogg))
        await new Promise(r => setTimeout(r, 3500))
      } catch (e) { logErro("tts", "Falha áudio redirecionarCorrecao whatsapp", e) }
    }
    return responderComTimer(from, {
      texto: `●●●●○○ 📱 Etapa 4 de 6 · *WhatsApp*\n\nSeu WhatsApp está como *${numeroAtual || from}*.\n\nEsse é o número correto? Se quiser usar outro, é só digitar ou falar com DDD agora. 🎙️`,
      opcoes: [{ id: "revalida_whatsapp_ok", title: "✅ Confirmar" }]
    })
  }
  if (campoNorm === "cidade") {
    return await irParaEditar(
      STAGES.EDITAR_CIDADE,
      `●●●●●○ 📍 Etapa 5 de 6 · *Cidade*\n\nEntendido! Qual é a cidade correta?\n\nDigite a cidade com o estado (ex: *Recife, PE*) ou informe o CEP.`,
      `Entendido! Me diga a cidade correta com o estado, ou informe o CEP.`
    )
  }
  if (campoNorm === "situacao") {
    return await irParaEditar(
      STAGES.EDITAR_SITUACAO,
      `📌 Entendido! *Qual é a situação correta?*\n\n_Descreva brevemente ou envie um áudio._`,
      `Entendido! Me conta a situação correta do seu caso.`
    )
  }
  if (campoNorm === "detalhe") {
    return await irParaEditar(
      STAGES.EDITAR_DETALHE,
      `🔎 Entendido! *Qual é o detalhe correto?*\n\n_Digite ou envie um áudio._`,
      `Entendido! Me diga o detalhe correto.`
    )
  }
  if (campoNorm === "urgencia") {
    u._retornarParaConfirmacao = jaTemDadosParaConfirmacao()
    u._origemConfirmacao = u.modoTexto ? "texto" : "audio"
    setStage(u, STAGES.EDITAR_URGENCIA)
    iniciarTimer(from)
    if (!u.modoTexto) {
      try {
        const ogg = await gerarAudioAtendente(u.atendente,
          `Entendido! Qual é o nível de urgência correto? Primeira opção: Alta, preciso de ajuda urgente. Segunda opção: Moderada, posso aguardar um pouco. Terceira opção: Baixa, sem pressa.`)
        await enviarAudio(from, urlAudioAtendente(ogg))
        await new Promise(r => setTimeout(r, 3500))
      } catch (e) { logErro("tts", "Falha áudio redirecionarCorrecao urgencia", e) }
    }
    return responderComTimer(from, {
      texto: `⚡ Entendido! *Qual é o nível de urgência correto?*`,
      opcoes: [
        { id: "eu_alta",   title: "🔴 Alta" },
        { id: "eu_normal", title: "🟡 Moderada" },
        { id: "eu_baixa",  title: "🟢 Baixa" }
      ]
    })
  }
  if (campoNorm === "descricao") {
    return await irParaEditar(
      STAGES.EDITAR_DESCRICAO,
      `💬 Entendido! *Qual é a descrição correta do caso?*\n\n_Digite ou envie um áudio com a descrição atualizada._`,
      `Entendido! Me conta a descrição correta do seu caso.`
    )
  }

  // Campo não identificado — pede para especificar via CORRIGIR_DADOS
  setStage(u, STAGES.CORRIGIR_DADOS)
  iniciarTimer(from)
  if (!u.modoTexto) {
    try {
      const ogg = await gerarAudioAtendente(u.atendente,
        `Entendido, você quer corrigir algo. Me diz o que está errado: pode ser o nome, o WhatsApp, a cidade ou qualquer outro dado.`)
      await enviarAudio(from, urlAudioAtendente(ogg))
      await new Promise(r => setTimeout(r, 3500))
    } catch (e) { logErro("tts", "Falha áudio redirecionarCorrecao outro", e) }
  }
  return responderComTimer(from, {
    texto: `✏️ Entendido, você quer corrigir algo!\n\nMe diz o que está errado. Pode ser o nome, o WhatsApp, a cidade ou qualquer outro dado.\n\n_Digite ou envie um áudio._`,
    opcoes: null
  })
}

async function tratarImprevistoPreAtendimento(from, u, stage, texto = "") {
  const entrada = sanitizarTextoEntrada(texto)
  if (!entrada) return null
  const classificacao = await classificarEntradaPreAtendimento(stage, entrada)
  if (classificacao.tipo === "correcao") {
    return await redirecionarCorrecaoPreAtendimento(from, u, classificacao.tema)
  }
  if (classificacao.tipo === "terceiro") {
    u.atendimentoParaTerceiro = true
    u._nomeTitularOrigem = u._nomeTitularOrigem || "atendido"
    return await responderImprevistoPreAtendimento(from, u, stage, "terceiro", entrada)
  }
  if (classificacao.tipo === "advogado_direto") {
    return await responderImprevistoPreAtendimento(from, u, stage, "advogado_direto", entrada)
  }
  if (classificacao.tipo === "duvida") {
    return await responderImprevistoPreAtendimento(from, u, stage, "duvida", entrada)
  }
  if (classificacao.tipo === "relato") {
    return await responderImprevistoPreAtendimento(from, u, stage, "relato", entrada)
  }
  // Fallback inteligente: classificador não reconheceu — IA conduz o cliente de volta
  return await conduzirPreAtendimentoIA(from, u, stage, entrada)
}

async function tratarIntervencaoPreAtendimento(from, u, stage, texto = "", opcoes = {}) {
  const entrada = sanitizarTextoEntrada(texto)
  if (!entrada) return null
  const classificacao = await classificarEntradaPreAtendimento(stage, entrada, opcoes)
  if (classificacao.tipo === "correcao") {
    // Intenção de corrigir um campo já informado — redireciona independentemente do stage,
    // inclusive em AUDIO_AGUARDANDO quando o usuário deveria estar relatando o caso.
    // Exemplos: "quero mudar o nome", "o WhatsApp está errado", "a cidade está errada".
    return await redirecionarCorrecaoPreAtendimento(from, u, classificacao.tema)
  }
  if (classificacao.tipo === "terceiro") {
    // Em AUDIO_AGUARDANDO o bot já pediu o relato — deixar passar sem interceptar
    if (stage === STAGES.AUDIO_AGUARDANDO) return null
    return await responderImprevistoPreAtendimento(from, u, stage, "terceiro", entrada)
  }
  if (classificacao.tipo === "advogado_direto") {
    return await responderImprevistoPreAtendimento(from, u, stage, "advogado_direto", entrada)
  }
  if (classificacao.tipo === "duvida") {
    // Em AUDIO_AGUARDANDO o bot já pediu o relato — uma mensagem que apenas menciona
    // um tema jurídico (ex: "consumidor", "banco", "divida") é o próprio relato, não
    // uma dúvida sobre o serviço. Só interceptar aqui se for claramente uma pergunta
    // funcional ("?", "como funciona", "quanto custa"), pedido de falar com advogado,
    // ou o usuário disser explicitamente que tem uma dúvida.
    if (stage === STAGES.AUDIO_AGUARDANDO) {
      const ehDuvidaExplicita =
        /\b(duvida|dúvida|duvidas|dúvidas)\b/.test(textoNormalizadoPreAtendimento(entrada)) ||
        parecePedidoAdvogadoDiretoPreAtendimento(entrada) ||
        parecePerguntaFuncionalPreAtendimento(entrada)
      if (!ehDuvidaExplicita) return null
    }
    return await responderImprevistoPreAtendimento(from, u, stage, "duvida", entrada)
  }
  // Relato jurídico legítimo: deixa passar para classificarAreaAudio processar normalmente
  if (classificacao.tipo === "relato") return null
  // Fallback inteligente: classificador não reconheceu — IA conduz o cliente de volta
  // Nota: só chamado se usarIA não foi false (intervencao sem IA retorna null normalmente)
  if (opcoes.usarIA !== false) {
    return await conduzirPreAtendimentoIA(from, u, stage, entrada)
  }
  return null
}

// Condutor inteligente do pré-atendimento via IA — chamado apenas quando as regras e o
// classificador não reconheceram a mensagem (retorno null). Gera resposta contextual
// que acolhe o que o cliente disse e redireciona gentilmente para o dado que ainda falta.
async function conduzirPreAtendimentoIA(from, u, stage, textoOriginal = "") {
  const entrada = sanitizarTextoEntrada(textoOriginal)
  if (!GROQ_KEY || !entrada || entrada.length < 3) return null

  const pergunta = perguntaAtualPreAtendimento(stage, u)
  const dadoFaltante = pergunta?.audio || pergunta?.texto || "a informação solicitada"
  const primeiroNome = primeiroNomeCliente(u) || ""

  const contextoDados = []
  if (u.nome) contextoDados.push(`Nome já coletado: ${u.nome}`)
  if (u.atendimentoParaTerceiro) contextoDados.push("Atendimento para terceiro: sim")
  const contextoStr = contextoDados.length ? contextoDados.join(". ") + "." : "Nenhum dado coletado ainda."

  const stageDescricao = {
    [STAGES.AUDIO_AGUARDANDO]: "aguardando o cliente relatar a situação jurídica",
    [STAGES.ACOLHIMENTO_MODO]: "aguardando escolha do modo de comunicação (áudio ou texto)",
    [STAGES.ACOLHIMENTO_PARA_QUEM]: "aguardando confirmação se o atendimento é para o contato ou para terceiro",
    [STAGES.ACOLHIMENTO_NOME_CONTATO]: "aguardando o nome de quem está no WhatsApp (o contato que abre o caso para outra pessoa)",
    [STAGES.ACOLHIMENTO_CONFIRMA_NOME_CONTATO]: "aguardando confirmação do nome de quem está no WhatsApp antes de prosseguir",
    [STAGES.ACOLHIMENTO_NOME]: "aguardando o nome completo da pessoa atendida",
    [STAGES.ACOLHIMENTO_CONFIRMA_NOME]: "aguardando confirmação do nome informado",
    [STAGES.ACOLHIMENTO_CONFIRMA_WHATSAPP]: "aguardando confirmação se este WhatsApp pertence à pessoa atendida",
    [STAGES.ACOLHIMENTO_CONFIRMA_WHATSAPP_OUTRO]: "aguardando escolha sobre qual número usar",
    [STAGES.ACOLHIMENTO_CIDADE]: "aguardando a cidade onde a pessoa atendida mora"
  }
  const descricaoStage = stageDescricao[stage] || "em etapa de pré-atendimento"

  // Score emocional da mensagem atual para calibrar o tom da resposta
  const sofrimentoDetectado = detectarSofrimentoIntenso(entrada)
  const emocional = scoreEmocional({ _audioCanalTranscricao: entrada, urgencia: u.urgencia })
  const nivelEmocional = emocional.nivel // "alto", "medio", "baixo"

  const instrucaoTom = sofrimentoDetectado || nivelEmocional === "alto"
    ? `ATENÇÃO: O cliente demonstra sofrimento real nesta mensagem. Antes de qualquer coisa, acolha com genuína empatia (1 frase curta e humana). Só depois, de forma suave, conduza para o dado que falta. Nunca soe burocrático ou apressado.`
    : nivelEmocional === "medio"
    ? "O cliente está preocupado. Seja atencioso e mostre que entendeu antes de pedir o dado."
    : "Seja direto, gentil e natural."

  try {
    const res = await axios.post(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        model: "llama-3.1-8b-instant",
        messages: [
          {
            role: "system",
            content: `Você é a atendente virtual do escritório Oráculum Advocacia no WhatsApp. Seu objetivo é conduzir o cliente pelo pré-cadastro de forma acolhedora e humana.

O cliente enviou uma mensagem inesperada durante o pré-atendimento. Você deve:
1. Reconhecer brevemente o que o cliente disse (máximo 2 frases, sem julgamentos)
2. Explicar com clareza o que está acontecendo agora no atendimento (1 frase)
3. Pedir de forma natural e gentil o dado que ainda falta

INSTRUÇÃO DE TOM: ${instrucaoTom}

REGRAS OBRIGATÓRIAS:
- Use emojis com moderação (1 a 3 por mensagem)
- Linguagem simples, acessível para pessoas com baixa escolaridade
- Nunca use termos jurídicos complexos
- Sempre termine perguntando o dado que falta
- Responda em português brasileiro informal e acolhedor
- NÃO invente informações sobre o escritório ou sobre o caso
- O texto de áudio deve ser igual ao texto da tela, mas SEM emojis e SEM asteriscos

Responda APENAS com JSON válido no formato:
{"textoTela":"texto com emojis e formatação WhatsApp","textoAudio":"mesmo texto sem emojis e sem asteriscos"}`
          },
          {
            role: "user",
            content: `Etapa atual: ${descricaoStage}
Contexto (dados já confirmados anteriormente): ${contextoStr}
${primeiroNome ? `Nome do cliente nesta conversa: ${primeiroNome}` : ""}
Tom emocional detectado: ${nivelEmocional}${sofrimentoDetectado ? " (sofrimento intenso detectado)" : ""}
MENSAGEM ENVIADA AGORA PELO CLIENTE (não é dado confirmado — é o que ele acabou de digitar): "${entrada}"
Dado que ainda precisa ser coletado: ${dadoFaltante}`
          }
        ],
        temperature: 0.4,
        max_tokens: 350,
        response_format: { type: "json_object" }
      },
      { headers: { Authorization: `Bearer ${GROQ_KEY}`, "Content-Type": "application/json" } }
    )

    let out = {}
    try {
      out = JSON.parse(res.data.choices?.[0]?.message?.content || "{}")
    } catch (e) {
      logErro("groq", "conduzirPreAtendimentoIA: parse JSON falhou", e)
      return null
    }

    const textoTela = sanitizarTextoEntrada(out.textoTela)
    const textoAudio = sanitizarTextoEntrada(out.textoAudio)
    if (!textoTela || textoTela.length < 10) return null

    // Sempre usa os botões conhecidos do stage atual — nunca IDs livres da IA,
    // pois IDs sem handler no servidor causam trava silenciosa no fluxo.
    const botoes = pergunta?.opcoes || null

    iniciarTimer(from)
    return await responderTelaComAudio(
      from,
      u,
      { texto: textoTela, opcoes: botoes },
      textoAudio || textoTela,
      "pre atendimento ia condutor"
    )
  } catch (e) {
    logErro("groq", "conduzirPreAtendimentoIA: " + e.message)
    return null
  }
}

async function flowAcolhimentoCidade(u, ctx = {}) {
  const from = ctx.from || u._numero || ""
  const suprimirAudio = Boolean(ctx.suprimirAudio)
  const primeiroNome = primeiroNomeCliente(u) || u.nome?.split(" ")[0] || u.nomeHubspot?.split(" ")[0] || u.nomeWA?.split(" ")[0] || ""
  const ehTerceiro = Boolean(u.atendimentoParaTerceiro || u._novoCasoParaTerceiro)
  let audioRetomadaEnviado = false
  if (u._vindoDeRetomada && !u.modoTexto && from) {
    u._vindoDeRetomada = false
    try {
      const nomeTerceiroRetomada = ehTerceiro && u.nome ? u.nome.split(" ")[0] : null
      const textoRetomada = nomeTerceiroRetomada
        ? `Certo! Você estava informando a cidade de ${nomeTerceiroRetomada}. Para continuar, me diga onde ${nomeTerceiroRetomada} mora. Você pode enviar um CEP, digitar o nome da cidade, ou enviar um áudio falando o nome da cidade.`
        : primeiroNome
          ? `Certo, ${primeiroNome}! Você estava informando sua cidade. Para continuar, me diga onde você mora. Você pode enviar um CEP, digitar o nome da cidade, ou enviar um áudio falando o nome da cidade.`
          : `Certo! Você estava informando sua cidade. Para continuar, me diga onde você mora. Você pode enviar um CEP, digitar o nome da cidade, ou enviar um áudio falando o nome da cidade.`
      const ogg = await gerarAudioAtendente(u.atendente, textoRetomada)
      await enviarAudio(from, urlAudioAtendente(ogg))
      await new Promise(r => setTimeout(r, 3000))
      audioRetomadaEnviado = true
    } catch (e) { logErro("tts", "Falha áudio retomada cidade", e) }
  }
  // Só envia áudio de pedido de cidade se não veio de uma transição que já enviou áudio
  if (!audioRetomadaEnviado && !suprimirAudio && u.modoTexto === false) {
    const nomeTerceiro = ehTerceiro && u.nome ? u.nome.split(" ")[0] : null
    await enviarAudioPedidoCidade(from, u.atendente, { nomeTerceiro })
  }
  setStage(u, STAGES.ACOLHIMENTO_CIDADE)
  salvarEtapa(u._numero || from, "acolhimento_cidade")
  const primeiroNomeAtendido = ehTerceiro && u.nome ? u.nome.split(" ")[0] : null
  const textoCidadeTela = primeiroNomeAtendido
    ? `Em qual *cidade* ${primeiroNomeAtendido} mora?\n\n_Pode digitar o nome da cidade, informar o CEP ou enviar um áudio._`
    : `Em qual *cidade* você mora${primeiroNome ? `, *${primeiroNome}*` : ""}?\n\n_Pode digitar o nome da cidade, informar o CEP ou enviar um áudio._`
  return {
    texto: `●●●●●○ 📍 Etapa 5 de 6 · *Cidade*

${textoCidadeTela}`,
    opcoes: null,
    semAudio: true
  }
}

async function flowAcolhimentoConfirmaWhatsapp(u, ctx = {}) {
  const from = ctx.from || u._numero || ""
  let digitos = from.replace(/\D/g, "")
  if (digitos.length === 12) digitos = digitos.slice(0, 4) + "9" + digitos.slice(4)
  const ddd = digitos.slice(2, 4)
  const nono = digitos.slice(4, 5)
  const bloco1 = digitos.slice(5, 9)
  const bloco2 = digitos.slice(9, 13)
  const numeroFormatado = `(${ddd}) ${nono} ${bloco1}-${bloco2}`
  const numeroAudio = `DDD ${ddd.split("").join(" ")} ${nono} ${bloco1.slice(0,2)} ${bloco1.slice(2,4)} ${bloco2.slice(0,2)} ${bloco2.slice(2,4)}`
  const primeiroNome = primeiroNomeCliente(u) || u.nome?.split(" ")[0] || u.nomeHubspot?.split(" ")[0] || u.nomeWA?.split(" ")[0] || ""
  const ehParaSi = !u.atendimentoParaTerceiro
  if (!u.modoTexto && from) {
    try {
      let textoAudio
      if (u._vindoDeRetomada) {
        textoAudio = primeiroNome
          ? `Certo, ${primeiroNome}! Você estava confirmando seu número de WhatsApp. O número ${numeroAudio} é o seu? Se for esse mesmo, toque em Confirmar. Se preferir usar outro número, é só me dizer agora.`
          : `Certo! Você estava confirmando seu número de WhatsApp. O número ${numeroAudio} é o seu? Se for esse mesmo, toque em Confirmar. Se preferir usar outro número, é só me dizer agora.`
      } else if (ehParaSi) {
        textoAudio = primeiroNome
          ? `${primeiroNome}, vou registrar o número deste WhatsApp como seu contato. É o ${numeroAudio}. Está certo? Se preferir usar outro número, é só me dizer agora. Pode falar ou digitar.`
          : `Vou registrar o número deste WhatsApp como seu contato. É o ${numeroAudio}. Está certo? Se preferir usar outro número, é só me dizer agora. Pode falar ou digitar.`
      } else {
        textoAudio = primeiroNome
          ? `${primeiroNome}, o número deste WhatsApp é ${numeroAudio}. É o seu? Se for esse mesmo, toque em Confirmar. Se não for, é só me dizer o número correto com DDD agora. Pode falar ou digitar.`
          : `O número deste WhatsApp é ${numeroAudio}. É o seu? Se for esse mesmo, toque em Confirmar. Se não for, é só me dizer o número correto com DDD agora. Pode falar ou digitar.`
      }
      const ogg = await gerarAudioAtendente(u.atendente, textoAudio)
      await enviarAudio(from, urlAudioAtendente(ogg))
      await new Promise(r => setTimeout(r, 4000))
    } catch (e) { logErro("tts", "Falha áudio whatsapp", e) }
  }
  u._vindoDeRetomada = false
  setStage(u, STAGES.ACOLHIMENTO_CONFIRMA_WHATSAPP)
  salvarEtapa(u._numero || from, "acolhimento_confirma_whatsapp")
  const textoNome = primeiroNome ? `*${primeiroNome}*` : `você`
  const textoTela = ehParaSi
    ? `●●●●○○ 📱 Etapa 4 de 6 · *WhatsApp*\n\nVamos registrar seu número de contato, ${textoNome}.\n\nSeu WhatsApp é o *${numeroFormatado}*?\n\nConfirme ou informe outro número com DDD agora. 🎙️`
    : `●●●●○○ 📱 Etapa 4 de 6 · *WhatsApp*\n\nPrecisamos confirmar seu número de contato, ${textoNome}.\n\nO número *${numeroFormatado}* é o seu WhatsApp?\n\nSe não for, é só digitar ou falar o número correto com DDD agora. 🎙️`
  return {
    texto: textoTela,
    opcoes: [
      { id: "whatsapp_sim", title: "✅ Confirmar" }
    ],
    semAudio: true
  }
}

async function telaEsclarecimentoConfuso(from, u) {
  const primeiroNome = primeiroNomeCliente(u) || ""
  const textoTela = `🤔 Posso ajudar de 4 formas rápidas:

- Registrar um caso agora (eu te guio passo a passo)
- Tirar uma dúvida sobre como o serviço funciona
- Registrar para outra pessoa (ex.: minha mãe)
- Pedir atendimento humano urgente

Como prefere continuar?`
  const textoAudio = `Posso ajudar de quatro formas rápidas: registrar um caso agora, tirar uma dúvida sobre o serviço, registrar para outra pessoa, ou pedir atendimento humano. Como prefere continuar?`
  iniciarTimer(from)
  return await responderTelaComAudio(
    from,
    u,
    {
      texto: textoTela,
      opcoes: [
        { id: "confuso_exemplos", title: "💡 Ver exemplos" },
        { id: "confuso_registrar", title: "📄 Registrar caso" },
        { id: "confuso_duvida", title: "❓ Tenho dúvida" },
        { id: "confuso_terceiro", title: "👥 É para outra pessoa" },
        { id: "confuso_humano", title: "🆘 Falar com humano" }
      ]
    },
    textoAudio,
    "esclarecimento confuso"
  )
}

async function flowNome(u, ctx) {
  return await perguntarNome(u)
}

function flowCidade(u, ctx) {
  return perguntarCidade(u)
}

async function flowDescricao(u, ctx) {
  const from = ctx?.from || u._numero || ""
  const primeiroNome = primeiroNomeCliente(u) || ""
  if (u._vindoDeRetomada && !u.modoTexto && from) {
    u._vindoDeRetomada = false
    try {
      const textoRetomada = primeiroNome
        ? `Certo, ${primeiroNome}! Você estava descrevendo seu caso. Pode continuar me contando o que aconteceu, digitando ou enviando um áudio.`
        : `Certo! Você estava descrevendo seu caso. Pode continuar me contando o que aconteceu, digitando ou enviando um áudio.`
      const ogg = await gerarAudioAtendente(u.atendente, textoRetomada)
      await enviarAudio(from, urlAudioAtendente(ogg))
      await new Promise(r => setTimeout(r, 2000))
    } catch (e) { logErro("tts", "Falha áudio retomada descricao", e) }
  }
  return perguntarDescricao(u, ehStageDescricaoCaso(u.stage) ? u.stage : STAGES.COLETA_DESC_AUDIO)
}

function flowDocumentos(u, ctx) {
  return perguntarDocumentos(ctx.from, u)
}

async function flowDescConfirma(u, ctx) {
  setStage(u, STAGES.DESC_CONFIRMA)
  salvarEtapa(u._numero, "descricao_caso")
  if (!u._descTemp) {
    await enviarAudioModoVoz(
      ctx?.from || u?._numero || "",
      u,
      "Pode me contar um pouco mais sobre seu caso. Voce pode digitar ou enviar um audio.",
      "descricao caso"
    )
    return telaDescreverCaso()
  }
  await enviarAudioModoVoz(
    ctx?.from || u?._numero || "",
    u,
    "Entendi sua descricao. Na tela, confirme se esta correta ou escolha corrigir.",
    "confirmar descricao"
  )
  return {
    texto: `Entendi assim:

"${u._descTemp}"

Está correto?`,
    opcoes: [
      { id: "desc_ok", title: "✅ Confirmar" },
      { id: "desc_corrigir", title: "✏️ Corrigir" }
    ]
  }
}

async function flowConfirmacao(u, ctx) {
  const from = ctx?.from || u._numero || ""
  const primeiroNome = primeiroNomeCliente(u) || ""
  if (u._vindoDeRetomada && !u.modoTexto && from) {
    u._vindoDeRetomada = false
    try {
      const textoRetomada = primeiroNome
        ? `Certo, ${primeiroNome}! Você parou na etapa de confirmação dos dados. Vou confirmar seus dados para dar continuidade.`
        : `Certo! Você parou na etapa de confirmação dos dados. Vou confirmar seus dados para dar continuidade.`
      const ogg = await gerarAudioAtendente(u.atendente, textoRetomada)
      await enviarAudio(from, urlAudioAtendente(ogg))
      await new Promise(r => setTimeout(r, 2000))
    } catch (e) { logErro("tts", "Falha áudio retomada confirmacao", e) }
  }
  setStage(u, STAGES.CONFIRMACAO)
  salvarEtapa(u._numero || from, "confirmacao")
  return await telaConfirmacaoComImagem(from, u)
}

async function flowCliente(u, ctx) {
  if (!podeMostrarMenuCliente(u) || !u.numeroCaso) {
    logDebug('[BLOCK] acesso indevido ao menu cliente sem numeroCaso | USER:', u._numero)
    salvarEtapa(u._numero, STAGES.AUDIO_AGUARDANDO)
    return respostaRecomecoMenuPrincipal(u)
  }
  setStage(u, STAGES.CLIENTE)
  return await menuClienteComAudio(ctx?.from || u._numero, u)
}

function flowConfirmarEntrada(u, ctx) {
  setStage(u, STAGES.CONFIRMAR_ENTRADA)
  if (u._entradaPendenteTipo && u._entradaPendenteValor) {
    const label = u._entradaPendenteTipo === "telefone"
      ? formatarTelefoneExibicao(u._entradaPendenteValor)
      : u._entradaPendenteValor
    const barra = u._entradaPendenteTipo === "nome"
      ? "●●○○○○ 👤 Etapa 2 de 6 · *Nome*\n\n"
      : u._entradaPendenteTipo === "cidade"
        ? "●●●●●○ 📍 Etapa 5 de 6 · *Cidade*\n\n"
        : ""
    return {
      texto: `${barra}Você informou: *${label}*\nEstá correto? Se não estiver, é só me dizer a informação correta agora. Pode falar ou digitar. 🎙️`,
      opcoes: [
        { id: "entrada_ok", title: "✅ Confirmar" }
      ]
    }
  }
  return {
    texto: "Confirme a informação ou me diga a correção agora. Pode falar ou digitar. 🎙️",
    opcoes: [
      { id: "entrada_ok", title: "✅ Confirmar" }
    ]
  }
}

function flowNovoCasoConfirma(u, ctx) {
  setStage(u, STAGES.NOVO_CASO_CONFIRMA)
  const from = ctx?.from || u?._numero || ""
  const primeiroNome = primeiroNomeCliente(u) || "você"
  if (!u.modoTexto && from && u.atendente) {
    gerarAudioAtendente(u.atendente,
      `Você quer abrir um novo atendimento. Escolha como prefere continuar. Primeira opção: É para mim — o novo caso será aberto em seu nome, usando seus dados cadastrados. Segunda opção: É para outra pessoa — vamos abrir um atendimento separado para outra pessoa. Terceira opção: Menu do cliente — cancela esta abertura e volta ao seu menu.`
    ).then(ogg => enviarAudio(from, urlAudioAtendente(ogg))).catch(e => logErro("tts", "Falha áudio novo caso confirma", e))
  }
  return {
    texto: `➕ *Abrir novo caso*\n\nEscolha como deseja abrir este novo atendimento:\n\n✅ *É meu número*\nO novo caso será aberto em seu nome, usando seus dados cadastrados.\n\n👤 *É de outra pessoa*\nVamos abrir um atendimento separado para outra pessoa. Primeiro você contará a situação, depois informará os dados dela. A continuidade será pelo WhatsApp dessa pessoa.\n\n🏠 *Menu do cliente*\nCancela esta abertura e volta ao seu menu, sem alterar seu caso atual.\n\n*Dados que temos de você:*\n👤 *${primeiroNome}*\n📍 ${u.cidade || "Cidade não informada"}${u.uf ? " - " + u.uf : ""}`,
    opcoes: [
      { id: "nc_meu", title: "✅ É para mim" },
      { id: "nc_outro", title: "👤 É para outra pessoa" },
      { id: "m_inicio", title: "🏠 Menu do cliente" }
    ]
  }
}

function flowColetaTelOutro(u, ctx) {
  setStage(u, STAGES.COLETA_TEL_OUTRO)
  return { texto: "👤 *Dados da pessoa atendida*\n\nTudo bem! Qual é o nome completo da pessoa que está sendo atendida?", opcoes: null }
}

function flowColetaTelWpp(u, ctx) {
  setStage(u, STAGES.COLETA_TEL_WPP)
  const primeiroNome = primeiroNomeCliente(u) || "você"
          return { texto: `●●●●○○ 📱 Etapa 4 de 6 · *WhatsApp*\n\nQual é o WhatsApp com DDD de *${primeiroNome}* para contato da equipe?`, opcoes: null }
}

async function flowColetaTelWppContato(u, ctx) {
  const from = ctx?.from || u._numero || ""
  setStage(u, STAGES.COLETA_TEL_WPP_CONTATO)
  const primeiroNomeAtendido = u.nome ? u.nome.split(" ")[0] : "a pessoa atendida"
  const numeroFormatado = formatarTelefoneExibicao(from)
  if (!u.modoTexto) {
    try {
      const ogg = await gerarAudioAtendente(u.atendente, `O atendimento de ${primeiroNomeAtendido} será pelo número ${numeroFormatado}? Se for esse mesmo, toque em Confirmar. Se for outro número, é só digitar ou falar o WhatsApp com DDD agora.`)
      await enviarAudio(from, urlAudioAtendente(ogg))
      await new Promise(r => setTimeout(r, 4000))
    } catch (e) { logErro("tts", "Falha áudio coleta wpp contato", e) }
  }
  return {
    texto: `●●●●○○ 📱 Etapa 4 de 6 · *WhatsApp*\n\nO atendimento de *${primeiroNomeAtendido}* será pelo número *${numeroFormatado}*?\n\nSe for outro número, é só digitar ou falar o WhatsApp com DDD agora. 🎙️`,
    opcoes: [
      { id: "wpp_contato_esse", title: "✅ Confirmar" }
    ]
  }
}

function flowDescErroTranscricao(u, ctx) {
  setStage(u, STAGES.DESC_ERRO_TRANSCRICAO)
  return {
    texto: "🎙️ *Não consegui ouvir esse áudio com clareza.*\n\nToque em *Corrigir* para enviar outro áudio ou escreva a situação em poucas palavras.",
    opcoes: [
      { id: "desc_corrigir", title: "✏️ Corrigir" }
    ]
  }
}

function flowAguardandoUrgente(u, ctx) {
  setStage(u, STAGES.AGUARDANDO_URGENTE)
  return { texto: `📩 *Mensagem urgente*\n\nDigite sua mensagem ou envie um áudio agora.\n\nTudo será registrado imediatamente e nossa equipe será notificada. ⚡\n\n📄 Caso: *${u.numeroCaso}*\n\n⏱️ _Prazo de retorno: até 4 horas em dias úteis._`, opcoes: null }
}

function flowUrgenteAudioErroTranscricao(u, ctx) {
  setStage(u, STAGES.URGENTE_AUDIO_ERRO_TRANSCRICAO)
  return { texto: `📩 *Mensagem urgente*\n\nDigite sua mensagem ou envie um áudio agora.\n\nTudo será registrado imediatamente e nossa equipe será notificada. ⚡\n\n📄 Caso: *${u.numeroCaso}*\n\n⏱️ _Prazo de retorno: até 4 horas em dias úteis._`, opcoes: null }
}

function flowUrgenteAudioConfirma(u, ctx) {
  setStage(u, STAGES.URGENTE_AUDIO_CONFIRMA)
  return telaConfirmarUrgente(u._urgenteAudioTexto || "")
}

function flowAudioFluxoConfirma(u, ctx) {
  salvarEtapa(u._numero, STAGES.AUDIO_AGUARDANDO)
  return respostaRecomecoMenuPrincipal(u)
}

async function flowAudioConfirmarDados(u, ctx) {
  const from = ctx?.from || u._numero || ""
  const primeiroNome = primeiroNomeCliente(u) || ""
  if (u._vindoDeRetomada && !u.modoTexto && from) {
    u._vindoDeRetomada = false
    try {
      const textoRetomada = primeiroNome
        ? `Certo, ${primeiroNome}! Você parou na etapa de confirmação dos dados. Vou confirmar seus dados para dar continuidade.`
        : `Certo! Você parou na etapa de confirmação dos dados. Vou confirmar seus dados para dar continuidade.`
      const ogg = await gerarAudioAtendente(u.atendente, textoRetomada)
      await enviarAudio(from, urlAudioAtendente(ogg))
      await new Promise(r => setTimeout(r, 2000))
    } catch (e) { logErro("tts", "Falha áudio retomada audio_confirmar_dados", e) }
  }
  setStage(u, STAGES.AUDIO_CONFIRMAR_DADOS)
  salvarEtapa(u._numero || from, "audio_confirmar_dados")
  return telaConfirmarDadosAudio(from, u)
}

async function flowAudioConfirmarTranscricao(u, ctx) {
  const from = ctx?.from || u._numero || ""
  setStage(u, STAGES.AUDIO_CONFIRMAR_TRANSCRICAO)
  salvarEtapa(u._numero || from, "audio_confirmar_transcricao")

  if (!u._audioCanalTranscricao) {
    setStage(u, STAGES.AUDIO_AGUARDANDO)
    return iniciarFluxoRelatoLivre(from, u, { boasVindas: false })
  }

  return telaConfirmarTranscricao(from, u.atendente, u._audioCanalTranscricao, u.area)
}

async function flowAudioConfirmarAreaCanal(u, ctx) {
  const from = ctx?.from || u._numero || ""
  setStage(u, STAGES.AUDIO_CONFIRMAR_AREA_CANAL)
  salvarEtapa(u._numero || from, "audio_confirmar_area_canal")

  if (!u.area && u._audioCanalTranscricao) {
    const classificacao = await classificarAreaAudio(u._audioCanalTranscricao)
    aplicarClassificacaoJuridica(u, classificacao)
  }

  return telaConfirmarAreaAudio(from, u, Boolean(u.modoTexto))
}

function flowMenuCorrecao(u, ctx) {
  setStage(u, STAGES.MENU_CORRECAO)
  return {
    texto: "✏️ Qual informação deseja corrigir?",
    opcoes: [
      { id: "cor_nome",     title: "👤 Nome" },
      { id: "cor_whatsapp", title: "📱 WhatsApp" },
      { id: "cor_cidade",   title: "📍 Cidade" },
      { id: "cor_uf",       title: "🗺️ Estado" },
      { id: "cor_situacao", title: "📌 Situação" },
      { id: "cor_detalhe",  title: "🔎 Detalhe" },
      { id: "cor_urgencia", title: "⚡ Urgência" },
      { id: "cor_desc",     title: "💬 Descrição" }
    ]
  }
}

function flowCorrigirValor(u, ctx) {
  setStage(u, STAGES.CORRIGIR_VALOR)
  if (u.corrigirCampo === "nome") return { texto: "👤 *Correção de nome*\n\nDigite o nome correto:", opcoes: null }
  if (u.corrigirCampo === "cidade") return { texto: "📍 *Correção de cidade*\n\nDigite a cidade correta:", opcoes: null }
  return { texto: "💬 *Correção da descrição*\n\nDigite a descrição correta:", opcoes: null }
}

function flowCorrigirUf(u, ctx) {
  setStage(u, STAGES.CORRIGIR_UF)
  return telaRegioes()
}

function flowCorrigirSel(u, ctx) {
  setStage(u, STAGES.CORRIGIR_SEL)
  if (u.corrigirCampo === "contribuicao") {
    return { texto: "Corrija a informação sobre contribuição ao INSS:", opcoes: [{ id: "cc_nunca", title: "❌ Nunca" }, { id: "cc_pouco", title: "⏰ Pouco tempo" }, { id: "cc_1ano", title: "📆 Mais de 1 ano" }, { id: "cc_muito", title: "🏆 Muitos anos" }] }
  }
  return { texto: "Você recebe algum benefício?", opcoes: [{ id: "cb_sim", title: "✅ Sim" }, { id: "cb_nao", title: "❌ Não" }] }
}

async function flowConfirmarCorrecao(u, ctx) {
  // Aplica a correção pendente diretamente e retorna para a confirmação geral.
  // Não exibe tela intermediária de sub-confirmação por campo.
  const from = ctx?.from || u?._numero || ""
  return await aplicarCorrecaoPendente(from, u)
}

function flowRetomadaFallback(u, ctx) {
  logErro("flow_inexistente", `Stage nao tratado: ${ctx.stageKey || "-"}`)
  logContextoExecucao({
    from: u?._numero,
    stage: ctx?.stageKey || u?.stage,
    flow: "flowRetomadaFallback",
    msg: ctx?.text
  })
  const ultimaPergunta = retomarUltimaPergunta(u)
  if (ultimaPergunta) return ultimaPergunta
  salvarEtapa(u._numero, STAGES.AUDIO_AGUARDANDO)
  return respostaRecomecoMenuPrincipal(u)
}

// Fallback humano da frase empática — contextualizado por área e urgência
function gerarFallbackEmpatico(areaLabel, urgencia) {
  const urgente = urgencia === "alta"
  const mapa = {
    "INSS":        urgente ? "Entendo que você está sem receber e isso pesa muito. Vamos cuidar disso juntos." : "Entendo o quanto essa situação com o INSS é desgastante. Pode contar comigo.",
    "Trabalhista": urgente ? "Sei que perder o emprego ou não receber é muito difícil. Estou aqui para ajudar." : "Questões de trabalho podem ser estressantes. Vou organizar tudo para nossa equipe analisar.",
    "Família":     urgente ? "Sei que situações de família são delicadas e doem. Vamos resolver isso com cuidado." : "Assuntos de família exigem atenção especial. Nossa equipe vai tratar com todo o cuidado.",
    "Consumidor":  "Você tem razão em buscar seus direitos. Nossa equipe vai analisar o que aconteceu.",
    "Penal":       urgente ? "Entendo que isso é muito sério e preocupante. Vamos agir com rapidez." : "Sei que essa situação gera muita preocupação. Nossa equipe vai analisar com atenção.",
    "Civil":       "Entendo a situação. Vamos organizar as informações para a equipe jurídica analisar.",
    "Imobiliário": "Problemas com imóvel são sérios. Nossa equipe vai verificar o que pode ser feito.",
  }
  return mapa[areaLabel] || "Entendi o que você está passando. Nossa equipe vai analisar seu caso com atenção."
}

// ================================================================
//  DETECTOR DE SOFRIMENTO EMOCIONAL NO RELATO
// ================================================================

function detectarSofrimentoIntenso(texto = "") {
  const t = normalizarTextoGatilho(texto)
  if (!t) return false
  // Sofrimento emocional explícito
  if (/\b(desesperad[ao]|desesper[ao]|nao aguento|não aguento|nao consigo mais|não consigo mais|to mal|estou mal|chorando|choro|nao sei mais|não sei mais|sem saida|sem saída|sem esperanca|sem esperança)\b/.test(t)) return true
  // Impacto financeiro severo
  if (/\b(sem dinheiro|sem renda|nao tenho nada|nao tenho como pagar|nao tenho como comer|passando fome|sem comer|sem comida|despejad|vou perder minha casa|vao me despejar|vão me despejar)\b/.test(t)) return true
  // Vulnerabilidade de terceiros
  if (/\b(meu filho|minha filha|meu bebe|minha bebe|crianca doente|criança doente|idoso|minha mae doente|meu pai doente)\b.{0,40}\b(sem|nao tem|passando|sofrendo|doente|precisando|fome)\b/.test(t)) return true
  // Urgência extrema
  if (/\b(amanha perco|amanhã perco|hoje e o ultimo dia|hoje é o último dia|prazo vence hoje|audiencia amanha|audiência amanhã|intimad.{0,20}hoje|preso|vao me prender|vão me prender)\b/.test(t)) return true
  // Ameaça ou violência
  if (/\b(ameacad|ameaçad|violencia|violência|agredid|agresso|agressao|medo de|com medo|com muito medo)\b/.test(t)) return true
  return false
}

async function flowAssessoriaInicial(u, ctx = {}) {
  const from = ctx.from || u._numero || ""
  const origemRelato = ctx.origem || "audio"
  const primeiroNome = primeiroNomeCliente(u) || "você"
  const areaLabel = u.area || "sua situação"
  const relato = u._audioCanalTranscricao || ""

  // Score emocional — usado para calibrar o tom da resposta
  const emocional = scoreEmocional(u)
  const nivelEmocional = emocional.nivel // "alto", "medio", "baixo"
  const instrucaoTom = nivelEmocional === "alto"
    ? "O usuário parece estar em sofrimento real (desespero, urgência, vulnerabilidade). Seja especialmente acolhedor, demonstre que entendeu o peso da situação. Use palavras que transmitam cuidado genuíno."
    : nivelEmocional === "medio"
    ? "O usuário está preocupado com a situação. Seja atencioso e mostre que a situação foi compreendida."
    : "Seja direto e profissional, mas ainda humano e acessível."

  // Groq — comentário empático calibrado pelo score emocional
  let comentarioGroq = null
  try {
    const prompt = `Você é assistente jurídica da Oráculum Advocacia no WhatsApp.
Área identificada: ${areaLabel}.
Relato do usuário: ${relato}
Urgência detectada: ${u.urgencia || "normal"}.

Instrução de tom: ${instrucaoTom}

Responda com EXATAMENTE 1 frase empática, mostrando que entendeu a situação do usuário.
Máximo de 25 palavras. Texto puro, sem emoji, sem formatação, sem asterisco.
Fale como pessoa, nunca como robô. Linguagem simples e acessível.
NÃO escreva nada além dessa frase.`

    const res = await axios.post(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        model: "llama-3.1-8b-instant",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 120,
        temperature: 0.7
      },
      { headers: { Authorization: `Bearer ${GROQ_KEY}`, "Content-Type": "application/json" } }
    )
    const limparLinhaComentario = linha => linha
      .replace(/^\s*(linha\s*)?\d+\s*[:.)-]\s*/i, "")
      .replace(/^\s*linha\s*\d+\s*[:.)-]\s*/i, "")
      .trim()
    const linhas = res.data.choices[0].message.content.trim().split("\n").map(limparLinhaComentario).filter(Boolean)
    comentarioGroq = `✅ *${linhas[0] || ""}*`
  } catch (e) {
    logErro("groq", "flowAssessoriaInicial tentativa 1: " + e.message)
    // Retenta com prompt simplificado
    try {
      const res2 = await axios.post(
        "https://api.groq.com/openai/v1/chat/completions",
        {
          model: "llama-3.1-8b-instant",
          messages: [{ role: "user", content: `Você é assistente jurídica da Oráculum Advocacia. O usuário tem um caso de ${areaLabel} com urgência ${u.urgencia || "normal"}. ${instrucaoTom} Responda com exatamente 1 frase empática de até 25 palavras, texto puro, sem emoji, sem prometer resultado.` }],
          max_tokens: 120,
          temperature: 0.7
        },
        { headers: { Authorization: `Bearer ${GROQ_KEY}`, "Content-Type": "application/json" } }
      )
      const linhas2 = res2.data.choices[0].message.content.trim().split("\n").map(l => l.trim()).filter(Boolean)
      comentarioGroq = `✅ *${linhas2[0] || ""}*`
    } catch (e2) {
      logErro("groq", "flowAssessoriaInicial tentativa 2: " + e2.message)
      // Fallback final — contextualizado por área e urgência, nunca genérico
      comentarioGroq = `✅ *${gerarFallbackEmpatico(areaLabel, u.urgencia)}*`
    }
  }

  // Parágrafo extra de acolhimento para score emocional alto
  let blocoAcolhimento = ""
  if (nivelEmocional === "alto") {
    blocoAcolhimento = `\n\n💙 _Entendemos que você pode estar passando por um momento difícil. Nossa equipe vai tratar o seu caso com prioridade e cuidado._`
  }

  // Áudio do comentário — limpa formatação visual antes de enviar ao TTS
  if (!u.modoTexto) {
    const sufixoAudio = ` Foi isso que entendi. Se estiver correto, toque em Está correto. Se quiser acrescentar ou corrigir algo, é só falar ou digitar agora mesmo.`
    const comentarioAudio = removerFormatacaoParaAudio(comentarioGroq + (nivelEmocional === "alto" ? " Entendemos que você pode estar passando por um momento difícil. Nossa equipe vai tratar o seu caso com prioridade e cuidado." : "")) + sufixoAudio
    let audioEnviado = false
    try {
      const ogg = await gerarAudioAtendente(u.atendente, comentarioAudio)
      await enviarAudio(from, urlAudioAtendente(ogg))
      await new Promise(r => setTimeout(r, 5000))
      audioEnviado = true
    } catch (e) { logErro("tts", "Falha áudio assessoria tentativa 1", e) }
    if (!audioEnviado) {
      try {
        const ogg2 = await gerarAudioAtendente(u.atendente, sufixoAudio.trim())
        await enviarAudio(from, urlAudioAtendente(ogg2))
        await new Promise(r => setTimeout(r, 3000))
      } catch (e2) { logErro("tts", "Falha áudio assessoria tentativa 2", e2) }
    }
  }

  setStage(u, STAGES.ASSESSORIA_INICIAL)
  salvarEtapa(u._numero || from, "assessoria_inicial")

  const textoAssessoria = `${comentarioGroq}${blocoAcolhimento}\n\nFoi isso que entendi. Está correto?\n\n_Se quiser acrescentar ou corrigir algo, é só digitar ou enviar um áudio agora._`
  const opcoesAssessoria = [
    { id: "continuar_audio", title: "✅ Está correto" }
  ]
  if (IMAGEM_POS_RELATO_URL) {
    const enviada = await enviarImagemWhatsApp(from, IMAGEM_POS_RELATO_URL, textoAssessoria, opcoesAssessoria)
    if (enviada) return { texto: null, opcoes: null }
  }
  return { texto: textoAssessoria, opcoes: opcoesAssessoria }
}

// ================================================================
//  FLOW MAP (objeto de roteamento)
// ================================================================

const flowMap = Object.freeze({
  [STAGES.INICIO]: flowInicio,
  [STAGES.INICIO_RETORNO]: flowInicioRetorno,
  [STAGES.RETOMADA_AUTOMATICA]: flowRetomadaAutomatica,
  [STAGES.RETOMADA_MENU]: flowRetomadaMenu,
  [STAGES.RESUMO_ATENDIMENTO]: flowResumoAtendimento,
  [STAGES.RESUMO_RETOMADA]: flowResumoRetomada,
  [STAGES.NOME]: flowNome,
  [STAGES.CIDADE]: flowCidade,
  [STAGES.CONFIRMAR_ENTRADA]: flowConfirmarEntrada,
  [STAGES.NOVO_CASO_CONFIRMA]: flowNovoCasoConfirma,
  [STAGES.COLETA_TEL_OUTRO]: flowColetaTelOutro,
  [STAGES.COLETA_TEL_WPP]: flowColetaTelWpp,
  [STAGES.COLETA_TEL_WPP_CONTATO]: flowColetaTelWppContato,
  [STAGES.COLETA_DESC]: flowDescricao,
  [STAGES.COLETA_DESC_AUDIO]: flowDescricao,
  [STAGES.DESCRICAO_CASO]: flowDescricao,
  [STAGES.TRAB_OUT_DESC]: flowDescricao,
  [STAGES.OUT_DESC]: flowDescricao,
  [STAGES.DOCUMENTOS]: flowDocumentos,
  [STAGES.DESC_ERRO_TRANSCRICAO]: flowDescErroTranscricao,
  [STAGES.DESC_CONFIRMA]: flowDescConfirma,
  [STAGES.AGUARDANDO_URGENTE]: flowAguardandoUrgente,
  [STAGES.URGENTE_AUDIO_ERRO_TRANSCRICAO]: flowUrgenteAudioErroTranscricao,
  [STAGES.URGENTE_AUDIO_CONFIRMA]: flowUrgenteAudioConfirma,
  [STAGES.AUDIO_FLUXO_CONFIRMA]: flowAudioFluxoConfirma,
  [STAGES.AUDIO_CONFIRMAR_DADOS]: flowAudioConfirmarDados,
  [STAGES.MENU_CORRECAO]: flowMenuCorrecao,
  [STAGES.CORRIGIR_VALOR]: flowCorrigirValor,
  [STAGES.CORRIGIR_UF]: flowCorrigirUf,
  [STAGES.CORRIGIR_SEL]: flowCorrigirSel,
  [STAGES.CONFIRMAR_CORRECAO]: flowConfirmarCorrecao,
  [STAGES.CONFIRMACAO]: flowConfirmacao,
  [STAGES.CLIENTE]: flowCliente,
  [STAGES.ACOLHIMENTO]: flowNome,
  [STAGES.ACOLHIMENTO_MODO]: flowNome,
  [STAGES.ACOLHIMENTO_PARA_QUEM]: flowNome,
  [STAGES.ACOLHIMENTO_NOME_CONTATO]: flowNome,
  [STAGES.ACOLHIMENTO_CONFIRMA_NOME_CONTATO]: flowNome,
  [STAGES.ACOLHIMENTO_NOME]: flowNome,
  [STAGES.ACOLHIMENTO_CONFIRMA_NOME]: flowNome,
  [STAGES.ACOLHIMENTO_CONFIRMA_TITULAR_NOME]: flowNome,
  [STAGES.ACOLHIMENTO_CONFIRMA_WHATSAPP]: flowAcolhimentoConfirmaWhatsapp,
  [STAGES.ACOLHIMENTO_CONFIRMA_WHATSAPP_OUTRO]: flowAcolhimentoConfirmaWhatsapp,
  [STAGES.ACOLHIMENTO_CIDADE]: flowAcolhimentoCidade,
  [STAGES.AUDIO_AGUARDANDO]: flowNome,
  [STAGES.AUDIO_PROCESSANDO]: flowNome,
  [STAGES.AUDIO_CONFIRMAR_TRANSCRICAO]: flowAudioConfirmarTranscricao,
  [STAGES.AUDIO_CONFIRMAR_AREA_CANAL]: flowAudioConfirmarAreaCanal,
  [STAGES.ASSESSORIA_INICIAL]: flowAssessoriaInicial
})

// ================================================================
//  DISPATCHER (retomarFluxo)
// ================================================================

function obterNomeFlow(flow) {
  return typeof flow === "function" && flow.name ? flow.name : "flow_desconhecido"
}

function executarFlowSeguro(flow, u, ctx = {}) {
  const flowName = obterNomeFlow(flow)
  logDebug(`[FLOW] ${flowName} | USER: ${ctx?.from || u?._numero || "-"} | STAGE: ${ctx?.stageKey || u?.stage || "-"}`)
  logContextoExecucao({
    from: ctx?.from || u?._numero,
    stage: ctx?.stageKey || u?.stage,
    flow: flowName,
    msg: ctx?.text
  })

  try {
    return flow(u, ctx)
  } catch (err) {
    logErro("flow", `Falha ao executar ${flowName}`, err)
    return criarRespostaFallbackProcessamento()
  }
}

function retomarFluxo(u, ctx = criarCtx()) {
  const etapaBruta = ctx?.stageForcada || obterEtapaSegura(u._numero) || u.lastPergunta || u.stage || STAGES.AUDIO_AGUARDANDO
  const etapa = normalizarStageKey(etapaBruta) || STAGES.AUDIO_AGUARDANDO

  logDebug("🔁 Retomando etapa:", etapa)

  if (!u.numeroCaso && ehStageFluxoAntigo(etapa)) {
    logDebug(`[RETOMADA_LEGADO] ${etapa} -> ${STAGES.AUDIO_AGUARDANDO} | USER: ${u?._numero || "-"}`)
    salvarEtapa(u._numero, STAGES.AUDIO_AGUARDANDO)
    u.lastPergunta = null
    u.lastPerguntaPayload = null
    u._stageRetomadaOriginal = null
    return respostaRecomecoMenuPrincipal(u)
  }

  const etapaAtual = normalizarStageKey(u.etapa)
  if (!etapaValida(etapaAtual) && !u.lastPerguntaPayload) {
    logDebug("⚠️ Etapa inválida/inicio → redirecionando para relato livre")
    salvarEtapa(u._numero, STAGES.AUDIO_AGUARDANDO)
    return respostaRecomecoMenuPrincipal(u)
  }

  const STAGES_SEM_FLOWMAP = new Set([
    STAGES.AGENDAMENTO_HORARIO, STAGES.AGENDAMENTO_DURACAO, STAGES.AGENDAMENTO_CONFIRMAR,
    STAGES.CORRIGIR_DADOS, STAGES.CONFIRMAR_CORRECAO_NOME, STAGES.CONFIRMAR_CORRECAO_CIDADE,
    STAGES.REVALIDA_WHATSAPP, STAGES.EDITAR_NOME, STAGES.EDITAR_CIDADE, STAGES.EDITAR_SITUACAO,
    STAGES.EDITAR_DETALHE, STAGES.EDITAR_URGENCIA, STAGES.EDITAR_DESCRICAO,
    STAGES.REVALIDA_NOME, STAGES.REVALIDA_CIDADE, STAGES.COLETA_TEL_WPP_CONFIRMA
  ])
  if (STAGES_SEM_FLOWMAP.has(etapa)) {
    return processarInterno(u._numero, u.nomeWA || "", "", { type: "text", text: { body: "" } }, u)
  }

  const flowCtx = { ...ctx, stageKey: etapa }
  const flow = flowMap[etapa]

  if (flow) return executarFlowSeguro(flow, u, flowCtx)
  logErro("flow_inexistente", `Nenhum flow encontrado para stage ${etapa || "-"} | USER: ${u?._numero || "-"} — redirecionando para INICIO`)
  return flowRetomadaFallback(u, flowCtx)
}

// ================================================================
//  PROCESSADOR (processar)
// ================================================================

async function processarRetomadaOuReinicio(from, u, text, buttonId = "", ctx = null) {
  const msg = String(text || "").toLowerCase().trim()
  const botao = String(buttonId || "").trim()
  const stageAtual = normalizarStageKey(u?.stage)
  const opcoesAtuais = new Set((u.lastPerguntaPayload?.opcoes || []).map(o => o.id))
  const contextoDescricao = opcoesAtuais.has("desc_incentivo_continuar") || opcoesAtuais.has("desc_incentivo_menu") || opcoesAtuais.has("desc_incentivo_encerrar")
  const contextoRetomada = opcoesAtuais.has("ret_auto_continuar") || opcoesAtuais.has("ret_auto_menu") || opcoesAtuais.has("cont_retomar") || opcoesAtuais.has("recomecar")
  const contextoRetomadaMenu =
    stageAtual === STAGES.RETOMADA_MENU ||
    opcoesAtuais.has("rm_continuar") ||
    opcoesAtuais.has("rm_recomecar")
  const contextoResumoRetomada =
    stageAtual === STAGES.RESUMO_RETOMADA ||
    opcoesAtuais.has("rr_continuar") ||
    opcoesAtuais.has("rr_corrigir") ||
    opcoesAtuais.has("rr_recomecar") ||
    opcoesAtuais.has("rr_encerrar")
  const contextoResumoAtendimento =
    stageAtual === STAGES.RESUMO_ATENDIMENTO ||
    opcoesAtuais.has("ra_continuar") ||
    opcoesAtuais.has("ra_corrigir") ||
    opcoesAtuais.has("ra_recomecar") ||
    opcoesAtuais.has("ra_encerrar")

  if (botao === "desc_incentivo_continuar" || (contextoDescricao && msg.includes("continuar"))) {
    const stageDescricao = ehStageDescricaoCaso(u.stage) ? u.stage : STAGES.COLETA_DESC_AUDIO
    entrarEtapaDescricao(u, stageDescricao)
    iniciarTimer(from)
    return telaDescreverCaso()
  }

  if (text === "desc_incentivo_depois") {
    return await pularDescricaoPorAgora(from, u)
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
      salvarEtapa(u._numero, STAGES.AUDIO_AGUARDANDO)
      iniciarTimer(from)
      return respostaRecomecoMenuPrincipal(u)
    }
    if (!podeMostrarMenuCliente(u)) {
      salvarEtapa(u._numero, STAGES.AUDIO_AGUARDANDO)
      iniciarTimer(from)
      return await responderTelaComAudio(
        from,
        u,
        respostaRecomecoMenuPrincipal(u),
        "Tudo bem. Vamos recomeçar com calma. Pode me contar sua situação novamente por áudio ou texto. Estou aqui para ajudar você.",
        "recomeco menu principal"
      )
    }
    setStage(u, STAGES.CLIENTE)
    iniciarTimer(from)
    return await menuClienteComAudio(from, u)
  }

  if (
    botao === "desc_incentivo_encerrar" ||
    botao === "m_encerrar" ||
    ((contextoDescricao || contextoRetomada) && msg.includes("encerrar"))
  ) {
    return executarEncerramentoFluxo(from, u)
  }

  if (
    botao === "ret_auto_continuar" ||
    (contextoRetomada && msg.includes("continuar"))
  ) {
    u._stageRetomadaOriginal = obterStageRetomadaOriginal(u)
    const resposta = await flowRetomadaMenu(u, ctx || criarCtx({ from, nomeWA: u.nomeWA, text, buttonId }))
    iniciarTimer(from)
    return resposta
  }

  // cont_retomar é pausa temporária — restaurar tela exata, sem fluxo intermediário
  if (botao === "cont_retomar") {
    limparTimer(u)
    u.aguardandoResposta = false
    u.aguardandoRetomada = false
    iniciarTimer(from)
    const telaAnterior = retomarUltimaPergunta(u)
    if (telaAnterior) {
      // restaurar o stage exato do momento da pausa para que o próximo
      // input do usuário seja processado no flow correto (ex: AUDIO_AGUARDANDO
      // e não NOVO_CASO_CONFIRMA, que causava volta à tela "É para mim / outra pessoa")
      if (u._stageRetomadaOriginal) {
        setStage(u, u._stageRetomadaOriginal)
        u._stageRetomadaOriginal = null
      }
      if (!u.modoTexto && from) {
        try {
          const nomeRetomada = getPrimeiroNomeRetomada(u)
          const stageAtual = u?._stageRetomadaOriginal || u?.stage || ""
          const labelEtapaCont = {
            acolhimento_nome: "informar seu nome",
            acolhimento_confirma_nome: "confirmar seu nome",
            acolhimento_confirma_whatsapp: "confirmar seu WhatsApp",
            acolhimento_cidade: "informar sua cidade",
            assessoria_inicial: "escolher como você prefere ser atendido",
            coleta_desc: "descrever seu caso",
            gatilho: "avaliação de urgência",
            confirmacao: "confirmação final dos dados"
          }
          const etapaLegivelCont = labelEtapaCont[stageAtual] || "onde você havia parado"
          const textoAudio = nomeRetomada
            ? `Certo, ${nomeRetomada}! Vamos continuar. Você estava na etapa de ${etapaLegivelCont}.`
            : `Certo! Vamos continuar. Você estava na etapa de ${etapaLegivelCont}.`
          const ogg = await gerarAudioAtendente(u.atendente, textoAudio)
          await enviarAudio(from, urlAudioAtendente(ogg))
          await new Promise(r => setTimeout(r, 2000))
        } catch (e) { logErro("tts", "Falha áudio cont_retomar", e) }
      }
      return telaAnterior
    }
    // Fallback: se não há snapshot, usar retomarFluxo normalmente
    u._stageRetomadaOriginal = obterStageRetomadaOriginal(u)
    return await flowRetomadaMenu(u, ctx || criarCtx({ from, nomeWA: u.nomeWA, text, buttonId }))
  }

  if (
    botao === "rm_continuar" ||
    (contextoRetomadaMenu && (msg === "1" || msg.includes("continuar")))
  ) {
    setStage(u, STAGES.RESUMO_RETOMADA)
    iniciarTimer(from)
    return await flowResumoRetomada(u, { from })
  }

  if (
    botao === "rm_recomecar" ||
    text === "recomecar" ||
    (contextoRetomadaMenu && (msg === "2" || msg.includes("recome")))
  ) {
    u._retomadaEhLeadFrio = false
    if (u.numeroCaso) {
      return responderComTimer(from, await menuClienteComAudio(from, u))
    }
    // recomeçar faz revalidação progressiva dos dados preservados
    u._revalidandoCampos = true
    u.aguardandoResposta = false
    u.aguardandoRetomada = false
    setStage(u, STAGES.AUDIO_AGUARDANDO)
    iniciarTimer(from)
    const primeiroNomeRec = primeiroNomeCliente(u) || ""
    const saudacaoRec = primeiroNomeRec ? `, ${primeiroNomeRec}` : ""
    const textoRec = `Tudo bem${saudacaoRec}. Vamos recomeçar com calma. Pode me contar sua situação novamente${u.modoTexto ? " por texto" : " por áudio ou texto"}. Estou aqui para ajudar você.`
    if (!u.modoTexto) {
      try {
        const ogg = await gerarAudioAtendente(u.atendente, textoRec)
        await enviarAudio(from, urlAudioAtendente(ogg))
        await new Promise(r => setTimeout(r, 3000))
      } catch (e) { logErro("tts", "Falha audio recomeçar pausa", e) }
    }
    return {
      texto: `🔄 Tudo bem${saudacaoRec} 😊\n\nVamos *recomeçar* com calma.\n\nPode me contar sua situação novamente${u.modoTexto ? " por texto" : " por áudio ou texto"}. Estou aqui para ajudar você.`,
      opcoes: null
    }
  }

  if (
    botao === "ra_continuar" ||
    (contextoResumoAtendimento && msg.includes("continuar"))
  ) {
    u._retomadaEhLeadFrio = false
    const stageRetomada = obterStageRetomadaOriginal(u)
    u._stageRetomadaOriginal = null
    const resposta = retomarFluxo(u, { ...(ctx || criarCtx({ from, nomeWA: u.nomeWA, text, buttonId })), stageForcada: stageRetomada })
    iniciarTimer(from)
    return resposta
  }

  if (
    botao === "ra_corrigir" ||
    (contextoResumoAtendimento && msg.includes("corrigir"))
  ) {
    u._retomadaEhLeadFrio = false
    iniciarTimer(from)
    setStage(u, STAGES.MENU_CORRECAO)
    return flowMenuCorrecao(u)
  }

  if (
    botao === "ra_recomecar" ||
    (contextoResumoAtendimento && msg.includes("recome"))
  ) {
    reiniciarFluxoRetomada(u)
    iniciarTimer(from)
    return respostaRecomecoMenuPrincipal(u)
  }

  if (
    botao === "ra_encerrar" ||
    (contextoResumoAtendimento && msg.includes("encerrar"))
  ) {
    return executarEncerramentoFluxo(from, u)
  }

  if (
    botao === "rr_continuar" ||
    (contextoResumoRetomada && msg.includes("continuar"))
  ) {
    u._retomadaEhLeadFrio = false
    const stageRetomada = obterStageRetomadaOriginal(u)
    u._stageRetomadaOriginal = null
    u._vindoDeRetomada = true
    const resposta = retomarFluxo(u, { ...(ctx || criarCtx({ from, nomeWA: u.nomeWA, text, buttonId })), stageForcada: stageRetomada })
    iniciarTimer(from)
    return resposta
  }

  if (
    botao === "rr_corrigir" ||
    (contextoResumoRetomada && msg.includes("corrigir"))
  ) {
    u._retomadaEhLeadFrio = false
    u._correcaoOrigem = "resumo_retomada"
    iniciarTimer(from)
    setStage(u, STAGES.MENU_CORRECAO)
    return flowMenuCorrecaoRetomada(u)
  }

  if (
    botao === "rr_recomecar" ||
    (contextoResumoRetomada && msg.includes("recome"))
  ) {
    u._retomadaEhLeadFrio = false
    if (u.numeroCaso) {
      return responderComTimer(from, await menuClienteComAudio(from, u))
    }
    limparDadosAtendimento(u)
    return await executarRecomecoFluxo(from, u)
  }

  if (
    botao === "rr_encerrar" ||
    (contextoResumoRetomada && msg.includes("encerrar"))
  ) {
    return executarEncerramentoFluxo(from, u)
  }

  if (contextoRetomadaMenu && (text || buttonId)) {
    iniciarTimer(from)
    return respostaOpcaoInvalidaRetomada()
  }

  if (text === "audio_fluxo_encerrar") {
    return executarEncerramentoFluxo(from, u)
  }

  return null
}

async function verificarRetomadaAutomatica(from, u) {
  if (!u) return null
  logDebug("[RETOMADA]", {
    podeRetomar: podeRetomar(from),
    jaOfereceuRetomada: u.jaOfereceuRetomada,
    negocioId: u.negocioId,
    numeroCaso: u.numeroCaso,
    stage: u.stage,
    aguardandoResposta: u.aguardandoResposta
  })
  if (!podeRetomar(from)) return null
  if (u.jaOfereceuRetomada) return null
  // Cliente ativo com caso confirmado — não precisa de retomada
  if (u.numeroCaso) return null

  // Se tem negocioId em memória mas não tem numeroCaso,
  // pode ser retomada — deixa continuar a verificação
  // mas reseta o negocioId para buscar dados frescos do HubSpot
  if (u.negocioId && !u.numeroCaso) {
    u.negocioId = null
    u.jaOfereceuRetomada = false
  }
  if (u.stage !== STAGES.INICIO) return null

  logDebug("🔁 Verificando retomada para:", from)
  const contato = await hsBuscarPorPhone(getTelefoneContato(from, u))
  if (!contato?.id) return null

  logDebug("Contato encontrado:", contato.id)
  const negocio = await hsBuscarNegocioAbertoInfoDoContato(contato.id)
  if (!negocio?.id) return null

  logDebug("Negócio aberto encontrado:", negocio.id)
  u.contatoId = contato.id
  u.negocioId = negocio.id
  const nomeHS = contato.properties?.firstname
  u.nomeHubspot = (nomeHS && nomeHS !== "cliente" && nomeHS !== "você" ? nomeHS : null) || u.nomeHubspot || null
  u.nome = (u.nome && u.nome !== "cliente" ? u.nome : null) || u.nomeHubspot || u.nomeWA || null
  u.area = u.area || contato.properties?.area_juridica || "Atendimento em andamento"
  u.negocioStageId = negocio.stageId || u.negocioStageId || null
  restaurarEstadoNegocioHubSpot(u, negocio)
  if (u.numeroCaso) {
    logDebug("🔁 Cliente com número de caso restaurado pelo HubSpot; enviando menu cliente")
    setStage(u, STAGES.CLIENTE)
    u._fluxoEncerrado = false
    u.aguardandoRetomada = false
    u.jaOfereceuRetomada = false
    return await menuClienteComAudio(from, u)
  }
  if (!usuarioTemRelatoParaRetomada(u)) {
    logDebug("🔁 Retomada ignorada: usuario ainda nao enviou relato")
    u.aguardandoRetomada = false
    u.jaOfereceuRetomada = false
    u._retomadaEhLeadFrio = false
    u._stageRetomadaOriginal = null
    u.etapa = null
    u.lastPergunta = null
    u.lastPerguntaPayload = null
    u.aguardandoResposta = false
    setStage(u, STAGES.ACOLHIMENTO)
    return null
  }
  setStage(u, STAGES.RETOMADA_AUTOMATICA)
  u.jaOfereceuRetomada = true
  u._retomadaEhLeadFrio = u.negocioStageId === HS_STAGE.LEAD
  u._stageRetomadaOriginal = obterStageRetomadaOriginal(u)

  // áudio obrigatório ANTES da tela de reengajamento — sempre, independente de modo
  if (u.atendente) {
    const primeiroNomeRetomada = getPrimeiroNomeRetomada(u) || "você"
    try {
      const ogg = await gerarAudioAtendente(u.atendente,
        `Olá, ${primeiroNomeRetomada}! Que bom te ver de volta. Seu último atendimento foi com a atendente ${u.atendente}. Você iniciou um atendimento, mas não chegou a concluir. Estou aqui para te ajudar a continuar de onde parou.`)
      await enviarAudio(from, urlAudioAtendente(ogg))
      await new Promise(r => setTimeout(r, 4000))
    } catch (e) { logErro("tts", "Falha áudio retomada automática", e) }
  }

  return await flowRetomadaMenu(u)
}

async function tentarRestaurarClienteHubSpotParaMenu(from, u) {
  if (!u || u.numeroCaso) return false
  const contato = await hsBuscarPorPhone(getTelefoneContato(from, u))
  if (!contato?.id) return false
  const negocio = await hsBuscarNegocioAbertoInfoDoContato(contato.id)
  if (!negocio?.id) return false
  u.contatoId = contato.id
  u.negocioId = negocio.id
  restaurarEstadoNegocioHubSpot(u, negocio)
  if (!u.numeroCaso) return false
  setStage(u, STAGES.CLIENTE)
  u._fluxoEncerrado = false
  u.aguardandoRetomada = false
  u.jaOfereceuRetomada = false
  u.lastPergunta = null
  u.lastPerguntaPayload = null
  return true
}

async function processarMidia(from, nomeWA, u, msgObj, tipo, ehAudio, ehDoc) {
  if (!(ehAudio || ehDoc)) return null
  if (![STAGES.CLIENTE, STAGES.AGUARDANDO_URGENTE, STAGES.COLETA_DESC_AUDIO, "trab_out_desc", "out_desc"].includes(u.stage)) return null

  const mediaId  = msgObj?.[tipo]?.id
  const nomeArq  = msgObj?.document?.filename || (tipo === "image" ? `imagem_${Date.now()}.jpg` : `audio_${Date.now()}`)
  const mimeType = msgObj?.[tipo]?.mime_type || "application/octet-stream"

  if (!mediaId) {
    return responderComTimer(from, { texto: "Nao consegui identificar o arquivo. Tente enviar novamente como foto ou PDF.", opcoes: [{ id:"m_docs", title:"Tentar novamente" }, { id:"m_inicio", title:"🏠 Menu do cliente" }] })
  }
  if (!u.pastaDriveId && ![STAGES.COLETA_DESC_AUDIO, "trab_out_desc", "out_desc"].includes(u.stage)) {
    if (u.numeroCaso) {
      const pasta = await criarPastaCliente(u.numeroCaso, u.nome || nomeWA || "Cliente", u.area, u.situacao, u.tipo)
      if (pasta?.id) {
        u.pastaDriveId = pasta.id
        u.pastaDriveLink = pasta.webViewLink || u.pastaDriveLink || null
      }
    }
    if (!u.pastaDriveId) {
      return responderComTimer(from, { texto: "⏳ Sua pasta está sendo preparada. Aguarde um instante e tente novamente.", opcoes: [{ id:"m_docs", title:"Tentar novamente" }, { id:"m_inicio", title:"🏠 Menu do cliente" }] })
    }
  }

  await enviar(from, ehAudio ? "👂 Estou ouvindo seu áudio..." : "📎 Recebi seu arquivo. Estou salvando...", null, false)
  const midia = await baixarMidia(mediaId)
  if (!midia) {
    return responderComTimer(from, { texto: "❌ Não consegui baixar o arquivo. Tente reenviar.", opcoes: [{ id:"m_docs", title:"Tentar novamente" }, { id:"m_inicio", title:"🏠 Menu do cliente" }] })
  }

  if (ehAudio) {
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

    if (u.stage === STAGES.CLIENTE && trans) {
      const emFluxoDocumentoAudio = Boolean(u._docsClienteGuiado || u.etapa === "documentos")
      if (emFluxoDocumentoAudio) {
        const { doc: docAudio, folha: folhaAudio } = getDocumentoAtualGuia(u)
        if (docAudio) {
          await hsCriarNota(
            u.contatoId,
            "OBSERVACAO EM AUDIO SOBRE DOCUMENTO",
            `De: ${u.nome || "-"} (${from})\nCaso: ${u.numeroCaso || "-"}\nDocumento atual: ${docAudio.label}\nItem: ${folhaAudio}\n\nTranscricao:\n"${trans}"`
          )
          await enviarAudioModoVoz(
            from,
            u,
            `Áudio anotado no seu caso. ${fraseEnvioDocumentoAudio(docAudio, folhaAudio)} Se preferir, você pode continuar depois ou voltar ao menu do cliente.`,
            "audio observacao documento"
          )
          iniciarTimer(from)
          return {
            texto: `✅ Áudio anotado no seu caso.\n\nAgora envie *${folhaAudio}* do documento *${docAudio.label}* quando estiver pronto.`,
            opcoes: [
              { id: "docs_depois", title: "Continuar depois" },
              { id: "m_inicio", title: "🏠 Menu do cliente" }
            ]
          }
        }
      }
      const intencaoAudio = detectarIntencaoCliente(trans)
      if (intencaoAudio === "novo_caso" && pareceNovaSituacaoCliente(trans)) {
        u._audioClientePendenteTexto = normalizarTextoCRM(trans)
        u._audioClientePendenteArquivo = arquivoAud?.webViewLink || null
        return responderComTimer(from, await confirmarAberturaNovoCasoCliente(from, u))
      }
      if (intencaoAudio) {
        const respostaIntencao = await executarIntencaoCliente(from, u, intencaoAudio, trans)
        if (respostaIntencao) return responderComTimer(from, respostaIntencao)
      }
      if (pareceNovaSituacaoCliente(trans)) {
        u._audioClientePendenteTexto = normalizarTextoCRM(trans)
        u._audioClientePendenteArquivo = arquivoAud?.webViewLink || null
        const telaAudioCasoAtualOuNovo = telaAudioClienteCasoAtualOuNovo(trans)
        await enviarAudioModoVoz(
          from,
          u,
          `Recebi seu áudio. Essa mensagem é sobre o caso atual ou você quer abrir um novo caso? ${textoAudioOpcoes(telaAudioCasoAtualOuNovo.opcoes)}`,
          "áudio cliente caso atual ou novo"
        )
        return responderComTimer(from, telaAudioCasoAtualOuNovo)
      }
    }

    if (eUrg) {
      if (!trans) {
        u._urgenteAudioBuffer = midia.buffer
        u._urgenteAudioMime = midia.mimeType
        u._urgenteAudioNome = nomeCliente
        u._urgenteAudioTexto = null
        setStage(u, STAGES.URGENTE_AUDIO_ERRO_TRANSCRICAO)
        return responderComTimer(from, {
          texto: "Não consegui ouvir esse áudio com clareza. Pode mandar de novo ou escrever em poucas palavras?",
          opcoes: [{ id: "urg_audio_corrigir", title: "✏️ Corrigir" }]
        })
      }

      u._urgenteAudioBuffer = midia.buffer
      u._urgenteAudioMime = midia.mimeType
      u._urgenteAudioNome = nomeCliente
      u._urgenteAudioTexto = normalizarTextoCRM(trans)
      setStage(u, STAGES.URGENTE_AUDIO_CONFIRMA)
      return responderComTimer(from, await telaConfirmarUrgenteComAudio(from, u, u._urgenteAudioTexto))
    }

    if (eDescricao || eDescricaoLivre) {
      if (!trans) {
        const origemDescricao = u.stage
        setStage(u, STAGES.DESC_ERRO_TRANSCRICAO)
        u._descOrigemStage = origemDescricao
        return responderComTimer(from, {
          texto: "Não consegui ouvir esse áudio com clareza. Pode mandar de novo ou escrever em poucas palavras?",
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
    if (u.stage !== STAGES.CLIENTE) {
      u.documentosEnviados = true
      salvarEtapa(u._numero, "documentos")
    }
    if (u.stage === STAGES.AGUARDANDO_URGENTE) setStage(u, STAGES.CLIENTE)

    const msgAudio = trans
      ? `✅ Áudio salvo!\n\n🗣️ O que entendemos:\n"${trans.slice(0, 300)}${trans.length > 300 ? "..." : ""}"`
      : "✅ Áudio salvo na pasta do caso.\nNossa equipe vai ouvir em breve."
    return responderComTimer(from, { texto: msgAudio, opcoes: [{ id:"m_docs", title:"📎 Enviar documentos" }, { id:"m_adv", title:"👨‍⚖️ Falar com advogado" }, { id:"m_inicio", title:"🏠 Menu do cliente" }] })
  }

  if (u.stage === STAGES.CLIENTE && ehDoc && !u._docsClienteGuiado) {
    const prN = formatarNome(u.nome || nomeWA || "cliente").split(" ")[0]
    const ulN = formatarNome(u.nome || nomeWA || "").split(" ").filter(Boolean).slice(-1)[0] || ""
    const nCli = ulN && ulN !== prN ? `${prN} ${ulN}` : prN
    const ext = (nomeArq || "").split(".").pop()
    const nomeFinal = `Aguardando classificacao - ${nCli}${ext && ext.length <= 4 ? "." + ext : ".jpg"}`
    const arquivo = await uploadDrive(u.pastaDriveId, nomeFinal, midia.buffer, midia.mimeType)
    if (!arquivo) {
      return responderComTimer(from, { texto: "❌ Não consegui salvar. Pode tentar novamente?", opcoes: [{ id:"m_docs", title:"📎 Enviar documentos" }, { id:"m_inicio", title:"🏠 Menu do cliente" }] })
    }
    u._docClientePendenteArquivo = arquivo.webViewLink || null
    u._docClientePendenteId = arquivo.id || null
    u._docClientePendenteNome = nomeFinal
    await hsCriarNota(
      u.contatoId,
      "DOCUMENTO RECEBIDO - AGUARDANDO CLASSIFICACAO",
      `De: ${u.nome || "-"} (${from})\nCaso: ${u.numeroCaso || "-"}\nArquivo: ${nomeFinal}\nStatus: aguardando classificacao pelo cliente${arquivo.webViewLink ? `\nDrive: ${arquivo.webViewLink}` : ""}`
    )
    await enviarAudioModoVoz(
      from,
      u,
      "Recebi um arquivo. Deseja anexar esse documento ao seu caso? Toque em Sim para confirmar ou em Menu do cliente para voltar.",
      "classificar documento cliente"
    )
    const casoInfoAvulso = u.numeroCaso ? `\n\n📄 *${u.numeroCaso}* · ${iconeAreaJuridica(u.area || "")} ${u.area || "—"}\n_${formatarSituacaoJuridica(u.situacao, u.tipo, u.subTipo) || "Em análise"}_` : ""
    const telaAvulso = {
      texto: `📎 *Recebi seu arquivo!*${casoInfoAvulso}\n\nDeseja anexar ao seu caso?`,
      opcoes: [
        { id: "doc_cliente_anexar", title: "✅ Sim, anexar" },
        { id: "m_inicio", title: "🏠 Menu do cliente" }
      ]
    }
    const enviadaAvulso = IMAGEM_DOC_AVULSO_URL
      ? await enviarImagemWhatsApp(from, IMAGEM_DOC_AVULSO_URL, telaAvulso.texto, telaAvulso.opcoes)
      : false
    if (!enviadaAvulso) return responderComTimer(from, telaAvulso)
    registrarUltimaPergunta(u, telaAvulso)
    iniciarTimer(from)
    return {}
  }

  garantirListasDocumentos(u)

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
  const arquivoEhPdf = /pdf/i.test(midia.mimeType || mimeType || "") || /\.pdf$/i.test(nomeArq || "")

  const arquivo = await uploadDrive(u.pastaDriveId, nArqFinal, midia.buffer, midia.mimeType)
  if (!arquivo) {
    return responderComTimer(from, { texto: "❌ Não consegui salvar. Pode tentar novamente?", opcoes: [{ id:"m_docs", title:"Tentar novamente" }, { id:"m_adv", title:"👨‍⚖️ Falar com advogado" }, { id:"m_inicio", title:"🏠 Menu do cliente" }] })
  }

  u.ultimoArqId = arquivo.id
  u.ultimoArqNome = nArqFinal
  u.documentosEnviados = true
  salvarEtapa(u._numero, "documentos")
  if (u.stage === STAGES.AGUARDANDO_URGENTE) setStage(u, STAGES.CLIENTE)

  // Atualiza stage no HubSpot com lógica correta:
  // - Se stage protegido (AGENDAMENTO/PROTOCOLO/etc) OU há evento de calendário ativo: não move, cria nota
  // - Se não protegido: AGUARDANDO_DOCS se ainda há pendentes, DOCS se todos enviados
  if (u.negocioId) {
    const stagesProtegidos = [HS_STAGE.AGENDAMENTO, HS_STAGE.PROTOCOLO, HS_STAGE.PROCESSO, HS_STAGE.FINAL]
    const temAgendamento = stagesProtegidos.includes(u.negocioStageId) || Boolean(u._eventoCalendarId)
    if (temAgendamento) {
      await hsCriarNotaNegocio(u.negocioId, "DOCUMENTO ENVIADO DURANTE AGENDAMENTO",
        `${u.nome || "-"} (${from}) enviou um documento enquanto há consulta agendada.\nCaso: ${u.numeroCaso || "-"}\nArquivo: ${nArqFinal}`)
    } else {
      const pendentesAposEnvio = getDocsPendentes(u)
      const stageCorreto = pendentesAposEnvio.length > 0 ? HS_STAGE.AGUARDANDO_DOCS : HS_STAGE.DOCS
      await hsMoverStage(u.negocioId, stageCorreto)
      u.negocioStageId = stageCorreto
    }
  }

  await hsCriarNota(u.contatoId, "DOCUMENTO RECEBIDO", `De: ${u.nome} (${from})\nCaso: ${u.numeroCaso}\nArquivo: ${nArqFinal}\nDrive: ${arquivo.webViewLink}`)

  u.docAtualIdx = arquivoEhPdf ? folhas.length : fIdx + 1
  const rgAguardandoVerso = docAtual?.id === "doc_rg" && !arquivoEhPdf && u.docAtualIdx < folhas.length
  const docAtualCompleto = arquivoEhPdf || u.docAtualIdx >= folhas.length
  const temProximoDoc = pendentes.length > 1
  const proximaAcaoTitle = !docAtualCompleto ? "Próxima página" : temProximoDoc ? "Próximo documento" : "Concluir envio"
  const statusRecebido = docAtualCompleto
    ? montarStatusDocumentosVisual(u, { docConcluidoId: docAtual?.id || null })
    : montarStatusDocumentosVisual(u, { docEmAndamentoId: docAtual?.id || null })
  const textoFinalTela = !docAtualCompleto
    ? `Envie a próxima parte quando estiver pronto.`
    : temProximoDoc
      ? `Toque em *Próximo documento* quando estiver pronto.`
      : `Todos os documentos foram enviados. Toque em *Concluir envio* para finalizar.`
  const textoAudioRecebido = arquivoEhPdf
    ? `${lblD} recebido em PDF. Vou considerar este documento completo. Na tela, você pode ${temProximoDoc ? "seguir para o próximo documento" : "concluir o envio"} ou continuar depois.`
    : rgAguardandoVerso
      ? `${lblD}, ${folha}, recebido. Se o verso estiver nessa mesma imagem, toque em Usar mesma foto. Se quiser seguir sem o verso, toque em Seguir sem verso. Se preferir parar por agora, toque em Continuar depois.`
    : !docAtualCompleto
      ? `${lblD}, ${folha}, recebido. Envie a próxima parte quando estiver pronto ou toque em Continuar depois para parar por agora.`
      : temProximoDoc
        ? `${lblD} recebido. Na tela, você pode enviar complemento, seguir para o próximo documento ou continuar depois.`
        : `${lblD} recebido. Todos os documentos foram enviados. Toque em Concluir envio para finalizar ou em Continuar depois para parar por agora.`
  await enviarAudioModoVoz(
    from,
    u,
    textoAudioRecebido,
    "documento guiado recebido"
  )
  const telaRecebido = {
    texto: `✅ *${lblD}${docAtualCompleto ? "" : ` — ${folha}`}* recebido!\n\n📊 *Andamento do envio*\n${statusRecebido.texto}\n\n${textoFinalTela}`,
    opcoes: arquivoEhPdf
      ? [
          { id:"docs_proxdoc", title: proximaAcaoTitle },
          { id: "docs_depois", title: "Continuar depois" }
        ]
      : (rgAguardandoVerso
        ? [
            { id:"docs_rg_verso_junto", title: "Usar mesma foto" },
            { id:"docs_rg_sem_verso", title: "Seguir sem verso" },
            { id: "docs_depois", title: "Continuar depois" }
          ]
      : (!docAtualCompleto
        ? [
            { id:"docs_proxdoc", title: "Próxima página" },
            { id:"docs_pular_doc", title: "Sem esta parte" },
            { id: "docs_depois", title: "Continuar depois" }
          ]
        : [
            { id:"docs_maisFotos", title:"Enviar complemento" },
            { id:"docs_proxdoc", title: proximaAcaoTitle },
            { id: "docs_depois", title: "Continuar depois" }
          ]))
  }
  const enviadaRecebido = await enviarImagemWhatsApp(from, IMAGEM_DOC_RECEBIDO_URL, telaRecebido.texto, telaRecebido.opcoes)
  registrarUltimaPergunta(u, telaRecebido)
  iniciarTimer(from)
  if (enviadaRecebido) return {}
  return telaRecebido
}

async function proximaConfirmacaoProgressiva(from, u) {
  const campos = [
    {
      chave: "nome",
      preenchido: () => !!(u.nome && u.nome.trim().length > 2),
      confirmar: async () => {
        const pergunta = `●●○○○○ 👤 Etapa 2 de 6 · *Nome*\n\n👤 Seu nome está como *${u.nome}*. Está correto?\n\nSe não estiver, é só me dizer o nome correto agora. Pode falar ou digitar. 🎙️`
        const opcoes = [
          { id: "revalida_nome_ok", title: "✅ Confirmar" }
        ]
        if (!u.modoTexto) {
          try {
            const ogg = await gerarAudioAtendente(u.atendente, `Seu nome está como ${u.nome}. Está correto? Se estiver, toque em Confirmar. Se não estiver, é só me dizer o nome correto agora. Pode falar ou digitar.`)
            await enviarAudio(from, urlAudioAtendente(ogg))
            await new Promise(r => setTimeout(r, 2000))
          } catch (e) { logErro("tts", "Falha áudio confirmar nome", e) }
        }
        setStage(u, STAGES.REVALIDA_NOME)
        iniciarTimer(from)
        return responderComTimer(from, { texto: pergunta, opcoes })
      },
      coletar: async () => {
      const pergunta = `●●○○○○ 👤 Etapa 2 de 6 · *Nome*\n\n😊 Fico feliz em poder ajudar! Para começar, qual é o seu nome completo?`
        if (!u.modoTexto) {
          try {
            const ogg = await gerarAudioAtendente(u.atendente, `Qual é o seu nome completo?`)
            await enviarAudio(from, urlAudioAtendente(ogg))
            await new Promise(r => setTimeout(r, 2000))
          } catch (e) { logErro("tts", "Falha áudio coletar nome", e) }
        }
        setStage(u, STAGES.ACOLHIMENTO_NOME)
        iniciarTimer(from)
        return responderComTimer(from, { texto: pergunta, opcoes: null })
      }
    },
    {
      chave: "whatsapp",
      preenchido: () => !!u.whatsappVerificado,
      confirmar: async () => {
        let _dig = from.replace(/\D/g, "")
        if (_dig.length === 12) _dig = _dig.slice(0, 4) + "9" + _dig.slice(4)
        const _ddd = _dig.slice(2, 4)
        const _nono = _dig.slice(4, 5)
        const _b1 = _dig.slice(5, 9)
        const _b2 = _dig.slice(9, 13)
        const numExib = `(${_ddd}) ${_nono} ${_b1}-${_b2}`
        const pergunta = `●●●●○○ 📱 Etapa 4 de 6 · *WhatsApp*\n\nSeu WhatsApp está como *${numExib}*. Está correto?\n\nSe não estiver, é só digitar ou falar o número correto com DDD agora. 🎙️`
        const opcoes = [
          { id: "revalida_whatsapp_ok", title: "✅ Confirmar" }
        ]
        if (!u.modoTexto) {
          try {
            const _numAudio = `DDD ${_ddd.split("").join(" ")} ${_nono} ${_b1.slice(0,2)} ${_b1.slice(2,4)} ${_b2.slice(0,2)} ${_b2.slice(2,4)}`
            const ogg = await gerarAudioAtendente(u.atendente, `Seu WhatsApp está como ${_numAudio}. Está correto? Se estiver, toque em Confirmar. Se não estiver, é só digitar ou falar o número correto com DDD agora.`)
            await enviarAudio(from, urlAudioAtendente(ogg))
            await new Promise(r => setTimeout(r, 2000))
          } catch (e) { logErro("tts", "Falha áudio confirmar whatsapp", e) }
        }
        setStage(u, STAGES.REVALIDA_WHATSAPP)
        iniciarTimer(from)
        return responderComTimer(from, { texto: pergunta, opcoes })
      },
      coletar: async () => {
        let _dig = from.replace(/\D/g, "")
        if (_dig.length === 12) _dig = _dig.slice(0, 4) + "9" + _dig.slice(4)
        const _ddd = _dig.slice(2, 4)
        const _nono = _dig.slice(4, 5)
        const _b1 = _dig.slice(5, 9)
        const _b2 = _dig.slice(9, 13)
        const numExib = `(${_ddd}) ${_nono} ${_b1}-${_b2}`
        if (!u.modoTexto) {
          try {
            const _numAudio = `DDD ${_ddd.split("").join(" ")} ${_nono} ${_b1.slice(0,2)} ${_b1.slice(2,4)} ${_b2.slice(0,2)} ${_b2.slice(2,4)}`
            const ogg = await gerarAudioAtendente(u.atendente, `Este WhatsApp tem o número ${_numAudio}. É o seu? Se não for, é só me dizer o número correto com DDD agora. Pode falar ou digitar.`)
            await enviarAudio(from, urlAudioAtendente(ogg))
            await new Promise(r => setTimeout(r, 4000))
          } catch (e) { logErro("tts", "Falha áudio coletar whatsapp", e) }
        }
        setStage(u, STAGES.ACOLHIMENTO_CONFIRMA_WHATSAPP)
        iniciarTimer(from)
        const primeiroNome = primeiroNomeCliente(u) || "você"
        return responderComTimer(from, {
          texto: `●●●●○○ 📱 Etapa 4 de 6 · *WhatsApp*\n\nPerfeito, *${primeiroNome}*! 😊\n\nEste número *${numExib}* é o seu WhatsApp?\n\nSe não for, é só digitar ou falar o número correto com DDD agora. 🎙️`,
          opcoes: [
            { id: "nc_meu", title: "✅ Confirmar" }
          ]
        })
      }
    },
    {
      chave: "cidade",
      preenchido: () => !!(u.cidade && u.cidade.trim().length > 1),
      confirmar: async () => {
        const cidadeExib = u.uf ? `${u.cidade}, ${u.uf}` : u.cidade
        const regiaoExib = u.regiao ? ` (${u.regiao})` : ``
        const pergunta = `●●●●●○ 📍 Etapa 5 de 6 · *Cidade*\n\n✅ A cidade que você informou é *${cidadeExib}*${regiaoExib}. Está correto?\n\nSe não estiver, é só me dizer a cidade correta agora. Pode falar ou digitar. 🎙️`
        const opcoes = [
          { id: "revalida_cidade_ok", title: "✅ Confirmar" }
        ]
        if (!u.modoTexto) {
          try {
            const estadoFull = estadoPorExtenso(u.uf) || u.uf || ""
            const ogg = await gerarAudioAtendente(u.atendente, `A cidade que você informou é ${u.cidade}${estadoFull ? ", " + estadoFull : ""}. Está correto? Se estiver, toque em Confirmar. Se não estiver, é só me dizer a cidade correta agora. Pode falar ou digitar.`)
            await enviarAudio(from, urlAudioAtendente(ogg))
            await new Promise(r => setTimeout(r, 2000))
          } catch (e) { logErro("tts", "Falha áudio confirmar cidade", e) }
        }
        setStage(u, STAGES.REVALIDA_CIDADE)
        iniciarTimer(from)
        return responderComTimer(from, { texto: pergunta, opcoes })
      },
      coletar: async () => {
        const pergunta = `●●●●●○ 📍 Etapa 5 de 6 · *Cidade*\n\nÓtimo! Em qual *cidade* você mora?\n\nSe preferir, pode informar o *CEP* também.`
        if (!u.modoTexto) {
          try {
            const ogg = await gerarAudioAtendente(u.atendente, `Em qual cidade você mora?`)
            await enviarAudio(from, urlAudioAtendente(ogg))
            await new Promise(r => setTimeout(r, 2000))
          } catch (e) { logErro("tts", "Falha áudio coletar cidade", e) }
        }
        setStage(u, STAGES.ACOLHIMENTO_CIDADE)
        iniciarTimer(from)
        return responderComTimer(from, { texto: pergunta, opcoes: null })
      }
    }
  ]

  for (const campo of campos) {
    if (campo.preenchido()) {
      const jaConfirmado = (u._revalidaConfirmados || []).includes(campo.chave)
      if (!jaConfirmado) return await campo.confirmar()
    } else {
      return await campo.coletar()
    }
  }

  u._revalidandoCampos = false
  u._revalidaConfirmados = []
  setStage(u, STAGES.CONFIRMACAO)
  if (!u.modoTexto) {
    try {
      const ogg = await gerarAudioAtendente(u.atendente, `Ótimo! Vou mostrar um resumo dos seus dados para você confirmar.`)
      await enviarAudio(from, urlAudioAtendente(ogg))
      await new Promise(r => setTimeout(r, 2000))
    } catch (e) { logErro("tts", "Falha áudio confirmação final", e) }
  }
  return responderComTimer(from, await telaConfirmarDadosAudio(from, u))
}

async function processarAudioCanalAtendimento(from, nomeWA, u, msgObj, tipo, ehAudio, ehDoc) {
  if (!ehAudio || ehDoc) return null
  if (u.numeroCaso) return null
  if (u.stage !== STAGES.AUDIO_AGUARDANDO) return null

  const mediaId = msgObj?.[tipo]?.id
  if (!mediaId) {
    return responderComTimer(from, { texto: "Não consegui identificar seu áudio. Pode tentar enviar novamente?", opcoes: null })
  }

  await enviar(from, "👂 Estou ouvindo seu áudio...", null, false)

  const midia = await baixarMidia(mediaId)
  if (!midia) {
    return responderComTimer(from, { texto: "Não consegui baixar esse áudio. Pode tentar novamente?", opcoes: null })
  }

  setStage(u, STAGES.AUDIO_PROCESSANDO)
  const transcricao = await transcrever(midia.buffer, midia.mimeType, { origem: "audio_opcoes" })
  if (!transcricao) {
    setStage(u, STAGES.AUDIO_AGUARDANDO)
    iniciarTimer(from)
    return responderComTimer(from, {
      texto: "Não consegui ouvir esse áudio com clareza. Você pode enviar outro áudio ou corrigir por texto.",
      opcoes: [
        { id: "audio_enviar", title: "🎤 Enviar novo áudio" },
        { id: "audio_voltar_texto", title: "✍️ Corrigir por texto" }
      ]
    })
  }

  u._audioCanalTranscricao = acumularRelato(u, normalizarTextoCRM(transcricao))
  if (!Array.isArray(u.historiaIA)) u.historiaIA = []
  u.historiaIA.push({ role: "user", content: transcricao })

  const classificacao = await classificarAreaAudio(u._audioCanalTranscricao)
  iniciarTimer(from)

  // "Recomeçar" — confirmação progressiva campo a campo
  if (u._revalidandoCampos) {
    aplicarClassificacaoJuridica(u, classificacao)
    u._revalidaConfirmados = []
    if (!u.modoTexto) {
      try {
        const ogg = await gerarAudioAtendente(u.atendente, `Atualizei seu relato. Agora vou confirmar seus dados com você.`)
        await enviarAudio(from, urlAudioAtendente(ogg))
        await new Promise(r => setTimeout(r, 2000))
      } catch (e) { logErro("tts", "Falha áudio início revalidação", e) }
    }
    return await proximaConfirmacaoProgressiva(from, u)
  }
  // "Voltar" da confirmação: atualiza relato e revisa dados campo a campo (igual ao Recomeçar)
  if (u._voltandoConfirmacao) {
    aplicarClassificacaoJuridica(u, classificacao)
    u._voltandoConfirmacao = false
    u._revalidandoCampos = true
    u._revalidaConfirmados = []
    if (!u.modoTexto) {
      try {
        const ogg = await gerarAudioAtendente(u.atendente,
          `Atualizei seu relato. Agora vou confirmar seus dados com você.`)
        await enviarAudio(from, urlAudioAtendente(ogg))
        await new Promise(r => setTimeout(r, 2000))
      } catch (e) { logErro("tts", "Falha áudio revalidação áudio", e) }
    }
    return await proximaConfirmacaoProgressiva(from, u)
  }

  // Guarda: classificação fraca → pede esclarecimento antes de avançar
  if (deveEsclarecerRelato(u, classificacao)) {
    u._jaEsclareceuRelato = true
    setStage(u, STAGES.AUDIO_AGUARDANDO)
    const pergunta = gerarPerguntaEsclarecimentoRelato(classificacao, u._audioCanalTranscricao)
    if (!u.modoTexto) {
      try {
        const textoAudioEsc = removerFormatacaoParaAudio(pergunta)
        const ogg = await gerarAudioAtendente(u.atendente, textoAudioEsc)
        await enviarAudio(from, urlAudioAtendente(ogg))
        await new Promise(r => setTimeout(r, 4000))
      } catch (e) { logErro("tts", "Falha áudio esclarecimento relato", e) }
    }
    return responderComTimer(from, { texto: pergunta, opcoes: null })
  }

  aplicarClassificacaoJuridica(u, classificacao)
  u._jaEsclareceuRelato = false
  return await flowAssessoriaInicial(u, { from, origem: "audio" })
}

const STAGES_AUDIO_RESPOSTA_CADASTRAL = new Set([
  STAGES.ACOLHIMENTO_MODO,
  STAGES.ACOLHIMENTO_PARA_QUEM,
  STAGES.ACOLHIMENTO_CONFIRMA_TITULAR_NOME,
  STAGES.ACOLHIMENTO_CONFIRMA_WHATSAPP,
  STAGES.ACOLHIMENTO_CONFIRMA_WHATSAPP_OUTRO,
  STAGES.CONFIRMAR_ENTRADA,
  STAGES.COLETA_TEL_WPP_CONTATO
])

function adaptarTextoAudioCadastral(stage, texto) {
  const original = sanitizarTextoEntrada(texto)
  if (!original || /\d/.test(original)) return original
  const t = normalizarTextoGatilho(original)
  const partes = t.split(/\s+/).filter(Boolean)
  if (!partes.length || partes.length > 6 || t.length > 80) return original

  const confirma = /^(sim|isso|isso mesmo|correto|certo|esta correto|ta certo|pode confirmar|confirmar|confirmo|pode usar|pode usar este|pode usar esse|usar esse numero|usar este numero|esse numero|este numero|esse mesmo|continuar assim)$/.test(t)
  const negaOuCorrige = /^(nao|nao esta correto|nao e isso|errado|esta errado|incorreto|quero corrigir|corrigir)$/.test(t)
  const querOutro = /^(nao e esse|nao e este|outro numero|quero informar outro|informar outro|quero outro numero|usar outro numero)$/.test(t)

  if (stage === STAGES.CONFIRMAR_ENTRADA) {
    if (confirma) return "entrada_ok"
    if (negaOuCorrige || querOutro) return "entrada_corrigir"
  }
  if (stage === STAGES.ACOLHIMENTO_CONFIRMA_WHATSAPP) {
    if (confirma) return "whatsapp_sim"
    if (negaOuCorrige || querOutro) return "whatsapp_nao"
  }
  if (stage === STAGES.ACOLHIMENTO_CONFIRMA_WHATSAPP_OUTRO) {
    if (confirma) return "wpp_continuar_assim"
    if (querOutro) return "wpp_informar_outro"
  }
  if (stage === STAGES.COLETA_TEL_WPP_CONTATO) {
    if (confirma) return "wpp_contato_esse"
    if (negaOuCorrige || querOutro) return "wpp_contato_outro"
  }
  return original
}

function detectarModoAtendimento(texto) {
  const original = sanitizarTextoEntrada(texto)
  if (original === "modo_audio") return "audio"
  if (original === "modo_texto") return "texto"

  const t = normalizarTextoGatilho(original)
  const partes = t.split(/\s+/).filter(Boolean)
  if (!partes.length || partes.length > 10 || t.length > 80) return null

  // Bloquear frases que indicam contexto alheio (pessoa terceira, duvida geral, etc.)
  if (/\b(advogado|advogada|mae|mãe|pai|filho|filha|outra pessoa|para mim|pra mim|duvida|problema|questao|questão|situacao|situação|preciso|quero falar com|me ajuda|nao sei|não sei)\b/.test(t)) return null

  // Padroes de audio: palavras-chave de voz/audio, com ou sem prefixo de preferencia
  const ehAudio =
    /\baudio\b/.test(t) ||
    /\b(voz|falando|falar|falo)\b/.test(t) ||
    /\bconvers(ar|ando)\b.*\b(voz|audio)\b/.test(t) ||
    /\b(voz|audio)\b.*\bconvers(ar|ando)\b/.test(t) ||
    /\brespond(er|endo)\b.*\b(voz|audio|falando)\b/.test(t) ||
    /\b(voz|audio|falando)\b.*\brespond(er|endo)\b/.test(t) ||
    /\bvou\b.*\b(falar|responder falando)\b/.test(t) ||
    /\bprefiro\b.*\b(voz|audio|falar|conversar)\b/.test(t) ||
    /\bquero\b.*\b(voz|audio|falar|responder por voz|responder por audio)\b/.test(t)

  if (ehAudio) return "audio"

  // Padroes de texto: palavras-chave de escrita/digitacao, com ou sem prefixo de preferencia
  const ehTexto =
    /\btexto\b/.test(t) ||
    /\bdigitar?\b/.test(t) ||
    /\bdigitando\b/.test(t) ||
    /\bescrever?\b/.test(t) ||
    /\bescrevendo\b/.test(t) ||
    /\bescrit[ao]\b/.test(t) ||
    /\bpor escrito\b/.test(t) ||
    /\bvou\b.*\bdigitar?\b/.test(t) ||
    /\bprefiro\b.*\b(texto|digitar?|escrever?|escrit[ao])\b/.test(t) ||
    /\bquero\b.*\b(texto|digitar?|escrever?|escrit[ao])\b/.test(t)

  if (ehTexto) return "texto"

  return null
}

async function transcreverAudioRespostaCadastral(from, u, msgObj, tipo) {
  if (!STAGES_AUDIO_RESPOSTA_CADASTRAL.has(u.stage)) return null
  const mediaId = msgObj?.[tipo]?.id || msgObj?.audio?.id || msgObj?.voice?.id
  if (!mediaId) return { erro: "Não consegui processar seu áudio. Pode tentar novamente ou digitar?" }
  await enviar(from, "👂 Estou ouvindo seu áudio...", null, false)
  const midia = await baixarMidia(mediaId)
  if (!midia) return { erro: "Não consegui baixar esse áudio. Pode tentar novamente ou digitar?" }
  const transcricao = await transcrever(midia.buffer, midia.mimeType, { origem: `audio_cadastral:${u.stage}` })
  if (!transcricao) return { erro: "Não consegui ouvir com clareza. Pode enviar outro áudio ou digitar?" }
  return { text: adaptarTextoAudioCadastral(u.stage, normalizarTextoCRM(transcricao)) }
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
    STAGES.AUDIO_OPCOES,
    STAGES.AUDIO_AGUARDANDO,
    STAGES.AUDIO_PROCESSANDO,
    STAGES.AUDIO_CONFIRMAR_TRANSCRICAO,
    STAGES.AUDIO_CONFIRMAR_AREA,
    STAGES.AUDIO_CONFIRMAR_DADOS,
    STAGES.COLETA_TEL_OUTRO,
    STAGES.COLETA_TEL_WPP,
    STAGES.COLETA_TEL_WPP_CONFIRMA,
    STAGES.ACOLHIMENTO_MODO,
    STAGES.ACOLHIMENTO_PARA_QUEM,
    STAGES.ACOLHIMENTO_CONFIRMA_TITULAR_NOME,
    STAGES.ACOLHIMENTO_CONFIRMA_WHATSAPP,
    STAGES.ACOLHIMENTO_CONFIRMA_WHATSAPP_OUTRO,
    STAGES.CONFIRMAR_ENTRADA,
    STAGES.COLETA_TEL_WPP_CONTATO,
    // -- Stages de confirmação de nome no pré-atendimento — têm handler de áudio próprio --
    STAGES.ACOLHIMENTO_CONFIRMA_NOME,
    STAGES.ACOLHIMENTO_CONFIRMA_NOME_CONTATO,
    // -- Mini-stages de edição — têm handlers próprios; não devem cair aqui --
    STAGES.CORRIGIR_DADOS,
    STAGES.CONFIRMAR_CORRECAO,
    STAGES.EDITAR_NOME,
    STAGES.EDITAR_CIDADE,
    STAGES.EDITAR_AREA,
    STAGES.EDITAR_SITUACAO,
    STAGES.EDITAR_DETALHE,
    STAGES.EDITAR_URGENCIA,
    STAGES.EDITAR_DESCRICAO,
    STAGES.CONFIRMAR_CORRECAO_NOME,
    STAGES.CONFIRMAR_CORRECAO_CIDADE,
    STAGES.MENU_CORRECAO,
    STAGES.CONFIRMACAO,
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

  const transcricao = await transcrever(midia.buffer, midia.mimeType, { origem: "fluxo" })
  if (!transcricao) {
    const ultimaPergunta = retomarUltimaPergunta(u)
    if (ultimaPergunta) {
      return responderComTimer(from, {
        texto: "Nao consegui entender esse audio agora. Vou te manter no ponto em que estavamos.",
        opcoes: [
        { id: "cont_retomar", title: "▶️ Continuar" },
      { id: "recomecar",    title: "🔄 Recomeçar" },
      { id: "audio_fluxo_encerrar", title: "👋 Encerrar" }
        ]
      })
    }
    return responderComTimer(from, { texto: "Nao consegui entender esse audio agora. Se preferir, responda por texto.", opcoes: null })
  }

  const decisao = await classificarAcaoAudioFluxo(u, transcricao)
  u._audioFluxoTexto = normalizarTextoCRM(transcricao)
  u._audioFluxoAcao = decisao.acao
  u._audioFluxoResposta = decisao.recomendacao
  setStage(u, STAGES.AUDIO_FLUXO_CONFIRMA)
  return responderComTimer(from, telaAudioNoFluxo(u._audioFluxoTexto, u._audioFluxoResposta))
}

async function processarUrgenciaOuCorrecao(from, u, text, msgObj, ehDoc, ehAudio) {
  if (u.stage === STAGES.AGUARDANDO_URGENTE && text && !ehDoc && !ehAudio) {
    if (/^[a-z][a-z0-9_]{1,20}$/.test(text)) {
      setStage(u, STAGES.CLIENTE)
    } else {
      const mensagemUrgente = normalizarTextoCRM(text)
      await hsCriarNota(u.contatoId, "MENSAGEM URGENTE", `De: ${u.nome} (${from})\nCaso: ${u.numeroCaso}\nArea: ${u.area}\n\n${mensagemUrgente}`)
      await hsMoverStage(u.negocioId, HS_STAGE.ANALISE)
      notificarMensagemUrgente(u, mensagemUrgente, u.negocioId).catch(e => console.error("[notif] urgente:", e.message))
      setStage(u, STAGES.CLIENTE)
      return await respostaUrgenteRegistradaComAudio(from, u, "mensagem urgente texto registrada")
    }
  }

  if (u.stage === STAGES.CONFIRMAR_CORRECAO) {
    if (text === "correcao_confirmar") {
      return await aplicarCorrecaoPendente(from, u)
    }
    if (text === "correcao_corrigir") {
      return await reabrirCorrecaoPendente(from, u)
    }

    const valorExibido = formatarValorCorrecao(u._correcaoPendenteCampo, u._correcaoPendenteValor, u._correcaoPendenteExtra || {})
    const barra = u._correcaoPendenteCampo === "nome"
      ? "●●○○○○ 👤 Etapa 2 de 6 · *Nome*\n\n"
      : u._correcaoPendenteCampo === "cidade"
        ? "●●●●●○ 📍 Etapa 5 de 6 · *Cidade*\n\n"
        : ""
    return responderComTimer(from, {
      texto: `${barra}Você informou: *${valorExibido}*.\n\nEstá correto?`,
      opcoes: [
      { id: "correcao_confirmar", title: "✅ Confirmar" },
      { id: "correcao_corrigir", title: "✏️ Corrigir" }
      ]
    })
  }

  if (u.stage === STAGES.CORRIGIR_VALOR && text) {
    if (u.corrigirCampo) {
      if (u.corrigirCampo === "nome") u[u.corrigirCampo] = formatarNome(text.trim())
      else if (u.corrigirCampo === "cidade") u[u.corrigirCampo] = formatarCidade(text.trim())
      else u[u.corrigirCampo] = normalizarTextoCRM(text)
      await sincronizarContatoNegocioHubSpot(u)
      u.corrigirCampo = null
    }

    // Se a correção veio do Resumo de Retomada, voltar para lá
    if (u._correcaoOrigem === "resumo_retomada") {
      u._correcaoOrigem = null
      setStage(u, STAGES.RESUMO_RETOMADA)
      await sincronizarNegocio(u)
      return responderComTimer(from, await flowResumoRetomada(u))
    }

    // Caso contrário, ir para Confirmação normal
    setStage(u, STAGES.CONFIRMACAO)
    await sincronizarNegocio(u)
    return responderComTimer(from, await telaConfirmacaoComImagem(from, u))
  }

  if (u.stage === STAGES.CORRIGIR_UF) {
    if (REGIOES[text]) { u._regiao = text; return responderComTimer(from, telaUFsRegiao(text)) }
    const val = UF_MAP[text]
    if (val) {
      u.uf = val

      // Se veio do Resumo de Retomada, voltar para lá
      if (u._correcaoOrigem === "resumo_retomada") {
        u._correcaoOrigem = null
        setStage(u, STAGES.RESUMO_RETOMADA)
        await sincronizarNegocio(u)
        return responderComTimer(from, await flowResumoRetomada(u))
      }

      // Retornar para a tela de confirmação correta (texto ou áudio)
      u._correcaoOrigem = null
      return responderComTimer(from, await voltarParaConfirmacao(from, u))
    }
    return responderComTimer(from, telaRegioes())
  }

  if (u.stage === STAGES.CORRIGIR_SEL) {
    const mc = { cc_nunca: "Nunca", cc_pouco: "Pouco tempo", cc_1ano: "Mais de 1 ano", cc_muito: "Muitos anos" }
    const mb = { cb_sim: "Sim", cb_nao: "Não" }
    const val = mc[text] || mb[text]
    if (val && u.corrigirCampo) {
      u[u.corrigirCampo] = val
      u.corrigirCampo = null

      // Se a correção veio do Resumo de Retomada, voltar para lá
      if (u._correcaoOrigem === "resumo_retomada") {
        u._correcaoOrigem = null
        setStage(u, STAGES.RESUMO_RETOMADA)
        await sincronizarNegocio(u)
        return responderComTimer(from, await flowResumoRetomada(u))
      }

      // Caso contrário, ir para Confirmação normal
      setStage(u, STAGES.CONFIRMACAO)
      await sincronizarNegocio(u)
      return responderComTimer(from, await telaConfirmacaoComImagem(from, u))
    }
  }

  if (u.stage === STAGES.CONFIRMACAO) {
    if (text === "conf_ok") {
      try {
        const casoAnteriorCliente = u._casoAnteriorCliente
        const casoParaTerceiro = ehFinalizacaoCasoTerceiro(u)
        const eraNovoCasoDeCliente = Boolean(u._novoCasoDeCliente)
        const numeroCaso = await finalizarCadastro(from, u)
        // marcar que o caso foi recém-aberto para que "Enviar documentos"
        // vá direto para o fluxo de docs sem exibir seleção de caso
        u._casoRecemAberto = true
        if (eraNovoCasoDeCliente) u._contextoDocsCasoAtual = criarContextoDocsCasoAtual(u, numeroCaso)
        if (casoParaTerceiro) {
          u._casoRecemAberto = false
          u._contextoDocsCasoAtual = null
          return responderComTimer(from, await finalizarCadastroTerceiroEVoltarOrigem(from, u, numeroCaso, casoAnteriorCliente))
        }
        if (!u._contextoDocsCasoAtual) u._contextoDocsCasoAtual = criarContextoDocsCasoAtual(u, numeroCaso)
        const docs = getDocumentosCaso(u)
        const primeiroNome = primeiroNomeCliente(u) || "você"
        const textoCasoReg = `🎉 *${primeiroNome}, seu caso foi registrado!*\n\n📄 *Número do caso:* \`\`\`${numeroCaso}\`\`\`\n\n_Guarde esse número. É com ele que identificamos seu atendimento por aqui._\n\nSeu caso foi encaminhado a um especialista em *${u.area ? "Direito " + u.area : "Direito"}*, que fará a análise e entrará em contato em breve.\n\n⏱️ Prazo estimado: até 2 dias úteis\n\n━━━━━━━━━━━━━━━\n📋 *Documentos que podem ser necessários:*\n${docs}\n\nVocê pode enviar agora ou depois, como preferir.`
        const opcoesCasoReg = [
      { id: "m_docs", title: "📎 Enviar documentos" },
      { id: "m_adv",      title: "👨‍⚖️ Falar com advogado" },
      { id: "m_inicio", title: "🏠 Menu do cliente" }
        ]
        if (IMAGEM_CASO_REGISTRADO_URL) {
          const enviada = await enviarImagemWhatsApp(from, IMAGEM_CASO_REGISTRADO_URL, textoCasoReg, opcoesCasoReg)
          if (enviada) return responderComTimer(from, { texto: null, opcoes: null })
        }
        return responderComTimer(from, { texto: textoCasoReg, opcoes: opcoesCasoReg })
      } catch (e) {
        logErro("finalizarCadastro", "Falha ao finalizar cadastro (conf_ok): " + e.message)
        return responderComTimer(from, {
          texto: `⚠️ Ocorreu um problema ao registrar seu caso. Seus dados estão salvos.\n\nPor favor, tente confirmar novamente.`,
          opcoes: [
            { id: "conf_ok", title: "🔄 Tentar novamente" },
            { id: "conf_corrigir", title: "✏️ Corrigir dados" }
          ]
        })
      }
    }
    if (text === "conf_corrigir") {
      u._retornarParaConfirmacao = true
      u._origemConfirmacao = u.modoTexto ? "texto" : "audio"
      setStage(u, STAGES.CORRIGIR_DADOS)
      iniciarTimer(from)
      if (!u.modoTexto) {
        try {
          const ogg = await gerarAudioAtendente(u.atendente,
            `Claro! Me diga o que deseja corrigir. Pode falar em áudio ou digitar. Por exemplo: meu nome está errado, a cidade está errada, ou o WhatsApp está errado.`)
          await enviarAudio(from, urlAudioAtendente(ogg))
          await new Promise(r => setTimeout(r, 3000))
        } catch (e) { logErro("tts", "Falha áudio corrigir dados conf", e) }
      }
      return responderComTimer(from, {
      texto: `✏️ *O que você gostaria de corrigir?*

_Diga ou digite o que está errado. Por exemplo: "meu nome está errado", "a cidade está errada" ou "o WhatsApp está errado"._`,
        opcoes: null
      })
    }
    if (text === "conf_menu") {
      if (ehFinalizacaoCasoTerceiro(u)) {
        iniciarTimer(from)
        const temCasoAnterior = Boolean(u._casoAnteriorCliente)
        const textoAudioVoltar = temCasoAnterior
          ? "Este atendimento é para outra pessoa. Para evitar misturar com seu caso original, escolha se deseja ver a confirmação, corrigir os dados ou voltar ao seu menu."
          : "Você está abrindo um caso para outra pessoa. Escolha se deseja ver a confirmação, corrigir os dados ou cancelar o atendimento."
        await enviarAudioModoVoz(from, u, textoAudioVoltar, "voltar confirmacao terceiro")
        return responderComTimer(from, telaVoltarConfirmacaoTerceiro(u, "texto"))
      }
      // Voltar na confirmação (fluxo "para mim"): exibe tela intermediária
      // com opções claras, sem regredir ao relato.
      iniciarTimer(from)
      const primeiroNomeVoltar = primeiroNomeCliente(u) || ""
      const textoAudioVoltarParaMim = primeiroNomeVoltar
        ? `${primeiroNomeVoltar}, você voltou da tela de confirmação. Escolha se deseja ver os dados novamente, corrigir alguma informação ou contar a situação de outro jeito.`
        : "Você voltou da tela de confirmação. Escolha se deseja ver os dados novamente, corrigir alguma informação ou contar a situação de outro jeito."
      await enviarAudioModoVoz(from, u, textoAudioVoltarParaMim, "voltar confirmacao para_mim")
      const textoTelaVoltarParaMim = primeiroNomeVoltar
        ? `⬅️ *Tudo bem, ${primeiroNomeVoltar}.*\n\nO que você gostaria de fazer?`
        : `⬅️ *Tudo bem.*\n\nO que você gostaria de fazer?`
      return responderComTimer(from, {
        texto: textoTelaVoltarParaMim,
        opcoes: [
          { id: "conf_ok_ver", title: "✅ Ver meus dados" },
          { id: "conf_corrigir", title: "✏️ Corrigir algo" },
          { id: "conf_menu_recontar", title: "🔄 Contar de novo" }
        ]
      })
    }
    if (text === "conf_ok_ver") {
      iniciarTimer(from)
      return responderComTimer(from, await telaConfirmacaoComImagem(from, u))
    }
    if (text === "conf_menu_recontar") {
      u._revalidandoCampos = true
      u.aguardandoResposta = false
      u.aguardandoRetomada = false
      setStage(u, STAGES.AUDIO_AGUARDANDO)
      iniciarTimer(from)
      const primeiroNomeRecontar = primeiroNomeCliente(u) || ""
      const saudacaoRecontar = primeiroNomeRecontar ? `, ${primeiroNomeRecontar}` : ""
      const textoRecontar = `Tudo bem${saudacaoRecontar}. Pode me contar sua situação novamente${u.modoTexto ? " por texto" : " por áudio ou texto"}. Estou aqui para ajudar você.`
      if (!u.modoTexto) {
        try {
          const ogg = await gerarAudioAtendente(u.atendente, textoRecontar)
          await enviarAudio(from, urlAudioAtendente(ogg))
          await new Promise(r => setTimeout(r, 3000))
        } catch (e) { logErro("tts", "Falha audio voltar confirmacao recontar", e) }
      }
      return {
        texto: `🔄 Tudo bem${saudacaoRecontar} 😊\n\nPode me contar sua situação novamente${u.modoTexto ? " por texto" : " por áudio ou texto"}. Estou aqui para ajudar você.`,
        opcoes: null
      }
    }
    if (text === "terceiro_conf_continuar") {
      iniciarTimer(from)
      return responderComTimer(from, await telaConfirmacaoComImagem(from, u))
    }
    const imprevistoConfirmacao = await tratarImprevistoPreAtendimento(from, u, u.stage, text)
    if (imprevistoConfirmacao) return imprevistoConfirmacao
  }

  if (u.stage === STAGES.MENU_CORRECAO) {
    // Menu de correção da Retomada (dinâmico)
    if (text?.startsWith("rr_corr_")) {
      const campo = text.replace("rr_corr_", "")

      if (campo === "voltar") {
        setStage(u, STAGES.RESUMO_RETOMADA)
        iniciarTimer(from)
        return await flowResumoRetomada(u)
      }

      u.corrigirCampo = campo

      if (campo === "area") {
        iniciarTimer(from)
        return responderComTimer(from, {
          texto: "A área jurídica é definida pela análise do relato. Se ela parecer errada, corrija a descrição do caso com mais detalhes.",
          opcoes: null
        })
      }

      if (campo === "tipo" || campo === "situacao" || campo === "descricao") {
        setStage(u, STAGES.CORRIGIR_VALOR)
        const label = { tipo: "tipo", situacao: "situação", descricao: "descrição" }[campo]
        return responderComTimer(from, { texto: `Digite a ${label} corrigida:`, opcoes: null })
      }
      if (campo === "cidade") {
        setStage(u, STAGES.CORRIGIR_VALOR)
        return responderComTimer(from, { texto: "Digite a cidade correta:", opcoes: null })
      }
      if (campo === "uf") {
        setStage(u, STAGES.CORRIGIR_UF)
        return responderComTimer(from, telaRegioes())
      }
      if (campo === "regiao") {
        setStage(u, STAGES.CORRIGIR_UF)
        return responderComTimer(from, telaRegioes())
      }
    }

    // Menu de correção normal (da Confirmação — texto ou áudio)
    // Todos os campos agora usam mini-stages EDITAR_* com retorno automático
    if (text === "cor_nome") {
      u._retornarParaConfirmacao = true
      setStage(u, STAGES.EDITAR_NOME)
      iniciarTimer(from)
      if (!u.modoTexto) {
        try {
          const ogg = await gerarAudioAtendente(u.atendente, "Tudo bem. Me diga o nome completo correto. Pode falar ou digitar.")
          await enviarAudio(from, urlAudioAtendente(ogg))
          await new Promise(r => setTimeout(r, 2500))
        } catch (e) { logErro("tts", "Falha áudio cor_nome", e) }
      }
      return responderComTimer(from, { texto: "●●○○○○ 👤 Etapa 2 de 6 · *Nome*\n\n😊 Fico feliz em poder ajudar! Para começar, qual é o seu nome completo?\n\n_Digite ou envie um áudio._", opcoes: null })
    }
    if (text === "cor_whatsapp") {
      u._retornarParaConfirmacao = true
      u._corrigindoWhatsappConfirmacao = true
      setStage(u, STAGES.REVALIDA_WHATSAPP)
      iniciarTimer(from)
      const numeroAtual = formatarTelefoneExibicao(getTelefoneContato(from, u))
      if (!u.modoTexto) {
        try {
          const digitosAudio = String(getTelefoneContato(from, u) || "").replace(/\D/g, "").split("").join(" ")
          const ogg = await gerarAudioAtendente(u.atendente,
            `Seu WhatsApp de contato está como ${digitosAudio}. Está correto? Se quiser usar outro número, é só falar ou digitar o WhatsApp com DDD agora.`)
          await enviarAudio(from, urlAudioAtendente(ogg))
          await new Promise(r => setTimeout(r, 3500))
        } catch (e) { logErro("tts", "Falha áudio corrigir whatsapp", e) }
      }
      return responderComTimer(from, {
        texto: `Seu WhatsApp está como *${numeroAtual || from}*.\n\nEstá correto? Se quiser usar outro número, é só digitar ou falar com DDD agora. 🎙️`,
        opcoes: [
          { id: "revalida_whatsapp_ok", title: "✅ Confirmar" }
        ]
      })
    }
    if (text === "cor_cidade") {
      u._retornarParaConfirmacao = true
      setStage(u, STAGES.EDITAR_CIDADE)
      iniciarTimer(from)
      if (!u.modoTexto) {
        try {
          const ogg = await gerarAudioAtendente(u.atendente, "Tudo bem. Me diga a cidade com o estado, por exemplo Recife Pernambuco, ou informe o CEP com oito dígitos.")
          await enviarAudio(from, urlAudioAtendente(ogg))
          await new Promise(r => setTimeout(r, 3000))
        } catch (e) { logErro("tts", "Falha áudio cor_cidade", e) }
      }
      return responderComTimer(from, { texto: "📍 *Em qual cidade você mora?*\n\n_Digite a cidade com o estado, por exemplo: Recife Pernambuco, ou informe o CEP com oito dígitos._", opcoes: null })
    }
    if (text === "cor_uf") {
      u._correcaoOrigem = u._origemConfirmacao === "audio" ? "audio_confirmacao" : "confirmacao"
      setStage(u, STAGES.CORRIGIR_UF)
      iniciarTimer(from)
      return responderComTimer(from, telaRegioes())
    }
    if (text === "cor_area") {
      iniciarTimer(from)
      return responderComTimer(from, {
        texto: "A área jurídica é definida pela análise do relato. Se ela parecer errada, corrija a descrição do caso com mais detalhes.",
        opcoes: null
      })
    }
    if (text === "cor_situacao") {
      u._retornarParaConfirmacao = true
      setStage(u, STAGES.EDITAR_SITUACAO)
      iniciarTimer(from)
      if (!u.modoTexto) {
        try {
          const ogg = await gerarAudioAtendente(u.atendente, "Tudo bem. Me conte a situação correta do seu caso. Pode falar ou digitar.")
          await enviarAudio(from, urlAudioAtendente(ogg))
          await new Promise(r => setTimeout(r, 2500))
        } catch (e) { logErro("tts", "Falha áudio cor_situacao", e) }
      }
      return responderComTimer(from, { texto: "📌 *Qual é a situação correta?*\n\n_Descreva brevemente ou envie um áudio._", opcoes: null })
    }
    if (text === "cor_detalhe") {
      u._retornarParaConfirmacao = true
      setStage(u, STAGES.EDITAR_DETALHE)
      iniciarTimer(from)
      if (!u.modoTexto) {
        try {
          const ogg = await gerarAudioAtendente(u.atendente, "Tudo bem. Me diga o detalhe correto do caso. Pode falar ou digitar.")
          await enviarAudio(from, urlAudioAtendente(ogg))
          await new Promise(r => setTimeout(r, 2500))
        } catch (e) { logErro("tts", "Falha áudio cor_detalhe", e) }
      }
      return responderComTimer(from, { texto: "🔎 *Qual é o detalhe correto?*\n\n_Digite ou envie um áudio._", opcoes: null })
    }
    if (text === "cor_urgencia") {
      u._retornarParaConfirmacao = true
      setStage(u, STAGES.EDITAR_URGENCIA)
      iniciarTimer(from)
      if (!u.modoTexto) {
        try {
          const ogg = await gerarAudioAtendente(u.atendente, "Qual é o nível de urgência correto? Alta, moderada ou baixa?")
          await enviarAudio(from, urlAudioAtendente(ogg))
          await new Promise(r => setTimeout(r, 2500))
        } catch (e) { logErro("tts", "Falha áudio cor_urgencia", e) }
      }
      return responderComTimer(from, {
        texto: "⚡ *Qual é o nível de urgência correto?*",
        opcoes: [
          { id: "eu_alta",   title: "🔴 Alta" },
          { id: "eu_normal", title: "🟡 Moderada" },
          { id: "eu_baixa",  title: "🟢 Baixa" }
        ]
      })
    }
    if (text === "cor_desc") {
      u._retornarParaConfirmacao = true
      setStage(u, STAGES.EDITAR_DESCRICAO)
      iniciarTimer(from)
      if (!u.modoTexto) {
        try {
          const ogg = await gerarAudioAtendente(u.atendente, "Tudo bem. Me conte a descrição correta do seu caso. Pode falar em áudio ou digitar.")
          await enviarAudio(from, urlAudioAtendente(ogg))
          await new Promise(r => setTimeout(r, 3000))
        } catch (e) { logErro("tts", "Falha áudio cor_desc", e) }
      }
      return responderComTimer(from, { texto: "💬 *Qual é a descrição correta do seu caso?*\n\n_Digite ou envie um áudio com a descrição atualizada._", opcoes: null })
    }
    // Legado — manter contrib/benef para retomada
    if (text === "cor_contrib") {
      u.corrigirCampo = "contribuicao"
      u._correcaoOrigem = "confirmacao"
      setStage(u, STAGES.CORRIGIR_SEL)
      return responderComTimer(from, { texto: "Corrija a informação sobre contribuição ao INSS:", opcoes: [{ id: "cc_nunca", title: "Nunca" }, { id: "cc_pouco", title: "Pouco tempo" }, { id: "cc_1ano", title: "Mais de 1 ano" }, { id: "cc_muito", title: "Muitos anos" }] })
    }
    if (text === "cor_benef") {
      u.corrigirCampo = "recebeBeneficio"
      u._correcaoOrigem = "confirmacao"
      setStage(u, STAGES.CORRIGIR_SEL)
      return responderComTimer(from, { texto: "Você recebe algum benefício?", opcoes: [{ id: "cb_sim", title: "Sim" }, { id: "cb_nao", title: "Não" }] })
    }
  }

  // ---------------------------------------------------------------
  //  MINI-STAGES DE EDIÇÃO — retornam automaticamente para confirmação
  // ---------------------------------------------------------------

  // -- EDITAR_NOME --
  if (u.stage === STAGES.EDITAR_NOME) {
    // Botões de escolha: qual nome corrigir (fluxo para terceiro com ambos os nomes coletados)
    if (text === "corr_nome_contato" || text === "corr_nome_atendido") {
      u._correcaoPendenteSubcampo = text === "corr_nome_contato" ? "nomeContato" : "nome"
      const ehContato = u._correcaoPendenteSubcampo === "nomeContato"
      const nomeAtual = ehContato ? u.nomeContato : u.nome
      const textoTela = ehContato
        ? `●●○○○○ 👤 Etapa 2 de 6 · *Nome*\n\nSeu nome atual é *${nomeAtual || "não informado"}*.\n\nQual é o nome correto?\n\n_Digite ou envie um áudio com seu nome completo._`
        : `●●○○○○ 👤 Etapa 2 de 6 · *Nome*\n\nO nome atual da pessoa atendida é *${nomeAtual || "não informado"}*.\n\nQual é o nome correto?\n\n_Digite ou envie um áudio com o nome completo._`
      const textoAudio = ehContato
        ? `Seu nome está como ${nomeAtual || "não informado"}. Qual é o nome correto? Pode falar ou digitar.`
        : `O nome da pessoa atendida está como ${nomeAtual || "não informado"}. Qual é o nome correto? Pode falar ou digitar.`
      iniciarTimer(from)
      if (!u.modoTexto) {
        try {
          const ogg = await gerarAudioAtendente(u.atendente, textoAudio)
          await enviarAudio(from, urlAudioAtendente(ogg))
          await new Promise(r => setTimeout(r, 3500))
        } catch (e) { logErro("tts", "Falha áudio pede nome correto após escolha", e) }
      }
      return responderComTimer(from, { texto: textoTela, opcoes: null })
    }
    let textoEntrada = text
    if (!textoEntrada && ehAudio) {
      const mediaId = msgObj?.audio?.id || msgObj?.voice?.id
      if (mediaId) {
        const midia = await baixarMidia(mediaId)
        if (midia) {
          if (!u.modoTexto) await enviar(from, "👂 Ouvindo...", null, false)
          textoEntrada = await transcrever(midia.buffer, midia.mimeType, { origem: "editar_nome" })
        }
      }
    }
    if (!textoEntrada) {
      if (ehAudio) return await responderFalhaAudioCorrecao(from, u)
      return responderComTimer(from, { texto: "●●○○○○ 👤 Etapa 2 de 6 · *Nome*\n\n😊 Fico feliz em poder ajudar! Para começar, qual é o seu nome completo?\n\n_Digite ou envie um áudio._", opcoes: null })
    }
    const nomeLimpo = await extrairNomeAudio(textoEntrada)
    const validacaoNome = nomeLimpo ? ehNomeAparente(nomeLimpo, textoEntrada) : false
    if (!nomeLimpo || validacaoNome === false) return responderComTimer(from, { texto: "Pode me dizer só o nome completo, por favor?", opcoes: null })
    if (validacaoNome === "incompleto") return responderComTimer(from, { texto: "Preciso do nome completo. Por favor, informe também o sobrenome.", opcoes: null })
    return await prepararConfirmacaoCorrecao(from, u, "nome", nomeLimpo)
  }

  // -- EDITAR_CIDADE --
  if (u.stage === STAGES.EDITAR_CIDADE) {
    if (text === "edit_cidade_nenhuma") {
      delete u._cidadesMultiplasEdit
      if (!u.modoTexto) {
        try {
          const ogg = await gerarAudioAtendente(u.atendente, "Tudo bem. Me diga novamente o nome da cidade junto com o estado, ou informe o CEP.")
          await enviarAudio(from, urlAudioAtendente(ogg))
          await new Promise(r => setTimeout(r, 3000))
        } catch (e) { logErro("tts", "Falha áudio nenhuma cidade edição", e) }
      }
      iniciarTimer(from)
      return responderComTimer(from, {
        texto: "📍 Tudo bem. Informe novamente a *cidade com o estado* ou o *CEP*.\n\nExemplos:\n• Condado Pernambuco\n• Condado PE\n• 55940000",
        opcoes: null
      })
    }

    if (text?.startsWith("edit_cidade_multipla_") && Array.isArray(u._cidadesMultiplasEdit)) {
      const idxEdit = parseInt(text.replace("edit_cidade_multipla_", ""), 10)
      const escolhidaEdit = u._cidadesMultiplasEdit[idxEdit]
      if (escolhidaEdit) {
        delete u._cidadesMultiplasEdit
        return await prepararConfirmacaoCorrecao(from, u, "cidade", escolhidaEdit.cidade, {
          cidade: escolhidaEdit.cidade,
          uf: escolhidaEdit.uf,
          regiao: escolhidaEdit.regiao
        })
      }
    }

    let textoEntrada = text
    if (!textoEntrada && ehAudio) {
      const mediaId = msgObj?.audio?.id || msgObj?.voice?.id
      if (mediaId) {
        const midia = await baixarMidia(mediaId)
        if (midia) {
          if (!u.modoTexto) await enviar(from, "👂 Ouvindo...", null, false)
          textoEntrada = await transcrever(midia.buffer, midia.mimeType, { origem: "editar_cidade" })
        }
      }
    }
    if (!textoEntrada) {
      if (ehAudio) return await responderFalhaAudioCorrecao(from, u)
      return responderComTimer(from, { texto: "📍 *Em qual cidade você mora?*\n\n_Digite a cidade com o estado, por exemplo: Recife Pernambuco, ou informe o CEP com oito dígitos._", opcoes: null })
    }

    let textoCidade = (await extrairCidadeAudio(textoEntrada)).trim()
    if (textoCidade.toUpperCase().startsWith("CEP:")) textoCidade = textoCidade.slice(4).trim()
    const cepRegexEdit = /^\d{5}-?\d{3}$/
    if (cepRegexEdit.test(textoCidade.replace(/\D/g, ""))) {
      try {
        const infoCEP = await buscarPorCEP(textoCidade.replace(/\D/g, ""))
        return await prepararConfirmacaoCorrecao(from, u, "cidade", infoCEP.cidade, {
          cidade: infoCEP.cidade,
          uf: infoCEP.uf,
          regiao: infoCEP.regiao
        })
      } catch (e) {
        return responderComTimer(from, {
          texto: "Não consegui localizar este CEP. Você pode tentar novamente com oito dígitos ou informar a cidade com o estado. Exemplo: Recife Pernambuco.",
          opcoes: null
        })
      }
    }

    // verificar homônimos na edição de cidade
    const locCidadeEdit = await buscarCidadePorNome(textoCidade)
    if (locCidadeEdit?.multiplos && locCidadeEdit.opcoes?.length > 1) {
      const opcoesListaEdit = locCidadeEdit.opcoes.slice(0, 4).map((op, i) => ({
        id: `edit_cidade_multipla_${i}`,
        title: abreviarCidadeBotao(op.cidade, op.uf)
      }))
      u._cidadesMultiplasEdit = locCidadeEdit.opcoes
      if (!u.modoTexto) {
        try {
          const nomesAudio = locCidadeEdit.opcoes.slice(0, 4)
            .map(op => `${op.cidade}, ${estadoPorExtenso(op.uf) || op.uf}`).join("; ")
          const ogg = await gerarAudioAtendente(u.atendente,
            `Encontrei ${numeroPorExtenso(locCidadeEdit.opcoes.length, "feminino")} cidades com esse nome: ${nomesAudio}. Selecione a opção correspondente. Se a sua cidade não aparecer, diga o nome com o estado agora.`)
          await enviarAudio(from, urlAudioAtendente(ogg))
          await new Promise(r => setTimeout(r, 4000))
        } catch (e) { logErro("tts", "Falha áudio cidades múltiplas edição", e) }
      }
      iniciarTimer(from)
      return responderComTimer(from, {
        texto: `●●●●●○ 📍 Etapa 5 de 6 · *Cidade*\n\n🔍 Encontrei *${locCidadeEdit.opcoes.length} cidades* com esse nome. Qual é a sua?\n\n_Se a sua cidade não aparecer, diga ou digite o nome com o estado._`,
        opcoes: opcoesListaEdit
      })
    }
    if (locCidadeEdit?.cidade) {
      return await prepararConfirmacaoCorrecao(from, u, "cidade", locCidadeEdit.cidade, {
        cidade: locCidadeEdit.cidade,
        uf: locCidadeEdit.uf || u.uf,
        regiao: locCidadeEdit.regiao || u.regiao
      })
    }

    if (!u.modoTexto) {
      try {
        const ogg = await gerarAudioAtendente(u.atendente, `Não encontrei essa cidade. Me diga a cidade junto com o estado, por exemplo Recife Pernambuco, ou informe o CEP com oito dígitos.`)
        await enviarAudio(from, urlAudioAtendente(ogg))
        await new Promise(r => setTimeout(r, 3000))
      } catch (e) { logErro("tts", "Falha áudio cidade não encontrada edição", e) }
    }
    return responderComTimer(from, {
      texto: `📍 Não consegui encontrar essa cidade.\n\nTente informar a *cidade com o estado* ou o *CEP*.\n\nExemplos:\n• Recife Pernambuco\n• Olinda PE\n• 50000000`,
      opcoes: null
    })
  }

  // -- EDITAR_AREA --
  if (u.stage === STAGES.EDITAR_AREA) {
    return pedirCampoCorrecao(from, u, "A área jurídica é definida pela análise do relato. Se ela parecer errada, corrija a descrição do caso com mais detalhes.")
  }

  // -- EDITAR_SITUACAO --
  if (u.stage === STAGES.EDITAR_SITUACAO) {
    let textoEntrada = text
    if (!textoEntrada && ehAudio) {
      const mediaId = msgObj?.audio?.id || msgObj?.voice?.id
      if (mediaId) {
        const midia = await baixarMidia(mediaId)
        if (midia) {
          if (!u.modoTexto) await enviar(from, "👂 Ouvindo...", null, false)
          textoEntrada = await transcrever(midia.buffer, midia.mimeType, { origem: "editar_situacao" })
        }
      }
    }
    if (!textoEntrada) {
      if (ehAudio) return await responderFalhaAudioCorrecao(from, u)
      return responderComTimer(from, { texto: "📌 *Qual é a situação correta?*\n\n_Descreva brevemente ou envie um áudio._", opcoes: null })
    }
    const situacaoIA = await extrairCampoCorrecaoIA("situacao", textoEntrada, u)
    return await prepararConfirmacaoCorrecao(from, u, "situacao", situacaoIA)
  }

  // -- EDITAR_DETALHE --
  if (u.stage === STAGES.EDITAR_DETALHE) {
    let textoEntrada = text
    if (!textoEntrada && ehAudio) {
      const mediaId = msgObj?.audio?.id || msgObj?.voice?.id
      if (mediaId) {
        const midia = await baixarMidia(mediaId)
        if (midia) {
          if (!u.modoTexto) await enviar(from, "👂 Ouvindo...", null, false)
          textoEntrada = await transcrever(midia.buffer, midia.mimeType, { origem: "editar_detalhe" })
        }
      }
    }
    if (!textoEntrada) {
      if (ehAudio) return await responderFalhaAudioCorrecao(from, u)
      return responderComTimer(from, { texto: "🔎 *Qual é o detalhe correto?*\n\n_Digite ou envie um áudio._", opcoes: null })
    }
    const detalheIA = await extrairCampoCorrecaoIA("detalhe", textoEntrada, u)
    return await prepararConfirmacaoCorrecao(from, u, "detalhe", detalheIA)
  }

  // -- EDITAR_URGENCIA --
  if (u.stage === STAGES.EDITAR_URGENCIA) {
    const lower = (text || "").toLowerCase()
    if (text === "eu_alta" || lower.includes("alta") || lower.includes("urgent")) {
      u.urgencia = "alta"
      u.semReceber = true
      return responderComTimer(from, await voltarParaConfirmacao(from, u))
    }
    if (text === "eu_normal" || lower.includes("moder") || lower.includes("normal") || lower.includes("aguard")) {
      u.urgencia = "normal"
      u.semReceber = false
      return responderComTimer(from, await voltarParaConfirmacao(from, u))
    }
    if (text === "eu_baixa" || lower.includes("baix") || lower.includes("sem pres")) {
      u.urgencia = "baixa"
      u.semReceber = false
      return responderComTimer(from, await voltarParaConfirmacao(from, u))
    }
    return responderComTimer(from, {
      texto: "⚡ *Qual é o nível de urgência correto?*",
      opcoes: [
          { id: "eu_alta",   title: "🔴 Alta" },
          { id: "eu_normal", title: "🟡 Moderada" },
          { id: "eu_baixa",  title: "🟢 Baixa" }
      ]
    })
  }

  // -- EDITAR_DESCRICAO --
  if (u.stage === STAGES.EDITAR_DESCRICAO) {
    let textoEntrada = text
    if (!textoEntrada && ehAudio) {
      const mediaId = msgObj?.audio?.id || msgObj?.voice?.id
      if (mediaId) {
        const midia = await baixarMidia(mediaId)
        if (midia) {
          if (!u.modoTexto) await enviar(from, "👂 Ouvindo...", null, false)
          textoEntrada = await transcrever(midia.buffer, midia.mimeType, { origem: "editar_descricao" })
        }
      }
    }
    if (!textoEntrada) {
      if (ehAudio) return await responderFalhaAudioCorrecao(from, u)
      return responderComTimer(from, { texto: "💬 *Qual é a descrição correta do seu caso?*\n\n_Digite ou envie um áudio com a descrição atualizada._", opcoes: null })
    }

    const consolidado = await consolidarDescricaoCorrecaoIA(u, textoEntrada)
    return await prepararConfirmacaoCorrecao(from, u, "descricao", consolidado.descricao, consolidado)
  }

  // -- CONFIRMAR_CORRECAO_NOME --
  if (u.stage === STAGES.CONFIRMAR_CORRECAO_NOME) {
    if (text === "nome_correcao_confirmar") {
      return await aplicarCorrecaoPendente(from, u)
    }
    let textoEntrada = text
    if (!textoEntrada && ehAudio) {
      const mediaId = msgObj?.audio?.id || msgObj?.voice?.id
      if (mediaId) {
        const midia = await baixarMidia(mediaId)
        if (midia) {
          if (!u.modoTexto) await enviar(from, "👂 Ouvindo...", null, false)
          textoEntrada = await transcrever(midia.buffer, midia.mimeType, { origem: "confirmar_correcao_nome" })
        }
      }
    }
    const subcampoNome = u._correcaoPendenteSubcampo || "nome"
    const ehNomeContato = subcampoNome === "nomeContato"
    if (!textoEntrada) {
      if (ehAudio) return await responderFalhaAudioCorrecao(from, u)
      const nomeAtual = u._correcaoPendenteValor || ""
      const textoReapres = ehNomeContato
        ? `●●○○○○ 👤 Etapa 2 de 6 · *Nome*\n\n✅ Seu nome é *${nomeAtual}*.\n\nEstá correto? Se não estiver, é só me dizer o nome certo agora. Pode falar ou digitar. 🎙️`
        : `●●○○○○ 👤 Etapa 2 de 6 · *Nome*\n\n✅ O nome da pessoa atendida é *${nomeAtual}*.\n\nEstá correto? Se não estiver, é só me dizer o nome certo agora. Pode falar ou digitar. 🎙️`
      return responderComTimer(from, {
        texto: textoReapres,
        opcoes: [{ id: "nome_correcao_confirmar", title: "✅ Sim, está certo" }]
      })
    }
    const nomeLimpo = await extrairNomeAudio(textoEntrada)
    const validacaoNomeCorr = nomeLimpo ? ehNomeAparente(nomeLimpo, textoEntrada) : false
    if (!nomeLimpo || validacaoNomeCorr === false) {
      return responderComTimer(from, { texto: "Pode me dizer só o nome completo, por favor?", opcoes: null })
    }
    if (validacaoNomeCorr === "incompleto") {
      return responderComTimer(from, { texto: "Preciso do nome completo. Por favor, informe também o sobrenome.", opcoes: null })
    }
    u._correcaoPendenteValor = nomeLimpo
    iniciarTimer(from)
    const textoReconf = ehNomeContato
      ? `●●○○○○ 👤 Etapa 2 de 6 · *Nome*\n\n✅ Seu nome é *${nomeLimpo}*.\n\nEstá correto? Se não estiver, é só me dizer o nome certo agora. Pode falar ou digitar. 🎙️`
      : `●●○○○○ 👤 Etapa 2 de 6 · *Nome*\n\n✅ O nome da pessoa atendida é *${nomeLimpo}*.\n\nEstá correto? Se não estiver, é só me dizer o nome certo agora. Pode falar ou digitar. 🎙️`
    const audioReconf = ehNomeContato
      ? `${nomeLimpo}. Esse é o seu nome correto?`
      : `${nomeLimpo}. Esse é o nome correto da pessoa atendida?`
    if (!u.modoTexto) {
      try {
        const ogg = await gerarAudioAtendente(u.atendente, audioReconf)
        await enviarAudio(from, urlAudioAtendente(ogg))
        await new Promise(r => setTimeout(r, 3500))
      } catch (e) { logErro("tts", "Falha áudio reconfirmar nome correção", e) }
    }
    return responderComTimer(from, {
      texto: textoReconf,
      opcoes: [{ id: "nome_correcao_confirmar", title: "✅ Sim, está certo" }]
    })
  }

  // -- CONFIRMAR_CORRECAO_CIDADE --
  if (u.stage === STAGES.CONFIRMAR_CORRECAO_CIDADE) {
    if (text === "cidade_correcao_confirmar") {
      return await aplicarCorrecaoPendente(from, u)
    }
    let textoEntrada = text
    if (!textoEntrada && ehAudio) {
      const mediaId = msgObj?.audio?.id || msgObj?.voice?.id
      if (mediaId) {
        const midia = await baixarMidia(mediaId)
        if (midia) {
          if (!u.modoTexto) await enviar(from, "👂 Ouvindo...", null, false)
          textoEntrada = await transcrever(midia.buffer, midia.mimeType, { origem: "confirmar_correcao_cidade" })
        }
      }
    }
    if (!textoEntrada) {
      if (ehAudio) return await responderFalhaAudioCorrecao(from, u)
      const cidadeAtual = u._correcaoPendenteExtra?.cidade || u._correcaoPendenteValor || ""
      const ufAtual = u._correcaoPendenteExtra?.uf || ""
      const regiaoAtual = u._correcaoPendenteExtra?.regiao || ""
      const textoExib = `${cidadeAtual}${ufAtual ? `, ${ufAtual}` : ""}${regiaoAtual ? ` (${regiaoAtual})` : ""}`
      return responderComTimer(from, {
        texto: `●●●●●○ 📍 Etapa 5 de 6 · *Cidade*\n\n✅ Localizei: *${textoExib}*.\n\nEstá correto? Se não estiver, é só me dizer a cidade certa agora. Pode falar ou digitar. 🎙️`,
        opcoes: [{ id: "cidade_correcao_confirmar", title: "✅ Sim, está certo" }]
      })
    }
    let textoCidade = (await extrairCidadeAudio(textoEntrada)).trim()
    if (textoCidade.toUpperCase().startsWith("CEP:")) textoCidade = textoCidade.slice(4).trim()
    const cepRegexConf = /^\d{5}-?\d{3}$/
    if (cepRegexConf.test(textoCidade.replace(/\D/g, ""))) {
      try {
        const infoCEP = await buscarPorCEP(textoCidade.replace(/\D/g, ""))
        return await prepararConfirmacaoCorrecao(from, u, "cidade", infoCEP.cidade, {
          cidade: infoCEP.cidade, uf: infoCEP.uf, regiao: infoCEP.regiao
        })
      } catch (e) {
        return responderComTimer(from, {
          texto: "Não consegui localizar este CEP. Tente novamente com oito dígitos ou informe a cidade com o estado.",
          opcoes: null
        })
      }
    }
    const locConf = await buscarCidadePorNome(textoCidade)
    if (locConf?.multiplos && locConf.opcoes?.length > 1) {
      u._cidadesMultiplasEdit = locConf.opcoes
      setStage(u, STAGES.EDITAR_CIDADE)
      iniciarTimer(from)
      const opcoesLista = locConf.opcoes.slice(0, 4).map((op, i) => ({
        id: `edit_cidade_multipla_${i}`,
        title: abreviarCidadeBotao(op.cidade, op.uf)
      }))
      if (!u.modoTexto) {
        try {
          const nomesAudio = locConf.opcoes.slice(0, 4).map(op => `${op.cidade}, ${estadoPorExtenso(op.uf) || op.uf}`).join("; ")
          const ogg = await gerarAudioAtendente(u.atendente,
            `Encontrei ${numeroPorExtenso(locConf.opcoes.length, "feminino")} cidades com esse nome: ${nomesAudio}. Selecione a opção correspondente.`)
          await enviarAudio(from, urlAudioAtendente(ogg))
          await new Promise(r => setTimeout(r, 4000))
        } catch (e) { logErro("tts", "Falha áudio cidades múltiplas confirmar correção cidade", e) }
      }
      return responderComTimer(from, {
        texto: `●●●●●○ 📍 Etapa 5 de 6 · *Cidade*\n\n🔍 Encontrei *${locConf.opcoes.length} cidades* com esse nome. Qual é a sua?\n\n_Se a sua cidade não aparecer, diga ou digite o nome com o estado._`,
        opcoes: opcoesLista
      })
    }
    if (locConf?.cidade) {
      return await prepararConfirmacaoCorrecao(from, u, "cidade", locConf.cidade, {
        cidade: locConf.cidade, uf: locConf.uf || u.uf, regiao: locConf.regiao || u.regiao
      })
    }
    if (!u.modoTexto) {
      try {
        const ogg = await gerarAudioAtendente(u.atendente, "Não encontrei essa cidade. Me diga a cidade junto com o estado, por exemplo Recife Pernambuco, ou informe o CEP.")
        await enviarAudio(from, urlAudioAtendente(ogg))
        await new Promise(r => setTimeout(r, 3000))
      } catch (e) { logErro("tts", "Falha áudio cidade não encontrada confirmar correção", e) }
    }
    return responderComTimer(from, {
      texto: `📍 Não consegui encontrar essa cidade.\n\nTente informar a *cidade com o estado* ou o *CEP*.\n\nExemplos:\n• Recife Pernambuco\n• Olinda PE\n• 50000000`,
      opcoes: null
    })
  }
  if (u.stage === STAGES.AGENDAMENTO_HORARIO) {
    if (text === "m_inicio") {
      setStage(u, STAGES.CLIENTE)
      iniciarTimer(from)
      return await menuClienteComAudio(from, u)
    }
    if (text === "adv_urg") return await iniciarMensagemUrgenteCliente(from, u)

    if (text === "slots_proxima_pagina") {
      u._paginaSlots = (u._paginaSlots || 0) + 1
      return await iniciarAgendamento(from, u)
    }

    if (text === "slots_pagina_anterior") {
      u._paginaSlots = Math.max(0, (u._paginaSlots || 1) - 1)
      return await iniciarAgendamento(from, u)
    }

    if (text && text.startsWith("slot_")) {
      const idx = parseInt(text.replace("slot_", ""))
      const slots = (u._slotsDisponiveis || []).map(s => new Date(s))
      const slotEscolhido = slots[idx]

      if (!slotEscolhido) {
        return await iniciarAgendamento(from, u)
      }

      u._slotEscolhido = slotEscolhido.toISOString()
      setStage(u, STAGES.AGENDAMENTO_DURACAO)
      iniciarTimer(from)

      const primeiroNome = primeiroNomeCliente(u) || "você"
      const slotFormatado = formatarSlotAudio(slotEscolhido)

      await enviarAudioModoVoz(
        from,
        u,
        `Ótimo, ${primeiroNome}! Você selecionou ${slotFormatado}. Agora preciso saber quanto tempo você precisa para a consulta. Escolha a duração desejada.`,
        "duração agendamento"
      )

      return {
        texto: `✅ *${formatarSlot(slotEscolhido)}* selecionado!\n\nQual a duração da consulta?`,
        opcoes: [
          { id: "dur_20", title: "⏱️ 20 minutos" },
          { id: "dur_30", title: "⏱️ 30 minutos" },
          { id: "dur_45", title: "⏱️ 45 minutos" },
          { id: "dur_60", title: "⏱️ 1 hora" },
      { id: "m_inicio", title: "🏠 Menu do cliente" }
        ]
      }
    }
    iniciarTimer(from)
    return await iniciarAgendamento(from, u)
  }

  // -- AGENDAMENTO_DURACAO --
  if (u.stage === STAGES.AGENDAMENTO_DURACAO) {
    if (text === "m_inicio") {
      setStage(u, STAGES.CLIENTE)
      iniciarTimer(from)
      return await menuClienteComAudio(from, u)
    }
    if (text === "adv_urg") return await iniciarMensagemUrgenteCliente(from, u)

    const duracoes = { dur_20: 20, dur_30: 30, dur_45: 45, dur_60: 60 }
    const duracao = duracoes[text]

    if (!duracao || !u._slotEscolhido) {
      setStage(u, STAGES.AGENDAMENTO_HORARIO)
      return await iniciarAgendamento(from, u)
    }

    u._duracaoEscolhida = duracao
    setStage(u, STAGES.AGENDAMENTO_CONFIRMAR)
    iniciarTimer(from)

    const slot = new Date(u._slotEscolhido)
    const primeiroNome = primeiroNomeCliente(u) || "você"
    const duracaoLabel = duracao === 60 ? "1 hora" : `${duracao} minutos`

    await enviarAudioModoVoz(
      from,
      u,
      `Perfeito! Vou confirmar seu agendamento. Data e horário: ${formatarSlotAudio(slot)}. Duração: ${duracaoLabel}. Primeira opção: confirmar. Segunda opção: outro horário. Terceira opção: menu do cliente.`,
      "confirmar agendamento"
    )

    return {
      texto: `📋 *Confirme seu agendamento:*\n\n📅 Data: *${formatarSlot(slot)}*\n⏱️ Duração: *${duracaoLabel}*\n👤 Nome: *${u.nome || "—"}*\n📄 Caso: *${u.numeroCaso || "—"}*\n\nEstá correto?`,
      opcoes: [
        { id: "ag_confirmar", title: "✅ Confirmar" },
        { id: "ag_outro_horario", title: "📅 Outro horário" },
      { id: "m_inicio", title: "🏠 Menu do cliente" }
      ]
    }
  }

  // -- AGENDAMENTO_CONFIRMAR --
  if (u.stage === STAGES.AGENDAMENTO_CONFIRMAR) {
    if (text === "m_inicio") {
      setStage(u, STAGES.CLIENTE)
      iniciarTimer(from)
      return await menuClienteComAudio(from, u)
    }
    if (text === "adv_urg") return await iniciarMensagemUrgenteCliente(from, u)

    if (text === "ag_outro_horario") {
      return await iniciarAgendamento(from, u)
    }

    if (text === "ag_confirmar") {
      const slot = new Date(u._slotEscolhido)
      const duracao = u._duracaoEscolhida || 30
      const primeiroNome = primeiroNomeCliente(u) || "você"
      const duracaoLabel = duracao === 60 ? "1 hora" : `${duracao} minutos`

      let eventoId = null
      try {
        eventoId = await criarEventoConsulta(u, slot, duracao)
        if (eventoId) u._eventoCalendarId = eventoId
        if (u.negocioId) {
          await hsMoverStage(u.negocioId, HS_STAGE.AGENDAMENTO)
          u.negocioStageId = HS_STAGE.AGENDAMENTO
          await hsCriarNota(u.contatoId, "CONSULTA AGENDADA",
            `${u.nome} agendou consulta para ${formatarSlot(slot)} (${duracaoLabel}).\nCaso: ${u.numeroCaso} | Área: ${u.area}`)
          notificarAgendamento(u, slot, duracao, u.negocioId).catch(e => console.error("[notif] agendamento:", e.message))
        }
      } catch (e) {
        logErro("calendar", "Erro ao criar evento: " + e.message)
      }

      if (!eventoId) {
        delete u._slotsDisponiveis
        delete u._slotEscolhido
        delete u._duracaoEscolhida
        setStage(u, STAGES.CLIENTE)
        iniciarTimer(from)
        await enviarAudioModoVoz(
          from,
          u,
          "Não consegui confirmar esse agendamento agora. Você pode tentar novamente ou deixar uma mensagem urgente para nossa equipe.",
          "falha agendamento"
        )
        return {
          texto: "⚠️ Não consegui confirmar esse agendamento agora.\n\nVocê pode tentar novamente ou deixar uma mensagem urgente para nossa equipe.",
          opcoes: [
            { id: "adv_agendar_ligacao", title: "📅 Tentar novamente" },
        { id: "adv_urg", title: "⚠️ Mensagem urgente" },
      { id: "m_inicio", title: "🏠 Menu do cliente" }
          ]
        }
      }

      // Limpa dados temporários
      delete u._slotsDisponiveis
      delete u._slotEscolhido
      delete u._duracaoEscolhida
      setStage(u, STAGES.CLIENTE)
      iniciarTimer(from)

      await enviarAudioModoVoz(
        from,
        u,
        `Consulta agendada com sucesso, ${primeiroNome}! Sua consulta está marcada para ${formatarSlotAudio(slot)}, com duração de ${duracaoLabel}. Fique atento ao WhatsApp no horário combinado.`,
        "agendamento confirmado"
      )

      return await enviarTelaImagemOuTexto(
        from,
        IMAGEM_ADV_AGENDADO_URL,
        `🎉 *Consulta agendada com sucesso!*\n\n📅 *${formatarSlot(slot)}*\n⏱️ Duração: *${duracaoLabel}*\n📄 Caso: *${u.numeroCaso}*\n\n📲 Fique atento ao WhatsApp no horário combinado. 😊`,
        [
      { id: "m_status",   title: "📊 Status do meu caso" },
      { id: "m_docs", title: "📎 Enviar documentos" },
      { id: "m_inicio", title: "🏠 Menu do cliente" }
        ]
      )
    }

    iniciarTimer(from)
    return await iniciarAgendamento(from, u)
  }

  return null
}

async function processarInterno(from, nomeWA, text, msgObj, u) {
  text = sanitizarTextoEntrada(text)
  u.ultimaMsg = Date.now()
  u.modoDigitando = false
  u.temCadastroCompleto = Boolean(u.temCadastroCompleto || podeMostrarMenuCliente(u))
  limparTimer(u)
  limparTimerIncentivoDescricao(u)

  const STAGES_RETOMADA_IGNORAR = [
    STAGES.RETOMADA_AUTOMATICA,
    STAGES.RETOMADA_MENU,
    STAGES.RESUMO_RETOMADA,
    STAGES.ACOLHIMENTO,
    STAGES.AUDIO_AGUARDANDO,
    STAGES.AUDIO_CONFIRMAR_TRANSCRICAO,
    STAGES.AUDIO_CONFIRMAR_AREA_CANAL,
    STAGES.ASSESSORIA_INICIAL
  ]
  if (u.stage && !STAGES_RETOMADA_IGNORAR.includes(u.stage) && !u._stageRetomadaOriginal) {
    u._stageRetomadaOriginal = u.stage
  }

  if (u._fluxoEncerrado) {
    logDebug(`[FLUXO_MORTO] Ignorando interação antiga e reiniciando entrada | USER: ${sanitizarTextoEntrada(from) || "-"}`)

    const telefone = getTelefoneContato(from, u)
    const contatoHS = await hsBuscarPorPhone(telefone)
    const temNoHS = contatoHS?.id != null

    if (((u.contatoId || u.negocioId) || temNoHS) && !u.numeroCaso) {
      if (temNoHS && !u.contatoId) u.contatoId = contatoHS.id
      u._fluxoEncerrado = false
      u.jaOfereceuRetomada = false
      if (!usuarioTemRelatoParaRetomada(u)) {
        u.aguardandoRetomada = false
        u._retomadaEhLeadFrio = false
        u._stageRetomadaOriginal = null
        u.etapa = null
        u.lastPergunta = null
        u.lastPerguntaPayload = null
        u.aguardandoResposta = false
        setStage(u, STAGES.ACOLHIMENTO)
        return processarInterno(from, nomeWA, "", { type: "text", text: { body: "" } }, u)
      }
      const _stagePreservado = u._stageRetomadaOriginal || null
      setStage(u, STAGES.RETOMADA_AUTOMATICA)
      u._retomadaEhLeadFrio = false
      u._stageRetomadaOriginal = _stagePreservado || obterStageRetomadaOriginal(u)
      u.atendente = u.atendente || sortearAtendente()
      return processarInterno(from, nomeWA, "", { type: "text", text: { body: "" } }, u)
    }

    if (u.numeroCaso) {
      u._fluxoEncerrado = false
      limparTimer(u)
      return await menuClienteComAudio(from, u)
    }

    prepararNovaEntradaAposFluxoEncerrado(u, nomeWA)
    return processarInterno(from, nomeWA, "", { type: "text", text: { body: "" } }, u)
  }

  const tipo    = sanitizarTextoEntrada(msgObj?.type)
  const ehAudio = tipo === "audio"
  const ehDoc   = tipo === "document" || tipo === "image"

  const buttonId = sanitizarTextoEntrada(msgObj?.interactive?.button_reply?.id || msgObj?.interactive?.list_reply?.id || "")
  const textoRetomada = sanitizarTextoEntrada(msgObj?.text?.body || msgObj?.interactive?.button_reply?.title || msgObj?.interactive?.list_reply?.title || text).toLowerCase()
  const usuarioRespondendoAgora = Boolean(u.aguardandoResposta) && Boolean(text || buttonId || ehAudio || ehDoc)
  const ctx = criarCtx({ from, nomeWA, text, msgObj, buttonId, tipo, ehAudio, ehDoc, timestamp: Date.now() })

  if (u._casoNaoReconhecido && u.numeroCaso) {
    return {
      texto: `⚠️ Este atendimento ficou marcado como *não reconhecido*.\n\nNossa equipe foi notificada para verificar o ocorrido. Você não precisa dar continuidade por aqui agora.`,
      opcoes: null,
      registrarPergunta: false
    }
  }

  if (
    u._aguardandoReconhecimentoTerceiro &&
    u.numeroCaso &&
    !["terceiro_reconhece", "terceiro_nao_reconhece"].includes(buttonId || text) &&
    !normalizarTextoGatilho(text).includes("reconhe")
  ) {
    iniciarTimer(from)
    return {
      texto: `📄 *Atendimento aberto para você*\n\nAntes de acessar o menu do cliente, preciso confirmar uma coisa:\n\nVocê reconhece este atendimento?`,
      opcoes: [
        { id: "terceiro_reconhece", title: "✅ Reconheço" },
        { id: "terceiro_nao_reconhece", title: "❌ Não reconheço" }
      ]
    }
  }

  if (u._casoAnteriorCliente && !u.numeroCaso && !ehAudio && !ehDoc && (buttonId === "terceiro_cancelar_menu" || text === "terceiro_cancelar_menu")) {
    const menuAnterior = await cancelarNovoCasoClienteEVoltarMenu(from, u, "cancelado_pelo_menu")
    if (menuAnterior) return menuAnterior
  }

  // Cenário B: novo cliente (sem caso anterior) que abriu atendimento para terceiro e clicou em cancelar
  if (!u._casoAnteriorCliente && !u.numeroCaso && !ehAudio && !ehDoc && (buttonId === "terceiro_cancelar_menu" || text === "terceiro_cancelar_menu")) {
    limparTimer(u)
    if (!u.leadIncompletoCapturado) {
      await capturarLeadIncompleto(from, u).catch(e => logErro("hubspot", "cancelar_terceiro_novo: " + e.message))
    }
    limparDadosCasoAtual(u, { marcarFluxoEncerrado: true })
    await enviarAudioModoVoz(from, u, "Tudo bem. Cancelei o atendimento. Quando quiser começar de novo, é só me chamar.", "cancelar terceiro novo")
    return {
      texto: `✅ *Atendimento cancelado.*\n\nQuando quiser começar um novo atendimento, é só me chamar aqui. 😊`,
      opcoes: null
    }
  }

  if (u._casoAnteriorCliente && !u.numeroCaso && !ehAudio && !ehDoc && (buttonId === "m_inicio" || ehMensagemEntradaGlobal(text))) {
    const menuAnterior = await cancelarNovoCasoClienteEVoltarMenu(from, u, "menu_ou_saudacao")
    if (menuAnterior) return menuAnterior
  }

  if (!ehAudio && !ehDoc && !u.numeroCaso) {
    if (text === "pre_nome_informar") {
      iniciarTimer(from)
      if (u.atendimentoParaTerceiro) {
        // Se nomeContato ainda não foi coletado, pedir antes do nome do atendido
        if (!u.nomeContato) {
          setStage(u, STAGES.ACOLHIMENTO_NOME_CONTATO)
          return await responderTelaComAudio(
            from,
            u,
            {
              texto: `*👥 Atendimento para outra pessoa*\n\n✅ Combinado! Só me diga uma coisa antes: *qual é o seu nome*?\n\nPreciso saber quem está aqui no WhatsApp cuidando desse caso. 😊\n\n_Digite ou envie um áudio com seu nome._ 🎙️`,
              opcoes: null
            },
            "Antes de continuar, preciso saber o seu nome — de quem está aqui no WhatsApp. Pode falar ou digitar.",
            "pre atendimento pede nome contato"
          )
        }
        setStage(u, STAGES.ACOLHIMENTO_NOME)
        return await responderTelaComAudio(
          from,
          u,
          {
            texto: `●●○○○○ 👤 Etapa 2 de 6 · *Nome*\n\n👥 *Atendimento para outra pessoa*\n\nQual é o *nome completo* da pessoa atendida?`,
            opcoes: null
          },
          "Qual é o nome completo da pessoa atendida?",
          "pre atendimento nome terceiro"
        )
      }
      return await perguntarNome(u)
    }
    if (text === "pre_mim_continuar") {
      u.atendimentoParaTerceiro = false
      u.telefoneEhDoCliente = null
      u.relacaoComAtendido = null
      u._nomeTitularOrigem = null
      u._nomeTemp = null
      setStage(u, STAGES.ACOLHIMENTO_NOME)
      iniciarTimer(from)
      return await responderTelaComAudio(
        from,
        u,
        {
          texto: `●●○○○○ 👤 Etapa 2 de 6 · *Nome*\n\n🙋 *Atendimento para você*\n\nTudo bem. Vou registrar o atendimento no seu nome.\n\nQual é o seu *nome completo*?`,
          opcoes: null
        },
        "Tudo bem. Vou registrar o atendimento no seu nome. Qual é o seu nome completo?",
        "pre atendimento para mim"
      )
    }
    if (text === "pre_cidade_informar") {
      iniciarTimer(from)
      // suprimirAudio=true: a resposta de imprevisto já enviou áudio antes deste botão
      return await flowAcolhimentoCidade(u, { from, suprimirAudio: true })
    }
    if (text === "pre_terceiro_continuar") {
      u.atendimentoParaTerceiro = true
      u.telefoneEhDoCliente = false
      u._nomeTitularOrigem = "atendido"
      setStage(u, STAGES.ACOLHIMENTO_NOME_CONTATO)
      iniciarTimer(from)
      return await responderTelaComAudio(
        from,
        u,
        {
          texto: `👤 *Atendimento para outra pessoa*\n\nAntes de continuar, preciso saber o *seu nome* — quem está aqui no WhatsApp cuidando desse caso.\n\n*Como você se chama?*`,
          opcoes: null
        },
        "Entendido! Antes de continuar, preciso saber o seu nome — de quem está aqui no WhatsApp. Pode falar ou digitar.",
        "pre atendimento terceiro pede nome contato"
      )
    }
    // Handlers para tela de esclarecimento quando o usuário está confuso
    if (text === "confuso_registrar") {
      iniciarTimer(from)
      setStage(u, STAGES.AUDIO_AGUARDANDO)
      if (!u.atendente) u.atendente = sortearAtendente()
      try {
        const ogg = await gerarAudioAtendente(u.atendente,
          `Certo! Me conte o que aconteceu. Pode falar em áudio ou digitar — eu vou organizar tudo para o advogado.`)
        await enviarAudio(from, urlAudioAtendente(ogg))
        await new Promise(r => setTimeout(r, 3000))
      } catch (e) { logErro("tts", "Falha áudio iniciar relato confuso", e) }
      return {
        texto: `Me conte sua situação. 😊\n\nPode falar em áudio 🎙️ ou digitar ✍️, do jeito que for mais fácil pra você.`,
        opcoes: null
      }
    }
    if (text === "confuso_exemplos") {
      iniciarTimer(from)
      const exemplos = `Aqui estão alguns exemplos curtos que ajudam a registrar bem o caso:\n\n• Meu benefício do INSS foi cortado há 2 meses\n• É sobre o caso da minha mãe: cancelaram o benefício dela\n• Fui demitido sem receber aviso e FGTS\n• Preciso saber se vocês atendem em minha cidade\n\nSe um desses descreve seu caso, clique em \"Registrar com resumo\" para eu abrir o atendimento com esse texto, ou digite mais detalhes.`
      const exemplosAudio = `Alguns exemplos: meu benefício do INSS foi cortado há dois meses. É sobre o caso da minha mãe: cancelaram o benefício dela. Fui demitido sem receber aviso e FGTS. Preciso saber se vocês atendem na minha cidade. Se algum desses descreve seu caso, escolha registrar com resumo ou digite mais detalhes.`
      return await responderTelaComAudio(from, u, { texto: exemplos, opcoes: [ { id: "confuso_registrar_resumo", title: "📄 Registrar com resumo" }, { id: "confuso_back", title: "🔙 Voltar" } ] }, exemplosAudio, "exemplos confuso")
    }
    if (text === "confuso_registrar_resumo") {
      iniciarTimer(from)
      const resumo = u._ultimoTextoConfuso || u._audioCanalTranscricao || text || ""
      if (!resumo || resumo.replace(/\s+/g, "").length < 3) {
        return responderComTimer(from, { texto: `Não encontrei um resumo salvo. Por favor, digite uma frase curta que resuma o caso.` , opcoes: null })
      }
      // aceitar resumo e seguir com classificação/assessoria
      u._audioCanalTranscricao = resumo
      u._relatoAntecipadoPreAtendimento = normalizarTextoCRM(resumo)
      try {
        const classificacao = await classificarAreaAudio(u._audioCanalTranscricao)
        aplicarClassificacaoJuridica(u, classificacao)
      } catch (e) { logErro('classificar', 'erro ao classificar resumo', e) }
      return await flowAssessoriaInicial(u, { from, origem: "texto" })
    }
    if (text === "confuso_back") {
      iniciarTimer(from)
      return await telaEsclarecimentoConfuso(from, u)
    }
    if (text === "confuso_duvida") {
      iniciarTimer(from)
      const resposta = respostaCurtaDuvidaPreAtendimento(text)
      return responderComTimer(from, { texto: `💬 ${resposta}\n\nSe quiser registrar um caso, clique em *Registrar caso*.`, opcoes: [ { id: "confuso_registrar", title: "📄 Registrar caso" } ] })
    }
    if (text === "confuso_terceiro") {
      u.atendimentoParaTerceiro = true
      u.telefoneEhDoCliente = false
      u._nomeTitularOrigem = "atendido"
      setStage(u, STAGES.ACOLHIMENTO_NOME_CONTATO)
      iniciarTimer(from)
      return await responderTelaComAudio(
        from,
        u,
        {
          texto: `*👥 Atendimento para outra pessoa*\n\n✅ Combinado! Só me diga uma coisa antes: *qual é o seu nome*?\n\nPreciso saber quem está aqui no WhatsApp cuidando desse caso. 😊\n\n_Digite ou envie um áudio com seu nome._ 🎙️`,
          opcoes: null
        },
        "Entendido! Antes de continuar, preciso saber o seu nome — de quem está aqui no WhatsApp. Pode falar ou digitar.",
        "pre atendimento terceiro pede nome contato"
      )
    }
    if (text === "confuso_humano") {
      // sinaliza pedido de humano e coleta dados mínimos
      u._solicitouHumano = true
      setStage(u, STAGES.ACOLHIMENTO_NOME)
      iniciarTimer(from)
      return await responderTelaComAudio(
        from,
        u,
        {
          texto: `🆘 Vamos encaminhar para um atendente humano. Antes disso, preciso anotar um nome e telefone rápido para direcionar o pedido. Qual é seu *nome completo*?`,
          opcoes: null
        },
        "Vamos encaminhar para um atendente humano. Antes disso, preciso anotar um nome e telefone rápido. Qual é seu nome completo?",
        "pedido humano iniciar"
      )
    }
  }

  if (!ehAudio && !ehDoc && !u.numeroCaso && (buttonId === "m_inicio" || ehMensagemEntradaGlobal(text))) {
    if (await tentarRestaurarClienteHubSpotParaMenu(from, u)) {
      return await menuClienteComAudio(from, u)
    }
  }

  const botoesClienteComCaso = new Set([
    "m_docs",
    "docs_pedido_admin",
    "m_status",
    "m_adv",
    "dir_agendar",
    "adv_ag",
    "adv_urg",
    "adv_agendar_ligacao",
    "cliente_cancelar_consulta",
    "cliente_cancelar_consulta_sim"
  ])
  if (!ehAudio && !ehDoc && !u.numeroCaso && botoesClienteComCaso.has(buttonId || text)) {
    await tentarRestaurarClienteHubSpotParaMenu(from, u)
  }

  if (ehAudio && !ehDoc && ![STAGES.AUDIO_AGUARDANDO, STAGES.AUDIO_PROCESSANDO].includes(u.stage)) {
    const respostaEncerrarAudio = await detectarEncerramentoPorAudio(from, u, msgObj, tipo)
    if (respostaEncerrarAudio) return respostaEncerrarAudio
  }
  const entradaPrioritariaRetomadaMenu = buttonId || text
  const devePriorizarHandlerRetomadaMenu = (
    u.stage === STAGES.RETOMADA_MENU &&
    ["rm_continuar", "rm_recomecar", "m_encerrar"].includes(entradaPrioritariaRetomadaMenu)
  )

  logContextoExecucao({ from: ctx.from, stage: u.stage, flow: "processar", msg: ctx.text })

  migrarFluxoAntigoParaRelatoLivre(u)
  if (u.numeroCaso && ehStageFluxoAntigo(u.stage)) {
    logDebug(`[LEGADO_CLIENTE] ${u.stage} -> ${STAGES.CLIENTE} | USER: ${u._numero || "-"}`)
    setStage(u, STAGES.CLIENTE)
    salvarEtapa(u._numero, STAGES.AUDIO_AGUARDANDO)
    return await menuClienteComAudio(from, u)
  }

  if (!devePriorizarHandlerRetomadaMenu && [STAGES.RETOMADA_AUTOMATICA, STAGES.RETOMADA_MENU].includes(u.stage)) {
    iniciarTimer(from)
    if (u.lastPerguntaPayload) return u.lastPerguntaPayload
    const flowFn = flowMap[u.stage]
    if (flowFn) {
      const resultado = flowFn(u, ctx)
      if (resultado) return resultado
    }
    return null
  }

  if (!ehAudio && !ehDoc && ehMensagemEntradaGlobal(text)) {
    // Estados onde saudações devem ser bloqueadas (estados intermediários)
    const estadosBloqueioSaudacao = [
      STAGES.ACOLHIMENTO_PARA_QUEM,
      STAGES.ACOLHIMENTO_NOME,
      STAGES.ACOLHIMENTO_NOME_CONTATO,
      STAGES.ACOLHIMENTO_CONFIRMA_NOME_CONTATO,
      STAGES.ACOLHIMENTO_CONFIRMA_NOME,
      STAGES.ACOLHIMENTO_CONFIRMA_TITULAR_NOME,
      STAGES.ACOLHIMENTO_CONFIRMA_WHATSAPP,
      STAGES.ACOLHIMENTO_CIDADE,
      STAGES.ACOLHIMENTO_CEP,
      STAGES.ENTENDIMENTO_INICIAL,
      STAGES.DIRECIONAMENTO,
      STAGES.NOME,
      STAGES.CIDADE,
      STAGES.DESCRICAO_CASO,
      STAGES.CONFIRMACAO,
      STAGES.COLETA_NOME,
      STAGES.COLETA_REGIAO,
      STAGES.COLETA_UF,
      STAGES.COLETA_CIDADE,
      STAGES.COLETA_CIDADE_REGIAO,
      STAGES.COLETA_CONTRIB,
      STAGES.COLETA_CONTRIB_REGIAO,
      STAGES.COLETA_CONTRIB_REGIAO_V2,
      STAGES.COLETA_BENEF,
      STAGES.COLETA_BENEF_REGIAO_V2,
      STAGES.COLETA_VERIF_TEL,
      STAGES.COLETA_TEL_OUTRO,
      STAGES.COLETA_TEL_WPP,
      STAGES.COLETA_TEL_WPP_CONTATO,
      STAGES.GATILHO,
      STAGES.URGENCIA,
      STAGES.INSS_MENU,
      STAGES.INSS_NOVO,
      STAGES.INSS_NEG_TIPO,
      STAGES.INSS_CORT_TIPO,
      STAGES.INSS_APOS,
      STAGES.INSS_BPC,
      STAGES.INSS_INC,
      STAGES.INSS_DEP,
      STAGES.INSS_OUT,
      STAGES.INSS_JA,
      STAGES.INSS_NEG_QUANDO,
      STAGES.INSS_CORT_MOT,
      STAGES.INSS_CORT_REC,
      STAGES.INSS_CORT_QDO,
      STAGES.TRAB_MENU,
      STAGES.TRAB_DEM_TIPO,
      STAGES.TRAB_DEM_VERB,
      STAGES.TRAB_DEM_QDO,
      STAGES.TRAB_DIR_TIPO,
      STAGES.TRAB_DIR_PEND,
      STAGES.TRAB_ACID_AF,
      STAGES.TRAB_ASS_S,
      STAGES.TRAB_ASS_PROV,
      STAGES.TRAB_OUT_DESC,
      STAGES.OUTROS_MENU,
      STAGES.OUT_CONS_TIPO,
      STAGES.OUT_REV_TIPO,
      STAGES.OUT_DESC,
      STAGES.AGUARDANDO_URGENTE,
      STAGES.URGENTE_AUDIO_CONFIRMA,
      STAGES.URGENTE_AUDIO_ERRO_TRANSCRICAO,
      STAGES.COLETA_DESC,
      STAGES.COLETA_DESC_AUDIO,
      STAGES.DESC_CONFIRMA,
      STAGES.DESC_ERRO_TRANSCRICAO,
      STAGES.SUGESTAO_FLUXO_OUTRO,
      STAGES.EXPLICAR_TUDO_OFERTA,
      STAGES.AUDIO_FLUXO_CONFIRMA,
      STAGES.AUDIO_CONFIRMAR_DADOS,
      STAGES.CONFIRMAR_ENTRADA,
      STAGES.MENU_CORRECAO,
      STAGES.CORRIGIR_VALOR,
      STAGES.CORRIGIR_UF,
      STAGES.CORRIGIR_SEL,
      STAGES.INICIO_RETORNO,
      STAGES.NOVO_CASO_CONFIRMA,
      STAGES.REVALIDA_NOME,
      STAGES.REVALIDA_CIDADE
    ]

    if (estadosBloqueioSaudacao.includes(u.stage)) {
      logDebug("[BLOQUEIO OI] usuário em fluxo ativo:", u.stage)
      iniciarTimer(from)
      return reapresentarPerguntaAtual(u)
    }

    if ([STAGES.RETOMADA_AUTOMATICA, STAGES.RETOMADA_MENU, STAGES.RESUMO_ATENDIMENTO, STAGES.RESUMO_RETOMADA].includes(u.stage)) {
      iniciarTimer(from)
      if (u.lastPerguntaPayload) return u.lastPerguntaPayload
      const flowRetomada = flowMap[u.stage]
      if (flowRetomada) return flowRetomada(u, ctx)
    }

    if (u.stage && ![STAGES.INICIO, STAGES.CLIENTE].includes(u.stage) && u.lastPerguntaPayload) {
      iniciarTimer(from)
      return u.lastPerguntaPayload
    }
  }

  // -- Detecção global de encerramento por texto livre ----------------------
  // Funciona em qualquer stage, exceto campos de texto livre e clientes já cadastrados.
  // Clientes cadastrados (numeroCaso) têm tratamento próprio dentro do stage "cliente".
  if (text && !ehAudio && !ehDoc && !u.numeroCaso && !stageAceitaTextoLivre(u.stage)) {
    const lowerEnc = text.toLowerCase()
    const reEncerrar = /^(encerr|tchau|obrigad|valeu|flw|vlw|ate\s*(logo|mais|breve)|por\s*hoje|finaliz|nao\s*(quero|preciso)|pode\s*fechar|encerra\b)/
    if (reEncerrar.test(lowerEnc)) {
      return encerrarComCaptura(from, u)
    }
  }
  // -------------------------------------------------------------------------

  if (!devePriorizarHandlerRetomadaMenu && (u.aguardandoRetomada || !podeRetomar(from) || usuarioRespondendoAgora)) {
    const msg = textoRetomada

    if (buttonId === "terceiro_cancelar_menu" || text === "terceiro_cancelar_menu") {
      u.aguardandoRetomada = false
      u.aguardandoResposta = false
      const menuAnterior = await cancelarNovoCasoClienteEVoltarMenu(from, u, "cancelado_pelo_menu")
      if (menuAnterior) return menuAnterior
      // Cenário B: novo cliente sem caso anterior — encerra limpo
      limparTimer(u)
      if (!u.leadIncompletoCapturado) {
        await capturarLeadIncompleto(from, u).catch(e => logErro("hubspot", "cancelar_terceiro_novo_retomada: " + e.message))
      }
      limparDadosCasoAtual(u, { marcarFluxoEncerrado: true })
      await enviarAudioModoVoz(from, u, "Tudo bem. Cancelei o atendimento. Quando quiser começar de novo, é só me chamar.", "cancelar terceiro novo retomada")
      return {
        texto: `✅ *Atendimento cancelado.*\n\nQuando quiser começar um novo atendimento, é só me chamar aqui. 😊`,
        opcoes: null
      }
    }

    if ((buttonId === "recomecar" || msg.includes("recome")) && u._casoAnteriorCliente && !u.numeroCaso) {
      u.aguardandoRetomada = false
      u.aguardandoResposta = false
      iniciarTimer(from)
      return {
        texto: `🔄 *Recomeçar abertura de caso*\n\nVocê está abrindo um atendimento para outra pessoa.\n\nDeseja continuar de onde parou ou cancelar e voltar ao seu menu?`,
        opcoes: [
        { id: "cont_retomar", title: "▶️ Continuar" },
        { id: "terceiro_cancelar_menu", title: "🏠 Meu menu" },
        { id: "m_encerrar", title: "👋 Encerrar" }
        ]
      }
    }

    if (buttonId === "recomecar" || msg.includes("recome")) {
      u.aguardandoRetomada = false
      u.aguardandoResposta = false
      if (podeMostrarMenuCliente(u)) {
        return responderComTimer(from, await menuClienteComAudio(from, u))
      }
      // recomeçar faz revalidação progressiva dos dados preservados
      if (!u.atendente) u.atendente = sortearAtendente()
      u._revalidandoCampos = true
      setStage(u, STAGES.AUDIO_AGUARDANDO)
      iniciarTimer(from)
      const primeiroNomeRec = primeiroNomeCliente(u) || ""
      const saudacaoRec = primeiroNomeRec ? `, ${primeiroNomeRec}` : ""
      const modoDefinido = u.modoTexto !== undefined && u.modoTexto !== null
      const textoRec = `Tudo bem${saudacaoRec}. Vamos recomeçar com calma. Pode me contar sua situação novamente${u.modoTexto === false ? " por áudio ou texto" : u.modoTexto === true ? " por texto" : " por áudio ou texto"}. Estou aqui para ajudar você.`
      if (!u.modoTexto) {
        // Modo voz (false) ou ainda não definido (null/undefined): enviar áudio
        try {
          const ogg = await gerarAudioAtendente(u.atendente, textoRec)
          await enviarAudio(from, urlAudioAtendente(ogg))
          await new Promise(r => setTimeout(r, 3000))
        } catch (e) { logErro("tts", "Falha audio recomeçar pausa", e) }
      }
      return {
        texto: `🔄 Tudo bem${saudacaoRec} 😊\n\nVamos *recomeçar* com calma.\n\nPode me contar sua situação novamente${u.modoTexto === true ? " por texto" : " por áudio ou texto"}. Estou aqui para ajudar você.`,
        opcoes: null
      }
    }

    if (buttonId === "m_encerrar" || msg.includes("encerrar")) {
      u.aguardandoRetomada = false
      u.aguardandoResposta = false
      return encerrarAtendimento(from, u)
    }
  }
  if (usuarioRespondendoAgora) u.aguardandoResposta = false

  // Só executa processarRetomadaOuReinicio quando o stage atual é de retomada/resumo,
  // ou quando os botões/contexto são explicitamente de retomada ou descrição.
  // Sem essa guarda, a função intercepta mensagens destinadas a handlers de stage
  // ativos (ACOLHIMENTO_NOME, ACOLHIMENTO_CIDADE, etc.) e os impede de executar.
  const stageAtualNorm = normalizarStageKey(u.stage)
  const ehStageRetomada = [
    STAGES.RETOMADA_AUTOMATICA, STAGES.RETOMADA_MENU,
    STAGES.RESUMO_RETOMADA, STAGES.RESUMO_ATENDIMENTO
  ].includes(stageAtualNorm)
  const ehBotaoRetomada = [
    "rm_continuar", "rm_recomecar", "rr_continuar", "rr_corrigir",
    "rr_recomecar", "rr_encerrar", "ra_continuar", "ra_corrigir",
    "ra_recomecar", "ra_encerrar", "ret_auto_continuar", "ret_auto_menu",
    "cont_retomar", "recomecar", "desc_incentivo_continuar",
    "desc_incentivo_depois", "desc_incentivo_menu", "desc_incentivo_encerrar",
    "audio_fluxo_encerrar"
  ].includes(buttonId)
  const opcoesLastPergunta = new Set((u.lastPerguntaPayload?.opcoes || []).map(o => o.id))
  const ehContextoRetomadaOuDesc =
    opcoesLastPergunta.has("rm_continuar") || opcoesLastPergunta.has("rr_continuar") ||
    opcoesLastPergunta.has("ra_continuar") || opcoesLastPergunta.has("ret_auto_continuar") ||
    opcoesLastPergunta.has("desc_incentivo_continuar") || opcoesLastPergunta.has("cont_retomar")

  if (ehStageRetomada || ehBotaoRetomada || ehContextoRetomadaOuDesc) {
    const respostaRetomada = await processarRetomadaOuReinicio(from, u, text, buttonId, ctx)
    if (respostaRetomada) return respostaRetomada
  }

  if (u.aguardandoRetomada) {
    logDebug("? Ignorando verificação automática de retomada")
  } else if (u.stage === STAGES.INICIO) {
    const respostaRetomadaAutomatica = await verificarRetomadaAutomatica(from, u)
    if (respostaRetomadaAutomatica) return respostaRetomadaAutomatica
  }

  // Cliente já cadastrado retornando — vai direto para menu cliente
  if (u.numeroCaso && podeMostrarMenuCliente(u) &&
      [STAGES.INICIO, STAGES.CLIENTE].includes(u.stage) &&
      !ehAudio &&
      !ehDoc &&
      !text.startsWith("m_caso_") &&
      !["dir_agendar", "adv_ag", "adv_urg", "adv_agendar_ligacao", "cliente_cancelar_consulta", "cliente_cancelar_consulta_sim", "m_adv", "m_status", "m_docs", "docs_pedido_admin", "docs_intro_ok", "doc_cpf_skip", "docs_reenviar", "docs_maisFotos", "docs_proxdoc", "docs_pular_doc", "docs_depois", "docs_rg_verso_junto", "docs_rg_sem_verso", "docs_enviar_faltantes", "docs_ver_status", "doc_cliente_anexar", "doc_cliente_tipo_pessoal", "doc_cliente_tipo_prova", "doc_cliente_tipo_outro", "docs_confirmar_envio_extra", "m_novocaso", "novo_caso_confirmar", "m_encerrar", "m_inicio"].includes(text)) {
    setStage(u, STAGES.CLIENTE)
    iniciarTimer(from)
    return await menuClienteComAudio(from, u)
  }



  if (u._novoCasoParaTerceiro && !u.numeroCaso && ehDoc) {
    iniciarTimer(from)
    await enviarAudioModoVoz(
      from,
      u,
      "Recebi seu arquivo, mas primeiro preciso concluir o cadastro da pessoa atendida. Depois os documentos poderão ser enviados pelo WhatsApp dela.",
      "documento durante caso terceiro"
    )
    const _labelCancelarDoc = u._casoAnteriorCliente ? "🏠 Meu menu" : "↩️ Cancelar atendimento"
    return {
      texto: `📎 *Arquivo recebido, mas ainda não vou anexar.*\n\nPrimeiro preciso concluir o cadastro da pessoa atendida.\n\nDepois que o caso for aberto, os documentos poderão ser enviados pelo WhatsApp dela.`,
      opcoes: [
        { id: "cont_retomar", title: "▶️ Continuar" },
      { id: "terceiro_cancelar_menu", title: _labelCancelarDoc }
      ]
    }
  }

  const respostaMidia = await processarMidia(from, nomeWA, u, msgObj, tipo, ehAudio, ehDoc)
  if (respostaMidia) return respostaMidia

  // Imagem ou documento enviado enquanto o bot ainda aguarda o relato:
  // não trava nem some — orienta gentilmente a enviar o relato primeiro.
  if (ehDoc && u.stage === STAGES.AUDIO_AGUARDANDO) {
    iniciarTimer(from)
    return await responderTelaComAudio(
      from,
      u,
      {
        texto: `📎 Recebi seu arquivo! Mas por enquanto ainda não tenho onde guardá-lo — o caso ainda não foi aberto.\n\nMe conta primeiro o que está acontecendo (pode falar em áudio 🎙️ ou digitar 💬). Depois do cadastro você poderá enviar documentos normalmente. 😊`,
        opcoes: null
      },
      "Recebi seu arquivo. Mas o caso ainda não foi aberto, então ainda não tenho onde guardá-lo. Me conta primeiro o que está acontecendo, por áudio ou digitando. Depois do cadastro você poderá enviar documentos normalmente.",
      "doc antes do relato"
    )
  }

  const respostaAudioCanal = await processarAudioCanalAtendimento(from, nomeWA, u, msgObj, tipo, ehAudio, ehDoc)
  if (respostaAudioCanal) return respostaAudioCanal

  // handlers de revalidação progressiva
  if (u.stage === STAGES.REVALIDA_NOME) {
    if (text === "revalida_nome_ok") {
      if (!Array.isArray(u._revalidaConfirmados)) u._revalidaConfirmados = []
      u._revalidaConfirmados.push("nome")
      return await proximaConfirmacaoProgressiva(from, u)
    }
    // Texto livre = cliente digitou ou falou o nome correto diretamente
    if (text && text !== "revalida_nome_ok") {
      // Verifica intenção de correção explícita antes de extrair nome puro
      const nomeCorrecaoRevalida = extrairNomeDaCorrecaoExplicita(text)
      const nomeLimpo = nomeCorrecaoRevalida || formatarNome(limparTextoSomenteLetras(text))
      if (ehNomeAparente(nomeLimpo, nomeCorrecaoRevalida ? nomeLimpo : text) === true) {
        u.nome = nomeLimpo
        u.nomeConfirmado = true
        await sincronizarContatoNegocioHubSpot(u)
        if (!u.modoTexto) {
          try {
            const ogg = await gerarAudioAtendente(u.atendente, `Entendi! Nome atualizado para ${nomeLimpo}.`)
            await enviarAudio(from, urlAudioAtendente(ogg))
            await new Promise(r => setTimeout(r, 2000))
          } catch (e) { logErro("tts", "Falha áudio atualizar nome revalida", e) }
        }
        if (!Array.isArray(u._revalidaConfirmados)) u._revalidaConfirmados = []
        u._revalidaConfirmados.push("nome")
        return await proximaConfirmacaoProgressiva(from, u)
      }
      // Negação pura sem nome → deixa cair no imprevisto abaixo
      if (!parecePuraNegacaoSemNome(text)) {
        iniciarTimer(from)
        return responderComTimer(from, {
          texto: `●●○○○○ 👤 Etapa 2 de 6 · *Nome*\n\nNão consegui identificar o nome. Por favor, informe apenas o nome completo. Pode falar ou digitar. 🎙️`,
          opcoes: [{ id: "revalida_nome_ok", title: "✅ Confirmar atual" }]
        })
      }
    }
    // Mensagem que não é o nome — verificar se é intenção de corrigir outro campo
    const imprevistoRevalidaNome = await tratarImprevistoPreAtendimento(from, u, u.stage, text)
    if (imprevistoRevalidaNome) return imprevistoRevalidaNome
  }

  if (u.stage === STAGES.REVALIDA_CIDADE) {
    if (text === "revalida_cidade_ok") {
      if (!Array.isArray(u._revalidaConfirmados)) u._revalidaConfirmados = []
      u._revalidaConfirmados.push("cidade")
      return await proximaConfirmacaoProgressiva(from, u)
    }
    // Seleção de cidade homônima
    if (text?.startsWith("revalida_cidade_multipla_") && Array.isArray(u._cidadesMultiplas)) {
      const idx = parseInt(text.replace("revalida_cidade_multipla_", ""), 10)
      const escolhida = u._cidadesMultiplas[idx]
      if (escolhida) {
        u.cidade = escolhida.cidade
        u.uf = escolhida.uf
        u.regiao = escolhida.regiao || mapearRegiaoPorUF(escolhida.uf)
        delete u._cidadesMultiplas
        if (!u.modoTexto) {
          try {
            const estadoFull = estadoPorExtenso(escolhida.uf) || escolhida.uf || ""
            const ogg = await gerarAudioAtendente(u.atendente, `Entendi! Cidade atualizada para ${escolhida.cidade}${estadoFull ? ", " + estadoFull : ""}.`)
            await enviarAudio(from, urlAudioAtendente(ogg))
            await new Promise(r => setTimeout(r, 2000))
          } catch (e) { logErro("tts", "Falha áudio cidade multipla revalida", e) }
        }
        if (!Array.isArray(u._revalidaConfirmados)) u._revalidaConfirmados = []
        u._revalidaConfirmados.push("cidade")
        return await proximaConfirmacaoProgressiva(from, u)
      }
    }
    // Texto livre = cliente digitou ou falou a cidade correta diretamente
    if (text && text !== "revalida_cidade_ok" && !text.startsWith("revalida_cidade_multipla_")) {
      const cidadeLimpa = normalizarNomeCidadeBusca(text)
      const loc = await buscarCidadePorNome(cidadeLimpa || text)
      if (loc && !loc.multiplos) {
        u.cidade = loc.cidade
        u.uf = loc.uf
        u.regiao = loc.regiao || mapearRegiaoPorUF(loc.uf)
        if (!u.modoTexto) {
          try {
            const estadoFull = estadoPorExtenso(loc.uf) || loc.uf || ""
            const ogg = await gerarAudioAtendente(u.atendente, `Entendi! Cidade atualizada para ${loc.cidade}${estadoFull ? ", " + estadoFull : ""}.`)
            await enviarAudio(from, urlAudioAtendente(ogg))
            await new Promise(r => setTimeout(r, 2000))
          } catch (e) { logErro("tts", "Falha áudio atualizar cidade revalida", e) }
        }
        if (!Array.isArray(u._revalidaConfirmados)) u._revalidaConfirmados = []
        u._revalidaConfirmados.push("cidade")
        return await proximaConfirmacaoProgressiva(from, u)
      }
      if (loc?.multiplos && loc.opcoes?.length > 1) {
        u._cidadesMultiplas = loc.opcoes
        const opcoesLista = loc.opcoes.slice(0, 4).map((op, i) => ({
          id: `revalida_cidade_multipla_${i}`,
          title: abreviarCidadeBotao(op.cidade, op.uf)
        }))
        if (!u.modoTexto) {
          try {
            const nomesAudio = loc.opcoes.slice(0, 4).map(op => `${op.cidade}, ${estadoPorExtenso(op.uf) || op.uf}`).join("; ")
            const ogg = await gerarAudioAtendente(u.atendente, `Encontrei ${numeroPorExtenso(loc.opcoes.length, "feminino")} cidades com esse nome: ${nomesAudio}. Selecione a opção correspondente.`)
            await enviarAudio(from, urlAudioAtendente(ogg))
            await new Promise(r => setTimeout(r, 4000))
          } catch (e) { logErro("tts", "Falha áudio cidades múltiplas revalida", e) }
        }
        iniciarTimer(from)
        return responderComTimer(from, {
          texto: `●●●●●○ 📍 Etapa 5 de 6 · *Cidade*\n\n🔍 Encontrei *${loc.opcoes.length} cidades* com esse nome. Qual é a correta?\n\n_Se não aparecer, diga ou digite o nome com o estado._`,
          opcoes: opcoesLista
        })
      }
      iniciarTimer(from)
      return responderComTimer(from, {
        texto: `●●●●●○ 📍 Etapa 5 de 6 · *Cidade*\n\nNão consegui identificar essa cidade. Informe cidade e estado (ex: *Recife, PE*) ou o CEP. Pode falar ou digitar. 🎙️`,
        opcoes: [{ id: "revalida_cidade_ok", title: "✅ Confirmar atual" }]
      })
    }
    // Mensagem que não é cidade — verificar se é intenção de corrigir outro campo
    const imprevistoRevalidaCidade = await tratarImprevistoPreAtendimento(from, u, u.stage, text)
    if (imprevistoRevalidaCidade) return imprevistoRevalidaCidade
  }

  if (u.stage === STAGES.REVALIDA_WHATSAPP) {
    if (text === "revalida_whatsapp_ok") {
      if (u._corrigindoWhatsappConfirmacao) {
        u.whatsappVerificado = true
        if (!u.whatsappContato) u.whatsappContato = from
        delete u._corrigindoWhatsappConfirmacao
        return responderComTimer(from, await voltarParaConfirmacao(from, u))
      }
      if (u._revalidandoCampos) {
        if (!Array.isArray(u._revalidaConfirmados)) u._revalidaConfirmados = []
        u._revalidaConfirmados.push("whatsapp")
        return await proximaConfirmacaoProgressiva(from, u)
      }
      // Usuário novo corrigindo WhatsApp antes de ter cidade — retoma coleta de cidade
      u.whatsappVerificado = true
      if (!u.whatsappContato) u.whatsappContato = from
      return await flowAcolhimentoCidade(u, { from, suprimirAudio: true })
    }
    // Texto livre = cliente digitou outro número diretamente
    if (text && text !== "revalida_whatsapp_ok") {
      const telNorm = normalizarTelefone(text)
      if (telNorm && telNorm.replace(/\D/g, "").length >= 12) {
        u.whatsappContato = telNorm
        u.whatsappVerificado = true
        u.telefoneEhDoCliente = !u.atendimentoParaTerceiro
        if (!u.modoTexto) {
          try {
            const label = formatarTelefoneExibicao(telNorm)
            const ogg = await gerarAudioAtendente(u.atendente, `Entendi! Vou usar o número ${label}.`)
            await enviarAudio(from, urlAudioAtendente(ogg))
            await new Promise(r => setTimeout(r, 2000))
          } catch (e) { logErro("tts", "Falha áudio novo número revalida", e) }
        }
        if (u._corrigindoWhatsappConfirmacao) {
          delete u._corrigindoWhatsappConfirmacao
          return responderComTimer(from, await voltarParaConfirmacao(from, u))
        }
        if (u._revalidandoCampos) {
          if (!Array.isArray(u._revalidaConfirmados)) u._revalidaConfirmados = []
          u._revalidaConfirmados.push("whatsapp")
          return await proximaConfirmacaoProgressiva(from, u)
        }
        // Usuário novo corrigindo WhatsApp antes de ter cidade — retoma coleta de cidade
        return await flowAcolhimentoCidade(u, { from, suprimirAudio: true })
      }
      iniciarTimer(from)
      return responderComTimer(from, {
        texto: `●●●●○○ 📱 Etapa 4 de 6 · *WhatsApp*\n\nNão consegui identificar o número. Informe com DDD. Pode falar ou digitar. 🎙️`,
        opcoes: [{ id: "revalida_whatsapp_ok", title: "✅ Confirmar atual" }]
      })
    }
    // Mensagem que não é número — verificar se é intenção de corrigir outro campo
    const imprevistoRevalidaWhatsapp = await tratarImprevistoPreAtendimento(from, u, u.stage, text)
    if (imprevistoRevalidaWhatsapp) return imprevistoRevalidaWhatsapp
  }

  // Após corrigir nome no fluxo de revalidação → continuar progressão
  if (u.stage === STAGES.ACOLHIMENTO_NOME && u._revalidandoCampos && text) {
    const nomeRevalida = extrairNomeDaCorrecaoExplicita(text) || formatarNome(limparTextoSomenteLetras(text))
    if (ehNomeAparente(nomeRevalida, text) !== true) {
      iniciarTimer(from)
      return responderComTimer(from, {
        texto: `●●○○○○ 👤 Etapa 2 de 6 · *Nome*\n\nNão consegui identificar o nome. Por favor, informe apenas o nome completo. Pode falar ou digitar. 🎙️`,
        opcoes: [{ id: "revalida_nome_ok", title: "✅ Confirmar atual" }]
      })
    }
    u.nome = nomeRevalida
    u.nomeConfirmado = true
    if (!Array.isArray(u._revalidaConfirmados)) u._revalidaConfirmados = []
    u._revalidaConfirmados.push("nome")
    return await proximaConfirmacaoProgressiva(from, u)
  }

  // Intercepta áudio no stage de coleta do nome do contato (quem está no WhatsApp, caso para terceiro)
  if (u.stage === STAGES.ACOLHIMENTO_NOME_CONTATO && ehAudio) {
    try {
      const mediaId = msgObj?.[tipo]?.id
      if (!mediaId) {
        return { texto: `Não consegui processar seu áudio. Por favor, *digite seu nome*.`, opcoes: null }
      }
      await enviar(from, "👂 Estou ouvindo seu áudio...", null, false)
      const midia = await baixarMidia(mediaId)
      if (!midia) {
        return { texto: `Não consegui processar seu áudio. Por favor, *digite seu nome*.`, opcoes: null }
      }
      const transcricao = await transcrever(midia.buffer, midia.mimeType, {
        origem: "nome",
        prompt: "Transcreva em português brasileiro com foco em identificar apenas o nome completo informado pelo cliente."
      })
      const nomeLimpo = await extrairNomeAudio(transcricao)
      const validacaoNomeContato = nomeLimpo ? ehNomeAparente(nomeLimpo, transcricao || "") : false
      if (!nomeLimpo || validacaoNomeContato === false) {
        try {
          const ogg = await gerarAudioAtendente(u.atendente,
            `Não consegui entender seu nome. Por favor, fale seu nome completo devagar, ou digite.`)
          await enviarAudio(from, urlAudioAtendente(ogg))
          await new Promise(r => setTimeout(r, 3000))
        } catch (e) { logErro("tts", "Falha áudio nome contato inválido", e) }
        return { texto: `●●○○○○ 👤 Etapa 2 de 6 · *Nome*

Não consegui entender seu nome. Por favor, tente novamente ou *digite seu nome completo*.`, opcoes: null }
      }
      if (validacaoNomeContato === "incompleto") {
        try {
          const ogg = await gerarAudioAtendente(u.atendente,
            `Preciso do nome completo. Por favor, informe também o sobrenome.`)
          await enviarAudio(from, urlAudioAtendente(ogg))
          await new Promise(r => setTimeout(r, 3000))
        } catch (e) { logErro("tts", "Falha áudio nome contato incompleto", e) }
        return { texto: `●●○○○○ 👤 Etapa 2 de 6 · *Nome*

Preciso do nome completo. Por favor, informe também o *sobrenome*.`, opcoes: null }
      }
      u._nomeContatoTemp = nomeLimpo
      const primeiroNomeContato = nomeLimpo.split(" ")[0] || nomeLimpo
      setStage(u, STAGES.ACOLHIMENTO_CONFIRMA_NOME_CONTATO)
      iniciarTimer(from)
      try {
        const ogg = await gerarAudioAtendente(u.atendente,
          `${nomeLimpo}. Está correto?`)
        await enviarAudio(from, urlAudioAtendente(ogg))
        await new Promise(r => setTimeout(r, 4000))
      } catch (e) { logErro("tts", "Falha áudio confirmar nome contato (áudio)", e) }
      return {
        texto: `●●○○○○ 👤 Etapa 2 de 6 · *Nome*\n\n👥 *Atendimento para outra pessoa*\n\n✅ Entendi! Seu nome é *${nomeLimpo}*.\n\nEstá correto? Se não estiver, é só me dizer agora. Pode falar ou digitar. 🎙️`,
        opcoes: [
          { id: "confirma_nome_contato_sim", title: "✅ Sim, está certo" }
        ]
      }
    } catch (e) {
      logErro("tts", "Falha transcrição nome contato por áudio", e)
      return { texto: `Não consegui processar seu áudio. Por favor, *digite seu nome*.`, opcoes: null }
    }
  }

  // Intercepta áudio no stage de coleta de nome
  if (u.stage === STAGES.ACOLHIMENTO_NOME && ehAudio) {
    try {
      const mediaId = msgObj?.[tipo]?.id
      if (!mediaId) {
        return { texto: `Não consegui processar seu áudio. Por favor, *digite seu nome*.`, opcoes: null }
      }

  await enviar(from, "👂 Estou ouvindo seu áudio...", null, false)
      const midia = await baixarMidia(mediaId)
      if (!midia) {
        return { texto: `Não consegui processar seu áudio. Por favor, *digite seu nome*.`, opcoes: null }
      }

      const transcricao = await transcrever(midia.buffer, midia.mimeType, {
        origem: "nome",
        prompt: "Transcreva em português brasileiro com foco em identificar apenas o nome completo informado pelo cliente."
      })
      const nomeLimpo = await extrairNomeAudio(transcricao)

      const validacaoNomeAcol = nomeLimpo ? ehNomeAparente(nomeLimpo, transcricao || "") : false

      const ambiguidade = detectarAmbiguidadeTitularNome(u, transcricao)
      if (ambiguidade && validacaoNomeAcol !== false) {
        return await perguntarTitularNomePreCadastro(from, u, nomeLimpo, ambiguidade)
      }

      if (!nomeLimpo || validacaoNomeAcol === false) {
        // Antes de desistir, verificar se o áudio era uma correção de outro campo
        if (transcricao && transcricao.length >= 4) {
          const imprevistoNomeAudio = await tratarImprevistoPreAtendimento(from, u, u.stage, transcricao)
          if (imprevistoNomeAudio) return imprevistoNomeAudio
        }
        try {
          const ogg = await gerarAudioAtendente(u.atendente,
            `Não consegui entender seu nome. Por favor, fale seu nome completo devagar, ou digite seu nome.`)
          await enviarAudio(from, urlAudioAtendente(ogg))
          await new Promise(r => setTimeout(r, 3000))
        } catch (e) { logErro("tts", "Falha áudio nome inválido", e) }
        return { texto: `●●○○○○ 👤 Etapa 2 de 6 · *Nome*

Não consegui entender seu nome. Por favor, tente novamente ou *digite seu nome completo*.`, opcoes: null }
      }

      if (validacaoNomeAcol === "incompleto") {
        try {
          const ogg = await gerarAudioAtendente(u.atendente,
            `Preciso do nome completo. Por favor, informe também o sobrenome.`)
          await enviarAudio(from, urlAudioAtendente(ogg))
          await new Promise(r => setTimeout(r, 3000))
        } catch (e) { logErro("tts", "Falha áudio nome incompleto acolhimento", e) }
        return { texto: `●●○○○○ 👤 Etapa 2 de 6 · *Nome*

Preciso do nome completo. Por favor, informe também o *sobrenome*.`, opcoes: null }
      }

      u._nomeTemp = nomeLimpo
      setStage(u, STAGES.ACOLHIMENTO_CONFIRMA_NOME)
      iniciarTimer(from)

      try {
        const ogg = await gerarAudioAtendente(u.atendente,
          `${nomeLimpo}. Está correto?`)
        await enviarAudio(from, urlAudioAtendente(ogg))
        await new Promise(r => setTimeout(r, 4000))
      } catch (e) { logErro("tts", "Falha áudio confirmar nome", e) }

      return {
      texto: `●●○○○○ 👤 Etapa 2 de 6 · *Nome*\n\n✅ Seu nome é *${nomeLimpo}*.\n\nEstá correto? Se não estiver, é só me dizer agora. Pode falar ou digitar. 🎙️`,
        opcoes: [
          { id: "nome_confirmar", title: "✅ Sim, está certo" }
        ]
      }
    } catch (e) {
      logErro("tts", "Falha transcrição nome por áudio", e)
      return { texto: `Não consegui processar seu áudio. Por favor, *digite seu nome*.`, opcoes: null }
    }
  }

  if (u.stage === STAGES.ACOLHIMENTO_CIDADE && ehAudio) {
    try {
      const mediaId = msgObj?.[tipo]?.id
      if (!mediaId) return { texto: `Não consegui processar seu áudio. Por favor, digite sua cidade ou CEP.`, opcoes: null }

  await enviar(from, "👂 Estou ouvindo seu áudio...", null, false)
      const midia = await baixarMidia(mediaId)
      if (!midia) return { texto: `Não consegui processar seu áudio. Por favor, digite sua cidade ou CEP.`, opcoes: null }

      const transcricao = await transcrever(midia.buffer, midia.mimeType, {
        origem: "cidade",
        prompt: "Transcreva em português brasileiro com foco em identificar apenas a cidade onde o cliente mora."
      })
      logDebug(`[CIDADE_AUDIO] Transcrição bruta: "${transcricao}"`)
      if (!transcricao) {
        try {
          const ogg = await gerarAudioAtendente(u.atendente,
            `Não consegui ouvir seu áudio com clareza. Pode tentar novamente, falar mais devagar, ou digitar o nome da sua cidade?`)
          await enviarAudio(from, urlAudioAtendente(ogg))
          await new Promise(r => setTimeout(r, 3500))
        } catch (e) { logErro("tts", "Falha áudio transcrição cidade null", e) }
        iniciarTimer(from)
        return { texto: `●●●●●○ 📍 Etapa 5 de 6 · *Cidade*\n\n🎙️ Não consegui ouvir seu áudio. Tente novamente ou *digite o nome da cidade ou CEP*. `, opcoes: null }
      }
      const cidadeLimpa = await extrairCidadeAudio(transcricao)
      logDebug(`[CIDADE_AUDIO] Após extrairCidadeAudio: "${cidadeLimpa}"`)
      const digitosCidade = cidadeLimpa.replace(/\D/g, "")
      let localizacao = null
      let cidadeIdentificada = null

      if (/^\d{8}$/.test(digitosCidade)) {
        const infoCEP = await buscarPorCEP(digitosCidade)
        cidadeIdentificada = infoCEP.cidade
        localizacao = {
          cidade: infoCEP.cidade,
          uf: infoCEP.uf,
          estado: infoCEP.uf,
          regiao: infoCEP.regiao
        }
      } else {
        // Tentar nome completo primeiro — evita fragmentar "Presidente Kennedy" em palavras
        localizacao = await buscarCidadePorNome(cidadeLimpa)

        // Só tentar por palavras individuais se o nome completo não retornou nada
        if (!localizacao) {
          const palavras = cidadeLimpa
    .replace(/[•·]/g, " ")
            .split(/\s+/)
            .filter(p => p.length > 2)

          for (const palavra of palavras) {
            localizacao = await buscarCidadePorNome(palavra)
            if (localizacao && !localizacao.multiplos) break
          }
        }

        // Só atribuir cidade se for resultado único — multiplos não têm .cidade
        cidadeIdentificada = localizacao?.multiplos ? null : localizacao?.cidade
        logDebug(`[CIDADE_AUDIO] localizacao.multiplos: ${localizacao?.multiplos}`)
        logDebug(`[CIDADE_AUDIO] cidadeIdentificada: "${cidadeIdentificada}"`)

        // tratar cidades homônimas (multiplos) no modo voice
        // Leitura correta: "Cidade, Estado por extenso" — nunca "Cidade - UF" com hífen
        if (localizacao?.multiplos && localizacao.opcoes?.length > 1) {
          const opcoesLista = localizacao.opcoes.slice(0, 4).map((op, i) => ({
            id: `cidade_multipla_${i}`,
            // título curto para caber no botão do WhatsApp
            title: abreviarCidadeBotao(op.cidade, op.uf)
          }))
          u._cidadesMultiplas = localizacao.opcoes
          if (!u.modoTexto) {
            try {
              // áudio usa nome completo do estado, não sigla
              const nomesAudio = localizacao.opcoes.slice(0, 4)
                .map(op => `${op.cidade}, ${estadoPorExtenso(op.uf) || op.uf}`).join("; ")
              const ogg = await gerarAudioAtendente(u.atendente,
                `Encontrei ${numeroPorExtenso(localizacao.opcoes.length, "feminino")} cidades com esse nome: ${nomesAudio}. Selecione a opção correspondente. Se a sua cidade não aparecer, diga o nome com o estado agora.`)
              await enviarAudio(from, urlAudioAtendente(ogg))
              await new Promise(r => setTimeout(r, 4000))
            } catch (e) { logErro("tts", "Falha áudio cidades múltiplas", e) }
          }
          iniciarTimer(from)
          return responderComTimer(from, {
          texto: `●●●●●○ 📍 Etapa 5 de 6 · *Cidade*\n\n🔍 Encontrei *${localizacao.opcoes.length} cidades* com esse nome. Qual é a sua?\n\n_Se a sua cidade não aparecer, diga ou digite o nome com o estado._`,
            opcoes: opcoesLista
          })
        }
      }

      if (!cidadeIdentificada || cidadeIdentificada.length < 2) {
        // Antes de desistir, verificar se o áudio era uma correção de outro campo
        if (transcricao && transcricao.length >= 4) {
          const imprevistoCidadeAudio = await tratarImprevistoPreAtendimento(from, u, u.stage, transcricao)
          if (imprevistoCidadeAudio) return imprevistoCidadeAudio
        }
        try {
          const ogg = await gerarAudioAtendente(u.atendente,
            `Não consegui identificar sua cidade. Você pode digitar o nome da cidade, informar o CEP com oito dígitos, ou enviar um novo áudio falando o nome da cidade devagar.`)
          await enviarAudio(from, urlAudioAtendente(ogg))
          await new Promise(r => setTimeout(r, 4000))
        } catch (e) { logErro("tts", "Falha áudio erro cidade", e) }
        return { texto: `●●●●●○ 📍 Etapa 5 de 6 · *Cidade*\n\n🎙️ Não consegui entender sua cidade. Digite o nome, informe o CEP ou envie outro áudio.`, opcoes: null }
      }

      u.cidade = cidadeIdentificada
      u.uf = localizacao.uf
      u.regiao = localizacao.regiao
      u._cidadeAudioTemp = cidadeIdentificada
      u._ufAudioTemp = u.uf
      u._regiaoAudioTemp = u.regiao
      await sincronizarContatoNegocioHubSpot(u)
      await enviarAudioConfirmacaoLocalizacao(from, u.atendente, cidadeIdentificada, u.uf || "UF não identificada", u.regiao || "não identificada", "cidade")
      iniciarTimer(from)
      // formato padrão "Cidade, UF" com vírgula
      return {
        texto: `●●●●●○ 📍 Etapa 5 de 6 · *Cidade*\n\n✅ Localizei: *${cidadeIdentificada}${u.uf ? `, ${u.uf}` : ""}* (${u.regiao || "não identificada"}). Está correto? Se não estiver, é só me dizer a cidade correta agora. Pode falar ou digitar. 🎙️`,
        opcoes: [
          { id: "cidade_confirmar", title: "✅ Confirmar cidade" }
        ]
      }
    } catch (e) {
      logErro("tts", "Falha transcrição cidade por áudio", e)
      return { texto: `Não consegui processar seu áudio. Por favor, digite sua cidade ou CEP.`, opcoes: null }
    }
  }

  if (u.stage === STAGES.REVALIDA_WHATSAPP && ehAudio) {
    try {
      const mediaId = msgObj?.[tipo]?.id
      if (!mediaId) {
        return { texto: `Não consegui processar seu áudio. Por favor, *digite o número com DDD*.`, opcoes: [{ id: "revalida_whatsapp_ok", title: "✅ Confirmar atual" }] }
      }
      await enviar(from, "👂 Estou ouvindo seu áudio...", null, false)
      const midia = await baixarMidia(mediaId)
      if (!midia) {
        return { texto: `Não consegui processar seu áudio. Por favor, *digite o número com DDD*.`, opcoes: [{ id: "revalida_whatsapp_ok", title: "✅ Confirmar atual" }] }
      }
      const transcricao = await transcrever(midia.buffer, midia.mimeType, {
        origem: "revalida_whatsapp",
        prompt: "Transcreva em português brasileiro com foco em identificar apenas o número de telefone ou WhatsApp informado pelo cliente, incluindo o DDD."
      })
      const telNorm = normalizarTelefone(transcricao || "")
      if (!telNorm || telNorm.replace(/\D/g, "").length < 12) {
        try {
          const ogg = await gerarAudioAtendente(u.atendente, `Não consegui identificar o número. Por favor, fale o número com DDD devagar, ou digite.`)
          await enviarAudio(from, urlAudioAtendente(ogg))
          await new Promise(r => setTimeout(r, 3000))
        } catch (e) { logErro("tts", "Falha áudio número inválido revalida whatsapp", e) }
        iniciarTimer(from)
        return responderComTimer(from, {
          texto: `●●●●○○ 📱 Etapa 4 de 6 · *WhatsApp*\n\nNão consegui identificar o número. Por favor, informe com DDD. Pode falar ou digitar. 🎙️`,
          opcoes: [{ id: "revalida_whatsapp_ok", title: "✅ Confirmar atual" }]
        })
      }
      u.whatsappContato = telNorm
      u.whatsappVerificado = true
      u.telefoneEhDoCliente = !u.atendimentoParaTerceiro
      if (!u.modoTexto) {
        try {
          const label = formatarTelefoneExibicao(telNorm)
          const ogg = await gerarAudioAtendente(u.atendente, `Entendi! Vou usar o número ${label}.`)
          await enviarAudio(from, urlAudioAtendente(ogg))
          await new Promise(r => setTimeout(r, 2000))
        } catch (e) { logErro("tts", "Falha áudio novo número revalida whatsapp áudio", e) }
      }
      if (u._corrigindoWhatsappConfirmacao) {
        delete u._corrigindoWhatsappConfirmacao
        return responderComTimer(from, await voltarParaConfirmacao(from, u))
      }
      if (u._revalidandoCampos) {
        if (!Array.isArray(u._revalidaConfirmados)) u._revalidaConfirmados = []
        u._revalidaConfirmados.push("whatsapp")
        return await proximaConfirmacaoProgressiva(from, u)
      }
      // Usuário novo corrigindo WhatsApp antes de ter cidade — retoma coleta de cidade
      return await flowAcolhimentoCidade(u, { from, suprimirAudio: true })
    } catch (e) {
      logErro("tts", "Falha transcrição whatsapp revalida por áudio", e)
      return { texto: `Não consegui processar seu áudio. Por favor, *digite o número com DDD*.`, opcoes: [{ id: "revalida_whatsapp_ok", title: "✅ Confirmar atual" }] }
    }
  }

  if (u.stage === STAGES.REVALIDA_NOME && ehAudio) {
    try {
      const mediaId = msgObj?.[tipo]?.id
      if (!mediaId) {
        return { texto: `Não consegui processar seu áudio. Por favor, *digite seu nome*.`, opcoes: null }
      }
      await enviar(from, "👂 Estou ouvindo seu áudio...", null, false)
      const midia = await baixarMidia(mediaId)
      if (!midia) {
        return { texto: `Não consegui processar seu áudio. Por favor, *digite seu nome*.`, opcoes: null }
      }
      const transcricao = await transcrever(midia.buffer, midia.mimeType, {
        origem: "nome",
        prompt: "Transcreva em português brasileiro com foco em identificar apenas o nome completo informado pelo cliente."
      })
      const nomeLimpo = formatarNome(limparTextoSomenteLetras(await extrairNomeAudio(transcricao) || ""))
      const validacaoNomeRevalida = nomeLimpo ? ehNomeAparente(nomeLimpo, transcricao || "") : false
      if (!nomeLimpo || validacaoNomeRevalida === false) {
        try {
          const ogg = await gerarAudioAtendente(u.atendente, `Não consegui entender seu nome. Por favor, fale seu nome completo devagar, ou digite seu nome.`)
          await enviarAudio(from, urlAudioAtendente(ogg))
          await new Promise(r => setTimeout(r, 3000))
        } catch (e) { logErro("tts", "Falha áudio nome inválido revalida", e) }
        return { texto: `●●○○○○ 👤 Etapa 2 de 6 · *Nome*\n\nNão consegui entender seu nome. Por favor, tente novamente ou *digite seu nome*.`, opcoes: [{ id: "revalida_nome_ok", title: "✅ Confirmar atual" }] }
      }
      if (validacaoNomeRevalida === "incompleto") {
        try {
          const ogg = await gerarAudioAtendente(u.atendente, `Preciso do nome completo. Por favor, informe também o sobrenome.`)
          await enviarAudio(from, urlAudioAtendente(ogg))
          await new Promise(r => setTimeout(r, 3000))
        } catch (e) { logErro("tts", "Falha áudio nome incompleto revalida", e) }
        return { texto: `●●○○○○ 👤 Etapa 2 de 6 · *Nome*\n\nPreciso do nome completo. Por favor, informe também o *sobrenome*.`, opcoes: [{ id: "revalida_nome_ok", title: "✅ Confirmar atual" }] }
      }
      u.nome = nomeLimpo
      u.nomeConfirmado = true
      await sincronizarContatoNegocioHubSpot(u)
      if (!u.modoTexto) {
        try {
          const ogg = await gerarAudioAtendente(u.atendente, `Entendi! Nome atualizado para ${nomeLimpo}.`)
          await enviarAudio(from, urlAudioAtendente(ogg))
          await new Promise(r => setTimeout(r, 2000))
        } catch (e) { logErro("tts", "Falha áudio atualizar nome revalida áudio", e) }
      }
      if (!Array.isArray(u._revalidaConfirmados)) u._revalidaConfirmados = []
      u._revalidaConfirmados.push("nome")
      return await proximaConfirmacaoProgressiva(from, u)
    } catch (e) {
      logErro("tts", "Falha transcrição nome revalida por áudio", e)
      return { texto: `Não consegui processar seu áudio. Por favor, *digite seu nome*.`, opcoes: null }
    }
  }

  if (u.stage === STAGES.REVALIDA_CIDADE && ehAudio) {
    try {
      const mediaId = msgObj?.[tipo]?.id
      if (!mediaId) return { texto: `Não consegui processar seu áudio. Por favor, digite sua cidade ou CEP.`, opcoes: null }
      await enviar(from, "👂 Estou ouvindo seu áudio...", null, false)
      const midia = await baixarMidia(mediaId)
      if (!midia) return { texto: `Não consegui processar seu áudio. Por favor, digite sua cidade ou CEP.`, opcoes: null }
      const transcricao = await transcrever(midia.buffer, midia.mimeType, {
        origem: "cidade",
        prompt: "Transcreva em português brasileiro com foco em identificar apenas a cidade onde o cliente mora."
      })
      if (!transcricao) {
        try {
          const ogg = await gerarAudioAtendente(u.atendente, `Não consegui ouvir seu áudio com clareza. Pode tentar novamente, falar mais devagar, ou digitar o nome da cidade?`)
          await enviarAudio(from, urlAudioAtendente(ogg))
          await new Promise(r => setTimeout(r, 3500))
        } catch (e) { logErro("tts", "Falha áudio transcrição cidade revalida null", e) }
        iniciarTimer(from)
        return { texto: `●●●●●○ 📍 Etapa 5 de 6 · *Cidade*\n\n🎙️ Não consegui ouvir seu áudio. Tente novamente ou *digite o nome da cidade ou CEP*.`, opcoes: null }
      }
      const cidadeLimpa = await extrairCidadeAudio(transcricao)
      const digitosCidade = cidadeLimpa.replace(/\D/g, "")
      let localizacao = null
      let cidadeIdentificada = null
      if (/^\d{8}$/.test(digitosCidade)) {
        const infoCEP = await buscarPorCEP(digitosCidade)
        cidadeIdentificada = infoCEP.cidade
        localizacao = { cidade: infoCEP.cidade, uf: infoCEP.uf, estado: infoCEP.uf, regiao: infoCEP.regiao }
      } else {
        localizacao = await buscarCidadePorNome(cidadeLimpa)
        if (!localizacao) {
          const palavras = cidadeLimpa.replace(/[•·]/g, " ").split(/\s+/).filter(p => p.length > 2)
          for (const palavra of palavras) {
            localizacao = await buscarCidadePorNome(palavra)
            if (localizacao && !localizacao.multiplos) break
          }
        }
        cidadeIdentificada = localizacao?.multiplos ? null : localizacao?.cidade
        if (localizacao?.multiplos && localizacao.opcoes?.length > 1) {
          u._cidadesMultiplas = localizacao.opcoes
          const opcoesLista = localizacao.opcoes.slice(0, 4).map((op, i) => ({
            id: `revalida_cidade_multipla_${i}`,
            title: abreviarCidadeBotao(op.cidade, op.uf)
          }))
          if (!u.modoTexto) {
            try {
              const nomesAudio = localizacao.opcoes.slice(0, 4).map(op => `${op.cidade}, ${estadoPorExtenso(op.uf) || op.uf}`).join("; ")
              const ogg = await gerarAudioAtendente(u.atendente, `Encontrei ${numeroPorExtenso(localizacao.opcoes.length, "feminino")} cidades com esse nome: ${nomesAudio}. Selecione a opção correspondente. Se a sua cidade não aparecer, diga o nome com o estado agora.`)
              await enviarAudio(from, urlAudioAtendente(ogg))
              await new Promise(r => setTimeout(r, 4000))
            } catch (e) { logErro("tts", "Falha áudio cidades múltiplas revalida áudio", e) }
          }
          iniciarTimer(from)
          return responderComTimer(from, {
            texto: `●●●●●○ 📍 Etapa 5 de 6 · *Cidade*\n\n🔍 Encontrei *${localizacao.opcoes.length} cidades* com esse nome. Qual é a correta?\n\n_Se não aparecer, diga ou digite o nome com o estado._`,
            opcoes: opcoesLista
          })
        }
      }
      if (!cidadeIdentificada || cidadeIdentificada.length < 2) {
        try {
          const ogg = await gerarAudioAtendente(u.atendente, `Não consegui identificar sua cidade. Você pode digitar o nome da cidade, informar o CEP com oito dígitos, ou enviar um novo áudio falando o nome da cidade devagar.`)
          await enviarAudio(from, urlAudioAtendente(ogg))
          await new Promise(r => setTimeout(r, 4000))
        } catch (e) { logErro("tts", "Falha áudio erro cidade revalida", e) }
        return { texto: `●●●●●○ 📍 Etapa 5 de 6 · *Cidade*\n\n🎙️ Não consegui entender sua cidade. Digite o nome, informe o CEP ou envie outro áudio.`, opcoes: null }
      }
      u.cidade = cidadeIdentificada
      u.uf = localizacao.uf
      u.regiao = localizacao.regiao || mapearRegiaoPorUF(localizacao.uf)
      await sincronizarContatoNegocioHubSpot(u)
      if (!u.modoTexto) {
        try {
          const estadoFull = estadoPorExtenso(localizacao.uf) || localizacao.uf || ""
          const ogg = await gerarAudioAtendente(u.atendente, `Entendi! Cidade atualizada para ${cidadeIdentificada}${estadoFull ? ", " + estadoFull : ""}.`)
          await enviarAudio(from, urlAudioAtendente(ogg))
          await new Promise(r => setTimeout(r, 2000))
        } catch (e) { logErro("tts", "Falha áudio confirmar cidade revalida áudio", e) }
      }
      if (!Array.isArray(u._revalidaConfirmados)) u._revalidaConfirmados = []
      u._revalidaConfirmados.push("cidade")
      return await proximaConfirmacaoProgressiva(from, u)
    } catch (e) {
      logErro("tts", "Falha transcrição cidade revalida por áudio", e)
      return { texto: `Não consegui processar seu áudio. Por favor, digite sua cidade ou CEP.`, opcoes: null }
    }
  }

  if (u.stage === STAGES.COLETA_TEL_WPP && ehAudio) {
    try {
  await enviar(from, "👂 Estou ouvindo seu áudio...", null, false)
      const mediaId = msgObj.audio?.id || msgObj.voice?.id
      if (!mediaId) {
        return {
          texto: `Não consegui receber o áudio. Por favor, *digite seu número com DDD*.`,
          opcoes: null
        }
      }
      const midia = await baixarMidia(mediaId)
      const transcricao = await transcrever(midia.buffer, midia.mimeType, { origem: "telefone" })

      // Extrai apenas os dígitos da transcrição
      const apenasDigitos = transcricao.replace(/\D/g, "")

      if (apenasDigitos.length < 10) {
        try {
          const ogg = await gerarAudioAtendente(u.atendente,
            `Não consegui identificar o número corretamente.
            Por favor, diga apenas os números.
            Primeiro o DDD com dois dígitos, depois o número completo.`)
          await enviarAudio(from, urlAudioAtendente(ogg))
          await new Promise(r => setTimeout(r, 3000))
        } catch (e) { logErro("tts", "Falha áudio número inválido", e) }
        return {
        texto: `Não consegui identificar o número. Por favor, tente novamente.\n\nExemplo: *DDD 9 0000-0000*`,
          opcoes: null
        }
      }

      // Formata o número para exibição e leitura
      const ddd = apenasDigitos.slice(0, 2)
      const nono = apenasDigitos.slice(2, 3)
      const bloco1 = apenasDigitos.slice(3, 7)
      const bloco2 = apenasDigitos.slice(7, 11)
      const numeroLegivel = `DDD ${ddd.split("").join(" ")} ${nono} ${bloco1.slice(0,2)} ${bloco1.slice(2,4)} ${bloco2.slice(0,2)} ${bloco2.slice(2,4)}`
      const numeroFormatado = `${ddd} ${nono}${bloco1}-${bloco2}`

      u._telefoneTemp = normalizarNumeroWhatsAppEnvio(apenasDigitos)
      setStage(u, STAGES.COLETA_TEL_WPP_CONFIRMA)
      iniciarTimer(from)

      try {
        const ogg = await gerarAudioAtendente(u.atendente,
          `Entendi! O número informado é ${numeroLegivel}.
          Está correto?
          Primeira opção: Sim, está correto.
          Segunda opção: Corrigir número.`)
        await enviarAudio(from, urlAudioAtendente(ogg))
        await new Promise(r => setTimeout(r, 4000))
      } catch (e) { logErro("tts", "Falha áudio confirmar telefone", e) }

      return {
        texto: `●●●●○○ 📱 Etapa 4 de 6 · *WhatsApp*\n\n📋 O número informado é *${numeroFormatado}*.\n\nEstá correto?`,
        opcoes: [
          { id: "tel_confirmar", title: "✅ Sim, está correto" },
          { id: "tel_corrigir", title: "✏️ Corrigir número" }
        ]
      }
    } catch (e) {
      logErro("tts", "Falha transcrição telefone por áudio", e)
      return {
        texto: `Não consegui processar seu áudio. Por favor, *digite seu número com DDD*.`,
        opcoes: null
      }
    }
  }

  if (u.stage === STAGES.COLETA_TEL_WPP_CONFIRMA) {
    if (text === "tel_confirmar") {
      u.whatsappContato = normalizarNumeroWhatsAppEnvio(u._telefoneTemp)
      u.whatsappVerificado = true
      u.telefoneEhDoCliente = true
      delete u._telefoneTemp
      if (u._corrigindoWhatsappConfirmacao) {
        delete u._corrigindoWhatsappConfirmacao
        return responderComTimer(from, await voltarParaConfirmacao(from, u))
      }
      if (u._revalidandoCampos) {
        if (!Array.isArray(u._revalidaConfirmados)) u._revalidaConfirmados = []
        u._revalidaConfirmados.push("whatsapp")
        return await proximaConfirmacaoProgressiva(from, u)
      }
      // suprimirAudio=true: o stage COLETA_TEL_WPP_CONFIRMA já enviou áudio de confirmação
      return await flowAcolhimentoCidade(u, { from, suprimirAudio: true })
    }
    if (text === "tel_corrigir") {
      setStage(u, STAGES.COLETA_TEL_WPP)
      iniciarTimer(from)
      try {
        const ogg = await gerarAudioAtendente(u.atendente,
          `Tudo bem! Por favor, informe seu número novamente.
          Diga apenas os números, começando pelo DDD.
          Por exemplo: oito um, nove, nove quatro seis zero, dois dois dois zero.`)
        await enviarAudio(from, urlAudioAtendente(ogg))
        await new Promise(r => setTimeout(r, 4000))
      } catch (e) { logErro("tts", "Falha áudio corrigir telefone", e) }
      return {
        texto: `Por favor, informe seu número novamente.\n\nExemplo: *DDD 9 0000-0000*`,
        opcoes: null
      }
    }
  }

  if (u.stage === STAGES.COLETA_TEL_OUTRO && ehAudio) {
    try {
      const mediaId = msgObj?.[tipo]?.id
      if (!mediaId) {
        return responderComTimer(from, {
          texto: "Não consegui processar seu áudio. Por favor, digite o nome completo da pessoa atendida.",
          opcoes: null
        })
      }

  await enviar(from, "👂 Estou ouvindo seu áudio...", null, false)
      const midia = await baixarMidia(mediaId)
      if (!midia) {
        return responderComTimer(from, {
          texto: "Não consegui baixar esse áudio. Pode tentar novamente ou digitar o nome completo da pessoa atendida.",
          opcoes: null
        })
      }

      const transcricao = await transcrever(midia.buffer, midia.mimeType, {
        origem: "nome",
        prompt: "Transcreva em português brasileiro com foco em identificar apenas o nome completo da pessoa atendida."
      })
      const nomeLimpo = await extrairNomeAudio(transcricao)
      const validacaoNomeTerceiro = nomeLimpo ? ehNomeAparente(nomeLimpo, transcricao || "") : false

      if (!nomeLimpo || validacaoNomeTerceiro === false) {
        return responderComTimer(from, {
          texto: "Não consegui entender o nome. Pode falar o nome completo devagar ou digitar?",
          opcoes: null
        })
      }

      if (validacaoNomeTerceiro === "incompleto") {
        return responderComTimer(from, {
          texto: "Preciso do nome completo da pessoa atendida. Por favor, informe também o sobrenome.",
          opcoes: null
        })
      }

      return await prepararConfirmacaoEntrada(from, u, "nome", nomeLimpo, "coleta_tel_outro")
    } catch (e) {
      logErro("audio_nome_terceiro", "Falha ao processar nome do terceiro por áudio", e)
      return responderComTimer(from, {
        texto: "Não consegui processar esse áudio. Por favor, digite o nome completo da pessoa atendida.",
        opcoes: null
      })
    }
  }

  if (ehAudio && !ehDoc) {
    const respostaAudioCadastral = await transcreverAudioRespostaCadastral(from, u, msgObj, tipo)
    if (respostaAudioCadastral?.erro) {
      // ACOLHIMENTO_PARA_QUEM: além do aviso de erro, reapresenta a própria
      // pergunta ("é para você ou para outra pessoa?") para o cliente não
      // ficar sem contexto. Mantém o comportamento de áudio da etapa
      // (pré-escolha definitiva de modo, sempre áudio + texto).
      if (u.stage === STAGES.ACOLHIMENTO_PARA_QUEM) {
        await enviar(from, respostaAudioCadastral.erro, null, false)
        iniciarTimer(from)
        return await telaParaQuem(from, u)
      }
      return responderComTimer(from, { texto: respostaAudioCadastral.erro, opcoes: null })
    }
    if (respostaAudioCadastral?.text) text = respostaAudioCadastral.text
  }

  const respostaAudioFluxo = await processarAudioNoFluxo(from, nomeWA, u, msgObj, tipo, ehAudio)
  if (respostaAudioFluxo) return respostaAudioFluxo

  const respostaUrgenciaOuCorrecao = await processarUrgenciaOuCorrecao(from, u, text, msgObj, ehDoc, ehAudio)
  if (respostaUrgenciaOuCorrecao) return respostaUrgenciaOuCorrecao

  // Novo fluxo humanizado
  if (u.stage === STAGES.ACOLHIMENTO) {
    if (!u.atendente) u.atendente = sortearAtendente()
    iniciarTimer(from)

    // se veio do Voltar da confirmação, pular apresentação institucional
    if (u._voltandoConfirmacao) {
      u._voltandoConfirmacao = false
      setStage(u, STAGES.AUDIO_AGUARDANDO)
      return {
        texto: `Me conta sua situação. 😊\n\nPode falar em áudio 🎙️ ou digitar ✍️, do jeito que for mais fácil pra você.\n\n_Vou preparar tudo para o advogado já chegar pronto para te atender._ ⚖️`,
        opcoes: null
      }
    }

    // Apresentação completa — somente no atendimento inicial (imagem + texto juntos via caption)
    try {
      await enviarImagemWhatsApp(from, "https://i.imgur.com/ztcFIuG.png", `Olá 😊\n\nSeja muito bem-vindo(a) à *Oráculum Advocacia.*\n\nEu sou *${u.atendente}* e vou acompanhar você durante este atendimento. Nossa equipe atua nas áreas *Previdenciária*, *Trabalhista* e em outras demandas jurídicas, sempre com atenção e cuidado com o seu caso. 💙\n\n⚖️ *Ao final do cadastro, você poderá falar diretamente com um advogado.*\n\nVocê pode digitar *recomeçar* ou *encerrar* a qualquer momento.\n\nConte comigo.\n\n━━━━━━━━━━━━━━━\n_Seus dados são tratados com sigilo e utilizados exclusivamente para fins jurídicos, conforme a LGPD._`)
    } catch (e) {
      logErro("boas-vindas", "Falha ao enviar imagem de boas-vindas", e)
      await enviar(from, `Olá 😊\n\nSeja muito bem-vindo(a) à *Oráculum Advocacia.*\n\nEu sou *${u.atendente}* e vou acompanhar você durante este atendimento. Nossa equipe atua nas áreas *Previdenciária*, *Trabalhista* e em outras demandas jurídicas, sempre com atenção e cuidado com o seu caso. 💙\n\n⚖️ *Ao final do cadastro, você poderá falar diretamente com um advogado.*\n\nVocê pode digitar *recomeçar* ou *encerrar* a qualquer momento.\n\nConte comigo.\n\n━━━━━━━━━━━━━━━\n_Seus dados são tratados com sigilo e utilizados exclusivamente para fins jurídicos, conforme a LGPD._`)
    }
    // Áudio 1 — apresentação da atendente
    try {
      const ogg = await gerarAudioAtendente(u.atendente,
        `Olá! Meu nome é ${u.atendente} e vou acompanhar você neste atendimento. Ao final do cadastro, você poderá falar diretamente com um advogado. A qualquer momento você pode dizer recomeçar ou encerrar se precisar.`)
      await enviarAudio(from, urlAudioAtendente(ogg))
      await new Promise(r => setTimeout(r, 3000))
    } catch (e) { logErro("tts", "Falha áudio boas-vindas", e) }
    // Áudio correspondente à tela de escolha de modo (etapa 1 de 6)
    try {
      const ogg = await gerarAudioAtendente(u.atendente,
        `Como prefere ser atendido durante este processo? Primeira opção: ouvir e responder por áudio, onde vou te guiando com perguntas em voz, uma de cada vez. Segunda opção: ler e digitar, onde você vê as perguntas por escrito e responde no seu ritmo.`)
      await enviarAudio(from, urlAudioAtendente(ogg))
      await new Promise(r => setTimeout(r, 4000))
    } catch (e) { logErro("tts", "Falha áudio escolha modo", e) }
    // Após apresentação, pergunta o modo de atendimento preferido (etapa 1 de 6)
    return await telaEscolhaModo(from, u)
  }

  if (u.stage === STAGES.ESCOLHA_CANAL) {
    if (text === "canal_texto") {
      u.modoTexto = true
      return await iniciarFluxoRelatoLivre(from, u, { boasVindas: false })
    }
    if (text === "canal_audio") {
      setStage(u, STAGES.AUDIO_AGUARDANDO)
      iniciarTimer(from)

      try {
        const ogg = await gerarAudioAtendente(u.atendente,
          `Você escolheu o atendimento por voz. A partir de agora vou te guiar enviando um áudio de instrução em cada etapa. Fique à vontade para falar. Quando terminar de gravar, envie o áudio normalmente.`)
        await enviarAudio(from, urlAudioAtendente(ogg))
        await new Promise(r => setTimeout(r, 4000))
      } catch (e) { logErro("tts", "Falha áudio aguardando", e) }

      return {
        texto: `🎙️ Pode falar agora!\n\nEnvie seu áudio explicando sua situação. Fale com calma — estou aqui para ouvir você.\n\n_Se preferir, pode digitar sua mensagem._`,
        opcoes: null
      }
    }
    iniciarTimer(from)
    return await iniciarFluxoRelatoLivre(from, u, { boasVindas: false })
  }

  if (u.stage === STAGES.AUDIO_OPCOES) {
    if (text === "audio_enviar") {
      setStage(u, STAGES.AUDIO_AGUARDANDO)
      iniciarTimer(from)

      try {
        const ogg = await gerarAudioAtendente(u.atendente,
          `Pode falar agora. Diga com calma o que está acontecendo. Quando terminar, envie o áudio normalmente.`)
        await enviarAudio(from, urlAudioAtendente(ogg))
        await new Promise(r => setTimeout(r, 4000))
      } catch (e) { logErro("tts", "Falha áudio aguardando", e) }

      return {
        texto: `🎙️ *Pode falar!*\n\nEnvie seu áudio agora. Fale com calma — estou aqui para ouvir você.\n\n_Se preferir, pode digitar sua mensagem._`,
        opcoes: null
      }
    }
    if (text === "canal_texto") {
      u.modoTexto = true
      return await iniciarFluxoRelatoLivre(from, u, { boasVindas: false })
    }
    if (text === "audio_voltar_texto") {
      u.modoTexto = true
      return await iniciarFluxoRelatoLivre(from, u, { boasVindas: false })
    }
    iniciarTimer(from)
    return await iniciarFluxoRelatoLivre(from, u, { boasVindas: false })
  }

  if (u.stage === STAGES.AUDIO_AGUARDANDO) {
    if (text === "canal_texto") {
      u.modoTexto = true
      return await iniciarFluxoRelatoLivre(from, u, { boasVindas: false })
    }
    if (text === "audio_voltar_texto") {
      u.modoTexto = true
      return await iniciarFluxoRelatoLivre(from, u, { boasVindas: false })
    }
    if (text) {
      // Usuário digitou em vez de enviar áudio — tratar como transcrição manual
      // 1ª passagem: só regras, sem IA (rápido — detecta terceiro/duvida/relato por regex)
      const intervencaoSituacao = await tratarIntervencaoPreAtendimento(from, u, u.stage, text, { usarIA: false })
      if (intervencaoSituacao) return intervencaoSituacao
      // 2ª passagem: com IA completa, incluindo conduzirPreAtendimentoIA como fallback
      // Cobre textos curtos e frases inesperadas que as regras não reconheceram
      const intervencaoSituacaoIA = await tratarIntervencaoPreAtendimento(from, u, u.stage, text)
      if (intervencaoSituacaoIA) return intervencaoSituacaoIA
      // Se ainda não houve intervenção, perguntar como o usuário prefere prosseguir
      try {
        const classificacaoCheck = await classificarEntradaPreAtendimento(u.stage, text)
        if (classificacaoCheck && classificacaoCheck.tipo === "desconhecido") {
          try {
            u._ultimoTextoConfuso = text
          } catch (e) { /* ignore */ }
          return await telaEsclarecimentoConfuso(from, u)
        }
      } catch (e) { logErro("classificacao", "erro verificação desconhecido", e) }
      // Só chega aqui se a IA também não conseguiu gerar resposta (ex: GROQ_KEY ausente)
      if (text && text.replace(/\s+/g, "").length < 20) {
        iniciarTimer(from)
        return await responderTelaComAudio(
          from,
          u,
          {
            texto: `💬 Entendi que você precisa de ajuda!\n\nPara que eu possa preparar seu caso direitinho, me conta um pouco mais sobre o que está acontecendo.\n\nPode falar à vontade. 😊`,
            opcoes: null
          },
          "Entendi que você precisa de ajuda. Para preparar seu caso direitinho, me conte um pouco mais sobre o que está acontecendo. Pode falar à vontade.",
          "situacao curta"
        )
      }
      await enviar(from, "👀 Lendo sua mensagem...")
      u._audioCanalTranscricao = acumularRelato(u, text)

      // Detector de sofrimento intenso — responde com acolhimento antes de classificar
      if (detectarSofrimentoIntenso(text) && !u._jaAcolheuSofrimento) {
        u._jaAcolheuSofrimento = true
        const msgAcolhimento = gerarMensagemAcolhimento(text)
        await enviar(from, msgAcolhimento)
        if (!u.modoTexto && u.atendente) {
          try {
            const textoAudio = removerFormatacaoParaAudio(msgAcolhimento)
            const ogg = await gerarAudioAtendente(u.atendente, textoAudio)
            await enviarAudio(from, urlAudioAtendente(ogg))
            await new Promise(r => setTimeout(r, 3000))
          } catch (e) { logErro("tts", "Falha áudio acolhimento sofrimento", e) }
        }
      }

      const classificacao = await classificarAreaAudio(u._audioCanalTranscricao)
      iniciarTimer(from)
      // Relato coletado por pedirRelatoAposNome — sair do modo revalidação e seguir normalmente
      if (u._revalidandoCampos && u._aguardandoRelatoAposNome) {
        u._aguardandoRelatoAposNome = false
        u._revalidandoCampos = false
      }
      // "Recomeçar" — confirmação progressiva campo a campo
      if (u._revalidandoCampos) {
        aplicarClassificacaoJuridica(u, classificacao)
        u._revalidaConfirmados = []
        if (!u.modoTexto) {
          try {
            const ogg = await gerarAudioAtendente(u.atendente, `Atualizei sua situação. Agora vou confirmar seus dados com você.`)
            await enviarAudio(from, urlAudioAtendente(ogg))
            await new Promise(r => setTimeout(r, 2000))
          } catch (e) { logErro("tts", "Falha áudio início revalidação texto", e) }
        }
        return await proximaConfirmacaoProgressiva(from, u)
      }
      // "Voltar" da confirmação: atualiza a situação e revisa campos um a um (igual ao áudio)
      if (u._voltandoConfirmacao) {
        aplicarClassificacaoJuridica(u, classificacao)
        u._voltandoConfirmacao = false
        u._revalidandoCampos = true
        u._revalidaConfirmados = []
        if (!u.modoTexto) {
          try {
            const ogg = await gerarAudioAtendente(u.atendente,
              `Atualizei sua situação. Agora vou confirmar seus dados com você.`)
            await enviarAudio(from, urlAudioAtendente(ogg))
            await new Promise(r => setTimeout(r, 2000))
          } catch (e) { logErro("tts", "Falha áudio revalidação texto", e) }
        }
        return await proximaConfirmacaoProgressiva(from, u)
      }

      // Guarda: classificação fraca → pede esclarecimento antes de avançar
      if (deveEsclarecerRelato(u, classificacao)) {
        u._jaEsclareceuRelato = true
        setStage(u, STAGES.AUDIO_AGUARDANDO)
        const pergunta = gerarPerguntaEsclarecimentoRelato(classificacao, u._audioCanalTranscricao)
        return responderComTimer(from, { texto: pergunta, opcoes: null })
      }

      aplicarClassificacaoJuridica(u, classificacao)
      u._jaEsclareceuRelato = false
      return await flowAssessoriaInicial(u, { from, origem: "texto" })
    }
  }

  if (u.stage === STAGES.AUDIO_CONFIRMAR_TRANSCRICAO) {
    const seguirAposClassificacaoAudio = async () => {
      setStage(u, STAGES.AUDIO_CONFIRMAR_AREA_CANAL)
      iniciarTimer(from)
      return await telaConfirmarAreaAudio(from, u)
    }
    if (text === "audio_transcricao_ok") {
      if (!u._audioCanalTranscricao) {
        iniciarTimer(from)
        return responderComTimer(from, { texto: "Não encontrei a transcrição anterior. Envie seu áudio novamente, por favor.", opcoes: [{ id: "audio_enviar", title: "🎤 Enviar áudio" }] })
      }
      const classificacao = await classificarAreaAudio(u._audioCanalTranscricao)
      aplicarClassificacaoJuridica(u, classificacao)
      return await seguirAposClassificacaoAudio()
    }
    if (text === "audio_transcricao_novo") {
      setStage(u, STAGES.AUDIO_AGUARDANDO)
      iniciarTimer(from)
      try {
        const ogg = await gerarAudioAtendente(u.atendente,
          `Tudo bem! Pode enviar um novo áudio agora. Fale com calma explicando sua situação.`)
        await enviarAudio(from, urlAudioAtendente(ogg))
        await new Promise(r => setTimeout(r, 3000))
      } catch (e) { logErro("tts", "Falha áudio novo envio", e) }
      return {
        texto: `🎙️ Pode enviar seu novo áudio agora.\n\n_Fale com calma — estou aqui para ouvir você._`,
        opcoes: null
      }
    }
    if (text === "audio_transcricao_texto") {
      iniciarTimer(from)
      try {
        const ogg = await gerarAudioAtendente(u.atendente,
          `Tudo bem! Digite agora sua situação com suas próprias palavras. Pode escrever à vontade.`)
        await enviarAudio(from, urlAudioAtendente(ogg))
        await new Promise(r => setTimeout(r, 3000))
      } catch (e) { logErro("tts", "Falha áudio corrigir texto", e) }
      return {
        texto: `✍️ Digite abaixo sua situação com suas próprias palavras.\n\n_Escreva à vontade — estou aqui para ajudar._`,
        opcoes: null
      }
    }
    if (text) {
      u._audioCanalTranscricao = normalizarTextoCRM(text)
      const classificacao = await classificarAreaAudio(u._audioCanalTranscricao)
      aplicarClassificacaoJuridica(u, classificacao)
      return await seguirAposClassificacaoAudio()
    }
    iniciarTimer(from)
    return responderComTimer(from, await telaConfirmarTranscricao(from, u.atendente, u._audioCanalTranscricao || "", u.area))
  }

  if (u.stage === STAGES.ASSESSORIA_INICIAL) {
    // "Continuar" — modo já definido na etapa 1, apenas avança o fluxo
    if (text === "continuar_audio") {
      iniciarTimer(from)
      // Se veio do Voltar/Recomeçar, retoma revalidação campo a campo
      if (u._revalidandoCampos) {
        u._revalidaConfirmados = u._revalidaConfirmados || []
        if (!u.modoTexto) {
          try {
            const ogg = await gerarAudioAtendente(u.atendente, `Atualizei sua situação. Agora vou confirmar seus dados com você.`)
            await enviarAudio(from, urlAudioAtendente(ogg))
            await new Promise(r => setTimeout(r, 2000))
          } catch (e) { logErro("tts", "Falha áudio revalida", e) }
        }
        return await proximaConfirmacaoProgressiva(from, u)
      }
      const proximaNovoCaso = await proximaEtapaNovoCasoClienteAposModo(from, u)
      if (proximaNovoCaso) return proximaNovoCaso
      if (!u.nomeConfirmado) {
        return await telaParaQuem(from, u)
      }
      // Fluxo de terceiro: nome já coletado, próxima etapa é o WhatsApp da pessoa atendida
      if (u.atendimentoParaTerceiro) {
        iniciarTimer(from)
        return await flowColetaTelWppContato(u, { from })
      }
      // Fluxo "para mim": nome já confirmado — vai direto para WhatsApp
      if (u.nomeConfirmado) {
        return await flowAcolhimentoConfirmaWhatsapp(u, { from })
      }
      setStage(u, STAGES.ACOLHIMENTO_NOME)
      if (!u.modoTexto) {
        try {
          const ogg = await gerarAudioAtendente(u.atendente, `Ótimo! Agora preciso saber seu nome completo. Você pode falar em áudio ou digitar.`)
          await enviarAudio(from, urlAudioAtendente(ogg))
          await new Promise(r => setTimeout(r, 3000))
        } catch (e) { logErro("tts", "Falha áudio nome assessoria", e) }
      }
      return {
        texto: `●●○○○○ 👤 Etapa 2 de 6 · *Nome*\n\n😊 Fico feliz em poder ajudar! Para começar, qual é o seu nome completo?\n\n_${u.modoTexto ? "Digite seu nome abaixo." : "Pode falar em áudio ou digitar."}_`,
        opcoes: null
      }
    }
    if (text === "relato_novo") {
      u._relatoAnterior = u._audioCanalTranscricao || null
      u._audioCanalTranscricao = null
      setStage(u, STAGES.AUDIO_AGUARDANDO)
      iniciarTimer(from)
      if (!u.modoTexto) {
        try {
          const ogg = await gerarAudioAtendente(u.atendente,
            `Sem problema! Pode explicar sua situação de novo agora, por áudio ou digitando. Tente contar com um pouco mais de detalhe para que o advogado chegue bem preparado.`)
          await enviarAudio(from, urlAudioAtendente(ogg))
          await new Promise(r => setTimeout(r, 4000))
        } catch (e) { logErro("tts", "Falha áudio nova situação", e) }
      }
      if (process.env.IMAGEM_RELATO_URL) {
        try {
          const enviada = await enviarImagemWhatsApp(from, process.env.IMAGEM_RELATO_URL, `🎙️ Pode explicar sua situação de novo agora, por áudio ou digitando.\n\nQuanto mais detalhes, melhor o advogado chega preparado.`, null)
          if (enviada) return { texto: null, opcoes: null }
        } catch (e) { logErro("imagem", "Falha imagem explicar de novo", e) }
      }
      return {
        texto: `🎙️ Pode explicar sua situação de novo agora, por áudio ou digitando.\n\nQuanto mais detalhes, melhor o advogado chega preparado.`,
        opcoes: null
      }
    }
    // Texto livre = complemento/correção ao relato já feito (sem botão necessário).
    // Em vez de descartar o relato anterior e reprocessar do zero em AUDIO_AGUARDANDO
    // (o que fazia o classificador interpretar o complemento isoladamente, às vezes
    // como "duvida" sobre a área, perdendo todo o contexto já coletado), anexamos o
    // texto novo ao relato existente e regeramos a tela "Foi isso que entendi?".
    if (text && text !== "continuar_audio") {
      const complemento = normalizarTextoCRM(text)
      const relatoAnterior = sanitizarTextoEntrada(u._audioCanalTranscricao || u.descricao || "")
      u._audioCanalTranscricao = relatoAnterior ? `${relatoAnterior}. ${complemento}` : complemento
      u.descricao = u._audioCanalTranscricao
      iniciarTimer(from)
      if (!u.modoTexto) {
        try {
          const ogg = await gerarAudioAtendente(u.atendente,
            `Entendi! Vou acrescentar essa informação ao que você já me contou.`)
          await enviarAudio(from, urlAudioAtendente(ogg))
          await new Promise(r => setTimeout(r, 3000))
        } catch (e) { logErro("tts", "Falha áudio complemento relato assessoria", e) }
      }
      const classificacao = await classificarAreaAudio(u._audioCanalTranscricao)
      aplicarClassificacaoJuridica(u, classificacao)
      return await flowAssessoriaInicial(u, { from, origem: "texto" })
    }
    iniciarTimer(from)
    return responderComTimer(from, {
      texto: `Confirme ou me conte a situação de novo. Pode falar ou digitar. 🎙️`,
      opcoes: [
        { id: "continuar_audio", title: "✅ Está correto" }
      ]
    })
  }

  if (u.stage === STAGES.AUDIO_CONFIRMAR_AREA_CANAL) {
    if (text === "audio_transcricao_texto") {
      setStage(u, STAGES.AUDIO_AGUARDANDO)
      iniciarTimer(from)
      return await responderTelaComAudio(
        from,
        u,
        {
          texto: `✍️ Digite novamente sua situação com suas próprias palavras.\n\n_Escreva à vontade — estou aqui para ajudar._`,
          opcoes: null
        },
        "Tudo bem. Digite novamente sua situação com suas próprias palavras. Escreva à vontade, estou aqui para ajudar.",
        "corrigir situacao area"
      )
    }
    if (text === "audio_area_canal_sim") {
      if (!u.nomeConfirmado) {
        setStage(u, STAGES.ACOLHIMENTO_NOME)
        iniciarTimer(from)
        try {
          const ogg = await gerarAudioAtendente(u.atendente,
            `Ótimo! Agora preciso saber seu nome completo. Você pode digitar ou enviar um áudio falando seu nome.`)
          await enviarAudio(from, urlAudioAtendente(ogg))
          await new Promise(r => setTimeout(r, 3000))
        } catch (e) { logErro("tts", "Falha áudio nome", e) }
        return {
          texto: `●●○○○○ 👤 Etapa 2 de 6 · *Nome*\n\nPerfeito! ✅\n\n😊 Fico feliz em poder ajudar! Para começar, qual é o seu nome completo?\n\n_Você pode digitar ou enviar um áudio com seu nome._`,
          opcoes: null
        }
      }
      setStage(u, STAGES.AUDIO_CONFIRMAR_DADOS)
      iniciarTimer(from)
      return await telaConfirmarDadosAudio(from, u)
    }
    if (text === "audio_area_canal_nao") {
      u._audioCanalTranscricao = null
      u._areaDetectada = null
      u.area = null
      setStage(u, STAGES.AUDIO_AGUARDANDO)
      iniciarTimer(from)
      try {
        const ogg = await gerarAudioAtendente(u.atendente,
          `Tudo bem. Me conte novamente o que aconteceu, com um pouco mais de detalhe, para eu analisar melhor a área do seu caso.`)
        await enviarAudio(from, urlAudioAtendente(ogg))
        await new Promise(r => setTimeout(r, 3000))
      } catch (e) { logErro("tts", "Falha áudio corrigir situacao area", e) }
      return {
        texto: "Tudo bem. Me conte novamente o que aconteceu, com um pouco mais de detalhe, para eu analisar melhor a área do seu caso.\n\n_Pode enviar áudio ou digitar._",
        opcoes: null
      }
    }
  }

  if (u.stage === STAGES.AUDIO_CONFIRMAR_DADOS) {
    if (text === "audio_dados_confirmar") {
      u.descricao = u._audioCanalTranscricao || u.descricao
      try {
        const casoAnteriorCliente = u._casoAnteriorCliente
        const casoParaTerceiro = ehFinalizacaoCasoTerceiro(u)
        const eraNovoCasoDeCliente = Boolean(u._novoCasoDeCliente)
        const numeroCaso = await finalizarCadastro(from, u)
        // marcar que o caso foi recém-aberto para que "Enviar documentos"
        // vá direto para o fluxo de docs sem exibir seleção de caso (espelho do conf_ok)
        u._casoRecemAberto = true
        if (eraNovoCasoDeCliente) u._contextoDocsCasoAtual = criarContextoDocsCasoAtual(u, numeroCaso)
        if (casoParaTerceiro) {
          u._casoRecemAberto = false
          u._contextoDocsCasoAtual = null
          const respostaTerceiro = await finalizarCadastroTerceiroEVoltarOrigem(from, u, numeroCaso, casoAnteriorCliente)
          await enviarAudioModoVoz(
            from,
            u,
            `Caso registrado com sucesso. O número do caso é ${numeroCaso.split("").join(" ")}. A continuidade será pelo WhatsApp informado da pessoa atendida. Ela poderá enviar menu no próprio WhatsApp para acompanhar o atendimento. Nesta conversa, você voltou para o seu atendimento original.`,
            "novo caso terceiro registrado"
          )
          return respostaTerceiro
        }
        if (!u._contextoDocsCasoAtual) u._contextoDocsCasoAtual = criarContextoDocsCasoAtual(u, numeroCaso)
        const docs = getDocumentosCaso(u)
        const primeiroNome = primeiroNomeCliente(u) || "você"

        try {
          const textoAudioCadastro = eraNovoCasoDeCliente
            ? `Pronto, ${primeiroNome}. Seu novo caso foi registrado com sucesso. O número do caso é ${numeroCaso.split("").join(" ")}. Um especialista vai analisar essa nova situação e entrar em contato em breve pelo WhatsApp. Você pode enviar documentos, falar com advogado ou voltar ao menu do cliente.`
            : `Parabéns, ${primeiroNome}! Você agora é cliente do Escritório Oráculum. Seu número de caso é ${numeroCaso.split("").join(" ")}. Um especialista vai analisar sua situação e entrar em contato em breve pelo WhatsApp. Você já pode agendar uma consulta, enviar documentos ou acompanhar o status do seu caso.`
          const ogg = await gerarAudioAtendente(u.atendente,
            textoAudioCadastro)
          await enviarAudio(from, urlAudioAtendente(ogg))
          await new Promise(r => setTimeout(r, 6000))
        } catch (e) { logErro("tts", "Falha áudio cadastro realizado", e) }

        const textoCasoRegAudio = `🎉 *${primeiroNome}, seu caso foi registrado!*\n\n📄 *Número do caso:* \`\`\`${numeroCaso}\`\`\`\n\n_Guarde esse número. É com ele que identificamos seu atendimento por aqui._\n\nSeu caso foi encaminhado a um especialista em *${u.area ? "Direito " + u.area : "Direito"}*, que fará a análise e entrará em contato em breve.\n\n⏱️ Prazo estimado: até 2 dias úteis\n\n━━━━━━━━━━━━━━━\n📋 *Documentos que podem ser necessários:*\n${docs}\n\nVocê pode enviar agora ou depois, como preferir.`
        const opcoesCasoRegAudio = [
      { id: "m_adv",      title: "👨‍⚖️ Falar com advogado" },
      { id: "m_docs", title: "📎 Enviar documentos" },
      { id: "m_inicio", title: "🏠 Menu do cliente" }
        ]
        if (IMAGEM_CASO_REGISTRADO_URL) {
          const enviada = await enviarImagemWhatsApp(from, IMAGEM_CASO_REGISTRADO_URL, textoCasoRegAudio, opcoesCasoRegAudio)
          if (enviada) return { texto: null, opcoes: null }
        }
        return { texto: textoCasoRegAudio, opcoes: opcoesCasoRegAudio }
      } catch (e) {
        logErro("finalizarCadastro", "Falha ao finalizar cadastro (audio_dados_confirmar): " + e.message)
        return responderComTimer(from, {
          texto: `⚠️ Ocorreu um problema ao registrar seu caso. Seus dados estão salvos.\n\nPor favor, tente confirmar novamente.`,
          opcoes: [
            { id: "audio_dados_confirmar", title: "🔄 Tentar novamente" },
            { id: "audio_dados_corrigir", title: "✏️ Corrigir dados" }
          ]
        })
      }
    }

    if (text === "audio_dados_corrigir") {
      setStage(u, STAGES.CORRIGIR_DADOS)
      u._retornarParaConfirmacao = true
      u._origemConfirmacao = "audio"
      iniciarTimer(from)
      if (!u.modoTexto) {
        try {
          const ogg = await gerarAudioAtendente(u.atendente,
            `Claro! Me diga o que deseja corrigir. Pode falar em áudio ou digitar. Por exemplo: meu nome está errado, a cidade está errada, ou o WhatsApp está errado.`)
          await enviarAudio(from, urlAudioAtendente(ogg))
          await new Promise(r => setTimeout(r, 3000))
        } catch (e) { logErro("tts", "Falha áudio corrigir dados", e) }
      }
      return {
        texto: `✏️ *O que você gostaria de corrigir?*\n\n_Pode digitar ou enviar um áudio dizendo o que está errado. Por exemplo: "meu nome está errado", "a cidade não está certa" ou "o WhatsApp está errado"._`,
        opcoes: null
      }
    }

    if (text === "conf_menu") {
      if (ehFinalizacaoCasoTerceiro(u)) {
        iniciarTimer(from)
        const temCasoAnterior = Boolean(u._casoAnteriorCliente)
        const textoAudioVoltarAudio = temCasoAnterior
          ? "Este atendimento é para outra pessoa. Para evitar misturar com seu caso original, escolha se deseja ver a confirmação, corrigir os dados ou voltar ao seu menu."
          : "Você está abrindo um caso para outra pessoa. Escolha se deseja ver a confirmação, corrigir os dados ou cancelar o atendimento."
        await enviarAudioModoVoz(from, u, textoAudioVoltarAudio, "voltar confirmacao terceiro audio")
        return responderComTimer(from, telaVoltarConfirmacaoTerceiro(u, "audio"))
      }
      // Voltar na confirmação (modo voz, fluxo "para mim"): mesma tela intermediária
      iniciarTimer(from)
      const primeiroNomeVoltar = primeiroNomeCliente(u) || ""
      const textoAudioVoltarParaMim = primeiroNomeVoltar
        ? `${primeiroNomeVoltar}, você voltou da tela de confirmação. Escolha se deseja ver os dados novamente, corrigir alguma informação ou contar a situação de outro jeito.`
        : "Você voltou da tela de confirmação. Escolha se deseja ver os dados novamente, corrigir alguma informação ou contar a situação de outro jeito."
      await enviarAudioModoVoz(from, u, textoAudioVoltarParaMim, "voltar confirmacao audio para_mim")
      const textoTelaVoltarParaMim = primeiroNomeVoltar
        ? `⬅️ *Tudo bem, ${primeiroNomeVoltar}.*\n\nO que você gostaria de fazer?`
        : `⬅️ *Tudo bem.*\n\nO que você gostaria de fazer?`
      return responderComTimer(from, {
        texto: textoTelaVoltarParaMim,
        opcoes: [
          { id: "audio_dados_conf_ver", title: "✅ Ver meus dados" },
          { id: "audio_dados_corrigir", title: "✏️ Corrigir algo" },
          { id: "conf_menu_recontar", title: "🔄 Contar de novo" }
        ]
      })
    }
    if (text === "audio_dados_conf_ver") {
      iniciarTimer(from)
      return responderComTimer(from, await telaConfirmarDadosAudio(from, u))
    }
    if (text === "conf_menu_recontar") {
      u._revalidandoCampos = true
      u.aguardandoResposta = false
      u.aguardandoRetomada = false
      setStage(u, STAGES.AUDIO_AGUARDANDO)
      iniciarTimer(from)
      const primeiroNomeRecontarAudio = primeiroNomeCliente(u) || ""
      const saudacaoRecontarAudio = primeiroNomeRecontarAudio ? `, ${primeiroNomeRecontarAudio}` : ""
      const textoRecontarAudio = `Tudo bem${saudacaoRecontarAudio}. Pode me contar sua situação novamente${u.modoTexto ? " por texto" : " por áudio ou texto"}. Estou aqui para ajudar você.`
      if (!u.modoTexto) {
        try {
          const ogg = await gerarAudioAtendente(u.atendente, textoRecontarAudio)
          await enviarAudio(from, urlAudioAtendente(ogg))
          await new Promise(r => setTimeout(r, 3000))
        } catch (e) { logErro("tts", "Falha audio recontar confirmacao audio", e) }
      }
      return {
        texto: `🔄 Tudo bem${saudacaoRecontarAudio} 😊\n\nPode me contar sua situação novamente${u.modoTexto ? " por texto" : " por áudio ou texto"}. Estou aqui para ajudar você.`,
        opcoes: null
      }
    }

    if (text === "terceiro_audio_conf_continuar") {
      iniciarTimer(from)
      return responderComTimer(from, await telaConfirmarDadosAudio(from, u))
    }

    const imprevistoConfirmacaoAudio = await tratarImprevistoPreAtendimento(from, u, u.stage, text)
    if (imprevistoConfirmacaoAudio) return imprevistoConfirmacaoAudio

    iniciarTimer(from)
    return responderComTimer(from, await telaConfirmarDadosAudio(from, u))
  }

  if (u.stage === STAGES.CORRIGIR_DADOS && (text || ehAudio)) {
    // Se veio áudio, transcrever primeiro
    let textoCorrecao = text
    if (ehAudio && !textoCorrecao) {
      const mediaId = msgObj?.audio?.id || msgObj?.voice?.id
      if (mediaId) {
        const midia = await baixarMidia(mediaId)
        if (midia) {
          await enviar(from, "👂 Ouvindo...", null, false)
          textoCorrecao = await transcrever(midia.buffer, midia.mimeType, { origem: "corrigir_dados" })
        }
      }
    }
    if (!textoCorrecao) {
      if (ehAudio) return await responderFalhaAudioCorrecao(from, u)
      return responderComTimer(from, {
        texto: `✏️ *O que você gostaria de corrigir?*\n\n_Diga ou digite o que está errado. Ex: "meu nome está errado", "a cidade está errada" ou "o WhatsApp está errado"._`,
        opcoes: null
      })
    }

    // Groq identifica qual campo corrigir (com todos os 7 campos suportados)
    let campoDetectado = null
    try {
      const res = await axios.post(
        "https://api.groq.com/openai/v1/chat/completions",
        {
          model: "llama-3.1-8b-instant",
          messages: [{
            role: "user",
            content: `O usuário quer corrigir um dado do cadastro. Analise a mensagem e responda com UMA palavra apenas, sendo exatamente uma destas opções: nome, whatsapp, cidade, situacao, detalhe, urgencia, descricao, outro.\n\nRegras:\n- nome ? nome da pessoa está errado\n- whatsapp ? telefone, WhatsApp ou número de contato está errado\n- cidade ? cidade ou localidade está errada\n- situacao ? tipo de benefício, situação do caso\n- detalhe ? subtipo, detalhe específico do caso\n- urgencia ? urgência, prioridade, está sem receber\n- descricao ? descrição livre, relato do caso, inclusive quando a pessoa disser que a área jurídica está errada\n- outro ? não identificou\n\nMensagem: "${textoCorrecao}"\n\nResponda somente a palavra, sem mais nada.`
          }],
          max_tokens: 10,
          temperature: 0
        },
        { headers: { Authorization: `Bearer ${GROQ_KEY}`, "Content-Type": "application/json" } }
      )
      campoDetectado = res.data.choices[0].message.content.trim().toLowerCase()
    } catch (e) { logErro("groq", "Falha ao detectar campo correcao", e) }

    // Helper interno: ir para mini-stage de edição
    const irParaEditar = async (stage, textoMsg, textoAudio) => {
      u._retornarParaConfirmacao = true
      u._origemConfirmacao = u.modoTexto ? "texto" : "audio"
      setStage(u, stage)
      iniciarTimer(from)
      if (!u.modoTexto && textoAudio) {
        try {
          const ogg = await gerarAudioAtendente(u.atendente, textoAudio)
          await enviarAudio(from, urlAudioAtendente(ogg))
          await new Promise(r => setTimeout(r, 3000))
        } catch (e) { logErro("tts", "Falha áudio correcao", e) }
      }
      return { texto: textoMsg, opcoes: null }
    }

    if (campoDetectado === "nome") {
      return await irParaEditar(STAGES.EDITAR_NOME,
        `●●○○○○ 👤 Etapa 2 de 6 · *Nome*\n\n😊 Fico feliz em poder ajudar! Para começar, qual é o seu nome completo?\n\n_Digite ou envie um áudio com seu nome._`,
        `Tudo bem! Me diga seu nome completo.`)
    }
    if (campoDetectado === "whatsapp") {
      u._retornarParaConfirmacao = true
      u._origemConfirmacao = u.modoTexto ? "texto" : "audio"
      u._corrigindoWhatsappConfirmacao = true
      setStage(u, STAGES.REVALIDA_WHATSAPP)
      iniciarTimer(from)
      const numeroAtual = formatarTelefoneExibicao(getTelefoneContato(from, u))
      if (!u.modoTexto) {
        try {
          const digitosAudio = String(getTelefoneContato(from, u) || "").replace(/\D/g, "").split("").join(" ")
          const ogg = await gerarAudioAtendente(u.atendente,
            `Seu WhatsApp de contato está como ${digitosAudio}. Está correto? Se quiser usar outro número, é só falar ou digitar o WhatsApp com DDD agora.`)
          await enviarAudio(from, urlAudioAtendente(ogg))
          await new Promise(r => setTimeout(r, 3500))
        } catch (e) { logErro("tts", "Falha áudio corrigir whatsapp", e) }
      }
      return responderComTimer(from, {
        texto: `Seu WhatsApp está como *${numeroAtual || from}*.\n\nEstá correto? Se quiser usar outro número, é só digitar ou falar com DDD agora. 🎙️`,
        opcoes: [
          { id: "revalida_whatsapp_ok", title: "✅ Confirmar" }
        ]
      })
    }
    if (campoDetectado === "cidade") {
      return await irParaEditar(STAGES.EDITAR_CIDADE,
        `📍 *Em qual cidade você mora?*\n\nDigite a cidade com o estado, por exemplo: Recife Pernambuco, ou informe o CEP com oito dígitos.`,
        `Tudo bem! Me diga sua cidade com o estado, por exemplo Recife Pernambuco, ou informe o CEP com oito dígitos.`)
    }
    if (campoDetectado === "area") {
      campoDetectado = "descricao"
    }
    if (campoDetectado === "situacao") {
      return await irParaEditar(STAGES.EDITAR_SITUACAO,
        `📌 *Qual é a situação correta?*\n\n_Descreva brevemente ou envie um áudio._`,
        `Tudo bem! Me conta a situação correta do seu caso.`)
    }
    if (campoDetectado === "detalhe") {
      return await irParaEditar(STAGES.EDITAR_DETALHE,
        `🔎 *Qual é o detalhe correto?*\n\n_Digite ou envie um áudio._`,
        `Tudo bem! Me diga o detalhe correto.`)
    }
    if (campoDetectado === "urgencia") {
      u._retornarParaConfirmacao = true
      u._origemConfirmacao = u._origemConfirmacao || (u.modoTexto ? "texto" : "audio")
      setStage(u, STAGES.EDITAR_URGENCIA)
      iniciarTimer(from)
      if (!u.modoTexto) {
        try {
          const ogg = await gerarAudioAtendente(u.atendente, `Tudo bem! Qual é o nível de urgência correto? Primeira opção: Alta, preciso de ajuda urgente. Segunda opção: Moderada, posso aguardar um pouco. Terceira opção: Baixa, sem pressa.`)
          await enviarAudio(from, urlAudioAtendente(ogg))
          await new Promise(r => setTimeout(r, 3500))
        } catch (e) { logErro("tts", "Falha áudio urgência", e) }
      }
      return {
        texto: `⚡ *Qual é o nível de urgência correto?*`,
        opcoes: [
          { id: "eu_alta",   title: "🔴 Alta" },
          { id: "eu_normal", title: "🟡 Moderada" },
          { id: "eu_baixa",  title: "🟢 Baixa" }
        ]
      }
    }
    if (campoDetectado === "descricao") {
      return await irParaEditar(STAGES.EDITAR_DESCRICAO,
        `💬 *Qual é a descrição correta do seu caso?*\n\n_Digite ou envie um áudio com a descrição atualizada._`,
        `Tudo bem! Me conta a descrição correta do seu caso. Vou juntar com o relato anterior e organizar tudo.`)
    }

    // Campo não identificado — pedir mais especificidade
    return responderComTimer(from, {
      texto: `Não entendi bem o que deseja corrigir. Pode ser mais específico?\n\nExemplos:\n• _"Meu nome está errado"_\n• _"A cidade está errada"_\n• _"O WhatsApp está errado"_\n• _"Quero mudar minha situação"_\n• _"A urgência está errada"_`,
      opcoes: null
    })
  }

  if (u.stage === STAGES.AUDIO_CONFIRMAR_AREA) {
    if (text === "audio_area_sim") {
      setStage(u, STAGES.ACOLHIMENTO_NOME)
      iniciarTimer(from)

      try {
        const ogg = await gerarAudioAtendente(u.atendente,
          `Ótimo! Agora preciso saber seu nome completo. Você pode digitar seu nome ou me enviar um áudio falando seu nome.`)
        await enviarAudio(from, urlAudioAtendente(ogg))
        await new Promise(r => setTimeout(r, 3000))
      } catch (e) { logErro("tts", "Falha áudio nome", e) }

      return {
        texto: `●●○○○○ 👤 Etapa 2 de 6 · *Nome*\n\nEntendi, você precisa de ajuda com *${u.area}*.\n\n😊 Fico feliz em poder ajudar! Para começar, qual é o seu nome completo?\n\n_Você pode digitar ou enviar um áudio com seu nome._`,
        opcoes: null
      }
    }
    if (text === "audio_area_nao") {
      u._areaDetectada = null
      u.area = null
      setStage(u, STAGES.AUDIO_AGUARDANDO)
      iniciarTimer(from)
      try {
        const ogg = await gerarAudioAtendente(u.atendente,
          `Tudo bem. Me conte novamente o que aconteceu, com um pouco mais de detalhe, para eu analisar melhor a área do seu caso.`)
        await enviarAudio(from, urlAudioAtendente(ogg))
        await new Promise(r => setTimeout(r, 3000))
      } catch (e) { logErro("tts", "Falha áudio corrigir situacao area", e) }
      return {
        texto: "Tudo bem. Me conte novamente o que aconteceu, com um pouco mais de detalhe, para eu analisar melhor a área do seu caso.\n\n_Pode enviar áudio ou digitar._",
        opcoes: null
      }
    }
    if (text) {
      const normalized = text.toLowerCase()
      if (normalized.includes("inss") || normalized.includes("previd")) u.area = "INSS"
      else if (normalized.includes("trabalh")) u.area = "Trabalhista"
      else u.area = "Outros"
      setStage(u, STAGES.ACOLHIMENTO_NOME)
      iniciarTimer(from)

      try {
        const ogg = await gerarAudioAtendente(u.atendente,
          `Ótimo! Agora preciso saber seu nome completo. Você pode digitar seu nome ou me enviar um áudio falando seu nome.`)
        await enviarAudio(from, urlAudioAtendente(ogg))
        await new Promise(r => setTimeout(r, 3000))
      } catch (e) { logErro("tts", "Falha áudio nome", e) }

      return {
        texto: `●●○○○○ 👤 Etapa 2 de 6 · *Nome*\n\nPerfeito, vamos seguir com *${u.area}*.\n\n😊 Fico feliz em poder ajudar! Para começar, qual é o seu nome completo?\n\n_Você pode digitar ou enviar um áudio com seu nome._`,
        opcoes: null
      }
    }
    iniciarTimer(from)
    return responderComTimer(from, await telaConfirmarArea(from, u.atendente, u.area || "Outros"))
  }

  // ── ACOLHIMENTO_PARA_QUEM ────────────────────────────────────────────────
  // ── ACOLHIMENTO_MODO ─────────────────────────────────────────────────────
  // Processa a escolha de modo. Define u.modoTexto e avança para telaParaQuem.
  if (u.stage === STAGES.ACOLHIMENTO_MODO) {
    const modoAtendimento = detectarModoAtendimento(text)
    if (modoAtendimento) {
      u.modoTexto = modoAtendimento === "texto"
      iniciarTimer(from)
      return await telaParaQuem(from, u)
    }
    iniciarTimer(from)
    return await telaEscolhaModo(from, u, { comAudio: true })
  }

  // Pergunta estrutural: o atendimento é para o próprio contato ou para outra pessoa?
  // Elimina a ambiguidade na coleta de nome downstream.
  if (u.stage === STAGES.ACOLHIMENTO_PARA_QUEM) {
    const textoNormParaQuem = normalizarTextoGatilho(text)
    const ehParaMim = text === "para_quem_eu" || /\b(para mim|é meu|sou eu|eu mesmo|meu caso)\b/.test(textoNormParaQuem)
    const ehParaOutro = text === "para_quem_outro" || /\b(para (ela|ele|outra|minha|meu)|é dela|é dele|outra pessoa)\b/.test(textoNormParaQuem)

    // Marcadores de dúvida/incerteza explícita — só avaliados em texto livre
    // (botões "para_quem_eu"/"para_quem_outro" nunca são ambíguos).
    const ehBotao = text === "para_quem_eu" || text === "para_quem_outro"
    const temDuvidaExplicita = !ehBotao &&
      /\b(nao sei|não sei|talvez|nao tenho certeza|não tenho certeza|fico em duvida|fico em dúvida|nao sei dizer|não sei dizer)\b/.test(textoNormParaQuem)

    // Ambíguo quando: (a) ambos os padrões batem ao mesmo tempo, ou
    // (b) há dúvida explícita junto com qualquer classificação.
    const respostaAmbiguaParaQuem = (ehParaMim && ehParaOutro) || (temDuvidaExplicita && (ehParaMim || ehParaOutro))

    if (ehParaMim && !respostaAmbiguaParaQuem) {
      // Resetar flags de terceiro — o caso é para o próprio contato
      u.atendimentoParaTerceiro = false
      u.telefoneEhDoCliente = null
      u.relacaoComAtendido = null
      u._nomeTitularOrigem = null
      u._nomeTemp = null
      // Delega para função dedicada — mesma estrutura do fluxo de terceiro
      return await perguntarNomeProprio(from, u)
    }

    if (ehParaOutro && !respostaAmbiguaParaQuem) {
      // Confirmar/reforçar flags de terceiro e primeiro coletar o nome de quem está
      // no WhatsApp (nomeContato), para só depois pedir o nome da pessoa atendida.
      u.atendimentoParaTerceiro = true
      u.telefoneEhDoCliente = false
      u._nomeTitularOrigem = "atendido"
      u._nomeTemp = null
      // Tentar extrair a relação específica do texto livre (ex: "para minha filha" → "filha")
      // Só sobrescreve se o texto vier de digitação/áudio livre (não de botão)
      if (text !== "para_quem_outro") {
        const relacaoDetectada = relacaoTerceiroPreAtendimento(text)
        if (relacaoDetectada && relacaoDetectada !== "pessoa atendida") {
          u.relacaoComAtendido = relacaoDetectada
        }
      }
      setStage(u, STAGES.ACOLHIMENTO_NOME_CONTATO)
      iniciarTimer(from)
      const _relacaoAudioParaOutro = u.relacaoComAtendido
      const _labelAudioParaOutro = {
        mae: "sua mãe", pai: "seu pai", filho: "seu filho", filha: "sua filha",
        esposa: "sua esposa", esposo: "seu esposo", conjuge: "seu cônjuge",
        irmao: "seu irmão", irma: "sua irmã", avo: "seu avô ou avó", terceiro: "outra pessoa"
      }[_relacaoAudioParaOutro] || descricaoRelacaoTerceiroPreAtendimento(_relacaoAudioParaOutro) || "outra pessoa"
      const audioNomeContato = `Combinado! Vou registrar o caso para ${_labelAudioParaOutro}. Antes de continuar, preciso saber o seu nome. Como você se chama?`
      if (!u.modoTexto) {
        try {
          const ogg = await gerarAudioAtendente(u.atendente, audioNomeContato)
          await enviarAudio(from, urlAudioAtendente(ogg))
          await new Promise(r => setTimeout(r, 3500))
        } catch (e) { logErro("tts", "Falha áudio nome_contato terceiro", e) }
      }
      return {
        texto: `●●○○○○ 👤 Etapa 2 de 6 · *Nome*\n\n*👥 Atendimento para outra pessoa*\n\nAntes de continuar, preciso saber *o seu nome* — quem está aqui no WhatsApp cuidando desse caso. 😊\n\n_Digite ou envie um áudio com seu nome._ 🎙️`,
        opcoes: null
      }
    }

    // Resposta ambígua (ex: "não sei se é para mim ou para outra pessoa"):
    // não avança o fluxo nem delega ao classificador de imprevisto —
    // apenas reapresenta a pergunta da etapa.
    if (respostaAmbiguaParaQuem) {
      iniciarTimer(from)
      return await telaParaQuem(from, u)
    }

    // Resposta não reconhecida — tenta tratar como imprevisto contextual antes de reapresentar
    if (text) {
      const imprevistoParaQuem = await tratarImprevistoPreAtendimento(from, u, u.stage, text)
      if (imprevistoParaQuem) return imprevistoParaQuem
    }
    iniciarTimer(from)
    return await telaParaQuem(from, u)
  }

  // ── ACOLHIMENTO_NOME_CONTATO ─────────────────────────────────────────────
  // Coleta o nome de quem está no WhatsApp quando o atendimento é para terceiro.
  // Salva em u.nomeContato e depois pede o nome da pessoa atendida.
  if (u.stage === STAGES.ACOLHIMENTO_NOME_CONTATO && text) {

    // 1. Tenta extrair nome — primeiro por padrões de correção explícita ("meu nome é X",
    //    "me chamo X"), depois por remoção de prefixo simples, depois por limpeza pura.
    const nomeCorrecaoContato = extrairNomeDaCorrecaoExplicita(text)
    const textoNormalizado = nomeCorrecaoContato
      ? null // já extraiu o nome correto
      : text
          .replace(/^(meu nome [eé]|me chamo|pode chamar de|sou [oa]?|aqui [eé])\s*/i, "")
          .trim()
    const nomeLimpo = nomeCorrecaoContato || formatarNome(limparTextoSomenteLetras(textoNormalizado))
    const validacaoNomeContato = ehNomeAparente(nomeLimpo, nomeCorrecaoContato ? nomeLimpo : (textoNormalizado || text))

    if (validacaoNomeContato === true) {
      // Nome extraído com sucesso — segue para confirmação
      u._nomeContatoTemp = nomeLimpo
      setStage(u, STAGES.ACOLHIMENTO_CONFIRMA_NOME_CONTATO)
      iniciarTimer(from)
      const audioConfirmar = `${nomeLimpo}. Está correto?`
      if (!u.modoTexto) {
        try {
          const ogg = await gerarAudioAtendente(u.atendente, audioConfirmar)
          await enviarAudio(from, urlAudioAtendente(ogg))
          await new Promise(r => setTimeout(r, 4000))
        } catch (e) { logErro("tts", "Falha áudio confirmar nome contato", e) }
      }
      return {
        texto: `●●○○○○ 👤 Etapa 2 de 6 · *Nome*\n\n👥 *Atendimento para outra pessoa*\n\n✅ Entendi! Seu nome é *${nomeLimpo}*.\n\nEstá correto? Se não estiver, é só me dizer seu nome agora. Pode falar ou digitar. 🎙️`,
        opcoes: [
          { id: "confirma_nome_contato_sim", title: "✅ Sim, está certo" }
        ]
      }
    }

    if (validacaoNomeContato === "incompleto") {
      // Primeiro nome reconhecido — pede o sobrenome antes de avançar
      iniciarTimer(from)
      return responderComTimer(from, {
        texto: `●●○○○○ 👤 Etapa 2 de 6 · *Nome*\n\n*👥 Atendimento para outra pessoa*\n\nEntendi *${nomeLimpo}*. Preciso do seu *nome completo*. Pode incluir o sobrenome?\n\n_Digite ou envie um áudio com seu nome completo._ 🎙️`,
        opcoes: null
      })
    }

    // 2. Não parece um nome — verifica se é relato, dúvida, pedido de advogado etc.
    const imprevistoNomeContato = await tratarImprevistoPreAtendimento(from, u, u.stage, text)
    if (imprevistoNomeContato) return imprevistoNomeContato

    // 3. Não foi reconhecido por nada — pede o nome novamente de forma simples
    return responderComTimer(from, {
      texto: `●●○○○○ 👤 Etapa 2 de 6 · *Nome*\n\n*👥 Atendimento para outra pessoa*\n\nNão consegui identificar seu nome. Por favor, *informe apenas seu nome completo*.\n\n_Digite ou envie um áudio com seu nome._ 🎙️`,
      opcoes: null
    })
  }

  // ── ACOLHIMENTO_CONFIRMA_NOME_CONTATO ────────────────────────────────────
  // Confirma o nome de quem está no WhatsApp antes de pedir o nome do atendido.
  if (u.stage === STAGES.ACOLHIMENTO_CONFIRMA_NOME_CONTATO) {
    // Áudio no stage de confirmação do nome do contato — transcreve inline,
    // sem desviar para AUDIO_FLUXO_CONFIRMA ou EDITAR_NOME.
    if (!text && ehAudio) {
      const mediaId = msgObj?.audio?.id || msgObj?.voice?.id
      if (mediaId) {
        const midia = await baixarMidia(mediaId)
        if (midia) {
          if (!u.modoTexto) await enviar(from, "👂 Ouvindo...", null, false)
          const transcricao = await transcrever(midia.buffer, midia.mimeType, { origem: "acolhimento_confirma_nome_contato" })
          if (transcricao) {
            text = transcricao
          } else {
            return responderComTimer(from, {
              texto: `●●○○○○ 👤 Etapa 2 de 6 · *Nome*\n\n✅ Seu nome é *${u._nomeContatoTemp || u.nomeContato || "informado"}*.\n\nNão consegui entender o áudio. Pode digitar o nome correto ou tocar em Confirmar se estiver certo. 🎙️`,
              opcoes: [{ id: "confirma_nome_contato_sim", title: "✅ Sim, está certo" }]
            })
          }
        }
      }
    }
    // Botão: confirmar
    if (text === "confirma_nome_contato_sim") {
      u.nomeContato = u._nomeContatoTemp || u.nomeContato
      u._nomeContatoTemp = null
      const primeiroNomeContato = (u.nomeContato || "").split(" ")[0] || u.nomeContato
      const relacao = u.relacaoComAtendido
      const labelRelacao = {
        mae: "sua mãe", pai: "seu pai", filho: "seu filho", filha: "sua filha",
        esposa: "sua esposa", esposo: "seu esposo", conjuge: "seu cônjuge",
        irmao: "seu irmão", irma: "sua irmã", avo: "seu avô/avó", terceiro: "outra pessoa"
      }[relacao] || "outra pessoa"
      const pronomeRelacao = {
        mae: "dela", filha: "dela", esposa: "dela", irma: "dela",
        pai: "dele", filho: "dele", esposo: "dele", irmao: "dele", avo: "dele/dela", terceiro: "dela"
      }[relacao] || "dela"
      setStage(u, STAGES.ACOLHIMENTO_NOME)
      iniciarTimer(from)
      const audioAtendido = `Ótimo, ${primeiroNomeContato}! Agora preciso do nome completo de ${labelRelacao}, a pessoa para quem você está abrindo o caso. Pode falar ou digitar.`
      if (!u.modoTexto) {
        try {
          const ogg = await gerarAudioAtendente(u.atendente, audioAtendido)
          await enviarAudio(from, urlAudioAtendente(ogg))
          await new Promise(r => setTimeout(r, 4000))
        } catch (e) { logErro("tts", "Falha áudio pede nome atendido após confirma contato", e) }
      }
      return {
        texto: `●●○○○○ 👤 Etapa 2 de 6 · *Nome*\n\n✅ Ótimo, *${primeiroNomeContato}*!\n\nAgora preciso do *nome completo* de ${labelRelacao}, a pessoa para quem você está abrindo o caso.\n\n_Digite ou fale o nome ${pronomeRelacao}._`,
        opcoes: null
      }
    }
    // Texto livre no stage = nome corrigido diretamente (sem botão necessário)
    if (text && text !== "confirma_nome_contato_sim") {
      // 0. Detecta intenção de correção/negação ANTES de extrair nome puro.
      //    Evita que "Não. Meu nome é X" vire "Nao Meu Nome E X" tratado como nome.
      const nomeCorrecaoContato = extrairNomeDaCorrecaoExplicita(text)
      if (
        nomeCorrecaoContato &&
        ehNomeAparente(nomeCorrecaoContato, nomeCorrecaoContato) === true
      ) {
        u._nomeContatoTemp = nomeCorrecaoContato
        const audioReconfirmar = `${nomeCorrecaoContato}. Está correto?`
        if (!u.modoTexto) {
          try {
            const ogg = await gerarAudioAtendente(u.atendente, audioReconfirmar)
            await enviarAudio(from, urlAudioAtendente(ogg))
            await new Promise(r => setTimeout(r, 4000))
          } catch (e) { logErro("tts", "Falha áudio reconfirmar nome contato correcao explicita", e) }
        }
        return {
          texto: `●●○○○○ 👤 Etapa 2 de 6 · *Nome*\n\n👥 *Atendimento para outra pessoa*\n\n✅ Entendi! Seu nome é *${nomeCorrecaoContato}*.\n\nEstá correto? Se não estiver, é só me dizer seu nome agora. Pode falar ou digitar. 🎙️`,
          opcoes: [{ id: "confirma_nome_contato_sim", title: "✅ Sim, está certo" }]
        }
      }

      // Negação pura ("Não") → imprevisto conduz a pedir o nome correto
      if (parecePuraNegacaoSemNome(text)) {
        const imprevistoNegacaoContato = await tratarImprevistoPreAtendimento(from, u, u.stage, text)
        if (imprevistoNegacaoContato) return imprevistoNegacaoContato
        iniciarTimer(from)
        return responderComTimer(from, { texto: `●●○○○○ 👤 Etapa 2 de 6 · *Nome*\n\nSem problema! Me diga o seu nome correto. Pode falar ou digitar. 🎙️`, opcoes: null })
      }

      // 1. Tenta extrair nome primeiro — correção inline sem passar pelo imprevisto
      const nomeLimpo = formatarNome(limparTextoSomenteLetras(text))
      const validacaoNomeConfContato = ehNomeAparente(nomeLimpo, text)
      if (validacaoNomeConfContato === true) {
        u._nomeContatoTemp = nomeLimpo
        const audioReconfirmar = `${nomeLimpo}. Está correto?`
        if (!u.modoTexto) {
          try {
            const ogg = await gerarAudioAtendente(u.atendente, audioReconfirmar)
            await enviarAudio(from, urlAudioAtendente(ogg))
            await new Promise(r => setTimeout(r, 4000))
          } catch (e) { logErro("tts", "Falha áudio reconfirmar nome contato", e) }
        }
        return {
          texto: `●●○○○○ 👤 Etapa 2 de 6 · *Nome*\n\n👥 *Atendimento para outra pessoa*\n\n✅ Entendi! Seu nome é *${nomeLimpo}*.\n\nEstá correto? Se não estiver, é só me dizer seu nome agora. Pode falar ou digitar. 🎙️`,
          opcoes: [{ id: "confirma_nome_contato_sim", title: "✅ Sim, está certo" }]
        }
      }
      // 2. Não parece nome — trata como imprevisto
      const imprevisto = await tratarImprevistoPreAtendimento(from, u, u.stage, text)
      if (imprevisto) return imprevisto
      return responderComTimer(from, { texto: "Por favor, me diga seu nome completo usando apenas letras e espaços.", opcoes: null })
    }
  }

  if (u.stage === STAGES.ACOLHIMENTO_NOME && text) {
    // Tenta extrair nome por correção explícita ("meu nome é X", "me chamo X") antes da limpeza pura.
    // Isso evita que frases com prefixo de negação/correção sejam limpas e virem um "nome" inválido.
    const nomeCorrecaoNome = extrairNomeDaCorrecaoExplicita(text)
    const nomeLimpo = nomeCorrecaoNome || formatarNome(limparTextoSomenteLetras(text))
    const coletandoNomeAtendido = u.atendimentoParaTerceiro && !!u.nomeContato

    // Valida se o candidato parece um nome próprio (filtra frases de intenção, palavras
    // funcionais, textos sem sobrenome etc.). textoOriginal passado para detectar ausência
    // de maiúscula em frases longas antes da normalização.
    const validacaoNome = ehNomeAparente(nomeLimpo, nomeCorrecaoNome ? nomeLimpo : text)

    if (validacaoNome === true) {
      if (!coletandoNomeAtendido) {
        const ambiguidade = detectarAmbiguidadeTitularNome(u, text)
        if (ambiguidade) {
          return await perguntarTitularNomePreCadastro(from, u, nomeLimpo, ambiguidade)
        }
      }
    } else if (validacaoNome === "incompleto") {
      // Nome único reconhecido — pede sobrenome antes de avançar
      iniciarTimer(from)
      const textoSobrenome = coletandoNomeAtendido
        ? `●●○○○○ 👤 Etapa 2 de 6 · *Nome*\n\nEntendi *${nomeLimpo}*. Preciso do nome completo da pessoa atendida. Pode incluir o sobrenome?`
        : `●●○○○○ 👤 Etapa 2 de 6 · *Nome*\n\nEntendi *${nomeLimpo}*. Preciso do seu nome completo. Pode incluir o sobrenome?`
      return responderComTimer(from, { texto: textoSobrenome, opcoes: null })
    } else {
      // Não parece nome — trata como imprevisto e redireciona
      const imprevistoNome = await tratarImprevistoPreAtendimento(from, u, u.stage, text)
      if (imprevistoNome) return imprevistoNome
      return responderComTimer(from, { texto: "Por favor, informe um nome válido usando apenas letras e espaços.", opcoes: null })
    }
    u._nomeTemp = nomeLimpo
    setStage(u, STAGES.ACOLHIMENTO_CONFIRMA_NOME)
    iniciarTimer(from)

    const textoConfirmarAudio = `${nomeLimpo}. Está correto?`
    const textoConfirmarTela = coletandoNomeAtendido
      ? `●●○○○○ 👤 Etapa 2 de 6 · *Nome*\n\n✅ O nome da pessoa atendida é *${nomeLimpo}*.\n\nEstá correto? Se não estiver, é só me dizer o nome certo agora. Pode falar ou digitar. 🎙️`
      : `●●○○○○ 👤 Etapa 2 de 6 · *Nome*\n\n✅ Seu nome é *${nomeLimpo}*.\n\nEstá correto? Se não estiver, é só me dizer seu nome correto agora. Pode falar ou digitar. 🎙️`

    if (!u.modoTexto) {
      try {
        const ogg = await gerarAudioAtendente(u.atendente, textoConfirmarAudio)
        await enviarAudio(from, urlAudioAtendente(ogg))
        await new Promise(r => setTimeout(r, 4000))
      } catch (e) { logErro("tts", "Falha áudio confirmar nome", e) }
    }

    return {
      texto: textoConfirmarTela,
      opcoes: [
          { id: "nome_confirmar", title: "✅ Sim, está certo" }
      ]
    }
  }

  if (u.stage === STAGES.ACOLHIMENTO_CONFIRMA_NOME) {
    // Áudio no stage de confirmação de nome — transcreve e trata como correção inline,
    // sem desviar para AUDIO_FLUXO_CONFIRMA ou EDITAR_NOME.
    if (!text && ehAudio) {
      const mediaId = msgObj?.audio?.id || msgObj?.voice?.id
      if (mediaId) {
        const midia = await baixarMidia(mediaId)
        if (midia) {
          if (!u.modoTexto) await enviar(from, "👂 Ouvindo...", null, false)
          const transcricao = await transcrever(midia.buffer, midia.mimeType, { origem: "acolhimento_confirma_nome" })
          if (transcricao) {
            text = transcricao
          } else {
            const coletandoNomeAtendido = u.atendimentoParaTerceiro && !!u.nomeContato
            const telaFalha = coletandoNomeAtendido
              ? `●●○○○○ 👤 Etapa 2 de 6 · *Nome*\n\n✅ O nome da pessoa atendida é *${u._nomeTemp || "informado"}*.\n\nNão consegui entender o áudio. Pode digitar o nome correto ou tocar em Confirmar se estiver certo. 🎙️`
              : `●●○○○○ 👤 Etapa 2 de 6 · *Nome*\n\n✅ Seu nome é *${u._nomeTemp || "informado"}*.\n\nNão consegui entender o áudio. Pode digitar o nome correto ou tocar em Confirmar se estiver certo. 🎙️`
            return responderComTimer(from, { texto: telaFalha, opcoes: [{ id: "nome_confirmar", title: "✅ Sim, está certo" }] })
          }
        }
      }
    }
    if (text === "nome_confirmar") {
      u.nome = u._nomeTemp
      u.nomeConfirmado = true
      u._nomeTitularPendente = null
      await sincronizarContatoNegocioHubSpot(u)
      // se está em revalidação progressiva, retornar ao fluxo de revalidação
      if (u._revalidandoCampos) {
        if (!Array.isArray(u._revalidaConfirmados)) u._revalidaConfirmados = []
        u._revalidaConfirmados.push("nome")
        return await proximaConfirmacaoProgressiva(from, u)
      }
      // Usuário novo que veio pelo fluxo ACOLHIMENTO_PARA_QUEM → nome:
      // sempre pede o relato aqui, independente de haver texto prévio.
      // (Texto prévio pode existir se o usuário digitou algo antes dos botões,
      //  mas o relato estruturado da etapa 3 ainda não foi coletado.)
      if (!u.numeroCaso) {
        return await pedirRelatoAposNome(from, u)
      }
      return await flowAcolhimentoConfirmaWhatsapp(u, { from })
    }
    // Texto livre no stage de confirmação = nome corrigido diretamente
    if (text && text !== "nome_confirmar") {
      const coletandoNomeAtendido = u.atendimentoParaTerceiro && !!u.nomeContato

      // 0. Detecta intenção ANTES de extrair o nome puro.
      //    "Não. Meu nome é João Santos" → extrai "João Santos" e reapresenta confirmação.
      //    "Não" puro → cai no imprevisto/condutor para pedir o nome correto.
      //    Isso evita que frases como "Não meu nome é X" sejam limpas para "Nao Meu Nome E X"
      //    e tratadas como se fossem um nome válido.
      const nomeCorrecaoExplicita = extrairNomeDaCorrecaoExplicita(text)
      if (
        nomeCorrecaoExplicita &&
        ehNomeAparente(nomeCorrecaoExplicita, nomeCorrecaoExplicita) === true
      ) {
        u._nomeTemp = nomeCorrecaoExplicita
        u._nomeTitularPendente = null
        const audioReconfirmar = `${nomeCorrecaoExplicita}. Está correto?`
        const telaReconfirmar = coletandoNomeAtendido
          ? `●●○○○○ 👤 Etapa 2 de 6 · *Nome*\n\n✅ O nome da pessoa atendida é *${nomeCorrecaoExplicita}*.\n\nEstá correto? Se não estiver, é só me dizer o nome certo agora. Pode falar ou digitar. 🎙️`
          : `●●○○○○ 👤 Etapa 2 de 6 · *Nome*\n\n✅ Seu nome é *${nomeCorrecaoExplicita}*.\n\nEstá correto? Se não estiver, é só me dizer seu nome correto agora. Pode falar ou digitar. 🎙️`
        if (!u.modoTexto) {
          try {
            const ogg = await gerarAudioAtendente(u.atendente, audioReconfirmar)
            await enviarAudio(from, urlAudioAtendente(ogg))
            await new Promise(r => setTimeout(r, 4000))
          } catch (e) { logErro("tts", "Falha áudio reconfirmar nome correcao explicita", e) }
        }
        return { texto: telaReconfirmar, opcoes: [{ id: "nome_confirmar", title: "✅ Sim, está certo" }] }
      }

      // Negação pura sem nome junto ("Não", "Errado") → imprevisto conduz a pedir o nome correto
      if (parecePuraNegacaoSemNome(text)) {
        const imprevistoPuraNegacao = await tratarImprevistoPreAtendimento(from, u, u.stage, text)
        if (imprevistoPuraNegacao) return imprevistoPuraNegacao
        iniciarTimer(from)
        const nomeAtual = u._nomeTemp || ""
        const telaOrientar = coletandoNomeAtendido
          ? `●●○○○○ 👤 Etapa 2 de 6 · *Nome*\n\nSem problema! Me diga o nome correto da pessoa atendida. Pode falar ou digitar. 🎙️`
          : `●●○○○○ 👤 Etapa 2 de 6 · *Nome*\n\nSem problema! Me diga o seu nome correto. Pode falar ou digitar. 🎙️`
        return responderComTimer(from, { texto: telaOrientar, opcoes: null })
      }

      // 1. Tenta extrair nome puro — se válido, trata como correção inline
      //    sem passar pelo imprevisto (evita desvio para EDITAR_NOME via IA)
      const nomeLimpo = formatarNome(limparTextoSomenteLetras(text))
      const validacaoNomeConf = ehNomeAparente(nomeLimpo, text)
      if (validacaoNomeConf === true) {
        u._nomeTemp = nomeLimpo
        u._nomeTitularPendente = null
        const audioReconfirmar = `${nomeLimpo}. Está correto?`
        const telaReconfirmar = coletandoNomeAtendido
          ? `●●○○○○ 👤 Etapa 2 de 6 · *Nome*\n\n✅ O nome da pessoa atendida é *${nomeLimpo}*.\n\nEstá correto? Se não estiver, é só me dizer o nome certo agora. Pode falar ou digitar. 🎙️`
          : `●●○○○○ 👤 Etapa 2 de 6 · *Nome*\n\n✅ Seu nome é *${nomeLimpo}*.\n\nEstá correto? Se não estiver, é só me dizer seu nome correto agora. Pode falar ou digitar. 🎙️`
        if (!u.modoTexto) {
          try {
            const ogg = await gerarAudioAtendente(u.atendente, audioReconfirmar)
            await enviarAudio(from, urlAudioAtendente(ogg))
            await new Promise(r => setTimeout(r, 4000))
          } catch (e) { logErro("tts", "Falha áudio reconfirmar nome", e) }
        }
        return { texto: telaReconfirmar, opcoes: [{ id: "nome_confirmar", title: "✅ Sim, está certo" }] }
      }
      // 2. Não parece nome — trata como imprevisto
      const imprevisto = await tratarImprevistoPreAtendimento(from, u, u.stage, text)
      if (imprevisto) return imprevisto
      return responderComTimer(from, { texto: "Por favor, me diga o nome completo usando apenas letras e espaços.", opcoes: null })
    }
  }

  if (u.stage === STAGES.ACOLHIMENTO_CONFIRMA_TITULAR_NOME) {
    const textoNorm = normalizarTextoGatilho(text)
    const confirmarContato = text === "nome_titular_contato" || /\b(meu nome|sou eu|eu mesmo|meu|eu sou)\b/.test(textoNorm)
    const confirmarAtendido = text === "nome_titular_atendido" || /\b(pessoa atendida|outra pessoa|de outra pessoa|dele|dela|da pessoa|atendida|atendido)\b/.test(textoNorm)
    const corrigir = text === "nome_corrigir" || textoNorm.includes("corrigir")

    if (confirmarContato || confirmarAtendido) {
      // Se o cliente confirmou que o nome digitado é o DELE, mas o atendimento já foi
      // identificado como sendo para terceiro (ex: "minha mãe"), o nome digitado é do
      // contato que está abrindo o caso — não da pessoa atendida. Nesse caso salvamos
      // como nomeContato e pedimos o nome da pessoa atendida antes de continuar.
      if (confirmarContato && u.atendimentoParaTerceiro) {
        u.nomeContato = u._nomeTemp
        u._nomeTitularOrigem = "contato"
        u._nomeTemp = null
        u._nomeTitularPendente = null
        setStage(u, STAGES.ACOLHIMENTO_NOME)
        iniciarTimer(from)
        const primeiroNomeContato = (u.nomeContato || "").split(" ")[0] || "você"
        const audioAtendido = `Entendido, ${primeiroNomeContato}! Agora preciso do nome completo da pessoa que será atendida. Pode falar em áudio ou digitar.`
        return await responderTelaComAudio(
          from,
          u,
          {
            texto: `●●○○○○ 👤 Etapa 2 de 6 · *Nome*\n\n👥 *Atendimento para outra pessoa*\n\nEntendido, *${primeiroNomeContato}*! ✅\n\nAgora preciso do *nome completo* da pessoa que será atendida, a pessoa para quem você está abrindo o caso.\n\n_Digite ou fale o nome dela._`,
            opcoes: null
          },
          audioAtendido,
          "confirma titular nome contato pede atendido"
        )
      }

      u.nome = u._nomeTemp
      u.nomeConfirmado = true
      u._nomeTitularPendente = null
      u._nomeTitularOrigem = confirmarContato ? "contato" : "atendido"
      await sincronizarContatoNegocioHubSpot(u)
      if (u._revalidandoCampos) {
        if (!Array.isArray(u._revalidaConfirmados)) u._revalidaConfirmados = []
        u._revalidaConfirmados.push("nome")
        return await proximaConfirmacaoProgressiva(from, u)
      }
      // Usuário novo: sempre pede relato antes de WhatsApp
      if (!u.numeroCaso) {
        return await pedirRelatoAposNome(from, u)
      }
      return await flowAcolhimentoConfirmaWhatsapp(u, { from })
    }
    if (corrigir) {
      // Nome parece ser uma correção direta via texto — captura aqui mesmo.
      // Usa extrairNomeDaCorrecaoExplicita para lidar com frases como "Corrigir. Meu nome é X".
      const nomeLimpoCorrecao = extrairNomeDaCorrecaoExplicita(text.replace(/corrigir/i, "").trim())
        || formatarNome(limparTextoSomenteLetras(text.replace(/corrigir/i, "").trim()))
      const validacaoCorrecaoTitular = nomeLimpoCorrecao ? ehNomeAparente(nomeLimpoCorrecao, nomeLimpoCorrecao) : false
      if (validacaoCorrecaoTitular === "incompleto") {
        // Nome único reconhecido — pede sobrenome antes de avançar
        u._nomeTitularPendente = null
        iniciarTimer(from)
        const coletandoNomeAtendido = u.atendimentoParaTerceiro && !!u.nomeContato
        return responderComTimer(from, {
          texto: coletandoNomeAtendido
            ? `●●○○○○ 👤 Etapa 2 de 6 · *Nome*\n\nEntendi *${nomeLimpoCorrecao}*. Preciso do nome completo da pessoa atendida. Pode incluir o sobrenome?`
            : `●●○○○○ 👤 Etapa 2 de 6 · *Nome*\n\nEntendi *${nomeLimpoCorrecao}*. Preciso do seu nome completo. Pode incluir o sobrenome?`,
          opcoes: null
        })
      }
      if (validacaoCorrecaoTitular === true) {
        u._nomeTemp = nomeLimpoCorrecao
        u._nomeTitularPendente = null
        // Vai para confirmação do novo nome
        setStage(u, STAGES.ACOLHIMENTO_CONFIRMA_NOME)
        iniciarTimer(from)
        const coletandoNomeAtendido = u.atendimentoParaTerceiro && !!u.nomeContato
        const audioReconfirmar = `${nomeLimpoCorrecao}. Está correto?`
        const telaReconfirmar = coletandoNomeAtendido
          ? `●●○○○○ 👤 Etapa 2 de 6 · *Nome*\n\n✅ O nome da pessoa atendida é *${nomeLimpoCorrecao}*.\n\nEstá correto? Se não estiver, é só me dizer o nome certo agora. Pode falar ou digitar. 🎙️`
          : `●●○○○○ 👤 Etapa 2 de 6 · *Nome*\n\n✅ Seu nome é *${nomeLimpoCorrecao}*.\n\nEstá correto? Se não estiver, é só me dizer seu nome correto agora. Pode falar ou digitar. 🎙️`
        if (!u.modoTexto) {
          try {
            const ogg = await gerarAudioAtendente(u.atendente, audioReconfirmar)
            await enviarAudio(from, urlAudioAtendente(ogg))
            await new Promise(r => setTimeout(r, 4000))
          } catch (e) { logErro("tts", "Falha áudio reconfirmar nome após titular", e) }
        }
        return { texto: telaReconfirmar, opcoes: [{ id: "nome_confirmar", title: "✅ Sim, está certo" }] }
      }
      // "Corrigir" sem nome junto — orienta a dizer o nome correto agora
      u._nomeTitularPendente = null
      iniciarTimer(from)
      if (!u.modoTexto) {
        try {
          const ogg = await gerarAudioAtendente(u.atendente, "Sem problema! Me diga o nome correto agora, pode falar ou digitar.")
          await enviarAudio(from, urlAudioAtendente(ogg))
          await new Promise(r => setTimeout(r, 3000))
        } catch (e) { logErro("tts", "Falha áudio orientar correção nome titular", e) }
      }
      return {
        texto: `●●○○○○ 👤 Etapa 2 de 6 · *Nome*\n\nSem problema! Me diga o nome correto agora. Pode falar ou digitar. 🎙️`,
        opcoes: null
      }
    }
    const imprevistoConfirmarNome = await tratarImprevistoPreAtendimento(from, u, u.stage, text)
    if (imprevistoConfirmarNome) return imprevistoConfirmarNome
    // Texto livre que não é payload nem imprevisto — tenta capturar como nome corrigido.
    // Primeiro verifica intenção de correção explícita ("Não. Meu nome é X") antes de limpar o texto.
    if (text) {
      const nomeCorrecaoTitular = extrairNomeDaCorrecaoExplicita(text)
      if (
        nomeCorrecaoTitular &&
        ehNomeAparente(nomeCorrecaoTitular, nomeCorrecaoTitular) === true
      ) {
        u._nomeTemp = nomeCorrecaoTitular
        u._nomeTitularPendente = null
        setStage(u, STAGES.ACOLHIMENTO_CONFIRMA_NOME)
        iniciarTimer(from)
        const coletandoNomeAtendido = u.atendimentoParaTerceiro && !!u.nomeContato
        const audioReconfirmar = `${nomeCorrecaoTitular}. Está correto?`
        const telaReconfirmar = coletandoNomeAtendido
          ? `●●○○○○ 👤 Etapa 2 de 6 · *Nome*\n\n✅ O nome da pessoa atendida é *${nomeCorrecaoTitular}*.\n\nEstá correto? Se não estiver, é só me dizer o nome certo agora. Pode falar ou digitar. 🎙️`
          : `●●○○○○ 👤 Etapa 2 de 6 · *Nome*\n\n✅ Seu nome é *${nomeCorrecaoTitular}*.\n\nEstá correto? Se não estiver, é só me dizer seu nome correto agora. Pode falar ou digitar. 🎙️`
        if (!u.modoTexto) {
          try {
            const ogg = await gerarAudioAtendente(u.atendente, audioReconfirmar)
            await enviarAudio(from, urlAudioAtendente(ogg))
            await new Promise(r => setTimeout(r, 4000))
          } catch (e) { logErro("tts", "Falha áudio reconfirmar nome titular correcao explicita", e) }
        }
        return { texto: telaReconfirmar, opcoes: [{ id: "nome_confirmar", title: "✅ Sim, está certo" }] }
      }
      const nomeLimpoLivre = formatarNome(limparTextoSomenteLetras(text))
      if (ehNomeAparente(nomeLimpoLivre, text) === true) {
        u._nomeTemp = nomeLimpoLivre
        u._nomeTitularPendente = null
        setStage(u, STAGES.ACOLHIMENTO_CONFIRMA_NOME)
        iniciarTimer(from)
        const coletandoNomeAtendido = u.atendimentoParaTerceiro && !!u.nomeContato
        const audioReconfirmar = `${nomeLimpoLivre}. Está correto?`
        const telaReconfirmar = coletandoNomeAtendido
          ? `●●○○○○ 👤 Etapa 2 de 6 · *Nome*\n\n✅ O nome da pessoa atendida é *${nomeLimpoLivre}*.\n\nEstá correto? Se não estiver, é só me dizer o nome certo agora. Pode falar ou digitar. 🎙️`
          : `●●○○○○ 👤 Etapa 2 de 6 · *Nome*\n\n✅ Seu nome é *${nomeLimpoLivre}*.\n\nEstá correto? Se não estiver, é só me dizer seu nome correto agora. Pode falar ou digitar. 🎙️`
        if (!u.modoTexto) {
          try {
            const ogg = await gerarAudioAtendente(u.atendente, audioReconfirmar)
            await enviarAudio(from, urlAudioAtendente(ogg))
            await new Promise(r => setTimeout(r, 4000))
          } catch (e) { logErro("tts", "Falha áudio reconfirmar nome titular livre", e) }
        }
        return { texto: telaReconfirmar, opcoes: [{ id: "nome_confirmar", title: "✅ Sim, está certo" }] }
      }
    }
    iniciarTimer(from)
    return {
      texto: `●●○○○○ 👤 Etapa 2 de 6 · *Nome*\n\n✅ Entendi o nome *${u._nomeTemp || "informado"}*.\n\nComo você mencionou ${u._nomeTitularPendente?.label || "outra pessoa"}, preciso confirmar para não cadastrar errado:\n\nEsse é o seu nome ou o nome da pessoa atendida?\n\n_Se o nome estiver errado, é só me dizer o nome correto agora. 🎙️_`,
      opcoes: [
        { id: "nome_titular_contato", title: "🙋 Meu nome" },
        { id: "nome_titular_atendido", title: "👤 Pessoa atendida" }
      ]
    }
  }

  if (u.stage === STAGES.ACOLHIMENTO_CONFIRMA_WHATSAPP) {
    if (text === "whatsapp_sim" || text === "nc_meu") {
      u.whatsappVerificado = true
      u.telefoneEhDoCliente = !u.atendimentoParaTerceiro
      u.whatsappContato = from
      // se está em revalidação progressiva, retornar ao fluxo
      if (u._revalidandoCampos) {
        if (!Array.isArray(u._revalidaConfirmados)) u._revalidaConfirmados = []
        u._revalidaConfirmados.push("whatsapp")
        return await proximaConfirmacaoProgressiva(from, u)
      }
      // suprimirAudio=true: flowAcolhimentoConfirmaWhatsapp já enviou áudio nesta etapa
      return await flowAcolhimentoCidade(u, { from, suprimirAudio: true })
    }
    if (text === "whatsapp_nao" || text === "nc_outro") {
      // Para terceiro: número de origem não é do atendido → false.
      // Para si: ainda não sabemos o número definitivo, mantém null até confirmação.
      u.telefoneEhDoCliente = u.atendimentoParaTerceiro ? false : null
      setStage(u, STAGES.ACOLHIMENTO_CONFIRMA_WHATSAPP_OUTRO)
      iniciarTimer(from)

      if (!u.modoTexto) {
        try {
          const ogg = await gerarAudioAtendente(u.atendente,
            `Entendi! Se quiser usar outro número de WhatsApp, é só digitar ou falar o número com DDD agora. Se preferir continuar com este mesmo número, toque em Continuar assim.`)
          await enviarAudio(from, urlAudioAtendente(ogg))
          await new Promise(r => setTimeout(r, 4000))
        } catch (e) { logErro("tts", "Falha áudio outro número", e) }
      }

      return {
        texto: `●●●●○○ 📱 Etapa 4 de 6 · *WhatsApp*\n\n📱 Entendido! Se quiser usar outro número, é só digitar ou falar o número com DDD agora. Pode falar ou digitar. 🎙️\n\nSe preferir continuar com este número, toque em *Continuar assim*.`,
        opcoes: [
          { id: "wpp_continuar_assim", title: "✅ Continuar assim" }
        ]
      }
    }
    // Texto livre = usuário informou outro número diretamente nessa tela
    if (text && text !== "whatsapp_sim" && text !== "nc_meu" && text !== "whatsapp_nao" && text !== "nc_outro") {
      const telNorm = normalizarTelefone(text)
      if (telNorm && telNorm.replace(/\D/g, "").length >= 12) {
        // Para terceiro: número informado não é do atendido → false. Para si: é do próprio cliente → true.
        u.telefoneEhDoCliente = !u.atendimentoParaTerceiro
        // prepararConfirmacaoEntrada já envia o áudio único de confirmação do número
        return await prepararConfirmacaoEntrada(from, u, "telefone", telNorm, "coleta_tel_wpp_contato")
      }
      // Não parece número — trata como imprevisto
      const imprevistoWhatsapp = await tratarImprevistoPreAtendimento(from, u, u.stage, text)
      if (imprevistoWhatsapp) return imprevistoWhatsapp
    }
    iniciarTimer(from)
    return {
      texto: "●●●●○○ 📱 Etapa 4 de 6 · *WhatsApp*\n\nPor favor, confirme se este é o seu WhatsApp. Se não for, é só digitar ou falar o número correto com DDD agora. 🎙️",
      opcoes: [
        { id: "whatsapp_sim", title: "✅ Confirmar" }
      ]
    }
  }

  if (u.stage === STAGES.ACOLHIMENTO_CONFIRMA_WHATSAPP_OUTRO) {
    if (text === "wpp_informar_outro") {
      // Legado: se alguém ainda enviar esse payload, orienta a digitar o número agora
      iniciarTimer(from)
      if (!u.modoTexto) {
        try {
          const ogg = await gerarAudioAtendente(u.atendente, `Sem problema! Digite ou fale o número de WhatsApp com DDD agora.`)
          await enviarAudio(from, urlAudioAtendente(ogg))
          await new Promise(r => setTimeout(r, 3000))
        } catch (e) { logErro("tts", "Falha áudio orientar número legado", e) }
      }
      return { texto: `●●●●○○ 📱 Etapa 4 de 6 · *WhatsApp*\n\nDigite ou fale o número com DDD agora. Pode falar ou digitar. 🎙️`, opcoes: [{ id: "wpp_continuar_assim", title: "✅ Continuar assim" }] }
    }
    // Texto livre = número informado diretamente
    if (text && text !== "wpp_continuar_assim") {
      const telNorm = normalizarTelefone(text)
      if (telNorm && telNorm.replace(/\D/g, "").length >= 12) {
        // prepararConfirmacaoEntrada já envia o áudio único de confirmação do número
        return await prepararConfirmacaoEntrada(from, u, "telefone", telNorm, "coleta_tel_wpp_contato")
      }
      // Número inválido — orienta
      iniciarTimer(from)
      return { texto: `●●●●○○ 📱 Etapa 4 de 6 · *WhatsApp*\n\nNão consegui identificar o número. Por favor, informe com DDD. Pode falar ou digitar. 🎙️`, opcoes: [{ id: "wpp_continuar_assim", title: "✅ Continuar assim" }] }
    }
    if (text === "wpp_continuar_assim") {
      u.whatsappVerificado = true
      if (!u.whatsappContato) u.whatsappContato = from
      // Resolve telefoneEhDoCliente caso ainda esteja null (fluxo "para si" que disse não e voltou atrás)
      if (u.telefoneEhDoCliente === null || u.telefoneEhDoCliente === undefined) {
        u.telefoneEhDoCliente = !u.atendimentoParaTerceiro
      }
      if (u._corrigindoWhatsappConfirmacao) {
        delete u._corrigindoWhatsappConfirmacao
        return responderComTimer(from, await voltarParaConfirmacao(from, u))
      }
      if (u._revalidandoCampos) {
        if (!Array.isArray(u._revalidaConfirmados)) u._revalidaConfirmados = []
        u._revalidaConfirmados.push("whatsapp")
        return await proximaConfirmacaoProgressiva(from, u)
      }
      // suprimirAudio=true: o stage ACOLHIMENTO_CONFIRMA_WHATSAPP_OUTRO já enviou áudio
      return await flowAcolhimentoCidade(u, { from, suprimirAudio: true })
    }
    iniciarTimer(from)
    return { texto: `●●●●○○ 📱 Etapa 4 de 6 · *WhatsApp*\n\nSe quiser usar outro número, é só digitar ou falar com DDD agora. Se preferir continuar com este, toque em *Continuar assim*. 🎙️`, opcoes: [{ id: "wpp_continuar_assim", title: "✅ Continuar assim" }] }
  }

  if (u.stage === STAGES.ACOLHIMENTO_CIDADE && text) {
    if (text === "cidade_nenhuma_dessas") {
      delete u._cidadesMultiplas
      iniciarTimer(from)
      if (!u.modoTexto) {
        try {
          const ogg = await gerarAudioAtendente(u.atendente,
            "Tudo bem. Me diga novamente o nome da cidade junto com o estado, ou informe o CEP.")
          await enviarAudio(from, urlAudioAtendente(ogg))
          await new Promise(r => setTimeout(r, 3000))
        } catch (e) { logErro("tts", "Falha audio nenhuma cidade", e) }
      }
      return responderComTimer(from, {
        texto: `●●●●●○ 📍 Etapa 5 de 6 · *Cidade*\n\n🏙️ Tudo bem. Informe novamente a *cidade com o estado* ou o *CEP*.\n\nExemplos:\n• Condado, Pernambuco\n• 55940-000`,
        opcoes: null
      })
    }

    // negativa por voz na lista de cidades ambíguas
    if (Array.isArray(u._cidadesMultiplas) && !text.startsWith("cidade_multipla_") && !text.startsWith("cidade_confirmar") && !text.startsWith("cidade_corrigir")) {
      const negativas = ["nenhuma", "não é", "nao e", "nao é", "não e", "outra cidade", "não apareceu", "nao apareceu", "nenhuma dessas", "não encontrei", "nao encontrei", "é outra", "e outra", "não está", "nao esta", "outra"]
      const textoLower = text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      const ehNegativa = negativas.some(n => textoLower.includes(n.normalize("NFD").replace(/[\u0300-\u036f]/g, "")))
      if (ehNegativa || (ehAudio && textoLower.length > 2 && !u._cidadesMultiplas.some(c => textoLower.includes(c.cidade.toLowerCase().slice(0,4))))) {
        delete u._cidadesMultiplas
        const textoOrientacao = "Tudo bem 😊 Me diga novamente o nome da cidade junto com o estado. Por exemplo: *Presidente Kennedy, Espírito Santo*."
        if (!u.modoTexto && u.atendente) {
          try {
            const ogg = await gerarAudioAtendente(u.atendente, "Tudo bem. Me diga novamente o nome da cidade junto com o estado. Por exemplo: Presidente Kennedy, Espírito Santo.")
            await enviarAudio(from, urlAudioAtendente(ogg))
            await new Promise(r => setTimeout(r, 3000))
          } catch(e) { logErro("tts", "Falha áudio negativa cidade", e) }
        }
        return responderComTimer(from, { texto: textoOrientacao, opcoes: null })
      }
    }

    // selecionar cidade de lista homônima — formato "Cidade, UF" + áudio de confirmação
    if (text?.startsWith("cidade_multipla_") && Array.isArray(u._cidadesMultiplas)) {
      const idx = parseInt(text.replace("cidade_multipla_", ""), 10)
      const escolhida = u._cidadesMultiplas[idx]
      if (escolhida) {
        u._cidadeTemp = escolhida.cidade
        u._ufTemp = escolhida.uf
        u._regiaoTemp = escolhida.regiao
        delete u._cidadesMultiplas
        setStage(u, STAGES.ACOLHIMENTO_CIDADE)
        iniciarTimer(from)
        // áudio de confirmação ao digitar cidade e selecionar da lista
        if (!u.modoTexto) await enviarAudioConfirmacaoLocalizacao(from, u.atendente, escolhida.cidade, escolhida.uf || "UF não identificada", escolhida.regiao || "não identificada", "cidade")
        // formato "Cidade, UF" com vírgula, não barra
        return responderComTimer(from, {
          texto: `●●●●●○ 📍 Etapa 5 de 6 · *Cidade*\n\n✅ Localizei: *${escolhida.cidade}${escolhida.uf ? `, ${escolhida.uf}` : ""}* (${escolhida.regiao || "não identificada"}). Está correto? Se não estiver, é só me dizer a cidade correta agora. Pode falar ou digitar. 🎙️`,
          opcoes: [
            { id: "cidade_confirmar", title: "✅ Confirmar cidade" }
          ]
        })
      }
    }
    if (text === "cidade_confirmar" && (u._cidadeAudioTemp || u._cidadeTemp)) {
      u.cidade = u._cidadeAudioTemp || u._cidadeTemp
      u.uf = u._ufAudioTemp || u._ufTemp
      u.regiao = u._regiaoAudioTemp || u._regiaoTemp
      delete u._cidadeAudioTemp
      delete u._ufAudioTemp
      delete u._regiaoAudioTemp
      delete u._cidadeTemp
      delete u._ufTemp
      delete u._regiaoTemp
      await sincronizarContatoNegocioHubSpot(u)
      if (u._revalidandoCampos) {
        if (!Array.isArray(u._revalidaConfirmados)) u._revalidaConfirmados = []
        u._revalidaConfirmados.push("cidade")
        return await proximaConfirmacaoProgressiva(from, u)
      }
      return await respostaAposCidade(from, u)
    }
    if (text === "cidade_corrigir") {
      // Legado: orienta a dizer a cidade correta agora, sem trocar de tela
      delete u._cidadeAudioTemp
      delete u._ufAudioTemp
      delete u._regiaoAudioTemp
      delete u._cidadeTemp
      delete u._ufTemp
      delete u._regiaoTemp
      iniciarTimer(from)
      if (!u.modoTexto) {
        try {
          const _nomeTerceiroCidade = u.atendimentoParaTerceiro && u.nome ? u.nome.split(" ")[0] : null
          const _textoCidadeCorrigir = _nomeTerceiroCidade
            ? `Sem problema! Me diga a cidade onde ${_nomeTerceiroCidade} mora agora. Pode falar ou digitar.`
            : `Sem problema! Me diga sua cidade agora. Pode falar ou digitar.`
          const ogg = await gerarAudioAtendente(u.atendente, _textoCidadeCorrigir)
          await enviarAudio(from, urlAudioAtendente(ogg))
          await new Promise(r => setTimeout(r, 3500))
        } catch (e) { logErro("tts", "Falha áudio corrigir cidade legado", e) }
      }
      const _nomeTerceiroCidadeTela = u.atendimentoParaTerceiro && u.nome ? u.nome.split(" ")[0] : null
      return {
        texto: `●●●●●○ 📍 Etapa 5 de 6 · *Cidade*\n\nSem problema! ${_nomeTerceiroCidadeTela ? `Me diga a cidade onde *${_nomeTerceiroCidadeTela}* mora` : "Me diga sua cidade"} agora. Pode falar ou digitar. 🎙️`,
        opcoes: null
      }
    }
    if (text === "cidade_sim" && u._cidadeTemp) {
      // Confirmar cidade do CEP
      u.cidade = u._cidadeTemp
      u.uf = u._ufTemp
      u.regiao = u._regiaoTemp
      // Limpar temporários
      delete u._cidadeTemp
      delete u._ufTemp
      delete u._regiaoTemp
      await sincronizarContatoNegocioHubSpot(u)
      if (u._revalidandoCampos) {
        if (!Array.isArray(u._revalidaConfirmados)) u._revalidaConfirmados = []
        u._revalidaConfirmados.push("cidade")
        return await proximaConfirmacaoProgressiva(from, u)
      }
      return await respostaAposCidade(from, u)
    }
    if (text === "cidade_nao" || text === "tentar_cep" || text === "informar_cidade") {
      // Limpar temporários e pedir novamente
      delete u._cidadeTemp
      delete u._ufTemp
      delete u._regiaoTemp
      iniciarTimer(from)
      if (u.modoTexto === false) await enviarAudioPedidoCidade(from, u.atendente)
      return {
        texto: `●●●●●○ 📍 Etapa 5 de 6 · *Cidade*\n\nTudo bem! Em qual *cidade* você mora?\n\nSe preferir, pode informar o *CEP* também.`,
        opcoes: null
      }
    }
    // Tenta buscar cidade/CEP primeiro — evita que a IA intercepte nomes de cidades
    // válidos como "Condado", "União", "Graça" etc. antes de qualquer busca.
    // "Buscando sua cidade..." só é enviado se a busca realmente for executada.
    // O imprevisto é chamado apenas se a busca não encontrar nada.
    const cepRegex = /^\d{5}-?\d{3}$/
    const ehCep = cepRegex.test(text.replace(/\D/g, ""))
    if (ehCep) {
      // Processar CEP
      await enviar(from, "🔍 Buscando sua cidade...", null, false)
      try {
        const cepLimpo = text.replace(/\D/g, "")
        const infoCEP = await buscarPorCEP(cepLimpo)
        // Armazenar temporariamente para confirmação
        u._cidadeTemp = infoCEP.cidade
        u._ufTemp = infoCEP.uf
        u._regiaoTemp = infoCEP.regiao
        // Confirmar localização encontrada
        setStage(u, STAGES.ACOLHIMENTO_CIDADE)
        iniciarTimer(from)
        if (!u.modoTexto) await enviarAudioConfirmacaoLocalizacao(from, u.atendente, infoCEP.cidade, infoCEP.uf, infoCEP.regiao, "cep")
        return {
          // formato padronizado com vírgula
          texto: `●●●●●○ 📍 Etapa 5 de 6 · *Cidade*\n\n✅ Localizei: *${infoCEP.cidade}, ${infoCEP.uf}* (${infoCEP.regiao}). Está correto?`,
          opcoes: [
            { id: "cidade_sim", title: "✅ Sim, correto" },
            { id: "cidade_nao", title: "❌ Não, informar outra" }
          ]
        }
      } catch (error) {
        // CEP inválido ou erro na API
        iniciarTimer(from)
        return await responderTelaComAudio(
          from,
          u,
          {
            texto: `●●●●●○ 📍 Etapa 5 de 6 · *Cidade*\n\n📍 Não consegui localizar este CEP.\n\nTente novamente ou informe a cidade diretamente.`,
            opcoes: [
              { id: "tentar_cep", title: "🔄 Tentar outro CEP" },
              { id: "informar_cidade", title: "🏙️ Informar cidade" }
            ]
          },
          "Não consegui localizar este CEP. Você pode tentar outro CEP ou informar a cidade diretamente.",
          "cep nao localizado"
        )
      }
    } else {
      // Processar como cidade
      await enviar(from, "🔍 Buscando sua cidade...", null, false)
      const localizacao = await buscarCidadePorNome(text)
      // cidade homônima em mais de um estado — usar formato "Cidade, Estado"
      if (localizacao?.multiplos && localizacao.opcoes?.length > 1) {
        u._cidadesMultiplas = localizacao.opcoes
        iniciarTimer(from)
        // texto e áudio padronizados - "Cidade, Estado por extenso"
        if (!u.modoTexto) {
          try {
            const nomesAudio = localizacao.opcoes.slice(0, 4)
              .map(op => `${op.cidade}, ${estadoPorExtenso(op.uf) || op.uf}`).join("; ")
            const ogg = await gerarAudioAtendente(u.atendente,
              `Encontrei ${numeroPorExtenso(localizacao.opcoes.length, "feminino")} cidades com esse nome. Por favor, selecione uma das opções: ${nomesAudio}. Se a sua cidade não estiver entre elas, diga o nome da cidade junto com o estado agora.`)
            await enviarAudio(from, urlAudioAtendente(ogg))
            await new Promise(r => setTimeout(r, 4000))
          } catch (e) { logErro("tts", "Falha áudio cidades múltiplas digitadas", e) }
        }
        return responderComTimer(from, {
          texto: `●●●●●○ 📍 Etapa 5 de 6 · *Cidade*\n\n🔍 Encontrei *${localizacao.opcoes.length} cidades* com esse nome. Qual é a sua?\n\n_Se a sua cidade não aparecer nas opções, diga ou digite o nome com o estado._`,
          // títulos curtos para caber no botão do WhatsApp
          opcoes: [
            ...localizacao.opcoes.slice(0, 4).map((op, i) => ({
              id: `cidade_multipla_${i}`,
              title: abreviarCidadeBotao(op.cidade, op.uf)
            }))
          ]
        })
      }
      if (localizacao?.cidade && localizacao.cidade.length >= 2) {
        u._cidadeTemp = localizacao.cidade
        u._ufTemp = localizacao.uf
        u._regiaoTemp = localizacao.regiao
        setStage(u, STAGES.ACOLHIMENTO_CIDADE)
        iniciarTimer(from)
        // áudio de confirmação ao digitar cidade (modo voz)
        if (!u.modoTexto) await enviarAudioConfirmacaoLocalizacao(from, u.atendente, localizacao.cidade, localizacao.uf || "UF não identificada", localizacao.regiao || "não identificada", "cidade")
        return {
          texto: `●●●●●○ 📍 Etapa 5 de 6 · *Cidade*\n\n✅ Localizei: *${localizacao.cidade}${localizacao.uf ? `, ${localizacao.uf}` : ""}* (${localizacao.regiao || "não identificada"}). Está correto? Se não estiver, é só me dizer a cidade correta agora. Pode falar ou digitar. 🎙️`,
          opcoes: [
            { id: "cidade_confirmar", title: "✅ Confirmar cidade" }
          ]
        }
      }
      // Cidade não encontrada — só agora tenta o imprevisto (mensagem fora de contexto)
      const imprevistoCidadeNaoEncontrada = await tratarImprevistoPreAtendimento(from, u, u.stage, text)
      if (imprevistoCidadeNaoEncontrada) return imprevistoCidadeNaoEncontrada
      if (!u.modoTexto) {
        try {
          const ogg = await gerarAudioAtendente(u.atendente,
            `Não consegui encontrar essa cidade. Por favor, tente digitar o nome da cidade novamente ou informe o CEP com oito dígitos.`)
          await enviarAudio(from, urlAudioAtendente(ogg))
          await new Promise(r => setTimeout(r, 3500))
        } catch (e) { logErro("tts", "Falha áudio cidade não encontrada", e) }
      }
      return responderComTimer(from, { texto: `●●●●●○ 📍 Etapa 5 de 6 · *Cidade*\n\n📍 Não consegui encontrar essa cidade. Tente novamente ou informe o *CEP*.`, opcoes: null })
    }
  }

  if (u.stage === STAGES.ESCOLHA_AREA) {
    u.area = null
    u._areaDetectada = null
    return await iniciarFluxoRelatoLivre(from, u, { boasVindas: false })
  }

  if (u.stage === STAGES.ENTENDIMENTO_INICIAL && (text || ehAudio)) {
    let relato = text
    if (ehAudio) {
  await enviar(from, "👂 Estou ouvindo seu áudio...", null, false)
      const mediaId = msgObj?.audio?.id || msgObj?.voice?.id || msgObj?.[tipo]?.id
      if (!mediaId) return responderComTimer(from, { texto: "Não consegui processar o áudio. Tente novamente ou envie por texto.", opcoes: null })
      const midia = await baixarMidia(mediaId)
      if (!midia) return responderComTimer(from, { texto: "Não consegui processar o áudio. Tente novamente ou envie por texto.", opcoes: null })
      const transcricao = await transcrever(midia.buffer, midia.mimeType, { origem: "entendimento_inicial" })
      if (!transcricao) return responderComTimer(from, { texto: "Não consegui ouvir esse áudio com clareza. Pode mandar de novo ou escrever em poucas palavras?", opcoes: null })
      relato = transcricao
    }

    if (!ehAudio && text) {
      let classificacaoEntendimento = await classificarEntradaPreAtendimento(u.stage, text, { usarIA: false })
      if (classificacaoEntendimento.tipo === "terceiro") {
        return await responderImprevistoPreAtendimento(from, u, u.stage, "terceiro", text)
      }
      if (classificacaoEntendimento.tipo === "advogado_direto") {
        return await responderImprevistoPreAtendimento(from, u, u.stage, "advogado_direto", text)
      }
      if (classificacaoEntendimento.tipo === "duvida") {
        return await responderImprevistoPreAtendimento(from, u, u.stage, "duvida", text)
      }
      if (text.replace(/\s+/g, "").length < 20) {
        iniciarTimer(from)
        return await responderTelaComAudio(
          from,
          u,
          {
            texto: `💬 Entendi. Para preparar seu caso direitinho, me conte um pouco mais sobre o que aconteceu.\n\nPode escrever do seu jeito, em frases simples.`,
            opcoes: null
          },
          "Entendi. Para preparar seu caso direitinho, me conte um pouco mais sobre o que aconteceu. Pode escrever do seu jeito, em frases simples.",
          "situacao curta"
        )
      }
      classificacaoEntendimento = await classificarEntradaPreAtendimento(u.stage, text)
      if (classificacaoEntendimento.tipo === "terceiro") {
        return await responderImprevistoPreAtendimento(from, u, u.stage, "terceiro", text)
      }
      if (classificacaoEntendimento.tipo === "advogado_direto") {
        return await responderImprevistoPreAtendimento(from, u, u.stage, "advogado_direto", text)
      }
      if (classificacaoEntendimento.tipo === "duvida") {
        return await responderImprevistoPreAtendimento(from, u, u.stage, "duvida", text)
      }
    }

    u._audioCanalTranscricao = normalizarTextoCRM(relato)
    u.descricao = u._audioCanalTranscricao
    const classificacao = await classificarAreaAudio(u._audioCanalTranscricao)
    aplicarClassificacaoJuridica(u, classificacao)
    iniciarTimer(from)
    return await flowAssessoriaInicial(u, { from, origem: ehAudio ? "audio" : "texto" })
  }

  if (u.stage === STAGES.DIRECIONAMENTO) {
    if (u.numeroCaso) {
      setStage(u, STAGES.CLIENTE)
      iniciarTimer(from)
      return await menuClienteComAudio(from, u)
    }
    if (u._audioCanalTranscricao || u.descricao) {
      setStage(u, STAGES.AUDIO_CONFIRMAR_DADOS)
      iniciarTimer(from)
      return await telaConfirmarDadosAudio(from, u)
    }
    return await iniciarFluxoRelatoLivre(from, u, { boasVindas: false })
  }
  // Fim novo fluxo humanizado

  if (text === "m_encerrar") {
    if (u.numeroCaso) return await encerrarClienteCadastrado(from, u)
    return encerrarComCaptura(from, u)
  }

  if (!ehAudio && !ehDoc && text && u.stage !== STAGES.CLIENTE && u.lastPerguntaPayload?.opcoes?.length && !stageAceitaTextoLivre(u.stage)) {
    const opcoesValidas = new Set((u.lastPerguntaPayload.opcoes || []).map(o => o.id))
    if (!opcoesValidas.has(text)) {
      if (u.stage && u.stage !== STAGES.CLIENTE) {
        return await responderTelaComAudio(
          from,
          u,
          {
            texto: `🤔 Não entendi. Escolha uma opção do menu 👇\n\n${u.lastPerguntaPayload.texto}`,
            opcoes: u.lastPerguntaPayload.opcoes
          },
          "Não entendi. Por favor, escolha uma das opções do menu para continuar.",
          "opcao invalida"
        )
      }
      const respLivre = ehMensagemEntradaGlobal(text) ? null : (GROQ_KEY ? await respostaIA(u, text) : null)
      return await responderTelaComAudio(
        from,
        u,
        {
          texto: `${respLivre ? respLivre + "\n\n" : ""}👍 Entendi. Vamos continuar de onde paramos.\n\n${u.lastPerguntaPayload.texto}`,
          opcoes: u.lastPerguntaPayload.opcoes
        },
        "Entendi. Vamos continuar de onde paramos. Escolha uma das opções da tela para seguir.",
        "retomar pergunta"
      )
    }
  }

  if (u.stage === STAGES.CONFIRMAR_ENTRADA) {
    if (text === "entrada_corrigir") {
      // Legado: se alguém ainda enviar esse payload (ex: mensagem antiga), orienta a dizer a correção
      iniciarTimer(from)
      if (!u.modoTexto) {
        try {
          const ogg = await gerarAudioAtendente(u.atendente, "Sem problema. Me diga a informação correta agora, pode falar ou digitar.")
          await enviarAudio(from, urlAudioAtendente(ogg))
          await new Promise(r => setTimeout(r, 3000))
        } catch (e) { logErro("tts", "Falha áudio orientar correção entrada", e) }
      }
      return { texto: "Sem problema! Me diga a informação correta agora. Pode falar ou digitar. 🎙️", opcoes: null }
    }
    // Texto livre = informação corrigida diretamente
    if (text && text !== "entrada_ok" && text !== "entrada_corrigir") {
      const tipo = u._entradaPendenteTipo
      const origem = u._entradaPendenteOrigem
      if (tipo === "nome") {
        const nomeLimpo = extrairNomeDaCorrecaoExplicita(text) || formatarNome(limparTextoSomenteLetras(text))
        if (ehNomeAparente(nomeLimpo, nomeLimpo !== formatarNome(limparTextoSomenteLetras(text)) ? nomeLimpo : text) === true) {
          u._entradaPendenteValor = nomeLimpo
          const barra = "●●○○○○ 👤 Etapa 2 de 6 · *Nome*\n\n"
          if (!u.modoTexto) {
            try {
              const ogg = await gerarAudioAtendente(u.atendente, `Entendi! O nome é ${nomeLimpo}. Está correto? Se não estiver, me diga o nome correto agora.`)
              await enviarAudio(from, urlAudioAtendente(ogg))
              await new Promise(r => setTimeout(r, 4000))
            } catch (e) { logErro("tts", "Falha áudio reconfirmar nome entrada", e) }
          }
          return {
            texto: `${barra}Você informou: *${nomeLimpo}*\nEstá correto? Se não estiver, é só me dizer o nome correto agora. Pode falar ou digitar. 🎙️`,
            opcoes: [{ id: "entrada_ok", title: "✅ Confirmar" }]
          }
        }
      } else if (tipo === "telefone") {
        const telNorm = normalizarTelefone(text)
        if (telNorm && telNorm.replace(/\D/g, "").length >= 12) {
          u._entradaPendenteValor = telNorm
          const label = formatarTelefoneExibicao(telNorm)
          if (!u.modoTexto) {
            try {
              const ogg = await gerarAudioAtendente(u.atendente, `Entendi! O número é ${label}. Está correto? Se não estiver, me diga o número correto agora.`)
              await enviarAudio(from, urlAudioAtendente(ogg))
              await new Promise(r => setTimeout(r, 4000))
            } catch (e) { logErro("tts", "Falha áudio reconfirmar telefone entrada", e) }
          }
          return {
            texto: `●●●●○○ 📱 Etapa 4 de 6 · *WhatsApp*\n\nVocê informou: *${label}*\nEstá correto? Se não estiver, é só me dizer o número correto agora. Pode falar ou digitar. 🎙️`,
            opcoes: [{ id: "entrada_ok", title: "✅ Confirmar" }]
          }
        }
      } else if (tipo === "cidade") {
        // Para cidade, redireciona para o handler completo de cidade (com IBGE, CEP etc.)
        limparEntradaPendente(u)
        setStage(u, STAGES.ACOLHIMENTO_CIDADE)
        iniciarTimer(from)
        return await processarInterno(from, u.nomeWA || "", text, { type: "text", text: { body: text } }, u)
      }
      // Não conseguiu extrair valor válido — orienta
      iniciarTimer(from)
      return { texto: "Não consegui identificar a informação. Por favor, me diga novamente. Pode falar ou digitar. 🎙️", opcoes: null }
    }
    if (text === "entrada_ok") {
      const origem = u._entradaPendenteOrigem
      const tipo = u._entradaPendenteTipo
      const valor = u._entradaPendenteValor
      limparEntradaPendente(u)
      if (tipo === "nome") {
        u.nome = valor
        u.nomeConfirmado = true
        if (!(u._novoCasoParaTerceiro && !u.whatsappContato)) {
          await sincronizarContatoNegocioHubSpot(u)
        }
        if (origem === "coleta_tel_outro") {
          setStage(u, "coleta_tel_wpp"); iniciarTimer(from)
          const primeiroNome = primeiroNomeCliente(u) || "você"
          await enviarAudioModoVoz(from, u, `Agora preciso do WhatsApp com DDD de ${primeiroNome}. Pode falar em áudio ou digitar.`, "novo caso terceiro whatsapp")
          return { texto: `●●●●○○ 📱 Etapa 4 de 6 · *WhatsApp*\n\nQual é o WhatsApp com DDD de *${primeiroNome}* para contato da equipe?`, opcoes: null }
        }
        iniciarTimer(from)
        return await flowAcolhimentoConfirmaWhatsapp(u, { from })
      }
      if (tipo === "telefone") {
        u.whatsappContato = normalizarNumeroWhatsAppEnvio(valor)
        if (origem === "coleta_tel_wpp_contato") {
          // Se nome já foi coletado (fluxo de terceiro via assessoria), avança para cidade
          if (u.nomeConfirmado && u.nome) {
            u.whatsappVerificado = true
            // Para si: número alternativo informado ainda é do cliente → true. Para terceiro → false.
            u.telefoneEhDoCliente = !u.atendimentoParaTerceiro
            iniciarTimer(from)
            // suprimirAudio=true: prepararConfirmacaoEntrada já enviou áudio de confirmação
            return await flowAcolhimentoCidade(u, { from, suprimirAudio: true })
          }
          setStage(u, "coleta_nome"); iniciarTimer(from)
          return { texto: "●●○○○○ 👤 Etapa 2 de 6 · *Nome*\n\nQual é o *nome completo* da pessoa que será atendida?", opcoes: null }
        }
        if (origem === "coleta_tel_wpp") {
          u.whatsappVerificado = true
          u.telefoneEhDoCliente = u._novoCasoParaTerceiro ? false : true
          if (u._corrigindoWhatsappConfirmacao) {
            delete u._corrigindoWhatsappConfirmacao
            return await voltarParaConfirmacao(from, u)
          }
          if (u._novoCasoParaTerceiro) {
            setStage(u, STAGES.ACOLHIMENTO_CIDADE); iniciarTimer(from)
            if (u.modoTexto === false) {
              const nomeTerceiro = u.nome ? u.nome.split(" ")[0] : null
              await enviarAudioPedidoCidade(from, u.atendente, { nomeTerceiro })
            }
            return {
              texto: `●●●●●○ 📍 Etapa 5 de 6 · *Cidade*\n\nNúmero registrado. ✅\n\nAgora, em qual *cidade* a pessoa atendida mora?\n\nSe preferir, pode informar o *CEP* também.`,
              opcoes: null
            }
          }
          if (u._novoCasoDeCliente) {
            const relatoPendente = await aproveitarRelatoAudioClienteNovoCaso(from, u)
            if (relatoPendente) return relatoPendente
            setStage(u, STAGES.AUDIO_AGUARDANDO); iniciarTimer(from)
            await enviarAudioModoVoz(from, u, "Número registrado. Agora me conte a nova situação. Pode falar em áudio ou digitar.", "novo caso terceiro relato")
            return {
              texto: `Número registrado. ✅\n\nAgora me conte a nova situação. Pode falar em áudio ou digitar.`,
              opcoes: null
            }
          }
          setStage(u, STAGES.ACOLHIMENTO_CIDADE); iniciarTimer(from)
          if (u.modoTexto === false) await enviarAudioPedidoCidade(from, u.atendente)
          return {
            texto: `●●●●●○ 📍 Etapa 5 de 6 · *Cidade*\n\nÓtimo! Número registrado. ✅\n\nAgora, em qual *cidade* você mora?\n\nSe preferir, pode informar o *CEP* também.`,
            opcoes: null
          }
        }
        iniciarTimer(from)
        return respostaRecomecoMenuPrincipal(u)
      }
      if (tipo === "cidade") {
        u.cidade = valor
        await sincronizarContatoNegocioHubSpot(u)
        if (["coleta_cidade", "coleta_cidade_regiao", "__coleta_cidade_legado__"].includes(origem)) {
          iniciarTimer(from)
          if (u.descricao || u._audioCanalTranscricao) {
            setStage(u, STAGES.AUDIO_CONFIRMAR_DADOS)
            return await telaConfirmarDadosAudio(from, u)
          }
          return await iniciarFluxoRelatoLivre(from, u, { boasVindas: false })
        }
        return await flowAcolhimentoConfirmaWhatsapp(u, { from })
      }
    }
    // Fallback genérico — reapresenta a tela de confirmação
    iniciarTimer(from)
    return {
      texto: "Confirme a informação ou me diga a correção agora. Pode falar ou digitar. 🎙️",
      opcoes: [{ id: "entrada_ok", title: "✅ Confirmar" }]
    }
  }

  // NOVO CASO CONFIRMA — verificar se o telefone é do cliente
  if (u.stage === "novo_caso_confirma") {
    if (text === "m_inicio") {
      const menuAnterior = await voltarMenuCasoAnteriorCliente(from, u)
      if (menuAnterior) return menuAnterior
      setStage(u, STAGES.CLIENTE)
      iniciarTimer(from)
      return await menuClienteComAudio(from, u)
    }
    if (text === "nc_meu") {
      u._novoCasoParaTerceiro = false
      u.atendimentoParaTerceiro = false
      u.nomeContato = null
      u.whatsappVerificado = true
      u.telefoneEhDoCliente = true
      u.whatsappContato = from
      u.cidade = u._cidadeClienteAnterior || u.cidade
      u.uf = u._ufClienteAnterior || u.uf
      u.regiao = u._regiaoClienteAnterior || u.regiao
      delete u._cidadeClienteAnterior
      delete u._ufClienteAnterior
      delete u._regiaoClienteAnterior
      const relatoPendente = await aproveitarRelatoAudioClienteNovoCaso(from, u)
      if (relatoPendente) return relatoPendente
      setStage(u, STAGES.AUDIO_AGUARDANDO); iniciarTimer(from)
      await enviarAudioModoVoz(from, u, "Ótimo. Me conte a nova situação. Pode falar em áudio ou digitar.", "novo caso relato")
      if (process.env.IMAGEM_RELATO_URL) {
        await enviarImagemWhatsApp(from, process.env.IMAGEM_RELATO_URL, `➕ *Novo caso*\n\nÓtimo! Vamos abrir um novo caso. 😊\n\n📋 Me conte a nova situação com detalhes.\n\nPode falar em áudio 🎙️ ou digitar ✍️, do jeito que preferir.`, null)
        return { texto: null, opcoes: null }
      }
      return {
        texto: `➕ *Novo caso*\n\nÓtimo! Vamos abrir um novo caso. 😊\n\n📋 Me conte a nova situação com detalhes.\n\nPode falar em áudio 🎙️ ou digitar ✍️, do jeito que preferir.`,
        opcoes: null
      }
    }
    if (text === "nc_outro") {
      delete u._cidadeClienteAnterior
      delete u._ufClienteAnterior
      delete u._regiaoClienteAnterior
      const nomeQuemAbre = u._casoAnteriorCliente?.nome || u.nomeContato || null
      u._novoCasoParaTerceiro = true
      u.atendimentoParaTerceiro = true
      u.nomeContato = nomeQuemAbre
      u.relacaoComAtendido = u.relacaoComAtendido || "terceiro"
      u.papelContato = "indicante"
      u.whatsappVerificado = false
      u.telefoneEhDoCliente = false
      u.whatsappContato = null
      u.nome = null
      u.nomeConfirmado = false
      u.regiao = null
      u.cidade = null
      u.uf = null
      setStage(u, STAGES.AUDIO_AGUARDANDO); iniciarTimer(from)
      await enviarAudioModoVoz(from, u, "Tudo bem. Vamos abrir um atendimento para outra pessoa. Primeiro, me conte a situação dela. Depois eu peço os dados da pessoa que será atendida. Pode falar em áudio ou digitar.", "novo caso terceiro relato")
      const textoRelatoTerceiro = `➕ *Novo caso · Atendimento para outra pessoa*\n\n📝 Primeiro, me conte a situação dela.\n\nDepois eu peço os dados da pessoa que será atendida.\n\n🎙️ Pode falar em áudio ou digitar.`
      if (process.env.IMAGEM_RELATO_URL) {
        const enviada = await enviarImagemWhatsApp(from, process.env.IMAGEM_RELATO_URL, textoRelatoTerceiro, null)
        if (enviada) return { texto: null, opcoes: null }
      }
      return {
        texto: textoRelatoTerceiro,
        opcoes: null
      }
    }
  }
  if (u.stage === "coleta_tel_outro" && text) {
    const nomeLimpo = extrairNomeDaCorrecaoExplicita(text) || formatarNome(limparTextoSomenteLetras(text))
    const validacaoTelOutro = nomeLimpo ? ehNomeAparente(nomeLimpo, text) : false
    if (!nomeLimpo || validacaoTelOutro === false) return responderComTimer(from, { texto: "Informe um nome válido usando apenas letras e espaços.", opcoes: null })
    if (validacaoTelOutro === "incompleto") return responderComTimer(from, { texto: "Preciso do nome completo da pessoa atendida. Por favor, informe também o sobrenome.", opcoes: null })
    return await prepararConfirmacaoEntrada(from, u, "nome", nomeLimpo, "coleta_tel_outro")
  }
  if (u.stage === "coleta_tel_wpp" && text) {
    let telefone = text.replace(/\D/g, "")
    // Normalização inteligente: aceita números sem DDD ou sem nono dígito
    const dddFrom = from.replace(/\D/g, "").slice(2, 4) || "81"
    // Sem DDD: 8 ou 9 dígitos ? adiciona DDD do from
    if (telefone.length === 8) telefone = dddFrom + "9" + telefone
    else if (telefone.length === 9) telefone = dddFrom + telefone
    // Com DDD mas sem nono dígito: 10 dígitos ? adiciona nono
    else if (telefone.length === 10) telefone = telefone.slice(0, 2) + "9" + telefone.slice(2)
    // Com DDI 55: 13 dígitos ? remove DDI
    else if (telefone.length === 13 && telefone.startsWith("55")) telefone = telefone.slice(2)
    else if (telefone.length === 12 && telefone.startsWith("55")) telefone = telefone.slice(2, 4) + "9" + telefone.slice(4)
    if (telefone.length !== 11) return responderComTimer(from, { texto: "Não consegui identificar o número. Por favor, informe com DDD. Exemplo: DDD 9 0000-0000.", opcoes: null })
    let digTel = telefone
    const labelTel = `(${digTel.slice(0,2)}) ${digTel.slice(2,3)} ${digTel.slice(3,7)}-${digTel.slice(7,11)}`
    u._entradaPendenteTipo = "telefone"
    u._entradaPendenteValor = telefone
    u._entradaPendenteOrigem = "coleta_tel_wpp"
    setStage(u, STAGES.CONFIRMAR_ENTRADA)
    iniciarTimer(from)
    try {
      const digAudio = digTel.split("").join(" ")
      const ogg = await gerarAudioAtendente(u.atendente,
        `O número informado foi ${digAudio}. Está correto? Se não estiver, me diga o número correto agora, pode falar ou digitar.`)
      await enviarAudio(from, urlAudioAtendente(ogg))
      await new Promise(r => setTimeout(r, 3500))
    } catch (e) { logErro("tts", "Falha áudio confirmar telefone digitado", e) }
    return {
      texto: `●●●●○○ 📱 Etapa 4 de 6 · *WhatsApp*\n\nVocê informou: *${labelTel}*\n\nEstá correto? Se não estiver, é só me dizer o número correto agora. Pode falar ou digitar. 🎙️`,
      opcoes: [
      { id: "entrada_ok", title: "✅ Confirmar" }
      ]
    }
  }

  if (!u.numeroCaso && ehStageFluxoAntigo(u.stage)) {
    logDebug(`[LEGADO_GUARDA_COLETA] ${u.stage} -> ${STAGES.AUDIO_AGUARDANDO} | USER: ${u._numero || "-"}`)
    return await iniciarFluxoRelatoLivre(from, u, { boasVindas: false })
  }

  // COLETA
  if (u.stage === "coleta_nome" && text) {
    const nomeLimpo = extrairNomeDaCorrecaoExplicita(text) || formatarNome(limparTextoSomenteLetras(text))
    const validacaoColetaNome = nomeLimpo ? ehNomeAparente(nomeLimpo, text) : false
    if (!nomeLimpo || validacaoColetaNome === false) return responderComTimer(from, { texto: "Informe um nome válido usando apenas letras e espaços.", opcoes: null })
    if (validacaoColetaNome === "incompleto") return responderComTimer(from, { texto: "Preciso do nome completo. Por favor, informe também o sobrenome.", opcoes: null })
    return await prepararConfirmacaoEntrada(from, u, "nome", nomeLimpo, "coleta_nome")
  }
  if (u.stage === "coleta_regiao") {
    if (!REGIOES[text]) { iniciarTimer(from); return telaRegioes() }
    u._regiao = text; u.regiao = REGIOES[text].label; setStage(u, "coleta_uf"); iniciarTimer(from)
    return telaUFsRegiao(text)
  }
  if (u.stage === "coleta_uf") {
    const val = UF_MAP[text]
    if (!val) { iniciarTimer(from); return telaUFsRegiao(u._regiao || "reg_n") }
    u.uf = val; setStage(u, "coleta_cidade_regiao"); iniciarTimer(from)
    return { texto: "●●●●●○ 📍 Etapa 5 de 6 · *Cidade*\n\nDigite a cidade onde você mora", opcoes: null }
  }
  if (u.stage === "coleta_cidade_regiao" && text) {
    const cidadeLimpa = formatarCidade(limparTextoSomenteLetras(text))
    if (!cidadeLimpa || cidadeLimpa.length < 2) return responderComTimer(from, { texto: "Informe uma cidade válida usando apenas letras e espaços.", opcoes: null })
    return await prepararConfirmacaoEntrada(from, u, "cidade", cidadeLimpa, "coleta_cidade_regiao")
  }
  if (u.stage === "coleta_contrib_regiao_v2") {
    const m = { col_c1: "Nunca", col_c2: "Pouco tempo", col_c3: "Mais de 1 ano", col_c4: "Muitos anos" }
    if (!m[text]) { iniciarTimer(from); return { texto: "Selecione uma opção:", opcoes: Object.entries(m).map(([id, title]) => ({ id, title })) } }
    u.contribuicao = m[text]; setStage(u, "coleta_benef"); iniciarTimer(from)
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
    return { texto: "●●●●●○ 📝 Etapa 5 de 6 · *Descrição*\n\n📝 *Me explique o que está acontecendo.*\n\nQuanto mais detalhes, melhor! 😊\n\n🎙️ Pode *digitar* ou *enviar um áudio* — escolha como preferir.\n\n💡 Se for áudio, fique à vontade para explicar com calma. Tenho todo o tempo do mundo!", opcoes: null }
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
      texto: "Não consegui ouvir esse áudio com clareza. Toque em *Corrigir* para enviar outro áudio ou escreva a situação em poucas palavras.",
      opcoes: [
      { id: "desc_corrigir", title: "✏️ Corrigir" }
      ]
    }
  }
  if (u.stage === "coleta_contrib_regiao") {
    const m = { col_c1: "Nunca", col_c2: "Pouco tempo", col_c3: "Mais de 1 ano", col_c4: "Muitos anos" }
    if (!m[text]) { iniciarTimer(from); return { texto: "Selecione uma opção:", opcoes: Object.entries(m).map(([id, title]) => ({ id, title })) } }
    u.contribuicao = m[text]; setStage(u, "coleta_benef"); iniciarTimer(from)
    return { texto: "🏥 Você já recebe algum benefício do INSS?", opcoes: [{ id: "col_b1", title: "✅ Sim, recebo" }, { id: "col_b2", title: "❌ Não recebo" }] }
  }
  if (u.stage === "coleta_cidade" && text) {
    const cidadeLimpa = formatarCidade(limparTextoSomenteLetras(text))
    if (!cidadeLimpa || cidadeLimpa.length < 2) return responderComTimer(from, { texto: "Informe uma cidade válida usando apenas letras e espaços.", opcoes: null })
    return await prepararConfirmacaoEntrada(from, u, "cidade", cidadeLimpa, "coleta_cidade")
  }
  if (u.stage === "__coleta_nome_legado__" && text) {
    const nomeLimpo = extrairNomeDaCorrecaoExplicita(text) || formatarNome(limparTextoSomenteLetras(text))
    const validacaoLegado = nomeLimpo ? ehNomeAparente(nomeLimpo, text) : false
    if (!nomeLimpo || validacaoLegado === false) return responderComTimer(from, { texto: "Informe um nome válido usando apenas letras e espaços.", opcoes: null })
    if (validacaoLegado === "incompleto") return responderComTimer(from, { texto: "Preciso do nome completo. Por favor, informe também o sobrenome.", opcoes: null })
    return await prepararConfirmacaoEntrada(from, u, "nome", nomeLimpo, "coleta_nome")
  }
  if (u.stage === "__coleta_cidade_legado__" && text) {
    const cidadeLimpa = formatarCidade(limparTextoSomenteLetras(text))
    if (!cidadeLimpa || cidadeLimpa.length < 2) return responderComTimer(from, { texto: "Informe uma cidade válida usando apenas letras e espaços.", opcoes: null })
    return await prepararConfirmacaoEntrada(from, u, "cidade", cidadeLimpa, "__coleta_cidade_legado__")
  }
  if (u.stage === "__coleta_regiao_legado__") {
    if (!REGIOES[text]) { iniciarTimer(from); return telaRegioes() }
    u._regiao = text; setStage(u, "coleta_uf"); iniciarTimer(from)
    return telaUFsRegiao(text)
  }
  if (u.stage === "__coleta_uf_legado__") {
    const val = UF_MAP[text]
    if (!val) { iniciarTimer(from); return telaUFsRegiao(u._regiao || "reg_n") }
    u.uf = val; setStage(u, "coleta_contrib"); iniciarTimer(from)
    return { texto: "💼 Você já contribuiu para o INSS?", opcoes: [{ id:"col_c1", title:"❌ Nunca" }, { id:"col_c2", title:"⏰ Pouco tempo" }, { id:"col_c3", title:"📅 Mais de 1 ano" }, { id:"col_c4", title:"🏆 Muitos anos" }] }
  }
  if (u.stage === "coleta_contrib") {
    const m = { col_c1: "Nunca", col_c2: "Pouco tempo", col_c3: "Mais de 1 ano", col_c4: "Muitos anos" }
    if (!m[text]) { iniciarTimer(from); return { texto: "Selecione uma opção:", opcoes: Object.entries(m).map(([id, title]) => ({ id, title })) } }
    u.contribuicao = m[text]; setStage(u, "coleta_benef"); iniciarTimer(from)
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
    return { texto: "●●●●●○ 📝 Etapa 5 de 6 · *Descrição*\n\n📝 *Me explique o que está acontecendo.*\n\nQuanto mais detalhes, melhor! 😊\n\n🎙️ Pode *digitar* ou *enviar um áudio* — escolha como preferir.\n\n💡 Se for áudio, fique à vontade para explicar com calma. Tenho todo o tempo do mundo!", opcoes: null }
  }
  if ((u.stage === "coleta_desc" || u.stage === "coleta_desc_audio") && text) {
    return iniciarConfirmacaoDescricao(from, u, text, STAGES.COLETA_DESC_AUDIO)
  }

  // DESC_CONFIRMA — confirmar ou voltar para descrição
  if (u.stage === "desc_confirma") {
    if (text === "desc_ok") {
      u.descricao = normalizarTextoCRM((u._descTemp || "").trim())
      u._descTemp  = null
      await sincronizarNegocio(u)
      return await respostaAposConfirmarDescricao(from, u)
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

  // GATILHO ? URGENCIA ? COLETA
  if (u.stage === "gatilho") {
    setStage(u, "urgencia"); iniciarTimer(from)
    return { texto: "💰 Isso está te prejudicando *financeiramente* hoje?", opcoes: [{ id: "urg_sim", title: "⚠️ Sim, está" }, { id: "urg_nao", title: "✅ Não, consigo esperar" }] }
  }
  if (u.stage === "urgencia") {
    if (text === "urg_sim") { u.urgencia = "alta"; u.score += 3 }
    if (u.whatsappVerificado) return avancarAposTelefoneConfirmado(from, u)
    setStage(u, "coleta_verif_tel"); iniciarTimer(from)
    return {
      texto: `●●●●○○ 📱 Etapa 4 de 6 · *WhatsApp*\n\n📱 Esse número *${from}* é o seu WhatsApp?\n\nPreciso saber para que nossa equipe entre em contato corretamente.`,
      opcoes: [
      { id: "tel_meu", title: "✅ Sim, é meu" },
      { id: "tel_outro", title: "👤 Não, é de outra pessoa" }
      ]
    }
  }
  if (u.stage === "coleta_verif_tel") {
    if (text === "tel_outro") {
      u.whatsappVerificado = true
      u.telefoneEhDoCliente = false
      setStage(u, "coleta_tel_wpp_contato"); iniciarTimer(from)
      return { texto: "●●●●○○ 📱 Etapa 4 de 6 · *WhatsApp*\n\nQual é o WhatsApp com DDD da pessoa que será atendida?", opcoes: null }
    }
    u.whatsappVerificado = true
    u.telefoneEhDoCliente = true
    u.whatsappContato = from
    return avancarAposTelefoneConfirmado(from, u)
  }
  if (u.stage === "coleta_tel_wpp_contato") {
    // Confirmou que o número atual é o WhatsApp da pessoa atendida
    if (text === "wpp_contato_esse") {
      u.whatsappContato = from
      u.whatsappVerificado = true
      u.telefoneEhDoCliente = false
      iniciarTimer(from)
      if (!u.modoTexto) {
        try {
          const ogg = await gerarAudioAtendente(u.atendente, `Perfeito! Vou usar este número para o atendimento.`)
          await enviarAudio(from, urlAudioAtendente(ogg))
          await new Promise(r => setTimeout(r, 2000))
        } catch (e) { logErro("tts", "Falha áudio wpp_contato_esse", e) }
      }
      return await avancarAposTelefoneConfirmado(from, u)
    }
    if (text === "wpp_contato_outro") {
      iniciarTimer(from)
      await enviarAudioModoVoz(from, u, "Tudo bem. Diga agora o WhatsApp com DDD da pessoa atendida, por áudio ou digitando.", "informar outro whatsapp atendido")
      return { texto: `●●●●○○ 📱 Etapa 4 de 6 · *WhatsApp*\n\nDigite ou fale o WhatsApp com DDD da pessoa atendida agora. 🎙️`, opcoes: [{ id: "wpp_contato_esse", title: "✅ Usar número atual" }] }
    }
    // Digitou o número diretamente
    if (text) {
      const telefone = text.replace(/\D/g, "")
      if (![10,11].includes(telefone.length)) return responderComTimer(from, { texto: "Informe um WhatsApp válido com DDD, contendo 10 ou 11 dígitos.", opcoes: null })
      return await prepararConfirmacaoEntrada(from, u, "telefone", telefone, "coleta_tel_wpp_contato")
    }
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
      setStage(u, STAGES.AGUARDANDO_URGENTE)
      iniciarTimer(from)
  return { texto: `📩 *Mensagem urgente*\n\nDigite sua mensagem ou envie um áudio agora.\n\nTudo será registrado imediatamente e nossa equipe será notificada. ⚡\n\n📄 Caso: *${u.numeroCaso}*\n\n⏱️ _Prazo de retorno: até 4 horas em dias úteis._`, opcoes: null }
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
      const _textoAudio = u._urgenteAudioTexto || "Transcrição indisponível"
      notificarMensagemUrgente(u, _textoAudio, u.negocioId).catch(e => console.error("[notif] urgente-audio:", e.message))
      u._urgenteAudioBuffer = null
      u._urgenteAudioMime = null
      u._urgenteAudioNome = null
      u._urgenteAudioTexto = null
      setStage(u, STAGES.CLIENTE)
      return await respostaUrgenteRegistradaComAudio(from, u, "mensagem urgente audio registrada")
    }
    if (text === "urg_audio_corrigir") {
      await salvarAudioTranscritoNoCaso(u, u._urgenteAudioNome, u._urgenteAudioBuffer, u._urgenteAudioMime, "corrigido")
      u._urgenteAudioBuffer = null
      u._urgenteAudioMime = null
      u._urgenteAudioNome = null
      u._urgenteAudioTexto = null
      setStage(u, STAGES.AGUARDANDO_URGENTE)
      iniciarTimer(from)
  return { texto: `📩 *Mensagem urgente*\n\nDigite sua mensagem ou envie um áudio agora.\n\nTudo será registrado imediatamente e nossa equipe será notificada. ⚡\n\n📄 Caso: *${u.numeroCaso}*\n\n⏱️ _Prazo de retorno: até 4 horas em dias úteis._`, opcoes: null }
    }
    return responderComTimer(from, await telaConfirmarUrgenteComAudio(from, u, u._urgenteAudioTexto || ""))
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
      return executarEncerramentoFluxo(from, u)
    }
    if (text === "audio_fluxo_seguir") {
      u._audioFluxoTexto = null
      u._audioFluxoResposta = null
      u._audioFluxoAcao = null
      if (acao === "recomecar") return executarRecomecoFluxo(from, u)
      if (acao === "encerrar") return executarEncerramentoFluxo(from, u)
      const ultimaPergunta = retomarUltimaPergunta(u)
      if (ultimaPergunta) {
        iniciarTimer(from)
        return ultimaPergunta
      }
      return await executarRecomecoFluxo(from, u)
    }
    return responderComTimer(from, telaAudioNoFluxo(u._audioFluxoTexto || "", u._audioFluxoResposta || "continuar o atendimento"))
  }

  if (u.stage === STAGES.SUGESTAO_FLUXO_OUTRO) {
    if (text === "sug_fluxo" && u._sugestaoFluxo?.categoria) {
      aplicarSugestaoFluxoOutro(u, u._sugestaoFluxo.categoria)
      u._sugestaoFluxo = null
      setStage(u, STAGES.GATILHO)
      await sincronizarNegocio(u)
      iniciarTimer(from)
      return { texto: "✅ Certo! Vamos registrar sua solicitação.", opcoes: [{ id: "cont", title: "▶️ Continuar" }] }
    }
    if (text === "sug_nao") {
      u._sugestaoFluxo = null
      setStage(u, STAGES.COLETA_DESC_AUDIO)
      iniciarTimer(from)
      return telaDescreverCaso()
    }
  }

  if (u.stage === STAGES.EXPLICAR_TUDO_OFERTA) {
    if (text === "explicar_tudo") {
      u._descOrigemStage = "explicar_tudo"
      setStage(u, STAGES.COLETA_DESC_AUDIO)
      iniciarTimer(from)
      return telaDescreverCaso()
    }
    if (text === "seguir_fluxo") {
      u._proximoStageAposDescricao = null
      u._proximaPerguntaAposDescricao = null
      setStage(u, STAGES.GATILHO)
      iniciarTimer(from)
      return { texto: "✅ Certo! Vamos registrar sua solicitação.", opcoes: [{ id: "cont", title: "▶️ Continuar" }] }
    }
    setStage(u, STAGES.COLETA_DESC_AUDIO)
    iniciarTimer(from)
    return telaDescreverCaso()
  }


  // INICIO
  if (u.stage === "inicio") {
    if (podeMostrarMenuCliente(u)) {
      // Cliente retornando — perguntar se quer acompanhar ou abrir novo caso
      setStage(u, "inicio_retorno"); iniciarTimer(from)
      const nomeExib = getPrimeiroNomeRetomada(u)
      return {
        texto: `Que bom te ver novamente, *${nomeExib}* 😊\n\nVocê já possui um atendimento conosco.\n\n📄 Caso: *${u.numeroCaso}*\n⚖️ Área: ${u.area}\n\nO que deseja fazer?`,
        opcoes: [
        { id: "ret_acompanhar", title: "📊 Acompanhar meu caso" },
        { id: "ret_novo",       title: "➕ Abrir novo caso" }
        ]
      }
    }
    return await iniciarFluxoRelatoLivre(from, u, { boasVindas: true })
  }

  // RETORNO — cliente escolhe entre acompanhar ou novo caso
  if (u.stage === "inicio_retorno") {
    if (text === "ret_acompanhar") {
      if (!podeMostrarMenuCliente(u)) {
        return await iniciarFluxoRelatoLivre(from, u, { boasVindas: true })
      }
      setStage(u, "cliente"); iniciarTimer(from)
      return await menuClienteComAudio(from, u)
    }
    if (text === "ret_novo") {
      return await abrirNovoCasoCliente(from, u)
    }
  }

  // MENU CLIENTE
  if (u.stage === "cliente") {
    if (!podeMostrarMenuCliente(u)) {
      salvarEtapa(u._numero, STAGES.AUDIO_AGUARDANDO)
      iniciarTimer(from)
      return respostaRecomecoMenuPrincipal(u)
    }
    if (text === "terceiro_reconhece" || normalizarTextoGatilho(text) === "reconheco" || normalizarTextoGatilho(text) === "reconheço") {
      u._aguardandoReconhecimentoTerceiro = false
      iniciarTimer(from)
      await enviarAudioModoVoz(
        from,
        u,
        "Tudo certo. Vou abrir seu menu do cliente para você acompanhar este atendimento.",
        "terceiro reconhece caso"
      )
      return await menuClienteComAudio(from, u)
    }
    if (text === "terceiro_nao_reconhece" || normalizarTextoGatilho(text).includes("nao reconhe") || normalizarTextoGatilho(text).includes("não reconhe")) {
      u._aguardandoReconhecimentoTerceiro = false
      u._casoNaoReconhecido = true
      iniciarTimer(from)
      if (u.negocioId) {
        await hsMoverStage(u.negocioId, HS_STAGE.LEAD)
        u.negocioStageId = HS_STAGE.LEAD
      }
      await hsCriarNota(
        u.contatoId,
        "CASO NAO RECONHECIDO PELO WHATSAPP INFORMADO",
        `A pessoa do WhatsApp ${from} informou que nao reconhece a abertura do caso.\nCaso: ${u.numeroCaso || "-"}\nNome no cadastro: ${u.nome || "-"}`
      )
      await enviarWhatsAppAdmin(`⚠️ *Caso não reconhecido*\n\n📄 Caso: ${u.numeroCaso || "-"}\n👤 Nome cadastrado: ${u.nome || "-"}\n📱 WhatsApp: ${from}\n\nA pessoa informou que não reconhece a abertura deste atendimento.`)
      await enviarAudioModoVoz(
        from,
        u,
        "Entendi. Registrei que você não reconhece este atendimento. Nossa equipe será notificada para verificar o ocorrido.",
        "terceiro nao reconhece caso"
      )
      return {
        texto: `⚠️ *Entendi.*\n\nRegistrei que você não reconhece este atendimento.\n\nNossa equipe será notificada para verificar o ocorrido. Você não precisa enviar documentos nem dar continuidade por aqui agora.`,
        opcoes: null,
        registrarPergunta: false
      }
    }
    if (text === "audio_cliente_novo_caso") {
      return await abrirNovoCasoCliente(from, u)
    }
    if (text === "audio_cliente_caso_atual") {
      const textoAudio = u._audioClientePendenteTexto || ""
      if (!textoAudio) {
        u._audioClientePendenteArquivo = null
        iniciarTimer(from)
        return await responderTelaComAudio(
          from,
          u,
          {
            texto: "🎙️ Não encontrei um áudio pendente para registrar.\n\nVocê pode enviar o áudio novamente ou voltar ao menu do cliente.",
            opcoes: [
      { id: "m_adv",      title: "👨‍⚖️ Falar com advogado" },
      { id: "m_inicio", title: "🏠 Menu do cliente" }
            ]
          },
          "Não encontrei um áudio pendente para registrar. Você pode enviar o áudio novamente ou voltar ao menu do cliente.",
          "audio cliente pendente ausente"
        )
      }
      const urgente = detectarIntencaoCliente(textoAudio) === "urgente"
      await hsCriarNota(
        u.contatoId,
        urgente ? "MENSAGEM URGENTE" : "MENSAGEM SOBRE CASO ATUAL",
        `De: ${u.nome || "-"} (${from})\nCaso: ${u.numeroCaso || "-"}\n\n${textoAudio}${u._audioClientePendenteArquivo ? `\nDrive: ${u._audioClientePendenteArquivo}` : ""}`
      )
      if (urgente) {
        await hsMoverStage(u.negocioId, HS_STAGE.ANALISE)
        notificarMensagemUrgente(u, textoAudio, u.negocioId).catch(e => console.error("[notif] urgente-audio-cliente:", e.message))
      }
      u._audioClientePendenteTexto = null
      u._audioClientePendenteArquivo = null
      if (urgente) {
        setStage(u, STAGES.CLIENTE)
        return await respostaUrgenteRegistradaComAudio(from, u, "mensagem urgente audio cliente caso atual")
      }
      iniciarTimer(from)
      return await responderTelaComAudio(
        from,
        u,
        {
          texto: `✅ *Mensagem registrada no seu caso atual.*\n\nNossa equipe poderá consultar esse registro no atendimento.`,
          opcoes: [
      { id: "m_adv",      title: "👨‍⚖️ Falar com advogado" },
      { id: "m_inicio", title: "🏠 Menu do cliente" }
          ]
        },
        "Mensagem registrada no seu caso atual. Nossa equipe poderá consultar esse registro no atendimento.",
        "mensagem caso atual"
      )
    }
    if (text === "doc_cliente_anexar") {
      const nomeDoc = u._docClientePendenteNome || "Documento recebido"
      const linkDoc = u._docClientePendenteArquivo || ""
      const fileIdDoc = u._docClientePendenteId || null
      if (!linkDoc) {
        u._docClientePendenteNome = null
        u._docClientePendenteArquivo = null
        u._docClientePendenteId = null
        u._docsClienteGuiado = false
        iniciarTimer(from)
        return await responderTelaComAudio(
          from,
          u,
          {
            texto: "📎 Não encontrei um arquivo pendente para anexar.\n\nPode enviar o documento novamente?",
            opcoes: [
      { id: "m_docs", title: "📎 Enviar documentos" },
      { id: "m_inicio", title: "🏠 Menu do cliente" }
            ]
          },
          "Não encontrei um arquivo pendente para anexar. Pode enviar o documento novamente?",
          "arquivo pendente ausente"
        )
      }
      if (u.negocioId) {
        const moveu1 = await hsMoverStageSeguro(u.negocioId, HS_STAGE.DOCS, u.negocioStageId, Boolean(u._eventoCalendarId))
        if (moveu1) u.negocioStageId = HS_STAGE.DOCS
      }
      const nomeRenomeado = `Documento anexado - ${primeiroEUltimoNome(u.nome || "cliente") || "cliente"}${path.extname(nomeDoc) || ""}`
      const arquivoRenomeado = await renomearArquivoDrive(fileIdDoc, nomeRenomeado)
      const nomeFinalDoc = arquivoRenomeado?.name || nomeDoc
      const linkFinalDoc = arquivoRenomeado?.webViewLink || linkDoc
      await hsCriarNota(
        u.contatoId,
        "DOCUMENTO ANEXADO AO CASO",
        `De: ${u.nome || "-"} (${from})\nCaso: ${u.numeroCaso || "-"}\nArquivo: ${nomeFinalDoc}${linkFinalDoc ? `\nDrive: ${linkFinalDoc}` : ""}`
      )
      u.documentosEnviados = true
      u._docsClienteGuiado = false
      u._docClientePendenteNome = null
      u._docClientePendenteArquivo = null
      u._docClientePendenteId = null
      await enviarAudioModoVoz(
        from,
        u,
        "Documento anexado ao caso. Nossa equipe poderá consultar esse arquivo na análise. Você pode enviar outros documentos, falar com nossa equipe ou voltar ao menu do cliente.",
        "documento anexado cliente"
      )
      const casoInfoAnexado = u.numeroCaso ? `\n\n📄 *${u.numeroCaso}* · ${iconeAreaJuridica(u.area || "")} ${u.area || "—"}\n_${formatarSituacaoJuridica(u.situacao, u.tipo, u.subTipo) || "Em análise"}_` : ""
      const telaAnexado = {
        texto: `✅ *Documento anexado ao caso!*${casoInfoAnexado}\n\nNossa equipe poderá consultar esse arquivo na análise.`,
        opcoes: [
          { id: "m_docs", title: "📎 Enviar documentos" },
          { id: "m_adv", title: "👨‍⚖️ Falar com advogado" },
          { id: "m_inicio", title: "🏠 Menu do cliente" }
        ]
      }
      const enviadaAnexado = IMAGEM_DOC_ANEXADO_URL
        ? await enviarImagemWhatsApp(from, IMAGEM_DOC_ANEXADO_URL, telaAnexado.texto, telaAnexado.opcoes)
        : false
      if (!enviadaAnexado) return responderComTimer(from, telaAnexado)
      registrarUltimaPergunta(u, telaAnexado)
      iniciarTimer(from)
      return {}
    }
    if (text?.startsWith("doc_cliente_tipo_")) {
      const nomeDoc = u._docClientePendenteNome || "Documento recebido"
      const linkDoc = u._docClientePendenteArquivo || ""
      const fileIdDoc = u._docClientePendenteId || null
      if (!linkDoc) {
        u._docClientePendenteNome = null
        u._docClientePendenteArquivo = null
        u._docClientePendenteId = null
        u._docsClienteGuiado = false
        iniciarTimer(from)
        return await responderTelaComAudio(
          from,
          u,
          {
            texto: "📎 Não encontrei um arquivo pendente para anexar.\n\nPode enviar o documento novamente?",
            opcoes: [
      { id: "m_docs", title: "📎 Enviar documentos" },
      { id: "m_inicio", title: "🏠 Menu do cliente" }
            ]
          },
          "Não encontrei um arquivo pendente para anexar. Pode enviar o documento novamente?",
          "arquivo pendente ausente"
        )
      }
      const tiposDocCliente = {
        doc_cliente_tipo_pessoal: "Documento pessoal",
        doc_cliente_tipo_prova: "Prova do caso",
        doc_cliente_tipo_outro: "Outro documento"
      }
      const tipoDoc = tiposDocCliente[text] || "Documento recebido"
      if (u.negocioId) {
        const moveu2 = await hsMoverStageSeguro(u.negocioId, HS_STAGE.DOCS, u.negocioStageId, Boolean(u._eventoCalendarId))
        if (moveu2) u.negocioStageId = HS_STAGE.DOCS
      }
      const nomeRenomeado = `${tipoDoc} - ${primeiroEUltimoNome(u.nome || "cliente") || "cliente"}${path.extname(nomeDoc) || ""}`
      const arquivoRenomeado = await renomearArquivoDrive(fileIdDoc, nomeRenomeado)
      const nomeFinalDoc = arquivoRenomeado?.name || nomeDoc
      const linkFinalDoc = arquivoRenomeado?.webViewLink || linkDoc
      await hsCriarNota(
        u.contatoId,
        "DOCUMENTO ANEXADO AO CASO",
        `De: ${u.nome || "-"} (${from})\nCaso: ${u.numeroCaso || "-"}\nTipo: ${tipoDoc}\nArquivo: ${nomeFinalDoc}${linkFinalDoc ? `\nDrive: ${linkFinalDoc}` : ""}`
      )
      u.documentosEnviados = true
      u._docsClienteGuiado = false
      u._docClientePendenteNome = null
      u._docClientePendenteArquivo = null
      u._docClientePendenteId = null
      iniciarTimer(from)
      await enviarAudioModoVoz(
        from,
        u,
        `${tipoDoc} anexado ao caso. Nossa equipe poderá consultar esse arquivo na análise. Você pode enviar outros documentos, falar com nossa equipe ou voltar ao menu do cliente.`,
        "documento classificado cliente"
      )
      return {
        texto: `✅ *${tipoDoc}* anexado ao caso.\n\nNossa equipe poderá consultar esse arquivo na análise.`,
        opcoes: [
      { id: "m_docs", title: "📎 Enviar documentos" },
      { id: "m_adv",      title: "👨‍⚖️ Falar com advogado" },
      { id: "m_inicio", title: "🏠 Menu do cliente" }
        ]
      }
    }
    if (text?.startsWith("m_caso_")) {
      const idx = Number(text.replace("m_caso_", ""))
      const caso = Array.isArray(u._casosMenuCliente) ? u._casosMenuCliente[idx] : null
      if (!caso?.negocio) {
        iniciarTimer(from)
        u._mostrarPainelCasosCliente = true
        return await menuClienteComAudio(from, u)
      }
      const acaoPendente = u._acaoPendente || null
      restaurarEstadoNegocioHubSpot(u, caso.negocio)
      u.stage = STAGES.CLIENTE
      u.etapa = STAGES.CLIENTE
      u._menuClienteCasoAtivo = true
      u._mostrarPainelCasosCliente = false
      u._acaoPendente = acaoPendente
      if (!acaoPendente) {
        u._casoSelecionadoAudio = {
          area: caso.area || u.area,
          numeroCaso: caso.numeroCaso || u.numeroCaso
        }
      }
      iniciarTimer(from)
      if (acaoPendente) return await executarAcaoPendenteCliente(from, u)
      return await menuClienteComAudio(from, u)
    }
    if (text === "m_status") {
      iniciarTimer(from)
      const selecao = await abrirSelecaoCasoParaAcao(from, u, "status")
      if (selecao !== false) return selecao
      return await telaStatusCliente(from, u)
    }
    if (text === "cliente_cancelar_consulta") {
      u._docsClienteGuiado = false
      iniciarTimer(from)
      return await telaConfirmarCancelamentoConsultaCliente(from, u)
    }
    if (text === "cliente_cancelar_consulta_sim") {
      u._docsClienteGuiado = false
      iniciarTimer(from)
      return await cancelarConsultaCliente(from, u)
    }
    if (text === "docs_intro_ok") {
      aplicarContextoDocsCasoAtual(u)
      if (u.negocioId) {
        const moveu3 = await hsMoverStageSeguro(u.negocioId, HS_STAGE.AGUARDANDO_DOCS, u.negocioStageId, Boolean(u._eventoCalendarId))
        if (moveu3) u.negocioStageId = HS_STAGE.AGUARDANDO_DOCS
      }
      if (getDocsPendentes(u).length === 0 && getDocsFaltantesReenviaveis(u).length > 0) {
        u._docsClienteGuiado = true
        u.etapa = "documentos"
        iniciarTimer(from)
        await enviarAudioModoVoz(
          from,
          u,
          "Encontrei documentos que ficaram faltando ou incompletos neste caso. Na tela, toque em Enviar faltantes para continuar o envio, ou em Ver status para conferir a lista.",
          "documentos faltantes"
        )
        const telaPendentes = telaDocsPendentesComImagem(u)
        const enviadaPendentes = await enviarImagemWhatsApp(from, telaPendentes.imagemUrl, telaPendentes.texto, telaPendentes.opcoes)
        if (!enviadaPendentes) return telaPendentes
        registrarUltimaPergunta(u, telaPendentes)
        return null
      }
      await enviarTelaDocumentosCaso(from, u)
      iniciarTimer(from)
      return null
    }
    if (text === "docs_confirmar_envio_extra") {
      await enviarAudioModoVoz(
        from,
        u,
        "Pode enviar o arquivo agora. Assim que receber, vou salvar no seu caso.",
        "envio extra documento"
      )
      const casoInfoExtra = u.numeroCaso ? `\n\n📄 *${u.numeroCaso}* · ${iconeAreaJuridica(u.area || "")} ${u.area || "—"}\n_${formatarSituacaoJuridica(u.situacao, u.tipo, u.subTipo) || "Em análise"}_` : ""
      const telaEnvioExtra = {
        texto: `📎 *Pode enviar o arquivo agora.*${casoInfoExtra}\n\nAssim que receber, vou salvar no seu caso.`,
        opcoes: [
          { id: "m_inicio", title: "🏠 Menu do cliente" }
        ]
      }
      const enviadaExtra = IMAGEM_ENVIO_EXTRA_URL
        ? await enviarImagemWhatsApp(from, IMAGEM_ENVIO_EXTRA_URL, telaEnvioExtra.texto, telaEnvioExtra.opcoes)
        : false
      if (!enviadaExtra) return responderComTimer(from, telaEnvioExtra)
      registrarUltimaPergunta(u, telaEnvioExtra)
      iniciarTimer(from)
      return {}
    }
    const emFluxoDocumento = Boolean(
      u._docsClienteGuiado ||
      u.etapa === "documentos" ||
      u.lastPergunta === "documentos" ||
      identificarEtapaAtual(u, u.lastPerguntaPayload || {}) === "documentos"
    )
    const comandoDoc = emFluxoDocumento ? detectarComandoDocumento(text) : null
    if (emFluxoDocumento && text && !comandoDoc && !text.startsWith("m_") && !text.startsWith("doc_cliente_tipo_")) {
      const { doc: docTexto, folha: folhaTexto } = getDocumentoAtualGuia(u)
      if (docTexto && textoIndicaDocumentoAusente(text)) {
        marcarStatusDocumento(u, docTexto.id, "docsAusentes")
        u.docAtualIdx = 0
        u.ultimoArqId = null
        u.ultimoArqNome = null
        salvarEtapa(u._numero, "documentos")
        await hsCriarNota(
          u.contatoId,
          "DOCUMENTO INFORMADO COMO AUSENTE",
          `De: ${u.nome || "-"} (${from})\nCaso: ${u.numeroCaso || "-"}\nDocumento: ${docTexto.label}\nMensagem do cliente: ${text}`
        )
        const telaAusente = telaEnvioDoc(u, enviarOpcoesPadrao)
        await enviarGuiaDocs(from, u, telaAusente)
        iniciarTimer(from)
        return null
      }

      if (docTexto && documentoAtualAceitaTexto(docTexto)) {
        marcarStatusDocumento(u, docTexto.id, "docsEntregues")
        u.docAtualIdx = 0
        u.documentosEnviados = true
        salvarEtapa(u._numero, "documentos")
        if (u.negocioId) {
          const moveu4 = await hsMoverStageSeguro(u.negocioId, HS_STAGE.DOCS, u.negocioStageId, Boolean(u._eventoCalendarId))
          if (moveu4) u.negocioStageId = HS_STAGE.DOCS
        }
        await hsCriarNota(
          u.contatoId,
          "INFORMACAO DOCUMENTAL RECEBIDA",
          `De: ${u.nome || "-"} (${from})\nCaso: ${u.numeroCaso || "-"}\nDocumento: ${docTexto.label}\nItem: ${folhaTexto}\n\n${text}`
        )
        const telaTexto = telaEnvioDoc(u, enviarOpcoesPadrao)
        await enviarGuiaDocs(from, u, telaTexto)
        iniciarTimer(from)
        return null
      }

      if (docTexto && text.length >= 20) {
        salvarEtapa(u._numero, "documentos")
        await hsCriarNota(
          u.contatoId,
          "OBSERVACAO SOBRE DOCUMENTO",
          `De: ${u.nome || "-"} (${from})\nCaso: ${u.numeroCaso || "-"}\nDocumento atual: ${docTexto.label}\nItem: ${folhaTexto}\n\n${text}`
        )
        await enviarAudioModoVoz(
          from,
          u,
          `Anotei essa observação no seu caso. ${fraseEnvioDocumentoAudio(docTexto, folhaTexto)} Se preferir, você pode continuar depois ou voltar ao menu do cliente.`,
          "observacao documento"
        )
        iniciarTimer(from)
        return {
          texto: `Anotei essa observação no seu caso.\n\nAgora envie *${folhaTexto}* do documento *${docTexto.label}* quando estiver pronto.`,
          opcoes: [
            { id: "docs_depois", title: "Continuar depois" },
            { id: "m_inicio", title: "🏠 Menu do cliente" }
          ]
        }
      }
    }
    if (comandoDoc === "doc_cpf_skip") {
      // Pular CPF — já está no RG
      marcarStatusDocumento(u, "doc_cpf", "docsDispensados")
      u.docAtualIdx = 0
      u.ultimoArqId = null
      const telaCpf = telaEnvioDoc(u, enviarOpcoesPadrao)
      await enviarGuiaDocs(from, u, telaCpf)
      iniciarTimer(from)
      return null
    }
    if (comandoDoc === "docs_enviar_faltantes") {
      const reabertos = reabrirDocsFaltantesReenviaveis(u)
      if (!reabertos.length) {
        const telaSemFaltantes = telaEnvioDoc(u, enviarOpcoesPadrao)
        await enviarGuiaDocs(from, u, telaSemFaltantes)
        iniciarTimer(from)
        return null
      }
      salvarEtapa(u._numero, "documentos")
      setStage(u, STAGES.CLIENTE)
      if (u.negocioId) {
        const moveu5 = await hsMoverStageSeguro(u.negocioId, HS_STAGE.AGUARDANDO_DOCS, u.negocioStageId, Boolean(u._eventoCalendarId))
        if (moveu5) u.negocioStageId = HS_STAGE.AGUARDANDO_DOCS
      }
      await hsCriarNota(
        u.contatoId,
        "DOCUMENTOS FALTANTES REABERTOS PARA ENVIO",
        `De: ${u.nome || "-"} (${from})\nCaso: ${u.numeroCaso || "-"}\nDocumentos reabertos:\n${reabertos.map(item => `- ${item.doc.label} (${item.status})`).join("\n")}`
      )
      const telaFaltantes = telaEnvioDoc(u, enviarOpcoesPadrao)
      await enviarGuiaDocs(from, u, telaFaltantes)
      registrarUltimaPergunta(u, telaFaltantes)
      iniciarTimer(from)
      return null
    }
    if (comandoDoc === "docs_ver_status") {
      iniciarTimer(from)
      return await telaStatusCliente(from, u)
    }
    if (text === "m_docs" || text === "docs_pedido_admin") {
      aplicarContextoDocsCasoAtual(u)
      logDebug("[DOCUMENTOS] contexto:", {
        numeroCaso: u.numeroCaso,
        negocioId: u.negocioId,
        area: u.area,
        tipo: u.tipo,
        situacao: u.situacao,
        detalhe: u.detalhe,
        docKey: u._docKey,
        casoRecemAberto: u._casoRecemAberto,
        acaoPendente: u._acaoPendente
      })
      const selecao = await abrirSelecaoCasoParaAcao(from, u, "documentos")
      if (selecao !== false) return selecao
      return await executarIntencaoCliente(from, u, "documentos", text)
    }
    if (comandoDoc === "docs_reenviar") {
      salvarEtapa(u._numero, "documentos")
      if (u.ultimoArqId) {
        const arquivoSubstituido = await marcarArquivoDriveSubstituido(u.ultimoArqId, u.ultimoArqNome)
        await hsCriarNota(
          u.contatoId,
          "DOCUMENTO MARCADO COMO SUBSTITUIDO",
          `De: ${u.nome || "-"} (${from})\nCaso: ${u.numeroCaso || "-"}\nArquivo anterior: ${u.ultimoArqNome || u.ultimoArqId}\nStatus: marcado como substituido, preservado no Drive${arquivoSubstituido?.webViewLink ? `\nDrive: ${arquivoSubstituido.webViewLink}` : ""}`
        )
        u.ultimoArqId = null; u.ultimoArqNome = null
        u.docAtualIdx = Math.max(0, (u.docAtualIdx || 1) - 1)
      }
      const pend2 = getDocsPendentes(u)
      const d2    = pend2[0]
      const f2    = (d2?.folhas || ["Foto"])[u.docAtualIdx || 0] || "Foto"
      iniciarTimer(from)
      const textoReenvio = [
        "📎 Arquivo anterior marcado como substituido.",
        "",
        "Ela foi preservada no Drive para historico do caso.",
        "",
        `Envie novamente: *${f2}* do *${d2?.label || "documento"}*`,
        "",
        "📸 Boa iluminacao, sem reflexo, tudo enquadrado."
      ].join("\n")
      await enviarAudioModoVoz(
        from,
        u,
        `Arquivo anterior marcado como substituído. ${fraseEnvioDocumentoAudio(d2 || {}, f2).replace(/^Agora envie/, "Envie novamente")} Use boa iluminação, sem reflexo e com tudo enquadrado.`,
        "reenviar documento"
      )
      return { texto: textoReenvio, opcoes: null }
    }
    if (comandoDoc === "docs_maisFotos") {
      salvarEtapa(u._numero, "documentos")
      // Não avança para o próximo documento — permanece no atual
      const pend3  = getDocsPendentes(u)
      const d3     = pend3[0]
      const fAtual = (d3?.folhas || ["Foto"])[u.docAtualIdx || 0] || `Foto ${(u.docAtualIdx||0)+1}`
      await enviarAudioModoVoz(
        from,
        u,
        `Certo. Envie o complemento para ${d3?.label || "o documento"}. O item atual é ${fAtual}. Use boa iluminação, sem reflexo e com tudo enquadrado.`,
        "complementar documento"
      )
      iniciarTimer(from)
      return { texto: `Ok! Envie o complemento do documento *${d3?.label || "documento"}*.\n\nItem atual: *${fAtual}*\n\n💡 Mesmas orientações: boa iluminação, sem reflexo, enquadrado corretamente.`, opcoes: null }
    }
    if (comandoDoc === "docs_rg_verso_junto") {
      salvarEtapa(u._numero, "documentos")
      setStage(u, STAGES.CLIENTE)
      u._docsClienteGuiado = true
      u.etapa = "documentos"
      const { doc: docRg } = getDocumentoAtualGuia(u)
      if (docRg?.id === "doc_rg") {
        marcarStatusDocumento(u, docRg.id, "docsEntregues")
        await hsCriarNota(
          u.contatoId,
          "DOCUMENTO COMPLETO - FRENTE E VERSO NA MESMA IMAGEM",
          `De: ${u.nome || "-"} (${from})\nCaso: ${u.numeroCaso || "-"}\nDocumento: ${docRg.label}\nArquivo: ${u.ultimoArqNome || "-"}`
        )
      }
      u.docAtualIdx = 0
      u.ultimoArqId = null
      u.ultimoArqNome = null
      const telaRgCompleto = telaEnvioDoc(u, enviarOpcoesPadrao)
      await enviarGuiaDocs(from, u, telaRgCompleto)
      registrarUltimaPergunta(u, telaRgCompleto)
      iniciarTimer(from)
      return null
    }
    if (comandoDoc === "docs_rg_sem_verso") {
      salvarEtapa(u._numero, "documentos")
      setStage(u, STAGES.CLIENTE)
      u._docsClienteGuiado = true
      u.etapa = "documentos"
      const { doc: docRg, folha: folhaRg, fIdx: fIdxRg, folhas: folhasRg } = getDocumentoAtualGuia(u)
      if (docRg?.id === "doc_rg") {
        marcarStatusDocumento(u, docRg.id, "docsParciais")
        await hsCriarNota(
          u.contatoId,
          "DOCUMENTO PARCIAL - CLIENTE SEGUIU SEM VERSO",
          `De: ${u.nome || "-"} (${from})\nCaso: ${u.numeroCaso || "-"}\nDocumento: ${docRg.label}\nItem pendente: ${folhaRg}\nProgresso: ${fIdxRg} de ${folhasRg.length}`
        )
      }
      u.docAtualIdx = 0
      u.ultimoArqId = null
      u.ultimoArqNome = null
      const telaRgParcial = telaEnvioDoc(u, enviarOpcoesPadrao)
      await enviarGuiaDocs(from, u, telaRgParcial)
      registrarUltimaPergunta(u, telaRgParcial)
      iniciarTimer(from)
      return null
    }
    if (comandoDoc === "docs_pular_doc") {
      salvarEtapa(u._numero, "documentos")
      setStage(u, STAGES.CLIENTE)
      u._docsClienteGuiado = true
      u.etapa = "documentos"
      const { doc: docPular, folha: folhaPular, fIdx: fIdxPular, folhas: folhasPular } = getDocumentoAtualGuia(u)
      if (docPular) {
        const pulouAntesDeEnviar = fIdxPular <= 0 && !u.ultimoArqId
        marcarStatusDocumento(u, docPular.id, pulouAntesDeEnviar ? "docsPulados" : "docsParciais")
        await hsCriarNota(
          u.contatoId,
          pulouAntesDeEnviar ? "DOCUMENTO PULADO PELO CLIENTE" : "DOCUMENTO AVANCADO SEM TODAS AS PAGINAS",
          `De: ${u.nome || "-"} (${from})\nCaso: ${u.numeroCaso || "-"}\nDocumento: ${docPular.label}\nItem pendente ao avancar: ${folhaPular}\nProgresso: ${fIdxPular} de ${folhasPular.length}`
        )
      }
      u.docAtualIdx = 0
      u.ultimoArqId = null
      u.ultimoArqNome = null
      const telaPular = telaEnvioDoc(u, enviarOpcoesPadrao)
      await enviarGuiaDocs(from, u, telaPular)
      registrarUltimaPergunta(u, telaPular)
      iniciarTimer(from)
      return null
    }
    if (comandoDoc === "docs_proxdoc") {
      salvarEtapa(u._numero, "documentos")
      setStage(u, STAGES.CLIENTE)
      u._docsClienteGuiado = true
      u.etapa = "documentos"
      const pend4 = getDocsPendentes(u)
      const docAtual4 = pend4[0]
      const folhas4 = docAtual4?.folhas || ["Foto"]
      const fIdx4 = u.docAtualIdx || 0
      if (fIdx4 >= folhas4.length) {
        // Todas as folhas do documento atual foram enviadas — avança para o próximo documento
        if (docAtual4?.id) marcarStatusDocumento(u, docAtual4.id, "docsEntregues")
        u.docAtualIdx = 0
      }
      // Se ainda há folhas pendentes no documento atual, mantém o documento e avança só o índice da folha
      u.ultimoArqId = null
      const tela4 = telaEnvioDoc(u, enviarOpcoesPadrao)
      await enviarGuiaDocs(from, u, tela4)
      registrarUltimaPergunta(u, tela4)
      iniciarTimer(from)
      return null
    }
    if (comandoDoc === "docs_depois") {
      // Se o documento atual já está completo (todas as folhas enviadas), marca como entregue antes de sair
      const pendentesDepois = getDocsPendentes(u)
      const docAtualDepois = pendentesDepois[0]
      if (docAtualDepois) {
        const folhasDepois = docAtualDepois.folhas || ["Foto"]
        const fIdxDepois = u.docAtualIdx || 0
        const docCompletoDepois = fIdxDepois >= folhasDepois.length
        if (docCompletoDepois) {
          marcarStatusDocumento(u, docAtualDepois.id, "docsEntregues")
          u.docAtualIdx = 0
        }
      }
      sairContextoDocumentosCliente(u)
      const primeiroNome = primeiroNomeCliente(u) || "você"
      await enviarAudioModoVoz(
        from,
        u,
        `Sem problema, ${primeiroNome}. Você pode continuar depois. Quando tiver os documentos, volte ao menu e toque em Enviar documentos.`,
        "continuar documentos depois"
      )
      iniciarTimer(from)
      return { texto: `Sem problema, ${primeiroNome}! 😊\n\nQuando tiver os documentos, é só voltar aqui e tocar em *"Enviar documentos"*.\n\n📁 Caso: *${u.numeroCaso}*`, opcoes: enviarOpcoesPadrao(from, "retorno_docs") }
    }
    if (text === "m_adv") {
      u._docsClienteGuiado = false
      iniciarTimer(from)
      const selecao = await abrirSelecaoCasoParaAcao(from, u, "advogado")
      if (selecao !== false) return selecao
      return await telaAdvogadoClienteComAudio(from, u)
    }
    if (text === "dir_agendar") {
      u._docsClienteGuiado = false
      setStage(u, STAGES.CLIENTE)
      iniciarTimer(from)
      return await telaAdvogadoClienteComAudio(from, u)
    }
    if (text === "adv_ag") {
      u._docsClienteGuiado = false
      setStage(u, STAGES.CLIENTE)
      iniciarTimer(from)
      return await telaAdvogadoClienteComAudio(from, u)
    }
    if (text === "adv_urg") {
      u._docsClienteGuiado = false
      return await iniciarMensagemUrgenteCliente(from, u)
    }
    if (text === "adv_agendar_ligacao") {
      u._docsClienteGuiado = false
      if (u.negocioId) {
        await hsMoverStage(u.negocioId, HS_STAGE.AGENDAMENTO)
        u.negocioStageId = HS_STAGE.AGENDAMENTO
        await hsCriarNota(u.contatoId, "AGENDAMENTO SOLICITADO",
          `${u.nome} (${from}) solicitou agendamento.\nCaso: ${u.numeroCaso} | Área: ${u.area}`)
      }
      return await iniciarAgendamento(from, u)
    }
    if (text === "m_novocaso") {
      u._docsClienteGuiado = false
      iniciarTimer(from)
      return await confirmarAberturaNovoCasoCliente(from, u)
    }
    if (text === "novo_caso_confirmar") {
      return await abrirNovoCasoCliente(from, u)
    }
    if (text === "m_encerrar") {
      return await encerrarClienteCadastrado(from, u)
    }
    if (text === "m_inicio") {
      u._docsClienteGuiado = false
      u._menuClienteCasoAtivo = false
      u._mostrarPainelCasosCliente = false
      u._acaoPendente = null
      iniciarTimer(from)
      if (podeMostrarMenuCliente(u)) return await menuClienteComAudio(from, u)
      salvarEtapa(u._numero, STAGES.AUDIO_AGUARDANDO)
      return respostaRecomecoMenuPrincipal(u)
    }
    if (text) {
      if (pareceDuvidaCasoAtualOuNovo(text)) {
        u._audioClientePendenteTexto = normalizarTextoCRM(text)
        u._audioClientePendenteArquivo = null
        const telaCasoAtualOuNovo = telaClienteCasoAtualOuNovo(text, "texto")
        await enviarAudioModoVoz(
          from,
          u,
          `Entendi sua dúvida. Essa situação é sobre o caso atual ou você quer abrir um novo caso? ${textoAudioOpcoes(telaCasoAtualOuNovo.opcoes)}`,
          "dúvida caso atual ou novo"
        )
        return responderComTimer(from, telaCasoAtualOuNovo)
      }
      const intencaoTexto = detectarIntencaoCliente(text)
      if (intencaoTexto === "novo_caso" && pareceNovaSituacaoCliente(text)) {
        u._audioClientePendenteTexto = normalizarTextoCRM(text)
        u._audioClientePendenteArquivo = null
        return await confirmarAberturaNovoCasoCliente(from, u)
      }
      if (!intencaoTexto && pareceNovaSituacaoCliente(text)) {
        u._audioClientePendenteTexto = normalizarTextoCRM(text)
        u._audioClientePendenteArquivo = null
        const telaCasoAtualOuNovo = telaClienteCasoAtualOuNovo(text, "texto")
        await enviarAudioModoVoz(
          from,
          u,
          `Entendi que você contou uma nova situação com detalhes. Essa mensagem é sobre o caso atual ou você quer abrir um novo caso? ${textoAudioOpcoes(telaCasoAtualOuNovo.opcoes)}`,
          "texto cliente caso atual ou novo"
        )
        return responderComTimer(from, telaCasoAtualOuNovo)
      }
      const respostaIntencao = await executarIntencaoCliente(from, u, intencaoTexto, text)
      if (respostaIntencao) return respostaIntencao
    }
    if (text && !ehMensagemEntradaGlobal(text) && GROQ_KEY) {
      const resp = await respostaIACliente(u, text)
      if (resp) {
        iniciarTimer(from)
        return {
          texto: resp,
          opcoes: [
      { id: "m_adv",      title: "👨‍⚖️ Falar com advogado" },
      { id: "m_inicio", title: "🏠 Menu do cliente" }
          ]
        }
      }
    }

    // Fallback — qualquer mensagem não reconhecida mostra o menu
    iniciarTimer(from)
    return await menuClienteComAudio(from, u)
  }

  // FALLBACK
  salvarEtapa(u._numero, STAGES.AUDIO_AGUARDANDO)
  iniciarTimer(from)
  return await responderTelaComAudio(
    from,
    u,
    respostaRecomecoMenuPrincipal(u),
    "Tudo bem. Vamos recomeçar com calma. Pode me contar sua situação novamente por áudio ou texto. Estou aqui para ajudar você.",
    "fallback recomeco"
  )
}

async function processar(from, nomeWA, text, msgObj) {
  if (ehWhatsAppAdmin(from)) {
    return await processarAdminWhatsApp(from, text)
  }

  // Fila por usuário: enfileira e processa em série, sem perder mensagens
  // enviadas enquanto o processamento anterior ainda está em curso.
  return new Promise((resolve) => {
    if (!filasMensagens.has(from)) filasMensagens.set(from, [])
    filasMensagens.get(from).push({ nomeWA, text, msgObj, resolve })

    // Só inicia o dreno se não há outro em andamento para este usuário
    if (filasMensagens.get(from).length === 1) {
      drenaFilaUsuario(from)
    }
  })
}

async function drenaFilaUsuario(from) {
  const fila = filasMensagens.get(from)
  while (fila && fila.length > 0) {
    const { nomeWA, text, msgObj, resolve } = fila[0]
    let resultado = null
    try {
      resultado = await processarComLock(from, nomeWA, text, msgObj)
    } catch (e) {
      logErro("fila_usuario", `Erro ao drenar fila | USER: ${sanitizarTextoEntrada(from) || "-"}`, e)
    }
    resolve(resultado)
    fila.shift()
  }
  filasMensagens.delete(from)
}

async function processarComLock(from, nomeWA, text, msgObj) {

  const { contato, u } = await resolverUsuarioPorHubSpot(from, nomeWA)
  const nomeWAEfetivo = contato?.id ? (nomeWA || u.nomeWA || "Cliente") : "Cliente"
  const textoSanitizado = sanitizarTextoEntrada(text)
  const estadoHubSpotAntes = serializarEstado(u)

  try {
    const resposta = await processarInterno(from, nomeWAEfetivo, textoSanitizado, msgObj, u)
    if (deveSincronizarEstadoHubSpot(estadoHubSpotAntes, u)) {
      await sincronizarNegocio(u)
    }
    return resposta
  } catch (err) {
    logContextoExecucao({ from, stage: u.stage, flow: "processar", msg: textoSanitizado })
    logErro("processar", "Falha ao processar solicitacao", err)
    iniciarTimer(from)
    return criarRespostaFallbackProcessamento()
  } finally {
    agendarPersistenciaUsers()
  }
}

// ================================================================
//  WEBHOOK
// ================================================================

app.get("/", (_, res) => res.send("Oraculum v6.4"))
app.get("/health", (_, res) => res.json({ status: "ok", version: "Oraculum v6.4" }))
app.get("/health-interno", validarWebhookInterno, (_, res) => res.json({
  status: "ok",
  version: "Oraculum v6.4",
  uptime: Math.floor((Date.now() - monitor.inicio) / 1000),
  conversas: monitor.conversas,
  cadastros: monitor.cadastros,
  ativos: Object.keys(users).length,
  erros_count: monitor.erros.length,
  ram_mb: (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(1)
}))
app.get("/resumo-diario", validarWebhookInterno, async (req, res) => {
  try {
    const limite = Math.max(1, Math.min(30, Number(req.query?.limit || req.query?.limite || 10) || 10))
    const resumo = await gerarResumoDiarioOperacional({ limite })
    if (sanitizarTextoEntrada(req.query?.format).toLowerCase() === "text") {
      return res.type("text/plain").send(textoResumoDiarioOperacional(resumo))
    }
    return res.json(resumo)
  } catch (e) {
    logErro("resumo-diario", e.message, e)
    return res.sendStatus(500)
  }
})
app.get("/webhook", (req, res) => {
  if (req.query["hub.mode"] && req.query["hub.verify_token"] === VERIFY_TOKEN) return res.status(200).send(req.query["hub.challenge"])
  return res.sendStatus(403)
})
async function processarMensagemWebhook(value, message) {
  const incomingMessageId = message.id || null
  const from   = message.from
  if (users[from] && incomingMessageId) {
    digitando(from, incomingMessageId, "").catch(() => {})
  }
  const contato = (value?.contacts || []).find(item => item?.wa_id === from) || value?.contacts?.[0]
  const nomeWA = contato?.profile?.name || "Cliente"
  const text   = sanitizarTextoEntrada(message.text?.body || message.interactive?.button_reply?.id || message.interactive?.list_reply?.id || "")
  const resposta = await processar(from, nomeWA, text, message)
  if (!resposta) return
  if (deveAtivarModoDigitando(resposta) && users[from]) {
    users[from].modoDigitando = true
    iniciarTimer(from)
  }
  const respostaVisual = aplicarEmojiTelaCliente(from, resposta)
  registrarUltimaPergunta(users[from], respostaVisual)
  agendarPersistenciaUsers()
  if (respostaVisual.texto) {
    await enviarAudioAutomaticoTela(from, users[from], respostaVisual, "webhook")
    await enviar(from, respostaVisual.texto, respostaVisual.opcoes, true, incomingMessageId)
  }
}

app.post("/webhook", validarAssinaturaMeta, (req, res) => {
  try {
    const mensagens = []
    for (const entry of req.body?.entry || []) {
      for (const change of entry?.changes || []) {
        const value = change?.value
        for (const message of value?.messages || []) {
          const from = message.from
          const text = sanitizarTextoEntrada(message.text?.body || message.interactive?.button_reply?.id || message.interactive?.list_reply?.id || "")
          const dedupeKey = criarChaveMensagemDuplicada(from, text, message)
          if (!mensagemJaProcessada(message.id, dedupeKey)) {
            mensagens.push({ value, message })
          }
        }
      }
    }

    res.sendStatus(200)
    if (!mensagens.length) return

    setImmediate(async () => {
      for (const { value, message } of mensagens) {
        try {
          await processarMensagemWebhook(value, message)
        } catch (err) {
          logErro("webhook_async", `Falha ao processar mensagem ${message?.id || "-"}: ${err.message}`, err)
        }
      }
    })
  } catch (err) { logErro("webhook", err.message, err); return res.sendStatus(500) }
})

const PORT = process.env.PORT || 10000
carregarUsersPersistidos()
restaurarTimersPersistidos()
// ------------------------------------------------------------------
// ROTA /agendamento — confirmação de ligação agendada
// Como usar GRATUITAMENTE (sem pagar HubSpot):
//   Opção 1: Make.com (gratuito, 1000 ops/mês):
//     - Crie cenário: HubSpot "Meeting Booked" ? HTTP POST ? https://seu-dominio.onrender.com/agendamento
//     - Body: { "phone": "{{contact.phone}}", "name": "{{contact.firstname}}", "datetime": "{{meeting.startTime}}" }
//   Opção 2: n8n (auto-hospedado, 100% gratuito):
//     - Trigger HubSpot ? HTTP Request para esta rota
//   Opção 3: Zapier free tier (100 tarefas/mês)
// ------------------------------------------------------------------
app.post("/agendamento", validarWebhookInterno, async (req, res) => {
  try {
    const { phone, name, datetime, caseid } = req.body
    if (!phone) return res.sendStatus(400)
    const numero = normalizarNumeroWhatsAppEnvio(phone)
    if (!numero) return res.sendStatus(400)
    const nomeCliente = name || "cliente"
    const dataHora    = datetime || "em breve"

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
      `✅ Olá, *${nomeCliente}*! Sua ligação com um especialista da Oráculum está confirmada.`,
      "",
      `🗓️ *Data e horário:* ${dataFormatada}`,
      "",
      "📞 Nosso advogado vai te ligar no número cadastrado. Deixe o celular por perto!",
      "",
      "Precisa reagendar? É só nos chamar aqui no WhatsApp.",
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

function classificarReuniaoCliente({ summary = "", description = "", tituloHubSpot = "", corpoHubSpot = "" } = {}) {
  const texto = normalizarTextoGatilho([summary, description, tituloHubSpot, corpoHubSpot].filter(Boolean).join(" "))
  const marcadoresConsultaCaso = [
    "[caso]",
    "[consulta]",
    "consulta juridica",
    "consulta do caso",
    "consulta principal",
    "consulta com advogado"
  ]

  if (marcadoresConsultaCaso.some(m => texto.includes(m))) return "consulta_caso"
  return "pontual"
}

// ------------------------------------------------------------------
// ROTA /buscar-contato-reuniao — recebe horário do evento do Calendar e retorna phone + name + tipo
// Chamada pelo Make.com após detectar evento novo no Google Calendar
// Body: { datetime: "2026-05-29T19:00:00" } — horário de início do evento
// ------------------------------------------------------------------
app.post("/buscar-contato-reuniao", validarWebhookInterno, async (req, res) => {
  try {
    const { datetime } = req.body
    if (!datetime) return res.status(400).json({ erro: "datetime obrigatório" })

    const dt = new Date(datetime)
    if (isNaN(dt.getTime())) return res.status(400).json({ erro: "datetime inválido" })
    const inicio = dt.getTime() - 5 * 60 * 1000
    const fim    = dt.getTime() + 5 * 60 * 1000

    // 1. Buscar reunião no HubSpot pelo horário (±5 min)
    const buscaReuniao = await axios.post(
      "https://api.hubapi.com/crm/v3/objects/meetings/search",
      {
        filterGroups: [{ filters: [{ propertyName: "hs_meeting_start_time", operator: "BETWEEN", value: String(inicio), highValue: String(fim) }] }],
        sorts: [{ propertyName: "hs_meeting_start_time", direction: "DESCENDING" }],
        properties: ["hs_meeting_title", "hs_meeting_body", "hs_meeting_start_time"],
        limit: 1
      },
      { headers: HS() }
    )
    const reuniao = buscaReuniao.data?.results?.[0]
    if (!reuniao) return res.status(404).json({ erro: "reunião não encontrada no HubSpot" })
    const meetingId = reuniao.id

    // 2. Buscar deal associado à reunião
    const assocDeal = await axios.get(
      `https://api.hubapi.com/crm/v3/objects/meetings/${meetingId}/associations/deals`,
      { headers: HS() }
    )
    const dealId = assocDeal.data?.results?.[0]?.id
    if (!dealId) return res.status(404).json({ erro: "deal não encontrado para a reunião" })

    // 3. Buscar contato associado ao deal
    const assocContato = await axios.get(
      `https://api.hubapi.com/crm/v3/objects/deals/${dealId}/associations/contacts`,
      { headers: HS() }
    )
    const contactId = assocContato.data?.results?.[0]?.id
    if (!contactId) return res.status(404).json({ erro: "contato não encontrado para o deal" })

    // 4. Buscar nome e telefone do contato
    const contato = await axios.get(
      `https://api.hubapi.com/crm/v3/objects/contacts/${contactId}?properties=firstname,phone`,
      { headers: HS() }
    )
    const props = contato.data?.properties || {}
    const phone = props.phone || null
    const name  = (props.firstname || "cliente").trim()
    if (!phone) return res.status(404).json({ erro: "telefone não encontrado para o contato" })

    // 5. Buscar evento no Google Calendar pelo horário (±5 min)
    let eventoCalendar = null
    let eventoCalendarId = null
    try {
      const cal = getCalendar()
      const eventos = await cal.events.list({
        calendarId: CALENDAR_ID,
        timeMin: new Date(inicio).toISOString(),
        timeMax: new Date(fim).toISOString(),
        singleEvents: true,
        maxResults: 1
      })
      eventoCalendar = eventos.data?.items?.[0] || null
      eventoCalendarId = eventoCalendar?.status === "cancelled" ? null : (eventoCalendar?.id || null)
    } catch (e) {
      logErro("buscar-contato-reuniao", "Erro ao buscar evento no Calendar: " + e.message)
    }

    const tipoReuniao = classificarReuniaoCliente({
      summary: eventoCalendar?.summary,
      description: eventoCalendar?.description,
      tituloHubSpot: reuniao.properties?.hs_meeting_title,
      corpoHubSpot: reuniao.properties?.hs_meeting_body
    })
    const ehConsultaCaso = tipoReuniao === "consulta_caso"

    // 6. Atualizar memória do bot — encontrar usuário pelo número normalizado
    const phoneNorm = normalizarNumeroWhatsAppEnvio(phone)
    for (const [from, u] of Object.entries(users)) {
      if (normalizarNumeroWhatsAppEnvio(from) === phoneNorm) {
        if (ehConsultaCaso && eventoCalendarId) {
          if (u._eventoCalendarId && u._eventoCalendarId !== eventoCalendarId) {
            try {
              const cal = getCalendar()
              await cal.events.delete({ calendarId: CALENDAR_ID, eventId: u._eventoCalendarId })
              logDebug(`[CALENDAR] Evento anterior cancelado por nova consulta manual: ${u._eventoCalendarId}`)
            } catch (e) {
              logErro("calendar", "Falha ao cancelar evento anterior por nova consulta manual: " + e.message)
            }
          }
          u._eventoCalendarId = eventoCalendarId
        }
        if (ehConsultaCaso && u.negocioId) {
          await hsMoverStage(u.negocioId, HS_STAGE.AGENDAMENTO)
          u.negocioStageId = HS_STAGE.AGENDAMENTO
        }
        agendarPersistenciaUsers()
        break
      }
    }

    const agora = Date.now()
    const msAteConsulta = dt.getTime() - agora
    const hojeStr = new Date().toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })
    const consultaStr = dt.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })
    let tipoLembrete = "24h"
    if (msAteConsulta > 0 && msAteConsulta < 60 * 60 * 1000) tipoLembrete = "1h"
    else if (msAteConsulta > 0 && consultaStr === hojeStr) tipoLembrete = "hoje"

    return res.json({ phone, name, tipo: tipoLembrete, tipoReuniao })
  } catch (e) {
    logErro("buscar-contato-reuniao", e.message)
    return res.sendStatus(500)
  }
})

// ------------------------------------------------------------------
// ROTA /evento-cancelado - libera AGENDAMENTO quando o Calendar/Make avisa cancelamento
// Body aceito: { eventId } ou { dealId } ou { phone }
// ------------------------------------------------------------------
app.post("/evento-cancelado", validarWebhookInterno, async (req, res) => {
  try {
    const { eventId, dealId, phone } = req.body || {}
    if (!eventId && !dealId && !phone) {
      return res.status(400).json({ erro: "eventId, dealId ou phone obrigatorio" })
    }

    const { from, u } = localizarUsuarioAgendamento({ eventId, dealId, phone })
    if (!u) return res.status(404).json({ erro: "usuario nao encontrado para o agendamento" })

    const resultado = await liberarAgendamentoERecalcularStage(u, "evento_cancelado_make")
    if (from) users[from] = u
    return res.json({ ok: true, ...resultado })
  } catch (e) {
    logErro("evento-cancelado", e.message, e)
    return res.sendStatus(500)
  }
})

// ------------------------------------------------------------------
// ROTA /pos-consulta - remove protecao de AGENDAMENTO e recalcula stage apos a consulta
// Body aceito: { eventId } ou { dealId } ou { phone }
// ------------------------------------------------------------------
app.post("/pos-consulta", validarWebhookInterno, async (req, res) => {
  try {
    const { eventId, dealId, phone, force } = req.body || {}
    const { from, u } = localizarUsuarioAgendamento({ eventId, dealId, phone })
    if (!u) return res.status(404).json({ erro: "usuario nao encontrado para o agendamento" })

    const eventoId = sanitizarTextoEntrada(eventId || u._eventoCalendarId)
    const estadoEvento = eventoId ? await obterEstadoEventoConsulta(eventoId) : { passou: Boolean(force), motivo: "sem_eventId" }

    if (estadoEvento.cancelado) {
      const resultadoCancelado = await liberarAgendamentoERecalcularStage(u, "evento_cancelado_pos_consulta")
      if (from) users[from] = u
      return res.json({ ok: true, evento: estadoEvento, ...resultadoCancelado })
    }

    if (!force && !estadoEvento.passou) {
      return res.json({ ok: true, atualizado: false, motivo: "consulta_ainda_futura", evento: estadoEvento })
    }

    u._ultimaConsultaRealizadaEm = new Date().toISOString()
    const resultado = await liberarAgendamentoERecalcularStage(u, "pos_consulta")
    if (from) users[from] = u
    return res.json({ ok: true, evento: estadoEvento, ...resultado })
  } catch (e) {
    logErro("pos-consulta", e.message, e)
    return res.sendStatus(500)
  }
})

// ------------------------------------------------------------------
// ROTA /lembrete - lembrete automatico antes da consulta
// Chamar via Make.com ou n8n com Google Calendar como gatilho:
//   - padrao: POST /lembrete com { phone, name, datetime, tipo: "24h" }
//   - no dia: POST /lembrete com { phone, name, datetime, tipo: "hoje" }
//   - 1h antes:  POST /lembrete com { phone, name, datetime, tipo: "1h" }
// ------------------------------------------------------------------
app.post("/lembrete", validarWebhookInterno, async (req, res) => {
  try {
    const { phone, name, datetime, tipo } = req.body
    if (!phone) return res.sendStatus(400)
    const numero = normalizarNumeroWhatsAppEnvio(phone)
    if (!numero) return res.sendStatus(400)
    const nomeCliente = (name || "cliente").trim()

    let dataFormatada = datetime || "em breve"
    try {
      if (datetime) {
        const d = new Date(datetime)
        if (!isNaN(d.getTime())) {
          dataFormatada = d.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" })
        }
      }
    } catch {}

    const msgReagendamento = "Para reagendar, é só nos chamar aqui no WhatsApp."

    let msg
    if (tipo === "1h") {
      msg = [
        "⏰ *Sua consulta começa em 1 hora!*",
        "",
        `Olá, *${nomeCliente}*! Daqui a pouco você tem sua ligação com um especialista da Oráculum.`,
        "",
        `🗓️ *Horário:* ${dataFormatada}`,
        "",
        "📞 Deixe o celular por perto — nosso advogado vai te ligar!",
        "",
        "Precisa reagendar de última hora?",
        msgReagendamento,
      ].join("\n")
    } else if (tipo === "hoje") {
      msg = [
        "📅 *Lembrete: sua consulta é hoje!*",
        "",
        `Olá, *${nomeCliente}*! Sua ligação com um especialista da Oráculum é *hoje*.`,
        "",
        `🗓️ *Horário:* ${dataFormatada}`,
        "",
        "📞 Nosso advogado vai te ligar no número cadastrado. Fique atento!",
        "",
        "Precisa reagendar?",
        msgReagendamento,
      ].join("\n")
    } else {
      msg = [
        "✅ *Consulta confirmada*",
        "",
        `Olá, *${nomeCliente}*! Sua ligação com um especialista da Oráculum está confirmada.`,
        "",
        `🗓️ *Data e horário:* ${dataFormatada}`,
        "",
        "📞 Nosso advogado vai te ligar no número cadastrado.",
        "",
        "Precisa reagendar?",
        msgReagendamento,
      ].join("\n")
    }

    await enviar(numero, msg, null, false)
    return res.sendStatus(200)
  } catch (e) { logErro("lembrete", e.message); return res.sendStatus(500) }
})

app.listen(PORT, () => console.log(`Oraculum v6.4 — porta ${PORT}`))
