"use strict"

const assert = require("node:assert/strict")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")
const { PostHumanActionContextRepository } = require("../src/domain/post-human-action-context-repository")
const { PostHumanCycleRepository } = require("../src/domain/post-human-cycle-model")
const { montarBotaoAtendimentoRealizado, handleAtendimentoRealizadoConfirmation } = require("../src/domain/admin-post-human-complementation")
const { logInfo } = require("../src/utils/logging")

async function test(name, fn) { try { await fn(); console.log(`PASS ${name}`) } catch (error) { console.error(`FAIL ${name}: ${error.stack}`); process.exitCode = 1 } }
async function makeRepository(clock = Date.now) {
  const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "post-human-action-"))
  return { file: path.join(dir, "contexts.json"), repo: new PostHumanActionContextRepository({ file: path.join(dir, "contexts.json"), clock }), dir }
}
async function makeRepositories(clock = Date.now) {
  const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "post-human-transaction-"))
  return {
    dir,
    actionRepo: new PostHumanActionContextRepository({ file: path.join(dir, "contexts.json"), clock }),
    cycleRepo: new PostHumanCycleRepository({ file: path.join(dir, "cycles.json"), clock })
  }
}
function user(overrides = {}) { return { negocioId: "D1", contatoId: "C1", numeroCaso: "CASE-1", ...overrides } }
function setup() { process.env.POST_HUMAN_COMPLEMENTATION_ENABLED = "true"; process.env.POST_HUMAN_PILOT_CASES = "CASE-1" }
function button(repo, overrides = {}) { return montarBotaoAtendimentoRealizado("D1", "CASE-1", { adminId: "ADMIN", contatoId: "C1", customerPhone: "5511999999999", customerPhoneConfirmed: true, actionContextRepository: repo, ...overrides }) }
function tokenFromButtonId(id) { return String(id).replace(/^admin_post_human_completed_/, "") }
async function captureStructuredLogs(operation) {
  const messages = []; const original = console.log
  console.log = (...args) => messages.push(args.map(String).join(" "))
  try {
    const result = await operation()
    return { result, logs: messages.map(message => JSON.parse(message)) }
  } finally { console.log = original }
}
function confirmation(buttonId, repo, overrides = {}) {
  return handleAtendimentoRealizadoConfirmation({ from: "ADMIN", interactionId: buttonId, usuario: user(), isAdmin: value => value === "ADMIN", repository: { createCycle: async () => ({ cycleId: "cycle" }) }, actionContextRepository: repo, confirmHubspotContext: async () => ({ ok: true }), processCycle: async () => ({ status: "pending" }), ...overrides })
}

;(async () => {
  setup()
  await test("contexto durável atravessa restart e cria um único ciclo", async () => {
    const { file, repo } = await makeRepository(); const rendered = await button(repo)
    const restarted = new PostHumanActionContextRepository({ file }); let cycles = 0
    const result = await confirmation(rendered.id, restarted, { repository: { createCycle: async () => (++cycles, { cycleId: "cycle" }) } })
    assert.equal(result.existing, false); assert.equal(cycles, 1)
    const replay = await confirmation(rendered.id, restarted, { repository: { createCycle: async () => (++cycles, { cycleId: "second" }) } })
    assert.equal(replay.reason, "context_already_consumed"); assert.equal(cycles, 1)
  })
  await test("TTL, admin, allowlist e snapshots divergentes bloqueiam ciclo e outbound", async () => {
    let now = 1_000; const { repo } = await makeRepository(() => now); process.env.POST_HUMAN_ACTION_TTL_MS = "1000"
    const expired = await button(repo); now = 2_001; let cycles = 0
    assert.equal((await confirmation(expired.id, repo, { repository: { createCycle: async () => (++cycles, {}) } })).reason, "context_expired")
    now = 3_000; const admin = await button(repo); assert.equal((await confirmation(admin.id, repo, { from: "OTHER", isAdmin: () => true })).reason, "admin_mismatch")
    const deal = await button(repo); assert.equal((await confirmation(deal.id, repo, { usuario: user({ negocioId: "OTHER" }) })).reason, "deal_context_mismatch")
    const contact = await button(repo); assert.equal((await confirmation(contact.id, repo, { usuario: user({ contatoId: "OTHER" }) })).reason, "contact_context_mismatch")
    const caseNumber = await button(repo); assert.equal((await confirmation(caseNumber.id, repo, { usuario: user({ numeroCaso: "OTHER" }) })).reason, "case_context_mismatch")
    assert.equal(cycles, 0); delete process.env.POST_HUMAN_ACTION_TTL_MS
  })
  await test("reconfirmação HubSpot falha fechada e logs não expõem token nem PII", async () => {
    const { repo } = await makeRepository(); const events = []; const rendered = await button(repo); let cycles = 0
    const result = await confirmation(rendered.id, repo, { repository: { createCycle: async () => (++cycles, {}) }, confirmHubspotContext: async () => ({ ok: false, reason: "hubspot_contact_mismatch" }), logger: event => events.push(event) })
    assert.equal(result.reason, "hubspot_contact_mismatch"); assert.equal(cycles, 0); assert.deepEqual(events[0].failureCode, "hubspot_contact_mismatch")
    assert.equal(JSON.stringify(events).includes(tokenFromButtonId(rendered.id)), false); assert.equal(JSON.stringify(events).includes("5511999999999"), false)
  })
  await test("rejeicoes chegam ao JSON final como failureCode sem token nem PII", async () => {
    const sensitive = { phone: "5511999999999", cpf: "123.456.789-09", name: "Nome Completo Sensivel" }
    const { repo } = await makeRepository(); const rendered = await button(repo)
    const hubspot = await captureStructuredLogs(() => confirmation(rendered.id, repo, {
      usuario: user({ telefone: sensitive.phone, cpf: sensitive.cpf, nome: sensitive.name }),
      confirmHubspotContext: async () => ({ ok: false, reason: "hubspot_contact_mismatch" }),
      logger: logInfo
    }))
    assert.equal(hubspot.result.reason, "hubspot_contact_mismatch")
    assert.equal(hubspot.logs.length, 1)
    assert.equal(hubspot.logs[0].event, "post_human.action_confirmation")
    assert.equal(hubspot.logs[0].status, "rejected")
    assert.equal(hubspot.logs[0].failureCode, "hubspot_contact_mismatch")

    let now = 1_000; process.env.POST_HUMAN_ACTION_TTL_MS = "1000"
    try {
      const { repo: expiredRepo } = await makeRepository(() => now); const expiredButton = await button(expiredRepo); now = 2_001
      const expired = await captureStructuredLogs(() => confirmation(expiredButton.id, expiredRepo, {
        usuario: user({ telefone: sensitive.phone, cpf: sensitive.cpf, nome: sensitive.name }), logger: logInfo
      }))
      assert.equal(expired.result.reason, "context_expired")
      assert.equal(expired.logs.length, 1)
      assert.equal(expired.logs[0].event, "post_human.action_confirmation")
      assert.equal(expired.logs[0].status, "rejected")
      assert.equal(expired.logs[0].failureCode, "context_expired")

      const serialized = JSON.stringify([...hubspot.logs, ...expired.logs])
      for (const value of [tokenFromButtonId(rendered.id), tokenFromButtonId(expiredButton.id), sensitive.phone, sensitive.cpf, sensitive.name]) {
        assert.equal(serialized.includes(value), false, value)
      }
    } finally { delete process.env.POST_HUMAN_ACTION_TTL_MS }
  })
  await test("erro transitório do HubSpot preserva token para retry seguro", async () => {
    const { repo } = await makeRepository(); const rendered = await button(repo); let cycles = 0; let outbounds = 0
    const failed = await confirmation(rendered.id, repo, {
      repository: { createCycle: async () => (++cycles, {}) },
      confirmHubspotContext: async () => ({ ok: false, reason: "hubspot_error" }),
      processCycle: async () => { outbounds++ }
    })
    assert.equal(failed.reason, "hubspot_error"); assert.equal(cycles, 0); assert.equal(outbounds, 0)
    const inspected = await repo.inspect(tokenFromButtonId(rendered.id), "ADMIN")
    assert.equal(inspected.ok, true, JSON.stringify(inspected)); assert.equal(inspected.context.consumedAt, null)
    const retried = await confirmation(rendered.id, repo, {
      repository: { createCycle: async () => (++cycles, { cycleId: "cycle" }) },
      processCycle: async () => { outbounds++ }
    })
    assert.equal(retried.existing, false); assert.equal(cycles, 1); assert.equal(outbounds, 1)
  })
  await test("duas confirmações simultâneas do mesmo token criam um único ciclo", async () => {
    const { repo } = await makeRepository(); const rendered = await button(repo); let cycles = 0; let outbounds = 0
    let releaseHubspot; const hubspotGate = new Promise(resolve => { releaseHubspot = resolve })
    const options = {
      repository: { createCycle: async () => (++cycles, { cycleId: `cycle-${cycles}` }) },
      confirmHubspotContext: async () => { await hubspotGate; return { ok: true } },
      processCycle: async () => { outbounds++ }
    }
    const first = confirmation(rendered.id, repo, options)
    const second = confirmation(rendered.id, repo, options)
    await new Promise(resolve => setImmediate(resolve)); releaseHubspot()
    const results = await Promise.all([first, second])
    assert.equal(results.filter(result => result.reason === "context_already_consumed").length, 1)
    assert.equal(results.filter(result => result.existing === false).length, 1)
    assert.equal(cycles, 1); assert.equal(outbounds, 1)
  })
  await test("falha de createCycle antes da criação reverte consumo e permite retry", async () => {
    const { actionRepo, cycleRepo } = await makeRepositories(); const rendered = await button(actionRepo); const events = []; let outbounds = 0
    const failed = await confirmation(rendered.id, actionRepo, {
      repository: { createCycle: async () => { throw new Error("database_unavailable") } },
      processCycle: async () => { outbounds++ }, logger: event => events.push(event)
    })
    assert.equal(failed.reason, "cycle_create_failed_rolled_back"); assert.equal(outbounds, 0)
    assert.equal(events[0]?.failureCode, "cycle_create_failed_rolled_back"); assert.equal(JSON.stringify(events).includes(tokenFromButtonId(rendered.id)), false); assert.equal(JSON.stringify(events).includes("5511999999999"), false)
    assert.equal((await actionRepo.inspect(tokenFromButtonId(rendered.id), "ADMIN")).ok, true)
    assert.equal((await cycleRepo.getActiveCycles({ negocioId: "D1" })).length, 0)
    const retried = await confirmation(rendered.id, actionRepo, { repository: cycleRepo, processCycle: async () => { outbounds++ } })
    assert.equal(retried.existing, false); assert.equal((await cycleRepo.getActiveCycles({ negocioId: "D1" })).length, 1); assert.equal(outbounds, 1)
  })
  await test("falha após criação staged e antes do commit reverte contexto e ciclo", async () => {
    const { actionRepo, cycleRepo } = await makeRepositories(); const rendered = await button(actionRepo); let outbounds = 0
    class FailAfterInsertRepository extends PostHumanCycleRepository {
      async createCycle(input, options) { await super.createCycle(input, options); throw new Error("after_insert_before_commit") }
    }
    const failingCycleRepo = new FailAfterInsertRepository({ file: cycleRepo.file })
    const failed = await confirmation(rendered.id, actionRepo, { repository: failingCycleRepo, processCycle: async () => { outbounds++ } })
    assert.equal(failed.reason, "cycle_create_failed_rolled_back"); assert.equal(outbounds, 0)
    assert.equal((await actionRepo.inspect(tokenFromButtonId(rendered.id), "ADMIN")).ok, true)
    assert.equal((await cycleRepo.getActiveCycles({ negocioId: "D1" })).length, 0)
    const retried = await confirmation(rendered.id, actionRepo, { repository: cycleRepo, processCycle: async () => { outbounds++ } })
    assert.equal(retried.existing, false); assert.equal((await cycleRepo.getActiveCycles({ negocioId: "D1" })).length, 1); assert.equal(outbounds, 1)
  })
  await test("falha ao gravar consumo local após ciclo durável compensa a gravação do ciclo", async () => {
    const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "post-human-local-commit-")); let failConsumedWrite = false
    class FailConsumedWriteRepository extends PostHumanActionContextRepository {
      async _write(data) {
        if (failConsumedWrite && data.contexts?.some(context => context.consumedAt)) throw new Error("context_commit_failed")
        return super._write(data)
      }
    }
    const actionRepo = new FailConsumedWriteRepository({ file: path.join(dir, "contexts.json") })
    const cycleRepo = new PostHumanCycleRepository({ file: path.join(dir, "cycles.json") })
    const rendered = await button(actionRepo); failConsumedWrite = true
    const failed = await confirmation(rendered.id, actionRepo, { repository: cycleRepo })
    assert.equal(failed.reason, "cycle_create_failed_rolled_back"); assert.equal((await actionRepo.inspect(tokenFromButtonId(rendered.id), "ADMIN")).ok, true)
    assert.equal((await cycleRepo.getActiveCycles({ negocioId: "D1" })).length, 0)
    failConsumedWrite = false
    assert.equal((await confirmation(rendered.id, actionRepo, { repository: cycleRepo })).existing, false)
    assert.equal((await cycleRepo.getActiveCycles({ negocioId: "D1" })).length, 1)
  })
  await test("compensação local preserva ciclo diferente criado concorrentemente", async () => {
    const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "post-human-local-other-cycle-")); let failConsumedWrite = false
    const cycleRepo = new PostHumanCycleRepository({ file: path.join(dir, "cycles.json") })
    class ConcurrentOtherCycleRepository extends PostHumanActionContextRepository {
      async _write(data) {
        if (failConsumedWrite && data.contexts?.some(context => context.consumedAt)) {
          await cycleRepo.createCycle({ negocioId: "D2", numeroCaso: "CASE-2", contatoId: "C2" })
          throw new Error("context_commit_failed")
        }
        return super._write(data)
      }
    }
    const actionRepo = new ConcurrentOtherCycleRepository({ file: path.join(dir, "contexts.json") })
    const rendered = await button(actionRepo); failConsumedWrite = true
    const failed = await confirmation(rendered.id, actionRepo, { repository: cycleRepo })
    assert.equal(failed.reason, "cycle_create_failed_rolled_back")
    assert.equal((await cycleRepo.getActiveCycles({ negocioId: "D1" })).length, 0)
    const otherCycles = await cycleRepo.getActiveCycles({ negocioId: "D2" })
    assert.equal(otherCycles.length, 1); assert.equal(otherCycles[0].numeroCaso, "CASE-2")
  })
  await test("compensação local preserva versão concorrente do mesmo ciclo", async () => {
    const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "post-human-local-same-cycle-")); let failConsumedWrite = false
    const cycleRepo = new PostHumanCycleRepository({ file: path.join(dir, "cycles.json") })
    class ConcurrentCycleUpdateRepository extends PostHumanActionContextRepository {
      async _write(data) {
        if (failConsumedWrite && data.contexts?.some(context => context.consumedAt)) {
          const [cycle] = await cycleRepo.getActiveCycles({ negocioId: "D1" })
          await cycleRepo.updateStatus(cycle.cycleId, "analyzing", { concurrentUpdate: true })
          throw new Error("context_commit_failed")
        }
        return super._write(data)
      }
    }
    const actionRepo = new ConcurrentCycleUpdateRepository({ file: path.join(dir, "contexts.json") })
    const rendered = await button(actionRepo); const events = []; failConsumedWrite = true
    const failed = await confirmation(rendered.id, actionRepo, { repository: cycleRepo, logger: event => events.push(event) })
    assert.equal(failed.reason, "cycle_compensation_conflict_preserved"); assert.equal(events[0]?.failureCode, "cycle_compensation_conflict_preserved")
    const [preserved] = await cycleRepo.getActiveCycles({ negocioId: "D1" })
    assert.equal(preserved.status, "analyzing"); assert.equal(preserved.version, 1); assert.equal(preserved.payload.concurrentUpdate, true)
    assert.equal((await actionRepo.inspect(tokenFromButtonId(rendered.id), "ADMIN")).ok, true)
    failConsumedWrite = false
    const retried = await confirmation(rendered.id, actionRepo, { repository: cycleRepo })
    assert.equal(retried.existing, true); assert.equal((await cycleRepo.getActiveCycles({ negocioId: "D1" })).length, 1)
  })
  await test("falha de consumo após alreadyExisted não modifica ciclo preexistente", async () => {
    const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "post-human-local-existing-")); let failConsumedWrite = false
    const cycleRepo = new PostHumanCycleRepository({ file: path.join(dir, "cycles.json") })
    const existing = await cycleRepo.createCycle({ negocioId: "D1", numeroCaso: "CASE-1", contatoId: "C1" })
    class FailExistingContextWriteRepository extends PostHumanActionContextRepository {
      async _write(data) {
        if (failConsumedWrite && data.contexts?.some(context => context.consumedAt)) throw new Error("context_commit_failed")
        return super._write(data)
      }
    }
    const actionRepo = new FailExistingContextWriteRepository({ file: path.join(dir, "contexts.json") })
    const rendered = await button(actionRepo); failConsumedWrite = true
    const failed = await confirmation(rendered.id, actionRepo, { repository: cycleRepo })
    assert.equal(failed.reason, "cycle_create_failed_rolled_back")
    const [preserved] = await cycleRepo.getActiveCycles({ negocioId: "D1" })
    assert.deepEqual(preserved, existing)
  })
  await test("expiração entre HubSpot e consume transacional não cria ciclo", async () => {
    let now = 1_000; process.env.POST_HUMAN_ACTION_TTL_MS = "1000"
    const { actionRepo, cycleRepo } = await makeRepositories(() => now); const rendered = await button(actionRepo); let outbounds = 0
    const result = await confirmation(rendered.id, actionRepo, {
      repository: cycleRepo,
      confirmHubspotContext: async () => { now = 2_001; return { ok: true } },
      processCycle: async () => { outbounds++ }
    })
    assert.equal(result.reason, "context_expired"); assert.equal((await cycleRepo.getActiveCycles({ negocioId: "D1" })).length, 0); assert.equal(outbounds, 0)
    delete process.env.POST_HUMAN_ACTION_TTL_MS
  })
  await test("ciclo ativo equivalente é retorno idempotente durável e consome token", async () => {
    const { actionRepo, cycleRepo } = await makeRepositories(); await cycleRepo.createCycle({ negocioId: "D1", numeroCaso: "CASE-1", contatoId: "C1" })
    const rendered = await button(actionRepo); let outbounds = 0
    const result = await confirmation(rendered.id, actionRepo, { repository: cycleRepo, processCycle: async () => { outbounds++ } })
    assert.equal(result.existing, true); assert.equal((await cycleRepo.getActiveCycles({ negocioId: "D1" })).length, 1); assert.equal(outbounds, 0)
    assert.equal((await actionRepo.inspect(tokenFromButtonId(rendered.id), "ADMIN")).reason, "context_already_consumed")
  })
  await test("PostgreSQL usa um client para consume e createCycle e rollback reverte ambos", async () => {
    let consumed = false; let cycles = 0; let snapshot; const clientQueries = []; const poolQueries = []
    const actionRow = { token: "abcdefghijklmnopqrstuvwx", admin_id: "ADMIN", negocio_id: "D1", contato_id: "C1", numero_caso: "CASE-1", customer_phone: "5511999999999", created_at: new Date(1_000), expires_at: new Date(Date.now() + 60_000), consumed_at: null }
    const client = {
      async query(sql) {
        clientQueries.push(sql)
        if (sql === "BEGIN") { snapshot = { consumed, cycles }; return { rows: [] } }
        if (sql === "COMMIT") return { rows: [] }
        if (sql === "ROLLBACK") { consumed = snapshot.consumed; cycles = snapshot.cycles; return { rows: [] } }
        if (sql.includes("UPDATE post_human_action_contexts")) { if (consumed) return { rows: [] }; consumed = true; return { rows: [{ ...actionRow, consumed_at: new Date() }] } }
        if (sql.includes("create_post_human_cycle")) { cycles++; return { rows: [{ cycle_id: "cycle-1", negocio_id: "D1", numero_caso: "CASE-1", contato_id: "C1", sequencia: 1, status: "pending", version: 0, already_existed: false }] } }
        throw new Error(`unexpected_client_query:${sql}`)
      },
      release() {}
    }
    const pool = { async query(sql) { poolQueries.push(sql); return { rows: [] } }, async connect() { return client } }
    const actionRepo = new PostHumanActionContextRepository({ pool, mode: "postgres" })
    const cycleRepo = new PostHumanCycleRepository({ pool, mode: "postgres" })
    await assert.rejects(actionRepo.withTransaction(async transaction => {
      assert.equal((await actionRepo.consume(actionRow.token, "ADMIN", { negocioId: "D1", contatoId: "C1", numeroCaso: "CASE-1" }, { transaction })).ok, true)
      await cycleRepo.createCycle({ negocioId: "D1", numeroCaso: "CASE-1", contatoId: "C1" }, { transaction })
      throw new Error("after_insert_before_commit")
    }), /after_insert_before_commit/)
    assert.equal(consumed, false); assert.equal(cycles, 0); assert.ok(clientQueries.some(sql => sql.includes("UPDATE post_human_action_contexts"))); assert.ok(clientQueries.some(sql => sql.includes("create_post_human_cycle")))
    assert.equal(poolQueries.some(sql => sql.includes("UPDATE post_human_action_contexts") || sql.includes("create_post_human_cycle")), false)
    await actionRepo.withTransaction(async transaction => {
      await actionRepo.consume(actionRow.token, "ADMIN", { negocioId: "D1", contatoId: "C1", numeroCaso: "CASE-1" }, { transaction })
      await cycleRepo.createCycle({ negocioId: "D1", numeroCaso: "CASE-1", contatoId: "C1" }, { transaction })
    })
    assert.equal(consumed, true); assert.equal(cycles, 1)
  })
  await test("contexto inexistente e todas as falhas HubSpot bloqueiam ciclo e outbound", async () => {
    const { repo } = await makeRepository(); const events = []; let cycles = 0; let outbounds = 0
    const missing = await confirmation("admin_post_human_completed_abcdefghijklmnopqrstuvwx", repo, { logger: event => events.push(event) })
    assert.equal(missing.reason, "context_missing")
    for (const reason of ["hubspot_deal_not_found", "hubspot_deal_mismatch", "hubspot_contact_mismatch", "hubspot_ambiguous", "hubspot_error", "hubspot_invalid_response"]) {
      const rendered = await button(repo)
      const result = await confirmation(rendered.id, repo, {
        repository: { createCycle: async () => (++cycles, {}) },
        confirmHubspotContext: async () => ({ ok: false, reason }),
        processCycle: async () => { outbounds++ }, logger: event => events.push(event)
      })
      assert.equal(result.reason, reason)
    }
    assert.equal(cycles, 0); assert.equal(outbounds, 0)
    assert.ok(events.some(event => event.failureCode === "context_missing")); assert.ok(events.some(event => event.failureCode === "hubspot_invalid_response"))
  })
})()
