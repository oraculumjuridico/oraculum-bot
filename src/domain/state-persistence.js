const fs = require("fs")
const path = require("path")
const crypto = require("crypto")
const { DOCS_EXTRA } = require("./documents-core")
const { sanitizarTextoEntrada } = require("../utils/text")
const { logDebug, logErro } = require("../utils/logging")
const { normalizarContextoConversa } = require("./conversation-context")
const { mirrorStateFile } = require("../infrastructure/external-state-repository")

let persistUsersTimeout = null
let persistUsersMaxTimeout = null
let persistAdminAssistedTimeout = null
const PERSIST_DEBOUNCE_MS = 300
const PERSIST_MAX_WAIT_MS = 2000
const WEBHOOK_INBOX_SCHEMA_VERSION = 1
const WEBHOOK_RECEIPT_RETENTION_MS = 7 * 24 * 60 * 60 * 1000
const ADMIN_ASSISTED_SESSION_SCHEMA_VERSION = 1
const ADMIN_ASSISTED_SESSION_TTL_MS = 24 * 60 * 60 * 1000

let webhookInbox = criarWebhookInboxVazia()

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

function criarWebhookInboxVazia() {
  return {
    schemaVersion: WEBHOOK_INBOX_SCHEMA_VERSION,
    updatedAt: null,
    sequence: 0,
    records: {},
    receipts: {}
  }
}

function clonarJson(value) {
  return JSON.parse(JSON.stringify(value))
}

function arquivoWebhookInbox() {
  return path.join(deps.DATA_DIR, "webhook-inbox.json")
}

function arquivoSessoesAdminAssistidas() {
  return path.join(deps.DATA_DIR, "admin-assisted-sessions.json")
}

function erroArquivoTemporariamenteIndisponivel(error) {
  return ["EPERM", "EBUSY", "EACCES"].includes(error?.code)
}

function esperarSync(ms) {
  const buffer = new SharedArrayBuffer(4)
  const view = new Int32Array(buffer)
  Atomics.wait(view, 0, 0, ms)
}

function renomearComRetry(temporario, destino) {
  const tentativas = [0, 25, 50, 100, 200, 400, 800]
  let ultimoErro = null

  for (const espera of tentativas) {
    if (espera > 0) esperarSync(espera)
    try {
      fs.renameSync(temporario, destino)
      return true
    } catch (error) {
      ultimoErro = error
      if (!erroArquivoTemporariamenteIndisponivel(error)) throw error
    }
  }

  throw ultimoErro
}

function gravarJsonAtomico(caminho, payload) {
  fs.mkdirSync(path.dirname(caminho), { recursive: true })
  const temporario = `${caminho}.${process.pid}.${Date.now()}.tmp`
  let descritor = null
  let renomeado = false
  try {
    descritor = fs.openSync(temporario, "wx", 0o600)
    fs.writeFileSync(descritor, JSON.stringify(payload, null, 2), "utf8")
    fs.fsyncSync(descritor)
    fs.closeSync(descritor)
    descritor = null
    renomeado = renomearComRetry(temporario, caminho)
    mirrorStateFile(caminho).catch(error => logErro("persistencia_externa", error.message))
  } finally {
    if (descritor !== null) {
      try { fs.closeSync(descritor) } catch {}
    }
    if (renomeado) {
      try { fs.unlinkSync(temporario) } catch {}
    }
  }
}

function criarChaveWebhookDuravel(message = {}, fallbackKey = "") {
  const messageId = sanitizarTextoEntrada(message?.id)
  if (messageId) return messageId
  const base = [
    sanitizarTextoEntrada(message?.from),
    sanitizarTextoEntrada(message?.type),
    sanitizarTextoEntrada(message?.timestamp),
    sanitizarTextoEntrada(message?.audio?.id || message?.voice?.id || message?.image?.id || message?.document?.id || message?.video?.id),
    sanitizarTextoEntrada(message?.interactive?.button_reply?.id || message?.interactive?.list_reply?.id),
    sanitizarTextoEntrada(message?.text?.body),
    sanitizarTextoEntrada(fallbackKey)
  ].join("|")
  return `fallback:${crypto.createHash("sha256").update(base).digest("hex")}`
}

function limparWebhookReceiptsExpirados(inbox, agora = Date.now()) {
  let alterado = false
  for (const [key, receipt] of Object.entries(inbox.receipts || {})) {
    if (Date.parse(receipt?.expiresAt || "") <= agora) {
      delete inbox.receipts[key]
      alterado = true
    }
  }
  return alterado
}

function persistirProximaWebhookInbox(proxima) {
  proxima.updatedAt = new Date().toISOString()
  gravarJsonAtomico(arquivoWebhookInbox(), proxima)
  webhookInbox = proxima
}

function carregarWebhookInbox() {
  const caminho = arquivoWebhookInbox()
  if (!fs.existsSync(caminho)) {
    webhookInbox = criarWebhookInboxVazia()
    return { pending: 0, recovered: 0 }
  }

  const parsed = JSON.parse(fs.readFileSync(caminho, "utf8"))
  if (parsed?.schemaVersion !== WEBHOOK_INBOX_SCHEMA_VERSION) {
    throw new Error(`schema de webhook inbox incompatível: ${parsed?.schemaVersion}`)
  }

  const proxima = {
    ...criarWebhookInboxVazia(),
    ...parsed,
    records: parsed.records && typeof parsed.records === "object" ? parsed.records : {},
    receipts: parsed.receipts && typeof parsed.receipts === "object" ? parsed.receipts : {}
  }
  let recovered = 0
  for (const record of Object.values(proxima.records)) {
    if (record?.status === "processing" || record?.status === "error") {
      record.status = "pending"
      record.updatedAt = new Date().toISOString()
      recovered += 1
    }
  }
  const alterado = recovered > 0 || limparWebhookReceiptsExpirados(proxima)
  webhookInbox = proxima
  if (alterado) persistirProximaWebhookInbox(proxima)
  return {
    pending: Object.values(proxima.records).filter(record => record?.status === "pending").length,
    recovered
  }
}

function registrarMensagensWebhook(records = []) {
  if (!Array.isArray(records) || records.length === 0) {
    return { inserted: [], duplicates: [] }
  }

  const proxima = clonarJson(webhookInbox)
  limparWebhookReceiptsExpirados(proxima)
  const inserted = []
  const duplicates = []
  const agora = new Date().toISOString()

  for (const input of records) {
    const key = sanitizarTextoEntrada(input?.key)
    if (!key) throw new Error("chave de webhook obrigatória")
    if (proxima.records[key] || proxima.receipts[key]) {
      duplicates.push(key)
      continue
    }
    proxima.sequence = Number(proxima.sequence || 0) + 1
    proxima.records[key] = {
      key,
      messageId: sanitizarTextoEntrada(input.messageId) || null,
      from: sanitizarTextoEntrada(input.from) || null,
      status: "pending",
      receivedAt: input.receivedAt || agora,
      updatedAt: agora,
      attempts: 0,
      lastError: null,
      sequence: proxima.sequence,
      payload: input.payload
    }
    inserted.push(key)
  }

  if (inserted.length > 0 || duplicates.length !== records.length) {
    persistirProximaWebhookInbox(proxima)
  }
  return { inserted, duplicates }
}

function listarWebhookPendentes() {
  return Object.values(webhookInbox.records)
    .filter(record => record?.status === "pending")
    .sort((a, b) => Number(a.sequence || 0) - Number(b.sequence || 0))
    .map(clonarJson)
}

function alterarRegistroWebhook(key, alterar) {
  const proxima = clonarJson(webhookInbox)
  const record = proxima.records[key]
  if (!record) return false
  alterar(record, proxima)
  persistirProximaWebhookInbox(proxima)
  return true
}

function marcarWebhookProcessing(key) {
  return alterarRegistroWebhook(key, record => {
    record.status = "processing"
    record.attempts = Number(record.attempts || 0) + 1
    record.updatedAt = new Date().toISOString()
    record.lastError = null
  })
}

function marcarWebhookCompleted(key) {
  return alterarRegistroWebhook(key, (record, inbox) => {
    const completedAt = new Date().toISOString()
    inbox.receipts[key] = {
      key,
      messageId: record.messageId || null,
      completedAt,
      expiresAt: new Date(Date.now() + WEBHOOK_RECEIPT_RETENTION_MS).toISOString()
    }
    delete inbox.records[key]
  })
}

function marcarWebhookError(key, error) {
  return alterarRegistroWebhook(key, record => {
    record.status = "error"
    record.updatedAt = new Date().toISOString()
    record.lastError = {
      code: sanitizarTextoEntrada(error?.code || error?.name) || null,
      message: "Falha ao processar mensagem"
    }
  })
}

function obterEstadoWebhookInbox() {
  return clonarJson(webhookInbox)
}

function sessaoAdminAssistidaAtiva(sessao = {}) {
  return Boolean(sessao?.adminAssistido?.ativo)
}

function sessaoAdminAssistidaExpirada(sessao = {}, agora = Date.now()) {
  const referencia = Date.parse(
    sessao?.adminAssistido?.atualizadoEm ||
    sessao?.adminAssistido?.iniciadoEm ||
    sessao?.ts ||
    ""
  )
  if (!Number.isFinite(referencia)) return false
  return agora - referencia > ADMIN_ASSISTED_SESSION_TTL_MS
}

function serializarSessoesAdminAssistidas(sessoesAdminWhatsApp) {
  const sessoes = {}
  if (!sessoesAdminWhatsApp || typeof sessoesAdminWhatsApp.entries !== "function") return sessoes

  const agora = Date.now()
  for (const [chave, sessao] of sessoesAdminWhatsApp.entries()) {
    if (!sessaoAdminAssistidaAtiva(sessao)) continue
    if (sessaoAdminAssistidaExpirada(sessao, agora)) continue
    sessoes[chave] = {
      listaAtiva: "admin_assistido",
      ts: sessao.ts || agora,
      adminAssistido: sessao.adminAssistido
    }
  }
  return sessoes
}

function persistirSessoesAdminAssistidasAgora(sessoesAdminWhatsApp, { propagarErro = false } = {}) {
  if (persistAdminAssistedTimeout) {
    clearTimeout(persistAdminAssistedTimeout)
    persistAdminAssistedTimeout = null
  }

  try {
    garantirDiretorioDados()
    gravarJsonAtomico(arquivoSessoesAdminAssistidas(), {
      schemaVersion: ADMIN_ASSISTED_SESSION_SCHEMA_VERSION,
      savedAt: new Date().toISOString(),
      ttlMs: ADMIN_ASSISTED_SESSION_TTL_MS,
      sessoes: serializarSessoesAdminAssistidas(sessoesAdminWhatsApp)
    })
  } catch (e) {
    logErro("persistencia", "salvarSessoesAdminAssistidas: " + e.message)
    if (propagarErro) throw e
  }
}

function agendarPersistenciaSessoesAdminAssistidas(sessoesAdminWhatsApp) {
  if (persistAdminAssistedTimeout) clearTimeout(persistAdminAssistedTimeout)
  persistAdminAssistedTimeout = setTimeout(() => {
    persistirSessoesAdminAssistidasAgora(sessoesAdminWhatsApp)
  }, PERSIST_DEBOUNCE_MS)
}

function carregarSessoesAdminAssistidasPersistidas(sessoesAdminWhatsApp) {
  try {
    if (!sessoesAdminWhatsApp || typeof sessoesAdminWhatsApp.set !== "function") return { restauradas: 0, expiradas: 0 }
    const caminho = arquivoSessoesAdminAssistidas()
    if (!fs.existsSync(caminho)) return { restauradas: 0, expiradas: 0 }

    const raw = fs.readFileSync(caminho, "utf8")
    if (!raw.trim()) return { restauradas: 0, expiradas: 0 }
    const parsed = JSON.parse(raw)
    if (parsed?.schemaVersion !== ADMIN_ASSISTED_SESSION_SCHEMA_VERSION) {
      throw new Error(`schema de sessoes admin assistidas incompativel: ${parsed?.schemaVersion}`)
    }

    const agora = Date.now()
    let restauradas = 0
    let expiradas = 0
    for (const [chave, sessao] of Object.entries(parsed.sessoes || {})) {
      if (!sessaoAdminAssistidaAtiva(sessao) || sessaoAdminAssistidaExpirada(sessao, agora)) {
        expiradas += 1
        continue
      }
      sessoesAdminWhatsApp.set(chave, {
        ...sessao,
        listaAtiva: "admin_assistido",
        adminAssistido: {
          ...sessao.adminAssistido,
          aguardandoConfirmacaoRetomada: true
        },
        ts: Date.now()
      })
      restauradas += 1
    }

    if (expiradas > 0) persistirSessoesAdminAssistidasAgora(sessoesAdminWhatsApp)
    if (restauradas > 0) logDebug(`[PERSISTENCIA] ${restauradas} atendimento(s) assistido(s) restaurado(s)`)
    return { restauradas, expiradas }
  } catch (e) {
    logErro("persistencia", "carregarSessoesAdminAssistidas: " + e.message)
    return { restauradas: 0, expiradas: 0 }
  }
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
  delete clone._casoAnteriorCliente
  delete clone.contextoConversa

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
    const usuarioSerializado = {
      ...u,
      _numero: null,
      processing: false,
      timer: null,
      timerIncentivoDescricao: null,
      _audioDescBuffer: null,
      _urgenteAudioBuffer: null,
      audiosDescCorrigidos: []
    }
    delete usuarioSerializado._menuClienteCasoAtivo
    delete usuarioSerializado._casosMenuCliente
    delete usuarioSerializado._acaoPendente
    delete usuarioSerializado._mostrarPainelCasosCliente
    saida[from] = usuarioSerializado
  }
  return saida
}

function persistirUsersAgora({ propagarErro = false } = {}) {
  if (persistUsersTimeout) {
    clearTimeout(persistUsersTimeout)
    persistUsersTimeout = null
  }
  if (persistUsersMaxTimeout) {
    clearTimeout(persistUsersMaxTimeout)
    persistUsersMaxTimeout = null
  }

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
    mirrorStateFile(deps.USERS_STATE_FILE, conteudo).catch(error => logErro("persistencia_externa", error.message))
  } catch (e) {
    logErro("persistencia", "salvarUsers: " + e.message)
    if (propagarErro) throw e
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
    persistirUsersAgora()
  }, PERSIST_DEBOUNCE_MS)

  if (!persistUsersMaxTimeout) {
    persistUsersMaxTimeout = setTimeout(() => {
      persistirUsersAgora()
    }, PERSIST_MAX_WAIT_MS)
  }
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
  hidratado._hubspotConsultadoEm = hidratado._hubspotConsultadoEm || null
  hidratado._hubspotResultadoId = hidratado._hubspotResultadoId || null
  hidratado.processing = false
  hidratado.modoDigitando = Boolean(hidratado.modoDigitando)
  hidratado.aguardandoResposta = Boolean(hidratado.aguardandoResposta)
  hidratado.nomePerfilWhatsApp = hidratado.nomePerfilWhatsApp || data?.nomeWA || "Cliente"
  hidratado.origemCaptacao = hidratado.origemCaptacao || "whatsapp"
  hidratado.consultaStatus = sanitizarTextoEntrada(hidratado.consultaStatus) || "sem_consulta"
  hidratado.tipoConsulta = sanitizarTextoEntrada(hidratado.tipoConsulta) || "inicial"
  hidratado.contextoConversa = normalizarContextoConversa(hidratado.contextoConversa)
  hidratado._menuClienteCasoAtivo = false
  hidratado._casosMenuCliente = null
  hidratado._acaoPendente = null
  hidratado._mostrarPainelCasosCliente = false
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
  criarChaveWebhookDuravel,
  carregarWebhookInbox,
  registrarMensagensWebhook,
  listarWebhookPendentes,
  marcarWebhookProcessing,
  marcarWebhookCompleted,
  marcarWebhookError,
  obterEstadoWebhookInbox,
  serializarEstado,
  desserializarEstado,
  garantirDiretorioDados,
  serializarUsers,
  persistirUsersAgora,
  agendarPersistenciaUsers,
  persistirSessoesAdminAssistidasAgora,
  agendarPersistenciaSessoesAdminAssistidas,
  carregarSessoesAdminAssistidasPersistidas,
  hidratarUsuarioPersistido,
  carregarUsersPersistidos
}
