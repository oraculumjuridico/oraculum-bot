"use strict"

const test = require("node:test")
const assert = require("node:assert/strict")
const { MIGRATION_ID, ALTER_SQL, validateAuthorizationV2Schema, migrateSingleCaseAuthorizationV2 } = require("../src/infrastructure/single-case-authorization-v2-migration")

function harness({ migrated = false, complete = true } = {}) {
  const state = { migrated, alters: 0, inserts: 0, commits: 0, rollbacks: 0 }
  const client = { async query(sql) {
    const text = String(sql).replace(/\s+/g, " ").trim()
    if (text === "BEGIN") return { rows: [], rowCount: 0 }
    if (text === "COMMIT") { state.commits++; return { rows: [], rowCount: 0 } }
    if (text === "ROLLBACK") { state.rollbacks++; return { rows: [], rowCount: 0 } }
    if (text.includes("to_regclass('oraculum_state_migrations')")) return { rows: [{ table_name: "oraculum_state_migrations" }], rowCount: 1 }
    if (text.startsWith("SELECT migration_id")) return { rows: state.migrated ? [{ migration_id: MIGRATION_ID }] : [], rowCount: state.migrated ? 1 : 0 }
    if (text.startsWith("ALTER TABLE")) { state.alters++; return { rows: [], rowCount: 0 } }
    if (text.includes("information_schema.columns")) return { rows: complete ? ["consumed_at", "consumed_by", "manifest_hash", "plan_hash", "reservation_evidence_hash"].map(column_name => ({ column_name, is_nullable: "YES" })) : [], rowCount: complete ? 5 : 0 }
    if (text.includes("FROM pg_constraint")) return { rows: complete ? ["single_case_auth_consumption_check", "single_case_auth_v2_binding_check", "single_case_auth_v2_scope_check"].map(conname => ({ conname })) : [], rowCount: complete ? 3 : 0 }
    if (text.includes("FROM pg_indexes")) return { rows: complete ? [{ indexname: "single_case_auth_unconsumed_binding" }] : [], rowCount: complete ? 1 : 0 }
    if (text.startsWith("INSERT INTO oraculum_state_migrations")) { state.migrated = true; state.inserts++; return { rows: [], rowCount: 1 } }
    throw new Error("UNEXPECTED_SQL")
  }, release() {} }
  return { state, connect: async () => client, query: client.query.bind(client) }
}

test("migração v2 é versionada, idempotente e não executa ao importar", async () => { const db=harness();assert.equal(db.state.alters,0);assert((await migrateSingleCaseAuthorizationV2(db)).applied);assert.equal((await migrateSingleCaseAuthorizationV2(db)).applied,false);assert.deepEqual({alters:db.state.alters,inserts:db.state.inserts,commits:db.state.commits},{alters:1,inserts:1,commits:2}) })
test("schema v2 exige cinco campos, três constraints e índice", async () => { assert.equal((await validateAuthorizationV2Schema(harness())).ok,true);const invalid=await validateAuthorizationV2Schema(harness({complete:false}));assert.equal(invalid.ok,false);assert.deepEqual(invalid.codes,["V2_COLUMNS_MISSING","V2_CONSTRAINTS_MISSING","V2_INDEX_MISSING"]) })
test("DDL preserva v1 e condiciona v2, consumo e índice", () => { assert.match(ALTER_SQL,/schema_version = 1 OR/);assert.match(ALTER_SQL,/schema_version = 2/);assert.match(ALTER_SQL,/consumed_at/);assert.match(ALTER_SQL,/consumed_by/);assert.match(ALTER_SQL,/single_case_auth_unconsumed_binding/) })
test("divergência causa rollback e não registra migração", async () => { const db=harness({complete:false});await assert.rejects(()=>migrateSingleCaseAuthorizationV2(db),/SCHEMA_INCOMPATIBLE/);assert.equal(db.state.inserts,0);assert.equal(db.state.commits,0);assert.equal(db.state.rollbacks,1) })
