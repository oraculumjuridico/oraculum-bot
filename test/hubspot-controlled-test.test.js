"use strict"

const assert = require("node:assert/strict")
const fs = require("node:fs")
const fsp = require("node:fs/promises")
const os = require("node:os")
const path = require("node:path")
const {
  APPLY_CONFIRMATION,
  ROLLBACK_CONFIRMATION,
  buildPayloads,
  createHttpClient,
  dryRun,
  readManifest,
  writeManifestAtomic,
  applyControlled,
  rollbackControlled,
  runCli
} = require("../scripts/hubspot-controlled-test")

const UUID = "11111111-2222-4333-8444-555555555555"
const MARKER = `ORACULUM_TEST_2026-07-12T12-00-00-000Z_${UUID}`

class FakeClient {
  constructor(options = {}) {
    this.options = options
    this.calls = []
    this.archived = new Set()
  }

  async request(input) {
    this.calls.push(structuredClone(input))
    const { method, path: requestPath } = input
    if (requestPath === "/crm/v3/properties/deals/origem_atendimento") {
      if (this.options.originMissing) throw Object.assign(new Error("missing"), { code: "NOT_FOUND" })
      return { name: "origem_atendimento" }
    }
    if (requestPath.endsWith("/search")) {
      if (this.options.partialSearch) return {}
      const results = this.options.searchResults || []
      return { total: results.length, results }
    }
    if (method === "post" && requestPath === "/crm/v3/objects/contacts") return { id: "controlled-contact-id" }
    if (method === "post" && requestPath === "/crm/v3/objects/deals") {
      if (this.options.failDeal) throw Object.assign(new Error("private"), { code: "DEAL_FAILED" })
      return { id: "controlled-deal-id" }
    }
    if (method === "put") {
      if (this.options.failAssociation) throw Object.assign(new Error("private"), { code: "ASSOCIATION_FAILED" })
      return {}
    }
    if (method === "delete") {
      this.archived.add(requestPath)
      return {}
    }
    if (method === "get" && requestPath.includes("/associations/contacts")) {
      return { results: [{ id: this.options.associationContactId || "controlled-contact-id" }] }
    }
    if (method === "get" && requestPath.includes("/contacts/")) {
      return {
        id: this.options.contactId || "controlled-contact-id",
        archived: requestPath.includes("archived=true"),
        properties: {
          firstname: this.options.marker || MARKER,
          email: `oraculum-test-${UUID}@example.com`
        }
      }
    }
    if (method === "get" && requestPath.includes("/deals/")) {
      return {
        id: this.options.dealId || "controlled-deal-id",
        archived: requestPath.includes("archived=true"),
        properties: {
          dealname: this.options.marker || MARKER,
          description: `TESTE CONTROLADO ${this.options.marker || MARKER}`
        }
      }
    }
    throw new Error(`unexpected fake request: ${method} ${requestPath}`)
  }
}

async function manifestApplied(file) {
  await dryRun({ manifestPath: file, now: new Date("2026-07-12T12:00:00.000Z"), uuid: UUID })
  const manifest = await readManifest(file)
  manifest.contactId = "controlled-contact-id"
  manifest.dealId = "controlled-deal-id"
  manifest.status.apply = "completed"
  manifest.status.association = "created"
  await writeManifestAtomic(file, manifest)
  return manifest
}

async function main() {
  const directory = await fsp.mkdtemp(path.join(os.tmpdir(), "hubspot-controlled-test-"))
  try {
    const defaultManifest = path.join(directory, "default.json")
    const defaultCalls = []
    const defaultResult = await runCli({ args: [], manifestPath: defaultManifest, client: { request: value => defaultCalls.push(value) }, logger: () => {} })
    assert.equal(defaultResult.status.dryRun, "completed")
    assert.equal(defaultCalls.length, 0)
    await assert.rejects(runCli({ args: ["--aply"], manifestPath: path.join(directory, "typo.json") }), error => error.code === "UNKNOWN_ARGUMENT")
    await assert.rejects(runCli({ args: ["--dry-run", "--verify"], manifestPath: path.join(directory, "multiple.json") }), error => error.code === "MULTIPLE_MODES_NOT_ALLOWED")

    const dryManifest = path.join(directory, "dry.json")
    const forbiddenClient = { request: () => { throw new Error("rede proibida no dry-run") } }
    await runCli({ args: ["--dry-run"], manifestPath: dryManifest, client: forbiddenClient, logger: () => {} })
    assert.equal((await readManifest(dryManifest)).contactId, null)
    await assert.rejects(dryRun({ manifestPath: dryManifest }), error => error.code === "MANIFEST_ALREADY_EXISTS")

    const concurrentFile = path.join(directory, "concurrent.json")
    const concurrent = await Promise.allSettled([
      dryRun({ manifestPath: concurrentFile, now: new Date("2026-07-12T12:00:00.000Z"), uuid: UUID }),
      dryRun({ manifestPath: concurrentFile, now: new Date("2026-07-12T12:00:00.000Z"), uuid: UUID })
    ])
    assert.equal(concurrent.filter(item => item.status === "fulfilled").length, 1)
    assert.equal(concurrent.filter(item => item.status === "rejected" && item.reason.code === "MANIFEST_LOCKED").length, 1)

    await assert.rejects(runCli({ args: ["--apply"], env: {}, client: new FakeClient(), manifestPath: dryManifest }), error => error.code === "APPLY_CONFIRMATION_REQUIRED")
    await assert.rejects(runCli({ args: ["--rollback"], env: {}, client: new FakeClient(), manifestPath: dryManifest }), error => error.code === "ROLLBACK_CONFIRMATION_REQUIRED")
    await assert.rejects(runCli({ args: ["--apply"], env: { HUBSPOT_CONTROLLED_TEST_CONFIRM: `${APPLY_CONFIRMATION}_APROXIMADO` }, client: new FakeClient(), manifestPath: dryManifest }), error => error.code === "APPLY_CONFIRMATION_REQUIRED")
    await assert.rejects(runCli({ args: ["--rollback"], env: { HUBSPOT_CONTROLLED_TEST_CONFIRM: `${ROLLBACK_CONFIRMATION}_APROXIMADO` }, client: new FakeClient(), manifestPath: dryManifest }), error => error.code === "ROLLBACK_CONFIRMATION_REQUIRED")

    const payloads = buildPayloads(MARKER)
    for (const forbidden of ["phone", "cpf", "cpf_do_cliente", "numero_caso", "numero_de_caso"]) {
      assert.equal(Object.hasOwn(payloads.contact, forbidden), false)
      assert.equal(Object.hasOwn(payloads.deal, forbidden), false)
    }

    const cardinalityFile = path.join(directory, "cardinality.json")
    await dryRun({ manifestPath: cardinalityFile, now: new Date("2026-07-12T12:00:00.000Z"), uuid: UUID })
    const cardinalityClient = new FakeClient({ searchResults: [{ id: "existing" }] })
    await assert.rejects(applyControlled({ client: cardinalityClient, manifestPath: cardinalityFile, confirmation: APPLY_CONFIRMATION }), error => error.code === "PREFLIGHT_CARDINALITY_NOT_ZERO")
    assert.equal(cardinalityClient.calls.some(call => call.path === "/crm/v3/objects/contacts"), false)

    const partialSearchFile = path.join(directory, "partial-search.json")
    await dryRun({ manifestPath: partialSearchFile, now: new Date("2026-07-12T12:00:00.000Z"), uuid: UUID })
    const partialSearchClient = new FakeClient({ partialSearch: true })
    await assert.rejects(applyControlled({ client: partialSearchClient, manifestPath: partialSearchFile, confirmation: APPLY_CONFIRMATION }), error => error.code === "HUBSPOT_SEARCH_RESPONSE_INVALID")
    assert.equal(partialSearchClient.calls.some(call => call.path === "/crm/v3/objects/contacts"), false)

    const dealFailureFile = path.join(directory, "deal-failure.json")
    await dryRun({ manifestPath: dealFailureFile, now: new Date("2026-07-12T12:00:00.000Z"), uuid: UUID })
    const dealFailureClient = new FakeClient({ failDeal: true })
    await assert.rejects(applyControlled({ client: dealFailureClient, manifestPath: dealFailureFile, confirmation: APPLY_CONFIRMATION }), error => error.code === "DEAL_FAILED")
    const dealFailureManifest = await readManifest(dealFailureFile)
    assert.equal(dealFailureManifest.contactId, "controlled-contact-id")
    assert.equal(dealFailureManifest.dealId, null)
    assert.equal(dealFailureManifest.status.rollback, "contact_only_required")
    assert.equal(dealFailureClient.calls.some(call => call.method === "delete"), false)

    const associationFailureFile = path.join(directory, "association-failure.json")
    await dryRun({ manifestPath: associationFailureFile, now: new Date("2026-07-12T12:00:00.000Z"), uuid: UUID })
    const associationFailureClient = new FakeClient({ failAssociation: true })
    await assert.rejects(applyControlled({ client: associationFailureClient, manifestPath: associationFailureFile, confirmation: APPLY_CONFIRMATION }), error => error.code === "ASSOCIATION_FAILED")
    const associationFailureManifest = await readManifest(associationFailureFile)
    assert.equal(associationFailureManifest.contactId, "controlled-contact-id")
    assert.equal(associationFailureManifest.dealId, "controlled-deal-id")
    assert.equal(associationFailureManifest.status.rollback, "created_ids_required")

    const originMissingFile = path.join(directory, "origin-missing.json")
    await dryRun({ manifestPath: originMissingFile, now: new Date("2026-07-12T12:00:00.000Z"), uuid: UUID })
    const originMissingClient = new FakeClient({ originMissing: true })
    await applyControlled({ client: originMissingClient, manifestPath: originMissingFile, confirmation: APPLY_CONFIRMATION })
    const dealCreationWithoutOrigin = originMissingClient.calls.find(call => call.method === "post" && call.path === "/crm/v3/objects/deals")
    assert.equal(Object.hasOwn(dealCreationWithoutOrigin.data.properties, "origem_atendimento"), false)
    assert.equal((await readManifest(originMissingFile)).status.originProperty, "unavailable_omitted")

    const divergenceFile = path.join(directory, "divergence.json")
    await manifestApplied(divergenceFile)
    const divergenceClient = new FakeClient({ marker: "ORACULUM_TEST_DIVERGENT" })
    await assert.rejects(rollbackControlled({ client: divergenceClient, manifestPath: divergenceFile, confirmation: ROLLBACK_CONFIRMATION }), error => error.code === "CONTROLLED_OBJECT_VALIDATION_FAILED")
    assert.equal(divergenceClient.calls.some(call => call.method === "delete"), false)

    const dryRollbackFile = path.join(directory, "dry-rollback.json")
    await dryRun({ manifestPath: dryRollbackFile, now: new Date("2026-07-12T12:00:00.000Z"), uuid: UUID })
    await assert.rejects(rollbackControlled({ client: new FakeClient(), manifestPath: dryRollbackFile, confirmation: ROLLBACK_CONFIRMATION }), error => error.code === "ROLLBACK_REAL_APPLY_REQUIRED")

    const idDivergenceFile = path.join(directory, "id-divergence.json")
    await manifestApplied(idDivergenceFile)
    const idDivergenceClient = new FakeClient({ contactId: "different-controlled-id" })
    await assert.rejects(rollbackControlled({ client: idDivergenceClient, manifestPath: idDivergenceFile, confirmation: ROLLBACK_CONFIRMATION }), error => error.code === "CONTROLLED_OBJECT_VALIDATION_FAILED")
    assert.equal(idDivergenceClient.calls.some(call => call.method === "delete"), false)

    const rollbackFile = path.join(directory, "rollback.json")
    await manifestApplied(rollbackFile)
    const rollbackClient = new FakeClient()
    await rollbackControlled({ client: rollbackClient, manifestPath: rollbackFile, confirmation: ROLLBACK_CONFIRMATION })
    const deletes = rollbackClient.calls.filter(call => call.method === "delete").map(call => call.path)
    assert.deepEqual(deletes, [
      "/crm/v3/objects/deals/controlled-deal-id",
      "/crm/v3/objects/contacts/controlled-contact-id"
    ])
    assert.equal((await readManifest(rollbackFile)).status.rollback, "completed")

    const verifyFile = path.join(directory, "verify.json")
    await manifestApplied(verifyFile)
    assert.equal((await readManifest(verifyFile)).status.verify, "pending")
    const verifyClient = new FakeClient()
    const verifyLogs = []
    await runCli({ args: ["--verify"], env: {}, client: verifyClient, manifestPath: verifyFile, logger: value => verifyLogs.push(value) })
    const verifiedManifest = await readManifest(verifyFile)
    assert.equal(verifiedManifest.status.verify, "completed")
    assert.notEqual(verifiedManifest.updatedAt, verifiedManifest.createdAt)
    assert.equal(verifyClient.calls.some(call => ["post", "patch", "put", "delete"].includes(call.method)), false)
    assert.equal(verifyLogs.some(log => log.event === "verify_complete"), true)

    const failedVerifyFile = path.join(directory, "verify-failed.json")
    await manifestApplied(failedVerifyFile)
    const failedVerifyClient = new FakeClient({ marker: "ORACULUM_TEST_DIVERGENT" })
    await assert.rejects(
      runCli({ args: ["--verify"], env: {}, client: failedVerifyClient, manifestPath: failedVerifyFile, logger: () => {} }),
      error => error.code === "CONTROLLED_OBJECT_VALIDATION_FAILED"
    )
    assert.equal((await readManifest(failedVerifyFile)).status.verify, "pending")
    assert.equal(failedVerifyClient.calls.some(call => ["post", "patch", "put", "delete"].includes(call.method)), false)

    let rateAttempts = 0
    let lastHttpConfig
    const rateClient = createHttpClient({
      token: "token-nao-logado",
      axiosInstance: async config => {
        lastHttpConfig = config
        rateAttempts++
        if (rateAttempts < 3) {
          const error = new Error("private")
          error.response = { status: 429, headers: { "retry-after": "0" } }
          throw error
        }
        return { data: { ok: true } }
      }
    })
    assert.deepEqual(await rateClient.request({ method: "get", path: "/controlled" }), { ok: true })
    assert.equal(rateAttempts, 3)
    assert.equal(lastHttpConfig.timeout, 15000)
    assert.equal(lastHttpConfig.maxRedirects, 0)
    for (const status of [401, 403]) {
      const authClient = createHttpClient({ token: "token-nao-logado", axiosInstance: async () => {
        const error = new Error("private")
        error.response = { status }
        throw error
      } })
      await assert.rejects(authClient.request({ method: "get", path: "/controlled" }), error => error.code === `HUBSPOT_AUTH_${status}` && !error.message.includes("private"))
    }

    const atomicFile = path.join(directory, "atomic", "manifest.json")
    await writeManifestAtomic(atomicFile, { marker: MARKER })
    assert.deepEqual(JSON.parse(await fsp.readFile(atomicFile, "utf8")), { marker: MARKER })
    assert.equal((await fsp.readdir(path.dirname(atomicFile))).some(name => name.endsWith(".tmp")), false)

    const secret = "token-super-secreto"
    const logs = []
    const loggingFile = path.join(directory, "logging.json")
    await dryRun({ manifestPath: loggingFile, now: new Date("2026-07-12T12:00:00.000Z"), uuid: UUID, logger: value => logs.push(JSON.stringify(value)) })
    assert.equal(logs.join(" ").includes(secret), false)

    const source = await fsp.readFile(path.join(__dirname, "..", "scripts", "hubspot-controlled-test.js"), "utf8")
    assert.doesNotMatch(source, /batch|reset-hubspot|users-state|server\.js/i)
    assert.doesNotMatch(source, /console\.log\([^\n]*(token|authorization|headers)/i)
    console.log("hubspot-controlled-test.test.js: ok")
  } finally {
    await fsp.rm(directory, { recursive: true, force: true })
  }
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
})
