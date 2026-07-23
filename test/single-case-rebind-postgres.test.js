"use strict"

const test = require("node:test")
const assert = require("node:assert/strict")
const {
  MIGRATION_ID,
  TABLE_NAME,
  CHECK_SQL,
  CHECK_COLUMNS,
  CREATE_TABLE_SQL,
  EXPECTED_INDEXES,
  EXPECTED_COLUMNS,
  parseConsumedBy,
  createSingleCaseRebindPostgresRepository,
  validateSingleCaseRebindAuditSchema,
  migrateSingleCaseRebindAudit
} = require("../src/infrastructure/single-case-rebind-postgres")
const { createRebindRequest, ALLOWED_REBIND_REASONS } = require("../src/domain/single-case-rebind-contracts")

const NOW = "2026-07-17T12:00:00.000Z"
const CASE_IMPORT_ID = "fixture-case-inss-001"
const CASE_FINGERPRINT = "e3dfb0f332b1"
const CASE_NUMBER = "INSS.260717.001"
const AUTHORIZABLE_PLAN_HASH = "a".repeat(64)
const PLAN_HASH = "1".repeat(64)
const MANIFEST_HASH = "2".repeat(64)
const RESERVATION_EVIDENCE_HASH = "3".repeat(64)

const OLD_AUTH_1 = "old-auth-explicit-001"
const OLD_AUTH_2 = "old-auth-external-001"
const NEW_AUTH_1 = "new-auth-explicit-001"
const NEW_AUTH_2 = "new-auth-external-001"

const LEASE_ID = "lease-fixture-001"
const FENCING_TOKEN = 100
const OWNER_ID = "fixture-worker-001"
const HISTORICAL_CONSUMED_BY_FIXTURE = require("./fixtures/historical-consumed-by.json")

function fixture() {
  const reconciliationEvidence = {
    decision: "RECONCILIATION_ELIGIBLE",
    reason: "CONTACT_READ_ONLY_VERIFIED",
    contactEvidence: { caseImportId: CASE_IMPORT_ID },
    namePresentation: { semanticMatch: true, materialDivergence: false },
    resume: { checkpointRebindRequired: true, ambiguity: "NONE" },
    evidenceHash: "e".repeat(64)
  }

  return createRebindRequest({
    caseImportId: CASE_IMPORT_ID,
    sourceCheckpointVersion: 5,
    oldAuthorizationIds: [OLD_AUTH_1, OLD_AUTH_2],
    newAuthorizationIds: [NEW_AUTH_1, NEW_AUTH_2],
    reconciliationEvidence,
    reason: ALLOWED_REBIND_REASONS[0],
    requestedBy: "rebind-coordinator"
  })
}

function mockPool(state = {}) {
  const defaults = {
    queries: [],
    leases: new Map(),
    checkpoints: new Map(),
    authorizations: new Map(),
    audits: new Map(),
    committed: false,
    rolledBack: false
  }

  const poolState = { ...defaults, ...state }

  return {
    state: poolState,
    async connect() {
      const client = {
        async query(sql, params) {
          const text = String(sql).replace(/\s+/g, " ").trim()
          poolState.queries.push({ text, params: params ? [...params] : [] })

          // BEGIN
          if (text === "BEGIN") return { rows: [], rowCount: 0 }

          // COMMIT
          if (text === "COMMIT") {
            poolState.committed = true
            return { rows: [], rowCount: 0 }
          }

          // ROLLBACK
          if (text === "ROLLBACK") {
            poolState.rolledBack = true
            return { rows: [], rowCount: 0 }
          }

          // Advisory lock
          if (text.includes("pg_advisory_xact_lock")) {
            return { rows: [], rowCount: 0 }
          }

          // CURRENT_TIMESTAMP
          if (text === "SELECT CURRENT_TIMESTAMP AS now") {
            return { rows: [{ now: NOW }], rowCount: 1 }
          }

          // SELECT lease (revalidaÃ§Ã£o com is_current)
          if (text.includes("FROM single_case_apply_leases") &&
              text.includes("expires_at > CURRENT_TIMESTAMP AS is_current") &&
              !text.includes("FOR UPDATE")) {
            const lease = poolState.leases.get(params[0])
            if (!lease) return { rows: [], rowCount: 0 }

            // Calcular is_current baseado no PostgreSQL (expires_at > CURRENT_TIMESTAMP)
            const is_current = Date.parse(lease.expires_at) > Date.parse(NOW)

            return {
              rows: [{
                owner_id: lease.owner_id,
                fencing_token: lease.fencing_token,
                released_at: lease.released_at,
                expires_at: lease.expires_at,
                is_current
              }],
              rowCount: 1
            }
          }

          // SELECT lease
          if (text.includes("FROM single_case_apply_leases") && text.includes("FOR UPDATE")) {
            const lease = poolState.leases.get(params[0])
            if (!lease) return { rows: [], rowCount: 0 }
            return { rows: [lease], rowCount: 1 }
          }

          // SELECT checkpoint
          if (text.includes("FROM single_case_apply_checkpoints") && text.includes("FOR UPDATE")) {
            const checkpoint = poolState.checkpoints.get(params[0])
            if (!checkpoint) return { rows: [], rowCount: 0 }
            return { rows: [checkpoint], rowCount: 1 }
          }

          // SELECT audit
          if (text.includes(`FROM ${TABLE_NAME}`) && text.includes("WHERE rebind_id")) {
            const audit = poolState.audits.get(params[0])
            if (!audit) return { rows: [], rowCount: 0 }
            return { rows: [audit], rowCount: 1 }
          }

          // SELECT authorizations
          if (text.includes("FROM single_case_apply_authorizations") && text.includes("FOR UPDATE")) {
            const authIds = params[0]
            const rows = authIds.map(id => poolState.authorizations.get(id)).filter(Boolean)
            return { rows, rowCount: rows.length }
          }

          // UPDATE authorizations (consume) - now uses CURRENT_TIMESTAMP with EXISTS
          if (text.includes("UPDATE single_case_apply_authorizations") && text.includes("consumed_at")) {
            const consumedBy = params[0]
            const authIds = params[1]
            const caseImportId = params[2]
            const leaseId = params[3]
            const ownerId = params[4]
            const fencingToken = params[5]

            // Validate EXISTS condition (lease vigente)
            const lease = poolState.leases.get(caseImportId)
            if (!lease) return { rows: [], rowCount: 0 }
            if (lease.owner_id !== ownerId) return { rows: [], rowCount: 0 }
            if (lease.released_at) return { rows: [], rowCount: 0 }
            if (Date.parse(lease.expires_at) <= Date.parse(NOW)) return { rows: [], rowCount: 0 }
            if (lease.lease_id !== leaseId) return { rows: [], rowCount: 0 }
            if (Number(lease.fencing_token) !== fencingToken) return { rows: [], rowCount: 0 }

            let updated = 0
            const resultRows = []
            for (const id of authIds) {
              const auth = poolState.authorizations.get(id)
              if (auth &&
                  auth.operational_status === 'ACTIVE' &&
                  !auth.consumed_at &&
                  !auth.revoked &&
                  Date.parse(auth.expires_at) > Date.parse(NOW)) {
                auth.consumed_at = NOW
                auth.consumed_by = consumedBy
                resultRows.push({
                  authorization_id: id,
                  consumed_at: NOW,
                  consumed_by: consumedBy
                })
                updated++
              }
            }

            return { rows: resultRows, rowCount: updated }
          }

          // UPDATE checkpoint - now uses EXISTS for lease validation
          if (text.includes("UPDATE single_case_apply_checkpoints")) {
            const caseImportId = params[6]
            const expectedVersion = params[7]
            const expectedLeaseId = params[8]
            const expectedFencingToken = params[9]
            const ownerId = params[10]

            const checkpoint = poolState.checkpoints.get(caseImportId)
            if (!checkpoint) return { rows: [], rowCount: 0 }

            const lease = poolState.leases.get(caseImportId)
            if (!lease) return { rows: [], rowCount: 0 }

            // Validate CAS conditions
            if (Number(checkpoint.checkpoint_version) !== expectedVersion) return { rows: [], rowCount: 0 }
            if (checkpoint.lease_id !== expectedLeaseId) return { rows: [], rowCount: 0 }
            if (Number(checkpoint.fencing_token) !== expectedFencingToken) return { rows: [], rowCount: 0 }

            // Validate EXISTS condition (lease vigente)
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

          // INSERT audit - now uses INSERT ... SELECT with EXISTS (13 params)
          if ((text.includes("INSERT INTO") && text.includes(TABLE_NAME))) {
            const rebind_id = params[0]
            const caseImportId = params[1]
            const lease_id = params[11]
            const fencing_token = params[10]
            const ownerId = params[12]

            const lease = poolState.leases.get(caseImportId)
            if (!lease) return { rows: [], rowCount: 0 }

            // Validate EXISTS condition (lease vigente)
            if (lease.owner_id !== ownerId) return { rows: [], rowCount: 0 }
            if (lease.released_at) return { rows: [], rowCount: 0 }
            if (Date.parse(lease.expires_at) <= Date.parse(NOW)) return { rows: [], rowCount: 0 }
            if (lease.lease_id !== lease_id) return { rows: [], rowCount: 0 }
            if (Number(lease.fencing_token) !== fencing_token) return { rows: [], rowCount: 0 }

            const audit = {
              rebind_id,
              case_import_id: caseImportId,
              source_checkpoint_version: params[2],
              rebound_checkpoint_version: params[3],
              authorization_count: params[4],
              previous_authorization_set_hash: params[5],
              current_authorization_set_hash: params[6],
              reconciliation_evidence_hash: params[7],
              reason: params[8],
              requested_by: params[9],
              fencing_token,
              lease_id,
              committed_at: NOW
            }
            poolState.audits.set(audit.rebind_id, audit)
            return { rows: [{ rebind_id }], rowCount: 1 }
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

function createLease(overrides = {}) {
  return {
    case_import_id: CASE_IMPORT_ID,
    lease_id: LEASE_ID,
    fencing_token: FENCING_TOKEN,
    owner_id: OWNER_ID,
    expires_at: "2026-07-17T13:00:00.000Z",
    released_at: null,
    ...overrides
  }
}

function createCheckpoint(overrides = {}) {
  const payload = {
    schemaVersion: 2,
    caseImportId: CASE_IMPORT_ID,
    caseFingerprint: CASE_FINGERPRINT,
    caseNumber: CASE_NUMBER,
    authorizablePlanHash: AUTHORIZABLE_PLAN_HASH,
    planHash: PLAN_HASH,
    manifestHash: MANIFEST_HASH,
    reservationEvidenceHash: RESERVATION_EVIDENCE_HASH,
    authorizationIds: [OLD_AUTH_1, OLD_AUTH_2],
    status: "failed",
    version: 5,
    steps: {
      reservation: { status: "completed", result: { verified: true, caseImportId: CASE_IMPORT_ID, caseNumber: CASE_NUMBER, evidenceId: "reservation-proof" } },
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
    checkpoint_version: 5,
    case_fingerprint: CASE_FINGERPRINT,
    case_number: CASE_NUMBER,
    authorizable_plan_hash: AUTHORIZABLE_PLAN_HASH,
    authorization_ids: [OLD_AUTH_1, OLD_AUTH_2],
    global_status: "failed",
    checkpoint_payload: payload,
    fencing_token: FENCING_TOKEN,
    lease_id: LEASE_ID,
    ...overrides
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
    expires_at: "2026-07-17T13:00:00.000Z",
    operational_status: "ACTIVE",
    ...overrides
  }
}

// Migration tests
test("migration SQL contÃ©m CREATE TABLE", () => {
  assert(CREATE_TABLE_SQL.includes("CREATE TABLE"))
  assert(CREATE_TABLE_SQL.includes(TABLE_NAME))
})

test("migration ID segue padrÃ£o", () => {
  assert.equal(MIGRATION_ID, "single-case-apply-rebind-audit-v1")
})

test("schema esperado tem 13 colunas", () => {
  assert.equal(EXPECTED_COLUMNS.length, 13)
})

test("migration idempotente com registry", async () => {
  const pool = {
    async connect() {
      return {
        async query(sql) {
          const text = String(sql).replace(/\s+/g, " ").trim()
          if (text === "BEGIN") return { rows: [], rowCount: 0 }
          if (text === "COMMIT") return { rows: [], rowCount: 0 }
          if (text === "ROLLBACK") return { rows: [], rowCount: 0 }
          if (text.includes("to_regclass('oraculum_state_migrations')")) {
            return { rows: [{ table_name: "oraculum_state_migrations" }], rowCount: 1 }
          }
          if (text.includes("oraculum_state_migrations")) {
            if (text.includes("SELECT migration_id")) {
              return { rows: [{ migration_id: MIGRATION_ID }], rowCount: 1 }
            }
            return { rows: [{ table_name: "oraculum_state_migrations" }], rowCount: 1 }
          }
          if (text.includes("information_schema.columns")) {
            return { rows: EXPECTED_COLUMNS.map((col, i) => ({
              column_name: col.name,
              data_type: col.type,
              udt_name: col.udt,
              is_nullable: col.nullable ? "YES" : "NO",
              column_default: col.defaultValue === "current_timestamp" ? "CURRENT_TIMESTAMP" : col.defaultValue,
              ordinal_position: i + 1
            })), rowCount: EXPECTED_COLUMNS.length }
          }
          if (text.includes("pg_constraint")) {
            const constraints = []

            // Primary key
            constraints.push({
              conname: `${TABLE_NAME}_pkey`,
              contype: 'p',
              definition: 'PRIMARY KEY (rebind_id)',
              columns: JSON.stringify(['rebind_id'])
            })

            // Check constraints
            for (const [name, expression] of Object.entries(CHECK_SQL)) {
              constraints.push({
                conname: name,
                contype: 'c',
                definition: `CHECK ((${expression}))`,
                columns: JSON.stringify(CHECK_COLUMNS[name])
              })
            }

            return { rows: constraints, rowCount: constraints.length }
          }
          if (text.includes("FROM pg_index")) {
            const rows = EXPECTED_INDEXES.map(index => ({
              index_name: index.name,
              schema_name: "public",
              table_name: TABLE_NAME,
              is_unique: index.unique,
              method: "btree",
              key_attribute_count: index.keys.length,
              total_attribute_count: index.keys.length,
              has_expressions: false,
              has_predicate: false,
              key_columns: [...index.keys],
              key_descending: [...index.descending]
            }))
            return { rows, rowCount: rows.length }
          }
          return { rows: [], rowCount: 0 }
        },
        async release() {}
      }
    }
  }

  const result = await migrateSingleCaseRebindAudit(pool)
  assert.equal(result.ok, true)
  assert.equal(result.applied, false)
})

// Happy path
test("happy path: primeiro rebind com sucesso", async () => {
  const request = fixture()
  const pool = mockPool({
    leases: new Map([[CASE_IMPORT_ID, createLease()]]),
    checkpoints: new Map([[CASE_IMPORT_ID, createCheckpoint()]]),
    authorizations: new Map([
      [OLD_AUTH_1, createAuthorization(OLD_AUTH_1, "EXPLICIT_APPLY_AUTHORIZATION", {
        consumed_at: NOW,
        consumed_by: `executor:${LEASE_ID}`
      })],
      [OLD_AUTH_2, createAuthorization(OLD_AUTH_2, "EXTERNAL_WRITES_AUTHORIZATION", {
        consumed_at: NOW,
        consumed_by: `executor:${LEASE_ID}`
      })],
      [NEW_AUTH_1, createAuthorization(NEW_AUTH_1, "EXPLICIT_APPLY_AUTHORIZATION")],
      [NEW_AUTH_2, createAuthorization(NEW_AUTH_2, "EXTERNAL_WRITES_AUTHORIZATION")]
    ])
  })

  const repository = createSingleCaseRebindPostgresRepository({ pool, ownerId: OWNER_ID, now: () => NOW })
  const result = await repository.executeRebind(request)

  assert.equal(result.status, "rebound")
  assert.equal(result.rebindId, request.rebindId)
  assert.equal(result.sourceCheckpointVersion, 5)
  assert.equal(result.reboundCheckpointVersion, 6)
  assert.equal(pool.state.committed, true)
  assert.equal(pool.state.rolledBack, false)
  assert.equal(pool.state.audits.size, 1)
})

// Par antigo tests
test("parser consumed_by aceita somente formatos canônico e legado comprovado", () => {
  assert.deepEqual(parseConsumedBy(`executor:${LEASE_ID}`), { kind: "executor", operationId: LEASE_ID, normalizedValue: `executor:${LEASE_ID}`, formatVersion: "executor-v1" })
  assert.deepEqual(parseConsumedBy(HISTORICAL_CONSUMED_BY_FIXTURE.consumedBy), {
    kind: HISTORICAL_CONSUMED_BY_FIXTURE.kind,
    operationId: HISTORICAL_CONSUMED_BY_FIXTURE.operationId,
    normalizedValue: HISTORICAL_CONSUMED_BY_FIXTURE.normalizedValue,
    formatVersion: HISTORICAL_CONSUMED_BY_FIXTURE.formatVersion
  })
  for (const invalid of [null, "", "executor:", "executor:bad id", "rebind", "rebind:abc", `rebind:${"g".repeat(64)}`, `other:${"a".repeat(64)}`]) assert.equal(parseConsumedBy(invalid), null)
})

test("fixture histórico é aceito quando audit prova caso, checkpoint, conjunto e lease", async () => {
  const request = fixture(), legacyId = HISTORICAL_CONSUMED_BY_FIXTURE.operationId
  const legacyAudit = { rebind_id: legacyId, case_import_id: CASE_IMPORT_ID, source_checkpoint_version: 4, rebound_checkpoint_version: 5, current_authorization_set_hash: request.oldAuthorizationSetHash, lease_id: LEASE_ID }
  const pool = mockPool({
    leases: new Map([[CASE_IMPORT_ID, createLease()]]), checkpoints: new Map([[CASE_IMPORT_ID, createCheckpoint()]]), audits: new Map([[legacyId, legacyAudit]]),
    authorizations: new Map([
      [OLD_AUTH_1, createAuthorization(OLD_AUTH_1, "EXPLICIT_APPLY_AUTHORIZATION", { consumed_at: NOW, consumed_by: HISTORICAL_CONSUMED_BY_FIXTURE.consumedBy })],
      [OLD_AUTH_2, createAuthorization(OLD_AUTH_2, "EXTERNAL_WRITES_AUTHORIZATION", { consumed_at: NOW, consumed_by: HISTORICAL_CONSUMED_BY_FIXTURE.consumedBy })],
      [NEW_AUTH_1, createAuthorization(NEW_AUTH_1, "EXPLICIT_APPLY_AUTHORIZATION")], [NEW_AUTH_2, createAuthorization(NEW_AUTH_2, "EXTERNAL_WRITES_AUTHORIZATION")]
    ])
  })
  const result = await createSingleCaseRebindPostgresRepository({ pool, ownerId: OWNER_ID, now: () => NOW }).executeRebind(request)
  assert.equal(result.status, "rebound")
  assert.equal(pool.state.committed, true)
})

test("legado sem prova completa é rejeitado sem consumo, checkpoint ou audit novo", async () => {
  const request = fixture()
  const pool = mockPool({
    leases: new Map([[CASE_IMPORT_ID, createLease()]]), checkpoints: new Map([[CASE_IMPORT_ID, createCheckpoint()]]),
    authorizations: new Map([
      [OLD_AUTH_1, createAuthorization(OLD_AUTH_1, "EXPLICIT_APPLY_AUTHORIZATION", { consumed_at: NOW, consumed_by: HISTORICAL_CONSUMED_BY_FIXTURE.consumedBy })],
      [OLD_AUTH_2, createAuthorization(OLD_AUTH_2, "EXTERNAL_WRITES_AUTHORIZATION", { consumed_at: NOW, consumed_by: HISTORICAL_CONSUMED_BY_FIXTURE.consumedBy })],
      [NEW_AUTH_1, createAuthorization(NEW_AUTH_1, "EXPLICIT_APPLY_AUTHORIZATION")], [NEW_AUTH_2, createAuthorization(NEW_AUTH_2, "EXTERNAL_WRITES_AUTHORIZATION")]
    ])
  })
  await assert.rejects(() => createSingleCaseRebindPostgresRepository({ pool, ownerId: OWNER_ID, now: () => NOW }).executeRebind(request), /REBIND_OLD_LEGACY_CONSUMPTION_PROOF_INVALID/)
  assert.equal(pool.state.authorizations.get(NEW_AUTH_1).consumed_at, null)
  assert.equal(pool.state.checkpoints.get(CASE_IMPORT_ID).checkpoint_version, 5)
  assert.equal(pool.state.audits.size, 0)
  assert.equal(pool.state.rolledBack, true)
})

test("par antigo nÃ£o consumido falha", async () => {
  const request = fixture()
  const pool = mockPool({
    leases: new Map([[CASE_IMPORT_ID, createLease()]]),
    checkpoints: new Map([[CASE_IMPORT_ID, createCheckpoint()]]),
    authorizations: new Map([
      [OLD_AUTH_1, createAuthorization(OLD_AUTH_1, "EXPLICIT_APPLY_AUTHORIZATION")],
      [OLD_AUTH_2, createAuthorization(OLD_AUTH_2, "EXTERNAL_WRITES_AUTHORIZATION")],
      [NEW_AUTH_1, createAuthorization(NEW_AUTH_1, "EXPLICIT_APPLY_AUTHORIZATION")],
      [NEW_AUTH_2, createAuthorization(NEW_AUTH_2, "EXTERNAL_WRITES_AUTHORIZATION")]
    ])
  })

  const repository = createSingleCaseRebindPostgresRepository({ pool, ownerId: OWNER_ID, now: () => NOW })
  await assert.rejects(
    () => repository.executeRebind(request),
    /REBIND_OLD_PAIR_NOT_CONSUMED/
  )
  assert.equal(pool.state.committed, false)
  assert.equal(pool.state.rolledBack, true)
})

test("consumo parcial do par antigo falha", async () => {
  const request = fixture()
  const pool = mockPool({
    leases: new Map([[CASE_IMPORT_ID, createLease()]]),
    checkpoints: new Map([[CASE_IMPORT_ID, createCheckpoint()]]),
    authorizations: new Map([
      [OLD_AUTH_1, createAuthorization(OLD_AUTH_1, "EXPLICIT_APPLY_AUTHORIZATION", {
        consumed_at: NOW,
        consumed_by: `executor:${LEASE_ID}`
      })],
      [OLD_AUTH_2, createAuthorization(OLD_AUTH_2, "EXTERNAL_WRITES_AUTHORIZATION")],
      [NEW_AUTH_1, createAuthorization(NEW_AUTH_1, "EXPLICIT_APPLY_AUTHORIZATION")],
      [NEW_AUTH_2, createAuthorization(NEW_AUTH_2, "EXTERNAL_WRITES_AUTHORIZATION")]
    ])
  })

  const repository = createSingleCaseRebindPostgresRepository({ pool, ownerId: OWNER_ID, now: () => NOW })
  await assert.rejects(
    () => repository.executeRebind(request),
    /REBIND_OLD_PAIR_CONSUMED_PARTIAL/
  )
})

test("consumed_by divergente entre par antigo falha", async () => {
  const request = fixture()
  const pool = mockPool({
    leases: new Map([[CASE_IMPORT_ID, createLease()]]),
    checkpoints: new Map([[CASE_IMPORT_ID, createCheckpoint()]]),
    authorizations: new Map([
      [OLD_AUTH_1, createAuthorization(OLD_AUTH_1, "EXPLICIT_APPLY_AUTHORIZATION", {
        consumed_at: NOW,
        consumed_by: `executor:${LEASE_ID}`
      })],
      [OLD_AUTH_2, createAuthorization(OLD_AUTH_2, "EXTERNAL_WRITES_AUTHORIZATION", {
        consumed_at: NOW,
        consumed_by: "executor:other-lease"
      })],
      [NEW_AUTH_1, createAuthorization(NEW_AUTH_1, "EXPLICIT_APPLY_AUTHORIZATION")],
      [NEW_AUTH_2, createAuthorization(NEW_AUTH_2, "EXTERNAL_WRITES_AUTHORIZATION")]
    ])
  })

  const repository = createSingleCaseRebindPostgresRepository({ pool, ownerId: OWNER_ID, now: () => NOW })
  await assert.rejects(
    () => repository.executeRebind(request),
    /REBIND_OLD_CONSUMED_BY_DIVERGENT/
  )
})

test("consumed_by com lease divergente falha", async () => {
  const request = fixture()
  const pool = mockPool({
    leases: new Map([[CASE_IMPORT_ID, createLease()]]),
    checkpoints: new Map([[CASE_IMPORT_ID, createCheckpoint()]]),
    authorizations: new Map([
      [OLD_AUTH_1, createAuthorization(OLD_AUTH_1, "EXPLICIT_APPLY_AUTHORIZATION", {
        consumed_at: NOW,
        consumed_by: "executor:wrong-lease-id"
      })],
      [OLD_AUTH_2, createAuthorization(OLD_AUTH_2, "EXTERNAL_WRITES_AUTHORIZATION", {
        consumed_at: NOW,
        consumed_by: "executor:wrong-lease-id"
      })],
      [NEW_AUTH_1, createAuthorization(NEW_AUTH_1, "EXPLICIT_APPLY_AUTHORIZATION")],
      [NEW_AUTH_2, createAuthorization(NEW_AUTH_2, "EXTERNAL_WRITES_AUTHORIZATION")]
    ])
  })

  const repository = createSingleCaseRebindPostgresRepository({ pool, ownerId: OWNER_ID, now: () => NOW })
  await assert.rejects(
    () => repository.executeRebind(request),
    /REBIND_OLD_CONSUMED_BY_LEASE_MISMATCH/
  )
})

test("consumed_by sem prefixo executor: falha", async () => {
  const request = fixture()
  const pool = mockPool({
    leases: new Map([[CASE_IMPORT_ID, createLease()]]),
    checkpoints: new Map([[CASE_IMPORT_ID, createCheckpoint()]]),
    authorizations: new Map([
      [OLD_AUTH_1, createAuthorization(OLD_AUTH_1, "EXPLICIT_APPLY_AUTHORIZATION", {
        consumed_at: NOW,
        consumed_by: "invalid-format"
      })],
      [OLD_AUTH_2, createAuthorization(OLD_AUTH_2, "EXTERNAL_WRITES_AUTHORIZATION", {
        consumed_at: NOW,
        consumed_by: "invalid-format"
      })],
      [NEW_AUTH_1, createAuthorization(NEW_AUTH_1, "EXPLICIT_APPLY_AUTHORIZATION")],
      [NEW_AUTH_2, createAuthorization(NEW_AUTH_2, "EXTERNAL_WRITES_AUTHORIZATION")]
    ])
  })

  const repository = createSingleCaseRebindPostgresRepository({ pool, ownerId: OWNER_ID, now: () => NOW })
  await assert.rejects(
    () => repository.executeRebind(request),
    /REBIND_OLD_CONSUMED_BY_INVALID_FORMAT/
  )
})

// Novo par tests
test("novo par jÃ¡ consumido falha", async () => {
  const request = fixture()
  const pool = mockPool({
    leases: new Map([[CASE_IMPORT_ID, createLease()]]),
    checkpoints: new Map([[CASE_IMPORT_ID, createCheckpoint()]]),
    authorizations: new Map([
      [OLD_AUTH_1, createAuthorization(OLD_AUTH_1, "EXPLICIT_APPLY_AUTHORIZATION", {
        consumed_at: NOW,
        consumed_by: `executor:${LEASE_ID}`
      })],
      [OLD_AUTH_2, createAuthorization(OLD_AUTH_2, "EXTERNAL_WRITES_AUTHORIZATION", {
        consumed_at: NOW,
        consumed_by: `executor:${LEASE_ID}`
      })],
      [NEW_AUTH_1, createAuthorization(NEW_AUTH_1, "EXPLICIT_APPLY_AUTHORIZATION", {
        consumed_at: NOW,
        consumed_by: "executor:other"
      })],
      [NEW_AUTH_2, createAuthorization(NEW_AUTH_2, "EXTERNAL_WRITES_AUTHORIZATION")]
    ])
  })

  const repository = createSingleCaseRebindPostgresRepository({ pool, ownerId: OWNER_ID, now: () => NOW })
  await assert.rejects(
    () => repository.executeRebind(request),
    /REBIND_NEW_PAIR_CONSUMED/
  )
})

test("novo par revogado falha", async () => {
  const request = fixture()
  const pool = mockPool({
    leases: new Map([[CASE_IMPORT_ID, createLease()]]),
    checkpoints: new Map([[CASE_IMPORT_ID, createCheckpoint()]]),
    authorizations: new Map([
      [OLD_AUTH_1, createAuthorization(OLD_AUTH_1, "EXPLICIT_APPLY_AUTHORIZATION", {
        consumed_at: NOW,
        consumed_by: `executor:${LEASE_ID}`
      })],
      [OLD_AUTH_2, createAuthorization(OLD_AUTH_2, "EXTERNAL_WRITES_AUTHORIZATION", {
        consumed_at: NOW,
        consumed_by: `executor:${LEASE_ID}`
      })],
      [NEW_AUTH_1, createAuthorization(NEW_AUTH_1, "EXPLICIT_APPLY_AUTHORIZATION", { revoked: true })],
      [NEW_AUTH_2, createAuthorization(NEW_AUTH_2, "EXTERNAL_WRITES_AUTHORIZATION")]
    ])
  })

  const repository = createSingleCaseRebindPostgresRepository({ pool, ownerId: OWNER_ID, now: () => NOW })
  await assert.rejects(
    () => repository.executeRebind(request),
    /REBIND_NEW_PAIR_REVOKED/
  )
})

test("novo par expirado falha", async () => {
  const request = fixture()
  const pool = mockPool({
    leases: new Map([[CASE_IMPORT_ID, createLease()]]),
    checkpoints: new Map([[CASE_IMPORT_ID, createCheckpoint()]]),
    authorizations: new Map([
      [OLD_AUTH_1, createAuthorization(OLD_AUTH_1, "EXPLICIT_APPLY_AUTHORIZATION", {
        consumed_at: NOW,
        consumed_by: `executor:${LEASE_ID}`
      })],
      [OLD_AUTH_2, createAuthorization(OLD_AUTH_2, "EXTERNAL_WRITES_AUTHORIZATION", {
        consumed_at: NOW,
        consumed_by: `executor:${LEASE_ID}`
      })],
      [NEW_AUTH_1, createAuthorization(NEW_AUTH_1, "EXPLICIT_APPLY_AUTHORIZATION", {
        expires_at: "2026-07-17T11:00:00.000Z"
      })],
      [NEW_AUTH_2, createAuthorization(NEW_AUTH_2, "EXTERNAL_WRITES_AUTHORIZATION")]
    ])
  })

  const repository = createSingleCaseRebindPostgresRepository({ pool, ownerId: OWNER_ID, now: () => NOW })
  await assert.rejects(
    () => repository.executeRebind(request),
    /REBIND_NEW_PAIR_EXPIRED/
  )
})

test("tipos incorretos no novo par falha", async () => {
  const request = fixture()
  const pool = mockPool({
    leases: new Map([[CASE_IMPORT_ID, createLease()]]),
    checkpoints: new Map([[CASE_IMPORT_ID, createCheckpoint()]]),
    authorizations: new Map([
      [OLD_AUTH_1, createAuthorization(OLD_AUTH_1, "EXPLICIT_APPLY_AUTHORIZATION", {
        consumed_at: NOW,
        consumed_by: `executor:${LEASE_ID}`
      })],
      [OLD_AUTH_2, createAuthorization(OLD_AUTH_2, "EXTERNAL_WRITES_AUTHORIZATION", {
        consumed_at: NOW,
        consumed_by: `executor:${LEASE_ID}`
      })],
      [NEW_AUTH_1, createAuthorization(NEW_AUTH_1, "EXPLICIT_APPLY_AUTHORIZATION")],
      [NEW_AUTH_2, createAuthorization(NEW_AUTH_2, "EXPLICIT_APPLY_AUTHORIZATION")]
    ])
  })

  const repository = createSingleCaseRebindPostgresRepository({ pool, ownerId: OWNER_ID, now: () => NOW })
  await assert.rejects(
    () => repository.executeRebind(request),
    /REBIND_NEW_PAIR_TYPES_INVALID/
  )
})

// Bindings tests
test("bindings cruzados divergentes falha", async () => {
  const request = fixture()
  const pool = mockPool({
    leases: new Map([[CASE_IMPORT_ID, createLease()]]),
    checkpoints: new Map([[CASE_IMPORT_ID, createCheckpoint()]]),
    authorizations: new Map([
      [OLD_AUTH_1, createAuthorization(OLD_AUTH_1, "EXPLICIT_APPLY_AUTHORIZATION", {
        consumed_at: NOW,
        consumed_by: `executor:${LEASE_ID}`
      })],
      [OLD_AUTH_2, createAuthorization(OLD_AUTH_2, "EXTERNAL_WRITES_AUTHORIZATION", {
        consumed_at: NOW,
        consumed_by: `executor:${LEASE_ID}`
      })],
      [NEW_AUTH_1, createAuthorization(NEW_AUTH_1, "EXPLICIT_APPLY_AUTHORIZATION", {
        plan_hash: "f".repeat(64)
      })],
      [NEW_AUTH_2, createAuthorization(NEW_AUTH_2, "EXTERNAL_WRITES_AUTHORIZATION", {
        plan_hash: "f".repeat(64)
      })]
    ])
  })

  const repository = createSingleCaseRebindPostgresRepository({ pool, ownerId: OWNER_ID, now: () => NOW })
  await assert.rejects(
    () => repository.executeRebind(request),
    /REBIND_BINDINGS_CROSS_MISMATCH/
  )
})

// Lease tests
test("lease expirado durante transaÃ§Ã£o falha", async () => {
  const request = fixture()
  const pool = mockPool({
    leases: new Map([[CASE_IMPORT_ID, createLease({ expires_at: "2026-07-17T11:00:00.000Z" })]]),
    checkpoints: new Map([[CASE_IMPORT_ID, createCheckpoint()]]),
    authorizations: new Map([
      [OLD_AUTH_1, createAuthorization(OLD_AUTH_1, "EXPLICIT_APPLY_AUTHORIZATION", {
        consumed_at: NOW,
        consumed_by: `executor:${LEASE_ID}`
      })],
      [OLD_AUTH_2, createAuthorization(OLD_AUTH_2, "EXTERNAL_WRITES_AUTHORIZATION", {
        consumed_at: NOW,
        consumed_by: `executor:${LEASE_ID}`
      })],
      [NEW_AUTH_1, createAuthorization(NEW_AUTH_1, "EXPLICIT_APPLY_AUTHORIZATION")],
      [NEW_AUTH_2, createAuthorization(NEW_AUTH_2, "EXTERNAL_WRITES_AUTHORIZATION")]
    ])
  })

  const repository = createSingleCaseRebindPostgresRepository({ pool, ownerId: OWNER_ID, now: () => NOW })
  await assert.rejects(
    () => repository.executeRebind(request),
    /REBIND_LEASE_EXPIRED_DURING_TRANSACTION/
  )
})

test("owner divergente falha", async () => {
  const request = fixture()
  const pool = mockPool({
    leases: new Map([[CASE_IMPORT_ID, createLease({ owner_id: "other-owner" })]]),
    checkpoints: new Map([[CASE_IMPORT_ID, createCheckpoint()]]),
    authorizations: new Map([
      [OLD_AUTH_1, createAuthorization(OLD_AUTH_1, "EXPLICIT_APPLY_AUTHORIZATION", {
        consumed_at: NOW,
        consumed_by: `executor:${LEASE_ID}`
      })],
      [OLD_AUTH_2, createAuthorization(OLD_AUTH_2, "EXTERNAL_WRITES_AUTHORIZATION", {
        consumed_at: NOW,
        consumed_by: `executor:${LEASE_ID}`
      })],
      [NEW_AUTH_1, createAuthorization(NEW_AUTH_1, "EXPLICIT_APPLY_AUTHORIZATION")],
      [NEW_AUTH_2, createAuthorization(NEW_AUTH_2, "EXTERNAL_WRITES_AUTHORIZATION")]
    ])
  })

  const repository = createSingleCaseRebindPostgresRepository({ pool, ownerId: OWNER_ID, now: () => NOW })
  await assert.rejects(
    () => repository.executeRebind(request),
    /REBIND_LEASE_OWNER_MISMATCH/
  )
})

// Idempotency tests
test("retry idempotente retorna sucesso sem reexecutar", async () => {
  const request = fixture()
  const audit = {
    rebind_id: request.rebindId,
    case_import_id: request.caseImportId,
    source_checkpoint_version: request.sourceCheckpointVersion,
    rebound_checkpoint_version: request.reboundCheckpointVersion,
    authorization_count: 2,
    previous_authorization_set_hash: request.oldAuthorizationSetHash,
    current_authorization_set_hash: request.newAuthorizationSetHash,
    reconciliation_evidence_hash: request.reconciliationEvidenceHash,
    reason: request.reason,
    requested_by: request.requestedBy,
    fencing_token: FENCING_TOKEN,
    lease_id: LEASE_ID,
    committed_at: NOW
  }

  const reboundPayload = {
    ...createCheckpoint().checkpoint_payload,
    version: 6,
    authorizationIds: [NEW_AUTH_1, NEW_AUTH_2]
  }

  const checkpoint = createCheckpoint({
    checkpoint_version: 6,
    authorization_ids: [NEW_AUTH_1, NEW_AUTH_2],
    checkpoint_payload: reboundPayload
  })

  const pool = mockPool({
    leases: new Map([[CASE_IMPORT_ID, createLease()]]),
    checkpoints: new Map([[CASE_IMPORT_ID, checkpoint]]),
    audits: new Map([[request.rebindId, audit]]),
    authorizations: new Map([
      [OLD_AUTH_1, createAuthorization(OLD_AUTH_1, "EXPLICIT_APPLY_AUTHORIZATION", {
        consumed_at: NOW,
        consumed_by: `executor:${LEASE_ID}`
      })],
      [OLD_AUTH_2, createAuthorization(OLD_AUTH_2, "EXTERNAL_WRITES_AUTHORIZATION", {
        consumed_at: NOW,
        consumed_by: `executor:${LEASE_ID}`
      })],
      [NEW_AUTH_1, createAuthorization(NEW_AUTH_1, "EXPLICIT_APPLY_AUTHORIZATION", {
        consumed_at: NOW,
        consumed_by: `rebind:${request.rebindId}`
      })],
      [NEW_AUTH_2, createAuthorization(NEW_AUTH_2, "EXTERNAL_WRITES_AUTHORIZATION", {
        consumed_at: NOW,
        consumed_by: `rebind:${request.rebindId}`
      })]
    ])
  })

  const repository = createSingleCaseRebindPostgresRepository({ pool, ownerId: OWNER_ID, now: () => NOW })
  const result = await repository.executeRebind(request)

  assert.equal(result.status, "rebound")
  assert.equal(result.rebindId, request.rebindId)
  assert.equal(pool.state.committed, true)

  // Verify no consumption or checkpoint update
  const queries = pool.state.queries.filter(q =>
    q.text.includes("UPDATE single_case_apply_authorizations") ||
    q.text.includes("UPDATE single_case_apply_checkpoints") ||
    q.text.includes("INSERT INTO")
  )
  assert.equal(queries.length, 0)
})

test("auditoria divergente falha", async () => {
  const request = fixture()
  const audit = {
    rebind_id: request.rebindId,
    case_import_id: request.caseImportId,
    source_checkpoint_version: request.sourceCheckpointVersion,
    rebound_checkpoint_version: request.reboundCheckpointVersion,
    authorization_count: 2,
    previous_authorization_set_hash: "different-hash",
    current_authorization_set_hash: request.newAuthorizationSetHash,
    reconciliation_evidence_hash: request.reconciliationEvidenceHash,
    reason: request.reason,
    requested_by: request.requestedBy,
    fencing_token: FENCING_TOKEN,
    lease_id: LEASE_ID,
    committed_at: NOW
  }

  const pool = mockPool({
    leases: new Map([[CASE_IMPORT_ID, createLease()]]),
    checkpoints: new Map([[CASE_IMPORT_ID, createCheckpoint()]]),
    audits: new Map([[request.rebindId, audit]]),
    authorizations: new Map([
      [OLD_AUTH_1, createAuthorization(OLD_AUTH_1, "EXPLICIT_APPLY_AUTHORIZATION", {
        consumed_at: NOW,
        consumed_by: `executor:${LEASE_ID}`
      })],
      [OLD_AUTH_2, createAuthorization(OLD_AUTH_2, "EXTERNAL_WRITES_AUTHORIZATION", {
        consumed_at: NOW,
        consumed_by: `executor:${LEASE_ID}`
      })],
      [NEW_AUTH_1, createAuthorization(NEW_AUTH_1, "EXPLICIT_APPLY_AUTHORIZATION")],
      [NEW_AUTH_2, createAuthorization(NEW_AUTH_2, "EXTERNAL_WRITES_AUTHORIZATION")]
    ])
  })

  const repository = createSingleCaseRebindPostgresRepository({ pool, ownerId: OWNER_ID, now: () => NOW })
  await assert.rejects(
    () => repository.executeRebind(request),
    /REBIND_AUDIT_DIVERGENT/
  )
})

// VerificaÃ§Ã£o de que par antigo nÃ£o Ã© alterado
test("par antigo nÃ£o Ã© alterado durante rebind", async () => {
  const request = fixture()
  const pool = mockPool({
    leases: new Map([[CASE_IMPORT_ID, createLease()]]),
    checkpoints: new Map([[CASE_IMPORT_ID, createCheckpoint()]]),
    authorizations: new Map([
      [OLD_AUTH_1, createAuthorization(OLD_AUTH_1, "EXPLICIT_APPLY_AUTHORIZATION", {
        consumed_at: NOW,
        consumed_by: `executor:${LEASE_ID}`
      })],
      [OLD_AUTH_2, createAuthorization(OLD_AUTH_2, "EXTERNAL_WRITES_AUTHORIZATION", {
        consumed_at: NOW,
        consumed_by: `executor:${LEASE_ID}`
      })],
      [NEW_AUTH_1, createAuthorization(NEW_AUTH_1, "EXPLICIT_APPLY_AUTHORIZATION")],
      [NEW_AUTH_2, createAuthorization(NEW_AUTH_2, "EXTERNAL_WRITES_AUTHORIZATION")]
    ])
  })

  const oldAuth1Before = { ...pool.state.authorizations.get(OLD_AUTH_1) }
  const oldAuth2Before = { ...pool.state.authorizations.get(OLD_AUTH_2) }

  const repository = createSingleCaseRebindPostgresRepository({ pool, ownerId: OWNER_ID, now: () => NOW })
  await repository.executeRebind(request)

  const oldAuth1After = pool.state.authorizations.get(OLD_AUTH_1)
  const oldAuth2After = pool.state.authorizations.get(OLD_AUTH_2)

  assert.deepEqual(oldAuth1After, oldAuth1Before)
  assert.deepEqual(oldAuth2After, oldAuth2Before)
})

// VerificaÃ§Ã£o de que somente novo par Ã© consumido
test("somente novo par Ã© consumido", async () => {
  const request = fixture()
  const pool = mockPool({
    leases: new Map([[CASE_IMPORT_ID, createLease()]]),
    checkpoints: new Map([[CASE_IMPORT_ID, createCheckpoint()]]),
    authorizations: new Map([
      [OLD_AUTH_1, createAuthorization(OLD_AUTH_1, "EXPLICIT_APPLY_AUTHORIZATION", {
        consumed_at: NOW,
        consumed_by: `executor:${LEASE_ID}`
      })],
      [OLD_AUTH_2, createAuthorization(OLD_AUTH_2, "EXTERNAL_WRITES_AUTHORIZATION", {
        consumed_at: NOW,
        consumed_by: `executor:${LEASE_ID}`
      })],
      [NEW_AUTH_1, createAuthorization(NEW_AUTH_1, "EXPLICIT_APPLY_AUTHORIZATION")],
      [NEW_AUTH_2, createAuthorization(NEW_AUTH_2, "EXTERNAL_WRITES_AUTHORIZATION")]
    ])
  })

  const repository = createSingleCaseRebindPostgresRepository({ pool, ownerId: OWNER_ID, now: () => NOW })
  await repository.executeRebind(request)

  const newAuth1 = pool.state.authorizations.get(NEW_AUTH_1)
  const newAuth2 = pool.state.authorizations.get(NEW_AUTH_2)

  assert.equal(newAuth1.consumed_at, NOW)
  assert.equal(newAuth1.consumed_by, `rebind:${request.rebindId}`)
  assert.equal(newAuth2.consumed_at, NOW)
  assert.equal(newAuth2.consumed_by, `rebind:${request.rebindId}`)
})

// VerificaÃ§Ã£o de rollback
test("rollback em erro nÃ£o persiste auditoria", async () => {
  const request = fixture()
  const pool = mockPool({
    leases: new Map([[CASE_IMPORT_ID, createLease()]]),
    checkpoints: new Map([[CASE_IMPORT_ID, createCheckpoint()]]),
    authorizations: new Map([
      [OLD_AUTH_1, createAuthorization(OLD_AUTH_1, "EXPLICIT_APPLY_AUTHORIZATION", {
        consumed_at: NOW,
        consumed_by: `executor:${LEASE_ID}`
      })],
      [OLD_AUTH_2, createAuthorization(OLD_AUTH_2, "EXTERNAL_WRITES_AUTHORIZATION", {
        consumed_at: NOW,
        consumed_by: `executor:${LEASE_ID}`
      })],
      [NEW_AUTH_1, createAuthorization(NEW_AUTH_1, "EXPLICIT_APPLY_AUTHORIZATION", { revoked: true })],
      [NEW_AUTH_2, createAuthorization(NEW_AUTH_2, "EXTERNAL_WRITES_AUTHORIZATION")]
    ])
  })

  const repository = createSingleCaseRebindPostgresRepository({ pool, ownerId: OWNER_ID, now: () => NOW })

  await assert.rejects(
    () => repository.executeRebind(request),
    /REBIND_NEW_PAIR_REVOKED/
  )

  assert.equal(pool.state.committed, false)
  assert.equal(pool.state.rolledBack, true)
})

// ========== NOVOS TESTES PARA PLAN_HASH_CHANGE ==========

const NEW_AUTHORIZABLE_PLAN_HASH = "b".repeat(64)
const NEW_PLAN_HASH = "c".repeat(64)
const NEW_MANIFEST_HASH = "d".repeat(64)

function createPlanRebindRequest(overrides = {}) {
  const reconciliationEvidence = {
    decision: "RECONCILIATION_ELIGIBLE",
    reason: "CONTACT_READ_ONLY_VERIFIED",
    contactEvidence: { caseImportId: CASE_IMPORT_ID },
    namePresentation: { semanticMatch: true, materialDivergence: false },
    resume: { checkpointRebindRequired: true, ambiguity: "NONE" },
    evidenceHash: "e".repeat(64)
  }

  return createRebindRequest({
    caseImportId: CASE_IMPORT_ID,
    sourceCheckpointVersion: 5,
    oldAuthorizationIds: [OLD_AUTH_1, OLD_AUTH_2],
    newAuthorizationIds: [NEW_AUTH_1, NEW_AUTH_2],
    reconciliationEvidence,
    reason: "PLAN_REGENERATED_AFTER_SAFE_CORRECTION",
    requestedBy: "rebind-coordinator",
    newAuthorizablePlanHash: NEW_AUTHORIZABLE_PLAN_HASH,
    newPlanHash: NEW_PLAN_HASH,
    newManifestHash: NEW_MANIFEST_HASH,
    ...overrides
  })
}

function createCheckpointForPlanRebind(overrides = {}) {
  const payload = {
    schemaVersion: 2,
    caseImportId: CASE_IMPORT_ID,
    caseFingerprint: CASE_FINGERPRINT,
    caseNumber: CASE_NUMBER,
    authorizablePlanHash: AUTHORIZABLE_PLAN_HASH,
    planHash: PLAN_HASH,
    manifestHash: MANIFEST_HASH,
    reservationEvidenceHash: RESERVATION_EVIDENCE_HASH,
    authorizationIds: [OLD_AUTH_1, OLD_AUTH_2],
    status: "failed",
    version: 5,
    steps: {
      reservation: { status: "completed", result: { verified: true, caseImportId: CASE_IMPORT_ID, caseNumber: CASE_NUMBER, evidenceId: "ev-1" } },
      contact: { status: "failed", errorCode: "VERIFICATION_FAILED" },
      deal: { status: "pending" },
      association: { status: "pending" },
      area_folder: { status: "pending" },
      case_folder: { status: "pending" },
      uploads: { status: "pending" },
      final_verify: { status: "pending" }
    },
    resources: { contactId: null, dealId: null, associationId: null, areaFolderId: null, caseFolderId: null },
    uploads: {},
    finalProof: null
  }

  return {
    case_import_id: CASE_IMPORT_ID,
    schema_version: 2,
    checkpoint_version: 5,
    case_fingerprint: CASE_FINGERPRINT,
    case_number: CASE_NUMBER,
    authorizable_plan_hash: AUTHORIZABLE_PLAN_HASH,
    plan_hash: PLAN_HASH,
    manifest_hash: MANIFEST_HASH,
    reservation_evidence_hash: RESERVATION_EVIDENCE_HASH,
    authorization_ids: [OLD_AUTH_1, OLD_AUTH_2],
    global_status: "failed",
    checkpoint_payload: payload,
    fencing_token: FENCING_TOKEN,
    lease_id: LEASE_ID,
    ...overrides
  }
}

function mockPoolForPlanRebind(state = {}) {
  const poolState = {
    queries: [],
    leases: new Map([[CASE_IMPORT_ID, { lease_id: LEASE_ID, fencing_token: FENCING_TOKEN, owner_id: OWNER_ID, expires_at: "2099-01-01T00:00:00.000Z", released_at: null }]]),
    checkpoints: new Map([[CASE_IMPORT_ID, createCheckpointForPlanRebind()]]),
    authorizations: new Map([
      [OLD_AUTH_1, createAuthorization(OLD_AUTH_1, "EXPLICIT_APPLY_AUTHORIZATION", { consumed_at: NOW, consumed_by: `executor:${LEASE_ID}` })],
      [OLD_AUTH_2, createAuthorization(OLD_AUTH_2, "EXTERNAL_WRITES_AUTHORIZATION", { consumed_at: NOW, consumed_by: `executor:${LEASE_ID}` })],
      [NEW_AUTH_1, createAuthorization(NEW_AUTH_1, "EXPLICIT_APPLY_AUTHORIZATION", { authorizable_plan_hash: NEW_AUTHORIZABLE_PLAN_HASH, plan_hash: NEW_PLAN_HASH, manifest_hash: NEW_MANIFEST_HASH })],
      [NEW_AUTH_2, createAuthorization(NEW_AUTH_2, "EXTERNAL_WRITES_AUTHORIZATION", { authorizable_plan_hash: NEW_AUTHORIZABLE_PLAN_HASH, plan_hash: NEW_PLAN_HASH, manifest_hash: NEW_MANIFEST_HASH })]
    ]),
    audits: new Map(),
    committed: false,
    rolledBack: false,
    ...state
  }

  return {
    state: poolState,
    async connect() {
      const client = {
        async query(sql, params) {
          const text = String(sql).replace(/\s+/g, " ").trim()
          poolState.queries.push({ text, params: params ? [...params] : [] })

          if (text === "BEGIN") return { rows: [], rowCount: 0 }
          if (text === "COMMIT") { poolState.committed = true; return { rows: [], rowCount: 0 } }
          if (text === "ROLLBACK") { poolState.rolledBack = true; return { rows: [], rowCount: 0 } }
          if (text.includes("pg_advisory_xact_lock")) return { rows: [], rowCount: 0 }

          if (text.includes("FROM single_case_apply_leases") && text.includes("FOR UPDATE")) {
            const lease = poolState.leases.get(params[0])
            if (!lease) return { rows: [], rowCount: 0 }
            return { rows: [{ ...lease, is_current: true }], rowCount: 1 }
          }

          if (text.includes("FROM single_case_apply_checkpoints") && text.includes("FOR UPDATE")) {
            const cp = poolState.checkpoints.get(params[0])
            if (!cp) return { rows: [], rowCount: 0 }
            return { rows: [cp], rowCount: 1 }
          }

          if (text.includes("FROM single_case_apply_authorizations") && text.includes("FOR UPDATE")) {
            const ids = params[0]
            const rows = ids.map(id => poolState.authorizations.get(id)).filter(Boolean)
            return { rows, rowCount: rows.length }
          }

          if (text.includes("UPDATE single_case_apply_authorizations") && text.includes("consumed_at")) {
            const consumedBy = params[0]
            const authIds = params[1]
            let updated = 0
            const resultRows = []
            for (const id of authIds) {
              const auth = poolState.authorizations.get(id)
              if (auth &&
                  auth.operational_status === 'ACTIVE' &&
                  !auth.consumed_at &&
                  !auth.revoked &&
                  Date.parse(auth.expires_at) > Date.parse(NOW)) {
                auth.consumed_at = NOW
                auth.consumed_by = consumedBy
                resultRows.push({ authorization_id: id, consumed_at: NOW, consumed_by: consumedBy })
                updated++
              }
            }
            return { rows: resultRows, rowCount: updated }
          }

          if (text.includes("UPDATE single_case_apply_checkpoints")) {
            const cp = poolState.checkpoints.get(params[6])
            if (!cp) return { rows: [], rowCount: 0 }

            // Validate CAS conditions
            if (Number(cp.checkpoint_version) !== params[7]) return { rows: [], rowCount: 0 }
            if (cp.lease_id !== params[8]) return { rows: [], rowCount: 0 }
            if (Number(cp.fencing_token) !== params[9]) return { rows: [], rowCount: 0 }

            // Validate EXISTS condition (new lease vigente)
            const newLease = poolState.leases.get(cp.case_import_id)
            if (!newLease) return { rows: [], rowCount: 0 }
            if (newLease.owner_id !== params[10]) return { rows: [], rowCount: 0 }
            if (newLease.released_at) return { rows: [], rowCount: 0 }
            if (Date.parse(newLease.expires_at) <= Date.parse(NOW)) return { rows: [], rowCount: 0 }

            cp.checkpoint_version = params[0]
            cp.authorizable_plan_hash = params[1]
            cp.authorization_ids = JSON.parse(params[2])
            cp.checkpoint_payload = JSON.parse(params[3])
            cp.checkpoint_payload.version = params[0]
            cp.checkpoint_payload.authorizationIds = JSON.parse(params[2])
            cp.fencing_token = params[4]
            cp.lease_id = params[5]
            cp.updated_at = NOW
            poolState.checkpoints.set(params[6], cp)

            return { rows: [{ checkpoint_version: params[0] }], rowCount: 1 }
          }

          if (text.includes("information_schema.columns")) {
            return { rowCount: 0, rows: [] }
          }

          if (text.includes("pg_constraint")) {
            return { rowCount: 0, rows: [] }
          }

          if (text.includes("FROM pg_index")) {
            return { rowCount: 0, rows: [] }
          }

          // Revalidação de lease (diagnoseLeaseMutationFailure)
          if (text.includes("expires_at > CURRENT_TIMESTAMP AS is_current")) {
            const lease = poolState.leases.get(params[0])
            if (!lease) return { rows: [], rowCount: 0 }
            const is_current = Date.parse(lease.expires_at) > Date.parse(NOW)
            return {
              rows: [{
                owner_id: lease.owner_id,
                fencing_token: lease.fencing_token,
                released_at: lease.released_at,
                expires_at: lease.expires_at,
                is_current
              }],
              rowCount: 1
            }
          }

          // SELECT audit
          if (text.includes("FROM single_case_apply_rebind_audit") && text.includes("WHERE rebind_id")) {
            const audit = poolState.audits.get(params[0])
            if (!audit) return { rows: [], rowCount: 0 }
            return { rows: [audit], rowCount: 1 }
          }

          // INSERT audit
          if ((text.includes("INSERT INTO") && text.includes(TABLE_NAME))) {
            const caseImportId = params[1]
            const leaseId = params[11]
            const fencingToken = params[10]
            const ownerId = params[12]

            const lease = poolState.leases.get(caseImportId)
            if (!lease) return { rows: [], rowCount: 0 }
            if (lease.owner_id !== ownerId) return { rows: [], rowCount: 0 }
            if (lease.released_at) return { rows: [], rowCount: 0 }
            if (Date.parse(lease.expires_at) <= Date.parse(NOW)) return { rows: [], rowCount: 0 }
            if (lease.lease_id !== leaseId) return { rows: [], rowCount: 0 }
            if (Number(lease.fencing_token) !== fencingToken) return { rows: [], rowCount: 0 }

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

          return { rows: [], rowCount: 0 }
        },
        async release() {}
      }
      return client
    },
    async query() { return { rows: [], rowCount: 0 } },
    async end() {}
  }
}

test("novo motivo PLAN_REGENERATED_AFTER_SAFE_CORRECTION exige todos os novos hashes", () => {
  const req = createPlanRebindRequest()
  assert.equal(req.reason, "PLAN_REGENERATED_AFTER_SAFE_CORRECTION")
  assert.equal(req.newAuthorizablePlanHash, NEW_AUTHORIZABLE_PLAN_HASH)
  assert.equal(req.newPlanHash, NEW_PLAN_HASH)
  assert.equal(req.newManifestHash, NEW_MANIFEST_HASH)
})

test("hashes parciais bloqueiam", () => {
  assert.throws(() => createPlanRebindRequest({ newAuthorizablePlanHash: NEW_AUTHORIZABLE_PLAN_HASH, newPlanHash: undefined, newManifestHash: undefined }), /REBIND_NEW_PLAN_HASH_INVALID/)
  assert.throws(() => createPlanRebindRequest({ newPlanHash: NEW_PLAN_HASH, newAuthorizablePlanHash: undefined, newManifestHash: undefined }), /REBIND_NEW_AUTHORIZABLE_PLAN_HASH_INVALID/)
  assert.throws(() => createPlanRebindRequest({ newManifestHash: NEW_MANIFEST_HASH, newAuthorizablePlanHash: undefined, newPlanHash: undefined }), /REBIND_NEW_AUTHORIZABLE_PLAN_HASH_INVALID/)
})

test("novos authorizationIds incompletos bloqueiam para motivo de regeneração", () => {
  assert.throws(() => createPlanRebindRequest({ newAuthorizationIds: [NEW_AUTH_1] }), /REBIND_NEW_AUTHORIZATION_IDS_WRONG_COUNT/)
})

test("authorizationIds duplicados no novo par bloqueiam", () => {
  assert.throws(() => createPlanRebindRequest({ newAuthorizationIds: [NEW_AUTH_1, NEW_AUTH_1] }), /REBIND_NEW_AUTHORIZATION_IDS_DUPLICATE/)
})

test("rebind com novos hashes atualiza authorizable_plan_hash e payload", async () => {
  const pool = mockPoolForPlanRebind()
  const repository = createSingleCaseRebindPostgresRepository({ pool, ownerId: OWNER_ID, now: () => NOW })
  const request = createPlanRebindRequest()

  const result = await repository.executeRebind(request)

  assert.equal(result.status, "rebound")
  assert.equal(result.reboundCheckpointVersion, 6)
  assert.equal(pool.state.committed, true)
  assert.equal(pool.state.rolledBack, false)

  const updatedCp = pool.state.checkpoints.get(CASE_IMPORT_ID)
  assert.equal(updatedCp.authorizable_plan_hash, NEW_AUTHORIZABLE_PLAN_HASH)
  assert.equal(updatedCp.checkpoint_payload.authorizablePlanHash, NEW_AUTHORIZABLE_PLAN_HASH)
  assert.equal(updatedCp.checkpoint_payload.planHash, NEW_PLAN_HASH)
  assert.equal(updatedCp.checkpoint_payload.manifestHash, NEW_MANIFEST_HASH)
  assert.deepEqual(updatedCp.checkpoint_payload.authorizationIds, [NEW_AUTH_1, NEW_AUTH_2])
  assert.equal(updatedCp.checkpoint_payload.version, 6)
  assert.equal(updatedCp.checkpoint_payload.steps.contact.status, "pending")
  assert.equal(updatedCp.checkpoint_payload.steps.contact.errorCode, undefined)
  assert.equal(updatedCp.checkpoint_payload.steps.reservation.status, "completed")
  assert.deepEqual(updatedCp.checkpoint_payload.resources, { contactId: null, dealId: null, associationId: null, areaFolderId: null, caseFolderId: null })
  assert.deepEqual(updatedCp.checkpoint_payload.uploads, {})
  assert.equal(updatedCp.checkpoint_payload.finalProof, null)
})

test("caminho antigo sem novos hashes permanece inalterado", async () => {
  const pool = mockPool({
    leases: new Map([[CASE_IMPORT_ID, createLease()]]),
    checkpoints: new Map([[CASE_IMPORT_ID, createCheckpoint()]]),
    authorizations: new Map([
      [OLD_AUTH_1, createAuthorization(OLD_AUTH_1, "EXPLICIT_APPLY_AUTHORIZATION", { consumed_at: NOW, consumed_by: `executor:${LEASE_ID}` })],
      [OLD_AUTH_2, createAuthorization(OLD_AUTH_2, "EXTERNAL_WRITES_AUTHORIZATION", { consumed_at: NOW, consumed_by: `executor:${LEASE_ID}` })],
      [NEW_AUTH_1, createAuthorization(NEW_AUTH_1, "EXPLICIT_APPLY_AUTHORIZATION")],
      [NEW_AUTH_2, createAuthorization(NEW_AUTH_2, "EXTERNAL_WRITES_AUTHORIZATION")]
    ])
  })
  const repository = createSingleCaseRebindPostgresRepository({ pool, ownerId: OWNER_ID, now: () => NOW })
  const reconciliationEvidence = {
    decision: "RECONCILIATION_ELIGIBLE",
    reason: "CONTACT_READ_ONLY_VERIFIED",
    contactEvidence: { caseImportId: CASE_IMPORT_ID },
    namePresentation: { semanticMatch: true, materialDivergence: false },
    resume: { checkpointRebindRequired: true, ambiguity: "NONE" },
    evidenceHash: "e".repeat(64)
  }
  const request = createRebindRequest({
    caseImportId: CASE_IMPORT_ID,
    sourceCheckpointVersion: 5,
    oldAuthorizationIds: [OLD_AUTH_1, OLD_AUTH_2],
    newAuthorizationIds: [NEW_AUTH_1, NEW_AUTH_2],
    reconciliationEvidence,
    reason: "CONTACT_RECONCILED_AFTER_DIVERGENCE",
    requestedBy: "rebind-coordinator"
  })

  const result = await repository.executeRebind(request)

  assert.equal(result.status, "rebound")
  const updatedCp = pool.state.checkpoints.get(CASE_IMPORT_ID)
  assert.equal(updatedCp.authorizable_plan_hash, AUTHORIZABLE_PLAN_HASH)
  assert.equal(updatedCp.checkpoint_payload.authorizablePlanHash, AUTHORIZABLE_PLAN_HASH)
  assert.equal(updatedCp.checkpoint_payload.planHash, PLAN_HASH)
  assert.equal(updatedCp.checkpoint_payload.steps.contact.status, "failed")
  assert.equal(updatedCp.checkpoint_payload.steps.contact.errorCode, "CONTACT_FIELDS_DIVERGENCE")
})

test("rollback total em falha após inserir auditoria", async () => {
  const pool = mockPoolForPlanRebind()
  pool.state.audits.set("some-audit", {})
  pool.state.authorizations.get(NEW_AUTH_1).expires_at = "2000-01-01T00:00:00.000Z"

  const repository = createSingleCaseRebindPostgresRepository({ pool, ownerId: OWNER_ID, now: () => NOW })
  const request = createPlanRebindRequest()

  await assert.rejects(() => repository.executeRebind(request), /REBIND_NEW_PAIR_EXPIRED/)

  assert.equal(pool.state.committed, false)
  assert.equal(pool.state.rolledBack, true)
})

test("idempotência: mesma solicitação retorna mesmo resultado", async () => {
  const pool = mockPoolForPlanRebind()
  const repository = createSingleCaseRebindPostgresRepository({ pool, ownerId: OWNER_ID, now: () => NOW })
  const request = createPlanRebindRequest()

  const result1 = await repository.executeRebind(request)
  const result2 = await repository.executeRebind(request)

  assert.equal(result1.rebindId, result2.rebindId)
  assert.equal(result1.reboundCheckpointVersion, result2.reboundCheckpointVersion)
  assert.equal(result1.status, "rebound")
})

test("concorrência: segunda solicitação divergente bloqueia", async () => {
  const pool = mockPoolForPlanRebind()
  const repository = createSingleCaseRebindPostgresRepository({ pool, ownerId: OWNER_ID, now: () => NOW })
  const request1 = createPlanRebindRequest()
  const request2 = createPlanRebindRequest({ newAuthorizablePlanHash: "0".repeat(64), newPlanHash: "1".repeat(64), newManifestHash: "2".repeat(64), requestedBy: "rebind-coordinator-concurrent" })

  const result1 = await repository.executeRebind(request1)
  await assert.rejects(() => repository.executeRebind(request2), /REBIND_CONSUME_BY_INVALID|REBIND_CHECKPOINT_DIVERGENT|REBIND_AUDIT_DIVERGENT|REBIND_NEW_PAIR_CONSUMED|REBIND_CONSUME_NEW_PAIR_FAILED|CHECKPOINT_CONTACT_NOT_FAILED/)

  assert.equal(result1.status, "rebound")
})

test("lease antiga não é considerada ativa quando nova lease é exigida", async () => {
  const pool = mockPoolForPlanRebind()
  pool.state.leases.set(CASE_IMPORT_ID, { lease_id: "old-lease", fencing_token: 1, owner_id: OWNER_ID, expires_at: "2000-01-01T00:00:00.000Z", released_at: null })

  const repository = createSingleCaseRebindPostgresRepository({ pool, ownerId: OWNER_ID, now: () => NOW })
  const request = createPlanRebindRequest()

  await assert.rejects(() => repository.executeRebind(request), /REBIND_LEASE_EXPIRED_DURING_TRANSACTION|REBIND_LEASE_EXPIRED/)
})

// VerificaÃ§Ã£o de resposta sem IDs completos
test("resposta nÃ£o contÃ©m authorization IDs completos", async () => {
  const request = fixture()
  const pool = mockPool({
    leases: new Map([[CASE_IMPORT_ID, createLease()]]),
    checkpoints: new Map([[CASE_IMPORT_ID, createCheckpoint()]]),
    authorizations: new Map([
      [OLD_AUTH_1, createAuthorization(OLD_AUTH_1, "EXPLICIT_APPLY_AUTHORIZATION", {
        consumed_at: NOW,
        consumed_by: `executor:${LEASE_ID}`
      })],
      [OLD_AUTH_2, createAuthorization(OLD_AUTH_2, "EXTERNAL_WRITES_AUTHORIZATION", {
        consumed_at: NOW,
        consumed_by: `executor:${LEASE_ID}`
      })],
      [NEW_AUTH_1, createAuthorization(NEW_AUTH_1, "EXPLICIT_APPLY_AUTHORIZATION")],
      [NEW_AUTH_2, createAuthorization(NEW_AUTH_2, "EXTERNAL_WRITES_AUTHORIZATION")]
    ])
  })

  const repository = createSingleCaseRebindPostgresRepository({ pool, ownerId: OWNER_ID, now: () => NOW })
  const result = await repository.executeRebind(request)

  assert.equal(result.oldAuthorizationIds, undefined)
  assert.equal(result.newAuthorizationIds, undefined)
  assert.equal(typeof result.rebindId, "string")
  assert.equal(typeof result.previousAuthorizationSetHash, "string")
  assert.equal(typeof result.currentAuthorizationSetHash, "string")
})

test("checkpoint version mismatch falha", async () => {
  const request = fixture()

  // Create checkpoint with wrong version but valid payload structure
  const wrongPayload = {
    ...createCheckpoint().checkpoint_payload,
    version: 7,
    authorizationIds: [OLD_AUTH_1, OLD_AUTH_2]
  }

  const wrongCheckpoint = createCheckpoint({
    checkpoint_version: 7,
    checkpoint_payload: wrongPayload
  })

  const pool = mockPool({
    leases: new Map([[CASE_IMPORT_ID, createLease()]]),
    checkpoints: new Map([[CASE_IMPORT_ID, wrongCheckpoint]]),
    authorizations: new Map([
      [OLD_AUTH_1, createAuthorization(OLD_AUTH_1, "EXPLICIT_APPLY_AUTHORIZATION", {
        consumed_at: NOW,
        consumed_by: `executor:${LEASE_ID}`
      })],
      [OLD_AUTH_2, createAuthorization(OLD_AUTH_2, "EXTERNAL_WRITES_AUTHORIZATION", {
        consumed_at: NOW,
        consumed_by: `executor:${LEASE_ID}`
      })],
      [NEW_AUTH_1, createAuthorization(NEW_AUTH_1, "EXPLICIT_APPLY_AUTHORIZATION")],
      [NEW_AUTH_2, createAuthorization(NEW_AUTH_2, "EXTERNAL_WRITES_AUTHORIZATION")]
    ])
  })

  const repository = createSingleCaseRebindPostgresRepository({ pool, ownerId: OWNER_ID, now: () => NOW })
  await assert.rejects(
    () => repository.executeRebind(request),
    /CHECKPOINT_VERSION_MISMATCH/
  )
})

// Garantias persistenciais adicionais

test("SQL de consumo usa CURRENT_TIMESTAMP do PostgreSQL", async () => {
  const request = fixture()
  const pool = mockPool({
    leases: new Map([[CASE_IMPORT_ID, createLease()]]),
    checkpoints: new Map([[CASE_IMPORT_ID, createCheckpoint()]]),
    authorizations: new Map([
      [OLD_AUTH_1, createAuthorization(OLD_AUTH_1, "EXPLICIT_APPLY_AUTHORIZATION", {
        consumed_at: NOW,
        consumed_by: `executor:${LEASE_ID}`
      })],
      [OLD_AUTH_2, createAuthorization(OLD_AUTH_2, "EXTERNAL_WRITES_AUTHORIZATION", {
        consumed_at: NOW,
        consumed_by: `executor:${LEASE_ID}`
      })],
      [NEW_AUTH_1, createAuthorization(NEW_AUTH_1, "EXPLICIT_APPLY_AUTHORIZATION")],
      [NEW_AUTH_2, createAuthorization(NEW_AUTH_2, "EXTERNAL_WRITES_AUTHORIZATION")]
    ])
  })

  const repository = createSingleCaseRebindPostgresRepository({ pool, ownerId: OWNER_ID, now: () => NOW })
  await repository.executeRebind(request)

  // Verificar que o SQL de consumo usa CURRENT_TIMESTAMP
  const consumeQuery = pool.state.queries.find(q =>
    q.text.includes("UPDATE single_case_apply_authorizations") &&
    q.text.includes("consumed_at")
  )

  assert(consumeQuery, "Query de consumo nÃ£o encontrada")
  assert(consumeQuery.text.includes("SET consumed_at = CURRENT_TIMESTAMP"), "Deve usar CURRENT_TIMESTAMP para consumed_at")
  assert(consumeQuery.text.includes("expires_at > CURRENT_TIMESTAMP"), "Deve usar CURRENT_TIMESTAMP para validaÃ§Ã£o de expiraÃ§Ã£o")
  assert(!consumeQuery.text.match(/expires_at\s*>\s*\$\d+::timestamptz/), "NÃ£o deve usar parÃ¢metro de aplicaÃ§Ã£o para expiraÃ§Ã£o")
  assert(consumeQuery.text.includes("RETURNING authorization_id, consumed_at, consumed_by"), "Deve retornar campos consumidos")
})



test("cÃ³digos de erro legÃ­timos sÃ£o preservados", async () => {
  const request = fixture()

  // Criar cenÃ¡rio que gera erro especÃ­fico
  const pool = mockPool({
    leases: new Map([[CASE_IMPORT_ID, createLease()]]),
    checkpoints: new Map([[CASE_IMPORT_ID, createCheckpoint()]]),
    authorizations: new Map([
      [OLD_AUTH_1, createAuthorization(OLD_AUTH_1, "EXPLICIT_APPLY_AUTHORIZATION")],
      [OLD_AUTH_2, createAuthorization(OLD_AUTH_2, "EXTERNAL_WRITES_AUTHORIZATION")],
      [NEW_AUTH_1, createAuthorization(NEW_AUTH_1, "EXPLICIT_APPLY_AUTHORIZATION")],
      [NEW_AUTH_2, createAuthorization(NEW_AUTH_2, "EXTERNAL_WRITES_AUTHORIZATION")]
    ])
  })

  const repository = createSingleCaseRebindPostgresRepository({ pool, ownerId: OWNER_ID, now: () => NOW })

  try {
    await repository.executeRebind(request)
    assert.fail("Deveria ter lanÃ§ado erro")
  } catch (error) {
    // Verificar que o cÃ³digo de erro Ã© especÃ­fico e legÃ­timo
    assert.equal(error.message, "REBIND_OLD_PAIR_NOT_CONSUMED")

    // Verificar que nÃ£o contÃ©m IDs completos
    assert(!error.message.includes(OLD_AUTH_1))
    assert(!error.message.includes(OLD_AUTH_2))
    assert(!error.message.includes(NEW_AUTH_1))
    assert(!error.message.includes(NEW_AUTH_2))

    // Verificar que nÃ£o contÃ©m hashes completos
    assert(!error.message.includes(PLAN_HASH))
    assert(!error.message.includes(MANIFEST_HASH))

    // Verificar que nÃ£o contÃ©m SQL
    assert(!error.message.includes("UPDATE"))
    assert(!error.message.includes("SELECT"))
  }
})

test("UPDATE de autorizaÃ§Ãµes retorna duas linhas com mesmo consumed_at e consumed_by", async () => {
  const request = fixture()
  const pool = mockPool({
    leases: new Map([[CASE_IMPORT_ID, createLease()]]),
    checkpoints: new Map([[CASE_IMPORT_ID, createCheckpoint()]]),
    authorizations: new Map([
      [OLD_AUTH_1, createAuthorization(OLD_AUTH_1, "EXPLICIT_APPLY_AUTHORIZATION", {
        consumed_at: NOW,
        consumed_by: `executor:${LEASE_ID}`
      })],
      [OLD_AUTH_2, createAuthorization(OLD_AUTH_2, "EXTERNAL_WRITES_AUTHORIZATION", {
        consumed_at: NOW,
        consumed_by: `executor:${LEASE_ID}`
      })],
      [NEW_AUTH_1, createAuthorization(NEW_AUTH_1, "EXPLICIT_APPLY_AUTHORIZATION")],
      [NEW_AUTH_2, createAuthorization(NEW_AUTH_2, "EXTERNAL_WRITES_AUTHORIZATION")]
    ])
  })

  const repository = createSingleCaseRebindPostgresRepository({ pool, ownerId: OWNER_ID, now: () => NOW })
  await repository.executeRebind(request)

  const newAuth1 = pool.state.authorizations.get(NEW_AUTH_1)
  const newAuth2 = pool.state.authorizations.get(NEW_AUTH_2)

  // Garantir que ambas autorizaÃ§Ãµes tÃªm exatamente o mesmo consumed_at
  assert.equal(newAuth1.consumed_at, newAuth2.consumed_at)
  assert.equal(newAuth1.consumed_at, NOW)

  // Garantir que ambas autorizaÃ§Ãµes tÃªm exatamente o mesmo consumed_by
  assert.equal(newAuth1.consumed_by, newAuth2.consumed_by)
  assert.equal(newAuth1.consumed_by, `rebind:${request.rebindId}`)
})

test("lease expira entre validaÃ§Ã£o inicial e consumo - UPDATE retorna 0", async () => {
  const request = fixture()

  // Lease vÃ¡lido inicialmente mas expira durante o consumo
  const leaseThatWillExpire = createLease()

  const pool = mockPool({
    leases: new Map([[CASE_IMPORT_ID, leaseThatWillExpire]]),
    checkpoints: new Map([[CASE_IMPORT_ID, createCheckpoint()]]),
    authorizations: new Map([
      [OLD_AUTH_1, createAuthorization(OLD_AUTH_1, "EXPLICIT_APPLY_AUTHORIZATION", {
        consumed_at: NOW,
        consumed_by: `executor:${LEASE_ID}`
      })],
      [OLD_AUTH_2, createAuthorization(OLD_AUTH_2, "EXTERNAL_WRITES_AUTHORIZATION", {
        consumed_at: NOW,
        consumed_by: `executor:${LEASE_ID}`
      })],
      [NEW_AUTH_1, createAuthorization(NEW_AUTH_1, "EXPLICIT_APPLY_AUTHORIZATION")],
      [NEW_AUTH_2, createAuthorization(NEW_AUTH_2, "EXTERNAL_WRITES_AUTHORIZATION")]
    ])
  })

  // ForÃ§ar lease a expirar durante a transaÃ§Ã£o
  leaseThatWillExpire.expires_at = "2026-07-17T11:00:00.000Z"

  const repository = createSingleCaseRebindPostgresRepository({ pool, ownerId: OWNER_ID, now: () => NOW })

  await assert.rejects(
    () => repository.executeRebind(request),
    /REBIND_LEASE_EXPIRED_DURING_TRANSACTION/
  )

  assert.equal(pool.state.committed, false)
  assert.equal(pool.state.rolledBack, true)
})

test("lease expira entre consumo e checkpoint - CAS retorna 0 e consumo Ã© revertido", async () => {
  const request = fixture()

  // Lease que expira apÃ³s consumo mas antes do checkpoint
  const pool = mockPool({
    leases: new Map([[CASE_IMPORT_ID, createLease({ expires_at: "2026-07-17T11:00:00.000Z" })]]),
    checkpoints: new Map([[CASE_IMPORT_ID, createCheckpoint()]]),
    authorizations: new Map([
      [OLD_AUTH_1, createAuthorization(OLD_AUTH_1, "EXPLICIT_APPLY_AUTHORIZATION", {
        consumed_at: NOW,
        consumed_by: `executor:${LEASE_ID}`
      })],
      [OLD_AUTH_2, createAuthorization(OLD_AUTH_2, "EXTERNAL_WRITES_AUTHORIZATION", {
        consumed_at: NOW,
        consumed_by: `executor:${LEASE_ID}`
      })],
      [NEW_AUTH_1, createAuthorization(NEW_AUTH_1, "EXPLICIT_APPLY_AUTHORIZATION")],
      [NEW_AUTH_2, createAuthorization(NEW_AUTH_2, "EXTERNAL_WRITES_AUTHORIZATION")]
    ])
  })

  const repository = createSingleCaseRebindPostgresRepository({ pool, ownerId: OWNER_ID, now: () => NOW })

  await assert.rejects(
    () => repository.executeRebind(request),
    /REBIND_LEASE_EXPIRED_DURING_TRANSACTION/
  )

  assert.equal(pool.state.committed, false)
  assert.equal(pool.state.rolledBack, true)

  // Verificar que nenhuma auditoria foi persistida
  assert.equal(pool.state.audits.size, 0)
})

test("owner divergente na revalidaÃ§Ã£o - fail-closed sem mutaÃ§Ã£o", async () => {
  const request = fixture()
  const pool = mockPool({
    leases: new Map([[CASE_IMPORT_ID, createLease({ owner_id: "divergent-owner" })]]),
    checkpoints: new Map([[CASE_IMPORT_ID, createCheckpoint()]]),
    authorizations: new Map([
      [OLD_AUTH_1, createAuthorization(OLD_AUTH_1, "EXPLICIT_APPLY_AUTHORIZATION", {
        consumed_at: NOW,
        consumed_by: `executor:${LEASE_ID}`
      })],
      [OLD_AUTH_2, createAuthorization(OLD_AUTH_2, "EXTERNAL_WRITES_AUTHORIZATION", {
        consumed_at: NOW,
        consumed_by: `executor:${LEASE_ID}`
      })],
      [NEW_AUTH_1, createAuthorization(NEW_AUTH_1, "EXPLICIT_APPLY_AUTHORIZATION")],
      [NEW_AUTH_2, createAuthorization(NEW_AUTH_2, "EXTERNAL_WRITES_AUTHORIZATION")]
    ])
  })

  const repository = createSingleCaseRebindPostgresRepository({ pool, ownerId: OWNER_ID, now: () => NOW })

  await assert.rejects(
    () => repository.executeRebind(request),
    /REBIND_LEASE_OWNER_MISMATCH/
  )

  assert.equal(pool.state.committed, false)
  assert.equal(pool.state.rolledBack, true)

  // Verificar que nenhuma mutaÃ§Ã£o foi persistida
  assert.equal(pool.state.audits.size, 0)

  // Verificar que novo par nÃ£o foi consumido
  const newAuth1 = pool.state.authorizations.get(NEW_AUTH_1)
  const newAuth2 = pool.state.authorizations.get(NEW_AUTH_2)
  assert.equal(newAuth1.consumed_at, null)
  assert.equal(newAuth2.consumed_at, null)
})

test("checkpoint mutado com schema invÃ¡lido falha antes do UPDATE", async () => {
  const request = fixture()

  // Checkpoint com estrutura invÃ¡lida que farÃ¡ validateCheckpoint falhar
  const invalidCheckpointPayload = {
    schemaVersion: 2,
    caseImportId: CASE_IMPORT_ID,
    // Faltam campos obrigatÃ³rios
    authorizationIds: [OLD_AUTH_1, OLD_AUTH_2],
    version: 5
  }

  const pool = mockPool({
    leases: new Map([[CASE_IMPORT_ID, createLease()]]),
    checkpoints: new Map([[CASE_IMPORT_ID, createCheckpoint({ checkpoint_payload: invalidCheckpointPayload })]]),
    authorizations: new Map([
      [OLD_AUTH_1, createAuthorization(OLD_AUTH_1, "EXPLICIT_APPLY_AUTHORIZATION", {
        consumed_at: NOW,
        consumed_by: `executor:${LEASE_ID}`
      })],
      [OLD_AUTH_2, createAuthorization(OLD_AUTH_2, "EXTERNAL_WRITES_AUTHORIZATION", {
        consumed_at: NOW,
        consumed_by: `executor:${LEASE_ID}`
      })],
      [NEW_AUTH_1, createAuthorization(NEW_AUTH_1, "EXPLICIT_APPLY_AUTHORIZATION")],
      [NEW_AUTH_2, createAuthorization(NEW_AUTH_2, "EXTERNAL_WRITES_AUTHORIZATION")]
    ])
  })

  const repository = createSingleCaseRebindPostgresRepository({ pool, ownerId: OWNER_ID, now: () => NOW })

  await assert.rejects(
    () => repository.executeRebind(request),
    /CHECKPOINT|REBIND|POSTGRES_TRANSACTION_FAILED/
  )

  assert.equal(pool.state.committed, false)
  assert.equal(pool.state.rolledBack, true)

  // Verificar que novo par nÃ£o permanece consumido
  const newAuth1 = pool.state.authorizations.get(NEW_AUTH_1)
  const newAuth2 = pool.state.authorizations.get(NEW_AUTH_2)
  assert.equal(newAuth1.consumed_at, null)
  assert.equal(newAuth2.consumed_at, null)

  // Verificar que auditoria nÃ£o persiste
  assert.equal(pool.state.audits.size, 0)
})

test("checkpoint final vÃ¡lido passa no contrato estrito", async () => {
  const request = fixture()
  const pool = mockPool({
    leases: new Map([[CASE_IMPORT_ID, createLease()]]),
    checkpoints: new Map([[CASE_IMPORT_ID, createCheckpoint()]]),
    authorizations: new Map([
      [OLD_AUTH_1, createAuthorization(OLD_AUTH_1, "EXPLICIT_APPLY_AUTHORIZATION", {
        consumed_at: NOW,
        consumed_by: `executor:${LEASE_ID}`
      })],
      [OLD_AUTH_2, createAuthorization(OLD_AUTH_2, "EXTERNAL_WRITES_AUTHORIZATION", {
        consumed_at: NOW,
        consumed_by: `executor:${LEASE_ID}`
      })],
      [NEW_AUTH_1, createAuthorization(NEW_AUTH_1, "EXPLICIT_APPLY_AUTHORIZATION")],
      [NEW_AUTH_2, createAuthorization(NEW_AUTH_2, "EXTERNAL_WRITES_AUTHORIZATION")]
    ])
  })

  const repository = createSingleCaseRebindPostgresRepository({ pool, ownerId: OWNER_ID, now: () => NOW })
  await repository.executeRebind(request)

  // Verificar que checkpoint final tem estrutura vÃ¡lida
  const finalCheckpoint = pool.state.checkpoints.get(CASE_IMPORT_ID)

  // Somente version e authorizationIds mudaram
  assert.equal(finalCheckpoint.checkpoint_payload.version, 6)
  assert.deepEqual(finalCheckpoint.checkpoint_payload.authorizationIds, [NEW_AUTH_1, NEW_AUTH_2])

  // Todos os demais campos foram preservados
  assert.equal(finalCheckpoint.checkpoint_payload.schemaVersion, 2)
  assert.equal(finalCheckpoint.checkpoint_payload.caseImportId, CASE_IMPORT_ID)
  assert.equal(finalCheckpoint.checkpoint_payload.caseFingerprint, CASE_FINGERPRINT)
  assert.equal(finalCheckpoint.checkpoint_payload.caseNumber, CASE_NUMBER)
  assert.equal(finalCheckpoint.checkpoint_payload.authorizablePlanHash, AUTHORIZABLE_PLAN_HASH)
  assert.equal(finalCheckpoint.checkpoint_payload.status, "failed")
  assert(finalCheckpoint.checkpoint_payload.steps)
  assert(finalCheckpoint.checkpoint_payload.resources)
  assert(finalCheckpoint.checkpoint_payload.uploads)
})

test("SQL de consumo nÃ£o usa parÃ¢metro de aplicaÃ§Ã£o para expires_at", async () => {
  const request = fixture()
  const pool = mockPool({
    leases: new Map([[CASE_IMPORT_ID, createLease()]]),
    checkpoints: new Map([[CASE_IMPORT_ID, createCheckpoint()]]),
    authorizations: new Map([
      [OLD_AUTH_1, createAuthorization(OLD_AUTH_1, "EXPLICIT_APPLY_AUTHORIZATION", {
        consumed_at: NOW,
        consumed_by: `executor:${LEASE_ID}`
      })],
      [OLD_AUTH_2, createAuthorization(OLD_AUTH_2, "EXTERNAL_WRITES_AUTHORIZATION", {
        consumed_at: NOW,
        consumed_by: `executor:${LEASE_ID}`
      })],
      [NEW_AUTH_1, createAuthorization(NEW_AUTH_1, "EXPLICIT_APPLY_AUTHORIZATION")],
      [NEW_AUTH_2, createAuthorization(NEW_AUTH_2, "EXTERNAL_WRITES_AUTHORIZATION")]
    ])
  })

  const repository = createSingleCaseRebindPostgresRepository({ pool, ownerId: OWNER_ID, now: () => NOW })
  await repository.executeRebind(request)

  // Verificar que o SQL de consumo usa CURRENT_TIMESTAMP
  const consumeQuery = pool.state.queries.find(q =>
    q.text.includes("UPDATE single_case_apply_authorizations") &&
    q.text.includes("consumed_at = CURRENT_TIMESTAMP")
  )

  assert(consumeQuery, "Query de consumo nÃ£o encontrada")
  assert(consumeQuery.text.includes("SET consumed_at = CURRENT_TIMESTAMP"), "Deve usar CURRENT_TIMESTAMP para consumed_at")
  assert(consumeQuery.text.includes("expires_at > CURRENT_TIMESTAMP"), "Deve usar CURRENT_TIMESTAMP para validaÃ§Ã£o de expiraÃ§Ã£o")

  // Garantir que NÃƒO usa parÃ¢metro de aplicaÃ§Ã£o para expires_at
  const expiresAtParamMatch = consumeQuery.text.match(/expires_at\s*>\s*\$\d+(?:::timestamptz)?/)
  assert(!expiresAtParamMatch, "NÃ£o deve usar parÃ¢metro de aplicaÃ§Ã£o ($n::timestamptz) para expires_at")
})

test("erro desconhecido vira POSTGRES_TRANSACTION_FAILED sem IDs ou SQL", async () => {
  const request = fixture()
  const pool = {
    async connect() {
      return {
        async query(sql) {
          const text = String(sql).replace(/\s+/g, " ").trim()
          if (text === "BEGIN") return { rows: [], rowCount: 0 }
          if (text === "ROLLBACK") return { rows: [], rowCount: 0 }

          // Simular erro desconhecido do PostgreSQL na primeira query real
          if (text.includes("pg_advisory_xact_lock")) {
            const pgError = new Error("syntax error at or near \"FOOBAR\"")
            pgError.code = "42601"
            throw pgError
          }

          return { rows: [], rowCount: 0 }
        },
        async release() {}
      }
    },
    async query() { return { rows: [], rowCount: 0 } }
  }

  const repository = createSingleCaseRebindPostgresRepository({ pool, ownerId: OWNER_ID, now: () => NOW })

  try {
    await repository.executeRebind(request)
    assert.fail("Deveria ter lanÃ§ado erro")
  } catch (error) {
    // Erro desconhecido deve ser mapeado para POSTGRES_TRANSACTION_FAILED
    assert.equal(error.message, "POSTGRES_TRANSACTION_FAILED")

    // NÃ£o deve conter SQL original
    assert(!error.message.includes("syntax"))
    assert(!error.message.includes("FOOBAR"))
    assert(!error.message.includes("42601"))
  }
})





// Novos testes de diagnÃ³stico transacional

test("revalidaÃ§Ã£o usa is_current computado pelo PostgreSQL", async () => {
  const request = fixture()
  const pool = mockPool({
    leases: new Map([[CASE_IMPORT_ID, createLease({ expires_at: "2026-07-17T11:00:00.000Z" })]]),
    checkpoints: new Map([[CASE_IMPORT_ID, createCheckpoint()]]),
    authorizations: new Map([
      [OLD_AUTH_1, createAuthorization(OLD_AUTH_1, "EXPLICIT_APPLY_AUTHORIZATION", {
        consumed_at: NOW,
        consumed_by: `executor:${LEASE_ID}`
      })],
      [OLD_AUTH_2, createAuthorization(OLD_AUTH_2, "EXTERNAL_WRITES_AUTHORIZATION", {
        consumed_at: NOW,
        consumed_by: `executor:${LEASE_ID}`
      })],
      [NEW_AUTH_1, createAuthorization(NEW_AUTH_1, "EXPLICIT_APPLY_AUTHORIZATION")],
      [NEW_AUTH_2, createAuthorization(NEW_AUTH_2, "EXTERNAL_WRITES_AUTHORIZATION")]
    ])
  })

  const repository = createSingleCaseRebindPostgresRepository({ pool, ownerId: OWNER_ID, now: () => NOW })

  await assert.rejects(
    () => repository.executeRebind(request),
    /REBIND_LEASE_EXPIRED_DURING_TRANSACTION/
  )

  // Verificar que a revalidaÃ§Ã£o usa is_current
  const recheckQuery = pool.state.queries.find(q =>
    q.text.includes("expires_at > CURRENT_TIMESTAMP AS is_current")
  )
  assert(recheckQuery, "RevalidaÃ§Ã£o deve usar is_current computado pelo PostgreSQL")
})

test("decision sintÃ©tica nÃ£o aparece no checkpoint persistido", async () => {
  const request = fixture()
  const pool = mockPool({
    leases: new Map([[CASE_IMPORT_ID, createLease()]]),
    checkpoints: new Map([[CASE_IMPORT_ID, createCheckpoint()]]),
    authorizations: new Map([
      [OLD_AUTH_1, createAuthorization(OLD_AUTH_1, "EXPLICIT_APPLY_AUTHORIZATION", {
        consumed_at: NOW,
        consumed_by: `executor:${LEASE_ID}`
      })],
      [OLD_AUTH_2, createAuthorization(OLD_AUTH_2, "EXTERNAL_WRITES_AUTHORIZATION", {
        consumed_at: NOW,
        consumed_by: `executor:${LEASE_ID}`
      })],
      [NEW_AUTH_1, createAuthorization(NEW_AUTH_1, "EXPLICIT_APPLY_AUTHORIZATION")],
      [NEW_AUTH_2, createAuthorization(NEW_AUTH_2, "EXTERNAL_WRITES_AUTHORIZATION")]
    ])
  })

  const repository = createSingleCaseRebindPostgresRepository({ pool, ownerId: OWNER_ID, now: () => NOW })
  await repository.executeRebind(request)

  const finalCheckpoint = pool.state.checkpoints.get(CASE_IMPORT_ID)
  const payload = finalCheckpoint.checkpoint_payload

  // Decision sintÃ©tica nÃ£o deve aparecer no checkpoint
  assert.equal(payload.scopes, undefined)
  assert.equal(payload.authorizationExpiresAt, undefined)
  assert.equal(payload.validatedAt, undefined)
  assert.equal(payload.safeToApply, undefined)
  assert.equal(payload.blockers, undefined)

  // Somente version e authorizationIds devem ter mudado
  assert.equal(payload.version, 6)
  assert.deepEqual(payload.authorizationIds, [NEW_AUTH_1, NEW_AUTH_2])
})

test("consumo com fencing divergente emite REBIND_LEASE_FENCING_MISMATCH", async () => {
  const request = fixture()

  // Criar pool onde consumo retornarÃ¡ rowCount 0 (fencing nÃ£o bate)
  const pool = {
    state: {
      queries: [],
      committed: false,
      rolledBack: false
    },
    async connect() {
      const state = pool.state
      return {
        async query(sql, params) {
          const text = String(sql).replace(/\s+/g, " ").trim()
          state.queries.push({ text, params: params ? [...params] : [] })

          if (text === "BEGIN") return { rows: [], rowCount: 0 }
          if (text === "ROLLBACK") { state.rolledBack = true; return { rows: [], rowCount: 0 } }
          if (text.includes("pg_advisory_xact_lock")) return { rows: [], rowCount: 0 }

          // Lease FOR UPDATE - vÃ¡lido
          if (text.includes("FROM single_case_apply_leases") && text.includes("FOR UPDATE")) {
            return { rows: [createLease()], rowCount: 1 }
          }

          // Checkpoint FOR UPDATE
          if (text.includes("FROM single_case_apply_checkpoints") && text.includes("FOR UPDATE")) {
            return { rows: [createCheckpoint()], rowCount: 1 }
          }

          // Audit SELECT
          if (text.includes("FROM single_case_apply_rebind_audit")) {
            return { rows: [], rowCount: 0 }
          }

          // Authorizations FOR UPDATE
          if (text.includes("FROM single_case_apply_authorizations") && text.includes("FOR UPDATE")) {
            return { rows: [
              createAuthorization(OLD_AUTH_1, "EXPLICIT_APPLY_AUTHORIZATION", { consumed_at: NOW, consumed_by: `executor:${LEASE_ID}` }),
              createAuthorization(OLD_AUTH_2, "EXTERNAL_WRITES_AUTHORIZATION", { consumed_at: NOW, consumed_by: `executor:${LEASE_ID}` }),
              createAuthorization(NEW_AUTH_1, "EXPLICIT_APPLY_AUTHORIZATION"),
              createAuthorization(NEW_AUTH_2, "EXTERNAL_WRITES_AUTHORIZATION")
            ], rowCount: 4 }
          }

          // UPDATE consume - retorna 0 (fencing nÃ£o bate no EXISTS)
          if (text.includes("UPDATE single_case_apply_authorizations") && text.includes("consumed_at")) {
            return { rows: [], rowCount: 0 }
          }

          // RevalidaÃ§Ã£o com fencing divergente
          if (text.includes("expires_at > CURRENT_TIMESTAMP AS is_current")) {
            return { rows: [{
              owner_id: OWNER_ID,
              fencing_token: 999, // Fencing divergente
              released_at: null,
              expires_at: "2026-07-17T13:00:00.000Z",
              is_current: true
            }], rowCount: 1 }
          }

          return { rows: [], rowCount: 0 }
        },
        async release() {}
      }
    },
    async query() { return { rows: [], rowCount: 0 } }
  }

  const repository = createSingleCaseRebindPostgresRepository({ pool, ownerId: OWNER_ID, now: () => NOW })

  await assert.rejects(
    () => repository.executeRebind(request),
    /REBIND_LEASE_FENCING_MISMATCH/
  )

  assert.equal(pool.state.committed, false)
  assert.equal(pool.state.rolledBack, true)
})

test("CAS com lease vÃ¡lido mas rowCount 0 emite REBIND_CHECKPOINT_UPDATE_FAILED", async () => {
  const request = fixture()

  // Criar pool onde CAS falharÃ¡ por versÃ£o divergente
  const wrongCheckpoint = createCheckpoint({ checkpoint_version: 999 }) // VersÃ£o divergente

  const pool = mockPool({
    leases: new Map([[CASE_IMPORT_ID, createLease()]]),
    checkpoints: new Map([[CASE_IMPORT_ID, wrongCheckpoint]]),
    authorizations: new Map([
      [OLD_AUTH_1, createAuthorization(OLD_AUTH_1, "EXPLICIT_APPLY_AUTHORIZATION", {
        consumed_at: NOW,
        consumed_by: `executor:${LEASE_ID}`
      })],
      [OLD_AUTH_2, createAuthorization(OLD_AUTH_2, "EXTERNAL_WRITES_AUTHORIZATION", {
        consumed_at: NOW,
        consumed_by: `executor:${LEASE_ID}`
      })],
      [NEW_AUTH_1, createAuthorization(NEW_AUTH_1, "EXPLICIT_APPLY_AUTHORIZATION")],
      [NEW_AUTH_2, createAuthorization(NEW_AUTH_2, "EXTERNAL_WRITES_AUTHORIZATION")]
    ])
  })

  const repository = createSingleCaseRebindPostgresRepository({ pool, ownerId: OWNER_ID, now: () => NOW })

  await assert.rejects(
    () => repository.executeRebind(request),
    /REBIND_CHECKPOINT_UPDATE_FAILED/
  )

  assert.equal(pool.state.committed, false)
  assert.equal(pool.state.rolledBack, true)

  // Verificar que consumo foi revertido
  assert.equal(pool.state.audits.size, 0)
})

test("auditoria com fencing divergente emite REBIND_LEASE_FENCING_MISMATCH", async () => {
  const request = fixture()

  // Criar pool onde auditoria falharÃ¡ e revalidaÃ§Ã£o mostrarÃ¡ fencing divergente
  const pool = {
    state: {
      queries: [],
      committed: false,
      rolledBack: false
    },
    async connect() {
      const state = pool.state
      return {
        async query(sql, params) {
          const text = String(sql).replace(/\s+/g, " ").trim()
          state.queries.push({ text, params: params ? [...params] : [] })

          if (text === "BEGIN") return { rows: [], rowCount: 0 }
          if (text === "ROLLBACK") { state.rolledBack = true; return { rows: [], rowCount: 0 } }
          if (text.includes("pg_advisory_xact_lock")) return { rows: [], rowCount: 0 }

          // Lease FOR UPDATE - vÃ¡lido
          if (text.includes("FROM single_case_apply_leases") && text.includes("FOR UPDATE")) {
            return { rows: [createLease()], rowCount: 1 }
          }

          // Checkpoint FOR UPDATE
          if (text.includes("FROM single_case_apply_checkpoints") && text.includes("FOR UPDATE")) {
            return { rows: [createCheckpoint()], rowCount: 1 }
          }

          // Audit SELECT
          if (text.includes("FROM single_case_apply_rebind_audit") && text.includes("WHERE rebind_id")) {
            return { rows: [], rowCount: 0 }
          }

          // Authorizations FOR UPDATE
          if (text.includes("FROM single_case_apply_authorizations") && text.includes("FOR UPDATE")) {
            return { rows: [
              createAuthorization(OLD_AUTH_1, "EXPLICIT_APPLY_AUTHORIZATION", { consumed_at: NOW, consumed_by: `executor:${LEASE_ID}` }),
              createAuthorization(OLD_AUTH_2, "EXTERNAL_WRITES_AUTHORIZATION", { consumed_at: NOW, consumed_by: `executor:${LEASE_ID}` }),
              createAuthorization(NEW_AUTH_1, "EXPLICIT_APPLY_AUTHORIZATION"),
              createAuthorization(NEW_AUTH_2, "EXTERNAL_WRITES_AUTHORIZATION")
            ], rowCount: 4 }
          }

          // UPDATE consume - sucesso
          if (text.includes("UPDATE single_case_apply_authorizations") && text.includes("consumed_at")) {
            return { rows: [
              { authorization_id: NEW_AUTH_1, consumed_at: NOW, consumed_by: `rebind:${request.rebindId}` },
              { authorization_id: NEW_AUTH_2, consumed_at: NOW, consumed_by: `rebind:${request.rebindId}` }
            ], rowCount: 2 }
          }

          // UPDATE checkpoint - sucesso
          if (text.includes("UPDATE single_case_apply_checkpoints")) {
            return { rows: [{ checkpoint_version: 6 }], rowCount: 1 }
          }

          // INSERT auditoria - falha (fencing nÃ£o bate)
          if (text.includes("INSERT INTO") && text.includes("single_case_apply_rebind_audit")) {
            return { rows: [], rowCount: 0 }
          }

          // RevalidaÃ§Ã£o com fencing divergente
          if (text.includes("expires_at > CURRENT_TIMESTAMP AS is_current")) {
            return { rows: [{
              owner_id: OWNER_ID,
              fencing_token: 999, // Fencing divergente
              released_at: null,
              expires_at: "2026-07-17T13:00:00.000Z",
              is_current: true
            }], rowCount: 1 }
          }

          return { rows: [], rowCount: 0 }
        },
        async release() {}
      }
    },
    async query() { return { rows: [], rowCount: 0 } }
  }

  const repository = createSingleCaseRebindPostgresRepository({ pool, ownerId: OWNER_ID, now: () => NOW })

  await assert.rejects(
    () => repository.executeRebind(request),
    /REBIND_LEASE_FENCING_MISMATCH/
  )

  assert.equal(pool.state.committed, false)
  assert.equal(pool.state.rolledBack, true)
})

// Testes de transição lease antigo → lease novo

test("transição de lease antigo para lease novo preserva par antigo ligado ao lease antigo", async () => {
  const request = fixture()
  const OLD_LEASE_ID = "lease-expired-001"
  const OLD_FENCING = 50
  const NEW_LEASE_ID = "lease-renewed-002"
  const NEW_FENCING = 101

  const pool = mockPool({
    leases: new Map([[CASE_IMPORT_ID, createLease({ lease_id: NEW_LEASE_ID, fencing_token: NEW_FENCING })]]),
    checkpoints: new Map([[CASE_IMPORT_ID, createCheckpoint({ lease_id: OLD_LEASE_ID, fencing_token: OLD_FENCING })]]),
    authorizations: new Map([
      [OLD_AUTH_1, createAuthorization(OLD_AUTH_1, "EXPLICIT_APPLY_AUTHORIZATION", {
        consumed_at: NOW,
        consumed_by: `executor:${OLD_LEASE_ID}`
      })],
      [OLD_AUTH_2, createAuthorization(OLD_AUTH_2, "EXTERNAL_WRITES_AUTHORIZATION", {
        consumed_at: NOW,
        consumed_by: `executor:${OLD_LEASE_ID}`
      })],
      [NEW_AUTH_1, createAuthorization(NEW_AUTH_1, "EXPLICIT_APPLY_AUTHORIZATION")],
      [NEW_AUTH_2, createAuthorization(NEW_AUTH_2, "EXTERNAL_WRITES_AUTHORIZATION")]
    ])
  })

  const repository = createSingleCaseRebindPostgresRepository({ pool, ownerId: OWNER_ID, now: () => NOW })
  const result = await repository.executeRebind(request)

  assert.equal(result.status, "rebound")
  assert.equal(pool.state.committed, true)

  // Verificar que par antigo continua ligado ao lease antigo
  const oldAuth1 = pool.state.authorizations.get(OLD_AUTH_1)
  const oldAuth2 = pool.state.authorizations.get(OLD_AUTH_2)
  assert.equal(oldAuth1.consumed_by, `executor:${OLD_LEASE_ID}`)
  assert.equal(oldAuth2.consumed_by, `executor:${OLD_LEASE_ID}`)

  // Verificar que checkpoint agora aponta para o lease novo
  const checkpoint = pool.state.checkpoints.get(CASE_IMPORT_ID)
  assert.equal(checkpoint.lease_id, NEW_LEASE_ID)
  assert.equal(checkpoint.fencing_token, NEW_FENCING)

  // Verificar que auditoria usa o lease novo
  const audit = Array.from(pool.state.audits.values())[0]
  assert.equal(audit.lease_id, NEW_LEASE_ID)
  assert.equal(audit.fencing_token, NEW_FENCING)

  // Verificar que novo par foi consumido com rebind ID
  const newAuth1 = pool.state.authorizations.get(NEW_AUTH_1)
  const newAuth2 = pool.state.authorizations.get(NEW_AUTH_2)
  assert.equal(newAuth1.consumed_by, `rebind:${request.rebindId}`)
  assert.equal(newAuth2.consumed_by, `rebind:${request.rebindId}`)
})

test("checkpoint já não possui mais o lease antigo esperado → CAS falha", async () => {
  const request = fixture()
  const OLD_LEASE_ID = "lease-expired-001"
  const WRONG_LEASE_ID = "lease-other-003"
  const NEW_LEASE_ID = "lease-renewed-002"

  // Checkpoint aponta para WRONG_LEASE_ID em vez do OLD_LEASE_ID esperado
  const pool = mockPool({
    leases: new Map([[CASE_IMPORT_ID, createLease({ lease_id: NEW_LEASE_ID, fencing_token: 101 })]]),
    checkpoints: new Map([[CASE_IMPORT_ID, createCheckpoint({ lease_id: WRONG_LEASE_ID, fencing_token: 77 })]]),
    authorizations: new Map([
      [OLD_AUTH_1, createAuthorization(OLD_AUTH_1, "EXPLICIT_APPLY_AUTHORIZATION", {
        consumed_at: NOW,
        consumed_by: `executor:${OLD_LEASE_ID}`
      })],
      [OLD_AUTH_2, createAuthorization(OLD_AUTH_2, "EXTERNAL_WRITES_AUTHORIZATION", {
        consumed_at: NOW,
        consumed_by: `executor:${OLD_LEASE_ID}`
      })],
      [NEW_AUTH_1, createAuthorization(NEW_AUTH_1, "EXPLICIT_APPLY_AUTHORIZATION")],
      [NEW_AUTH_2, createAuthorization(NEW_AUTH_2, "EXTERNAL_WRITES_AUTHORIZATION")]
    ])
  })

  const repository = createSingleCaseRebindPostgresRepository({ pool, ownerId: OWNER_ID, now: () => NOW })

  // Deve falhar porque consumed_by aponta para OLD_LEASE_ID mas checkpoint tem WRONG_LEASE_ID
  await assert.rejects(
    () => repository.executeRebind(request),
    /REBIND_OLD_CONSUMED_BY_LEASE_MISMATCH/
  )

  assert.equal(pool.state.committed, false)
  assert.equal(pool.state.rolledBack, true)
})

test("CAS do checkpoint falha quando vínculo antigo foi alterado concorrentemente", async () => {
  const request = fixture()
  const OLD_LEASE_ID = "lease-expired-001"
  const OLD_FENCING = 50
  const NEW_LEASE_ID = "lease-renewed-002"
  const NEW_FENCING = 101
  const CONCURRENT_LEASE = "lease-concorrente-003"
  const CONCURRENT_FENCING = 75

  // Estado inicial carregado pelo repositório
  const initialCheckpoint = createCheckpoint({
    lease_id: OLD_LEASE_ID,
    fencing_token: OLD_FENCING,
    checkpoint_version: 5
  })

  // Mock que simula alteração concorrente no checkpoint antes do UPDATE
  const pool = {
    state: {
      queries: [],
      committed: false,
      rolledBack: false,
      checkpointUpdated: false
    },
    async connect() {
      const state = pool.state
      return {
        async query(sql, params) {
          const text = String(sql).replace(/\s+/g, " ").trim()
          state.queries.push({ text, params: params ? [...params] : [] })

          if (text === "BEGIN") return { rows: [], rowCount: 0 }
          if (text === "ROLLBACK") { state.rolledBack = true; return { rows: [], rowCount: 0 } }
          if (text.includes("pg_advisory_xact_lock")) return { rows: [], rowCount: 0 }

          // Lease FOR UPDATE - lease novo vigente
          if (text.includes("FROM single_case_apply_leases") && text.includes("FOR UPDATE")) {
            return { rows: [createLease({
              lease_id: NEW_LEASE_ID,
              fencing_token: NEW_FENCING,
              owner_id: OWNER_ID,
              released_at: null,
              expires_at: "2026-07-17T13:00:00.000Z"
            })], rowCount: 1 }
          }

          // Checkpoint FOR UPDATE - retorna checkpoint com lease antigo
          if (text.includes("FROM single_case_apply_checkpoints") && text.includes("FOR UPDATE")) {
            return { rows: [initialCheckpoint], rowCount: 1 }
          }

          // Audit SELECT
          if (text.includes("FROM single_case_apply_rebind_audit")) {
            return { rows: [], rowCount: 0 }
          }

          // Authorizations FOR UPDATE
          if (text.includes("FROM single_case_apply_authorizations") && text.includes("FOR UPDATE")) {
            return { rows: [
              createAuthorization(OLD_AUTH_1, "EXPLICIT_APPLY_AUTHORIZATION", {
                consumed_at: NOW,
                consumed_by: `executor:${OLD_LEASE_ID}`
              }),
              createAuthorization(OLD_AUTH_2, "EXTERNAL_WRITES_AUTHORIZATION", {
                consumed_at: NOW,
                consumed_by: `executor:${OLD_LEASE_ID}`
              }),
              createAuthorization(NEW_AUTH_1, "EXPLICIT_APPLY_AUTHORIZATION"),
              createAuthorization(NEW_AUTH_2, "EXTERNAL_WRITES_AUTHORIZATION")
            ], rowCount: 4 }
          }

          // UPDATE consume - sucesso
          if (text.includes("UPDATE single_case_apply_authorizations") && text.includes("consumed_at")) {
            return { rows: [
              { authorization_id: NEW_AUTH_1, consumed_at: NOW, consumed_by: `rebind:${request.rebindId}` },
              { authorization_id: NEW_AUTH_2, consumed_at: NOW, consumed_by: `rebind:${request.rebindId}` }
            ], rowCount: 2 }
          }

          // UPDATE checkpoint - SIMULA ALTERAÇÃO CONCORRENTE
          // O checkpoint foi alterado por outro processo e agora tem CONCURRENT_LEASE
          // O WHERE não encontra mais o vínculo antigo esperado
          if (text.includes("UPDATE single_case_apply_checkpoints")) {
            state.checkpointUpdated = true

            // Verificar que os parâmetros estão corretos
            assert.equal(params[4], NEW_FENCING, "param[4] deve ser fencing novo")
            assert.equal(params[5], NEW_LEASE_ID, "param[5] deve ser lease novo")
            assert.equal(params[7], 5, "param[7] deve ser sourceCheckpointVersion")
            assert.equal(params[8], OLD_LEASE_ID, "param[8] deve ser lease antigo")
            assert.equal(params[9], OLD_FENCING, "param[9] deve ser fencing antigo")

            // O WHERE não encontra mais o checkpoint porque foi alterado concorrentemente
            return { rows: [], rowCount: 0 }
          }

          // Revalidação (diagnoseLeaseMutationFailure)
          if (text.includes("expires_at > CURRENT_TIMESTAMP AS is_current")) {
            return { rows: [{
              owner_id: OWNER_ID,
              fencing_token: NEW_FENCING,
              released_at: null,
              expires_at: "2026-07-17T13:00:00.000Z",
              is_current: true
            }], rowCount: 1 }
          }

          return { rows: [], rowCount: 0 }
        },
        async release() {}
      }
    },
    async query() { return { rows: [], rowCount: 0 } }
  }

  const repository = createSingleCaseRebindPostgresRepository({ pool, ownerId: OWNER_ID, now: () => NOW })

  await assert.rejects(
    () => repository.executeRebind(request),
    /REBIND_CHECKPOINT_UPDATE_FAILED/
  )

  assert.equal(pool.state.checkpointUpdated, true, "UPDATE checkpoint deve ter sido executado")
  assert.equal(pool.state.committed, false)
  assert.equal(pool.state.rolledBack, true)

  // Verificar que nenhuma auditoria foi inserida
  const auditInsert = pool.state.queries.find(q =>
    q.text.includes("INSERT INTO") && q.text.includes("single_case_apply_rebind_audit")
  )
  assert.equal(auditInsert, undefined, "Auditoria não deve ser inserida após falha do CAS")
})

test("novo lease está liberado → falha fechada", async () => {
  const request = fixture()
  const OLD_LEASE_ID = "lease-expired-001"
  const NEW_LEASE_ID = "lease-renewed-002"

  const pool = mockPool({
    leases: new Map([[CASE_IMPORT_ID, createLease({
      lease_id: NEW_LEASE_ID,
      fencing_token: 101,
      released_at: "2026-07-17T12:30:00.000Z"  // Lease liberado
    })]]),
    checkpoints: new Map([[CASE_IMPORT_ID, createCheckpoint({ lease_id: OLD_LEASE_ID, fencing_token: 50 })]]),
    authorizations: new Map([
      [OLD_AUTH_1, createAuthorization(OLD_AUTH_1, "EXPLICIT_APPLY_AUTHORIZATION", {
        consumed_at: NOW,
        consumed_by: `executor:${OLD_LEASE_ID}`
      })],
      [OLD_AUTH_2, createAuthorization(OLD_AUTH_2, "EXTERNAL_WRITES_AUTHORIZATION", {
        consumed_at: NOW,
        consumed_by: `executor:${OLD_LEASE_ID}`
      })],
      [NEW_AUTH_1, createAuthorization(NEW_AUTH_1, "EXPLICIT_APPLY_AUTHORIZATION")],
      [NEW_AUTH_2, createAuthorization(NEW_AUTH_2, "EXTERNAL_WRITES_AUTHORIZATION")]
    ])
  })

  const repository = createSingleCaseRebindPostgresRepository({ pool, ownerId: OWNER_ID, now: () => NOW })

  await assert.rejects(
    () => repository.executeRebind(request),
    /REBIND_LEASE_EXPIRED/
  )

  assert.equal(pool.state.committed, false)
  assert.equal(pool.state.rolledBack, true)
})

test("novo lease está expirado → falha fechada", async () => {
  const request = fixture()
  const OLD_LEASE_ID = "lease-expired-001"
  const NEW_LEASE_ID = "lease-renewed-002"

  const pool = mockPool({
    leases: new Map([[CASE_IMPORT_ID, createLease({
      lease_id: NEW_LEASE_ID,
      fencing_token: 101,
      expires_at: "2026-07-17T11:00:00.000Z"  // Lease expirado
    })]]),
    checkpoints: new Map([[CASE_IMPORT_ID, createCheckpoint({ lease_id: OLD_LEASE_ID, fencing_token: 50 })]]),
    authorizations: new Map([
      [OLD_AUTH_1, createAuthorization(OLD_AUTH_1, "EXPLICIT_APPLY_AUTHORIZATION", {
        consumed_at: NOW,
        consumed_by: `executor:${OLD_LEASE_ID}`
      })],
      [OLD_AUTH_2, createAuthorization(OLD_AUTH_2, "EXTERNAL_WRITES_AUTHORIZATION", {
        consumed_at: NOW,
        consumed_by: `executor:${OLD_LEASE_ID}`
      })],
      [NEW_AUTH_1, createAuthorization(NEW_AUTH_1, "EXPLICIT_APPLY_AUTHORIZATION")],
      [NEW_AUTH_2, createAuthorization(NEW_AUTH_2, "EXTERNAL_WRITES_AUTHORIZATION")]
    ])
  })

  const repository = createSingleCaseRebindPostgresRepository({ pool, ownerId: OWNER_ID, now: () => NOW })

  await assert.rejects(
    () => repository.executeRebind(request),
    /REBIND_LEASE_EXPIRED_DURING_TRANSACTION/
  )

  assert.equal(pool.state.committed, false)
  assert.equal(pool.state.rolledBack, true)
})

test("owner do novo lease diverge → falha", async () => {
  const request = fixture()
  const OLD_LEASE_ID = "lease-expired-001"
  const NEW_LEASE_ID = "lease-renewed-002"

  const pool = mockPool({
    leases: new Map([[CASE_IMPORT_ID, createLease({
      lease_id: NEW_LEASE_ID,
      fencing_token: 101,
      owner_id: "other-owner-002"  // Owner divergente
    })]]),
    checkpoints: new Map([[CASE_IMPORT_ID, createCheckpoint({ lease_id: OLD_LEASE_ID, fencing_token: 50 })]]),
    authorizations: new Map([
      [OLD_AUTH_1, createAuthorization(OLD_AUTH_1, "EXPLICIT_APPLY_AUTHORIZATION", {
        consumed_at: NOW,
        consumed_by: `executor:${OLD_LEASE_ID}`
      })],
      [OLD_AUTH_2, createAuthorization(OLD_AUTH_2, "EXTERNAL_WRITES_AUTHORIZATION", {
        consumed_at: NOW,
        consumed_by: `executor:${OLD_LEASE_ID}`
      })],
      [NEW_AUTH_1, createAuthorization(NEW_AUTH_1, "EXPLICIT_APPLY_AUTHORIZATION")],
      [NEW_AUTH_2, createAuthorization(NEW_AUTH_2, "EXTERNAL_WRITES_AUTHORIZATION")]
    ])
  })

  const repository = createSingleCaseRebindPostgresRepository({ pool, ownerId: OWNER_ID, now: () => NOW })

  await assert.rejects(
    () => repository.executeRebind(request),
    /REBIND_LEASE_OWNER_MISMATCH/
  )

  assert.equal(pool.state.committed, false)
  assert.equal(pool.state.rolledBack, true)
})

test("fencing do novo lease diverge → falha", async () => {
  const request = fixture()
  const OLD_LEASE_ID = "lease-expired-001"
  const NEW_LEASE_ID = "lease-renewed-002"
  const EXPECTED_FENCING = 101
  const ACTUAL_FENCING = 199

  // Lease carregado no começo tem fencing 101
  // Mas durante execução o fencing mudou para 199
  const pool = {
    state: {
      queries: [],
      committed: false,
      rolledBack: false
    },
    async connect() {
      const state = pool.state
      return {
        async query(sql, params) {
          const text = String(sql).replace(/\s+/g, " ").trim()
          state.queries.push({ text, params: params ? [...params] : [] })

          if (text === "BEGIN") return { rows: [], rowCount: 0 }
          if (text === "ROLLBACK") { state.rolledBack = true; return { rows: [], rowCount: 0 } }
          if (text.includes("pg_advisory_xact_lock")) return { rows: [], rowCount: 0 }

          // Lease FOR UPDATE - retorna fencing original
          if (text.includes("FROM single_case_apply_leases") && text.includes("FOR UPDATE")) {
            return { rows: [createLease({ lease_id: NEW_LEASE_ID, fencing_token: EXPECTED_FENCING })], rowCount: 1 }
          }

          // Checkpoint FOR UPDATE - lease antigo
          if (text.includes("FROM single_case_apply_checkpoints") && text.includes("FOR UPDATE")) {
            return { rows: [createCheckpoint({ lease_id: OLD_LEASE_ID, fencing_token: 50 })], rowCount: 1 }
          }

          // Audit SELECT
          if (text.includes("FROM single_case_apply_rebind_audit")) {
            return { rows: [], rowCount: 0 }
          }

          // Authorizations FOR UPDATE
          if (text.includes("FROM single_case_apply_authorizations") && text.includes("FOR UPDATE")) {
            return { rows: [
              createAuthorization(OLD_AUTH_1, "EXPLICIT_APPLY_AUTHORIZATION", { consumed_at: NOW, consumed_by: `executor:${OLD_LEASE_ID}` }),
              createAuthorization(OLD_AUTH_2, "EXTERNAL_WRITES_AUTHORIZATION", { consumed_at: NOW, consumed_by: `executor:${OLD_LEASE_ID}` }),
              createAuthorization(NEW_AUTH_1, "EXPLICIT_APPLY_AUTHORIZATION"),
              createAuthorization(NEW_AUTH_2, "EXTERNAL_WRITES_AUTHORIZATION")
            ], rowCount: 4 }
          }

          // UPDATE consume - FALHA (fencing divergente no EXISTS)
          if (text.includes("UPDATE single_case_apply_authorizations") && text.includes("consumed_at")) {
            return { rows: [], rowCount: 0 }
          }

          // Revalidação - fencing mudou
          if (text.includes("expires_at > CURRENT_TIMESTAMP AS is_current")) {
            return { rows: [{
              owner_id: OWNER_ID,
              fencing_token: ACTUAL_FENCING,  // Fencing divergente
              released_at: null,
              expires_at: "2026-07-17T13:00:00.000Z",
              is_current: true
            }], rowCount: 1 }
          }

          return { rows: [], rowCount: 0 }
        },
        async release() {}
      }
    },
    async query() { return { rows: [], rowCount: 0 } }
  }

  const repository = createSingleCaseRebindPostgresRepository({ pool, ownerId: OWNER_ID, now: () => NOW })

  await assert.rejects(
    () => repository.executeRebind(request),
    /REBIND_LEASE_FENCING_MISMATCH/
  )

  assert.equal(pool.state.committed, false)
  assert.equal(pool.state.rolledBack, true)
})

test("o par antigo foi consumido por lease diferente do lease antigo do checkpoint → continua falhando", async () => {
  const request = fixture()
  const OLD_CHECKPOINT_LEASE = "lease-checkpoint-001"
  const DIFFERENT_LEASE = "lease-divergent-002"
  const NEW_LEASE = "lease-renewed-003"

  const pool = mockPool({
    leases: new Map([[CASE_IMPORT_ID, createLease({ lease_id: NEW_LEASE, fencing_token: 101 })]]),
    checkpoints: new Map([[CASE_IMPORT_ID, createCheckpoint({ lease_id: OLD_CHECKPOINT_LEASE, fencing_token: 50 })]]),
    authorizations: new Map([
      // Par antigo consumido por lease diferente
      [OLD_AUTH_1, createAuthorization(OLD_AUTH_1, "EXPLICIT_APPLY_AUTHORIZATION", {
        consumed_at: NOW,
        consumed_by: `executor:${DIFFERENT_LEASE}`
      })],
      [OLD_AUTH_2, createAuthorization(OLD_AUTH_2, "EXTERNAL_WRITES_AUTHORIZATION", {
        consumed_at: NOW,
        consumed_by: `executor:${DIFFERENT_LEASE}`
      })],
      [NEW_AUTH_1, createAuthorization(NEW_AUTH_1, "EXPLICIT_APPLY_AUTHORIZATION")],
      [NEW_AUTH_2, createAuthorization(NEW_AUTH_2, "EXTERNAL_WRITES_AUTHORIZATION")]
    ])
  })

  const repository = createSingleCaseRebindPostgresRepository({ pool, ownerId: OWNER_ID, now: () => NOW })

  await assert.rejects(
    () => repository.executeRebind(request),
    /REBIND_OLD_CONSUMED_BY_LEASE_MISMATCH/
  )

  assert.equal(pool.state.committed, false)
  assert.equal(pool.state.rolledBack, true)
})

test("UPDATE checkpoint valida lease novo no EXISTS e lease antigo no WHERE", async () => {
  const request = fixture()
  const OLD_LEASE_ID = "lease-expired-001"
  const NEW_LEASE_ID = "lease-renewed-002"

  const pool = mockPool({
    leases: new Map([[CASE_IMPORT_ID, createLease({ lease_id: NEW_LEASE_ID, fencing_token: 101 })]]),
    checkpoints: new Map([[CASE_IMPORT_ID, createCheckpoint({ lease_id: OLD_LEASE_ID, fencing_token: 50 })]]),
    authorizations: new Map([
      [OLD_AUTH_1, createAuthorization(OLD_AUTH_1, "EXPLICIT_APPLY_AUTHORIZATION", {
        consumed_at: NOW,
        consumed_by: `executor:${OLD_LEASE_ID}`
      })],
      [OLD_AUTH_2, createAuthorization(OLD_AUTH_2, "EXTERNAL_WRITES_AUTHORIZATION", {
        consumed_at: NOW,
        consumed_by: `executor:${OLD_LEASE_ID}`
      })],
      [NEW_AUTH_1, createAuthorization(NEW_AUTH_1, "EXPLICIT_APPLY_AUTHORIZATION")],
      [NEW_AUTH_2, createAuthorization(NEW_AUTH_2, "EXTERNAL_WRITES_AUTHORIZATION")]
    ])
  })

  const repository = createSingleCaseRebindPostgresRepository({ pool, ownerId: OWNER_ID, now: () => NOW })
  await repository.executeRebind(request)

  // Verificar que UPDATE checkpoint foi chamado
  const updateQuery = pool.state.queries.find(q => q.text.includes("UPDATE single_case_apply_checkpoints"))
  assert(updateQuery, "UPDATE checkpoint não encontrado")

  // Verificar parâmetros:
  // params[4] = lease.fencing_token (101) → usado no SET e no EXISTS
  // params[5] = lease.lease_id (NEW_LEASE_ID) → usado no SET e no EXISTS
  // params[7] = request.sourceCheckpointVersion (5)
  // params[8] = checkpointRow.lease_id (OLD_LEASE_ID) → usado no WHERE
  // params[9] = checkpointRow.fencing_token (50) → usado no WHERE

  assert.equal(updateQuery.params[4], 101)
  assert.equal(updateQuery.params[5], NEW_LEASE_ID)
  assert.equal(updateQuery.params[7], 5)
  assert.equal(updateQuery.params[8], OLD_LEASE_ID)
  assert.equal(updateQuery.params[9], 50)

  assert.equal(pool.state.committed, true)
})

test("dois objetos Date distintos com mesmo instante não causam REBIND_CONSUME_TIMESTAMP_DIVERGENT", async () => {
  const request = fixture()

  // Mock que retorna objetos Date distintos (não idênticos por referência)
  // mas representando o mesmo instante
  const pool = {
    state: {
      queries: [],
      committed: false,
      rolledBack: false
    },
    async connect() {
      const state = pool.state
      return {
        async query(sql, params) {
          const text = String(sql).replace(/\s+/g, " ").trim()
          state.queries.push({ text, params: params ? [...params] : [] })

          if (text === "BEGIN") return { rows: [], rowCount: 0 }
          if (text === "COMMIT") { state.committed = true; return { rows: [], rowCount: 0 } }
          if (text === "ROLLBACK") { state.rolledBack = true; return { rows: [], rowCount: 0 } }
          if (text.includes("pg_advisory_xact_lock")) return { rows: [], rowCount: 0 }

          // Lease FOR UPDATE
          if (text.includes("FROM single_case_apply_leases") && text.includes("FOR UPDATE")) {
            return { rows: [createLease()], rowCount: 1 }
          }

          // Checkpoint FOR UPDATE
          if (text.includes("FROM single_case_apply_checkpoints") && text.includes("FOR UPDATE")) {
            return { rows: [createCheckpoint()], rowCount: 1 }
          }

          // Audit SELECT
          if (text.includes("FROM single_case_apply_rebind_audit")) {
            return { rows: [], rowCount: 0 }
          }

          // Authorizations FOR UPDATE
          if (text.includes("FROM single_case_apply_authorizations") && text.includes("FOR UPDATE")) {
            return { rows: [
              createAuthorization(OLD_AUTH_1, "EXPLICIT_APPLY_AUTHORIZATION", { consumed_at: NOW, consumed_by: `executor:${LEASE_ID}` }),
              createAuthorization(OLD_AUTH_2, "EXTERNAL_WRITES_AUTHORIZATION", { consumed_at: NOW, consumed_by: `executor:${LEASE_ID}` }),
              createAuthorization(NEW_AUTH_1, "EXPLICIT_APPLY_AUTHORIZATION"),
              createAuthorization(NEW_AUTH_2, "EXTERNAL_WRITES_AUTHORIZATION")
            ], rowCount: 4 }
          }

          // UPDATE consume - RETORNA OBJETOS DATE DISTINTOS COM MESMO INSTANTE
          if (text.includes("UPDATE single_case_apply_authorizations") && text.includes("consumed_at")) {
            const timestamp1 = new Date(NOW)  // Primeiro objeto Date
            const timestamp2 = new Date(NOW)  // Segundo objeto Date (DISTINTO por referência)

            // Confirmar que são objetos distintos mas com mesmo instante
            assert.notStrictEqual(timestamp1, timestamp2, "Objetos Date devem ser distintos por referência")
            assert.equal(timestamp1.toISOString(), timestamp2.toISOString(), "Instantes devem ser iguais")
            assert.equal(timestamp1.getTime(), timestamp2.getTime(), "Timestamps numéricos devem ser iguais")

            return { rows: [
              { authorization_id: NEW_AUTH_1, consumed_at: timestamp1, consumed_by: `rebind:${request.rebindId}` },
              { authorization_id: NEW_AUTH_2, consumed_at: timestamp2, consumed_by: `rebind:${request.rebindId}` }
            ], rowCount: 2 }
          }

          // UPDATE checkpoint - sucesso
          if (text.includes("UPDATE single_case_apply_checkpoints")) {
            return { rows: [{ checkpoint_version: 6 }], rowCount: 1 }
          }

          // INSERT auditoria - sucesso
          if (text.includes("INSERT INTO") && text.includes("single_case_apply_rebind_audit")) {
            return { rows: [{ rebind_id: request.rebindId }], rowCount: 1 }
          }

          // Revalidação
          if (text.includes("expires_at > CURRENT_TIMESTAMP AS is_current")) {
            return { rows: [{
              owner_id: OWNER_ID,
              fencing_token: 100,
              released_at: null,
              expires_at: "2026-07-17T13:00:00.000Z",
              is_current: true
            }], rowCount: 1 }
          }

          return { rows: [], rowCount: 0 }
        },
        async release() {}
      }
    },
    async query() { return { rows: [], rowCount: 0 } }
  }

  const repository = createSingleCaseRebindPostgresRepository({ pool, ownerId: OWNER_ID, now: () => NOW })
  const result = await repository.executeRebind(request)

  // Deve concluir com sucesso
  assert.equal(result.status, "rebound")
  assert.equal(pool.state.committed, true)
  assert.equal(pool.state.rolledBack, false)

  // Verificar que checkpoint e auditoria foram atualizados
  const checkpointUpdate = pool.state.queries.find(q => q.text.includes("UPDATE single_case_apply_checkpoints"))
  assert(checkpointUpdate, "UPDATE checkpoint deve ter sido executado")

  const auditInsert = pool.state.queries.find(q => q.text.includes("INSERT INTO") && q.text.includes("single_case_apply_rebind_audit"))
  assert(auditInsert, "INSERT auditoria deve ter sido executado")
})

test("consumed_at com instantes realmente divergentes causa REBIND_CONSUME_TIMESTAMP_DIVERGENT", async () => {
  const request = fixture()
  const FIRST_TIMESTAMP = "2026-07-17T12:00:00.000Z"
  const SECOND_TIMESTAMP = "2026-07-17T12:00:01.000Z"  // 1 segundo depois

  const pool = {
    state: {
      queries: [],
      committed: false,
      rolledBack: false
    },
    async connect() {
      const state = pool.state
      return {
        async query(sql, params) {
          const text = String(sql).replace(/\s+/g, " ").trim()
          state.queries.push({ text, params: params ? [...params] : [] })

          if (text === "BEGIN") return { rows: [], rowCount: 0 }
          if (text === "ROLLBACK") { state.rolledBack = true; return { rows: [], rowCount: 0 } }
          if (text.includes("pg_advisory_xact_lock")) return { rows: [], rowCount: 0 }

          // Lease FOR UPDATE
          if (text.includes("FROM single_case_apply_leases") && text.includes("FOR UPDATE")) {
            return { rows: [createLease()], rowCount: 1 }
          }

          // Checkpoint FOR UPDATE
          if (text.includes("FROM single_case_apply_checkpoints") && text.includes("FOR UPDATE")) {
            return { rows: [createCheckpoint()], rowCount: 1 }
          }

          // Audit SELECT
          if (text.includes("FROM single_case_apply_rebind_audit")) {
            return { rows: [], rowCount: 0 }
          }

          // Authorizations FOR UPDATE
          if (text.includes("FROM single_case_apply_authorizations") && text.includes("FOR UPDATE")) {
            return { rows: [
              createAuthorization(OLD_AUTH_1, "EXPLICIT_APPLY_AUTHORIZATION", { consumed_at: NOW, consumed_by: `executor:${LEASE_ID}` }),
              createAuthorization(OLD_AUTH_2, "EXTERNAL_WRITES_AUTHORIZATION", { consumed_at: NOW, consumed_by: `executor:${LEASE_ID}` }),
              createAuthorization(NEW_AUTH_1, "EXPLICIT_APPLY_AUTHORIZATION"),
              createAuthorization(NEW_AUTH_2, "EXTERNAL_WRITES_AUTHORIZATION")
            ], rowCount: 4 }
          }

          // UPDATE consume - RETORNA TIMESTAMPS DIVERGENTES
          if (text.includes("UPDATE single_case_apply_authorizations") && text.includes("consumed_at")) {
            return { rows: [
              { authorization_id: NEW_AUTH_1, consumed_at: new Date(FIRST_TIMESTAMP), consumed_by: `rebind:${request.rebindId}` },
              { authorization_id: NEW_AUTH_2, consumed_at: new Date(SECOND_TIMESTAMP), consumed_by: `rebind:${request.rebindId}` }
            ], rowCount: 2 }
          }

          return { rows: [], rowCount: 0 }
        },
        async release() {}
      }
    },
    async query() { return { rows: [], rowCount: 0 } }
  }

  const repository = createSingleCaseRebindPostgresRepository({ pool, ownerId: OWNER_ID, now: () => NOW })

  await assert.rejects(
    () => repository.executeRebind(request),
    /REBIND_CONSUME_TIMESTAMP_DIVERGENT/
  )

  assert.equal(pool.state.committed, false)
  assert.equal(pool.state.rolledBack, true)
})
