"use strict"

const crypto = require("node:crypto")
const fs = require("node:fs/promises")
const path = require("node:path")
const { Pool } = require("pg")
const { readAndValidateRuntimeConfig, validateP1Target } = require("../../scripts/apply-single-case")
const { resolveP1Target } = require("../domain/single-case-target")
const { createSingleCaseReservationRepository } = require("../adapters/single-case-reservation-repository")
const { createSingleCaseReservationAdapter } = require("../adapters/single-case-reservation-adapter")
const { createSingleCaseAuthorizationRepository } = require("../infrastructure/single-case-authorization-postgres")
const { trustedPublicKeysFromEnv } = require("./single-case-authorization-components")
const { AUTHORIZATION_SCHEMA_VERSION, AUTH_SCOPES, authorizablePlanHash, reservationEvidenceHash, createAuthorizationVerifier, validateAuthorizations } = require("../domain/single-case-apply-contracts")

const sha256 = bytes => crypto.createHash("sha256").update(bytes).digest("hex")
const safeCode = error => /^(?:[A-Z][A-Z0-9_]*)(?::[A-Z][A-Z0-9_]*)?$/.test(error?.message || "") ? error.message : "PREFLIGHT_FAILED_CLOSED"

async function runSingleCaseRealPreflight({ env = process.env, now = () => new Date().toISOString(), poolFactory = options => new Pool(options), io = fs } = {}) {
  let pool, client, transactionStarted = false, rollbackExecuted = false
  const result = { environmentValid: false, targetValid: false, planValid: false, reservationValid: false, authorizationState: "PAIR_ABSENT", authorizationValid: false, readyForExecution: false, readOnlyTransactionStarted: false, rollbackExecuted: false, externalActionsExecuted: 0 }
  try {
    const config = await readAndValidateRuntimeConfig(env)
    result.environmentValid = true
    validateP1Target(config.p1CaseImportId, config)
    const plansRoot = path.resolve(config.env.SINGLE_CASE_PLANS_ROOT || path.join(process.cwd(), "data", "case-import", "plans"))
    const manifestsRoot = path.resolve(config.env.SINGLE_CASE_MANIFESTS_ROOT || path.join(process.cwd(), "data", "case-import", "content-manifests"))
    const target = await resolveP1Target({ plansRoot, caseImportId: config.p1CaseImportId, io })
    result.targetValid = true
    result.planValid = true
    let manifestBytes, manifest
    try { manifestBytes = await io.readFile(path.join(manifestsRoot, `${config.p1CaseImportId}.json`)); manifest = JSON.parse(manifestBytes) } catch { throw new Error("P1_MANIFEST_INVALID") }
    if (!Array.isArray(manifest) || manifest.length === 0) throw new Error("P1_MANIFEST_INVALID")

    pool = poolFactory({ connectionString: config.connectionString, max: 1, connectionTimeoutMillis: 10000, ssl: { rejectUnauthorized: false } })
    if (!pool || typeof pool.connect !== "function" || typeof pool.end !== "function") throw new Error("PREFLIGHT_POOL_INVALID")
    client = await pool.connect()
    await client.query("BEGIN TRANSACTION READ ONLY")
    transactionStarted = true
    result.readOnlyTransactionStarted = true
    const queryable = { query: (...args) => client.query(...args) }
    const reservation = createSingleCaseReservationAdapter({ repository: createSingleCaseReservationRepository({ pool: queryable }), expectedCaseNumber: target.binding.caseNumber })
    const evidence = await reservation.verify(config.p1CaseImportId, target.binding.caseNumber)
    result.reservationValid = evidence.verified === true
    const expected = { caseImportId: config.p1CaseImportId, caseFingerprint: target.binding.caseFingerprint, caseNumber: target.binding.caseNumber, authorizablePlanHash: authorizablePlanHash(target.plan), planHash: sha256(target.planBytes), manifestHash: sha256(manifestBytes), reservationEvidenceHash: reservationEvidenceHash(evidence), schemaVersion: AUTHORIZATION_SCHEMA_VERSION, requiredScopes: AUTH_SCOPES }
    const authorizations = createSingleCaseAuthorizationRepository({ pool: queryable })
    const instant = now()
    const audit = await authorizations.auditStateForCase(expected, instant)
    result.authorizationState = audit.state
    if (audit.state !== "PAIR_ACTIVE") throw new Error(audit.state)
    const verifier = createAuthorizationVerifier({ trustedIssuers: trustedPublicKeysFromEnv(config.env) })
    validateAuthorizations(audit.records, expected, verifier, instant)
    result.authorizationValid = true
    result.readyForExecution = true
  } catch (error) {
    result.failureCode = safeCode(error)
  } finally {
    if (transactionStarted) { try { await client.query("ROLLBACK"); rollbackExecuted = true } catch {} }
    result.rollbackExecuted = rollbackExecuted
    if (client && typeof client.release === "function") client.release()
    if (pool && typeof pool.end === "function") await pool.end().catch(() => {})
  }
  return Object.freeze({ ...result })
}

module.exports = { runSingleCaseRealPreflight }
