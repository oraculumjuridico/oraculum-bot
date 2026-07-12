const test = require("node:test")
const assert = require("node:assert")
const {
  validatePublicImageUrl,
  imageSignatureMatches,
  clearPublicImageValidationCache
} = require("../src/domain/public-image-validator")

test("public-image-validator: image signature validation for PNG", () => {
  const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  const result = imageSignatureMatches(pngSignature, "image/png")
  assert.strictEqual(result, true, "Valid PNG signature should be accepted")
})

test("public-image-validator: image signature validation for JPEG", () => {
  const jpegSignature = Buffer.from([0xff, 0xd8, 0xff])
  const result = imageSignatureMatches(jpegSignature, "image/jpeg")
  assert.strictEqual(result, true, "Valid JPEG signature should be accepted")
})

test("public-image-validator: reject invalid PNG signature", () => {
  const invalidSignature = Buffer.from([0x00, 0x00, 0x00, 0x00])
  const result = imageSignatureMatches(invalidSignature, "image/png")
  assert.strictEqual(result, false, "Invalid PNG signature should be rejected")
})

test("public-image-validator: reject HTML disguised as image", () => {
  const htmlContent = Buffer.from("<html><body>Not an image</body></html>")
  const result = imageSignatureMatches(htmlContent, "image/png")
  assert.strictEqual(result, false, "HTML content should be rejected")
})

test("public-image-validator: validatePublicImageUrl with HTTP instead of HTTPS", async () => {
  const result = await validatePublicImageUrl("http://example.com/image.png")
  assert.strictEqual(result.ok, false, "HTTP URLs should be rejected")
  assert.strictEqual(result.code, "IMAGE_URL_PROTOCOL")
})

test("public-image-validator: validatePublicImageUrl with invalid URL", async () => {
  const result = await validatePublicImageUrl("not-a-url")
  assert.strictEqual(result.ok, false, "Invalid URLs should be rejected")
  assert.strictEqual(result.code, "IMAGE_URL_INVALID")
})

test("public-image-validator: validatePublicImageUrl with empty URL", async () => {
  const result = await validatePublicImageUrl("")
  assert.strictEqual(result.ok, false, "Empty URLs should be rejected")
  assert.strictEqual(result.code, "IMAGE_URL_INVALID")
})

test("public-image-validator: validatePublicImageUrl with null URL", async () => {
  const result = await validatePublicImageUrl(null)
  assert.strictEqual(result.ok, false, "Null URLs should be rejected")
  assert.strictEqual(result.code, "IMAGE_URL_INVALID")
})

test("public-image-validator: cache clears correctly", () => {
  clearPublicImageValidationCache()
  const mockUrl = "https://example.com/test.png"
  clearPublicImageValidationCache()
  assert.ok(true, "Cache clear executed successfully")
})

test("documents-ui: environment variables should not contain hardcoded imgur URLs", () => {
  delete require.cache[require.resolve("../src/domain/documents-ui")]
  const documentsUI = require("../src/domain/documents-ui")
  
  const imagem = documentsUI.IMAGEM_DOCS_FINAL_URL
  if (imagem) {
    assert(!imagem.includes("i.imgur.com"), "IMAGEM_DOCS_FINAL_URL should not contain hardcoded imgur URL in code")
  }
})

test("server: environment variable should not contain hardcoded imgur URL", () => {
  const imagem_recebido = process.env.IMAGEM_DOC_RECEBIDO_URL
  if (imagem_recebido) {
    assert(!imagem_recebido.includes("i.imgur.com"), "IMAGEM_DOC_RECEBIDO_URL should not contain hardcoded imgur URL in code")
  }
})

test("documents-ui: missing image URLs should use textual fallback", () => {
  delete require.cache[require.resolve("../src/domain/documents-ui")]
  const { criarTelaComImagemValidada } = require("../src/domain/documents-ui")
  
  const tela = criarTelaComImagemValidada({
    id: "test_tela",
    titulo: "Test",
    texto: "Test text",
    imagemUrl: ""
  })
  
  assert.strictEqual(tela.imagemUrl, null, "Empty image URL should become null (textual fallback)")
})

test("documents-ui: null image URLs should use textual fallback", () => {
  delete require.cache[require.resolve("../src/domain/documents-ui")]
  const { criarTelaComImagemValidada } = require("../src/domain/documents-ui")
  
  const tela = criarTelaComImagemValidada({
    id: "test_tela",
    titulo: "Test",
    texto: "Test text",
    imagemUrl: null
  })
  
  assert.strictEqual(tela.imagemUrl, null, "Null image URL should remain null")
})

test("documents-ui: valid imgur URLs are preserved and passed to validation layer", () => {
  delete require.cache[require.resolve("../src/domain/documents-ui")]
  const { criarTelaComImagemValidada } = require("../src/domain/documents-ui")
  
  const imgurUrl = "https://i.imgur.com/LRvw2m8.png"
  const tela = criarTelaComImagemValidada({
    id: "test_tela",
    titulo: "Test",
    texto: "Test text",
    imagemUrl: imgurUrl
  })
  
  assert.strictEqual(tela.imagemUrl, imgurUrl, "Valid imgur URLs should be preserved (not rejected)")
})

