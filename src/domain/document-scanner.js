"use strict"

const sharp = require("sharp")

const DEFAULT_SCANNER_OPTIONS = Object.freeze({
  previewMaxDimension: 1100,
  outputMaxDimension: 3500,
  maxPixels: 25 * 1000 * 1000,
  minAreaRatio: 0.2,
  minConfidence: 0.68,
  margin: 10,
  jpegQuality: 90
})

let openCvPromise = null
let scannerQueue = Promise.resolve()

function scannerEnabled(env = process.env) {
  return !["0", "false", "off", "no"].includes(String(env.DOCUMENT_SCANNER_ENABLED || "true").trim().toLowerCase())
}

function loadOpenCv() {
  if (!openCvPromise) {
    openCvPromise = Promise.resolve()
      .then(() => require("@opencvjs/node").loadOpenCV())
      .catch(error => {
        openCvPromise = null
        throw error
      })
  }
  return openCvPromise
}

function executarSerializado(task) {
  const current = scannerQueue.then(task, task)
  scannerQueue = current.catch(() => {})
  return current
}

function distancia(a, b) {
  return Math.hypot(Number(a.x) - Number(b.x), Number(a.y) - Number(b.y))
}

function ordenarPontos(points = []) {
  if (!Array.isArray(points) || points.length !== 4) return null
  const bySum = [...points].sort((a, b) => (a.x + a.y) - (b.x + b.y))
  const byDiff = [...points].sort((a, b) => (a.x - a.y) - (b.x - b.y))
  return {
    topLeft: bySum[0],
    topRight: byDiff[3],
    bottomRight: bySum[3],
    bottomLeft: byDiff[0]
  }
}

function cosineAt(previous, current, next) {
  const ax = previous.x - current.x
  const ay = previous.y - current.y
  const bx = next.x - current.x
  const by = next.y - current.y
  const denominator = Math.hypot(ax, ay) * Math.hypot(bx, by)
  return denominator ? Math.abs((ax * bx + ay * by) / denominator) : 1
}

function qualidadeRetangular(ordered) {
  const points = [ordered.topLeft, ordered.topRight, ordered.bottomRight, ordered.bottomLeft]
  const worstCosine = Math.max(...points.map((point, index) =>
    cosineAt(points[(index + 3) % 4], point, points[(index + 1) % 4])
  ))
  return Math.max(0, Math.min(1, 1 - worstCosine))
}

function pontosDoContorno(approx) {
  const data = approx.data32S || []
  const points = []
  for (let index = 0; index + 1 < data.length; index += 2) {
    points.push({ x: Number(data[index]), y: Number(data[index + 1]) })
  }
  return points
}

function detectarQuadrilatero(cv, rgba, width, height, options) {
  const src = cv.matFromArray(height, width, cv.CV_8UC4, rgba)
  const gray = new cv.Mat()
  const blurred = new cv.Mat()
  const edges = new cv.Mat()
  const closed = new cv.Mat()
  const contours = new cv.MatVector()
  const hierarchy = new cv.Mat()
  const kernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(5, 5))
  let best = null

  try {
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY)
    cv.GaussianBlur(gray, blurred, new cv.Size(5, 5), 0, 0, cv.BORDER_DEFAULT)
    cv.Canny(blurred, edges, 45, 140, 3, false)
    cv.morphologyEx(edges, closed, cv.MORPH_CLOSE, kernel)
    cv.findContours(closed, contours, hierarchy, cv.RETR_LIST, cv.CHAIN_APPROX_SIMPLE)

    const imageArea = width * height
    for (let index = 0; index < contours.size(); index += 1) {
      const contour = contours.get(index)
      const approx = new cv.Mat()
      try {
        const area = Math.abs(cv.contourArea(contour, false))
        const areaRatio = area / imageArea
        if (areaRatio < options.minAreaRatio || areaRatio > 0.995) continue
        const perimeter = cv.arcLength(contour, true)
        cv.approxPolyDP(contour, approx, perimeter * 0.02, true)
        if (approx.rows !== 4 || !cv.isContourConvex(approx)) continue
        const ordered = ordenarPontos(pontosDoContorno(approx))
        if (!ordered) continue
        const rectangularity = qualidadeRetangular(ordered)
        const confidence = Math.min(0.98, 0.5 + Math.min(areaRatio, 0.9) * 0.35 + rectangularity * 0.15)
        if (!best || confidence > best.confidence) best = { ordered, areaRatio, rectangularity, confidence }
      } finally {
        approx.delete()
        contour.delete()
      }
    }
    return best
  } finally {
    kernel.delete()
    hierarchy.delete()
    contours.delete()
    closed.delete()
    edges.delete()
    blurred.delete()
    gray.delete()
    src.delete()
  }
}

function escalarPontos(ordered, scaleX, scaleY) {
  return Object.fromEntries(Object.entries(ordered).map(([key, point]) => [key, {
    x: point.x * scaleX,
    y: point.y * scaleY
  }]))
}

function dimensoesSaida(ordered, maxDimension) {
  let width = Math.round(Math.max(
    distancia(ordered.topLeft, ordered.topRight),
    distancia(ordered.bottomLeft, ordered.bottomRight)
  ))
  let height = Math.round(Math.max(
    distancia(ordered.topLeft, ordered.bottomLeft),
    distancia(ordered.topRight, ordered.bottomRight)
  ))
  if (width < 160 || height < 160) return null
  const scale = Math.min(1, maxDimension / Math.max(width, height))
  width = Math.max(160, Math.round(width * scale))
  height = Math.max(160, Math.round(height * scale))
  return { width, height }
}

async function transformarPerspectiva(cv, normalized, ordered, options) {
  const dimensions = dimensoesSaida(ordered, options.outputMaxDimension)
  if (!dimensions) return null
  const source = cv.matFromArray(normalized.info.height, normalized.info.width, cv.CV_8UC4, normalized.data)
  const target = new cv.Mat()
  const sourcePoints = cv.matFromArray(4, 1, cv.CV_32FC2, [
    ordered.topLeft.x, ordered.topLeft.y,
    ordered.topRight.x, ordered.topRight.y,
    ordered.bottomRight.x, ordered.bottomRight.y,
    ordered.bottomLeft.x, ordered.bottomLeft.y
  ])
  const targetPoints = cv.matFromArray(4, 1, cv.CV_32FC2, [
    0, 0,
    dimensions.width - 1, 0,
    dimensions.width - 1, dimensions.height - 1,
    0, dimensions.height - 1
  ])
  const matrix = cv.getPerspectiveTransform(sourcePoints, targetPoints)
  try {
    cv.warpPerspective(
      source,
      target,
      matrix,
      new cv.Size(dimensions.width, dimensions.height),
      cv.INTER_CUBIC,
      cv.BORDER_REPLICATE,
      new cv.Scalar()
    )
    const buffer = await sharp(Buffer.from(target.data), {
      raw: { width: dimensions.width, height: dimensions.height, channels: 4 }
    })
      .flatten({ background: "#ffffff" })
      .extend({
        top: options.margin,
        bottom: options.margin,
        left: options.margin,
        right: options.margin,
        background: "#ffffff"
      })
      .normalize()
      .sharpen({ sigma: 0.7 })
      .jpeg({ quality: options.jpegQuality, chromaSubsampling: "4:4:4" })
      .toBuffer()
    return {
      buffer,
      width: dimensions.width + options.margin * 2,
      height: dimensions.height + options.margin * 2
    }
  } finally {
    matrix.delete()
    targetPoints.delete()
    sourcePoints.delete()
    target.delete()
    source.delete()
  }
}

async function digitalizarInterno(input, options = {}) {
  const settings = { ...DEFAULT_SCANNER_OPTIONS, ...(options || {}) }
  const buffer = Buffer.isBuffer(input) ? input : input?.buffer
  if (!Buffer.isBuffer(buffer) || !buffer.length) {
    return { applied: false, reason: "scanner_input_invalid", confidence: 0 }
  }
  if (options.enabled === false || !scannerEnabled(options.env || process.env)) {
    return { applied: false, reason: "scanner_disabled", confidence: 0 }
  }

  try {
    const cv = await loadOpenCv()
    const sourceImage = sharp(buffer, { failOn: "none", limitInputPixels: settings.maxPixels })
    const sourceMetadata = await sourceImage.metadata()
    const normalized = await sourceImage
      .rotate()
      .resize({
        width: settings.outputMaxDimension,
        height: settings.outputMaxDimension,
        fit: "inside",
        withoutEnlargement: true
      })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true })
    if (!normalized.info.width || !normalized.info.height) {
      return { applied: false, reason: "scanner_dimensions_unavailable", confidence: 0 }
    }
    const base = sharp(normalized.data, { raw: normalized.info })

    const previewScale = Math.min(1, settings.previewMaxDimension / Math.max(normalized.info.width, normalized.info.height))
    const previewWidth = Math.max(1, Math.round(normalized.info.width * previewScale))
    const previewHeight = Math.max(1, Math.round(normalized.info.height * previewScale))
    const preview = await base.clone()
      .resize({ width: previewWidth, height: previewHeight, fit: "fill" })
      .raw()
      .toBuffer({ resolveWithObject: true })
    const candidate = detectarQuadrilatero(cv, preview.data, preview.info.width, preview.info.height, settings)
    if (!candidate) return { applied: false, reason: "document_edges_not_found", confidence: 0 }
    if (candidate.confidence < settings.minConfidence) {
      return { applied: false, reason: "document_edges_low_confidence", confidence: Number(candidate.confidence.toFixed(3)) }
    }

    const scaled = escalarPontos(
      candidate.ordered,
      normalized.info.width / preview.info.width,
      normalized.info.height / preview.info.height
    )
    const transformed = await transformarPerspectiva(cv, normalized, scaled, settings)
    if (!transformed) return { applied: false, reason: "document_geometry_invalid", confidence: 0 }

    return {
      applied: true,
      reason: "perspective_corrected",
      confidence: Number(candidate.confidence.toFixed(3)),
      areaRatio: Number(candidate.areaRatio.toFixed(3)),
      rectangularity: Number(candidate.rectangularity.toFixed(3)),
      buffer: transformed.buffer,
      mimeType: "image/jpeg",
      original: { width: sourceMetadata.width, height: sourceMetadata.height, bytes: buffer.length },
      processed: { width: transformed.width, height: transformed.height, bytes: transformed.buffer.length },
      steps: ["detect_document_edges", "validate_quadrilateral", "correct_perspective", "safe_margin", "scanner_enhancement"]
    }
  } catch (error) {
    return {
      applied: false,
      reason: error?.code || "scanner_processing_failed",
      confidence: 0
    }
  }
}

function digitalizarImagemDocumento(input, options = {}) {
  return executarSerializado(() => digitalizarInterno(input, options))
}

module.exports = {
  DEFAULT_SCANNER_OPTIONS,
  scannerEnabled,
  ordenarPontos,
  qualidadeRetangular,
  digitalizarImagemDocumento
}
