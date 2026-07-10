const { executarPipelineDocumental } = require("./document-pipeline-orchestrator")
const { agruparDocumentosProcessados } = require("./document-grouper")
const {
  lerJsonEmSubpastaDrive,
  salvarJsonEmSubpastaDrive
} = require("./drive-files")
const {
  atualizarEstadoDocumental
} = require("./document-state-repository")
const { logDebug, logErro } = require("../utils/logging")

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
    contexto
  } = input

  const dependencias = {
    executarPipelineDocumental: deps.executarPipelineDocumental || executarPipelineDocumental,
    agruparDocumentosProcessados: deps.agruparDocumentosProcessados || agruparDocumentosProcessados,
    lerJsonEmSubpastaDrive: deps.lerJsonEmSubpastaDrive || lerJsonEmSubpastaDrive,
    salvarJsonEmSubpastaDrive: deps.salvarJsonEmSubpastaDrive || salvarJsonEmSubpastaDrive,
    atualizarEstadoDocumental: deps.atualizarEstadoDocumental || atualizarEstadoDocumental,
    logDebug: deps.logDebug || logDebug,
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

  if (arquivoJaProcessadoComSucesso(analise, arquivo.id)) {
    dependencias.logDebug(`[DOCUMENT_ANALYSIS] Arquivo ja processado: ${arquivo.id}`)
    await dependencias.atualizarEstadoDocumental(pastaDriveId, { analysis: analise }, dependencias)
    return { ok: true, skipped: true, reason: "arquivo ja processado" }
  }

  let entrada
  try {
    const pipeline = await dependencias.executarPipelineDocumental(
      { buffer, mimeType },
      { mimeType }
    )
    const documentoProcessado = criarDocumentoProcessado(arquivo, pipeline)
    const agrupamentos = dependencias.agruparDocumentosProcessados([documentoProcessado])
    entrada = montarEntradaSucesso({
      arquivo,
      mimeType,
      nomeOriginal,
      pipeline,
      agrupamentos,
      contexto
    })
  } catch (error) {
    dependencias.logErro("document_analysis", `pipeline documental falhou para ${arquivo.id}: ${error.message}`, error)
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
    { analysis: analise },
    dependencias
  )

  return {
    ok: entrada.status === "concluido",
    skipped: false,
    status: entrada.status,
    arquivoAnalise: salvo,
    arquivoEstadoDocumental: estadoDocumental?.arquivo || null,
    entrada
  }
}

module.exports = {
  DOCUMENT_ANALYSIS_FOLDER,
  DOCUMENT_ANALYSIS_FILE,
  DOCUMENT_PIPELINE_VERSION,
  processarAnaliseDocumentalPosUpload,
  removerBuffers
}
