#!/usr/bin/env node
"use strict"

const { Pool } = require("pg")
const { loadOperationalEnvironment } = require("../src/composition/oraculum-runtime-env")

const TABLE_NAME = "single_case_apply_rebind_audit"
const MIGRATION_ID = "single-case-apply-rebind-audit-v3"
const COLUMN_NAME = "reconciliation_evidence_hash"
const EXPECTED_REASONS = Object.freeze([
  "CONTACT_RECONCILED_AFTER_DIVERGENCE",
  "PLAN_REGENERATED_AFTER_SAFE_CORRECTION",
  "AUTHORIZATION_PAIR_REFRESHED_AFTER_EXPIRY"
])

function parseMode(argv) {
  if (argv.length === 0) return "dry_run"
  if (argv.length === 1 && argv[0] === "--apply") return "apply"
  if (argv.length === 1 && argv[0] === "--dry-run") return "dry_run"
  throw new Error("INVALID_MIGRATION_MODE")
}

async function discoverReasonCheckName(client, tableName) {
  const result = await client.query(
    "SELECT conname FROM pg_constraint WHERE conrelid = $1::regclass AND contype = 'c' AND pg_get_constraintdef(oid) LIKE $2",
    [tableName, "%reason = %"]
  )
  if (result.rowCount === 0) return null
  if (result.rowCount > 1) {
    const names = result.rows.map(r => r.conname)
    throw new Error(`AMBIGUOUS_REASON_CHECK: ${names.join(", ")}`)
  }
  return result.rows[0].conname
}

async function inspectSchema(client) {
  const out = {
    tableExists: false,
    columnExists: false,
    columnType: null,
    columnNullable: false,
    reasonCheckName: null,
    reasonAcceptsContact: false,
    reasonAcceptsPlan: false,
    reasonAcceptsAuthRefresh: false,
    unexpectedConstraints: [],
    blockingTriggerFound: false,
    blockingIndexFound: false
  }

  const tableResult = await client.query("SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename = $1", [TABLE_NAME])
  out.tableExists = tableResult.rowCount === 1
  if (!out.tableExists) return out

  const colResult = await client.query("SELECT data_type, is_nullable FROM information_schema.columns WHERE table_name = $1 AND column_name = $2", [TABLE_NAME, COLUMN_NAME])
  if (colResult.rowCount === 1) {
    out.columnExists = true
    out.columnType = colResult.rows[0].data_type
    out.columnNullable = colResult.rows[0].is_nullable === "YES"
  }

  const checkResult = await client.query("SELECT conname, pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE conrelid = $1::regclass AND contype = 'c'", [TABLE_NAME])
  const expectedCheckNames = new Set([
    "single_case_rebind_audit_rebind_id_check",
    "single_case_rebind_audit_case_id_check",
    "single_case_rebind_audit_source_version_check",
    "single_case_rebind_audit_rebound_version_check",
    "single_case_rebind_audit_auth_count_check",
    "single_case_rebind_audit_previous_hash_check",
    "single_case_rebind_audit_current_hash_check",
    "single_case_rebind_audit_evidence_hash_check",
    "single_case_rebind_audit_reason_check",
    "single_case_rebind_audit_requested_by_check",
    "single_case_rebind_audit_token_check",
    "single_case_rebind_audit_lease_id_check"
  ])

  for (const row of checkResult.rows) {
    if (!expectedCheckNames.has(row.conname)) {
      out.unexpectedConstraints.push({ name: row.conname, definition: row.definition })
    }
    if (row.conname === "single_case_rebind_audit_reason_check") {
      out.reasonCheckName = row.conname
      const def = row.definition
      out.reasonAcceptsContact = def.includes("CONTACT_RECONCILED_AFTER_DIVERGENCE")
      out.reasonAcceptsPlan = def.includes("PLAN_REGENERATED_AFTER_SAFE_CORRECTION")
      out.reasonAcceptsAuthRefresh = def.includes("AUTHORIZATION_PAIR_REFRESHED_AFTER_EXPIRY")
    }
  }

  const triggerResult = await client.query("SELECT tgname FROM pg_trigger WHERE tgrelid = $1::regclass AND NOT tgisinternal", [TABLE_NAME])
  out.blockingTriggerFound = triggerResult.rowCount > 0

  const indexResult = await client.query("SELECT indexname, indexdef FROM pg_indexes WHERE tablename = $1", [TABLE_NAME])
  for (const idx of indexResult.rows) {
    if (idx.indexdef.includes(COLUMN_NAME) && idx.indexdef.includes("WHERE")) {
      out.blockingIndexFound = true
      break
    }
  }

  return out
}

async function validatePreconditions(client) {
  const schema = await inspectSchema(client)
  if (!schema.tableExists) throw new Error("TABLE_MISSING")
  if (!schema.columnExists) throw new Error("COLUMN_MISSING")
  if (schema.columnType !== "text") throw new Error("COLUMN_TYPE_MISMATCH")
  if (schema.blockingTriggerFound) throw new Error("BLOCKING_TRIGGER_FOUND")
  if (schema.blockingIndexFound) throw new Error("BLOCKING_INDEX_FOUND")

  const reasonCheckName = await discoverReasonCheckName(client, TABLE_NAME)
  if (!reasonCheckName) throw new Error("REASON_CHECK_MISSING")

  if (schema.unexpectedConstraints.length > 0) throw new Error(`UNEXPECTED_CONSTRAINTS: ${schema.unexpectedConstraints.map(c => c.name).join(", ")}`)

  const checkResult = await client.query("SELECT pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE conname = $1 AND conrelid = $2::regclass", [reasonCheckName, TABLE_NAME])
  const reasonDefinition = checkResult.rows[0]?.definition || ""
  const reasonAcceptsContact = reasonDefinition.includes("CONTACT_RECONCILED_AFTER_DIVERGENCE")
  const reasonAcceptsPlan = reasonDefinition.includes("PLAN_REGENERATED_AFTER_SAFE_CORRECTION")
  const reasonAcceptsAuthRefresh = reasonDefinition.includes("AUTHORIZATION_PAIR_REFRESHED_AFTER_EXPIRY")

  if (!reasonAcceptsContact) throw new Error("CONTACT_REASON_NOT_ACCEPTED")

  const allowedReasons = new Set(EXPECTED_REASONS)
  const definedReasons = reasonDefinition.match(/'([^']+)'/g) || []
  const unknownReasons = definedReasons.filter(r => !allowedReasons.has(r.replace(/'/g, "")))
  if (unknownReasons.length > 0) {
    throw new Error(`UNKNOWN_REASONS_PRESENT: ${unknownReasons.join(", ")}`)
  }

  if (reasonAcceptsAuthRefresh && reasonAcceptsPlan) {
    return { schema, alreadyMigrated: true, reasonCheckName }
  }
  if (reasonAcceptsPlan) throw new Error("PLAN_REASON_ALREADY_ACCEPTED")
  if (reasonAcceptsAuthRefresh) throw new Error("AUTH_REFRESH_REASON_ALREADY_ACCEPTED")

  return { schema, alreadyMigrated: false, reasonCheckName }
}

async function applyMigration(client, reasonCheckName) {
  await client.query(`ALTER TABLE ${TABLE_NAME} DROP CONSTRAINT ${reasonCheckName}`)

  await client.query(
    `ALTER TABLE ${TABLE_NAME} ADD CONSTRAINT ${reasonCheckName} CHECK (reason = ANY (ARRAY['CONTACT_RECONCILED_AFTER_DIVERGENCE'::text, 'PLAN_REGENERATED_AFTER_SAFE_CORRECTION'::text, 'AUTHORIZATION_PAIR_REFRESHED_AFTER_EXPIRY'::text]))`
  )

  const afterSchema = await inspectSchema(client)
  if (!afterSchema.reasonAcceptsContact) throw new Error("MIGRATION_CONTACT_REASON_LOST")
  if (!afterSchema.reasonAcceptsPlan) throw new Error("MIGRATION_PLAN_REASON_NOT_ADDED")
  if (!afterSchema.reasonAcceptsAuthRefresh) throw new Error("MIGRATION_AUTH_REFRESH_REASON_NOT_ADDED")

  return afterSchema
}

async function main({ argv = process.argv.slice(2), env = process.env, PoolClass = Pool, output = console.log } = {}) {
  const operationalEnv = loadOperationalEnvironment()
  const connectionString = operationalEnv.EXTERNAL_STATE_DATABASE_URL
  if (!connectionString) throw new Error("POSTGRES_CONNECTION_REQUIRED")

  const mode = parseMode(argv)
  const pool = new PoolClass({ connectionString })

  try {
    if (mode === "dry_run") {
      const client = await pool.connect()
      try {
        await client.query("BEGIN")
        await client.query("SET TRANSACTION READ ONLY")
        await client.query("SET LOCAL statement_timeout = '10s'")
        const schema = await inspectSchema(client)
        await client.query("ROLLBACK")
        output(JSON.stringify({ mode: "dry_run", schema, migrationId: MIGRATION_ID }, null, 2))
        return { mode: "dry_run", schema, migrationId: MIGRATION_ID }
      } catch (error) {
        await client.query("ROLLBACK").catch(() => {})
        throw error
      } finally {
        client.release()
      }
    }

    const client = await pool.connect()
    try {
      await client.query("BEGIN")
      const { schema: beforeSchema, alreadyMigrated, reasonCheckName } = await validatePreconditions(client)
      let afterSchema = beforeSchema
      if (!alreadyMigrated) {
        afterSchema = await applyMigration(client, reasonCheckName)
      }
      await client.query("COMMIT")
      output(JSON.stringify({ mode: "apply", beforeSchema, afterSchema, migrationId: MIGRATION_ID, alreadyMigrated }, null, 2))
      return { mode: "apply", beforeSchema, afterSchema, migrationId: MIGRATION_ID, alreadyMigrated }
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {})
      throw error
    } finally {
      client.release()
    }
  } finally {
    await pool.end()
  }
}

if (require.main === module) main().catch((error) => { console.error(JSON.stringify({ ok: false, error: error.message })); process.exitCode = 1 })
module.exports = { main, parseMode, inspectSchema, validatePreconditions, applyMigration, MIGRATION_ID, TABLE_NAME, COLUMN_NAME, EXPECTED_REASONS }
