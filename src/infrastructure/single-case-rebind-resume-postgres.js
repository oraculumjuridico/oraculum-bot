"use strict"

const {
  HASH_PATTERN,
  computeAuthorizationSetHash,
  validateResumeProofRequest,
  validateResumeProof
} = require("../domain/single-case-rebind-contracts")
const { deepFreeze } = require("../domain/single-case-apply-contracts")

const REBIND_AUDIT_TABLE = "single_case_apply_rebind_audit"
const CHECKPOINT_TABLE = "single_case_apply_checkpoints"
const AUTHORIZATION_TABLE = "single_case_apply_authorizations"

const LEGITIMATE_ERROR_CODES = new Set([
  "REBIND_RESUME_REQUEST_INVALID",
  "REBIND_RESUME_CHECKPOINT_NOT_FOUND",
  "REBIND_RESUME_CHECKPOINT_DIVERGENT",
  "REBIND_RESUME_AUDIT_NOT_FOUND",
  "REBIND_RESUME_AUDIT_AMBIGUOUS",
  "REBIND_RESUME_AUDIT_DIVERGENT",
  "REBIND_RESUME_AUTHORIZATIONS_NOT_FOUND",
  "REBIND_RESUME_AUTHORIZATIONS_AMBIGUOUS",
  "REBIND_RESUME_AUTHORIZATION_TYPES_INVALID",
  "REBIND_RESUME_BINDINGS_MISMATCH",
  "REBIND_RESUME_CONSUMPTION_MISMATCH",
  "REBIND_RESUME_CONSUMED_BY_INVALID",
  "POSTGRES_UNAVAILABLE",
  "POSTGRES_READ_FAILED"
])

const fail = code => { throw new Error(code) }

const mapError = error => {
  const message = error?.message || ""
  if (LEGITIMATE_ERROR_CODES.has(message)) return new Error(message)

  const unavailableCodes = new Set(["ECONNREFUSED", "ECONNRESET", "ETIMEDOUT", "EHOSTUNREACH", "ENETUNREACH", "57P01", "57P02", "57P03", "08000", "08001", "08003", "08004", "08006", "08007", "08P01"])
  const unavailable = message === "POOL_UNAVAILABLE" || unavailableCodes.has(error?.code) || error?.name === "ConnectionTerminatedError"

  return new Error(unavailable ? "POSTGRES_UNAVAILABLE" : "POSTGRES_READ_FAILED")
}

function parsePgArrayLike(value) {
  if (Array.isArray(value)) return value
  if (value == null) return null
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value)
      if (Array.isArray(parsed)) return parsed
      return null
    } catch (e) {
      return null
    }
  }
  return null
}

function ensureStringArray(value, errorCode) {
  const arr = parsePgArrayLike(value)
  if (!Array.isArray(arr) || arr.some(x => typeof x !== 'string' || x.length === 0)) throw new Error(errorCode)
  return [...arr]
}

function createSingleCaseRebindResumeVerifier({ pool }) {
  if (!pool || typeof pool.query !== "function") fail("POSTGRES_UNAVAILABLE")

  const verifier = {
    async verifyResumeProof(request) {
      // Validar requisição
      validateResumeProofRequest(request)

      try {
        const { caseImportId, checkpoint, expectedBindings } = request
        const expectedVersion = checkpoint.version
        const expectedAuthorizationIds = [...checkpoint.authorizationIds].sort()

        // 1. Consultar checkpoint atual (sem FOR UPDATE - somente leitura)
        const checkpointResult = await pool.query(
          `SELECT case_import_id, checkpoint_version, authorization_ids, checkpoint_payload
           FROM ${CHECKPOINT_TABLE}
           WHERE case_import_id = $1`,
          [caseImportId]
        )

        if (!checkpointResult.rowCount) fail("REBIND_RESUME_CHECKPOINT_NOT_FOUND")

        const checkpointRow = checkpointResult.rows[0]

        // Validar que checkpoint atual tem a versão esperada
        if (Number(checkpointRow.checkpoint_version) !== expectedVersion) {
          fail("REBIND_RESUME_CHECKPOINT_DIVERGENT")
        }

        // Validar que authorization_ids da linha coincidem com payload
        const rowAuthIds = ensureStringArray(checkpointRow.authorization_ids, "REBIND_RESUME_CHECKPOINT_DIVERGENT")
        const payload = typeof checkpointRow.checkpoint_payload === 'string'
          ? JSON.parse(checkpointRow.checkpoint_payload)
          : checkpointRow.checkpoint_payload

        if (!payload || typeof payload !== 'object') fail("REBIND_RESUME_CHECKPOINT_DIVERGENT")
        if (!Array.isArray(payload.authorizationIds)) fail("REBIND_RESUME_CHECKPOINT_DIVERGENT")
        if (payload.version !== expectedVersion) fail("REBIND_RESUME_CHECKPOINT_DIVERGENT")

        const payloadAuthIds = [...payload.authorizationIds].sort()
        const sortedRowAuthIds = [...rowAuthIds].sort()

        if (JSON.stringify(sortedRowAuthIds) !== JSON.stringify(payloadAuthIds)) {
          fail("REBIND_RESUME_CHECKPOINT_DIVERGENT")
        }

        // Validar que IDs coincidem com o esperado
        if (JSON.stringify(sortedRowAuthIds) !== JSON.stringify(expectedAuthorizationIds)) {
          fail("REBIND_RESUME_CHECKPOINT_DIVERGENT")
        }

        // Computar hash do conjunto atual
        const currentAuthorizationSetHash = computeAuthorizationSetHash(rowAuthIds)

        // 2. Consultar auditoria
        const auditResult = await pool.query(
          `SELECT rebind_id, case_import_id, source_checkpoint_version, rebound_checkpoint_version,
                  authorization_count, current_authorization_set_hash, committed_at
           FROM ${REBIND_AUDIT_TABLE}
           WHERE case_import_id = $1
             AND rebound_checkpoint_version = $2
             AND current_authorization_set_hash = $3`,
          [caseImportId, expectedVersion, currentAuthorizationSetHash]
        )

        if (!auditResult.rowCount) fail("REBIND_RESUME_AUDIT_NOT_FOUND")
        if (auditResult.rowCount > 1) fail("REBIND_RESUME_AUDIT_AMBIGUOUS")

        const audit = auditResult.rows[0]

        // Validar auditoria
        if (audit.case_import_id !== caseImportId) fail("REBIND_RESUME_AUDIT_DIVERGENT")
        if (Number(audit.rebound_checkpoint_version) !== expectedVersion) fail("REBIND_RESUME_AUDIT_DIVERGENT")
        if (audit.current_authorization_set_hash !== currentAuthorizationSetHash) fail("REBIND_RESUME_AUDIT_DIVERGENT")
        if (Number(audit.authorization_count) !== 2) fail("REBIND_RESUME_AUDIT_DIVERGENT")
        if (!HASH_PATTERN.test(audit.rebind_id)) fail("REBIND_RESUME_AUDIT_DIVERGENT")
        if (!audit.committed_at) fail("REBIND_RESUME_AUDIT_DIVERGENT")

        const rebindId = audit.rebind_id
        const sourceCheckpointVersion = Number(audit.source_checkpoint_version)
        const committedAt = new Date(audit.committed_at).toISOString()

        // 3. Consultar exatamente as duas autorizações
        const authResult = await pool.query(
          `SELECT authorization_id, authorization_type, case_import_id, case_fingerprint, case_number,
                  authorizable_plan_hash, plan_hash, manifest_hash, reservation_evidence_hash,
                  schema_version, revoked, consumed_at, consumed_by, expires_at, operational_status
           FROM ${AUTHORIZATION_TABLE}
           WHERE authorization_id = ANY($1::text[])
           ORDER BY authorization_id`,
          [rowAuthIds]
        )

        if (!authResult.rowCount) fail("REBIND_RESUME_AUTHORIZATIONS_NOT_FOUND")
        if (authResult.rowCount !== 2) fail("REBIND_RESUME_AUTHORIZATIONS_AMBIGUOUS")

        const authorizations = authResult.rows

        // Validar IDs exatos
        const foundIds = authorizations.map(a => a.authorization_id).sort()
        if (JSON.stringify(foundIds) !== JSON.stringify(sortedRowAuthIds)) {
          fail("REBIND_RESUME_AUTHORIZATIONS_AMBIGUOUS")
        }

        // Validar tipos (exatamente um de cada)
        const types = authorizations.map(a => a.authorization_type).sort()
        const expectedTypes = ["EXPLICIT_APPLY_AUTHORIZATION", "EXTERNAL_WRITES_AUTHORIZATION"]
        if (JSON.stringify(types) !== JSON.stringify(expectedTypes)) {
          fail("REBIND_RESUME_AUTHORIZATION_TYPES_INVALID")
        }

        // Validar bindings integralmente
        for (const auth of authorizations) {
          if (auth.case_import_id !== expectedBindings.caseImportId) fail("REBIND_RESUME_BINDINGS_MISMATCH")
          if (auth.case_fingerprint !== expectedBindings.caseFingerprint) fail("REBIND_RESUME_BINDINGS_MISMATCH")
          if (auth.case_number !== expectedBindings.caseNumber) fail("REBIND_RESUME_BINDINGS_MISMATCH")
          if (auth.authorizable_plan_hash !== expectedBindings.authorizablePlanHash) fail("REBIND_RESUME_BINDINGS_MISMATCH")
          if (auth.plan_hash !== expectedBindings.planHash) fail("REBIND_RESUME_BINDINGS_MISMATCH")
          if (auth.manifest_hash !== expectedBindings.manifestHash) fail("REBIND_RESUME_BINDINGS_MISMATCH")
          if (auth.reservation_evidence_hash !== expectedBindings.reservationEvidenceHash) fail("REBIND_RESUME_BINDINGS_MISMATCH")
          if (Number(auth.schema_version) !== expectedBindings.schemaVersion) fail("REBIND_RESUME_BINDINGS_MISMATCH")
        }

        // Validar operational_status e revoked
        for (const auth of authorizations) {
          if (auth.operational_status !== 'ACTIVE') fail("REBIND_RESUME_CONSUMPTION_MISMATCH")
          if (auth.revoked !== false) fail("REBIND_RESUME_CONSUMPTION_MISMATCH")
        }

        // Validar consumed_at presente e idêntico
        if (!authorizations[0].consumed_at || !authorizations[1].consumed_at) {
          fail("REBIND_RESUME_CONSUMPTION_MISMATCH")
        }

        const consumedAt0 = new Date(authorizations[0].consumed_at).toISOString()
        const consumedAt1 = new Date(authorizations[1].consumed_at).toISOString()

        if (consumedAt0 !== consumedAt1) fail("REBIND_RESUME_CONSUMPTION_MISMATCH")

        // Validar consumed_by idêntico
        if (authorizations[0].consumed_by !== authorizations[1].consumed_by) {
          fail("REBIND_RESUME_CONSUMPTION_MISMATCH")
        }

        const consumedBy = authorizations[0].consumed_by

        // Validar formato consumed_by: rebind:<rebindId>
        if (!consumedBy || typeof consumedBy !== 'string') fail("REBIND_RESUME_CONSUMED_BY_INVALID")
        if (!consumedBy.startsWith('rebind:')) fail("REBIND_RESUME_CONSUMED_BY_INVALID")

        const consumedByRebindId = consumedBy.substring('rebind:'.length)
        if (consumedByRebindId !== rebindId) fail("REBIND_RESUME_CONSUMED_BY_INVALID")

        // Construir authorization records congelados
        const authorizationRecords = authorizations.map(auth => deepFreeze({
          authorizationId: auth.authorization_id,
          authorizationType: auth.authorization_type,
          caseImportId: auth.case_import_id,
          caseFingerprint: auth.case_fingerprint,
          caseNumber: auth.case_number,
          authorizablePlanHash: auth.authorizable_plan_hash,
          planHash: auth.plan_hash,
          manifestHash: auth.manifest_hash,
          reservationEvidenceHash: auth.reservation_evidence_hash,
          schemaVersion: Number(auth.schema_version),
          revoked: auth.revoked,
          consumedAt: new Date(auth.consumed_at).toISOString(),
          consumedBy: auth.consumed_by,
          expiresAt: new Date(auth.expires_at).toISOString(),
          operationalStatus: auth.operational_status
        }))

        // Construir prova
        const proof = {
          status: "VALID_REBIND_RESUME",
          rebindId,
          caseImportId,
          sourceCheckpointVersion,
          reboundCheckpointVersion: expectedVersion,
          authorizationCount: 2,
          currentAuthorizationSetHash,
          committedAt,
          authorizationRecords: deepFreeze(authorizationRecords)
        }

        // Validar e congelar prova
        return validateResumeProof(proof)

      } catch (error) {
        throw mapError(error)
      }
    }
  }

  return Object.freeze(verifier)
}

module.exports = {
  createSingleCaseRebindResumeVerifier
}
