"use strict"

const assert = require("node:assert/strict")
const crypto = require("node:crypto")
const { registrarEvidenciaDocumental, normalizarContratoEvidencias } = require("../src/domain/document-evidence-model")
const { confirmAndDecide } = require("../src/domain/document-requirement-engine")
const { processarAnaliseDocumentalPosUpload } = require("../src/domain/document-analysis-integration")
const { compareIdentity, resolveDocumentPartyIdentity } = require("../src/domain/document-party-identity")
const { planejarSincronizacaoDocumentalHubSpot } = require("../src/domain/document-hubspot-sync")
const { evaluateGuidedDocumentReceipt, applyGuidedDocumentReceipt } = require("../src/domain/document-guided-receipt")

const NOW = "2026-08-08T20:00:00.000Z"

function evidence(registry, input = {}) {
  const fileId = input.fileId || "file"
  const type = input.type || "RG frente"
  return registrarEvidenciaDocumental(registry, {
    fileId,
    sha256: input.sha256 || crypto.createHash("sha256").update(fileId).digest("hex"),
    tipoDocumento: type,
    classificacao: { tipoDocumento: type, confianca: input.confidence ?? 0.96 },
    extracao: { camposExtraidos: input.fields || { cpf: "529.982.247-25", rg: "123" }, confiancaPorCampo: { cpf: 0.96, rg: 0.96 } },
    coverage: input.coverage || [],
    partyRole: input.partyRole === undefined ? "titular" : input.partyRole,
    status: input.status || "analyzed",
    erros: input.errors || [],
    version: 1
  })
}

function analyzed(registry, fileId) {
  return { ok: true, evidencias: registry.evidencias.filter(item => item.fileId === fileId) }
}

function evaluate(registry, fileId, folha = "Frente") {
  return evaluateGuidedDocumentReceipt({ requirementId: "doc_rg", folha, analysisResult: analyzed(registry, fileId) })
}

function confirm(registry, fileId) {
  return confirmAndDecide(registry, { fileId, origem: "guided_matched_upload", data: NOW })
}

function memoryDeps(pipeline) {
  let state = { version: 1, registry: normalizarContratoEvidencias({}) }
  let analysis = null
  return {
    get state() { return state },
    lerJsonEmSubpastaDrive: async () => ({ dados: analysis }),
    salvarJsonEmSubpastaDrive: async (_folder, _subfolder, _name, data) => {
      analysis = structuredClone(data)
      return { id: "analysis-file" }
    },
    carregarEstadoDocumental: async () => state,
    atualizarEstadoDocumental: async (_folder, partial) => {
      state = { ...state, ...structuredClone(partial) }
      return { arquivo: { id: "state-file" }, estado: state }
    },
    normalizarEntradaDocumental: async ({ fileId, buffer }) => ({
      fileId, sha256: crypto.createHash("sha256").update(buffer).digest("hex"), mimeType: "image/jpeg",
      units: [{ evidenceId: fileId, fileId, pageNumber: null, mimeType: "image/jpeg", buffer }],
      reviewRequired: false, warnings: [], errors: []
    }),
    executarPipelineDocumental: async () => pipeline,
    agruparDocumentosProcessados: docs => ({ documentosPessoais: docs, avisos: [], erros: [] }),
    logDebug: () => {}, logErro: () => {}
  }
}

async function main() {
  const exactNamePilot = resolveDocumentPartyIdentity({
    extraction: { camposExtraidos: { nome: "Jesaías Belmiro Leite Mendes", dataNascimento: "01/01/1990" } },
    trustedUser: { nome: "Jesaias Belmiro Leite Mendes" },
    documentType: "RG frente",
    classificationConfidence: 0.96,
    requirementId: "doc_rg",
    allowExactNameMatch: true
  })
  assert.equal(exactNamePilot.status, "titular")
  assert.equal(resolveDocumentPartyIdentity({
    extraction: { camposExtraidos: { nome: "Outra Pessoa", cpf: "529.982.247-25" } },
    trustedUser: { nome: "Jesaias Belmiro Leite Mendes", cpf: "111.444.777-35" },
    documentType: "RG frente",
    allowExactNameMatch: true
  }).status, "terceiro")

  const cpfEqualRgDifferent = compareIdentity(
    { cpf: "52998224725", rg: "rgb", nome: "", nascimento: "" },
    { cpf: "52998224725", rg: "rga", nome: "", nascimento: "" }
  )
  assert.deepEqual(cpfEqualRgDifferent, { status: "terceiro", reasonCode: "rg_mismatch" })
  const rgEqualCpfDifferent = compareIdentity(
    { cpf: "11144477735", rg: "rga", nome: "", nascimento: "" },
    { cpf: "52998224725", rg: "rga", nome: "", nascimento: "" }
  )
  assert.deepEqual(rgEqualCpfDifferent, { status: "terceiro", reasonCode: "cpf_mismatch" })
  assert.equal(compareIdentity(
    { cpf: "52998224725", rg: "rga", nome: "", nascimento: "" },
    { cpf: "52998224725", rg: "rga", nome: "", nascimento: "" }
  ).status, "titular")
  assert.equal(compareIdentity(
    { cpf: "52998224725", rg: "", nome: "", nascimento: "" },
    { cpf: "52998224725", rg: "rga", nome: "", nascimento: "" }
  ).status, "titular")
  assert.equal(compareIdentity(
    { cpf: "", rg: "rga", nome: "", nascimento: "" },
    { cpf: "52998224725", rg: "rga", nome: "", nascimento: "" }
  ).status, "titular")
  assert.equal(compareIdentity(
    { cpf: "", rg: "", nome: "maria da silva", nascimento: "01011990" },
    { cpf: "", rg: "", nome: "maria da silva", nascimento: "01011990" }
  ).status, "titular")
  assert.equal(compareIdentity(
    { cpf: "", rg: "", nome: "maria da silva", nascimento: "" },
    { cpf: "", rg: "", nome: "maria da silva", nascimento: "" }
  ).status, "indeterminado")

  for (const [suffix, resolution] of [["cpf-equal-rg-different", cpfEqualRgDifferent], ["rg-equal-cpf-different", rgEqualCpfDifferent]]) {
    const conflictRegistry = evidence(normalizarContratoEvidencias({}), {
      fileId: suffix,
      type: "CNH",
      coverage: ["digital_complete"],
      partyRole: resolution.status
    })
    const conflictDecision = confirm(conflictRegistry, suffix)
    assert.equal(conflictDecision.decision.status, "review")
    assert.ok(conflictDecision.registry.divergencias.some(item => item.code === "document_holder_identity_mismatch"))
    const conflictPlan = planejarSincronizacaoDocumentalHubSpot({
      registry: conflictDecision.registry,
      decision: conflictDecision.decision,
      usuario: {},
      contato: { id: "contact-A", properties: {} },
      negocio: { id: "deal-A", properties: {} }
    })
    assert.deepEqual(conflictPlan.contato.props, {})
  }

  let registry = evidence(normalizarContratoEvidencias({}), { fileId: "front", type: "RG frente" })
  const frontReceipt = evaluate(registry, "front", "Frente")
  assert.equal(frontReceipt.accepted, true)
  let frontDecision = confirm(registry, "front")
  assert.equal(frontDecision.decision.status, "partial")
  const frontUser = { docAtualIdx: 0 }
  assert.equal(applyGuidedDocumentReceipt(frontUser, frontReceipt, {
    requirementId: "doc_rg", fileId: "front", totalParts: 2, decisionStatus: frontDecision.decision.status
  }).advanced, true)
  assert.equal(frontUser.docAtualIdx, 1)

  let backFirstRegistry = evidence(normalizarContratoEvidencias({}), { fileId: "back-first", type: "RG verso" })
  const backFirstReceipt = evaluate(backFirstRegistry, "back-first", "Frente")
  assert.equal(backFirstReceipt.reasonCode, "wrong_side")
  assert.equal(backFirstReceipt.confirmEvidence, true)
  const backFirstDecision = confirm(backFirstRegistry, "back-first")
  assert.equal(backFirstDecision.decision.status, "partial")
  const backFirstUser = { docAtualIdx: 0 }
  applyGuidedDocumentReceipt(backFirstUser, backFirstReceipt, {
    requirementId: "doc_rg", fileId: "back-first", totalParts: 2, decisionStatus: "partial"
  })
  assert.equal(backFirstUser.docAtualIdx, 0)
  assert.match(backFirstReceipt.message, /frente/i)

  const residenceRegistry = evidence(normalizarContratoEvidencias({}), {
    fileId: "residence", type: "Comprovante de residencia", fields: { cep: "60000-000" }
  })
  const residenceReceipt = evaluate(residenceRegistry, "residence")
  assert.equal(residenceReceipt.reasonCode, "wrong_document_type")
  assert.equal(residenceReceipt.advance, false)
  assert.equal(residenceRegistry.evidencias[0].tipoDocumento, "Comprovante de residencia")

  const unknownRegistry = evidence(normalizarContratoEvidencias({}), {
    fileId: "unknown", type: "Documento desconhecido", confidence: 0.2, fields: {}
  })
  assert.equal(evaluate(unknownRegistry, "unknown").reasonCode, "unreadable_or_uncertain")
  assert.equal(evaluateGuidedDocumentReceipt({ requirementId: "doc_rg", folha: "Frente", analysisResult: { ok: false, evidencias: [] } }).advance, false)

  const lowRegistry = evidence(normalizarContratoEvidencias({}), {
    fileId: "low", type: "RG frente", confidence: 0.4
  })
  assert.equal(evaluate(lowRegistry, "low").reasonCode, "unreadable_or_uncertain")
  assert.equal(confirm(lowRegistry, "low").decision.status, "review")
  const highRegistry = evidence(normalizarContratoEvidencias({}), {
    fileId: "high", type: "RG frente", confidence: 0.9
  })
  assert.equal(evaluate(highRegistry, "high").accepted, true)

  const wrongUser = { docAtualIdx: 0 }
  const firstWrong = applyGuidedDocumentReceipt(wrongUser, residenceReceipt, {
    requirementId: "doc_rg", fileId: "residence", totalParts: 2
  })
  const repeatedWrong = applyGuidedDocumentReceipt(wrongUser, residenceReceipt, {
    requirementId: "doc_rg", fileId: "residence", totalParts: 2
  })
  assert.equal(firstWrong.advanced, false)
  assert.equal(repeatedWrong.reason, "already_applied")
  assert.equal(wrongUser.docAtualIdx, 0)
  applyGuidedDocumentReceipt(wrongUser, frontReceipt, {
    requirementId: "doc_rg", fileId: "front", totalParts: 2, decisionStatus: "partial"
  })
  assert.equal(wrongUser.docAtualIdx, 1)

  registry = evidence(frontDecision.registry, { fileId: "back", type: "RG verso" })
  const backReceipt = evaluate(registry, "back", "Verso")
  const complete = confirm(registry, "back")
  assert.equal(complete.decision.status, "delivered")
  const completedUser = { docAtualIdx: 1 }
  const completion = applyGuidedDocumentReceipt(completedUser, backReceipt, {
    requirementId: "doc_rg", fileId: "back", totalParts: 2, decisionStatus: "delivered"
  })
  const duplicateCompletion = await Promise.all([
    Promise.resolve(applyGuidedDocumentReceipt(completedUser, backReceipt, {
      requirementId: "doc_rg", fileId: "back", totalParts: 2, decisionStatus: "delivered"
    })),
    Promise.resolve(applyGuidedDocumentReceipt(completedUser, backReceipt, {
      requirementId: "doc_rg", fileId: "back", totalParts: 2, decisionStatus: "delivered"
    }))
  ])
  assert.equal(completion.advanced, true)
  assert.equal(completedUser.docAtualIdx, 2)
  assert.ok(duplicateCompletion.every(item => item.reason === "already_applied"))

  const thirdPipeline = {
    preprocessamento: { avisos: [], erros: [] },
    ocr: { textoCompleto: "CNH pessoa B", avisos: [], erros: [] },
    classificacao: { tipoDocumento: "CNH", confianca: 0.96 },
    extracao: {
      camposExtraidos: { nome: "Pessoa B", cpf: "111.444.777-35", dataNascimento: "02/02/1980" },
      confiancaPorCampo: { nome: 0.96, cpf: 0.96, dataNascimento: 0.96 }, avisos: [], erros: []
    }
  }
  const deps = memoryDeps(thirdPipeline)
  const titularA = { nome: "Pessoa A", cpf: "529.982.247-25", dataNascimento: "01/01/1990" }
  const thirdAnalysis = await processarAnaliseDocumentalPosUpload({
    pastaDriveId: "case-folder", arquivo: { id: "third-file", name: "documento.jpg" },
    buffer: Buffer.from([0xff, 0xd8, 0xff, 1]), mimeType: "image/jpeg",
    resolvePartyRole: ({ pipeline, registry: current }) => resolveDocumentPartyIdentity({
      extraction: pipeline.extracao, trustedUser: titularA, registry: current
    })
  }, deps)
  assert.equal(thirdAnalysis.evidencias[0].partyRole, "terceiro")
  assert.equal(thirdAnalysis.evidencias[0].status, "review")
  const thirdReceipt = evaluateGuidedDocumentReceipt({
    requirementId: "doc_rg", folha: "Frente", analysisResult: thirdAnalysis
  })
  assert.equal(thirdReceipt.reasonCode, "identity_not_verified")
  const thirdDecision = confirmAndDecide(thirdAnalysis.registry, {
    fileId: "third-file", origem: "local-test", assertion: "document_complete", data: NOW
  })
  assert.equal(thirdDecision.decision.status, "review")
  const thirdPlan = planejarSincronizacaoDocumentalHubSpot({
    registry: thirdDecision.registry, decision: thirdDecision.decision, usuario: titularA,
    contato: { id: "contact-A", properties: {} }, negocio: { id: "deal-A", properties: {} }
  })
  assert.deepEqual(thirdPlan.contato.props, {})
}

main().then(() => console.log("document-guided-receipt.test.js: ok")).catch(error => {
  console.error(error)
  process.exitCode = 1
})
