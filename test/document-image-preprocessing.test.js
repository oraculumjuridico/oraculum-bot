const assert = require("node:assert/strict")
const sharp = require("sharp")

const {
  isSupportedDocumentImage,
  preprocessarImagemDocumento
} = require("../src/domain/document-image-preprocessing")

async function criarImagemTeste() {
  return sharp({
    create: {
      width: 160,
      height: 120,
      channels: 3,
      background: "#ffffff"
    }
  })
    .composite([{
      input: Buffer.from(
        `<svg width="160" height="120">
          <rect x="18" y="22" width="124" height="76" fill="#eeeeee" stroke="#111111" stroke-width="2"/>
          <text x="32" y="64" font-size="18" fill="#222222">ORACULUM</text>
        </svg>`
      ),
      left: 0,
      top: 0
    }])
    .jpeg({ quality: 90 })
    .toBuffer()
}

async function main() {
  assert.equal(isSupportedDocumentImage("image/jpeg"), true)
  assert.equal(isSupportedDocumentImage("application/pdf"), false)

  const original = await criarImagemTeste()
  const antes = Buffer.from(original)
  const resultado = await preprocessarImagemDocumento({
    buffer: original,
    mimeType: "image/jpeg"
  })

  assert.equal(Buffer.compare(original, antes), 0, "o buffer original nao pode ser alterado")
  assert.equal(Buffer.isBuffer(resultado.buffer), true)
  assert.equal(resultado.mimeType, "image/png")
  assert.equal(resultado.extension, ".png")
  assert.equal(resultado.original.mimeType, "image/jpeg")
  assert.equal(resultado.original.format, "jpeg")
  assert.equal(resultado.processed.format, "png")
  assert.ok(resultado.processed.width > 0)
  assert.ok(resultado.processed.height > 0)
  assert.ok(resultado.steps.includes("copy_buffer"))
  assert.ok(resultado.steps.includes("auto_orientation"))
  assert.ok(resultado.steps.includes("trim_borders"))
  assert.ok(resultado.steps.includes("png_derivative"))

  await assert.rejects(
    () => preprocessarImagemDocumento({ buffer: Buffer.from("x"), mimeType: "application/pdf" }),
    /mimeType de imagem nao suportado/
  )
  await assert.rejects(
    () => preprocessarImagemDocumento({ buffer: Buffer.alloc(0), mimeType: "image/png" }),
    /buffer vazio/
  )
}

main()
  .then(() => console.log("document-image-preprocessing.test.js: ok"))
  .catch(error => {
    console.error(error)
    process.exitCode = 1
  })
