const { preprocessarImagemDocumento } = require("./document-image-preprocessing")
const { executarOCRImagem } = require("./document-ocr")
const { classificarDocumento } = require("./document-classifier")
const { extrairDadosDocumento } = require("./document-extractor")

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
    steps: preprocessamento.steps || []
  }
}

async function executarPipelineDocumental(input = {}, options = {}) {
  const resultado = criarResultadoVazio()
  const buffer = Buffer.isBuffer(input) ? input : input?.buffer
  const mimeType = options.mimeType || input?.mimeType

  const modulos = {
    preprocessarImagemDocumento: options.preprocessarImagemDocumento || preprocessarImagemDocumento,
    executarOCRImagem: options.executarOCRImagem || executarOCRImagem,
    classificarDocumento: options.classificarDocumento || classificarDocumento,
    extrairDadosDocumento: options.extrairDadosDocumento || extrairDadosDocumento
  }

  try {
    resultado.preprocessamento = await modulos.preprocessarImagemDocumento(
      { buffer, mimeType },
      options.preprocessamentoOptions || {}
    )
  } catch (error) {
    resultado.preprocessamento = {
      erros: [serializarErroPipeline(error, "DOCUMENT_PIPELINE_PREPROCESSING_ERROR")],
      avisos: []
    }
    resultado.ocr = criarEtapaInterrompida("ocr", "preprocessamento")
    resultado.classificacao = criarEtapaInterrompida("classificacao", "preprocessamento")
    resultado.extracao = criarEtapaInterrompida("extracao", "preprocessamento")
    return resultado
  }

  if (resultadoTemErro(resultado.preprocessamento)) {
    resultado.ocr = criarEtapaInterrompida("ocr", "preprocessamento")
    resultado.classificacao = criarEtapaInterrompida("classificacao", "preprocessamento")
    resultado.extracao = criarEtapaInterrompida("extracao", "preprocessamento")
    return resultado
  }

  try {
    resultado.ocr = await modulos.executarOCRImagem(
      {
        buffer: resultado.preprocessamento.buffer,
        mimeType: resultado.preprocessamento.mimeType
      },
      options.ocrOptions || {}
    )
  } catch (error) {
    resultado.ocr = {
      erros: [serializarErroPipeline(error, "DOCUMENT_PIPELINE_OCR_ERROR")],
      avisos: []
    }
  }

  if (resultadoTemErro(resultado.ocr)) {
    resultado.classificacao = criarEtapaInterrompida("classificacao", "ocr")
    resultado.extracao = criarEtapaInterrompida("extracao", "ocr")
    return resultado
  }

  try {
    resultado.classificacao = await modulos.classificarDocumento({
      textoOCR: resultado.ocr.textoCompleto,
      metadadosImagem: montarMetadadosImagem(resultado.preprocessamento),
      quantidadePaginas: resultado.ocr.paginasProcessadas
    })
  } catch (error) {
    resultado.classificacao = {
      erros: [serializarErroPipeline(error, "DOCUMENT_PIPELINE_CLASSIFICATION_ERROR")],
      avisos: []
    }
  }

  if (resultadoTemErro(resultado.classificacao)) {
    resultado.extracao = criarEtapaInterrompida("extracao", "classificacao")
    return resultado
  }

  try {
    resultado.extracao = await modulos.extrairDadosDocumento({
      tipoDocumento: resultado.classificacao.tipoDocumento,
      textoOCR: resultado.ocr.textoCompleto,
      resultadoClassificador: resultado.classificacao
    })
  } catch (error) {
    resultado.extracao = {
      erros: [serializarErroPipeline(error, "DOCUMENT_PIPELINE_EXTRACTION_ERROR")],
      avisos: []
    }
  }

  return resultado
}

module.exports = {
  executarPipelineDocumental,
  criarEtapaInterrompida
}
