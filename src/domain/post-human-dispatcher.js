"use strict"

const { tratarRespostaClientePosAtendimento } = require("./post-human-response-handler")
const { sanitizeError } = require("./post-human-safe-log")

function notHandled(reason) {
  return {
    handled: false,
    reason,
    cycleId: null,
    requiresCaseSelection: false,
    humanReviewRequired: false,
    legacyFlowAllowed: true
  }
}

function normalizeResult(result) {
  if (!result?.handled) return { ...notHandled(result?.pendingUpload ? "legacy_document_pipeline" : "not_applicable"), legacyHandoff: result?.legacyHandoff || null }
  return {
    handled: true,
    reason: result.humanReviewRequired ? "human_review_required" :
      result.askCase ? "case_selection_required" :
      result.deferred ? "response_deferred" :
      result.partial ? "response_partial" : "response_completed",
    cycleId: result.cycle?.cycleId || null,
    requiresCaseSelection: Boolean(result.askCase),
    humanReviewRequired: Boolean(result.humanReviewRequired),
    legacyFlowAllowed: false,
    response: result
  }
}

function logSafely(logger, event, error) {
  try {
    logger(event, sanitizeError(error))
  } catch {}
}

function createPostHumanDispatcher({
  isEnabled,
  repository,
  normalizePhone,
  resolveValidatedContactByPhone,
  resolveBusiness,
  saveInformation,
  applySafeHubspotUpdates,
  legacyDocumentPipeline,
  isComplete,
  responseHandler = tratarRespostaClientePosAtendimento,
  safeLogger = () => {}
}) {
  if (typeof isEnabled !== "function") throw new TypeError("isEnabled obrigatorio")

  return async function dispatchPostHumanResponse({ from, msgType, content, usuario, contexto, numeroCaso, rawMessage }) {
    if (!isEnabled()) return notHandled("feature_disabled")
    if (!repository) return notHandled("repository_unavailable")

    try {
      const resolvedBusiness = typeof resolveBusiness === "function"
        ? await resolveBusiness({ usuario, contexto, numeroCaso })
        : null
      const safeUser = resolvedBusiness?.validated
        ? { ...usuario, negocioId: String(resolvedBusiness.negocioId), numeroCaso: resolvedBusiness.numeroCaso || usuario?.numeroCaso }
        : usuario

      const result = await responseHandler({
        from,
        msgType,
        content,
        usuario: safeUser,
        contexto,
        numeroCaso,
        repository,
        deps: {
          normalizePhone,
          resolveValidatedContactByPhone,
          saveInformation,
          applySafeHubspotUpdates,
          isComplete,
          saveDocument: typeof legacyDocumentPipeline === "function"
            ? context => legacyDocumentPipeline({ ...context, from, usuario: safeUser, rawMessage })
            : undefined
        }
      })
      return normalizeResult(result)
    } catch (error) {
      logSafely(safeLogger, "post_human_dispatch_failed", error)
      return notHandled("safe_failure")
    }
  }
}

async function recoverPostHumanCycles({
  isEnabled,
  repository,
  isCaseAllowed,
  findUser,
  processCycle,
  safeLogger = () => {}
}) {
  if (!isEnabled()) return { initialized: false, recovered: 0, skipped: "feature_disabled" }
  if (!repository) return { initialized: false, recovered: 0, skipped: "repository_unavailable" }
  try {
    await repository.initialize()
    const recoverable = await repository.listRecoverable()
    let recovered = 0
    let failed = 0
    for (const cycle of recoverable) {
      if (!["pending", "analyzing", "ready_to_send"].includes(cycle.status)) continue
      if (!isCaseAllowed(cycle.numeroCaso)) continue
      try {
        const usuario = await findUser(cycle)
        if (!usuario) continue
        await processCycle(cycle, usuario)
        recovered++
      } catch (error) {
        failed++
        logSafely(safeLogger, "post_human_recovery_cycle_failed", error)
      }
    }
    return { initialized: true, recovered, failed }
  } catch (error) {
    logSafely(safeLogger, "post_human_recovery_failed", error)
    return { initialized: false, recovered: 0, failed: 1, error: "post_human_recovery_failed" }
  }
}

module.exports = {
  createPostHumanDispatcher,
  recoverPostHumanCycles,
  normalizeResult,
  logSafely
}
