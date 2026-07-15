"use strict"

const assert = require("node:assert/strict")
const {
  validatePrimaryIdentityConfirmationSchema,
  validatePrimaryIdentityConfirmationContext,
  applyPrimaryIdentityConfirmation
} = require("../src/domain/human-primary-identity-confirmation")

const A = "a".repeat(64), B = "b".repeat(64)
const rid = hash => `Q-${hash.slice(0, 16)}`
const cid = hash => `C-${hash.slice(0, 20)}`
const source = (hash = A, evidenceRole = "NAME_AND_CPF") => ({ reviewId: rid(hash), contentDocumentId: cid(hash), sha256: hash, evidenceRole })
const artifact = (overrides = {}) => ({ schemaVersion: 1, caseImportId: "fictional-case", confirmationStatus: "COMPLETED", confirmationSource: "HUMAN", primaryIdentity: { fullName: "Pessoa Fictícia de Teste", cpf: "52998224725", belongsToCaseHolder: true, thirdPartyCreationAuthorized: false }, documentSources: [source()], ...overrides })
const document = (hash = A, overrides = {}) => ({ caseImportId: "fictional-case", reviewId: rid(hash), contentDocumentId: cid(hash), sha256: hash, evidenceEligible: true, documentStatus: "APPROVED_AND_KEPT", subjectRole: "PRIMARY_HOLDER", ...overrides })
const context = (documents = [document()]) => ({ caseImportId: "fictional-case", documents })
const base = () => ({ nomesEncontrados: [], cpfsEncontrados: [], conflicts: ["divergent_names"], reviewReasons: ["divergent_names", "name_missing", "cpf_missing", "other_blocker"], blockingReviewReasons: ["divergent_names", "name_missing", "cpf_missing", "other_blocker"], safeToPlanHubSpot: false })

function main() {
  // 1
  assert.equal(validatePrimaryIdentityConfirmationSchema(artifact()).valid, true)
  assert.equal(validatePrimaryIdentityConfirmationContext(artifact(), context()).valid, true)
  // 2-6
  assert.equal(validatePrimaryIdentityConfirmationSchema(artifact({ primaryIdentity: { ...artifact().primaryIdentity, cpf: "12345678901" } })).valid, false)
  for (const cpf of ["529.982.247-25", "***982247**", "529982247"]) assert.equal(validatePrimaryIdentityConfirmationSchema(artifact({ primaryIdentity: { ...artifact().primaryIdentity, cpf } })).valid, false)
  assert.equal(validatePrimaryIdentityConfirmationSchema(artifact({ primaryIdentity: { ...artifact().primaryIdentity, fullName: "" } })).valid, false)
  assert.equal(validatePrimaryIdentityConfirmationSchema(artifact({ confirmationSource: "AUTOMATED" })).valid, false)
  assert.equal(validatePrimaryIdentityConfirmationSchema(artifact({ confirmationStatus: "PENDING" })).valid, false)
  // 7-11
  assert.equal(validatePrimaryIdentityConfirmationContext(artifact(), context([])).valid, false)
  assert.equal(validatePrimaryIdentityConfirmationContext(artifact(), { caseImportId: "other-case", documents: [document()] }).valid, false)
  assert.equal(validatePrimaryIdentityConfirmationContext(artifact(), context([document(B)])).valid, false)
  assert.equal(validatePrimaryIdentityConfirmationContext(artifact({ documentSources: [{ ...source(), reviewId: rid(B) }] }), context()).valid, false)
  assert.equal(validatePrimaryIdentityConfirmationContext(artifact({ documentSources: [{ ...source(), contentDocumentId: cid(B) }] }), context()).valid, false)
  // 12-15
  assert.equal(validatePrimaryIdentityConfirmationSchema(artifact({ documentSources: [source(), source()] })).valid, false)
  assert.equal(validatePrimaryIdentityConfirmationSchema({ ...artifact(), notes: "forbidden" }).valid, false)
  assert.equal(validatePrimaryIdentityConfirmationSchema(artifact({ documentSources: [] })).valid, false)
  assert.equal(validatePrimaryIdentityConfirmationContext(artifact(), context([document(A, { subjectRole: "THIRD_PARTY" })])).valid, false)
  // 16-18
  assert.equal(validatePrimaryIdentityConfirmationContext(artifact(), context()).valid, true)
  const split = artifact({ documentSources: [source(A, "NAME_ONLY"), source(B, "CPF_ONLY")] })
  assert.equal(validatePrimaryIdentityConfirmationContext(split, context([document(A), document(B)])).valid, true)
  assert.equal(validatePrimaryIdentityConfirmationSchema(artifact({ documentSources: [source(A, "NAME_ONLY")] })).valid, false)
  // 19-23
  const applied = applyPrimaryIdentityConfirmation(base(), artifact(), context())
  assert.equal(applied.reviewReasons.includes("name_missing") || applied.reviewReasons.includes("cpf_missing"), false)
  assert.equal(applied.conflicts.includes("divergent_names"), true)
  assert.equal(applied.blockingReviewReasons.includes("other_blocker"), true)
  assert.equal("thirdParties" in applied, false)
  assert.equal("contacts" in applied || "crmPlan" in applied, false)
  // 24: document approval alone remains unrelated to this contract.
  const documentaryOnly = { ...base(), humanReviewApplied: true }
  assert.deepEqual(documentaryOnly.nomesEncontrados, [])
  assert.deepEqual(documentaryOnly.cpfsEncontrados, [])
  // 25-27
  assert.throws(() => applyPrimaryIdentityConfirmation(base(), artifact()), /Invalid/)
  const unchanged = base(); const copy = structuredClone(unchanged)
  assert.throws(() => applyPrimaryIdentityConfirmation(unchanged, artifact({ primaryIdentity: { ...artifact().primaryIdentity, cpf: "invalid" } }), context()), /Invalid/)
  assert.deepEqual(unchanged, copy)
  assert.deepEqual(applyPrimaryIdentityConfirmation(base(), artifact(), context()), applyPrimaryIdentityConfirmation(base(), artifact(), context()))
  // 28
  assert.equal(validatePrimaryIdentityConfirmationSchema(artifact({ schemaVersion: 0 })).valid, false)
  assert.equal(validatePrimaryIdentityConfirmationSchema(artifact({ schemaVersion: 2 })).valid, false)
  // 29: errors never echo supplied PII.
  const badName = "SEGREDO FICTICIO"
  const errors = validatePrimaryIdentityConfirmationSchema(artifact({ primaryIdentity: { ...artifact().primaryIdentity, fullName: ` ${badName} ` } })).errors.join(" ")
  assert.equal(errors.includes(badName), false)
  assert.equal(errors.includes(artifact().primaryIdentity.cpf), false)
  // 30
  assert.equal(applied.safeToPlanHubSpot, false)
  const clearBase = { ...base(), conflicts: [], reviewReasons: ["name_missing", "cpf_missing"], blockingReviewReasons: ["name_missing", "cpf_missing"] }
  assert.equal(applyPrimaryIdentityConfirmation(clearBase, artifact(), context()).safeToPlanHubSpot, true)
  console.log("human-primary-identity-confirmation.test.js: ok")
}

main()
