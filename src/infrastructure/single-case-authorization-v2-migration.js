"use strict"

const { TABLE_NAME } = require("./single-case-authorization-postgres")

const MIGRATION_ID = "single-case-apply-authorizations-v2"
const HASH_PATTERN = "^[a-f0-9]{64}$"
const ALTER_SQL = `ALTER TABLE ${TABLE_NAME}
  ADD COLUMN IF NOT EXISTS plan_hash TEXT,
  ADD COLUMN IF NOT EXISTS manifest_hash TEXT,
  ADD COLUMN IF NOT EXISTS reservation_evidence_hash TEXT,
  ADD COLUMN IF NOT EXISTS consumed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS consumed_by TEXT;
ALTER TABLE ${TABLE_NAME} DROP CONSTRAINT IF EXISTS single_case_auth_schema_check;
ALTER TABLE ${TABLE_NAME} ADD CONSTRAINT single_case_auth_schema_check CHECK (schema_version IN (1,2));
ALTER TABLE ${TABLE_NAME} DROP CONSTRAINT IF EXISTS single_case_auth_v2_binding_check;
ALTER TABLE ${TABLE_NAME} ADD CONSTRAINT single_case_auth_v2_binding_check CHECK (schema_version = 1 OR (schema_version = 2 AND plan_hash ~ '${HASH_PATTERN}' AND manifest_hash ~ '${HASH_PATTERN}' AND reservation_evidence_hash ~ '${HASH_PATTERN}'));
ALTER TABLE ${TABLE_NAME} DROP CONSTRAINT IF EXISTS single_case_auth_v2_scope_check;
ALTER TABLE ${TABLE_NAME} ADD CONSTRAINT single_case_auth_v2_scope_check CHECK (schema_version = 1 OR (schema_version = 2 AND scope = '["APPLY_SINGLE_CASE","CHECKPOINT_WRITE","DRIVE_FOLDERS","DRIVE_UPLOADS","HUBSPOT_ASSOCIATION","HUBSPOT_CONTACT","HUBSPOT_DEAL"]'::jsonb));
ALTER TABLE ${TABLE_NAME} DROP CONSTRAINT IF EXISTS single_case_auth_consumption_check;
ALTER TABLE ${TABLE_NAME} ADD CONSTRAINT single_case_auth_consumption_check CHECK ((consumed_at IS NULL AND consumed_by IS NULL) OR (consumed_at IS NOT NULL AND consumed_by ~ '^[A-Za-z0-9._:-]{3,128}$'));
CREATE INDEX IF NOT EXISTS single_case_auth_unconsumed_binding ON ${TABLE_NAME} (case_import_id,case_fingerprint,case_number,authorizable_plan_hash,plan_hash,manifest_hash,reservation_evidence_hash) WHERE operational_status='ACTIVE' AND consumed_at IS NULL AND schema_version=2`

async function validateAuthorizationV2Schema(queryable) {
  const columns = await queryable.query("SELECT column_name,is_nullable FROM information_schema.columns WHERE table_schema=current_schema() AND table_name=$1 AND column_name = ANY($2::text[]) ORDER BY column_name", [TABLE_NAME, ["consumed_at", "consumed_by", "manifest_hash", "plan_hash", "reservation_evidence_hash"]])
  const names = (columns?.rows || []).map(row => row.column_name).sort()
  const expected = ["consumed_at", "consumed_by", "manifest_hash", "plan_hash", "reservation_evidence_hash"]
  const constraints = await queryable.query("SELECT conname FROM pg_constraint WHERE conrelid=to_regclass($1) AND conname = ANY($2::text[]) ORDER BY conname", [TABLE_NAME, ["single_case_auth_consumption_check", "single_case_auth_v2_binding_check", "single_case_auth_v2_scope_check"]])
  const indexes = await queryable.query("SELECT indexname FROM pg_indexes WHERE schemaname=current_schema() AND tablename=$1 AND indexname=$2", [TABLE_NAME, "single_case_auth_unconsumed_binding"])
  const codes = []
  if (JSON.stringify(names) !== JSON.stringify(expected)) codes.push("V2_COLUMNS_MISSING")
  if ((constraints?.rows || []).length !== 3) codes.push("V2_CONSTRAINTS_MISSING")
  if (indexes?.rowCount !== 1) codes.push("V2_INDEX_MISSING")
  return { ok: codes.length === 0, codes }
}

async function migrateSingleCaseAuthorizationV2(pool) {
  const client = await pool.connect()
  try {
    await client.query("BEGIN")
    const registry = await client.query("SELECT to_regclass('oraculum_state_migrations') AS table_name")
    if (!registry.rows[0]?.table_name) throw new Error("MIGRATION_REGISTRY_MISSING")
    const prior = await client.query("SELECT migration_id FROM oraculum_state_migrations WHERE migration_id=$1", [MIGRATION_ID])
    if (!prior.rowCount) await client.query(ALTER_SQL)
    const schema = await validateAuthorizationV2Schema(client)
    if (!schema.ok) throw new Error(`AUTHORIZATION_V2_SCHEMA_INCOMPATIBLE:${schema.codes.join(",")}`)
    if (!prior.rowCount) await client.query("INSERT INTO oraculum_state_migrations(migration_id,details,applied_at) VALUES($1,$2,CURRENT_TIMESTAMP)", [MIGRATION_ID, JSON.stringify({ table: TABLE_NAME, schemaVersion: 2 })])
    await client.query("COMMIT")
    return { ok: true, applied: !prior.rowCount, migrationId: MIGRATION_ID, schema }
  } catch (error) { await client.query("ROLLBACK").catch(() => {}); throw error } finally { client.release() }
}

module.exports = { MIGRATION_ID, ALTER_SQL, validateAuthorizationV2Schema, migrateSingleCaseAuthorizationV2 }
