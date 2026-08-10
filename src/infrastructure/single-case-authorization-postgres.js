"use strict"

const { AUTHORIZATION_SCHEMA_VERSION, AUTH_SCOPES } = require("../domain/single-case-apply-contracts")

// Programmatic migration is the sole authoritative DDL source, matching the existing project pattern.
const MIGRATION_ID = "single-case-apply-authorizations-v1"
const TABLE_NAME = "single_case_apply_authorizations"
const ALGORITHM = "Ed25519"
const TYPES = Object.freeze(Object.keys(AUTH_SCOPES))
const ACTIVE_INDEX = "single_case_auth_one_active_binding"
const ISSUER_PATTERN = /^[A-Za-z0-9._:-]{3,80}$/
const SIGNATURE_PATTERN = /^[A-Za-z0-9+/]{86}==$/
const ACTIVE_INDEX_COLUMNS = Object.freeze(["authorization_type", "case_import_id", "case_fingerprint", "case_number", "authorizable_plan_hash"])
const ACTIVE_INDEX_PREDICATE = "operational_status = 'ACTIVE'"
const CHECK_SQL = Object.freeze({
  single_case_auth_schema_check: "schema_version = 1",
  single_case_auth_type_check: "authorization_type IN ('EXPLICIT_APPLY_AUTHORIZATION','EXTERNAL_WRITES_AUTHORIZATION')",
  single_case_auth_algorithm_check: "signature_algorithm = 'Ed25519'",
  single_case_auth_id_check: "authorization_id ~ '^[A-Za-z0-9._:-]{8,128}$'",
  single_case_auth_case_id_check: "case_import_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{2,127}$'",
  single_case_auth_fingerprint_check: "case_fingerprint ~ '^[a-f0-9]{12}$'",
  single_case_auth_case_number_check: "case_number ~ '^[A-Z]{2,4}\\.[0-9]{6}\\.[0-9]{3}$'",
  single_case_auth_plan_hash_check: "authorizable_plan_hash ~ '^[a-f0-9]{64}$'",
  single_case_auth_scope_check: "jsonb_typeof(scope) = 'array' AND jsonb_array_length(scope) > 0",
  single_case_auth_dates_check: "expires_at > issued_at",
  single_case_auth_revocation_check: "(revoked = FALSE AND revoked_at IS NULL AND revocation_reason IS NULL) OR (revoked = TRUE AND revoked_at IS NOT NULL AND revocation_reason ~ '^[A-Z0-9_]{3,80}$')",
  single_case_auth_operational_status_check: "(operational_status = 'ACTIVE' AND superseded_at IS NULL) OR (operational_status = 'HISTORICAL' AND superseded_at IS NOT NULL)",
  single_case_auth_issuer_check: "issuer ~ '^[A-Za-z0-9._:-]{3,80}$'",
  single_case_auth_signature_check: "signature ~ '^[A-Za-z0-9+/]{86}==$'",
  single_case_auth_audit_check: "jsonb_typeof(audit_metadata) = 'object'"
})

const CREATE_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS ${TABLE_NAME} (
  authorization_id TEXT PRIMARY KEY,
  schema_version INTEGER NOT NULL,
  authorization_type TEXT NOT NULL,
  case_import_id TEXT NOT NULL,
  case_fingerprint TEXT NOT NULL,
  case_number TEXT NOT NULL,
  authorizable_plan_hash TEXT NOT NULL,
  scope JSONB NOT NULL,
  issuer TEXT NOT NULL,
  issued_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked BOOLEAN NOT NULL DEFAULT FALSE,
  revoked_at TIMESTAMPTZ,
  revocation_reason TEXT,
  operational_status TEXT NOT NULL DEFAULT 'ACTIVE',
  superseded_at TIMESTAMPTZ,
  signature TEXT NOT NULL,
  signature_algorithm TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  audit_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  ${Object.entries(CHECK_SQL).map(([name, expression]) => `CONSTRAINT ${name} CHECK (${expression})`).join(",\n  ")}
);
CREATE UNIQUE INDEX IF NOT EXISTS ${ACTIVE_INDEX}
ON ${TABLE_NAME} (${ACTIVE_INDEX_COLUMNS.join(",")})
WHERE ${ACTIVE_INDEX_PREDICATE}`

const EXPECTED_COLUMNS = Object.freeze([
  ["authorization_id", "text", "text", false, null], ["schema_version", "integer", "int4", false, null],
  ["authorization_type", "text", "text", false, null], ["case_import_id", "text", "text", false, null],
  ["case_fingerprint", "text", "text", false, null], ["case_number", "text", "text", false, null],
  ["authorizable_plan_hash", "text", "text", false, null], ["scope", "jsonb", "jsonb", false, null],
  ["issuer", "text", "text", false, null], ["issued_at", "timestamp with time zone", "timestamptz", false, null],
  ["expires_at", "timestamp with time zone", "timestamptz", false, null], ["revoked", "boolean", "bool", false, "false"],
  ["revoked_at", "timestamp with time zone", "timestamptz", true, null], ["revocation_reason", "text", "text", true, null],
  ["operational_status", "text", "text", false, "'active'"], ["superseded_at", "timestamp with time zone", "timestamptz", true, null],
  ["signature", "text", "text", false, null], ["signature_algorithm", "text", "text", false, null],
  ["created_at", "timestamp with time zone", "timestamptz", false, "current_timestamp"], ["audit_metadata", "jsonb", "jsonb", false, "'{}'" ]
].map(([name, type, udt, nullable, defaultValue], index) => Object.freeze({ name, type, udt, nullable, defaultValue, position: index + 1 })))

const CHECK_COLUMNS = Object.freeze({
  single_case_auth_schema_check: ["schema_version"], single_case_auth_type_check: ["authorization_type"],
  single_case_auth_algorithm_check: ["signature_algorithm"], single_case_auth_id_check: ["authorization_id"],
  single_case_auth_case_id_check: ["case_import_id"], single_case_auth_fingerprint_check: ["case_fingerprint"],
  single_case_auth_case_number_check: ["case_number"], single_case_auth_plan_hash_check: ["authorizable_plan_hash"],
  single_case_auth_scope_check: ["scope"], single_case_auth_dates_check: ["expires_at", "issued_at"],
  single_case_auth_revocation_check: ["revocation_reason", "revoked", "revoked_at"],
  single_case_auth_operational_status_check: ["operational_status", "superseded_at"],
  single_case_auth_issuer_check: ["issuer"], single_case_auth_signature_check: ["signature"],
  single_case_auth_audit_check: ["audit_metadata"]
})

function sqlTokens(value) {
  const source = String(value || "").replace(/::(?:text|jsonb|boolean|integer|timestamp\s+with\s+time\s+zone)/gi, "").replace(/^\s*CHECK\s*/i, "")
  const tokens = []; let offset = 0
  const pattern = /\s*(?:('(?:''|[^'])*')|([A-Za-z_][A-Za-z0-9_$]*)|([0-9]+)|((?:>=|<=|<>|!=|=|>|<|~))|([()[\],]))/y
  while (offset < source.length) {
    if (!source.slice(offset).trim()) break
    pattern.lastIndex = offset; const match = pattern.exec(source)
    if (!match) throw new Error("SCHEMA_EXPRESSION_INVALID")
    offset = pattern.lastIndex
    if (match[1]) tokens.push({ type: "literal", value: match[1].slice(1, -1).replace(/''/g, "'") })
    else if (match[2]) tokens.push({ type: "word", value: match[2].toLowerCase() })
    else if (match[3]) tokens.push({ type: "number", value: Number(match[3]) })
    else if (match[4]) tokens.push({ type: "operator", value: match[4] })
    else tokens.push({ type: "punctuation", value: match[5] })
  }
  return tokens
}

function parseSqlExpression(value) {
  const tokens = sqlTokens(value); let position = 0
  const peek = (type, expected) => tokens[position]?.type === type && (expected === undefined || tokens[position].value === expected)
  const take = (type, expected) => { if (!peek(type, expected)) throw new Error("SCHEMA_EXPRESSION_INVALID"); return tokens[position++] }
  const parseList = end => { const items=[];if(peek("punctuation",end)){position++;return items}do{items.push(parseOr());if(peek("punctuation",",")){position++;continue}take("punctuation",end);break}while(true);return items }
  const parsePrimary = () => {
    if (peek("punctuation", "(")) { position++; const result=parseOr();take("punctuation",")");return result }
    if (peek("literal")) return ["literal", take("literal").value]
    if (peek("number")) return ["number", take("number").value]
    const word=take("word").value
    if (word === "true" || word === "false") return ["boolean", word === "true"]
    if (word === "null") return ["null"]
    if (word === "array" && peek("punctuation","[")) { position++; return ["array", ...parseList("]")] }
    if (peek("punctuation","(")) { position++; return ["call",word,...parseList(")")] }
    return ["column",word]
  }
  const parseComparison = () => {
    const left=parsePrimary()
    if (peek("word","is")) { position++;const negated=peek("word","not");if(negated)position++;take("word","null");return [negated?"is-not-null":"is-null",left] }
    if (peek("word","in")) { position++;take("punctuation","(");return ["in",left,...parseList(")")] }
    if (peek("operator")) {
      const operator=take("operator").value,right=parsePrimary()
      if (operator === "=" && right[0] === "call" && right[1] === "any" && right[2]?.[0] === "array") return ["in",left,...right[2].slice(1)]
      return [operator,left,right]
    }
    return left
  }
  const parseNot = () => peek("word","not") ? (position++, ["not",parseNot()]) : parseComparison()
  const parseAnd = () => { let left=parseNot();while(peek("word","and")){position++;left=["and",left,parseNot()]}return left }
  const parseOr = () => { let left=parseAnd();while(peek("word","or")){position++;left=["or",left,parseAnd()]}return left }
  const result=parseOr();if(position!==tokens.length)throw new Error("SCHEMA_EXPRESSION_INVALID");return result
}
function canonicalSqlExpression(value) { return JSON.stringify(parseSqlExpression(value)) }
function normalizeSql(value) { return String(value || "").toLowerCase().replace(/::(?:text|jsonb|boolean|timestamp with time zone)/g, "").replace(/[()\s"]/g, "") }
function normalizeDefault(value) { const normalized = normalizeSql(value); if (["false","'false'"].includes(normalized)) return "false"; if (["now","now()","current_timestamp"].includes(normalized)) return "current_timestamp"; if (["'{}'","{}"].includes(normalized)) return "'{}'"; return normalized || null }

// Helper: normalize PostgreSQL/pg driver results into a JS array of strings (strict, fail-closed)
function parsePgArrayLike(value) {
  // Accept a JS array directly (no coercion)
  if (Array.isArray(value)) return value
  if (value == null) return null
  // Accept a JSON string that decodes to an array
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value)
      if (Array.isArray(parsed)) return parsed
      return null
    } catch (e) {
      return null
    }
  }
  // All other types (objects, numbers, booleans) are rejected explicitly
  return null
}

function ensureStringArray(value, errorCode) {
  const arr = parsePgArrayLike(value)
  if (!Array.isArray(arr) || arr.some(x => typeof x !== 'string' || x.length === 0)) throw new Error(errorCode)
  // Return a shallow copy to avoid accidental mutation upstream
  return [...arr]
}

function validateExpectedQuery(expected) {
  if (!expected || typeof expected !== "object" || !/^[A-Za-z0-9][A-Za-z0-9._:-]{2,127}$/.test(expected.caseImportId || "") || !/^[a-f0-9]{12}$/.test(expected.caseFingerprint || "") || !/^[A-Z]{2,4}\.[0-9]{6}\.[0-9]{3}$/.test(expected.caseNumber || "") || ![expected.authorizablePlanHash, expected.planHash, expected.manifestHash, expected.reservationEvidenceHash].every(value => /^[a-f0-9]{64}$/.test(value || "")) || expected.schemaVersion !== AUTHORIZATION_SCHEMA_VERSION) throw new Error("AUTHORIZATION_QUERY_INVALID")
  if (JSON.stringify(Object.keys(expected.requiredScopes || {}).sort()) !== JSON.stringify([...TYPES].sort())) throw new Error("AUTHORIZATION_QUERY_INVALID")
}

function validateConsumeRequest(expected) {
  validateExpectedQuery(expected)
  if (!Array.isArray(expected.authorizationIds) || expected.authorizationIds.length !== TYPES.length || new Set(expected.authorizationIds).size !== TYPES.length || expected.authorizationIds.some(value => !/^[A-Za-z0-9._:-]{8,128}$/.test(value)) || !/^[A-Za-z0-9._:-]{3,128}$/.test(expected.consumedBy || "") || !Number.isFinite(Date.parse(expected.now || ""))) throw new Error("AUTHORIZATION_CONSUME_INVALID")
}

async function consumeAuthorizationsWith(queryable, expected) {
  validateConsumeRequest(expected)
  const result = await queryable.query(`WITH locked AS (SELECT authorization_id,authorization_type,case_import_id,case_fingerprint,case_number,authorizable_plan_hash,plan_hash,manifest_hash,reservation_evidence_hash,expires_at,revoked,consumed_at FROM ${TABLE_NAME} WHERE authorization_id = ANY($1::text[]) FOR UPDATE), updated AS (UPDATE ${TABLE_NAME} a SET consumed_at=$2::timestamptz,consumed_by=$3 FROM locked l WHERE a.authorization_id=l.authorization_id AND l.authorization_type = ANY($4::text[]) AND l.case_import_id=$5 AND l.case_fingerprint=$6 AND l.case_number=$7 AND l.authorizable_plan_hash=$8 AND l.plan_hash=$9 AND l.manifest_hash=$10 AND l.reservation_evidence_hash=$11 AND l.revoked=FALSE AND l.expires_at>$2::timestamptz AND l.consumed_at IS NULL RETURNING a.authorization_id) SELECT CASE WHEN (SELECT count(*) FROM updated)=$12 THEN 'consumed' WHEN (SELECT count(*) FROM locked)=0 THEN 'not_found' WHEN EXISTS(SELECT 1 FROM locked WHERE consumed_at IS NOT NULL) THEN 'already_consumed' WHEN EXISTS(SELECT 1 FROM locked WHERE revoked=TRUE) THEN 'revoked' WHEN EXISTS(SELECT 1 FROM locked WHERE expires_at<=$2::timestamptz) THEN 'expired' ELSE 'binding_mismatch' END AS status`, [[...expected.authorizationIds].sort(), expected.now, expected.consumedBy, [...TYPES].sort(), expected.caseImportId, expected.caseFingerprint, expected.caseNumber, expected.authorizablePlanHash, expected.planHash, expected.manifestHash, expected.reservationEvidenceHash, TYPES.length])
  const status = result?.rows?.[0]?.status
  if (!["consumed", "not_found", "expired", "revoked", "already_consumed", "binding_mismatch"].includes(status)) throw new Error("AUTHORIZATION_CONSUME_UNKNOWN_RESULT")
  return Object.freeze({ status })
}

function validSignature(value) { if (typeof value !== "string" || !SIGNATURE_PATTERN.test(value)) return false; try { return Buffer.from(value, "base64").length === 64 && Buffer.from(value, "base64").toString("base64") === value } catch { return false } }
function mapRow(row) {
  const required = ["authorization_id", "schema_version", "authorization_type", "case_import_id", "case_fingerprint", "case_number", "authorizable_plan_hash", "plan_hash", "manifest_hash", "reservation_evidence_hash", "scope", "issuer", "issued_at", "expires_at", "revoked", "signature", "signature_algorithm", "operational_status"]
  if (!row || required.some(key => row[key] === null || row[key] === undefined)) throw new Error("AUTHORIZATION_ROW_INCOMPLETE")
  if (row.signature_algorithm !== ALGORITHM) throw new Error("AUTHORIZATION_ALGORITHM_INVALID")
  if (!ISSUER_PATTERN.test(row.issuer)) throw new Error("AUTHORIZATION_ISSUER_INVALID")
  if (!validSignature(row.signature)) throw new Error("AUTHORIZATION_SIGNATURE_INVALID")
  if (!Array.isArray(row.scope) || row.operational_status !== "ACTIVE") throw new Error("AUTHORIZATION_ROW_INVALID")
  const issuedAt = new Date(row.issued_at), expiresAt = new Date(row.expires_at)
  if (!Number.isFinite(issuedAt.getTime()) || !Number.isFinite(expiresAt.getTime())) throw new Error("AUTHORIZATION_DATE_INVALID")
  return Object.freeze({ authorizationId: row.authorization_id, schemaVersion: row.schema_version, type: row.authorization_type, caseImportId: row.case_import_id, caseFingerprint: row.case_fingerprint, caseNumber: row.case_number, authorizablePlanHash: row.authorizable_plan_hash, planHash: row.plan_hash, manifestHash: row.manifest_hash, reservationEvidenceHash: row.reservation_evidence_hash, scope: Object.freeze([...row.scope]), issuer: row.issuer, issuedAt: issuedAt.toISOString(), expiresAt: expiresAt.toISOString(), revoked: row.revoked, revokedAt: row.revoked_at ? new Date(row.revoked_at).toISOString() : null, revocationReason: row.revocation_reason ?? null, consumedAt: row.consumed_at ? new Date(row.consumed_at).toISOString() : null, consumedBy: row.consumed_by ?? null, proof: row.signature, algorithm: row.signature_algorithm })
}

function createSingleCaseAuthorizationRepository({ pool }) {
  if (!pool || typeof pool.query !== "function") throw new Error("AUTHORIZATION_POOL_REQUIRED")
  return Object.freeze({ async auditStateForCase(expected, now) {
    validateExpectedQuery(expected)
    if (!Number.isFinite(Date.parse(now || ""))) throw new Error("AUTHORIZATION_AUDIT_TIME_INVALID")
    const result = await pool.query(`SELECT authorization_id,schema_version,authorization_type,case_import_id,case_fingerprint,case_number,authorizable_plan_hash,plan_hash,manifest_hash,reservation_evidence_hash,scope,issuer,issued_at,expires_at,revoked,revoked_at,revocation_reason,consumed_at,consumed_by,signature,signature_algorithm,operational_status FROM ${TABLE_NAME} WHERE case_import_id=$1 AND authorization_type = ANY($2::text[]) AND operational_status='ACTIVE' ORDER BY authorization_type,authorization_id`, [expected.caseImportId, [...TYPES].sort()])
    if (!result || !Array.isArray(result.rows)) throw new Error("AUTHORIZATION_REPOSITORY_RESPONSE_INVALID")
    const records = result.rows.map(mapRow)
    if (records.length === 0) return Object.freeze({ state: "PAIR_ABSENT", records: Object.freeze([]) })
    const typeCounts = new Map(TYPES.map(type => [type, records.filter(row => row.type === type).length]))
    const bindingMatches = record => record.caseFingerprint === expected.caseFingerprint && record.caseNumber === expected.caseNumber && record.authorizablePlanHash === expected.authorizablePlanHash && record.planHash === expected.planHash && record.manifestHash === expected.manifestHash && record.reservationEvidenceHash === expected.reservationEvidenceHash && record.schemaVersion === expected.schemaVersion
    let state = "PAIR_ACTIVE"
    if (records.length !== TYPES.length || [...typeCounts.values()].some(count => count !== 1) || records.some(record => !bindingMatches(record))) state = "PAIR_DIVERGENT"
    else if (records.some(record => record.consumedAt !== null)) state = "PAIR_CONSUMED"
    else if (records.some(record => record.revoked === true)) state = "PAIR_REVOKED"
    else if (records.some(record => Date.parse(record.expiresAt) <= Date.parse(now))) state = "PAIR_EXPIRED"
    return Object.freeze({ state, records: Object.freeze(records) })
  }, async loadForCase(expected) {
    validateExpectedQuery(expected)
    const result = await pool.query(`SELECT authorization_id,schema_version,authorization_type,case_import_id,case_fingerprint,case_number,authorizable_plan_hash,plan_hash,manifest_hash,reservation_evidence_hash,scope,issuer,issued_at,expires_at,revoked,revoked_at,revocation_reason,consumed_at,consumed_by,signature,signature_algorithm,operational_status FROM ${TABLE_NAME} WHERE case_import_id=$1 AND case_fingerprint=$2 AND case_number=$3 AND authorizable_plan_hash=$4 AND plan_hash=$5 AND manifest_hash=$6 AND reservation_evidence_hash=$7 AND schema_version=$8 AND operational_status='ACTIVE' AND consumed_at IS NULL AND authorization_type = ANY($9::text[]) ORDER BY authorization_type,authorization_id`, [expected.caseImportId, expected.caseFingerprint, expected.caseNumber, expected.authorizablePlanHash, expected.planHash, expected.manifestHash, expected.reservationEvidenceHash, expected.schemaVersion, [...TYPES].sort()])
    if (!result || !Array.isArray(result.rows)) throw new Error("AUTHORIZATION_REPOSITORY_RESPONSE_INVALID")
    const rows = result.rows.map(mapRow), ids = new Set(), types = new Set()
    for (const row of rows) { if (ids.has(row.authorizationId) || types.has(row.type)) throw new Error("AUTHORIZATION_REPOSITORY_AMBIGUOUS"); ids.add(row.authorizationId); types.add(row.type) }
    return Object.freeze(rows)
  }, async loadForCheckpoint(expected) {
    validateExpectedQuery(expected)
    if (!Array.isArray(expected.authorizationIds) || expected.authorizationIds.length !== TYPES.length || new Set(expected.authorizationIds).size !== TYPES.length || expected.authorizationIds.some(value => !/^[A-Za-z0-9._:-]{8,128}$/.test(value))) throw new Error("AUTHORIZATION_CHECKPOINT_QUERY_INVALID")
    const result = await pool.query(`SELECT a.authorization_id,a.schema_version,a.authorization_type,a.case_import_id,a.case_fingerprint,a.case_number,a.authorizable_plan_hash,a.plan_hash,a.manifest_hash,a.reservation_evidence_hash,a.scope,a.issuer,a.issued_at,a.expires_at,a.revoked,a.revoked_at,a.revocation_reason,a.consumed_at,a.consumed_by,a.signature,a.signature_algorithm,a.operational_status,c.authorization_ids AS checkpoint_authorization_ids,c.authorization_consumed_by AS checkpoint_authorization_consumed_by FROM ${TABLE_NAME} a JOIN single_case_apply_checkpoints c ON c.case_import_id=a.case_import_id WHERE c.case_import_id=$1 AND a.authorization_id = ANY($2::text[]) ORDER BY a.authorization_type,a.authorization_id`, [expected.caseImportId, [...expected.authorizationIds].sort()])
    if (!result || !Array.isArray(result.rows) || result.rows.length !== TYPES.length) throw new Error("AUTHORIZATION_CHECKPOINT_PAIR_INVALID")
    const checkpointIds = ensureStringArray(result.rows[0]?.checkpoint_authorization_ids, "AUTHORIZATION_CHECKPOINT_IDS_INVALID").sort()
    if (JSON.stringify(checkpointIds) !== JSON.stringify([...expected.authorizationIds].sort()) || result.rows.some(row => JSON.stringify(ensureStringArray(row.checkpoint_authorization_ids, "AUTHORIZATION_CHECKPOINT_IDS_INVALID").sort()) !== JSON.stringify(checkpointIds))) throw new Error("AUTHORIZATION_CHECKPOINT_IDS_INVALID")
    const provenance = result.rows[0]?.checkpoint_authorization_consumed_by
    if (typeof provenance !== "string" || !/^(?:executor:[A-Za-z0-9][A-Za-z0-9._:-]{2,127}|rebind:[a-f0-9]{64})$/.test(provenance)) throw new Error("AUTHORIZATION_CONSUMPTION_PROVENANCE_MISSING")
    if (result.rows.some(row => row.checkpoint_authorization_consumed_by !== provenance || row.consumed_by !== provenance || !row.consumed_at)) throw new Error("AUTHORIZATION_CONSUMPTION_PROVENANCE_MISMATCH")
    const rows = result.rows.map(mapRow), ids = new Set(), types = new Set()
    for (const row of rows) { if (ids.has(row.authorizationId) || types.has(row.type)) throw new Error("AUTHORIZATION_REPOSITORY_AMBIGUOUS"); ids.add(row.authorizationId); types.add(row.type) }
    return Object.freeze(rows)
  }, async consumeAuthorizations(expected) {
    try { return await consumeAuthorizationsWith(pool, expected) }
    catch (error) { if (String(error?.message || "").startsWith("AUTHORIZATION_CONSUME_") && error.message !== "AUTHORIZATION_CONSUME_UNKNOWN_RESULT") throw error; throw new Error("AUTHORIZATION_CONSUME_UNKNOWN_RESULT") }
  } })
}

async function validateSingleCaseAuthorizationSchema(queryable) {
  const codes = new Set()
  const columnsResult = await queryable.query("SELECT column_name,data_type,udt_name,is_nullable,column_default,ordinal_position FROM information_schema.columns WHERE table_schema=current_schema() AND table_name=$1 ORDER BY ordinal_position", [TABLE_NAME])
  if (!columnsResult?.rowCount) return { ok: false, codes: ["TABLE_MISSING"] }
  const columns = new Map(columnsResult.rows.map(row => [row.column_name, row]))
  for (const expected of EXPECTED_COLUMNS) {
    const actual = columns.get(expected.name)
    if (!actual) { codes.add("COLUMN_MISSING"); continue }
    if (actual.data_type !== expected.type || actual.udt_name !== expected.udt) codes.add("COLUMN_TYPE_MISMATCH")
    if ((actual.is_nullable === "YES") !== expected.nullable) codes.add("COLUMN_NULLABILITY_MISMATCH")
    if (normalizeDefault(actual.column_default) !== expected.defaultValue) codes.add("COLUMN_DEFAULT_MISMATCH")
    if (Number(actual.ordinal_position) !== expected.position) codes.add("COLUMN_ORDER_MISMATCH")
  }
  if (columns.size !== EXPECTED_COLUMNS.length) codes.add("UNEXPECTED_COLUMN")
  const constraintsResult = await queryable.query("SELECT c.conname,c.contype,pg_get_constraintdef(c.oid,true) AS definition,array_to_json(array_agg(a.attname ORDER BY k.ordinality) FILTER (WHERE a.attname IS NOT NULL)) AS columns FROM pg_constraint c LEFT JOIN LATERAL unnest(c.conkey) WITH ORDINALITY k(attnum,ordinality) ON true LEFT JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=k.attnum WHERE c.conrelid=to_regclass($1) GROUP BY c.oid,c.conname,c.contype", [TABLE_NAME])
  const constraints = new Map(constraintsResult.rows.map(row => [row.conname, row]))
  const pk = [...constraints.values()].filter(row => row.contype === "p")
  try {
    if (pk.length !== 1) {
      codes.add("PRIMARY_KEY_MISMATCH")
    } else {
      const pkColumns = ensureStringArray(pk[0].columns, "PRIMARY_KEY_MISMATCH")
      if (JSON.stringify(pkColumns) !== JSON.stringify(["authorization_id"])) codes.add("PRIMARY_KEY_MISMATCH")
    }
  } catch (e) {
    codes.add("PRIMARY_KEY_MISMATCH")
  }
  if (constraints.has("single_case_auth_binding_type_unique") || [...constraints.values()].some(row => row.contype === "u")) codes.add("LIFETIME_UNIQUE_PRESENT")
  for (const [name, expectedExpression] of Object.entries(CHECK_SQL)) {
    const row = constraints.get(name)
    let columnsArr
    try {
      columnsArr = ensureStringArray(row?.columns, "CHECK_CONSTRAINT_MISMATCH")
    } catch (e) {
      codes.add("CHECK_CONSTRAINT_MISMATCH")
      continue
    }
    const columns = [...columnsArr].sort()
    let expressionMatches = false
    try { expressionMatches = canonicalSqlExpression(row?.definition) === canonicalSqlExpression(expectedExpression) } catch {}
    if (!row || row.contype !== "c" || !expressionMatches || JSON.stringify(columns) !== JSON.stringify([...CHECK_COLUMNS[name]].sort())) codes.add("CHECK_CONSTRAINT_MISMATCH")
  }
  const indexes = await queryable.query("SELECT i.relname AS index_name,ix.indisunique AS is_unique,am.amname AS method,t.relname AS table_name,ix.indnkeyatts AS key_attribute_count,ix.indnatts AS total_attribute_count,ix.indexprs IS NOT NULL AS has_expressions,pg_get_expr(ix.indpred,ix.indrelid,true) AS predicate,array_to_json(array_agg(a.attname ORDER BY k.ordinality) FILTER (WHERE k.ordinality<=ix.indnkeyatts AND a.attname IS NOT NULL)) AS key_columns FROM pg_index ix JOIN pg_class i ON i.oid=ix.indexrelid JOIN pg_class t ON t.oid=ix.indrelid JOIN pg_am am ON am.oid=i.relam LEFT JOIN LATERAL unnest(ix.indkey) WITH ORDINALITY k(attnum,ordinality) ON true LEFT JOIN pg_attribute a ON a.attrelid=t.oid AND a.attnum=k.attnum WHERE t.relnamespace=current_schema()::regnamespace AND t.relname=$1 AND i.relname=$2 GROUP BY i.relname,ix.indisunique,am.amname,t.relname,ix.indnkeyatts,ix.indnatts,ix.indexprs,ix.indpred,ix.indrelid", [TABLE_NAME, ACTIVE_INDEX])
  const active = indexes.rowCount === 1 ? indexes.rows[0] : null
  let predicateMatches = false
  try { predicateMatches = canonicalSqlExpression(active?.predicate) === canonicalSqlExpression(ACTIVE_INDEX_PREDICATE) } catch {}
  try {
    const activeKeyColumns = ensureStringArray(active?.key_columns, "ACTIVE_UNIQUE_INDEX_MISMATCH")
    if (!active || active.is_unique !== true || active.method !== "btree" || active.table_name !== TABLE_NAME || Number(active.key_attribute_count) !== ACTIVE_INDEX_COLUMNS.length || Number(active.total_attribute_count) !== ACTIVE_INDEX_COLUMNS.length || active.has_expressions !== false || JSON.stringify(activeKeyColumns) !== JSON.stringify(ACTIVE_INDEX_COLUMNS) || !predicateMatches) codes.add("ACTIVE_UNIQUE_INDEX_MISMATCH")
  } catch (e) {
    codes.add("ACTIVE_UNIQUE_INDEX_MISMATCH")
  }
  return { ok: codes.size === 0, codes: [...codes].sort() }
}

async function migrateSingleCaseAuthorizations(pool) {
  const client = await pool.connect()
  try {
    await client.query("BEGIN")
    const registry = await client.query("SELECT to_regclass('oraculum_state_migrations') AS table_name")
    if (!registry.rows[0]?.table_name) throw new Error("MIGRATION_REGISTRY_MISSING")
    const prior = await client.query("SELECT migration_id FROM oraculum_state_migrations WHERE migration_id=$1", [MIGRATION_ID])
    if (!prior.rowCount) await client.query(CREATE_TABLE_SQL)
    const schema = await validateSingleCaseAuthorizationSchema(client)
    if (!schema.ok) throw new Error(`AUTHORIZATION_SCHEMA_INCOMPATIBLE:${schema.codes.join(",")}`)
    if (!prior.rowCount) await client.query("INSERT INTO oraculum_state_migrations(migration_id,details,applied_at) VALUES($1,$2,CURRENT_TIMESTAMP)", [MIGRATION_ID, JSON.stringify({ table: TABLE_NAME, schemaVersion: 1, ddlSource: "programmatic" })])
    await client.query("COMMIT")
    return { ok: true, migrationId: MIGRATION_ID, applied: !prior.rowCount, schema }
  } catch (error) { await client.query("ROLLBACK").catch(() => {}); throw error } finally { client.release() }
}

module.exports = { MIGRATION_ID, TABLE_NAME, ALGORITHM, TYPES, ACTIVE_INDEX, ACTIVE_INDEX_COLUMNS, ACTIVE_INDEX_PREDICATE, ISSUER_PATTERN, SIGNATURE_PATTERN, CHECK_SQL, CREATE_TABLE_SQL, EXPECTED_COLUMNS, CHECK_COLUMNS, sqlTokens, parseSqlExpression, canonicalSqlExpression, normalizeSql, normalizeDefault, validateExpectedQuery, validateConsumeRequest, consumeAuthorizationsWith, validSignature, mapRow, createSingleCaseAuthorizationRepository, validateSingleCaseAuthorizationSchema, migrateSingleCaseAuthorizations }
