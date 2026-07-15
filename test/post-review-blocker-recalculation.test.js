"use strict"

const assert = require("node:assert/strict")
const {
  applyHumanReviewToConsolidation,
  reviewIdForSha256
} = require("../src/domain/human-document-review")

const HASH_A = "a".repeat(64)
const HASH_B = "b".repeat(64)
const CASE_ID = "fictional-case"
const contentId = hash => `C-${hash.slice(0, 20)}`

function review(overrides = {}) {
  return {
    schemaVersion: 1,
    caseImportId: CASE_ID,
    status: "HUMAN_REVIEW_COMPLETED",
    reviewSource: "HUMAN",
    documents: [{ reviewId: reviewIdForSha256(HASH_A), sha256: HASH_A, decision: "APPROVE_AND_KEEP" }],
    ...overrides
  }
}

function context(overrides = {}) {
  return {
    caseImportId: CASE_ID,
    documents: [{ reviewId: reviewIdForSha256(HASH_A), sha256: HASH_A, contentDocumentId: contentId(HASH_A), eligibleForHumanReview: true }],
    ...overrides
  }
}

function consolidated(ignoredFiles = [{
  file: "fictional.pdf", sha256: HASH_A, reason: "pdf_render_failed",
  technicalReviewReason: "pdf_render_failed_requires_human_review"
}], blockers = ["documents_quarantined", "ignored_files_present", "cpf_missing", "name_missing", "safe_contact_key_missing"]) {
  return {
    importId: CASE_ID,
    quarantinedDocuments: [{ file: "fictional.pdf", sha256: HASH_A, reason: "pdf_render_failed_requires_human_review" }],
    ignoredFiles,
    conflicts: ["documents_quarantined"],
    reviewReasons: [...blockers],
    blockingReviewReasons: [...blockers],
    cpfsEncontrados: [], nomesEncontrados: [],
    physicalOccurrences: [
      { physicalDocumentId: "P-fictional-1", sha256: HASH_A },
      { physicalDocumentId: "P-fictional-2", sha256: HASH_A }
    ]
  }
}

function apply(base = consolidated(), artifact = review(), reviewContext = context()) {
  return applyHumanReviewToConsolidation(base, artifact, reviewContext)
}

function main() {
  // 1-2: unreviewed technical failures block; exact valid approval removes only this blocker.
  const unreviewed = apply(consolidated([
    { file: "a.pdf", sha256: HASH_A, reason: "pdf_render_failed", technicalReviewReason: "pdf_render_failed_requires_human_review" },
    { file: "b.pdf", sha256: HASH_B, reason: "pdf_render_failed", technicalReviewReason: "pdf_render_failed_requires_human_review" }
  ]))
  assert.equal(unreviewed.blockingReviewReasons.includes("ignored_files_present"), true)
  const approved = apply()
  assert.equal(approved.blockingReviewReasons.includes("ignored_files_present"), false)

  // 3-6: case, hash, reviewId, content ID and original eligibility all fail closed.
  assert.throws(() => apply(consolidated(), review({ caseImportId: "other-case" })), /caseImportId/)
  assert.throws(() => apply(consolidated(), review({ documents: [{ reviewId: reviewIdForSha256(HASH_B), sha256: HASH_B, decision: "APPROVE_AND_KEEP" }] })), /context/)
  assert.throws(() => apply(consolidated(), review({ documents: [{ reviewId: reviewIdForSha256(HASH_B), sha256: HASH_A, decision: "APPROVE_AND_KEEP" }] })), /reviewId/)
  assert.throws(() => apply(consolidated(), review(), context({ documents: [{ reviewId: reviewIdForSha256(HASH_A), sha256: HASH_A, contentDocumentId: contentId(HASH_B), eligibleForHumanReview: true }] })), /contentDocumentId/)
  assert.throws(() => apply(consolidated(), review(), context({ documents: [{ reviewId: reviewIdForSha256(HASH_A), sha256: HASH_A, contentDocumentId: contentId(HASH_A), eligibleForHumanReview: false }] })), /eligible/)

  // 7-9: pre-existing exclusions remain ignored without creating the blocker.
  for (const reason of ["unsupported_or_invalid_content", "case_document_limit", "file_size_limit"]) {
    const result = apply(consolidated([{ file: "fictional.bin", sha256: HASH_B, reason }]))
    assert.equal(result.ignoredFiles.length, 1)
    assert.equal(result.blockingReviewReasons.includes("ignored_files_present"), false)
  }

  // 10-15: approval adds no identity and preserves every unrelated blocker.
  assert.deepEqual(approved.nomesEncontrados, [])
  assert.deepEqual(approved.cpfsEncontrados, [])
  assert.equal(approved.blockingReviewReasons.includes("name_missing"), true)
  assert.equal(approved.blockingReviewReasons.includes("cpf_missing"), true)
  assert.equal(approved.blockingReviewReasons.includes("safe_contact_key_missing"), true)
  assert.equal(approved.safeToPlanHubSpot, false)

  // 16: invalid multi-document application is atomic because validation precedes transformation.
  const base = consolidated()
  const before = structuredClone(base)
  assert.throws(() => apply(base, review({ documents: [review().documents[0], { reviewId: reviewIdForSha256(HASH_B), sha256: HASH_B, decision: "REJECT" }] })), /Invalid/)
  assert.deepEqual(base, before)

  // 17-18: duplicate physical occurrences remain data only; no CRM or third-party objects appear.
  assert.equal(approved.physicalOccurrences.length, 2)
  assert.equal("thirdParties" in approved || "contacts" in approved || "crmPlan" in approved, false)

  // 19: repeated application is deterministic.
  assert.deepEqual(apply(), apply())

  // 20: unknown fields and invalid sources/decisions fail closed.
  assert.throws(() => apply(consolidated(), { ...review(), unknown: true }), /Invalid/)
  assert.throws(() => apply(consolidated(), review({ reviewSource: "AUTOMATED" })), /Invalid/)
  assert.throws(() => apply(consolidated(), review({ documents: [{ ...review().documents[0], decision: "REJECT" }] })), /Invalid/)

  console.log("post-review-blocker-recalculation.test.js: ok")
}

main()
