const { criarChaveOperacaoHubSpot, obterOperacaoHubSpot, registrarOperacaoHubSpot } = require("./state-persistence")

function erroReconciliacao(operationKey, cause) {
  const error = new Error("HUBSPOT_RECONCILIATION_REQUIRED")
  error.code = "HUBSPOT_RECONCILIATION_REQUIRED"
  error.operationKey = operationKey
  error.cause = cause
  return error
}

async function obterOuCriarContato({ messageId, identity, numeroCaso, procurar, criar }) {
  const operationKey = criarChaveOperacaoHubSpot({ messageId, operationType: "contact", identity, numeroCaso })
  const anterior = obterOperacaoHubSpot(operationKey)
  if (anterior?.contactId) return { contactId: anterior.contactId, operationKey, reconciled: true }
  if (anterior?.status === "reconciliation_required") throw erroReconciliacao(operationKey)
  registrarOperacaoHubSpot({ operationKey, messageId, operationType: "contact", numeroCaso, status: "searching", incrementAttempt: true })
  let encontrado
  try { encontrado = await procurar() } catch (cause) {
    registrarOperacaoHubSpot({ operationKey, messageId, operationType: "contact", numeroCaso, status: "reconciliation_required", error: cause })
    throw erroReconciliacao(operationKey, cause)
  }
  if (encontrado?.id) {
    registrarOperacaoHubSpot({ operationKey, messageId, operationType: "contact", contactId: encontrado.id, numeroCaso, status: "completed" })
    return { contactId: encontrado.id, operationKey, reconciled: true }
  }
  if (anterior?.status === "creating") {
    registrarOperacaoHubSpot({ operationKey, messageId, operationType: "contact", numeroCaso, status: "reconciliation_required" })
    throw erroReconciliacao(operationKey)
  }
  registrarOperacaoHubSpot({ operationKey, messageId, operationType: "contact", numeroCaso, status: "creating" })
  const contactId = await criar()
  if (!contactId) {
    registrarOperacaoHubSpot({ operationKey, messageId, operationType: "contact", numeroCaso, status: "reconciliation_required" })
    throw erroReconciliacao(operationKey)
  }
  registrarOperacaoHubSpot({ operationKey, messageId, operationType: "contact", contactId, numeroCaso, status: "created" })
  return { contactId, operationKey, reconciled: false }
}

async function obterOuCriarNegocio({ messageId, identity, numeroCaso, procurar, criar }) {
  const operationKey = criarChaveOperacaoHubSpot({ messageId, operationType: "deal", identity, numeroCaso })
  const anterior = obterOperacaoHubSpot(operationKey)
  if (anterior?.dealId) return { dealId: anterior.dealId, operationKey, reconciled: true }
  if (anterior?.status === "reconciliation_required" || anterior?.status === "creating") {
    registrarOperacaoHubSpot({ operationKey, messageId, operationType: "deal", numeroCaso, status: "reconciliation_required" })
    throw erroReconciliacao(operationKey)
  }
  registrarOperacaoHubSpot({ operationKey, messageId, operationType: "deal", numeroCaso, status: "searching", incrementAttempt: true })
  let encontrado
  try { encontrado = await procurar() } catch (cause) {
    registrarOperacaoHubSpot({ operationKey, messageId, operationType: "deal", numeroCaso, status: "reconciliation_required", error: cause })
    throw erroReconciliacao(operationKey, cause)
  }
  if (encontrado?.id) {
    registrarOperacaoHubSpot({ operationKey, messageId, operationType: "deal", dealId: encontrado.id, numeroCaso, status: "completed" })
    return { dealId: encontrado.id, operationKey, reconciled: true }
  }
  registrarOperacaoHubSpot({ operationKey, messageId, operationType: "deal", numeroCaso, status: "creating" })
  const dealId = await criar()
  if (!dealId) {
    registrarOperacaoHubSpot({ operationKey, messageId, operationType: "deal", numeroCaso, status: "reconciliation_required" })
    throw erroReconciliacao(operationKey)
  }
  registrarOperacaoHubSpot({ operationKey, messageId, operationType: "deal", dealId, numeroCaso, status: "created" })
  return { dealId, operationKey, reconciled: false }
}

function concluirOperacaoHubSpot(operationKey, ids = {}) {
  return operationKey ? registrarOperacaoHubSpot({ operationKey, ...ids, status: "completed" }) : null
}

module.exports = { obterOuCriarContato, obterOuCriarNegocio, concluirOperacaoHubSpot, erroReconciliacao }
