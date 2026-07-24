#!/usr/bin/env node
"use strict"

const fs = require("node:fs/promises")
const fsSync = require("node:fs")
const { Pool } = require("pg")
const { readAndValidateRuntimeConfig } = require("./apply-single-case")
const { trustedPublicKeysFromEnv } = require("../src/composition/single-case-authorization-components")
const { createAuthorizationVerifier } = require("../src/domain/single-case-apply-contracts")
const { loadOperationalEnvironment } = require("../src/composition/oraculum-runtime-env")
const { createRebindRequest, computeAuthorizationSetHash, validateReason, validateRequestedBy } = require("../src/domain/single-case-rebind-contracts")
const { TABLE_NAME, migrateSingleCaseRebindAudit, validateProvisionedSingleCaseRebindAuditSchema, createSingleCaseRebindPostgresRepository } = require("../src/infrastructure/single-case-rebind-postgres")
const { createSingleCaseCoordinationRepository } = require("../src/infrastructure/single-case-coordination-postgres")

const CASE_IMPORT_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{2,127}$/
const OWNER_ID_DEFAULT = "single-case-real-composition"
const LEASE_DURATION_MS_DEFAULT = 60000
const REQUIRED_ARGUMENTS = Object.freeze(["--case-import-id", "--requested-by", "--reason"])
const AUTHORIZATION_IDS_FILE_ARGUMENT = "--new-authorization-ids-file"
const FORBIDDEN_ARGUMENTS = Object.freeze(["--source-checkpoint-version", "--old-authorization-ids"])
// Optional: --schema-preprovisioned validates ledger and schema read-only instead of running migrations.
const SCHEMA_PREPROVISIONED_ARGUMENT = "--schema-preprovisioned"

function parseArgs(argv = []) {
  if (!Array.isArray(argv)) throw new Error("CLI_ARGUMENTS_INVALID")
  if (FORBIDDEN_ARGUMENTS.some(flag => argv.includes(flag))) throw new Error("CLI_STATE_ARGUMENT_FORBIDDEN")
  const schemaPreprovisionedOccurrences = argv.filter(value => value === SCHEMA_PREPROVISIONED_ARGUMENT).length
  if (schemaPreprovisionedOccurrences > 1) throw new Error("CLI_ARGUMENTS_EXCESS")
  const schemaPreprovisioned = schemaPreprovisionedOccurrences === 1
  const values = {}
  for (const flag of REQUIRED_ARGUMENTS) {
    const occurrences = argv.filter(value => value === flag).length
    if (!occurrences) throw new Error(`${flag.slice(2).replace(/-/g, "_").toUpperCase()}_MISSING`)
    if (occurrences !== 1) throw new Error("CLI_ARGUMENTS_EXCESS")
    const index = argv.indexOf(flag), value = argv[index + 1]
    if (!value || value.startsWith("--")) throw new Error(`${flag.slice(2).replace(/-/g, "_").toUpperCase()}_MISSING`)
    values[flag] = value
  }

  const reason = values["--reason"]
  const contactReason = reason === "CONTACT_RECONCILED_AFTER_DIVERGENCE"
  const planReason = reason === "PLAN_REGENERATED_AFTER_SAFE_CORRECTION"

  // Reconciliation evidence is required only for CONTACT_RECONCILED_AFTER_DIVERGENCE
  const reconciliationEvidenceFlag = "--reconciliation-evidence-file"
  const reconciliationEvidenceOccurrences = argv.filter(value => value === reconciliationEvidenceFlag).length
  if (contactReason) {
    if (!reconciliationEvidenceOccurrences) throw new Error("RECONCILIATION_EVIDENCE_FILE_MISSING")
    if (reconciliationEvidenceOccurrences !== 1) throw new Error("CLI_ARGUMENTS_EXCESS")
  } else {
    if (reconciliationEvidenceOccurrences > 0) throw new Error("RECONCILIATION_EVIDENCE_FILE_NOT_ALLOWED_FOR_REASON")
  }

  // New hashes are required only for PLAN_REGENERATED_AFTER_SAFE_CORRECTION
  const newAuthorizablePlanHash = argv.includes("--new-authorizable-plan-hash") ? argv[argv.indexOf("--new-authorizable-plan-hash") + 1] : undefined
  const newPlanHash = argv.includes("--new-plan-hash") ? argv[argv.indexOf("--new-plan-hash") + 1] : undefined
  const newManifestHash = argv.includes("--new-manifest-hash") ? argv[argv.indexOf("--new-manifest-hash") + 1] : undefined

  if (planReason) {
    if (!newAuthorizablePlanHash || typeof newAuthorizablePlanHash !== "string") throw new Error("NEW_AUTHORIZABLE_PLAN_HASH_MISSING")
    if (!newPlanHash || typeof newPlanHash !== "string") throw new Error("NEW_PLAN_HASH_MISSING")
    if (!newManifestHash || typeof newManifestHash !== "string") throw new Error("NEW_MANIFEST_HASH_MISSING")
  } else {
    if (newAuthorizablePlanHash != null || newPlanHash != null || newManifestHash != null) throw new Error("NEW_HASHES_NOT_ALLOWED_FOR_REASON")
  }

  const reconciliationEvidenceFile = contactReason
    ? argv[argv.indexOf(reconciliationEvidenceFlag) + 1]
    : undefined

  const inlineOccurrences = argv.filter(value => value === "--new-authorization-ids").length
  const fileOccurrences = argv.filter(value => value === AUTHORIZATION_IDS_FILE_ARGUMENT).length
  if (inlineOccurrences + fileOccurrences !== 1) throw new Error("NEW_AUTHORIZATION_IDS_MISSING")
  const authorizationIdsArgument = inlineOccurrences ? "--new-authorization-ids" : AUTHORIZATION_IDS_FILE_ARGUMENT
  const authorizationIdsIndex = argv.indexOf(authorizationIdsArgument)
  const authorizationIdsValue = argv[authorizationIdsIndex + 1]
  if (!authorizationIdsValue || authorizationIdsValue.startsWith("--")) throw new Error("NEW_AUTHORIZATION_IDS_MISSING")

  const extraFlags = (newAuthorizablePlanHash ? 2 : 0) + (newPlanHash ? 2 : 0) + (newManifestHash ? 2 : 0) + (reconciliationEvidenceFile ? 2 : 0)
  if (argv.length !== REQUIRED_ARGUMENTS.length * 2 + 2 + (schemaPreprovisioned ? 1 : 0) + extraFlags) throw new Error("CLI_ARGUMENTS_EXCESS")
  if (!CASE_IMPORT_ID.test(values["--case-import-id"])) throw new Error("CASE_IMPORT_ID_INVALID")
  validateReason(reason)
  validateRequestedBy(values["--requested-by"])
  let newAuthorizationIds
  let authorizationIdsJson = authorizationIdsValue
  if (fileOccurrences) {
    try { authorizationIdsJson = fsSync.readFileSync(authorizationIdsValue, "utf8") } catch { throw new Error("NEW_AUTHORIZATION_IDS_FILE_UNAVAILABLE") }
  }
  try { newAuthorizationIds = JSON.parse(authorizationIdsJson) } catch { throw new Error("NEW_AUTHORIZATION_IDS_INVALID_JSON") }
  try { computeAuthorizationSetHash(newAuthorizationIds) } catch (error) { throw new Error(`REBIND_NEW_${error.message}`) }
  return Object.freeze({
    caseImportId: values["--case-import-id"], requestedBy: values["--requested-by"], reason,
    reconciliationEvidenceFile, newAuthorizationIds, schemaPreprovisioned,
    newAuthorizablePlanHash, newPlanHash, newManifestHash
  })
}

async function loadReconciliationEvidence(file) {
  let bytes
  try { bytes = await fs.readFile(file) } catch { throw new Error("RECONCILIATION_EVIDENCE_UNAVAILABLE") }
  try { return JSON.parse(bytes) } catch { throw new Error("RECONCILIATION_EVIDENCE_INVALID_JSON") }
}

async function loadCurrentCheckpoint(pool, caseImportId) {
  let result
  try { result = await pool.query("SELECT checkpoint_payload FROM single_case_apply_checkpoints WHERE case_import_id=$1", [caseImportId]) } catch { throw new Error("POSTGRES_UNAVAILABLE") }
  if (!result || result.rowCount !== 1 || !result.rows[0] || !result.rows[0].checkpoint_payload) throw new Error("CHECKPOINT_NOT_FOUND")
  const checkpoint = result.rows[0].checkpoint_payload
  if (!Number.isInteger(checkpoint.version) || !Array.isArray(checkpoint.authorizationIds)) throw new Error("CHECKPOINT_INVALID")
  return checkpoint
}

async function loadCommittedAt(pool, rebindId) {
  let result
  try { result = await pool.query(`SELECT committed_at FROM ${TABLE_NAME} WHERE rebind_id=$1`, [rebindId]) } catch { throw new Error("POSTGRES_UNAVAILABLE") }
  if (!result || result.rowCount !== 1 || !result.rows[0].committed_at) throw new Error("REBIND_COMMIT_NOT_FOUND")
  return new Date(result.rows[0].committed_at).toISOString()
}

function sanitizeResult(result, committedAt) {
  if (!result || typeof result !== "object" || typeof result.rebindId !== "string" || typeof result.status !== "string") throw new Error("REBIND_RESULT_INVALID")
  return Object.freeze({ rebindId: result.rebindId, status: result.status, committedAt, sourceCheckpointVersion: result.sourceCheckpointVersion, reboundCheckpointVersion: result.reboundCheckpointVersion })
}

function leaseDuration(value) {
  if (value === undefined || value === "") return LEASE_DURATION_MS_DEFAULT
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < 1000 || parsed > 3600000) throw new Error("LEASE_DURATION_INVALID")
  return parsed
}

async function main({ argv = process.argv.slice(2), env = loadOperationalEnvironment(), configReader = readAndValidateRuntimeConfig, poolFactory = options => new Pool(options), repositoryFactory = createSingleCaseRebindPostgresRepository, coordinationFactory = createSingleCaseCoordinationRepository, migrateSchema = migrateSingleCaseRebindAudit, validateProvisionedSchema = validateProvisionedSingleCaseRebindAuditSchema, evidenceLoader = loadReconciliationEvidence, clock = () => new Date().toISOString() } = {}) {
  const args = parseArgs(argv)
  const config = await configReader(env)
  const pool = poolFactory({ connectionString: config.connectionString, max: 2, connectionTimeoutMillis: 10000, ssl: { rejectUnauthorized: false } })
  if (!pool || typeof pool.query !== "function" || typeof pool.end !== "function") throw new Error("POSTGRES_UNAVAILABLE")
  try {
    if (args.schemaPreprovisioned) await validateProvisionedSchema(pool)
    else await migrateSchema(pool)
    const checkpoint = await loadCurrentCheckpoint(pool, args.caseImportId)
    const reconciliationEvidence = args.reconciliationEvidenceFile ? await evidenceLoader(args.reconciliationEvidenceFile) : null
    const request = createRebindRequest({ caseImportId: args.caseImportId, sourceCheckpointVersion: checkpoint.version, oldAuthorizationIds: checkpoint.authorizationIds, newAuthorizationIds: args.newAuthorizationIds, reconciliationEvidence, reason: args.reason, requestedBy: args.requestedBy, newAuthorizablePlanHash: args.newAuthorizablePlanHash, newPlanHash: args.newPlanHash, newManifestHash: args.newManifestHash })
    const ownerId = config.env.SINGLE_CASE_OWNER_ID || OWNER_ID_DEFAULT
    const operationalRepository = repositoryFactory === createSingleCaseRebindPostgresRepository
    const authorizationVerifier = operationalRepository ? createAuthorizationVerifier({ trustedIssuers: trustedPublicKeysFromEnv(config.env) }) : null
    if (operationalRepository) {
      const preflightRepository = repositoryFactory({ pool, ownerId, authorizationVerifier, now: clock })
      await preflightRepository.preflightNewAuthorizationPair(request)
    }
    const coordination = coordinationFactory({ pool, ownerId, now: clock, leaseDurationMs: leaseDuration(config.env.SINGLE_CASE_LEASE_DURATION_MS) })
    if (!coordination || typeof coordination.acquireLease !== "function" || typeof coordination.releaseLease !== "function") throw new Error("LEASE_COORDINATION_UNAVAILABLE")
    let lease, result, primaryError, releaseFailed = false
    try {
      lease = await coordination.acquireLease({ caseImportId: args.caseImportId, owner: ownerId })
      const repository = repositoryFactory({ pool, ownerId, expectedLease: lease, ...(authorizationVerifier ? { authorizationVerifier, now: clock } : {}) })
      if (!repository || typeof repository.executeRebind !== "function") throw new Error("POSTGRES_UNAVAILABLE")
      result = await repository.executeRebind(request)
    } catch (error) { primaryError = error }
    finally {
      if (lease) try { await coordination.releaseLease({ caseImportId: args.caseImportId, leaseId: lease.leaseId, fencingToken: lease.fencingToken }) }
      catch { releaseFailed = true }
    }
    if (primaryError) throw primaryError
    const sanitized = sanitizeResult(result, await loadCommittedAt(pool, result.rebindId))
    return releaseFailed ? Object.freeze({ ...sanitized, operationalWarnings: Object.freeze(["LEASE_RELEASE_FAILED"]) }) : sanitized
  } finally { await pool.end().catch(() => {}) }
}

function sanitizeError() { return "REBIND_FAILED_CLOSED" }
function sanitizeDiagnostics(error) {
  const allowed = new Map([
    ["NEW_AUTHORIZATION_IDS_INVALID_JSON", "arguments"],
    ["CLI_ARGUMENTS_INVALID", "arguments"],
    ["CLI_ARGUMENTS_EXCESS", "arguments"],
    ["CLI_STATE_ARGUMENT_FORBIDDEN", "arguments"],
    ["CASE_IMPORT_ID_INVALID", "arguments"],
    ["REBIND_REASON_NOT_STRING", "arguments"],
    ["REBIND_REASON_NOT_ALLOWED", "arguments"],
    ["REBIND_REQUESTED_BY_NOT_STRING", "arguments"],
    ["REBIND_REQUESTED_BY_LENGTH_INVALID", "arguments"],
    ["REBIND_REQUESTED_BY_FORMAT_INVALID", "arguments"],
    ["RECONCILIATION_EVIDENCE_UNAVAILABLE", "evidence"],
    ["RECONCILIATION_EVIDENCE_INVALID_JSON", "evidence"],
    ["CHECKPOINT_NOT_FOUND", "checkpoint"],
    ["CHECKPOINT_INVALID", "checkpoint"],
    ["POSTGRES_UNAVAILABLE", "postgres"],
    ["LEASE_COORDINATION_UNAVAILABLE", "lease-acquisition"],
    ["LEASE_ALREADY_HELD", "lease-acquisition"],
    ["LEASE_OWNER_MISMATCH", "lease-acquisition"],
    ["LEASE_NOT_FOUND", "lease-release"],
    ["LEASE_EXPIRED", "lease-operation"],
    ["FENCING_REJECTED", "lease-operation"],
    ["REBIND_LEASE_EXPIRED", "repository/lease-validation"],
    ["REBIND_LEASE_NOT_FOUND", "repository/lease-validation"],
    ["REBIND_LEASE_OWNER_MISMATCH", "repository/lease-validation"],
    ["REBIND_LEASE_FENCING_MISMATCH", "repository/lease-validation"],
  ])
  for (const code of [
    "CHECKPOINT_AUTHORIZATION_IDS_MISMATCH", "CHECKPOINT_NOT_ELIGIBLE", "CHECKPOINT_VERSION_MISMATCH", "CHECKPOINT_SCHEMA_INVALID", "CHECKPOINT_AUTHORIZATION_DIVERGENCE",
    "RECONCILIATION_EVIDENCE_HASH_MISMATCH", "REBIND_REQUEST_INVALID", "REBIND_OLD_PAIR_NOT_CONSUMED", "REBIND_OLD_PAIR_CONSUMED_PARTIAL",
    "REBIND_OLD_CONSUMED_BY_DIVERGENT", "REBIND_OLD_CONSUMED_BY_INVALID_FORMAT", "REBIND_OLD_CONSUMED_BY_LEASE_MISMATCH", "REBIND_OLD_LEGACY_CONSUMPTION_PROOF_INVALID", "REBIND_OLD_PAIR_TYPES_INVALID",
    "REBIND_OLD_CHECKPOINT_IDS_MISMATCH", "REBIND_OLD_BINDINGS_MISMATCH", "REBIND_OLD_BINDINGS_INTERNAL_MISMATCH", "REBIND_NEW_PAIR_NOT_ACTIVE",
    "REBIND_NEW_PAIR_CONSUMED", "REBIND_NEW_PAIR_REVOKED", "REBIND_NEW_PAIR_EXPIRED", "REBIND_NEW_PAIR_TYPES_INVALID", "REBIND_NEW_BINDINGS_MISMATCH",
    "REBIND_NEW_BINDINGS_INTERNAL_MISMATCH", "REBIND_BINDINGS_CROSS_MISMATCH", "REBIND_CHECKPOINT_NOT_FOUND", "REBIND_CONSUME_NEW_PAIR_FAILED",
    "REBIND_CONSUME_TIMESTAMP_DIVERGENT", "REBIND_CONSUME_BY_DIVERGENT", "REBIND_CONSUME_BY_INVALID", "REBIND_CHECKPOINT_UPDATE_FAILED",
    "REBIND_AUDIT_INSERT_FAILED", "REBIND_LEASE_EXPIRED_DURING_TRANSACTION", "REBIND_AUDIT_DIVERGENT", "REBIND_CHECKPOINT_DIVERGENT",
    "POSTGRES_TRANSACTION_FAILED", "SCHEMA_INCOMPATIBLE"
  ]) if (!allowed.has(code)) allowed.set(code, code.startsWith("CHECKPOINT_") ? "checkpoint" : "repository")
  const raw = String(error?.message || "").split(":")[0]
  return allowed.has(raw) ? { causeCode: raw, phase: allowed.get(raw) } : { causeCode: "REBIND_CAUSE_REDACTED", phase: "unknown" }
}
async function runCli() {
  try { console.log(JSON.stringify({ ok: true, result: await main() })) }
  catch (error) { console.error(JSON.stringify({ ok: false, error: sanitizeError(error), ...sanitizeDiagnostics(error) })); process.exitCode = 1 }
}

if (require.main === module) runCli()
module.exports = { OWNER_ID_DEFAULT, LEASE_DURATION_MS_DEFAULT, REQUIRED_ARGUMENTS, FORBIDDEN_ARGUMENTS, SCHEMA_PREPROVISIONED_ARGUMENT, parseArgs, leaseDuration, loadReconciliationEvidence, loadCurrentCheckpoint, loadCommittedAt, sanitizeResult, sanitizeError, sanitizeDiagnostics, main, runCli }
