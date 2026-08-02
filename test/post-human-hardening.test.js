"use strict"

const assert = require("node:assert/strict")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")
const {
  getAllowedPilotCases, isPilotCaseAllowed, normalizeCaseNumber,
  montarBotaoAtendimentoRealizado, handleAtendimentoRealizadoConfirmation,
  _clearActionContextsForTests
} = require("../src/domain/admin-post-human-complementation")
const { PostHumanCycleRepository } = require("../src/domain/post-human-cycle-model")
const { sanitizeObject } = require("../src/domain/post-human-safe-log")
const { tratarRespostaClientePosAtendimento } = require("../src/domain/post-human-response-handler")
const { PostHumanPostgresMock } = require("./mocks/post-human-postgres-mock")

let passed = 0
async function test(name, fn) {
  try { await fn(); passed++; console.log(`PASS ${name}`) }
  catch (error) { console.error(`FAIL ${name}\n${error.stack}`); process.exitCode = 1 }
}

;(async () => {
  const enabled = process.env.POST_HUMAN_COMPLEMENTATION_ENABLED
  const cases = process.env.POST_HUMAN_PILOT_CASES

  await test("allowlist ausente vazia invalida e wildcard bloqueiam", () => {
    assert.equal(getAllowedPilotCases(undefined).size, 0)
    assert.equal(getAllowedPilotCases("").size, 0)
    assert.equal(getAllowedPilotCases("   ").size, 0)
    assert.equal(getAllowedPilotCases("*").size, 0)
    assert.equal(getAllowedPilotCases("CASE-1, valor inválido!").size, 0)
  })

  await test("allowlist normaliza caixa e espacos sem fallback", () => {
    assert.equal(normalizeCaseNumber(" prev. 260701.001 "), "PREV.260701.001")
    assert.equal(isPilotCaseAllowed("prev. 260701.001", " PREV.260701.001 "), true)
    assert.equal(isPilotCaseAllowed("PREV.260701.002", "PREV.260701.001"), false)
  })

  await test("flag false bloqueia botao e efeitos", async () => {
    process.env.POST_HUMAN_COMPLEMENTATION_ENABLED = "false"
    process.env.POST_HUMAN_PILOT_CASES = "CASE-1"
    let created = 0
    assert.equal(montarBotaoAtendimentoRealizado("D", "CASE-1"), null)
    const result = await handleAtendimentoRealizadoConfirmation({
      from: "admin", interactionId: "admin_post_human_completed_fake",
      usuario: { negocioId: "D", numeroCaso: "CASE-1" }, isAdmin: () => true,
      repository: { createCycle: async () => { created++; } }, processCycle: async () => { created++ }
    })
    assert.equal(result.reason, "feature_disabled"); assert.equal(created, 0)
    const response = await tratarRespostaClientePosAtendimento({
      from: "5511999999999", usuario: {}, repository: { getActiveCycles: async () => { created++; return [] } }
    })
    assert.equal(response, null); assert.equal(created, 0)
  })

  await test("token opaco autorizado funciona uma vez e comando manual falha", async () => {
    process.env.POST_HUMAN_COMPLEMENTATION_ENABLED = "true"
    process.env.POST_HUMAN_PILOT_CASES = "CASE-1"
    _clearActionContextsForTests()
    const button = montarBotaoAtendimentoRealizado("D", "case-1", { adminId: "admin", contatoId: "P1", customerPhone: "5511999999999", customerPhoneConfirmed: true })
    assert.match(button.id, /^admin_post_human_completed_[A-Za-z0-9_-]{24}$/)
    let created = 0
    const deps = {
      from: "admin", usuario: { negocioId: "D", numeroCaso: "CASE-1", contatoId: "P1" }, isAdmin: value => value === "admin",
      repository: { createCycle: async () => (++created, { cycleId: "cycle" }) }, processCycle: async () => {}
    }
    assert.equal((await handleAtendimentoRealizadoConfirmation({ ...deps, interactionId: "admin_post_human_completed_manual" })).failed, undefined)
    assert.equal(created, 0)
    assert.equal((await handleAtendimentoRealizadoConfirmation({ ...deps, interactionId: button.id })).existing, false)
    assert.equal(created, 1)
    assert.equal((await handleAtendimentoRealizadoConfirmation({ ...deps, interactionId: button.id })).failed, undefined)
    assert.equal(created, 1)
  })

  await test("postgres create read update list e concorrencia usam pool", async () => {
    const pool = new PostHumanPostgresMock()
    const repoA = new PostHumanCycleRepository({ pool, mode: "postgres" })
    const repoB = new PostHumanCycleRepository({ pool, mode: "postgres" })
    await repoA.initialize()
    const [a, b] = await Promise.all([
      repoA.createCycle({ negocioId: "D1", numeroCaso: "CASE-1", contatoId: "P1" }),
      repoB.createCycle({ negocioId: "D1", numeroCaso: "CASE-1", contatoId: "P1" })
    ])
    assert.equal(a.cycleId, b.cycleId); assert.equal([a, b].filter(item => item.alreadyExisted).length, 1)
    const updated = await repoA.updateStatus(a.cycleId, "analyzing", { estadoDocumental: "DOCUMENTOS_NAO_ANALISADOS" })
    assert.equal(updated.status, "analyzing"); assert.equal((await repoA.getCycle(a.cycleId)).cycleId, a.cycleId)
    assert.equal((await repoB.getActiveCycles({ negocioId: "D1" })).length, 1)
    assert.equal((await repoA.listRecoverable()).length, 1)
    assert.ok(pool.calls.some(call => /UPDATE post_human_cycles/.test(call.sql)))
  })

  await test("reinicio local usa nova instancia e nao recupera sending/message_sent", async () => {
    const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "post-human-restart-"))
    const file = path.join(dir, "cycles.json")
    const first = new PostHumanCycleRepository({ file, mode: "local" })
    const pending = await first.createCycle({ negocioId: "D1", numeroCaso: "CASE-1" })
    const uncertain = await first.createCycle({ negocioId: "D2", numeroCaso: "CASE-2" })
    await first.updateStatus(uncertain.cycleId, "analyzing")
    await first.updateStatus(uncertain.cycleId, "ready_to_send")
    await first.updateStatus(uncertain.cycleId, "sending", { resultadoEnvio: "incerto" })
    const restarted = new PostHumanCycleRepository({ file, mode: "local" })
    assert.deepEqual((await restarted.listRecoverable()).map(item => item.cycleId), [pending.cycleId])
  })

  await test("sanitizacao recursiva mascara objetos e formatos internacionais", () => {
    const output = JSON.stringify(sanitizeObject({
      auth: { token: "secret-value" }, cpf: "52998224725",
      phones: ["+55 (11) 99999-9999", "5511999999999"]
    }))
    assert.doesNotMatch(output, /secret-value|52998224725|999999999/)
  })

  const sql = await fs.promises.readFile(path.join(__dirname, "..", "migrations", "20260728_post_human_cycles.sql"), "utf8")
  await test("contrato SQL possui checks lock atomico indices e UUID da aplicacao", () => {
    assert.match(sql, /CHECK \(status IN/)
    assert.match(sql, /pg_advisory_xact_lock/)
    assert.match(sql, /p_cycle_id UUID/)
    assert.doesNotMatch(sql, /gen_random_uuid/)
    assert.match(sql, /created_at TIMESTAMPTZ/)
  })

  if (enabled === undefined) delete process.env.POST_HUMAN_COMPLEMENTATION_ENABLED
  else process.env.POST_HUMAN_COMPLEMENTATION_ENABLED = enabled
  if (cases === undefined) delete process.env.POST_HUMAN_PILOT_CASES
  else process.env.POST_HUMAN_PILOT_CASES = cases
  console.log(`RESULT ${passed}/8 passed`)
})()
