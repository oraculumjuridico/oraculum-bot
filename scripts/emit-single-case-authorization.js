#!/usr/bin/env node
"use strict"

require("dotenv").config({ quiet: true })

const crypto = require("node:crypto")
const fs = require("node:fs/promises")
const path = require("node:path")
const { Pool } = require("pg")

const {
  AUTHORIZATION_SCHEMA_VERSION,
  AUTH_SCOPES,
  sha256,
  authorizablePlanHash,
  reservationEvidenceHash,
  createAuthorizationVerifier,
} = require("../src/domain/single-case-apply-contracts")
const { createSingleCaseAuthorizationSigner } = require("../src/domain/single-case-authorization-signer")
const { trustedPublicKeysFromEnv } = require("../src/composition/single-case-authorization-components")
const { TABLE_NAME, ALGORITHM } = require("../src/infrastructure/single-case-authorization-postgres")
const { validateCaseNumberReservationSchema } = require("../src/infrastructure/case-number-reservations-postgres")
const { emitAuthorizationPair } = require("../src/domain/single-case-authorization-emitter")
const { validateCaseFingerprint } = require("../src/domain/single-case-target")

// ─── constants ───────────────────────────────────────────────────────────────
const CASE_IMPORT_STATE_DIR = path.join(process.cwd(), "data", "case-import")
const PLANS_DIR = path.join(CASE_IMPORT_STATE_DIR, "plans")
const MANIFESTS_DIR = path.join(CASE_IMPORT_STATE_DIR, "content-manifests")
const RESERVATION_TABLE = "case_number_reservations"
const CASE_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{2,127}$/
const HASH_RE = /^[a-f0-9]{64}$/
const fail = code => { throw new Error(code) }

// ─── arg parsing ─────────────────────────────────────────────────────────────
function parseArgs(argv) {
  const result = { ttlMinutes: 30, dryRun: false }
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === "--dry-run") { result.dryRun = true; continue }
    const eq = arg.match(/^--([a-z][a-z0-9-]*)=(.*)$/)
    if (eq) { argv.splice(i, 1, `--${eq[1]}`, eq[2]); i-- ; continue }
    if (arg === "--case-import-id") { result.caseImportId = argv[++i]; continue }
    if (arg === "--ttl-minutes") { result.ttlMinutes = argv[++i]; continue }
    if (arg === "--requested-by") { result.requestedBy = argv[++i]; continue }
    if (arg === "--request-id") { result.requestId = argv[++i]; continue }
    fail("INVALID_ARGUMENT")
  }
  if (!result.caseImportId || !CASE_ID_RE.test(result.caseImportId)) fail("CASE_IMPORT_ID_INVALID")
  const ttl = Number(result.ttlMinutes)
  if (!Number.isInteger(ttl) || ttl < 1 || ttl > 30) fail("TTL_INVALID")
  result.ttlMinutes = ttl
  return result
}

// ─── env / key validation ────────────────────────────────────────────────────
function loadKeys(env) {
  // private key
  const privatePem = env.SINGLE_CASE_APPLY_PRIVATE_KEY_PEM
  if (!privatePem) fail("AUTHORIZATION_PRIVATE_KEY_MISSING")
  let privateKey
  try { privateKey = crypto.createPrivateKey(privatePem) } catch { fail("AUTHORIZATION_PRIVATE_KEY_INVALID") }
  if (privateKey.type !== "private" || privateKey.asymmetricKeyType !== "ed25519") fail("AUTHORIZATION_PRIVATE_KEY_INVALID")

  // public key / trusted issuers
  const trustedIssuers = trustedPublicKeysFromEnv(env)  // throws with specific code on failure
  const issuer = env.SINGLE_CASE_APPLY_ISSUER
  if (!issuer || !/^[A-Za-z0-9._:-]{3,80}$/.test(issuer)) fail("AUTHORIZATION_ISSUER_INVALID")
  if (!trustedIssuers[issuer]) fail("AUTHORIZATION_ISSUER_NOT_TRUSTED")

  // keypair match: sign a known payload and verify with public key
  const testMsg = Buffer.from("keypair-check")
  let match = false
  try {
    const sig = crypto.sign(null, testMsg, privateKey)
    match = crypto.verify(null, testMsg, trustedIssuers[issuer], sig)
  } catch { match = false }
  if (!match) fail("AUTHORIZATION_KEYPAIR_MISMATCH")

  return { privateKey, trustedIssuers, issuer }
}

// ─── plan / manifest loading ──────────────────────────────────────────────────
async function loadArtifacts(caseImportId) {
  const planPath = path.join(PLANS_DIR, `${caseImportId}.json`)
  const manifestPath = path.join(MANIFESTS_DIR, `${caseImportId}.json`)

  let planBytes, manifestBytes
  try { planBytes = await fs.readFile(planPath) } catch { fail("PLAN_NOT_FOUND") }
  try { manifestBytes = await fs.readFile(manifestPath) } catch { fail("MANIFEST_NOT_FOUND") }

  let plan
  try { plan = JSON.parse(planBytes) } catch { fail("PLAN_PARSE_ERROR") }

  let manifest
  try { manifest = JSON.parse(manifestBytes) } catch { fail("MANIFEST_PARSE_ERROR") }

  return { plan, planBytes, manifest, manifestBytes }
}

// ─── plan validation ──────────────────────────────────────────────────────────
function validatePlan(plan, caseImportId) {
  if (!plan || typeof plan !== "object") fail("PLAN_INVALID")
  if (plan.caseImportId !== caseImportId) fail("PLAN_CASE_IMPORT_ID_MISMATCH")
  try { validateCaseFingerprint(caseImportId, plan.caseFingerprint) } catch { fail("PLAN_FINGERPRINT_MISSING") }
  if (!plan.dealPlan?.caseNumber || !/^[A-Z]{2,4}\.[0-9]{6}\.[0-9]{3}$/.test(plan.dealPlan.caseNumber)) fail("PLAN_CASE_NUMBER_MISSING")
  if (plan.status !== "PLANNED_NOT_EXECUTED") fail("PLAN_STATUS_INVALID")
  if (plan.externalActionsExecuted === true) fail("PLAN_EXTERNAL_ACTIONS_ALREADY_EXECUTED")
  if (plan.importExecuted === true) fail("PLAN_IMPORT_ALREADY_EXECUTED")
  if (plan.caseNumberReservationSync?.source !== "OFFICIAL_POSTGRES_RESERVATION") fail("PLAN_RESERVATION_NOT_SYNCHRONIZED")
  if (plan.caseNumberReservationSync?.status !== "SYNCHRONIZED") fail("PLAN_RESERVATION_NOT_SYNCHRONIZED")
}

// ─── reservation verification ─────────────────────────────────────────────────
async function verifyReservation(client, caseImportId, plan) {
  const reservationKey = `case-import:${caseImportId}`
  const expectedNumber = plan.dealPlan.caseNumber
  const expectedArea = plan.dealPlan.properties?.area_juridica

  // primary lookup by key
  const res1 = await client.query(
    `SELECT reservation_key, case_number, area, status
     FROM ${RESERVATION_TABLE}
     WHERE reservation_key = $1`,
    [reservationKey]
  )
  if (res1.rowCount === 0) fail("RESERVATION_NOT_FOUND")
  if (res1.rowCount > 1) fail("RESERVATION_AMBIGUOUS")
  const row = res1.rows[0]
  if (row.reservation_key !== reservationKey) fail("RESERVATION_KEY_MISMATCH")
  if (row.case_number !== expectedNumber) fail("RESERVATION_NUMBER_MISMATCH")
  if (row.status !== "reserved") fail("RESERVATION_STATUS_INVALID")
  if (expectedArea && row.area !== expectedArea) fail("RESERVATION_AREA_MISMATCH")

  // uniqueness check for the number
  const res2 = await client.query(
    `SELECT COUNT(*)::integer AS cnt FROM ${RESERVATION_TABLE} WHERE case_number = $1`,
    [expectedNumber]
  )
  if (res2.rows[0].cnt !== 1) fail("RESERVATION_NUMBER_NOT_UNIQUE")

  return { evidenceId: reservationKey, caseImportId, caseNumber: expectedNumber, verified: true }
}

// ─── build unsigned record ────────────────────────────────────────────────────
function buildRecord({ type, scope, caseImportId, caseFingerprint, caseNumber, aph, ph, mh, reh, issuer, issuedAt, expiresAt }) {
  const ts = issuedAt.replace(/[^0-9]/g, "").slice(0, 14)
  const rand = crypto.randomBytes(6).toString("hex")
  const authorizationId = `${issuer}.${ts}.${rand}`
  return {
    authorizationId,
    schemaVersion: AUTHORIZATION_SCHEMA_VERSION,
    type,
    caseImportId,
    caseFingerprint,
    caseNumber,
    authorizablePlanHash: aph,
    planHash: ph,
    manifestHash: mh,
    reservationEvidenceHash: reh,
    scope: [...scope].sort(),
    issuer,
    issuedAt,
    expiresAt,
    revoked: false,
  }
}

// ─── main ─────────────────────────────────────────────────────────────────────
async function main({
  argv = process.argv.slice(2),
  env = process.env,
  PoolClass = Pool,
  output = console.log,
  clock = () => new Date().toISOString(),
  // _testArtifacts: { plan, planBytes, manifest, manifestBytes } — injected by tests only
  _testArtifacts = null,
} = {}) {
  if (String(env.CASE_NUMBER_RESERVATION_MODE || "").toLowerCase() !== "postgres") fail("POSTGRES_MODE_REQUIRED")
  const connectionString = env.EXTERNAL_STATE_DATABASE_URL
  if (!connectionString) fail("POSTGRES_CONNECTION_REQUIRED")

  const args = parseArgs(argv)
  const { caseImportId, ttlMinutes, dryRun, requestedBy, requestId } = args

  // keys
  const { privateKey, trustedIssuers, issuer } = loadKeys(env)

  // artifacts
  const { plan, planBytes, manifest, manifestBytes } = _testArtifacts || await loadArtifacts(caseImportId)
  validatePlan(plan, caseImportId)

  // hashes — all computed from disk, never from operator input
  const ph = sha256(planBytes)
  const mh = sha256(manifestBytes)
  const aph = authorizablePlanHash(plan)

  // timestamps
  const now = clock()
  const issuedAt = now
  const expiresAt = new Date(Date.parse(now) + ttlMinutes * 60 * 1000).toISOString()

  const pool = typeof PoolClass === "function" && PoolClass.prototype && PoolClass.prototype.connect
    ? new PoolClass({ connectionString, max: 1, connectionTimeoutMillis: 10000, ssl: { rejectUnauthorized: false } })
    : PoolClass({ connectionString })

  let client
  let committed = false
  const signedRecords = []

  try {
    client = await pool.connect()

    // schema check (read-only)
    const schema = await validateCaseNumberReservationSchema(client)
    if (!schema.ok) fail(`RESERVATION_SCHEMA_INVALID:${schema.codes.join(",")}`)

    // verify reservation (read-only)
    await client.query("BEGIN")
    await client.query("SET TRANSACTION READ ONLY")
    const reservationEvidence = await verifyReservation(client, caseImportId, plan)
    const reh = reservationEvidenceHash(reservationEvidence)
    await client.query("ROLLBACK")

    // build + sign both records
    const signer = createSingleCaseAuthorizationSigner({ privateKey, clock: () => issuedAt })
    const verifier = createAuthorizationVerifier({ trustedIssuers })

    for (const [type, scope] of Object.entries(AUTH_SCOPES)) {
      const record = buildRecord({
        type, scope, caseImportId,
        caseFingerprint: plan.caseFingerprint,
        caseNumber: plan.dealPlan.caseNumber,
        aph, ph, mh, reh, issuer, issuedAt, expiresAt,
      })
      const signed = signer.sign(record)

      // verify immediately after signing
      const verifyResult = verifier.verify(signed, { now: issuedAt })
      if (!verifyResult.valid) fail(`AUTHORIZATION_SELF_VERIFY_FAILED:${verifyResult.reason}`)

      signedRecords.push(signed)
    }

    if (!dryRun) {
      const binding = {
        caseImportId,
        requestedBy,
        requestId,
        caseFingerprint: plan.caseFingerprint,
        caseNumber: plan.dealPlan.caseNumber,
        authorizablePlanHash: aph,
      }

      const result = await emitAuthorizationPair(client, signedRecords, binding)
      committed = result.committed
    }

    // sanitized output — never expose proof/signature, keys, connection, CPF, phone
    const result = {
      ok: true,
      dryRun,
      caseImportId,
      caseFingerprint: plan.caseFingerprint,
      caseNumber: plan.dealPlan.caseNumber,
      issuer,
      planHash: ph,
      manifestHash: mh,
      authorizablePlanHash: aph,
      reservationEvidenceHash: reh,
      types: signedRecords.map(r => r.type),
      authorizationIds: signedRecords.map(r => r.authorizationId),
      expiresAt,
      committed,
      readOnly: dryRun,
    }
    output(JSON.stringify(result))
    return result

  } finally {
    if (client && typeof client.release === "function") client.release()
    await pool.end().catch(() => {})
  }
}

if (require.main === module) {
  main().catch(err => {
    const safe = new Set([
      "INVALID_ARGUMENT", "CASE_IMPORT_ID_INVALID", "TTL_INVALID",
      "POSTGRES_MODE_REQUIRED", "POSTGRES_CONNECTION_REQUIRED",
      "AUTHORIZATION_PRIVATE_KEY_MISSING", "AUTHORIZATION_PRIVATE_KEY_INVALID",
      "AUTHORIZATION_PUBLIC_KEYS_MISSING", "AUTHORIZATION_PUBLIC_KEYS_INVALID",
      "AUTHORIZATION_ISSUER_INVALID", "AUTHORIZATION_ISSUER_NOT_TRUSTED",
      "AUTHORIZATION_KEYPAIR_MISMATCH",
      "PLAN_NOT_FOUND", "PLAN_PARSE_ERROR", "PLAN_INVALID",
      "PLAN_CASE_IMPORT_ID_MISMATCH", "PLAN_FINGERPRINT_MISSING",
      "PLAN_CASE_NUMBER_MISSING", "PLAN_STATUS_INVALID",
      "PLAN_EXTERNAL_ACTIONS_ALREADY_EXECUTED", "PLAN_IMPORT_ALREADY_EXECUTED",
      "PLAN_RESERVATION_NOT_SYNCHRONIZED",
      "MANIFEST_NOT_FOUND", "MANIFEST_PARSE_ERROR",
      "RESERVATION_SCHEMA_INVALID", "RESERVATION_NOT_FOUND", "RESERVATION_AMBIGUOUS",
      "RESERVATION_KEY_MISMATCH", "RESERVATION_NUMBER_MISMATCH",
      "RESERVATION_STATUS_INVALID", "RESERVATION_AREA_MISMATCH",
      "RESERVATION_NUMBER_NOT_UNIQUE",
      "AUTHORIZATION_ALREADY_ACTIVE",
      "AUTH_INSUFFICIENT_REMAINING_TTL",
      "UNIQUE_CONSTRAINT_VIOLATION",
      "AUTHORIZATION_SELF_VERIFY_FAILED", "AUTHORIZATION_INSERT_FAILED",
    ])
    const code = err.message?.split(":")[0]
    console.error(JSON.stringify({ ok: false, error: safe.has(code) ? err.message : "EMIT_FAILED" }))
    process.exitCode = 1
  })
}

module.exports = { parseArgs, loadKeys, validatePlan, buildRecord, main }
