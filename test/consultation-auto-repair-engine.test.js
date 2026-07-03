const assert = require("node:assert/strict")
const {
  repairIntegrityDrift,
  authorizeReplayRepairMechanism
} = require("../src/domain/consultation/integrity/consultation-auto-repair-engine")

const consultationId = "deal-auto-repair"
const unhealthy = {
  healthy: false,
  replayHash: "replay",
  readModelHash: "outdated",
  calendarHash: "calendar",
  inconsistencies: [{ field: "status" }]
}
const healthy = {
  healthy: true,
  replayHash: "healthy",
  readModelHash: "healthy",
  calendarHash: "healthy",
  inconsistencies: []
}

function verificationSequence(...results) {
  let index = 0
  return async () => results[Math.min(index++, results.length - 1)]
}

async function runStrategy(driftType, repairStrategy, mechanismName) {
  const calls = []
  const healed = []
  const mechanisms = {
    [mechanismName]: authorizeReplayRepairMechanism(async context => calls.push(context))
  }
  const result = await repairIntegrityDrift({
    consultationId,
    driftDiagnosis: { driftType, repairStrategy },
    mechanisms,
    verification: verificationSequence(unhealthy, healthy),
    replay: async () => ({ dealId: consultationId, status: "agendada", source: "replay" }),
    recordSelfHealed: async payload => healed.push(payload),
    clock: (() => {
      const times = ["2026-06-28T15:00:00.000Z", "2026-06-28T15:00:01.000Z"]
      return () => times.shift()
    })()
  })
  assert.equal(result.repaired, true)
  assert.equal(result.repairStrategy, repairStrategy)
  assert.deepEqual(result.previousHashes, {
    replayHash: "replay",
    readModelHash: "outdated",
    calendarHash: "calendar"
  })
  assert.deepEqual(result.resultingHashes, {
    replayHash: "healthy",
    readModelHash: "healthy",
    calendarHash: "healthy"
  })
  assert.equal(calls.length, 1)
  assert.equal(calls[0].replayState.source, "replay")
  assert.equal(healed.length, 1)
  assert.equal(healed[0].verificationAfter.healthy, true)
}

async function main() {
  await runStrategy("READ_MODEL_OUTDATED", "REBUILD_READ_MODEL", "rebuildReadModel")
  await runStrategy("CALENDAR_PROJECTION_DRIFT", "REPROJECT_CALENDAR", "reprojectCalendar")
  await runStrategy("MULTI_PROJECTION_DRIFT", "FULL_REPLAY_REBUILD", "fullReplayRebuild")
  await runStrategy(
    "SESSION_PROJECTION_DRIFT",
    "REFRESH_SESSION_PROJECTION",
    "refreshSessionProjection"
  )

  await assert.rejects(
    repairIntegrityDrift({
      consultationId,
      driftDiagnosis: {
        driftType: "UNKNOWN_DRIFT",
        repairStrategy: "MANUAL_INVESTIGATION"
      }
    }),
    error => error.code === "CONSULTATION_MANUAL_INVESTIGATION_REQUIRED"
  )

  await assert.rejects(
    repairIntegrityDrift({
      consultationId,
      driftDiagnosis: {
        driftType: "READ_MODEL_OUTDATED",
        repairStrategy: "REBUILD_READ_MODEL"
      },
      mechanisms: {
        rebuildReadModel: authorizeReplayRepairMechanism(async () => {})
      },
      verification: verificationSequence(unhealthy, unhealthy),
      replay: async () => ({ status: "agendada" }),
      recordSelfHealed: async () => {
        throw new Error("nao deveria registrar self_healed")
      }
    }),
    error =>
      error.code === "CONSULTATION_INTEGRITY_REPAIR_FAILED" &&
      error.repairResult?.repaired === false
  )

  console.log("consultation-auto-repair-engine.test.js: ok")
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
})
