const { executarPipelineDocumental } = require("./document-pipeline-orchestrator")
const { agruparDocumentosProcessados } = require("./document-grouper")
const {
  lerJsonEmSubpastaDrive,
  salvarJsonEmSubpastaDrive
} = require("./drive-files")
const {
  atualizarEstadoDocumental,
  carregarEstadoDocumental
} = require("./document-state-repository")
const { normalizarEntradaDocumental, sha256 } = require("./document-input-normalizer")
const {
  registrarEvidenciaDocumental,
  registrarDivergenciaDocumental
} = require("./document-evidence-model")
const { logDebug, logInfo, logErro } = require("../utils/logging")

const DOCUMENT_ANALYSIS_FOLDER = "00_ADMIN"
const DOCUMENT_ANALYSIS_FILE = "document-analysis.json"
const DOCUMENT_PIPELINE_VERSION = "document-pipeline-v1"

function serializarErro(error, fallbackCode = "DOCUMENT_ANALYSIS_ERROR") {
  return {
    code: error?.code || fallbackCode,
    message: error?.message || String(error || "erro desconhecido")
  }
}

function removerBuffers(valor) {
  if (Buffer.isBuffer(valor)) {
    return {
      tipo: "Buffer",
      bytes: valor.length,
      omitido: true
    }
  }
  if (Array.isArray(valor)) return valor.map(removerBuffers)
  if (valor && typeof valor === "object") {
    return Object.fromEntries(
      Object.entries(valor).map(([chave, item]) => [chave, removerBuffers(item)])
    )
  }
  return valor
}

function coletarEventos(resultado = {}, campo) {
  return [
    ...(Array.isArray(resultado.preprocessamento?.[campo]) ? resultado.preprocessamento[campo] : []),
    ...(Array.isArray(resultado.ocr?.[campo]) ? resultado.ocr[campo] : []),
    ...(Array.isArray(resultado.classificacao?.[campo]) ? resultado.classificacao[campo] : []),
    ...(Array.isArray(resultado.extracao?.[campo]) ? resultado.extracao[campo] : [])
  ]
}

function criarDocumentoProcessado(arquivo = {}, pipeline = {}) {
  return {
    fileId: arquivo.id || null,
    arquivoOriginal: arquivo.name || arquivo.nome || null,
    webViewLink: arquivo.webViewLink || null,
    classificacao: pipeline.classificacao || null,
    extracao: pipeline.extracao || null
  }
}

function normalizarAnaliseExistente(dados = {}) {
  const analises = Array.isArray(dados.analises)
    ? dados.analises
    : Array.isArray(dados.arquivos)
      ? dados.arquivos
      : []

  return {
    versaoPipeline: dados.versaoPipeline || DOCUMENT_PIPELINE_VERSION,
    dataCriacao: dados.dataCriacao || new Date().toISOString(),
    dataAtualizacao: dados.dataAtualizacao || null,
    analises,
    avisos: Array.isArray(dados.avisos) ? dados.avisos : [],
    erros: Array.isArray(dados.erros) ? dados.erros : []
  }
}

function arquivoJaProcessadoComSucesso(analise = {}, fileId) {
  return Boolean(fileId && analise.analises.some(item => item?.arquivo?.fileId === fileId && item?.status === "concluido"))
}

function coverageFrom(tipoDocumento, contexto = {}, pageNumber = null) {
  const type = String(tipoDocumento || "").toLowerCase()
  const folha = String(contexto.folha || "").toLowerCase()
  if (type === "rg frente") return ["front"]
  if (type === "rg verso") return ["back"]
  if (pageNumber !== null) return []
  if (/frente/.test(folha) && !/verso/.test(folha)) return ["front"]
  if (/verso/.test(folha) && !/frente/.test(folha)) return ["back"]
  return []
}

function ocrConfidenceBucket(value) {
  const confidence = Number(value)
  if (!Number.isFinite(confidence)) return "unavailable"
  if (confidence < 60) return "low"
  if (confidence < 80) return "medium"
  return "high"
}

function recognizedSidesFromType(type) {
  const value = String(type || "").trim().toLowerCase()
  if (value === "rg frente") return "front"
  if (value === "rg verso") return "back"
  return "none"
}

function emitirLogsDocumentaisSeguros({ logger, pipeline, contexto, evidenceStatus, partyResolution }) {
  const attempts = Array.isArray(pipeline?.tentativas) && pipeline.tentativas.length
    ? pipeline.tentativas : [{
      retryAttempt: 0,
      preprocessingProfile: pipeline?.preprocessamento?.profile || "standard",
      classificationType: pipeline?.classificacao?.tipoDocumento || null,
      classificationConfidence: pipeline?.classificacao?.confianca || 0,
      ocrHasText: Boolean(String(pipeline?.ocr?.textoCompleto || "").trim()),
      ocrConfidence: pipeline?.ocr?.confianca,
      qualityWarnings: pipeline?.qualidade?.warnings || [],
      errorCodes: coletarEventos(pipeline, "erros").map(item => item.code || "DOCUMENT_PIPELINE_ERROR"),
      safe: false
    }]
  for (let index = 0; index < attempts.length; index++) {
    const attempt = attempts[index]
    const selected = pipeline?.selectedVariant
      ? attempt.preprocessingProfile === pipeline.selectedVariant
      : index === 0
    const reasonCode = selected
      ? partyResolution?.reasonCode || attempt.errorCodes?.[0] ||
        (evidenceStatus === "analyzed" ? "analysis_completed" : attempt.safe ? "safe_result_selected" : "insufficient_result_selected")
      : attempt.errorCodes?.[0] || "variant_not_selected"
    try {
      logger({
        event: "document.analysis_attempt",
        status: selected ? evidenceStatus : "attempted",
        classificationType: attempt.classificationType || "unknown",
        classificationConfidence: attempt.classificationConfidence,
        ocrHasText: Boolean(attempt.ocrHasText),
        ocrConfidenceBucket: ocrConfidenceBucket(attempt.ocrConfidence),
        preprocessingProfile: attempt.preprocessingProfile || "standard",
        requestedSide: String(contexto?.folha || "none").toLowerCase(),
        recognizedSides: recognizedSidesFromType(attempt.classificationType),
        evidenceStatus,
        partyResolutionStatus: partyResolution?.status || "not_applicable",
        reasonCode,
        qualityWarnings: (attempt.qualityWarnings || []).join(",") || "none",
        retryAttempt: attempt.retryAttempt || 0,
        selectedVariant: pipeline?.selectedVariant || "standard"
      })
    } catch {}
  }
}

function nextEvidenceVersion(registry = {}, evidenceId) {
  return Math.max(0, ...(registry.evidencias || [])
    .filter(item => item.evidenceId === evidenceId)
    .map(item => Number(item.version || 0))) + 1
}

function registrarDivergenciaSeNova(registry, input) {
  const signature = [...(input.evidenceIds || [])].sort().join("|")
  const exists = (registry.divergencias || []).some(item => item.code === input.code &&
    [...(item.evidenceIds || [])].sort().join("|") === signature)
  return exists ? registry : registrarDivergenciaDocumental(registry, input)
}

function montarEntradaSucesso({ arquivo, mimeType, nomeOriginal, pipeline, agrupamentos, contexto }) {
  const errosPipeline = coletarEventos(pipeline, "erros")
  const avisosPipeline = coletarEventos(pipeline, "avisos")
  const errosAgrupador = Array.isArray(agrupamentos?.erros) ? agrupamentos.erros : []
  const avisosAgrupador = Array.isArray(agrupamentos?.avisos) ? agrupamentos.avisos : []
  const erros = [...errosPipeline, ...errosAgrupador]

  return removerBuffers({
    status: erros.length ? "erro" : "concluido",
    versaoPipeline: DOCUMENT_PIPELINE_VERSION,
    dataProcessamento: new Date().toISOString(),
    arquivo: {
      fileId: arquivo.id || null,
      nome: arquivo.name || nomeOriginal || null,
      nomeOriginal: nomeOriginal || null,
      mimeType: mimeType || null,
      webViewLink: arquivo.webViewLink || null,
      contexto: contexto || {}
    },
    pipeline,
    agrupamentos,
    avisos: [...avisosPipeline, ...avisosAgrupador],
    erros
  })
}

function montarEntradaErro({ arquivo, mimeType, nomeOriginal, contexto, error }) {
  return {
    status: "erro",
    versaoPipeline: DOCUMENT_PIPELINE_VERSION,
    dataProcessamento: new Date().toISOString(),
    arquivo: {
      fileId: arquivo?.id || null,
      nome: arquivo?.name || nomeOriginal || null,
      nomeOriginal: nomeOriginal || null,
      mimeType: mimeType || null,
      webViewLink: arquivo?.webViewLink || null,
      contexto: contexto || {}
    },
    pipeline: null,
    agrupamentos: null,
    avisos: [],
    erros: [serializarErro(error)]
  }
}

async function processarAnaliseDocumentalPosUpload(input = {}, deps = {}) {
  const {
    pastaDriveId,
    arquivo,
    buffer,
    mimeType,
    nomeOriginal,
    contexto,
    resolvePartyRole
  } = input

  const dependencias = {
    executarPipelineDocumental: deps.executarPipelineDocumental || executarPipelineDocumental,
    agruparDocumentosProcessados: deps.agruparDocumentosProcessados || agruparDocumentosProcessados,
    lerJsonEmSubpastaDrive: deps.lerJsonEmSubpastaDrive || lerJsonEmSubpastaDrive,
    salvarJsonEmSubpastaDrive: deps.salvarJsonEmSubpastaDrive || salvarJsonEmSubpastaDrive,
    atualizarEstadoDocumental: deps.atualizarEstadoDocumental || atualizarEstadoDocumental,
    carregarEstadoDocumental: deps.carregarEstadoDocumental || carregarEstadoDocumental,
    normalizarEntradaDocumental: deps.normalizarEntradaDocumental || normalizarEntradaDocumental,
    logDebug: deps.logDebug || logDebug,
    logInfo: deps.logInfo || logInfo,
    logErro: deps.logErro || logErro
  }

  if (!pastaDriveId || !arquivo?.id || !Buffer.isBuffer(buffer)) {
    return { ok: false, skipped: true, reason: "entrada documental incompleta" }
  }

  const existente = await dependencias.lerJsonEmSubpastaDrive(
    pastaDriveId,
    DOCUMENT_ANALYSIS_FOLDER,
    DOCUMENT_ANALYSIS_FILE
  )
  const analise = normalizarAnaliseExistente(existente?.dados || {})

  const estadoAnterior = await dependencias.carregarEstadoDocumental(pastaDriveId, dependencias)
  let registry = estadoAnterior?.registry || {}
  const physicalSha256 = sha256(buffer)
  if (arquivoJaProcessadoComSucesso(analise, arquivo.id) &&
      (registry.evidencias || []).some(item => item.fileId === arquivo.id && item.sha256 === physicalSha256)) {
    dependencias.logDebug(`[DOCUMENT_ANALYSIS] Arquivo ja processado: ${arquivo.id}`)
    await dependencias.atualizarEstadoDocumental(pastaDriveId, { analysis: analise }, dependencias)
    return { ok: true, skipped: true, reason: "arquivo ja processado" }
  }

  let entrada
  try {
    const normalizedInput = await dependencias.normalizarEntradaDocumental({
      fileId: arquivo.id, buffer, mimeType
    }, deps)
    const unitResults = []
    for (const unit of normalizedInput.units) {
      try {
        const pipeline = await dependencias.executarPipelineDocumental(
          { buffer: unit.buffer, mimeType: unit.mimeType },
          { mimeType: unit.mimeType }
        )
        const erros = coletarEventos(pipeline, "erros")
        const avisos = coletarEventos(pipeline, "avisos")
        const identityDocument = /^(rg(?: frente| verso)?|cnh)$/i.test(String(pipeline.classificacao?.tipoDocumento || "").trim())
        const partyResolution = typeof resolvePartyRole === "function" && identityDocument
          ? await resolvePartyRole({ pipeline, registry, contexto: contexto || {}, fileId: arquivo.id, evidenceId: unit.evidenceId })
          : { status: contexto?.partyRole || null, reasonCode: null }
        const scopedPairCandidate = partyResolution?.status === "scoped_pair_candidate"
        const identityUnsafe = identityDocument && typeof resolvePartyRole === "function" &&
          partyResolution?.status !== "titular" && !scopedPairCandidate
        const status = normalizedInput.reviewRequired || erros.length || identityUnsafe ? "review" : "analyzed"
        emitirLogsDocumentaisSeguros({
          logger: dependencias.logInfo,
          pipeline,
          contexto,
          evidenceStatus: status,
          partyResolution
        })
        registry = registrarEvidenciaDocumental(registry, {
          evidenceId: unit.evidenceId,
          fileId: arquivo.id,
          sha256: normalizedInput.sha256,
          mimeType: normalizedInput.mimeType,
          pageNumber: unit.pageNumber,
          tipoDocumento: pipeline.classificacao?.tipoDocumento,
          ocr: pipeline.ocr,
          quality: pipeline.qualidade,
          classificacao: pipeline.classificacao,
          extracao: pipeline.extracao,
          coverage: coverageFrom(pipeline.classificacao?.tipoDocumento, contexto, unit.pageNumber),
          requirementId: contexto?.documentoId || null,
          partyRole: partyResolution?.status === "titular" || partyResolution?.status === "terceiro"
            ? partyResolution.status : null,
          partyResolutionStatus: partyResolution?.status || null,
          status,
          avisos: [...avisos, ...normalizedInput.warnings],
          erros: [...erros, ...normalizedInput.errors],
          version: nextEvidenceVersion(registry, unit.evidenceId)
        })
        if (identityUnsafe) {
          registry = registrarDivergenciaSeNova(registry, {
            code: partyResolution?.status === "terceiro"
              ? "document_holder_identity_mismatch"
              : "document_holder_identity_unverified",
            evidenceIds: [unit.evidenceId],
            status: "open",
            createdAt: new Date().toISOString(),
            details: { reasonCode: partyResolution?.reasonCode || "strong_identity_insufficient" }
          })
        }
        unitResults.push({ unit: { ...unit, buffer: undefined }, pipeline })
      } catch (unitError) {
        dependencias.logErro("document_analysis", `pipeline documental falhou para ${arquivo.id}: ${unitError.message}`, unitError)
        registry = registrarEvidenciaDocumental(registry, {
          evidenceId: unit.evidenceId, fileId: arquivo.id, sha256: normalizedInput.sha256,
          mimeType: normalizedInput.mimeType, pageNumber: unit.pageNumber, status: "review",
          erros: [serializarErro(unitError)], version: nextEvidenceVersion(registry, unit.evidenceId)
        })
        unitResults.push({ unit: { ...unit, buffer: undefined }, error: serializarErro(unitError) })
      }
    }
    if (!normalizedInput.units.length) {
      registry = registrarEvidenciaDocumental(registry, {
        fileId: arquivo.id, sha256: normalizedInput.sha256, mimeType: normalizedInput.mimeType,
        status: "review", erros: normalizedInput.errors, avisos: normalizedInput.warnings,
        version: nextEvidenceVersion(registry, arquivo.id)
      })
    }
    if (normalizedInput.reviewRequired) {
      registry = registrarDivergenciaSeNova(registry, {
        code: "document_input_requires_review",
        evidenceIds: (registry.evidencias || []).filter(item => item.fileId === arquivo.id).map(item => item.evidenceId),
        status: "open",
        createdAt: new Date().toISOString(),
        details: { errors: normalizedInput.errors, warnings: normalizedInput.warnings }
      })
    }
    const documentosProcessados = unitResults.filter(item => item.pipeline)
      .map(item => criarDocumentoProcessado(arquivo, item.pipeline))
    const agrupamentos = documentosProcessados.length
      ? dependencias.agruparDocumentosProcessados(documentosProcessados)
      : { avisos: [], erros: [] }
    const pipeline = unitResults.length === 1
      ? unitResults[0].pipeline
      : { units: unitResults.map(removerBuffers), reviewRequired: normalizedInput.reviewRequired }
    entrada = montarEntradaSucesso({
      arquivo,
      mimeType,
      nomeOriginal,
      pipeline,
      agrupamentos,
      contexto
    })
    const unitErrors = unitResults.filter(item => item.error).map(item => item.error)
    if (unitErrors.length || normalizedInput.reviewRequired) {
      entrada.status = "erro"
      entrada.erros = [...entrada.erros, ...unitErrors, ...normalizedInput.errors]
      entrada.avisos = [...entrada.avisos, ...normalizedInput.warnings]
    }
  } catch (error) {
    dependencias.logErro("document_analysis", `pipeline documental falhou para ${arquivo.id}: ${error.message}`, error)
    registry = registrarEvidenciaDocumental(registry, {
      fileId: arquivo.id,
      sha256: physicalSha256,
      mimeType: mimeType || null,
      status: "review",
      erros: [serializarErro(error)],
      version: nextEvidenceVersion(registry, arquivo.id)
    })
    registry = registrarDivergenciaSeNova(registry, {
      code: "document_analysis_requires_review",
      evidenceIds: [arquivo.id],
      status: "open",
      createdAt: new Date().toISOString(),
      details: { errorCode: error.code || "DOCUMENT_ANALYSIS_ERROR" }
    })
    entrada = montarEntradaErro({ arquivo, mimeType, nomeOriginal, contexto, error })
  }

  analise.versaoPipeline = DOCUMENT_PIPELINE_VERSION
  analise.dataAtualizacao = new Date().toISOString()
  analise.analises = [
    ...analise.analises.filter(item => item?.arquivo?.fileId !== arquivo.id),
    entrada
  ]
  analise.avisos = [
    ...analise.avisos,
    ...entrada.avisos.map(aviso => ({ ...aviso, fileId: arquivo.id }))
  ]
  analise.erros = [
    ...analise.erros.filter(item => item?.fileId !== arquivo.id),
    ...entrada.erros.map(erro => ({ ...erro, fileId: arquivo.id }))
  ]

  const salvo = await dependencias.salvarJsonEmSubpastaDrive(
    pastaDriveId,
    DOCUMENT_ANALYSIS_FOLDER,
    DOCUMENT_ANALYSIS_FILE,
    analise
  )

  if (!salvo?.id) {
    return { ok: false, skipped: false, reason: "falha ao salvar analise documental", entrada }
  }

  const estadoDocumental = await dependencias.atualizarEstadoDocumental(
    pastaDriveId,
    { analysis: analise, registry },
    dependencias
  )

  return {
    ok: entrada.status === "concluido",
    skipped: false,
    status: entrada.status,
    arquivoAnalise: salvo,
    arquivoEstadoDocumental: estadoDocumental?.arquivo || null,
    entrada,
    registry: estadoDocumental?.estado?.registry || registry,
    evidencias: (estadoDocumental?.estado?.registry?.evidencias || registry.evidencias || [])
      .filter(item => item.fileId === arquivo.id)
  }
}

module.exports = {
  DOCUMENT_ANALYSIS_FOLDER,
  DOCUMENT_ANALYSIS_FILE,
  DOCUMENT_PIPELINE_VERSION,
  processarAnaliseDocumentalPosUpload,
  removerBuffers,
  emitirLogsDocumentaisSeguros,
  ocrConfidenceBucket
}
