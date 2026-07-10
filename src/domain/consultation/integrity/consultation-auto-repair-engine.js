const {
  getConsultaStateAt
} = require("../consultation-replay-engine")
const {
  verifyConsultationIntegrity
} = require("./consultation-self-verification-engine")
const {
  refreshConsultationSessionProjection
} = require("../projections/consultation-session-recovery")
const {
  recordConsultationSelfHealed
} = require("./consultation-self-healed-event")

async function officialSessionProjectionRefresh({ consultationId, replayState }) {
  return refreshConsultationSessionProjection({
    consultationId,
    replay: async () => replayState
  })
}

const STRATEGIES = Object.freeze({
  READ_MODEL_OUTDATED: {
    repairStrategy: "REBUILD_READ_MODEL",
    mechanism: "rebuildReadModel"
  },
  CALENDAR_PROJECTION_DRIFT: {
    repairStrategy: "REPROJECT_CALENDAR",
    mechanism: "reprojectCalendar"
  },
  MULTI_PROJECTION_DRIFT: {
    repairStrategy: "FULL_REPLAY_REBUILD",
    mechanism: "fullReplayRebuild"
  },
  SESSION_PROJECTION_DRIFT: {
    repairStrategy: "REFRESH_SESSION_PROJECTION",
    mechanism: "refreshSessionProjection",
    officialMechanism: officialSessionProjectionRefresh
  }
})
const REPLAY_REPAIR_AUTHORIZATION = Symbol("consultation.replay-repair-authorization")

function authorizeReplayRepairMechanism(mechanism) {
  if (typeof mechanism !== "function") throw new Error("mecanismo de reparo invalido")
  Object.defineProperty(mechanism, REPLAY_REPAIR_AUTHORIZATION, {
    value: true,
    enumerable: false,
    configurable: false
  })
  return mechanism
}

function hashesFromVerification(verification = {}) {
  return {
    replayHash: verification.replayHash || null,
    readModelHash: verification.readModelHash || null,
    calendarHash: verification.calendarHash || null
  }
}

function integrityRepairError(message, code, repairResult = null) {
  const error = new Error(message)
  error.code = code
  if (repairResult) error.repairResult = repairResult
  return error
}

async function repairIntegrityDrift({
  consultationId,
  driftDiagnosis,
  mechanisms = {},
  verification = verifyConsultationIntegrity,
  replay = getConsultaStateAt,
  recordSelfHealed = recordConsultationSelfHealed,
  clock = () => new Date().toISOString()
}) {
  if (!consultationId) throw new Error("consultationId obrigatorio para auto repair")
  const definition = STRATEGIES[driftDiagnosis?.driftType]
  if (!definition) {
    throw integrityRepairError(
      "drift desconhecido exige investigacao manual",
      "CONSULTATION_MANUAL_INVESTIGATION_REQUIRED"
    )
  }
  if (driftDiagnosis.repairStrategy !== definition.repairStrategy) {
    throw integrityRepairError(
      "estrategia de reparo divergente do diagnostico",
      "CONSULTATION_REPAIR_STRATEGY_MISMATCH"
    )
  }

  const mechanism = mechanisms[definition.mechanism] || definition.officialMechanism
  if (
    typeof mechanism !== "function" ||
    (
      mechanism !== definition.officialMechanism &&
      mechanism[REPLAY_REPAIR_AUTHORIZATION] !== true
    )
  ) {
    throw integrityRepairError(
      `mecanismo autorizado indisponivel: ${definition.mechanism}`,
      "CONSULTATION_REPAIR_MECHANISM_UNAVAILABLE"
    )
  }

  const before = await verification({ dealId: consultationId })
  const previousHashes = hashesFromVerification(before)
  const replayState = await replay(consultationId)
  const startedAt = clock()

  await mechanism({
    consultationId,
    replayState,
    driftDiagnosis,
    previousHashes
  })

  const after = await verification({ dealId: consultationId })
  const finishedAt = clock()
  const repairResult = {
    repaired: after.healthy === true,
    repairStrategy: definition.repairStrategy,
    startedAt,
    finishedAt,
    previousHashes,
    resultingHashes: hashesFromVerification(after)
  }
  if (!repairResult.repaired) {
    throw integrityRepairError(
      "reparo concluido sem restaurar integridade",
      "CONSULTATION_INTEGRITY_REPAIR_FAILED",
      repairResult
    )
  }
  await recordSelfHealed({
    consultationId,
    repairedAt: finishedAt,
    driftType: driftDiagnosis.driftType,
    repairStrategy: definition.repairStrategy,
    previousHashes,
    resultingHashes: repairResult.resultingHashes,
    verificationBefore: before,
    verificationAfter: after
  })
  return repairResult
}

module.exports = {
  STRATEGIES,
  officialSessionProjectionRefresh,
  authorizeReplayRepairMechanism,
  hashesFromVerification,
  integrityRepairError,
  repairIntegrityDrift
}
