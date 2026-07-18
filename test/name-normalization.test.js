"use strict"

const assert = require("node:assert/strict")
const { test } = require("node:test")
const {
  normalizePersonName,
  normalizeTextWithAcronyms,
  isAllUppercase,
  isRecognizedAcronym,
  RECOGNIZED_ACRONYMS,
  LOWERCASE_PREPOSITIONS
} = require("../src/domain/name-normalization")

// Test helper functions
test("isAllUppercase detects all-uppercase strings", () => {
  assert.equal(isAllUppercase("JOÃO SILVA"), true)
  assert.equal(isAllUppercase("João Silva"), false)
  assert.equal(isAllUppercase("JOÃO"), true)
  assert.equal(isAllUppercase("joão"), false)
  assert.equal(isAllUppercase("JoÃo"), false)
  assert.equal(isAllUppercase(""), false)
  assert.equal(isAllUppercase("123"), false)
  assert.equal(isAllUppercase("JOÃO-123"), true)
})

test("isRecognizedAcronym identifies known acronyms", () => {
  assert.equal(isRecognizedAcronym("INSS"), true)
  assert.equal(isRecognizedAcronym("CPF"), true)
  assert.equal(isRecognizedAcronym("RG"), true)
  assert.equal(isRecognizedAcronym("BPC"), true)
  assert.equal(isRecognizedAcronym("LOAS"), true)
  assert.equal(isRecognizedAcronym("CRAS"), true)
  assert.equal(isRecognizedAcronym("CNIS"), true)
  assert.equal(isRecognizedAcronym("NB"), true)
  assert.equal(isRecognizedAcronym("NIT"), true)
  assert.equal(isRecognizedAcronym("PIS"), true)
  assert.equal(isRecognizedAcronym("PASEP"), true)
  assert.equal(isRecognizedAcronym("XYZ"), false)
  assert.equal(isRecognizedAcronym("DA"), false)
})

// Test person name normalization
test("normalizes all-uppercase name to title case", () => {
  assert.equal(normalizePersonName("MARINA ANDRADE DA SILVA"), "Marina Andrade da Silva")
  assert.equal(normalizePersonName("JOÃO PEDRO SANTOS"), "João Pedro Santos")
  assert.equal(normalizePersonName("MARIA JOSÉ"), "Maria José")
})

test("preserves already correctly capitalized names", () => {
  assert.equal(normalizePersonName("João da Silva"), "João da Silva")
  assert.equal(normalizePersonName("Maria José Santos"), "Maria José Santos")
  assert.equal(normalizePersonName("Ana Paula"), "Ana Paula")
})

test("handles prepositions correctly", () => {
  assert.equal(normalizePersonName("JOÃO DA SILVA"), "João da Silva")
  assert.equal(normalizePersonName("MARIA DE SOUZA"), "Maria de Souza")
  assert.equal(normalizePersonName("JOSÉ DO CARMO"), "José do Carmo")
  assert.equal(normalizePersonName("ANA DAS NEVES"), "Ana das Neves")
  assert.equal(normalizePersonName("PEDRO DOS SANTOS"), "Pedro dos Santos")
  assert.equal(normalizePersonName("PAULO E SILVA"), "Paulo e Silva")
})

test("handles preposition at the start (capitalize)", () => {
  assert.equal(normalizePersonName("DA SILVA JOÃO"), "Da Silva João")
  assert.equal(normalizePersonName("DE SOUZA MARIA"), "De Souza Maria")
})

test("handles duplicate spaces", () => {
  assert.equal(normalizePersonName("JOÃO  SILVA"), "João Silva")
  assert.equal(normalizePersonName("MARIA   DA    SILVA"), "Maria da Silva")
  assert.equal(normalizePersonName("  JOSÉ SANTOS  "), "José Santos")
})

test("handles accented characters", () => {
  assert.equal(normalizePersonName("JOSÉ MARÍA"), "José María")
  assert.equal(normalizePersonName("FRANÇOIS ANDRÉ"), "François André")
  assert.equal(normalizePersonName("JOÃO ÂNGELO"), "João Ângelo")
})

test("handles hyphens", () => {
  assert.equal(normalizePersonName("MARIA-JOSÉ"), "Maria-josé")
  assert.equal(normalizePersonName("JEAN-PAUL"), "Jean-paul")
})

test("handles apostrophes", () => {
  assert.equal(normalizePersonName("O'BRIEN"), "O'brien")
  assert.equal(normalizePersonName("D'ANGELO"), "D'angelo")
})

test("normalizePersonName does NOT preserve legal acronyms", () => {
  // Person names should NOT check for legal acronyms like INSS, CPF, etc.
  // These are handled by normalizeTextWithAcronyms
  assert.equal(normalizePersonName("JOÃO DO INSS"), "João do Inss")
  assert.equal(normalizePersonName("MARIA CPF SILVA"), "Maria Cpf Silva")
  assert.equal(normalizePersonName("JOSÉ RG SANTOS"), "José Rg Santos")
})

test("does not treat short words as acronyms", () => {
  assert.equal(normalizePersonName("JOÃO DA SILVA"), "João da Silva")
  assert.equal(normalizePersonName("MARIA DO CARMO"), "Maria do Carmo")
  // "DO" is not in RECOGNIZED_ACRONYMS, so treated as preposition
})

test("is idempotent", () => {
  const name1 = "MARINA ANDRADE DA SILVA"
  const normalized1 = normalizePersonName(name1)
  const normalized2 = normalizePersonName(normalized1)
  assert.equal(normalized1, normalized2)

  const name2 = "JOÃO DA SILVA"
  const normalized3 = normalizePersonName(name2)
  const normalized4 = normalizePersonName(normalized3)
  assert.equal(normalized3, normalized4)
})

test("handles empty and null values", () => {
  assert.equal(normalizePersonName(""), "")
  assert.equal(normalizePersonName("   "), "")
  assert.equal(normalizePersonName(null), null)
  assert.equal(normalizePersonName(undefined), undefined)
})

test("throws on invalid input type", () => {
  assert.throws(() => normalizePersonName(123), /NAME_NORMALIZATION_INVALID_INPUT/)
  assert.throws(() => normalizePersonName({}), /NAME_NORMALIZATION_INVALID_INPUT/)
  assert.throws(() => normalizePersonName([]), /NAME_NORMALIZATION_INVALID_INPUT/)
})

// Test text with acronyms normalization
test("normalizes text with acronyms", () => {
  assert.equal(
    normalizeTextWithAcronyms("DOCUMENTOS RECEBIDOS DO INSS E DO CPF"),
    "Documentos Recebidos do INSS e do CPF"
  )
  assert.equal(
    normalizeTextWithAcronyms("BENEFÍCIO BPC/LOAS APROVADO"),
    "Benefício BPC/LOAS Aprovado"
  )
})

test("preserves mixed-case text with acronyms", () => {
  assert.equal(
    normalizeTextWithAcronyms("Documentos do INSS recebidos"),
    "Documentos do INSS recebidos"
  )
})

test("textWithAcronyms handles empty and null", () => {
  assert.equal(normalizeTextWithAcronyms(""), "")
  assert.equal(normalizeTextWithAcronyms(null), null)
  assert.equal(normalizeTextWithAcronyms(undefined), undefined)
})

test("textWithAcronyms throws on invalid input", () => {
  assert.throws(() => normalizeTextWithAcronyms(123), /TEXT_NORMALIZATION_INVALID_INPUT/)
})

// Test constants
test("RECOGNIZED_ACRONYMS contains expected acronyms", () => {
  assert.equal(RECOGNIZED_ACRONYMS.size >= 11, true)
  assert.equal(RECOGNIZED_ACRONYMS.has("INSS"), true)
  assert.equal(RECOGNIZED_ACRONYMS.has("CPF"), true)
  assert.equal(RECOGNIZED_ACRONYMS.has("BPC"), true)
})

test("LOWERCASE_PREPOSITIONS contains expected prepositions", () => {
  assert.equal(LOWERCASE_PREPOSITIONS.size >= 6, true)
  assert.equal(LOWERCASE_PREPOSITIONS.has("da"), true)
  assert.equal(LOWERCASE_PREPOSITIONS.has("de"), true)
  assert.equal(LOWERCASE_PREPOSITIONS.has("do"), true)
  assert.equal(LOWERCASE_PREPOSITIONS.has("e"), true)
})

// Synthetic scenario tests
test("synthetic: expected normal vs observed uppercase", () => {
  const expected = "João da Silva"
  const observed = "JOÃO DA SILVA"

  const normalizedExpected = normalizePersonName(expected)
  const normalizedObserved = normalizePersonName(observed)

  assert.equal(normalizedExpected, "João da Silva")
  assert.equal(normalizedObserved, "João da Silva")
  assert.equal(normalizedExpected, normalizedObserved)
})

test("synthetic: real divergence not hidden by normalization", () => {
  const expected = "João da Silva"
  const observed = "José da Silva"

  const normalizedExpected = normalizePersonName(expected)
  const normalizedObserved = normalizePersonName(observed)

  assert.notEqual(normalizedExpected, normalizedObserved)
})

test("synthetic: complex name with all features", () => {
  const allUppercase = "MARIA JOSÉ DA SILVA E SANTOS"
  const normalized = normalizePersonName(allUppercase)

  assert.equal(normalized, "Maria José da Silva e Santos")

  // Idempotent
  assert.equal(normalizePersonName(normalized), normalized)
})
