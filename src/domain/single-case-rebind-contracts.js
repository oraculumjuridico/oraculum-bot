"use strict"

const { canonicalize, sha256, deepClone, deepFreeze } = require("./single-case-apply-contracts")

const REBIND_SCHEMA_VERSION = 1
const ALLOWED_REBIND_REASONS = Object.freeze(["CONTACT_RECONCILED_AFTER_DIVERGENCE", "PLAN_REGENERATED_AFTER_SAFE_CORRECTION", "AUTHORIZATION_PAIR_REFRESHED_AFTER_EXPIRY"])
const REBIND_REASONS_REQUIRING_NEW_HASHES = new Set(["PLAN_REGENERATED_AFTER_SAFE_CORRECTION"])
const REBIND_REASONS_REQUIRING_RECONCILIATION_EVIDENCE = new Set(["CONTACT_RECONCILED_AFTER_DIVERGENCE"])
const AUTHORIZATION_ID_PATTERN = /^[A-Za-z0-9._:-]{8,128}$/
const REQUESTED_BY_PATTERN = /^[A-Za-z][A-Za-z0-9._:-]{2,63}$/
const HASH_PATTERN = /^[a-f0-9]{64}$/
const CASE_IMPORT_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{2,127}$/
const CASE_FINGERPRINT_PATTERN = /^[a-f0-9]{12}$/
const CASE_NUMBER_PATTERN = /^[A-Z]{2,4}\.[0-9]{6}\.[0-9]{3}$/
const REBIND_ELIGIBLE_CONTACT_FAILURE_CODES = new Set(["CONTACT_FIELDS_DIVERGENCE", "VERIFICATION_FAILED", "AUTH_EXPIRED", "AUTH_REVOKED", "AUTH_BINDING_INVALID"])

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

function validateNewHashes(request) {
  if (REBIND_REASONS_REQUIRING_NEW_HASHES.has(request.reason)) {
    if (!request.newAuthorizablePlanHash || typeof request.newAuthorizablePlanHash !== "string" || !HASH_PATTERN.test(request.newAuthorizablePlanHash)) fail("REBIND_NEW_AUTHORIZABLE_PLAN_HASH_INVALID")
    if (!request.newPlanHash || typeof request.newPlanHash !== "string" || !HASH_PATTERN.test(request.newPlanHash)) fail("REBIND_NEW_PLAN_HASH_INVALID")
    if (!request.newManifestHash || typeof request.newManifestHash !== "string" || !HASH_PATTERN.test(request.newManifestHash)) fail("REBIND_NEW_MANIFEST_HASH_INVALID")
    if (!request.newAuthorizationIds || !Array.isArray(request.newAuthorizationIds) || request.newAuthorizationIds.length !== 2 || request.newAuthorizationIds[0] === request.newAuthorizationIds[1]) fail("REBIND_NEW_AUTHORIZATION_IDS_INVALID")
  } else {
    if (request.newAuthorizablePlanHash != null || request.newPlanHash != null || request.newManifestHash != null) fail("REBIND_NEW_HASHES_NOT_ALLOWED_FOR_REASON")
  }
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
  if (request.reason === "PLAN_REGENERATED_AFTER_SAFE_CORRECTION") {
    return true
  }

  if (request.reason === "AUTHORIZATION_PAIR_REFRESHED_AFTER_EXPIRY") {
    if (evidence !== null && evidence !== undefined) fail("RECONCILIATION_EVIDENCE_NOT_ALLOWED_FOR_REASON")
    return true
  }

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

  // Validar steps
  if (!checkpoint.steps || typeof checkpoint.steps !== "object") fail("CHECKPOINT_STEPS_MISSING")

  const { reservation, contact, deal, association, area_folder, case_folder, uploads, final_verify } = checkpoint.steps
  const driveContinuationBoundary = request.reason === "AUTHORIZATION_PAIR_REFRESHED_AFTER_EXPIRY" &&
    checkpoint.status === "running" &&
    [reservation, contact, deal, association].every(step => step?.status === "completed") &&
    [area_folder, case_folder, uploads, final_verify].every(step => step?.status === "pending")
  const hubspotRecoveryBoundary = request.reason === "AUTHORIZATION_PAIR_REFRESHED_AFTER_EXPIRY" &&
    checkpoint.status === "failed" &&
    reservation?.status === "completed" &&
    contact?.status === "completed" &&
    ["pending", "failed"].includes(deal?.status) &&
    association?.status === "pending" &&
    [area_folder, case_folder, uploads, final_verify].every(step => step?.status === "pending")

  // Validar status global. O único estado running elegível é a fronteira
  // oficial HubSpot concluído -> Drive pendente.
  if (checkpoint.status !== "failed" && !driveContinuationBoundary) fail("CHECKPOINT_STATUS_NOT_FAILED")

  if (!reservation || reservation.status !== "completed") fail("CHECKPOINT_RESERVATION_NOT_COMPLETED")
  if (driveContinuationBoundary) {
    if (!contact?.result || !deal?.result || !association?.result) fail("CHECKPOINT_CONTINUATION_RESULT_MISSING")
  } else if (hubspotRecoveryBoundary) {
    if (!contact?.result || deal?.result || association?.result) fail("CHECKPOINT_CONTINUATION_RESULT_MISSING")
  } else if (request.reason === "AUTHORIZATION_PAIR_REFRESHED_AFTER_EXPIRY" ||
             request.reason === "PLAN_REGENERATED_AFTER_SAFE_CORRECTION") {
    if (!contact || !["pending", "failed"].includes(contact.status)) fail("CHECKPOINT_CONTACT_NOT_ELIGIBLE")
  } else {
    if (!contact || contact.status !== "failed") fail("CHECKPOINT_CONTACT_NOT_FAILED")
    if (!REBIND_ELIGIBLE_CONTACT_FAILURE_CODES.has(contact.errorCode)) fail("CHECKPOINT_CONTACT_ERROR_CODE_WRONG")
    if (contact.result !== undefined) fail("CHECKPOINT_CONTACT_RESULT_PRESENT")
  }

  if (!driveContinuationBoundary && !hubspotRecoveryBoundary && (!deal || deal.status !== "pending")) fail("CHECKPOINT_DEAL_NOT_PENDING")
  if (!driveContinuationBoundary && (!association || association.status !== "pending")) fail("CHECKPOINT_ASSOCIATION_NOT_PENDING")
  if (!area_folder || area_folder.status !== "pending") fail("CHECKPOINT_AREA_FOLDER_NOT_PENDING")
  if (!case_folder || case_folder.status !== "pending") fail("CHECKPOINT_CASE_FOLDER_NOT_PENDING")
  if (!uploads || uploads.status !== "pending") fail("CHECKPOINT_UPLOADS_NOT_PENDING")
  if (!final_verify || final_verify.status !== "pending") fail("CHECKPOINT_FINAL_VERIFY_NOT_PENDING")

  // Validar recursos vazios
  if (!checkpoint.resources || typeof checkpoint.resources !== "object") fail("CHECKPOINT_RESOURCES_MISSING")
  if (driveContinuationBoundary) {
    for (const name of ["contactId", "dealId", "associationId"]) if (!CASE_IMPORT_ID_PATTERN.test(checkpoint.resources[name] || "")) fail("CHECKPOINT_CONTINUATION_RESOURCE_MISSING")
  } else if (hubspotRecoveryBoundary) {
    if (!CASE_IMPORT_ID_PATTERN.test(checkpoint.resources.contactId || "") || checkpoint.resources.dealId !== null || checkpoint.resources.associationId !== null) fail("CHECKPOINT_CONTINUATION_RESOURCE_MISSING")
  } else {
    if (checkpoint.resources.contactId !== null) fail("CHECKPOINT_CONTACT_ID_PRESENT")
    if (checkpoint.resources.dealId !== null) fail("CHECKPOINT_DEAL_ID_PRESENT")
    if (checkpoint.resources.associationId !== null) fail("CHECKPOINT_ASSOCIATION_ID_PRESENT")
  }
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

  // Validar hashes existentes
  if (!HASH_PATTERN.test(request.oldAuthorizationSetHash)) fail("REBIND_OLD_AUTHORIZATION_SET_HASH_INVALID")
  if (!HASH_PATTERN.test(request.newAuthorizationSetHash)) fail("REBIND_NEW_AUTHORIZATION_SET_HASH_INVALID")
  if (request.reconciliationEvidenceHash !== null && !HASH_PATTERN.test(request.reconciliationEvidenceHash)) fail("REBIND_RECONCILIATION_EVIDENCE_HASH_INVALID")

  // Validar novos hashes de plano (opcionais para motivos antigos, obrigatórios para PLAN_REGENERATED_AFTER_SAFE_CORRECTION)
  validateNewHashes(request)

  // Validar reason
  validateReason(request.reason)

  // Validar requestedBy
  validateRequestedBy(request.requestedBy)

  return true
}

function createRebindRequest({ caseImportId, sourceCheckpointVersion, oldAuthorizationIds, newAuthorizationIds, reconciliationEvidence, reason, requestedBy, newAuthorizablePlanHash, newPlanHash, newManifestHash }) {
  // Validar inputs básicos
  if (!CASE_IMPORT_ID_PATTERN.test(caseImportId)) fail("REBIND_CASE_IMPORT_ID_INVALID")
  if (!Number.isInteger(sourceCheckpointVersion) || sourceCheckpointVersion < 1) fail("REBIND_SOURCE_CHECKPOINT_VERSION_INVALID")

  validateAuthorizationIds(oldAuthorizationIds, "REBIND_OLD_AUTHORIZATION_IDS")
  validateAuthorizationIds(newAuthorizationIds, "REBIND_NEW_AUTHORIZATION_IDS")
  validateReason(reason)
  validateRequestedBy(requestedBy)

  // Validar novos hashes de plano (opcionais para motivos antigos, obrigatórios para PLAN_REGENERATED_AFTER_SAFE_CORRECTION)
  validateNewHashes({
    caseImportId,
    reason,
    newAuthorizablePlanHash,
    newPlanHash,
    newManifestHash,
    newAuthorizationIds
  })

  // Validar que os novos IDs não reutilizam os antigos
  const sortedOld = [...oldAuthorizationIds].sort()
  const sortedNew = [...newAuthorizationIds].sort()
  if (sortedOld.length === sortedNew.length && sortedOld.every((id, idx) => id === sortedNew[idx])) fail("REBIND_NEW_AUTHORIZATION_IDS_INVALID")

  // Computar hashes (não muta arrays originais)
  const oldAuthorizationSetHash = computeAuthorizationSetHash(oldAuthorizationIds)
  const newAuthorizationSetHash = computeAuthorizationSetHash(newAuthorizationIds)

  // Validar evidência
  const preliminaryRequest = { caseImportId, sourceCheckpointVersion, oldAuthorizationIds, newAuthorizationIds, reason }
  validateReconciliationEvidence(reconciliationEvidence, preliminaryRequest)

  const reconciliationEvidenceHash = reconciliationEvidence?.evidenceHash || null

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
    requestedBy,
    newAuthorizablePlanHash: newAuthorizablePlanHash || null,
    newPlanHash: newPlanHash || null,
    newManifestHash: newManifestHash || null
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

// Prova de retomada pós-rebind

function validateResumeProofRequest(request) {
  if (!request || typeof request !== "object") fail("REBIND_RESUME_REQUEST_INVALID")

  // Validar caseImportId
  if (!CASE_IMPORT_ID_PATTERN.test(request.caseImportId)) fail("REBIND_RESUME_CASE_IMPORT_ID_INVALID")

  // Validar checkpoint estruturalmente
  if (!request.checkpoint || typeof request.checkpoint !== "object") fail("REBIND_RESUME_CHECKPOINT_INVALID")
  if (!Number.isInteger(request.checkpoint.version) || request.checkpoint.version < 1) fail("REBIND_RESUME_CHECKPOINT_VERSION_INVALID")

  // Validar authorizationIds do checkpoint
  if (!Array.isArray(request.checkpoint.authorizationIds)) fail("REBIND_RESUME_CHECKPOINT_AUTHORIZATION_IDS_NOT_ARRAY")
  validateAuthorizationIds(request.checkpoint.authorizationIds, "REBIND_RESUME_CHECKPOINT_AUTHORIZATION_IDS")

  // Validar expectedBindings
  if (!request.expectedBindings || typeof request.expectedBindings !== "object") fail("REBIND_RESUME_EXPECTED_BINDINGS_INVALID")
  if (!CASE_IMPORT_ID_PATTERN.test(request.expectedBindings.caseImportId)) fail("REBIND_RESUME_EXPECTED_BINDINGS_CASE_IMPORT_ID_INVALID")
  if (request.expectedBindings.caseImportId !== request.caseImportId) fail("REBIND_RESUME_EXPECTED_BINDINGS_CASE_IMPORT_ID_MISMATCH")
  if (!CASE_FINGERPRINT_PATTERN.test(request.expectedBindings.caseFingerprint)) fail("REBIND_RESUME_EXPECTED_BINDINGS_CASE_FINGERPRINT_INVALID")
  if (!CASE_NUMBER_PATTERN.test(request.expectedBindings.caseNumber)) fail("REBIND_RESUME_EXPECTED_BINDINGS_CASE_NUMBER_INVALID")
  if (!HASH_PATTERN.test(request.expectedBindings.authorizablePlanHash)) fail("REBIND_RESUME_EXPECTED_BINDINGS_AUTHORIZABLE_PLAN_HASH_INVALID")
  if (!HASH_PATTERN.test(request.expectedBindings.planHash)) fail("REBIND_RESUME_EXPECTED_BINDINGS_PLAN_HASH_INVALID")
  if (!HASH_PATTERN.test(request.expectedBindings.manifestHash)) fail("REBIND_RESUME_EXPECTED_BINDINGS_MANIFEST_HASH_INVALID")
  if (!HASH_PATTERN.test(request.expectedBindings.reservationEvidenceHash)) fail("REBIND_RESUME_EXPECTED_BINDINGS_RESERVATION_EVIDENCE_HASH_INVALID")
  if (!Number.isInteger(request.expectedBindings.schemaVersion) || request.expectedBindings.schemaVersion < 1) fail("REBIND_RESUME_EXPECTED_BINDINGS_SCHEMA_VERSION_INVALID")

  // Validar now
  if (typeof request.now !== "string") fail("REBIND_RESUME_NOW_INVALID")
  const nowDate = new Date(request.now)
  if (!Number.isFinite(nowDate.getTime())) fail("REBIND_RESUME_NOW_INVALID")

  return true
}

function validateResumeProof(proof) {
  if (!proof || typeof proof !== "object") fail("REBIND_RESUME_PROOF_INVALID")

  if (proof.status !== "VALID_REBIND_RESUME") fail("REBIND_RESUME_PROOF_STATUS_INVALID")

  if (!HASH_PATTERN.test(proof.rebindId)) fail("REBIND_RESUME_PROOF_REBIND_ID_INVALID")
  if (!CASE_IMPORT_ID_PATTERN.test(proof.caseImportId)) fail("REBIND_RESUME_PROOF_CASE_IMPORT_ID_INVALID")

  if (!Number.isInteger(proof.sourceCheckpointVersion) || proof.sourceCheckpointVersion < 1) fail("REBIND_RESUME_PROOF_SOURCE_VERSION_INVALID")
  if (!Number.isInteger(proof.reboundCheckpointVersion) || proof.reboundCheckpointVersion < 1) fail("REBIND_RESUME_PROOF_REBOUND_VERSION_INVALID")
  if (proof.reboundCheckpointVersion !== proof.sourceCheckpointVersion + 1) fail("REBIND_RESUME_PROOF_VERSION_SEQUENCE_INVALID")

  if (proof.authorizationCount !== 2) fail("REBIND_RESUME_PROOF_AUTHORIZATION_COUNT_INVALID")
  if (!HASH_PATTERN.test(proof.currentAuthorizationSetHash)) fail("REBIND_RESUME_PROOF_CURRENT_HASH_INVALID")

  if (typeof proof.committedAt !== "string") fail("REBIND_RESUME_PROOF_COMMITTED_AT_INVALID")
  const committedDate = new Date(proof.committedAt)
  if (!Number.isFinite(committedDate.getTime())) fail("REBIND_RESUME_PROOF_COMMITTED_AT_INVALID")

  if (!Array.isArray(proof.authorizationRecords)) fail("REBIND_RESUME_PROOF_AUTHORIZATION_RECORDS_NOT_ARRAY")
  if (proof.authorizationRecords.length !== 2) fail("REBIND_RESUME_PROOF_AUTHORIZATION_RECORDS_COUNT_INVALID")

  // Validar que records estão congelados
  if (!Object.isFrozen(proof.authorizationRecords)) fail("REBIND_RESUME_PROOF_AUTHORIZATION_RECORDS_NOT_FROZEN")
  for (const record of proof.authorizationRecords) {
    if (!Object.isFrozen(record)) fail("REBIND_RESUME_PROOF_AUTHORIZATION_RECORD_NOT_FROZEN")
  }

  return deepFreeze(proof)
}

function sanitizeResumeProofResponse(proof) {
  if (!proof || typeof proof !== "object") fail("REBIND_RESUME_PROOF_INVALID")

  const sanitized = {
    status: proof.status,
    rebindId: proof.rebindId,
    caseImportId: proof.caseImportId,
    sourceCheckpointVersion: proof.sourceCheckpointVersion,
    reboundCheckpointVersion: proof.reboundCheckpointVersion,
    authorizationCount: proof.authorizationCount,
    currentAuthorizationSetHash: proof.currentAuthorizationSetHash,
    committedAt: proof.committedAt
  }

  // Garantir que campos internos não vazam
  if (proof.authorizationIds !== undefined) fail("REBIND_RESUME_RESPONSE_CONTAINS_AUTHORIZATION_IDS")
  if (proof.authorizationRecords !== undefined) fail("REBIND_RESUME_RESPONSE_CONTAINS_AUTHORIZATION_RECORDS")
  if (proof.consumedBy !== undefined) fail("REBIND_RESUME_RESPONSE_CONTAINS_CONSUMED_BY")
  if (proof.consumedAt !== undefined) fail("REBIND_RESUME_RESPONSE_CONTAINS_CONSUMED_AT")
  if (proof.leaseId !== undefined) fail("REBIND_RESUME_RESPONSE_CONTAINS_LEASE_ID")
  if (proof.fencingToken !== undefined) fail("REBIND_RESUME_RESPONSE_CONTAINS_FENCING_TOKEN")
  if (proof.ownerId !== undefined) fail("REBIND_RESUME_RESPONSE_CONTAINS_OWNER_ID")

  return deepFreeze(sanitized)
}

module.exports = {
  REBIND_SCHEMA_VERSION,
  ALLOWED_REBIND_REASONS,
  AUTHORIZATION_ID_PATTERN,
  REQUESTED_BY_PATTERN,
  HASH_PATTERN,
  CASE_IMPORT_ID_PATTERN,
  CASE_FINGERPRINT_PATTERN,
  CASE_NUMBER_PATTERN,
  REBIND_ELIGIBLE_CONTACT_FAILURE_CODES,
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
  createRebindAuditMetadata,
  validateResumeProofRequest,
  validateResumeProof,
  sanitizeResumeProofResponse
}
