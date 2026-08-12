"use strict"

const {
  normalizarContratoEvidencias,
  registrarEvidenciaDocumental
} = require("./document-evidence-model")

const REVIEW_ACTIONS = Object.freeze({
  rg_frente: { tipoDocumento: "RG frente", status: "analyzed", coverage: ["front"] },
  rg_verso: { tipoDocumento: "RG verso", status: "analyzed", coverage: ["back"] },
  ilegivel: { tipoDocumento: "Documento ilegível", status: "illegible", coverage: [] },
  descartar: { tipoDocumento: "Documento descartado", status: "discarded", coverage: [] }
})

function texto(value) {
  return String(value || "").trim()
}

function normalizado(value) {
  return texto(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
}

function latestEvidence(registry = {}) {
  const latest = new Map()
  for (const evidence of normalizarContratoEvidencias(registry).evidencias) {
    const current = latest.get(evidence.evidenceId)
    if (!current || Number(evidence.version) > Number(current.version)) latest.set(evidence.evidenceId, evidence)
  }
  return [...latest.values()]
}

function needsHumanReview(evidence = {}) {
  const kind = normalizado(evidence.tipoDocumento || evidence.classificacao?.tipoDocumento)
  const status = normalizado(evidence.status)
  const confidence = Number(evidence.classificacao?.confianca || 0)
  if (["discarded", "descartado", "illegible", "ilegivel"].includes(status) || /descartad|ilegivel/.test(kind)) return false
  return ["review", "quarantined", "error", "erro"].includes(status) ||
    !kind || /desconhecid|nao identificado|aguardando classificacao/.test(kind) ||
    confidence < 0.85
}

function analysisNameByFile(state = {}) {
  return new Map((state.analysis?.analises || []).flatMap(item => {
    const fileId = texto(item?.arquivo?.fileId)
    if (!fileId) return []
    return [[fileId, texto(item.arquivo.nome || item.arquivo.nomeOriginal) || "Arquivo sem nome"]]
  }))
}

function listPendingHumanReviews(state = {}) {
  const names = analysisNameByFile(state)
  const evidenceItems = latestEvidence(state.registry)
    .filter(needsHumanReview)
    .map(evidence => ({
      evidenceId: evidence.evidenceId,
      fileId: evidence.fileId,
      pageNumber: evidence.pageNumber,
      fileName: names.get(evidence.fileId) || "Arquivo sem nome",
      detectedType: texto(evidence.tipoDocumento || evidence.classificacao?.tipoDocumento) || "Não identificado",
      confidence: Number(evidence.classificacao?.confianca || 0)
    }))
  const represented = new Set(evidenceItems.map(item => item.evidenceId))
  const legacyItems = (state.analysis?.analises || []).flatMap(entry => {
    const fileId = texto(entry?.arquivo?.fileId)
    if (!fileId) return []
    const pipelines = Array.isArray(entry.pipeline?.units)
      ? entry.pipeline.units.map(unit => ({ pageNumber: unit?.unit?.pageNumber || null, pipeline: unit?.pipeline || {} }))
      : [{ pageNumber: null, pipeline: entry.pipeline || {} }]
    return pipelines.flatMap(({ pageNumber, pipeline }) => {
      const evidenceId = pageNumber ? `${fileId}#page=${pageNumber}` : fileId
      const pseudoEvidence = {
        status: entry.status === "erro" ? "review" : "analyzed",
        tipoDocumento: pipeline.classificacao?.tipoDocumento,
        classificacao: pipeline.classificacao
      }
      if (represented.has(evidenceId) || !needsHumanReview(pseudoEvidence)) return []
      return [{
        evidenceId, fileId, pageNumber,
        fileName: names.get(fileId) || "Arquivo sem nome",
        detectedType: texto(pipeline.classificacao?.tipoDocumento) || "Não identificado",
        confidence: Number(pipeline.classificacao?.confianca || 0)
      }]
    })
  })
  return [...evidenceItems, ...legacyItems]
    .sort((a, b) => a.fileName.localeCompare(b.fileName, "pt-BR") || Number(a.pageNumber || 0) - Number(b.pageNumber || 0))
}

function updateAnalysis(analysis = {}, target = {}, action = {}) {
  const updated = { ...analysis, analises: [...(analysis.analises || [])] }
  updated.analises = updated.analises.map(entry => {
    if (texto(entry?.arquivo?.fileId) !== texto(target.fileId)) return entry
    const result = { ...entry, pipeline: entry.pipeline ? { ...entry.pipeline } : {} }
    const classification = {
      tipoDocumento: action.tipoDocumento,
      categoria: action.status === "analyzed" ? "documentos_pessoais" : "revisao_humana",
      confianca: 1,
      origem: "revisao_humana"
    }
    if (Array.isArray(result.pipeline.units) && target.pageNumber) {
      result.pipeline.units = result.pipeline.units.map(unit => Number(unit?.unit?.pageNumber) === Number(target.pageNumber)
        ? { ...unit, pipeline: { ...(unit.pipeline || {}), classificacao: classification, ...(action.status === "analyzed" ? {} : { extracao: null }) } }
        : unit)
      result.status = result.pipeline.units.some(unit => unit?.pipeline?.classificacao && !["Documento ilegível", "Documento descartado"].includes(unit.pipeline.classificacao.tipoDocumento))
        ? "concluido" : "erro"
    } else {
      result.pipeline.classificacao = classification
      if (action.status !== "analyzed") result.pipeline.extracao = null
      result.status = action.status === "analyzed" ? "concluido" : "erro"
    }
    result.revisaoHumana = { acao: action.status, revisadoEm: target.reviewedAt, revisor: target.reviewerId }
    return result
  })
  return updated
}

function applyHumanDocumentReview(state = {}, input = {}) {
  const action = REVIEW_ACTIONS[input.action]
  if (!action) return { ok: false, reason: "invalid_review_action", state }
  const registry = normalizarContratoEvidencias(state.registry)
  let current = latestEvidence(registry).find(item => item.evidenceId === input.evidenceId)
  let baseRegistry = registry
  if (!current) {
    const fileId = texto(input.evidenceId).split("#page=")[0]
    const pageMatch = texto(input.evidenceId).match(/#page=(\d+)$/)
    const pageNumber = pageMatch ? Number(pageMatch[1]) : null
    const analysis = (state.analysis?.analises || []).find(item => texto(item?.arquivo?.fileId) === fileId)
    const pipeline = pageNumber && Array.isArray(analysis?.pipeline?.units)
      ? analysis.pipeline.units.find(unit => Number(unit?.unit?.pageNumber) === pageNumber)?.pipeline
      : analysis?.pipeline
    if (!analysis || !/^[a-f0-9]{64}$/i.test(texto(input.sha256))) return { ok: false, reason: "evidence_not_found", state }
    current = {
      evidenceId: input.evidenceId,
      fileId,
      pageNumber,
      sha256: texto(input.sha256).toLowerCase(),
      mimeType: analysis.arquivo?.mimeType || "application/octet-stream",
      tipoDocumento: pipeline?.classificacao?.tipoDocumento || null,
      classificacao: pipeline?.classificacao || null,
      ocr: pipeline?.ocr || null,
      quality: pipeline?.qualidade || null,
      extracao: pipeline?.extracao || null,
      coverage: [], requirementId: analysis.contexto?.documentoId || null,
      partyRole: null, partyResolutionStatus: null, status: "review", avisos: [], erros: [], version: 0
    }
  }
  const reviewedAt = input.now || new Date().toISOString()
  const reviewerId = texto(input.reviewerId) || "admin"
  const nextEvidence = {
    ...current,
    version: Number(current.version) + 1,
    tipoDocumento: action.tipoDocumento,
    classificacao: {
      ...(current.classificacao || {}),
      tipoDocumento: action.tipoDocumento,
      categoria: action.status === "analyzed" ? "documentos_pessoais" : "revisao_humana",
      confianca: 1,
      origem: "revisao_humana",
      revisadoEm: reviewedAt
    },
    coverage: action.coverage,
    requirementId: action.status === "analyzed" ? (current.requirementId || "doc_rg") : null,
    partyRole: action.status === "analyzed" ? "titular" : null,
    partyResolutionStatus: input.action === "rg_verso" ? "scoped_pair_candidate" : (action.status === "analyzed" ? "titular" : null),
    status: action.status,
    extracao: action.status === "analyzed" ? current.extracao : null,
    erros: [],
    avisos: []
  }
  const updatedRegistry = registrarEvidenciaDocumental(baseRegistry, nextEvidence)
  updatedRegistry.divergencias = (updatedRegistry.divergencias || []).map(item =>
    (item.evidenceIds || []).includes(current.evidenceId) && item.status === "open"
      ? { ...item, status: "resolved", details: { ...(item.details || {}), resolution: input.action, reviewedAt } }
      : item)
  const review = {
    reviewId: `human-review:${current.evidenceId}:${nextEvidence.version}`,
    evidenceId: current.evidenceId,
    fileId: current.fileId,
    pageNumber: current.pageNumber,
    action: input.action,
    reviewerId,
    reviewedAt
  }
  const dossier = {
    ...(state.dossier || {}),
    humanReviews: [...(state.dossier?.humanReviews || []), review]
  }
  const analysis = updateAnalysis(state.analysis || {}, { ...current, reviewedAt, reviewerId }, action)
  return { ok: true, review, evidence: nextEvidence, state: { ...state, registry: updatedRegistry, analysis, dossier } }
}

module.exports = {
  REVIEW_ACTIONS,
  latestEvidence,
  needsHumanReview,
  listPendingHumanReviews,
  applyHumanDocumentReview
}
