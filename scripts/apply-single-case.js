#!/usr/bin/env node
"use strict"

const crypto = require("node:crypto")
const fs = require("node:fs/promises")
const path = require("node:path")
const { Pool } = require("pg")
const { google } = require("googleapis")
const { createSingleCaseRealComposition } = require("../src/composition/single-case-real-composition")
const { createGoogleDriveSingleCaseClient } = require("../src/adapters/google-drive-single-case-client")
const { createDriveSingleCaseAdapter } = require("../src/adapters/drive-single-case-adapter")
const { createSingleCasePlanLoader } = require("../src/adapters/single-case-plan-loader")
const { createSingleCaseContentLoader } = require("../src/adapters/single-case-content-loader")
const { createSingleCaseContentResolver } = require("../src/adapters/single-case-content-resolver")
const { createSingleCaseReservationRepository } = require("../src/adapters/single-case-reservation-repository")
const { createSingleCaseReservationAdapter } = require("../src/adapters/single-case-reservation-adapter")
const { trustedPublicKeysFromEnv, createSingleCaseAuthorizationComponents } = require("../src/composition/single-case-authorization-components")
const { createHubSpotHttpClient } = require("../src/adapters/hubspot-http-client")
const { createHubSpotSingleCaseAdapters } = require("../src/adapters/hubspot-single-case-adapter")
const { validateP1PlanContract, resolveP1Target } = require("../src/domain/single-case-target")
const { EXECUTION_SCOPE_NAMES } = require("../src/domain/single-case-apply-contracts")

const REQUIRED_ENV = Object.freeze([
  "EXTERNAL_STATE_DATABASE_URL",
  "HUBSPOT_TOKEN",
  "GOOGLE_DRIVE_CLIENT_ID",
  "GOOGLE_DRIVE_CLIENT_SECRET",
  "GOOGLE_DRIVE_REFRESH_TOKEN",
  "GOOGLE_DRIVE_ROOT_FOLDER_ID",
  "SINGLE_CASE_CONTENT_ROOT",
  "SINGLE_CASE_APPLY_TRUSTED_PUBLIC_KEYS_JSON",
  "SINGLE_CASE_P1_CASE_IMPORT_ID",
])
const DRIVE_ROOT_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{2,127}$/

function withGoogleDriveCredentialFallbacks(env = process.env) {
  return {
    ...env,
    GOOGLE_DRIVE_CLIENT_ID: env.GOOGLE_DRIVE_CLIENT_ID || env.GOOGLE_CLIENT_ID,
    GOOGLE_DRIVE_CLIENT_SECRET: env.GOOGLE_DRIVE_CLIENT_SECRET || env.GOOGLE_CLIENT_SECRET,
    GOOGLE_DRIVE_REFRESH_TOKEN: env.GOOGLE_DRIVE_REFRESH_TOKEN || env.GOOGLE_REFRESH_TOKEN,
  }
}

function validateRuntimeEnvironment(env = process.env) {
  if (String(env.CASE_NUMBER_RESERVATION_MODE || "").trim().toLowerCase() !== "postgres") throw new Error("POSTGRES_MODE_REQUIRED")
  for (const name of REQUIRED_ENV) if (typeof env[name] !== "string" || !env[name].trim()) throw new Error(`${name}_MISSING`)
  return true
}

async function readAndValidateRuntimeConfig(env) {
  env = withGoogleDriveCredentialFallbacks(env)
  validateRuntimeEnvironment(env)
  if (!DRIVE_ROOT_ID.test(env.GOOGLE_DRIVE_ROOT_FOLDER_ID)) throw new Error("DRIVE_ROOT_INVALID")
  trustedPublicKeysFromEnv(env)
  const contentRoot = path.resolve(env.SINGLE_CASE_CONTENT_ROOT)
  let contentRootStat
  try { contentRootStat = await fs.stat(contentRoot) } catch { throw new Error("CONTENT_ROOT_UNAVAILABLE") }
  if (!contentRootStat.isDirectory()) throw new Error("CONTENT_ROOT_NOT_DIRECTORY")
  const validatedEnv = Object.freeze(Object.fromEntries([
    "CASE_NUMBER_RESERVATION_MODE",
    ...REQUIRED_ENV,
    "SINGLE_CASE_PLANS_ROOT",
    "SINGLE_CASE_MANIFESTS_ROOT",
    "SINGLE_CASE_HUBSPOT_TIMEOUT_MS",
    "SINGLE_CASE_LEASE_DURATION_MS",
    "SINGLE_CASE_OWNER_ID",
  ].filter(name => env[name] !== undefined).map(name => [name, env[name]])))
  return Object.freeze({
    env: validatedEnv,
    connectionString: env.EXTERNAL_STATE_DATABASE_URL,
    contentRoot,
    driveRootFolderId: env.GOOGLE_DRIVE_ROOT_FOLDER_ID,
    p1CaseImportId: env.SINGLE_CASE_P1_CASE_IMPORT_ID,
  })
}

const sha256 = bytes => crypto.createHash("sha256").update(bytes).digest("hex")
function validateP1Target(caseImportId, config) {
  if (!config || !DRIVE_ROOT_ID.test(config.p1CaseImportId || "")) throw new Error("P1_TARGET_CONFIGURATION_INVALID")
  if (caseImportId !== config.p1CaseImportId) throw new Error("P1_TARGET_REQUIRED")
  return true
}

function validateP1Plan(plan, caseImportId) {
  try { return validateP1PlanContract(plan, caseImportId) } catch (error) {
    if (error.message === "CASE_FINGERPRINT_DIVERGENT") throw new Error("P1_FINGERPRINT_BINDING_INVALID")
    throw error
  }
}

async function createRuntimeExecutor({ env, config, caseImportId, executionScope, resumeMode } = {}) {
  const runtimeConfig = config || await readAndValidateRuntimeConfig(env)
  env = runtimeConfig.env
  validateP1Target(caseImportId, runtimeConfig)
  const plansRoot = path.resolve(env.SINGLE_CASE_PLANS_ROOT || path.join(process.cwd(), "data", "case-import", "plans"))
  const manifestsRoot = path.resolve(env.SINGLE_CASE_MANIFESTS_ROOT || path.join(process.cwd(), "data", "case-import", "content-manifests"))
  const manifestPath = path.join(manifestsRoot, `${caseImportId}.json`)
  let target, manifestBytes, entries
  try {
    [target, manifestBytes] = await Promise.all([resolveP1Target({ plansRoot, caseImportId }), fs.readFile(manifestPath)])
    entries = JSON.parse(manifestBytes)
  } catch { throw new Error("RUNTIME_ARTIFACTS_UNAVAILABLE") }
  if (!Array.isArray(entries) || entries.length === 0) throw new Error("RUNTIME_MANIFEST_INVALID")
  const planBinding = target.binding

  const pool = new Pool({ connectionString: runtimeConfig.connectionString, max: 2, connectionTimeoutMillis: 10000, ssl: { rejectUnauthorized: false } })
  try {
    const clock = () => new Date().toISOString()
    const authorization = createSingleCaseAuthorizationComponents({ pool, env })
    const hubspotClient = createHubSpotHttpClient({ token: env.HUBSPOT_TOKEN, fetch: globalThis.fetch, clock })
    const hubspot = createHubSpotSingleCaseAdapters({ client: hubspotClient, clock })
    const resolver = createSingleCaseContentResolver({ root: runtimeConfig.contentRoot, entries })
    const contentLoader = createSingleCaseContentLoader({ root: runtimeConfig.contentRoot, resolveReference: resolver.resolveReference })
    const planLoader = createSingleCasePlanLoader({ root: plansRoot, expectedFingerprint: planBinding.caseFingerprint, expectedCaseNumber: planBinding.caseNumber })
    const driveClient = createGoogleDriveSingleCaseClient({
      clientId: env.GOOGLE_DRIVE_CLIENT_ID,
      clientSecret: env.GOOGLE_DRIVE_CLIENT_SECRET,
      refreshToken: env.GOOGLE_DRIVE_REFRESH_TOKEN,
      googleModule: google,
    })
    const drive = createDriveSingleCaseAdapter({ client: driveClient, rootFolderId: runtimeConfig.driveRootFolderId })
    const reservationRepository = createSingleCaseReservationRepository({ pool })
    const reservation = createSingleCaseReservationAdapter({ repository: reservationRepository, expectedCaseNumber: planBinding.caseNumber })
    const composition = createSingleCaseRealComposition({
      env,
      fetchImpl: globalThis.fetch,
      pool,
      clock,
      drive,
      planLoader,
      contentLoader,
      reservation,
      componentFactories: {
        authorization: () => authorization,
        hubspotClient: () => hubspotClient,
        hubspotAdapters: () => hubspot,
      },
    })
    return Object.freeze({
      execute: () => composition.executor({ caseImportId, planHash: sha256(target.planBytes), manifestHash: sha256(manifestBytes), executionScope, ...(resumeMode === undefined ? {} : { resumeMode }) }),
      close: () => pool.end(),
    })
  } catch (error) {
    await pool.end().catch(() => {})
    throw error
  }
}

function parseArgs(argv) {
  if (!argv.includes("--case-import-id")) throw new Error("CASE_IMPORT_ID_MISSING")
  const allowed = new Set(["--case-import-id", "--resume-mode", "--execution-scope"])
  for (let index = 0; index < argv.length; index += 2) if (!allowed.has(argv[index]) || argv[index + 1] === undefined) throw new Error("CLI_ARGUMENTS_EXCESS")
  const value = argv[argv.indexOf("--case-import-id") + 1]
  if (!value || !/^[A-Za-z0-9][A-Za-z0-9._:-]{2,127}$/.test(value)) throw new Error("CASE_IMPORT_ID_INVALID")
  const resumeMode = argv.includes("--resume-mode") ? argv[argv.indexOf("--resume-mode") + 1] : undefined
  if (resumeMode !== undefined && resumeMode !== "REBIND") throw new Error("RESUME_MODE_INVALID")
  const executionScope = argv.includes("--execution-scope") ? argv[argv.indexOf("--execution-scope") + 1] : EXECUTION_SCOPE_NAMES.FULL
  if (!Object.hasOwn(EXECUTION_SCOPE_NAMES, executionScope)) throw new Error("EXECUTION_SCOPE_INVALID")
  return { caseImportId: value, executionScope, ...(resumeMode === undefined ? {} : { resumeMode }) }
}
async function main({ argv = process.argv.slice(2), env = process.env, executor, runtimeFactory = createRuntimeExecutor } = {}) {
  const args = parseArgs(argv)
  const config = await readAndValidateRuntimeConfig(env)
  validateP1Target(args.caseImportId, config)
  const executionArgs = {
    caseImportId: args.caseImportId,
    executionScope: args.executionScope,
    ...(args.resumeMode === undefined ? {} : { resumeMode: args.resumeMode }),
  }
  if (typeof executor === "function") return executor(executionArgs)
  if (typeof runtimeFactory !== "function") throw new Error("REAL_SINGLE_CASE_APPLY_NOT_CONFIGURED")
  const runtime = await runtimeFactory({ env, config, ...executionArgs })
  if (!runtime || typeof runtime.execute !== "function" || typeof runtime.close !== "function") throw new Error("REAL_SINGLE_CASE_APPLY_NOT_CONFIGURED")
  try { return await runtime.execute() } finally { await runtime.close() }
}
async function runCli() {
  require("dotenv").config({ quiet: true })
  return main({ argv: process.argv.slice(2), env: process.env })
}
if (require.main === module) runCli().catch(error => {   const allowed = new Set(["CASE_IMPORT_ID_MISSING", "CASE_IMPORT_ID_INVALID", "CLI_ARGUMENTS_EXCESS", "REAL_SINGLE_CASE_APPLY_NOT_CONFIGURED", "POSTGRES_MODE_REQUIRED", "DRIVE_ROOT_INVALID", "AUTHORIZATION_PUBLIC_KEYS_MISSING", "AUTHORIZATION_PUBLIC_KEYS_INVALID", "AUTHORIZATION_PUBLIC_KEYS_DUPLICATE", "AUTH_INSUFFICIENT_REMAINING_TTL", "CONTENT_ROOT_UNAVAILABLE", "CONTENT_ROOT_NOT_DIRECTORY", ...REQUIRED_ENV.map(name => `${name}_MISSING`)]); console.error(JSON.stringify({ ok: false, error: allowed.has(error.message) ? error.message : "EXECUTOR_FAILED_CLOSED" })); process.exitCode = 1 })
module.exports = { REQUIRED_ENV, withGoogleDriveCredentialFallbacks, validateRuntimeEnvironment, readAndValidateRuntimeConfig, validateP1Target, validateP1Plan, createRuntimeExecutor, parseArgs, main, runCli }
