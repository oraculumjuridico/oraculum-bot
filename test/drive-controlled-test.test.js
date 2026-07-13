"use strict"

const assert = require("node:assert/strict")
const fsp = require("node:fs/promises")
const os = require("node:os")
const path = require("node:path")
const {
  APPLY_CONFIRMATION,
  ROLLBACK_CONFIRMATION,
  FOLDER_MIME,
  FILE_MIME,
  markerParts,
  buildPayloads,
  writeManifestAtomic,
  readManifest,
  dryRun,
  preflight,
  applyControlled,
  verify,
  rollback,
  verifyRollback,
  createRestrictedClient,
  createGoogleClient,
  runCli
} = require("../scripts/drive-controlled-test")

const UUID = "11111111-2222-4333-8444-555555555555"
const ROOT = "fixture-root-id"

class FakeDriveClient {
  constructor(options = {}) {
    this.options = options
    this.calls = []
    this.items = new Map()
    this.contents = new Map()
    this.items.set(ROOT, {
      id: ROOT,
      name: "fixture-root",
      mimeType: options.rootMime || FOLDER_MIME,
      trashed: Boolean(options.rootTrashed),
      parents: [],
      capabilities: { canAddChildren: options.canAddChildren !== false },
      ...(options.sharedDrive ? { driveId: "fixture-shared-drive" } : {})
    })
  }

  async request(input) {
    this.calls.push({ ...input, media: input.media ? { ...input.media, body: "stream" } : undefined })
    const { operation } = input
    if (operation === "permissionsList") return { permissions: this.options.publicPermission ? [{ type: "anyone" }] : [{ type: "user" }], ...(this.options.partialPermissions ? { nextPageToken: "more" } : {}) }
    if (operation === "list") {
      if (this.options.partialList) return { files: [], nextPageToken: "more" }
      if (input.pageSize === 1) return { files: [] }
      const name = /name = '([^']+)'/.exec(input.q || "")?.[1]
      const parent = /'([^']+)' in parents/.exec(input.q || "")?.[1]
      const files = [...this.items.values()].filter(item => item.id !== ROOT && (!name || item.name === name) && (!parent || item.parents?.includes(parent)) && !item.trashed)
      return { files, nextPageToken: null }
    }
    if (operation === "get") {
      const item = this.items.get(String(input.fileId))
      if (!item) throw Object.assign(new Error("not found"), { code: "NOT_FOUND" })
      return structuredClone(item)
    }
    if (operation === "download") return Buffer.from(this.contents.get(String(input.fileId)) || "")
    if (operation === "create") {
      if (input.requestBody.mimeType === FOLDER_MIME) {
        const folder = { id: "controlled-folder-id", ...input.requestBody, trashed: false }
        this.items.set(folder.id, folder)
        if (this.options.failAfterFolder) throw Object.assign(new Error("sanitized elsewhere"), { code: "FOLDER_RESPONSE_FAILED" })
        return structuredClone(folder)
      }
      if (this.options.failFile) throw Object.assign(new Error("private"), { code: "FILE_FAILED" })
      const chunks = []
      for await (const chunk of input.media.body) chunks.push(Buffer.from(chunk))
      const content = Buffer.concat(chunks)
      const file = { id: "controlled-file-id", ...input.requestBody, mimeType: input.media.mimeType, trashed: false, size: String(content.length) }
      this.items.set(file.id, file)
      this.contents.set(file.id, content)
      return structuredClone(file)
    }
    if (operation === "updateTrash") {
      if (this.options.failFileTrash && input.fileId === "controlled-file-id") throw Object.assign(new Error("private"), { code: "TRASH_FAILED" })
      const item = this.items.get(String(input.fileId))
      Object.assign(item, input.requestBody)
      return structuredClone(item)
    }
    throw new Error(`unexpected fake operation: ${operation}`)
  }
}

async function realManifest(directory, client = new FakeDriveClient()) {
  const file = path.join(directory, `manifest-${Math.random()}.json`)
  await dryRun({ manifestPath: file, now: new Date("2026-07-12T12:00:00.000Z"), uuid: () => UUID })
  await preflight({ client, rootId: ROOT, manifestPath: file })
  return { file, client }
}

async function appliedManifest(directory, client = new FakeDriveClient()) {
  const context = await realManifest(directory, client)
  await applyControlled({ client, rootId: ROOT, manifestPath: context.file, confirmation: APPLY_CONFIRMATION })
  return context
}

async function main() {
  const directory = await fsp.mkdtemp(path.join(os.tmpdir(), "drive-controlled-test-"))
  try {
    const defaultFile = path.join(directory, "default.json")
    let credentialsRead = false
    let factoryCalled = false
    const env = new Proxy({}, { get() { credentialsRead = true; throw new Error("credentials must not be read") } })
    const defaultResult = await runCli({ args: [], env, manifestPath: defaultFile, clientFactory: () => { factoryCalled = true }, logger: () => {} })
    assert.equal(defaultResult.status.dryRun, "completed")
    assert.equal(credentialsRead, false)
    assert.equal(factoryCalled, false)
    assert.equal(defaultResult.folderId, null)
    assert.equal(defaultResult.fileId, null)

    await assert.rejects(runCli({ args: ["--aply"], manifestPath: path.join(directory, "typo.json") }), e => e.code === "UNKNOWN_ARGUMENT")
    await assert.rejects(runCli({ args: ["--dry-run", "--verify"], manifestPath: path.join(directory, "multi.json") }), e => e.code === "MULTIPLE_MODES_NOT_ALLOWED")
    await assert.rejects(dryRun({ manifestPath: defaultFile }), e => e.code === "MANIFEST_ALREADY_EXISTS")

    const payloads = buildPayloads(defaultResult.marker)
    assert.equal(payloads.folder.name, defaultResult.marker)
    assert.equal(payloads.file.name, `ORACULUM_DRIVE_TEST_${markerParts(defaultResult.marker).uuid}.txt`)
    assert.equal(payloads.file.mimeType, FILE_MIME)
    assert.doesNotMatch(JSON.stringify(payloads), /cpf|telefone|email|numero.?caso|users-state|hubspot/i)

    const concurrentFile = path.join(directory, "concurrent.json")
    const concurrent = await Promise.allSettled([
      dryRun({ manifestPath: concurrentFile, now: new Date("2026-07-12T12:00:00.000Z"), uuid: () => UUID }),
      dryRun({ manifestPath: concurrentFile, now: new Date("2026-07-12T12:00:00.000Z"), uuid: () => UUID })
    ])
    assert.equal(concurrent.filter(item => item.status === "fulfilled").length, 1)
    assert.equal(concurrent.filter(item => item.status === "rejected" && item.reason.code === "MANIFEST_LOCKED").length, 1)

    for (const [options, code] of [
      [{ rootMime: FILE_MIME }, "ROOT_NOT_FOLDER"],
      [{ rootTrashed: true }, "ROOT_TRASHED"],
      [{ canAddChildren: false }, "ROOT_CANNOT_ADD_CHILDREN"],
      [{ sharedDrive: true }, "SHARED_DRIVE_REVIEW_REQUIRED"],
      [{ publicPermission: true }, "ROOT_PUBLIC_PERMISSION_DETECTED"],
      [{ partialPermissions: true }, "DRIVE_PERMISSIONS_RESPONSE_INVALID"],
      [{ partialList: true }, "DRIVE_LIST_RESPONSE_PARTIAL"]
    ]) {
      const file = path.join(directory, `${code}.json`)
      await dryRun({ manifestPath: file, now: new Date("2026-07-12T12:00:00.000Z"), uuid: () => UUID })
      const client = new FakeDriveClient(options)
      await assert.rejects(preflight({ client, rootId: ROOT, manifestPath: file }), e => e.code === code)
      assert.equal(client.calls.some(call => ["create", "updateTrash"].includes(call.operation)), false)
    }

    const duplicateClient = new FakeDriveClient()
    duplicateClient.items.set("existing", { id: "existing", name: `ORACULUM_DRIVE_TEST_2026-07-12T12-00-00-000Z_${UUID}`, mimeType: FOLDER_MIME, parents: [ROOT], trashed: false })
    const duplicateFile = path.join(directory, "duplicate.json")
    await dryRun({ manifestPath: duplicateFile, now: new Date("2026-07-12T12:00:00.000Z"), uuid: () => UUID })
    await assert.rejects(preflight({ client: duplicateClient, rootId: ROOT, manifestPath: duplicateFile }), e => e.code === "PREFLIGHT_CARDINALITY_NOT_ZERO")

    const confirmationContext = await realManifest(directory)
    await assert.rejects(applyControlled({ client: confirmationContext.client, rootId: ROOT, manifestPath: confirmationContext.file }), e => e.code === "APPLY_CONFIRMATION_REQUIRED")
    await assert.rejects(applyControlled({ client: confirmationContext.client, rootId: ROOT, manifestPath: confirmationContext.file, confirmation: `${APPLY_CONFIRMATION} ` }), e => e.code === "APPLY_CONFIRMATION_REQUIRED")
    for (const confirmation of ["", APPLY_CONFIRMATION.toLowerCase(), `${APPLY_CONFIRMATION} `]) {
      let initialized = false
      await assert.rejects(runCli({ args: ["--apply"], env: { DRIVE_CONTROLLED_TEST_CONFIRM: confirmation }, manifestPath: confirmationContext.file, clientFactory: () => { initialized = true } }), e => e.code === "APPLY_CONFIRMATION_REQUIRED")
      assert.equal(initialized, false)
    }

    const applyContext = await appliedManifest(directory)
    const creationCalls = applyContext.client.calls.filter(call => call.operation === "create")
    assert.equal(creationCalls.length, 2)
    assert.equal(creationCalls[0].requestBody.mimeType, FOLDER_MIME)
    assert.equal(creationCalls[1].media.mimeType, FILE_MIME)
    assert.equal(applyContext.client.calls.some(call => call.operation === "updateTrash"), false)
    const applied = await readManifest(applyContext.file)
    assert.equal(applied.folderId, "controlled-folder-id")
    assert.equal(applied.fileId, "controlled-file-id")
    assert.equal(applied.status.apply, "completed")

    const failedClient = new FakeDriveClient({ failFile: true })
    const failedContext = await realManifest(directory, failedClient)
    await assert.rejects(applyControlled({ client: failedClient, rootId: ROOT, manifestPath: failedContext.file, confirmation: APPLY_CONFIRMATION }), e => e.code === "FILE_FAILED")
    const failedManifest = await readManifest(failedContext.file)
    assert.equal(failedManifest.folderId, "controlled-folder-id")
    assert.equal(failedManifest.fileId, null)
    assert.equal(failedManifest.status.apply, "folder_created_rollback_required")

    assert.equal((await readManifest(applyContext.file)).status.verify, "pending")
    const verifyLogs = []
    await verify({ client: applyContext.client, rootId: ROOT, manifestPath: applyContext.file, logger: item => verifyLogs.push(item) })
    assert.equal((await readManifest(applyContext.file)).status.verify, "completed")
    assert.equal(verifyLogs.some(item => item.event === "verify_complete"), true)
    assert.equal(applyContext.client.calls.some(call => ["create", "updateTrash"].includes(call.operation) && call.operation === "updateTrash"), false)

    const verifyFailureContext = await appliedManifest(directory)
    verifyFailureContext.client.items.get("controlled-file-id").name = "divergent.txt"
    await assert.rejects(verify({ client: verifyFailureContext.client, rootId: ROOT, manifestPath: verifyFailureContext.file }), e => e.code === "CONTROLLED_OBJECT_VALIDATION_FAILED")
    const failedVerifyManifest = await readManifest(verifyFailureContext.file)
    assert.equal(failedVerifyManifest.status.verify, "pending")
    assert.equal(failedVerifyManifest.error, "CONTROLLED_OBJECT_VALIDATION_FAILED")

    const dryRollback = path.join(directory, "dry-rollback.json")
    await dryRun({ manifestPath: dryRollback, now: new Date("2026-07-12T12:00:00.000Z"), uuid: () => UUID })
    await assert.rejects(rollback({ client: new FakeDriveClient(), rootId: ROOT, manifestPath: dryRollback, confirmation: ROLLBACK_CONFIRMATION }), e => e.code === "ROLLBACK_REAL_APPLY_REQUIRED")
    await assert.rejects(rollback({ client: applyContext.client, rootId: ROOT, manifestPath: applyContext.file }), e => e.code === "ROLLBACK_CONFIRMATION_REQUIRED")
    await assert.rejects(rollback({ client: applyContext.client, rootId: ROOT, manifestPath: applyContext.file, confirmation: `${ROLLBACK_CONFIRMATION.toLowerCase()}` }), e => e.code === "ROLLBACK_CONFIRMATION_REQUIRED")
    for (const confirmation of ["", ROLLBACK_CONFIRMATION.toLowerCase(), `${ROLLBACK_CONFIRMATION} `]) {
      let initialized = false
      await assert.rejects(runCli({ args: ["--rollback"], env: { DRIVE_CONTROLLED_TEST_CONFIRM: confirmation }, manifestPath: applyContext.file, clientFactory: () => { initialized = true } }), e => e.code === "ROLLBACK_CONFIRMATION_REQUIRED")
      assert.equal(initialized, false)
    }

    const divergentContext = await appliedManifest(directory)
    divergentContext.client.items.get("controlled-folder-id").parents = ["wrong-root"]
    await assert.rejects(rollback({ client: divergentContext.client, rootId: ROOT, manifestPath: divergentContext.file, confirmation: ROLLBACK_CONFIRMATION }), e => e.code === "CONTROLLED_OBJECT_VALIDATION_FAILED")
    assert.equal(divergentContext.client.calls.some(call => call.operation === "updateTrash"), false)

    const hashContext = await appliedManifest(directory)
    hashContext.client.contents.set("controlled-file-id", Buffer.from("divergent"))
    await assert.rejects(rollback({ client: hashContext.client, rootId: ROOT, manifestPath: hashContext.file, confirmation: ROLLBACK_CONFIRMATION }), e => e.code === "CONTROLLED_CONTENT_HASH_DIVERGENT")
    assert.equal(hashContext.client.calls.some(call => call.operation === "updateTrash"), false)

    const trashFailureClient = new FakeDriveClient({ failFileTrash: true })
    const trashFailureContext = await appliedManifest(directory, trashFailureClient)
    await assert.rejects(rollback({ client: trashFailureClient, rootId: ROOT, manifestPath: trashFailureContext.file, confirmation: ROLLBACK_CONFIRMATION }), e => e.code === "TRASH_FAILED")
    assert.equal(trashFailureClient.calls.filter(call => call.operation === "updateTrash").length, 1)
    assert.equal(trashFailureClient.items.get("controlled-folder-id").trashed, false)

    const rollbackContext = await appliedManifest(directory)
    await rollback({ client: rollbackContext.client, rootId: ROOT, manifestPath: rollbackContext.file, confirmation: ROLLBACK_CONFIRMATION })
    assert.deepEqual(rollbackContext.client.calls.filter(call => call.operation === "updateTrash").map(call => call.fileId), ["controlled-file-id", "controlled-folder-id"])
    assert.equal((await readManifest(rollbackContext.file)).status.rollback, "completed")
    await verifyRollback({ client: rollbackContext.client, rootId: ROOT, manifestPath: rollbackContext.file })
    assert.equal((await readManifest(rollbackContext.file)).status.verifyRollback, "completed")

    const restricted = createRestrictedClient(new FakeDriveClient(), "--rollback")
    await assert.rejects(restricted.request({ operation: "updateTrash", fileId: "x", requestBody: { trashed: false } }), e => e.code === "TRASH_UPDATE_UNSAFE")
    await assert.rejects(createRestrictedClient(new FakeDriveClient(), "--verify").request({ operation: "create" }), e => e.code === "GOOGLE_OPERATION_NOT_ALLOWED")

    for (const status of [401, 403, 404, 429, 500]) {
      let attempts = 0
      let receivedOptions
      const googleModule = {
        auth: { OAuth2: class { setCredentials() {} } },
        drive: () => ({
          files: { get: async (_request, options) => {
            attempts++
            receivedOptions = options
            const failure = new Error("private response body")
            failure.response = { status, data: { secret: "must-not-leak" } }
            throw failure
          } },
          permissions: {}
        })
      }
      const httpClient = createGoogleClient({ clientId: "fixture-id", clientSecret: "fixture-secret", refreshToken: "fixture-refresh", googleModule, timeoutMs: 1234 })
      await assert.rejects(httpClient.request({ operation: "get", fileId: "fixture-id", fields: "id" }), e => e.code === `GOOGLE_${status}_FAILED` && !e.message.includes("private") && !e.message.includes("must-not-leak"))
      assert.equal(attempts, status === 429 || status >= 500 ? 3 : 1)
      assert.equal(receivedOptions.timeout, 1234)
    }

    const atomicFile = path.join(directory, "atomic", "manifest.json")
    await writeManifestAtomic(atomicFile, { marker: defaultResult.marker })
    assert.equal((await fsp.readdir(path.dirname(atomicFile))).some(name => name.endsWith(".tmp")), false)

    const secret = "secret-fixture-never-log"
    const logs = []
    const logFile = path.join(directory, "logs.json")
    await dryRun({ manifestPath: logFile, now: new Date("2026-07-12T12:00:00.000Z"), uuid: () => UUID, logger: item => logs.push(JSON.stringify(item)) })
    assert.equal(logs.join(" ").includes(secret), false)
    assert.equal(logs.join(" ").includes(ROOT), false)

    const source = await fsp.readFile(path.join(__dirname, "..", "scripts", "drive-controlled-test.js"), "utf8")
    assert.doesNotMatch(source, /require\([^\n]*(server|drive-files|users-state|hubspot|import-real-cases)/i)
    assert.doesNotMatch(source, /files\.delete|permissions\.(create|update|delete)|batch/i)
    console.log("drive-controlled-test.test.js: ok")
  } finally {
    await fsp.rm(directory, { recursive: true, force: true })
  }
}

main().catch(cause => {
  console.error(cause)
  process.exitCode = 1
})
