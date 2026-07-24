#!/usr/bin/env node
"use strict"

/**
 * MIGRAÇÃO CONTROLADA: Piloto 1 — par antigo expirado para HISTORICAL
 *
 * Esta migração trata especificamente o caso em que a emissão de um novo par
 * de autorizações com binding diferente deixou o par antigo expirado em
 * estado ACTIVE, bloqueando o fluxo de rebind.
 *
 * Comportamento:
 * - dry-run (padrão): apenas valida e reporta o que seria alterado
 * - apply com --apply: atualiza somente o par antigo para HISTORICAL
 * - idempotente: segunda execução não altera registros se já estiverem ok
 * - rollback automático diante de qualquer inconsistência
 *
 * Segurança:
 * - Não altera checkpoint, reserva ou lease
 * - Não modifica o novo par válido
 * - Não imprime segredos, chaves, hashes completos ou dados pessoais
 */

const { Pool } = require("pg")
const { loadOperationalEnvironment } = require("../src/composition/oraculum-runtime-env")
const crypto = require("crypto")

const CASE_IMPORT_ID = "inss-e3dfb0f332b117d60bf2"
const TABLE_AUTHORIZATIONS = "single_case_apply_authorizations"
const TABLE_CHECKPOINTS = "single_case_apply_checkpoints"
const TABLE_LEASES = "single_case_apply_leases"
const TABLE_RESERVATIONS = "case_number_reservations"

const fail = code => { throw new Error(code) }

function parseArgs(argv) {
  const result = { apply: false }
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--apply") result.apply = true
    else if (argv[i] === "--case-import-id") result.caseImportId = argv[++i]
    else fail("INVALID_ARGUMENT")
  }
  if (!result.caseImportId) result.caseImportId = CASE_IMPORT_ID
  if (result.caseImportId !== CASE_IMPORT_ID) fail("CASE_IMPORT_ID_MISMATCH")
  return result
}

async function createPool(env) {
  const connectionString = env.EXTERNAL_STATE_DATABASE_URL || env.DATABASE_URL
  if (!connectionString) fail("POSTGRES_CONNECTION_REQUIRED")
  return new Pool({
    connectionString,
    max: 1,
    connectionTimeoutMillis: 10000,
    ssl: { rejectUnauthorized: false }
  })
}

async function auditState(client, caseImportId) {
  const now = new Date()

  // 1. Total authorizations
  const totalResult = await client.query(
    `SELECT COUNT(*)::integer AS cnt FROM ${TABLE_AUTHORIZATIONS} WHERE case_import_id = $1`,
    [caseImportId]
  )

  // 2. All ACTIVE authorizations
  const activeResult = await client.query(
    `SELECT authorization_id, authorization_type, operational_status, expires_at, consumed_at, revoked,
            authorizable_plan_hash, plan_hash, manifest_hash, issued_at, signature, signature_algorithm, issuer
     FROM ${TABLE_AUTHORIZATIONS}
     WHERE case_import_id = $1 AND operational_status = 'ACTIVE'
     ORDER BY issued_at ASC`,
    [caseImportId]
  )

  // 3. Checkpoint
  const checkpointResult = await client.query(
    `SELECT checkpoint_version, global_status, authorization_ids, updated_at FROM ${TABLE_CHECKPOINTS} WHERE case_import_id = $1`,
    [caseImportId]
  )

  // 4. Active lease
  const leaseResult = await client.query(
    `SELECT lease_id FROM ${TABLE_LEASES} WHERE case_import_id = $1 AND expires_at > NOW() AND released_at IS NULL`,
    [caseImportId]
  )

  // 5. Reservation
  const reservationResult = await client.query(
    `SELECT status FROM ${TABLE_RESERVATIONS} WHERE reservation_key = $1`,
    [`case-import:${caseImportId}`]
  )

  const auths = activeResult.rows
  const total = auths.length
  const half = Math.floor(total / 2)
  const oldAuths = auths.slice(0, half)
  const newAuths = auths.slice(half)

  const oldExplicit = oldAuths.filter(r => r.authorization_type === "EXPLICIT_APPLY_AUTHORIZATION")
  const oldExternal = oldAuths.filter(r => r.authorization_type === "EXTERNAL_WRITES_AUTHORIZATION")
  const newExplicit = newAuths.filter(r => r.authorization_type === "EXPLICIT_APPLY_AUTHORIZATION")
  const newExternal = newAuths.filter(r => r.authorization_type === "EXTERNAL_WRITES_AUTHORIZATION")

  const checkpoint = checkpointResult.rows[0] || null
  const checkpointAuthIds = checkpoint ? (checkpoint.authorization_ids || []) : []
  const activeIds = auths.map(r => r.authorization_id)

  return {
    totalAuthorizations: totalResult.rows[0].cnt,
    activeCount: total,
    oldCount: oldAuths.length,
    newCount: newAuths.length,
    oldExplicitCount: oldExplicit.length,
    oldExternalCount: oldExternal.length,
    newExplicitCount: newExplicit.length,
    newExternalCount: newExternal.length,
    oldExpired: oldAuths.length > 0 && oldAuths.every(r => new Date(r.expires_at) <= now),
    oldConsumed: oldAuths.length > 0 && oldAuths.some(r => r.consumed_at !== null),
    oldRevoked: oldAuths.length > 0 && oldAuths.some(r => r.revoked === true),
    newNonExpired: newAuths.length > 0 && newAuths.every(r => new Date(r.expires_at) > now),
    newConsumed: newAuths.length > 0 && newAuths.some(r => r.consumed_at !== null),
    newRevoked: newAuths.length > 0 && newAuths.some(r => r.revoked === true),
    oldHasDifferentHash: oldAuths.length > 0 && newAuths.length > 0 && oldAuths[0].authorizable_plan_hash !== newAuths[0].authorizable_plan_hash,
    oldReferencedByCheckpoint: oldAuths.some(r => checkpointAuthIds.includes(r.authorization_id)),
    newReferencedByCheckpoint: newAuths.some(r => checkpointAuthIds.includes(r.authorization_id)),
    checkpointVersion: checkpoint ? checkpoint.checkpoint_version : null,
    checkpointGlobalStatus: checkpoint ? checkpoint.global_status : null,
    activeLease: leaseResult.rows.length > 0,
    reservationFound: reservationResult.rows.length > 0,
    reservationStatus: reservationResult.rows.length > 0 ? reservationResult.rows[0].status : null,
    cryptoFieldsPresent: auths.every(r => r.issuer && r.signature && r.signature_algorithm)
  }
}

function validatePreMigration(state) {
  const errors = []
  if (state.totalAuthorizations !== 32) errors.push(`TOTAL_AUTHORIZATIONS_DIVERGENT:expected=32,actual=${state.totalAuthorizations}`)
  if (state.activeCount !== 4) errors.push(`ACTIVE_COUNT_DIVERGENT:expected=4,actual=${state.activeCount}`)
  if (state.oldCount !== 2) errors.push(`OLD_COUNT_DIVERGENT:expected=2,actual=${state.oldCount}`)
  if (state.newCount !== 2) errors.push(`NEW_COUNT_DIVERGENT:expected=2,actual=${state.newCount}`)
  if (state.oldExplicitCount !== 1) errors.push(`OLD_EXPLICIT_COUNT_DIVERGENT:expected=1,actual=${state.oldExplicitCount}`)
  if (state.oldExternalCount !== 1) errors.push(`OLD_EXTERNAL_COUNT_DIVERGENT:expected=1,actual=${state.oldExternalCount}`)
  if (state.newExplicitCount !== 1) errors.push(`NEW_EXPLICIT_COUNT_DIVERGENT:expected=1,actual=${state.newExplicitCount}`)
  if (state.newExternalCount !== 1) errors.push(`NEW_EXTERNAL_COUNT_DIVERGENT:expected=1,actual=${state.newExternalCount}`)
  if (!state.oldExpired) errors.push("OLD_PAIR_NOT_EXPIRED")
  if (state.oldConsumed) errors.push("OLD_PAIR_CONSUMED")
  if (state.oldRevoked) errors.push("OLD_PAIR_REVOKED")
  if (!state.oldHasDifferentHash) errors.push("OLD_PAIR_HASH_SAME_AS_NEW")
  if (!state.newNonExpired && !state.oldExpired) errors.push("NEW_PAIR_EXPIRED")
  if (state.newConsumed) errors.push("NEW_PAIR_CONSUMED")
  if (state.newRevoked) errors.push("NEW_PAIR_REVOKED")
  if (state.oldReferencedByCheckpoint) errors.push("OLD_PAIR_REFERENCED_BY_CHECKPOINT")
  if (state.checkpointVersion !== null && Number(state.checkpointVersion) !== 9) errors.push(`CHECKPOINT_VERSION_DIVERGENT:expected=9,actual=${state.checkpointVersion}`)
  if (state.checkpointGlobalStatus !== "failed") errors.push(`CHECKPOINT_STATUS_DIVERGENT:expected=failed,actual=${state.checkpointGlobalStatus}`)
  if (state.activeLease) errors.push("ACTIVE_LEASE_PRESENT")
  if (!state.reservationFound) errors.push("RESERVATION_NOT_FOUND")
  if (state.reservationStatus !== "reserved") errors.push(`RESERVATION_STATUS_DIVERGENT:expected=reserved,actual=${state.reservationStatus}`)
  if (!state.cryptoFieldsPresent) errors.push("CRYPTO_FIELDS_MISSING")
  return errors
}

function validatePostMigration(state) {
  const errors = []
  if (state.totalAuthorizations !== 32) errors.push(`TOTAL_AUTHORIZATIONS_DIVERGENT:expected=32,actual=${state.totalAuthorizations}`)
  if (state.activeCount !== 2) errors.push(`ACTIVE_COUNT_DIVERGENT:expected=2,actual=${state.activeCount}`)
  if (state.newExplicitCount !== 1) errors.push(`NEW_EXPLICIT_COUNT_DIVERGENT:expected=1,actual=${state.newExplicitCount}`)
  if (state.newExternalCount !== 1) errors.push(`NEW_EXTERNAL_COUNT_DIVERGENT:expected=1,actual=${state.newExternalCount}`)
  if (state.newConsumed) errors.push("NEW_PAIR_CONSUMED")
  if (state.newRevoked) errors.push("NEW_PAIR_REVOKED")
  if (state.checkpointVersion !== null && Number(state.checkpointVersion) !== 9) errors.push(`CHECKPOINT_VERSION_DIVERGENT:expected=9,actual=${state.checkpointVersion}`)
  if (state.checkpointGlobalStatus !== "failed") errors.push(`CHECKPOINT_STATUS_DIVERGENT:expected=failed,actual=${state.checkpointGlobalStatus}`)
  if (state.activeLease) errors.push("ACTIVE_LEASE_PRESENT")
  if (!state.reservationFound) errors.push("RESERVATION_NOT_FOUND")
  if (state.reservationStatus !== "reserved") errors.push(`RESERVATION_STATUS_DIVERGENT:expected=reserved,actual=${state.reservationStatus}`)
  if (!state.cryptoFieldsPresent) errors.push("CRYPTO_FIELDS_MISSING")
  return errors
}

async function executeMigration(client, caseImportId, dryRun = true) {
  const state = await auditState(client, caseImportId)
  const validationErrors = validatePreMigration(state)

  const report = {
    dryRun,
    caseImportId,
    validationErrors,
    state,
    wouldUpdate: !dryRun && validationErrors.length === 0,
    updatedRows: 0
  }

  if (dryRun) {
    report.message = validationErrors.length === 0
      ? "DRY_RUN_OK:all_validations_passed"
      : `DRY_RUN_BLOCKED:${validationErrors.length}_errors`
    return report
  }

  if (validationErrors.length > 0) {
    fail(`MIGRATION_BLOCKED:${validationErrors[0]}`)
  }

  // Get old pair IDs (oldest issued_at)
  const oldAuths = (await client.query(
    `SELECT authorization_id, authorization_type FROM ${TABLE_AUTHORIZATIONS}
     WHERE case_import_id = $1 AND operational_status = 'ACTIVE'
     ORDER BY issued_at ASC`,
    [caseImportId]
  )).rows.slice(0, 2)

  if (oldAuths.length !== 2) {
    fail("MIGRATION_BLOCKED:old_pair_count_mismatch")
  }

  const oldIds = oldAuths.map(r => r.authorization_id)

  // Atomic update
  const updateResult = await client.query(
    `UPDATE ${TABLE_AUTHORIZATIONS}
     SET operational_status = 'HISTORICAL',
         superseded_at = clock_timestamp()
     WHERE authorization_id = ANY($1::text[])
       AND operational_status = 'ACTIVE'
     RETURNING authorization_id, operational_status`,
    [oldIds]
  )

  if (updateResult.rowCount !== 2) {
    fail("MIGRATION_FAILED:unexpected_update_count")
  }

  // Post-update verification: direct SQL checks
  const postActiveResult = await client.query(
    `SELECT authorization_type, operational_status, expires_at, consumed_at, revoked, authorizable_plan_hash
     FROM ${TABLE_AUTHORIZATIONS}
     WHERE case_import_id = $1 AND operational_status = 'ACTIVE'`,
    [caseImportId]
  )

  const postTotalResult = await client.query(
    `SELECT COUNT(*)::integer AS cnt FROM ${TABLE_AUTHORIZATIONS} WHERE case_import_id = $1`,
    [caseImportId]
  )

  const postExplicitActive = postActiveResult.rows.filter(r => r.authorization_type === "EXPLICIT_APPLY_AUTHORIZATION")
  const postExternalActive = postActiveResult.rows.filter(r => r.authorization_type === "EXTERNAL_WRITES_AUTHORIZATION")

  if (postActiveResult.rows.length !== 2) {
    fail(`MIGRATION_POST_VERIFICATION_FAILED:ACTIVE_COUNT_DIVERGENT:expected=2,actual=${postActiveResult.rows.length}`)
  }
  if (postExplicitActive.length !== 1) {
    fail(`MIGRATION_POST_VERIFICATION_FAILED:EXPLICIT_COUNT_DIVERGENT:expected=1,actual=${postExplicitActive.length}`)
  }
  if (postExternalActive.length !== 1) {
    fail(`MIGRATION_POST_VERIFICATION_FAILED:EXTERNAL_COUNT_DIVERGENT:expected=1,actual=${postExternalActive.length}`)
  }
  if (postTotalResult.rows[0].cnt !== 32) {
    fail(`MIGRATION_POST_VERIFICATION_FAILED:TOTAL_DIVERGENT:expected=32,actual=${postTotalResult.rows[0].cnt}`)
  }

  report.wouldUpdate = true
  report.updatedRows = updateResult.rowCount
  report.message = "MIGRATION_COMMITTED"
  return report
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const env = loadOperationalEnvironment()
  const pool = await createPool(env)

  let client
  try {
    client = await pool.connect()
    await client.query("BEGIN")

    const report = await executeMigration(client, args.caseImportId, !args.apply)

    if (args.apply && report.wouldUpdate && report.validationErrors.length === 0) {
      await client.query("COMMIT")
      report.message = "MIGRATION_COMMITTED"
    } else {
      await client.query("ROLLBACK")
    }

    console.log(JSON.stringify(report, null, 2))
    process.exitCode = report.validationErrors.length > 0 ? 1 : 0
  } catch (err) {
    if (client) {
      try { await client.query("ROLLBACK") } catch (e) {}
    }
    console.log(JSON.stringify({
      error: err.message,
      caseImportId: args.caseImportId,
      dryRun: !args.apply
    }, null, 2))
    process.exitCode = 1
  } finally {
    if (client) client.release()
    await pool.end()
  }
}

if (require.main === module) {
  main().catch(err => {
    console.error("MIGRATION_FAILED:", err.message)
    process.exitCode = 1
  })
}

module.exports = { auditState, validatePreMigration, validatePostMigration, executeMigration }
