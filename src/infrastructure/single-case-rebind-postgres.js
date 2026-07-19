"use strict"

const { deepClone, deepFreeze } = require("../domain/single-case-apply-contracts")
const { validateCheckpoint } = require("../domain/single-case-apply")
const {
  HASH_PATTERN,
  ALLOWED_REBIND_REASONS,
  REQUESTED_BY_PATTERN,
  validateRebindRequest,
  validateCheckpointEligibility,
  computeRebindId,
  createRebindAuditMetadata,
  sanitizeRebindResponse
} = require("../domain/single-case-rebind-contracts")
const { normalizeDefault, TYPES: AUTH_TYPES } = require("./single-case-authorization-postgres")

// Extended SQL expression parser with arithmetic support for rebind constraints
function sqlTokens(value) {
  const source = String(value || "").replace(/::(?:text|jsonb|boolean|integer|bigint|timestamp\s+with\s+time\s+zone)/gi, "").replace(/^\s*CHECK\s*/i, "")
  const tokens = []; let offset = 0
  const pattern = /\s*(?:('(?:''|[^'])*')|([A-Za-z_][A-Za-z0-9_$]*)|([0-9]+)|((?:>=|<=|<>|!=|=|>|<|~|\+|-|\*|\/))|([()\[\],]))/y
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
  const parseArithmetic = () => {
    let left = parsePrimary()
    while (peek("operator") && ["+", "-", "*", "/"].includes(tokens[position].value)) {
      const op = take("operator").value
      const right = parsePrimary()
      left = [op, left, right]
    }
    return left
  }
  const parseComparison = () => {
    const left=parseArithmetic()
    if (peek("word","is")) { position++;const negated=peek("word","not");if(negated)position++;take("word","null");return [negated?"is-not-null":"is-null",left] }
    if (peek("word","in")) { position++;take("punctuation","(");return ["in",left,...parseList(")")] }
    if (peek("operator")) {
      const operator=take("operator").value,right=parseArithmetic()
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

const MIGRATION_ID = "single-case-apply-rebind-audit-v1"
const TABLE_NAME = "single_case_apply_rebind_audit"
const CASE_IMPORT_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{2,127}$/
const REBIND_ID_PATTERN = /^[a-f0-9]{64}$/
const LEASE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{2,127}$/
const OWNER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{2,79}$/

const CHECK_SQL = Object.freeze({
  single_case_rebind_audit_rebind_id_check: "rebind_id ~ '^[a-f0-9]{64}$'",
  single_case_rebind_audit_case_id_check: "case_import_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{2,127}$'",
  single_case_rebind_audit_source_version_check: "source_checkpoint_version > 0",
  single_case_rebind_audit_rebound_version_check: "rebound_checkpoint_version = source_checkpoint_version + 1",
  single_case_rebind_audit_auth_count_check: "authorization_count = 2",
  single_case_rebind_audit_previous_hash_check: "previous_authorization_set_hash ~ '^[a-f0-9]{64}$'",
  single_case_rebind_audit_current_hash_check: "current_authorization_set_hash ~ '^[a-f0-9]{64}$'",
  single_case_rebind_audit_evidence_hash_check: "reconciliation_evidence_hash ~ '^[a-f0-9]{64}$'",
  single_case_rebind_audit_reason_check: "reason = 'CONTACT_RECONCILED_AFTER_DIVERGENCE'",
  single_case_rebind_audit_requested_by_check: "requested_by ~ '^[A-Za-z][A-Za-z0-9._:-]{2,63}$'",
  single_case_rebind_audit_token_check: "fencing_token > 0",
  single_case_rebind_audit_lease_id_check: "lease_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{2,127}$'"
})

const CREATE_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS ${TABLE_NAME} (
  rebind_id TEXT PRIMARY KEY,
  case_import_id TEXT NOT NULL,
  source_checkpoint_version BIGINT NOT NULL,
  rebound_checkpoint_version BIGINT NOT NULL,
  authorization_count INTEGER NOT NULL,
  previous_authorization_set_hash TEXT NOT NULL,
  current_authorization_set_hash TEXT NOT NULL,
  reconciliation_evidence_hash TEXT NOT NULL,
  reason TEXT NOT NULL,
  requested_by TEXT NOT NULL,
  fencing_token BIGINT NOT NULL,
  lease_id TEXT NOT NULL,
  committed_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ${Object.entries(CHECK_SQL).map(([name, expression]) => `CONSTRAINT ${name} CHECK (${expression})`).join(",\n  ")}
);
CREATE INDEX IF NOT EXISTS single_case_rebind_audit_case_committed_idx
ON ${TABLE_NAME} (case_import_id, committed_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS single_case_rebind_audit_case_source_current_idx
ON ${TABLE_NAME} (case_import_id, source_checkpoint_version, current_authorization_set_hash)`

const EXPECTED_COLUMNS = Object.freeze([
  ["rebind_id", "text", "text", false, null],
  ["case_import_id", "text", "text", false, null],
  ["source_checkpoint_version", "bigint", "int8", false, null],
  ["rebound_checkpoint_version", "bigint", "int8", false, null],
  ["authorization_count", "integer", "int4", false, null],
  ["previous_authorization_set_hash", "text", "text", false, null],
  ["current_authorization_set_hash", "text", "text", false, null],
  ["reconciliation_evidence_hash", "text", "text", false, null],
  ["reason", "text", "text", false, null],
  ["requested_by", "text", "text", false, null],
  ["fencing_token", "bigint", "int8", false, null],
  ["lease_id", "text", "text", false, null],
  ["committed_at", "timestamp with time zone", "timestamptz", false, "current_timestamp"]
].map(([name, type, udt, nullable, defaultValue], index) => Object.freeze({ name, type, udt, nullable, defaultValue, position: index + 1 })))

const CHECK_COLUMNS = Object.freeze({
  single_case_rebind_audit_rebind_id_check: ["rebind_id"],
  single_case_rebind_audit_case_id_check: ["case_import_id"],
  single_case_rebind_audit_source_version_check: ["source_checkpoint_version"],
  single_case_rebind_audit_rebound_version_check: ["rebound_checkpoint_version", "source_checkpoint_version"],
  single_case_rebind_audit_auth_count_check: ["authorization_count"],
  single_case_rebind_audit_previous_hash_check: ["previous_authorization_set_hash"],
  single_case_rebind_audit_current_hash_check: ["current_authorization_set_hash"],
  single_case_rebind_audit_evidence_hash_check: ["reconciliation_evidence_hash"],
  single_case_rebind_audit_reason_check: ["reason"],
  single_case_rebind_audit_requested_by_check: ["requested_by"],
  single_case_rebind_audit_token_check: ["fencing_token"],
  single_case_rebind_audit_lease_id_check: ["lease_id"]
})

const fail = code => { throw new Error(code) }

const instant = value => { const date = new Date(value); if (!Number.isFinite(date.getTime())) fail("POSTGRES_TRANSACTION_FAILED"); return date.toISOString() }

const LEGITIMATE_ERROR_CODES = new Set([
  "CHECKPOINT_AUTHORIZATION_IDS_MISMATCH",
  "CHECKPOINT_NOT_ELIGIBLE",
  "CHECKPOINT_VERSION_MISMATCH",
  "CHECKPOINT_SCHEMA_INVALID",
  "CHECKPOINT_AUTHORIZATION_DIVERGENCE",
  "RECONCILIATION_EVIDENCE_HASH_MISMATCH",
  "REBIND_REQUEST_INVALID",
  "REBIND_OLD_PAIR_NOT_CONSUMED",
  "REBIND_OLD_PAIR_CONSUMED_PARTIAL",
  "REBIND_OLD_CONSUMED_BY_DIVERGENT",
  "REBIND_OLD_CONSUMED_BY_INVALID_FORMAT",
  "REBIND_OLD_CONSUMED_BY_LEASE_MISMATCH",
  "REBIND_OLD_PAIR_TYPES_INVALID",
  "REBIND_OLD_CHECKPOINT_IDS_MISMATCH",
  "REBIND_OLD_BINDINGS_MISMATCH",
  "REBIND_OLD_BINDINGS_INTERNAL_MISMATCH",
  "REBIND_NEW_PAIR_NOT_ACTIVE",
  "REBIND_NEW_PAIR_CONSUMED",
  "REBIND_NEW_PAIR_REVOKED",
  "REBIND_NEW_PAIR_EXPIRED",
  "REBIND_NEW_PAIR_TYPES_INVALID",
  "REBIND_NEW_BINDINGS_MISMATCH",
  "REBIND_NEW_BINDINGS_INTERNAL_MISMATCH",
  "REBIND_BINDINGS_CROSS_MISMATCH",
  "REBIND_CHECKPOINT_NOT_FOUND",
  "REBIND_CONSUME_NEW_PAIR_FAILED",
  "REBIND_CONSUME_TIMESTAMP_DIVERGENT",
  "REBIND_CONSUME_BY_DIVERGENT",
  "REBIND_CONSUME_BY_INVALID",
  "REBIND_CHECKPOINT_UPDATE_FAILED",
  "REBIND_AUDIT_INSERT_FAILED",
  "REBIND_LEASE_NOT_FOUND",
  "REBIND_LEASE_OWNER_MISMATCH",
  "REBIND_LEASE_FENCING_MISMATCH",
  "REBIND_LEASE_EXPIRED",
  "REBIND_LEASE_EXPIRED_DURING_TRANSACTION",
  "REBIND_AUDIT_DIVERGENT",
  "REBIND_CHECKPOINT_DIVERGENT",
  "POSTGRES_UNAVAILABLE",
  "POSTGRES_TRANSACTION_FAILED",
  "SCHEMA_INCOMPATIBLE"
])

const mapError = error => {
  const message = error?.message || ""
  if (LEGITIMATE_ERROR_CODES.has(message)) return new Error(message)
  const unavailableCodes = new Set(["ECONNREFUSED", "ECONNRESET", "ETIMEDOUT", "EHOSTUNREACH", "ENETUNREACH", "57P01", "57P02", "57P03", "08000", "08001", "08003", "08004", "08006", "08007", "08P01"])
  const unavailable = message === "POOL_UNAVAILABLE" || unavailableCodes.has(error?.code) || error?.name === "ConnectionTerminatedError"
  return new Error(unavailable ? "POSTGRES_UNAVAILABLE" : "POSTGRES_TRANSACTION_FAILED")
}

async function transaction(pool, action) {
  let client
  try {
    client = await pool.connect()
    await client.query("BEGIN")
    const value = await action(client)
    await client.query("COMMIT")
    return value
  } catch (error) {
    if (client) await client.query("ROLLBACK").catch(() => {})
    throw mapError(error)
  } finally {
    client?.release()
  }
}

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

// Helper privado para diagnosticar falhas de mutaÃ§Ã£o envolvendo lease
async function diagnoseLeaseMutationFailure(client, { caseImportId, leaseId, ownerId, fencingToken, fallbackCode }) {
  const recheckResult = await client.query(
    `SELECT owner_id, fencing_token, released_at, expires_at,
            expires_at > CURRENT_TIMESTAMP AS is_current
     FROM single_case_apply_leases
     WHERE case_import_id = $1 AND lease_id = $2`,
    [caseImportId, leaseId]
  )

  // a. nenhuma linha
  if (!recheckResult.rowCount) {
    fail("REBIND_LEASE_NOT_FOUND")
  }

  const lease = recheckResult.rows[0]

  // b. owner_id divergente
  if (lease.owner_id !== ownerId) {
    fail("REBIND_LEASE_OWNER_MISMATCH")
  }

  // c. fencing_token divergente
  if (Number(lease.fencing_token) !== Number(fencingToken)) {
    fail("REBIND_LEASE_FENCING_MISMATCH")
  }

  // d. released_at nÃ£o nulo
  if (lease.released_at !== null) {
    fail("REBIND_LEASE_EXPIRED_DURING_TRANSACTION")
  }

  // e. is_current diferente de true
  if (lease.is_current !== true) {
    fail("REBIND_LEASE_EXPIRED_DURING_TRANSACTION")
  }

  // f. lease integralmente vÃ¡lido - emitir fallbackCode
  fail(fallbackCode)
}

function createSingleCaseRebindPostgresRepository({ pool, ownerId, now = () => new Date().toISOString() }) {
  if (!pool || typeof pool.connect !== "function" || typeof pool.query !== "function") fail("POSTGRES_UNAVAILABLE")
  if (!OWNER_PATTERN.test(ownerId || "") || typeof now !== "function") fail("POSTGRES_TRANSACTION_FAILED")

  const repository = {
    async executeRebind(request) {
      // Validar requisiÃ§Ã£o com contratos puros
      validateRebindRequest(request)

      const rebindId = computeRebindId(request)

      return transaction(pool, async client => {
        const at = instant(now())

        // 1. Advisory lock (serializa rebinds do mesmo caso)
        await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [request.caseImportId])

        // 2. Lease FOR UPDATE
        const leaseResult = await client.query(
          `SELECT case_import_id, lease_id, fencing_token, owner_id, expires_at, released_at
           FROM single_case_apply_leases
           WHERE case_import_id = $1
           FOR UPDATE`,
          [request.caseImportId]
        )
        if (!leaseResult.rowCount) fail("REBIND_LEASE_NOT_FOUND")
        const lease = leaseResult.rows[0]
        if (lease.owner_id !== ownerId) fail("REBIND_LEASE_OWNER_MISMATCH")
        if (lease.released_at) fail("REBIND_LEASE_EXPIRED")

        // 3. Checkpoint FOR UPDATE
        const checkpointResult = await client.query(
          `SELECT case_import_id, schema_version, checkpoint_version, case_fingerprint, case_number,
                  authorizable_plan_hash, authorization_ids, global_status, checkpoint_payload,
                  fencing_token, lease_id
           FROM single_case_apply_checkpoints
           WHERE case_import_id = $1
           FOR UPDATE`,
          [request.caseImportId]
        )
        if (!checkpointResult.rowCount) fail("REBIND_CHECKPOINT_NOT_FOUND")
        const checkpointRow = checkpointResult.rows[0]
        const checkpoint = deepClone(checkpointRow.checkpoint_payload)

        // 4. Consultar auditoria por rebindId (idempotÃªncia)
        const auditResult = await client.query(
          `SELECT rebind_id, case_import_id, source_checkpoint_version, rebound_checkpoint_version,
                  authorization_count, previous_authorization_set_hash, current_authorization_set_hash,
                  reconciliation_evidence_hash, reason, requested_by, fencing_token, lease_id, committed_at
           FROM ${TABLE_NAME}
           WHERE rebind_id = $1`,
          [rebindId]
        )

        if (auditResult.rowCount > 0) {
          // IdempotÃªncia: rebind jÃ¡ executado
          const audit = auditResult.rows[0]

          // Validar que a auditoria corresponde Ã  requisiÃ§Ã£o
          if (audit.case_import_id !== request.caseImportId ||
              Number(audit.source_checkpoint_version) !== request.sourceCheckpointVersion ||
              Number(audit.rebound_checkpoint_version) !== request.reboundCheckpointVersion ||
              audit.previous_authorization_set_hash !== request.oldAuthorizationSetHash ||
              audit.current_authorization_set_hash !== request.newAuthorizationSetHash) {
            fail("REBIND_AUDIT_DIVERGENT")
          }

          // Validar que checkpoint estÃ¡ na versÃ£o esperada
          if (Number(checkpointRow.checkpoint_version) !== request.reboundCheckpointVersion) {
            fail("REBIND_CHECKPOINT_DIVERGENT")
          }

          // Retornar resposta de already rebound
          return sanitizeRebindResponse({
            status: "rebound",
            rebindId,
            sourceCheckpointVersion: request.sourceCheckpointVersion,
            reboundCheckpointVersion: request.reboundCheckpointVersion,
            authorizationCount: 2,
            previousAuthorizationSetHash: request.oldAuthorizationSetHash,
            currentAuthorizationSetHash: request.newAuthorizationSetHash,
            reconciliationEvidenceHash: request.reconciliationEvidenceHash,
            reason: request.reason,
            requestedBy: request.requestedBy
          })
        }

        // Validar elegibilidade do checkpoint (somente se nÃ£o Ã© retry)
        validateCheckpointEligibility(checkpoint, request)

        // 5. Bloquear 4 autorizaÃ§Ãµes em ordem determinÃ­stica (UMA query)
        const allAuthIds = [...request.oldAuthorizationIds, ...request.newAuthorizationIds].sort()
        const authResult = await client.query(
          `SELECT authorization_id, authorization_type, case_import_id, case_fingerprint, case_number,
                  authorizable_plan_hash, plan_hash, manifest_hash, reservation_evidence_hash,
                  schema_version, revoked, consumed_at, consumed_by, expires_at, operational_status
           FROM single_case_apply_authorizations
           WHERE authorization_id = ANY($1::text[])
           ORDER BY authorization_id
           FOR UPDATE`,
          [allAuthIds]
        )

        if (authResult.rowCount !== 4) fail("REBIND_OLD_AUTHORIZATION_IDS_COUNT_MISMATCH")

        const authById = new Map(authResult.rows.map(row => [row.authorization_id, row]))
        const oldAuths = request.oldAuthorizationIds.map(id => authById.get(id))
        const newAuths = request.newAuthorizationIds.map(id => authById.get(id))

        if (oldAuths.some(a => !a) || newAuths.some(a => !a)) fail("REBIND_OLD_AUTHORIZATION_IDS_COUNT_MISMATCH")

        // 6. Validar par antigo (jÃ¡ consumido)
        const oldConsumed = [!!oldAuths[0].consumed_at, !!oldAuths[1].consumed_at]
        if (oldConsumed[0] && !oldConsumed[1] || !oldConsumed[0] && oldConsumed[1]) {
          fail("REBIND_OLD_PAIR_CONSUMED_PARTIAL")
        }
        if (!oldAuths[0].consumed_at || !oldAuths[1].consumed_at) fail("REBIND_OLD_PAIR_NOT_CONSUMED")
        if (oldAuths[0].consumed_by !== oldAuths[1].consumed_by) fail("REBIND_OLD_CONSUMED_BY_DIVERGENT")

        const consumedBy = oldAuths[0].consumed_by
        if (!consumedBy || typeof consumedBy !== 'string' || !consumedBy.startsWith('executor:')) {
          fail("REBIND_OLD_CONSUMED_BY_INVALID_FORMAT")
        }

        const leaseIdFromConsumed = consumedBy.substring('executor:'.length)
        if (leaseIdFromConsumed !== checkpointRow.lease_id) fail("REBIND_OLD_CONSUMED_BY_LEASE_MISMATCH")

        // Validar tipos do par antigo
        const oldTypes = [...oldAuths.map(a => a.authorization_type)].sort()
        const expectedTypes = [...AUTH_TYPES].sort()
        if (JSON.stringify(oldTypes) !== JSON.stringify(expectedTypes)) fail("REBIND_OLD_PAIR_TYPES_INVALID")

        // Validar correspondÃªncia com checkpoint.authorizationIds
        const checkpointAuthIds = ensureStringArray(checkpointRow.authorization_ids, "REBIND_OLD_CHECKPOINT_IDS_MISMATCH")
        if (JSON.stringify([...request.oldAuthorizationIds].sort()) !== JSON.stringify([...checkpointAuthIds].sort())) {
          fail("REBIND_OLD_CHECKPOINT_IDS_MISMATCH")
        }

        // Validar bindings do par antigo
        for (const auth of oldAuths) {
          if (auth.case_import_id !== checkpointRow.case_import_id ||
              auth.case_fingerprint !== checkpointRow.case_fingerprint ||
              auth.case_number !== checkpointRow.case_number ||
              auth.authorizable_plan_hash !== checkpointRow.authorizable_plan_hash ||
              auth.schema_version !== checkpointRow.schema_version) {
            fail("REBIND_OLD_BINDINGS_MISMATCH")
          }
        }

        // Validar igualdade interna do par antigo (plan_hash, manifest_hash, reservation_evidence_hash)
        if (oldAuths[0].plan_hash !== oldAuths[1].plan_hash ||
            oldAuths[0].manifest_hash !== oldAuths[1].manifest_hash ||
            oldAuths[0].reservation_evidence_hash !== oldAuths[1].reservation_evidence_hash) {
          fail("REBIND_OLD_BINDINGS_INTERNAL_MISMATCH")
        }

        // 7. Validar novo par (nÃ£o consumido, nÃ£o revogado, nÃ£o expirado usando expires_at da leitura)
        for (const auth of newAuths) {
          if (auth.operational_status !== 'ACTIVE') fail("REBIND_NEW_PAIR_NOT_ACTIVE")
          if (auth.consumed_at) fail("REBIND_NEW_PAIR_CONSUMED")
          if (auth.revoked) fail("REBIND_NEW_PAIR_REVOKED")
          // ValidaÃ§Ã£o prÃ©via de expiraÃ§Ã£o usando data da aplicaÃ§Ã£o
          if (Date.parse(auth.expires_at) <= Date.parse(at)) fail("REBIND_NEW_PAIR_EXPIRED")
        }

        // Validar tipos do novo par
        const newTypes = [...newAuths.map(a => a.authorization_type)].sort()
        if (JSON.stringify(newTypes) !== JSON.stringify(expectedTypes)) fail("REBIND_NEW_PAIR_TYPES_INVALID")

        // Validar bindings do novo par contra checkpoint
        for (const auth of newAuths) {
          if (auth.case_import_id !== checkpointRow.case_import_id ||
              auth.case_fingerprint !== checkpointRow.case_fingerprint ||
              auth.case_number !== checkpointRow.case_number ||
              auth.authorizable_plan_hash !== checkpointRow.authorizable_plan_hash ||
              auth.schema_version !== checkpointRow.schema_version) {
            fail("REBIND_NEW_BINDINGS_MISMATCH")
          }
        }

        // Validar igualdade interna do novo par
        if (newAuths[0].plan_hash !== newAuths[1].plan_hash ||
            newAuths[0].manifest_hash !== newAuths[1].manifest_hash ||
            newAuths[0].reservation_evidence_hash !== newAuths[1].reservation_evidence_hash) {
          fail("REBIND_NEW_BINDINGS_INTERNAL_MISMATCH")
        }

        // 8. Validar bindings cruzados (novo par deve ter mesmos hashes que par antigo)
        if (newAuths[0].plan_hash !== oldAuths[0].plan_hash ||
            newAuths[0].manifest_hash !== oldAuths[0].manifest_hash ||
            newAuths[0].reservation_evidence_hash !== oldAuths[0].reservation_evidence_hash) {
          fail("REBIND_BINDINGS_CROSS_MISMATCH")
        }

        // 9. Validar lease vigente antes do consumo e consumir SOMENTE o novo par usando CURRENT_TIMESTAMP do PostgreSQL
        const consumeResult = await client.query(
          `UPDATE single_case_apply_authorizations
           SET consumed_at = CURRENT_TIMESTAMP, consumed_by = $1
           WHERE authorization_id = ANY($2::text[])
             AND operational_status = 'ACTIVE'
             AND consumed_at IS NULL
             AND revoked = FALSE
             AND expires_at > CURRENT_TIMESTAMP
             AND EXISTS (
               SELECT 1 FROM single_case_apply_leases
               WHERE case_import_id = $3
                 AND lease_id = $4
                 AND owner_id = $5
                 AND fencing_token = $6
                 AND released_at IS NULL
                 AND expires_at > CURRENT_TIMESTAMP
             )
           RETURNING authorization_id, consumed_at, consumed_by`,
          [
            `rebind:${rebindId}`,
            [...request.newAuthorizationIds].sort(),
            request.caseImportId,
            lease.lease_id,
            ownerId,
            lease.fencing_token
          ]
        )

        if (consumeResult.rowCount !== 2) {
          // Diagnosticar falha usando helper privado
          await diagnoseLeaseMutationFailure(client, {
            caseImportId: request.caseImportId,
            leaseId: lease.lease_id,
            ownerId,
            fencingToken: lease.fencing_token,
            fallbackCode: "REBIND_CONSUME_NEW_PAIR_FAILED"
          })
        }

        // Validar que ambas as autorizaÃ§Ãµes receberam exatamente o mesmo consumed_at e consumed_by
        const consumedRows = consumeResult.rows
        if (consumedRows[0].consumed_at !== consumedRows[1].consumed_at) fail("REBIND_CONSUME_TIMESTAMP_DIVERGENT")
        if (consumedRows[0].consumed_by !== consumedRows[1].consumed_by) fail("REBIND_CONSUME_BY_DIVERGENT")
        if (consumedRows[0].consumed_by !== `rebind:${rebindId}`) fail("REBIND_CONSUME_BY_INVALID")

        const consumedAt = instant(consumedRows[0].consumed_at)

        // 10. Atualizar SOMENTE version e authorizationIds do checkpoint
        const updatedCheckpoint = deepClone(checkpoint)
        updatedCheckpoint.version = request.reboundCheckpointVersion
        updatedCheckpoint.authorizationIds = [...request.newAuthorizationIds]

        // Construir decision para o novo par de autorizaÃ§Ãµes
        const reboundDecision = deepFreeze({
          schemaVersion: 1,
          caseImportId: checkpoint.caseImportId,
          caseFingerprint: checkpoint.caseFingerprint,
          caseNumber: checkpoint.caseNumber,
          authorizablePlanHash: checkpoint.authorizablePlanHash,
          authorizationIds: [...request.newAuthorizationIds].sort(),
          scopes: [], // Scopes nÃ£o mudam no rebind
          authorizationExpiresAt: null, // NÃ£o necessÃ¡rio para validaÃ§Ã£o estrutural
          validatedAt: at,
          safeToApply: true,
          blockers: []
        })

        // Validar checkpoint mutado com contrato estrito antes de persistir
        validateCheckpoint(updatedCheckpoint, reboundDecision)

        // CAS do checkpoint com verificaÃ§Ã£o integral do lease vigente
        const checkpointUpdateResult = await client.query(
          `UPDATE single_case_apply_checkpoints
           SET checkpoint_version = $1,
               authorization_ids = $2::jsonb,
               checkpoint_payload = $3::jsonb,
               fencing_token = $4,
               lease_id = $5,
               updated_at = CURRENT_TIMESTAMP
           WHERE case_import_id = $6
             AND checkpoint_version = $7
             AND lease_id = $8
             AND fencing_token = $9
             AND EXISTS (
               SELECT 1 FROM single_case_apply_leases
               WHERE case_import_id = $6
                 AND lease_id = $8
                 AND owner_id = $10
                 AND fencing_token = $9
                 AND released_at IS NULL
                 AND expires_at > CURRENT_TIMESTAMP
             )
           RETURNING checkpoint_version`,
          [
            request.reboundCheckpointVersion,
            JSON.stringify(updatedCheckpoint.authorizationIds),
            JSON.stringify(updatedCheckpoint),
            lease.fencing_token,
            lease.lease_id,
            request.caseImportId,
            request.sourceCheckpointVersion,
            checkpointRow.lease_id,
            checkpointRow.fencing_token,
            ownerId
          ]
        )

        if (checkpointUpdateResult.rowCount !== 1) {
          // Diagnosticar falha usando helper privado
          await diagnoseLeaseMutationFailure(client, {
            caseImportId: request.caseImportId,
            leaseId: lease.lease_id,
            ownerId,
            fencingToken: lease.fencing_token,
            fallbackCode: "REBIND_CHECKPOINT_UPDATE_FAILED"
          })
        }

        // 11. Inserir auditoria com verificaÃ§Ã£o final do lease
        const auditMetadata = createRebindAuditMetadata(request)
        const auditInsertResult = await client.query(
          `INSERT INTO ${TABLE_NAME}(
             rebind_id, case_import_id, source_checkpoint_version, rebound_checkpoint_version,
             authorization_count, previous_authorization_set_hash, current_authorization_set_hash,
             reconciliation_evidence_hash, reason, requested_by, fencing_token, lease_id, committed_at
           )
           SELECT $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, CURRENT_TIMESTAMP
           WHERE EXISTS (
             SELECT 1 FROM single_case_apply_leases
             WHERE case_import_id = $2
               AND lease_id = $12
               AND owner_id = $13
               AND fencing_token = $11
               AND released_at IS NULL
               AND expires_at > CURRENT_TIMESTAMP
           )
           RETURNING rebind_id`,
          [
            auditMetadata.rebindId,
            auditMetadata.caseImportId,
            auditMetadata.sourceCheckpointVersion,
            auditMetadata.reboundCheckpointVersion,
            auditMetadata.authorizationCount,
            auditMetadata.previousAuthorizationSetHash,
            auditMetadata.currentAuthorizationSetHash,
            auditMetadata.reconciliationEvidenceHash,
            auditMetadata.reason,
            auditMetadata.requestedBy,
            lease.fencing_token,
            lease.lease_id,
            ownerId
          ]
        )

        if (auditInsertResult.rowCount !== 1) {
          // Diagnosticar falha usando helper privado
          await diagnoseLeaseMutationFailure(client, {
            caseImportId: request.caseImportId,
            leaseId: lease.lease_id,
            ownerId,
            fencingToken: lease.fencing_token,
            fallbackCode: "REBIND_AUDIT_INSERT_FAILED"
          })
        }

        // 13. COMMIT (transaÃ§Ã£o completa)
        return sanitizeRebindResponse({
          status: "rebound",
          rebindId,
          sourceCheckpointVersion: request.sourceCheckpointVersion,
          reboundCheckpointVersion: request.reboundCheckpointVersion,
          authorizationCount: 2,
          previousAuthorizationSetHash: request.oldAuthorizationSetHash,
          currentAuthorizationSetHash: request.newAuthorizationSetHash,
          reconciliationEvidenceHash: request.reconciliationEvidenceHash,
          reason: request.reason,
          requestedBy: request.requestedBy
        })
      })
    }
  }

  return Object.freeze(repository)
}

async function validateSingleCaseRebindAuditSchema(queryable) {
  const codes = new Set()

  const columnsResult = await queryable.query(
    "SELECT column_name, data_type, udt_name, is_nullable, column_default, ordinal_position FROM information_schema.columns WHERE table_schema=current_schema() AND table_name=$1 ORDER BY ordinal_position",
    [TABLE_NAME]
  )

  if (!columnsResult?.rowCount) return { ok: false, codes: ["TABLE_MISSING"] }

  const columns = new Map(columnsResult.rows.map(row => [row.column_name, row]))

  for (const expected of EXPECTED_COLUMNS) {
    const actual = columns.get(expected.name)
    if (!actual) {
      codes.add("COLUMN_MISSING")
      continue
    }
    if (actual.data_type !== expected.type || actual.udt_name !== expected.udt) codes.add("COLUMN_TYPE_MISMATCH")
    if ((actual.is_nullable === "YES") !== expected.nullable) codes.add("COLUMN_NULLABILITY_MISMATCH")
    if (normalizeDefault(actual.column_default) !== expected.defaultValue) codes.add("COLUMN_DEFAULT_MISMATCH")
    if (Number(actual.ordinal_position) !== expected.position) codes.add("COLUMN_ORDER_MISMATCH")
  }

  if (columns.size !== EXPECTED_COLUMNS.length) codes.add("UNEXPECTED_COLUMN")

  const constraintsResult = await queryable.query(
    `SELECT c.conname, c.contype, pg_get_constraintdef(c.oid, true) AS definition,
            array_to_json(array_agg(a.attname ORDER BY k.ordinality) FILTER (WHERE a.attname IS NOT NULL)) AS columns
     FROM pg_constraint c
     LEFT JOIN LATERAL unnest(c.conkey) WITH ORDINALITY k(attnum, ordinality) ON true
     LEFT JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k.attnum
     WHERE c.conrelid = to_regclass($1)
     GROUP BY c.oid, c.conname, c.contype`,
    [TABLE_NAME]
  )

  const constraints = new Map(constraintsResult.rows.map(row => [row.conname, row]))

  const pk = [...constraints.values()].filter(row => row.contype === "p")
  try {
    if (pk.length !== 1) {
      codes.add("PRIMARY_KEY_MISMATCH")
    } else {
      const pkColumns = ensureStringArray(pk[0].columns, "PRIMARY_KEY_MISMATCH")
      if (JSON.stringify(pkColumns) !== JSON.stringify(["rebind_id"])) codes.add("PRIMARY_KEY_MISMATCH")
    }
  } catch (e) {
    codes.add("PRIMARY_KEY_MISMATCH")
  }

  for (const [name, expectedExpression] of Object.entries(CHECK_SQL)) {
    const row = constraints.get(name)
    if (!row) {
      codes.add("CHECK_CONSTRAINT_MISMATCH")
      continue
    }
    let columnsArr
    try {
      columnsArr = ensureStringArray(row?.columns, "CHECK_CONSTRAINT_MISMATCH")
    } catch (e) {
      codes.add("CHECK_CONSTRAINT_MISMATCH")
      continue
    }
    const columns = [...columnsArr].sort()
    let expressionMatches = false
    try {
      expressionMatches = canonicalSqlExpression(row?.definition) === canonicalSqlExpression(expectedExpression)
    } catch {}
    if (row.contype !== "c" || !expressionMatches || JSON.stringify(columns) !== JSON.stringify([...CHECK_COLUMNS[name]].sort())) {
      codes.add("CHECK_CONSTRAINT_MISMATCH")
    }
  }

  return { ok: codes.size === 0, codes: [...codes].sort() }
}

async function migrateSingleCaseRebindAudit(pool) {
  return transaction(pool, async client => {
    const registry = await client.query("SELECT to_regclass('oraculum_state_migrations') AS table_name")
    if (!registry.rows[0]?.table_name) fail("SCHEMA_INCOMPATIBLE")

    const prior = await client.query("SELECT migration_id FROM oraculum_state_migrations WHERE migration_id=$1", [MIGRATION_ID])

    if (!prior.rowCount) await client.query(CREATE_TABLE_SQL)

    const schema = await validateSingleCaseRebindAuditSchema(client)
    if (!schema.ok) fail("SCHEMA_INCOMPATIBLE")

    if (!prior.rowCount) {
      await client.query(
        "INSERT INTO oraculum_state_migrations(migration_id, details, applied_at) VALUES($1, $2, CURRENT_TIMESTAMP)",
        [MIGRATION_ID, JSON.stringify({ table: TABLE_NAME, schemaVersion: 1, ddlSource: "programmatic" })]
      )
    }

    return { ok: true, migrationId: MIGRATION_ID, applied: !prior.rowCount, schema }
  })
}

module.exports = {
  MIGRATION_ID,
  TABLE_NAME,
  CHECK_SQL,
  CREATE_TABLE_SQL,
  EXPECTED_COLUMNS,
  CHECK_COLUMNS,
  createSingleCaseRebindPostgresRepository,
  validateSingleCaseRebindAuditSchema,
  migrateSingleCaseRebindAudit
}
