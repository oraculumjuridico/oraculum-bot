"use strict"

const assert = require("node:assert/strict")
const { canonicalCaseFromAnalysis, canonicalCaseToHubSpot, mergeNonEmpty } = require("../src/domain/canonical-case")

const analysis = {
  caseImportId: "fixture-pilot",
  identityConfirmationApplied: true,
  consolidatedResult: {
    nomesEncontrados: ["Pessoa Fictícia"],
    cpfsEncontrados: ["00000000191"],
    telefonesEncontrados: ["5511999999999"],
    mappedType: { value: "inss_bpc" },
    documentosClassificados: [{ category: "identidade" }],
    documentsPending: ["comprovante"],
    quarantinedDocuments: [{ reason: "terceiro" }],
    reviewReasons: ["documento_pendente"],
    blockingReviewReasons: [],
    confidence: 0.91,
    sourceFolder: "pilot-fixture"
  }
}

const model = canonicalCaseFromAnalysis({ analysis, caseNumber: "PRV.260725.001" })
assert.equal(model.title, "🟢 PRV.260725.001 - BPC LOAS")
assert.equal(model.identifiers.abbreviation, "PRV")
assert.equal(model.review.humanReviewApplied, true)
assert.equal(model.documents.pending.length, 1)
assert.equal(model.documents.quarantined.length, 1)
const mapped = canonicalCaseToHubSpot(model)
assert.equal(mapped.contact.firstname, "Pessoa Fictícia")
assert.equal(mapped.deal.tipo_de_caso, "inss_bpc")
assert.equal(mapped.deal.dealname.includes("Prv-PRV"), false)
assert.deepEqual(mergeNonEmpty({ resumo_cliente: "válido" }, { resumo_cliente: "", pasta_drive: "origem" }), {
  resumo_cliente: "válido",
  pasta_drive: "origem"
})
console.log("canonical-case.test.js ok")
