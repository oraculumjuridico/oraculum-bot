"use strict"

const sharp = require("sharp")

const DEFAULT_QUALITY_LIMITS = Object.freeze({
  minWidth: 640,
  minHeight: 400,
  minPixels: 320000,
  darkMean: 48,
  brightMean: 222,
  minContrastDeviation: 24,
  minSharpness: 1.4,
  maxPixels: 25 * 1000 * 1000
})

function rounded(value, digits = 2) {
  return Number.isFinite(Number(value)) ? Number(Number(value).toFixed(digits)) : null
}

async function avaliarQualidadeImagem(input = {}, options = {}) {
  const buffer = Buffer.isBuffer(input) ? input : input.buffer
  if (!Buffer.isBuffer(buffer) || !buffer.length) {
    return { ok: false, warnings: ["quality_buffer_invalid"], metrics: {} }
  }
  const limits = { ...DEFAULT_QUALITY_LIMITS, ...(options.limits || {}) }
  try {
    const image = sharp(buffer, { failOn: "none", limitInputPixels: limits.maxPixels })
    const [metadata, stats] = await Promise.all([
      image.metadata(),
      image.clone().grayscale().stats()
    ])
    const width = Number(metadata.width || 0)
    const height = Number(metadata.height || 0)
    const pixels = width * height
    const luminance = stats.channels?.[0] || {}
    const mean = Number(luminance.mean)
    const deviation = Number(luminance.stdev)
    const sharpness = Number(stats.sharpness)
    const entropy = Number(stats.entropy)
    const warnings = []
    if (!width || !height || width < limits.minWidth || height < limits.minHeight || pixels < limits.minPixels) {
      warnings.push("low_resolution")
    }
    if (Number.isFinite(mean) && mean < limits.darkMean) warnings.push("underexposed")
    if (Number.isFinite(mean) && mean > limits.brightMean) warnings.push("overexposed")
    if (Number.isFinite(deviation) && deviation < limits.minContrastDeviation) warnings.push("low_contrast")
    if (Number.isFinite(sharpness) && sharpness < limits.minSharpness) warnings.push("possible_blur")
    return {
      ok: true,
      warnings: [...new Set(warnings)],
      metrics: {
        width,
        height,
        pixels,
        luminanceMean: rounded(mean),
        contrastDeviation: rounded(deviation),
        sharpness: rounded(sharpness, 3),
        entropy: rounded(entropy, 3)
      }
    }
  } catch (error) {
    return {
      ok: false,
      warnings: ["quality_analysis_failed"],
      metrics: {},
      errorCode: error.code || error.name || "QUALITY_ANALYSIS_ERROR"
    }
  }
}

module.exports = {
  DEFAULT_QUALITY_LIMITS,
  avaliarQualidadeImagem
}
