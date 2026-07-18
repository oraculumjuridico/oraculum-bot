"use strict"

const assert = require("node:assert/strict")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")
const command = require("../scripts/reconcile-existing-case-number-reservation")
const { fingerprint, SOURCE_KIND } = require("../src/domain/case-number-plan-sync")

const TARGET = Object.freeze({ label: "P1", caseImportId: "fictional-p1-import" })
const KEY = `case-import:${TARGET.caseImportId}`
const NUMBER = "PRV.260718.321"

function plan(overrides = {}) {
  const base = {
    caseImportId: TARGET.caseImportId,
    caseFingerprint: "abcdef123456",
    status: "PLANNED_NOT_EXECUTED",
    externalActionsExecuted: false,
    importExecuted: false,
    dealPlan: { caseNumber: NUMBER, properties: { area_juridica: "INSS" } },
    caseNumberReservationSync: {
      status: "SYNCHRONIZED",
      source: SOURCE_KIND,
      reservationKeyFingerprint: fingerprint(KEY),
    },
  }
  return { ...base, ...overrides }
}

function row(overrides = {}) {
  return { reservation_key: KEY, case_number: NUMBER, area: "INSS", status: "reserved", ...overrides }
}

function fakeDatabase({ initial = [], corruptPostInsert = false, insertFailure = null } = {}) {
  const records = initial.map(value => ({ ...value }))
  const log = []
  let transactionSnapshot = null
  const client = {
    async query(sql, params = []) {
      const text = String(sql).replace(/\s+/g, " ").trim()
      log.push(text)
      if (text === "BEGIN") { transactionSnapshot = records.map(value => ({ ...value })); return { rowCount: 0, rows: [] } }
      if (text === "COMMIT") { transactionSnapshot = null; return { rowCount: 0, rows: [] } }
      if (text === "ROLLBACK") {
        records.splice(0, records.length, ...(transactionSnapshot || []).map(value => ({ ...value })))
        transactionSnapshot = null
        return { rowCount: 0, rows: [] }
      }
      if (text.startsWith("SELECT reservation_key") && text.includes("WHERE reservation_key = $1")) {
        const found = records.filter(value => value.reservation_key === params[0])
        const rows = corruptPostInsert && !text.includes("FOR UPDATE") && found.length
          ? [{ ...found[0], status: "invalid" }]
          : found.map(value => ({ ...value }))
        return { rowCount: rows.length, rows }
      }
      if (text.startsWith("SELECT reservation_key") && text.includes("WHERE case_number = $1")) {
        const rows = records.filter(value => value.case_number === params[0]).map(value => ({ ...value }))
        return { rowCount: rows.length, rows }
      }
      if (text.startsWith("INSERT INTO case_number_reservations")) {
        if (insertFailure) throw insertFailure
        const inserted = row({ reservation_key: params[0], case_number: params[1], area: params[2] })
        records.push(inserted)
        return { rowCount: 1, rows: [{ ...inserted }] }
      }
      throw new Error(`unexpected SQL: ${text}`)
    },
    release() {},
  }
  return { client, records, log }
}

const schemaValidator = async () => ({ ok: true, codes: [] })

async function expectFailure({ database = fakeDatabase(), inputPlan = plan(), code, validator = schemaValidator }) {
  await assert.rejects(
    () => command.reconcile({ client: database.client, plan: inputPlan, schemaValidator: validator }),
    error => error.message === code && error.audit?.rollbackExecuted === true
  )
  assert(database.log.includes("ROLLBACK"))
  assert.equal(database.log.includes("COMMIT"), false)
  return database
}

async function testCreateExactReservation() {
  const database = fakeDatabase()
  const result = await command.reconcile({ client: database.client, plan: plan(), schemaValidator })
  assert.equal(result.result, "RESERVATION_CREATED_AND_VALIDATED")
  assert.equal(result.databaseWriteExecuted, true)
  assert.equal(database.records.length, 1)
  assert.deepEqual(database.records[0], row())
}

async function testIdempotentRetry() {
  const database = fakeDatabase({ initial: [row()] })
  const result = await command.reconcile({ client: database.client, plan: plan(), schemaValidator })
  assert.equal(result.result, "ALREADY_RECONCILED_AND_VALID")
  assert.equal(result.databaseWriteExecuted, false)
  assert.equal(database.log.some(sql => sql.startsWith("INSERT")), false)
}

async function testCaseNumberConflict() {
  await expectFailure({ database: fakeDatabase({ initial: [row({ reservation_key: "case-import:other" })] }), code: "CASE_NUMBER_CONFLICT" })
}

async function testReservationKeyConflict() {
  await expectFailure({ database: fakeDatabase({ initial: [row({ case_number: "PRV.260718.999" })] }), code: "RESERVATION_KEY_CONFLICT" })
}

async function testCaseImportBindingConflict() {
  await expectFailure({ inputPlan: plan({ caseImportId: "" }), code: "PLAN_BINDING_MISSING" })
}

async function testFingerprintBindingConflict() {
  const changed = plan()
  changed.caseNumberReservationSync = { ...changed.caseNumberReservationSync, reservationKeyFingerprint: "000000000000" }
  await expectFailure({ inputPlan: changed, code: "PLAN_FINGERPRINT_INVALID" })
}

async function testAreaConflict() {
  await expectFailure({ database: fakeDatabase({ initial: [row({ area: "Civil" })] }), code: "AREA_MISMATCH" })
}

async function testStatusConflict() {
  await expectFailure({ database: fakeDatabase({ initial: [row({ status: "invalid" })] }), code: "STATUS_MISMATCH" })
}

async function testPlanNumberMissing() {
  const changed = plan()
  changed.dealPlan = { ...changed.dealPlan, caseNumber: "PENDING_RESERVATION" }
  await expectFailure({ inputPlan: changed, code: "PLAN_RESERVED_NUMBER_MISSING" })
}

async function testPlanUnchanged() {
  const input = plan(), snapshot = structuredClone(input)
  await command.reconcile({ client: fakeDatabase().client, plan: input, schemaValidator })
  assert.deepEqual(input, snapshot)
}

async function testZeroExternalActions() {
  const result = await command.reconcile({ client: fakeDatabase().client, plan: plan(), schemaValidator })
  assert.equal(result.externalWritesExecuted, false)
  assert.equal(command.sanitizedOutput(result).EXTERNAL_WRITES_EXECUTED, false)
}

async function testRollbackOnFailure() {
  const database = fakeDatabase({ corruptPostInsert: true })
  await expectFailure({ database, code: "POST_INSERT_VALIDATION_FAILED" })
  assert.equal(database.records.length, 0)
}

async function testFailClosedExtras() {
  await expectFailure({ validator: async () => ({ ok: false }), code: "RESERVATION_SCHEMA_INVALID" })
  const input = plan(); input.dealPlan = { ...input.dealPlan, properties: { area_juridica: " INSS" } }
  await expectFailure({ inputPlan: input, code: "PLAN_AREA_MISSING" })
  const status = plan(); status.caseNumberReservationSync = { ...status.caseNumberReservationSync, status: "INVALID" }
  await expectFailure({ inputPlan: status, code: "PLAN_STATUS_INVALID" })
}

async function testMainEnvironmentAndSanitization() {
  await assert.rejects(() => command.main({ argv: [], env: {}, readFile: async () => "{}" }), /PLAN_PATH_MISSING/)
  await assert.rejects(() => command.main({ argv: ["--plan-path", "x.json"], env: {}, readFile: async () => "{}" }), /POSTGRES_MODE_REQUIRED/)
  await assert.rejects(() => command.main({ argv: ["--plan-path", "x.json"], env: { CASE_NUMBER_RESERVATION_MODE: "postgres", DATABASE_URL: "forbidden" }, readFile: async () => "{}" }), /POSTGRES_CONNECTION_REQUIRED/)
  const database = fakeDatabase(), outputs = []
  class PoolClass {
    async connect() { return database.client }
    async end() {}
  }
  const input = plan()
  const stateDir = path.join(process.cwd(), "fictional-state")
  const planPath = path.join(stateDir, "plans", "explicit.json")
  await command.main({
    argv: ["--plan-path", planPath],
    PoolClass,
    readFile: async () => JSON.stringify(input),
    output: value => outputs.push(value),
    env: { CASE_NUMBER_RESERVATION_MODE: "postgres", EXTERNAL_STATE_DATABASE_URL: "fake://credential", CASE_IMPORT_STATE_DIR: stateDir },
    schemaValidator,
  })
  const text = outputs.join("")
  assert.equal(text.includes(NUMBER), false)
  assert.equal(text.includes(TARGET.caseImportId), false)
  assert.equal(text.includes(KEY), false)
  assert.equal(text.includes("fake://credential"), false)
}

async function testNoHardcodedTargetIdentifier() {
  assert.equal(Object.hasOwn(command, "TARGET"), false)
  const source = fs.readFileSync(path.join(__dirname, "..", "scripts", "reconcile-existing-case-number-reservation.js"), "utf8")
  assert.equal(/caseImportId\s*:\s*["'][^"']+["']/.test(source), false)
}

async function testPlanPathRequired() {
  assert.throws(() => command.parseArgs([]), /PLAN_PATH_MISSING/)
}

async function testPlanFileNotFound() {
  const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), "oraculum-reconcile-missing-"))
  try {
    const missing = path.join(stateDir, "plans", "missing.json")
    const error = Object.assign(new Error("missing"), { code: "ENOENT" })
    await assert.rejects(() => command.main({ argv: ["--plan-path", missing], env: { CASE_NUMBER_RESERVATION_MODE: "postgres", EXTERNAL_STATE_DATABASE_URL: "fake://test", CASE_IMPORT_STATE_DIR: stateDir }, readFile: async () => { throw error } }), /PLAN_FILE_NOT_FOUND/)
  } finally { fs.rmSync(stateDir, { recursive: true, force: true }) }
}

async function testPlanParseInvalid() {
  const stateDir = path.join(process.cwd(), "fictional-state")
  const planPath = path.join(stateDir, "plans", "invalid.json")
  await assert.rejects(() => command.main({ argv: ["--plan-path", planPath], env: { CASE_NUMBER_RESERVATION_MODE: "postgres", EXTERNAL_STATE_DATABASE_URL: "fake://test", CASE_IMPORT_STATE_DIR: stateDir }, readFile: async () => "{" }), /PLAN_PARSE_INVALID/)
}

async function testPlanBindingMissing() {
  await expectFailure({ inputPlan: plan({ caseImportId: undefined }), code: "PLAN_BINDING_MISSING" })
}

async function testPlanFingerprintInvalid() {
  await expectFailure({ inputPlan: plan({ caseFingerprint: "invalid" }), code: "PLAN_FINGERPRINT_INVALID" })
}

async function testPlanReservedNumberMissing() {
  const input = plan(); input.dealPlan = { ...input.dealPlan, caseNumber: undefined }
  await expectFailure({ inputPlan: input, code: "PLAN_RESERVED_NUMBER_MISSING" })
}

const tests = [
  testCreateExactReservation,
  testIdempotentRetry,
  testCaseNumberConflict,
  testReservationKeyConflict,
  testCaseImportBindingConflict,
  testFingerprintBindingConflict,
  testAreaConflict,
  testStatusConflict,
  testPlanNumberMissing,
  testPlanUnchanged,
  testZeroExternalActions,
  testRollbackOnFailure,
  testFailClosedExtras,
  testMainEnvironmentAndSanitization,
  testNoHardcodedTargetIdentifier,
  testPlanPathRequired,
  testPlanFileNotFound,
  testPlanParseInvalid,
  testPlanBindingMissing,
  testPlanFingerprintInvalid,
  testPlanReservedNumberMissing,
]

Promise.resolve()
  .then(async () => { for (const test of tests) await test() })
  .then(() => console.log(`reconcile-existing-case-number-reservation.test.js: ${tests.length} tests passed`))
  .catch(error => { console.error(error); process.exitCode = 1 })
