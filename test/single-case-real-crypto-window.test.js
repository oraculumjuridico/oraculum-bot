"use strict"

const test = require("node:test")
const assert = require("node:assert/strict")
const crypto = require("node:crypto")
const { createSingleCaseRebindPostgresRepository } = require("../src/infrastructure/single-case-rebind-postgres")
const { createRebindRequest } = require("../src/domain/single-case-rebind-contracts")
const { AUTHORIZATION_SCHEMA_VERSION, AUTH_SCOPES, authorizationPayload, createAuthorizationVerifier, sha256, canonicalize } = require("../src/domain/single-case-apply-contracts")
const { createSingleCaseAuthorizationSigner } = require("../src/domain/single-case-authorization-signer")

const NOW = "2026-07-25T12:00:00.000Z"
const CASE_IMPORT_ID = "fixture-crypto-window-case"
const CASE_FINGERPRINT = "abcdef123456"
const CASE_NUMBER = "CR.260725.001"
const AUTHORIZABLE_PLAN_HASH = "a".repeat(64)
const PLAN_HASH = "1".repeat(64)
const MANIFEST_HASH = "2".repeat(64)
const RESERVATION_EVIDENCE_HASH = "3".repeat(64)

const keys = crypto.generateKeyPairSync("ed25519")
const signer = () => createSingleCaseAuthorizationSigner({ privateKey: keys.privateKey, clock: () => NOW })
const verifier = createAuthorizationVerifier({ trustedIssuers: { "test-authority": keys.publicKey } })

function createAuthRecord(type, overrides = {}) {
  const issuedAt = new Date(Date.parse(NOW) - 10 * 60 * 1000).toISOString()
  const expiresAt = new Date(Date.parse(NOW) + 20 * 60 * 1000).toISOString()
  const base = {
    authorizationId: `crypto-auth-${type.toLowerCase()}`,
    schemaVersion: AUTHORIZATION_SCHEMA_VERSION,
    type,
    caseImportId: CASE_IMPORT_ID,
    caseFingerprint: CASE_FINGERPRINT,
    caseNumber: CASE_NUMBER,
    authorizablePlanHash: AUTHORIZABLE_PLAN_HASH,
    planHash: PLAN_HASH,
    manifestHash: MANIFEST_HASH,
    reservationEvidenceHash: RESERVATION_EVIDENCE_HASH,
    scope: [...AUTH_SCOPES[type]],
    issuer: "test-authority",
    issuedAt,
    expiresAt,
    revoked: false
  }
  return { ...base, ...overrides }
}

function signRecord(record) {
  return signer().sign(record)
}

function createMemoryPool(overrides = {}) {
  const authorizations = new Map()
  const checkpoints = new Map()
  const audits = new Map()
  const leases = new Map()
  const committed = { value: false }
  const rolledBack = { value: false }

  const defaultLease = {
    case_import_id: CASE_IMPORT_ID,
    lease_id: "lease-crypto-1",
    fencing_token: 1,
    owner_id: "test-worker",
    acquired_at: new Date(Date.parse(NOW) - 60000).toISOString(),
    expires_at: new Date(Date.parse(NOW) + 30 * 60 * 1000).toISOString(),
    released_at: null,
    version: 1,
    created_at: new Date(Date.parse(NOW) - 60000).toISOString(),
    updated_at: new Date(Date.parse(NOW) - 60000).toISOString()
  }
  leases.set(CASE_IMPORT_ID, { ...defaultLease, ...(overrides.lease || {}) })

  const defaultCheckpoint = {
    case_import_id: CASE_IMPORT_ID,
    schema_version: 2,
    checkpoint_version: 13,
    case_fingerprint: CASE_FINGERPRINT,
    case_number: CASE_NUMBER,
    authorizable_plan_hash: AUTHORIZABLE_PLAN_HASH,
    authorization_ids: [],
    global_status: "failed",
    checkpoint_payload: {
      schemaVersion: 2,
      caseImportId: CASE_IMPORT_ID,
      caseFingerprint: CASE_FINGERPRINT,
      caseNumber: CASE_NUMBER,
      authorizablePlanHash: AUTHORIZABLE_PLAN_HASH,
      authorizationIds: [],
      status: "failed",
      version: 13,
      steps: {
        reservation: { status: "completed", result: { verified: true, caseImportId: CASE_IMPORT_ID, caseNumber: CASE_NUMBER, evidenceId: "reservation-proof" } },
        contact: { status: "failed", errorCode: "CONTACT_FIELDS_DIVERGENCE" },
        deal: { status: "pending", errorCode: null },
        association: { status: "pending", errorCode: null },
        area_folder: { status: "pending", errorCode: null },
        case_folder: { status: "pending", errorCode: null },
        uploads: { status: "pending", errorCode: null },
        final_verify: { status: "pending", errorCode: null }
      },
      resources: { contactId: null, dealId: null, associationId: null, areaFolderId: null, caseFolderId: null },
      uploads: {},
      finalProof: null
    },
    fencing_token: 1,
    lease_id: "lease-crypto-1",
    created_at: NOW,
    updated_at: NOW
  }
  checkpoints.set(CASE_IMPORT_ID, { ...defaultCheckpoint, ...(overrides.checkpoint || {}) })

  if (overrides.authorizations) {
    overrides.authorizations.forEach(auth => authorizations.set(auth.authorization_id, { ...auth }))
  }

  return {
    state: { authorizations, checkpoints, audits, leases, committed, rolledBack },
    async connect() {
      const client = {
        async query(sql, params) {
          const text = String(sql).replace(/\s+/g, " ").trim()

          if (text === "BEGIN") return { rows: [], rowCount: 0 }
          if (text === "COMMIT") { committed.value = true; return { rows: [], rowCount: 0 } }
          if (text === "ROLLBACK") { rolledBack.value = true; return { rows: [], rowCount: 0 } }
          if (text.includes("pg_advisory_xact_lock")) return { rows: [], rowCount: 0 }
          if (text === "SELECT CURRENT_TIMESTAMP AS now") return { rows: [{ now: NOW }], rowCount: 1 }

          if (text.includes("FROM single_case_apply_leases") &&
              text.includes("expires_at > CURRENT_TIMESTAMP AS is_current") &&
              !text.includes("FOR UPDATE")) {
            const lease = leases.get(params[0])
            if (!lease) return { rows: [], rowCount: 0 }
            const is_current = Date.parse(lease.expires_at) > Date.parse(NOW)
            return { rows: [{ owner_id: lease.owner_id, fencing_token: lease.fencing_token, released_at: lease.released_at, expires_at: lease.expires_at, is_current }], rowCount: 1 }
          }

          if (text.includes("FROM single_case_apply_leases") && text.includes("FOR UPDATE")) {
            const lease = leases.get(params[0])
            if (!lease) return { rows: [], rowCount: 0 }
            return { rows: [lease], rowCount: 1 }
          }

          if (text.includes("FROM single_case_apply_checkpoints") && text.includes("FOR UPDATE")) {
            const checkpoint = checkpoints.get(params[0])
            if (!checkpoint) return { rows: [], rowCount: 0 }
            return { rows: [checkpoint], rowCount: 1 }
          }

          if (text.includes("FROM single_case_apply_rebind_audit") && text.includes("WHERE rebind_id")) {
            const audit = audits.get(params[0])
            if (!audit) return { rows: [], rowCount: 0 }
            return { rows: [audit], rowCount: 1 }
          }

          if (text.includes("FROM single_case_apply_authorizations") && text.includes("FOR UPDATE")) {
            const authIds = params[0]
            const rows = authIds.map(id => authorizations.get(id)).filter(Boolean)
            return { rows, rowCount: rows.length }
          }

          if (text.includes("UPDATE single_case_apply_authorizations") && text.includes("consumed_at")) {
            const consumedBy = params[0]
            const authIds = params[1]
            let updated = 0
            const resultRows = []
            for (const id of authIds) {
              const auth = authorizations.get(id)
              if (auth && auth.operational_status === "ACTIVE" && !auth.consumed_at && !auth.revoked && Date.parse(auth.expires_at) > Date.parse(NOW)) {
                auth.consumed_at = NOW
                auth.consumed_by = consumedBy
                resultRows.push({ authorization_id: id, consumed_at: NOW, consumed_by: consumedBy })
                updated++
              }
            }
            return { rows: resultRows, rowCount: updated }
          }

          if (text.startsWith("UPDATE single_case_apply_checkpoints")) {
            const caseImportId = params[6]
            const expectedVersion = params[7]
            const expectedLeaseId = params[8]
            const expectedFencingToken = params[9]
            const ownerId = params[10]

            const checkpoint = checkpoints.get(caseImportId)
            if (!checkpoint) return { rows: [], rowCount: 0 }

            const lease = leases.get(caseImportId)
            if (!lease) return { rows: [], rowCount: 0 }

            if (Number(checkpoint.checkpoint_version) !== Number(expectedVersion)) return { rows: [], rowCount: 0 }
            if (checkpoint.lease_id !== expectedLeaseId) return { rows: [], rowCount: 0 }
            if (Number(checkpoint.fencing_token) !== Number(expectedFencingToken)) return { rows: [], rowCount: 0 }
            if (lease.owner_id !== ownerId) return { rows: [], rowCount: 0 }
            if (lease.released_at) return { rows: [], rowCount: 0 }
            if (Date.parse(lease.expires_at) <= Date.parse(NOW)) return { rows: [], rowCount: 0 }

            checkpoint.checkpoint_version = params[0]
            checkpoint.authorizable_plan_hash = params[1]
            checkpoint.authorization_ids = JSON.parse(params[2])
            checkpoint.checkpoint_payload = JSON.parse(params[3])
            checkpoint.fencing_token = params[4]
            checkpoint.lease_id = params[5]
            checkpoint.updated_at = NOW

            return { rows: [{ checkpoint_version: params[0] }], rowCount: 1 }
          }

          if (text.includes("INSERT INTO") && text.includes("single_case_apply_rebind_audit")) {
            const caseImportId = params[1]
            const lease = leases.get(caseImportId)
            if (!lease) return { rows: [], rowCount: 0 }
            if (lease.owner_id !== params[12]) return { rows: [], rowCount: 0 }
            if (lease.released_at) return { rows: [], rowCount: 0 }
            if (Date.parse(lease.expires_at) <= Date.parse(NOW)) return { rows: [], rowCount: 0 }
            if (lease.lease_id !== params[11]) return { rows: [], rowCount: 0 }
            if (Number(lease.fencing_token) !== Number(params[10])) return { rows: [], rowCount: 0 }

            const audit = {
              rebind_id: params[0],
              case_import_id: caseImportId,
              source_checkpoint_version: params[2],
              rebound_checkpoint_version: params[3],
              authorization_count: params[4],
              previous_authorization_set_hash: params[5],
              current_authorization_set_hash: params[6],
              reconciliation_evidence_hash: params[7],
              reason: params[8],
              requested_by: params[9],
              fencing_token: params[10],
              lease_id: params[11],
              committed_at: NOW
            }
            audits.set(audit.rebind_id, audit)
            return { rows: [{ rebind_id: params[0] }], rowCount: 1 }
          }

          if (text.includes("FROM single_case_apply_rebind_audit")) {
            return { rows: [], rowCount: 0 }
          }

          throw new Error("UNMOCKED_QUERY: " + text.substring(0, 80))
        },
        release() {}
      }
      return client
    },
    async query() {
      throw new Error("POOL_QUERY_NOT_USED")
    }
  }
}

function insertAuth(pool, record, overrides = {}) {
  pool.state.authorizations.set(record.authorizationId, {
    authorization_id: record.authorizationId,
    schema_version: record.schemaVersion,
    authorization_type: record.type,
    case_import_id: record.caseImportId,
    case_fingerprint: record.caseFingerprint,
    case_number: record.caseNumber,
    authorizable_plan_hash: record.authorizablePlanHash,
    plan_hash: record.planHash,
    manifest_hash: record.manifestHash,
    reservation_evidence_hash: record.reservationEvidenceHash,
    scope: record.scope,
    issuer: record.issuer,
    issued_at: record.issuedAt,
    expires_at: record.expiresAt,
    revoked: record.revoked,
    revoked_at: null,
    revocation_reason: null,
    consumed_at: overrides.consumedAt || null,
    consumed_by: overrides.consumedBy || null,
    signature: record.proof,
    signature_algorithm: "Ed25519",
    operational_status: overrides.operationalStatus || "ACTIVE",
    superseded_at: null,
    created_at: NOW,
    updated_at: NOW
  })
}

test("janela operacional com criptografia real: emissão -> rebind -> apply", async () => {
  const pool = createMemoryPool()
  const rebindRepository = createSingleCaseRebindPostgresRepository({ pool, ownerId: "test-worker", now: () => NOW })

  const oldExplicit = signRecord(createAuthRecord("EXPLICIT_APPLY_AUTHORIZATION", { authorizationId: "old-crypto-auth-explicit", expiresAt: new Date(Date.parse(NOW) + 20 * 60 * 1000).toISOString() }))
  const oldExternal = signRecord(createAuthRecord("EXTERNAL_WRITES_AUTHORIZATION", { authorizationId: "old-crypto-auth-external", expiresAt: new Date(Date.parse(NOW) + 20 * 60 * 1000).toISOString() }))
  insertAuth(pool, oldExplicit, { consumedAt: NOW, consumedBy: "executor:lease-crypto-1" })
  insertAuth(pool, oldExternal, { consumedAt: NOW, consumedBy: "executor:lease-crypto-1" })

  const explicitRecord = signRecord(createAuthRecord("EXPLICIT_APPLY_AUTHORIZATION", { authorizationId: "new-crypto-auth-explicit" }))
  const externalRecord = signRecord(createAuthRecord("EXTERNAL_WRITES_AUTHORIZATION", { authorizationId: "new-crypto-auth-external" }))
  insertAuth(pool, explicitRecord)
  insertAuth(pool, externalRecord)

  assert.equal(pool.state.authorizations.size, 4)

  const checkpointRow = pool.state.checkpoints.get(CASE_IMPORT_ID)
  checkpointRow.authorization_ids = [oldExplicit.authorizationId, oldExternal.authorizationId]
  checkpointRow.checkpoint_payload.authorizationIds = [oldExplicit.authorizationId, oldExternal.authorizationId]

  const rebindRequest = createRebindRequest({
    caseImportId: CASE_IMPORT_ID,
    sourceCheckpointVersion: 13,
    oldAuthorizationIds: [oldExplicit.authorizationId, oldExternal.authorizationId],
    newAuthorizationIds: [explicitRecord.authorizationId, externalRecord.authorizationId],
    reason: "PLAN_REGENERATED_AFTER_SAFE_CORRECTION",
    requestedBy: "test-rebind",
    newAuthorizablePlanHash: AUTHORIZABLE_PLAN_HASH,
    newPlanHash: PLAN_HASH,
    newManifestHash: MANIFEST_HASH
  })

  const rebindResult = await rebindRepository.executeRebind(rebindRequest)
  assert.equal(rebindResult.status, "rebound")
  assert.equal(rebindResult.reboundCheckpointVersion, 14)

  const explicitAfter = pool.state.authorizations.get(explicitRecord.authorizationId)
  const externalAfter = pool.state.authorizations.get(externalRecord.authorizationId)
  assert.equal(explicitAfter.consumed_at, NOW)
  assert.equal(explicitAfter.consumed_by, `rebind:${rebindResult.rebindId}`)
  assert.equal(externalAfter.consumed_at, NOW)
  assert.equal(externalAfter.consumed_by, `rebind:${rebindResult.rebindId}`)

  const cp = pool.state.checkpoints.get(CASE_IMPORT_ID)
  assert.equal(cp.checkpoint_version, 14)

  for (const record of [explicitAfter, externalAfter]) {
    const reconstituted = {
      authorizationId: record.authorization_id,
      schemaVersion: record.schema_version,
      type: record.authorization_type,
      caseImportId: record.case_import_id,
      caseFingerprint: record.case_fingerprint,
      caseNumber: record.case_number,
      authorizablePlanHash: record.authorizable_plan_hash,
      planHash: record.plan_hash,
      manifestHash: record.manifest_hash,
      reservationEvidenceHash: record.reservation_evidence_hash,
      scope: record.scope,
      issuer: record.issuer,
      issuedAt: record.issued_at,
      expiresAt: record.expires_at,
      revoked: record.revoked
    }
    const payload = Buffer.from(authorizationPayload(reconstituted))
    const signatureValid = crypto.verify(null, payload, keys.publicKey, Buffer.from(record.signature, "base64"))
    assert.equal(signatureValid, true)
  }
})

test("janela abaixo do mínimo bloqueia rebind antes do consumo", async () => {
  const pool = createMemoryPool({
    lease: {
      case_import_id: CASE_IMPORT_ID,
      lease_id: "lease-crypto-2",
      fencing_token: 2,
      owner_id: "test-worker",
      acquired_at: NOW,
      expires_at: new Date(Date.parse(NOW) + 30 * 60 * 1000).toISOString(),
      released_at: null,
      version: 1
    }
  })
  const rebindRepository = createSingleCaseRebindPostgresRepository({ pool, ownerId: "test-worker", now: () => NOW })

  const oldExplicit = signRecord(createAuthRecord("EXPLICIT_APPLY_AUTHORIZATION", { authorizationId: "old-min-auth-explicit", issuedAt: NOW, expiresAt: new Date(Date.parse(NOW) + 30 * 60 * 1000).toISOString() }))
  const oldExternal = signRecord(createAuthRecord("EXTERNAL_WRITES_AUTHORIZATION", { authorizationId: "old-min-auth-external", issuedAt: NOW, expiresAt: new Date(Date.parse(NOW) + 30 * 60 * 1000).toISOString() }))
  insertAuth(pool, oldExplicit, { consumedAt: NOW, consumedBy: "executor:lease-crypto-2" })
  insertAuth(pool, oldExternal, { consumedAt: NOW, consumedBy: "executor:lease-crypto-2" })

  const checkpointRow2 = pool.state.checkpoints.get(CASE_IMPORT_ID)
  checkpointRow2.authorization_ids = [oldExplicit.authorizationId, oldExternal.authorizationId]
  checkpointRow2.checkpoint_payload.authorizationIds = [oldExplicit.authorizationId, oldExternal.authorizationId]
  checkpointRow2.lease_id = "lease-crypto-2"

  const explicitRecord = signRecord(createAuthRecord("EXPLICIT_APPLY_AUTHORIZATION"))
  const externalRecord = signRecord(createAuthRecord("EXTERNAL_WRITES_AUTHORIZATION"))

  const shortExpiresAt = new Date(Date.parse(NOW) + 4 * 60 * 1000).toISOString()
  const shortExplicit = { ...explicitRecord, authorizationId: "new-min-auth-explicit", expiresAt: shortExpiresAt }
  const shortExternal = { ...externalRecord, authorizationId: "new-min-auth-external", expiresAt: shortExpiresAt }

  for (const rec of [shortExplicit, shortExternal]) {
    pool.state.authorizations.set(rec.authorizationId, {
      authorization_id: rec.authorizationId,
      schema_version: rec.schemaVersion,
      authorization_type: rec.type,
      case_import_id: rec.caseImportId,
      case_fingerprint: rec.caseFingerprint,
      case_number: rec.caseNumber,
      authorizable_plan_hash: rec.authorizablePlanHash,
      plan_hash: rec.planHash,
      manifest_hash: rec.manifestHash,
      reservation_evidence_hash: rec.reservationEvidenceHash,
      scope: rec.scope,
      issuer: rec.issuer,
      issued_at: rec.issuedAt,
      expires_at: rec.expiresAt,
      revoked: rec.revoked,
      revoked_at: null,
      revocation_reason: null,
      consumed_at: null,
      consumed_by: null,
      signature: rec.proof,
      signature_algorithm: "Ed25519",
      operational_status: "ACTIVE",
      superseded_at: null,
      created_at: NOW,
      updated_at: NOW
    })
  }

  const rebindRequest = createRebindRequest({
    caseImportId: CASE_IMPORT_ID,
    sourceCheckpointVersion: 13,
    oldAuthorizationIds: [oldExplicit.authorizationId, oldExternal.authorizationId],
    newAuthorizationIds: [shortExplicit.authorizationId, shortExternal.authorizationId],
    reason: "PLAN_REGENERATED_AFTER_SAFE_CORRECTION",
    requestedBy: "test-rebind",
    newAuthorizablePlanHash: AUTHORIZABLE_PLAN_HASH,
    newPlanHash: PLAN_HASH,
    newManifestHash: MANIFEST_HASH
  })

  let error
  try {
    await rebindRepository.executeRebind(rebindRequest)
  } catch (e) {
    error = e
  }

  assert.ok(error, "deve rejeitar")
  assert.equal(error.message, "REBIND_NEW_PAIR_INSUFFICIENT_REMAINING_TTL")

  const explicitAfter = pool.state.authorizations.get(shortExplicit.authorizationId)
  assert.equal(explicitAfter.consumed_at, null)

  const cp = pool.state.checkpoints.get(CASE_IMPORT_ID)
  assert.equal(cp.checkpoint_version, 13)
})
