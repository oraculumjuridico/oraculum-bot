const {
  appendConsultaDecision
} = require("../consultation-decision-audit")
const {
  appendIntegrityEvent,
  readIntegrityEvents
} = require("./consultation-integrity-event-store")

const EVENT_TYPE = "consultation.self_healed"

function readConsultationSelfHealedEvents(consultationId = null) {
  const events = readIntegrityEvents().filter(event => event.type === EVENT_TYPE)
  return consultationId
    ? events.filter(event => event.payload.consultationId === String(consultationId))
    : events
}

async function recordConsultationSelfHealed({
  consultationId,
  repairedAt = new Date().toISOString(),
  driftType,
  repairStrategy,
  previousHashes,
  resultingHashes,
  verificationBefore,
  verificationAfter
}) {
  if (verificationAfter?.healthy !== true) {
    const error = new Error("self_healed exige revalidacao saudavel")
    error.code = "CONSULTATION_SELF_HEALED_REVALIDATION_REQUIRED"
    throw error
  }
  const payload = {
    consultationId: String(consultationId),
    repairedAt: new Date(repairedAt).toISOString(),
    driftType,
    repairStrategy,
    previousHashes,
    resultingHashes,
    verificationBefore,
    verificationAfter
  }
  const event = await appendIntegrityEvent({
    type: EVENT_TYPE,
    timestamp: payload.repairedAt,
    payload
  })
  const decision = appendConsultaDecision({
    dealId: payload.consultationId,
    type: "SELF_HEALING_EXECUTED",
    decision: "SELF_HEALING_EXECUTED",
    origin: "system",
    input: { previousHashes },
    output: {
      type: "SELF_HEALING_EXECUTED",
      driftType,
      repairStrategy
    },
    eventId: event.eventId,
    timestamp: payload.repairedAt
  })
  return { event, decision }
}

module.exports = {
  EVENT_TYPE,
  readConsultationSelfHealedEvents,
  recordConsultationSelfHealed
}
