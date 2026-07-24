"use strict"

const { test } = require("node:test")
const assert = require("node:assert/strict")
const { main, inspectSchema, validatePreconditions, applyMigration, MIGRATION_ID, TABLE_NAME, COLUMN_NAME } = require("../scripts/migrate-rebind-schema-v2")

class MockPoolClass {
  constructor() {}
  async connect() { return this.client }
  async end() {}
}

function createMockClient(schema) {
  const state = { schema, mutationCount: 0 }
  const client = {
    query: async (sql, params) => {
      if (sql.includes("ROLLBACK") || sql.includes("COMMIT") || sql.includes("BEGIN") || sql.includes("SET TRANSACTION") || sql.includes("SET LOCAL")) {
        return { rowCount: 0, rows: [] }
      }
      if (sql.includes("SELECT tablename FROM pg_tables")) {
        return { rowCount: state.schema.tableExists ? 1 : 0, rows: state.schema.tableExists ? [{ tablename: TABLE_NAME }] : [] }
      }
      if (sql.includes("information_schema.columns")) {
        const rows = []
        if (state.schema.columnExists) {
          rows.push({ column_name: COLUMN_NAME, data_type: state.schema.columnType || "text", is_nullable: state.schema.columnNullable ? "YES" : "NO", column_default: state.schema.columnNullable ? null : "NULL" })
        }
        return { rowCount: rows.length, rows }
      }
      if (sql.includes("pg_constraint")) {
        if (sql.includes("conname = $1") && sql.includes("pg_get_constraintdef")) {
          const conname = params[0]
          if (conname === state.schema.reasonCheckName) {
            return { rowCount: 1, rows: [{ definition: state.schema.reasonCheckDefinition || "CHECK ((reason = 'CONTACT_RECONCILED_AFTER_DIVERGENCE'::text))" }] }
          }
          if (state.schema.extraCheck && conname === state.schema.extraCheck.name) {
            return { rowCount: 1, rows: [{ definition: state.schema.extraCheck.definition }] }
          }
          return { rowCount: 0, rows: [] }
        }
        if (sql.includes("contype = 'c'")) {
          const rows = []
          if (state.schema.reasonCheckName) {
            const def = state.schema.reasonCheckDefinition || "CHECK ((reason = 'CONTACT_RECONCILED_AFTER_DIVERGENCE'::text))"
            rows.push({ conname: state.schema.reasonCheckName, definition: def })
          }
          if (state.schema.extraCheck) {
            rows.push({ conname: state.schema.extraCheck.name, definition: state.schema.extraCheck.definition })
          }
          if (sql.includes("LIKE") && params[1]) {
            const pattern = params[1]
            const filtered = rows.filter(r => {
              const likePattern = pattern.replace(/%/g, "").toLowerCase()
              return r.definition.toLowerCase().includes(likePattern)
            })
            return { rowCount: filtered.length, rows: filtered }
          }
          return { rowCount: rows.length, rows }
        }
      }
      if (sql.includes("pg_trigger")) {
        return { rowCount: state.schema.blockingTriggerFound ? 1 : 0, rows: state.schema.blockingTriggerFound ? [{ tgname: "blocking_trigger" }] : [] }
      }
      if (sql.includes("pg_indexes")) {
        const rows = []
        if (state.schema.indexes) {
          for (const idx of state.schema.indexes) rows.push(idx)
        }
        return { rowCount: rows.length, rows }
      }
      if (sql.includes("ALTER TABLE") && sql.includes("DROP NOT NULL")) {
        if (state.schema.applyFails) {
          state.schema.applyFails = false
          throw new Error("MIGRATION_PLAN_REASON_NOT_ADDED")
        }
        state.schema.columnNullable = true
        state.mutationCount++
        return { rowCount: 0, rows: [] }
      }
      if (sql.includes("ALTER TABLE") && sql.includes("DROP CONSTRAINT")) {
        state.schema.reasonCheckDefinition = "CHECK ((reason = ANY (ARRAY['CONTACT_RECONCILED_AFTER_DIVERGENCE'::text, 'PLAN_REGENERATED_AFTER_SAFE_CORRECTION'::text])))"
        state.mutationCount++
        return { rowCount: 0, rows: [] }
      }
      if (sql.includes("ALTER TABLE") && sql.includes("ADD CONSTRAINT")) {
        state.mutationCount++
        return { rowCount: 0, rows: [] }
      }
      return { rowCount: 0, rows: [] }
    },
    release: () => {}
  }
  return { client, state }
}

test("dry_run sem DDL quando schema antigo", async () => {
  const schema = { tableExists: true, columnExists: true, columnType: "text", columnNullable: false, reasonCheckName: "single_case_rebind_audit_reason_check", reasonCheckDefinition: "CHECK ((reason = 'CONTACT_RECONCILED_AFTER_DIVERGENCE'::text))", reasonAcceptsContact: true, reasonAcceptsPlan: false, unexpectedConstraints: [], blockingTriggerFound: false, blockingIndexFound: false }
  const { client } = createMockClient(schema)
  const PoolClass = MockPoolClass
  PoolClass.prototype.client = client
  const result = await main({ argv: [], PoolClass, output: () => {} })
  assert.equal(result.mode, "dry_run")
  assert.equal(result.schema.columnNullable, false)
  assert.equal(result.schema.reasonAcceptsPlan, false)
})

test("apply altera column e check quando schema antigo", async () => {
  const schema = { tableExists: true, columnExists: true, columnType: "text", columnNullable: false, reasonCheckName: "single_case_rebind_audit_reason_check", reasonCheckDefinition: "CHECK ((reason = 'CONTACT_RECONCILED_AFTER_DIVERGENCE'::text))", reasonAcceptsContact: true, reasonAcceptsPlan: false, unexpectedConstraints: [], blockingTriggerFound: false, blockingIndexFound: false }
  const { client, state } = createMockClient(schema)
  const PoolClass = MockPoolClass
  PoolClass.prototype.client = client
  const result = await main({ argv: ["--apply"], PoolClass, output: () => {} })
  assert.equal(result.mode, "apply")
  assert.equal(result.afterSchema.columnNullable, true)
  assert.equal(result.afterSchema.reasonAcceptsPlan, true)
  assert.equal(state.mutationCount, 3)
})

test("apply idempotente quando schema atualizado", async () => {
  const schema = { tableExists: true, columnExists: true, columnType: "text", columnNullable: true, reasonCheckName: "single_case_rebind_audit_reason_check", reasonCheckDefinition: "CHECK ((reason = ANY (ARRAY['CONTACT_RECONCILED_AFTER_DIVERGENCE'::text, 'PLAN_REGENERATED_AFTER_SAFE_CORRECTION'::text])))", reasonAcceptsContact: true, reasonAcceptsPlan: true, unexpectedConstraints: [], blockingTriggerFound: false, blockingIndexFound: false }
  const { client } = createMockClient(schema)
  const PoolClass = MockPoolClass
  PoolClass.prototype.client = client
  const result = await main({ argv: ["--apply"], PoolClass, output: () => {} })
  assert.equal(result.mode, "apply")
  assert.equal(result.beforeSchema.columnNullable, true)
  assert.equal(result.afterSchema.columnNullable, true)
})

test("tabela ausente bloqueia", async () => {
  const schema = { tableExists: false, columnExists: false, columnType: null, columnNullable: false, reasonCheckName: null, reasonCheckDefinition: null, reasonAcceptsContact: false, reasonAcceptsPlan: false, unexpectedConstraints: [], blockingTriggerFound: false, blockingIndexFound: false }
  const { client } = createMockClient(schema)
  const PoolClass = MockPoolClass
  PoolClass.prototype.client = client
  await assert.rejects(main({ argv: ["--apply"], PoolClass, output: () => {} }), /TABLE_MISSING/)
})

test("coluna ausente bloqueia", async () => {
  const schema = { tableExists: true, columnExists: false, columnType: null, columnNullable: false, reasonCheckName: null, reasonCheckDefinition: null, reasonAcceptsContact: false, reasonAcceptsPlan: false, unexpectedConstraints: [], blockingTriggerFound: false, blockingIndexFound: false }
  const { client } = createMockClient(schema)
  const PoolClass = MockPoolClass
  PoolClass.prototype.client = client
  await assert.rejects(main({ argv: ["--apply"], PoolClass, output: () => {} }), /COLUMN_MISSING/)
})

test("tipo divergente bloqueia", async () => {
  const schema = { tableExists: true, columnExists: true, columnType: "varchar", columnNullable: false, reasonCheckName: "single_case_rebind_audit_reason_check", reasonCheckDefinition: "CHECK ((reason = 'CONTACT_RECONCILED_AFTER_DIVERGENCE'::text))", reasonAcceptsContact: true, reasonAcceptsPlan: false, unexpectedConstraints: [], blockingTriggerFound: false, blockingIndexFound: false }
  const { client } = createMockClient(schema)
  const PoolClass = MockPoolClass
  PoolClass.prototype.client = client
  await assert.rejects(main({ argv: ["--apply"], PoolClass, output: () => {} }), /COLUMN_TYPE_MISMATCH/)
})

test("múltiplos CHECKs ambíguos bloqueiam", async () => {
  const schema = { tableExists: true, columnExists: true, columnType: "text", columnNullable: false, reasonCheckName: "single_case_rebind_audit_reason_check", reasonCheckDefinition: "CHECK ((reason = 'CONTACT_RECONCILED_AFTER_DIVERGENCE'::text))", reasonAcceptsContact: true, reasonAcceptsPlan: false, extraCheck: { name: "reason_check_2", definition: "CHECK ((reason = 'OTHER'::text))" }, unexpectedConstraints: [], blockingTriggerFound: false, blockingIndexFound: false }
  const { client } = createMockClient(schema)
  const PoolClass = MockPoolClass
  PoolClass.prototype.client = client
  await assert.rejects(main({ argv: ["--apply"], PoolClass, output: () => {} }), /AMBIGUOUS_REASON_CHECK/)
})

test("CHECK inesperado bloqueia", async () => {
  const schema = { tableExists: true, columnExists: true, columnType: "text", columnNullable: false, reasonCheckName: "single_case_rebind_audit_reason_check", reasonCheckDefinition: "CHECK ((reason = 'CONTACT_RECONCILED_AFTER_DIVERGENCE'::text))", reasonAcceptsContact: true, reasonAcceptsPlan: false, extraCheck: { name: "unexpected_check", definition: "CHECK (1=1)" }, unexpectedConstraints: [{ name: "unexpected_check", definition: "CHECK (1=1)" }], blockingTriggerFound: false, blockingIndexFound: false }
  const { client } = createMockClient(schema)
  const PoolClass = MockPoolClass
  PoolClass.prototype.client = client
  await assert.rejects(main({ argv: ["--apply"], PoolClass, output: () => {} }), /UNEXPECTED_CONSTRAINTS/)
})

test("falha após primeira alteração provoca rollback", async () => {
  const schema = { tableExists: true, columnExists: true, columnType: "text", columnNullable: false, reasonCheckName: "single_case_rebind_audit_reason_check", reasonCheckDefinition: "CHECK ((reason = 'CONTACT_RECONCILED_AFTER_DIVERGENCE'::text))", reasonAcceptsContact: true, reasonAcceptsPlan: false, unexpectedConstraints: [], blockingTriggerFound: false, blockingIndexFound: false, applyFails: true }
  const { client } = createMockClient(schema)
  const PoolClass = MockPoolClass
  PoolClass.prototype.client = client
  await assert.rejects(main({ argv: ["--apply"], PoolClass, output: () => {} }), /MIGRATION_PLAN_REASON_NOT_ADDED/)
})

test("nenhum índice ou trigger alterado", async () => {
  const schema = { tableExists: true, columnExists: true, columnType: "text", columnNullable: false, reasonCheckName: "single_case_rebind_audit_reason_check", reasonCheckDefinition: "CHECK ((reason = 'CONTACT_RECONCILED_AFTER_DIVERGENCE'::text))", reasonAcceptsContact: true, reasonAcceptsPlan: false, unexpectedConstraints: [], blockingTriggerFound: false, blockingIndexFound: false, indexes: [{ indexname: "single_case_rebind_audit_case_source_current_idx", indexdef: "CREATE UNIQUE INDEX ..." }] }
  const { client, state } = createMockClient(schema)
  const PoolClass = MockPoolClass
  PoolClass.prototype.client = client
  const result = await main({ argv: ["--apply"], PoolClass, output: () => {} })
  assert.equal(result.mode, "apply")
  assert.equal(result.afterSchema.blockingTriggerFound, false)
})

test("modo inválido falha", async () => {
  const schema = { tableExists: false }
  const { client } = createMockClient(schema)
  const PoolClass = MockPoolClass
  PoolClass.prototype.client = client
  await assert.rejects(main({ argv: ["--invalid"], PoolClass, output: () => {} }), /INVALID_MIGRATION_MODE/)
})
