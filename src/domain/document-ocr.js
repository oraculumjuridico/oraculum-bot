const { createWorker, OEM } = require("tesseract.js")
const portugueseLanguage = require("@tesseract.js-data/por")

const SUPPORTED_OCR_IMAGE_MIME_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/bmp",
  "image/webp",
  "image/gif"
])

function normalizarMimeType(mimeType = "") {
  return String(mimeType || "").trim().toLowerCase()
}

function criarErroOCR(code, message) {
  return {
    code,
    message
  }
}

function serializarErroOCR(error, fallbackCode = "OCR_PROCESSING_ERROR") {
  if (!error) {
    return criarErroOCR(fallbackCode, "erro desconhecido no OCR")
  }

  return criarErroOCR(
    error.code || fallbackCode,
    error.message || String(error)
  )
}

function criarResultadoOCR({ startTime, textoCompleto = "", paginasProcessadas = 0, confianca = null, avisos = [], erros = [] }) {
  return {
    textoCompleto,
    paginasProcessadas,
    confianca,
    tempoProcessamentoMs: Date.now() - startTime,
    avisos,
    erros
  }
}

function normalizarEntradaOCR(input, options = {}) {
  const buffer = Buffer.isBuffer(input) ? input : input?.buffer
  const mimeType = normalizarMimeType(options.mimeType || input?.mimeType)

  if (!Buffer.isBuffer(buffer)) {
    throw criarErroOCR("OCR_IMAGE_BUFFER_REQUIRED", "imagem invalida: buffer ausente")
  }
  if (!buffer.length) {
    throw criarErroOCR("OCR_IMAGE_BUFFER_EMPTY", "imagem invalida: buffer vazio")
  }
  if (!mimeType) {
    throw criarErroOCR("OCR_IMAGE_MIME_REQUIRED", "mimeType da imagem ausente")
  }
  if (!SUPPORTED_OCR_IMAGE_MIME_TYPES.has(mimeType)) {
    throw criarErroOCR("OCR_IMAGE_UNSUPPORTED_MIME", `mimeType de imagem nao suportado para OCR: ${mimeType}`)
  }

  return {
    buffer: Buffer.from(buffer),
    mimeType
  }
}

async function encerrarWorkerOCR(worker, avisos) {
  if (!worker || typeof worker.terminate !== "function") {
    return
  }

  try {
    await worker.terminate()
  } catch (error) {
    avisos.push(serializarErroOCR(error, "OCR_WORKER_TERMINATE_WARNING"))
  }
}

async function executarOCRImagem(input, options = {}) {
  const startTime = Date.now()
  const avisos = []
  let worker = null
  let recognitionTimeout = null

  try {
    const source = normalizarEntradaOCR(input, options)
    const language = options.language || options.lang || portugueseLanguage.code || "por"
    const workerFactory = options.createWorker || createWorker
    const oem = options.oem || OEM.LSTM_ONLY
    const workerOptions = {
      langPath: portugueseLanguage.langPath,
      gzip: portugueseLanguage.gzip,
      cacheMethod: "none",
      ...(options.workerOptions || {})
    }

    worker = await workerFactory(
      language,
      oem,
      workerOptions,
      options.workerConfig || {}
    )

    if (options.parameters && typeof worker.setParameters === "function") {
      await worker.setParameters(options.parameters)
    }

    const timeoutMs = Math.max(1000, Math.min(30000, Number(options.timeoutMs || 18000)))
    const recognition = worker.recognize(source.buffer, options.recognizeOptions || {}, options.output, options.jobId)
    const timeout = new Promise((resolve, reject) => {
      recognitionTimeout = setTimeout(() => reject(Object.assign(new Error("tempo limite do OCR excedido"), { code: "OCR_TIMEOUT" })), timeoutMs)
    })
    const result = await Promise.race([recognition, timeout])
    clearTimeout(recognitionTimeout)
    recognitionTimeout = null
    const data = result?.data || {}
    const textoCompleto = typeof data.text === "string" ? data.text : ""
    const confianca = Number.isFinite(data.confidence) ? data.confidence : null

    if (!textoCompleto.trim()) {
      avisos.push(criarErroOCR("OCR_TEXT_EMPTY", "OCR concluido sem texto detectado"))
    }
    if (confianca === null) {
      avisos.push(criarErroOCR("OCR_CONFIDENCE_UNAVAILABLE", "nivel de confianca indisponivel"))
    }

    return criarResultadoOCR({
      startTime,
      textoCompleto,
      paginasProcessadas: 1,
      confianca,
      avisos
    })
  } catch (error) {
    return criarResultadoOCR({
      startTime,
      avisos,
      erros: [serializarErroOCR(error)]
    })
  } finally {
    if (recognitionTimeout) clearTimeout(recognitionTimeout)
    await encerrarWorkerOCR(worker, avisos)
  }
}

module.exports = {
  SUPPORTED_OCR_IMAGE_MIME_TYPES,
  executarOCRImagem
}
