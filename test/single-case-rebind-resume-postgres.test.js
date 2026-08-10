"use strict"

const test = require("node:test")
const assert = require("node:assert/strict")
const crypto = require("node:crypto")
const { authorizationInstant, createSingleCaseRebindResumeVerifier } = require("../src/infrastructure/single-case-rebind-resume-postgres")
const { computeAuthorizationSetHash } = require("../src/domain/single-case-rebind-contracts")
const { AUTH_SCOPES, authorizationPayload, createAuthorizationVerifier } = require("../src/domain/single-case-apply-contracts")

const NOW = "2026-07-19T12:00:00.000Z"
const CASE_IMPORT_ID = "resume-case-001"
const CASE_FINGERPRINT = "abc123def456"
const CASE_NUMBER = "INSS.260719.001"
const AUTHORIZABLE_PLAN_HASH = "a".repeat(64)
const PLAN_HASH = "1".repeat(64)
const MANIFEST_HASH = "2".repeat(64)
const RESERVATION_EVIDENCE_HASH = "3".repeat(64)

const AUTH_1 = "resume-auth-explicit-001"
const AUTH_2 = "resume-auth-external-001"
const REBIND_ID = "b".repeat(64)

function mockPool(state = {}) {
  const defaults = {
    queries: [],
    checkpoints: new Map(),
    audits: new Map(),
    authorizations: new Map()
  }

  const poolState = { ...defaults, ...state }

  return {
    state: poolState,
    async query(sql, params) {
      const text = String(sql).replace(/\s+/g, " ").trim()
      poolState.queries.push({ text, params: params ? [...params] : [] })

      // SELECT checkpoint
      if (text.includes("FROM single_case_apply_checkpoints")) {
        const checkpoint = poolState.checkpoints.get(params[0])
        if (!checkpoint) return { rows: [], rowCount: 0 }
        return { rows: [checkpoint], rowCount: 1 }
      }

      // SELECT audit
      if (text.includes("FROM single_case_apply_rebind_audit")) {
        const audits = Array.from(poolState.audits.values()).filter(a =>
          a.case_import_id === params[0] &&
          Number(a.rebound_checkpoint_version) === params[1] &&
          a.current_authorization_set_hash === params[2]
        )
        return { rows: audits, rowCount: audits.length }
      }

      // SELECT authorizations
      if (text.includes("FROM single_case_apply_authorizations")) {
        const authIds = params[0]
        const rows = authIds.map(id => poolState.authorizations.get(id)).filter(Boolean)
        return { rows, rowCount: rows.length }
      }

      return { rows: [], rowCount: 0 }
    }
  }
}

function createCheckpoint(overrides = {}) {
  return {
    case_import_id: CASE_IMPORT_ID,
    checkpoint_version: 2,
    authorization_ids: [AUTH_1, AUTH_2],
    authorization_consumed_by: `rebind:${REBIND_ID}`,
    checkpoint_payload: JSON.stringify({
      version: 2,
      authorizationIds: [AUTH_1, AUTH_2],
      caseImportId: CASE_IMPORT_ID
    }),
    ...overrides
  }
}

function createAudit(overrides = {}) {
  return {
    rebind_id: REBIND_ID,
    case_import_id: CASE_IMPORT_ID,
    source_checkpoint_version: 1,
    rebound_checkpoint_version: 2,
    authorization_count: 2,
    current_authorization_set_hash: computeAuthorizationSetHash([AUTH_1, AUTH_2]),
    committed_at: NOW,
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
    scope: JSON.stringify([...AUTH_SCOPES[type]]),
    issuer: "fixture-resume-issuer",
    issued_at: "2026-07-19T11:00:00.000Z",
    expires_at: "2026-07-19T13:00:00.000Z",
    revoked: false,
    revoked_at: null,
    revocation_reason: null,
    signature: Buffer.alloc(64, 1).toString("base64"),
    signature_algorithm: "Ed25519",
    consumed_at: NOW,
    consumed_by: `rebind:${REBIND_ID}`,
    operational_status: "ACTIVE",
    ...overrides
  }
}

function createRequest() {
  return {
    caseImportId: CASE_IMPORT_ID,
    checkpoint: {
      version: 2,
      authorizationIds: [AUTH_1, AUTH_2]
    },
    expectedBindings: {
      caseImportId: CASE_IMPORT_ID,
      caseFingerprint: CASE_FINGERPRINT,
      caseNumber: CASE_NUMBER,
      authorizablePlanHash: AUTHORIZABLE_PLAN_HASH,
      planHash: PLAN_HASH,
      manifestHash: MANIFEST_HASH,
      reservationEvidenceHash: RESERVATION_EVIDENCE_HASH,
      schemaVersion: 2
    },
    now: NOW
  }
}

test("prova válida retorna status VALID_REBIND_RESUME", async () => {
  const pool = mockPool({
    checkpoints: new Map([[CASE_IMPORT_ID, createCheckpoint()]]),
    audits: new Map([[REBIND_ID, createAudit()]]),
    authorizations: new Map([
      [AUTH_1, createAuthorization(AUTH_1, "EXPLICIT_APPLY_AUTHORIZATION")],
      [AUTH_2, createAuthorization(AUTH_2, "EXTERNAL_WRITES_AUTHORIZATION")]
    ])
  })

  const verifier = createSingleCaseRebindResumeVerifier({ pool })
  const proof = await verifier.verifyResumeProof(createRequest())

  assert.equal(proof.status, "VALID_REBIND_RESUME")
  assert.equal(proof.rebindId, REBIND_ID)
  assert.equal(proof.caseImportId, CASE_IMPORT_ID)
  assert.equal(proof.sourceCheckpointVersion, 1)
  assert.equal(proof.reboundCheckpointVersion, 2)
  assert.equal(proof.authorizationCount, 2)
  assert.ok(proof.currentAuthorizationSetHash)
  assert.equal(proof.committedAt, NOW)
  assert.equal(proof.authorizationRecords.length, 2)
  assert.ok(Object.isFrozen(proof))
  assert.ok(Object.isFrozen(proof.authorizationRecords))

  // Validar campos completos dos records
  const record1 = proof.authorizationRecords.find(r => r.type === "EXPLICIT_APPLY_AUTHORIZATION")
  const record2 = proof.authorizationRecords.find(r => r.type === "EXTERNAL_WRITES_AUTHORIZATION")

  assert.ok(record1, "Record EXPLICIT_APPLY_AUTHORIZATION deve existir")
  assert.ok(record2, "Record EXTERNAL_WRITES_AUTHORIZATION deve existir")

  // Validar record1
  assert.equal(record1.type, "EXPLICIT_APPLY_AUTHORIZATION")
  assert.deepEqual(record1.scope, [...AUTH_SCOPES["EXPLICIT_APPLY_AUTHORIZATION"]])
  assert.equal(record1.issuer, "fixture-resume-issuer")
  assert.equal(record1.algorithm, "Ed25519")
  assert.equal(typeof record1.proof, "string")
  assert.equal(record1.issuedAt, "2026-07-19T11:00:00.000Z")
  assert.equal(record1.expiresAt, "2026-07-19T13:00:00.000Z")
  assert.ok(Object.isFrozen(record1.scope))

  // Validar record2
  assert.equal(record2.type, "EXTERNAL_WRITES_AUTHORIZATION")
  assert.deepEqual(record2.scope, [...AUTH_SCOPES["EXTERNAL_WRITES_AUTHORIZATION"]])
  assert.equal(record2.issuer, "fixture-resume-issuer")
  assert.equal(record2.algorithm, "Ed25519")
  assert.equal(typeof record2.proof, "string")
  assert.equal(record2.issuedAt, "2026-07-19T11:00:00.000Z")
  assert.equal(record2.expiresAt, "2026-07-19T13:00:00.000Z")
  assert.ok(Object.isFrozen(record2.scope))
})

test("nenhuma escrita SQL executada", async () => {
  const pool = mockPool({
    checkpoints: new Map([[CASE_IMPORT_ID, createCheckpoint()]]),
    audits: new Map([[REBIND_ID, createAudit()]]),
    authorizations: new Map([
      [AUTH_1, createAuthorization(AUTH_1, "EXPLICIT_APPLY_AUTHORIZATION")],
      [AUTH_2, createAuthorization(AUTH_2, "EXTERNAL_WRITES_AUTHORIZATION")]
    ])
  })

  const verifier = createSingleCaseRebindResumeVerifier({ pool })
  await verifier.verifyResumeProof(createRequest())

  // Verificar que nenhuma query de escrita foi executada
  for (const query of pool.state.queries) {
    assert(!query.text.includes("INSERT"), "Não deve conter INSERT")
    assert(!query.text.includes("UPDATE"), "Não deve conter UPDATE")
    assert(!query.text.includes("DELETE"), "Não deve conter DELETE")
    assert(!query.text.includes("FOR UPDATE"), "Não deve conter FOR UPDATE")
  }
})

test("checkpoint ausente falha", async () => {
  const pool = mockPool({
    checkpoints: new Map(),
    audits: new Map([[REBIND_ID, createAudit()]]),
    authorizations: new Map([
      [AUTH_1, createAuthorization(AUTH_1, "EXPLICIT_APPLY_AUTHORIZATION")],
      [AUTH_2, createAuthorization(AUTH_2, "EXTERNAL_WRITES_AUTHORIZATION")]
    ])
  })

  const verifier = createSingleCaseRebindResumeVerifier({ pool })
  await assert.rejects(
    () => verifier.verifyResumeProof(createRequest()),
    /REBIND_RESUME_CHECKPOINT_NOT_FOUND/
  )
})

test("versão divergente falha", async () => {
  const pool = mockPool({
    checkpoints: new Map([[CASE_IMPORT_ID, createCheckpoint({ checkpoint_version: 3 })]]),
    audits: new Map([[REBIND_ID, createAudit()]]),
    authorizations: new Map([
      [AUTH_1, createAuthorization(AUTH_1, "EXPLICIT_APPLY_AUTHORIZATION")],
      [AUTH_2, createAuthorization(AUTH_2, "EXTERNAL_WRITES_AUTHORIZATION")]
    ])
  })

  const verifier = createSingleCaseRebindResumeVerifier({ pool })
  await assert.rejects(
    () => verifier.verifyResumeProof(createRequest()),
    /REBIND_RESUME_CHECKPOINT_DIVERGENT/
  )
})

test("IDs divergentes entre linha e payload falha", async () => {
  const wrongPayload = {
    version: 2,
    authorizationIds: ["wrong-id-1", "wrong-id-2"],
    caseImportId: CASE_IMPORT_ID
  }

  const pool = mockPool({
    checkpoints: new Map([[CASE_IMPORT_ID, createCheckpoint({
      checkpoint_payload: JSON.stringify(wrongPayload)
    })]]),
    audits: new Map([[REBIND_ID, createAudit()]]),
    authorizations: new Map([
      [AUTH_1, createAuthorization(AUTH_1, "EXPLICIT_APPLY_AUTHORIZATION")],
      [AUTH_2, createAuthorization(AUTH_2, "EXTERNAL_WRITES_AUTHORIZATION")]
    ])
  })

  const verifier = createSingleCaseRebindResumeVerifier({ pool })
  await assert.rejects(
    () => verifier.verifyResumeProof(createRequest()),
    /REBIND_RESUME_CHECKPOINT_DIVERGENT/
  )
})

test("hash divergente falha na auditoria", async () => {
  const pool = mockPool({
    checkpoints: new Map([[CASE_IMPORT_ID, createCheckpoint()]]),
    audits: new Map(),
    authorizations: new Map([
      [AUTH_1, createAuthorization(AUTH_1, "EXPLICIT_APPLY_AUTHORIZATION")],
      [AUTH_2, createAuthorization(AUTH_2, "EXTERNAL_WRITES_AUTHORIZATION")]
    ])
  })

  const verifier = createSingleCaseRebindResumeVerifier({ pool })
  await assert.rejects(
    () => verifier.verifyResumeProof(createRequest()),
    /REBIND_RESUME_AUDIT_NOT_FOUND/
  )
})

test("auditoria ausente falha", async () => {
  const pool = mockPool({
    checkpoints: new Map([[CASE_IMPORT_ID, createCheckpoint()]]),
    audits: new Map(),
    authorizations: new Map([
      [AUTH_1, createAuthorization(AUTH_1, "EXPLICIT_APPLY_AUTHORIZATION")],
      [AUTH_2, createAuthorization(AUTH_2, "EXTERNAL_WRITES_AUTHORIZATION")]
    ])
  })

  const verifier = createSingleCaseRebindResumeVerifier({ pool })
  await assert.rejects(
    () => verifier.verifyResumeProof(createRequest()),
    /REBIND_RESUME_AUDIT_NOT_FOUND/
  )
})

test("auditoria duplicada falha", async () => {
  const audit1 = createAudit()
  const audit2 = createAudit({ rebind_id: "s".repeat(64) })

  const pool = mockPool({
    checkpoints: new Map([[CASE_IMPORT_ID, createCheckpoint()]]),
    audits: new Map([[REBIND_ID, audit1], ["s".repeat(64), audit2]]),
    authorizations: new Map([
      [AUTH_1, createAuthorization(AUTH_1, "EXPLICIT_APPLY_AUTHORIZATION")],
      [AUTH_2, createAuthorization(AUTH_2, "EXTERNAL_WRITES_AUTHORIZATION")]
    ])
  })

  const verifier = createSingleCaseRebindResumeVerifier({ pool })
  await assert.rejects(
    () => verifier.verifyResumeProof(createRequest()),
    /REBIND_RESUME_AUDIT_AMBIGUOUS/
  )
})

test("versão rebound divergente falha", async () => {
  const pool = mockPool({
    checkpoints: new Map([[CASE_IMPORT_ID, createCheckpoint()]]),
    audits: new Map([[REBIND_ID, createAudit({ rebound_checkpoint_version: 999 })]]),
    authorizations: new Map([
      [AUTH_1, createAuthorization(AUTH_1, "EXPLICIT_APPLY_AUTHORIZATION")],
      [AUTH_2, createAuthorization(AUTH_2, "EXTERNAL_WRITES_AUTHORIZATION")]
    ])
  })

  const verifier = createSingleCaseRebindResumeVerifier({ pool })
  await assert.rejects(
    () => verifier.verifyResumeProof(createRequest()),
    /REBIND_RESUME_AUDIT_NOT_FOUND/
  )
})

test("authorization_count diferente de 2 falha", async () => {
  const pool = mockPool({
    checkpoints: new Map([[CASE_IMPORT_ID, createCheckpoint()]]),
    audits: new Map([[REBIND_ID, createAudit({ authorization_count: 3 })]]),
    authorizations: new Map([
      [AUTH_1, createAuthorization(AUTH_1, "EXPLICIT_APPLY_AUTHORIZATION")],
      [AUTH_2, createAuthorization(AUTH_2, "EXTERNAL_WRITES_AUTHORIZATION")]
    ])
  })

  const verifier = createSingleCaseRebindResumeVerifier({ pool })
  await assert.rejects(
    () => verifier.verifyResumeProof(createRequest()),
    /REBIND_RESUME_AUDIT_DIVERGENT/
  )
})

test("autorização ausente falha", async () => {
  const pool = mockPool({
    checkpoints: new Map([[CASE_IMPORT_ID, createCheckpoint()]]),
    audits: new Map([[REBIND_ID, createAudit()]]),
    authorizations: new Map([
      [AUTH_1, createAuthorization(AUTH_1, "EXPLICIT_APPLY_AUTHORIZATION")]
    ])
  })

  const verifier = createSingleCaseRebindResumeVerifier({ pool })
  await assert.rejects(
    () => verifier.verifyResumeProof(createRequest()),
    /REBIND_RESUME_AUTHORIZATIONS_AMBIGUOUS/
  )
})

test("ID extra falha", async () => {
  const AUTH_3 = "resume-auth-extra-001"

  const pool = mockPool({
    checkpoints: new Map([[CASE_IMPORT_ID, createCheckpoint()]]),
    audits: new Map([[REBIND_ID, createAudit()]]),
    authorizations: new Map([
      [AUTH_1, createAuthorization(AUTH_1, "EXPLICIT_APPLY_AUTHORIZATION")],
      [AUTH_2, createAuthorization(AUTH_2, "EXTERNAL_WRITES_AUTHORIZATION")],
      [AUTH_3, createAuthorization(AUTH_3, "EXPLICIT_APPLY_AUTHORIZATION")]
    ])
  })

  const originalQuery = pool.query.bind(pool)

  pool.query = async (sql, params) => {
    const result = await originalQuery(sql, params)

    if (String(sql).includes("FROM single_case_apply_authorizations")) {
      const extra = pool.state.authorizations.get(AUTH_3)
      return {
        rows: [...result.rows, extra],
        rowCount: result.rowCount + 1
      }
    }

    return result
  }

  const verifier = createSingleCaseRebindResumeVerifier({ pool })
  await assert.rejects(
    () => verifier.verifyResumeProof(createRequest()),
    /REBIND_RESUME_AUTHORIZATIONS_AMBIGUOUS/
  )
})

test("tipos duplicados falha", async () => {
  const pool = mockPool({
    checkpoints: new Map([[CASE_IMPORT_ID, createCheckpoint()]]),
    audits: new Map([[REBIND_ID, createAudit()]]),
    authorizations: new Map([
      [AUTH_1, createAuthorization(AUTH_1, "EXPLICIT_APPLY_AUTHORIZATION")],
      [AUTH_2, createAuthorization(AUTH_2, "EXPLICIT_APPLY_AUTHORIZATION")]
    ])
  })

  const verifier = createSingleCaseRebindResumeVerifier({ pool })
  await assert.rejects(
    () => verifier.verifyResumeProof(createRequest()),
    /REBIND_RESUME_AUTHORIZATION_TYPES_INVALID/
  )
})

test("binding divergente falha", async () => {
  const pool = mockPool({
    checkpoints: new Map([[CASE_IMPORT_ID, createCheckpoint()]]),
    audits: new Map([[REBIND_ID, createAudit()]]),
    authorizations: new Map([
      [AUTH_1, createAuthorization(AUTH_1, "EXPLICIT_APPLY_AUTHORIZATION", {
        case_fingerprint: "wrong-fingerprint"
      })],
      [AUTH_2, createAuthorization(AUTH_2, "EXTERNAL_WRITES_AUTHORIZATION")]
    ])
  })

  const verifier = createSingleCaseRebindResumeVerifier({ pool })
  await assert.rejects(
    () => verifier.verifyResumeProof(createRequest()),
    /REBIND_RESUME_BINDINGS_MISMATCH/
  )
})

test("autorização revogada falha", async () => {
  const pool = mockPool({
    checkpoints: new Map([[CASE_IMPORT_ID, createCheckpoint()]]),
    audits: new Map([[REBIND_ID, createAudit()]]),
    authorizations: new Map([
      [AUTH_1, createAuthorization(AUTH_1, "EXPLICIT_APPLY_AUTHORIZATION", { revoked: true })],
      [AUTH_2, createAuthorization(AUTH_2, "EXTERNAL_WRITES_AUTHORIZATION")]
    ])
  })

  const verifier = createSingleCaseRebindResumeVerifier({ pool })
  await assert.rejects(
    () => verifier.verifyResumeProof(createRequest()),
    /REBIND_RESUME_CONSUMPTION_MISMATCH/
  )
})

test("operational_status não ativo falha", async () => {
  const pool = mockPool({
    checkpoints: new Map([[CASE_IMPORT_ID, createCheckpoint()]]),
    audits: new Map([[REBIND_ID, createAudit()]]),
    authorizations: new Map([
      [AUTH_1, createAuthorization(AUTH_1, "EXPLICIT_APPLY_AUTHORIZATION", {
        operational_status: "INACTIVE"
      })],
      [AUTH_2, createAuthorization(AUTH_2, "EXTERNAL_WRITES_AUTHORIZATION")]
    ])
  })

  const verifier = createSingleCaseRebindResumeVerifier({ pool })
  await assert.rejects(
    () => verifier.verifyResumeProof(createRequest()),
    /REBIND_RESUME_CONSUMPTION_MISMATCH/
  )
})

test("uma autorização não consumida falha", async () => {
  const pool = mockPool({
    checkpoints: new Map([[CASE_IMPORT_ID, createCheckpoint()]]),
    audits: new Map([[REBIND_ID, createAudit()]]),
    authorizations: new Map([
      [AUTH_1, createAuthorization(AUTH_1, "EXPLICIT_APPLY_AUTHORIZATION", { consumed_at: null })],
      [AUTH_2, createAuthorization(AUTH_2, "EXTERNAL_WRITES_AUTHORIZATION")]
    ])
  })

  const verifier = createSingleCaseRebindResumeVerifier({ pool })
  await assert.rejects(
    () => verifier.verifyResumeProof(createRequest()),
    /REBIND_RESUME_CONSUMPTION_MISMATCH/
  )
})

test("consumed_at ausente na estrutura falha", async () => {
  const auth = createAuthorization(AUTH_1, "EXPLICIT_APPLY_AUTHORIZATION")
  delete auth.consumed_at

  const pool = mockPool({
    checkpoints: new Map([[CASE_IMPORT_ID, createCheckpoint()]]),
    audits: new Map([[REBIND_ID, createAudit()]]),
    authorizations: new Map([
      [AUTH_1, auth],
      [AUTH_2, createAuthorization(AUTH_2, "EXTERNAL_WRITES_AUTHORIZATION")]
    ])
  })

  const verifier = createSingleCaseRebindResumeVerifier({ pool })
  await assert.rejects(
    () => verifier.verifyResumeProof(createRequest()),
    /REBIND_RESUME_AUTHORIZATION_RECORD_INVALID/
  )
})

test("consumed_by ausente na estrutura falha", async () => {
  const auth = createAuthorization(AUTH_1, "EXPLICIT_APPLY_AUTHORIZATION")
  delete auth.consumed_by

  const pool = mockPool({
    checkpoints: new Map([[CASE_IMPORT_ID, createCheckpoint()]]),
    audits: new Map([[REBIND_ID, createAudit()]]),
    authorizations: new Map([
      [AUTH_1, auth],
      [AUTH_2, createAuthorization(AUTH_2, "EXTERNAL_WRITES_AUTHORIZATION")]
    ])
  })

  const verifier = createSingleCaseRebindResumeVerifier({ pool })
  await assert.rejects(
    () => verifier.verifyResumeProof(createRequest()),
    /REBIND_RESUME_AUTHORIZATION_RECORD_INVALID/
  )
})

test("consumed_by null falha", async () => {
  const pool = mockPool({
    checkpoints: new Map([[CASE_IMPORT_ID, createCheckpoint()]]),
    audits: new Map([[REBIND_ID, createAudit()]]),
    authorizations: new Map([
      [AUTH_1, createAuthorization(AUTH_1, "EXPLICIT_APPLY_AUTHORIZATION", { consumed_by: null })],
      [AUTH_2, createAuthorization(AUTH_2, "EXTERNAL_WRITES_AUTHORIZATION", { consumed_by: null })]
    ])
  })

  const verifier = createSingleCaseRebindResumeVerifier({ pool })
  await assert.rejects(
    () => verifier.verifyResumeProof(createRequest()),
    /REBIND_RESUME_CONSUMED_BY_INVALID/
  )
})

test("consumed_at divergente falha", async () => {
  const pool = mockPool({
    checkpoints: new Map([[CASE_IMPORT_ID, createCheckpoint()]]),
    audits: new Map([[REBIND_ID, createAudit()]]),
    authorizations: new Map([
      [AUTH_1, createAuthorization(AUTH_1, "EXPLICIT_APPLY_AUTHORIZATION", {
        consumed_at: "2026-07-19T11:00:00.000Z"
      })],
      [AUTH_2, createAuthorization(AUTH_2, "EXTERNAL_WRITES_AUTHORIZATION")]
    ])
  })

  const verifier = createSingleCaseRebindResumeVerifier({ pool })
  await assert.rejects(
    () => verifier.verifyResumeProof(createRequest()),
    /REBIND_RESUME_CONSUMPTION_MISMATCH/
  )
})

test("consumed_by divergente falha", async () => {
  const pool = mockPool({
    checkpoints: new Map([[CASE_IMPORT_ID, createCheckpoint()]]),
    audits: new Map([[REBIND_ID, createAudit()]]),
    authorizations: new Map([
      [AUTH_1, createAuthorization(AUTH_1, "EXPLICIT_APPLY_AUTHORIZATION", {
        consumed_by: `rebind:${REBIND_ID}`
      })],
      [AUTH_2, createAuthorization(AUTH_2, "EXTERNAL_WRITES_AUTHORIZATION", {
        consumed_by: "rebind:different-id"
      })]
    ])
  })

  const verifier = createSingleCaseRebindResumeVerifier({ pool })
  await assert.rejects(
    () => verifier.verifyResumeProof(createRequest()),
    /REBIND_RESUME_CONSUMPTION_MISMATCH/
  )
})

test("consumed_by sem prefixo rebind falha", async () => {
  const pool = mockPool({
    checkpoints: new Map([[CASE_IMPORT_ID, createCheckpoint()]]),
    audits: new Map([[REBIND_ID, createAudit()]]),
    authorizations: new Map([
      [AUTH_1, createAuthorization(AUTH_1, "EXPLICIT_APPLY_AUTHORIZATION", {
        consumed_by: "executor:some-lease"
      })],
      [AUTH_2, createAuthorization(AUTH_2, "EXTERNAL_WRITES_AUTHORIZATION", {
        consumed_by: "executor:some-lease"
      })]
    ])
  })

  const verifier = createSingleCaseRebindResumeVerifier({ pool })
  await assert.rejects(
    () => verifier.verifyResumeProof(createRequest()),
    /REBIND_RESUME_CONSUMED_BY_INVALID/
  )
})

test("consumed_by com rebindId divergente falha", async () => {
  const wrongRebindId = "f".repeat(64)

  const pool = mockPool({
    checkpoints: new Map([[CASE_IMPORT_ID, createCheckpoint()]]),
    audits: new Map([[REBIND_ID, createAudit()]]),
    authorizations: new Map([
      [AUTH_1, createAuthorization(AUTH_1, "EXPLICIT_APPLY_AUTHORIZATION", {
        consumed_by: `rebind:${wrongRebindId}`
      })],
      [AUTH_2, createAuthorization(AUTH_2, "EXTERNAL_WRITES_AUTHORIZATION", {
        consumed_by: `rebind:${wrongRebindId}`
      })]
    ])
  })

  const verifier = createSingleCaseRebindResumeVerifier({ pool })
  await assert.rejects(
    () => verifier.verifyResumeProof(createRequest()),
    /REBIND_RESUME_CONSUMED_BY_INVALID/
  )
})

test("prova interna possui objetos e arrays congelados", async () => {
  const pool = mockPool({
    checkpoints: new Map([[CASE_IMPORT_ID, createCheckpoint()]]),
    audits: new Map([[REBIND_ID, createAudit()]]),
    authorizations: new Map([
      [AUTH_1, createAuthorization(AUTH_1, "EXPLICIT_APPLY_AUTHORIZATION")],
      [AUTH_2, createAuthorization(AUTH_2, "EXTERNAL_WRITES_AUTHORIZATION")]
    ])
  })

  const verifier = createSingleCaseRebindResumeVerifier({ pool })
  const proof = await verifier.verifyResumeProof(createRequest())

  assert.ok(Object.isFrozen(proof))
  assert.ok(Object.isFrozen(proof.authorizationRecords))
  assert.ok(Object.isFrozen(proof.authorizationRecords[0]))
  assert.ok(Object.isFrozen(proof.authorizationRecords[1]))
})

test("indisponibilidade PostgreSQL e sanitizada", async () => {
  const pool = {
    async query() {
      const error = new Error("Connection refused with secret details")
      error.code = "ECONNREFUSED"
      throw error
    }
  }

  const verifier = createSingleCaseRebindResumeVerifier({ pool })
  await assert.rejects(
    () => verifier.verifyResumeProof(createRequest()),
    /POSTGRES_UNAVAILABLE/
  )
})

test("verificacao nao modifica os inputs", async () => {
  const request = createRequest()
  const originalRequest = structuredClone(request)

  const pool = mockPool({
    checkpoints: new Map([[CASE_IMPORT_ID, createCheckpoint()]]),
    audits: new Map([[REBIND_ID, createAudit()]]),
    authorizations: new Map([
      [AUTH_1, createAuthorization(AUTH_1, "EXPLICIT_APPLY_AUTHORIZATION")],
      [AUTH_2, createAuthorization(AUTH_2, "EXTERNAL_WRITES_AUTHORIZATION")]
    ])
  })

  const verifier = createSingleCaseRebindResumeVerifier({ pool })
  await verifier.verifyResumeProof(request)

  assert.deepEqual(request, originalRequest)
})

test("scope ausente falha", async () => {
  const pool = mockPool({
    checkpoints: new Map([[CASE_IMPORT_ID, createCheckpoint()]]),
    audits: new Map([[REBIND_ID, createAudit()]]),
    authorizations: new Map([
      [AUTH_1, createAuthorization(AUTH_1, "EXPLICIT_APPLY_AUTHORIZATION", { scope: null })],
      [AUTH_2, createAuthorization(AUTH_2, "EXTERNAL_WRITES_AUTHORIZATION")]
    ])
  })

  const verifier = createSingleCaseRebindResumeVerifier({ pool })
  await assert.rejects(
    () => verifier.verifyResumeProof(createRequest()),
    /REBIND_RESUME_AUTHORIZATION_RECORD_INVALID/
  )
})

test("scope não array falha", async () => {
  const pool = mockPool({
    checkpoints: new Map([[CASE_IMPORT_ID, createCheckpoint()]]),
    audits: new Map([[REBIND_ID, createAudit()]]),
    authorizations: new Map([
      [AUTH_1, createAuthorization(AUTH_1, "EXPLICIT_APPLY_AUTHORIZATION", { scope: "not-an-array" })],
      [AUTH_2, createAuthorization(AUTH_2, "EXTERNAL_WRITES_AUTHORIZATION")]
    ])
  })

  const verifier = createSingleCaseRebindResumeVerifier({ pool })
  await assert.rejects(
    () => verifier.verifyResumeProof(createRequest()),
    /REBIND_RESUME_AUTHORIZATION_RECORD_INVALID/
  )
})

test("issuer ausente falha", async () => {
  const pool = mockPool({
    checkpoints: new Map([[CASE_IMPORT_ID, createCheckpoint()]]),
    audits: new Map([[REBIND_ID, createAudit()]]),
    authorizations: new Map([
      [AUTH_1, createAuthorization(AUTH_1, "EXPLICIT_APPLY_AUTHORIZATION", { issuer: null })],
      [AUTH_2, createAuthorization(AUTH_2, "EXTERNAL_WRITES_AUTHORIZATION")]
    ])
  })

  const verifier = createSingleCaseRebindResumeVerifier({ pool })
  await assert.rejects(
    () => verifier.verifyResumeProof(createRequest()),
    /REBIND_RESUME_AUTHORIZATION_RECORD_INVALID/
  )
})

test("issued_at inválido falha", async () => {
  const pool = mockPool({
    checkpoints: new Map([[CASE_IMPORT_ID, createCheckpoint()]]),
    audits: new Map([[REBIND_ID, createAudit()]]),
    authorizations: new Map([
      [AUTH_1, createAuthorization(AUTH_1, "EXPLICIT_APPLY_AUTHORIZATION", { issued_at: "not-a-date" })],
      [AUTH_2, createAuthorization(AUTH_2, "EXTERNAL_WRITES_AUTHORIZATION")]
    ])
  })

  const verifier = createSingleCaseRebindResumeVerifier({ pool })
  await assert.rejects(
    () => verifier.verifyResumeProof(createRequest()),
    /REBIND_RESUME_AUTHORIZATION_RECORD_INVALID/
  )
})

test("expires_at inválido falha", async () => {
  const pool = mockPool({
    checkpoints: new Map([[CASE_IMPORT_ID, createCheckpoint()]]),
    audits: new Map([[REBIND_ID, createAudit()]]),
    authorizations: new Map([
      [AUTH_1, createAuthorization(AUTH_1, "EXPLICIT_APPLY_AUTHORIZATION", { expires_at: "not-a-date" })],
      [AUTH_2, createAuthorization(AUTH_2, "EXTERNAL_WRITES_AUTHORIZATION")]
    ])
  })

  const verifier = createSingleCaseRebindResumeVerifier({ pool })
  await assert.rejects(
    () => verifier.verifyResumeProof(createRequest()),
    /REBIND_RESUME_AUTHORIZATION_RECORD_INVALID/
  )
})

test("expires_at anterior a issued_at falha", async () => {
  const pool = mockPool({
    checkpoints: new Map([[CASE_IMPORT_ID, createCheckpoint()]]),
    audits: new Map([[REBIND_ID, createAudit()]]),
    authorizations: new Map([
      [AUTH_1, createAuthorization(AUTH_1, "EXPLICIT_APPLY_AUTHORIZATION", {
        issued_at: "2026-07-19T13:00:00.000Z",
        expires_at: "2026-07-19T11:00:00.000Z"
      })],
      [AUTH_2, createAuthorization(AUTH_2, "EXTERNAL_WRITES_AUTHORIZATION")]
    ])
  })

  const verifier = createSingleCaseRebindResumeVerifier({ pool })
  await assert.rejects(
    () => verifier.verifyResumeProof(createRequest()),
    /REBIND_RESUME_AUTHORIZATION_RECORD_INVALID/
  )
})

test("signature ausente falha", async () => {
  const pool = mockPool({
    checkpoints: new Map([[CASE_IMPORT_ID, createCheckpoint()]]),
    audits: new Map([[REBIND_ID, createAudit()]]),
    authorizations: new Map([
      [AUTH_1, createAuthorization(AUTH_1, "EXPLICIT_APPLY_AUTHORIZATION", { signature: null })],
      [AUTH_2, createAuthorization(AUTH_2, "EXTERNAL_WRITES_AUTHORIZATION")]
    ])
  })

  const verifier = createSingleCaseRebindResumeVerifier({ pool })
  await assert.rejects(
    () => verifier.verifyResumeProof(createRequest()),
    /REBIND_RESUME_AUTHORIZATION_RECORD_INVALID/
  )
})

test("signature_algorithm ausente falha", async () => {
  const pool = mockPool({
    checkpoints: new Map([[CASE_IMPORT_ID, createCheckpoint()]]),
    audits: new Map([[REBIND_ID, createAudit()]]),
    authorizations: new Map([
      [AUTH_1, createAuthorization(AUTH_1, "EXPLICIT_APPLY_AUTHORIZATION", { signature_algorithm: null })],
      [AUTH_2, createAuthorization(AUTH_2, "EXTERNAL_WRITES_AUTHORIZATION")]
    ])
  })

  const verifier = createSingleCaseRebindResumeVerifier({ pool })
  await assert.rejects(
    () => verifier.verifyResumeProof(createRequest()),
    /REBIND_RESUME_AUTHORIZATION_RECORD_INVALID/
  )
})

test("signature_algorithm diferente de Ed25519 falha", async () => {
  const pool = mockPool({
    checkpoints: new Map([[CASE_IMPORT_ID, createCheckpoint()]]),
    audits: new Map([[REBIND_ID, createAudit()]]),
    authorizations: new Map([
      [AUTH_1, createAuthorization(AUTH_1, "EXPLICIT_APPLY_AUTHORIZATION", { signature_algorithm: "RSA2048" })],
      [AUTH_2, createAuthorization(AUTH_2, "EXTERNAL_WRITES_AUTHORIZATION")]
    ])
  })

  const verifier = createSingleCaseRebindResumeVerifier({ pool })
  await assert.rejects(
    () => verifier.verifyResumeProof(createRequest()),
    /REBIND_RESUME_AUTHORIZATION_RECORD_INVALID/
  )
})

test("schema_version inválida falha", async () => {
  const pool = mockPool({
    checkpoints: new Map([[CASE_IMPORT_ID, createCheckpoint()]]),
    audits: new Map([[REBIND_ID, createAudit()]]),
    authorizations: new Map([
      [AUTH_1, createAuthorization(AUTH_1, "EXPLICIT_APPLY_AUTHORIZATION", { schema_version: "not-a-number" })],
      [AUTH_2, createAuthorization(AUTH_2, "EXTERNAL_WRITES_AUTHORIZATION")]
    ])
  })

  const verifier = createSingleCaseRebindResumeVerifier({ pool })
  await assert.rejects(
    () => verifier.verifyResumeProof(createRequest()),
    /REBIND_RESUME_AUTHORIZATION_RECORD_INVALID/
  )
})

test("committed_at ausente falha", async () => {
  const audit = createAudit()
  delete audit.committed_at

  const pool = mockPool({
    checkpoints: new Map([[CASE_IMPORT_ID, createCheckpoint()]]),
    audits: new Map([[REBIND_ID, audit]]),
    authorizations: new Map([
      [AUTH_1, createAuthorization(AUTH_1, "EXPLICIT_APPLY_AUTHORIZATION")],
      [AUTH_2, createAuthorization(AUTH_2, "EXTERNAL_WRITES_AUTHORIZATION")]
    ])
  })

  const verifier = createSingleCaseRebindResumeVerifier({ pool })
  await assert.rejects(
    () => verifier.verifyResumeProof(createRequest()),
    /REBIND_RESUME_AUDIT_DIVERGENT/
  )
})

test("committed_at null falha", async () => {
  const pool = mockPool({
    checkpoints: new Map([[CASE_IMPORT_ID, createCheckpoint()]]),
    audits: new Map([[REBIND_ID, createAudit({ committed_at: null })]]),
    authorizations: new Map([
      [AUTH_1, createAuthorization(AUTH_1, "EXPLICIT_APPLY_AUTHORIZATION")],
      [AUTH_2, createAuthorization(AUTH_2, "EXTERNAL_WRITES_AUTHORIZATION")]
    ])
  })

  const verifier = createSingleCaseRebindResumeVerifier({ pool })
  await assert.rejects(
    () => verifier.verifyResumeProof(createRequest()),
    /REBIND_RESUME_AUDIT_DIVERGENT/
  )
})

test("committed_at inválido falha", async () => {
  const pool = mockPool({
    checkpoints: new Map([[CASE_IMPORT_ID, createCheckpoint()]]),
    audits: new Map([[REBIND_ID, createAudit({ committed_at: "not-a-date" })]]),
    authorizations: new Map([
      [AUTH_1, createAuthorization(AUTH_1, "EXPLICIT_APPLY_AUTHORIZATION")],
      [AUTH_2, createAuthorization(AUTH_2, "EXTERNAL_WRITES_AUTHORIZATION")]
    ])
  })

  const verifier = createSingleCaseRebindResumeVerifier({ pool })
  await assert.rejects(
    () => verifier.verifyResumeProof(createRequest()),
    /REBIND_RESUME_AUDIT_DIVERGENT/
  )
})

test("primeiro consumed_at inválido falha", async () => {
  const pool = mockPool({
    checkpoints: new Map([[CASE_IMPORT_ID, createCheckpoint()]]),
    audits: new Map([[REBIND_ID, createAudit()]]),
    authorizations: new Map([
      [AUTH_1, createAuthorization(AUTH_1, "EXPLICIT_APPLY_AUTHORIZATION", { consumed_at: "not-a-date" })],
      [AUTH_2, createAuthorization(AUTH_2, "EXTERNAL_WRITES_AUTHORIZATION")]
    ])
  })

  const verifier = createSingleCaseRebindResumeVerifier({ pool })
  await assert.rejects(
    () => verifier.verifyResumeProof(createRequest()),
    /REBIND_RESUME_CONSUMPTION_MISMATCH/
  )
})

test("segundo consumed_at inválido falha", async () => {
  const pool = mockPool({
    checkpoints: new Map([[CASE_IMPORT_ID, createCheckpoint()]]),
    audits: new Map([[REBIND_ID, createAudit()]]),
    authorizations: new Map([
      [AUTH_1, createAuthorization(AUTH_1, "EXPLICIT_APPLY_AUTHORIZATION")],
      [AUTH_2, createAuthorization(AUTH_2, "EXTERNAL_WRITES_AUTHORIZATION", { consumed_at: "not-a-date" })]
    ])
  })

  const verifier = createSingleCaseRebindResumeVerifier({ pool })
  await assert.rejects(
    () => verifier.verifyResumeProof(createRequest()),
    /REBIND_RESUME_CONSUMPTION_MISMATCH/
  )
})

test("ambos consumed_at inválidos falha", async () => {
  const pool = mockPool({
    checkpoints: new Map([[CASE_IMPORT_ID, createCheckpoint()]]),
    audits: new Map([[REBIND_ID, createAudit()]]),
    authorizations: new Map([
      [AUTH_1, createAuthorization(AUTH_1, "EXPLICIT_APPLY_AUTHORIZATION", { consumed_at: "not-a-date" })],
      [AUTH_2, createAuthorization(AUTH_2, "EXTERNAL_WRITES_AUTHORIZATION", { consumed_at: "also-invalid" })]
    ])
  })

  const verifier = createSingleCaseRebindResumeVerifier({ pool })
  await assert.rejects(
    () => verifier.verifyResumeProof(createRequest()),
    /REBIND_RESUME_CONSUMPTION_MISMATCH/
  )
})

test("revoked_at preenchido com revoked false falha", async () => {
  const pool = mockPool({
    checkpoints: new Map([[CASE_IMPORT_ID, createCheckpoint()]]),
    audits: new Map([[REBIND_ID, createAudit()]]),
    authorizations: new Map([
      [AUTH_1, createAuthorization(AUTH_1, "EXPLICIT_APPLY_AUTHORIZATION", {
        revoked: false,
        revoked_at: NOW
      })],
      [AUTH_2, createAuthorization(AUTH_2, "EXTERNAL_WRITES_AUTHORIZATION")]
    ])
  })

  const verifier = createSingleCaseRebindResumeVerifier({ pool })
  await assert.rejects(
    () => verifier.verifyResumeProof(createRequest()),
    /REBIND_RESUME_AUTHORIZATION_RECORD_INVALID/
  )
})

test("revocation_reason preenchida com revoked false falha", async () => {
  const pool = mockPool({
    checkpoints: new Map([[CASE_IMPORT_ID, createCheckpoint()]]),
    audits: new Map([[REBIND_ID, createAudit()]]),
    authorizations: new Map([
      [AUTH_1, createAuthorization(AUTH_1, "EXPLICIT_APPLY_AUTHORIZATION", {
        revoked: false,
        revocation_reason: "SOME_REASON"
      })],
      [AUTH_2, createAuthorization(AUTH_2, "EXTERNAL_WRITES_AUTHORIZATION")]
    ])
  })

  const verifier = createSingleCaseRebindResumeVerifier({ pool })
  await assert.rejects(
    () => verifier.verifyResumeProof(createRequest()),
    /REBIND_RESUME_AUTHORIZATION_RECORD_INVALID/
  )
})

test("objetos Date preservam milissegundos no payload reconstruído", async () => {
  const issuedAt = new Date("2026-07-19T11:00:00.123Z")
  const expiresAt = new Date("2026-07-19T13:00:00.456Z")
  const pool = mockPool({
    checkpoints: new Map([[CASE_IMPORT_ID, createCheckpoint()]]),
    audits: new Map([[REBIND_ID, createAudit()]]),
    authorizations: new Map([
      [AUTH_1, createAuthorization(AUTH_1, "EXPLICIT_APPLY_AUTHORIZATION", { issued_at: issuedAt, expires_at: expiresAt })],
      [AUTH_2, createAuthorization(AUTH_2, "EXTERNAL_WRITES_AUTHORIZATION", { issued_at: issuedAt, expires_at: expiresAt })]
    ])
  })

  const proof = await createSingleCaseRebindResumeVerifier({ pool }).verifyResumeProof(createRequest())
  for (const record of proof.authorizationRecords) {
    assert.equal(record.issuedAt, "2026-07-19T11:00:00.123Z")
    assert.equal(record.expiresAt, "2026-07-19T13:00:00.456Z")
  }
})

test("payload consumido reconstruído coincide com emissor e mantém prova válida", async () => {
  const keys = crypto.generateKeyPairSync("ed25519")
  const issuedAt = "2026-07-19T11:00:00.123Z"
  const expiresAt = "2026-07-19T11:29:59.456Z"
  const verificationNow = "2026-07-19T11:10:00.000Z"
  const rows = [
    createAuthorization(AUTH_1, "EXPLICIT_APPLY_AUTHORIZATION", {
      issued_at: new Date(issuedAt),
      expires_at: new Date(expiresAt)
    }),
    createAuthorization(AUTH_2, "EXTERNAL_WRITES_AUTHORIZATION", {
      issued_at: new Date(issuedAt),
      expires_at: new Date(expiresAt)
    })
  ]
  const emitterRecords = rows.map(row => ({
    authorizationId: row.authorization_id,
    schemaVersion: row.schema_version,
    type: row.authorization_type,
    caseImportId: row.case_import_id,
    caseFingerprint: row.case_fingerprint,
    caseNumber: row.case_number,
    authorizablePlanHash: row.authorizable_plan_hash,
    planHash: row.plan_hash,
    manifestHash: row.manifest_hash,
    reservationEvidenceHash: row.reservation_evidence_hash,
    scope: JSON.parse(row.scope),
    issuer: row.issuer,
    issuedAt,
    expiresAt,
    revoked: row.revoked
  }))
  rows.forEach((row, index) => {
    row.signature = crypto.sign(null, Buffer.from(authorizationPayload(emitterRecords[index])), keys.privateKey).toString("base64")
  })
  const pool = mockPool({
    checkpoints: new Map([[CASE_IMPORT_ID, createCheckpoint()]]),
    audits: new Map([[REBIND_ID, createAudit()]]),
    authorizations: new Map(rows.map(row => [row.authorization_id, row]))
  })
  const proof = await createSingleCaseRebindResumeVerifier({ pool }).verifyResumeProof(createRequest())
  const verifier = createAuthorizationVerifier({ trustedIssuers: { "fixture-resume-issuer": keys.publicKey } })

  proof.authorizationRecords.forEach((record, index) => {
    assert.equal(authorizationPayload(record), authorizationPayload(emitterRecords[index]))
    assert.equal(verifier.verify(record, { now: verificationNow }).valid, true)
    assert.equal(
      authorizationPayload({ ...record, consumedAt: NOW, consumedBy: `rebind:${REBIND_ID}`, operationalStatus: "ACTIVE" }),
      authorizationPayload(record)
    )
    assert.equal(verifier.verify({ ...record, issuedAt: "2026-07-19T11:00:00.124Z" }, { now: verificationNow }).valid, false)
    assert.equal(verifier.verify({ ...record, proof: Buffer.alloc(64, 2).toString("base64") }, { now: verificationNow }).valid, false)
  })
})

test("normalização temporal preserva strings e rejeita datas inválidas", () => {
  assert.equal(new Date(authorizationInstant("2026-07-19T11:00:00.123Z")).toISOString(), "2026-07-19T11:00:00.123Z")
  assert.equal(new Date(authorizationInstant("2026-07-19T11:00:00Z")).toISOString(), "2026-07-19T11:00:00.000Z")
  assert.throws(() => authorizationInstant(new Date(NaN)), /REBIND_RESUME_AUTHORIZATION_RECORD_INVALID/)
  assert.throws(() => authorizationInstant("data-inválida"), /REBIND_RESUME_AUTHORIZATION_RECORD_INVALID/)
  assert.throws(() => authorizationInstant(123), /REBIND_RESUME_AUTHORIZATION_RECORD_INVALID/)
})
