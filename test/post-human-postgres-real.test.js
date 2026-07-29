"use strict"

const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const { Pool } = require("pg")
const { PostHumanCycleRepository } = require("../src/domain/post-human-cycle-model")
const { isPilotCaseAllowed } = require("../src/domain/admin-post-human-complementation")
const { recoverPostHumanCycles } = require("../src/domain/post-human-dispatcher")

const connectionString = process.env.POST_HUMAN_TEST_DATABASE_URL
if (!connectionString) {
  if (process.env.POST_HUMAN_POSTGRES_REQUIRED === "true") {
    console.error("FAIL PostgreSQL real obrigatório: POST_HUMAN_TEST_DATABASE_URL ausente")
    process.exit(3)
  }
  console.log("NOT RUN PostgreSQL real: execute npm run test:post-human:postgres-required")
  process.exit(0)
}
const parsed = new URL(connectionString)
if (!["127.0.0.1", "localhost", "::1"].includes(parsed.hostname)) {
  console.error("Teste PostgreSQL real aceita somente localhost")
  process.exit(2)
}

const migration = fs.readFileSync(path.join(__dirname, "..", "migrations", "20260728_post_human_cycles.sql"), "utf8")
let passed = 0
async function test(name, fn) {
  try { await fn(); passed++; console.log(`PASS ${name}`) }
  catch (error) { console.error(`FAIL ${name}\n${error.stack}`); process.exitCode = 1 }
}

;(async () => {
  const admin = new Pool({ connectionString, max: 2 })
  const versionResult = await admin.query("SELECT version() AS version, current_setting('server_version_num')::int AS version_num")
  console.log(`POSTGRES_VERSION ${versionResult.rows[0].version}`)
  const major = Math.floor(versionResult.rows[0].version_num / 10000)
  assert.ok(major === 17 || major === 18, "PostgreSQL 17.x ou 18.x obrigatório")
  await test("migration cria contrato completo e rejeita valores invalidos", async () => {
    await admin.query("DROP FUNCTION IF EXISTS create_post_human_cycle(UUID,TEXT,TEXT,TEXT); DROP TABLE IF EXISTS post_human_cycles")
    await admin.query(migration)
    const columns = await admin.query(
      `SELECT column_name, data_type FROM information_schema.columns
       WHERE table_schema='public' AND table_name='post_human_cycles' ORDER BY ordinal_position`
    )
    const names = columns.rows.map(row => row.column_name)
    for (const required of ["cycle_id", "negocio_id", "numero_caso", "contato_id", "sequencia", "status",
      "estado_documental", "resultado_envio", "payload", "version", "created_at", "updated_at"]) {
      assert.ok(names.includes(required), `coluna ausente: ${required}`)
    }
    assert.equal(columns.rows.find(row => row.column_name === "cycle_id").data_type, "uuid")
    const indexes = await admin.query("SELECT indexname FROM pg_indexes WHERE schemaname='public' AND tablename='post_human_cycles'")
    assert.ok(indexes.rows.some(row => row.indexname === "post_human_one_active_cycle_per_business"))
    const fn = await admin.query("SELECT proname FROM pg_proc WHERE proname='create_post_human_cycle'")
    assert.equal(fn.rowCount, 1)
    await assert.rejects(
      admin.query(`INSERT INTO post_human_cycles(cycle_id,negocio_id,numero_caso,sequencia,status)
                   VALUES(gen_random_uuid(),'invalid-status','CASE-1',1,'inventado')`),
      /check constraint|restri.*verifica/i
    )
    await assert.rejects(
      admin.query(`INSERT INTO post_human_cycles(cycle_id,negocio_id,numero_caso,sequencia,status,estado_documental)
                   VALUES(gen_random_uuid(),'invalid-doc','CASE-1',1,'pending','INVENTADO')`),
      /check constraint|restri.*verifica/i
    )
    await assert.rejects(
      admin.query(`INSERT INTO post_human_cycles(cycle_id,negocio_id,numero_caso,sequencia,status,resultado_envio)
                   VALUES(gen_random_uuid(),'invalid-result','CASE-1',1,'pending','inventado')`),
      /check constraint|restri.*verifica/i
    )
  })

  await test("segunda aplicacao da migration e idempotente", async () => {
    await admin.query(migration)
    const result = await admin.query("SELECT count(*)::int AS total FROM pg_proc WHERE proname='create_post_human_cycle'")
    assert.equal(result.rows[0].total, 1)
  })

  await test("tabela divergente falha sem falsa compatibilidade", async () => {
    await admin.query("DROP SCHEMA IF EXISTS divergent CASCADE; CREATE SCHEMA divergent")
    await admin.query("CREATE TABLE divergent.post_human_cycles(cycle_id UUID PRIMARY KEY)")
    await assert.rejects(admin.query(`SET search_path TO divergent; ${migration}`), /column|coluna|does not exist|não existe/i)
    await admin.query("SET search_path TO public")
    const columns = await admin.query(
      "SELECT count(*)::int AS total FROM information_schema.columns WHERE table_schema='divergent' AND table_name='post_human_cycles'"
    )
    assert.equal(columns.rows[0].total, 1)
    await admin.query("DROP SCHEMA divergent CASCADE")
  })

  const poolA = new Pool({ connectionString, max: 1 })
  const poolB = new Pool({ connectionString, max: 1 })
  const repoA = new PostHumanCycleRepository({ pool: poolA, mode: "postgres" })
  const repoB = new PostHumanCycleRepository({ pool: poolB, mode: "postgres" })

  await test("duas conexoes reais serializam criacao pelo advisory lock", async () => {
    const [a, b] = await Promise.all([
      repoA.createCycle({ negocioId: "deal-concurrent", numeroCaso: "CASE-REAL", contatoId: "contact-real" }),
      repoB.createCycle({ negocioId: "deal-concurrent", numeroCaso: "CASE-REAL", contatoId: "contact-real" })
    ])
    assert.equal(a.cycleId, b.cycleId)
    assert.equal([a, b].filter(item => item.alreadyExisted).length, 1)
    for (const cycle of [a, b]) {
      assert.equal(cycle.negocioId, "deal-concurrent")
      assert.equal(cycle.numeroCaso, "CASE-REAL")
      assert.equal(cycle.sequencia, 1)
      assert.equal(cycle.status, "pending")
      assert.equal(cycle.estadoDocumental, null)
      assert.ok(cycle.timestamps.createdAt)
      assert.ok(cycle.timestamps.updatedAt)
      assert.equal(cycle.version, 0)
    }
    const rows = await admin.query("SELECT sequencia FROM post_human_cycles WHERE negocio_id='deal-concurrent'")
    assert.deepEqual(rows.rows.map(row => row.sequencia), [1])
  })

  await test("versao otimista detecta atualizacao concorrente sem perda silenciosa", async () => {
    const cycle = await repoA.createCycle({ negocioId: "deal-version", numeroCaso: "CASE-REAL", contatoId: "contact-real" })
    const before = await repoA.getCycle(cycle.cycleId)
    const results = await Promise.allSettled([
      repoA.updateStatus(cycle.cycleId, "analyzing", { sourceA: true }, { expectedVersion: before.version }),
      repoB.updateStatus(cycle.cycleId, "analyzing", { sourceB: true }, { expectedVersion: before.version })
    ])
    assert.equal(results.filter(item => item.status === "fulfilled").length, 1)
    assert.equal(results.filter(item => item.status === "rejected" && /concurrency_conflict/.test(item.reason.message)).length, 1)
    const after = await repoA.getCycle(cycle.cycleId)
    assert.equal(after.version, before.version + 1)
    assert.ok(after.payload.sourceA || after.payload.sourceB)
    assert.notEqual(after.timestamps.updatedAt, before.timestamps.updatedAt)
  })

  await test("recovery com nova conexao respeita estados flag e allowlist", async () => {
    const inputs = [
      ["recover-pending", "pending"],
      ["recover-analyzing", "analyzing"],
      ["recover-awaiting", "awaiting_response"],
      ["recover-sending", "sending"],
      ["recover-sent", "message_sent"],
      ["recover-uncertain", "sending"]
    ]
    const created = new Map()
    for (const [business, target] of inputs) {
      let cycle = await repoA.createCycle({ negocioId: business, numeroCaso: "CASE-REAL", contatoId: "contact-real" })
      const route = ["analyzing", "ready_to_send", "sending", "message_sent", "awaiting_response"]
      for (const status of route) {
        if (cycle.status === target) break
        cycle = await repoA.updateStatus(cycle.cycleId, status,
          business === "recover-uncertain" && status === "sending" ? { resultadoEnvio: "incerto" } : {})
        if (status === target) break
      }
      created.set(business, cycle.cycleId)
    }
    const outside = await repoA.createCycle({
      negocioId: "recover-outside", numeroCaso: "OUTSIDE-CASE", contatoId: "contact-real"
    })
    const failing = await repoA.createCycle({
      negocioId: "recover-failing", numeroCaso: "CASE-REAL", contatoId: "contact-real"
    })
    await poolA.end()
    await poolB.end()
    const freshPool = new Pool({ connectionString, max: 1 })
    const freshRepo = new PostHumanCycleRepository({ pool: freshPool, mode: "postgres" })
    const processed = []
    const recovery = await recoverPostHumanCycles({
      isEnabled: () => true,
      repository: freshRepo,
      isCaseAllowed: numeroCaso => isPilotCaseAllowed(numeroCaso, "CASE-REAL"),
      findUser: async cycle => ({ negocioId: cycle.negocioId }),
      processCycle: async cycle => {
        processed.push(cycle.cycleId)
        if (cycle.cycleId === failing.cycleId) throw new Error("falha isolada")
      },
      safeLogger: () => { throw new Error("logger indisponivel") }
    })
    assert.equal(recovery.initialized, true)
    assert.equal(recovery.failed, 1)
    assert.ok(processed.includes(created.get("recover-pending")))
    assert.ok(processed.includes(created.get("recover-analyzing")))
    assert.ok(processed.includes(failing.cycleId))
    assert.ok(!processed.includes(outside.cycleId))
    for (const business of ["recover-awaiting", "recover-sending", "recover-sent", "recover-uncertain"]) {
      assert.ok(!processed.includes(created.get(business)))
    }
    assert.equal(new Set(processed).size, processed.length)
    assert.equal((await freshRepo.getActiveCycles({ negocioId: "recover-pending" })).length, 1)
    assert.equal(isPilotCaseAllowed("CASE-REAL", ""), false)
    const disabled = await recoverPostHumanCycles({
      isEnabled: () => false,
      repository: { initialize: async () => { throw new Error("nao chamar") } }
    })
    assert.equal(disabled.skipped, "feature_disabled")
    await freshPool.end()
  })

  await test("rollback conservador remove funcao e preserva dados", async () => {
    const before = await admin.query("SELECT count(*)::int AS total FROM post_human_cycles")
    assert.ok(before.rows[0].total > 0)
    await admin.query("DROP FUNCTION IF EXISTS create_post_human_cycle(UUID,TEXT,TEXT,TEXT)")
    const fn = await admin.query("SELECT count(*)::int AS total FROM pg_proc WHERE proname='create_post_human_cycle'")
    assert.equal(fn.rows[0].total, 0)
    const after = await admin.query("SELECT count(*)::int AS total FROM post_human_cycles")
    assert.equal(after.rows[0].total, before.rows[0].total)
    await admin.query(migration)
  })

  await admin.end()
  console.log(`RESULT ${passed}/7 passed`)
})().catch(error => {
  console.error(error)
  process.exitCode = 1
})
