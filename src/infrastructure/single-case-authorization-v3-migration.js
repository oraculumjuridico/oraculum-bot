"use strict"

const { TABLE_NAME, TYPES } = require("./single-case-authorization-postgres")
const { AUTH_SCOPES } = require("../domain/single-case-apply-contracts")

const MIGRATION_ID = "single-case-apply-authorizations-v3"

// Canonical scope per type (deterministic, fail-closed)
const EXPLICIT_SCOPE = JSON.stringify(["APPLY_SINGLE_CASE"])
const EXTERNAL_SCOPE = JSON.stringify(["CHECKPOINT_WRITE", "DRIVE_FOLDERS", "DRIVE_UPLOADS", "HUBSPOT_ASSOCIATION", "HUBSPOT_CONTACT", "HUBSPOT_DEAL"])

const ALTER_SQL = `ALTER TABLE ${TABLE_NAME} DROP CONSTRAINT IF EXISTS single_case_auth_v2_scope_check;
ALTER TABLE ${TABLE_NAME} ADD CONSTRAINT single_case_auth_v3_scope_check CHECK (
  schema_version = 1 OR (
    schema_version = 2 AND (
      (authorization_type = 'EXPLICIT_APPLY_AUTHORIZATION' AND scope = '${EXPLICIT_SCOPE}'::jsonb) OR
      (authorization_type = 'EXTERNAL_WRITES_AUTHORIZATION' AND scope = '${EXTERNAL_SCOPE}'::jsonb)
    )
  )
)`

async function validateAuthorizationV3Schema(queryable) {
  const constraints = await queryable.query(
    "SELECT conname FROM pg_constraint WHERE conrelid=to_regclass($1) AND conname = ANY($2::text[]) ORDER BY conname",
    [TABLE_NAME, ["single_case_auth_v3_scope_check"]]
  )
  const v2Present = await queryable.query(
    "SELECT conname FROM pg_constraint WHERE conrelid=to_regclass($1) AND conname = $2",
    [TABLE_NAME, "single_case_auth_v2_scope_check"]
  )
  const codes = []
  if ((constraints?.rows || []).length !== 1) codes.push("V3_CONSTRAINT_MISSING")
  if (v2Present?.rowCount > 0) codes.push("V2_CONSTRAINT_PRESENT")
  return { ok: codes.length === 0, codes }
}

async function migrateSingleCaseAuthorizationV3(pool) {
  const client = await pool.connect()
  try {
    await client.query("BEGIN")
    const registry = await client.query("SELECT to_regclass('oraculum_state_migrations') AS table_name")
    if (!registry.rows[0]?.table_name) throw new Error("MIGRATION_REGISTRY_MISSING")
    const prior = await client.query("SELECT migration_id FROM oraculum_state_migrations WHERE migration_id=$1", [MIGRATION_ID])
    if (!prior.rowCount) await client.query(ALTER_SQL)
    const schema = await validateAuthorizationV3Schema(client)
    if (!schema.ok) throw new Error(`AUTHORIZATION_V3_SCHEMA_INCOMPATIBLE:${schema.codes.join(",")}`)
    if (!prior.rowCount) await client.query("INSERT INTO oraculum_state_migrations(migration_id,details,applied_at) VALUES($1,$2,CURRENT_TIMESTAMP)", [MIGRATION_ID, JSON.stringify({ table: TABLE_NAME, schemaVersion: 2, scopeSegregation: true })])
    await client.query("COMMIT")
    return { ok: true, applied: !prior.rowCount, migrationId: MIGRATION_ID, schema }
  } catch (error) { await client.query("ROLLBACK").catch(() => {}); throw error } finally { client.release() }
}

module.exports = { MIGRATION_ID, ALTER_SQL, EXPLICIT_SCOPE, EXTERNAL_SCOPE, validateAuthorizationV3Schema, migrateSingleCaseAuthorizationV3 }
