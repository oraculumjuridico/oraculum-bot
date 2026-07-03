const path = require("node:path")
const {
  installConsultationDependencyFirewall
} = require("./consultation-dependency-firewall")

installConsultationDependencyFirewall()

const readModel = require("../consultation-read-model")
const metrics = require("../consultation-metrics")
const {
  CONSULTATION_VERSION,
  eventModelHash,
  assertEventModelVersion
} = require("./event-versioning")
const {
  loadConsultationManifest,
  checkConsultationIntegrity
} = require("./consultation-integrity-check")
const replay = require("./consultation-replay-engine")
const {
  appendConsultaDecision,
  readConsultaDecisions
} = require("./consultation-decision-audit")
const {
  createConsultationLegalSnapshot
} = require("./consultation-legal-snapshot")
const {
  buildConsultaLegalDossier: buildDossier
} = require("./consultation-legal-dossier-builder")
const {
  generateConsultaNarrative
} = require("./consultation-narrative-generator")
const {
  verifyConsultaLegalDossier
} = require("./consultation-audit-verifier")
const {
  refreshConsultationSessionProjection
} = require("./projections/consultation-session-recovery")

function assertConsultationArchitecture({
  root = path.join(__dirname, "..", "..", "..")
} = {}) {
  const { auditArchitecture } = require("../../scripts/consultation-architecture-audit")
  const result = auditArchitecture({
    root,
    baselinePath: path.join(root, "consultation-architecture-baseline.json"),
    mode: "strict"
  })
  if (result.status === "failed") {
    const error = new Error(`consultation architecture audit failed: ${result.violacoes.length}`)
    error.code = "CONSULTATION_ARCHITECTURE_AUDIT_FAILED"
    error.violacoes = result.violacoes
    throw error
  }
  return result
}

assertEventModelVersion()

function assertConsultationReleaseIntegrity({
  root = path.join(__dirname, "..", "..", "..")
} = {}) {
  const manifest = loadConsultationManifest()
  if (
    manifest.consultationVersion !== CONSULTATION_VERSION ||
    manifest.schema?.currentVersion !== CONSULTATION_VERSION ||
    manifest.eventModelHash !== eventModelHash()
  ) {
    const error = new Error("versao do facade, schema ou event model diverge do consultation manifest")
    error.code = "CONSULTATION_MANIFEST_VERSION_DRIFT"
    throw error
  }
  const publicEntries = Object.keys(module.exports).sort()
  if (JSON.stringify(publicEntries) !== JSON.stringify([...manifest.publicEntries].sort())) {
    const error = new Error("API publica de consulta diverge do consultation manifest")
    error.code = "CONSULTATION_PUBLIC_API_DRIFT"
    throw error
  }
  return checkConsultationIntegrity({ root, manifest })
}

async function getConsultaView(dealId, dependencies) {
  const view = await readModel.getConsultaView(dealId, dependencies)
  appendConsultaDecision({
    dealId,
    decision: "consulta.current_state",
    origin: "system",
    input: { dealId: String(dealId) },
    output: { status: view.status, flags: view.flags },
    eventId: view.eventoAtual?.calendarEventId || null
  })
  return view
}

function getConsultaHistory(dealId) {
  return replay.getConsultaHistory(dealId)
}

function getConsultaStateAt(dealId, timestamp = null) {
  const state = replay.getConsultaStateAt(dealId, timestamp)
  appendConsultaDecision({
    dealId,
    decision: "consulta.replay",
    origin: "system",
    input: { timestamp },
    output: { status: state.status, eventStoreSequence: state.eventStoreSequence },
    eventId: state.currentEvent?.calendarEventId || null
  })
  return state
}

async function getConsultaFullAudit(dealId, dependencies = undefined, options = {}) {
  const manifest = loadConsultationManifest()
  return createConsultationLegalSnapshot(dealId, {
    getCurrentView: id => readModel.getConsultaView(id, dependencies),
    domainVersion: manifest.domainVersion,
    consultationVersion: CONSULTATION_VERSION,
    eventModelHash: eventModelHash(),
    generatedAt: options.generatedAt
  })
}

function buildConsultaLegalDossier(dealId, dependencies = undefined, options = {}) {
  return buildDossier(dealId, {
    generatedAt: options.generatedAt,
    getFullAudit: (id, generatedAt) =>
      getConsultaFullAudit(id, dependencies, { generatedAt })
  })
}

async function criarEventoConsulta(cliente, ...args) {
  const eventId = await readModel.criarEventoConsulta(cliente, ...args)
  appendConsultaDecision({
    dealId: cliente?.negocioId,
    decision: "consulta.schedule",
    origin: args[2]?.origem || "system",
    input: { inicio: args[0], duracaoMin: args[1] },
    output: { eventId },
    eventId
  })
  return eventId
}

async function definirResultadoConsulta(eventId, status) {
  const result = await readModel.definirResultadoConsulta(eventId, status)
  appendConsultaDecision({
    dealId: result.metadata?.dealId,
    decision: "consulta.manual_result",
    origin: "admin",
    input: { status },
    output: { status: result.status },
    eventId
  })
  return result
}

async function cancelarEventosAtivosDoDeal(dealId, options) {
  const result = await readModel.cancelarEventosAtivosDoDeal(dealId, options)
  appendConsultaDecision({
    dealId,
    decision: "consulta.cancel_active_events",
    origin: options?.origem || "system",
    input: options || null,
    output: result,
    eventId: options?.excetoEventId || null
  })
  return result
}

async function vincularEventoConsulta(eventId, metadata) {
  const result = await readModel.vincularEventoConsulta(eventId, metadata)
  appendConsultaDecision({
    dealId: metadata?.dealId,
    decision: "consulta.link_event",
    origin: "system",
    input: metadata,
    output: { status: result.status },
    eventId
  })
  return result
}

async function appendConsultaEvent(event) {
  const result = await readModel.appendConsultaEvent(event)
  appendConsultaDecision({
    dealId: event.dealId,
    decision: "consulta.append_event",
    origin: event.origem || "system",
    input: { tipo: event.tipo, consultaStatus: event.consultaStatus },
    output: { appended: result.appended, eventId: result.evento?.eventId },
    eventId: event.metadata?.calendarEventId || null
  })
  return result
}

module.exports = Object.freeze({
  CONSULTATION_VERSION,
  eventModelHash,
  assertEventModelVersion,
  assertConsultationArchitecture,
  assertConsultationReleaseIntegrity,
  installConsultationDependencyFirewall,
  getConsultaView,
  getConsultaHistory,
  getConsultaStateAt,
  getConsultaFullAudit,
  getConsultaDecisionHistory: readConsultaDecisions,
  buildConsultaLegalDossier,
  generateConsultaNarrative,
  verifyConsultaLegalDossier,
  refreshConsultationSessionProjection,
  listConsultasAtivasViews: readModel.listConsultasAtivasViews,
  getConsultaCalendarEventState: readModel.getConsultaCalendarEventState,
  findConsultaCalendarEvent: readModel.findConsultaCalendarEvent,
  listConsultaCalendarEventsForReconciliation: readModel.listConsultaCalendarEventsForReconciliation,
  findConsultaCalendarEventInRange: readModel.findConsultaCalendarEventInRange,
  buscarHorariosDisponiveis: readModel.buscarHorariosDisponiveis,
  criarEventoConsulta,
  definirResultadoConsulta,
  cancelarEventosAtivosDoDeal,
  vincularEventoConsulta,
  appendConsultaEvent,
  classificarEstadoCalendar: readModel.classificarEstadoCalendar,
  selecionarEventoConsultaMaisRecente: readModel.selecionarEventoConsultaMaisRecente,
  calcularMetricasConsulta: metrics.calcularMetricasConsulta,
  persistirMetricasConsulta: metrics.persistirMetricasConsulta
})

assertConsultationReleaseIntegrity()
