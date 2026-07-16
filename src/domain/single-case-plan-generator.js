"use strict"

const crypto = require("node:crypto")
const path = require("node:path")
const { validateFormat } = require("./case-number")

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
  if (!FINGERPRINT.test(fingerprint || "") || hash(caseImportId).slice(0, 12) !== fingerprint) fail("FINGERPRINT_INVALID")
  if (!validateFormat(caseNumber) || basePlan?.dealPlan?.caseNumber !== caseNumber || basePlan?.dealPlan?.properties?.numero_de_caso !== caseNumber) fail("CASE_NUMBER_INVALID")

  const inventory = identityConfirmed.reviewedInventory
  if (!Array.isArray(inventory.contents) || !Array.isArray(inventory.physicalOccurrences) || !contentFiles || typeof contentFiles !== "object") fail("CONTENT_INVENTORY_INVALID")
  if (inventory.contents.length !== 12) fail("CONTENT_INVENTORY_INVALID")
  if (inventory.physicalOccurrences.length !== 14) fail("OCCURRENCE_COUNT_MISMATCH")

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
  if (contents.filter(item => item.eligible).length !== 11) fail("ELIGIBLE_CONTENT_COUNT_MISMATCH")

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
  if (occurrences.length !== 14) fail("OCCURRENCE_COUNT_MISMATCH")

  const manifest = contents.filter(item => item.eligible).map(item => {
    const choices = (candidates.get(item.contentDocumentId) || []).sort((a, b) => a.relativePath.localeCompare(b.relativePath))
    if (!choices.length || choices.some(choice => choice.sha256 !== choices[0].sha256 || choice.size !== choices[0].size)) fail("CONTENT_INVENTORY_INVALID")
    return choices[0]
  }).sort((a, b) => a.contentDocumentId.localeCompare(b.contentDocumentId))
  if (manifest.length !== 11) fail("ELIGIBLE_CONTENT_COUNT_MISMATCH")

  const area = { logicalId: `area:${hash(driveRules?.areaName || "").slice(0, 20)}`, name: driveRules?.areaName }
  const caseDestination = { logicalId: `case:${fingerprint}`, name: driveRules?.caseName }
  if (!validDestination(area)) fail("DRIVE_AREA_DESTINATION_INVALID")
  if (!validDestination(caseDestination)) fail("DRIVE_CASE_DESTINATION_INVALID")
  if (!LOGICAL_ID.test(area.logicalId) || !LOGICAL_ID.test(caseDestination.logicalId)) fail("DRIVE_LOGICAL_ID_INVALID")

  const plan = clone(basePlan)
  plan.caseFingerprint = fingerprint
  plan.safeToApply = false
  plan.pendingDependencies = ["EXPLICIT_APPLY_AUTHORIZATION", "EXTERNAL_WRITES_AUTHORIZATION"]
  plan.drivePlan = { area, case: caseDestination }
  plan.associationPlan ||= { type: "deal_to_contact", primaryOnly: true }
  plan.deduplication ||= { contactKeys: ["cpf", "phone"], dealKey: "caseNumber", documentKey: "sha256" }
  plan.writeScope ||= ["HUBSPOT_CONTACT", "HUBSPOT_DEAL", "HUBSPOT_ASSOCIATION", "DRIVE_FOLDERS", "DRIVE_UPLOADS", "CHECKPOINT_WRITE"]
  plan.documentPlan = { ...plan.documentPlan, driveEligibleUniqueContents: 11, contents, occurrences }
  plan.simulation = { ...(plan.simulation || {}), driveUniqueContents: 11 }
  return { plan, manifest }
}

module.exports = { generateSingleCaseApplyPlan }
