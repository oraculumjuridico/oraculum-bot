const assert = require("node:assert/strict")
const { createAdminAssistedMediaStaging } = require("../src/domain/admin-assisted-media")

;(async () => {
  const staging = createAdminAssistedMediaStaging()
  const message = { type: "image", image: { id: "media-test", mime_type: "image/jpeg", filename: "documento.jpg" } }
  const deps = {
    downloadMedia: async () => ({ buffer: Buffer.from("synthetic-image"), mimeType: "image/jpeg" }),
    analyzeDocument: async () => ({ classificacao: { tipoDocumento: "RG Frente", categoria: "documentos_pessoais", confianca: 0.98 }, extracao: {} }),
    resolveIntegrity: async () => ({ approved: false, reason: "cpf_requires_confirmation" })
  }
  const first = await staging.stage(message, deps)
  const second = await staging.stage(message, deps)
  assert.equal(first.document.status, "quarantined")
  assert.equal(second.duplicate, true)
  const reviewed = staging.review(first.document.sha256, { approved: true, partyRole: "titular" })
  assert.equal(reviewed.status, "approved")
  const promoted = await staging.promote(first.document.sha256, { folderId: "folder-test", caseNumber: "CASE.TEST.1" }, {
    uploadVerified: async input => ({ id: "file-test", sha256: input.sha256 })
  })
  assert.equal(promoted.status, "promoted")
  assert.equal(staging.list().length, 0)
  console.log("admin-assisted-media.test.js: ok")
})().catch(error => { console.error(error); process.exitCode = 1 })
