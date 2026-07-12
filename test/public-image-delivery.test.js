"use strict"

const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const express = require("express")
const {
  validatePublicImageUrl,
  imageSignatureMatches,
  clearPublicImageValidationCache,
  DEFAULT_MAX_BYTES
} = require("../src/domain/public-image-validator")

const fixture = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52
])
assert.ok(imageSignatureMatches(fixture, "image/png"))

const app = express()
app.get("/valid.png", (_req, res) => res.type("png").send(fixture))
app.get("/redirect.png", (_req, res) => res.redirect("/valid.png"))
app.get("/html.png", (_req, res) => res.type("html").send("<p>not an image</p>"))
app.get("/fake.png", (_req, res) => res.type("png").send("not a png"))

const server = app.listen(0, "127.0.0.1", async () => {
  try {
    const { port } = server.address()
    const base = `https://127.0.0.1:${port}`
    const httpClient = {
      get: async (url, options) => {
        const response = await fetch(url.replace("https://", "http://"), { redirect: "manual" })
        const data = Buffer.from(await response.arrayBuffer())
        const headers = Object.fromEntries(response.headers)
        if (!options.validateStatus(response.status)) {
          const error = new Error("fixture_http_error")
          error.response = { status: response.status, headers }
          throw error
        }
        return { status: response.status, headers, data }
      }
    }

    clearPublicImageValidationCache()
    const validUrl = `${base}/valid.png`
    const valid = await validatePublicImageUrl(validUrl, { httpClient })
    assert.equal(valid.ok, true)
    assert.equal(valid.mimeType, "image/png")
    assert.equal(valid.bytes, fixture.length)

    assert.equal((await validatePublicImageUrl(`${base}/redirect.png`, { httpClient })).code, "IMAGE_REDIRECT")
    assert.equal((await validatePublicImageUrl(`${base}/html.png`, { httpClient })).code, "IMAGE_MIME_INVALID")
    assert.equal((await validatePublicImageUrl(`${base}/fake.png`, { httpClient })).code, "IMAGE_SIGNATURE_INVALID")
    assert.equal((await validatePublicImageUrl(`${base}/missing.png`, { httpClient })).code, "IMAGE_UNAVAILABLE")

    const oversizedClient = {
      get: async () => ({
        status: 200,
        headers: { "content-type": "image/png" },
        data: Buffer.alloc(DEFAULT_MAX_BYTES + 1)
      })
    }
    assert.equal((await validatePublicImageUrl(`${base}/oversized.png`, { httpClient: oversizedClient })).code, "IMAGE_SIZE_LIMIT")

    const source = fs.readFileSync(path.join(__dirname, "..", "server.js"), "utf8")
    assert.doesNotMatch(source, /i\.imgur\.com\/(JhM9azm|ztcFIuG)\.png/)
    assert.doesNotMatch(source, /media\/bot-(welcome|confirmation)\.png/)
    assert.match(source, /const imagemUrl = IMAGEM_BOAS_VINDAS_URL/)
    assert.match(source, /const imagemUrl = IMAGEM_CONFIRMACAO_URL/)
    assert.match(source, /if \(!enviada\) await enviar\(from, textoBoasVindas/)
    console.log("public-image-delivery.test.js: ok")
  } finally {
    server.close()
  }
})
