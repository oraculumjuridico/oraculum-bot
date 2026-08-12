const { sanitizarTextoEntrada } = require("./text")

let monitor = { erros: [] }
let DEBUG_LOGS = String(process.env.DEBUG_LOGS || "").toLowerCase() === "true"

function configurarLogging(opcoes = {}) {
  if (opcoes.monitor) monitor = opcoes.monitor
  if (Object.prototype.hasOwnProperty.call(opcoes, "DEBUG_LOGS")) DEBUG_LOGS = opcoes.DEBUG_LOGS
}

function logDebug(...args) {
  if (DEBUG_LOGS) console.log(...args)
}

function mascararTelefoneLog(numero) {
  const digitos = String(numero || "").replace(/\D/g, "")
  if (digitos.length < 8) return ""
  return `${digitos.slice(0, 4)}*****${digitos.slice(-4)}`
}

function sanitizarCampoLog(valor) {
  return sanitizarTextoEntrada(valor)
    .replace(/Bearer\s+[^\s,;]+/gi, "Bearer [REDACTED]")
    .replace(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g, "[CPF REDACTED]")
}

function logInfo(evento = {}) {
  const payload = {
    event: sanitizarCampoLog(evento.event),
    route: sanitizarCampoLog(evento.route),
    status: sanitizarCampoLog(evento.status),
    requestId: sanitizarCampoLog(evento.requestId),
    phoneMasked: mascararTelefoneLog(evento.phoneMasked || evento.phone),
    dealId: sanitizarCampoLog(evento.dealId),
    contactId: sanitizarCampoLog(evento.contactId),
    numeroCaso: sanitizarCampoLog(evento.numeroCaso),
    timestamp: evento.timestamp || new Date().toISOString()
  }

  if (evento.durationMs !== undefined) {
    const durationMs = Number(evento.durationMs)
    if (Number.isFinite(durationMs)) payload.durationMs = durationMs
  }
  for (const key of ["providerMessageId", "action", "channel", "fallback", "failureCode", "failureDescription", "queue", "stages", "receivedCount", "hubspotTotal", "after", "filteredCount", "errorCode", "operation", "searchType", "httpStatus", "resultsIsArray", "rawResultCount", "total", "hasPaging", "classificationType", "classificationConfidence", "ocrHasText", "ocrConfidenceBucket", "preprocessingProfile", "requestedSide", "recognizedSides", "evidenceStatus", "partyResolutionStatus", "reasonCode", "qualityWarnings", "retryAttempt", "selectedVariant", "blockers", "optionalUnavailable"]) {
    if (evento[key] !== undefined) payload[key] = sanitizarCampoLog(evento[key])
  }

  console.log(JSON.stringify(payload))
  return payload
}

function logContextoExecucao({ from = "", stage = "", flow = "", msg = "" } = {}) {
  logDebug(`[USER] ${sanitizarTextoEntrada(from) || "-"}`)
  logDebug(`[STAGE] ${sanitizarTextoEntrada(stage) || "-"}`)
  logDebug(`[FLOW] ${sanitizarTextoEntrada(flow) || "-"}`)
  logDebug(`[MSG] ${sanitizarTextoEntrada(msg) || "-"}`)
}

function logErro(tipo, msg, err = null) {
  monitor.erros.push({ tipo, msg, ts: new Date().toISOString() })
  if (monitor.erros.length > 100) monitor.erros.shift()

  const tipoNormalizado = sanitizarTextoEntrada(tipo).toUpperCase()
  if (tipoNormalizado === "STAGE_INVALIDO") {
    console.error(`[ERRO][STAGE_INVALIDO] ${msg}`)
  } else if (tipoNormalizado) {
    console.error(`[ERRO] [${tipoNormalizado}] ${msg}`)
  } else {
    console.error(`[ERRO] ${msg}`)
  }

  if (err?.stack) console.error(`[ERRO] ${err.stack}`)
}

function sanitizarMensagemHubSpot(mensagem) {
  return sanitizarTextoEntrada(mensagem)
    .replace(/Bearer\s+[^\s,;]+/gi, "Bearer [REDACTED]")
    .replace(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g, "[CPF REDACTED]")
    .replace(/(?:\+?55[\s.-]?)?(?:\(?\d{2}\)?[\s.-]?)?9?\d{4}[\s.-]?\d{4}\b/g, "[PHONE REDACTED]")
}

function detalhesErroHubSpot(erro, contexto = {}) {
  const response = erro?.response || {}
  const data = response?.data || {}
  const correlationId =
    data?.correlationId ||
    data?.correlation_id ||
    response?.headers?.["x-hubspot-correlation-id"] ||
    response?.headers?.["x-correlation-id"] ||
    null
  const propriedades = Array.isArray(contexto.properties)
    ? contexto.properties
    : Object.keys(contexto.properties || {})

  return {
    operation: sanitizarTextoEntrada(contexto.operation) || null,
    contactId: sanitizarTextoEntrada(contexto.contactId) || null,
    dealId: sanitizarTextoEntrada(contexto.dealId) || null,
    httpStatus: response?.status || null,
    correlationId: sanitizarTextoEntrada(correlationId) || null,
    properties: propriedades
      .map(propriedade => sanitizarTextoEntrada(propriedade))
      .filter(Boolean),
    errorCode: sanitizarTextoEntrada(data?.category || data?.code || erro?.code || erro?.name) || null,
    message: sanitizarMensagemHubSpot(data?.message || erro?.message || "Erro HubSpot")
  }
}

function logErroHubSpot(erro, contexto = {}) {
  const detalhes = detalhesErroHubSpot(erro, contexto)
  logErro("hubspot", JSON.stringify(detalhes))
  return detalhes
}

module.exports = {
  configurarLogging,
  logDebug,
  logInfo,
  logContextoExecucao,
  logErro,
  sanitizarMensagemHubSpot,
  detalhesErroHubSpot,
  logErroHubSpot,
  mascararTelefoneLog
}
