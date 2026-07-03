const {
  hashConsultationState
} = require("./consultation-integrity-hash")
const {
  getConsultaStateAt
} = require("../consultation-replay-engine")
const {
  getConsultaView
} = require("../../consultation-read-model")

function normalizeStatus(status) {
  if (status === "encerrada") return "nao_compareceu"
  return status || "sem_consulta"
}

function toIntegrityProjection(dealId, state = {}, source) {
  const event = state.eventoAtual || state.currentEvent || null
  const status = source === "calendar"
    ? normalizeStatus(state.statusCalendar || state.status)
    : normalizeStatus(state.status)
  return {
    dealId: String(dealId),
    status,
    event: event
      ? {
          calendarEventId: event.calendarEventId || event.eventId || null,
          inicio: event.inicio || null,
          fim: event.fim || null,
          tipoConsulta: event.tipoConsulta || "inicial"
        }
      : null
  }
}

function compareValues(expected, actual, source, field = "") {
  if (
    expected && actual &&
    typeof expected === "object" && typeof actual === "object" &&
    !Array.isArray(expected) && !Array.isArray(actual)
  ) {
    const keys = [...new Set([...Object.keys(expected), ...Object.keys(actual)])].sort()
    return keys.flatMap(key =>
      compareValues(expected[key], actual[key], source, field ? `${field}.${key}` : key)
    )
  }
  if (JSON.stringify(expected) === JSON.stringify(actual)) return []
  return [{ field, expected: expected ?? null, actual: actual ?? null, source }]
}

async function verifyConsultationIntegrity({
  dealId,
  loaders = {}
}) {
  if (!dealId) throw new Error("dealId obrigatorio para verificacao de integridade")

  const loadReadModelState = loaders.readModel || getConsultaView
  const loadReplayState = loaders.replay || getConsultaStateAt
  const readModelState = await loadReadModelState(dealId)
  const replayState = await loadReplayState(dealId)
  const calendarProjection = loaders.calendar
    ? await loaders.calendar(dealId)
    : readModelState

  const replayComparable = toIntegrityProjection(dealId, replayState, "replay")
  const readModelComparable = toIntegrityProjection(dealId, readModelState, "readModel")
  const calendarComparable = toIntegrityProjection(dealId, calendarProjection, "calendar")
  const replayHash = hashConsultationState(replayComparable)
  const readModelHash = hashConsultationState(readModelComparable)
  const calendarHash = hashConsultationState(calendarComparable)
  const inconsistencies = [
    ...compareValues(replayComparable, readModelComparable, "readModel"),
    ...compareValues(replayComparable, calendarComparable, "calendar")
  ]

  return {
    healthy: inconsistencies.length === 0,
    replayHash,
    readModelHash,
    calendarHash,
    inconsistencies
  }
}

module.exports = {
  normalizeStatus,
  toIntegrityProjection,
  compareValues,
  verifyConsultationIntegrity
}
