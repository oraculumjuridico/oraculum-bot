"use strict"

const assert = require("node:assert/strict")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")
const { PostHumanCycleRepository } = require("../src/domain/post-human-cycle-model")
const { tratarRespostaClientePosAtendimento } = require("../src/domain/post-human-response-handler")
const {
  montarBotaoAtendimentoRealizado, handleAtendimentoRealizadoConfirmation,
  _clearActionContextsForTests, _actionContextCountForTests, _pruneActionContextsForTests
} = require("../src/domain/admin-post-human-complementation")

let passed = 0
async function test(name, fn) {
  try { await fn(); passed++; console.log(`PASS ${name}`) }
  catch (error) { console.error(`FAIL ${name}\n${error.stack}`); process.exitCode = 1 }
}
async function makeRepo() {
  const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "post-human-isolation-"))
  return new PostHumanCycleRepository({ file: path.join(dir, "cycles.json"), mode: "local" })
}
async function awaiting(repository, input) {
  const cycle = await repository.createCycle(input)
  for (const status of ["analyzing", "ready_to_send", "sending", "message_sent", "awaiting_response"]) {
    await repository.updateStatus(cycle.cycleId, status)
  }
  return repository.getCycle(cycle.cycleId)
}

;(async () => {
  const previous = {
    POST_HUMAN_COMPLEMENTATION_ENABLED: process.env.POST_HUMAN_COMPLEMENTATION_ENABLED,
    POST_HUMAN_PILOT_CASES: process.env.POST_HUMAN_PILOT_CASES,
    POST_HUMAN_ACTION_MAX_CONTEXTS: process.env.POST_HUMAN_ACTION_MAX_CONTEXTS,
    POST_HUMAN_ACTION_TTL_MS: process.env.POST_HUMAN_ACTION_TTL_MS
  }
  process.env.POST_HUMAN_COMPLEMENTATION_ENABLED = "true"
  process.env.POST_HUMAN_PILOT_CASES = "A-1,A-2,B-1"

  await test("dois contatos ficam isolados e negocio isolado nao autoriza", async () => {
    const repository = await makeRepo()
    await awaiting(repository, { negocioId: "DA", numeroCaso: "A-1", contatoId: "A" })
    await awaiting(repository, { negocioId: "DB", numeroCaso: "B-1", contatoId: "B" })
    let writes = 0
    const result = await tratarRespostaClientePosAtendimento({
      from: "55110000", msgType: "text", content: "segredo",
      usuario: { negocioId: "DB", contatoId: "A" }, repository,
      deps: { saveInformation: async () => { writes++ } }
    })
    assert.equal(result, null)
    assert.equal(writes, 0)
    assert.deepEqual(await repository.getActiveCycles({}), [])
  })

  await test("contato ausente e telefone nao validado falham fechado sem escritas", async () => {
    const repository = await makeRepo()
    await awaiting(repository, { negocioId: "DA", numeroCaso: "A-1", contatoId: "A" })
    let writes = 0
    const variants = [
      {},
      { resolveValidatedContactByPhone: async () => ({ validated: false, contatoId: "A", telefoneNormalizado: "5511" }) }
    ]
    for (const extra of variants) {
      const result = await tratarRespostaClientePosAtendimento({
        from: "5511", msgType: "document", content: { type: "document" },
        usuario: { negocioId: "DA" }, repository,
        deps: { ...extra, saveDocument: async () => { writes++; return { persisted: true } } }
      })
      assert.equal(result, null)
    }
    assert.equal(writes, 0)
  })

  await test("telefone validado resolve somente o proprio contato", async () => {
    const repository = await makeRepo()
    const own = await awaiting(repository, { negocioId: "DA", numeroCaso: "A-1", contatoId: "A" })
    await awaiting(repository, { negocioId: "DB", numeroCaso: "B-1", contatoId: "B" })
    const result = await tratarRespostaClientePosAtendimento({
      from: "5511", msgType: "text", content: "ok", usuario: {}, repository,
      deps: {
        normalizePhone: value => value,
        resolveValidatedContactByPhone: async () => ({ validated: true, contatoId: "A", telefoneNormalizado: "5511" }),
        saveInformation: async () => ({ persisted: true })
      }
    })
    assert.equal(result.cycle.cycleId, own.cycleId)
  })

  await test("ambiguidade do mesmo contato pede selecao sem revelar terceiro", async () => {
    const repository = await makeRepo()
    await awaiting(repository, { negocioId: "DA1", numeroCaso: "A-1", contatoId: "A" })
    await awaiting(repository, { negocioId: "DA2", numeroCaso: "A-2", contatoId: "A" })
    await awaiting(repository, { negocioId: "DB", numeroCaso: "B-1", contatoId: "B" })
    const result = await tratarRespostaClientePosAtendimento({
      from: "5511", msgType: "text", content: "x", usuario: { contatoId: "A" }, repository
    })
    assert.equal(result.askCase, true)
    assert.deepEqual(result.cases.map(item => item.numeroCaso).sort(), ["A-1", "A-2"])
    assert.doesNotMatch(JSON.stringify(result), /B-1/)
  })

  await test("documento persiste metadados minimos sem encerrar ciclo", async () => {
    const repository = await makeRepo()
    const cycle = await awaiting(repository, { negocioId: "DA", numeroCaso: "A-1", contatoId: "A" })
    const result = await tratarRespostaClientePosAtendimento({
      from: "5511", msgType: "document", content: { type: "document" },
      usuario: { contatoId: "A", negocioId: "DA" }, repository,
      deps: { saveDocument: async input => ({ persisted: input.cycleId === cycle.cycleId, metadata: { mediaType: "document" } }) }
    })
    assert.equal(result.cycle.status, "awaiting_response")
    assert.equal(result.cycle.payload.documentoMetadados.mediaType, "document")
  })

  await test("falha documental transfere ao legado sem falso sucesso", async () => {
    const repository = await makeRepo()
    await awaiting(repository, { negocioId: "DA", numeroCaso: "A-1", contatoId: "A" })
    const result = await tratarRespostaClientePosAtendimento({
      from: "5511", msgType: "document", content: { type: "document" },
      usuario: { contatoId: "A", negocioId: "DA" }, repository,
      deps: { saveDocument: async input => ({ persisted: false, handled: false, handoff: { cycleId: input.cycleId } }) }
    })
    assert.equal(result.handled, false)
    assert.equal(result.pendingUpload, true)
    assert.ok(result.legacyHandoff.cycleId)
  })

  await test("humanReviewRequired direto e aninhado mudam estado", async () => {
    for (const saveResult of [
      { humanReviewRequired: true, reviewReason: "document_source_unavailable" },
      { hubspot: { humanReviewRequired: true, reviewReason: "deal_divergence" } }
    ]) {
      const repository = await makeRepo()
      const cycle = await awaiting(repository, { negocioId: `D-${passed}`, numeroCaso: "A-1", contatoId: "A" })
      const result = await tratarRespostaClientePosAtendimento({
        from: "5511", msgType: "text", content: "x",
        usuario: { contatoId: "A", negocioId: cycle.negocioId }, repository,
        deps: {
          saveInformation: async () => saveResult,
          applySafeHubspotUpdates: async () => ({ humanReviewRequired: true })
        }
      })
      assert.equal(result.cycle.status, "human_review_required")
    }
  })

  await test("token exige admin contato e vinculos completos", async () => {
    _clearActionContextsForTests()
    assert.equal(montarBotaoAtendimentoRealizado("D", "A-1", { adminId: "admin" }), null)
    const button = montarBotaoAtendimentoRealizado("D", "A-1", { adminId: " admin ", contatoId: "A" })
    let created = 0
    const base = {
      interactionId: button.id,
      usuario: { negocioId: "D", numeroCaso: "A-1", contatoId: "A" },
      isAdmin: () => true,
      repository: { createCycle: async () => (++created, { cycleId: "C" }) }
    }
    await handleAtendimentoRealizadoConfirmation({ ...base, from: "OTHER" })
    assert.equal(created, 0)
    assert.equal((await handleAtendimentoRealizadoConfirmation({ ...base, from: "ADMIN" })).existing, false)
    await handleAtendimentoRealizadoConfirmation({ ...base, from: "ADMIN" })
    assert.equal(created, 1)
  })

  await test("limite nega novos tokens e expirados sao removidos", async () => {
    _clearActionContextsForTests()
    process.env.POST_HUMAN_ACTION_MAX_CONTEXTS = "2"
    process.env.POST_HUMAN_ACTION_TTL_MS = "1000"
    assert.ok(montarBotaoAtendimentoRealizado("D1", "A-1", { adminId: "A", contatoId: "A" }))
    assert.ok(montarBotaoAtendimentoRealizado("D2", "A-2", { adminId: "A", contatoId: "A" }))
    assert.equal(montarBotaoAtendimentoRealizado("D3", "B-1", { adminId: "A", contatoId: "A" }), null)
    assert.equal(_actionContextCountForTests(), 2)
    _pruneActionContextsForTests(Date.now() + 1001)
    assert.equal(_actionContextCountForTests(), 0)
  })

  await test("versao otimista detecta conflito e preserva payload", async () => {
    const repository = await makeRepo()
    const cycle = await repository.createCycle({ negocioId: "DC", numeroCaso: "A-1", contatoId: "A" })
    const updated = await repository.updateStatus(cycle.cycleId, "analyzing", { primeiro: true }, { expectedVersion: 0 })
    await assert.rejects(
      repository.updateStatus(cycle.cycleId, "analyzing", { segundo: true }, { expectedVersion: 0 }),
      /concurrency_conflict/
    )
    assert.equal((await repository.getCycle(cycle.cycleId)).primeiro, true)
    assert.equal(updated.version, 1)
  })

  for (const [key, value] of Object.entries(previous)) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
  console.log(`RESULT ${passed}/10 passed`)
})()
