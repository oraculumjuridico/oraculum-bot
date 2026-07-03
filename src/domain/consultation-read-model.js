const {
  obterEstadoConsulta,
  listarEventosConsultaAtivos,
  obterEstadoEventoConsulta,
  buscarEventoConsultaPorDeal,
  listarTodosEventosConsulta,
  buscarPrimeiroEventoCalendarNoIntervalo,
  classificarEstadoEvento,
  selecionarEventoConsultaMaisRecente,
  buscarHorariosDisponiveis,
  criarEventoConsulta,
  definirResultadoConsulta,
  cancelarEventosAtivosDoDeal,
  vincularEventoConsulta,
  configurarConsultaEventSink
} = require("./calendar-scheduling")
const { getConsultaTimeline, appendConsultaEvent } = require("./consultation-events")
const { withConsultaReadAccess } = require("./consultation-guards")
const { versionConsultaEvent } = require("./consultation/event-versioning")

const appendVersionedConsultaEvent = evento => appendConsultaEvent(versionConsultaEvent(evento))
configurarConsultaEventSink(appendVersionedConsultaEvent)

function eventoAtualResumo(estado = {}) {
  if (!estado?.eventId) return null
  const inicio = estado.inicio || null
  const fim = estado.fim || null
  const duracaoMin = inicio && fim
    ? Math.max(0, Math.round((new Date(fim).getTime() - new Date(inicio).getTime()) / 60000))
    : null
  return {
    calendarEventId: estado.eventId,
    inicio,
    fim,
    duracaoMin,
    tipoConsulta: estado.metadata?.tipoConsulta || "inicial",
    statusCalendar: estado.status,
    versaoIntegracao: estado.metadata?.versaoIntegracao || null
  }
}

function resumirTimeline(timeline = []) {
  return timeline.map(item => ({
    ordem: item.ordem,
    tipo: item.tipo,
    timestamp: item.timestamp,
    consultaStatus: item.consultaStatus,
    origem: item.origem,
    calendarEventId: item.metadata?.calendarEventId || null,
    de: item.de,
    para: item.para
  }))
}

function derivarStatusAtual(estadoCalendar = {}, timeline = []) {
  const statusCalendar = estadoCalendar.status || "sem_consulta"
  const eventIdAtual = estadoCalendar.eventId || null
  const eventosDoAtual = eventIdAtual
    ? timeline.filter(item => item.metadata?.calendarEventId === eventIdAtual)
    : []
  const ultimoDoAtual = eventosDoAtual.at(-1) || null
  const teveCompletionExplicito = eventosDoAtual.some(item => item.tipo === "consulta.completed")
  const teveNoShowExplicito = eventosDoAtual.some(item => item.tipo === "consulta.no_show")
  const teveCancelamentoExplicito = eventosDoAtual.some(item => item.tipo === "consulta.canceled")

  if (statusCalendar === "cancelada" || teveCancelamentoExplicito && ultimoDoAtual?.tipo === "consulta.canceled") {
    return "cancelada"
  }
  if (statusCalendar === "realizada" || teveCompletionExplicito) return "realizada"
  if (statusCalendar === "nao_compareceu" || teveNoShowExplicito) return "nao_compareceu"
  if (statusCalendar === "encerrada" && !teveCompletionExplicito) return "nao_compareceu"
  return statusCalendar
}

function montarConsultaView(dealId, estadoCalendar, timeline = []) {
  const historico = resumirTimeline(timeline)
  const status = derivarStatusAtual(estadoCalendar, timeline)
  const ultimo = timeline.at(-1) || null
  const eventoAtual = eventoAtualResumo(estadoCalendar)
  const metricas = {
    cancelamentos: timeline.filter(item => item.tipo === "consulta.canceled").length,
    remarcacoes: timeline.filter(item => item.tipo === "consulta.rescheduled").length,
    noShow: timeline.filter(item => item.tipo === "consulta.no_show").length +
      (estadoCalendar.status === "encerrada" &&
       !timeline.some(item =>
         item.metadata?.calendarEventId === estadoCalendar.eventId &&
         ["consulta.completed", "consulta.no_show"].includes(item.tipo)
       ) ? 1 : 0),
    realizadas: timeline.filter(item => item.tipo === "consulta.completed").length
  }
  return {
    dealId: String(dealId || ""),
    status,
    statusCalendar: estadoCalendar.status || "sem_consulta",
    eventoAtual,
    historico,
    metricas,
    flags: {
      temConsultaAtiva: status === "agendada",
      teveNoShow: metricas.noShow > 0,
      foiCanceladaUltima: ultimo?.tipo === "consulta.canceled",
      quantidadeRemarcacoes: metricas.remarcacoes
    },
    // Compatibilidade de leitura durante a consolidação dos consumidores.
    eventId: eventoAtual?.calendarEventId || null,
    inicio: eventoAtual?.inicio || null,
    fim: eventoAtual?.fim || null,
    metadata: eventoAtual
      ? {
          tipoConsulta: eventoAtual.tipoConsulta,
          versaoIntegracao: eventoAtual.versaoIntegracao
        }
      : {},
    cancelado: status === "cancelada",
    passou: ["encerrada", "nao_compareceu", "realizada"].includes(status),
    encontrado: Boolean(eventoAtual),
    fonteEstadoAtual: "google_calendar",
    fonteHistorico: "consulta_event_store"
  }
}

async function getConsultaView(dealId, dependencias = {}) {
  const obterEstado = dependencias.obterEstadoConsulta || obterEstadoConsulta
  const obterTimeline = dependencias.getConsultaTimeline || getConsultaTimeline
  const [estadoCalendar, timeline] = await withConsultaReadAccess("getConsultaView", () =>
    Promise.all([
      obterEstado(dealId),
      Promise.resolve(obterTimeline(dealId))
    ])
  )
  return montarConsultaView(dealId, estadoCalendar, timeline)
}

async function listConsultasAtivasViews(dependencias = {}) {
  const listarAtivos = dependencias.listarEventosConsultaAtivos || listarEventosConsultaAtivos
  const obterTimeline = dependencias.getConsultaTimeline || getConsultaTimeline
  const estados = await withConsultaReadAccess("listConsultasAtivasViews", () => listarAtivos())
  return estados.map(estado => {
    const dealId = estado.metadata?.dealId
    const timeline = withConsultaReadAccess("listConsultasAtivasViews", () => obterTimeline(dealId))
    return montarConsultaView(dealId, estado, timeline)
  }).filter(view => view.flags.temConsultaAtiva)
}

function getConsultaCalendarEventState(eventId) {
  return withConsultaReadAccess("admin.calendar.event-state", () => obterEstadoEventoConsulta(eventId))
}

function findConsultaCalendarEvent(dealId) {
  return withConsultaReadAccess("admin.calendar.find-event", () => buscarEventoConsultaPorDeal(dealId))
}

function listConsultaCalendarEventsForReconciliation(options) {
  return withConsultaReadAccess("admin.calendar.reconciliation", () => listarTodosEventosConsulta(options))
}

function findConsultaCalendarEventInRange(inicio, fim) {
  return withConsultaReadAccess(
    "integration.calendar.find-in-range",
    () => buscarPrimeiroEventoCalendarNoIntervalo(inicio, fim)
  )
}

module.exports = {
  getConsultaView,
  listConsultasAtivasViews,
  getConsultaCalendarEventState,
  findConsultaCalendarEvent,
  listConsultaCalendarEventsForReconciliation,
  findConsultaCalendarEventInRange,
  buscarHorariosDisponiveis,
  criarEventoConsulta,
  definirResultadoConsulta,
  cancelarEventosAtivosDoDeal,
  vincularEventoConsulta,
  appendConsultaEvent: appendVersionedConsultaEvent,
  montarConsultaView,
  derivarStatusAtual,
  // Fachada de leitura para rotinas administrativas e de reconciliação.
  classificarEstadoCalendar: (...args) =>
    withConsultaReadAccess("admin.calendar.classify", () => classificarEstadoEvento(...args)),
  selecionarEventoConsultaMaisRecente: (...args) =>
    withConsultaReadAccess("admin.calendar.select-event", () => selecionarEventoConsultaMaisRecente(...args))
}
