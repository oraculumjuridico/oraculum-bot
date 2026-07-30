const assert = require("node:assert/strict")
const {
  PLAN_STATUS,
  createCanonicalCasePlan,
  validateCanonicalCasePlan,
  assertCanonicalCasePlanReady
} = require("../src/domain/canonical-case-plan")

const ready = createCanonicalCasePlan({
  source: "test",
  identity: { name: "Cliente Teste", cpf: "***", provenance: { cpf: "human_confirmed" } },
  contact: { action: "update", id: "contact-test" },
  deal: { action: "update", id: "deal-test" },
  association: { verified: true },
  caseNumber: { value: "CASE.TEST.001" },
  documents: {
    received: [{ sha256: "a".repeat(64), name: "doc.jpg", partyRole: "titular", status: "approved" }]
  },
  drive: { canonicalFolderId: "folder-test" },
  hubspot: { contactUpdates: { firstname: "Cliente" }, dealUpdates: { numero_de_caso: "CASE.TEST.001" } }
})
assert.equal(ready.status, PLAN_STATUS.READY)
assert.deepEqual(validateCanonicalCasePlan(ready), { ok: true, errors: [] })
assert.equal(assertCanonicalCasePlanReady(ready), true)

const blocked = createCanonicalCasePlan({
  source: "test",
  identity: { name: "Cliente Teste", phone: "masked" },
  caseNumber: { value: "CASE.TEST.002" },
  documents: { received: [{ name: "unknown.jpg", status: "quarantined" }] }
})
assert.equal(blocked.status, PLAN_STATUS.REVIEW_REQUIRED)
assert.throws(() => assertCanonicalCasePlanReady(blocked), error => error.code === "CANONICAL_CASE_PLAN_REVIEW_REQUIRED")

const legacy = createCanonicalCasePlan({
  identity: { name: "Cliente", phone: "masked" },
  caseNumber: { value: "CASE.TEST.003" },
  hubspot: { contactUpdates: { numero_caso: "forbidden" } }
})
assert.equal(validateCanonicalCasePlan(legacy).errors.includes("legacy_contact_case_number_forbidden"), true)
console.log("canonical-case-plan.test.js: ok")
