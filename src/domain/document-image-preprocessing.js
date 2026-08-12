const sharp = require("sharp")

const PREPROCESSING_PROFILES = Object.freeze({
  standard: "standard",
  grayscale_contrast: "grayscale_contrast",
  text_enhanced: "text_enhanced",
  text_enhanced_rotate_90: "text_enhanced_rotate_90",
  text_enhanced_rotate_270: "text_enhanced_rotate_270"
})

const DEFAULT_IMAGE_LIMITS = Object.freeze({
  maxPixels: 25 * 1000 * 1000,
  maxDimension: 10000,
  maxUpscaleWidth: 2200,
  maxUpscaleFactor: 1.6
})

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
    sharpenSigma: Number.isFinite(options.sharpenSigma) ? options.sharpenSigma : 0.8,
    profile: PREPROCESSING_PROFILES[options.profile] || PREPROCESSING_PROFILES.standard,
    limits: { ...DEFAULT_IMAGE_LIMITS, ...(options.limits || {}) }
  }
}

function validarDimensoes(metadata = {}, limits = DEFAULT_IMAGE_LIMITS) {
  const width = Number(metadata.width || 0)
  const height = Number(metadata.height || 0)
  if (!width || !height || width > limits.maxDimension || height > limits.maxDimension || width * height > limits.maxPixels) {
    throw criarErroPreprocessamento("dimensoes da imagem excedem o limite seguro", "DOCUMENT_IMAGE_DIMENSION_LIMIT")
  }
}

function aplicarPerfil(image, metadata, processingOptions) {
  let common = image
    .rotate()
    .flatten({ background: processingOptions.trimBackground })
    .trim({ background: processingOptions.trimBackground, threshold: processingOptions.trimThreshold })
  if (processingOptions.profile === PREPROCESSING_PROFILES.text_enhanced_rotate_90) common = common.rotate(90)
  if (processingOptions.profile === PREPROCESSING_PROFILES.text_enhanced_rotate_270) common = common.rotate(270)

  if (processingOptions.profile === PREPROCESSING_PROFILES.grayscale_contrast) {
    return common
      .grayscale()
      .normalize()
      .linear(1.2, Math.round((1 - 1.2) * 64))
      .sharpen({ sigma: 1.05 })
  }
  if ([PREPROCESSING_PROFILES.text_enhanced, PREPROCESSING_PROFILES.text_enhanced_rotate_90, PREPROCESSING_PROFILES.text_enhanced_rotate_270].includes(processingOptions.profile)) {
    const width = Number(metadata.width || 0)
    const targetWidth = Math.min(
      processingOptions.limits.maxUpscaleWidth,
      Math.max(width, Math.round(width * processingOptions.limits.maxUpscaleFactor))
    )
    let enhanced = common
    if (targetWidth > width) enhanced = enhanced.resize({ width: targetWidth, fit: "inside", withoutEnlargement: false })
    return enhanced
      .grayscale()
      .normalize()
      .median(1)
      .sharpen({ sigma: 1.2 })
      .threshold(175)
  }
  return common
    .normalize()
    .modulate({ brightness: processingOptions.brightness })
    .linear(processingOptions.contrast, processingOptions.linearOffset)
    .sharpen({ sigma: processingOptions.sharpenSigma })
}

function passosPerfil(profile, resized) {
  const common = ["copy_buffer", "auto_orientation", "flatten_background", "trim_borders"]
  if (profile === PREPROCESSING_PROFILES.grayscale_contrast) {
    return [...common, "grayscale", "normalize_levels", "strong_contrast", "sharpen_for_ocr", "png_derivative"]
  }
  if ([PREPROCESSING_PROFILES.text_enhanced, PREPROCESSING_PROFILES.text_enhanced_rotate_90, PREPROCESSING_PROFILES.text_enhanced_rotate_270].includes(profile)) {
    const rotation = profile.endsWith("_90") ? ["rotate_90"] : profile.endsWith("_270") ? ["rotate_270"] : []
    return [...common, ...rotation, ...(resized ? ["controlled_upscale"] : []), "grayscale", "normalize_levels", "median_noise_reduction", "sharpen_for_ocr", "binary_threshold", "png_derivative"]
  }
  return [...common, "normalize_levels", "brightness_adjustment", "contrast_adjustment", "sharpen_for_ocr", "png_derivative"]
}

async function preprocessarImagemDocumento(input, options = {}) {
  const source = normalizarEntradaImagem(input, options)
  const processingOptions = montarOpcoes(options)

  let image = sharp(source.buffer, { failOn: "none", limitInputPixels: processingOptions.limits.maxPixels })
  const originalMetadata = await image.metadata()
  validarDimensoes(originalMetadata, processingOptions.limits)

  image = aplicarPerfil(image, originalMetadata, processingOptions)
    .png({ compressionLevel: 9, adaptiveFiltering: true })

  const processedBuffer = await image.toBuffer()
  const processedMetadata = await sharp(processedBuffer, { failOn: "none" }).metadata()

  return {
    buffer: processedBuffer,
    mimeType: "image/png",
    extension: ".png",
    profile: processingOptions.profile,
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
    steps: passosPerfil(
      processingOptions.profile,
      processingOptions.profile.startsWith("text_enhanced") && processedMetadata.width > originalMetadata.width
    )
  }
}

module.exports = {
  SUPPORTED_IMAGE_MIME_TYPES,
  PREPROCESSING_PROFILES,
  DEFAULT_IMAGE_LIMITS,
  isSupportedDocumentImage,
  preprocessarImagemDocumento
}
