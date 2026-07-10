const assert = require("node:assert/strict")
const {
  detectIntegrityDrift
} = require("../src/domain/consultation/integrity/consultation-drift-detector")

function verification(overrides = {}) {
  return {
    healthy: false,
    replayHash: "replay",
    readModelHash: "read",
    calendarHash: "calendar",
    inconsistencies: [{ field: "status", expected: "agendada", actual: "cancelada", source: "readModel" }],
    ...overrides
  }
}

function main() {
  const healthy = detectIntegrityDrift({
    verificationResult: verification({
      healthy: true,
      replayHash: "same",
      readModelHash: "same",
      calendarHash: "same",
      inconsistencies: []
    })
  })
  assert.deepEqual(healthy, {
    healthy: true,
    driftDetected: false,
    driftType: null,
    severity: "NONE",
    repairStrategy: "NONE",
    inconsistencies: []
  })

  const readModel = detectIntegrityDrift({
    verificationResult: verification({ replayHash: "same", calendarHash: "same" })
  })
  assert.equal(readModel.driftType, "READ_MODEL_OUTDATED")
  assert.equal(readModel.severity, "HIGH")
  assert.equal(readModel.repairStrategy, "REBUILD_READ_MODEL")

  const calendar = detectIntegrityDrift({
    verificationResult: verification({ replayHash: "same", readModelHash: "same" })
  })
  assert.equal(calendar.driftType, "CALENDAR_PROJECTION_DRIFT")
  assert.equal(calendar.severity, "MEDIUM")
  assert.equal(calendar.repairStrategy, "REPROJECT_CALENDAR")

  const multi = detectIntegrityDrift({
    verificationResult: verification()
  })
  assert.equal(multi.driftType, "MULTI_PROJECTION_DRIFT")
  assert.equal(multi.severity, "CRITICAL")
  assert.equal(multi.repairStrategy, "FULL_REPLAY_REBUILD")

  const unknown = detectIntegrityDrift({
    verificationResult: verification({
      replayHash: "same",
      readModelHash: "same",
      calendarHash: "same"
    })
  })
  assert.equal(unknown.driftType, "UNKNOWN_DRIFT")
  assert.equal(unknown.severity, "HIGH")
  assert.equal(unknown.repairStrategy, "MANUAL_INVESTIGATION")
  assert.deepEqual(unknown.inconsistencies, verification().inconsistencies)

  console.log("consultation-drift-detector.test.js: ok")
}

main()
