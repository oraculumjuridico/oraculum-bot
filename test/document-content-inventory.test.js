"use strict"

const assert = require("node:assert/strict")
const crypto = require("node:crypto")
const {
  buildDocumentContentInventory,
  validateInventory,
  contentDocumentIdForHash,
  physicalDocumentIdFor
} = require("../src/domain/document-content-inventory")
const {
  reviewIdForSha256,
  validateHumanReviewSchema,
  validateHumanReviewContext,
  buildHumanReviewCandidatesFromInventory,
  validateCandidatePackageAgainstInventory,
  applyHumanReviewToContentInventory
} = require("../src/domain/human-document-review")
const { consolidateCase } = require("../src/domain/local-case-document-analysis")

const hashBuffer = buffer => crypto.createHash("sha256").update(buffer).digest("hex")
const QUARANTINED_HASHES = new Set([hashBuffer(Buffer.from("fictional-content-0")), hashBuffer(Buffer.from("fictional-content-1"))])

const occurrencesFixture = () => {
  const occurrences = []
  for (let index = 0; index < 12; index++) occurrences.push({ localReference: `fixtures/copy-${index + 1}.pdf`, buffer: Buffer.from(`fictional-content-${index}`) })
  occurrences.push({ localReference: "fixtures/duplicate-a.pdf", buffer: Buffer.from("fictional-content-0") })
  occurrences.push({ localReference: "fixtures/duplicate-b.pdf", buffer: Buffer.from("fictional-content-1") })
  return occurrences
}

function decisionFor(content, caseImportId) {
  return {
    schemaVersion: 1,
    caseImportId,
    status: "HUMAN_REVIEW_COMPLETED",
    reviewSource: "HUMAN",
    documents: [{ reviewId: reviewIdForSha256(content.sha256), sha256: content.sha256, decision: "APPROVE_AND_KEEP" }]
  }
}

async function main() {
  let ocrCalls = 0
  let classificationCalls = 0
  const analyzeContent = async ({ sha256 }) => {
    ocrCalls++
    classificationCalls++
    const quarantined = QUARANTINED_HASHES.has(sha256)
    return {
      analysisStatus: "ANALYZED",
      extraction: { names: [`FICTITIOUS-${sha256.slice(0, 4)}`], cpfs: [`CPF-${sha256.slice(0, 4)}`] },
      classification: { code: "FICTIONAL_DOCUMENT" },
      quarantined,
      quarantineReasons: quarantined ? ["identity_divergence"] : [],
      documentType: "Documento desconhecido",
      eligibleForHumanReview: quarantined
    }
  }

  const input = occurrencesFixture()
  const inventory = await buildDocumentContentInventory({ caseImportId: "fictional-case", occurrences: input, analyzeContent })

  // 1 and 19: fourteen physical occurrences, twelve unique contents and explicit counts.
  assert.equal(inventory.physicalOccurrences.length, 14)
  assert.equal(inventory.contents.length, 12)
  assert.deepEqual(inventory.counts, { physicalFiles: 14, uniqueContents: 12, analyzedContents: 12, duplicateOccurrences: 2, ignoredContents: 0, quarantinedContents: 2 })

  // 2-3: copies share content while retaining distinct physical identities.
  const duplicatedContent = inventory.contents.find(item => item.occurrenceCount === 2)
  assert.ok(duplicatedContent)
  assert.equal(new Set(duplicatedContent.physicalDocumentIds).size, 2)
  const linkedOccurrences = inventory.physicalOccurrences.filter(item => item.contentDocumentId === duplicatedContent.contentDocumentId)
  assert.equal(linkedOccurrences.length, 2)
  assert.notEqual(linkedOccurrences[0].physicalDocumentId, linkedOccurrences[1].physicalDocumentId)

  // 4-5 and 25: content identity and complete grouping do not depend on input order.
  let reversedCalls = 0
  const reversed = await buildDocumentContentInventory({ caseImportId: "fictional-case", occurrences: [...input].reverse(), analyzeContent: async args => { reversedCalls++; return analyzeContentResult(args.sha256, QUARANTINED_HASHES.has(args.sha256)) } })
  assert.deepEqual(reversed, inventory)
  const repeated = await buildDocumentContentInventory({ caseImportId: "fictional-case", occurrences: input, analyzeContent: async args => analyzeContentResult(args.sha256, QUARANTINED_HASHES.has(args.sha256)) })
  assert.deepEqual(repeated, inventory)

  // 6-7: OCR and classification execute once per content, not once per occurrence.
  assert.equal(ocrCalls, 12)
  assert.equal(classificationCalls, 12)
  assert.equal(reversedCalls, 12)

  // 8-10: duplicate copies do not amplify extracted identity evidence or divergence inputs.
  assert.equal(inventory.contents.flatMap(item => item.extraction.names).length, 12)
  assert.equal(inventory.contents.flatMap(item => item.extraction.cpfs).length, 12)
  const divergentContentCount = inventory.contents.filter(item => item.quarantineReasons.includes("identity_divergence")).length
  assert.equal(divergentContentCount, 2)

  // 11-12: one review candidate per quarantined content with occurrence counts.
  const candidatePackage = buildHumanReviewCandidatesFromInventory(inventory)
  assert.equal(candidatePackage.documents.length, 2)
  assert.equal(candidatePackage.documents.some(item => item.occurrenceCount === 2), true)
  assert.equal(validateCandidatePackageAgainstInventory(candidatePackage, inventory).valid, true)

  // 13: a valid content decision is reflected in every linked physical occurrence.
  const decision = decisionFor(duplicatedContent, inventory.caseImportId)
  const applied = applyHumanReviewToContentInventory(inventory, decision)
  assert.equal(applied.contents.find(item => item.contentDocumentId === duplicatedContent.contentDocumentId).quarantined, false)
  assert.equal(applied.physicalOccurrences.filter(item => item.contentDocumentId === duplicatedContent.contentDocumentId).every(item => item.physicalStatus === "APPROVED_AND_KEPT"), true)

  // 14-16: duplicate decisions, nonexistent hashes and mismatched IDs fail closed.
  assert.equal(validateHumanReviewSchema({ ...decision, documents: [decision.documents[0], { ...decision.documents[0] }] }).valid, false)
  const missingHash = "f".repeat(64)
  const missingDecision = { ...decision, documents: [{ reviewId: reviewIdForSha256(missingHash), sha256: missingHash, decision: "APPROVE_AND_KEEP" }] }
  const context = { caseImportId: inventory.caseImportId, documents: inventory.contents.map(item => ({ reviewId: reviewIdForSha256(item.sha256), sha256: item.sha256, eligibleForHumanReview: item.quarantined })) }
  assert.equal(validateHumanReviewContext(missingDecision, context).valid, false)
  assert.equal(validateHumanReviewContext({ ...decision, documents: [{ ...decision.documents[0], reviewId: reviewIdForSha256(missingHash) }] }, context).valid, false)

  // 17: an occurrence belonging to another content is rejected in the package.
  const wrongOccurrence = candidatePackage.documents.find(item => item.sha256 !== candidatePackage.documents[0].sha256).physicalDocumentIds[0]
  const invalidCandidate = structuredClone(candidatePackage)
  invalidCandidate.documents[0].physicalDocumentIds[0] = wrongOccurrence
  assert.equal(validateCandidatePackageAgainstInventory(invalidCandidate, inventory).valid, false)

  // 18: existing non-quarantined content cannot be reviewed.
  const nonQuarantined = inventory.contents.find(item => !item.quarantined)
  assert.equal(validateHumanReviewContext(decisionFor(nonQuarantined, inventory.caseImportId), context).valid, false)

  // 20: extraction/PII is not copied into the candidate package.
  const candidateText = JSON.stringify(candidatePackage)
  for (const forbidden of ["extraction", "names", "cpfs", "FICTITIOUS-", "CPF-"]) assert.equal(candidateText.includes(forbidden), false)

  // 21: the domain model emits no paths or other logs.
  let logs = 0
  const originalLog = console.log
  console.log = () => { logs++ }
  buildHumanReviewCandidatesFromInventory(inventory)
  console.log = originalLog
  assert.equal(logs, 0)

  // Reader is versioned and fails closed for ambiguous/unknown formats.
  assert.equal(validateInventory({ ...inventory, schemaVersion: 1 }).valid, false)
  assert.equal(validateInventory({ ...inventory, unexpected: true }).valid, false)

  // 22-24: conservative fallback remains in the consolidation layer.
  const quarantineContents = inventory.contents.filter(item => item.quarantined)
  const analyzed = quarantineContents.map((content, index) => ({
    file: `fictional-${index}.pdf`, pageNumber: 1, sha256: content.sha256,
    names: [index === 0 ? "Titular Ficticio" : "Terceiro Imaginario"], cpfs: [], phones: [], emails: [],
    processNumbers: [], requestNumbers: [], benefitNumbers: [], benefitTypes: [], birthDates: [], classification: "other", confidence: 0.9
  }))
  const allDecision = { ...decision, documents: quarantineContents.map(content => ({ reviewId: reviewIdForSha256(content.sha256), sha256: content.sha256, decision: "APPROVE_AND_KEEP" })) }
  const consolidated = consolidateCase({ sourceFolder: "fictional", importId: inventory.caseImportId, files: analyzed.map(item => item.file), analyzed, ignored: [], hashes: analyzed.map(item => item.sha256), relativeRoot: ".", humanReview: allDecision })
  assert.equal(consolidated.conflicts.includes("divergent_names"), true)
  assert.equal(consolidated.safeToPlanHubSpot, false)
  assert.equal("thirdParties" in consolidated || "contacts" in consolidated || "crmPlan" in consolidated, false)

  // Deterministic identities are content-based and occurrence-safe.
  assert.equal(duplicatedContent.contentDocumentId, contentDocumentIdForHash(duplicatedContent.sha256))
  assert.equal(linkedOccurrences[0].physicalDocumentId, physicalDocumentIdFor(linkedOccurrences[0]))
  assert.equal(validateInventory(inventory).valid, true)

  console.log("document-content-inventory.test.js: ok")
}

function analyzeContentResult(hash, quarantined) {
  return {
    analysisStatus: "ANALYZED",
    extraction: { names: [`FICTITIOUS-${hash.slice(0, 4)}`], cpfs: [`CPF-${hash.slice(0, 4)}`] },
    classification: { code: "FICTIONAL_DOCUMENT" },
    quarantined,
    quarantineReasons: quarantined ? ["identity_divergence"] : [],
    documentType: "Documento desconhecido",
    eligibleForHumanReview: quarantined
  }
}

main().catch(error => { console.error(error); process.exitCode = 1 })
