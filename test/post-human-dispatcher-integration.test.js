"use strict"

const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const { Pool } = require("pg")
const { PostHumanCycleRepository } = require("../src/domain/post-human-cycle-model")
const { createPostHumanDispatcher, recoverPostHumanCycles } = require("../src/domain/post-human-dispatcher")
const { processPostHumanCycle } = require("../src/domain/post-human-flow")
const {
  montarBotaoAtendimentoRealizado,
  handleAtendimentoRealizadoConfirmation,
  _clearActionContextsForTests
} = require("../src/domain/admin-post-human-complementation")

const connectionString = process.env.POST_HUMAN_TEST_DATABASE_URL
if (!connectionString) {
  if (process.env.POST_HUMAN_POSTGRES_REQUIRED === "true") {
    console.error("FAIL integração PostgreSQL obrigatória: POST_HUMAN_TEST_DATABASE_URL ausente")
    process.exit(3)
  }
  console.log("NOT RUN integração PostgreSQL: execute npm run test:post-human:release-gate")
  process.exit(0)
}
const parsed = new URL(connectionString)
if (!["127.0.0.1", "localhost", "::1"].includes(parsed.hostname)) {
  console.error("Integração aceita somente PostgreSQL localhost")
  process.exit(2)
}

const migration = fs.readFileSync(path.join(__dirname, "..", "migrations", "20260728_post_human_cycles.sql"), "utf8")
let passed = 0
async function test(name, fn) {
  try { await fn(); passed++; console.log(`PASS ${name}`) }
  catch (error) { console.error(`FAIL ${name}\n${error.stack}`); process.exitCode = 1 }
}
async function toAwaiting(repository, input) {
  let cycle = await repository.createCycle(input)
  for (const status of ["analyzing", "ready_to_send", "sending", "message_sent", "awaiting_response"]) {
    cycle = await repository.updateStatus(cycle.cycleId, status)
  }
  return cycle
}

;(async () => {
  const previous = {
    POST_HUMAN_COMPLEMENTATION_ENABLED: process.env.POST_HUMAN_COMPLEMENTATION_ENABLED,
    POST_HUMAN_PILOT_CASES: process.env.POST_HUMAN_PILOT_CASES
  }
  process.env.POST_HUMAN_COMPLEMENTATION_ENABLED = "true"
  process.env.POST_HUMAN_PILOT_CASES = "PILOT-001,A-001,B-001,REC-001"

  const adminPool = new Pool({ connectionString, max: 2 })
  await adminPool.query("DROP FUNCTION IF EXISTS create_post_human_cycle(UUID,TEXT,TEXT,TEXT); DROP TABLE IF EXISTS post_human_cycles")
  await adminPool.query(migration)
  const pool = new Pool({ connectionString, max: 3 })
  const repository = new PostHumanCycleRepository({ pool, mode: "postgres" })
  await repository.initialize()
  const calls = { meta: 0, hubspot: 0, drive: 0, legacy: 0 }

  await test("piloto atravessa botao token PostgreSQL sender e dispatcher produtivo", async () => {
    _clearActionContextsForTests()
    const usuario = {
      negocioId: "DEAL-PILOT", contatoId: "CONTACT-PILOT", numeroCaso: "PILOT-001",
      telefoneNormalizado: "5511999990001", ultimaMsg: Date.now(),
      listaDocumental: ["RG"], docsEntregues: []
    }
    const button = montarBotaoAtendimentoRealizado(usuario.negocioId, usuario.numeroCaso, {
      adminId: "ADMIN-1", contatoId: usuario.contatoId
    })
    assert.match(button.id, /^admin_post_human_completed_/)
    const confirmation = await handleAtendimentoRealizadoConfirmation({
      from: "ADMIN-1",
      interactionId: button.id,
      usuario,
      isAdmin: value => value === "ADMIN-1",
      repository,
      processCycle: (cycle, currentUser) => processPostHumanCycle({
        cycle, usuario: currentUser, repository,
        deps: {
          sendFree: async () => (++calls.meta, { id: "meta-mock-1" }),
          sendTemplate: async () => (++calls.meta, { id: "meta-mock-template" }),
          listarArquivosDrive: async () => (++calls.drive, []),
          templateConfig: { nome: "caso_atualizacao_v3", idioma: "pt_BR", parametrosEsperados: 0, componentes: [] }
        }
      })
    })
    assert.equal(confirmation.existing, false)
    const awaiting = await repository.findActiveByBusiness(usuario.negocioId)
    assert.equal(awaiting.status, "awaiting_response")
    assert.equal(calls.meta, 1)

    const dispatcher = createPostHumanDispatcher({
      isEnabled: () => true,
      repository,
      normalizePhone: value => String(value),
      resolveBusiness: async () => ({ validated: true, negocioId: usuario.negocioId, numeroCaso: usuario.numeroCaso }),
      saveInformation: async ({ cycle }) => ({
        persisted: true,
        hubspot: {
          objectType: "contact", objectId: usuario.contatoId,
          current: { city: "" }, incoming: { city: "Recife" }, allowedFields: ["city"],
          cycleId: cycle.cycleId
        }
      }),
      applySafeHubspotUpdates: async () => (++calls.hubspot, { humanReviewRequired: false, divergences: [] }),
      isComplete: () => true
    })
    const dispatched = await dispatcher({
      from: usuario.telefoneNormalizado, msgType: "text", content: "Recife",
      usuario, contexto: { negocioId: usuario.negocioId, numeroCaso: usuario.numeroCaso }
    })
    assert.equal(dispatched.handled, true)
    assert.equal(dispatched.legacyFlowAllowed, false)
    assert.equal(dispatched.cycleId, awaiting.cycleId)
    assert.equal((await repository.getCycle(awaiting.cycleId)).status, "completed")
    assert.equal(calls.hubspot, 1)
  })

  await test("dois contatos permanecem isolados pela fronteira produtiva", async () => {
    const a = await toAwaiting(repository, { negocioId: "DEAL-A", numeroCaso: "A-001", contatoId: "CONTACT-A" })
    await toAwaiting(repository, { negocioId: "DEAL-B", numeroCaso: "B-001", contatoId: "CONTACT-B" })
    let external = 0
    const dispatcher = createPostHumanDispatcher({
      isEnabled: () => true,
      repository,
      normalizePhone: value => String(value),
      saveInformation: async () => { external++; return { persisted: true } }
    })
    const cross = await dispatcher({
      from: "PHONE-A", msgType: "text", content: "x",
      usuario: { contatoId: "CONTACT-A", negocioId: "DEAL-B" }
    })
    assert.equal(cross.handled, false)
    assert.equal(external, 0)
    const own = await dispatcher({
      from: "PHONE-A", msgType: "text", content: "x",
      usuario: { contatoId: "CONTACT-A", negocioId: "DEAL-A" }
    })
    assert.equal(own.cycleId, a.cycleId)
  })

  await test("identidade ausente negocio isolado e telefone invalido falham sem efeitos", async () => {
    let external = 0
    const dispatcher = createPostHumanDispatcher({
      isEnabled: () => true,
      repository,
      normalizePhone: value => String(value),
      resolveValidatedContactByPhone: async () => ({ validated: false }),
      saveInformation: async () => { external++ },
      legacyDocumentPipeline: async () => { external++ },
      applySafeHubspotUpdates: async () => { external++ }
    })
    const result = await dispatcher({
      from: "UNKNOWN", msgType: "text", content: "x",
      usuario: { negocioId: "DEAL-A" }
    })
    assert.equal(result.handled, false)
    assert.equal(result.legacyFlowAllowed, true)
    assert.equal(result.cycleId, null)
    assert.equal(external, 0)
  })

  await test("telefone validado resolve apenas o contato correspondente", async () => {
    const dispatcher = createPostHumanDispatcher({
      isEnabled: () => true,
      repository,
      normalizePhone: value => String(value),
      resolveValidatedContactByPhone: async phone => ({
        validated: true, contatoId: "CONTACT-B", telefoneNormalizado: phone
      }),
      saveInformation: async () => ({ persisted: true })
    })
    const result = await dispatcher({ from: "PHONE-B", msgType: "text", content: "x", usuario: {} })
    assert.equal(result.handled, true, JSON.stringify(result))
    assert.equal((await repository.getCycle(result.cycleId)).contatoId, "CONTACT-B")
  })

  await test("upload legado end-to-end persiste apenas no ciclo correto", async () => {
    const cycle = await toAwaiting(repository, { negocioId: "DEAL-DOC", numeroCaso: "PILOT-001", contatoId: "CONTACT-DOC" })
    const dispatcher = createPostHumanDispatcher({
      isEnabled: () => true,
      repository,
      normalizePhone: value => String(value),
      legacyDocumentPipeline: async context => {
        calls.legacy++
        assert.equal(context.cycleId, cycle.cycleId)
        assert.equal(context.negocioId, "DEAL-DOC")
        return {
          persisted: true, handled: true,
          metadata: { mediaType: "document", pipeline: "legacy_document_pipeline_v1" },
          pipelineResponse: { texto: "upload mock confirmado" }
        }
      }
    })
    const result = await dispatcher({
      from: "PHONE-DOC", msgType: "document", content: { type: "document" },
      rawMessage: { type: "document", document: { id: "mock-id" } },
      usuario: { contatoId: "CONTACT-DOC", negocioId: "DEAL-DOC", numeroCaso: "PILOT-001" }
    })
    assert.equal(result.handled, true)
    const saved = await repository.getCycle(cycle.cycleId)
    assert.equal(saved.status, "awaiting_response")
    assert.equal(saved.payload.documentoMetadados.pipeline, "legacy_document_pipeline_v1")
    assert.equal(calls.legacy, 1)
  })

  await test("falha de upload e feature desligada nao produzem falso sucesso", async () => {
    const cycle = await toAwaiting(repository, { negocioId: "DEAL-DOC-FAIL", numeroCaso: "PILOT-001", contatoId: "CONTACT-FAIL" })
    const before = await repository.getCycle(cycle.cycleId)
    const failed = createPostHumanDispatcher({
      isEnabled: () => true,
      repository,
      normalizePhone: value => String(value),
      legacyDocumentPipeline: async () => ({ persisted: false, handled: true })
    })
    const result = await failed({
      from: "PHONE-DOC", msgType: "document", content: { type: "document" },
      usuario: { contatoId: "CONTACT-FAIL", negocioId: "DEAL-DOC-FAIL", numeroCaso: "PILOT-001" }
    })
    assert.equal(result.handled, true, JSON.stringify(result))
    assert.equal(result.response.pendingUpload, true)
    assert.equal((await repository.getCycle(cycle.cycleId)).version, before.version)

    let touched = 0
    const disabled = createPostHumanDispatcher({
      isEnabled: () => false,
      repository: { getActiveCycles: async () => { touched++ } },
      saveInformation: async () => { touched++ },
      legacyDocumentPipeline: async () => { touched++ }
    })
    const off = await disabled({ from: "x", msgType: "text", content: "x", usuario: {} })
    assert.equal(off.handled, false)
    assert.equal(off.legacyFlowAllowed, true)
    assert.equal(touched, 0)
  })

  await test("recovery de boot usa a mesma fronteira e nova conexao", async () => {
    await repository.createCycle({ negocioId: "REC-PENDING", numeroCaso: "REC-001", contatoId: "REC-C" })
    const analyzing = await repository.createCycle({ negocioId: "REC-ANALYZING", numeroCaso: "REC-001", contatoId: "REC-C" })
    await repository.updateStatus(analyzing.cycleId, "analyzing")
    const outside = await repository.createCycle({ negocioId: "REC-OUTSIDE", numeroCaso: "OUTSIDE", contatoId: "REC-C" })
    await pool.end()

    const freshPool = new Pool({ connectionString, max: 2 })
    const freshRepo = new PostHumanCycleRepository({ pool: freshPool, mode: "postgres" })
    const processed = []
    const recovery = await recoverPostHumanCycles({
      isEnabled: () => true,
      repository: freshRepo,
      isCaseAllowed: numeroCaso => numeroCaso === "REC-001",
      findUser: cycle => ({ negocioId: cycle.negocioId, numeroCaso: cycle.numeroCaso }),
      processCycle: async cycle => { processed.push(cycle.cycleId) }
    })
    assert.equal(recovery.initialized, true)
    assert.ok(processed.length >= 2)
    assert.ok(!processed.includes(outside.cycleId))
    assert.equal(new Set(processed).size, processed.length)
    const disabled = await recoverPostHumanCycles({
      isEnabled: () => false,
      repository: { initialize: async () => { throw new Error("nao chamar") } }
    })
    assert.equal(disabled.skipped, "feature_disabled")
    await freshPool.end()
  })

  await adminPool.end()
  for (const [key, value] of Object.entries(previous)) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
  console.log(`RESULT ${passed}/7 dispatcher integration passed`)
})().catch(error => {
  console.error(error)
  process.exitCode = 1
})
