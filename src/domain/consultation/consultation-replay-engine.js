const { getConsultaHistory: getStoredHistory } = require("../consultation-events")
const { withConsultaReadAccess } = require("../consultation-guards")

function reduceConsultaEvent(state, event) {
  const next = {
    ...state,
    totalEvents: state.totalEvents + 1,
    lastEventId: event.eventId,
    lastEventType: event.tipo,
    lastEventAt: event.timestamp,
    currentEvent: event.metadata?.calendarEventId
      ? {
          calendarEventId: event.metadata.calendarEventId,
          inicio: event.metadata.inicio || null,
          fim: event.metadata.fim || null,
          duracaoMin: event.metadata.duracaoMin ?? null,
          tipoConsulta: event.metadata.tipoConsulta || "inicial"
        }
      : state.currentEvent
  }

  if (event.tipo === "consulta.scheduled") next.status = "agendada"
  if (event.tipo === "consulta.rescheduled") {
    next.status = "agendada"
    next.metrics = { ...next.metrics, rescheduled: next.metrics.rescheduled + 1 }
  }
  if (event.tipo === "consulta.canceled") {
    next.status = "cancelada"
    next.metrics = { ...next.metrics, canceled: next.metrics.canceled + 1 }
  }
  if (event.tipo === "consulta.expired" || event.tipo === "consulta.no_show") {
    next.status = "nao_compareceu"
    next.metrics = {
      ...next.metrics,
      noShow: next.metrics.noShow + (event.tipo === "consulta.no_show" ? 1 : 0)
    }
  }
  if (event.tipo === "consulta.completed") {
    next.status = "realizada"
    next.metrics = { ...next.metrics, completed: next.metrics.completed + 1 }
  }
  return next
}

function initialConsultaState(dealId) {
  return {
    dealId: String(dealId || ""),
    status: "sem_consulta",
    currentEvent: null,
    lastEventId: null,
    lastEventType: null,
    lastEventAt: null,
    totalEvents: 0,
    metrics: { canceled: 0, rescheduled: 0, noShow: 0, completed: 0 }
  }
}

function replayConsultaEvents(dealId, events = [], at = null) {
  const limit = at ? new Date(at).getTime() : null
  if (at && !Number.isFinite(limit)) throw new Error("timestamp de replay invalido")
  const selected = limit === null
    ? events
    : events.filter(event => new Date(event.timestamp).getTime() <= limit)
  const state = selected.reduce(reduceConsultaEvent, initialConsultaState(dealId))
  return {
    ...state,
    replayedAt: at ? new Date(at).toISOString() : new Date().toISOString(),
    eventStoreSequence: selected.at(-1)?.sequence || 0
  }
}

function getConsultaHistory(dealId) {
  return withConsultaReadAccess("consultation.replay.history", () => getStoredHistory(dealId))
}

function getConsultaStateAt(dealId, timestamp = null) {
  return replayConsultaEvents(dealId, getConsultaHistory(dealId), timestamp)
}

module.exports = {
  initialConsultaState,
  reduceConsultaEvent,
  replayConsultaEvents,
  getConsultaHistory,
  getConsultaStateAt
}
