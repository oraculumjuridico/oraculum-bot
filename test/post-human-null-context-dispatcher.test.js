"use strict"

const assert = require("node:assert/strict")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")
const { PostHumanCycleRepository } = require("../src/domain/post-human-cycle-model")
const { createPostHumanDispatcher } = require("../src/domain/post-human-dispatcher")
const { createLegacyDocumentPipeline } = require("../src/domain/post-human-document-pipeline")

let passed = 0
async function test(name, fn) {
  try {
    await fn()
    passed++
    console.log(`PASS ${name}`)
  } catch (error) {
    console.error(`FAIL ${name}\n${error.stack}`)
    process.exitCode = 1
  }
}

async function makeRepo() {
  const directory = await fs.promises.mkdtemp(path.join(os.tmpdir(), "post-human-null-context-"))
  return new PostHumanCycleRepository({ file: path.join(directory, "cycles.json"), mode: "local" })
}

async function awaiting(repository, input) {
  let cycle = await repository.createCycle(input)
  for (const status of ["analyzing", "ready_to_send", "sending", "message_sent", "awaiting_response"]) {
    cycle = await repository.updateStatus(cycle.cycleId, status)
  }
  return cycle
}

function documentPipeline(calls) {
  return createLegacyDocumentPipeline({
    processMedia: async ({ context }) => {
      calls.upload++
      context.usuario._postHumanDocumentHandoff.persisted = true
      return { texto: "arquivo salvo" }
    },
    persistDocument: async ({ handoff }) => {
      calls.handoff++
      return handoff.persisted === true
    }
  })
}

;(async () => {
  const previous = {
    POST_HUMAN_COMPLEMENTATION_ENABLED: process.env.POST_HUMAN_COMPLEMENTATION_ENABLED,
    POST_HUMAN_PILOT_CASES: process.env.POST_HUMAN_PILOT_CASES
  }
  process.env.POST_HUMAN_COMPLEMENTATION_ENABLED = "true"
  process.env.POST_HUMAN_PILOT_CASES = "NULL-001,NULL-002"

  await test("contexto null preserva busca por usuario e handoff documental", async () => {
    const repository = await makeRepo()
    const cycle = await awaiting(repository, {
      negocioId: "DEAL-NULL", numeroCaso: "NULL-001", contatoId: "CONTACT-NULL"
    })
    const calls = { upload: 0, handoff: 0, log: 0 }
    const dispatcher = createPostHumanDispatcher({
      isEnabled: () => true,
      repository,
      normalizePhone: String,
      legacyDocumentPipeline: documentPipeline(calls),
      safeLogger: () => { calls.log++ }
    })

    const result = await dispatcher({
      from: "5511999990001",
      msgType: "document",
      content: { type: "document" },
      rawMessage: { type: "document", document: { id: "media-null-context" } },
      usuario: {
        contatoId: "CONTACT-NULL", negocioId: "DEAL-NULL", numeroCaso: "NULL-001"
      },
      contexto: null
    })

    assert.equal(result.handled, true)
    assert.equal(result.cycleId, cycle.cycleId)
    assert.equal(calls.log, 0)
    assert.equal(calls.upload, 1)
    assert.equal(calls.handoff, 1)
    const saved = await repository.getCycle(cycle.cycleId)
    assert.ok(saved.payload.documentoRecebidoEm)
    assert.equal(saved.payload.documentoMetadados.pipeline, "legacy_document_pipeline_v1")
    assert.equal((await repository.getActiveCycles({ contatoId: "CONTACT-NULL" })).length, 1)
  })

  await test("contexto null sem ciclo libera fluxo normal sem efeitos", async () => {
    const repository = await makeRepo()
    const calls = { upload: 0, handoff: 0, log: 0 }
    const dispatcher = createPostHumanDispatcher({
      isEnabled: () => true,
      repository,
      normalizePhone: String,
      legacyDocumentPipeline: documentPipeline(calls),
      safeLogger: () => { calls.log++ }
    })

    const result = await dispatcher({
      from: "5511999990002",
      msgType: "document",
      content: { type: "document" },
      rawMessage: { type: "document", document: { id: "media-without-cycle" } },
      usuario: {
        contatoId: "CONTACT-WITHOUT-CYCLE", negocioId: "DEAL-WITHOUT-CYCLE", numeroCaso: "NULL-001"
      },
      contexto: null
    })

    assert.equal(result.handled, false)
    assert.equal(result.legacyFlowAllowed, true)
    assert.equal(result.cycleId, null)
    assert.deepEqual(calls, { upload: 0, handoff: 0, log: 0 })
  })

  await test("contexto valido continua selecionando o ciclo correspondente", async () => {
    const repository = await makeRepo()
    const expected = await awaiting(repository, {
      negocioId: "DEAL-EXPECTED", numeroCaso: "NULL-001", contatoId: "CONTACT-SHARED"
    })
    await awaiting(repository, {
      negocioId: "DEAL-OTHER", numeroCaso: "NULL-002", contatoId: "CONTACT-SHARED"
    })
    const calls = { upload: 0, handoff: 0, log: 0 }
    const dispatcher = createPostHumanDispatcher({
      isEnabled: () => true,
      repository,
      normalizePhone: String,
      legacyDocumentPipeline: documentPipeline(calls),
      safeLogger: () => { calls.log++ }
    })

    const result = await dispatcher({
      from: "5511999990003",
      msgType: "document",
      content: { type: "document" },
      rawMessage: { type: "document", document: { id: "media-valid-context" } },
      usuario: {
        contatoId: "CONTACT-SHARED", negocioId: "DEAL-EXPECTED", numeroCaso: "NULL-001"
      },
      contexto: { negocioId: "DEAL-EXPECTED", numeroCaso: "NULL-001" }
    })

    assert.equal(result.handled, true)
    assert.equal(result.cycleId, expected.cycleId)
    assert.deepEqual(calls, { upload: 1, handoff: 1, log: 0 })
    assert.ok((await repository.getCycle(expected.cycleId)).payload.documentoRecebidoEm)
    assert.equal((await repository.findActiveByBusiness("DEAL-OTHER")).payload.documentoRecebidoEm, undefined)
  })

  for (const [key, value] of Object.entries(previous)) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
  console.log(`RESULT ${passed}/3 null-context dispatcher tests passed`)
})().catch(error => {
  console.error(error)
  process.exitCode = 1
})
