"use strict"

const test = require("node:test")
const assert = require("node:assert/strict")
const { createSingleCaseImportBridgeBasePlan } = require("../src/domain/single-case-import-bridge")
const { caseFingerprintFor } = require("../src/domain/single-case-target")

const CASE_IMPORT_ID = "inss-0123456789abcdef0123"
const PVR = "PVR.260801.813"

function fixture() {
  return {
    inventory: { importId: CASE_IMPORT_ID, officialNumber: PVR },
    identityConfirmed: {
      schemaVersion: 1,
      caseImportId: CASE_IMPORT_ID,
      identityConfirmationApplied: true,
      safeToPlanHubSpot: true,
      reviewedInventory: { contents: [], physicalOccurrences: [] }
    },
    caseNumber: PVR,
    preflight: { ok: true, applicable: true, contactId: "contact-1", dealId: "deal-1", blockers: [] }
  }
}

test("PVR válido e preflight válido produzem basePlan preservando vínculos comprovados", () => {
  const input = fixture()
  const plan = createSingleCaseImportBridgeBasePlan(input)
  assert.equal(plan.caseImportId, CASE_IMPORT_ID)
  assert.equal(plan.caseNumber, PVR)
  assert.equal(plan.officialNumber, PVR)
  assert.equal(plan.dealPlan.caseNumber, PVR)
  assert.equal(plan.dealPlan.properties.numero_de_caso, PVR)
  assert.equal(plan.contactPlan.existingContactId, "contact-1")
  assert.equal(plan.dealPlan.existingDealId, "deal-1")
  assert.deepEqual(plan.existingResourcePolicy, { contact: "REQUIRE_EXISTING_UNIQUE", deal: "REQUIRE_EXISTING_UNIQUE", drive: "REQUIRE_EXISTING_LOGICAL_ID" })
  assert.equal(plan.safeToApply, false)
  assert.deepEqual(plan.pendingDependencies, ["OFFICIAL_RESERVATION_SYNCHRONIZATION_REQUIRED", "FINAL_SINGLE_CASE_PLAN_AND_CONTENT_MANIFEST_REQUIRED", "EXPLICIT_AUTHORIZATIONS_REQUIRED"])
})

test("reutiliza exclusivamente caseFingerprintFor e não recalcula o caseImportId", () => {
  const plan = createSingleCaseImportBridgeBasePlan(fixture())
  assert.equal(plan.caseFingerprint, caseFingerprintFor(CASE_IMPORT_ID))
  assert.notEqual(plan.caseFingerprint, caseFingerprintFor("inss-other-case"))
})

test("é pura e não acessa dependências externas", () => {
  const input = fixture(), before = structuredClone(input)
  const first = createSingleCaseImportBridgeBasePlan(input)
  const second = createSingleCaseImportBridgeBasePlan(input)
  assert.deepEqual(input, before)
  assert.deepEqual(first, second)
  assert.notEqual(first.identityConfirmed, input.identityConfirmed)
})

for (const [name, mutate, code] of [
  ["identidade não confirmada", value => { value.identityConfirmed.identityConfirmationApplied = false }, "IDENTITY_CONFIRMED_INVALID"],
  ["preflight inválido", value => { value.preflight.ok = false }, "PVR_PREFLIGHT_INVALID"],
  ["PVR divergente do inventário", value => { value.inventory.officialNumber = "PVR.260801.814" }, "PVR_INVENTORY_CASE_NUMBER_DIVERGENT"],
  ["contactId ausente", value => { value.preflight.contactId = "" }, "PVR_PREFLIGHT_CONTACT_ID_MISSING"],
  ["dealId ausente", value => { value.preflight.dealId = "" }, "PVR_PREFLIGHT_DEAL_ID_MISSING"],
  ["blockers residuais", value => { value.preflight.blockers = ["DEAL_NOT_FOUND"] }, "PVR_PREFLIGHT_BLOCKERS_REMAIN"],
  ["caso não PVR", value => { value.caseNumber = "PRV.260801.813"; value.inventory.officialNumber = value.caseNumber }, "PVR_CASE_NUMBER_REQUIRED"],
  ["caseImportId inválido", value => { value.inventory.importId = "../new-id" }, "CASE_IMPORT_ID_INVALID"],
  ["vínculo de identidade divergente", value => { value.identityConfirmed.caseImportId = "inss-other-case" }, "IDENTITY_CONFIRMED_INVALID"]
]) test(`falha fechado: ${name}`, () => {
  const input = fixture()
  mutate(input)
  assert.throws(() => createSingleCaseImportBridgeBasePlan(input), new RegExp(code))
})
