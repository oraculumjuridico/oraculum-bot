"use strict"

const assert = require("node:assert/strict")
const {
  getSupplementalDocumentType,
  buildSupplementalFilename,
  registerSupplementalDocument,
  supplementalDocumentCount
} = require("../src/domain/supplemental-documents")
const { detectarComandoDocumento } = require("../src/domain/documents-core")

const cras = getSupplementalDocumentType("cras")
assert.equal(cras.id, "doc_extra_cras")
assert.equal(cras.category, "cadastro_social")
assert.equal(getSupplementalDocumentType("invalido"), null)

assert.equal(
  buildSupplementalFilename(cras, "João da Silva", "foto.JPEG", 2),
  "Comprovante atualizacao Cadastro Unico CRAS 2 - Joao da Silva.jpeg"
)

const user = {}
registerSupplementalDocument(user, { type: cras, fileId: "file-1", fileName: "cras-1.jpg", receivedAt: "2026-08-18T10:00:00.000Z" })
registerSupplementalDocument(user, { type: cras, fileId: "file-1", fileName: "duplicado.jpg" })
registerSupplementalDocument(user, { type: "outro", fileId: "file-2", fileName: "outro.pdf" })
assert.equal(supplementalDocumentCount(user), 2)
assert.equal(supplementalDocumentCount(user, cras), 1)
assert.equal(user.documentosComplementares[0].label, cras.label)
assert.equal(detectarComandoDocumento("quero enviar outro documento"), "docs_outros")
assert.equal(detectarComandoDocumento("seguir para outro documento"), "docs_pular_doc")

console.log("supplemental-documents.test.js: ok")
