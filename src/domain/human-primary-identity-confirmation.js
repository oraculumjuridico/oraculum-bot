"use strict"

const crypto = require("node:crypto")

const STATUS = "COMPLETED"
const SOURCE = "HUMAN"
const EVIDENCE_ROLES = new Set(["NAME_AND_CPF", "NAME_ONLY", "CPF_ONLY"])
const SHA256 = /^[a-f0-9]{64}$/
const REVIEW_ID = /^Q-[a-f0-9]{16}$/
const CONTENT_ID = /^C-[a-f0-9]{20}$/

const normalizeName = value => String(value || "").replace(/\s+/g, " ").trim()
const digits = value => String(value || "").replace(/\D/g, "")
const reviewIdFor = hash => `Q-${hash.slice(0, 16)}`
const contentIdFor = hash => `C-${hash.slice(0, 20)}`

function validCpf(value) {
  if (typeof value !== "string" || !/^\d{11}$/.test(value) || /^(\d)\1+$/.test(value)) return false
  for (let size = 9; size <= 10; size++) {
    let sum = 0
    for (let index = 0; index < size; index++) sum += Number(value[index]) * (size + 1 - index)
    if ((sum * 10) % 11 % 10 !== Number(value[size])) return false
  }
  return true
}

function validatePrimaryIdentityConfirmationSchema(confirmation) {
  const errors = []
  if (!confirmation || typeof confirmation !== "object" || Array.isArray(confirmation)) return { valid: false, errors: ["confirmation object is required"] }
  const top = new Set(["schemaVersion", "caseImportId", "confirmationStatus", "confirmationSource", "primaryIdentity", "documentSources"])
  Object.keys(confirmation).forEach(key => { if (!top.has(key)) errors.push(`unknown confirmation field: ${key}`) })
  if (confirmation.schemaVersion !== 1) errors.push("schemaVersion must be 1")
  if (typeof confirmation.caseImportId !== "string" || !confirmation.caseImportId.trim()) errors.push("caseImportId is required")
  if (confirmation.confirmationStatus !== STATUS) errors.push(`confirmationStatus must be ${STATUS}`)
  if (confirmation.confirmationSource !== SOURCE) errors.push(`confirmationSource must be ${SOURCE}`)
  const identity = confirmation.primaryIdentity
  if (!identity || typeof identity !== "object" || Array.isArray(identity)) errors.push("primaryIdentity object is required")
  else {
    const known = new Set(["fullName", "cpf", "belongsToCaseHolder", "thirdPartyCreationAuthorized"])
    Object.keys(identity).forEach(key => { if (!known.has(key)) errors.push(`unknown primaryIdentity field: ${key}`) })
    const name = normalizeName(identity.fullName)
    if (!name || name !== identity.fullName) errors.push("primaryIdentity.fullName must be non-empty and normalized")
    if (!validCpf(identity.cpf)) errors.push("primaryIdentity.cpf must be a valid unmasked CPF")
    if (identity.belongsToCaseHolder !== true) errors.push("primaryIdentity must belong to the case holder")
    if (identity.thirdPartyCreationAuthorized !== false) errors.push("third-party creation must be explicitly unauthorized")
  }
  if (!Array.isArray(confirmation.documentSources) || !confirmation.documentSources.length) errors.push("documentSources must be a non-empty array")
  else {
    const identities = new Set()
    confirmation.documentSources.forEach((item, index) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) { errors.push(`documentSources[${index}] must be an object`); return }
      const known = new Set(["reviewId", "contentDocumentId", "sha256", "evidenceRole"])
      Object.keys(item).forEach(key => { if (!known.has(key)) errors.push(`documentSources[${index}] has unknown field: ${key}`) })
      if (!SHA256.test(String(item.sha256 || ""))) errors.push(`documentSources[${index}] has invalid sha256`)
      if (item.reviewId !== undefined && !REVIEW_ID.test(item.reviewId)) errors.push(`documentSources[${index}] has invalid reviewId`)
      if (item.contentDocumentId !== undefined && !CONTENT_ID.test(item.contentDocumentId)) errors.push(`documentSources[${index}] has invalid contentDocumentId`)
      if (!item.reviewId && !item.contentDocumentId) errors.push(`documentSources[${index}] requires a document identity`)
      if (!EVIDENCE_ROLES.has(item.evidenceRole)) errors.push(`documentSources[${index}] has invalid evidenceRole`)
      const key = `${item.sha256}|${item.reviewId || ""}|${item.contentDocumentId || ""}`
      if (identities.has(key)) errors.push(`documentSources[${index}] is duplicated`)
      identities.add(key)
    })
    const roles = new Set(confirmation.documentSources.map(item => item.evidenceRole))
    if (!roles.has("NAME_AND_CPF") && !(roles.has("NAME_ONLY") && roles.has("CPF_ONLY"))) errors.push("document evidence must cover both name and CPF")
  }
  return { valid: errors.length === 0, errors: errors.length ? errors : undefined }
}

function validatePrimaryIdentityConfirmationContext(confirmation, context = {}) {
  const structural = validatePrimaryIdentityConfirmationSchema(confirmation)
  const errors = structural.valid ? [] : [...structural.errors]
  if (typeof context.caseImportId !== "string" || !context.caseImportId) errors.push("context.caseImportId is required")
  else if (confirmation?.caseImportId !== context.caseImportId) errors.push("caseImportId mismatch")
  if (!Array.isArray(context.documents)) errors.push("context.documents must be an array")
  else if (structural.valid) {
    const documents = new Map(context.documents.map(item => [String(item.sha256 || "").toLowerCase(), item]))
    confirmation.documentSources.forEach((source, index) => {
      const document = documents.get(source.sha256)
      if (!document) { errors.push(`documentSources[${index}] is not in this case`); return }
      if (document.caseImportId !== undefined && document.caseImportId !== context.caseImportId) errors.push(`documentSources[${index}] belongs to another case`)
      if (document.sha256 !== source.sha256) errors.push(`documentSources[${index}] hash mismatch`)
      if (source.reviewId !== undefined && (source.reviewId !== document.reviewId || source.reviewId !== reviewIdFor(source.sha256))) errors.push(`documentSources[${index}] reviewId mismatch`)
      if (source.contentDocumentId !== undefined && (source.contentDocumentId !== document.contentDocumentId || source.contentDocumentId !== contentIdFor(source.sha256))) errors.push(`documentSources[${index}] contentDocumentId mismatch`)
      if (document.evidenceEligible !== true || !["ANALYZED", "APPROVED_AND_KEPT"].includes(document.documentStatus)) errors.push(`documentSources[${index}] is not eligible evidence`)
      if (document.subjectRole !== "PRIMARY_HOLDER") errors.push(`documentSources[${index}] cannot evidence the primary holder`)
    })
  }
  return { valid: errors.length === 0, errors: errors.length ? errors : undefined }
}

function applyPrimaryIdentityConfirmation(consolidatedCase, confirmation, context) {
  const validation = validatePrimaryIdentityConfirmationContext(confirmation, context)
  if (!validation.valid) {
    const error = new Error(`Invalid primary identity confirmation: ${validation.errors.join("; ")}`)
    error.code = "INVALID_PRIMARY_IDENTITY_CONFIRMATION"
    throw error
  }
  const identity = confirmation.primaryIdentity
  const names = [...new Set([identity.fullName, ...(consolidatedCase.nomesEncontrados || [])])]
  const cpfs = [...new Set([identity.cpf, ...(consolidatedCase.cpfsEncontrados || [])])]
  const removeIdentityMissing = reasons => (reasons || []).filter(reason => !["name_missing", "cpf_missing"].includes(reason))
  const reviewReasons = removeIdentityMissing(consolidatedCase.reviewReasons)
  const blockingReviewReasons = removeIdentityMissing(consolidatedCase.blockingReviewReasons)
  const safeToPlanHubSpot = blockingReviewReasons.length === 0 && cpfs.length === 1 && names.length >= 1
  return {
    ...consolidatedCase,
    nomesEncontrados: names,
    cpfsEncontrados: cpfs,
    reviewReasons,
    blockingReviewReasons,
    safeToPlanHubSpot,
    primaryIdentityConfirmationApplied: true,
    primaryIdentityConfirmationFingerprint: crypto.createHash("sha256").update(JSON.stringify(confirmation)).digest("hex").slice(0, 16)
  }
}

module.exports = {
  STATUS, SOURCE, validCpf,
  validatePrimaryIdentityConfirmationSchema,
  validatePrimaryIdentityConfirmationContext,
  applyPrimaryIdentityConfirmation
}
