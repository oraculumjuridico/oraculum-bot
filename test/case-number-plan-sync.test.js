"use strict"
const assert = require("node:assert/strict")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")
const {
  PENDING_NUMBER, RESERVATION_DEPENDENCY, SOURCE_KIND,
  validatePlanForCaseNumberSync, applyCaseNumberReservationToPlan
} = require("../src/domain/case-number-plan-sync")
const command = require("../scripts/sync-case-number-reservation-to-plan")

const CASE_ID = "fictional-import-001"
const NUMBER = "PRV.260715.123"
const plan = overrides => ({
  schemaVersion: 1, caseImportId: CASE_ID, safeToPlanHubSpot: true, safeToApply: false,
  pendingDependencies: [RESERVATION_DEPENDENCY, "EXPLICIT_APPLY_AUTHORIZATION", "EXTERNAL_WRITES_AUTHORIZATION"],
  dealPlan: { caseNumber: PENDING_NUMBER, properties: { area_juridica: "INSS" }, untouched: true },
  contactPlan: { untouched: true }, marker: "fictional", ...overrides
})
const reservation = overrides => ({ reservation_key: `case-import:${CASE_ID}`, case_number: NUMBER, area: "INSS", status: "reserved", ...overrides })
const source = overrides => ({ kind: SOURCE_KIND, verified: true, verifiedAt: "2026-07-15T12:00:00.000Z", ...overrides })

function domainTests() {
  const original = plan(), snapshot = structuredClone(original)
  const result = applyCaseNumberReservationToPlan({ plan: original, reservation: reservation(), source: source() })
  assert(result.changed); assert.equal(result.reused, false)
  assert.deepEqual(original, snapshot, "input must remain immutable")
  assert.equal(result.plan.dealPlan.caseNumber, NUMBER)
  assert.equal(result.plan.dealPlan.properties.numero_de_caso, NUMBER)
  assert.equal(result.plan.pendingDependencies.includes(RESERVATION_DEPENDENCY), false)
  assert.deepEqual(result.plan.pendingDependencies, ["EXPLICIT_APPLY_AUTHORIZATION", "EXTERNAL_WRITES_AUTHORIZATION"])
  assert.equal(result.plan.safeToApply, false); assert(result.plan.safeToPlanHubSpot)
  assert(result.plan.contactPlan.untouched); assert(result.plan.dealPlan.untouched)
  assert.equal(result.plan.caseNumberReservationSync.source, SOURCE_KIND)
  assert.equal(result.plan.caseNumberReservationSync.reservationKeyFingerprint.length, 12)
  assert.equal(JSON.stringify(result.plan).includes(`case-import:${CASE_ID}`), false)

  const repeated = applyCaseNumberReservationToPlan({ plan: result.plan, reservation: reservation(), source: source({ verifiedAt: "2026-07-16T12:00:00.000Z" }) })
  assert.equal(repeated.changed, false); assert.equal(repeated.reused, true); assert.deepEqual(repeated.plan, result.plan)

  assert.throws(() => applyCaseNumberReservationToPlan({ plan: plan(), reservation: reservation({ reservation_key: "case-import:other" }), source: source() }), /RESERVATION_KEY_MISMATCH/)
  assert.throws(() => applyCaseNumberReservationToPlan({ plan: plan(), reservation: reservation({ case_number: "invalid" }), source: source() }), /RESERVATION_NUMBER_INVALID/)
  assert.throws(() => applyCaseNumberReservationToPlan({ plan: plan(), reservation: reservation({ status: "released" }), source: source() }), /RESERVATION_STATUS_INVALID/)
  assert.throws(() => applyCaseNumberReservationToPlan({ plan: plan(), reservation: reservation({ area: "Civil" }), source: source() }), /RESERVATION_AREA_MISMATCH/)
  assert.throws(() => applyCaseNumberReservationToPlan({ plan: plan(), reservation: reservation(), source: source({ verified: false }) }), /RESERVATION_SOURCE_INVALID/)
  assert.throws(() => applyCaseNumberReservationToPlan({ plan: plan({ safeToPlanHubSpot: false }), reservation: reservation(), source: source() }), /PLAN_NOT_SAFE_TO_PLAN/)
  assert.throws(() => applyCaseNumberReservationToPlan({ plan: plan({ safeToApply: true }), reservation: reservation(), source: source() }), /SAFE_TO_APPLY/)
  assert.throws(() => applyCaseNumberReservationToPlan({ plan: plan({ pendingDependencies: ["EXPLICIT_APPLY_AUTHORIZATION"] }), reservation: reservation(), source: source() }), /DEPENDENCY_INCONSISTENT/)
  assert.throws(() => applyCaseNumberReservationToPlan({ plan: plan({ dealPlan: { caseNumber: "PRV.260715.999", properties: {} }, pendingDependencies: [] }), reservation: reservation(), source: source() }), /PLAN_CASE_NUMBER_CONFLICT/)
  assert.equal(validatePlanForCaseNumberSync(plan()).valid, true)
}

const columns = [
  ["reservation_key", "text", "NO", null], ["case_number", "text", "NO", null], ["area", "text", "NO", null],
  ["status", "text", "NO", "'reserved'::text"], ["created_at", "timestamp with time zone", "NO", "CURRENT_TIMESTAMP"]
].map(([column_name, data_type, is_nullable, column_default]) => ({ column_name, data_type, is_nullable, column_default }))
const keys = [{ constraint_type: "PRIMARY KEY", columns: ["reservation_key"] }, { constraint_type: "UNIQUE", columns: ["case_number"] }]
const checks = [
  { conname: "n", expression: "(case_number ~ '^[A-Z]{2,4}\\.[0-9]{6}\\.[0-9]{3}$'::text)", columns: ["case_number"] },
  { conname: "s", expression: "(status = 'reserved'::text)", columns: ["status"] },
  { conname: "a", expression: "((area = btrim(area)) AND (char_length(area) >= 1) AND (char_length(area) <= 80))", columns: ["area"] }
]
function fakePool(log) {
  const client = { async query(sql) {
    const text = String(sql); log.push(text.trim().replace(/\s+/g, " "))
    if (["BEGIN", "SET TRANSACTION READ ONLY", "ROLLBACK"].includes(text)) return { rowCount: 0, rows: [] }
    if (text.includes("information_schema.columns")) return { rowCount: 5, rows: columns }
    if (text.includes("information_schema.table_constraints")) return { rowCount: 2, rows: keys }
    if (text.includes("FROM pg_constraint")) return { rowCount: 3, rows: checks }
    throw new Error("unexpected query")
  }, release() { log.push("RELEASE") } }
  return class { async connect() { return client } async end() { log.push("END") } }
}

async function commandTests() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "oraculum-plan-sync-")), file = path.join(root, "fictional-plan.json")
  try {
    fs.writeFileSync(file, JSON.stringify(plan()))
    const log = [], output = [], env = { CASE_NUMBER_RESERVATION_MODE: "postgres", EXTERNAL_STATE_DATABASE_URL: "fake://test", CASE_IMPORT_STATE_DIR: root }
    const adapterFactory = () => ({ isTestAdapter: false, findByKey: async key => { assert.equal(key, `case-import:${CASE_ID}`); return reservation() } })
    const verified = await command.main({ argv: ["--plan", file, "--verify"], env, PoolClass: fakePool(log), output: value => output.push(value), adapterFactory, now: () => source().verifiedAt })
    assert(verified.readOnly); assert(verified.wouldChange); assert.deepEqual(JSON.parse(fs.readFileSync(file)), plan())
    assert(log.includes("BEGIN")); assert(log.includes("SET TRANSACTION READ ONLY")); assert(log.includes("ROLLBACK"))
    const synced = await command.main({ argv: ["--plan", file], env, PoolClass: fakePool([]), output: value => output.push(value), adapterFactory, now: () => source().verifiedAt })
    assert(synced.changed); assert.equal(JSON.parse(fs.readFileSync(file)).dealPlan.caseNumber, NUMBER)
    const repeated = await command.main({ argv: ["--plan", file], env, PoolClass: fakePool([]), output: value => output.push(value), adapterFactory, now: () => "2026-07-16T00:00:00.000Z" })
    assert.equal(repeated.changed, false); assert(repeated.reused)
    assert.equal(output.join("").includes("fake://test"), false); assert.equal(output.join("").includes(CASE_ID), false)
    await assert.rejects(() => command.main({ argv: ["--plan", file], env: {}, PoolClass: fakePool([]), output() {} }), /POSTGRES_MODE_REQUIRED/)
    await assert.rejects(() => command.main({ argv: ["--plan", file], env, PoolClass: fakePool([]), output() {}, adapterFactory: () => ({ isTestAdapter: true }) }), /TEST_ADAPTER_FORBIDDEN/)
    assert.throws(() => command.resolvePlanPath(path.join(root, "..", "outside.json"), root), /OUTSIDE_STATE_DIR/)
    assert.equal(command.parseArgs([`--plan=${file}`]).plan, file)
  } finally { fs.rmSync(root, { recursive: true, force: true }) }
}

async function atomicWriteFailureTest() {
  const writes = [], unlinks = []
  const io = { writeFile: async file => writes.push(file), rename: async () => { throw new Error("fictitious rename failure") }, unlink: async file => unlinks.push(file) }
  await assert.rejects(() => command.atomicWriteJson("fictional.json", plan(), io), /fictitious rename failure/)
  assert.equal(writes.length, 1); assert.deepEqual(unlinks, writes)
}

Promise.resolve().then(domainTests).then(commandTests).then(atomicWriteFailureTest)
  .then(() => console.log("case-number-plan-sync.test.js: ok"))
  .catch(error => { console.error(error); process.exitCode = 1 })
