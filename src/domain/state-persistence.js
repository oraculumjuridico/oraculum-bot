const fs = require("fs")
const { DOCS_EXTRA } = require("./documents-core")
const { sanitizarTextoEntrada } = require("../utils/text")
const { logDebug, logErro } = require("../utils/logging")

let persistUsersTimeout = null

let deps = {
  DATA_DIR: "",
  USERS_STATE_FILE: "",
  users: null,
  monitor: null,
  novoUsuario: null,
  gerarBriefingCaso: null,
  podeMostrarMenuCliente: null,
  etapaValida: null,
  STAGES: null
}

function configurarStatePersistence(config = {}) {
  deps = { ...deps, ...config }
}

function serializarEstado(u) {
  const clone = { ...u }

  const briefing = deps.gerarBriefingCaso(u)
  clone.score_emocional = briefing.scoreEmocional.valor
  clone.nivel_emocional = briefing.scoreEmocional.nivel
  clone.score_operacional = briefing.scoreOperacional
  clone.docs_status = {
    total: briefing.documentos.total,
    recebidos: briefing.documentos.recebidos,
    faltantesCriticos: briefing.documentos.faltantesCriticos,
    pendentesFluxo: briefing.documentos.pendentesFluxo
  }
  clone.docs_faltantes = briefing.documentos.faltantesCriticos
  clone.consulta_ativa = briefing.consultaAtiva
  clone.proxima_acao = briefing.proximaAcao

  // remover campos internos que não devem ir para o HubSpot
  delete clone.processing
  delete clone.timer
  delete clone.timerIncentivoDescricao
  delete clone.ultimaMsg
  delete clone._numero
  delete clone._hubspotSyncSnapshot
  delete clone._audioDescBuffer
  delete clone._urgenteAudioBuffer
  delete clone._stageRetomadaOriginal
  delete clone._negocioStageIdPendente
  delete clone._casosMenuCliente
  delete clone._menuClienteCasoAtivo
  delete clone._mostrarPainelCasosCliente
  delete clone._casoSelecionadoAudio
  delete clone._acaoPendente
  delete clone._menuClienteBoasVindas

  return JSON.stringify(clone)
}

function desserializarEstado(raw) {
  const texto = sanitizarTextoEntrada(raw)
  if (!texto) return null

  try {
    const parsed = JSON.parse(texto)
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null
    return parsed
  } catch (e) {
    logErro("hubspot", "snapshot inválido: " + e.message)
    return null
  }
}

function garantirDiretorioDados() {
  try { fs.mkdirSync(deps.DATA_DIR, { recursive: true }) }
  catch (e) { logErro("persistencia", "mkdir: " + e.message) }
}

function serializarUsers() {
  const saida = {}
  for (const [from, u] of Object.entries(deps.users)) {
    saida[from] = {
      ...u,
      _numero: null,
      processing: false,
      timer: null,
      timerIncentivoDescricao: null,
      _audioDescBuffer: null,
      _urgenteAudioBuffer: null,
      audiosDescCorrigidos: []
    }
  }
  return saida
}

function persistirUsersAgora() {
  let arquivoTemporario = null
  let descritor = null
  try {
    garantirDiretorioDados()
    const conteudo = JSON.stringify({
      savedAt: new Date().toISOString(),
      users: serializarUsers()
    }, null, 2)

    arquivoTemporario = `${deps.USERS_STATE_FILE}.${process.pid}.${Date.now()}.tmp`
    descritor = fs.openSync(arquivoTemporario, "wx")
    fs.writeFileSync(descritor, conteudo, "utf8")
    fs.fsyncSync(descritor)
    fs.closeSync(descritor)
    descritor = null

    fs.renameSync(arquivoTemporario, deps.USERS_STATE_FILE)
    arquivoTemporario = null
  } catch (e) {
    logErro("persistencia", "salvarUsers: " + e.message)
  } finally {
    if (descritor !== null) {
      try { fs.closeSync(descritor) } catch {}
    }
    if (arquivoTemporario) {
      try { fs.unlinkSync(arquivoTemporario) } catch {}
    }
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
  const base = deps.novoUsuario(data?.nomeWA || "Cliente")
  const hidratado = { ...base, ...data, timer: null, timerIncentivoDescricao: null }
  if (!Array.isArray(hidratado.docsEntregues)) hidratado.docsEntregues = []
  if (!Array.isArray(hidratado.docsAusentes)) hidratado.docsAusentes = []
  if (!Array.isArray(hidratado.docsPulados)) hidratado.docsPulados = []
  if (!Array.isArray(hidratado.docsParciais)) hidratado.docsParciais = []
  if (!Array.isArray(hidratado.docsDispensados)) hidratado.docsDispensados = []
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
  hidratado._hubspotSyncSnapshot = hidratado._hubspotSyncSnapshot || null
  hidratado._proximoStageAposDescricao = hidratado._proximoStageAposDescricao || null
  hidratado._proximaPerguntaAposDescricao = hidratado._proximaPerguntaAposDescricao || null
  hidratado._entradaPendenteTipo = hidratado._entradaPendenteTipo || null
  hidratado._entradaPendenteValor = hidratado._entradaPendenteValor || null
  hidratado._entradaPendenteOrigem = hidratado._entradaPendenteOrigem || null
  hidratado.aguardandoRetomada = Boolean(hidratado.aguardandoRetomada)
  hidratado.temCadastroCompleto = Boolean(hidratado.temCadastroCompleto || deps.podeMostrarMenuCliente(hidratado))
  // Se tem numeroCaso mas stage ficou como "inicio" por inconsistência, corrige para "cliente"
  if (hidratado.numeroCaso && hidratado.stage === "inicio") {
    hidratado.stage = deps.STAGES.CLIENTE
  }
  hidratado.etapa = deps.etapaValida(hidratado.etapa)
    ? hidratado.etapa
    : (deps.etapaValida(hidratado.stage) ? hidratado.stage : deps.STAGES.AUDIO_AGUARDANDO)
  hidratado.jaOfereceuRetomada = Boolean(hidratado.jaOfereceuRetomada)
  hidratado.jaIncentivouDescricao = Boolean(hidratado.jaIncentivouDescricao)
  hidratado._retomadaEhLeadFrio = Boolean(hidratado._retomadaEhLeadFrio)
  hidratado._stageRetomadaOriginal = deps.etapaValida(hidratado._stageRetomadaOriginal) ? hidratado._stageRetomadaOriginal : null
  hidratado._negocioStageIdPendente = sanitizarTextoEntrada(hidratado._negocioStageIdPendente) || null
  hidratado._audioFluxoTexto = hidratado._audioFluxoTexto || null
  hidratado._audioFluxoAcao = hidratado._audioFluxoAcao || null
  hidratado._audioFluxoResposta = hidratado._audioFluxoResposta || null
  hidratado._audioCanalTranscricao = hidratado._audioCanalTranscricao || null
  hidratado._audioCanalArea = hidratado._audioCanalArea || null
  hidratado.atendente = hidratado.atendente || null
  hidratado._urgenteAudioBuffer = null
  hidratado._urgenteAudioMime = hidratado._urgenteAudioMime || null
  hidratado._urgenteAudioNome = hidratado._urgenteAudioNome || null
  hidratado._urgenteAudioTexto = hidratado._urgenteAudioTexto || null
  hidratado._retornarParaConfirmacao = Boolean(hidratado._retornarParaConfirmacao)
  hidratado._origemConfirmacao = hidratado._origemConfirmacao || null
  hidratado._correcaoPendenteCampo = hidratado._correcaoPendenteCampo || null
  hidratado._correcaoPendenteValor = hidratado._correcaoPendenteValor || null
  hidratado._correcaoPendenteExtra = hidratado._correcaoPendenteExtra || null
  hidratado._correcaoPendenteSubcampo = hidratado._correcaoPendenteSubcampo || null
  hidratado._historicoDescricao = Array.isArray(hidratado._historicoDescricao) ? hidratado._historicoDescricao : []
  hidratado._resumoDescricaoIA = hidratado._resumoDescricaoIA || null
  hidratado._resumoDescricaoIABase = hidratado._resumoDescricaoIABase || null
  hidratado._casoAnteriorCliente = hidratado._casoAnteriorCliente && typeof hidratado._casoAnteriorCliente === "object" ? hidratado._casoAnteriorCliente : null
  hidratado._casoRecemAberto = Boolean(hidratado._casoRecemAberto)
  hidratado._contextoDocsCasoAtual = hidratado._contextoDocsCasoAtual && typeof hidratado._contextoDocsCasoAtual === "object" ? hidratado._contextoDocsCasoAtual : null
  hidratado._docKey = DOCS_EXTRA[hidratado._docKey] ? hidratado._docKey : null
  hidratado.processing = false
  hidratado.modoDigitando = Boolean(hidratado.modoDigitando)
  hidratado.aguardandoResposta = Boolean(hidratado.aguardandoResposta)
  hidratado.nomePerfilWhatsApp = hidratado.nomePerfilWhatsApp || data?.nomeWA || "Cliente"
  hidratado.origemCaptacao = hidratado.origemCaptacao || "whatsapp"
  // Preservar dados já confirmados/coletados — não resetar na hidratação
  hidratado.contatoId     = data?.contatoId     || null
  hidratado.negocioId     = data?.negocioId     || null
  hidratado.nome          = data?.nome          || null
  hidratado.nomeHubspot   = data?.nomeHubspot   || null
  hidratado.nomeConfirmado = Boolean(data?.nomeConfirmado)
  hidratado._numero = null
  return hidratado
}

function carregarUsersPersistidos() {
  try {
    if (!fs.existsSync(deps.USERS_STATE_FILE)) return
    const raw = fs.readFileSync(deps.USERS_STATE_FILE, "utf8")
    if (!raw.trim()) return
    const parsed = JSON.parse(raw)
    const savedUsers = parsed?.users || {}
    for (const [from, data] of Object.entries(savedUsers)) deps.users[from] = hidratarUsuarioPersistido(data)
    deps.monitor.conversas = Math.max(deps.monitor.conversas, Object.keys(deps.users).length)
    logDebug(`[PERSISTENCIA] ${Object.keys(savedUsers).length} conversa(s) restaurada(s)`)
  } catch (e) {
    logErro("persistencia", "carregarUsers: " + e.message)
  }
}

module.exports = {
  configurarStatePersistence,
  serializarEstado,
  desserializarEstado,
  garantirDiretorioDados,
  serializarUsers,
  persistirUsersAgora,
  agendarPersistenciaUsers,
  hidratarUsuarioPersistido,
  carregarUsersPersistidos
}
