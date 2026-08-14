"use strict"

const assert = require("node:assert/strict")
const sharp = require("sharp")
const {
  ordenarPontos,
  qualidadeRetangular,
  digitalizarImagemDocumento
} = require("../src/domain/document-scanner")

async function imagemDocumentoInclinado() {
  const svg = Buffer.from(`
    <svg width="800" height="600" xmlns="http://www.w3.org/2000/svg">
      <rect width="800" height="600" fill="#737373"/>
      <polygon points="115,95 700,135 650,520 150,485" fill="#ffffff" stroke="#111111" stroke-width="10"/>
      <text x="250" y="260" font-family="Arial" font-size="42" fill="#111111">DOCUMENTO</text>
      <text x="230" y="330" font-family="Arial" font-size="28" fill="#222222">ORACULUM TESTE</text>
      <line x1="210" y1="380" x2="585" y2="405" stroke="#333333" stroke-width="8"/>
    </svg>
  `)
  return sharp(svg).jpeg({ quality: 92 }).toBuffer()
}

async function main() {
  const ordered = ordenarPontos([
    { x: 690, y: 130 },
    { x: 145, y: 490 },
    { x: 110, y: 90 },
    { x: 655, y: 520 }
  ])
  assert.deepEqual(ordered.topLeft, { x: 110, y: 90 })
  assert.deepEqual(ordered.bottomRight, { x: 655, y: 520 })
  assert.ok(qualidadeRetangular(ordered) > 0.75)

  const original = await imagemDocumentoInclinado()
  const result = await digitalizarImagemDocumento({ buffer: original, mimeType: "image/jpeg" })
  assert.equal(result.applied, true)
  assert.equal(result.mimeType, "image/jpeg")
  assert.ok(result.confidence >= 0.68)
  assert.ok(result.processed.width > result.processed.height)
  assert.ok(result.processed.width < result.original.width)
  assert.ok(result.steps.includes("correct_perspective"))
  assert.equal(Buffer.compare(original, result.buffer) === 0, false)

  const plain = await sharp({
    create: { width: 500, height: 400, channels: 3, background: "#cccccc" }
  }).jpeg().toBuffer()
  const fallback = await digitalizarImagemDocumento({ buffer: plain, mimeType: "image/jpeg" })
  assert.equal(fallback.applied, false)
  assert.equal(fallback.reason, "document_edges_not_found")

  const disabled = await digitalizarImagemDocumento({ buffer: original }, { enabled: false })
  assert.equal(disabled.applied, false)
  assert.equal(disabled.reason, "scanner_disabled")

  console.log("document-scanner.test.js: ok")
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
})
