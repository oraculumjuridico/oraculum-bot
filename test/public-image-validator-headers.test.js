const test = require("node:test")
const assert = require("node:assert")
const {
  validatePublicImageUrl,
  clearPublicImageValidationCache
} = require("../src/domain/public-image-validator")

test("public-image-validator: sends User-Agent and Accept headers", async () => {
  clearPublicImageValidationCache()
  const receivedHeaders = {}
  const httpClient = {
    get: async (_url, options) => {
      receivedHeaders.headers = options.headers || {}
      return {
        status: 200,
        headers: { "content-type": "image/png" },
        data: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
      }
    }
  }

  const result = await validatePublicImageUrl("https://example.com/valid.png", { httpClient })
  assert.strictEqual(result.ok, true, "Should accept valid PNG when headers are present")
  assert.ok(receivedHeaders.headers["User-Agent"], "User-Agent header should be sent")
  assert.strictEqual(receivedHeaders.headers["User-Agent"], "Mozilla/5.0 (compatible; OraculumBot/1.0)")
  assert.ok(receivedHeaders.headers["Accept"], "Accept header should be sent")
  assert.strictEqual(receivedHeaders.headers["Accept"], "image/*")
})

test("public-image-validator: 200 with image/png still accepted", async () => {
  clearPublicImageValidationCache()
  const httpClient = {
    get: async () => ({
      status: 200,
      headers: { "content-type": "image/png" },
      data: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    })
  }

  const result = await validatePublicImageUrl("https://example.com/ok.png", { httpClient })
  assert.strictEqual(result.ok, true)
  assert.strictEqual(result.mimeType, "image/png")
  assert.ok(result.bytes > 0)
})

test("public-image-validator: 429 remains rejected correctly", async () => {
  clearPublicImageValidationCache()
  const httpClient = {
    get: async () => {
      const error = new Error("Too Many Requests")
      error.response = { status: 429, headers: {} }
      throw error
    }
  }

  const result = await validatePublicImageUrl("https://example.com/limited.png", { httpClient })
  assert.strictEqual(result.ok, false, "429 should be rejected")
  assert.strictEqual(result.code, "IMAGE_UNAVAILABLE")
})

test("public-image-validator: size limit, redirect, timeout and private URL blocking remain working", async () => {
  clearPublicImageValidationCache()

  const oversizedClient = {
    get: async () => ({
      status: 200,
      headers: { "content-type": "image/png" },
      data: Buffer.alloc(6 * 1024 * 1024 + 1)
    })
  }
  let sizeResult = await validatePublicImageUrl("https://example.com/oversized.png", { httpClient: oversizedClient })
  assert.strictEqual(sizeResult.code, "IMAGE_SIZE_LIMIT")

  const redirectClient = {
    get: async () => {
      const error = new Error("redirect")
      error.response = { status: 302, headers: { location: "/new.png" } }
      throw error
    }
  }
  let redirectResult = await validatePublicImageUrl("https://example.com/redirect.png", { httpClient: redirectClient })
  assert.strictEqual(redirectResult.code, "IMAGE_REDIRECT")

  const timeoutClient = {
    get: async () => {
      const error = new Error("timeout")
      error.code = "ETIMEDOUT"
      throw error
    }
  }
  let timeoutResult = await validatePublicImageUrl("https://example.com/timeout.png", { httpClient: timeoutClient, timeoutMs: 1 })
  assert.strictEqual(timeoutResult.code, "IMAGE_TIMEOUT")

  const privateResult = await validatePublicImageUrl("http://example.com/private.png")
  assert.strictEqual(privateResult.code, "IMAGE_URL_PROTOCOL")
})
