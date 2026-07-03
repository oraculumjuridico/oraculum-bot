const assert = require("node:assert/strict")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")

const integrityFile = path.join(os.tmpdir(), `consulta-integrity-drift-${process.pid}.jsonl`)
const decisionsFile = path.join(os.tmpdir(), `consulta-integrity-decisions-${process.pid}.jsonl`)
process.env.CONSULTA_INTEGRITY_EVENTS_FILE = integrityFile
process.env.CONSULTA_DECISIONS_FILE = decisionsFile

const {
  recordIntegrityDriftDetected,
  readIntegrityDriftEvents,
  hashIntegrityEvent
} = require("../src/domain/consultation/integrity/consultation-integrity-drift-event")
const {
  readConsultaDecisions
} = require("../src/domain/consultation/consultation-decision-audit")

async function main() {
  const consultationId = "deal-integrity-drift"
  const operationalState = Object.freeze({
    status: "agendada",
    eventId: "evt-operational",
    calendarProjection: "unchanged"
  })
  const before = structuredClone(operationalState)
  const input = {
    consultationId,
    detectedAt: "2026-06-28T14:00:00.000Z",
    driftType: "READ_MODEL_OUTDATED",
    severity: "HIGH",
    repairStrategy: "REBUILD_READ_MODEL",
    replayHash: "replay-hash",
    readModelHash: "read-model-hash",
    calendarHash: "replay-hash",
    inconsistencies: [{
      field: "status",
      expected: "agendada",
      actual: "cancelada",
      source: "readModel"
    }]
  }

  const first = await recordIntegrityDriftDetected(input)
  const second = await recordIntegrityDriftDetected({
    ...input,
    detectedAt: "2026-06-28T14:01:00.000Z"
  })
  const events = readIntegrityDriftEvents(consultationId)

  assert.equal(events.length, 2)
  assert.equal(events[0].type, "consultation.integrity_drift_detected")
  assert.equal(events[0].schemaVersion, 3)
  assert.deepEqual(events[0].payload, input)
  assert.equal(events[0].eventHash, hashIntegrityEvent(events[0]))
  assert.equal(events[0].previousEventHash, null)
  assert.equal(events[1].previousEventHash, events[0].eventHash)
  assert.equal(events[1].eventHash, hashIntegrityEvent(events[1]))
  assert.equal(first.event.eventId, events[0].eventId)
  assert.equal(second.event.eventId, events[1].eventId)

  const decisions = readConsultaDecisions(consultationId)
  assert.equal(decisions.length, 2)
  assert.equal(decisions[0].type, "INTEGRITY_DRIFT_DETECTED")
  assert.equal(decisions[0].output.driftType, "READ_MODEL_OUTDATED")
  assert.equal(decisions[0].output.severity, "HIGH")
  assert.equal(decisions[0].eventId, events[0].eventId)

  assert.deepEqual(operationalState, before)
  assert.equal(Object.isFrozen(operationalState), true)

  console.log("consultation-integrity-drift-detected.test.js: ok")
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
