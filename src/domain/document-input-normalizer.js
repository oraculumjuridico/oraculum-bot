"use strict"

const crypto = require("node:crypto")
const path = require("node:path")

const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg", "image/png", "image/webp", "image/tiff", "image/heic", "image/heif", "application/pdf"
])
const DEFAULT_LIMITS = Object.freeze({
  maxFileBytes: 20 * 1024 * 1024, maxFilesPerCase: 40, maxPdfPages: 12,
  maxPixels: 25 * 1000 * 1000, maxDimension: 10000, maxWidth: 10000,
  maxHeight: 10000, ocrTimeoutMs: 60 * 1000
})

function detectMime(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 4) return ""
  if (buffer.subarray(0, 5).toString("ascii") === "%PDF-") return "application/pdf"
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "image/jpeg"
  if (buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png"
  if (buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "WEBP") return "image/webp"
  const header = buffer.subarray(0, 4).toString("hex")
  if (header === "49492a00" || header === "4d4d002a") return "image/tiff"
  if (buffer.subarray(4, 8).toString("ascii") === "ftyp") {
    const brand = buffer.subarray(8, 12).toString("ascii").toLowerCase()
    if (["heic", "heix", "hevc", "hevx"].includes(brand)) return "image/heic"
    if (["heif", "heim", "heis", "mif1", "msf1"].includes(brand)) return "image/heif"
  }
  return ""
}

function extensionMatchesMime(file, mimeType) {
  const extension = path.extname(file).toLowerCase()
  const expected = {
    ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp",
    ".tif": "image/tiff", ".tiff": "image/tiff", ".heic": "image/heic", ".heif": "image/heif", ".pdf": "application/pdf"
  }[extension]
  return expected === mimeType
}

async function renderPdfPages(buffer, maxPages, limits = DEFAULT_LIMITS, dependencies = {}) {
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs")
  const createCanvas = dependencies.createCanvas || (await import("@napi-rs/canvas")).createCanvas
  const document = await getDocument({ data: new Uint8Array(buffer), disableWorker: true, useSystemFonts: true }).promise
  const pageCount = Math.min(document.numPages, maxPages)
  const pages = []
  const renderedPages = []
  const pageErrors = []
  try {
    for (let pageNumber = 1; pageNumber <= pageCount; pageNumber++) {
      let page
      try {
        page = await document.getPage(pageNumber)
        const viewport = page.getViewport({ scale: 1.7 })
        if (viewport.width > limits.maxWidth || viewport.height > limits.maxHeight || viewport.width * viewport.height > limits.maxPixels) {
          throw Object.assign(new Error("pdf_page_dimension_limit"), { code: "PDF_PAGE_DIMENSION_LIMIT", pageNumber })
        }
        const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height))
        const context = canvas.getContext("2d")
        context.fillStyle = "#ffffff"
        context.fillRect(0, 0, canvas.width, canvas.height)
        await page.render({ canvasContext: context, viewport }).promise
        const renderedBuffer = Buffer.from(await canvas.encode("png"))
        pages.push(renderedBuffer)
        renderedPages.push({ pageNumber, buffer: renderedBuffer })
      } catch (pageError) {
        pageErrors.push({ pageNumber, code: pageError.code || pageError.message || "PDF_PAGE_ERROR" })
      } finally {
        if (page) page.cleanup()
      }
    }
    if (!pages.length && pageErrors.length) throw Object.assign(new Error(pageErrors[0].code), pageErrors[0])
    return {
      pages, renderedPages, totalPages: document.numPages, truncated: document.numPages > maxPages,
      pageErrors: pageErrors.length ? pageErrors : undefined
    }
  } finally {
    await document.destroy()
  }
}

function sha256(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex")
}

function erro(code, message = code) {
  return Object.assign(new Error(message), { code })
}

async function normalizarEntradaDocumental(input = {}, deps = {}) {
  const { fileId, buffer } = input
  if (!fileId || !Buffer.isBuffer(buffer)) throw erro("DOCUMENT_INPUT_INVALID")
  const limits = { ...DEFAULT_LIMITS, ...(deps.limits || {}) }
  if (buffer.length > limits.maxFileBytes) throw erro("DOCUMENT_FILE_SIZE_LIMIT")
  const detectedMime = (deps.detectMime || detectMime)(buffer)
  if (!ALLOWED_MIME_TYPES.has(detectedMime)) throw erro("DOCUMENT_MIME_UNSUPPORTED")
  if (input.mimeType && input.mimeType !== "application/octet-stream" && input.mimeType !== detectedMime) {
    throw erro("DOCUMENT_MIME_MISMATCH")
  }
  const physicalSha256 = sha256(buffer)
  if (detectedMime !== "application/pdf") {
    return {
      fileId,
      sha256: physicalSha256,
      mimeType: detectedMime,
      units: [{ evidenceId: fileId, fileId, pageNumber: null, mimeType: detectedMime, buffer }],
      reviewRequired: false,
      warnings: [],
      errors: []
    }
  }

  let rendered
  try {
    rendered = await (deps.renderPdfPages || renderPdfPages)(buffer, limits.maxPdfPages, limits, deps)
  } catch (error) {
    return {
      fileId, sha256: physicalSha256, mimeType: detectedMime, units: [], reviewRequired: true,
      warnings: [], errors: [{ code: error.code || "PDF_RENDER_ERROR", pageNumber: error.pageNumber || null }]
    }
  }
  const renderedPages = Array.isArray(rendered.renderedPages)
    ? rendered.renderedPages
    : (rendered.pages || []).map((pageBuffer, index) => ({ pageNumber: index + 1, buffer: pageBuffer }))
  const errors = Array.isArray(rendered.pageErrors) ? rendered.pageErrors : []
  const warnings = rendered.truncated ? [{ code: "PDF_PAGE_LIMIT", totalPages: rendered.totalPages }] : []
  return {
    fileId,
    sha256: physicalSha256,
    mimeType: detectedMime,
    totalPages: rendered.totalPages,
    units: renderedPages.map(page => ({
      evidenceId: `${fileId}#page=${page.pageNumber}`,
      fileId,
      pageNumber: page.pageNumber,
      mimeType: "image/png",
      buffer: page.buffer
    })),
    reviewRequired: Boolean(rendered.truncated || errors.length),
    warnings,
    errors
  }
}

module.exports = {
  ALLOWED_MIME_TYPES, DEFAULT_LIMITS, detectMime, extensionMatchesMime, renderPdfPages,
  normalizarEntradaDocumental, sha256
}
