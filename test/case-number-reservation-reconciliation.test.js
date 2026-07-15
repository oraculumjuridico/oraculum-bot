"use strict"
const assert = require("node:assert/strict")
const {
  MIGRATION_ID, RECONCILIATION_MIGRATION_ID, CHECKS,
  validateCaseNumberReservationSchema, planCaseNumberReservationReconciliation,
  reconcileCaseNumberReservations
} = require("../src/infrastructure/case-number-reservations-postgres")
const migrationCommand = require("../scripts/migrate-case-number-reservations")

const columns = [
  ["reservation_key", "text", "NO", null], ["case_number", "text", "NO", null], ["area", "text", "NO", null],
  ["status", "text", "NO", "'reserved'::text"], ["created_at", "timestamp with time zone", "NO", "CURRENT_TIMESTAMP"]
].map(([column_name, data_type, is_nullable, column_default]) => ({ column_name, data_type, is_nullable, column_default }))
const keys = [{ constraint_type: "PRIMARY KEY", columns: ["reservation_key"] }, { constraint_type: "UNIQUE", columns: ["case_number"] }]
const expressions = {
  case_number: "(case_number ~ '^[A-Z]{2,4}\\.[0-9]{6}\\.[0-9]{3}$'::text)",
  status: "(status = 'reserved'::text)",
  area: "((area = btrim(area)) AND (char_length(area) >= 1) AND (char_length(area) <= 80))"
}
const rowFor = column => ({ conname: CHECKS[column].name, expression: expressions[column], columns: [column] })

function fakeDatabase({ initialChecks = [], incompatible = false, data = {}, v2Recorded = false } = {}) {
  const state = { checks: [...initialChecks], v1Recorded: false, v2Recorded, statements: [], commits: 0, rollbacks: 0, migrationInserts: [] }
  const client = { async query(sql, params = []) {
    const text = String(sql).replace(/\s+/g, " ").trim(); state.statements.push(text)
    if (text === "BEGIN") return { rowCount: 0, rows: [] }
    if (text === "COMMIT") { state.commits++; return { rowCount: 0, rows: [] } }
    if (text === "ROLLBACK") { state.rollbacks++; return { rowCount: 0, rows: [] } }
    if (text === "SET TRANSACTION READ ONLY") return { rowCount: 0, rows: [] }
    if (text.includes("information_schema.columns")) { const rows = incompatible ? columns.map(row => row.column_name === "area" ? { ...row, data_type: "integer" } : row) : columns; return { rowCount: rows.length, rows } }
    if (text.includes("information_schema.table_constraints")) return { rowCount: keys.length, rows: keys }
    if (text.includes("FROM pg_constraint")) return { rowCount: state.checks.length, rows: [...state.checks] }
    if (text.startsWith("SELECT COUNT(*) FILTER") && text.includes("invalid_number")) return { rowCount: 1, rows: [{ invalid_number: data.invalidNumber || 0, invalid_status: data.invalidStatus || 0, invalid_area: data.invalidArea || 0, duplicate_keys: data.duplicateKeys || 0, duplicate_numbers: data.duplicateNumbers || 0 }] }
    if (text.includes("to_regclass('oraculum_state_migrations')")) return { rowCount: 1, rows: [{ table_name: "oraculum_state_migrations" }] }
    if (text.startsWith("SELECT migration_id")) {
      const found = params[0] === MIGRATION_ID ? state.v1Recorded : state.v2Recorded
      return { rowCount: found ? 1 : 0, rows: found ? [{ migration_id: params[0] }] : [] }
    }
    if (text.startsWith("ALTER TABLE")) {
      const column = Object.keys(CHECKS).find(key => text.includes(CHECKS[key].name)); state.checks.push(rowFor(column)); return { rowCount: 0, rows: [] }
    }
    if (text.startsWith("INSERT INTO oraculum_state_migrations")) {
      state.migrationInserts.push(params[0]); if (params[0] === MIGRATION_ID) state.v1Recorded = true; if (params[0] === RECONCILIATION_MIGRATION_ID) state.v2Recorded = true
      return { rowCount: 1, rows: [] }
    }
    throw new Error(`unexpected SQL: ${text}`)
  }, release() {} }
  return { connect: async () => client, query: client.query.bind(client), end: async () => {}, client, state }
}

async function validationTests() {
  const full = fakeDatabase({ initialChecks: Object.keys(CHECKS).map(rowFor) })
  assert.equal((await validateCaseNumberReservationSchema(full)).ok, true)
  for (const [column, expected] of Object.entries(CHECKS)) {
    const missing = fakeDatabase({ initialChecks: Object.keys(CHECKS).filter(key => key !== column).map(rowFor) })
    assert((await validateCaseNumberReservationSchema(missing)).codes.includes(expected.missing))
    const permissive = fakeDatabase({ initialChecks: Object.keys(CHECKS).map(key => key === column ? { ...rowFor(key), expression: `${key} IS NOT NULL` } : rowFor(key)) })
    assert((await validateCaseNumberReservationSchema(permissive)).codes.includes(expected.mismatch))
  }
  const alternateNames = Object.keys(CHECKS).map(column => ({ ...rowFor(column), conname: `alternate_${column}` }))
  assert.equal((await validateCaseNumberReservationSchema(fakeDatabase({ initialChecks: alternateNames }))).ok, true)
  const conflicting = fakeDatabase({ initialChecks: [...Object.keys(CHECKS).map(rowFor), { conname: "permissive", expression: "status IS NOT NULL", columns: ["status"] }] })
  assert((await validateCaseNumberReservationSchema(conflicting)).codes.includes("STATUS_CHECK_MISMATCH"))
}

async function planTests() {
  const legacy = fakeDatabase()
  const plan = await planCaseNumberReservationReconciliation(legacy)
  assert.equal(plan.classification, "LEGACY_RECONCILABLE"); assert.equal(plan.additions.length, 3)
  assert.equal((await planCaseNumberReservationReconciliation(fakeDatabase({ incompatible: true }))).classification, "INCOMPATIBLE")
  for (const [field, code] of [["invalidNumber", "INVALID_CASE_NUMBER_DATA"], ["invalidStatus", "INVALID_STATUS_DATA"], ["invalidArea", "INVALID_AREA_DATA"]]) {
    const invalid = await planCaseNumberReservationReconciliation(fakeDatabase({ data: { [field]: 1 } }))
    assert.equal(invalid.classification, "INCOMPATIBLE_DATA"); assert(invalid.codes.includes(code))
  }
}

async function reconciliationTests() {
  for (const data of [{}, { validRows: 2 }]) {
    const db = fakeDatabase({ data })
    const result = await reconcileCaseNumberReservations(db)
    assert(result.applied); assert.equal(db.state.checks.length, 3); assert.equal(db.state.commits, 1)
    assert.deepEqual(db.state.migrationInserts, [RECONCILIATION_MIGRATION_ID])
    assert.equal(db.state.statements.some(sql => /\b(UPDATE|DELETE)\b/.test(sql)), false)
    const again = await reconcileCaseNumberReservations(db)
    assert.equal(again.applied, false); assert.equal(db.state.checks.length, 3)
  }
  const invalid = fakeDatabase({ data: { invalidNumber: 1 } })
  await assert.rejects(() => reconcileCaseNumberReservations(invalid), /RECONCILIATION_BLOCKED/)
  assert.equal(invalid.state.statements.some(sql => sql.startsWith("ALTER TABLE")), false); assert.equal(invalid.state.rollbacks, 1)
  const failure = fakeDatabase(); const original = failure.client.query.bind(failure.client)
  failure.client.query = async (sql, params) => String(sql).startsWith("ALTER TABLE") ? Promise.reject(new Error("fictitious ddl failure")) : original(sql, params)
  await assert.rejects(() => reconcileCaseNumberReservations(failure), /fictitious ddl failure/); assert.equal(failure.state.rollbacks, 1); assert.deepEqual(failure.state.migrationInserts, [])
}

async function commandTests() {
  assert.equal(migrationCommand.parseMode([]), "install"); assert.equal(migrationCommand.parseMode(["--verify"]), "verify"); assert.equal(migrationCommand.parseMode(["--reconcile"]), "reconcile")
  assert.throws(() => migrationCommand.parseMode(["--verify", "--reconcile"]), /INVALID_MIGRATION_MODE/)
  const db = fakeDatabase({ initialChecks: Object.keys(CHECKS).map(rowFor) }), output = []
  const verify = await migrationCommand.main({ argv: ["--verify"], env: { CASE_NUMBER_RESERVATION_MODE: "postgres", EXTERNAL_STATE_DATABASE_URL: "fake://only" }, PoolClass: class { constructor() { return db } }, output: value => output.push(value) })
  assert(verify.ok); assert(db.state.statements.includes("SET TRANSACTION READ ONLY")); assert.equal(db.state.statements.some(sql => sql.startsWith("ALTER TABLE")), false)
  assert.equal(output.join("").includes("fake://only"), false)
  const calls = []
  await migrationCommand.main({ argv: ["--reconcile"], env: { CASE_NUMBER_RESERVATION_MODE: "postgres", EXTERNAL_STATE_DATABASE_URL: "fake://only" }, PoolClass: class { constructor() { return fakeDatabase() } }, output() {}, operations: { reconcile: async () => { calls.push("reconcile"); return { migrationId: RECONCILIATION_MIGRATION_ID, applied: true, schema: { ok: true } } } } })
  assert.deepEqual(calls, ["reconcile"])
}

Promise.resolve().then(validationTests).then(planTests).then(reconciliationTests).then(commandTests)
  .then(() => console.log("case-number-reservation-reconciliation.test.js: ok"))
  .catch(error => { console.error(error); process.exitCode = 1 })
