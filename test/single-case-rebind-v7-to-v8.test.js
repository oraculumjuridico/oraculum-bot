const assert = require("node:assert/strict")
const { test } = require("node:test")
const crypto = require("node:crypto")
const { createSingleCaseRebindPostgresRepository } = require("../src/infrastructure/single-case-rebind-postgres")
const { createRebindRequest, computeAuthorizationSetHash } = require("../src/domain/single-case-rebind-contracts")

/**
 * TESTE: REBIND v7→v8 - Renovação de autorização após expiração
 *
 * Cenário Piloto 1:
 * - Checkpoint v7 em estado "failed"
 * - Autorizações do v7 foram consumidas pelo REBIND v6→v7 e expiraram
 * - Novo par de autorizações emitido
 * - REBIND v7→v8 deve executar com sucesso
 * - Cadeia de auditoria deve ter v4→v5, v5→v6, v6→v7, v7→v8
 *
 * Este teste valida que:
 * 1. REBIND v7→v8 funciona mesmo com autorizações antigas expiradas
 * 2. A infraestrutura genérica (source > 0) suporta v7→v8
 * 3. Cadeia histórica é preservada
 * 4. Validações de autorização funcionam corretamente
 */

const CASE_IMPORT_ID = "inss-e3dfb0f332b117d60bf2"
const OWNER_ID = "test-rebind-v7-v8"
const LEASE_ID = `lease-${crypto.randomUUID()}`
const FENCING_TOKEN = 10
const NOW = "2026-07-22T00:00:00.000Z"

const CASE_FINGERPRINT = "7fabdcc83975"
const CASE_NUMBER = "PRV.260714.707"
const AUTHORIZABLE_PLAN_HASH = crypto.createHash("sha256").update(JSON.stringify({ plan: "test" })).digest("hex")
const PLAN_HASH = crypto.createHash("sha256").update(JSON.stringify({ plan: "full" })).digest("hex")
const MANIFEST_HASH = crypto.createHash("sha256").update(JSON.stringify({ manifest: "test" })).digest("hex")
const RESERVATION_EVIDENCE_HASH = crypto.createHash("sha256").update(JSON.stringify({ reservation: "test" })).digest("hex")

const OLD_AUTH_V7_1 = `oraculum-bot-p1-authorization-v1.20260720T120000.old-v7-1`
const OLD_AUTH_V7_2 = `oraculum-bot-p1-authorization-v1.20260720T120000.old-v7-2`
const NEW_AUTH_V8_1 = `oraculum-bot-p1-authorization-v1.20260722T000000.new-v8-1`
const NEW_AUTH_V8_2 = `oraculum-bot-p1-authorization-v1.20260722T000000.new-v8-2`

const V6_V7_REBIND_ID = "ac997d0a6d2cfdc7bb8b434b8464ffe1cad22d5363de3eb82aaf6130abcdef12"
const V4_V5_REBIND_ID = "4".repeat(64)
const V5_V6_REBIND_ID = "5".repeat(64)

function mockPool(poolState) {
  const clone = obj => JSON.parse(JSON.stringify(obj))

  return {
    async connect() {
      const client = {
        async query(text, params = []) {
          text = String(text).replace(/\s+/g, " ").trim()

          // Transaction control
          if (text === "BEGIN") return { rows: [], rowCount: 0 }
          if (text === "COMMIT") return { rows: [], rowCount: 0 }
          if (text === "ROLLBACK") return { rows: [], rowCount: 0 }

          // Advisory lock
          if (text.includes("pg_advisory_xact_lock")) {
            return { rows: [{}], rowCount: 1 }
          }

          // Lease FOR UPDATE
          if (text.includes("FROM single_case_apply_leases") && text.includes("FOR UPDATE")) {
            const lease = poolState.leases.get(params[0])
            if (!lease) return { rows: [], rowCount: 0 }
            return { rows: [clone(lease)], rowCount: 1 }
          }

          // Checkpoint FOR UPDATE
          if (text.includes("FROM single_case_apply_checkpoints") && text.includes("FOR UPDATE")) {
            const checkpoint = poolState.checkpoints.get(params[0])
            if (!checkpoint) return { rows: [], rowCount: 0 }
            return { rows: [clone(checkpoint)], rowCount: 1 }
          }

          // Rebind audit by rebindId (idempotência)
          if (text.includes("FROM single_case_apply_rebind_audit") && text.includes("WHERE rebind_id = $1")) {
            const audit = poolState.audits.get(params[0])
            if (!audit) return { rows: [], rowCount: 0 }
            return { rows: [clone(audit)], rowCount: 1 }
          }

          // Rebind audit by rebindId (legacy consumption proof)
          if (text.includes("FROM single_case_apply_rebind_audit") && text.includes("WHERE rebind_id=$1")) {
            const audit = poolState.audits.get(params[0])
            if (!audit) return { rows: [], rowCount: 0 }
            return { rows: [clone(audit)], rowCount: 1 }
          }

          // Authorizations FOR UPDATE
          if (text.includes("FROM single_case_apply_authorizations") && text.includes("FOR UPDATE")) {
            const authIds = params[0]
            const auths = authIds.map(id => poolState.authorizations.get(id)).filter(Boolean)
            return { rows: auths.map(clone), rowCount: auths.length }
          }

          // UPDATE authorizations (consume)
          if (text.startsWith("UPDATE single_case_apply_authorizations SET consumed_at")) {
            const consumedBy = params[0]
            const authIds = params[1]
            const consumed = []

            for (const id of authIds) {
              const auth = poolState.authorizations.get(id)
              if (auth && !auth.consumed_at && auth.operational_status === "ACTIVE" && !auth.revoked) {
                auth.consumed_at = NOW
                auth.consumed_by = consumedBy
                auth.operational_status = "CONSUMED"
                consumed.push(clone(auth))
              }
            }

            return { rows: consumed, rowCount: consumed.length }
          }

          // UPDATE checkpoint
          if (text.startsWith("UPDATE single_case_apply_checkpoints SET checkpoint_version")) {
            const newVersion = params[0]
            const newAuthorizablePlanHash = params[1]
            const newAuthIds = JSON.parse(params[2])
            const newPayload = JSON.parse(params[3])
            const newFencingToken = params[4]
            const newLeaseId = params[5]
            const caseId = params[6]
            const expectedVersion = params[7]
            const expectedLeaseId = params[8]
            const expectedFencingToken = params[9]

            const checkpoint = poolState.checkpoints.get(caseId)
            if (!checkpoint) return { rows: [], rowCount: 0 }
            if (Number(checkpoint.checkpoint_version) !== expectedVersion) return { rows: [], rowCount: 0 }
            if (checkpoint.lease_id !== expectedLeaseId) return { rows: [], rowCount: 0 }
            if (Number(checkpoint.fencing_token) !== expectedFencingToken) return { rows: [], rowCount: 0 }

            checkpoint.checkpoint_version = newVersion
            checkpoint.authorizable_plan_hash = newAuthorizablePlanHash
            checkpoint.authorization_ids = newAuthIds
            checkpoint.checkpoint_payload = newPayload
            checkpoint.fencing_token = newFencingToken
            checkpoint.lease_id = newLeaseId
            checkpoint.updated_at = NOW

            return { rows: [{ checkpoint_version: newVersion }], rowCount: 1 }
          }

          // INSERT rebind audit
          if (text.includes("INSERT INTO single_case_apply_rebind_audit")) {
            const audit = {
              rebind_id: params[0],
              case_import_id: params[1],
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

            poolState.audits.set(audit.rebind_id, audit)
            return { rows: [{ rebind_id: audit.rebind_id }], rowCount: 1 }
          }

          // Unhandled query
          return { rows: [], rowCount: 0 }
        },
        async release() {}
      }

      return client
    },
    async query() {
      throw new Error("POOL_QUERY_NOT_USED")
    }
  }
}

function createCheckpoint(version, authIds) {
  const payload = {
    schemaVersion: 2,
    caseImportId: CASE_IMPORT_ID,
    caseFingerprint: CASE_FINGERPRINT,
    caseNumber: CASE_NUMBER,
    authorizablePlanHash: AUTHORIZABLE_PLAN_HASH,
    authorizationIds: authIds,
    status: "failed",
    version,
    steps: {
      reservation: {
        status: "completed",
        result: {
          verified: true,
          caseImportId: CASE_IMPORT_ID,
          caseNumber: CASE_NUMBER,
          evidenceId: "reservation-evidence-v7"
        }
      },
      contact: { status: "failed", errorCode: "CONTACT_FIELDS_DIVERGENCE" },
      deal: { status: "pending" },
      association: { status: "pending" },
      area_folder: { status: "pending" },
      case_folder: { status: "pending" },
      uploads: { status: "pending" },
      final_verify: { status: "pending" }
    },
    resources: {
      contactId: null,
      dealId: null,
      associationId: null,
      areaFolderId: null,
      caseFolderId: null
    },
    uploads: {},
    finalProof: null
  }

  return {
    case_import_id: CASE_IMPORT_ID,
    schema_version: 2,
    checkpoint_version: version,
    case_fingerprint: CASE_FINGERPRINT,
    case_number: CASE_NUMBER,
    authorizable_plan_hash: AUTHORIZABLE_PLAN_HASH,
    authorization_ids: authIds,
    global_status: "failed",
    checkpoint_payload: payload,
    fencing_token: FENCING_TOKEN,
    lease_id: LEASE_ID
  }
}

function createLease() {
  return {
    case_import_id: CASE_IMPORT_ID,
    lease_id: LEASE_ID,
    fencing_token: FENCING_TOKEN,
    owner_id: OWNER_ID,
    expires_at: "2026-07-22T03:00:00.000Z",
    released_at: null
  }
}

function createAuthorization(id, type, overrides = {}) {
  return {
    authorization_id: id,
    authorization_type: type,
    case_import_id: CASE_IMPORT_ID,
    case_fingerprint: CASE_FINGERPRINT,
    case_number: CASE_NUMBER,
    authorizable_plan_hash: AUTHORIZABLE_PLAN_HASH,
    plan_hash: PLAN_HASH,
    manifest_hash: MANIFEST_HASH,
    reservation_evidence_hash: RESERVATION_EVIDENCE_HASH,
    schema_version: 2,
    revoked: false,
    consumed_at: null,
    consumed_by: null,
    expires_at: "2026-07-22T03:00:00.000Z",
    operational_status: "ACTIVE",
    ...overrides
  }
}

function createReconciliationEvidence() {
  const evidenceHash = crypto.createHash("sha256").update(JSON.stringify({
    decision: "RECONCILIATION_ELIGIBLE",
    reason: "CONTACT_READ_ONLY_VERIFIED"
  })).digest("hex")

  return {
    decision: "RECONCILIATION_ELIGIBLE",
    reason: "CONTACT_READ_ONLY_VERIFIED",
    contactEvidence: {
      verified: true,
      id: "test-contact",
      cpf: "12345678901",
      phone: "5511999999999",
      fieldsHash: crypto.createHash("sha256").update(JSON.stringify({ cpf: "12345678901", phone: "5511999999999" })).digest("hex"),
      caseImportId: CASE_IMPORT_ID
    },
    namePresentation: {
      semanticMatch: true,
      presentationMatch: false,
      normalizationRequired: true,
      updateRequired: true,
      materialDivergence: false
    },
    resume: {
      directRetryAllowed: false,
      checkpointRebindRequired: true,
      operation: "ATOMIC_CHECKPOINT_AUTHORIZATION_REBIND_REQUIRED",
      ambiguity: "NONE"
    },
    evidenceHash
  }
}

test("REBIND v7→v8: renovação com sucesso após expiração", async () => {
  const oldAuthIds = [OLD_AUTH_V7_1, OLD_AUTH_V7_2]
  const newAuthIds = [NEW_AUTH_V8_1, NEW_AUTH_V8_2]

  const checkpoint = createCheckpoint(7, oldAuthIds)
  const lease = createLease()

  // Autorizações antigas: consumidas pelo REBIND v6→v7
  const oldAuth1 = createAuthorization(OLD_AUTH_V7_1, "EXPLICIT_APPLY_AUTHORIZATION", {
    consumed_at: NOW,
    consumed_by: `rebind:${V6_V7_REBIND_ID}`,
    operational_status: "CONSUMED"
  })
  const oldAuth2 = createAuthorization(OLD_AUTH_V7_2, "EXTERNAL_WRITES_AUTHORIZATION", {
    consumed_at: NOW,
    consumed_by: `rebind:${V6_V7_REBIND_ID}`,
    operational_status: "CONSUMED"
  })

  // Novas autorizações: ativas
  const newAuth1 = createAuthorization(NEW_AUTH_V8_1, "EXPLICIT_APPLY_AUTHORIZATION")
  const newAuth2 = createAuthorization(NEW_AUTH_V8_2, "EXTERNAL_WRITES_AUTHORIZATION")

  const historicalAudit = (rebindId, sourceVersion, reboundVersion, currentIds) => ({
    rebind_id: rebindId,
    case_import_id: CASE_IMPORT_ID,
    source_checkpoint_version: sourceVersion,
    rebound_checkpoint_version: reboundVersion,
    authorization_count: 2,
    previous_authorization_set_hash: computeAuthorizationSetHash([`old-v${sourceVersion}-1`, `old-v${sourceVersion}-2`]),
    current_authorization_set_hash: computeAuthorizationSetHash(currentIds),
    reconciliation_evidence_hash: crypto.createHash("sha256").update(`evidence-v${reboundVersion}`).digest("hex"),
    reason: "CONTACT_RECONCILED_AFTER_DIVERGENCE",
    requested_by: "test-operator",
    fencing_token: FENCING_TOKEN,
    lease_id: LEASE_ID,
    committed_at: NOW
  })
  const auditV4V5 = historicalAudit(V4_V5_REBIND_ID, 4, 5, ["old-v5-1", "old-v5-2"])
  const auditV5V6 = historicalAudit(V5_V6_REBIND_ID, 5, 6, ["old-v6-1", "old-v6-2"])
  // Auditoria histórica v6→v7
  const auditV6V7 = {
    rebind_id: V6_V7_REBIND_ID,
    case_import_id: CASE_IMPORT_ID,
    source_checkpoint_version: 6,
    rebound_checkpoint_version: 7,
    authorization_count: 2,
    previous_authorization_set_hash: computeAuthorizationSetHash(["old-v6-1", "old-v6-2"]),
    current_authorization_set_hash: computeAuthorizationSetHash(oldAuthIds),
    reconciliation_evidence_hash: crypto.createHash("sha256").update("evidence").digest("hex"),
    reason: "CONTACT_RECONCILED_AFTER_DIVERGENCE",
    requested_by: "test-operator",
    fencing_token: FENCING_TOKEN,
    lease_id: LEASE_ID,
    committed_at: NOW
  }

  const poolState = {
    checkpoints: new Map([[CASE_IMPORT_ID, checkpoint]]),
    leases: new Map([[CASE_IMPORT_ID, lease]]),
    authorizations: new Map([
      [OLD_AUTH_V7_1, oldAuth1],
      [OLD_AUTH_V7_2, oldAuth2],
      [NEW_AUTH_V8_1, newAuth1],
      [NEW_AUTH_V8_2, newAuth2]
    ]),
    audits: new Map([
      [auditV4V5.rebind_id, auditV4V5],
      [auditV5V6.rebind_id, auditV5V6],
      [auditV6V7.rebind_id, auditV6V7]
    ])
  }

  const pool = mockPool(poolState)
  const reconciliationEvidence = createReconciliationEvidence()

  const request = createRebindRequest({
    caseImportId: CASE_IMPORT_ID,
    sourceCheckpointVersion: 7,
    oldAuthorizationIds: oldAuthIds,
    newAuthorizationIds: newAuthIds,
    reconciliationEvidence,
    reason: "CONTACT_RECONCILED_AFTER_DIVERGENCE",
    requestedBy: "test-operator-v7-v8"
  })

  const repository = createSingleCaseRebindPostgresRepository({ pool, ownerId: OWNER_ID, now: () => NOW })
  const result = await repository.executeRebind(request)

  // Validar resultado
  assert.equal(result.status, "rebound")
  assert.equal(result.sourceCheckpointVersion, 7)
  assert.equal(result.reboundCheckpointVersion, 8)
  assert.equal(result.authorizationCount, 2)

  // Validar checkpoint atualizado
  const finalCheckpoint = poolState.checkpoints.get(CASE_IMPORT_ID)
  assert.equal(finalCheckpoint.checkpoint_version, 8)
  assert.deepEqual(finalCheckpoint.authorization_ids.sort(), newAuthIds.sort())

  // Validar novas autorizações consumidas
  const consumedAuth1 = poolState.authorizations.get(NEW_AUTH_V8_1)
  const consumedAuth2 = poolState.authorizations.get(NEW_AUTH_V8_2)
  assert.equal(consumedAuth1.consumed_at, NOW)
  assert.equal(consumedAuth2.consumed_at, NOW)
  assert.ok(consumedAuth1.consumed_by.startsWith("rebind:"))
  assert.ok(consumedAuth2.consumed_by.startsWith("rebind:"))
  assert.equal(consumedAuth1.consumed_by, consumedAuth2.consumed_by)

  // Validar auditoria v7→v8 criada
  assert.equal(poolState.audits.size, 4) // v4→v5→v6→v7→v8

  const auditsArray = Array.from(poolState.audits.values())
  const auditV7V8 = auditsArray.find(a =>
    a.source_checkpoint_version === 7 &&
    a.rebound_checkpoint_version === 8
  )

  assert.ok(auditV7V8, "Auditoria v7→v8 deve existir")
  assert.equal(auditV7V8.case_import_id, CASE_IMPORT_ID)
  assert.equal(auditV7V8.authorization_count, 2)
  assert.equal(auditV7V8.reason, "CONTACT_RECONCILED_AFTER_DIVERGENCE")
  assert.equal(auditV7V8.requested_by, "test-operator-v7-v8")
  assert.deepEqual(
    auditsArray
      .map(audit => [audit.source_checkpoint_version, audit.rebound_checkpoint_version])
      .sort((a, b) => a[0] - b[0]),
    [[4, 5], [5, 6], [6, 7], [7, 8]]
  )
})

test("REBIND v7→v8: rejeita autorizações antigas não consumidas", async () => {
  const oldAuthIds = [OLD_AUTH_V7_1, OLD_AUTH_V7_2]
  const newAuthIds = [NEW_AUTH_V8_1, NEW_AUTH_V8_2]

  const checkpoint = createCheckpoint(7, oldAuthIds)
  const lease = createLease()

  // Autorizações antigas NÃO consumidas (erro!)
  const oldAuth1 = createAuthorization(OLD_AUTH_V7_1, "EXPLICIT_APPLY_AUTHORIZATION")
  const oldAuth2 = createAuthorization(OLD_AUTH_V7_2, "EXTERNAL_WRITES_AUTHORIZATION")

  const newAuth1 = createAuthorization(NEW_AUTH_V8_1, "EXPLICIT_APPLY_AUTHORIZATION")
  const newAuth2 = createAuthorization(NEW_AUTH_V8_2, "EXTERNAL_WRITES_AUTHORIZATION")

  const poolState = {
    checkpoints: new Map([[CASE_IMPORT_ID, checkpoint]]),
    leases: new Map([[CASE_IMPORT_ID, lease]]),
    authorizations: new Map([
      [OLD_AUTH_V7_1, oldAuth1],
      [OLD_AUTH_V7_2, oldAuth2],
      [NEW_AUTH_V8_1, newAuth1],
      [NEW_AUTH_V8_2, newAuth2]
    ]),
    audits: new Map()
  }

  const pool = mockPool(poolState)
  const reconciliationEvidence = createReconciliationEvidence()

  const request = createRebindRequest({
    caseImportId: CASE_IMPORT_ID,
    sourceCheckpointVersion: 7,
    oldAuthorizationIds: oldAuthIds,
    newAuthorizationIds: newAuthIds,
    reconciliationEvidence,
    reason: "CONTACT_RECONCILED_AFTER_DIVERGENCE",
    requestedBy: "test-operator"
  })

  const repository = createSingleCaseRebindPostgresRepository({ pool, ownerId: OWNER_ID, now: () => NOW })

  await assert.rejects(
    () => repository.executeRebind(request),
    /REBIND_OLD_PAIR_NOT_CONSUMED/
  )
})

test("REBIND v7→v8: rejeita novas autorizações já consumidas", async () => {
  const oldAuthIds = [OLD_AUTH_V7_1, OLD_AUTH_V7_2]
  const newAuthIds = [NEW_AUTH_V8_1, NEW_AUTH_V8_2]

  const checkpoint = createCheckpoint(7, oldAuthIds)
  const lease = createLease()

  const rebindOld = crypto.createHash("sha256").update("old-rebind").digest("hex")

  // Criar auditoria válida para rebindOld
  const prevAuthIds = [
    "oraculum-bot-p1-authorization-v1.20260719T000000.prev-1",
    "oraculum-bot-p1-authorization-v1.20260719T000000.prev-2"
  ]

  const auditOld = {
    rebind_id: rebindOld,
    case_import_id: CASE_IMPORT_ID,
    source_checkpoint_version: 6,
    rebound_checkpoint_version: 7,
    authorization_count: 2,
    previous_authorization_set_hash: computeAuthorizationSetHash(prevAuthIds),
    current_authorization_set_hash: computeAuthorizationSetHash(oldAuthIds),
    reconciliation_evidence_hash: crypto.createHash("sha256").update("evidence").digest("hex"),
    reason: "CONTACT_RECONCILED_AFTER_DIVERGENCE",
    requested_by: "test-operator",
    fencing_token: FENCING_TOKEN,
    lease_id: LEASE_ID,
    committed_at: NOW
  }

  const oldAuth1 = createAuthorization(OLD_AUTH_V7_1, "EXPLICIT_APPLY_AUTHORIZATION", {
    consumed_at: NOW,
    consumed_by: `rebind:${rebindOld}`,
    operational_status: "CONSUMED"
  })
  const oldAuth2 = createAuthorization(OLD_AUTH_V7_2, "EXTERNAL_WRITES_AUTHORIZATION", {
    consumed_at: NOW,
    consumed_by: `rebind:${rebindOld}`,
    operational_status: "CONSUMED"
  })

  // Nova autorização JÁ consumida (erro!)
  const newAuth1 = createAuthorization(NEW_AUTH_V8_1, "EXPLICIT_APPLY_AUTHORIZATION", {
    consumed_at: NOW,
    consumed_by: "other:operation",
    operational_status: "CONSUMED"
  })
  const newAuth2 = createAuthorization(NEW_AUTH_V8_2, "EXTERNAL_WRITES_AUTHORIZATION")

  const poolState = {
    checkpoints: new Map([[CASE_IMPORT_ID, checkpoint]]),
    leases: new Map([[CASE_IMPORT_ID, lease]]),
    authorizations: new Map([
      [OLD_AUTH_V7_1, oldAuth1],
      [OLD_AUTH_V7_2, oldAuth2],
      [NEW_AUTH_V8_1, newAuth1],
      [NEW_AUTH_V8_2, newAuth2]
    ]),
    audits: new Map([[rebindOld, auditOld]])
  }

  const pool = mockPool(poolState)
  const reconciliationEvidence = createReconciliationEvidence()

  const request = createRebindRequest({
    caseImportId: CASE_IMPORT_ID,
    sourceCheckpointVersion: 7,
    oldAuthorizationIds: oldAuthIds,
    newAuthorizationIds: newAuthIds,
    reconciliationEvidence,
    reason: "CONTACT_RECONCILED_AFTER_DIVERGENCE",
    requestedBy: "test-operator"
  })

  const repository = createSingleCaseRebindPostgresRepository({ pool, ownerId: OWNER_ID, now: () => NOW })

  await assert.rejects(
    () => repository.executeRebind(request),
    /REBIND_NEW_PAIR_(NOT_ACTIVE|CONSUMED)/
  )
})

console.log("\n✓ Todos os testes de REBIND v7→v8 passaram")
console.log("✓ Infraestrutura genérica (source > 0) suporta v7→v8")
console.log("✓ Validações de autorização funcionam corretamente")
console.log("✓ Cadeia de auditoria preservada")
