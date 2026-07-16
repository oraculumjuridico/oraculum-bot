"use strict"

const crypto = require("node:crypto")
const { deepClone, deepFreeze } = require("../domain/single-case-apply-contracts")
const { validateCheckpoint } = require("../domain/single-case-apply")
const { canonicalSqlExpression, normalizeDefault } = require("./single-case-authorization-postgres")

const MIGRATION_ID = "single-case-apply-coordination-v1"
const LEASE_TABLE = "single_case_apply_leases"
const CHECKPOINT_TABLE = "single_case_apply_checkpoints"
const FENCING_SEQUENCE = "single_case_apply_fencing_token_seq"
const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{2,127}$/
const OWNER = /^[A-Za-z0-9][A-Za-z0-9._:-]{2,79}$/
const HASH = /^[a-f0-9]{64}$/
const FINGERPRINT = /^[a-f0-9]{12}$/
const CASE_NUMBER = /^[A-Z]{2,4}\.[0-9]{6}\.[0-9]{3}$/
const SEQUENCE_SPEC = Object.freeze({ name:FENCING_SEQUENCE, relkind:"S", dataType:"bigint", increment:"1", minimum:"1", maximum:"9223372036854775807", start:"1", cache:"1", cycle:false, owned:false })

const CREATE_SCHEMA_SQL = `
CREATE SEQUENCE IF NOT EXISTS ${FENCING_SEQUENCE} AS BIGINT INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1 NO CYCLE;
CREATE TABLE IF NOT EXISTS ${LEASE_TABLE} (
  case_import_id TEXT CONSTRAINT single_case_apply_leases_pkey PRIMARY KEY,
  lease_id TEXT NOT NULL CONSTRAINT single_case_lease_id_unique UNIQUE,
  fencing_token BIGINT NOT NULL CONSTRAINT single_case_lease_token_unique UNIQUE,
  owner_id TEXT NOT NULL,
  acquired_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  released_at TIMESTAMPTZ,
  version BIGINT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  CONSTRAINT single_case_lease_case_check CHECK (case_import_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{2,127}$'),
  CONSTRAINT single_case_lease_id_check CHECK (lease_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{2,127}$'),
  CONSTRAINT single_case_lease_owner_check CHECK (owner_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{2,79}$'),
  CONSTRAINT single_case_lease_token_check CHECK (fencing_token > 0),
  CONSTRAINT single_case_lease_version_check CHECK (version > 0),
  CONSTRAINT single_case_lease_dates_check CHECK (expires_at > acquired_at),
  CONSTRAINT single_case_lease_release_check CHECK (released_at IS NULL OR released_at >= acquired_at)
);
CREATE INDEX IF NOT EXISTS single_case_lease_expiry_idx ON ${LEASE_TABLE} (expires_at) WHERE released_at IS NULL;
CREATE TABLE IF NOT EXISTS ${CHECKPOINT_TABLE} (
  case_import_id TEXT CONSTRAINT single_case_apply_checkpoints_pkey PRIMARY KEY,
  schema_version INTEGER NOT NULL,
  checkpoint_version BIGINT NOT NULL,
  authorizable_plan_hash TEXT NOT NULL,
  case_number TEXT NOT NULL,
  case_fingerprint TEXT NOT NULL,
  authorization_ids JSONB NOT NULL,
  global_status TEXT NOT NULL,
  checkpoint_payload JSONB NOT NULL,
  fencing_token BIGINT NOT NULL,
  lease_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  CONSTRAINT single_case_checkpoint_case_check CHECK (case_import_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{2,127}$'),
  CONSTRAINT single_case_checkpoint_schema_check CHECK (schema_version = 2),
  CONSTRAINT single_case_checkpoint_version_check CHECK (checkpoint_version > 0),
  CONSTRAINT single_case_checkpoint_hash_check CHECK (authorizable_plan_hash ~ '^[a-f0-9]{64}$'),
  CONSTRAINT single_case_checkpoint_number_check CHECK (case_number ~ '^[A-Z]{2,4}\\.[0-9]{6}\\.[0-9]{3}$'),
  CONSTRAINT single_case_checkpoint_fingerprint_check CHECK (case_fingerprint ~ '^[a-f0-9]{12}$'),
  CONSTRAINT single_case_checkpoint_auth_check CHECK (jsonb_typeof(authorization_ids) = 'array' AND jsonb_array_length(authorization_ids) > 0),
  CONSTRAINT single_case_checkpoint_status_check CHECK (global_status IN ('pending','running','completed','failed')),
  CONSTRAINT single_case_checkpoint_payload_check CHECK (jsonb_typeof(checkpoint_payload) = 'object'),
  CONSTRAINT single_case_checkpoint_token_check CHECK (fencing_token > 0),
  CONSTRAINT single_case_checkpoint_lease_check CHECK (lease_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{2,127}$')
)`

const column = (name,type,udt,nullable=false,defaultValue=null) => Object.freeze({name,type,udt,nullable,defaultValue})
const EXPECTED_COLUMNS = Object.freeze({
  [LEASE_TABLE]: [column("case_import_id","text","text"),column("lease_id","text","text"),column("fencing_token","bigint","int8"),column("owner_id","text","text"),column("acquired_at","timestamp with time zone","timestamptz"),column("expires_at","timestamp with time zone","timestamptz"),column("released_at","timestamp with time zone","timestamptz",true),column("version","bigint","int8"),column("created_at","timestamp with time zone","timestamptz"),column("updated_at","timestamp with time zone","timestamptz")],
  [CHECKPOINT_TABLE]: [column("case_import_id","text","text"),column("schema_version","integer","int4"),column("checkpoint_version","bigint","int8"),column("authorizable_plan_hash","text","text"),column("case_number","text","text"),column("case_fingerprint","text","text"),column("authorization_ids","jsonb","jsonb"),column("global_status","text","text"),column("checkpoint_payload","jsonb","jsonb"),column("fencing_token","bigint","int8"),column("lease_id","text","text"),column("created_at","timestamp with time zone","timestamptz"),column("updated_at","timestamp with time zone","timestamptz")]
})
const REQUIRED_CHECKS = Object.freeze({
  [LEASE_TABLE]: ["single_case_lease_case_check", "single_case_lease_id_check", "single_case_lease_owner_check", "single_case_lease_token_check", "single_case_lease_version_check", "single_case_lease_dates_check", "single_case_lease_release_check"],
  [CHECKPOINT_TABLE]: ["single_case_checkpoint_case_check", "single_case_checkpoint_schema_check", "single_case_checkpoint_version_check", "single_case_checkpoint_hash_check", "single_case_checkpoint_number_check", "single_case_checkpoint_fingerprint_check", "single_case_checkpoint_auth_check", "single_case_checkpoint_status_check", "single_case_checkpoint_payload_check", "single_case_checkpoint_token_check", "single_case_checkpoint_lease_check"]
})
const CHECK_EXPRESSIONS = Object.freeze({
  single_case_lease_case_check:"case_import_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{2,127}$'", single_case_lease_id_check:"lease_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{2,127}$'", single_case_lease_owner_check:"owner_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{2,79}$'", single_case_lease_token_check:"fencing_token > 0", single_case_lease_version_check:"version > 0", single_case_lease_dates_check:"expires_at > acquired_at", single_case_lease_release_check:"released_at IS NULL OR released_at >= acquired_at",
  single_case_checkpoint_case_check:"case_import_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{2,127}$'", single_case_checkpoint_schema_check:"schema_version = 2", single_case_checkpoint_version_check:"checkpoint_version > 0", single_case_checkpoint_hash_check:"authorizable_plan_hash ~ '^[a-f0-9]{64}$'", single_case_checkpoint_number_check:"case_number ~ '^[A-Z]{2,4}\\.[0-9]{6}\\.[0-9]{3}$'", single_case_checkpoint_fingerprint_check:"case_fingerprint ~ '^[a-f0-9]{12}$'", single_case_checkpoint_auth_check:"jsonb_typeof(authorization_ids) = 'array' AND jsonb_array_length(authorization_ids) > 0", single_case_checkpoint_status_check:"global_status IN ('pending','running','completed','failed')", single_case_checkpoint_payload_check:"jsonb_typeof(checkpoint_payload) = 'object'", single_case_checkpoint_token_check:"fencing_token > 0", single_case_checkpoint_lease_check:"lease_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{2,127}$'"
})
const CHECK_COLUMNS = Object.freeze({
  single_case_lease_case_check:["case_import_id"],single_case_lease_id_check:["lease_id"],single_case_lease_owner_check:["owner_id"],single_case_lease_token_check:["fencing_token"],single_case_lease_version_check:["version"],single_case_lease_dates_check:["acquired_at","expires_at"],single_case_lease_release_check:["acquired_at","released_at"],
  single_case_checkpoint_case_check:["case_import_id"],single_case_checkpoint_schema_check:["schema_version"],single_case_checkpoint_version_check:["checkpoint_version"],single_case_checkpoint_hash_check:["authorizable_plan_hash"],single_case_checkpoint_number_check:["case_number"],single_case_checkpoint_fingerprint_check:["case_fingerprint"],single_case_checkpoint_auth_check:["authorization_ids"],single_case_checkpoint_status_check:["global_status"],single_case_checkpoint_payload_check:["checkpoint_payload"],single_case_checkpoint_token_check:["fencing_token"],single_case_checkpoint_lease_check:["lease_id"]
})

const fail = code => { throw new Error(code) }
const instant = value => { const date = new Date(value); if (!Number.isFinite(date.getTime())) fail("POSTGRES_TRANSACTION_FAILED"); return date.toISOString() }
const LEGITIMATE_ERROR_CODES = new Set([
  "LEASE_OWNER_MISMATCH",
  "LEASE_ALREADY_HELD",
  "LEASE_NOT_FOUND",
  "LEASE_EXPIRED",
  "FENCING_REJECTED",
  "INVALID_CHECKPOINT",
  "CHECKPOINT_BINDING_MISMATCH",
  "CAS_CONFLICT",
  "POSTGRES_UNAVAILABLE",
  "POSTGRES_TRANSACTION_FAILED",
  "SCHEMA_INCOMPATIBLE"
])
const mapError = error => {
  const message = error?.message || ""
  if (LEGITIMATE_ERROR_CODES.has(message)) return new Error(message)
  const unavailableCodes = new Set(["ECONNREFUSED","ECONNRESET","ETIMEDOUT","EHOSTUNREACH","ENETUNREACH","57P01","57P02","57P03","08000","08001","08003","08004","08006","08007","08P01"])
  const unavailable = message === "POOL_UNAVAILABLE" || unavailableCodes.has(error?.code) || error?.name === "ConnectionTerminatedError"
  const wrapped = new Error(unavailable ? "POSTGRES_UNAVAILABLE" : "POSTGRES_TRANSACTION_FAILED")
  return wrapped
}
async function transaction(pool, action) {
  let client
  try { client = await pool.connect(); await client.query("BEGIN"); const value = await action(client); await client.query("COMMIT"); return value }
  catch (error) { if (client) await client.query("ROLLBACK").catch(() => {}); throw mapError(error) }
  finally { client?.release() }
}
function validRequest(value) { return value && ID.test(value.caseImportId || "") && ID.test(value.leaseId || "") && Number.isInteger(value.fencingToken) && value.fencingToken > 0 }
function leaseResult(row) {
  if (!row || !ID.test(row.case_import_id || "") || !ID.test(row.lease_id || "") || !Number.isSafeInteger(Number(row.fencing_token)) || !Number.isSafeInteger(Number(row.version))) fail("POSTGRES_TRANSACTION_FAILED")
  return deepFreeze({ caseImportId: row.case_import_id, leaseId: row.lease_id, fencingToken: Number(row.fencing_token), owner: row.owner_id, acquiredAt: instant(row.acquired_at), expiresAt: instant(row.expires_at), releasedAt: row.released_at ? instant(row.released_at) : null, version: Number(row.version) })
}
function checkpointDecision(row) { return { caseImportId: row.case_import_id, caseFingerprint: row.case_fingerprint, caseNumber: row.case_number, authorizablePlanHash: row.authorizable_plan_hash, authorizationIds: row.authorization_ids } }
function validateStoredCheckpoint(row) {
  if (!row) fail("INVALID_CHECKPOINT")
  if (!ID.test(row.case_import_id || "") || !FINGERPRINT.test(row.case_fingerprint || "") || !CASE_NUMBER.test(row.case_number || "") || !HASH.test(row.authorizable_plan_hash || "") || !Array.isArray(row.authorization_ids) || !Number.isSafeInteger(Number(row.checkpoint_version))) fail("INVALID_CHECKPOINT")
  const payload = deepClone(row.checkpoint_payload)
  if (payload.version !== Number(row.checkpoint_version) || payload.schemaVersion !== row.schema_version || payload.status !== row.global_status || JSON.stringify([...payload.authorizationIds].sort()) !== JSON.stringify([...row.authorization_ids].sort())) fail("CHECKPOINT_BINDING_MISMATCH")
  try { validateCheckpoint(payload, checkpointDecision(row)) } catch { fail("INVALID_CHECKPOINT") }
  return deepFreeze(payload)
}

function createSingleCaseCoordinationRepository({ pool, ownerId, now = () => new Date().toISOString(), leaseDurationMs = 60000 }) {
  if (!pool || typeof pool.connect !== "function" || typeof pool.query !== "function") fail("POSTGRES_UNAVAILABLE")
  if (!OWNER.test(ownerId || "") || typeof now !== "function" || !Number.isInteger(leaseDurationMs) || leaseDurationMs < 1000 || leaseDurationMs > 3600000) fail("POSTGRES_TRANSACTION_FAILED")
  const repository = {
    async acquireLease({ caseImportId, owner } = {}) {
      if (!ID.test(caseImportId || "") || owner !== ownerId) fail("LEASE_OWNER_MISMATCH")
      const at = instant(now()), expiresAt = new Date(Date.parse(at) + leaseDurationMs).toISOString(), leaseId = `lease-${crypto.randomUUID()}`
      return transaction(pool, async client => {
        await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [caseImportId])
        const current = await client.query(`SELECT * FROM ${LEASE_TABLE} WHERE case_import_id=$1 FOR UPDATE`, [caseImportId])
        if (current.rowCount && !current.rows[0].released_at && Date.parse(current.rows[0].expires_at) > Date.parse(at)) fail("LEASE_ALREADY_HELD")
        const token = await client.query(`SELECT nextval('${FENCING_SEQUENCE}') AS fencing_token`)
        const result = await client.query(`INSERT INTO ${LEASE_TABLE}(case_import_id,lease_id,fencing_token,owner_id,acquired_at,expires_at,released_at,version,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,NULL,1,$5,$5) ON CONFLICT(case_import_id) DO UPDATE SET lease_id=EXCLUDED.lease_id,fencing_token=EXCLUDED.fencing_token,owner_id=EXCLUDED.owner_id,acquired_at=EXCLUDED.acquired_at,expires_at=EXCLUDED.expires_at,released_at=NULL,version=${LEASE_TABLE}.version+1,updated_at=EXCLUDED.updated_at RETURNING *`, [caseImportId, leaseId, token.rows[0].fencing_token, ownerId, at, expiresAt])
        return leaseResult(result.rows[0])
      })
    },
    async renewLease(request = {}) {
      if (!validRequest(request)) fail("LEASE_NOT_FOUND")
      const at = instant(now()), expiresAt = new Date(Date.parse(at) + leaseDurationMs).toISOString()
      return transaction(pool, async client => {
        const result = await client.query(`SELECT * FROM ${LEASE_TABLE} WHERE case_import_id=$1 FOR UPDATE`, [request.caseImportId])
        if (!result.rowCount) fail("LEASE_NOT_FOUND"); const row = result.rows[0]
        if (row.lease_id !== request.leaseId) fail("LEASE_NOT_FOUND")
        if (row.owner_id !== ownerId) fail("LEASE_OWNER_MISMATCH")
        if (Number(row.fencing_token) !== request.fencingToken) fail("FENCING_REJECTED")
        if (row.released_at || Date.parse(row.expires_at) <= Date.parse(at)) fail("LEASE_EXPIRED")
        if (Date.parse(expiresAt) <= Date.parse(row.expires_at)) fail("LEASE_EXPIRED")
        const updated = await client.query(`UPDATE ${LEASE_TABLE} SET expires_at=$2,version=version+1,updated_at=$1 WHERE case_import_id=$3 RETURNING *`, [at, expiresAt, request.caseImportId])
        return leaseResult(updated.rows[0])
      })
    },
    async releaseLease(request = {}) {
      if (!validRequest(request)) fail("LEASE_NOT_FOUND")
      const at = instant(now())
      return transaction(pool, async client => {
        const result = await client.query(`SELECT * FROM ${LEASE_TABLE} WHERE case_import_id=$1 FOR UPDATE`, [request.caseImportId])
        if (!result.rowCount || result.rows[0].lease_id !== request.leaseId) fail("LEASE_NOT_FOUND"); const row = result.rows[0]
        if (row.owner_id !== ownerId) fail("LEASE_OWNER_MISMATCH")
        if (Number(row.fencing_token) !== request.fencingToken) fail("FENCING_REJECTED")
        if (row.released_at) return { released: true }
        await client.query(`UPDATE ${LEASE_TABLE} SET released_at=$2,version=version+1,updated_at=$2 WHERE case_import_id=$1`, [request.caseImportId, at])
        return { released: true }
      })
    },
    async loadCheckpoint(caseImportId) {
      if (!ID.test(caseImportId || "")) fail("INVALID_CHECKPOINT")
      try { const result = await pool.query(`SELECT * FROM ${CHECKPOINT_TABLE} WHERE case_import_id=$1`, [caseImportId]); if (!result || result.rowCount > 1) fail("INVALID_CHECKPOINT"); return result.rowCount ? validateStoredCheckpoint(result.rows[0]) : null }
      catch (error) { throw mapError(error) }
    },
    async compareAndSetCheckpoint(request = {}) {
      if (!validRequest(request) || !Number.isInteger(request.expectedVersion) || request.expectedVersion < 0 || !request.checkpoint) fail("INVALID_CHECKPOINT")
      const at = instant(now()), nextVersion = request.expectedVersion + 1, payload = deepClone(request.checkpoint)
      if (payload.caseImportId !== request.caseImportId || payload.version !== request.expectedVersion) fail("CHECKPOINT_BINDING_MISMATCH")
      try { validateCheckpoint(payload, { caseImportId: payload.caseImportId, caseFingerprint: payload.caseFingerprint, caseNumber: payload.caseNumber, authorizablePlanHash: payload.authorizablePlanHash, authorizationIds: payload.authorizationIds }) } catch { fail("INVALID_CHECKPOINT") }
      payload.version = nextVersion
      return transaction(pool, async client => {
        const lease = await client.query(`SELECT * FROM ${LEASE_TABLE} WHERE case_import_id=$1 FOR UPDATE`, [request.caseImportId])
        if (!lease.rowCount || lease.rows[0].lease_id !== request.leaseId) fail("LEASE_NOT_FOUND")
        if (lease.rows[0].owner_id !== ownerId) fail("LEASE_OWNER_MISMATCH")
        if (Number(lease.rows[0].fencing_token) !== request.fencingToken) fail("FENCING_REJECTED")
        if (lease.rows[0].released_at || Date.parse(lease.rows[0].expires_at) <= Date.parse(at)) fail("LEASE_EXPIRED")
        const current = await client.query(`SELECT * FROM ${CHECKPOINT_TABLE} WHERE case_import_id=$1 FOR UPDATE`, [request.caseImportId])
        const persisted = current.rowCount ? Number(current.rows[0].checkpoint_version) : 0
        if (persisted !== request.expectedVersion) fail("CAS_CONFLICT")
        if (current.rowCount) { const row=current.rows[0];if(row.authorizable_plan_hash!==payload.authorizablePlanHash||row.case_number!==payload.caseNumber||row.case_fingerprint!==payload.caseFingerprint||JSON.stringify([...row.authorization_ids].sort())!==JSON.stringify([...payload.authorizationIds].sort()))fail("CHECKPOINT_BINDING_MISMATCH") }
        const values = [payload.caseImportId,payload.schemaVersion,nextVersion,payload.authorizablePlanHash,payload.caseNumber,payload.caseFingerprint,JSON.stringify(payload.authorizationIds),payload.status,JSON.stringify(payload),request.fencingToken,request.leaseId,at]
        await client.query(`INSERT INTO ${CHECKPOINT_TABLE}(case_import_id,schema_version,checkpoint_version,authorizable_plan_hash,case_number,case_fingerprint,authorization_ids,global_status,checkpoint_payload,fencing_token,lease_id,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9::jsonb,$10,$11,$12,$12) ON CONFLICT(case_import_id) DO UPDATE SET schema_version=EXCLUDED.schema_version,checkpoint_version=EXCLUDED.checkpoint_version,authorizable_plan_hash=EXCLUDED.authorizable_plan_hash,case_number=EXCLUDED.case_number,case_fingerprint=EXCLUDED.case_fingerprint,authorization_ids=EXCLUDED.authorization_ids,global_status=EXCLUDED.global_status,checkpoint_payload=EXCLUDED.checkpoint_payload,fencing_token=EXCLUDED.fencing_token,lease_id=EXCLUDED.lease_id,updated_at=EXCLUDED.updated_at`, values)
        return { saved: true, version: nextVersion }
      })
    }
  }
  return Object.freeze(repository)
}

// Helper: normalize pg/driver array results into JS array of strings (strict, fail-closed)
function parsePgArrayLike(value) {
  if (Array.isArray(value)) return value
  if (value == null) return null
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value)
      if (Array.isArray(parsed)) return parsed
      return null
    } catch (e) {
      return null
    }
  }
  return null
}
function ensureStringArray(value, errorCode) {
  const arr = parsePgArrayLike(value)
  if (!Array.isArray(arr) || arr.some(x => typeof x !== 'string' || x.length === 0)) throw new Error(errorCode)
  return [...arr]
}

async function validateSingleCaseCoordinationSchema(queryable) {
  const codes = new Set()
  for (const [table, expected] of Object.entries(EXPECTED_COLUMNS)) {
    const columns = await queryable.query("SELECT column_name,data_type,udt_name,is_nullable,column_default,ordinal_position FROM information_schema.columns WHERE table_schema=current_schema() AND table_name=$1 ORDER BY ordinal_position", [table])
    if (columns.rows.length !== expected.length) codes.add(`${table}:COLUMN_COUNT_MISMATCH`)
    expected.forEach((item,index)=>{const row=columns.rows[index];if(!row||row.column_name!==item.name||row.data_type!==item.type||row.udt_name!==item.udt||Number(row.ordinal_position)!==index+1)codes.add(`${table}:COLUMN_MISMATCH`);if(!row||(row.is_nullable==="YES")!==item.nullable)codes.add(`${table}:NULLABILITY_MISMATCH`);if(!row||normalizeDefault(row.column_default)!==item.defaultValue)codes.add(`${table}:DEFAULT_MISMATCH`)})
    const constraints = await queryable.query("SELECT c.conname,c.contype,pg_get_constraintdef(c.oid,true) AS definition,array_to_json(array_agg(a.attname ORDER BY k.ordinality) FILTER (WHERE a.attname IS NOT NULL)) AS columns FROM pg_constraint c LEFT JOIN LATERAL unnest(c.conkey) WITH ORDINALITY k(attnum,ordinality) ON true LEFT JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=k.attnum WHERE c.conrelid=to_regclass($1) GROUP BY c.oid,c.conname,c.contype", [table])
    const byName = new Map(constraints.rows.map(row=>[row.conname,row]))
    for (const name of REQUIRED_CHECKS[table]) {
      const row = byName.get(name)
      let matches = false
      try { matches = canonicalSqlExpression(row?.definition) === canonicalSqlExpression(`CHECK (${CHECK_EXPRESSIONS[name]})`) } catch {}
      let columnsArr
      try {
        columnsArr = ensureStringArray(row?.columns, `${table}:CHECK_MISMATCH:${name}`)
      } catch (e) {
        codes.add(`${table}:CHECK_MISMATCH:${name}`)
        continue
      }
      const columnMatch = JSON.stringify([...columnsArr].sort()) === JSON.stringify([...(CHECK_COLUMNS[name] || [])].sort())
      if (!row || row.contype !== "c" || !matches || !columnMatch) codes.add(`${table}:CHECK_MISMATCH:${name}`)
    }
    const pk = constraints.rows.filter(row => row.contype === "p")
    try {
      if (pk.length !== 1) { codes.add(`${table}:PRIMARY_KEY_MISMATCH`) }
      else {
        const pkColumns = ensureStringArray(pk[0].columns, `${table}:PRIMARY_KEY_MISMATCH`)
        if (JSON.stringify(pkColumns) !== JSON.stringify(["case_import_id"])) codes.add(`${table}:PRIMARY_KEY_MISMATCH`)
      }
    } catch (e) { codes.add(`${table}:PRIMARY_KEY_MISMATCH`) }
    let uniques
    try {
      uniques = constraints.rows.filter(row => row.contype === "u").map(row => JSON.stringify(ensureStringArray(row.columns, `${table}:UNIQUE_MISMATCH`))).sort()
    } catch (e) {
      codes.add(`${table}:UNIQUE_MISMATCH`)
      uniques = []
    }
    const expectedUniques = table === LEASE_TABLE ? [JSON.stringify(["fencing_token"]), JSON.stringify(["lease_id"])].sort() : []
    if (JSON.stringify(uniques) !== JSON.stringify(expectedUniques)) codes.add(`${table}:UNIQUE_MISMATCH`)
    const allowed=new Set([`${table}_pkey`,...(table===LEASE_TABLE?["single_case_lease_id_unique","single_case_lease_token_unique"]:[]),...REQUIRED_CHECKS[table]])
    if(constraints.rows.some(row=>!allowed.has(row.conname)))codes.add(`${table}:UNEXPECTED_CONSTRAINT`)
  }
  const index=await queryable.query("SELECT i.relname AS index_name,ix.indisunique AS is_unique,am.amname AS method,ix.indnkeyatts AS key_attribute_count,ix.indnatts AS total_attribute_count,ix.indexprs IS NOT NULL AS has_expressions,pg_get_expr(ix.indpred,ix.indrelid,true) AS predicate,array_to_json(array_agg(a.attname ORDER BY k.ordinality) FILTER (WHERE k.ordinality<=ix.indnkeyatts AND a.attname IS NOT NULL)) AS key_columns FROM pg_index ix JOIN pg_class i ON i.oid=ix.indexrelid JOIN pg_class t ON t.oid=ix.indrelid JOIN pg_am am ON am.oid=i.relam LEFT JOIN LATERAL unnest(ix.indkey) WITH ORDINALITY k(attnum,ordinality) ON true LEFT JOIN pg_attribute a ON a.attrelid=t.oid AND a.attnum=k.attnum WHERE t.relnamespace=current_schema()::regnamespace AND t.relname=$1 AND i.relname='single_case_lease_expiry_idx' GROUP BY i.relname,ix.indisunique,am.amname,ix.indnkeyatts,ix.indnatts,ix.indexprs,ix.indpred,ix.indrelid",[LEASE_TABLE])
  const idx=index.rowCount===1?index.rows[0]:null;let predicate=false;try{predicate=canonicalSqlExpression(idx?.predicate)===canonicalSqlExpression("released_at IS NULL")}catch{}
  try {
    const keyCols = ensureStringArray(idx?.key_columns, 'LEASE_EXPIRY_INDEX_MISMATCH')
    if(!idx||idx.is_unique!==false||idx.method!=="btree"||Number(idx.key_attribute_count)!==1||Number(idx.total_attribute_count)!==1||idx.has_expressions!==false||JSON.stringify(keyCols)!==JSON.stringify(["expires_at"])||!predicate) codes.add("LEASE_EXPIRY_INDEX_MISMATCH")
  } catch (e) { codes.add('LEASE_EXPIRY_INDEX_MISMATCH') }
  const sequence = await queryable.query("SELECT n.nspname AS schema_name,c.relname AS sequence_name,c.relkind,format_type(s.seqtypid,NULL) AS data_type,s.seqincrement::text,s.seqmin::text,s.seqmax::text,s.seqstart::text,s.seqcache::text,s.seqcycle,EXISTS(SELECT 1 FROM pg_depend d WHERE d.objid=c.oid AND d.deptype IN ('a','i')) AS is_owned FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace LEFT JOIN pg_sequence s ON s.seqrelid=c.oid WHERE n.nspname=current_schema() AND c.relname=$1", [FENCING_SEQUENCE])
  const seq=sequence.rowCount===1?sequence.rows[0]:null
  if(!seq)codes.add("FENCING_SEQUENCE_MISSING")
  else if(!seq.schema_name||seq.sequence_name!==SEQUENCE_SPEC.name||seq.relkind!==SEQUENCE_SPEC.relkind||seq.data_type!==SEQUENCE_SPEC.dataType||String(seq.seqincrement)!==SEQUENCE_SPEC.increment||String(seq.seqmin)!==SEQUENCE_SPEC.minimum||String(seq.seqmax)!==SEQUENCE_SPEC.maximum||String(seq.seqstart)!==SEQUENCE_SPEC.start||String(seq.seqcache)!==SEQUENCE_SPEC.cache||seq.seqcycle!==SEQUENCE_SPEC.cycle||seq.is_owned!==SEQUENCE_SPEC.owned)codes.add("FENCING_SEQUENCE_MISMATCH")
  return { ok: codes.size === 0, codes: [...codes].sort() }
}
async function migrateSingleCaseCoordination(pool) {
  return transaction(pool, async client => {
    const registry = await client.query("SELECT to_regclass('oraculum_state_migrations') AS table_name")
    if (!registry.rows[0]?.table_name) fail("SCHEMA_INCOMPATIBLE")
    const prior = await client.query("SELECT migration_id FROM oraculum_state_migrations WHERE migration_id=$1", [MIGRATION_ID])
    if (!prior.rowCount) await client.query(CREATE_SCHEMA_SQL)
    const schema = await validateSingleCaseCoordinationSchema(client)
    if (!schema.ok) fail("SCHEMA_INCOMPATIBLE")
    if (!prior.rowCount) await client.query("INSERT INTO oraculum_state_migrations(migration_id,details,applied_at) VALUES($1,$2,CURRENT_TIMESTAMP)", [MIGRATION_ID, JSON.stringify({ leases: LEASE_TABLE, checkpoints: CHECKPOINT_TABLE, schemaVersion: 1 })])
    return { ok: true, migrationId: MIGRATION_ID, applied: !prior.rowCount, schema }
  })
}

module.exports = { MIGRATION_ID, LEASE_TABLE, CHECKPOINT_TABLE, FENCING_SEQUENCE, SEQUENCE_SPEC, CREATE_SCHEMA_SQL, EXPECTED_COLUMNS, REQUIRED_CHECKS, CHECK_EXPRESSIONS, CHECK_COLUMNS, mapError, createSingleCaseCoordinationRepository, validateSingleCaseCoordinationSchema, migrateSingleCaseCoordination, validateStoredCheckpoint }
