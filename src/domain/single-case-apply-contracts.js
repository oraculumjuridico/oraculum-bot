"use strict"

const crypto = require("node:crypto")
const { normalizePersonName } = require("./name-normalization")

const AUTHORIZABLE_SCHEMA_VERSION = 1
const AUTHORIZATION_SCHEMA_VERSION = 2
const CHECKPOINT_SCHEMA_VERSION = 2
const MAX_AUTHORIZATION_TTL_MS = 30 * 60 * 1000
const AUTHORIZATION_CLOCK_SKEW_MS = 30000
const AUTH_SCOPES = Object.freeze({
  EXPLICIT_APPLY_AUTHORIZATION: Object.freeze(["APPLY_SINGLE_CASE"]),
  EXTERNAL_WRITES_AUTHORIZATION: Object.freeze(["HUBSPOT_CONTACT", "HUBSPOT_DEAL", "HUBSPOT_ASSOCIATION", "DRIVE_FOLDERS", "DRIVE_UPLOADS", "CHECKPOINT_WRITE"])
})
const REQUIRED_AUTHORIZATION_SCOPES = Object.freeze([...new Set(Object.values(AUTH_SCOPES).flat())].sort())
const HASH = /^[a-f0-9]{64}$/

function canonicalize(value, path = "$") {
  if (value === null || typeof value === "string" || typeof value === "boolean") return JSON.stringify(value)
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error(`NON_JSON_VALUE:${path}`)
    return JSON.stringify(value)
  }
  if (Array.isArray(value)) {
    if (Object.keys(value).length !== value.length || Object.getOwnPropertySymbols(value).length) throw new Error(`NON_JSON_VALUE:${path}`)
    return `[${value.map((item, index) => canonicalize(item, `${path}[${index}]`)).join(",")}]`
  }
  if (!value || typeof value !== "object" || Object.getPrototypeOf(value) !== Object.prototype) throw new Error(`NON_JSON_VALUE:${path}`)
  if (Object.getOwnPropertySymbols(value).length) throw new Error(`NON_JSON_VALUE:${path}`)
  const descriptors = Object.getOwnPropertyDescriptors(value)
  return `{${Object.keys(descriptors).sort().map(key => {
    const descriptor = descriptors[key]
    if (!Object.hasOwn(descriptor, "value") || descriptor.value === undefined) throw new Error(`NON_JSON_VALUE:${path}.${key}`)
    return `${JSON.stringify(key)}:${canonicalize(descriptor.value, `${path}.${key}`)}`
  }).join(",")}}`
}

const sha256 = value => crypto.createHash("sha256").update(value).digest("hex")
const deepClone = value => JSON.parse(canonicalize(value))
function deepFreeze(value) { if (value && typeof value === "object" && !Object.isFrozen(value)) { Object.freeze(value); for (const child of Object.values(value)) deepFreeze(child) } return value }

function contactVerificationProjection(expectedProperties, observedProperties = expectedProperties) {
  if (!expectedProperties || Object.getPrototypeOf(expectedProperties) !== Object.prototype || !observedProperties || Object.getPrototypeOf(observedProperties) !== Object.prototype) throw new Error("CONTACT_PROPERTIES_INVALID")
  const keys = Object.keys(expectedProperties).sort()
  if (!keys.length || keys.some(key => !key || expectedProperties[key] === undefined)) throw new Error("CONTACT_PROPERTIES_INVALID")

  // Apply canonical normalization to name fields before projection
  const normalizedExpected = { ...expectedProperties }
  const normalizedObserved = { ...observedProperties }

  if (normalizedExpected.firstname) {
    normalizedExpected.firstname = normalizePersonName(normalizedExpected.firstname)
  }
  if (normalizedObserved.firstname) {
    normalizedObserved.firstname = normalizePersonName(normalizedObserved.firstname)
  }

  return Object.fromEntries(keys.map(key => [key, Object.hasOwn(normalizedObserved, key) && normalizedObserved[key] !== undefined ? normalizedObserved[key] : null]))
}

const contactVerificationHash = (expectedProperties, observedProperties = expectedProperties, hash = sha256) => {
  if (typeof hash !== "function") throw new Error("HASH_INVALID")
  return hash(canonicalize(contactVerificationProjection(expectedProperties, observedProperties)))
}

function validateContactVerificationEvidence(value, { contactId, caseImportId, properties, invalidCode = "CONTACT_VERIFY_INVALID" } = {}) {
  if (!value || value.verified !== true || !/^[A-Za-z0-9][A-Za-z0-9._:-]{2,127}$/.test(value.id || "")) throw new Error(invalidCode)
  if (value.id !== contactId || value.caseImportId !== caseImportId || value.cpf !== properties?.cpf_do_cliente || value.phone !== properties?.phone || value.fieldsHash !== contactVerificationHash(properties)) throw new Error("CONTACT_FIELDS_DIVERGENCE")
  // firstname is optional in evidence - adapter may include it for presentation checks
  return deepClone(value)
}

function groupDocuments(plan) {
  const contents = plan?.documentPlan?.contents
  const occurrences = plan?.documentPlan?.occurrences
  if (!Array.isArray(contents) || !Array.isArray(occurrences)) throw new Error("DOCUMENT_INVENTORY_MISSING")
  const byId = new Map(contents.map(item => [item.contentDocumentId, item]))
  if (byId.size !== contents.length) throw new Error("DOCUMENT_ID_DUPLICATE")
  const groups = new Map()
  for (const occurrence of occurrences) {
    const item = byId.get(occurrence.contentDocumentId)
    if (!item || occurrence.sha256 !== item.sha256) throw new Error("DOCUMENT_OCCURRENCE_INVALID")
    if (!/^[a-f0-9]{64}$/.test(item.sha256 || "")) throw new Error("DOCUMENT_HASH_INVALID")
    const critical = canonicalize({ eligible: item.eligible, kind: item.kind, caseLinked: item.caseLinked, contentDocumentId: item.contentDocumentId })
    const group = groups.get(item.sha256)
    if (group && group.critical !== critical) throw new Error("DOCUMENT_METADATA_CONFLICT")
    if (!group) groups.set(item.sha256, { critical, item, occurrences: [] })
    groups.get(item.sha256).occurrences.push({ logicalName: occurrence.logicalName, contentDocumentId: occurrence.contentDocumentId })
  }
  return [...groups.values()].map(group => {
    const occurrences = group.occurrences.sort((a, b) => a.logicalName.localeCompare(b.logicalName) || a.contentDocumentId.localeCompare(b.contentDocumentId))
    return { ...group.item, occurrenceCount: occurrences.length, occurrences, logicalNames: [...new Set(occurrences.map(item => item.logicalName))] }
  }).sort((a, b) => a.sha256.localeCompare(b.sha256) || a.contentDocumentId.localeCompare(b.contentDocumentId))
}

function authorizableProjection(plan) {
  const inventory = groupDocuments(plan)
  return {
    schemaVersion: AUTHORIZABLE_SCHEMA_VERSION,
    caseImportId: plan.caseImportId,
    caseFingerprint: plan.caseFingerprint,
    reservation: { caseNumber: plan.dealPlan?.caseNumber, source: plan.caseNumberReservationSync?.source },
    contact: deepClone(plan.contactPlan?.properties),
    deal: deepClone(plan.dealPlan?.properties),
    association: deepClone(plan.associationPlan),
    driveDestination: deepClone(plan.drivePlan),
    inventory: inventory.map(item => ({ contentDocumentId: item.contentDocumentId, sha256: item.sha256, eligible: item.eligible, kind: item.kind, caseLinked: item.caseLinked, occurrenceCount: item.occurrenceCount, occurrences: item.occurrences })),
    deduplication: deepClone(plan.deduplication),
    expectedUploads: plan.documentPlan?.driveEligibleUniqueContents,
    writeScope: deepClone(plan.writeScope)
  }
}

const authorizablePlanHash = plan => sha256(canonicalize(authorizableProjection(plan)))
const exactScope = (scope, type) => {
  if (!type || !Object.hasOwn(AUTH_SCOPES, type)) return false
  const expected = AUTH_SCOPES[type]
  return Array.isArray(scope) && scope.length === expected.length && new Set(scope).size === scope.length && canonicalize([...scope].sort()) === canonicalize([...expected].sort())
}
function reservationEvidenceProjection(value) {
  if (!value || value.verified !== true || !/^[A-Za-z0-9][A-Za-z0-9._:-]{2,127}$/.test(value.evidenceId || "") || !/^[A-Za-z0-9][A-Za-z0-9._:-]{2,127}$/.test(value.caseImportId || "") || !/^[A-Z]{2,4}\.[0-9]{6}\.[0-9]{3}$/.test(value.caseNumber || "")) throw new Error("RESERVATION_EVIDENCE_INVALID")
  return { reservationId: value.evidenceId, caseImportId: value.caseImportId, caseNumber: value.caseNumber, verified: true }
}
const reservationEvidenceHash = value => sha256(canonicalize(reservationEvidenceProjection(value)))
const authorizationPayload = record => canonicalize({
  authorizationId: record.authorizationId, schemaVersion: record.schemaVersion, type: record.type,
  caseImportId: record.caseImportId, caseFingerprint: record.caseFingerprint, caseNumber: record.caseNumber,
  authorizablePlanHash: record.authorizablePlanHash, planHash: record.planHash, manifestHash: record.manifestHash,
  reservationEvidenceHash: record.reservationEvidenceHash, scope: [...record.scope].sort(), issuer: record.issuer,
  issuedAt: record.issuedAt, expiresAt: record.expiresAt, revoked: record.revoked
})

function validateAuthorizationShape(record) {
  if (!record || Object.getPrototypeOf(record) !== Object.prototype || record.schemaVersion !== AUTHORIZATION_SCHEMA_VERSION) return "AUTH_SCHEMA_INVALID"
  if (!/^[A-Za-z0-9._:-]{8,128}$/.test(record.authorizationId || "")) return "AUTH_ID_INVALID"
  if (!Object.hasOwn(AUTH_SCOPES, record.type)) return "AUTH_TYPE_INVALID"
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{2,127}$/.test(record.caseImportId || "") || !/^[a-f0-9]{12}$/.test(record.caseFingerprint || "") || !/^[A-Z]{2,4}\.[0-9]{6}\.[0-9]{3}$/.test(record.caseNumber || "")) return "AUTH_BINDING_INVALID"
  if (![record.authorizablePlanHash, record.planHash, record.manifestHash, record.reservationEvidenceHash].every(value => HASH.test(value || ""))) return "AUTH_HASH_INVALID"
  if (!exactScope(record.scope, record.type)) return "AUTH_SCOPE_INVALID"
  if (typeof record.issuer !== "string" || !/^[A-Za-z0-9._:-]{3,80}$/.test(record.issuer)) return "AUTH_ISSUER_INVALID"
  if (record.revoked !== false) return "AUTH_REVOKED"
  return null
}

function validateAuthorizationDates(record, now, clockSkewMs = AUTHORIZATION_CLOCK_SKEW_MS) {
  const issued = Date.parse(record.issuedAt), expires = Date.parse(record.expiresAt), current = Date.parse(now)
  if (![issued, expires, current].every(Number.isFinite) || expires <= issued) return "AUTH_DATE_INVALID"
  if (expires - issued > MAX_AUTHORIZATION_TTL_MS) return "AUTH_TTL_EXCEEDED"
  if (issued > current + clockSkewMs) return "AUTH_ISSUED_IN_FUTURE"
  if (expires <= current) return "AUTH_EXPIRED"
  return null
}

function createAuthorizationVerifier({ trustedIssuers, clockSkewMs = AUTHORIZATION_CLOCK_SKEW_MS }) {
  const issuers = new Map(Object.entries(trustedIssuers || {}))
  return Object.freeze({
    verify(record, { now }) {
      const shapeError = validateAuthorizationShape(record)
      if (shapeError) return { valid: false, reason: shapeError }
      const key = issuers.get(record.issuer)
      if (!key) return { valid: false, reason: "AUTH_ISSUER_UNKNOWN" }
      const dateError = validateAuthorizationDates(record, now, clockSkewMs)
      if (dateError) return { valid: false, reason: dateError }
      let signatureValid = false
      try { signatureValid = crypto.verify(null, Buffer.from(authorizationPayload(record)), key, Buffer.from(record.proof || "", "base64")) } catch {}
      return signatureValid ? { valid: true } : { valid: false, reason: "AUTH_PROOF_INVALID" }
    }
  })
}

function validateAuthorizations(records, expected, verifier, now) {
  if (!Array.isArray(records)) throw new Error("AUTH_REPOSITORY_RESPONSE_INVALID")
  const ids = new Set()
  const validated = []
  for (const type of Object.keys(AUTH_SCOPES)) {
    const matches = records.filter(record => record?.type === type)
    if (matches.length !== 1) throw new Error(`AUTH_AMBIGUOUS:${type}`)
    const record = matches[0]
    if (ids.has(record.authorizationId)) throw new Error("AUTH_ID_DUPLICATE")
    ids.add(record.authorizationId)
    const proof = verifier.verify(record, { now })
    if (!proof.valid) throw new Error(proof.reason)
    if (record.caseImportId !== expected.caseImportId || record.caseFingerprint !== expected.caseFingerprint || record.caseNumber !== expected.caseNumber || record.authorizablePlanHash !== expected.authorizablePlanHash || record.planHash !== expected.planHash || record.manifestHash !== expected.manifestHash || record.reservationEvidenceHash !== expected.reservationEvidenceHash) throw new Error("AUTH_BINDING_INVALID")
    if (!exactScope(record.scope, record.type)) throw new Error("AUTH_SCOPE_INVALID")
    validated.push({ authorizationId: record.authorizationId, type, scope: [...record.scope], expiresAt: record.expiresAt })
  }
  return validated
}

module.exports = { AUTHORIZABLE_SCHEMA_VERSION, AUTHORIZATION_SCHEMA_VERSION, CHECKPOINT_SCHEMA_VERSION, MAX_AUTHORIZATION_TTL_MS, AUTHORIZATION_CLOCK_SKEW_MS, AUTH_SCOPES, REQUIRED_AUTHORIZATION_SCOPES, canonicalize, sha256, deepClone, deepFreeze, contactVerificationProjection, contactVerificationHash, validateContactVerificationEvidence, groupDocuments, authorizableProjection, authorizablePlanHash, exactScope, reservationEvidenceProjection, reservationEvidenceHash, authorizationPayload, validateAuthorizationShape, validateAuthorizationDates, createAuthorizationVerifier, validateAuthorizations }
