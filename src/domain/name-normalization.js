"use strict"

/**
 * Canonical name normalization for person names and text fields
 * containing recognized acronyms in legal/social security context.
 *
 * RULES:
 * 1. Convert person names to title case regardless of their original casing
 * 2. Lowercase prepositions when not at start: da, de, do, das, dos, e
 * 3. Preserve recognized acronyms in uppercase
 * 4. Preserve already correctly capitalized names
 * 5. Normalize whitespace (trim, collapse duplicates)
 * 6. Deterministic and idempotent
 * 7. Fail conservatively when uncertain
 */

// Recognized acronyms in legal and social security context
const RECOGNIZED_ACRONYMS = Object.freeze(new Set([
  "INSS",
  "CPF",
  "RG",
  "CNH",
  "OAB",
  "CNPJ",
  "MEI",
  "LTDA",
  "EIRELI",
  "BPC",
  "LOAS",
  "CRAS",
  "CNIS",
  "NB",
  "NIT",
  "PIS",
  "PASEP"
]))

// Prepositions that should be lowercase when not at the start
const LOWERCASE_PREPOSITIONS = Object.freeze(new Set([
  "da", "de", "do", "das", "dos", "e"
]))

/**
 * Checks if a string is entirely uppercase (ignoring non-alphabetic characters)
 */
function isAllUppercase(value) {
  if (!value || typeof value !== "string") return false
  const letters = value.replace(/[^a-zA-ZÀ-ÿ]/g, "")
  return letters.length > 0 && letters === letters.toUpperCase()
}

/**
 * Checks if a string is a recognized acronym
 */
function isRecognizedAcronym(value) {
  return RECOGNIZED_ACRONYMS.has(value)
}

/**
 * Capitalizes the first letter of a word, keeping the rest lowercase
 */
function capitalize(word) {
  if (!word) return word
  return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
}

/**
 * Normalizes a single word for person names and recognized acronyms.
 */
function normalizePersonNameWord(word, isFirstWord) {
  if (!word || typeof word !== "string") return word

  const trimmed = word.trim()
  if (!trimmed) return trimmed

  if (isRecognizedAcronym(trimmed.toUpperCase())) {
    return trimmed.toUpperCase()
  }

  // Check if it's a preposition (lowercase unless first word)
  const lower = trimmed.toLowerCase()
  if (!isFirstWord && LOWERCASE_PREPOSITIONS.has(lower)) {
    return lower
  }

  // Capitalize normally
  return capitalize(trimmed)
}

function normalizePersonNameToken(token, isFirstWord) {
  const parts = token.split(/([/'-])/)
  let wordIndex = 0
  return parts.map(part => {
    if (/^[/'-]$/.test(part)) return part
    const normalized = normalizePersonNameWord(part, isFirstWord && wordIndex === 0)
    wordIndex += 1
    return normalized
  }).join("")
}

/**
 * Normalizes a single word for text with acronyms (checks for recognized acronyms)
 */
function normalizeTextWord(word, isFirstWord) {
  if (!word || typeof word !== "string") return word

  const trimmed = word.trim()
  if (!trimmed) return trimmed

  // Check if it's a recognized acronym (preserve uppercase)
  if (isRecognizedAcronym(trimmed.toUpperCase())) {
    return trimmed.toUpperCase()
  }

  // Check if it's a preposition (lowercase unless first word)
  const lower = trimmed.toLowerCase()
  if (!isFirstWord && LOWERCASE_PREPOSITIONS.has(lower)) {
    return lower
  }

  // Capitalize normally
  return capitalize(trimmed)
}

/**
 * Normalizes a person name to canonical form
 *
 * @param {string} name - The name to normalize
 * @returns {string} Normalized name
 *
 * @example
 * normalizePersonName("MARINA ANDRADE DA SILVA") // "Marina Andrade da Silva"
 * normalizePersonName("João da Silva") // "João da Silva"
 * normalizePersonName("maria do inss") // "Maria do INSS"
 * normalizePersonName("José  Carlos") // "José Carlos"
 */
function normalizePersonName(name) {
  // Handle null, undefined, empty string
  if (name === null || name === undefined) return name
  if (typeof name !== "string") throw new Error("NAME_NORMALIZATION_INVALID_INPUT")

  const trimmed = name.trim()
  if (trimmed === "") return trimmed

  // Normalize whitespace: collapse multiple spaces to single space
  const normalized = trimmed.replace(/\s+/g, " ")

  const words = normalized.split(" ")
    .map((word, index) => normalizePersonNameToken(word, index === 0))

  return words.join(" ")
}

/**
 * Normalizes text that may contain person names and recognized acronyms
 *
 * @param {string} text - The text to normalize
 * @returns {string} Normalized text
 */
function normalizeTextWithAcronyms(text) {
  if (text === null || text === undefined) return text
  if (typeof text !== "string") throw new Error("TEXT_NORMALIZATION_INVALID_INPUT")

  const trimmed = text.trim()
  if (trimmed === "") return trimmed

  // Normalize whitespace
  const normalized = trimmed.replace(/\s+/g, " ")

  // If not all uppercase, return as-is
  if (!isAllUppercase(normalized)) {
    return normalized
  }

  // For text with acronyms, we need to be more careful about word boundaries
  // Split by spaces but also handle punctuation-connected acronyms like "BPC/LOAS"
  const result = []
  const words = normalized.split(" ")

  for (let i = 0; i < words.length; i++) {
    const word = words[i]

    // Check if word contains recognized acronyms separated by punctuation
    // e.g., "BPC/LOAS" should become "BPC/LOAS" not "Bpc/loas"
    const parts = word.split(/([\/\-.,;:()]+)/)
    const normalizedParts = parts.map((part, partIndex) => {
      if (/^[\/\-.,;:()]+$/.test(part)) {
        // Keep punctuation as-is
        return part
      }
      if (isRecognizedAcronym(part.toUpperCase())) {
        return part.toUpperCase()
      }
      // For text context, treat first word specially
      return normalizeTextWord(part, i === 0 && partIndex === 0)
    })

    result.push(normalizedParts.join(""))
  }

  return result.join(" ")
}

module.exports = {
  RECOGNIZED_ACRONYMS,
  LOWERCASE_PREPOSITIONS,
  normalizePersonName,
  normalizeTextWithAcronyms,
  isAllUppercase,
  isRecognizedAcronym
}
