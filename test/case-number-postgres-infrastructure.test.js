"use strict"
const assert = require("node:assert/strict")
const { createPostgresAdapter, createService } = require("../src/domain/case-number")
const { validateCaseNumberReservationSchema, migrateCaseNumberReservations } = require("../src/infrastructure/case-number-reservations-postgres")
const reserveCommand = require("../scripts/reserve-case-number")

const columns = overrides => [
  ["reservation_key", "text", "NO", null], ["case_number", "text", "NO", null],
  ["area", "text", "NO", null], ["status", "text", "NO", "'reserved'::text"],
  ["created_at", "timestamp with time zone", "NO", "CURRENT_TIMESTAMP"]
].map(([column_name, data_type, is_nullable, column_default]) => ({ column_name, data_type, is_nullable, column_default, ...(overrides?.[column_name] || {}) }))
const constraints = [
  { constraint_type: "PRIMARY KEY", columns: ["reservation_key"] },
  { constraint_type: "UNIQUE", columns: ["case_number"] }
]
function schemaPool(cols = columns(), cons = constraints) {
  return { query: async sql => String(sql).includes("information_schema.columns") ? { rowCount: cols.length, rows: cols } : { rowCount: cons.length, rows: cons } }
}

function memoryPool() {
  const byKey = new Map(), byNumber = new Map()
  const client = { async query(sql, params = []) {
    const text = String(sql).replace(/\s+/g, " ").trim()
    if (["BEGIN", "COMMIT", "ROLLBACK"].includes(text)) return { rowCount: 0, rows: [] }
    if (text.startsWith("INSERT INTO case_number_reservations")) {
      const [key, numero, area] = params
      if (byKey.has(key)) return { rowCount: 0, rows: [] }
      if (byNumber.has(numero)) { const e = new Error("unique"); e.code = "23505"; e.constraint = "case_number_reservations_case_number_key"; throw e }
      const row = { reservation_key: key, case_number: numero, area, created_at: new Date() }
      byKey.set(key, row); byNumber.set(numero, row); return { rowCount: 1, rows: [row] }
    }
    if (text.includes("WHERE reservation_key=$1")) { const row = byKey.get(params[0]); return { rowCount: row ? 1 : 0, rows: row ? [row] : [] } }
    if (text.includes("WHERE case_number=$1")) { const row = byNumber.get(params[0]); return { rowCount: row ? 1 : 0, rows: row ? [row] : [] } }
    if (text.startsWith("DELETE")) { const row = byKey.get(params[0]); if (row) { byKey.delete(params[0]); byNumber.delete(row.case_number) }; return { rowCount: row ? 1 : 0, rows: [] } }
    throw new Error(`unexpected SQL: ${text}`)
  }, release() {} }
  return { connect: async () => client, query: client.query.bind(client), byKey, byNumber }
}

async function adapterTests() {
  const pool = memoryPool(), adapter = createPostgresAdapter({ pool })
  const candidates = ["PRV.260714.001", "PRV.260714.001", "PRV.260714.002"]
  const service = createService(adapter, { generate: () => candidates.shift() })
  const first = await service.reserve({ key: "case:a", area: "INSS" })
  assert.equal((await service.reserve({ key: "case:a", area: "INSS" })).numero, first.numero)
  assert.equal((await service.reserve({ key: "case:b", area: "INSS" })).numero, "PRV.260714.002")
  const [a, b] = await Promise.all([
    adapter.reserve({ key: "case:c", numero: "PRV.260714.003", area: "INSS" }),
    adapter.reserve({ key: "case:c", numero: "PRV.260714.004", area: "INSS" })
  ])
  assert.equal(a.numero, b.numero); assert.equal(pool.byKey.get("case:c").case_number, a.numero)
  assert.equal((await adapter.release({ key: "case:b" })).released, true); assert(pool.byKey.has("case:a"))
  assert.equal((await createService(adapter, { generate: () => "PRV.260714.002" }).reserve({ key: "case:b", area: "INSS" })).numero, "PRV.260714.002")
  const errorPool = { connect: async () => ({ query: async sql => { if (sql === "BEGIN") return {}; const e = new Error("permission denied"); e.code = "42501"; throw e }, release() {} }) }
  await assert.rejects(() => createPostgresAdapter({ pool: errorPool }).reserve({ key: "x", numero: "PRV.260714.099", area: "INSS" }), /permission denied/)
  const exhausted = await createService({ findByKey: async () => null, findByNumber: async () => ({}) }, { maxAttempts: 2, generate: () => "PRV.260714.999" }).reserve({ key: "x", area: "INSS" })
  assert.equal(exhausted.error, "no_available_candidate")
}

async function schemaTests() {
  assert((await validateCaseNumberReservationSchema(schemaPool())).ok)
  assert.deepEqual((await validateCaseNumberReservationSchema(schemaPool([]))).codes, ["TABLE_MISSING"])
  assert((await validateCaseNumberReservationSchema(schemaPool(columns().filter(x => x.column_name !== "area")))).codes.includes("COLUMN_MISSING"))
  assert((await validateCaseNumberReservationSchema(schemaPool(columns({ area: { data_type: "integer" } })))).codes.includes("COLUMN_TYPE_MISMATCH"))
  assert((await validateCaseNumberReservationSchema(schemaPool(columns({ area: { is_nullable: "YES" } })))).codes.includes("NOT_NULL_MISSING"))
  assert((await validateCaseNumberReservationSchema(schemaPool(columns({ status: { column_default: null } })))).codes.includes("DEFAULT_MISMATCH"))
  assert((await validateCaseNumberReservationSchema(schemaPool(columns(), constraints.slice(1)))).codes.includes("PRIMARY_KEY_MISMATCH"))
  assert((await validateCaseNumberReservationSchema(schemaPool(columns(), constraints.slice(0, 1)))).codes.includes("UNIQUE_CONSTRAINT_MISSING"))
}

function migrationPool(incompatible = false) {
  let migrated = false, creates = 0
  const client = { async query(sql) {
    const text = String(sql)
    if (["BEGIN", "COMMIT", "ROLLBACK"].includes(text)) return { rowCount: 0, rows: [] }
    if (text.includes("to_regclass")) return { rowCount: 1, rows: [{ table_name: "oraculum_state_migrations" }] }
    if (text.startsWith("SELECT migration_id")) return { rowCount: migrated ? 1 : 0, rows: migrated ? [{}] : [] }
    if (text.includes("CREATE TABLE IF NOT EXISTS")) { creates++; return { rowCount: 0, rows: [] } }
    if (text.includes("information_schema.columns")) { const rows = incompatible ? columns({ area: { data_type: "integer" } }) : columns(); return { rowCount: rows.length, rows } }
    if (text.includes("information_schema.table_constraints")) return { rowCount: 2, rows: constraints }
    if (text.startsWith("INSERT INTO oraculum_state_migrations")) { migrated = true; return { rowCount: 1, rows: [] } }
    throw new Error("unexpected migration SQL")
  }, release() {} }
  return { connect: async () => client, state: () => ({ migrated, creates }) }
}
async function migrationTests() {
  const pool = migrationPool()
  assert((await migrateCaseNumberReservations(pool)).applied)
  assert.equal((await migrateCaseNumberReservations(pool)).applied, false)
  assert.deepEqual(pool.state(), { migrated: true, creates: 1 })
  await assert.rejects(() => migrateCaseNumberReservations(migrationPool(true)), /SCHEMA_INCOMPATIBLE/)
}

async function commandTests() {
  assert.throws(() => reserveCommand.parseArgs([]), /INVALID_CASE_IMPORT_ID/)
  assert.throws(() => reserveCommand.parseArgs(["--case-import-id", "fake-id", "--area", " INSS"]), /INVALID_AREA/)
  class FakePool {
    constructor() { this.memory = memoryPool() }
    query(sql, params) { if (String(sql).includes("information_schema.columns")) return Promise.resolve({ rowCount: 5, rows: columns() }); if (String(sql).includes("information_schema.table_constraints")) return Promise.resolve({ rowCount: 2, rows: constraints }); return this.memory.query(sql, params) }
    connect() { return this.memory.connect() } async end() {}
  }
  await assert.rejects(() => reserveCommand.main({ argv: ["--case-import-id", "fake-id", "--area", "INSS"], env: {}, PoolClass: FakePool, output() {} }), /POSTGRES_MODE_REQUIRED/)
  await assert.rejects(() => reserveCommand.main({ argv: ["--case-import-id", "fake-id", "--area", "INSS"], env: { CASE_NUMBER_RESERVATION_MODE: "postgres", EXTERNAL_STATE_DATABASE_URL: "fake://test" }, PoolClass: FakePool, output() {}, adapterFactory: () => ({ isTestAdapter: true }) }), /TEST_ADAPTER_FORBIDDEN/)
  const output = []
  const result = await reserveCommand.main({ argv: ["--case-import-id", "fake-id", "--area", "INSS"], env: { CASE_NUMBER_RESERVATION_MODE: "postgres", EXTERNAL_STATE_DATABASE_URL: "fake://test" }, PoolClass: FakePool, output: x => output.push(x), serviceFactory: adapter => createService(adapter, { generate: () => "PRV.260714.010" }) })
  assert(result.ok); assert(!output.join("").includes("fake://test")); assert(!output.join("").includes("fake-id"))
}

Promise.resolve().then(adapterTests).then(schemaTests).then(migrationTests).then(commandTests)
  .then(() => console.log("case-number-postgres-infrastructure.test.js: ok"))
  .catch(error => { console.error(error); process.exitCode = 1 })
