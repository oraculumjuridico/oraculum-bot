"use strict"

async function reevaluatePostHumanForDecision(input = {}, deps = {}) {
  const { usuario, decision, repository } = input
  if (!usuario?.negocioId || !usuario?.contatoId || !usuario?.numeroCaso || !decision || !repository) {
    return { processed: false, reason: "identity_incomplete" }
  }
  const cycles = await repository.getActiveCycles({ negocioId: String(usuario.negocioId), contatoId: String(usuario.contatoId) })
  const exact = cycles.filter(cycle =>
    String(cycle.negocioId) === String(usuario.negocioId) &&
    String(cycle.contatoId) === String(usuario.contatoId) &&
    String(cycle.numeroCaso).toUpperCase() === String(usuario.numeroCaso).toUpperCase()
  )
  if (exact.length !== 1) return { processed: false, reason: exact.length ? "ambiguous_cycle" : "cycle_not_found" }
  const cycle = exact[0]
  const claim = await repository.claimDocumentDecision(cycle.cycleId, {
    requirementId: decision.requirementId,
    revision: decision.revision,
    now: deps.now,
    staleMs: deps.staleMs
  })
  if (claim.requiresFinalization) {
    await repository.completeDocumentDecision(cycle.cycleId, {
      requirementId: decision.requirementId, revision: decision.revision, now: deps.now
    })
    return { processed: false, finalized: true, reason: "delivery_already_started" }
  }
  if (!claim.claimed) return { processed: false, reason: claim.alreadyCompleted ? "already_processed" : "already_claimed" }
  try {
    const current = await repository.getCycle(cycle.cycleId)
    const result = await deps.processCycle(current, usuario)
    if (result?.failed) {
      const retryable = Boolean(result.retryableBeforeSend || result.knownRejected)
      const state = retryable ? "retryable" : result.uncertain ? "outbound_uncertain" : "failed_after_transport"
      await repository.setDocumentDecisionClaimOutcome(cycle.cycleId, {
        requirementId: decision.requirementId,
        revision: decision.revision,
        claimId: claim.claimId,
        state,
        reason: result.failurePhase || result.error || "outbound_failed",
        now: deps.now
      })
      return { processed: false, claimed: true, retryable, blocked: !retryable, cycleId: cycle.cycleId, result }
    }
    if (result?.skipped) {
      await repository.setDocumentDecisionClaimOutcome(cycle.cycleId, {
        requirementId: decision.requirementId,
        revision: decision.revision,
        claimId: claim.claimId,
        state: "retryable",
        reason: result.reason || "cycle_skipped",
        now: deps.now
      })
      return { processed: false, claimed: true, retryable: true, cycleId: cycle.cycleId, result }
    }
    await repository.completeDocumentDecision(cycle.cycleId, {
      requirementId: decision.requirementId,
      revision: decision.revision,
      claimId: claim.claimId,
      now: deps.now
    })
    return { processed: true, cycleId: cycle.cycleId, result }
  } catch (error) {
    return { processed: false, claimed: true, cycleId: cycle.cycleId, error }
  }
}

module.exports = { reevaluatePostHumanForDecision }
