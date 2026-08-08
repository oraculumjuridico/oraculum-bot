"use strict"

const { isPostHumanComplementationEnabled } = require("./post-human-feature-flag")
const { isPilotCaseAllowed, normalizeCaseNumber } = require("./admin-post-human-complementation")

function classify(msgType, content) {
  const text = String(content?.text || content || "").trim()
  if (/^respondo depois[.!]?$/i.test(text)) return "later"
  if (["image", "document", "pdf", "audio"].includes(String(msgType).toLowerCase())) return "document"
  if (text) return "information"
  return "unknown"
}

async function resolverCiclo({ repository, usuario = {}, telefoneNormalizado, numeroCaso, contexto = {} }) {
  const contextoSeguro = contexto && typeof contexto === "object" ? contexto : {}
  let contatoId = usuario.contatoId ? String(usuario.contatoId) : null
  if (!contatoId) return null
  const candidates = await repository.getActiveCycles({ contatoId })
  const allowed = candidates.filter(cycle => isPilotCaseAllowed(cycle.numeroCaso))
  const expectedBusiness = contextoSeguro.negocioId || usuario.negocioId || null
  const expectedCase = normalizeCaseNumber(numeroCaso || contextoSeguro.numeroCaso || usuario.numeroCaso)
  let filtered = allowed
  if (expectedBusiness) filtered = filtered.filter(c => c.negocioId === String(expectedBusiness))
  if (expectedCase) filtered = filtered.filter(c => normalizeCaseNumber(c.numeroCaso) === expectedCase)
  if (filtered.length === 1) return filtered[0]
  return { ambiguous: filtered.length > 1 || allowed.length > 1, cycles: (filtered.length ? filtered : allowed).map(c => ({ cycleId: c.cycleId, numeroCaso: c.numeroCaso })) }
}

async function tratarRespostaClientePosAtendimento({
  from, msgType, content, usuario, repository, deps = {}, numeroCaso, contexto
}) {
  if (!isPostHumanComplementationEnabled()) return null
  const telefoneNormalizado = deps.normalizePhone ? deps.normalizePhone(from) : String(from || "").replace(/\D/g, "")
  if (!telefoneNormalizado) return null
  let identidade = usuario || {}
  if (!identidade.contatoId) {
    if (typeof deps.resolveValidatedContactByPhone !== "function") return null
    const resolved = await deps.resolveValidatedContactByPhone(telefoneNormalizado)
    if (!resolved?.validated || !resolved.contatoId ||
        String(resolved.telefoneNormalizado || "") !== String(telefoneNormalizado)) return null
    identidade = { ...identidade, contatoId: String(resolved.contatoId) }
  }
  const cycle = await resolverCiclo({ repository, usuario: identidade, telefoneNormalizado, numeroCaso, contexto })
  if (!cycle || (!cycle.cycleId && !cycle.ambiguous)) return null
  if (cycle.ambiguous) return { handled: true, ambiguous: true, askCase: true, cases: cycle.cycles }
  const kind = classify(msgType, content)
  let documentSaveResult = null
  if (kind === "later") {
    return { handled: true, deferred: true, cycle: await repository.updateStatus(cycle.cycleId, "awaiting_response", { respostaAdiada: true }) }
  }
  if (kind === "document") {
    if (typeof deps.saveDocument !== "function") return { handled: false, cycle }
    const saved = await deps.saveDocument({
      cycleId: cycle.cycleId, contatoId: cycle.contatoId, negocioId: cycle.negocioId,
      numeroCaso: cycle.numeroCaso, content
    })
    documentSaveResult = saved
    if (!saved?.persisted) return { handled: Boolean(saved?.handled), pendingUpload: true, legacyHandoff: saved?.handoff || null, cycle }
    await repository.updateStatus(cycle.cycleId, "awaiting_response", {
      documentoRecebidoEm: new Date().toISOString(),
      documentoMetadados: saved.metadata || { persisted: true }
    })
  } else if (kind === "information") {
    const saveResult = await deps.saveInformation?.({ cycle, content })
    let reviewRequired = Boolean(saveResult?.humanReviewRequired || saveResult?.hubspot?.humanReviewRequired)
    let reviewReason = saveResult?.reviewReason || saveResult?.hubspot?.reviewReason || null
    if (saveResult?.hubspot) {
      const hubspotResult = await deps.applySafeHubspotUpdates?.({ cycle, ...saveResult.hubspot })
      reviewRequired ||= Boolean(hubspotResult?.humanReviewRequired)
      reviewReason ||= hubspotResult?.error || (hubspotResult?.divergences?.length ? "hubspot_divergence" : null)
      saveResult.divergences = hubspotResult?.divergences || []
    }
    if (reviewRequired) {
      return {
        handled: true, partial: true, humanReviewRequired: true,
        cycle: await repository.updateStatus(cycle.cycleId, "human_review_required", {
          motivoRevisao: String(reviewReason || "human_review_required").replace(/[^a-z0-9_.-]/gi, "_").slice(0, 120),
          divergencias: saveResult?.divergences?.map(item => item.field) || []
        })
      }
    }
    if (saveResult?.canonicalPatch && typeof deps.updateCanonicalState === "function") {
      await deps.updateCanonicalState({ cycle, patch: saveResult.canonicalPatch })
    }
  } else return { handled: true, ignored: true, cycle }
  const refreshedBeforeCompletion = await repository.getCycle(cycle.cycleId) || cycle
  const complete = await Promise.resolve(deps.isComplete?.(refreshedBeforeCompletion) || false)
  const status = complete ? "completed" : "awaiting_response"
  const campo = refreshedBeforeCompletion.payload?.campoPendente || refreshedBeforeCompletion.campoPendente || null
  const camposRespondidos = campo ? [...new Set([...(refreshedBeforeCompletion.payload?.camposRespondidos || refreshedBeforeCompletion.camposRespondidos || []), campo])] : []
  const canonicalAnswers = kind === "information" && campo
    ? { ...(refreshedBeforeCompletion.payload?.respostas || {}), [campo]: { valor: String(content?.text || content || "").trim(), status: "confirmado", origem: "cliente" } }
    : null
  const updated = await repository.updateStatus(cycle.cycleId, status, {
    respondidoEm: new Date().toISOString(),
    ...(camposRespondidos.length ? { camposRespondidos } : {}),
    ...(canonicalAnswers ? { respostas: canonicalAnswers } : {})
  })
  if (!complete && typeof deps.continueCycle === "function") {
    const continuation = await deps.continueCycle({ cycle: updated, usuario: identidade })
    return { handled: true, partial: continuation?.cycle?.status !== "completed", pipelineResponse: documentSaveResult?.pipelineResponse || null, cycle: continuation?.cycle || continuation || updated, continuation }
  }
  return {
    handled: true, partial: !complete, pipelineResponse: documentSaveResult?.pipelineResponse || null,
    cycle: updated
  }
}

module.exports = { classify, resolverCiclo, tratarRespostaClientePosAtendimento }
