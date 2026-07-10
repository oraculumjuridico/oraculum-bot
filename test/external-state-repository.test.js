const assert = require("node:assert/strict")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")
const crypto = require("node:crypto")

const rows = new Map()
const migrations = new Map()
class FakePool {
  async query(sql, params = []) {
    const normalized = sql.replace(/\s+/g, " ").trim().toLowerCase()
    if (normalized.startsWith("create table")) return { rowCount: 0, rows: [] }
    if (normalized === "select 1") return { rowCount: 1, rows: [{ "?column?": 1 }] }
    if (normalized.startsWith("select pg_database_size")) return { rowCount: 1, rows: [{ bytes: "1048576" }] }
    if (normalized.includes("from oraculum_state_documents where namespace = any")) {
      const selected = (params[0] || []).filter(key => rows.has(key)).map(key => rows.get(key))
      return { rowCount: selected.length, rows: selected }
    }
    if (normalized.startsWith("insert into oraculum_state_documents")) {
      const [namespace, schemaVersion, format, content, checksum] = params
      rows.set(namespace, { namespace, schema_version: schemaVersion, format, content, checksum })
      return { rowCount: 1, rows: [] }
    }
    if (normalized.startsWith("select migration_id")) {
      const found = migrations.has(params[0])
      return { rowCount: found ? 1 : 0, rows: found ? [{ migration_id: params[0] }] : [] }
    }
    if (normalized.startsWith("insert into oraculum_state_migrations")) {
      migrations.set(params[0], params[1]); return { rowCount: 1, rows: [] }
    }
    throw new Error(`SQL nao simulado: ${normalized}`)
  }
  async end() {}
}

const pg = require("pg")
const RealPool = pg.Pool
pg.Pool = FakePool
const modulePath = require.resolve("../src/infrastructure/external-state-repository")
delete require.cache[modulePath]
const repository = require(modulePath)

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "oraculum-external-state-"))
process.env.EXTERNAL_STATE_PROVIDER = "neon"
process.env.EXTERNAL_STATE_DATABASE_URL = "postgresql://fake.invalid/db"
process.env.EXTERNAL_STATE_REQUIRED = "true"

;(async () => {
  const remoteUsers = JSON.stringify({ savedAt: "2026-01-01T00:00:00.000Z", users: { "5511": { stage: "cliente" } } })
  rows.set("users-state.json", {
    namespace: "users-state.json", format: "json", content: remoteUsers,
    checksum: crypto.createHash("sha256").update(remoteUsers).digest("hex")
  })

  const initialized = await repository.initializeExternalStateRepository({ directory: tempDir })
  assert.equal(initialized.enabled, true)
  assert.equal(initialized.restoredFiles, 1)
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(tempDir, "users-state.json"), "utf8")).users["5511"], { stage: "cliente" })

  const inbox = { schemaVersion: 1, records: { one: { status: "pending" } }, receipts: {} }
  const inboxFile = path.join(tempDir, "webhook-inbox.json")
  fs.writeFileSync(inboxFile, JSON.stringify(inbox))
  await repository.mirrorStateFile(inboxFile)
  await repository.flushExternalState()
  assert.deepEqual(JSON.parse(rows.get("webhook-inbox.json").content), inbox)

  const migration = await repository.migrateLocalState()
  assert.ok(migration.migrated >= 2)
  const repeated = await repository.migrateLocalState()
  assert.equal(repeated.skipped, true)
  const health = await repository.externalStateHealth({ probe: true })
  assert.equal(health.database, "ok")
  assert.equal(health.databaseBytes, 1048576)
  assert.equal(health.freePlanUsagePercent, 0.2)
  assert.equal(health.lastError, null)

  await repository.closeExternalStateRepository()
  delete process.env.EXTERNAL_STATE_DATABASE_URL
  process.env.NODE_ENV = "production"
  await assert.rejects(
    repository.initializeExternalStateRepository({ directory: tempDir }),
    /EXTERNAL_STATE_DATABASE_URL ausente/
  )
  console.log("external-state-repository.test.js: ok")
})().finally(() => {
  pg.Pool = RealPool
  fs.rmSync(tempDir, { recursive: true, force: true })
}).catch(error => { console.error(error); process.exitCode = 1 })
