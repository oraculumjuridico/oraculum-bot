const LABELS = Object.freeze({
  "consulta.scheduled": "Consulta agendada",
  "consulta.rescheduled": "Consulta remarcada",
  "consulta.canceled": "Consulta cancelada",
  "consulta.expired": "Consulta encerrada sem conclusão registrada",
  "consulta.completed": "Consulta marcada como realizada",
  "consulta.no_show": "Não comparecimento registrado"
})

function formatTimestamp(timestamp) {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "medium",
    timeZone: "America/Sao_Paulo"
  }).format(new Date(timestamp))
}

function narrativeItem(event, index) {
  const calendarId = event.metadata?.calendarEventId
  const period = event.metadata?.inicio
    ? ` Horário previsto: ${formatTimestamp(event.metadata.inicio)}.`
    : ""
  return {
    order: index + 1,
    timestamp: event.timestamp,
    eventId: event.eventId,
    type: event.tipo,
    text: `${formatTimestamp(event.timestamp)} — ${LABELS[event.tipo] || event.tipo}.${period}${calendarId ? ` Evento Calendar: ${calendarId}.` : ""}`
  }
}

function generateConsultaNarrative(dealId, events = []) {
  const items = events.map(narrativeItem)
  const text = [
    `Narrativa cronológica da consulta vinculada ao caso ${dealId}.`,
    ...items.map(item => item.text),
    items.length
      ? `Estado final documentado: ${events.at(-1).consultaStatus}.`
      : "Não existem eventos de consulta registrados."
  ].join("\n")
  return {
    dealId: String(dealId),
    language: "pt-BR",
    chronology: "ascending",
    totalEvents: items.length,
    items,
    text
  }
}

module.exports = {
  LABELS,
  formatTimestamp,
  narrativeItem,
  generateConsultaNarrative
}
