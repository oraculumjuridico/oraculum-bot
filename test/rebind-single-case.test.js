"use strict"

const { test } = require("node:test")
const assert = require("node:assert/strict")
const fs = require("node:fs/promises")
const os = require("node:os")
const path = require("node:path")
const { parseArgs, main, sanitizeError, sanitizeDiagnostics } = require("../scripts/rebind-single-case")

const caseImportId = "case-import-synthetic-001"
const oldAuthorizationIds = ["auth-id-alpha-12345", "auth-id-beta-67890"]
const newAuthorizationIds = ["auth-id-gamma-11111", "auth-id-delta-22222"]
const evidence = { decision: "RECONCILIATION_ELIGIBLE", reason: "CONTACT_READ_ONLY_VERIFIED", contactEvidence: { caseImportId, contactId: "contact-123", verified: true }, namePresentation: { semanticMatch: true, materialDivergence: false }, resume: { checkpointRebindRequired: true, ambiguity: "NONE" }, evidenceHash: "a".repeat(64) }
const checkpoint = { version: 1, authorizationIds: oldAuthorizationIds }
const argv = file => ["--case-import-id", caseImportId, "--requested-by", "operator-01", "--reason", "CONTACT_RECONCILED_AFTER_DIVERGENCE", "--reconciliation-evidence-file", file, "--new-authorization-ids", JSON.stringify(newAuthorizationIds)]

async function evidenceFile(value = evidence) {
  const file = path.join(os.tmpdir(), `rebind-evidence-${Date.now()}-${Math.random()}.json`)
  await fs.writeFile(file, JSON.stringify(value))
  return file
}

function mockPoolWithMigration() {
  return {
    connect: async () => ({
      query: async (sql) => {
        if (sql.includes("to_regclass('oraculum_state_migrations')")) return { rowCount: 1, rows: [{ table_name: "oraculum_state_migrations" }] }
        if (sql.includes("SELECT migration_id FROM oraculum_state_migrations")) return { rowCount: 1, rows: [{ migration_id: "single-case-apply-rebind-audit-v1" }] }
        if (sql.includes("information_schema.columns")) {
          return {
            rowCount: 13,
            rows: [
              { column_name: "rebind_id", data_type: "text", udt_name: "text", is_nullable: "NO", column_default: null, ordinal_position: 1 },
              { column_name: "case_import_id", data_type: "text", udt_name: "text", is_nullable: "NO", column_default: null, ordinal_position: 2 },
              { column_name: "source_checkpoint_version", data_type: "bigint", udt_name: "int8", is_nullable: "NO", column_default: null, ordinal_position: 3 },
              { column_name: "rebound_checkpoint_version", data_type: "bigint", udt_name: "int8", is_nullable: "NO", column_default: null, ordinal_position: 4 },
              { column_name: "authorization_count", data_type: "integer", udt_name: "int4", is_nullable: "NO", column_default: null, ordinal_position: 5 },
              { column_name: "previous_authorization_set_hash", data_type: "text", udt_name: "text", is_nullable: "NO", column_default: null, ordinal_position: 6 },
              { column_name: "current_authorization_set_hash", data_type: "text", udt_name: "text", is_nullable: "NO", column_default: null, ordinal_position: 7 },
              { column_name: "reconciliation_evidence_hash", data_type: "text", udt_name: "text", is_nullable: "YES", column_default: null, ordinal_position: 8 },
              { column_name: "reason", data_type: "text", udt_name: "text", is_nullable: "NO", column_default: null, ordinal_position: 9 },
              { column_name: "requested_by", data_type: "text", udt_name: "text", is_nullable: "NO", column_default: null, ordinal_position: 10 },
              { column_name: "fencing_token", data_type: "bigint", udt_name: "int8", is_nullable: "NO", column_default: null, ordinal_position: 11 },
              { column_name: "lease_id", data_type: "text", udt_name: "text", is_nullable: "NO", column_default: null, ordinal_position: 12 },
              { column_name: "committed_at", data_type: "timestamp with time zone", udt_name: "timestamptz", is_nullable: "NO", column_default: "current_timestamp", ordinal_position: 13 }
            ]
          }
        }
        if (sql.includes("pg_constraint")) {
          return {
            rowCount: 13,
            rows: [
              { conname: "single_case_rebind_audit_pkey", contype: "p", definition: "PRIMARY KEY (rebind_id)", columns: JSON.stringify(["rebind_id"]) },
              { conname: "single_case_rebind_audit_rebind_id_check", contype: "c", definition: "CHECK ((rebind_id ~ '^[a-f0-9]{64}$'::text))", columns: JSON.stringify(["rebind_id"]) },
              { conname: "single_case_rebind_audit_case_id_check", contype: "c", definition: "CHECK ((case_import_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{2,127}$'::text))", columns: JSON.stringify(["case_import_id"]) },
              { conname: "single_case_rebind_audit_source_version_check", contype: "c", definition: "CHECK ((source_checkpoint_version > 0))", columns: JSON.stringify(["source_checkpoint_version"]) },
              { conname: "single_case_rebind_audit_rebound_version_check", contype: "c", definition: "CHECK ((rebound_checkpoint_version = (source_checkpoint_version + 1)))", columns: JSON.stringify(["rebound_checkpoint_version", "source_checkpoint_version"]) },
              { conname: "single_case_rebind_audit_auth_count_check", contype: "c", definition: "CHECK ((authorization_count = 2))", columns: JSON.stringify(["authorization_count"]) },
              { conname: "single_case_rebind_audit_previous_hash_check", contype: "c", definition: "CHECK ((previous_authorization_set_hash ~ '^[a-f0-9]{64}$'::text))", columns: JSON.stringify(["previous_authorization_set_hash"]) },
              { conname: "single_case_rebind_audit_current_hash_check", contype: "c", definition: "CHECK ((current_authorization_set_hash ~ '^[a-f0-9]{64}$'::text))", columns: JSON.stringify(["current_authorization_set_hash"]) },
              { conname: "single_case_rebind_audit_evidence_hash_check", contype: "c", definition: "CHECK ((reconciliation_evidence_hash ~ '^[a-f0-9]{64}$'::text))", columns: JSON.stringify(["reconciliation_evidence_hash"]) },
              { conname: "single_case_rebind_audit_reason_check", contype: "c", definition: "CHECK ((reason = ANY(ARRAY['CONTACT_RECONCILED_AFTER_DIVERGENCE'::text, 'PLAN_REGENERATED_AFTER_SAFE_CORRECTION'::text])))", columns: JSON.stringify(["reason"]) },
              { conname: "single_case_rebind_audit_requested_by_check", contype: "c", definition: "CHECK ((requested_by ~ '^[A-Za-z][A-Za-z0-9._:-]{2,63}$'::text))", columns: JSON.stringify(["requested_by"]) },
              { conname: "single_case_rebind_audit_token_check", contype: "c", definition: "CHECK ((fencing_token > 0))", columns: JSON.stringify(["fencing_token"]) },
              { conname: "single_case_rebind_audit_lease_id_check", contype: "c", definition: "CHECK ((lease_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{2,127}$'::text))", columns: JSON.stringify(["lease_id"]) }
            ]
          }
        }
        if (sql.includes("FROM pg_index")) {
          return { rowCount: 2, rows: [
            { schema_name: "public", table_name: "single_case_apply_rebind_audit", index_name: "single_case_rebind_audit_case_committed_idx", is_unique: false, method: "btree", key_attribute_count: 2, total_attribute_count: 2, has_expressions: false, has_predicate: false, key_columns: ["case_import_id", "committed_at"], key_descending: [false, true] },
            { schema_name: "public", table_name: "single_case_apply_rebind_audit", index_name: "single_case_rebind_audit_case_source_current_idx", is_unique: true, method: "btree", key_attribute_count: 3, total_attribute_count: 3, has_expressions: false, has_predicate: false, key_columns: ["case_import_id", "source_checkpoint_version", "current_authorization_set_hash"], key_descending: [false, false, false] }
          ] }
        }
        return { rowCount: 0, rows: [] }
      },
      release: () => {}
    }),
    query: async (sql) => {
      if (sql.includes("checkpoint_payload")) return { rowCount: 1, rows: [{ checkpoint_payload: checkpoint }] }
      if (sql.includes("committed_at")) return { rowCount: 1, rows: [{ committed_at: "2026-01-01T00:00:00.000Z" }] }
      return { rowCount: 0, rows: [] }
    },
    end: async () => {}
  }
}

function runtime(pool, executeRebind, cliArgs, coordination) {
  const lease = { caseImportId, leaseId: "lease-fixture-rebind", fencingToken: 7, owner: "single-case-real-composition", expiresAt: "2026-01-01T00:01:00.000Z" }
  const defaultCoordination = { acquireLease: async () => lease, releaseLease: async () => ({ released: true }) }
  return main({ argv: cliArgs, configReader: async () => ({ connectionString: "postgres://redacted", env: {} }), poolFactory: () => pool, repositoryFactory: () => ({ executeRebind }), coordinationFactory: () => coordination || defaultCoordination })
}

test("argumento ausente falha", () => assert.throws(() => parseArgs([]), /CASE_IMPORT_ID_MISSING/))
test("reason inválido falha", () => assert.throws(() => parseArgs(["--case-import-id", caseImportId, "--requested-by", "operator-01", "--reason", "OTHER", "--reconciliation-evidence-file", "x", "--new-authorization-ids", "[]"]), /RECONCILIATION_EVIDENCE_FILE_NOT_ALLOWED_FOR_REASON|REBIND_REASON_NOT_ALLOWED/))
test("IDs do novo Authorization Pair inválidos falham", () => assert.throws(() => parseArgs(["--case-import-id", caseImportId, "--requested-by", "operator-01", "--reason", "CONTACT_RECONCILED_AFTER_DIVERGENCE", "--reconciliation-evidence-file", "x", "--new-authorization-ids", "[\"short\"]"]), /REBIND_NEW_AUTHORIZATION_IDS_WRONG_COUNT/))

test("evidência inválida falha", async () => {
  const file = await evidenceFile({ ...evidence, decision: "NO" })
  const pool = mockPoolWithMigration()
  await assert.rejects(runtime(pool, async () => {}, argv(file)), /RECONCILIATION_EVIDENCE_NOT_ELIGIBLE/)
})

test("execução válida chama executeRebind e retorna apenas resultado sanitizado", async () => {
  const file = await evidenceFile(); let received
  const pool = mockPoolWithMigration()
  const result = await runtime(pool, async request => { received = request; return { rebindId: "b".repeat(64), status: "rebound", sourceCheckpointVersion: 1, reboundCheckpointVersion: 2, oldAuthorizationIds, newAuthorizationIds } }, argv(file))
  assert.equal(received.sourceCheckpointVersion, 1)
  assert.deepEqual(received.oldAuthorizationIds, [...oldAuthorizationIds].sort())
  assert.deepEqual(Object.keys(result).sort(), ["committedAt", "rebindId", "reboundCheckpointVersion", "sourceCheckpointVersion", "status"].sort())
  assert.doesNotMatch(JSON.stringify(result), /auth-id|operator-01|contact-123/)
})

test("migração é executada antes de executeRebind", async () => {
  const file = await evidenceFile()
  let migrationCalled = false, rebindCalled = false, migrationCalledFirst = false
  const pool = mockPoolWithMigration()
  const originalConnect = pool.connect
  pool.connect = async () => {
    migrationCalled = true
    if (!rebindCalled) migrationCalledFirst = true
    return originalConnect()
  }
  const executeRebind = async () => { rebindCalled = true; return { rebindId: "c".repeat(64), status: "rebound", sourceCheckpointVersion: 1, reboundCheckpointVersion: 2 } }

  await main({
    argv: argv(file),
    configReader: async () => ({ connectionString: "postgres://test", env: {} }),
    poolFactory: () => pool,
    repositoryFactory: () => ({ executeRebind }),
    coordinationFactory: () => ({ acquireLease: async () => ({ caseImportId, leaseId: "lease-fixture-rebind", fencingToken: 7, owner: "single-case-real-composition" }), releaseLease: async () => ({ released: true }) })
  })

  assert.equal(migrationCalled, true, "migração não foi chamada")
  assert.equal(migrationCalledFirst, true, "migração não foi chamada antes de executeRebind")
})

test("falha na migração impede executeRebind", async () => {
  const file = await evidenceFile()
  let rebindCalled = false
  const pool = {
    connect: async () => { throw new Error("SCHEMA_INCOMPATIBLE") },
    query: async () => { throw new Error("SCHEMA_INCOMPATIBLE") },
    end: async () => {}
  }
  const executeRebind = async () => { rebindCalled = true; return { rebindId: "d".repeat(64), status: "rebound", sourceCheckpointVersion: 1, reboundCheckpointVersion: 2 } }

  await assert.rejects(
    main({
      argv: argv(file),
      configReader: async () => ({ connectionString: "postgres://test", env: {} }),
      poolFactory: () => pool,
      repositoryFactory: () => ({ executeRebind })
    }),
    /POSTGRES_UNAVAILABLE|SCHEMA_INCOMPATIBLE/
  )

  assert.equal(rebindCalled, false, "executeRebind foi chamado após falha na migração")
})

test("pool é encerrado quando migração falha", async () => {
  const file = await evidenceFile()
  let poolEnded = false
  const pool = {
    connect: async () => { throw new Error("SCHEMA_INCOMPATIBLE") },
    query: async () => { throw new Error("SCHEMA_INCOMPATIBLE") },
    end: async () => { poolEnded = true }
  }

  await assert.rejects(
    main({
      argv: argv(file),
      configReader: async () => ({ connectionString: "postgres://test", env: {} }),
      poolFactory: () => pool,
      repositoryFactory: () => ({ executeRebind: async () => {} })
    })
  )

  assert.equal(poolEnded, true, "pool não foi encerrado após falha na migração")
})

test("erro PostgreSQL é sanitizado", async () => {
  const file = await evidenceFile()
  const pool = mockPoolWithMigration()
  pool.query = async () => { throw new Error("password=secret host=private") }
  await assert.rejects(runtime(pool, async () => {}, argv(file)), /POSTGRES_TRANSACTION_FAILED|POSTGRES_UNAVAILABLE/)
  assert.equal(sanitizeError(new Error("password=secret host=private")), "REBIND_FAILED_CLOSED")
  assert.deepEqual(sanitizeDiagnostics(new Error("password=secret host=private")), { causeCode: "REBIND_CAUSE_REDACTED", phase: "unknown" })
})

test("diagnostico sanitizado preserva causa permitida", () => {
  assert.deepEqual(sanitizeDiagnostics(new Error("NEW_AUTHORIZATION_IDS_INVALID_JSON")), { causeCode: "NEW_AUTHORIZATION_IDS_INVALID_JSON", phase: "arguments" })
  assert.deepEqual(sanitizeDiagnostics(new Error("REBIND_REASON_NOT_ALLOWED")), { causeCode: "REBIND_REASON_NOT_ALLOWED", phase: "arguments" })
})

test("CLI adquire lease, passa fencing e libera uma vez", async () => {
  const file = await evidenceFile(), pool = mockPoolWithMigration(), calls = []
  const lease = { caseImportId, leaseId: "lease-fixture-rebind", fencingToken: 8, owner: "single-case-real-composition" }
  const result = await main({ argv: argv(file), configReader: async () => ({ connectionString: "postgres://redacted", env: {} }), poolFactory: () => pool,
    coordinationFactory: () => ({ acquireLease: async request => { calls.push(["acquire", request]); return lease }, releaseLease: async request => { calls.push(["release", request]); return { released: true } } }),
    repositoryFactory: options => { assert.equal(options.expectedLease, lease); return { executeRebind: async () => ({ rebindId: "e".repeat(64), status: "rebound", sourceCheckpointVersion: 1, reboundCheckpointVersion: 2 }) } } })
  assert.equal(result.status, "rebound"); assert.deepEqual(calls.map(item => item[0]), ["acquire", "release"]); assert.equal(calls[1][1].fencingToken, 8)
})

test("falha de aquisicao impede REBIND e release", async () => {
  const file = await evidenceFile(), pool = mockPoolWithMigration(); let rebindCalls = 0, releaseCalls = 0
  await assert.rejects(main({ argv: argv(file), configReader: async () => ({ connectionString: "postgres://redacted", env: {} }), poolFactory: () => pool,
    coordinationFactory: () => ({ acquireLease: async () => { throw new Error("LEASE_ALREADY_HELD") }, releaseLease: async () => { releaseCalls++ } }), repositoryFactory: () => ({ executeRebind: async () => { rebindCalls++ } }) }), /LEASE_ALREADY_HELD/)
  assert.equal(rebindCalls, 0); assert.equal(releaseCalls, 0)
})

test("falha de REBIND preserva erro e libera lease", async () => {
  const file = await evidenceFile(), pool = mockPoolWithMigration(); let releaseCalls = 0
  await assert.rejects(runtime(pool, async () => { throw new Error("REBIND_LEASE_FENCING_MISMATCH") }, argv(file), { acquireLease: async () => ({ caseImportId, leaseId: "lease-fixture-rebind", fencingToken: 9, owner: "single-case-real-composition" }), releaseLease: async () => { releaseCalls++; return { released: true } } }), /REBIND_LEASE_FENCING_MISMATCH/)
  assert.equal(releaseCalls, 1)
})

test("falha de release apos sucesso preserva resultado", async () => {
  const file = await evidenceFile(), pool = mockPoolWithMigration()
  const result = await runtime(pool, async () => ({ rebindId: "f".repeat(64), status: "rebound", sourceCheckpointVersion: 1, reboundCheckpointVersion: 2 }), argv(file), { acquireLease: async () => ({ caseImportId, leaseId: "lease-fixture-rebind", fencingToken: 10, owner: "single-case-real-composition" }), releaseLease: async () => { throw new Error("secret") } })
  assert.deepEqual(result.operationalWarnings, ["LEASE_RELEASE_FAILED"])
})

test("concorrencia permite somente uma aquisicao", async () => {
  const file = await evidenceFile(); let held = false
  let arriveResolve = () => {}
  const arrivePromise = new Promise(resolve => { arriveResolve = resolve })
  let proceedResolve = () => {}
  const proceedPromise = new Promise(resolve => { proceedResolve = resolve })
  const coordination = {
    async acquireLease() {
      if (held) throw new Error("LEASE_ALREADY_HELD")
      held = true
      return { caseImportId, leaseId: "lease-fixture-rebind", fencingToken: 11, owner: "single-case-real-composition" }
    },
    async releaseLease() {
      held = false
      return { released: true }
    }
  }
  const first = runtime(mockPoolWithMigration(), async () => { arriveResolve(); await proceedPromise; return { rebindId: "1".repeat(64), status: "rebound", sourceCheckpointVersion: 1, reboundCheckpointVersion: 2 } }, argv(file), coordination)
  await arrivePromise
  const second = runtime(mockPoolWithMigration(), async () => ({ rebindId: "2".repeat(64), status: "rebound", sourceCheckpointVersion: 1, reboundCheckpointVersion: 2 }), argv(file), coordination)
  const secondResult = await Promise.allSettled([second])
  proceedResolve()
  const settled = await Promise.allSettled([first])
  assert.equal(settled.filter(item => item.status === "fulfilled").length, 1)
  assert.equal(secondResult.filter(item => item.status === "rejected").length, 1)
})

test("operador não pode informar estado derivado", () => assert.throws(() => parseArgs([...argv("evidence.json"), "--old-authorization-ids", "[]"]), /CLI_STATE_ARGUMENT_FORBIDDEN/))

// Novos testes para reconciliation evidence condicional
const newHashes = { newAuthorizablePlanHash: "a".repeat(64), newPlanHash: "b".repeat(64), newManifestHash: "c".repeat(64) }
const planNewAuthorizationIds = ["auth-id-plan-1", "auth-id-plan-2"]

test("PLAN_REGENERATED sem evidence file é aceito quando hashes e IDs válidos", async () => {
  const pool = mockPoolWithMigration()
  let received
  const repository = {
    executeRebind: async (req) => {
      received = req
      return { rebindId: "p".repeat(64), status: "rebound", sourceCheckpointVersion: 1, reboundCheckpointVersion: 2 }
    }
  }
  const coordination = {
    acquireLease: async () => ({ caseImportId, leaseId: "lease-fixture", fencingToken: 1, owner: "single-case-real-composition" }),
    releaseLease: async () => ({ released: true })
  }
  const cliArgs = ["--case-import-id", caseImportId, "--requested-by", "operator-01", "--reason", "PLAN_REGENERATED_AFTER_SAFE_CORRECTION", "--new-authorization-ids", JSON.stringify(planNewAuthorizationIds), "--new-authorizable-plan-hash", newHashes.newAuthorizablePlanHash, "--new-plan-hash", newHashes.newPlanHash, "--new-manifest-hash", newHashes.newManifestHash]
  const result = await main({ argv: cliArgs, configReader: async () => ({ connectionString: "postgres://redacted", env: {} }), poolFactory: () => pool, repositoryFactory: () => repository, coordinationFactory: () => coordination })
  assert.equal(result.status, "rebound")
  assert.equal(received.reason, "PLAN_REGENERATED_AFTER_SAFE_CORRECTION")
  assert.equal(received.reconciliationEvidenceHash, null)
})

test("PLAN_REGENERATED sem hashes é rejeitado", () => {
  const cliArgs = ["--case-import-id", caseImportId, "--requested-by", "operator-01", "--reason", "PLAN_REGENERATED_AFTER_SAFE_CORRECTION", "--new-authorization-ids", JSON.stringify(planNewAuthorizationIds)]
  assert.throws(() => parseArgs(cliArgs), /NEW_AUTHORIZABLE_PLAN_HASH_MISSING/)
})

test("PLAN_REGENERATED com IDs antigos reutilizados é rejeitado", async () => {
  const pool = mockPoolWithMigration()
  const cliArgs = ["--case-import-id", caseImportId, "--requested-by", "operator-01", "--reason", "PLAN_REGENERATED_AFTER_SAFE_CORRECTION", "--new-authorization-ids", JSON.stringify(oldAuthorizationIds), "--new-authorizable-plan-hash", newHashes.newAuthorizablePlanHash, "--new-plan-hash", newHashes.newPlanHash, "--new-manifest-hash", newHashes.newManifestHash]
  await assert.rejects(main({ argv: cliArgs, configReader: async () => ({ connectionString: "postgres://redacted", env: {} }), poolFactory: () => pool, repositoryFactory: () => ({ executeRebind: async () => ({ rebindId: "q".repeat(64), status: "rebound", sourceCheckpointVersion: 1, reboundCheckpointVersion: 2 }) }), coordinationFactory: () => ({ acquireLease: async () => ({ caseImportId, leaseId: "lease-fixture", fencingToken: 1, owner: "single-case-real-composition" }), releaseLease: async () => ({ released: true }) }) }), /REBIND_NEW_AUTHORIZATION_IDS_INVALID/)
})

test("PLAN_REGENERATED com IDs duplicados é rejeitado", () => {
  const cliArgs = ["--case-import-id", caseImportId, "--requested-by", "operator-01", "--reason", "PLAN_REGENERATED_AFTER_SAFE_CORRECTION", "--new-authorization-ids", JSON.stringify(["same-id", "same-id"]), "--new-authorizable-plan-hash", newHashes.newAuthorizablePlanHash, "--new-plan-hash", newHashes.newPlanHash, "--new-manifest-hash", newHashes.newManifestHash]
  assert.throws(() => parseArgs(cliArgs), /REBIND_NEW_AUTHORIZATION_IDS_INVALID/)
})

test("PLAN_REGENERATED com evidence file de contato é rejeitado", () => {
  const cliArgs = ["--case-import-id", caseImportId, "--requested-by", "operator-01", "--reason", "PLAN_REGENERATED_AFTER_SAFE_CORRECTION", "--reconciliation-evidence-file", "x.json", "--new-authorization-ids", JSON.stringify(planNewAuthorizationIds), "--new-authorizable-plan-hash", newHashes.newAuthorizablePlanHash, "--new-plan-hash", newHashes.newPlanHash, "--new-manifest-hash", newHashes.newManifestHash]
  assert.throws(() => parseArgs(cliArgs), /RECONCILIATION_EVIDENCE_FILE_NOT_ALLOWED_FOR_REASON/)
})

test("CONTACT_RECONCILED sem evidence file é rejeitado", () => {
  const cliArgs = ["--case-import-id", caseImportId, "--requested-by", "operator-01", "--reason", "CONTACT_RECONCILED_AFTER_DIVERGENCE", "--new-authorization-ids", JSON.stringify(newAuthorizationIds)]
  assert.throws(() => parseArgs(cliArgs), /RECONCILIATION_EVIDENCE_FILE_MISSING/)
})

test("CONTACT_RECONCILED com evidência inválida continua rejeitado", async () => {
  const file = await evidenceFile({ decision: "NO" })
  const pool = mockPoolWithMigration()
  await assert.rejects(runtime(pool, async () => {}, ["--case-import-id", caseImportId, "--requested-by", "operator-01", "--reason", "CONTACT_RECONCILED_AFTER_DIVERGENCE", "--reconciliation-evidence-file", file, "--new-authorization-ids", JSON.stringify(newAuthorizationIds)]), /RECONCILIATION_EVIDENCE_NOT_ELIGIBLE/)
})
