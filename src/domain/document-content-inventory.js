"use strict"

const crypto = require("node:crypto")
const path = require("node:path")

const SHA256_PATTERN = /^[a-f0-9]{64}$/
const SAFE_REASON_PATTERN = /^[a-z][a-z0-9_]{0,63}$/

const sha256 = value => crypto.createHash("sha256").update(value).digest("hex")
const contentDocumentIdForHash = hash => `C-${hash.slice(0, 20)}`

function normalizeReference(reference) {
  const normalized = path.normalize(String(reference || "")).replace(/\\/g, "/").normalize("NFC").toLowerCase()
  if (!normalized) throw new Error("localReference is required")
  return normalized
}

function physicalDocumentIdFor({ sha256: hash, localReference }) {
  if (!SHA256_PATTERN.test(String(hash || ""))) throw new Error("valid sha256 is required")
  return `P-${sha256(`${hash}\0${normalizeReference(localReference)}`).slice(0, 20)}`
}

function sanitizeReasons(reasons) {
  return [...new Set((Array.isArray(reasons) ? reasons : []).map(String).filter(value => SAFE_REASON_PATTERN.test(value)))].sort()
}

function sanitizeAnalysisResult(result = {}) {
  const known = new Set(["analysisStatus", "extraction", "classification", "quarantined", "quarantineReasons", "documentType", "eligibleForHumanReview"])
  const unknown = Object.keys(result).filter(key => !known.has(key))
  if (unknown.length) throw new Error(`unknown analysis field: ${unknown[0]}`)
  return {
    analysisStatus: String(result.analysisStatus || "ANALYZED"),
    extraction: result.extraction && typeof result.extraction === "object" ? result.extraction : {},
    classification: result.classification && typeof result.classification === "object" ? result.classification : {},
    quarantined: result.quarantined === true,
    quarantineReasons: sanitizeReasons(result.quarantineReasons),
    documentType: typeof result.documentType === "string" ? result.documentType : "Documento desconhecido",
    eligibleForHumanReview: result.quarantined === true && result.eligibleForHumanReview !== false
  }
}

function validateInventory(inventory) {
  const errors = []
  const topFields = new Set(["schemaVersion", "caseImportId", "physicalOccurrences", "contents", "counts"])
  const occurrenceFields = new Set(["physicalDocumentId", "localReference", "sha256", "physicalStatus", "contentDocumentId"])
  const contentFields = new Set(["contentDocumentId", "sha256", "occurrenceCount", "physicalDocumentIds", "analysisStatus", "extraction", "classification", "quarantined", "quarantineReasons", "documentType", "eligibleForHumanReview"])
  Object.keys(inventory || {}).forEach(key => { if (!topFields.has(key)) errors.push(`unknown inventory field: ${key}`) })
  if (inventory?.schemaVersion !== 2) errors.push("schemaVersion must be 2")
  if (typeof inventory?.caseImportId !== "string" || !inventory.caseImportId) errors.push("caseImportId is required")
  if (!Array.isArray(inventory?.physicalOccurrences)) errors.push("physicalOccurrences must be an array")
  if (!Array.isArray(inventory?.contents)) errors.push("contents must be an array")
  if (errors.length) return { valid: false, errors }
  const physicalIds = new Set()
  const references = new Set()
  const contentIds = new Set()
  const hashes = new Set()
  const contentById = new Map()
  for (const content of inventory.contents) {
    Object.keys(content || {}).forEach(key => { if (!contentFields.has(key)) errors.push(`unknown content field: ${key}`) })
    if (!content || !SHA256_PATTERN.test(String(content.sha256 || ""))) errors.push("content has invalid sha256")
    if (content.contentDocumentId !== contentDocumentIdForHash(content.sha256)) errors.push("contentDocumentId mismatch")
    if (contentIds.has(content.contentDocumentId)) errors.push("duplicate contentDocumentId")
    if (hashes.has(content.sha256)) errors.push("duplicate content sha256")
    contentIds.add(content.contentDocumentId); hashes.add(content.sha256); contentById.set(content.contentDocumentId, content)
  }
  for (const occurrence of inventory.physicalOccurrences) {
    Object.keys(occurrence || {}).forEach(key => { if (!occurrenceFields.has(key)) errors.push(`unknown occurrence field: ${key}`) })
    if (!occurrence || occurrence.physicalDocumentId !== physicalDocumentIdFor(occurrence)) errors.push("physicalDocumentId mismatch")
    if (physicalIds.has(occurrence.physicalDocumentId)) errors.push("duplicate physicalDocumentId")
    const referenceKey = normalizeReference(occurrence.localReference)
    if (references.has(referenceKey)) errors.push("duplicate localReference")
    if (!contentById.has(occurrence.contentDocumentId)) errors.push("occurrence content does not exist")
    else if (contentById.get(occurrence.contentDocumentId).sha256 !== occurrence.sha256) errors.push("occurrence points to different content")
    physicalIds.add(occurrence.physicalDocumentId); references.add(referenceKey)
  }
  for (const content of inventory.contents) {
    const linked = inventory.physicalOccurrences.filter(item => item.contentDocumentId === content.contentDocumentId).map(item => item.physicalDocumentId).sort()
    if (content.occurrenceCount !== linked.length) errors.push("occurrenceCount mismatch")
    if (JSON.stringify(content.physicalDocumentIds) !== JSON.stringify(linked)) errors.push("physicalDocumentIds mismatch")
  }
  const counts = inventory.counts || {}
  if (counts.physicalFiles !== inventory.physicalOccurrences.length) errors.push("physicalFiles count mismatch")
  if (counts.uniqueContents !== inventory.contents.length) errors.push("uniqueContents count mismatch")
  if (counts.duplicateOccurrences !== inventory.physicalOccurrences.length - inventory.contents.length) errors.push("duplicateOccurrences count mismatch")
  return { valid: errors.length === 0, errors: errors.length ? errors : undefined }
}

async function buildDocumentContentInventory({ caseImportId, occurrences, analyzeContent }) {
  if (typeof caseImportId !== "string" || !caseImportId) throw new Error("caseImportId is required")
  if (!Array.isArray(occurrences) || !occurrences.length) throw new Error("occurrences must be a non-empty array")
  if (typeof analyzeContent !== "function") throw new Error("analyzeContent is required")
  const physicalOccurrences = []
  const groups = new Map()
  for (const occurrence of occurrences) {
    if (!occurrence || !Buffer.isBuffer(occurrence.buffer)) throw new Error("occurrence buffer is required")
    const hash = sha256(occurrence.buffer)
    const physicalDocumentId = physicalDocumentIdFor({ sha256: hash, localReference: occurrence.localReference })
    const physical = { physicalDocumentId, localReference: String(occurrence.localReference), sha256: hash, physicalStatus: String(occurrence.physicalStatus || "FOUND"), contentDocumentId: contentDocumentIdForHash(hash) }
    physicalOccurrences.push(physical)
    const group = groups.get(hash) || { buffer: occurrence.buffer, physicalDocumentIds: [] }
    group.physicalDocumentIds.push(physicalDocumentId)
    groups.set(hash, group)
  }
  const contents = []
  for (const hash of [...groups.keys()].sort()) {
    const group = groups.get(hash)
    const analysis = sanitizeAnalysisResult(await analyzeContent({ sha256: hash, buffer: group.buffer, contentDocumentId: contentDocumentIdForHash(hash) }))
    contents.push({ contentDocumentId: contentDocumentIdForHash(hash), sha256: hash, occurrenceCount: group.physicalDocumentIds.length, physicalDocumentIds: [...group.physicalDocumentIds].sort(), ...analysis })
  }
  physicalOccurrences.sort((left, right) => left.physicalDocumentId.localeCompare(right.physicalDocumentId))
  const inventory = {
    schemaVersion: 2,
    caseImportId,
    physicalOccurrences,
    contents,
    counts: {
      physicalFiles: physicalOccurrences.length,
      uniqueContents: contents.length,
      analyzedContents: contents.filter(item => item.analysisStatus === "ANALYZED").length,
      duplicateOccurrences: physicalOccurrences.length - contents.length,
      ignoredContents: contents.filter(item => item.analysisStatus === "IGNORED").length,
      quarantinedContents: contents.filter(item => item.quarantined).length
    }
  }
  const validation = validateInventory(inventory)
  if (!validation.valid) throw new Error(`invalid inventory: ${validation.errors.join("; ")}`)
  return inventory
}

module.exports = {
  buildDocumentContentInventory,
  validateInventory,
  contentDocumentIdForHash,
  physicalDocumentIdFor
}
