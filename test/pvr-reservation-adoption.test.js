"use strict"

const test = require("node:test")
const assert = require("node:assert/strict")
const { adoptExistingPvrReservation } = require("../src/infrastructure/case-number-reservations-postgres")
const { createSingleCaseImportBridgeBasePlan, synchronizePvrAdoptionToBasePlan } = require("../src/domain/single-case-import-bridge")

const CASE_IMPORT_ID = "inss-0123456789abcdef0123"
const OTHER_CASE_IMPORT_ID = "inss-fedcba9876543210fedc"
const PVR = "PVR.260801.813"
const OTHER_PVR = "PVR.260801.814"
const schema = async () => ({ ok: true, codes: [] })

function memoryPool(rows = []) {
  const byKey = new Map(), byNumber = new Map(), calls = []
  for (const row of rows) { byKey.set(row.reservation_key, row); byNumber.set(row.case_number, row) }
  const client = { async query(sql, params = []) {
    const text = String(sql).replace(/\s+/g, " ").trim(); calls.push({ text, params })
    if (["BEGIN", "COMMIT", "ROLLBACK"].includes(text)) return { rowCount: 0, rows: [] }
    if (text.startsWith("SELECT reservation_key") && text.includes("WHERE reservation_key=$1 FOR UPDATE")) { const row = byKey.get(params[0]); return { rowCount: row ? 1 : 0, rows: row ? [row] : [] } }
    if (text.startsWith("SELECT reservation_key") && text.includes("WHERE case_number=$1 FOR UPDATE")) { const row = byNumber.get(params[0]); return { rowCount: row ? 1 : 0, rows: row ? [row] : [] } }
    if (text.startsWith("INSERT INTO case_number_reservations")) {
      const [key, number, area] = params
      if (byKey.has(key) || byNumber.has(number)) return { rowCount: 0, rows: [] }
      const row = { reservation_key: key, case_number: number, area, status: "reserved" }
      byKey.set(key, row); byNumber.set(number, row)
      return { rowCount: 1, rows: [row] }
    }
    throw new Error(`UNEXPECTED_SQL:${text}`)
  }, release() {} }
  return { connect: async () => client, byKey, byNumber, calls }
}

const record = (key, number) => ({ reservation_key: key, case_number: number, area: "INSS", status: "reserved" })

test("adota exatamente PVR livre para chave inexistente", async () => {
  const db = memoryPool()
  const result = await adoptExistingPvrReservation({ pool: db, caseImportId: CASE_IMPORT_ID, caseNumber: PVR, validateSchema: schema })
  assert.deepEqual(result, { reservation: record(`case-import:${CASE_IMPORT_ID}`, PVR), created: true, reused: false })
  assert.equal(db.byKey.size, 1); assert.equal(db.byNumber.size, 1)
  assert(db.calls.some(call => call.text.includes("FOR UPDATE")))
  assert.equal(db.calls.some(call => /generateCandidate|^DELETE|^UPDATE/i.test(call.text)), false)
})

test("mesma chave e mesmo PVR é idempotente, inclusive quando localizado pelo número", async () => {
  const db = memoryPool([record(`case-import:${CASE_IMPORT_ID}`, PVR)])
  const result = await adoptExistingPvrReservation({ pool: db, caseImportId: CASE_IMPORT_ID, caseNumber: PVR, validateSchema: schema })
  assert.equal(result.created, false); assert.equal(result.reused, true)
  assert.equal(db.calls.some(call => call.text.startsWith("INSERT")), false)
})

for (const [name, rows, caseImportId, caseNumber, code] of [
  ["chave associada a outro número", [record(`case-import:${CASE_IMPORT_ID}`, OTHER_PVR)], CASE_IMPORT_ID, PVR, "PVR_ADOPTION_KEY_CONFLICT"],
  ["PVR associado a outra chave", [record(`case-import:${OTHER_CASE_IMPORT_ID}`, PVR)], CASE_IMPORT_ID, PVR, "PVR_ADOPTION_NUMBER_CONFLICT"],
  ["estado incompatível", [{ ...record(`case-import:${CASE_IMPORT_ID}`, PVR), status: "released" }], CASE_IMPORT_ID, PVR, "PVR_ADOPTION_STATE_INVALID"],
  ["PVR inválido", [], CASE_IMPORT_ID, "PRV.260801.813", "PVR_CASE_NUMBER_INVALID"],
  ["caseImportId inválido", [], "../new-id", PVR, "CASE_IMPORT_ID_INVALID"]
]) test(`falha fechado: ${name}`, async () => {
  await assert.rejects(() => adoptExistingPvrReservation({ pool: memoryPool(rows), caseImportId, caseNumber, validateSchema: schema }), new RegExp(code))
})

test("concorrência pelo mesmo PVR resulta em uma única associação", async () => {
  const db = memoryPool()
  const [first, second] = await Promise.allSettled([
    adoptExistingPvrReservation({ pool: db, caseImportId: CASE_IMPORT_ID, caseNumber: PVR, validateSchema: schema }),
    adoptExistingPvrReservation({ pool: db, caseImportId: OTHER_CASE_IMPORT_ID, caseNumber: PVR, validateSchema: schema })
  ])
  assert.equal(db.byNumber.size, 1)
  assert.equal([first, second].filter(item => item.status === "fulfilled").length, 1)
  assert.equal([first, second].filter(item => item.status === "rejected").length, 1)
  assert.match(String([first, second].find(item => item.status === "rejected").reason), /PVR_ADOPTION_NUMBER_CONFLICT|PVR_ADOPTION_CONFLICT/)
})

test("sincroniza a adoção no basePlan sem autorizar execução", () => {
  const basePlan = createSingleCaseImportBridgeBasePlan({
    inventory: { importId: CASE_IMPORT_ID, officialNumber: PVR },
    identityConfirmed: { schemaVersion: 1, caseImportId: CASE_IMPORT_ID, identityConfirmationApplied: true, safeToPlanHubSpot: true, reviewedInventory: { contents: [], physicalOccurrences: [] } },
    caseNumber: PVR,
    preflight: { ok: true, applicable: true, contactId: "contact-1", dealId: "deal-1", blockers: [] }
  })
  const result = synchronizePvrAdoptionToBasePlan({ basePlan, reservation: record(`case-import:${CASE_IMPORT_ID}`, PVR) })
  assert.equal(result.plan.caseImportId, CASE_IMPORT_ID)
  assert.equal(result.plan.caseNumber, PVR)
  assert.deepEqual(result.plan.caseNumberReservationSync, { source: "OFFICIAL_POSTGRES_RESERVATION", status: "SYNCHRONIZED", reservationKey: `case-import:${CASE_IMPORT_ID}`, caseNumber: PVR })
  assert.equal(result.plan.safeToApply, false)
  assert.equal(result.plan.pendingDependencies.includes("OFFICIAL_RESERVATION_SYNCHRONIZATION_REQUIRED"), false)
  assert.equal(synchronizePvrAdoptionToBasePlan({ basePlan: result.plan, reservation: record(`case-import:${CASE_IMPORT_ID}`, PVR) }).reused, true)
})
