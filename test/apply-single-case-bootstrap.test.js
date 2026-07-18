"use strict"

const assert = require("node:assert/strict")
const crypto = require("node:crypto")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")
const { spawnSync } = require("node:child_process")
const command = require("../scripts/apply-single-case")

const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "oraculum-apply-bootstrap-"))
const contentRoot = path.join(sandbox, "content")
fs.mkdirSync(contentRoot)
const { publicKey } = crypto.generateKeyPairSync("ed25519")
const trustedKeys = JSON.stringify([{ algorithm: "Ed25519", issuer: "fixture-issuer", publicKeyPem: publicKey.export({ type: "spki", format: "pem" }) }])

const completeEnv = overrides => ({
  CASE_NUMBER_RESERVATION_MODE: "postgres",
  EXTERNAL_STATE_DATABASE_URL: "postgresql://example.invalid/test",
  HUBSPOT_TOKEN: "fictional-token",
  GOOGLE_DRIVE_CLIENT_ID: "fictional-client",
  GOOGLE_DRIVE_CLIENT_SECRET: "fictional-secret",
  GOOGLE_DRIVE_REFRESH_TOKEN: "fictional-refresh",
  GOOGLE_DRIVE_ROOT_FOLDER_ID: "fictional-root",
  SINGLE_CASE_CONTENT_ROOT: contentRoot,
  SINGLE_CASE_APPLY_TRUSTED_PUBLIC_KEYS_JSON: trustedKeys,
  ...overrides,
})

const invoke = (env, options = {}) => command.main({ argv: ["--case-import-id", "fictional-case"], env, executor: async () => ({ ok: true }), ...options })
const blocks = async (env, code) => assert.rejects(() => invoke(env), new RegExp(code))

function testImportHasNoOperationalSideEffect() {
  const script = path.resolve(__dirname, "..", "scripts", "apply-single-case.js")
  const child = `
    const Module = require('node:module');
    const original = Module._load;
    let dotenvLoads = 0, pools = 0;
    Module._load = function(request, parent, isMain) {
      if (request === 'dotenv') dotenvLoads++;
      if (request === 'pg') return { Pool: class { constructor() { pools++; } } };
      return original.apply(this, arguments);
    };
    require(${JSON.stringify(script)});
    process.stdout.write(JSON.stringify({ dotenvLoads, pools }));
  `
  const result = spawnSync(process.execPath, ["-e", child], { encoding: "utf8", env: {} })
  assert.equal(result.status, 0)
  assert.deepEqual(JSON.parse(result.stdout), { dotenvLoads: 0, pools: 0 })
}

async function testMissingPostgresEnvBlocks() { await blocks(completeEnv({ EXTERNAL_STATE_DATABASE_URL: "" }), "EXTERNAL_STATE_DATABASE_URL_MISSING") }
async function testDatabaseUrlNotAccepted() { await blocks(completeEnv({ EXTERNAL_STATE_DATABASE_URL: "", DATABASE_URL: "postgresql://forbidden.invalid/test" }), "EXTERNAL_STATE_DATABASE_URL_MISSING") }
async function testInvalidReservationModeBlocks() { await blocks(completeEnv({ CASE_NUMBER_RESERVATION_MODE: "legacy" }), "POSTGRES_MODE_REQUIRED") }
async function testMissingHubspotEnvBlocks() { await blocks(completeEnv({ HUBSPOT_TOKEN: " " }), "HUBSPOT_TOKEN_MISSING") }
async function testMissingDriveClientIdBlocks() { await blocks(completeEnv({ GOOGLE_DRIVE_CLIENT_ID: "" }), "GOOGLE_DRIVE_CLIENT_ID_MISSING") }
async function testMissingDriveClientSecretBlocks() { await blocks(completeEnv({ GOOGLE_DRIVE_CLIENT_SECRET: "" }), "GOOGLE_DRIVE_CLIENT_SECRET_MISSING") }
async function testMissingDriveRefreshTokenBlocks() { await blocks(completeEnv({ GOOGLE_DRIVE_REFRESH_TOKEN: "" }), "GOOGLE_DRIVE_REFRESH_TOKEN_MISSING") }
async function testMissingDriveRootBlocks() { await blocks(completeEnv({ GOOGLE_DRIVE_ROOT_FOLDER_ID: "" }), "GOOGLE_DRIVE_ROOT_FOLDER_ID_MISSING") }
async function testInvalidDriveRootBlocks() { await blocks(completeEnv({ GOOGLE_DRIVE_ROOT_FOLDER_ID: "invalid root" }), "DRIVE_ROOT_INVALID") }
async function testMissingPublicKeysBlocks() { await blocks(completeEnv({ SINGLE_CASE_APPLY_TRUSTED_PUBLIC_KEYS_JSON: "" }), "SINGLE_CASE_APPLY_TRUSTED_PUBLIC_KEYS_JSON_MISSING") }
async function testInvalidPublicKeysJsonBlocks() { await blocks(completeEnv({ SINGLE_CASE_APPLY_TRUSTED_PUBLIC_KEYS_JSON: "{" }), "AUTHORIZATION_PUBLIC_KEYS_INVALID") }
async function testInvalidPublicKeysStructureBlocks() { await blocks(completeEnv({ SINGLE_CASE_APPLY_TRUSTED_PUBLIC_KEYS_JSON: "[]" }), "AUTHORIZATION_PUBLIC_KEYS_INVALID") }
async function testMissingContentRootBlocks() { await blocks(completeEnv({ SINGLE_CASE_CONTENT_ROOT: " " }), "SINGLE_CASE_CONTENT_ROOT_MISSING") }
async function testNonexistentContentRootBlocks() { await blocks(completeEnv({ SINGLE_CASE_CONTENT_ROOT: path.join(sandbox, "absent") }), "CONTENT_ROOT_UNAVAILABLE") }
async function testContentRootFileBlocks() {
  const file = path.join(sandbox, "ordinary-file")
  fs.writeFileSync(file, "fixture")
  await blocks(completeEnv({ SINGLE_CASE_CONTENT_ROOT: file }), "CONTENT_ROOT_NOT_DIRECTORY")
}

async function testNoResourceCreatedBeforeFullValidation() {
  let factoryCalls = 0
  await assert.rejects(() => invoke(completeEnv({ SINGLE_CASE_APPLY_TRUSTED_PUBLIC_KEYS_JSON: "[]" }), { executor: undefined, runtimeFactory: async () => { factoryCalls++; } }), /AUTHORIZATION_PUBLIC_KEYS_INVALID/)
  assert.equal(factoryCalls, 0)
}

async function testRealCompositionCreatedAfterValidation() {
  const calls = []
  const result = await invoke(completeEnv(), { executor: undefined, runtimeFactory: async ({ config }) => {
    calls.push(config.contentRoot === path.resolve(contentRoot) ? "validated" : "invalid")
    return { execute: async () => { calls.push("execute"); return { ok: true } }, close: async () => { calls.push("close") } }
  } })
  assert.deepEqual(calls, ["validated", "execute", "close"])
  assert.deepEqual(result, { ok: true })
}

async function testNoExternalActionsOnConfigurationFailure() {
  let actions = 0
  await assert.rejects(() => invoke(completeEnv({ HUBSPOT_TOKEN: "" }), { executor: async () => { actions++ } }), /HUBSPOT_TOKEN_MISSING/)
  assert.equal(actions, 0)
}

function testDotenvBeforeConfiguration() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "oraculum-apply-cli-"))
  try {
    const cliContentRoot = path.join(root, "content")
    fs.mkdirSync(cliContentRoot)
    const entries = completeEnv({ SINGLE_CASE_CONTENT_ROOT: cliContentRoot })
    fs.writeFileSync(path.join(root, ".env"), Object.entries(entries).map(([name, value]) => `${name}='${value}'`).join("\n") + "\n", { encoding: "utf8", mode: 0o600 })
    const script = path.resolve(__dirname, "..", "scripts", "apply-single-case.js")
    const result = spawnSync(process.execPath, [script, "--case-import-id", "fictional-case"], { cwd: root, encoding: "utf8", env: {} })
    assert.equal(result.status, 1)
    assert.match(result.stderr, /EXECUTOR_FAILED_CLOSED/)
    assert.doesNotMatch(result.stderr, /_MISSING|POSTGRES_MODE_REQUIRED|CONTENT_ROOT_/)
  } finally { fs.rmSync(root, { recursive: true, force: true }) }
}

const tests = [
  testImportHasNoOperationalSideEffect,
  testMissingPostgresEnvBlocks,
  testDatabaseUrlNotAccepted,
  testInvalidReservationModeBlocks,
  testMissingHubspotEnvBlocks,
  testMissingDriveClientIdBlocks,
  testMissingDriveClientSecretBlocks,
  testMissingDriveRefreshTokenBlocks,
  testMissingDriveRootBlocks,
  testInvalidDriveRootBlocks,
  testMissingPublicKeysBlocks,
  testInvalidPublicKeysJsonBlocks,
  testInvalidPublicKeysStructureBlocks,
  testMissingContentRootBlocks,
  testNonexistentContentRootBlocks,
  testContentRootFileBlocks,
  testNoResourceCreatedBeforeFullValidation,
  testRealCompositionCreatedAfterValidation,
  testNoExternalActionsOnConfigurationFailure,
  testDotenvBeforeConfiguration,
]

Promise.resolve()
  .then(async () => { for (const test of tests) await test() })
  .then(() => console.log(`apply-single-case-bootstrap.test.js: ${tests.length} tests passed`))
  .catch(error => { console.error(error); process.exitCode = 1 })
  .finally(() => fs.rmSync(sandbox, { recursive: true, force: true }))
