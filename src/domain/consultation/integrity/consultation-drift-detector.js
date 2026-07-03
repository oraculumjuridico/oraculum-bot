const DRIFT = Object.freeze({
  HEALTHY: {
    driftType: null,
    severity: "NONE",
    repairStrategy: "NONE"
  },
  READ_MODEL_OUTDATED: {
    driftType: "READ_MODEL_OUTDATED",
    severity: "HIGH",
    repairStrategy: "REBUILD_READ_MODEL"
  },
  CALENDAR_PROJECTION_DRIFT: {
    driftType: "CALENDAR_PROJECTION_DRIFT",
    severity: "MEDIUM",
    repairStrategy: "REPROJECT_CALENDAR"
  },
  MULTI_PROJECTION_DRIFT: {
    driftType: "MULTI_PROJECTION_DRIFT",
    severity: "CRITICAL",
    repairStrategy: "FULL_REPLAY_REBUILD"
  },
  UNKNOWN_DRIFT: {
    driftType: "UNKNOWN_DRIFT",
    severity: "HIGH",
    repairStrategy: "MANUAL_INVESTIGATION"
  }
})

function detectIntegrityDrift({ verificationResult } = {}) {
  const result = verificationResult || {}
  const inconsistencies = Array.isArray(result.inconsistencies)
    ? result.inconsistencies
    : []
  const {
    replayHash,
    readModelHash,
    calendarHash
  } = result
  const completeHashes = [replayHash, readModelHash, calendarHash]
    .every(hash => typeof hash === "string" && hash.length > 0)
  const allEqual = completeHashes &&
    replayHash === readModelHash &&
    replayHash === calendarHash

  let classification
  if (result.healthy === true && allEqual && inconsistencies.length === 0) {
    classification = DRIFT.HEALTHY
  } else if (completeHashes && replayHash === calendarHash && readModelHash !== replayHash) {
    classification = DRIFT.READ_MODEL_OUTDATED
  } else if (completeHashes && replayHash === readModelHash && calendarHash !== replayHash) {
    classification = DRIFT.CALENDAR_PROJECTION_DRIFT
  } else if (
    completeHashes &&
    replayHash !== readModelHash &&
    replayHash !== calendarHash
  ) {
    classification = DRIFT.MULTI_PROJECTION_DRIFT
  } else {
    classification = DRIFT.UNKNOWN_DRIFT
  }

  const healthy = classification === DRIFT.HEALTHY
  return {
    healthy,
    driftDetected: !healthy,
    ...classification,
    inconsistencies
  }
}

module.exports = {
  DRIFT,
  detectIntegrityDrift
}
