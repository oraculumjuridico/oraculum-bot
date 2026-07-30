const assert = require("node:assert/strict")
const { comporPdfsDocumentais } = require("../src/domain/document-pdf-composer")

;(async () => {
  const result = await comporPdfsDocumentais({
    documentosPessoais: [{
      fileId: "pdf-original",
      nome: "identidade.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("%PDF-1.4 synthetic"),
      tipoDocumento: "Documento pessoal"
    }]
  })
  assert.equal(result.pdfsGerados.length, 0)
  assert.equal(result.originaisPreservados.length, 1)
  assert.equal(result.originaisPreservados[0].fileId, "pdf-original")
  assert.equal(result.originaisPreservados[0].status, "preserved_outside_consolidated_pdf")
  console.log("document-pdf-original-preservation.test.js: ok")
})().catch(error => { console.error(error); process.exitCode = 1 })
