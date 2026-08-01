"use strict"

const test = require("node:test")
const assert = require("node:assert/strict")
const { createAdminAssistedMediaStaging, processExistingCaseAdminMedia } = require("../src/domain/admin-assisted-media")

const baseDeps = {
  downloadMedia: async () => ({ buffer: Buffer.from("synthetic-pdf"), mimeType: "application/pdf" }),
  analyzeDocument: async () => ({ classificacao: { tipoDocumento: "Documento sintético", categoria: "identificacao", confianca: 0.9 }, extracao: {} }),
  resolveIntegrity: async () => ({ approved: true, partyRole: "titular" })
}

test("mídia admin rejeita extensão incompatível e sanitiza nome", async () => {
  const staging = createAdminAssistedMediaStaging()
  const rejeitado = await staging.stage({ type: "document", document: { id: "m1", mime_type: "application/pdf", filename: "arquivo.exe" } }, baseDeps)
  assert.equal(rejeitado.ok, false)
  assert.equal(rejeitado.reason, "media_type_not_allowed")

  const aceito = await staging.stage({ type: "document", document: { id: "m2", mime_type: "application/pdf", filename: "../Documento estranho?.pdf" } }, baseDeps)
  assert.equal(aceito.ok, true)
  assert.equal(aceito.document.name.includes(".."), false)
  assert.match(aceito.document.name, /\.pdf$/)
  assert.equal(aceito.document.originalName, "../Documento estranho?.pdf")
})

test("upload só confirma após id válido do Drive", async () => {
  const staging = createAdminAssistedMediaStaging()
  const staged = await staging.stage({ type: "document", document: { id: "m3", mime_type: "application/pdf", filename: "documento.pdf" } }, baseDeps)
  await assert.rejects(() => staging.promote(staged.document.sha256, { folderId: "folder-test", caseNumber: "PRV.TEST.001" }, {
    uploadVerified: async () => ({})
  }), /ADMIN_MEDIA_UPLOAD_VERIFY_FAILED/)
})

test("upload posterior exige caso selecionado e usa o caseFolderId correto", async () => {
  const staging = createAdminAssistedMediaStaging()
  await assert.rejects(() => processExistingCaseAdminMedia({ staging, message: {}, caseRecord: null, deps: {} }), /ADMIN_MEDIA_CASE_REQUIRED/)
  const folders = []
  const result = await processExistingCaseAdminMedia({
    staging,
    message: { type: "document", document: { id: "later-1", mime_type: "application/pdf", filename: "posterior.pdf" } },
    caseRecord: { numeroCaso: "CASE.LATER.001", caseFolderId: "folder-correct", cpf: "52998224725" },
    deps: {
      ...baseDeps,
      uploadVerified: async input => { folders.push(input.folderId); return { id: "file-later", sha256: input.sha256 } }
    }
  })
  assert.equal(result.ok, true)
  assert.equal(result.fileId, "file-later")
  assert.deepEqual(folders, ["folder-correct"])
})

test("falha do Drive no upload posterior não produz mensagem de sucesso e permite retomada sem duplicar", async () => {
  const staging = createAdminAssistedMediaStaging()
  const input = {
    staging,
    message: { type: "document", document: { id: "later-2", mime_type: "application/pdf", filename: "falha.pdf" } },
    caseRecord: { numeroCaso: "CASE.LATER.002", caseFolderId: "folder-2", cpf: "52998224725" },
    deps: { ...baseDeps, uploadVerified: async () => ({}) }
  }
  await assert.rejects(() => processExistingCaseAdminMedia(input), /ADMIN_MEDIA_UPLOAD_VERIFY_FAILED/)
  assert.equal(staging.list().length, 1)
  const duplicate = await staging.stage(input.message, baseDeps)
  assert.equal(duplicate.duplicate, true)
})
