"use strict"

const { DOCUMENT_REQUIREMENT_MIN_CLASSIFICATION_CONFIDENCE } = require("./document-requirement-engine")
const { hasConfirmedTrustedFront } = require("./document-party-identity")

function normalized(value) {
  return String(value || "").trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
}

function requestedSide(folha) {
  const value = normalized(folha)
  if (value.includes("frente") && !value.includes("verso")) return "front"
  if (value.includes("verso") && !value.includes("frente")) return "back"
  return null
}

function evidenceSide(evidence = {}) {
  const kind = normalized(evidence.tipoDocumento || evidence.classificacao?.tipoDocumento)
  if (kind === "rg frente") return "front"
  if (kind === "rg verso") return "back"
  const coverage = new Set((evidence.coverage || []).map(normalized))
  if (coverage.has("front") && !coverage.has("back")) return "front"
  if (coverage.has("back") && !coverage.has("front")) return "back"
  return null
}

function response(reasonCode, requested, extra = {}) {
  const sideLabel = requested === "back" ? "verso" : requested === "front" ? "frente" : "documento"
  const qualityWarnings = extra.qualityWarnings || []
  let qualityMessage = null
  if (qualityWarnings.includes("low_resolution")) {
    qualityMessage = `A imagem ficou pequena para leitura. Envie outra foto da ${sideLabel}, mais perto e mostrando o documento inteiro.`
  } else if (qualityWarnings.includes("possible_blur")) {
    qualityMessage = `A imagem ficou pouco nitida. Apoie o celular e envie outra foto da ${sideLabel}, um pouco mais perto.`
  } else if (qualityWarnings.includes("underexposed")) {
    qualityMessage = `A imagem ficou escura. Envie outra foto da ${sideLabel} com mais iluminacao e sem sombra.`
  } else if (qualityWarnings.includes("overexposed")) {
    qualityMessage = `A imagem ficou clara demais. Envie outra foto da ${sideLabel} sem flash ou reflexo sobre o documento.`
  }
  const messages = {
    wrong_side: `Recebi outra parte do documento, mas ainda preciso da ${sideLabel}. Envie uma foto legivel da ${sideLabel}.`,
    wrong_document_type: `O arquivo recebido parece ser diferente do documento solicitado. Envie o documento correto para continuar.`,
    identity_not_verified: `Nao consegui confirmar que o documento pertence ao titular do caso. O documento correto continua pendente.`,
    unreadable_or_uncertain: qualityMessage || `Nao consegui reconhecer o documento com seguranca. Envie uma nova foto legivel, sem reflexo e com tudo enquadrado.`
  }
  return { accepted: false, confirmEvidence: false, advance: false, reasonCode, message: messages[reasonCode], ...extra }
}

function evaluateGuidedDocumentReceipt(input = {}) {
  const requirementId = input.requirementId || input.documentoId || null
  if (requirementId !== "doc_rg") {
    return { accepted: true, confirmEvidence: false, advance: true, reasonCode: "legacy_requirement", message: null }
  }
  const requested = requestedSide(input.folha)
  const evidences = Array.isArray(input.analysisResult?.evidencias) ? input.analysisResult.evidencias : []
  if (!input.analysisResult?.ok || !evidences.length) return response("unreadable_or_uncertain", requested)

  const identityEvidences = evidences.filter(evidence =>
    ["rg frente", "rg verso", "rg", "cnh"].includes(normalized(evidence.tipoDocumento || evidence.classificacao?.tipoDocumento)))
  if (!identityEvidences.length) {
    const unknown = evidences.some(evidence => normalized(evidence.tipoDocumento || evidence.classificacao?.tipoDocumento) === "documento desconhecido")
    return response(unknown ? "unreadable_or_uncertain" : "wrong_document_type", requested)
  }
  const confirmedFrontAvailable = hasConfirmedTrustedFront(input.analysisResult?.registry || {}, "doc_rg")
  const safe = identityEvidences.filter(evidence => {
    const roleSafe = normalized(evidence.partyRole) === "titular" || (
      normalized(evidence.partyResolutionStatus) === "scoped_pair_candidate" &&
      normalized(evidence.tipoDocumento || evidence.classificacao?.tipoDocumento) === "rg verso" &&
      confirmedFrontAvailable
    )
    return (
    normalized(evidence.status) === "analyzed" &&
    roleSafe &&
    Number(evidence.classificacao?.confianca) >= DOCUMENT_REQUIREMENT_MIN_CLASSIFICATION_CONFIDENCE &&
    !(evidence.erros || []).length)
  })
  if (!safe.length) {
    const qualityWarnings = [...new Set(identityEvidences.flatMap(evidence => [
      ...(evidence.quality?.warnings || []),
      ...(evidence.quality?.originalWarnings || [])
    ]))]
    const identityUnsafe = identityEvidences.some(evidence => normalized(evidence.partyRole) !== "titular")
    return response(identityUnsafe ? "identity_not_verified" : "unreadable_or_uncertain", requested, { qualityWarnings })
  }

  const sides = new Set(safe.map(evidenceSide).filter(Boolean))
  const matchesRequested = !requested || sides.has(requested)
  if (!matchesRequested) {
    return response("wrong_side", requested, {
      confirmEvidence: true,
      recognizedSides: [...sides],
      evidenceRefs: safe.map(item => ({ evidenceId: item.evidenceId, version: item.version, sha256: item.sha256 }))
    })
  }
  return {
    accepted: true,
    confirmEvidence: true,
    advance: true,
    reasonCode: "requested_document_matched",
    message: null,
    recognizedSides: [...sides],
    evidenceRefs: safe.map(item => ({ evidenceId: item.evidenceId, version: item.version, sha256: item.sha256 }))
  }
}

function applyGuidedDocumentReceipt(usuario = {}, receipt = {}, options = {}) {
  const keys = Array.isArray(usuario.guidedDocumentReceiptKeys) ? usuario.guidedDocumentReceiptKeys : []
  const key = [options.requirementId, options.fileId, ...(receipt.evidenceRefs || []).map(ref => `${ref.evidenceId}:${ref.version}:${ref.sha256}`)].join("|")
  if (key && keys.includes(key)) return { changed: false, advanced: false, reason: "already_applied" }
  if (key) usuario.guidedDocumentReceiptKeys = [...keys, key].slice(-100)
  const currentIndex = Number(usuario.docAtualIdx || 0)
  const total = Math.max(1, Number(options.totalParts || 1))
  let nextIndex = currentIndex
  if (options.decisionStatus === "delivered") nextIndex = total
  else if (receipt.accepted && receipt.advance) nextIndex = Math.min(total, currentIndex + 1)
  usuario.docAtualIdx = nextIndex
  return { changed: key ? true : nextIndex !== currentIndex, advanced: nextIndex > currentIndex, previousIndex: currentIndex, nextIndex }
}

module.exports = {
  requestedSide,
  evidenceSide,
  evaluateGuidedDocumentReceipt,
  applyGuidedDocumentReceipt
}
