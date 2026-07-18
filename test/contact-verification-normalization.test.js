"use strict"

const assert = require("node:assert/strict")
const { test } = require("node:test")
const {
  contactVerificationProjection,
  contactVerificationHash,
  validateContactVerificationEvidence
} = require("../src/domain/single-case-apply-contracts")

// All tests use SYNTHETIC DATA ONLY - no real personal information

// Test that name normalization is applied in contact verification projection
test("contactVerificationProjection normalizes uppercase firstname", () => {
  const expected = {
    firstname: "JOÃO DA SILVA",
    cpf_do_cliente: "00000000000",
    phone: "5500000000000",
    area_juridica: "Synthetic Area"
  }

  const observed = {
    firstname: "JOÃO DA SILVA",
    cpf_do_cliente: "00000000000",
    phone: "5500000000000",
    area_juridica: "Synthetic Area"
  }

  const projection = contactVerificationProjection(expected, observed)

  // Firstname should be normalized to title case
  assert.equal(projection.firstname, "João da Silva")
  assert.equal(projection.cpf_do_cliente, "00000000000")
  assert.equal(projection.phone, "5500000000000")
})

test("contactVerificationProjection handles mixed case observed vs uppercase expected", () => {
  const expected = {
    firstname: "MARIA DOS SANTOS",
    cpf_do_cliente: "11111111111",
    phone: "5511111111111"
  }

  const observed = {
    firstname: "Maria dos Santos",
    cpf_do_cliente: "11111111111",
    phone: "5511111111111"
  }

  const projection = contactVerificationProjection(expected, observed)

  // Both should normalize to the same value
  assert.equal(projection.firstname, "Maria dos Santos")
})

test("contactVerificationHash produces same hash for uppercase and normalized names", () => {
  const properties1 = {
    firstname: "JOSÉ DA SILVA",
    cpf_do_cliente: "22222222222",
    phone: "5522222222222"
  }

  const properties2 = {
    firstname: "José da Silva",
    cpf_do_cliente: "22222222222",
    phone: "5522222222222"
  }

  const hash1 = contactVerificationHash(properties1, properties1)
  const hash2 = contactVerificationHash(properties2, properties2)
  const hash3 = contactVerificationHash(properties1, properties2)

  // All should produce the same hash since normalization is applied
  assert.equal(hash1, hash2)
  assert.equal(hash1, hash3)
})

test("contactVerificationHash detects real name divergence", () => {
  const expected = {
    firstname: "ANA SANTOS",
    cpf_do_cliente: "33333333333",
    phone: "5533333333333"
  }

  const observed = {
    firstname: "CARLOS SANTOS",
    cpf_do_cliente: "33333333333",
    phone: "5533333333333"
  }

  const hashExpectedOnly = contactVerificationHash(expected, expected)
  const hashObservedOnly = contactVerificationHash(observed, observed)

  // Hashes should be different for different names
  assert.notEqual(hashExpectedOnly, hashObservedOnly)
})

test("validateContactVerificationEvidence accepts matching normalized names", () => {
  const properties = {
    firstname: "PEDRO E SILVA",
    cpf_do_cliente: "44444444444",
    phone: "5544444444444"
  }

  const evidence = {
    verified: true,
    id: "synthetic-contact-123",
    caseImportId: "synthetic-case-001",
    cpf: "44444444444",
    phone: "5544444444444",
    fieldsHash: contactVerificationHash(properties)
  }

  const validated = validateContactVerificationEvidence(evidence, {
    contactId: "synthetic-contact-123",
    caseImportId: "synthetic-case-001",
    properties
  })

  assert.equal(validated.id, "synthetic-contact-123")
  assert.equal(validated.verified, true)
})

test("validateContactVerificationEvidence rejects mismatched cpf", () => {
  const properties = {
    firstname: "LUISA DAS NEVES",
    cpf_do_cliente: "55555555555",
    phone: "5555555555555"
  }

  const evidence = {
    verified: true,
    id: "synthetic-contact-456",
    caseImportId: "synthetic-case-002",
    cpf: "99999999999", // Wrong CPF
    phone: "5555555555555",
    fieldsHash: contactVerificationHash(properties)
  }

  assert.throws(
    () => validateContactVerificationEvidence(evidence, {
      contactId: "synthetic-contact-456",
      caseImportId: "synthetic-case-002",
      properties
    }),
    /CONTACT_FIELDS_DIVERGENCE/
  )
})

test("contactVerificationProjection preserves already correct names", () => {
  const expected = {
    firstname: "João da Silva",
    cpf_do_cliente: "66666666666",
    phone: "5566666666666"
  }

  const observed = {
    firstname: "João da Silva",
    cpf_do_cliente: "66666666666",
    phone: "5566666666666"
  }

  const projection = contactVerificationProjection(expected, observed)

  assert.equal(projection.firstname, "João da Silva")
})

test("contactVerificationProjection handles name with recognized acronym", () => {
  // Note: normalizePersonName does NOT process legal acronyms
  // This test confirms that behavior
  const expected = {
    firstname: "MARIA DO INSS",
    cpf_do_cliente: "77777777777",
    phone: "5577777777777"
  }

  const observed = {
    firstname: "MARIA DO INSS",
    cpf_do_cliente: "77777777777",
    phone: "5577777777777"
  }

  const projection = contactVerificationProjection(expected, observed)

  // "INSS" is treated as a regular word in person names, not as acronym
  assert.equal(projection.firstname, "Maria do Inss")
})

test("contactVerificationProjection is deterministic", () => {
  const properties = {
    firstname: "FERNANDO SOUZA",
    cpf_do_cliente: "88888888888",
    phone: "5588888888888"
  }

  const projection1 = contactVerificationProjection(properties, properties)
  const projection2 = contactVerificationProjection(properties, properties)

  assert.deepEqual(projection1, projection2)
})

test("contactVerificationHash is idempotent after normalization", () => {
  const uppercaseProps = {
    firstname: "GABRIELA DA COSTA",
    cpf_do_cliente: "12312312312",
    phone: "5512312312312"
  }

  const normalizedProps = {
    firstname: "Gabriela da Costa",
    cpf_do_cliente: "12312312312",
    phone: "5512312312312"
  }

  const hash1 = contactVerificationHash(uppercaseProps)
  const hash2 = contactVerificationHash(normalizedProps)
  const hash3 = contactVerificationHash(uppercaseProps, normalizedProps)
  const hash4 = contactVerificationHash(normalizedProps, uppercaseProps)

  // All hashes should be identical
  assert.equal(hash1, hash2)
  assert.equal(hash2, hash3)
  assert.equal(hash3, hash4)
})
