const { preprocessarImagemDocumento } = require("./document-image-preprocessing")
const { executarOCRImagem } = require("./document-ocr")
const { classificarDocumento } = require("./document-classifier")
const { extrairDadosDocumento } = require("./document-extractor")
const { avaliarQualidadeImagem } = require("./document-image-quality")

const DEFAULT_PREPROCESSING_PROFILES = Object.freeze([
  "standard",
  "grayscale_contrast",
  "text_enhanced",
  "text_enhanced_rotate_90",
  "text_enhanced_rotate_270"
])
const MAX_DOCUMENT_VARIANTS = 5
const SAFE_CLASSIFICATION_CONFIDENCE = 0.85
const DEFAULT_TOTAL_PIPELINE_TIMEOUT_MS = 45000

function criarErroPipeline(code, message) {
  return {
    code,
    message
  }
}

function serializarErroPipeline(error, fallbackCode = "DOCUMENT_PIPELINE_ERROR") {
  if (!error) {
    return criarErroPipeline(fallbackCode, "erro desconhecido no pipeline documental")
  }

  return criarErroPipeline(
    error.code || fallbackCode,
    error.message || String(error)
  )
}

function criarEtapaInterrompida(etapa, dependencia) {
  return {
    avisos: [
      criarErroPipeline(
        "DOCUMENT_PIPELINE_STEP_SKIPPED",
        `etapa ${etapa} interrompida porque ${dependencia} falhou`
      )
    ],
    erros: []
  }
}

function resultadoTemErro(resultado) {
  return Array.isArray(resultado?.erros) && resultado.erros.length > 0
}

function criarResultadoVazio() {
  return {
    preprocessamento: null,
    ocr: null,
    classificacao: null,
    extracao: null
  }
}

function montarMetadadosImagem(preprocessamento = {}) {
  return {
    mimeType: preprocessamento.mimeType || null,
    extension: preprocessamento.extension || null,
    original: preprocessamento.original || null,
    processed: preprocessamento.processed || null,
    steps: preprocessamento.steps || [],
    profile: preprocessamento.profile || "standard"
  }
}

function errosPipeline(resultado = {}) {
  return [resultado.preprocessamento, resultado.ocr, resultado.classificacao, resultado.extracao]
    .flatMap(step => Array.isArray(step?.erros) ? step.erros : [])
}

function tipoConhecido(resultado = {}) {
  const type = String(resultado.classificacao?.tipoDocumento || "").trim().toLowerCase()
  return Boolean(type && type !== "documento desconhecido")
}

function resultadoSeguro(resultado = {}, minConfidence = SAFE_CLASSIFICATION_CONFIDENCE) {
  return !errosPipeline(resultado).length &&
    tipoConhecido(resultado) &&
    Number(resultado.classificacao?.confianca || 0) >= minConfidence &&
    String(resultado.ocr?.textoCompleto || "").trim().length >= 8
}

function pontuarResultado(resultado = {}, minConfidence = SAFE_CLASSIFICATION_CONFIDENCE) {
  const errorCount = errosPipeline(resultado).length
  const classificationConfidence = Number(resultado.classificacao?.confianca || 0)
  const ocrConfidence = Number(resultado.ocr?.confianca)
  const textLength = String(resultado.ocr?.textoCompleto || "").trim().length
  const extractedFields = Object.keys(resultado.extracao?.camposExtraidos || {}).length
  const qualityWarnings = resultado.qualidade?.warnings?.length || 0
  return Number((
    (resultadoSeguro(resultado, minConfidence) ? 100 : 0) +
    (tipoConhecido(resultado) ? 20 : 0) +
    Math.min(1, Math.max(0, classificationConfidence)) * 50 +
    Math.min(20, textLength / 10) +
    (Number.isFinite(ocrConfidence) ? Math.min(10, Math.max(0, ocrConfidence) / 10) : 0) +
    Math.min(15, extractedFields * 3) -
    errorCount * 100 -
    qualityWarnings * 2
  ).toFixed(3))
}

function resumoTentativa(resultado = {}, retryAttempt = 0, minConfidence = SAFE_CLASSIFICATION_CONFIDENCE) {
  return {
    retryAttempt,
    preprocessingProfile: resultado.preprocessamento?.profile || "standard",
    classificationType: resultado.classificacao?.tipoDocumento || null,
    classificationConfidence: Number(resultado.classificacao?.confianca || 0),
    ocrHasText: Boolean(String(resultado.ocr?.textoCompleto || "").trim()),
    ocrConfidence: Number.isFinite(Number(resultado.ocr?.confianca)) ? Number(resultado.ocr.confianca) : null,
    qualityWarnings: [...new Set([
      ...(resultado.qualidade?.warnings || []),
      ...(resultado.qualidade?.originalWarnings || [])
    ])],
    errorCodes: errosPipeline(resultado).map(error => error.code || "DOCUMENT_PIPELINE_ERROR"),
    safe: resultadoSeguro(resultado, minConfidence),
    score: pontuarResultado(resultado, minConfidence)
  }
}

function classificacoesConflitantes(tentativas = []) {
  const credible = tentativas.filter(item =>
    item.classificationType && item.classificationType !== "Documento desconhecido" &&
    Number(item.classificationConfidence) >= 0.7 && !item.errorCodes.length)
  return new Set(credible.map(item => item.classificationType)).size > 1
}

async function executarTentativaDocumental({ buffer, mimeType, profile, modules, options, originalQuality }) {
  const resultado = criarResultadoVazio()
  try {
    resultado.preprocessamento = await modules.preprocessarImagemDocumento(
      { buffer, mimeType },
      { ...(options.preprocessamentoOptions || {}), profile }
    )
  } catch (error) {
    resultado.preprocessamento = { erros: [serializarErroPipeline(error, "DOCUMENT_PIPELINE_PREPROCESSING_ERROR")], avisos: [], profile }
    resultado.ocr = criarEtapaInterrompida("ocr", "preprocessamento")
    resultado.classificacao = criarEtapaInterrompida("classificacao", "preprocessamento")
    resultado.extracao = criarEtapaInterrompida("extracao", "preprocessamento")
    resultado.qualidade = originalQuality
    return resultado
  }
  if (resultadoTemErro(resultado.preprocessamento)) {
    resultado.ocr = criarEtapaInterrompida("ocr", "preprocessamento")
    resultado.classificacao = criarEtapaInterrompida("classificacao", "preprocessamento")
    resultado.extracao = criarEtapaInterrompida("extracao", "preprocessamento")
    resultado.qualidade = originalQuality
    return resultado
  }
  resultado.qualidade = await modules.avaliarQualidadeImagem({
    buffer: resultado.preprocessamento.buffer,
    mimeType: resultado.preprocessamento.mimeType
  }, options.qualityOptions || {})
  resultado.qualidade.originalWarnings = originalQuality?.warnings || []
  try {
    const pageSegmentationMode = profile.startsWith("text_enhanced") ? "11" : profile === "grayscale_contrast" ? "6" : "3"
    resultado.ocr = await modules.executarOCRImagem({
      buffer: resultado.preprocessamento.buffer,
      mimeType: resultado.preprocessamento.mimeType
    }, {
      ...(options.ocrOptions || {}),
      parameters: {
        tessedit_pageseg_mode: pageSegmentationMode,
        ...(options.ocrOptions?.parameters || {})
      }
    })
  } catch (error) {
    resultado.ocr = { erros: [serializarErroPipeline(error, "DOCUMENT_PIPELINE_OCR_ERROR")], avisos: [] }
  }
  if (resultadoTemErro(resultado.ocr)) {
    resultado.classificacao = criarEtapaInterrompida("classificacao", "ocr")
    resultado.extracao = criarEtapaInterrompida("extracao", "ocr")
    return resultado
  }
  try {
    resultado.classificacao = await modules.classificarDocumento({
      textoOCR: resultado.ocr.textoCompleto,
      metadadosImagem: montarMetadadosImagem(resultado.preprocessamento),
      quantidadePaginas: resultado.ocr.paginasProcessadas
    })
  } catch (error) {
    resultado.classificacao = { erros: [serializarErroPipeline(error, "DOCUMENT_PIPELINE_CLASSIFICATION_ERROR")], avisos: [] }
  }
  if (resultadoTemErro(resultado.classificacao)) {
    resultado.extracao = criarEtapaInterrompida("extracao", "classificacao")
    return resultado
  }
  try {
    resultado.extracao = await modules.extrairDadosDocumento({
      tipoDocumento: resultado.classificacao.tipoDocumento,
      textoOCR: resultado.ocr.textoCompleto,
      resultadoClassificador: resultado.classificacao
    })
  } catch (error) {
    resultado.extracao = { erros: [serializarErroPipeline(error, "DOCUMENT_PIPELINE_EXTRACTION_ERROR")], avisos: [] }
  }
  return resultado
}

async function executarPipelineDocumental(input = {}, options = {}) {
  const buffer = Buffer.isBuffer(input) ? input : input?.buffer
  const mimeType = options.mimeType || input?.mimeType

  const modules = {
    preprocessarImagemDocumento: options.preprocessarImagemDocumento || preprocessarImagemDocumento,
    executarOCRImagem: options.executarOCRImagem || executarOCRImagem,
    classificarDocumento: options.classificarDocumento || classificarDocumento,
    extrairDadosDocumento: options.extrairDadosDocumento || extrairDadosDocumento,
    avaliarQualidadeImagem: options.avaliarQualidadeImagem || avaliarQualidadeImagem
  }
  const injected = Boolean(options.preprocessarImagemDocumento || options.executarOCRImagem || options.classificarDocumento || options.extrairDadosDocumento)
  const requestedProfiles = Array.isArray(options.preprocessingProfiles) && options.preprocessingProfiles.length
    ? options.preprocessingProfiles : injected ? ["standard"] : DEFAULT_PREPROCESSING_PROFILES
  const maxVariants = Math.max(1, Math.min(MAX_DOCUMENT_VARIANTS, Number(options.maxVariants || requestedProfiles.length)))
  const profiles = [...new Set(requestedProfiles)].slice(0, maxVariants)
  const minConfidence = Number(options.minClassificationConfidence || SAFE_CLASSIFICATION_CONFIDENCE)
  const totalTimeoutMs = Math.max(5000, Math.min(60000, Number(options.totalTimeoutMs || DEFAULT_TOTAL_PIPELINE_TIMEOUT_MS)))
  const startedAt = Date.now()
  const originalQuality = await modules.avaliarQualidadeImagem({ buffer, mimeType }, options.qualityOptions || {})
  const attempts = []
  let selected = null
  let selectedAttempt = null
  for (let index = 0; index < profiles.length; index++) {
    const remainingMs = totalTimeoutMs - (Date.now() - startedAt)
    if (remainingMs < 1000) break
    const attemptOptions = {
      ...options,
      ocrOptions: {
        ...(options.ocrOptions || {}),
        timeoutMs: Math.min(Number(options.ocrOptions?.timeoutMs || 18000), remainingMs)
      }
    }
    const result = await executarTentativaDocumental({
      buffer, mimeType, profile: profiles[index], modules, options: attemptOptions, originalQuality
    })
    const attempt = resumoTentativa(result, index, minConfidence)
    attempts.push(attempt)
    if (!selectedAttempt || attempt.score > selectedAttempt.score) {
      if (selected?.preprocessamento?.buffer) delete selected.preprocessamento.buffer
      selected = result
      selectedAttempt = attempt
    } else if (result?.preprocessamento?.buffer) {
      delete result.preprocessamento.buffer
    }
  }
  selected = selected || criarResultadoVazio()
  const conflict = classificacoesConflitantes(attempts)
  if (conflict) {
    selected.classificacao = selected.classificacao || {}
    selected.classificacao.erros = [
      ...(selected.classificacao.erros || []),
      criarErroPipeline("DOCUMENT_VARIANT_CLASSIFICATION_CONFLICT", "variantes produziram classificacoes documentais conflitantes")
    ]
  }
  selected.selectedVariant = selectedAttempt?.preprocessingProfile || profiles[0] || "standard"
  selected.retryAttempt = selectedAttempt?.retryAttempt ?? 0
  selected.tentativas = attempts
  selected.variantSelection = {
    selectedVariant: selected.selectedVariant,
    retryCount: Math.max(0, attempts.length - 1),
    maxVariants,
    totalTimeoutMs,
    conflict,
    safe: resultadoSeguro(selected, minConfidence) && !conflict
  }
  return selected
}

module.exports = {
  DEFAULT_PREPROCESSING_PROFILES,
  MAX_DOCUMENT_VARIANTS,
  SAFE_CLASSIFICATION_CONFIDENCE,
  DEFAULT_TOTAL_PIPELINE_TIMEOUT_MS,
  executarPipelineDocumental,
  criarEtapaInterrompida,
  resultadoSeguro,
  pontuarResultado,
  classificacoesConflitantes
}
