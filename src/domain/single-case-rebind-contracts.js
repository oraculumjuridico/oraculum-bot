"use strict"

const { canonicalize, sha256, deepClone, deepFreeze } = require("./single-case-apply-contracts")

const REBIND_SCHEMA_VERSION = 1
const ALLOWED_REBIND_REASONS = Object.freeze(["CONTACT_RECONCILED_AFTER_DIVERGENCE"])
const AUTHORIZATION_ID_PATTERN = /^[A-Za-z0-9._:-]{8,128}$/
const REQUESTED_BY_PATTERN = /^[A-Za-z][A-Za-z0-9._:-]{2,63}$/
const HASH_PATTERN = /^[a-f0-9]{64}$/
const CASE_IMPORT_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{2,127}$/
const CASE_FINGERPRINT_PATTERN = /^[a-f0-9]{12}$/
const CASE_NUMBER_PATTERN = /^[A-Z]{2,4}\.[0-9]{6}\.[0-9]{3}$/

function fail(code) {
  throw new Error(code)
}

function validateAuthorizationIds(ids, field) {
  if (!Array.isArray(ids)) fail(`${field}_NOT_ARRAY`)
  if (ids.length !== 2) fail(`${field}_WRONG_COUNT`)
  if (!ids.every(id => typeof id === "string" && AUTHORIZATION_ID_PATTERN.test(id))) fail(`${field}_INVALID_FORMAT`)
  if (ids[0] === ids[1]) fail(`${field}_DUPLICATE`)
  return true
}

function normalizeAuthorizationSet(ids) {
  return deepFreeze([...ids].sort())
}

function computeAuthorizationSetHash(ids) {
  validateAuthorizationIds(ids, "AUTHORIZATION_IDS")
  return sha256(canonicalize(normalizeAuthorizationSet(ids)))
}

function validateReason(reason) {
  if (typeof reason !== "string") fail("REBIND_REASON_NOT_STRING")
  if (!ALLOWED_REBIND_REASONS.includes(reason)) fail("REBIND_REASON_NOT_ALLOWED")
  return true
}

function validateRequestedBy(requestedBy) {
  if (typeof requestedBy !== "string") fail("REBIND_REQUESTED_BY_NOT_STRING")
  if (requestedBy.length === 0 || requestedBy.length > 64) fail("REBIND_REQUESTED_BY_LENGTH_INVALID")
  // ValidaÃ§Ãµes especÃ­ficas primeiro, antes do pattern geral
  if (requestedBy.includes("@")) fail("REBIND_REQUESTED_BY_CONTAINS_EMAIL")
  if (/\s/.test(requestedBy)) fail("REBIND_REQUESTED_BY_CONTAINS_SPACE")
  if (/[\/\\]/.test(requestedBy)) fail("REBIND_REQUESTED_BY_CONTAINS_SLASH")
  // Telefones mais longos primeiro (12-13 dÃ­gitos), depois CPF (11 dÃ­gitos), depois telefone curto (10 dÃ­gitos)
  if (/\d{12,13}/.test(requestedBy)) fail("REBIND_REQUESTED_BY_CONTAINS_PHONE")
  if (/\d{11}/.test(requestedBy)) fail("REBIND_REQUESTED_BY_CONTAINS_CPF")
  if (/\d{10}/.test(requestedBy)) fail("REBIND_REQUESTED_BY_CONTAINS_PHONE")
  if (!REQUESTED_BY_PATTERN.test(requestedBy)) fail("REBIND_REQUESTED_BY_FORMAT_INVALID")
  return true
}

function validateReconciliationEvidence(evidence, request) {
  if (!evidence || typeof evidence !== "object") fail("RECONCILIATION_EVIDENCE_INVALID")

  if (evidence.decision !== "RECONCILIATION_ELIGIBLE") fail("RECONCILIATION_EVIDENCE_NOT_ELIGIBLE")
  if (evidence.reason !== "CONTACT_READ_ONLY_VERIFIED") fail("RECONCILIATION_EVIDENCE_WRONG_REASON")

  if (!evidence.contactEvidence || typeof evidence.contactEvidence !== "object") fail("RECONCILIATION_CONTACT_EVIDENCE_MISSING")
  if (evidence.contactEvidence.caseImportId !== request.caseImportId) fail("RECONCILIATION_CASE_IMPORT_ID_MISMATCH")

  if (!evidence.namePresentation || typeof evidence.namePresentation !== "object") fail("RECONCILIATION_NAME_PRESENTATION_MISSING")
  if (evidence.namePresentation.semanticMatch !== true) fail("RECONCILIATION_SEMANTIC_MATCH_FALSE")
  if (evidence.namePresentation.materialDivergence !== false) fail("RECONCILIATION_MATERIAL_DIVERGENCE_TRUE")

  if (!evidence.resume || typeof evidence.resume !== "object") fail("RECONCILIATION_RESUME_MISSING")
  if (evidence.resume.checkpointRebindRequired !== true) fail("RECONCILIATION_REBIND_NOT_REQUIRED")
  if (evidence.resume.ambiguity !== "NONE") fail("RECONCILIATION_AMBIGUITY_PRESENT")

  if (typeof evidence.evidenceHash !== "string" || !HASH_PATTERN.test(evidence.evidenceHash)) fail("RECONCILIATION_EVIDENCE_HASH_INVALID")

  return true
}

function computeReconciliationEvidenceHash(evidence) {
  return sha256(canonicalize({
    decision: evidence.decision,
    reason: evidence.reason,
    contactEvidenceHash: sha256(canonicalize(evidence.contactEvidence)),
    namePresentationHash: sha256(canonicalize(evidence.namePresentation)),
    resumeHash: sha256(canonicalize(evidence.resume))
  }))
}

function validateCheckpointEligibility(checkpoint, request) {
  if (!checkpoint || typeof checkpoint !== "object") fail("CHECKPOINT_INVALID")

  // Validar status global
  if (checkpoint.status !== "failed") fail("CHECKPOINT_STATUS_NOT_FAILED")

  // Validar steps
  if (!checkpoint.steps || typeof checkpoint.steps !== "object") fail("CHECKPOINT_STEPS_MISSING")

  const { reservation, contact, deal, association, area_folder, case_folder, uploads, final_verify } = checkpoint.steps

  if (!reservation || reservation.status !== "completed") fail("CHECKPOINT_RESERVATION_NOT_COMPLETED")
  if (!contact || contact.status !== "failed") fail("CHECKPOINT_CONTACT_NOT_FAILED")
  if (contact.errorCode !== "CONTACT_FIELDS_DIVERGENCE") fail("CHECKPOINT_CONTACT_ERROR_CODE_WRONG")
  if (contact.result !== undefined) fail("CHECKPOINT_CONTACT_RESULT_PRESENT")

  if (!deal || deal.status !== "pending") fail("CHECKPOINT_DEAL_NOT_PENDING")
  if (!association || association.status !== "pending") fail("CHECKPOINT_ASSOCIATION_NOT_PENDING")
  if (!area_folder || area_folder.status !== "pending") fail("CHECKPOINT_AREA_FOLDER_NOT_PENDING")
  if (!case_folder || case_folder.status !== "pending") fail("CHECKPOINT_CASE_FOLDER_NOT_PENDING")
  if (!uploads || uploads.status !== "pending") fail("CHECKPOINT_UPLOADS_NOT_PENDING")
  if (!final_verify || final_verify.status !== "pending") fail("CHECKPOINT_FINAL_VERIFY_NOT_PENDING")

  // Validar recursos vazios
  if (!checkpoint.resources || typeof checkpoint.resources !== "object") fail("CHECKPOINT_RESOURCES_MISSING")
  if (checkpoint.resources.contactId !== null) fail("CHECKPOINT_CONTACT_ID_PRESENT")
  if (checkpoint.resources.dealId !== null) fail("CHECKPOINT_DEAL_ID_PRESENT")
  if (checkpoint.resources.associationId !== null) fail("CHECKPOINT_ASSOCIATION_ID_PRESENT")
  if (checkpoint.resources.areaFolderId !== null) fail("CHECKPOINT_AREA_FOLDER_ID_PRESENT")
  if (checkpoint.resources.caseFolderId !== null) fail("CHECKPOINT_CASE_FOLDER_ID_PRESENT")

  // Validar uploads vazio
  if (!checkpoint.uploads || typeof checkpoint.uploads !== "object") fail("CHECKPOINT_UPLOADS_MISSING")
  if (Object.keys(checkpoint.uploads).length !== 0) fail("CHECKPOINT_UPLOADS_NOT_EMPTY")

  // Validar finalProof null
  if (checkpoint.finalProof !== null) fail("CHECKPOINT_FINAL_PROOF_PRESENT")

  // Validar authorizationIds antigos
  if (!Array.isArray(checkpoint.authorizationIds)) fail("CHECKPOINT_AUTHORIZATION_IDS_NOT_ARRAY")
  const checkpointAuthIds = [...checkpoint.authorizationIds].sort()
  const requestAuthIds = [...request.oldAuthorizationIds].sort()
  if (JSON.stringify(checkpointAuthIds) !== JSON.stringify(requestAuthIds)) fail("CHECKPOINT_AUTHORIZATION_IDS_MISMATCH")

  // Validar sourceCheckpointVersion
  if (checkpoint.version !== request.sourceCheckpointVersion) fail("CHECKPOINT_VERSION_MISMATCH")

  // Validar bindings
  if (!CASE_IMPORT_ID_PATTERN.test(checkpoint.caseImportId)) fail("CHECKPOINT_CASE_IMPORT_ID_INVALID")
  if (checkpoint.caseImportId !== request.caseImportId) fail("CHECKPOINT_CASE_IMPORT_ID_MISMATCH")

  if (!CASE_FINGERPRINT_PATTERN.test(checkpoint.caseFingerprint)) fail("CHECKPOINT_CASE_FINGERPRINT_INVALID")
  if (!CASE_NUMBER_PATTERN.test(checkpoint.caseNumber)) fail("CHECKPOINT_CASE_NUMBER_INVALID")
  if (!HASH_PATTERN.test(checkpoint.authorizablePlanHash)) fail("CHECKPOINT_AUTHORIZABLE_PLAN_HASH_INVALID")

  return true
}

function computeRebindId(request) {
  const canonical = {
    schemaVersion: REBIND_SCHEMA_VERSION,
    caseImportId: request.caseImportId,
    sourceCheckpointVersion: request.sourceCheckpointVersion,
    oldAuthorizationSetHash: request.oldAuthorizationSetHash,
    newAuthorizationSetHash: request.newAuthorizationSetHash,
    reconciliationEvidenceHash: request.reconciliationEvidenceHash,
    reason: request.reason,
    requestedBy: request.requestedBy
  }

  return sha256(canonicalize(canonical))
}

function validateRebindRequest(request) {
  if (!request || typeof request !== "object") fail("REBIND_REQUEST_INVALID")

  // Validar caseImportId
  if (!CASE_IMPORT_ID_PATTERN.test(request.caseImportId)) fail("REBIND_CASE_IMPORT_ID_INVALID")

  // Validar sourceCheckpointVersion
  if (!Number.isInteger(request.sourceCheckpointVersion) || request.sourceCheckpointVersion < 1) fail("REBIND_SOURCE_CHECKPOINT_VERSION_INVALID")

  // Validar authorizationIds
  validateAuthorizationIds(request.oldAuthorizationIds, "REBIND_OLD_AUTHORIZATION_IDS")
  validateAuthorizationIds(request.newAuthorizationIds, "REBIND_NEW_AUTHORIZATION_IDS")

  // Validar hashes
  if (!HASH_PATTERN.test(request.oldAuthorizationSetHash)) fail("REBIND_OLD_AUTHORIZATION_SET_HASH_INVALID")
  if (!HASH_PATTERN.test(request.newAuthorizationSetHash)) fail("REBIND_NEW_AUTHORIZATION_SET_HASH_INVALID")
  if (!HASH_PATTERN.test(request.reconciliationEvidenceHash)) fail("REBIND_RECONCILIATION_EVIDENCE_HASH_INVALID")

  // Validar reason
  validateReason(request.reason)

  // Validar requestedBy
  validateRequestedBy(request.requestedBy)

  return true
}

function createRebindRequest({ caseImportId, sourceCheckpointVersion, oldAuthorizationIds, newAuthorizationIds, reconciliationEvidence, reason, requestedBy }) {
  // Validar inputs bÃ¡sicos
  if (!CASE_IMPORT_ID_PATTERN.test(caseImportId)) fail("REBIND_CASE_IMPORT_ID_INVALID")
  if (!Number.isInteger(sourceCheckpointVersion) || sourceCheckpointVersion < 1) fail("REBIND_SOURCE_CHECKPOINT_VERSION_INVALID")

  validateAuthorizationIds(oldAuthorizationIds, "REBIND_OLD_AUTHORIZATION_IDS")
  validateAuthorizationIds(newAuthorizationIds, "REBIND_NEW_AUTHORIZATION_IDS")
  validateReason(reason)
  validateRequestedBy(requestedBy)

  // Computar hashes (nÃ£o muta arrays originais)
  const oldAuthorizationSetHash = computeAuthorizationSetHash(oldAuthorizationIds)
  const newAuthorizationSetHash = computeAuthorizationSetHash(newAuthorizationIds)

  // Validar evidÃªncia
  const preliminaryRequest = { caseImportId, sourceCheckpointVersion, oldAuthorizationIds, newAuthorizationIds }
  validateReconciliationEvidence(reconciliationEvidence, preliminaryRequest)

  const reconciliationEvidenceHash = reconciliationEvidence.evidenceHash

  // Criar request completo
  const request = {
    caseImportId,
    sourceCheckpointVersion,
    reboundCheckpointVersion: sourceCheckpointVersion + 1,
    oldAuthorizationIds: normalizeAuthorizationSet(oldAuthorizationIds),
    newAuthorizationIds: normalizeAuthorizationSet(newAuthorizationIds),
    oldAuthorizationSetHash,
    newAuthorizationSetHash,
    reconciliationEvidenceHash,
    reason,
    requestedBy
  }

  // Computar rebindId
  request.rebindId = computeRebindId(request)

  return deepFreeze(request)
}

function sanitizeRebindResponse(response) {
  if (!response || typeof response !== "object") fail("REBIND_RESPONSE_INVALID")

  const sanitized = {
    status: response.status,
    rebindId: response.rebindId,
    sourceCheckpointVersion: response.sourceCheckpointVersion,
    reboundCheckpointVersion: response.reboundCheckpointVersion,
    authorizationCount: response.authorizationCount,
    previousAuthorizationSetHash: response.previousAuthorizationSetHash,
    currentAuthorizationSetHash: response.currentAuthorizationSetHash,
    reconciliationEvidenceHash: response.reconciliationEvidenceHash,
    reason: response.reason,
    requestedBy: response.requestedBy
  }

  // Nunca incluir authorizationIds completos
  if (response.oldAuthorizationIds !== undefined) fail("REBIND_RESPONSE_CONTAINS_OLD_AUTHORIZATION_IDS")
  if (response.newAuthorizationIds !== undefined) fail("REBIND_RESPONSE_CONTAINS_NEW_AUTHORIZATION_IDS")

  return deepFreeze(sanitized)
}

function createRebindAuditMetadata(request) {
  return deepFreeze({
    rebindId: request.rebindId,
    caseImportId: request.caseImportId,
    sourceCheckpointVersion: request.sourceCheckpointVersion,
    reboundCheckpointVersion: request.reboundCheckpointVersion,
    authorizationCount: 2,
    previousAuthorizationSetHash: request.oldAuthorizationSetHash,
    currentAuthorizationSetHash: request.newAuthorizationSetHash,
    reconciliationEvidenceHash: request.reconciliationEvidenceHash,
    reason: request.reason,
    requestedBy: request.requestedBy
  })
}

module.exports = {
  REBIND_SCHEMA_VERSION,
  ALLOWED_REBIND_REASONS,
  AUTHORIZATION_ID_PATTERN,
  REQUESTED_BY_PATTERN,
  HASH_PATTERN,
  normalizeAuthorizationSet,
  computeAuthorizationSetHash,
  validateReason,
  validateRequestedBy,
  validateReconciliationEvidence,
  computeReconciliationEvidenceHash,
  validateCheckpointEligibility,
  computeRebindId,
  validateRebindRequest,
  createRebindRequest,
  sanitizeRebindResponse,
  createRebindAuditMetadata
}
