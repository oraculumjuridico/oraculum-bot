"use strict"

const test = require("node:test")
const assert = require("node:assert/strict")
const { canonicalize, sha256, contactVerificationProjection, contactVerificationHash, validateContactVerificationEvidence } = require("../src/domain/single-case-apply-contracts")
const { DECISIONS, authorizationResumePlan, reconcileSingleCaseContactCheckpoint } = require("../src/domain/single-case-contact-reconciliation")

const CASE_ID = "fixture-contact-reconciliation"
const PROPERTIES = Object.freeze({ firstname: "Synthetic Person", cpf_do_cliente: "00000000000", phone: "5500000000000", area_juridica: "Synthetic Area" })
const plan = overrides => ({ caseImportId: CASE_ID, contactPlan: { properties: { ...PROPERTIES } }, ...overrides })
const checkpoint = overrides => ({ caseImportId: CASE_ID, authorizationIds: ["fixture-consumed-auth-1", "fixture-consumed-auth-2"], steps: { reservation: { status: "completed", result: { verified: true } }, contact: { status: "failed", errorCode: "VERIFICATION_FAILED" } }, ...overrides })
const evidence = (overrides = {}) => ({ verified: true, id: "fixture-contact-id", cpf: PROPERTIES.cpf_do_cliente, phone: PROPERTIES.phone, firstname: PROPERTIES.firstname, fieldsHash: contactVerificationHash(PROPERTIES), caseImportId: CASE_ID, ...overrides })
const contacts = overrides => ({ findContactsByCpf: async () => [{ id: "fixture-contact-id" }], findContactsByPhone: async () => [{ id: "fixture-contact-id" }], verify: async (_id, _properties, context) => evidence({ caseImportId: context?.caseImportId }), ...overrides })

test("canonical projection keeps only plan-authorized fields", () => assert.deepEqual(contactVerificationProjection(PROPERTIES, { ...PROPERTIES, unauthorized: "ignored" }), PROPERTIES))
test("canonical hash matches a broad response with equal authorized fields", () => assert.equal(contactVerificationHash(PROPERTIES, { ...PROPERTIES, unauthorized: "ignored" }), contactVerificationHash(PROPERTIES)))
test("hash over a broader projection is rejected", () => assert.throws(() => validateContactVerificationEvidence(evidence({ fieldsHash: sha256(canonicalize({ ...PROPERTIES, unauthorized: "extra" })) }), { contactId: "fixture-contact-id", caseImportId: CASE_ID, properties: PROPERTIES }), /CONTACT_FIELDS_DIVERGENCE/))
test("missing context fails closed", () => assert.throws(() => validateContactVerificationEvidence(evidence({ caseImportId: null }), { contactId: "fixture-contact-id", caseImportId: CASE_ID, properties: PROPERTIES }), /CONTACT_FIELDS_DIVERGENCE/))
test("divergent caseImportId fails closed", () => assert.throws(() => validateContactVerificationEvidence(evidence({ caseImportId: "fixture-other-case" }), { contactId: "fixture-contact-id", caseImportId: CASE_ID, properties: PROPERTIES }), /CONTACT_FIELDS_DIVERGENCE/))
test("divergent real field fails closed", () => assert.throws(() => validateContactVerificationEvidence(evidence({ phone: "5500000000001" }), { contactId: "fixture-contact-id", caseImportId: CASE_ID, properties: PROPERTIES }), /CONTACT_FIELDS_DIVERGENCE/))
test("one exact contact is reconciliation eligible without writes", async () => { const result = await reconcileSingleCaseContactCheckpoint({ caseImportId: CASE_ID, plan: plan(), checkpoint: checkpoint(), authorizationState: "PAIR_CONSUMED", contacts: contacts() }); assert.equal(result.decision, DECISIONS.ELIGIBLE); assert.equal(result.writesExecuted, false); assert.equal(result.resume.directRetryAllowed, false) })
test("multiple contacts block reconciliation", async () => { const result = await reconcileSingleCaseContactCheckpoint({ caseImportId: CASE_ID, plan: plan(), checkpoint: checkpoint(), authorizationState: "PAIR_CONSUMED", contacts: contacts({ findContactsByPhone: async () => [{ id: "fixture-second-contact" }] }) }); assert.equal(result.decision, DECISIONS.BLOCKED); assert.equal(result.reason, "CONTACT_AMBIGUOUS") })
test("consumed checkpoint with existing contact evidence is rejected", async () => { const result = await reconcileSingleCaseContactCheckpoint({ caseImportId: CASE_ID, plan: plan(), checkpoint: checkpoint({ steps: { reservation: { status: "completed" }, contact: { status: "failed", result: evidence() } } }), authorizationState: "PAIR_CONSUMED", contacts: contacts() }); assert.equal(result.decision, DECISIONS.BLOCKED) })
test("new authorization binding requires explicit atomic checkpoint rebind", () => { const result = authorizationResumePlan(checkpoint(), ["fixture-new-auth-1", "fixture-new-auth-2"]); assert.equal(result.directRetryAllowed, false); assert.equal(result.checkpointRebindRequired, true); assert.equal(result.operation, "ATOMIC_CHECKPOINT_AUTHORIZATION_REBIND_REQUIRED") })
test("read failure is indeterminate and performs no write", async () => { const result = await reconcileSingleCaseContactCheckpoint({ caseImportId: CASE_ID, plan: plan(), checkpoint: checkpoint(), authorizationState: "PAIR_CONSUMED", contacts: contacts({ verify: async () => { throw new Error("READ_FAILED") } }) }); assert.equal(result.decision, DECISIONS.INDETERMINATE); assert.equal(result.writesExecuted, false) })

// Tests for semantic match vs presentation match
test("checkNamePresentation detects semantic match with presentation divergence", () => {
  const { checkNamePresentation } = require("../src/domain/single-case-contact-reconciliation")

  const expected = { firstname: "JOÃO DA SILVA", cpf_do_cliente: "00000000000", phone: "5500000000000" }
  const observed = { firstname: "JOÃO DA SILVA", cpf_do_cliente: "00000000000", phone: "5500000000000" }

  const result = checkNamePresentation(expected, observed)

  assert.equal(result.semanticMatch, true)
  assert.equal(result.presentationMatch, false) // Observed is uppercase
  assert.equal(result.normalizationRequired, true)
  assert.equal(result.updateRequired, true)
})

test("checkNamePresentation confirms correct presentation", () => {
  const { checkNamePresentation } = require("../src/domain/single-case-contact-reconciliation")

  const expected = { firstname: "João da Silva", cpf_do_cliente: "00000000000", phone: "5500000000000" }
  const observed = { firstname: "João da Silva", cpf_do_cliente: "00000000000", phone: "5500000000000" }

  const result = checkNamePresentation(expected, observed)

  assert.equal(result.semanticMatch, true)
  assert.equal(result.presentationMatch, true)
  assert.equal(result.normalizationRequired, false)
  assert.equal(result.updateRequired, false)
})

test("checkNamePresentation detects real name divergence", () => {
  const { checkNamePresentation } = require("../src/domain/single-case-contact-reconciliation")

  const expected = { firstname: "João da Silva", cpf_do_cliente: "00000000000", phone: "5500000000000" }
  const observed = { firstname: "José da Silva", cpf_do_cliente: "00000000000", phone: "5500000000000" }

  const result = checkNamePresentation(expected, observed)

  assert.equal(result.semanticMatch, false) // Different names
  assert.equal(result.presentationMatch, true) // Observed is properly formatted (even though wrong name)
  assert.equal(result.normalizationRequired, false) // No normalization can fix different names
  assert.equal(result.updateRequired, false) // Update won't help - names are actually different
})

test("reconciliation detects uppercase stored name and reports update required", async () => {
  // With adapter now returning firstname, reconciliation can detect presentation issues
  const uppercaseProperties = { ...PROPERTIES, firstname: "JOÃO DA SILVA" }
  const uppercaseEvidence = {
    verified: true,
    id: "fixture-contact-id",
    cpf: uppercaseProperties.cpf_do_cliente,
    phone: uppercaseProperties.phone,
    firstname: "JOÃO DA SILVA", // Observed from HubSpot - all uppercase
    fieldsHash: contactVerificationHash(uppercaseProperties),
    caseImportId: CASE_ID
  }

  const result = await reconcileSingleCaseContactCheckpoint({
    caseImportId: CASE_ID,
    plan: plan({ contactPlan: { properties: uppercaseProperties } }),
    checkpoint: checkpoint(),
    authorizationState: "PAIR_CONSUMED",
    contacts: contacts({ verify: async () => uppercaseEvidence })
  })

  assert.equal(result.decision, DECISIONS.ELIGIBLE)
  assert.equal(result.writesExecuted, false) // No actual update executed
  assert.equal(result.namePresentation.semanticMatch, true) // Same name after normalization
  assert.equal(result.namePresentation.presentationMatch, false) // Observed is uppercase
  assert.equal(result.namePresentation.normalizationRequired, true)
  assert.equal(result.namePresentation.updateRequired, true) // Update needed for cosmetic fix

  // SECURITY: Verify firstname is NOT in sanitized evidence
  assert.equal(result.contactEvidence.firstname, undefined)
  assert.ok(!Object.hasOwn(result.contactEvidence, 'firstname'))
})

test("reconciliation confirms correctly presented name needs no update", async () => {
  // Name already in canonical form
  const correctProperties = { ...PROPERTIES, firstname: "João da Silva" }
  const correctEvidence = {
    verified: true,
    id: "fixture-contact-id",
    cpf: correctProperties.cpf_do_cliente,
    phone: correctProperties.phone,
    firstname: "João da Silva", // Observed from HubSpot - already correct
    fieldsHash: contactVerificationHash(correctProperties),
    caseImportId: CASE_ID
  }

  const result = await reconcileSingleCaseContactCheckpoint({
    caseImportId: CASE_ID,
    plan: plan({ contactPlan: { properties: correctProperties } }),
    checkpoint: checkpoint(),
    authorizationState: "PAIR_CONSUMED",
    contacts: contacts({ verify: async () => correctEvidence })
  })

  assert.equal(result.decision, DECISIONS.ELIGIBLE)
  assert.equal(result.namePresentation.semanticMatch, true)
  assert.equal(result.namePresentation.presentationMatch, true)
  assert.equal(result.namePresentation.updateRequired, false) // No update needed

  // SECURITY: Verify firstname is NOT in sanitized evidence
  assert.equal(result.contactEvidence.firstname, undefined)
})

test("reconciliation requires observed firstname for eligible decision", async () => {
  // Evidence without firstname should return INDETERMINATE, not ELIGIBLE
  const evidenceWithoutFirstname = {
    verified: true,
    id: "fixture-contact-id",
    cpf: PROPERTIES.cpf_do_cliente,
    phone: PROPERTIES.phone,
    fieldsHash: contactVerificationHash(PROPERTIES),
    caseImportId: CASE_ID
    // firstname intentionally omitted
  }

  const result = await reconcileSingleCaseContactCheckpoint({
    caseImportId: CASE_ID,
    plan: plan(),
    checkpoint: checkpoint(),
    authorizationState: "PAIR_CONSUMED",
    contacts: contacts({ verify: async () => evidenceWithoutFirstname })
  })

  assert.equal(result.decision, DECISIONS.INDETERMINATE) // NOT eligible
  assert.equal(result.reason, "OBSERVED_FIRSTNAME_MISSING")
  assert.equal(result.writesExecuted, false)
})

test("reconciliation requires non-empty observed firstname", async () => {
  // Empty firstname should return INDETERMINATE
  const evidenceWithEmptyFirstname = {
    verified: true,
    id: "fixture-contact-id",
    cpf: PROPERTIES.cpf_do_cliente,
    phone: PROPERTIES.phone,
    firstname: "   ", // Empty/whitespace
    fieldsHash: contactVerificationHash(PROPERTIES),
    caseImportId: CASE_ID
  }

  const result = await reconcileSingleCaseContactCheckpoint({
    caseImportId: CASE_ID,
    plan: plan(),
    checkpoint: checkpoint(),
    authorizationState: "PAIR_CONSUMED",
    contacts: contacts({ verify: async () => evidenceWithEmptyFirstname })
  })

  assert.equal(result.decision, DECISIONS.INDETERMINATE)
  assert.equal(result.reason, "OBSERVED_FIRSTNAME_MISSING")
})

test("reconciliation sanitized evidence excludes firstname", async () => {
  // Verify that returned evidence does not contain firstname field
  const result = await reconcileSingleCaseContactCheckpoint({
    caseImportId: CASE_ID,
    plan: plan(),
    checkpoint: checkpoint(),
    authorizationState: "PAIR_CONSUMED",
    contacts: contacts()
  })

  assert.equal(result.decision, DECISIONS.ELIGIBLE)

  // Evidence should have required fields
  assert.ok(result.contactEvidence.verified)
  assert.ok(result.contactEvidence.id)
  assert.ok(result.contactEvidence.cpf)
  assert.ok(result.contactEvidence.phone)
  assert.ok(result.contactEvidence.fieldsHash)
  assert.ok(result.contactEvidence.caseImportId)

  // But NOT firstname
  assert.equal(result.contactEvidence.firstname, undefined)
  assert.ok(!Object.hasOwn(result.contactEvidence, 'firstname'))

  // Only 6 fields in sanitized evidence
  assert.equal(Object.keys(result.contactEvidence).length, 6)
})

test("reconciliation namePresentation excludes actual name values", async () => {
  // namePresentation should contain only boolean flags, not actual names
  const uppercaseProperties = { ...PROPERTIES, firstname: "JOÃO DA SILVA" }
  const uppercaseEvidence = {
    verified: true,
    id: "fixture-contact-id",
    cpf: uppercaseProperties.cpf_do_cliente,
    phone: uppercaseProperties.phone,
    firstname: "JOÃO DA SILVA",
    fieldsHash: contactVerificationHash(uppercaseProperties),
    caseImportId: CASE_ID
  }

  const result = await reconcileSingleCaseContactCheckpoint({
    caseImportId: CASE_ID,
    plan: plan({ contactPlan: { properties: uppercaseProperties } }),
    checkpoint: checkpoint(),
    authorizationState: "PAIR_CONSUMED",
    contacts: contacts({ verify: async () => uppercaseEvidence })
  })

  // namePresentation should only have boolean/flag fields
  assert.equal(typeof result.namePresentation.semanticMatch, 'boolean')
  assert.equal(typeof result.namePresentation.presentationMatch, 'boolean')
  assert.equal(typeof result.namePresentation.normalizationRequired, 'boolean')
  assert.equal(typeof result.namePresentation.updateRequired, 'boolean')

  // Should have exactly 4 fields
  assert.equal(Object.keys(result.namePresentation).length, 4)

  // Should NOT contain any name strings
  const asString = JSON.stringify(result.namePresentation)
  assert.ok(!asString.includes('JOÃO'))
  assert.ok(!asString.includes('João'))
  assert.ok(!asString.includes('SILVA'))
  assert.ok(!asString.includes('Silva'))
})

test("reconciliation detects real name divergence and blocks", async () => {
  // Different names should block reconciliation even if properly formatted
  const differentNameEvidence = {
    verified: true,
    id: "fixture-contact-id",
    cpf: PROPERTIES.cpf_do_cliente,
    phone: PROPERTIES.phone,
    firstname: "José da Silva", // Different person
    fieldsHash: contactVerificationHash({ ...PROPERTIES, firstname: "José da Silva" }),
    caseImportId: CASE_ID
  }

  const result = await reconcileSingleCaseContactCheckpoint({
    caseImportId: CASE_ID,
    plan: plan(),
    checkpoint: checkpoint(),
    authorizationState: "PAIR_CONSUMED",
    contacts: contacts({ verify: async () => differentNameEvidence })
  })

  // Hash mismatch causes CONTACT_FIELDS_DIVERGENCE
  assert.equal(result.decision, DECISIONS.BLOCKED)
  assert.equal(result.reason, "CONTACT_FIELDS_DIVERGENCE")
})
