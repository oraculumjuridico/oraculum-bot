const assert = require("node:assert/strict")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")

const integrityFile = path.join(os.tmpdir(), `consulta-self-healed-${process.pid}.jsonl`)
const decisionsFile = path.join(os.tmpdir(), `consulta-self-healed-decisions-${process.pid}.jsonl`)
process.env.CONSULTA_INTEGRITY_EVENTS_FILE = integrityFile
process.env.CONSULTA_DECISIONS_FILE = decisionsFile

const {
  recordIntegrityDriftDetected
} = require("../src/domain/consultation/integrity/consultation-integrity-drift-event")
const {
  readIntegrityEvents,
  hashIntegrityEvent
} = require("../src/domain/consultation/integrity/consultation-integrity-event-store")
const {
  recordConsultationSelfHealed,
  readConsultationSelfHealedEvents
} = require("../src/domain/consultation/integrity/consultation-self-healed-event")
const {
  readConsultaDecisions
} = require("../src/domain/consultation/consultation-decision-audit")

async function main() {
  const consultationId = "deal-self-healed"
  await recordIntegrityDriftDetected({
    consultationId,
    detectedAt: "2026-06-28T17:00:00.000Z",
    driftType: "SESSION_PROJECTION_DRIFT",
    severity: "HIGH",
    repairStrategy: "REFRESH_SESSION_PROJECTION",
    replayHash: "replay",
    readModelHash: "read",
    calendarHash: "calendar",
    inconsistencies: [{ field: "consultaStatus" }]
  })

  const verificationBefore = {
    healthy: false,
    replayHash: "replay",
    readModelHash: "read",
    calendarHash: "calendar",
    inconsistencies: [{ field: "consultaStatus" }]
  }
  const verificationAfter = {
    healthy: true,
    replayHash: "healthy",
    readModelHash: "healthy",
    calendarHash: "healthy",
    inconsistencies: []
  }
  const recorded = await recordConsultationSelfHealed({
    consultationId,
    repairedAt: "2026-06-28T17:01:00.000Z",
    driftType: "SESSION_PROJECTION_DRIFT",
    repairStrategy: "REFRESH_SESSION_PROJECTION",
    previousHashes: {
      replayHash: "replay",
      readModelHash: "read",
      calendarHash: "calendar"
    },
    resultingHashes: {
      replayHash: "healthy",
      readModelHash: "healthy",
      calendarHash: "healthy"
    },
    verificationBefore,
    verificationAfter
  })

  const events = readIntegrityEvents()
  assert.equal(events.length, 2)
  assert.equal(events[0].type, "consultation.integrity_drift_detected")
  assert.equal(events[1].type, "consultation.self_healed")
  assert.equal(events[1].schemaVersion, 3)
  assert.equal(events[1].previousEventHash, events[0].eventHash)
  assert.equal(events[1].eventHash, hashIntegrityEvent(events[1]))
  assert.equal(events[1].payload.verificationAfter.healthy, true)
  assert.equal(recorded.event.eventId, events[1].eventId)
  assert.equal(readConsultationSelfHealedEvents(consultationId).length, 1)

  const decisions = readConsultaDecisions(consultationId)
  const healingDecision = decisions.find(item => item.type === "SELF_HEALING_EXECUTED")
  assert.ok(healingDecision)
  assert.equal(healingDecision.output.driftType, "SESSION_PROJECTION_DRIFT")
  assert.equal(healingDecision.output.repairStrategy, "REFRESH_SESSION_PROJECTION")
  assert.equal(healingDecision.eventId, events[1].eventId)

  const countBeforeFailure = readIntegrityEvents().length
  await assert.rejects(
    recordConsultationSelfHealed({
      consultationId,
      driftType: "SESSION_PROJECTION_DRIFT",
      repairStrategy: "REFRESH_SESSION_PROJECTION",
      previousHashes: {},
      resultingHashes: {},
      verificationBefore,
      verificationAfter: { ...verificationAfter, healthy: false }
    }),
    error => error.code === "CONSULTATION_SELF_HEALED_REVALIDATION_REQUIRED"
  )
  assert.equal(readIntegrityEvents().length, countBeforeFailure)
  assert.equal(readConsultaDecisions(consultationId).length, decisions.length)

  console.log("consultation-self-healed-event.test.js: ok")
}

main()
  .finally(() => {
    try { fs.unlinkSync(integrityFile) } catch {}
    try { fs.unlinkSync(decisionsFile) } catch {}
  })
  .catch(error => {
    console.error(error)
    process.exitCode = 1
  })
