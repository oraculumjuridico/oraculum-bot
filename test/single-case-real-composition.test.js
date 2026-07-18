"use strict"

const test = require("node:test")
const assert = require("node:assert/strict")
const crypto = require("node:crypto")
const { createSingleCaseRealComposition } = require("../src/composition/single-case-real-composition")
const applyCli = require("../scripts/apply-single-case")

const METHODS = {
  drive: ["findAreaFolders", "createAreaFolder", "findCaseFolders", "createCaseFolder", "verifyFolder", "findFilesByHash", "upload", "verifyUpload"],
  coordination: ["acquireLease", "renewLease", "loadCheckpoint", "compareAndSetCheckpoint", "releaseLease"]
}
const port = methods => Object.freeze(Object.fromEntries(methods.map(name => [name, async () => { throw new Error(`UNEXPECTED_CALL:${name}`) }])))

function fixture(overrides = {}) {
  const { publicKey } = crypto.generateKeyPairSync("ed25519")
  const calls = []
  const env = {
    HUBSPOT_TOKEN: "fixture-secret",
    SINGLE_CASE_APPLY_TRUSTED_PUBLIC_KEYS_JSON: JSON.stringify([{ algorithm: "Ed25519", issuer: "fixture-issuer", publicKeyPem: publicKey.export({ type: "spki", format: "pem" }) }])
  }
  const value = {
    env,
    fetchImpl: async () => { calls.push("fetch"); throw new Error("UNEXPECTED_FETCH") },
    pool: { query: async () => { calls.push("pool.query"); throw new Error("UNEXPECTED_QUERY") }, connect: async () => { calls.push("pool.connect"); throw new Error("UNEXPECTED_CONNECT") } },
    clock: () => "2026-07-16T12:00:00.000Z",
    drive: port(METHODS.drive),
    planLoader: port(["loadByCaseImportId"]),
    contentLoader: port(["loadBytes"]),
    reservation: port(["verify"]),
    ...overrides
  }
  return { value, calls }
}

test("construção válida é pura e retorna estrutura explícita", () => {
  const f = fixture()
  const result = createSingleCaseRealComposition(f.value)
  assert.equal(typeof result.executor, "function")
  assert.deepEqual(f.calls, [])
  assert.equal(result.configurationSummary.mode, "REAL_COMPONENTS_CONSTRUCTED_EXECUTION_BLOCKED")
})

for (const [name, change, pattern] of [
  ["env ausente", { env: undefined }, /ENV_MISSING/],
  ["token HubSpot ausente", { env: {} }, /HUBSPOT_TOKEN_MISSING/],
  ["fetchImpl ausente", { fetchImpl: undefined }, /HUBSPOT_FETCH_MISSING/],
  ["pool ausente", { pool: undefined }, /POOL_MISSING/],
  ["clock ausente", { clock: undefined }, /CLOCK_INVALID/],
  ["Drive ausente", { drive: undefined }, /DRIVE_MISSING/],
  ["plan loader ausente", { planLoader: undefined }, /PLAN_LOADER_MISSING/],
  ["content loader ausente", { contentLoader: undefined }, /CONTENT_LOADER_MISSING/],
  ["reservation ausente", { reservation: undefined }, /RESERVATION_MISSING/]
]) test(name, () => { const f = fixture(change); assert.throws(() => createSingleCaseRealComposition(f.value), pattern); assert.deepEqual(f.calls, []) })

test("verifier ausente falha fechado", () => {
  const f = fixture({ componentFactories: { authorization: () => ({ authorizationRepository: port(["loadForCase", "consumeAuthorizations"]) }) } })
  assert.throws(() => createSingleCaseRealComposition(f.value), /AUTHORIZATION_VERIFIER_MISSING/)
  assert.deepEqual(f.calls, [])
})

test("construção não acessa lease, checkpoint, HubSpot, Drive ou Postgres", () => {
  const f = fixture()
  const result = createSingleCaseRealComposition(f.value)
  assert.deepEqual(f.calls, [])
  assert.equal(typeof result.adapters.coordination.acquireLease, "function")
  assert.equal(typeof result.adapters.coordination.loadCheckpoint, "function")
  assert.equal(typeof result.adapters.hubspot.contacts.create, "function")
  assert.equal(typeof result.adapters.drive.upload, "function")
})

test("cliente HubSpot recebe fetchImpl injetado e associação canônica", () => {
  const f = fixture()
  let received
  f.value.componentFactories = {
    hubspotClient: args => { received = args; return { contacts: {}, deals: {}, associations: {} } },
    hubspotAdapters: () => ({ contacts: port(["findContactsByCpf", "findContactsByPhone", "create", "verify"]), deals: port(["findByCaseNumber", "create", "verify"]), associations: port(["find", "create", "verify"]) })
  }
  const result = createSingleCaseRealComposition(f.value)
  assert.equal(received.fetch, f.value.fetchImpl)
  assert.equal(result.configurationSummary.associationDirection, "deals_to_contacts")
  assert.equal(result.configurationSummary.associationTypeName, "deal_to_contact")
  assert.equal(result.configurationSummary.associationTypeId, 3)
})

test("CLI real falha fechado sem configuraÃ§Ã£o", async () => {
  await assert.rejects(() => applyCli.main({ argv: ["--case-import-id", "case-fixture-1"], env: {} }), /POSTGRES_MODE_REQUIRED/)
})

test("resumo é sanitizado sem segredo", () => {
  const f = fixture()
  const text = JSON.stringify(createSingleCaseRealComposition(f.value).configurationSummary)
  assert.doesNotMatch(text, /fixture-secret|BEGIN PUBLIC KEY|HUBSPOT_TOKEN|cpf|phone|password/i)
})
