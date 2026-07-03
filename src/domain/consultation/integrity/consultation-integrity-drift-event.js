const {
  appendConsultaDecision
} = require("../consultation-decision-audit")
const {
  SCHEMA_VERSION,
  INTEGRITY_EVENTS_FILE,
  LOCK_FILE,
  hashIntegrityEvent,
  readIntegrityEvents,
  appendIntegrityEvent
} = require("./consultation-integrity-event-store")

const EVENT_TYPE = "consultation.integrity_drift_detected"

function readIntegrityDriftEvents(consultationId = null) {
  const events = readIntegrityEvents().filter(event => event.type === EVENT_TYPE)
  return consultationId
    ? events.filter(event => event.payload.consultationId === String(consultationId))
    : events
}

async function recordIntegrityDriftDetected({
  consultationId,
  detectedAt = new Date().toISOString(),
  driftType,
  severity,
  repairStrategy,
  replayHash,
  readModelHash,
  calendarHash,
  inconsistencies = []
}) {
  if (!consultationId || !driftType || !severity || !repairStrategy) {
    throw new Error("dados obrigatorios ausentes no evento de drift")
  }
  const payload = {
    consultationId: String(consultationId),
    detectedAt: new Date(detectedAt).toISOString(),
    driftType,
    severity,
    repairStrategy,
    replayHash,
    readModelHash,
    calendarHash,
    inconsistencies
  }
  const event = await appendIntegrityEvent({
    type: EVENT_TYPE,
    timestamp: payload.detectedAt,
    payload
  })

  const decision = appendConsultaDecision({
    dealId: payload.consultationId,
    type: "INTEGRITY_DRIFT_DETECTED",
    decision: "INTEGRITY_DRIFT_DETECTED",
    origin: "system",
    input: {
      replayHash,
      readModelHash,
      calendarHash
    },
    output: {
      type: "INTEGRITY_DRIFT_DETECTED",
      driftType,
      severity
    },
    eventId: event.eventId,
    timestamp: payload.detectedAt
  })
  return { event, decision }
}

module.exports = {
  EVENT_TYPE,
  SCHEMA_VERSION,
  INTEGRITY_EVENTS_FILE,
  LOCK_FILE,
  hashIntegrityEvent,
  readIntegrityDriftEvents,
  recordIntegrityDriftDetected
}
