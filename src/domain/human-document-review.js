"use strict"

const HUMAN_REVIEW_DECISION = Object.freeze({
  APPROVE_AND_KEEP: "APPROVE_AND_KEEP"
})

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

function validateHumanReviewSchema(review) {
  if (!review) {
    return { valid: false, errors: ["review object is required"] }
  }

  const errors = []

  // Version check
  if (!Number.isInteger(review.schemaVersion) || review.schemaVersion < 1) {
    errors.push("schemaVersion must be a positive integer")
  }

  // Case ID check
  if (typeof review.caseImportId !== "string" || !review.caseImportId.trim()) {
    errors.push("caseImportId must be a non-empty string")
  }

  // Status check
  if (review.status !== "HUMAN_REVIEW_COMPLETED" && review.status !== "HUMAN_REVIEW_PENDING") {
    errors.push(`status must be HUMAN_REVIEW_COMPLETED or HUMAN_REVIEW_PENDING, got: ${review.status}`)
  }

  // Documents array check
  if (!Array.isArray(review.documents)) {
    errors.push("documents must be an array")
  } else {
    review.documents.forEach((doc, index) => {
      const docErrors = validateReviewDocument(doc)
      docErrors.forEach(err => errors.push(`documents[${index}]: ${err}`))
    })
  }

  // Reviewed at check (optional but if present, must be valid ISO date)
  if (review.reviewedAt !== undefined && typeof review.reviewedAt === "string") {
    try {
      new Date(review.reviewedAt).toISOString()
    } catch {
      errors.push("reviewedAt must be a valid ISO 8601 date string")
    }
  }

  // No unknown top-level fields
  const knownFields = new Set(["schemaVersion", "caseImportId", "status", "documents", "reviewedAt", "reviewSource"])
  Object.keys(review).forEach(key => {
    if (!knownFields.has(key)) {
      errors.push(`unknown top-level field: ${key}`)
    }
  })

  return {
    valid: errors.length === 0,
    errors: errors.length > 0 ? errors : undefined
  }
}

function validateReviewDocument(doc) {
  const errors = []

  if (!doc) {
    errors.push("document object is required")
    return errors
  }

  // SHA-256 check (64 hex chars)
  if (typeof doc.sha256 !== "string" || !/^[a-f0-9]{64}$/i.test(doc.sha256)) {
    errors.push("sha256 must be a valid 64-character hex string")
  }

  // Decision check
  if (!Object.values(HUMAN_REVIEW_DECISION).includes(doc.decision)) {
    errors.push(`decision must be one of: ${Object.keys(HUMAN_REVIEW_DECISION).join(", ")}, got: ${doc.decision}`)
  }

  // Document owner role check (optional)
  if (doc.documentOwnerRole !== undefined && !Object.values(DOCUMENT_OWNER_ROLE).includes(doc.documentOwnerRole)) {
    errors.push(`documentOwnerRole must be one of: ${Object.keys(DOCUMENT_OWNER_ROLE).join(", ")}, got: ${doc.documentOwnerRole}`)
  }

  // Allowed mentioned identity roles (optional, array of allowed roles)
  if (doc.allowedMentionedIdentityRoles !== undefined) {
    if (!Array.isArray(doc.allowedMentionedIdentityRoles)) {
      errors.push("allowedMentionedIdentityRoles must be an array or undefined")
    } else {
      doc.allowedMentionedIdentityRoles.forEach((role, idx) => {
        if (!Object.values(MENTIONED_IDENTITY_ROLE).includes(role)) {
          errors.push(`allowedMentionedIdentityRoles[${idx}] must be one of: ${Object.keys(MENTIONED_IDENTITY_ROLE).join(", ")}, got: ${role}`)
        }
      })
    }
  }

  // Relationship type (optional)
  if (doc.relationshipType !== undefined && !Object.values(RELATIONSHIP_TYPE).includes(doc.relationshipType)) {
    errors.push(`relationshipType must be one of: ${Object.keys(RELATIONSHIP_TYPE).join(", ")}, got: ${doc.relationshipType}`)
  }

  // Review source (optional, only HUMAN allowed)
  if (doc.reviewSource !== undefined && doc.reviewSource !== "HUMAN") {
    errors.push("reviewSource must be HUMAN or undefined, got: " + doc.reviewSource)
  }

  // Reviewed at (optional ISO date)
  if (doc.reviewedAt !== undefined && typeof doc.reviewedAt === "string") {
    try {
      new Date(doc.reviewedAt).toISOString()
    } catch {
      errors.push("reviewedAt must be a valid ISO 8601 date string")
    }
  }

  // No unknown doc fields
  const knownDocFields = new Set([
    "sha256", "decision", "documentOwnerRole", "allowedMentionedIdentityRoles",
    "relationshipType", "reviewSource", "reviewedAt"
  ])
  Object.keys(doc).forEach(key => {
    if (!knownDocFields.has(key)) {
      errors.push(`unknown document field: ${key}`)
    }
  })

  return errors
}

function findHumanReviewForDocument(humanReview, documentSha256) {
  if (!humanReview || !Array.isArray(humanReview.documents)) {
    return null
  }
  return humanReview.documents.find(doc => doc.sha256 === documentSha256) || null
}

function shouldQuarantineDocumentWithReview(analyzedItem, cpfs, divergentNames, humanReview) {
  // Find review for this document
  const review = findHumanReviewForDocument(humanReview, analyzedItem.sha256 || "")

  // If approved by human, don't quarantine for identity_divergence
  if (review && review.decision === HUMAN_REVIEW_DECISION.APPROVE_AND_KEEP) {
    return false
  }

  // Otherwise apply original logic
  const quarantineReasons = []
  if (cpfs.length > 1 && analyzedItem.cpfs.length && analyzedItem.cpfs.some(cpf => cpf !== cpfs[0])) {
    quarantineReasons.push("multiple_cpfs")
  }
  if (divergentNames && analyzedItem.names.length) {
    quarantineReasons.push("divergent_names")
  }

  return quarantineReasons.length > 0
}

function applyHumanReviewToConsolidation(consolidatedCase, humanReview) {
  if (!humanReview || humanReview.status === "HUMAN_REVIEW_PENDING") {
    return consolidatedCase
  }

  const validation = validateHumanReviewSchema(humanReview)
  if (!validation.valid) {
    const error = new Error(`Invalid human review schema: ${validation.errors.join("; ")}`)
    error.code = "INVALID_HUMAN_REVIEW_SCHEMA"
    throw error
  }

  // Case ID must match
  if (humanReview.caseImportId !== consolidatedCase.importId) {
    const error = new Error(`Human review case ID mismatch: expected ${consolidatedCase.importId}, got ${humanReview.caseImportId}`)
    error.code = "HUMAN_REVIEW_CASE_MISMATCH"
    throw error
  }

  // Re-evaluate quarantined documents based on human review
  const originalQuarantined = consolidatedCase.quarantinedDocuments || []
  const approvedByHuman = new Set(
    humanReview.documents
      .filter(doc => doc.decision === HUMAN_REVIEW_DECISION.APPROVE_AND_KEEP)
      .map(doc => doc.sha256)
  )

  const updatedQuarantined = originalQuarantined.filter(quarantinedDoc => {
    return !approvedByHuman.has(quarantinedDoc.sha256 || "")
  })

  // If quarantined documents were removed, update conflicts
  const hadQuarantined = originalQuarantined.length > 0
  const hasQuarantined = updatedQuarantined.length > 0

  let updatedConflicts = [...consolidatedCase.conflicts]
  if (hadQuarantined && !hasQuarantined) {
    updatedConflicts = updatedConflicts.filter(c => c !== "documents_quarantined")
  }

  // Recalculate blocking reasons
  const updatedBlockingReasons = updatedConflicts
    .filter(reason => !["official_number_missing", "negocio_sem_numero_oficial"].includes(reason))

  // Recalculate safeToPlanHubSpot
  const safeToPlanHubSpot = updatedBlockingReasons.length === 0
    && consolidatedCase.cpfsEncontrados.length === 1
    && consolidatedCase.nomesEncontrados.length >= 1

  return {
    ...consolidatedCase,
    quarantinedDocuments: updatedQuarantined,
    conflicts: updatedConflicts,
    blockingReviewReasons: updatedBlockingReasons,
    safeToPlanHubSpot,
    humanReviewApplied: true,
    humanReviewStatus: humanReview.status
  }
}

module.exports = {
  HUMAN_REVIEW_DECISION,
  DOCUMENT_OWNER_ROLE,
  MENTIONED_IDENTITY_ROLE,
  RELATIONSHIP_TYPE,
  validateHumanReviewSchema,
  validateReviewDocument,
  findHumanReviewForDocument,
  shouldQuarantineDocumentWithReview,
  applyHumanReviewToConsolidation
}
