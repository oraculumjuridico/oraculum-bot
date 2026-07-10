const axios = require("axios")
const { logDebug, logErro } = require("../utils/logging")

const DEFAULT_TIMEOUT_MS = 1500

function valorTexto(valor) {
  return String(valor || "").trim()
}

function montarPayloadCancelamentoReengajamento({
  phone = "",
  dealId = "",
  contactId = "",
  numeroCaso = "",
  reason = "user_replied",
  receivedAt = new Date().toISOString()
} = {}) {
  return {
    phone: valorTexto(phone),
    dealId: valorTexto(dealId),
    contactId: valorTexto(contactId),
    numeroCaso: valorTexto(numeroCaso),
    reason: valorTexto(reason) || "user_replied",
    receivedAt: valorTexto(receivedAt) || new Date().toISOString()
  }
}

function cancelarReengajamentosPendentes(dados = {}, deps = {}) {
  const webhookUrl = valorTexto(
    Object.prototype.hasOwnProperty.call(deps, "webhookUrl")
      ? deps.webhookUrl
      : process.env.REENGAGEMENT_CANCEL_WEBHOOK_URL
  )
  if (!webhookUrl) return { disparado: false, motivo: "webhook_ausente" }

  const payload = montarPayloadCancelamentoReengajamento(dados)
  if (!payload.phone) return { disparado: false, motivo: "phone_ausente", payload }

  const httpClient = deps.httpClient || axios
  const logger = deps.logger || { logDebug, logErro }
  const timeoutMsConfigurado = Number(
    Object.prototype.hasOwnProperty.call(deps, "timeoutMs")
      ? deps.timeoutMs
      : process.env.REENGAGEMENT_CANCEL_WEBHOOK_TIMEOUT_MS
  )
  const timeout = Number.isFinite(timeoutMsConfigurado) && timeoutMsConfigurado > 0
    ? timeoutMsConfigurado
    : DEFAULT_TIMEOUT_MS

  const request = Promise.resolve()
    .then(() => httpClient.post(webhookUrl, payload, {
      timeout,
      headers: { "Content-Type": "application/json" }
    }))
    .then(response => {
      logger.logDebug(
        `[REENGAJAMENTO_CANCEL] cancelamento solicitado | phone=${payload.phone} | status=${response?.status || "-"}`
      )
      return { ok: true, status: response?.status || null, payload }
    })
    .catch(error => {
      logger.logErro(
        "reengajamento_cancelamento",
        `Falha ao solicitar cancelamento de reengajamento para ${payload.phone}: ${error.message}`,
        error
      )
      return { ok: false, erro: error.message, payload }
    })

  return { disparado: true, payload, request }
}

module.exports = {
  cancelarReengajamentosPendentes,
  montarPayloadCancelamentoReengajamento
}
