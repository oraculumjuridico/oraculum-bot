const crypto = require("node:crypto")

const CONSULTATION_VERSION = 3
const EVENT_MODEL = Object.freeze({
  required: [
    "schemaVersion",
    "eventId",
    "sequence",
    "tipo",
    "dealId",
    "timestamp",
    "consultaStatus",
    "metadata",
    "origem",
    "chaveIdempotencia",
    "registradoEm",
    "previousEventHash",
    "eventHash",
    "dealSequence",
    "previousDealEventHash"
  ],
  eventTypes: [
    "consulta.scheduled",
    "consulta.rescheduled",
    "consulta.canceled",
    "consulta.expired",
    "consulta.completed",
    "consulta.no_show"
  ],
  origins: ["system", "admin", "client", "reconciliation"],
  metadata: [
    "calendarEventId",
    "inicio",
    "fim",
    "duracaoMin",
    "tipoConsulta",
    "versaoIntegracao"
  ]
})

function eventModelHash(model = EVENT_MODEL) {
  return crypto.createHash("sha256").update(JSON.stringify(model)).digest("hex")
}

const VERSION_MODEL_HASH = Object.freeze({
  1: "ab0bf39e7e88d2f887ec0e1c55ae52b2a23ccae0b8cf20d440839b12951873fa",
  2: "3806ee1886015b09ac6eaec9a962c2362ea93a60700ff214904fe9f798910287",
  3: "499fb01f6d7b8fe59b0ed47a15ccb442dc6400e8ecf84da11f415d181a2b1f59"
})

function assertEventModelVersion() {
  const atual = eventModelHash()
  const registrado = VERSION_MODEL_HASH[CONSULTATION_VERSION]
  if (!registrado || registrado !== atual) {
    const erro = new Error(
      `modelo de evento alterado sem incremento de CONSULTATION_VERSION (${CONSULTATION_VERSION})`
    )
    erro.code = "CONSULTATION_EVENT_MODEL_VERSION_MISMATCH"
    throw erro
  }
  return true
}

function assertEventSchemaVersion(evento = {}) {
  if (!Number.isInteger(evento.schemaVersion)) {
    const erro = new Error("schemaVersion obrigatorio no evento de consulta")
    erro.code = "CONSULTATION_EVENT_SCHEMA_VERSION_REQUIRED"
    throw erro
  }
  if (evento.schemaVersion !== CONSULTATION_VERSION) {
    const erro = new Error(`schemaVersion de consulta nao suportado: ${evento.schemaVersion}`)
    erro.code = "CONSULTATION_EVENT_SCHEMA_VERSION_UNSUPPORTED"
    throw erro
  }
  return true
}

function versionConsultaEvent(evento = {}) {
  return { ...evento, schemaVersion: CONSULTATION_VERSION }
}

module.exports = {
  CONSULTATION_VERSION,
  EVENT_MODEL,
  VERSION_MODEL_HASH,
  eventModelHash,
  assertEventModelVersion,
  assertEventSchemaVersion,
  versionConsultaEvent
}
