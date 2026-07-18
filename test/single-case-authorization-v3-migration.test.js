"use strict"

const test = require("node:test")
const assert = require("node:assert/strict")
const crypto = require("node:crypto")

const { MIGRATION_ID, EXPLICIT_SCOPE, EXTERNAL_SCOPE, validateAuthorizationV3Schema, migrateSingleCaseAuthorizationV3 } = require("../src/infrastructure/single-case-authorization-v3-migration")
const { TABLE_NAME } = require("../src/infrastructure/single-case-authorization-postgres")
const { AUTH_SCOPES, authorizationPayload } = require("../src/domain/single-case-apply-contracts")
const { createSingleCaseAuthorizationSigner } = require("../src/domain/single-case-authorization-signer")
const { createAuthorizationVerifier } = require("../src/domain/single-case-apply-contracts")

// ── helpers ──────────────────────────────────────────────────────────────────
const keys = crypto.generateKeyPairSync("ed25519")
const verifier = createAuthorizationVerifier({ trustedIssuers: { "test-issuer": keys.publicKey } })
const signer = createSingleCaseAuthorizationSigner({ privateKey: keys.privateKey, clock: () => "2026-07-17T10:00:00.000Z" })

function makeRecord(type, scope) {
  return {
    authorizationId: `test-${type}-${Date.now()}`,
    schemaVersion: 2,
    type,
    caseImportId: "inss-test-001",
    caseFingerprint: "abc123def456",
    caseNumber: "PRV.260717.001",
    authorizablePlanHash: "a".repeat(64),
    planHash: "b".repeat(64),
    manifestHash: "c".repeat(64),
    reservationEvidenceHash: "d".repeat(64),
    scope,
    issuer: "test-issuer",
    issuedAt: "2026-07-17T10:00:00.000Z",
    expiresAt: "2026-07-17T10:30:00.000Z",
    revoked: false,
  }
}

function schemaHarness({ migrated = false, v2Present = false } = {}) {
  const state = { migrated, v2Present, creates: 0, inserts: 0, commits: 0, rollbacks: 0, statements: [] }
  const client = {
    async query(sql, params = []) {
      const text = String(sql).replace(/\s+/g, " ").trim()
      state.statements.push(text)
      if (text === "BEGIN") return { rows: [], rowCount: 0 }
      if (text === "COMMIT") { state.commits++; return { rows: [], rowCount: 0 } }
      if (text === "ROLLBACK") { state.rollbacks++; return { rows: [], rowCount: 0 } }
      if (text.includes("to_regclass('oraculum_state_migrations')")) return { rows: [{ table_name: "oraculum_state_migrations" }], rowCount: 1 }
      if (text.startsWith("SELECT migration_id")) return { rows: state.migrated ? [{ migration_id: MIGRATION_ID }] : [], rowCount: state.migrated ? 1 : 0 }
      if (text.startsWith("ALTER TABLE")) {
        // ALTER applies v3 and removes v2
        state.migrated = true
        // But if v2 was explicitly present at start, keep it (simulating failure to remove)
        if (v2Present) {
          // Keep v2Present as true to simulate schema incompatibility
        } else {
          state.v2Present = false
        }
        return { rows: [], rowCount: 0 }
      }
      // Handle constraint queries (both array-based and simple)
      if (text.includes("FROM pg_constraint") && text.includes("conrelid=to_regclass")) {
        // Check which constraints are being queried
        if (params && params.length >= 2 && Array.isArray(params[1])) {
          // Array-based query (v3 check)
          const requested = params[1]
          const available = []
          if (requested.includes("single_case_auth_v3_scope_check") && state.migrated) {
            available.push({ conname: "single_case_auth_v3_scope_check" })
          }
          return { rows: available, rowCount: available.length }
        }
        // Single constraint check (v2)
        if (params && params[1] === "single_case_auth_v2_scope_check") {
          return { rows: state.v2Present ? [{ conname: "single_case_auth_v2_scope_check" }] : [], rowCount: state.v2Present ? 1 : 0 }
        }
        // fallback: return based on flags
        const available = []
        if (state.migrated) available.push({ conname: "single_case_auth_v3_scope_check" })
        if (state.v2Present) available.push({ conname: "single_case_auth_v2_scope_check" })
        return { rows: available, rowCount: available.length }
      }
      if (text.startsWith("INSERT INTO oraculum_state_migrations")) {
        state.migrated = true
        state.inserts++
        return { rows: [], rowCount: 1 }
      }
      throw new Error(`UNEXPECTED_SQL:${text}`)
    },
    release() {},
  }
  return { connect: async () => client, query: client.query.bind(client), state }
}

// ── migration tests ──────────────────────────────────────────────────────────
test("v3 schema validation aceita v3 migrado", async () => {
  const db = schemaHarness({ migrated: true })
  assert.equal((await validateAuthorizationV3Schema(db)).ok, true)
})

test("v3 schema validation rejeita quando v3 ausente", async () => {
  const db = schemaHarness({ migrated: false })
  const result = await validateAuthorizationV3Schema(db)
  assert.equal(result.ok, false)
  assert.ok(result.codes.includes("V3_CONSTRAINT_MISSING"))
})

test("v3 schema validation rejeita quando v2 ainda presente", async () => {
  const db = schemaHarness({ migrated: true, v2Present: true })
  const result = await validateAuthorizationV3Schema(db)
  assert.equal(result.ok, false)
  assert.ok(result.codes.includes("V2_CONSTRAINT_PRESENT"))
})

test("migration v3 é idempotente", async () => {
  const db = schemaHarness()
  const first = await migrateSingleCaseAuthorizationV3(db)
  assert.equal(first.applied, true)
  const second = await migrateSingleCaseAuthorizationV3(db)
  assert.equal(second.applied, false)
  assert.equal(db.state.inserts, 1)
  assert.equal(db.state.commits, 2)
})

test("migration v3 falha se schema incompatível", async () => {
  // Create harness with v2 still present, which violates v3 requirement
  const db = schemaHarness({ v2Present: true, migrated: false })
  // Migration should detect v2 is still present and fail
  await assert.rejects(() => migrateSingleCaseAuthorizationV3(db), /V3_SCHEMA_INCOMPATIBLE|V2_CONSTRAINT_PRESENT/)
  assert.equal(db.state.rollbacks >= 1, true)
  assert.equal(db.state.commits, 0)
})

// ── scope segregation tests ──────────────────────────────────────────────────
test("explicit com 1 escopo correto é aceito pelo signer", () => {
  const record = makeRecord("EXPLICIT_APPLY_AUTHORIZATION", ["APPLY_SINGLE_CASE"])
  const signed = signer.sign(record)
  assert.equal(signed.type, "EXPLICIT_APPLY_AUTHORIZATION")
  assert.equal(signed.scope.length, 1)
})

test("explicit com 7 escopos é rejeitado pelo signer", () => {
  const record = makeRecord("EXPLICIT_APPLY_AUTHORIZATION", ["APPLY_SINGLE_CASE", "CHECKPOINT_WRITE", "DRIVE_FOLDERS", "DRIVE_UPLOADS", "HUBSPOT_ASSOCIATION", "HUBSPOT_CONTACT", "HUBSPOT_DEAL"])
  assert.throws(() => signer.sign(record), /AUTH_SCOPE_INVALID/)
})

test("external com 6 escopos corretos é aceito pelo signer", () => {
  const record = makeRecord("EXTERNAL_WRITES_AUTHORIZATION", ["CHECKPOINT_WRITE", "DRIVE_FOLDERS", "DRIVE_UPLOADS", "HUBSPOT_ASSOCIATION", "HUBSPOT_CONTACT", "HUBSPOT_DEAL"])
  const signed = signer.sign(record)
  assert.equal(signed.type, "EXTERNAL_WRITES_AUTHORIZATION")
  assert.equal(signed.scope.length, 6)
})

test("external incluindo APPLY_SINGLE_CASE é rejeitado pelo signer", () => {
  const record = makeRecord("EXTERNAL_WRITES_AUTHORIZATION", ["APPLY_SINGLE_CASE", "CHECKPOINT_WRITE", "DRIVE_FOLDERS", "DRIVE_UPLOADS", "HUBSPOT_ASSOCIATION", "HUBSPOT_CONTACT", "HUBSPOT_DEAL"])
  assert.throws(() => signer.sign(record), /AUTH_SCOPE_INVALID/)
})

test("explicit com escopo de external é rejeitado pelo signer", () => {
  const record = makeRecord("EXPLICIT_APPLY_AUTHORIZATION", ["CHECKPOINT_WRITE", "DRIVE_FOLDERS", "DRIVE_UPLOADS", "HUBSPOT_ASSOCIATION", "HUBSPOT_CONTACT", "HUBSPOT_DEAL"])
  assert.throws(() => signer.sign(record), /AUTH_SCOPE_INVALID/)
})

test("external com escopo de explicit é rejeitado pelo signer", () => {
  const record = makeRecord("EXTERNAL_WRITES_AUTHORIZATION", ["APPLY_SINGLE_CASE"])
  assert.throws(() => signer.sign(record), /AUTH_SCOPE_INVALID/)
})

test("escopo extra é rejeitado pelo signer", () => {
  const record = makeRecord("EXPLICIT_APPLY_AUTHORIZATION", ["APPLY_SINGLE_CASE", "EXTRA_SCOPE"])
  assert.throws(() => signer.sign(record), /AUTH_SCOPE_INVALID/)
})

test("escopo ausente é rejeitado pelo signer", () => {
  const record = makeRecord("EXTERNAL_WRITES_AUTHORIZATION", ["CHECKPOINT_WRITE", "DRIVE_FOLDERS"])
  assert.throws(() => signer.sign(record), /AUTH_SCOPE_INVALID/)
})

test("ordem incorreta é normalizada automaticamente", () => {
  const record = makeRecord("EXTERNAL_WRITES_AUTHORIZATION", ["HUBSPOT_DEAL", "CHECKPOINT_WRITE", "DRIVE_FOLDERS", "DRIVE_UPLOADS", "HUBSPOT_ASSOCIATION", "HUBSPOT_CONTACT"])
  const signed = signer.sign(record)
  // signer normaliza ordem, verifier aceita
  const result = verifier.verify(signed, { now: "2026-07-17T10:00:00.000Z" })
  assert.equal(result.valid, true)
})

test("escopo duplicado é rejeitado pelo signer", () => {
  const record = makeRecord("EXPLICIT_APPLY_AUTHORIZATION", ["APPLY_SINGLE_CASE", "APPLY_SINGLE_CASE"])
  assert.throws(() => signer.sign(record), /AUTH_SCOPE_INVALID/)
})

test("verifier rejeita escopo incompatível com tipo", () => {
  // manipulate a signed record to have wrong scope (bypassing signer)
  const record = makeRecord("EXPLICIT_APPLY_AUTHORIZATION", ["APPLY_SINGLE_CASE"])
  const signed = signer.sign(record)
  // change type without re-signing
  const tampered = { ...signed, type: "EXTERNAL_WRITES_AUTHORIZATION" }
  const result = verifier.verify(tampered, { now: "2026-07-17T10:00:00.000Z" })
  assert.equal(result.valid, false)
  assert.equal(result.reason, "AUTH_SCOPE_INVALID")
})

test("AUTH_SCOPES contém exatamente 2 tipos com escopo distinto", () => {
  assert.equal(Object.keys(AUTH_SCOPES).length, 2)
  assert.ok(AUTH_SCOPES.EXPLICIT_APPLY_AUTHORIZATION)
  assert.ok(AUTH_SCOPES.EXTERNAL_WRITES_AUTHORIZATION)
  assert.deepEqual(AUTH_SCOPES.EXPLICIT_APPLY_AUTHORIZATION, ["APPLY_SINGLE_CASE"])
  // EXTERNAL should have 6 scopes in alphabetical order
  const external = [...AUTH_SCOPES.EXTERNAL_WRITES_AUTHORIZATION].sort()
  assert.deepEqual(external, ["CHECKPOINT_WRITE", "DRIVE_FOLDERS", "DRIVE_UPLOADS", "HUBSPOT_ASSOCIATION", "HUBSPOT_CONTACT", "HUBSPOT_DEAL"])
  assert.equal(AUTH_SCOPES.EXTERNAL_WRITES_AUTHORIZATION.length, 6)
})

test("v3 constraint SQL contém escopo correto para cada tipo", () => {
  assert.ok(EXPLICIT_SCOPE.includes("APPLY_SINGLE_CASE"))
  assert.ok(!EXPLICIT_SCOPE.includes("CHECKPOINT_WRITE"))
  assert.ok(EXTERNAL_SCOPE.includes("CHECKPOINT_WRITE"))
  assert.ok(!EXTERNAL_SCOPE.includes("APPLY_SINGLE_CASE"))
})
