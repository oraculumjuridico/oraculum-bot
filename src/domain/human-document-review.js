"use strict"

const HUMAN_REVIEW_DECISION = Object.freeze({ APPROVE_AND_KEEP: "APPROVE_AND_KEEP" })
const HUMAN_REVIEW_STATUS = "HUMAN_REVIEW_COMPLETED"
const CANDIDATE_STATUS = "PENDING_HUMAN_REVIEW"
const REVIEW_SOURCE = "HUMAN"
const SHA256_PATTERN = /^[a-f0-9]{64}$/i
const REVIEW_ID_PATTERN = /^Q-[a-f0-9]{16}$/

const DOCUMENT_OWNER_ROLE = Object.freeze({
  ASSISTED_PERSON: "ASSISTED_PERSON",
  REPRESENTATIVE: "REPRESENTATIVE",
  AUTHORIZED_CONTACT: "AUTHORIZED_CONTACT"
})

const MENTIONED_IDENTITY_ROLE = Object.freeze({
  INTERESTED_THIRD_PARTY: "INTERESTED_THIRD_PARTY",
  REPRESENTATIVE: "REPRESENTATIVE",
  AUTHORIZED_CONTACT: "AUTHORIZED_CONTACT"
})

const RELATIONSHIP_TYPE = Object.freeze({
  spouse_separated: "spouse_separated",
  dependent: "dependent",
  legal_representative: "legal_representative",
  guardian: "guardian",
  other_legitimately_related: "other_legitimately_related"
})

const SAFE_DOCUMENT_TYPES = new Set([
  "other",
  "Documento desconhecido",
  "documento_identidade",
  "comprovante_residencia",
  "documento_previdenciario",
  "documento_assistencial",
  "declaracao"
])

function reviewIdForSha256(sha256) {
  if (typeof sha256 !== "string" || !SHA256_PATTERN.test(sha256)) {
    const error = new Error("sha256 must be a valid 64-character hex string")
    error.code = "INVALID_DOCUMENT_SHA256"
    throw error
  }
  return `Q-${sha256.toLowerCase().slice(0, 16)}`
}

function validateIsoDate(value, field, errors) {
  if (value === undefined) return
  if (typeof value !== "string" || !value.trim() || Number.isNaN(Date.parse(value))) {
    errors.push(`${field} must be a valid ISO 8601 date string`)
  }
}

function validateReviewDocument(doc) {
  const errors = []
  if (!doc || typeof doc !== "object" || Array.isArray(doc)) return ["document object is required"]
  if (typeof doc.reviewId !== "string" || !REVIEW_ID_PATTERN.test(doc.reviewId)) {
    errors.push("reviewId must match Q- followed by 16 lowercase hexadecimal characters")
  }
  if (typeof doc.sha256 !== "string" || !SHA256_PATTERN.test(doc.sha256)) {
    errors.push("sha256 must be a valid 64-character hex string")
  }
  if (doc.decision !== HUMAN_REVIEW_DECISION.APPROVE_AND_KEEP) {
    errors.push("decision must be APPROVE_AND_KEEP")
  }
  if (doc.documentOwnerRole !== undefined && !Object.values(DOCUMENT_OWNER_ROLE).includes(doc.documentOwnerRole)) {
    errors.push(`documentOwnerRole must be one of: ${Object.keys(DOCUMENT_OWNER_ROLE).join(", ")}`)
  }
  if (doc.allowedMentionedIdentityRoles !== undefined) {
    if (!Array.isArray(doc.allowedMentionedIdentityRoles)) errors.push("allowedMentionedIdentityRoles must be an array")
    else doc.allowedMentionedIdentityRoles.forEach((role, index) => {
      if (!Object.values(MENTIONED_IDENTITY_ROLE).includes(role)) errors.push(`allowedMentionedIdentityRoles[${index}] is invalid`)
    })
  }
  if (doc.relationshipType !== undefined && !Object.values(RELATIONSHIP_TYPE).includes(doc.relationshipType)) {
    errors.push("relationshipType is invalid")
  }
  validateIsoDate(doc.reviewedAt, "reviewedAt", errors)
  const known = new Set(["reviewId", "sha256", "decision", "documentOwnerRole", "allowedMentionedIdentityRoles", "relationshipType", "reviewedAt"])
  Object.keys(doc).forEach(key => { if (!known.has(key)) errors.push(`unknown document field: ${key}`) })
  return errors
}

function validateHumanReviewSchema(review) {
  if (!review || typeof review !== "object" || Array.isArray(review)) return { valid: false, errors: ["review object is required"] }
  const errors = []
  if (!Number.isInteger(review.schemaVersion) || review.schemaVersion !== 1) errors.push("schemaVersion must be 1")
  if (typeof review.caseImportId !== "string" || !review.caseImportId.trim()) errors.push("caseImportId must be a non-empty string")
  if (review.status !== HUMAN_REVIEW_STATUS) errors.push(`status must be ${HUMAN_REVIEW_STATUS}`)
  if (review.reviewSource !== REVIEW_SOURCE) errors.push(`reviewSource must be ${REVIEW_SOURCE}`)
  if (!Array.isArray(review.documents) || review.documents.length === 0) errors.push("documents must be a non-empty array")
  else {
    const hashes = new Set()
    const reviewIds = new Set()
    review.documents.forEach((doc, index) => {
      validateReviewDocument(doc).forEach(error => errors.push(`documents[${index}]: ${error}`))
      if (typeof doc?.sha256 === "string") {
        const hash = doc.sha256.toLowerCase()
        if (hashes.has(hash)) errors.push(`documents[${index}]: duplicate sha256`)
        hashes.add(hash)
      }
      if (typeof doc?.reviewId === "string") {
        if (reviewIds.has(doc.reviewId)) errors.push(`documents[${index}]: duplicate reviewId`)
        reviewIds.add(doc.reviewId)
      }
    })
  }
  validateIsoDate(review.reviewedAt, "reviewedAt", errors)
  const known = new Set(["schemaVersion", "caseImportId", "status", "documents", "reviewedAt", "reviewSource"])
  Object.keys(review).forEach(key => { if (!known.has(key)) errors.push(`unknown top-level field: ${key}`) })
  return { valid: errors.length === 0, errors: errors.length ? errors : undefined }
}

function validateHumanReviewContext(review, context = {}) {
  const structural = validateHumanReviewSchema(review)
  const errors = structural.valid ? [] : [...structural.errors]
  if (typeof context.caseImportId !== "string" || !context.caseImportId) errors.push("context.caseImportId is required")
  else if (review?.caseImportId !== context.caseImportId) errors.push("caseImportId does not match the analyzed case")
  if (!Array.isArray(context.documents)) errors.push("context.documents must be an array")
  else {
    const inventoryByHash = new Map()
    context.documents.forEach((document, index) => {
      if (!document || !SHA256_PATTERN.test(String(document.sha256 || ""))) {
        errors.push(`context.documents[${index}] has invalid sha256`)
        return
      }
      const hash = document.sha256.toLowerCase()
      if (inventoryByHash.has(hash)) errors.push(`context.documents[${index}] has duplicate sha256`)
      inventoryByHash.set(hash, document)
    })
    if (Array.isArray(review?.documents)) review.documents.forEach((decision, index) => {
      const inventoryDocument = inventoryByHash.get(String(decision.sha256 || "").toLowerCase())
      if (!inventoryDocument) errors.push(`documents[${index}]: sha256 is not present in this case inventory`)
      else {
        if (inventoryDocument.eligibleForHumanReview !== true) errors.push(`documents[${index}]: document is not eligible for human review`)
        const expectedId = inventoryDocument.reviewId || reviewIdForSha256(inventoryDocument.sha256)
        if (decision.reviewId !== expectedId || decision.reviewId !== reviewIdForSha256(decision.sha256)) {
          errors.push(`documents[${index}]: reviewId and sha256 do not identify the same document`)
        }
      }
    })
  }
  return { valid: errors.length === 0, errors: errors.length ? errors : undefined }
}

function assertValidHumanReviewContext(review, context) {
  const structural = validateHumanReviewSchema(review)
  if (!structural.valid) {
    const error = new Error(`Invalid human review schema: ${structural.errors.join("; ")}`)
    error.code = "INVALID_HUMAN_REVIEW_SCHEMA"
    throw error
  }
  const validation = validateHumanReviewContext(review, context)
  if (!validation.valid) {
    const error = new Error(`Invalid human review context: ${validation.errors.join("; ")}`)
    error.code = validation.errors.some(item => item.includes("caseImportId")) ? "HUMAN_REVIEW_CASE_MISMATCH" : "INVALID_HUMAN_REVIEW_CONTEXT"
    throw error
  }
  return true
}

function sanitizeQuarantineReason(value) {
  return /^[a-z][a-z0-9_]{0,63}$/.test(String(value || "")) ? String(value) : "identity_divergence"
}

function buildHumanReviewCandidates(analysis = {}) {
  const caseImportId = analysis.importId || analysis.caseImportId
  if (typeof caseImportId !== "string" || !caseImportId) throw new Error("analysis caseImportId is required")
  const quarantined = Array.isArray(analysis.quarantinedDocuments) ? analysis.quarantinedDocuments : []
  const classified = Array.isArray(analysis.documentosClassificados) ? analysis.documentosClassificados : []
  const byHash = new Map()
  quarantined.forEach((document, index) => {
    if (!document || !SHA256_PATTERN.test(String(document.sha256 || ""))) {
      const error = new Error(`quarantinedDocuments[${index}] must contain a full sha256`)
      error.code = "INVALID_QUARANTINED_DOCUMENT"
      throw error
    }
    const sha256 = document.sha256.toLowerCase()
    if (byHash.has(sha256)) return
    const classification = classified.find(item => item.file === document.file && (!document.pageNumber || item.pageNumber === document.pageNumber))
    const documentType = SAFE_DOCUMENT_TYPES.has(classification?.tipo) ? classification.tipo : undefined
    byHash.set(sha256, {
      reviewId: reviewIdForSha256(sha256),
      sha256,
      localReference: String(document.file || ""),
      quarantineReason: sanitizeQuarantineReason(document.reason),
      ...(documentType ? { documentType } : {}),
      status: CANDIDATE_STATUS
    })
  })
  return {
    schemaVersion: 1,
    caseImportId,
    status: CANDIDATE_STATUS,
    documents: [...byHash.values()].sort((left, right) => left.reviewId.localeCompare(right.reviewId))
  }
}

function buildHumanReviewCandidatesFromInventory(inventory = {}) {
  const { validateInventory } = require("./document-content-inventory")
  const validation = validateInventory(inventory)
  if (!validation.valid) {
    const error = new Error(`invalid document inventory: ${validation.errors.join("; ")}`)
    error.code = "INVALID_DOCUMENT_INVENTORY"
    throw error
  }
  const occurrenceById = new Map(inventory.physicalOccurrences.map(item => [item.physicalDocumentId, item]))
  return {
    schemaVersion: 2,
    caseImportId: inventory.caseImportId,
    status: CANDIDATE_STATUS,
    documents: inventory.contents.filter(content => content.quarantined && content.eligibleForHumanReview).map(content => ({
      reviewId: reviewIdForSha256(content.sha256),
      contentDocumentId: content.contentDocumentId,
      sha256: content.sha256,
      occurrenceCount: content.occurrenceCount,
      physicalDocumentIds: [...content.physicalDocumentIds],
      localReferences: content.physicalDocumentIds.map(id => occurrenceById.get(id).localReference),
      quarantineReason: content.quarantineReasons[0] || "identity_divergence",
      documentType: content.documentType,
      status: CANDIDATE_STATUS
    })).sort((left, right) => left.reviewId.localeCompare(right.reviewId))
  }
}

function validateCandidatePackageAgainstInventory(candidatePackage, inventory) {
  const errors = []
  if (candidatePackage?.schemaVersion !== 2) errors.push("candidate schemaVersion must be 2")
  if (candidatePackage?.caseImportId !== inventory?.caseImportId) errors.push("candidate caseImportId mismatch")
  if (candidatePackage?.status !== CANDIDATE_STATUS) errors.push("candidate status mismatch")
  if (!Array.isArray(candidatePackage?.documents)) errors.push("candidate documents must be an array")
  const contentByHash = new Map((inventory?.contents || []).map(item => [item.sha256, item]))
  const occurrenceById = new Map((inventory?.physicalOccurrences || []).map(item => [item.physicalDocumentId, item]))
  if (Array.isArray(candidatePackage?.documents)) candidatePackage.documents.forEach((candidate, index) => {
    const content = contentByHash.get(candidate.sha256)
    if (!content) errors.push(`documents[${index}] content does not exist`)
    else {
      if (!content.quarantined || !content.eligibleForHumanReview) errors.push(`documents[${index}] content is not eligible`)
      if (candidate.reviewId !== reviewIdForSha256(content.sha256) || candidate.contentDocumentId !== content.contentDocumentId) errors.push(`documents[${index}] content identity mismatch`)
      if (candidate.occurrenceCount !== content.occurrenceCount) errors.push(`documents[${index}] occurrenceCount mismatch`)
      if (JSON.stringify(candidate.physicalDocumentIds) !== JSON.stringify(content.physicalDocumentIds)) errors.push(`documents[${index}] physical occurrence mismatch`)
      candidate.physicalDocumentIds?.forEach(id => {
        const occurrence = occurrenceById.get(id)
        if (!occurrence || occurrence.contentDocumentId !== content.contentDocumentId) errors.push(`documents[${index}] occurrence belongs to different content`)
      })
    }
  })
  return { valid: errors.length === 0, errors: errors.length ? errors : undefined }
}

function applyHumanReviewToContentInventory(inventory, humanReview) {
  const context = {
    caseImportId: inventory.caseImportId,
    documents: inventory.contents.map(content => ({
      reviewId: reviewIdForSha256(content.sha256),
      sha256: content.sha256,
      eligibleForHumanReview: content.quarantined && content.eligibleForHumanReview
    }))
  }
  assertValidHumanReviewContext(humanReview, context)
  const approvedHashes = new Set(humanReview.documents.map(item => item.sha256))
  const approvedContentIds = new Set(inventory.contents.filter(item => approvedHashes.has(item.sha256)).map(item => item.contentDocumentId))
  return {
    ...inventory,
    physicalOccurrences: inventory.physicalOccurrences.map(item => approvedContentIds.has(item.contentDocumentId) ? { ...item, physicalStatus: "APPROVED_AND_KEPT" } : { ...item }),
    contents: inventory.contents.map(item => approvedHashes.has(item.sha256) ? { ...item, quarantined: false, eligibleForHumanReview: false } : { ...item }),
    counts: { ...inventory.counts, quarantinedContents: inventory.contents.filter(item => item.quarantined && !approvedHashes.has(item.sha256)).length }
  }
}

function findHumanReviewForDocument(humanReview, documentSha256) {
  return humanReview?.documents?.find(document => String(document.sha256 || "").toLowerCase() === String(documentSha256 || "").toLowerCase()) || null
}

function shouldQuarantineDocumentWithReview(analyzedItem, cpfs, divergentNames, humanReview) {
  if (findHumanReviewForDocument(humanReview, analyzedItem.sha256)?.decision === HUMAN_REVIEW_DECISION.APPROVE_AND_KEEP) return false
  return Boolean(
    (cpfs.length > 1 && analyzedItem.cpfs.length && analyzedItem.cpfs.some(cpf => cpf !== cpfs[0])) ||
    (divergentNames && analyzedItem.names.length)
  )
}

function applyHumanReviewToConsolidation(consolidatedCase, humanReview, context) {
  assertValidHumanReviewContext(humanReview, context)
  const approved = new Set(humanReview.documents.map(document => document.sha256.toLowerCase()))
  const quarantinedDocuments = (consolidatedCase.quarantinedDocuments || []).filter(document => !approved.has(String(document.sha256 || "").toLowerCase()))
  const conflicts = [...(consolidatedCase.conflicts || [])]
  if (!quarantinedDocuments.length) {
    const index = conflicts.indexOf("documents_quarantined")
    if (index >= 0) conflicts.splice(index, 1)
  }
  const preservedBlocking = (consolidatedCase.blockingReviewReasons || []).filter(reason => reason !== "documents_quarantined")
  if (quarantinedDocuments.length && !preservedBlocking.includes("documents_quarantined")) preservedBlocking.push("documents_quarantined")
  const safeToPlanHubSpot = preservedBlocking.length === 0 && consolidatedCase.cpfsEncontrados.length === 1 && consolidatedCase.nomesEncontrados.length >= 1
  return { ...consolidatedCase, quarantinedDocuments, conflicts, blockingReviewReasons: preservedBlocking, safeToPlanHubSpot, humanReviewApplied: true, humanReviewStatus: humanReview.status }
}

module.exports = {
  HUMAN_REVIEW_DECISION, HUMAN_REVIEW_STATUS, CANDIDATE_STATUS, REVIEW_SOURCE,
  DOCUMENT_OWNER_ROLE, MENTIONED_IDENTITY_ROLE, RELATIONSHIP_TYPE,
  reviewIdForSha256, validateHumanReviewSchema, validateReviewDocument,
  validateHumanReviewContext, assertValidHumanReviewContext, buildHumanReviewCandidates,
  buildHumanReviewCandidatesFromInventory, validateCandidatePackageAgainstInventory, applyHumanReviewToContentInventory,
  findHumanReviewForDocument, shouldQuarantineDocumentWithReview, applyHumanReviewToConsolidation
}
