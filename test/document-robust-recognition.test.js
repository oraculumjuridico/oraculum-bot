"use strict"

const assert = require("node:assert/strict")
const crypto = require("node:crypto")
const sharp = require("sharp")
const { avaliarQualidadeImagem } = require("../src/domain/document-image-quality")
const { preprocessarImagemDocumento } = require("../src/domain/document-image-preprocessing")
const { executarPipelineDocumental } = require("../src/domain/document-pipeline-orchestrator")
const { classificarDocumento } = require("../src/domain/document-classifier")
const { processarAnaliseDocumentalPosUpload, emitirLogsDocumentaisSeguros } = require("../src/domain/document-analysis-integration")
const { registrarEvidenciaDocumental, registrarConfirmacaoDocumental, normalizarContratoEvidencias } = require("../src/domain/document-evidence-model")
const { resolveDocumentPartyIdentity } = require("../src/domain/document-party-identity")
const { confirmAndDecide } = require("../src/domain/document-requirement-engine")
const { evaluateGuidedDocumentReceipt, applyGuidedDocumentReceipt } = require("../src/domain/document-guided-receipt")
const { logInfo } = require("../src/utils/logging")

const NOW = "2026-08-09T12:00:00.000Z"

function hash(value) {
  return crypto.createHash("sha256").update(String(value)).digest("hex")
}

function evidence(registry, input = {}) {
  return registrarEvidenciaDocumental(registry, {
    fileId: input.fileId,
    sha256: input.sha256 || hash(input.fileId),
    tipoDocumento: input.type,
    classificacao: { tipoDocumento: input.type, confianca: input.confidence ?? 0.94 },
    extracao: { camposExtraidos: input.fields || {}, confiancaPorCampo: {} },
    coverage: input.coverage || [],
    requirementId: "doc_rg",
    partyRole: input.partyRole === undefined ? "titular" : input.partyRole,
    partyResolutionStatus: input.partyResolutionStatus || input.partyRole || null,
    status: input.status || "analyzed",
    version: 1
  })
}

function confirmedFront() {
  let registry = evidence(normalizarContratoEvidencias({}), {
    fileId: "front", type: "RG frente", fields: { cpf: "529.982.247-25", rg: "123" }
  })
  registry = registrarConfirmacaoDocumental(registry, {
    fileId: "front", origem: "guided_matched_upload", data: NOW
  })
  return registry
}

function pipelineResult(type = "RG verso", confidence = 0.93, fields = {}) {
  return {
    preprocessamento: { profile: "grayscale_contrast", avisos: [], erros: [] },
    qualidade: { ok: true, warnings: [], metrics: {} },
    ocr: { textoCompleto: "ASSINATURA DO TITULAR LEI 7116", confianca: 86, avisos: [], erros: [] },
    classificacao: { tipoDocumento: type, confianca: confidence, avisos: [], erros: [] },
    extracao: { camposExtraidos: fields, confiancaPorCampo: {}, avisos: [], erros: [] },
    selectedVariant: "grayscale_contrast",
    tentativas: [{
      retryAttempt: 1, preprocessingProfile: "grayscale_contrast", classificationType: type,
      classificationConfidence: confidence, ocrHasText: true, ocrConfidence: 86,
      qualityWarnings: [], errorCodes: [], safe: confidence >= 0.85, score: 150
    }]
  }
}

function memoryDeps(initialRegistry, pipeline) {
  let state = { version: 1, registry: initialRegistry }
  let analysis = null
  let analysisWrites = 0
  const logs = []
  return {
    get state() { return state },
    get analysisWrites() { return analysisWrites },
    get logs() { return logs },
    lerJsonEmSubpastaDrive: async () => ({ dados: analysis }),
    salvarJsonEmSubpastaDrive: async (_folder, _subfolder, _name, data) => {
      analysis = structuredClone(data); analysisWrites += 1; return { id: "analysis-state" }
    },
    carregarEstadoDocumental: async () => state,
    atualizarEstadoDocumental: async (_folder, partial) => {
      state = { ...state, ...structuredClone(partial) }
      return { arquivo: { id: "document-state" }, estado: state }
    },
    normalizarEntradaDocumental: async ({ fileId, buffer }) => ({
      fileId, sha256: crypto.createHash("sha256").update(buffer).digest("hex"), mimeType: "image/jpeg",
      units: [{ evidenceId: fileId, fileId, pageNumber: null, mimeType: "image/jpeg", buffer }],
      reviewRequired: false, warnings: [], errors: []
    }),
    executarPipelineDocumental: async input => typeof pipeline === "function" ? pipeline(input) : pipeline,
    agruparDocumentosProcessados: docs => ({ documentosPessoais: docs, avisos: [], erros: [] }),
    logInfo: event => logs.push(event), logDebug: () => {}, logErro: () => {}
  }
}

async function analyzeBack(registry, pipeline, trustedUser = {}, imageBuffer = Buffer.from([0xff, 0xd8, 0xff, 1])) {
  const deps = memoryDeps(registry, pipeline)
  const result = await processarAnaliseDocumentalPosUpload({
    pastaDriveId: "case-folder",
    arquivo: { id: "back", name: "verso.jpg" },
    buffer: imageBuffer,
    mimeType: "image/jpeg",
    contexto: { fluxoDocumento: "guiado", documentoId: "doc_rg", folha: "Verso" },
    resolvePartyRole: ({ pipeline: analyzed, registry: current, contexto }) => resolveDocumentPartyIdentity({
      extraction: analyzed.extracao,
      trustedUser,
      registry: current,
      documentType: analyzed.classificacao.tipoDocumento,
      classificationConfidence: analyzed.classificacao.confianca,
      requirementId: contexto.documentoId
    })
  }, deps)
  return { result, deps }
}

function variantDeps(definitions, calls) {
  return {
    preprocessingProfiles: Object.keys(definitions),
    maxVariants: 3,
    preprocessarImagemDocumento: async (input, options) => {
      calls.preprocess.push(options.profile)
      if (definitions[options.profile].preprocessError) throw Object.assign(new Error("profile failed"), { code: "PROFILE_FAILED" })
      return { buffer: input.buffer, mimeType: "image/png", profile: options.profile, steps: [], original: {}, processed: {} }
    },
    avaliarQualidadeImagem: async () => ({ ok: true, warnings: [], metrics: { width: 1200, height: 800 } }),
    executarOCRImagem: async (_input, options) => {
      const profile = calls.preprocess.at(-1)
      calls.ocr.push(profile)
      if (Array.isArray(calls.ocrTimeouts)) calls.ocrTimeouts.push(options.timeoutMs)
      const definition = definitions[profile]
      return { textoCompleto: definition.text || "", confianca: definition.ocrConfidence ?? 80, avisos: [], erros: definition.ocrError ? [{ code: "OCR_FAIL" }] : [] }
    },
    classificarDocumento: async ({ textoOCR }) => {
      const definition = Object.values(definitions).find(item => item.text === textoOCR) || {}
      return { tipoDocumento: definition.type || "Documento desconhecido", confianca: definition.confidence ?? 0.2, avisos: [], erros: [] }
    },
    extrairDadosDocumento: async () => ({ camposExtraidos: {}, confiancaPorCampo: {}, avisos: [], erros: [] })
  }
}

async function main() {
  const realImage = await sharp({ create: { width: 1200, height: 800, channels: 3, background: "#dddddd" } })
    .composite([{ input: Buffer.from('<svg width="1200" height="800"><rect x="80" y="80" width="1040" height="640" fill="#fff" stroke="#111" stroke-width="8"/><text x="160" y="390" font-size="72">REGISTRO GERAL</text></svg>') }])
    .jpeg({ quality: 88 }).toBuffer()
  const quality = await avaliarQualidadeImagem({ buffer: realImage })
  assert.equal(quality.ok, true)
  assert.equal(quality.warnings.includes("low_resolution"), false)
  for (const profile of ["standard", "grayscale_contrast", "text_enhanced"]) {
    const processed = await preprocessarImagemDocumento({ buffer: realImage, mimeType: "image/jpeg" }, { profile })
    assert.equal(processed.profile, profile)
    assert.equal(processed.mimeType, "image/png")
  }
  const realBackClassification = classificarDocumento({
    textoOCR: "VALIDA EM TODO O TERRITORIO NACIONAL DATA DE EXPEDICAO SECRETARIA DE SEGURANCA PUBLICA REGISTRO GERAL"
  })
  assert.equal(realBackClassification.tipoDocumento, "RG verso")
  assert.ok(realBackClassification.confianca >= 0.85)
  const lowResolution = await sharp({ create: { width: 180, height: 120, channels: 3, background: "#888" } }).png().toBuffer()
  assert.ok((await avaliarQualidadeImagem({ buffer: lowResolution })).warnings.includes("low_resolution"))
  const flatBlurred = await sharp({ create: { width: 900, height: 600, channels: 3, background: "#888" } }).png().toBuffer()
  const blurQuality = await avaliarQualidadeImagem({ buffer: flatBlurred })
  assert.ok(blurQuality.warnings.includes("possible_blur") || blurQuality.warnings.includes("low_contrast"))

  let calls = { preprocess: [], ocr: [] }
  let pipeline = await executarPipelineDocumental({ buffer: realImage, mimeType: "image/jpeg" }, variantDeps({
    standard: { text: "REGISTRO GERAL NOME", type: "RG frente", confidence: 0.92 }
  }, calls))
  assert.equal(pipeline.selectedVariant, "standard")
  assert.equal(calls.ocr.length, 1)

  calls = { preprocess: [], ocr: [] }
  pipeline = await executarPipelineDocumental({ buffer: realImage, mimeType: "image/jpeg" }, variantDeps({
    standard: { text: "texto insuficiente", type: "Documento desconhecido", confidence: 0.2 },
    grayscale_contrast: { text: "ASSINATURA DO TITULAR LEI 7116", type: "RG verso", confidence: 0.92 },
    text_enhanced: { text: "ASSINATURA DO TITULAR DATA DE EXPEDICAO", type: "RG verso", confidence: 0.95 }
  }, calls))
  assert.equal(pipeline.selectedVariant, "text_enhanced")
  assert.equal(calls.ocr.length, 3)
  assert.equal(pipeline.variantSelection.conflict, false)

  calls = { preprocess: [], ocr: [] }
  const allFailed = await executarPipelineDocumental({ buffer: realImage, mimeType: "image/jpeg" }, variantDeps({
    standard: { preprocessError: true },
    grayscale_contrast: { text: "", type: "Documento desconhecido", confidence: 0.2 },
    text_enhanced: { text: "texto", type: "RG verso", confidence: 0.4 }
  }, calls))
  assert.equal(allFailed.variantSelection.safe, false)
  assert.equal(allFailed.tentativas.length, 3)

  calls = { preprocess: [], ocr: [] }
  const conflicting = await executarPipelineDocumental({ buffer: realImage, mimeType: "image/jpeg" }, variantDeps({
    standard: { text: "frente candidata", type: "RG frente", confidence: 0.76 },
    grayscale_contrast: { text: "verso seguro", type: "RG verso", confidence: 0.91 },
    text_enhanced: { text: "nao executado", type: "RG verso", confidence: 0.91 }
  }, calls))
  assert.equal(conflicting.variantSelection.conflict, true)
  assert.ok(conflicting.classificacao.erros.some(item => item.code === "DOCUMENT_VARIANT_CLASSIFICATION_CONFLICT"))

  calls = { preprocess: [], ocr: [] }
  const safeConflict = await executarPipelineDocumental({ buffer: realImage, mimeType: "image/jpeg" }, variantDeps({
    standard: { text: "ASSINATURA DO TITULAR LEI 7116", type: "RG verso", confidence: 0.88 },
    grayscale_contrast: { text: "CONTA DE ENERGIA COMPROVANTE", type: "Comprovante de residência", confidence: 0.92 }
  }, calls))
  assert.deepEqual(calls.ocr, ["standard", "grayscale_contrast"])
  assert.equal(safeConflict.variantSelection.conflict, true)
  assert.equal(safeConflict.variantSelection.safe, false)
  assert.ok(safeConflict.classificacao.erros.some(item => item.code === "DOCUMENT_VARIANT_CLASSIFICATION_CONFLICT"))

  calls = { preprocess: [], ocr: [] }
  const agreeing = await executarPipelineDocumental({ buffer: realImage, mimeType: "image/jpeg" }, variantDeps({
    standard: { text: "ASSINATURA DO TITULAR LEI 7116", type: "RG verso", confidence: 0.88 },
    grayscale_contrast: { text: "DATA DE EXPEDICAO REGISTRO GERAL", type: "RG verso", confidence: 0.91 }
  }, calls))
  assert.deepEqual(calls.ocr, ["standard", "grayscale_contrast"])
  assert.equal(agreeing.variantSelection.conflict, false)
  assert.equal(agreeing.variantSelection.safe, true)

  calls = { preprocess: [], ocr: [] }
  const safeWithOcrFailure = await executarPipelineDocumental({ buffer: realImage, mimeType: "image/jpeg" }, variantDeps({
    standard: { text: "ASSINATURA DO TITULAR LEI 7116", type: "RG verso", confidence: 0.9 },
    grayscale_contrast: { text: "", ocrError: true }
  }, calls))
  assert.deepEqual(calls.ocr, ["standard", "grayscale_contrast"])
  assert.equal(safeWithOcrFailure.variantSelection.conflict, false)
  assert.equal(safeWithOcrFailure.variantSelection.safe, true)

  calls = { preprocess: [], ocr: [] }
  const laterSafe = await executarPipelineDocumental({ buffer: realImage, mimeType: "image/jpeg" }, variantDeps({
    standard: { text: "texto duvidoso", type: "Documento desconhecido", confidence: 0.3 },
    grayscale_contrast: { text: "ASSINATURA DO TITULAR LEI 7116", type: "RG verso", confidence: 0.9 }
  }, calls))
  assert.equal(laterSafe.selectedVariant, "grayscale_contrast")
  assert.equal(laterSafe.variantSelection.conflict, false)
  assert.equal(laterSafe.variantSelection.safe, true)

  calls = { preprocess: [], ocr: [] }
  const threeWayConflict = await executarPipelineDocumental({ buffer: realImage, mimeType: "image/jpeg" }, variantDeps({
    standard: { text: "REGISTRO GERAL NOME TITULAR", type: "RG frente", confidence: 0.88 },
    grayscale_contrast: { text: "ASSINATURA DO TITULAR LEI 7116", type: "RG verso", confidence: 0.91 },
    text_enhanced: { text: "CONTA DE ENERGIA COMPROVANTE", type: "Comprovante de residência", confidence: 0.9 }
  }, calls))
  assert.equal(threeWayConflict.tentativas.length, 3)
  assert.equal(threeWayConflict.variantSelection.conflict, true)
  assert.equal(threeWayConflict.variantSelection.safe, false)

  calls = { preprocess: [], ocr: [] }
  const boundedVariants = await executarPipelineDocumental({ buffer: realImage, mimeType: "image/jpeg" }, variantDeps({
    standard: { text: "REGISTRO GERAL NOME TITULAR", type: "RG frente", confidence: 0.9 },
    grayscale_contrast: { text: "REGISTRO GERAL NOME", type: "RG frente", confidence: 0.9 },
    text_enhanced: { text: "REGISTRO GERAL TITULAR", type: "RG frente", confidence: 0.9 },
    ignored_fourth_profile: { text: "CONTA DE ENERGIA", type: "Comprovante de residência", confidence: 0.99 }
  }, calls))
  assert.equal(boundedVariants.tentativas.length, 3)
  assert.equal(calls.ocr.includes("ignored_fourth_profile"), false)
  assert.equal(boundedVariants.variantSelection.maxVariants, 3)

  calls = { preprocess: [], ocr: [], ocrTimeouts: [] }
  const budgetDeps = variantDeps({
    standard: { text: "REGISTRO GERAL NOME TITULAR", type: "RG frente", confidence: 0.9 },
    grayscale_contrast: { text: "ASSINATURA DO TITULAR LEI 7116", type: "RG verso", confidence: 0.9 }
  }, calls)
  const preprocessWithinBudget = budgetDeps.preprocessarImagemDocumento
  const realDateNow = Date.now
  let virtualNow = 0
  Date.now = () => virtualNow
  let budgetLimited
  try {
    budgetDeps.preprocessarImagemDocumento = async (...args) => {
      const processed = await preprocessWithinBudget(...args)
      virtualNow += 4501
      return processed
    }
    budgetLimited = await executarPipelineDocumental(
      { buffer: realImage, mimeType: "image/jpeg" },
      { ...budgetDeps, totalTimeoutMs: 5000 }
    )
  } finally {
    Date.now = realDateNow
  }
  assert.equal(budgetLimited.tentativas.length, 1)
  assert.deepEqual(calls.ocr, ["standard"])
  assert.ok(calls.ocrTimeouts.every(timeoutMs => timeoutMs <= 5000))
  assert.equal(budgetLimited.variantSelection.totalTimeoutMs, 5000)

  const frontRegistry = confirmedFront()
  const paired = await analyzeBack(frontRegistry, pipelineResult())
  const backEvidence = paired.result.evidencias[0]
  assert.equal(backEvidence.partyRole, null)
  assert.equal(backEvidence.partyResolutionStatus, "scoped_pair_candidate")
  assert.equal(backEvidence.status, "analyzed")
  const receipt = evaluateGuidedDocumentReceipt({ requirementId: "doc_rg", folha: "Verso", analysisResult: paired.result })
  assert.equal(receipt.accepted, true)
  const completed = confirmAndDecide(paired.result.registry, { fileId: "back", origem: "guided_matched_upload", data: NOW })
  assert.equal(completed.decision.status, "delivered")

  let integrationAttempt = 0
  const integrated = await analyzeBack(frontRegistry, input => executarPipelineDocumental(input, {
    preprocessingProfiles: ["standard", "grayscale_contrast"],
    maxVariants: 2,
    executarOCRImagem: async () => {
      integrationAttempt += 1
      return integrationAttempt === 1
        ? { textoCompleto: "texto parcial", confianca: 48, avisos: [], erros: [] }
        : { textoCompleto: "ASSINATURA DO TITULAR LEI 7116 VALIDA EM TODO O TERRITORIO NACIONAL", confianca: 88, avisos: [], erros: [] }
    },
    classificarDocumento,
    extrairDadosDocumento: async () => ({ camposExtraidos: {}, confiancaPorCampo: {}, avisos: [], erros: [] })
  }), {}, realImage)
  assert.equal(integrated.result.entrada.pipeline.selectedVariant, "grayscale_contrast")
  assert.equal(integrated.result.evidencias.length, 1)
  assert.equal(integrated.result.evidencias[0].partyResolutionStatus, "scoped_pair_candidate")
  const integratedReceipt = evaluateGuidedDocumentReceipt({ requirementId: "doc_rg", folha: "Verso", analysisResult: integrated.result })
  assert.equal(integratedReceipt.advance, true)
  assert.equal(confirmAndDecide(integrated.result.registry, {
    fileId: "back", origem: "guided_matched_upload", data: NOW
  }).decision.status, "delivered")

  const withoutFront = await analyzeBack(normalizarContratoEvidencias({}), pipelineResult())
  assert.equal(withoutFront.result.evidencias[0].status, "review")
  assert.equal(withoutFront.result.evidencias[0].partyResolutionStatus, "indeterminado")
  const divergent = await analyzeBack(frontRegistry, pipelineResult("RG verso", 0.93, { cpf: "111.444.777-35" }), { cpf: "529.982.247-25" })
  assert.equal(divergent.result.evidencias[0].partyRole, "terceiro")
  assert.equal(divergent.result.evidencias[0].status, "review")
  const crossSourceDivergence = await analyzeBack(
    frontRegistry,
    pipelineResult("RG verso", 0.93, { cpf: "529.982.247-25", rg: "999" }),
    { cpf: "529.982.247-25" }
  )
  assert.equal(crossSourceDivergence.result.evidencias[0].partyRole, "terceiro")
  assert.equal(crossSourceDivergence.result.evidencias[0].status, "review")

  const lowPipeline = pipelineResult("RG verso", 0.4)
  const low = await analyzeBack(frontRegistry, lowPipeline)
  assert.equal(low.result.evidencias[0].status, "review")
  const lowReceipt = evaluateGuidedDocumentReceipt({ requirementId: "doc_rg", folha: "Verso", analysisResult: low.result })
  assert.equal(lowReceipt.advance, true)
  assert.equal(lowReceipt.pendingReview, true)

  let samePhoto = evidence(normalizarContratoEvidencias({}), { fileId: "same", type: "RG frente", coverage: ["front"] })
  assert.equal(confirmAndDecide(samePhoto, { fileId: "same", origem: "client", assertion: "front_and_back_same_image", data: NOW }).decision.status, "partial")

  const qualityRegistry = evidence(normalizarContratoEvidencias({}), { fileId: "blur", type: "RG verso", confidence: 0.4 })
  qualityRegistry.evidencias[0].quality = { warnings: ["possible_blur"] }
  const qualityReceipt = evaluateGuidedDocumentReceipt({
    requirementId: "doc_rg", folha: "Verso", analysisResult: { ok: true, registry: qualityRegistry, evidencias: qualityRegistry.evidencias }
  })
  assert.match(qualityReceipt.message.normalize("NFD").replace(/[\u0300-\u036f]/g, ""), /pouco nitida/i)

  assert.equal(paired.result.evidencias.length, 1)
  assert.equal(paired.deps.analysisWrites, 1)
  const repeated = await processarAnaliseDocumentalPosUpload({
    pastaDriveId: "case-folder", arquivo: { id: "back", name: "verso.jpg" },
    buffer: Buffer.from([0xff, 0xd8, 0xff, 1]), mimeType: "image/jpeg"
  }, paired.deps)
  assert.equal(repeated.skipped, true)
  assert.equal(paired.deps.analysisWrites, 1)

  const user = { docAtualIdx: 1 }
  const applied = applyGuidedDocumentReceipt(user, receipt, { requirementId: "doc_rg", fileId: "back", totalParts: 2, decisionStatus: "delivered" })
  const duplicates = await Promise.all([
    Promise.resolve(applyGuidedDocumentReceipt(user, receipt, { requirementId: "doc_rg", fileId: "back", totalParts: 2, decisionStatus: "delivered" })),
    Promise.resolve(applyGuidedDocumentReceipt(user, receipt, { requirementId: "doc_rg", fileId: "back", totalParts: 2, decisionStatus: "delivered" }))
  ])
  assert.equal(applied.advanced, true)
  assert.ok(duplicates.every(item => item.reason === "already_applied"))

  const safeLogs = []
  emitirLogsDocumentaisSeguros({
    logger: event => safeLogs.push(event),
    pipeline: { ...pipelineResult(), ocr: { textoCompleto: "MARIA CPF 529.982.247-25 RG 123", confianca: 90 }, selectedVariant: "grayscale_contrast" },
    contexto: { folha: "Verso" }, evidenceStatus: "analyzed",
    partyResolution: { status: "scoped_pair_candidate", reasonCode: "confirmed_trusted_front_available" }
  })
  const serializedLogs = JSON.stringify(safeLogs)
  assert.doesNotMatch(serializedLogs, /MARIA|529\.982|\"rg\"\s*:\s*\"123\"/i)
  assert.match(serializedLogs, /classificationType|preprocessingProfile|reasonCode/)
  const consoleLines = []
  const originalConsoleLog = console.log
  console.log = line => consoleLines.push(String(line))
  try {
    logInfo({
      event: "document.analysis_attempt", status: "review", classificationType: "RG verso",
      classificationConfidence: 0.7, ocrHasText: true, preprocessingProfile: "standard",
      reasonCode: "strong_identity_insufficient", qualityWarnings: "possible_blur",
      textoOCR: "MARIA 529.982.247-25"
    })
  } finally {
    console.log = originalConsoleLog
  }
  assert.equal(consoleLines.length, 1)
  assert.doesNotMatch(consoleLines[0], /MARIA|529\.982/)
  assert.match(consoleLines[0], /strong_identity_insufficient/)

  const preprocessingFailure = await executarPipelineDocumental({ buffer: realImage, mimeType: "image/jpeg" }, variantDeps({
    standard: { preprocessError: true },
    grayscale_contrast: { text: "ASSINATURA DO TITULAR", type: "RG verso", confidence: 0.9 }
  }, { preprocess: [], ocr: [] }))
  assert.equal(preprocessingFailure.selectedVariant, "grayscale_contrast")
}

main().then(() => console.log("document-robust-recognition.test.js: ok")).catch(error => {
  console.error(error)
  process.exitCode = 1
})
