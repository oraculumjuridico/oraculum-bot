"use strict"

const assert = require("node:assert/strict")
const fsp = require("node:fs/promises")
const os = require("node:os")
const path = require("node:path")
const {
  buildDocumentContentInventory,
  technicalReviewAnalysis,
  validateInventory
} = require("../src/domain/document-content-inventory")
const {
  buildHumanReviewCandidatesFromInventory,
  validateCandidatePackageAgainstInventory,
  validateHumanReviewContext
} = require("../src/domain/human-document-review")
const { analyzeCaseFolder, consolidateCase } = require("../src/domain/local-case-document-analysis")

function pdfFixture() {
  return Buffer.from("%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\n%%EOF\n")
}

async function main() {
  const renderable = Buffer.from("renderable-fictional-pdf")
  const incompatible = Buffer.from("incompatible-fictional-pdf")
  const corrupt = Buffer.from("corrupt-fictional-pdf")
  const protectedPdf = Buffer.from("protected-fictional-pdf")
  const disguised = Buffer.from("not-a-pdf-fictional-content")
  const technical = new Map([
    [incompatible.toString(), "pdf_render_failed_requires_human_review"],
    [corrupt.toString(), "pdf_corrupt_requires_human_review"],
    [protectedPdf.toString(), "pdf_password_required_human_review"],
    [disguised.toString(), "pdf_content_mismatch_requires_human_review"]
  ])
  const occurrences = [
    { localReference: "fixtures/normal.pdf", buffer: renderable },
    { localReference: "fixtures/incompatible-a.pdf", buffer: incompatible },
    { localReference: "fixtures/incompatible-b.pdf", buffer: incompatible },
    { localReference: "fixtures/corrupt.pdf", buffer: corrupt },
    { localReference: "fixtures/protected.pdf", buffer: protectedPdf },
    { localReference: "fixtures/disguised.pdf", buffer: disguised }
  ]
  let calls = 0
  const analyzeContent = async ({ buffer }) => {
    calls += 1
    const reason = technical.get(buffer.toString())
    return reason ? technicalReviewAnalysis(reason) : {
      analysisStatus: "ANALYZED", extraction: {}, classification: {}, quarantined: false,
      quarantineReasons: [], documentType: "Documento desconhecido", eligibleForHumanReview: false
    }
  }
  const inventory = await buildDocumentContentInventory({ caseImportId: "fictional-pdf-case", occurrences, analyzeContent })
  const candidates = buildHumanReviewCandidatesFromInventory(inventory)

  assert.equal(calls, 5)
  assert.deepEqual(inventory.counts, { physicalFiles: 6, uniqueContents: 5, analyzedContents: 1, technicalFailureContents: 4, duplicateOccurrences: 1, ignoredContents: 0, quarantinedContents: 4 })
  assert.equal(candidates.documents.length, 4)
  assert.equal(candidates.documents.filter(item => item.occurrenceCount === 2).length, 1)
  assert.equal(validateInventory(inventory).valid, true)
  assert.equal(validateCandidatePackageAgainstInventory(candidates, inventory).valid, true)
  assert.equal(candidates.documents.every(item => item.sha256.length === 64 && item.contentDocumentId === `C-${item.sha256.slice(0, 20)}`), true)
  assert.equal(candidates.documents.some(item => item.quarantineReason === "pdf_render_failed_requires_human_review"), true)
  assert.equal(candidates.documents.some(item => item.localReferences.includes("fixtures/normal.pdf")), false)

  const repeated = await buildDocumentContentInventory({ caseImportId: "fictional-pdf-case", occurrences: [...occurrences].reverse(), analyzeContent })
  assert.deepEqual(repeated, inventory)
  assert.throws(() => technicalReviewAnalysis("PDF RENDER FAILED"), /sanitized/)

  const context = { caseImportId: inventory.caseImportId, documents: inventory.contents.map(item => ({ reviewId: `Q-${item.sha256.slice(0, 16)}`, sha256: item.sha256, eligibleForHumanReview: item.eligibleForHumanReview })) }
  const candidate = candidates.documents[0]
  assert.equal(validateHumanReviewContext({ schemaVersion: 1, caseImportId: inventory.caseImportId, status: "HUMAN_REVIEW_COMPLETED", reviewSource: "HUMAN", documents: [{ reviewId: candidate.reviewId, sha256: "f".repeat(64), decision: "APPROVE_AND_KEEP" }] }, context).valid, false)

  const root = await fsp.mkdtemp(path.join(os.tmpdir(), "oraculum-pdf-fallback-"))
  try {
    await fsp.writeFile(path.join(root, "fictional.pdf"), pdfFixture())
    let logs = 0
    const originalLog = console.log
    console.log = () => { logs += 1 }
    const failed = await analyzeCaseFolder(root, { renderPdfPages: async () => { throw Object.assign(new Error("fictional renderer incompatibility"), { code: "PDF_RENDER_ERROR" }) } })
    console.log = originalLog
    assert.equal(logs, 0)
    assert.equal(failed.quarantinedDocuments.length, 1)
    assert.equal(failed.quarantinedDocuments[0].reason, "pdf_render_failed_requires_human_review")
    assert.equal(failed.safeToPlanHubSpot, false)
    assert.equal("thirdParties" in failed || "contacts" in failed || "crmPlan" in failed, false)
    assert.equal(failed.reviewReasons.includes("ignored_files_present"), true)

    await fsp.writeFile(path.join(root, "disguised.pdf"), disguised)
    const mismatch = await analyzeCaseFolder(root, { renderPdfPages: async () => ({ pages: [Buffer.from("unused")], totalPages: 1, truncated: false }) })
    assert.equal(mismatch.quarantinedDocuments.some(item => item.reason === "pdf_content_mismatch_requires_human_review"), true)
    assert.equal(mismatch.safeToPlanHubSpot, false)
  } finally {
    await fsp.rm(root, { recursive: true, force: true })
  }

  const preserved = consolidateCase({ sourceFolder: "fictional", importId: "fictional", files: ["one.pdf"], analyzed: [], ignored: [{ file: "one.pdf", sha256: "a".repeat(64), reason: "pdf_render_failed", technicalReviewReason: "pdf_render_failed_requires_human_review" }], hashes: ["a".repeat(64)], relativeRoot: "." })
  assert.equal(preserved.blockingReviewReasons.includes("documents_quarantined"), true)
  assert.equal(preserved.safeToPlanHubSpot, false)

  console.log("pdf-technical-review-fallback.test.js: ok")
}

main().catch(error => { console.error(error); process.exitCode = 1 })
