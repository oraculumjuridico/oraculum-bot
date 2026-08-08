"use strict"

const assert = require("node:assert/strict")
const crypto = require("node:crypto")
const { normalizarEntradaDocumental, sha256 } = require("../src/domain/document-input-normalizer")
const {
  registrarEvidenciaDocumental,
  normalizarContratoEvidencias
} = require("../src/domain/document-evidence-model")
const { confirmAndDecide, decideRg } = require("../src/domain/document-requirement-engine")
const { projectDocumentDecision } = require("../src/domain/document-checklist-projection")
const { confirmCanonicalDocument } = require("../src/domain/document-canonical-service")
const { marcarStatusDocumento } = require("../src/domain/documents-core")

const hash = "a".repeat(64)
const now = "2026-08-08T12:00:00.000Z"

function evidence(registry, input) {
  return registrarEvidenciaDocumental(registry, {
    fileId: input.fileId,
    sha256: input.sha256 || crypto.createHash("sha256").update(input.fileId).digest("hex"),
    pageNumber: input.pageNumber,
    tipoDocumento: input.tipoDocumento,
    extracao: { camposExtraidos: input.campos || {} },
    coverage: input.coverage || [],
    partyRole: input.partyRole,
    status: input.status || "analyzed",
    erros: input.erros || [],
    version: input.version || 1
  })
}

function confirm(registry, fileId, assertion = null) {
  return confirmAndDecide(registry, { fileId, origem: "test", assertion, data: now })
}

async function main() {
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0x00, 0x01])
  const image = await normalizarEntradaDocumental({ fileId: "image-1", buffer: jpeg, mimeType: "image/jpeg" })
  assert.equal(image.units[0].evidenceId, "image-1")
  assert.equal(image.sha256, sha256(jpeg))

  const pdf = Buffer.from("%PDF- mock")
  const onePage = await normalizarEntradaDocumental({ fileId: "pdf-1", buffer: pdf, mimeType: "application/pdf" }, {
    renderPdfPages: async () => ({ renderedPages: [{ pageNumber: 1, buffer: jpeg }], pages: [jpeg], totalPages: 1, truncated: false })
  })
  assert.deepEqual(onePage.units.map(item => item.evidenceId), ["pdf-1#page=1"])
  const multi = await normalizarEntradaDocumental({ fileId: "pdf-2", buffer: pdf, mimeType: "application/pdf" }, {
    renderPdfPages: async () => ({ renderedPages: [{ pageNumber: 1, buffer: jpeg }, { pageNumber: 3, buffer: jpeg }], pages: [jpeg, jpeg], totalPages: 3, truncated: false, pageErrors: [{ pageNumber: 2, code: "PDF_PAGE_ERROR" }] })
  })
  assert.deepEqual(multi.units.map(item => item.evidenceId), ["pdf-2#page=1", "pdf-2#page=3"])
  assert.equal(multi.reviewRequired, true)
  const invalid = await normalizarEntradaDocumental({ fileId: "pdf-3", buffer: pdf, mimeType: "application/pdf" }, {
    renderPdfPages: async () => { throw Object.assign(new Error("protected"), { code: "PDF_PASSWORD" }) }
  })
  assert.equal(invalid.reviewRequired, true)
  assert.equal(invalid.units.length, 0)

  let registry = normalizarContratoEvidencias({})
  registry = evidence(registry, { fileId: "front", tipoDocumento: "RG frente", campos: { rg: "12.345.678-9" } })
  let result = confirm(registry, "front")
  assert.equal(result.decision.status, "partial")
  result = confirm(result.registry, "front")
  assert.equal(result.created, false)
  assert.equal(result.registry.confirmacoes.length, 1)

  registry = evidence(result.registry, { fileId: "back", tipoDocumento: "RG verso", campos: { rg: "12.345.678-9" } })
  result = confirm(registry, "back")
  assert.equal(result.decision.status, "delivered")
  assert.equal(result.decision.evidenceIds.length, 2)

  let divergent = evidence(normalizarContratoEvidencias({}), { fileId: "fa", tipoDocumento: "RG frente", campos: { cpf: "529.982.247-25" } })
  divergent = confirm(divergent, "fa").registry
  divergent = evidence(divergent, { fileId: "vb", tipoDocumento: "RG verso", campos: { cpf: "111.444.777-35" } })
  const divergentResult = confirm(divergent, "vb")
  assert.equal(divergentResult.decision.status, "review")
  assert.equal(divergentResult.registry.divergencias.at(-1).code, "cpf_mismatch")

  let nameOnly = evidence(normalizarContratoEvidencias({}), { fileId: "nf", tipoDocumento: "RG frente", campos: { nome: "Maria Silva" } })
  nameOnly = confirm(nameOnly, "nf").registry
  nameOnly = evidence(nameOnly, { fileId: "nv", tipoDocumento: "RG verso", campos: { nome: "Maria Silva" } })
  assert.equal(confirm(nameOnly, "nv").decision.status, "partial")

  let sameImage = evidence(normalizarContratoEvidencias({}), { fileId: "same", tipoDocumento: "RG frente", campos: {} })
  assert.equal(confirm(sameImage, "same", "front_and_back_same_image").decision.status, "delivered")

  let pdfRegistry = evidence(normalizarContratoEvidencias({}), { fileId: "rg.pdf", pageNumber: 1, tipoDocumento: "RG frente", campos: { cpf: "529.982.247-25" } })
  pdfRegistry = evidence(pdfRegistry, { fileId: "rg.pdf", pageNumber: 2, tipoDocumento: "RG verso", campos: { cpf: "529.982.247-25" } })
  const pdfDecision = confirm(pdfRegistry, "rg.pdf")
  assert.equal(pdfDecision.decision.status, "delivered")
  assert.deepEqual(pdfDecision.decision.evidenceIds, ["rg.pdf#page=1", "rg.pdf#page=2"])
  let pageCountOnly = evidence(normalizarContratoEvidencias({}), { fileId: "two-fronts.pdf", pageNumber: 1, tipoDocumento: "RG frente" })
  pageCountOnly = evidence(pageCountOnly, { fileId: "two-fronts.pdf", pageNumber: 2, tipoDocumento: "RG frente" })
  assert.equal(confirm(pageCountOnly, "two-fronts.pdf").decision.status, "partial")

  let cnh = evidence(normalizarContratoEvidencias({}), { fileId: "cnh-one", tipoDocumento: "CNH", campos: { cpf: "529.982.247-25" } })
  assert.equal(confirm(cnh, "cnh-one").decision.status, "partial")
  let cnhComplete = evidence(normalizarContratoEvidencias({}), { fileId: "cnh-complete", tipoDocumento: "CNH", coverage: ["digital_complete"] })
  assert.equal(confirm(cnhComplete, "cnh-complete").decision.status, "delivered")
  let cnhPdf = evidence(normalizarContratoEvidencias({}), { fileId: "cnh.pdf", pageNumber: 1, tipoDocumento: "CNH", coverage: ["front"], campos: { cpf: "529.982.247-25" } })
  cnhPdf = evidence(cnhPdf, { fileId: "cnh.pdf", pageNumber: 2, tipoDocumento: "CNH", coverage: ["back"], campos: { cpf: "529.982.247-25" } })
  assert.equal(confirm(cnhPdf, "cnh.pdf").decision.status, "delivered")

  let roles = evidence(normalizarContratoEvidencias({}), { fileId: "owner", tipoDocumento: "RG frente", campos: { rg: "1" }, partyRole: "titular" })
  roles = confirm(roles, "owner").registry
  roles = evidence(roles, { fileId: "third", tipoDocumento: "RG verso", campos: { rg: "1" }, partyRole: "terceiro" })
  assert.equal(confirm(roles, "third").decision.status, "review")

  let versions = evidence(normalizarContratoEvidencias({}), { fileId: "versioned", tipoDocumento: "RG frente", version: 1 })
  versions = evidence(versions, { fileId: "versioned", tipoDocumento: "RG frente", version: 2 })
  assert.equal(versions.evidencias.length, 2)
  let sameHash = evidence(normalizarContratoEvidencias({}), { fileId: "hash-a", sha256: hash, tipoDocumento: "RG frente" })
  sameHash = evidence(sameHash, { fileId: "hash-b", sha256: hash, tipoDocumento: "RG frente" })
  assert.deepEqual(sameHash.evidencias.map(item => item.fileId), ["hash-a", "hash-b"])
  assert.throws(() => confirm(sameHash, "wrong-file"), error => error.code === "DOCUMENT_CONFIRMATION_FILE_NOT_FOUND")

  let duplicatePair = evidence(normalizarContratoEvidencias({}), { fileId: "dup-front", sha256: hash, tipoDocumento: "RG frente", campos: { rg: "1" } })
  duplicatePair = confirm(duplicatePair, "dup-front").registry
  duplicatePair = evidence(duplicatePair, { fileId: "dup-back", sha256: hash, tipoDocumento: "RG verso", campos: { rg: "1" } })
  assert.equal(confirm(duplicatePair, "dup-back").decision.status, "review")

  const delivered = confirm(cnhComplete, "cnh-complete").registry
  const uncertainAdded = evidence(delivered, { fileId: "uncertain", tipoDocumento: "Documento desconhecido", status: "review" })
  assert.equal(decideRg(uncertainAdded, { now }).decision.status, "delivered")

  let deliveredRg = evidence(normalizarContratoEvidencias({}), {
    fileId: "old-front", tipoDocumento: "RG frente", campos: { rg: "111", cpf: "529.982.247-25" }, partyRole: "titular"
  })
  deliveredRg = confirm(deliveredRg, "old-front").registry
  deliveredRg = evidence(deliveredRg, {
    fileId: "old-back", tipoDocumento: "RG verso", campos: { rg: "111", cpf: "529.982.247-25" }, partyRole: "titular"
  })
  deliveredRg = confirm(deliveredRg, "old-back").registry
  assert.equal(deliveredRg.decisoes.at(-1).status, "delivered")

  let divergentAfterDelivered = evidence(deliveredRg, {
    fileId: "new-front", tipoDocumento: "RG frente", campos: { rg: "222", cpf: "529.982.247-25" }, partyRole: "titular"
  })
  divergentAfterDelivered = confirm(divergentAfterDelivered, "new-front").registry
  divergentAfterDelivered = evidence(divergentAfterDelivered, {
    fileId: "new-back", tipoDocumento: "RG verso", campos: { rg: "222", cpf: "529.982.247-25" }, partyRole: "titular"
  })
  const reviewedAfterDelivered = confirm(divergentAfterDelivered, "new-back")
  assert.equal(reviewedAfterDelivered.decision.status, "review")
  assert.ok(reviewedAfterDelivered.registry.divergencias.some(item => item.code === "rg_mismatch"))
  assert.equal(reviewedAfterDelivered.registry.decisoes.some(item => item.status === "delivered"), true)

  let compatibleAfterDelivered = evidence(deliveredRg, {
    fileId: "compatible-front", tipoDocumento: "RG frente", campos: { rg: "111", cpf: "529.982.247-25" }, partyRole: "titular"
  })
  const compatibleResult = confirm(compatibleAfterDelivered, "compatible-front")
  assert.equal(compatibleResult.decision.status, "delivered")
  assert.equal(compatibleResult.registry.divergencias.length, 0)

  let thirdAfterDelivered = evidence(deliveredRg, {
    fileId: "third-front", tipoDocumento: "RG frente", campos: { rg: "111" }, partyRole: "terceiro"
  })
  const thirdResult = confirm(thirdAfterDelivered, "third-front")
  assert.equal(thirdResult.decision.status, "review")
  assert.ok(thirdResult.registry.divergencias.some(item => item.code === "party_role_mismatch"))

  let versionedDecision = evidence(normalizarContratoEvidencias({}), {
    fileId: "same-file", sha256: "1".repeat(64), tipoDocumento: "RG frente", version: 1
  })
  versionedDecision = confirm(versionedDecision, "same-file", "front_and_back_same_image").registry
  const historicalDecision = versionedDecision.decisoes.at(-1)
  assert.deepEqual(historicalDecision.evidenceRefs, [{ evidenceId: "same-file", version: 1, sha256: "1".repeat(64) }])
  versionedDecision = evidence(versionedDecision, {
    fileId: "same-file", sha256: "2".repeat(64), tipoDocumento: "RG verso", version: 2
  })
  const withoutNewConfirmation = decideRg(versionedDecision, { now })
  assert.equal(withoutNewConfirmation.decision.status, "delivered")
  assert.deepEqual(withoutNewConfirmation.decision.evidenceRefs, historicalDecision.evidenceRefs)
  assert.equal(withoutNewConfirmation.decision.evidenceRefs.some(ref => ref.version === 2), false)
  const confirmedVersion2 = confirm(versionedDecision, "same-file")
  assert.equal(confirmedVersion2.decision.status, "review")
  assert.ok(confirmedVersion2.registry.divergencias.some(item => item.code === "confirmed_evidence_version_changed"))
  assert.deepEqual(historicalDecision.evidenceRefs, [{ evidenceId: "same-file", version: 1, sha256: "1".repeat(64) }])

  const user = { docsEntregues: [], docsParciais: [] }
  const partialDecision = { requirementId: "doc_rg", revision: 1, status: "partial" }
  assert.equal(projectDocumentDecision(user, partialDecision, marcarStatusDocumento).changed, true)
  assert.deepEqual(user.docsParciais, ["doc_rg"])
  assert.equal(projectDocumentDecision(user, partialDecision, marcarStatusDocumento).changed, false)
  const finalDecision = { requirementId: "doc_rg", revision: 2, status: "delivered" }
  projectDocumentDecision(user, finalDecision, marcarStatusDocumento)
  assert.deepEqual(user.docsEntregues, ["doc_rg"])
  assert.equal(projectDocumentDecision(user, { ...partialDecision, revision: 3 }, marcarStatusDocumento).status, "delivered")
  assert.deepEqual(user.docsEntregues, ["doc_rg"])
  assert.equal("_postHumanDocumentChecklist" in user, false)

  const canonicalRegistry = evidence(normalizarContratoEvidencias({}), { fileId: "service-file", tipoDocumento: "RG frente" })
  let persistedState = { version: 1, registry: canonicalRegistry }
  const service = await confirmCanonicalDocument({
    pastaDriveId: "case-folder", fileId: "service-file", origem: "doc_cliente_anexar", now
  }, {
    carregarEstadoDocumental: async folder => folder === "case-folder" ? persistedState : null,
    atualizarEstadoDocumental: async (_folder, partial) => {
      persistedState = { ...persistedState, ...partial }
      return { arquivo: { id: "document-state" }, estado: persistedState }
    }
  })
  assert.equal(service.ok, true)
  assert.equal(persistedState.registry.confirmacoes[0].fileId, "service-file")
  await assert.rejects(() => confirmCanonicalDocument({
    pastaDriveId: "case-folder", fileId: "other-file", origem: "doc_cliente_anexar", now
  }, {
    carregarEstadoDocumental: async () => persistedState,
    atualizarEstadoDocumental: async () => { throw new Error("must not save") }
  }), error => error.code === "DOCUMENT_CONFIRMATION_FILE_NOT_FOUND")
}

main().then(() => console.log("document-canonical-core.test.js: ok")).catch(error => {
  console.error(error)
  process.exitCode = 1
})
