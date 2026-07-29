"use strict"
const assert = require("node:assert/strict")
const { createLegacyDocumentPipeline } = require("../src/domain/post-human-document-pipeline")
;(async () => {
  const user = { contatoId: "C1", negocioId: "N1", numeroCaso: "CASE-1" }
  let mediaCalls = 0
  const pipeline = createLegacyDocumentPipeline({
    processMedia: async ({ context }) => {
      mediaCalls++; context.usuario._postHumanDocumentHandoff.persisted = true
      return { texto: "confirmado" }
    },
    persistDocument: async ({ handoff }) => handoff.persisted === true
  })
  const success = await pipeline({ cycleId: "CY1", contatoId: "C1", negocioId: "N1",
    numeroCaso: "CASE-1", usuario: user, rawMessage: { type: "document" } })
  assert.equal(success.persisted, true)
  assert.equal(success.metadata.pipeline, "legacy_document_pipeline_v1")
  assert.equal(user._postHumanDocumentHandoff, undefined)
  const failed = await createLegacyDocumentPipeline({
    processMedia: async () => null, persistDocument: async () => false
  })({ cycleId: "CY2", contatoId: "C1", negocioId: "N1", numeroCaso: "CASE-1",
    usuario: user, rawMessage: { type: "image" } })
  assert.equal(failed.persisted, false)
  assert.equal(user._postHumanDocumentHandoff, undefined)
  const cross = await pipeline({ cycleId: "CY3", contatoId: "C1", negocioId: "OTHER",
    numeroCaso: "CASE-1", usuario: user, rawMessage: { type: "document" } })
  assert.equal(cross.handled, false)
  assert.equal(mediaCalls, 1)
  await assert.rejects(
    createLegacyDocumentPipeline({
      processMedia: async () => { throw new Error("media failure") },
      persistDocument: async () => true
    })({ cycleId: "CY4", contatoId: "C1", negocioId: "N1", numeroCaso: "CASE-1",
      usuario: user, rawMessage: { type: "document" } }),
    /media failure/
  )
  assert.equal(user._postHumanDocumentHandoff, undefined)
  await assert.rejects(
    createLegacyDocumentPipeline({
      processMedia: async () => ({ texto: "processado" }),
      persistDocument: async () => { throw new Error("persistence failure") }
    })({ cycleId: "CY5", contatoId: "C1", negocioId: "N1", numeroCaso: "CASE-1",
      usuario: user, rawMessage: { type: "image" } }),
    /persistence failure/
  )
  assert.equal(user._postHumanDocumentHandoff, undefined)
  console.log("RESULT 5/5 productive document adapter passed")
})().catch(error => { console.error(error); process.exitCode = 1 })
