"use strict"

const assert = require("node:assert/strict")
const {
  reviewIdForSha256,
  validateHumanReviewSchema,
  validateHumanReviewContext,
  buildHumanReviewCandidates
} = require("../src/domain/human-document-review")
const { consolidateCase } = require("../src/domain/local-case-document-analysis")

const HASH_A = "a".repeat(64)
const HASH_B = "b".repeat(64)
const HASH_C = "c".repeat(64)

function candidateAnalysis(documents = [
  { file: "documents/a.pdf", pageNumber: 1, sha256: HASH_A, reason: "identity_divergence" },
  { file: "documents/b.pdf", pageNumber: 1, sha256: HASH_B, reason: "identity_divergence" }
]) {
  return {
    importId: "synthetic-case-001",
    quarantinedDocuments: documents,
    documentosClassificados: [
      { file: "documents/a.pdf", pageNumber: 1, tipo: "declaracao" },
      { file: "documents/b.pdf", pageNumber: 1, tipo: "other" },
      { file: "documents/not-quarantined.pdf", pageNumber: 1, tipo: "other" }
    ],
    names: ["NEVER_COPY_THIS_NAME"],
    cpfs: ["00000000000"],
    extractedText: "NEVER_COPY_THIS_TEXT",
    phone: "5500000000000"
  }
}

function decisionArtifact(candidatePackage, selected = candidatePackage.documents) {
  return {
    schemaVersion: 1,
    caseImportId: candidatePackage.caseImportId,
    status: "HUMAN_REVIEW_COMPLETED",
    reviewSource: "HUMAN",
    documents: selected.map(document => ({
      reviewId: document.reviewId,
      sha256: document.sha256,
      decision: "APPROVE_AND_KEEP",
      documentOwnerRole: "ASSISTED_PERSON"
    }))
  }
}

function contextFromCandidates(candidatePackage) {
  return {
    caseImportId: candidatePackage.caseImportId,
    documents: candidatePackage.documents.map(document => ({
      reviewId: document.reviewId,
      sha256: document.sha256,
      eligibleForHumanReview: true
    }))
  }
}

function main() {
  const candidates = buildHumanReviewCandidates(candidateAnalysis())
  const validReview = decisionArtifact(candidates)
  const context = contextFromCandidates(candidates)

  // 1. Duplicate hashes fail structural validation.
  const duplicateHash = { ...validReview, documents: [validReview.documents[0], { ...validReview.documents[0], reviewId: reviewIdForSha256(HASH_B) }] }
  assert.equal(validateHumanReviewSchema(duplicateHash).valid, false)

  // 2. A well-formed but nonexistent hash fails contextual validation.
  const nonexistent = decisionArtifact(candidates, [{ reviewId: reviewIdForSha256(HASH_C), sha256: HASH_C }])
  assert.equal(validateHumanReviewContext(nonexistent, context).valid, false)

  // 3. A document belonging only to another case fails in this case inventory.
  const otherCaseDocument = { caseImportId: "synthetic-case-other", documents: [{ reviewId: reviewIdForSha256(HASH_A), sha256: HASH_A, eligibleForHumanReview: true }] }
  assert.equal(validateHumanReviewContext({ ...nonexistent, caseImportId: "synthetic-case-other" }, otherCaseDocument).valid, false)

  // 4. Existing but non-quarantined documents are ineligible.
  const nonEligibleContext = { caseImportId: candidates.caseImportId, documents: [{ reviewId: reviewIdForSha256(HASH_A), sha256: HASH_A, eligibleForHumanReview: false }] }
  assert.equal(validateHumanReviewContext(decisionArtifact(candidates, [candidates.documents[0]]), nonEligibleContext).valid, false)

  // 5. The effective analysis case ID must match.
  assert.equal(validateHumanReviewContext({ ...validReview, caseImportId: "synthetic-case-other" }, context).valid, false)

  // 6-8. IDs repeat, ignore order and change when the immutable hash changes.
  assert.equal(reviewIdForSha256(HASH_A), reviewIdForSha256(HASH_A))
  const reversed = buildHumanReviewCandidates(candidateAnalysis([...candidateAnalysis().quarantinedDocuments].reverse()))
  assert.deepEqual(reversed.documents.map(item => item.reviewId), candidates.documents.map(item => item.reviewId))
  assert.notEqual(reviewIdForSha256(HASH_A), reviewIdForSha256(HASH_B))

  // 9. Only quarantined documents enter the package.
  assert.equal(candidates.documents.length, 2)
  assert.equal(candidates.documents.some(item => item.localReference.includes("not-quarantined")), false)

  // 10. Extracted fields and text are never copied to the candidate package.
  const serializedCandidates = JSON.stringify(candidates)
  for (const forbidden of ["NEVER_COPY_THIS_NAME", "NEVER_COPY_THIS_TEXT", "00000000000", "5500000000000", "names", "cpfs", "extractedText", "phone"] ) {
    assert.equal(serializedCandidates.includes(forbidden), false)
  }

  // 11. reviewId/hash mismatches fail closed.
  const mismatchedIdentity = { ...validReview, documents: [{ ...validReview.documents[0], reviewId: reviewIdForSha256(HASH_B) }] }
  assert.equal(validateHumanReviewContext(mismatchedIdentity, context).valid, false)

  // 12. A valid decision artifact is structurally and contextually accepted.
  assert.equal(validateHumanReviewSchema(validReview).valid, true)
  assert.equal(validateHumanReviewContext(validReview, context).valid, true)

  // 13-17. Valid approvals remove only quarantine and preserve conservative blockers.
  const analyzed = [
    { file: "documents/a.pdf", pageNumber: 1, sha256: HASH_A, names: ["Titular Alfa"], cpfs: [], phones: [], emails: [], processNumbers: [], requestNumbers: [], benefitNumbers: [], benefitTypes: [], birthDates: [], classification: "declaracao", confidence: 0.9 },
    { file: "documents/b.pdf", pageNumber: 1, sha256: HASH_B, names: ["Terceiro Omega"], cpfs: [], phones: [], emails: [], processNumbers: [], requestNumbers: [], benefitNumbers: [], benefitTypes: [], birthDates: [], classification: "other", confidence: 0.9 }
  ]
  const result = consolidateCase({
    sourceFolder: "synthetic-case-folder",
    importId: candidates.caseImportId,
    files: analyzed.map(item => item.file),
    analyzed,
    ignored: [],
    hashes: [HASH_A, HASH_B],
    relativeRoot: ".",
    humanReview: validReview
  })
  assert.equal(result.quarantinedDocuments.length, 0)
  assert.equal(result.conflicts.includes("divergent_names"), true)
  assert.equal(result.nomesEncontrados.length, 2)
  assert.equal(result.safeToPlanHubSpot, false)
  assert.equal("thirdParties" in result || "contacts" in result || "crmPlan" in result, false)
  assert.equal(result.blockingReviewReasons.includes("cpf_missing"), true)

  // 18-19. Unknown fields, short hashes and malformed hashes remain rejected.
  assert.equal(validateHumanReviewSchema({ ...validReview, unexpected: true }).valid, false)
  assert.equal(validateHumanReviewSchema({ ...validReview, documents: [{ ...validReview.documents[0], sha256: "a".repeat(12) }] }).valid, false)
  assert.equal(validateHumanReviewSchema({ ...validReview, documents: [{ ...validReview.documents[0], sha256: "z".repeat(64) }] }).valid, false)
  assert.equal(validateHumanReviewSchema({ ...validReview, reviewSource: "AUTOMATED" }).valid, false)
  assert.equal(validateHumanReviewSchema({ ...validReview, documents: [{ ...validReview.documents[0], decision: "REJECT" }] }).valid, false)

  // 20. Repeated generation is deterministically equivalent.
  assert.deepEqual(buildHumanReviewCandidates(candidateAnalysis()), buildHumanReviewCandidates(candidateAnalysis()))

  console.log("human-document-review.test.js: ok")
}

main()
