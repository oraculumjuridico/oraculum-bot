const sharp = require("sharp")

const SUPPORTED_IMAGE_MIME_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/tiff",
  "image/heic",
  "image/heif"
])

function normalizarMimeType(mimeType = "") {
  return String(mimeType || "").trim().toLowerCase()
}

function isSupportedDocumentImage(mimeType = "") {
  const normalized = normalizarMimeType(mimeType)
  return SUPPORTED_IMAGE_MIME_TYPES.has(normalized)
}

function criarErroPreprocessamento(message, code) {
  const error = new Error(message)
  error.code = code
  return error
}

function normalizarEntradaImagem(input, options = {}) {
  const buffer = Buffer.isBuffer(input) ? input : input?.buffer
  const mimeType = normalizarMimeType(options.mimeType || input?.mimeType)

  if (!Buffer.isBuffer(buffer)) {
    throw criarErroPreprocessamento("imagem invalida: buffer ausente", "DOCUMENT_IMAGE_BUFFER_REQUIRED")
  }
  if (!buffer.length) {
    throw criarErroPreprocessamento("imagem invalida: buffer vazio", "DOCUMENT_IMAGE_BUFFER_EMPTY")
  }
  if (mimeType && !isSupportedDocumentImage(mimeType)) {
    throw criarErroPreprocessamento(`mimeType de imagem nao suportado: ${mimeType}`, "DOCUMENT_IMAGE_UNSUPPORTED_MIME")
  }

  return {
    buffer: Buffer.from(buffer),
    mimeType: mimeType || null
  }
}

function montarOpcoes(options = {}) {
  const contrast = Number.isFinite(options.contrast) ? options.contrast : 1.08
  return {
    trimBackground: options.trimBackground || "#ffffff",
    trimThreshold: Number.isFinite(options.trimThreshold) ? options.trimThreshold : 15,
    brightness: Number.isFinite(options.brightness) ? options.brightness : 1.03,
    contrast,
    linearOffset: Number.isFinite(options.linearOffset) ? options.linearOffset : Math.round((1 - contrast) * 64),
    sharpenSigma: Number.isFinite(options.sharpenSigma) ? options.sharpenSigma : 0.8
  }
}

async function preprocessarImagemDocumento(input, options = {}) {
  const source = normalizarEntradaImagem(input, options)
  const processingOptions = montarOpcoes(options)

  let image = sharp(source.buffer, { failOn: "none" })
  const originalMetadata = await image.metadata()

  image = image
    .rotate()
    .flatten({ background: processingOptions.trimBackground })
    .trim({
      background: processingOptions.trimBackground,
      threshold: processingOptions.trimThreshold
    })
    .normalize()
    .modulate({ brightness: processingOptions.brightness })
    .linear(processingOptions.contrast, processingOptions.linearOffset)
    .sharpen({ sigma: processingOptions.sharpenSigma })
    .png({ compressionLevel: 9, adaptiveFiltering: true })

  const processedBuffer = await image.toBuffer()
  const processedMetadata = await sharp(processedBuffer, { failOn: "none" }).metadata()

  return {
    buffer: processedBuffer,
    mimeType: "image/png",
    extension: ".png",
    original: {
      bytes: source.buffer.length,
      mimeType: source.mimeType,
      format: originalMetadata.format || null,
      width: originalMetadata.width || null,
      height: originalMetadata.height || null,
      orientation: originalMetadata.orientation || null
    },
    processed: {
      bytes: processedBuffer.length,
      format: processedMetadata.format || null,
      width: processedMetadata.width || null,
      height: processedMetadata.height || null
    },
    steps: [
      "copy_buffer",
      "auto_orientation",
      "flatten_background",
      "trim_borders",
      "normalize_levels",
      "brightness_adjustment",
      "contrast_adjustment",
      "sharpen_for_ocr",
      "png_derivative"
    ]
  }
}

module.exports = {
  SUPPORTED_IMAGE_MIME_TYPES,
  isSupportedDocumentImage,
  preprocessarImagemDocumento
}
