"use strict"

const assert = require("node:assert/strict")
const { registrarEvidenciaDocumental } = require("../src/domain/document-evidence-model")
const { listPendingHumanReviews, applyHumanDocumentReview } = require("../src/domain/document-human-review")

const hash = "a".repeat(64)
let registry = registrarEvidenciaDocumental({}, {
  fileId: "file-1", sha256: hash, mimeType: "image/jpeg", tipoDocumento: "Documento desconhecido",
  classificacao: { tipoDocumento: "Documento desconhecido", confianca: 0.4 }, status: "review", version: 1
})
const state = {
  registry,
  analysis: { analises: [{ status: "erro", arquivo: { fileId: "file-1", nome: "foto.jpg" }, pipeline: { classificacao: { tipoDocumento: "Documento desconhecido", confianca: 0.4 }, extracao: { camposExtraidos: { nome: "Pessoa" } } } }] },
  dossier: {}
}

assert.equal(listPendingHumanReviews(state).length, 1)
const reviewed = applyHumanDocumentReview(state, { evidenceId: "file-1", action: "rg_frente", reviewerId: "admin-1", now: "2026-08-12T00:00:00.000Z" })
assert.equal(reviewed.ok, true)
assert.equal(reviewed.evidence.version, 2)
assert.equal(reviewed.evidence.tipoDocumento, "RG frente")
assert.equal(reviewed.evidence.partyRole, "titular")
assert.deepEqual(reviewed.evidence.coverage, ["front"])
assert.equal(reviewed.state.analysis.analises[0].status, "concluido")
assert.equal(listPendingHumanReviews(reviewed.state).length, 0)

const discarded = applyHumanDocumentReview(state, { evidenceId: "file-1", action: "descartar", reviewerId: "admin-1" })
assert.equal(discarded.evidence.status, "discarded")
assert.equal(discarded.state.analysis.analises[0].status, "erro")
assert.equal(discarded.state.analysis.analises[0].pipeline.extracao, null)

const legacy = {
  registry: {}, dossier: {},
  analysis: { analises: [{ status: "concluido", arquivo: { fileId: "legacy-1", nome: "tentativa.jpg", mimeType: "image/jpeg" }, pipeline: { classificacao: { tipoDocumento: "Documento desconhecido", confianca: 0.2 }, extracao: {} }, contexto: { documentoId: "doc_rg" } }] }
}
assert.equal(listPendingHumanReviews(legacy).length, 1)
const legacyReviewed = applyHumanDocumentReview(legacy, { evidenceId: "legacy-1", sha256: "b".repeat(64), action: "rg_verso" })
assert.equal(legacyReviewed.ok, true)
assert.equal(legacyReviewed.evidence.version, 1)
assert.equal(legacyReviewed.evidence.partyResolutionStatus, "scoped_pair_candidate")

console.log("document-human-review.test.js: ok")
