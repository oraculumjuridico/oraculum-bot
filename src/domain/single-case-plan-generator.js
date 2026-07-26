"use strict"

const crypto = require("node:crypto")
const path = require("node:path")
const { validateFormat } = require("./case-number")
const { caseFingerprintFor } = require("./single-case-target")
const { montarTituloNegocioHubSpot } = require("./hubspot-deal-title")
const { canonicalCaseFromAnalysis, canonicalCaseToHubSpot, mergeNonEmpty } = require("./canonical-case")

const HASH = /^[a-f0-9]{64}$/
const CONTENT_ID = /^C-[a-f0-9]{20}$/
const FINGERPRINT = /^[a-f0-9]{12}$/
const LOGICAL_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{2,127}$/
const fail = code => { throw new Error(code) }
const hash = value => crypto.createHash("sha256").update(String(value)).digest("hex")
const clone = value => structuredClone(value)

function validDestination(value) {
  return value && LOGICAL_ID.test(value.logicalId || "") && typeof value.name === "string" && value.name.trim() === value.name && value.name.length > 0 && value.name.length <= 200
}

function generateSingleCaseApplyPlan({ identityConfirmed, basePlan, caseNumber, caseImportId, fingerprint, driveRules, contentFiles } = {}) {
  if (!identityConfirmed || identityConfirmed.schemaVersion !== 1 || identityConfirmed.identityConfirmationApplied !== true || identityConfirmed.safeToPlanHubSpot !== true || !identityConfirmed.reviewedInventory) fail("IDENTITY_CONFIRMED_INVALID")
  if (typeof caseImportId !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._:-]{2,127}$/.test(caseImportId) || identityConfirmed.caseImportId !== caseImportId || basePlan?.caseImportId !== caseImportId) fail("CASE_IMPORT_ID_INVALID")
  if (!FINGERPRINT.test(fingerprint || "") || caseFingerprintFor(caseImportId) !== fingerprint) fail("FINGERPRINT_INVALID")
  if (!validateFormat(caseNumber) || basePlan?.dealPlan?.caseNumber !== caseNumber || basePlan?.dealPlan?.properties?.numero_de_caso !== caseNumber) fail("CASE_NUMBER_INVALID")

  const inventory = identityConfirmed.reviewedInventory
  if (!Array.isArray(inventory.contents) || !Array.isArray(inventory.physicalOccurrences) || !contentFiles || typeof contentFiles !== "object") fail("CONTENT_INVENTORY_INVALID")
  const declared = basePlan?.documentPlan
  if (!declared || !Number.isInteger(declared.uniqueContents) || declared.uniqueContents < 1 || !Number.isInteger(declared.physicalOccurrences) || declared.physicalOccurrences < 1 || !Number.isInteger(declared.ignoredNonDocumentContents) || declared.ignoredNonDocumentContents < 0 || !Number.isInteger(declared.binaryDuplicateOccurrences) || declared.binaryDuplicateOccurrences < 0) fail("CONTENT_COUNT_DECLARATION_INVALID")
  if (inventory.contents.length !== declared.uniqueContents) fail("CONTENT_INVENTORY_INVALID")
  if (inventory.physicalOccurrences.length !== declared.physicalOccurrences) fail("OCCURRENCE_COUNT_MISMATCH")
  if (inventory.physicalOccurrences.length - inventory.contents.length !== declared.binaryDuplicateOccurrences) fail("DUPLICATE_OCCURRENCE_COUNT_MISMATCH")

  const ids = new Set(), hashes = new Set(), contents = []
  for (const source of inventory.contents) {
    if (!HASH.test(source?.sha256 || "")) fail("CONTENT_HASH_MISSING")
    if (hashes.has(source.sha256)) fail("CONTENT_HASH_DUPLICATED")
    hashes.add(source.sha256)
    const contentDocumentId = source.contentDocumentId
    if (!CONTENT_ID.test(contentDocumentId || "") || contentDocumentId !== `C-${source.sha256.slice(0, 20)}` || ids.has(contentDocumentId)) fail("CONTENT_ID_COLLISION")
    ids.add(contentDocumentId)
    const eligible = source.analysisStatus !== "IGNORED" && source.quarantined !== true
    contents.push({ contentDocumentId, sha256: source.sha256, eligible, kind: eligible ? "document" : "non_document", caseLinked: true })
  }
  contents.sort((a, b) => a.sha256.localeCompare(b.sha256))
  const eligibleContentCount = contents.filter(item => item.eligible).length
  if (contents.length - eligibleContentCount !== declared.ignoredNonDocumentContents || eligibleContentCount < 1) fail("ELIGIBLE_CONTENT_COUNT_MISMATCH")

  const occurrenceSources = [...inventory.physicalOccurrences].sort((a, b) => String(a.physicalDocumentId).localeCompare(String(b.physicalDocumentId)))
  const ordinals = new Map(), occurrences = [], candidates = new Map()
  for (const occurrence of occurrenceSources) {
    const content = contents.find(item => item.contentDocumentId === occurrence?.contentDocumentId)
    if (!content || occurrence.sha256 !== content.sha256) fail("OCCURRENCE_CONTENT_MISSING")
    const file = contentFiles[occurrence.physicalDocumentId]
    if (!file || typeof file.relativePath !== "string" || path.isAbsolute(file.relativePath) || file.relativePath.includes("\0") || file.relativePath.split(/[\\/]/).includes("..") || file.sha256 !== content.sha256 || !Number.isInteger(file.size) || file.size < 1) fail("CONTENT_INVENTORY_INVALID")
    const ordinal = (ordinals.get(content.contentDocumentId) || 0) + 1
    ordinals.set(content.contentDocumentId, ordinal)
    const extension = /^\.[a-z0-9]{1,10}$/i.test(path.extname(file.relativePath)) ? path.extname(file.relativePath).toLowerCase() : ".bin"
    occurrences.push({ contentDocumentId: content.contentDocumentId, sha256: content.sha256, logicalName: `${content.contentDocumentId.toLowerCase()}-${String(ordinal).padStart(2, "0")}${extension}` })
    const list = candidates.get(content.contentDocumentId) || []
    list.push({ contentDocumentId: content.contentDocumentId, reference: content.contentDocumentId, relativePath: file.relativePath.replace(/\\/g, "/"), sha256: content.sha256, size: file.size })
    candidates.set(content.contentDocumentId, list)
  }
  if (occurrences.length !== declared.physicalOccurrences) fail("OCCURRENCE_COUNT_MISMATCH")

  const manifest = contents.filter(item => item.eligible).map(item => {
    const choices = (candidates.get(item.contentDocumentId) || []).sort((a, b) => a.relativePath.localeCompare(b.relativePath))
    if (!choices.length || choices.some(choice => choice.sha256 !== choices[0].sha256 || choice.size !== choices[0].size)) fail("CONTENT_INVENTORY_INVALID")
    return choices[0]
  }).sort((a, b) => a.contentDocumentId.localeCompare(b.contentDocumentId))
  if (manifest.length !== eligibleContentCount) fail("ELIGIBLE_CONTENT_COUNT_MISMATCH")

  const area = { logicalId: `area:${hash(driveRules?.areaName || "").slice(0, 20)}`, name: driveRules?.areaName }
  const caseDestination = { logicalId: `case:${fingerprint}`, name: driveRules?.caseName }
  if (!validDestination(area)) fail("DRIVE_AREA_DESTINATION_INVALID")
  if (!validDestination(caseDestination)) fail("DRIVE_CASE_DESTINATION_INVALID")
  if (!LOGICAL_ID.test(area.logicalId) || !LOGICAL_ID.test(caseDestination.logicalId)) fail("DRIVE_LOGICAL_ID_INVALID")

  const rawAreaJuridica = basePlan?.dealPlan?.properties?.area_juridica
  if (!rawAreaJuridica || typeof rawAreaJuridica !== "string" || String(rawAreaJuridica).trim() === "") fail("DEAL_AREA_JURIDICA_MISSING")

  const plan = clone(basePlan)
  const canonicalCase = canonicalCaseFromAnalysis({
    analysis: identityConfirmed,
    caseNumber,
    provenance: {
      sourceSnapshotSha256: identityConfirmed.traceability?.sourceSnapshotSha256,
      documentReviewArtifactSha256: identityConfirmed.traceability?.documentReviewArtifactSha256
    }
  })
  const hubspot = canonicalCaseToHubSpot(canonicalCase)
  plan.contactPlan.properties = mergeNonEmpty(plan.contactPlan.properties, hubspot.contact)
  plan.dealPlan.properties = {
    ...mergeNonEmpty(plan.dealPlan.properties, hubspot.deal),
    dealname: montarTituloNegocioHubSpot({
      area: plan.dealPlan.properties.area_juridica,
      numeroCaso: plan.dealPlan.caseNumber,
      tipo_de_caso: plan.dealPlan.properties.tipo_de_caso,
      subtipo: plan.dealPlan.properties.oraculum_case_subtype
    })
  }
  plan.canonicalCase = canonicalCase
  plan.caseFingerprint = fingerprint
  plan.safeToApply = false
  plan.pendingDependencies = ["EXPLICIT_APPLY_AUTHORIZATION", "EXTERNAL_WRITES_AUTHORIZATION"]
  plan.drivePlan = { area, case: caseDestination }
  plan.associationPlan ||= { type: "deal_to_contact", primaryOnly: true }
  plan.deduplication ||= { contactKeys: ["cpf", "phone"], dealKey: "caseNumber", documentKey: "sha256" }
  plan.writeScope ||= ["HUBSPOT_CONTACT", "HUBSPOT_DEAL", "HUBSPOT_ASSOCIATION", "DRIVE_FOLDERS", "DRIVE_UPLOADS", "CHECKPOINT_WRITE"]
  plan.documentPlan = { ...plan.documentPlan, driveEligibleUniqueContents: eligibleContentCount, contents, occurrences }
  plan.simulation = { ...(plan.simulation || {}), driveUniqueContents: eligibleContentCount }
  return { plan, manifest }
}

module.exports = { generateSingleCaseApplyPlan }
