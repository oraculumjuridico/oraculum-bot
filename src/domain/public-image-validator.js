"use strict"

const axios = require("axios")

const IMAGE_MIME_TYPES = new Set(["image/png", "image/jpeg"])
const DEFAULT_MAX_BYTES = 5 * 1024 * 1024
const DEFAULT_TIMEOUT_MS = 5000
const CACHE_TTL_MS = 5 * 60 * 1000
const cache = new Map()

function imageSignatureMatches(buffer, mimeType) {
  if (!Buffer.isBuffer(buffer)) return false
  if (mimeType === "image/png") {
    return buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  }
  if (mimeType === "image/jpeg") {
    return buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff
  }
  return false
}

function extensionMatches(url, mimeType) {
  const pathname = new URL(url).pathname.toLowerCase()
  if (mimeType === "image/png") return pathname.endsWith(".png")
  if (mimeType === "image/jpeg") return pathname.endsWith(".jpg") || pathname.endsWith(".jpeg")
  return false
}

async function validatePublicImageUrl(url, options = {}) {
  const now = Date.now()
  const cached = cache.get(url)
  if (!options.skipCache && cached && cached.expiresAt > now) return cached.result

  const maxBytes = Math.max(1024, Number(options.maxBytes || DEFAULT_MAX_BYTES))
  const timeoutMs = Math.max(500, Number(options.timeoutMs || DEFAULT_TIMEOUT_MS))
  let parsed
  try {
    parsed = new URL(String(url || ""))
  } catch {
    return { ok: false, code: "IMAGE_URL_INVALID" }
  }
  if (parsed.protocol !== "https:") return { ok: false, code: "IMAGE_URL_PROTOCOL" }

  try {
    const response = await (options.httpClient || axios).get(parsed.toString(), {
      responseType: "arraybuffer",
      timeout: timeoutMs,
      maxRedirects: 0,
      maxContentLength: maxBytes,
      maxBodyLength: maxBytes,
      validateStatus: status => status === 200
    })
    const mimeType = String(response.headers?.["content-type"] || "").split(";", 1)[0].trim().toLowerCase()
    const buffer = Buffer.from(response.data || [])
    let result
    if (response.status !== 200) result = { ok: false, code: "IMAGE_HTTP_STATUS" }
    else if (response.headers?.location) result = { ok: false, code: "IMAGE_REDIRECT" }
    else if (!IMAGE_MIME_TYPES.has(mimeType)) result = { ok: false, code: "IMAGE_MIME_INVALID" }
    else if (!extensionMatches(parsed.toString(), mimeType)) result = { ok: false, code: "IMAGE_EXTENSION_MISMATCH" }
    else if (!buffer.length || buffer.length > maxBytes) result = { ok: false, code: "IMAGE_SIZE_LIMIT" }
    else if (!imageSignatureMatches(buffer, mimeType)) result = { ok: false, code: "IMAGE_SIGNATURE_INVALID" }
    else result = { ok: true, mimeType, bytes: buffer.length }

    cache.set(url, { result, expiresAt: now + CACHE_TTL_MS })
    return result
  } catch (error) {
    const status = Number(error.response?.status || 0)
    const code = status >= 300 && status < 400
      ? "IMAGE_REDIRECT"
      : error.code === "ECONNABORTED" || error.code === "ETIMEDOUT"
        ? "IMAGE_TIMEOUT"
        : "IMAGE_UNAVAILABLE"
    const result = { ok: false, code }
    cache.set(url, { result, expiresAt: now + CACHE_TTL_MS })
    return result
  }
}

function clearPublicImageValidationCache() {
  cache.clear()
}

module.exports = {
  validatePublicImageUrl,
  imageSignatureMatches,
  clearPublicImageValidationCache,
  DEFAULT_MAX_BYTES
}
