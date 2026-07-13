"use strict"

const crypto = require("node:crypto")
const fs = require("node:fs")
const fsp = require("node:fs/promises")
const os = require("node:os")
const path = require("node:path")
const { Readable } = require("node:stream")

const DEFAULT_MANIFEST = path.join(os.tmpdir(), "oraculum-drive-controlled-test", "manifest.json")
const APPLY_CONFIRMATION = "APPLY_ONE_FICTITIOUS_FOLDER_AND_FILE"
const ROLLBACK_CONFIRMATION = "TRASH_ONLY_MANIFEST_FOLDER_AND_FILE"
const FOLDER_MIME = "application/vnd.google-apps.folder"
const FILE_MIME = "text/plain"
const MODES = ["--dry-run", "--preflight", "--apply", "--verify", "--rollback", "--verify-rollback"]
const ALLOWED = {
  "--preflight": new Set(["get", "list", "permissionsList"]),
  "--apply": new Set(["get", "list", "permissionsList", "create", "download"]),
  "--verify": new Set(["get", "list", "download"]),
  "--rollback": new Set(["get", "list", "download", "updateTrash"]),
  "--verify-rollback": new Set(["get"])
}

function error(code) {
  const value = new Error(code)
  value.code = code
  return value
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex")
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`
  return JSON.stringify(value)
}

function markerParts(marker) {
  const match = /^ORACULUM_DRIVE_TEST_(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z)_([0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i.exec(String(marker || ""))
  if (!match) throw error("MARKER_INVALID")
  return { timestamp: match[1], uuid: match[2] }
}

function buildPayloads(marker) {
  const { uuid } = markerParts(marker)
  const folder = { name: marker, mimeType: FOLDER_MIME }
  const file = {
    name: `ORACULUM_DRIVE_TEST_${uuid}.txt`,
    mimeType: FILE_MIME,
    content: `${marker}\nFixture tecnica para teste controlado do Google Drive.\n`
  }
  if (Object.keys(folder).sort().join(",") !== "mimeType,name" || Object.keys(file).sort().join(",") !== "content,mimeType,name") throw error("PAYLOAD_FIELDS_UNSAFE")
  if (folder.name !== marker || !/^ORACULUM_DRIVE_TEST_[0-9a-f-]{36}\.txt$/i.test(file.name)) throw error("PAYLOAD_NAME_UNSAFE")
  return { folder, file }
}

function payloadHashes(payloads) {
  return {
    folder: sha256(stableJson(payloads.folder)),
    file: sha256(stableJson({ name: payloads.file.name, mimeType: payloads.file.mimeType })),
    content: sha256(payloads.file.content)
  }
}

async function writeManifestAtomic(file, manifest) {
  const destination = path.resolve(file)
  await fsp.mkdir(path.dirname(destination), { recursive: true })
  const temporary = `${destination}.${process.pid}.${Date.now()}.tmp`
  await fsp.writeFile(temporary, JSON.stringify(manifest, null, 2), { encoding: "utf8", mode: 0o600 })
  await fsp.rename(temporary, destination)
}

async function readManifest(file) {
  const manifest = JSON.parse(await fsp.readFile(path.resolve(file), "utf8"))
  markerParts(manifest?.marker)
  return manifest
}

async function withManifestLock(file, task) {
  const destination = path.resolve(file)
  await fsp.mkdir(path.dirname(destination), { recursive: true })
  const lock = `${destination}.lock`
  let handle
  try { handle = await fsp.open(lock, "wx", 0o600) } catch (cause) {
    if (cause?.code === "EEXIST") throw error("MANIFEST_LOCKED")
    throw cause
  }
  try { return await task() } finally {
    await handle.close().catch(() => {})
    await fsp.unlink(lock).catch(() => {})
  }
}

function sanitizedLog(logger, event, details = {}) {
  logger({ event, ...details })
}

function newManifest(marker, rootFolderId = null, now = new Date()) {
  const payloads = buildPayloads(marker)
  return {
    marker,
    mode: "dry-run",
    rootFolderIdHash: rootFolderId ? sha256(rootFolderId) : null,
    folderId: null,
    fileId: null,
    payloadHashes: payloadHashes(payloads),
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    timestamps: {},
    status: { dryRun: "completed", preflight: "pending", apply: "pending", verify: "pending", rollback: "pending", verifyRollback: "pending" },
    step: "dry_run_completed",
    error: null
  }
}

function parseMode(args) {
  const unknown = args.filter(arg => !MODES.includes(arg))
  if (unknown.length) throw error("UNKNOWN_ARGUMENT")
  if (args.length > 1) throw error("MULTIPLE_MODES_NOT_ALLOWED")
  return args[0] || "--dry-run"
}

function createRestrictedClient(client, mode) {
  const allowed = ALLOWED[mode]
  if (!allowed) throw error("MODE_HAS_NO_GOOGLE_ACCESS")
  return {
    async request(input) {
      if (!allowed.has(input.operation)) throw error("GOOGLE_OPERATION_NOT_ALLOWED")
      if (input.operation === "updateTrash" && (Object.keys(input.requestBody || {}).length !== 1 || input.requestBody.trashed !== true)) throw error("TRASH_UPDATE_UNSAFE")
      return client.request(input)
    }
  }
}

function createGoogleClient({ clientId, clientSecret, refreshToken, googleModule, timeoutMs = 15000 } = {}) {
  if (!clientId || !clientSecret || !refreshToken) throw error("GOOGLE_CREDENTIALS_MISSING")
  const google = googleModule || require("googleapis").google
  const oauth = new google.auth.OAuth2(clientId, clientSecret, "urn:ietf:wg:oauth:2.0:oob")
  oauth.setCredentials({ refresh_token: refreshToken })
  const drive = google.drive({ version: "v3", auth: oauth })
  async function execute(operation, call) {
    for (let attempt = 0; attempt < 3; attempt++) {
      try { return (await call()).data } catch (cause) {
        const status = Number(cause?.response?.status || cause?.code || 0)
        if ((status === 429 || status >= 500) && attempt < 2) continue
        if ([401, 403, 404, 429].includes(status) || status >= 500) throw error(`GOOGLE_${status || "REQUEST"}_FAILED`)
        throw error("GOOGLE_REQUEST_FAILED")
      }
    }
  }
  return {
    request(input) {
      const options = { timeout: timeoutMs }
      if (input.operation === "get") return execute("get", () => drive.files.get({ fileId: input.fileId, fields: input.fields }, options))
      if (input.operation === "download") return execute("download", () => drive.files.get({ fileId: input.fileId, alt: "media" }, { ...options, responseType: "arraybuffer" }))
      if (input.operation === "list") return execute("list", () => drive.files.list({ q: input.q, fields: input.fields, pageSize: input.pageSize, ...(input.pageToken ? { pageToken: input.pageToken } : {}) }, options))
      if (input.operation === "permissionsList") return execute("permissionsList", () => drive.permissions.list({ fileId: input.fileId, fields: "nextPageToken,permissions(type)", pageSize: 100 }, options))
      if (input.operation === "create") return execute("create", () => drive.files.create({ requestBody: input.requestBody, ...(input.media ? { media: input.media } : {}), fields: input.fields }, options))
      if (input.operation === "updateTrash") return execute("updateTrash", () => drive.files.update({ fileId: input.fileId, requestBody: input.requestBody, fields: input.fields }, options))
      throw error("GOOGLE_OPERATION_UNKNOWN")
    }
  }
}

function exactNameQuery(name, parentId, mimeType) {
  const escape = value => String(value).replace(/\\/g, "\\\\").replace(/'/g, "\\'")
  return [`name = '${escape(name)}'`, `'${escape(parentId)}' in parents`, `mimeType = '${escape(mimeType)}'`, "trashed = false"].join(" and ")
}

async function limitedList(client, q) {
  const response = await client.request({ operation: "list", q, fields: "nextPageToken,files(id,name,mimeType,parents,trashed)", pageSize: 2 })
  if (!response || !Array.isArray(response.files) || response.nextPageToken) throw error("DRIVE_LIST_RESPONSE_PARTIAL")
  return response.files
}

async function validateRoot(client, rootId) {
  if (!rootId) throw error("ROOT_FOLDER_ID_MISSING")
  const root = await client.request({ operation: "get", fileId: rootId, fields: "id,name,mimeType,trashed,parents,capabilities(canAddChildren),driveId" })
  if (String(root?.id) !== String(rootId)) throw error("ROOT_ID_DIVERGENT")
  if (root.mimeType !== FOLDER_MIME) throw error("ROOT_NOT_FOLDER")
  if (root.trashed) throw error("ROOT_TRASHED")
  if (root.capabilities?.canAddChildren !== true) throw error("ROOT_CANNOT_ADD_CHILDREN")
  if (root.driveId) throw error("SHARED_DRIVE_REVIEW_REQUIRED")
  const access = await client.request({ operation: "list", q: `'${String(rootId).replace(/'/g, "\\'")}' in parents and trashed = false`, fields: "nextPageToken,files(id)", pageSize: 1 })
  if (!access || !Array.isArray(access.files)) throw error("DRIVE_LIST_RESPONSE_PARTIAL")
  const permissions = await client.request({ operation: "permissionsList", fileId: rootId })
  if (!permissions || !Array.isArray(permissions.permissions) || permissions.nextPageToken) throw error("DRIVE_PERMISSIONS_RESPONSE_INVALID")
  if (permissions.permissions.some(item => item.type === "anyone")) throw error("ROOT_PUBLIC_PERMISSION_DETECTED")
  return root
}

async function validateCardinality(client, rootId, payloads) {
  const folders = await limitedList(client, exactNameQuery(payloads.folder.name, rootId, FOLDER_MIME))
  const files = await limitedList(client, exactNameQuery(payloads.file.name, rootId, FILE_MIME))
  if (folders.length !== 0 || files.length !== 0) throw error("PREFLIGHT_CARDINALITY_NOT_ZERO")
}

async function validateObjects(client, manifest, rootId, { trashed = false, download = true } = {}) {
  if (!manifest.folderId || !manifest.fileId) throw error("MANIFEST_IDS_REQUIRED")
  if (manifest.rootFolderIdHash !== sha256(rootId)) throw error("ROOT_FOLDER_HASH_DIVERGENT")
  const payloads = buildPayloads(manifest.marker)
  const folder = await client.request({ operation: "get", fileId: manifest.folderId, fields: "id,name,mimeType,parents,trashed" })
  const file = await client.request({ operation: "get", fileId: manifest.fileId, fields: "id,name,mimeType,parents,trashed,size,md5Checksum" })
  const folderOk = String(folder?.id) === String(manifest.folderId) && folder.name === payloads.folder.name && folder.mimeType === FOLDER_MIME && folder.trashed === trashed && Array.isArray(folder.parents) && folder.parents.length === 1 && String(folder.parents[0]) === String(rootId)
  const fileOk = String(file?.id) === String(manifest.fileId) && file.name === payloads.file.name && file.mimeType === FILE_MIME && file.trashed === trashed && Array.isArray(file.parents) && file.parents.length === 1 && String(file.parents[0]) === String(manifest.folderId) && Number(file.size) === Buffer.byteLength(payloads.file.content)
  if (!folderOk || !fileOk) throw error("CONTROLLED_OBJECT_VALIDATION_FAILED")
  if (download) {
    const content = await client.request({ operation: "download", fileId: manifest.fileId })
    if (sha256(Buffer.from(content)) !== manifest.payloadHashes.content) throw error("CONTROLLED_CONTENT_HASH_DIVERGENT")
  }
  return { folder, file }
}

async function dryRunUnlocked({ manifestPath = DEFAULT_MANIFEST, logger = () => {}, now = new Date(), uuid = crypto.randomUUID } = {}) {
  if (fs.existsSync(manifestPath)) throw error("MANIFEST_ALREADY_EXISTS")
  const marker = `ORACULUM_DRIVE_TEST_${now.toISOString().replace(/:/g, "-").replace(".", "-")}_${uuid()}`
  const manifest = newManifest(marker, null, now)
  await writeManifestAtomic(manifestPath, manifest)
  sanitizedLog(logger, "dry_run_complete", { mode: "dry-run", marker, fields: ["name", "mimeType", "content"], hashes: manifest.payloadHashes, plannedOperations: ["validate root", "create one folder", "upload one text file", "verify", "trash two manifest IDs"], network: false, idsNull: true })
  return manifest
}

async function preflightUnlocked({ client, rootId, manifestPath, logger = () => {}, now = new Date() }) {
  const manifest = await readManifest(manifestPath)
  const restricted = createRestrictedClient(client, "--preflight")
  await validateRoot(restricted, rootId)
  await validateCardinality(restricted, rootId, buildPayloads(manifest.marker))
  manifest.mode = "real"
  manifest.rootFolderIdHash = sha256(rootId)
  manifest.status.preflight = "completed"
  manifest.step = "preflight_completed"
  manifest.timestamps.preflightCompletedAt = now.toISOString()
  manifest.updatedAt = now.toISOString()
  await writeManifestAtomic(manifestPath, manifest)
  sanitizedLog(logger, "preflight_complete", { mode: "preflight", rootValidated: true, cardinality: 0, publicPermission: false })
  return manifest
}

async function applyUnlocked({ client, rootId, manifestPath, confirmation, logger = () => {} }) {
  if (confirmation !== APPLY_CONFIRMATION) throw error("APPLY_CONFIRMATION_REQUIRED")
  const manifest = await readManifest(manifestPath)
  if (manifest.mode !== "real" || manifest.status.preflight !== "completed" || manifest.rootFolderIdHash !== sha256(rootId)) throw error("REAL_PREFLIGHT_REQUIRED")
  if (manifest.folderId || manifest.fileId || manifest.status.apply === "completed") throw error("MANIFEST_ALREADY_APPLIED")
  const restricted = createRestrictedClient(client, "--apply")
  await validateRoot(restricted, rootId)
  const payloads = buildPayloads(manifest.marker)
  await validateCardinality(restricted, rootId, payloads)
  const folder = await restricted.request({ operation: "create", requestBody: { name: payloads.folder.name, mimeType: FOLDER_MIME, parents: [rootId] }, fields: "id,name,mimeType,parents,trashed" })
  if (!folder?.id) throw error("FOLDER_CREATE_RESPONSE_INVALID")
  manifest.folderId = String(folder.id)
  manifest.status.apply = "folder_created_rollback_required"
  manifest.step = "folder_created"
  manifest.updatedAt = new Date().toISOString()
  await writeManifestAtomic(manifestPath, manifest)
  try {
    const checkedFolder = await restricted.request({ operation: "get", fileId: manifest.folderId, fields: "id,name,mimeType,parents,trashed" })
    if (checkedFolder.name !== payloads.folder.name || checkedFolder.mimeType !== FOLDER_MIME || checkedFolder.trashed || checkedFolder.parents?.length !== 1 || String(checkedFolder.parents[0]) !== String(rootId)) throw error("CREATED_FOLDER_VALIDATION_FAILED")
    const createdFile = await restricted.request({ operation: "create", requestBody: { name: payloads.file.name, parents: [manifest.folderId] }, media: { mimeType: FILE_MIME, body: Readable.from([payloads.file.content]) }, fields: "id,name,mimeType,parents,trashed,size,md5Checksum" })
    if (!createdFile?.id) throw error("FILE_CREATE_RESPONSE_INVALID")
    manifest.fileId = String(createdFile.id)
    manifest.status.apply = "file_created_validation_required"
    manifest.step = "file_created"
    manifest.updatedAt = new Date().toISOString()
    await writeManifestAtomic(manifestPath, manifest)
    await validateObjects(restricted, manifest, rootId)
    manifest.status.apply = "completed"
    manifest.step = "apply_completed"
    manifest.timestamps.applyCompletedAt = new Date().toISOString()
    manifest.updatedAt = manifest.timestamps.applyCompletedAt
    await writeManifestAtomic(manifestPath, manifest)
  } catch (cause) {
    manifest.error = cause?.code || "APPLY_FAILED"
    manifest.updatedAt = new Date().toISOString()
    await writeManifestAtomic(manifestPath, manifest)
    throw cause
  }
  sanitizedLog(logger, "apply_complete", { mode: "apply", folderCreated: true, fileCreated: true })
  return manifest
}

async function verifyUnlocked({ client, rootId, manifestPath, logger = () => {}, now = new Date() }) {
  const manifest = await readManifest(manifestPath)
  if (manifest.status.apply !== "completed") throw error("REAL_APPLY_REQUIRED")
  const restricted = createRestrictedClient(client, "--verify")
  try {
    await validateObjects(restricted, manifest, rootId)
    const children = await limitedList(restricted, `'${String(manifest.folderId).replace(/'/g, "\\'")}' in parents and trashed = false`)
    if (children.length !== 1 || String(children[0].id) !== String(manifest.fileId)) throw error("CONTROLLED_FOLDER_CARDINALITY_INVALID")
  } catch (cause) {
    manifest.error = cause?.code || "VERIFY_FAILED"
    manifest.updatedAt = now.toISOString()
    await writeManifestAtomic(manifestPath, manifest)
    throw cause
  }
  manifest.status.verify = "completed"
  manifest.step = "verify_completed"
  manifest.timestamps.verifyCompletedAt = now.toISOString()
  manifest.updatedAt = now.toISOString()
  manifest.error = null
  await writeManifestAtomic(manifestPath, manifest)
  sanitizedLog(logger, "verify_complete", { mode: "verify", controlledObjects: 2 })
  return manifest
}

async function rollbackUnlocked({ client, rootId, manifestPath, confirmation, logger = () => {} }) {
  if (confirmation !== ROLLBACK_CONFIRMATION) throw error("ROLLBACK_CONFIRMATION_REQUIRED")
  const manifest = await readManifest(manifestPath)
  if (manifest.mode !== "real" || manifest.status.preflight !== "completed" || manifest.status.apply !== "completed") throw error("ROLLBACK_REAL_APPLY_REQUIRED")
  const restricted = createRestrictedClient(client, "--rollback")
  await validateObjects(restricted, manifest, rootId)
  await restricted.request({ operation: "updateTrash", fileId: manifest.fileId, requestBody: { trashed: true }, fields: "id,name,mimeType,parents,trashed,size" })
  const file = await restricted.request({ operation: "get", fileId: manifest.fileId, fields: "id,name,mimeType,parents,trashed,size" })
  if (file.trashed !== true || String(file.id) !== String(manifest.fileId)) throw error("FILE_TRASH_VERIFICATION_FAILED")
  manifest.status.rollback = "file_trashed"
  manifest.step = "file_trashed"
  manifest.updatedAt = new Date().toISOString()
  await writeManifestAtomic(manifestPath, manifest)
  await restricted.request({ operation: "updateTrash", fileId: manifest.folderId, requestBody: { trashed: true }, fields: "id,name,mimeType,parents,trashed" })
  const folder = await restricted.request({ operation: "get", fileId: manifest.folderId, fields: "id,name,mimeType,parents,trashed" })
  if (folder.trashed !== true || String(folder.id) !== String(manifest.folderId)) throw error("FOLDER_TRASH_VERIFICATION_FAILED")
  manifest.status.rollback = "completed"
  manifest.step = "rollback_completed"
  manifest.timestamps.rollbackCompletedAt = new Date().toISOString()
  manifest.updatedAt = manifest.timestamps.rollbackCompletedAt
  await writeManifestAtomic(manifestPath, manifest)
  sanitizedLog(logger, "rollback_complete", { mode: "rollback", trashedObjects: 2 })
  return manifest
}

async function verifyRollbackUnlocked({ client, rootId, manifestPath, logger = () => {}, now = new Date() }) {
  const manifest = await readManifest(manifestPath)
  if (manifest.status.rollback !== "completed") throw error("ROLLBACK_COMPLETION_REQUIRED")
  const restricted = createRestrictedClient(client, "--verify-rollback")
  await validateObjects(restricted, manifest, rootId, { trashed: true, download: false })
  manifest.status.verifyRollback = "completed"
  manifest.step = "verify_rollback_completed"
  manifest.timestamps.verifyRollbackCompletedAt = now.toISOString()
  manifest.updatedAt = now.toISOString()
  await writeManifestAtomic(manifestPath, manifest)
  sanitizedLog(logger, "verify_rollback_complete", { mode: "verify-rollback", trashedObjects: 2 })
  return manifest
}

function locked(file, fn) { return withManifestLock(file, fn) }
function dryRun(options = {}) { const file = options.manifestPath || DEFAULT_MANIFEST; return locked(file, () => dryRunUnlocked({ ...options, manifestPath: file })) }
function preflight(options = {}) { const file = options.manifestPath || DEFAULT_MANIFEST; return locked(file, () => preflightUnlocked({ ...options, manifestPath: file })) }
function applyControlled(options = {}) { const file = options.manifestPath || DEFAULT_MANIFEST; return locked(file, () => applyUnlocked({ ...options, manifestPath: file })) }
function verify(options = {}) { const file = options.manifestPath || DEFAULT_MANIFEST; return locked(file, () => verifyUnlocked({ ...options, manifestPath: file })) }
function rollback(options = {}) { const file = options.manifestPath || DEFAULT_MANIFEST; return locked(file, () => rollbackUnlocked({ ...options, manifestPath: file })) }
function verifyRollback(options = {}) { const file = options.manifestPath || DEFAULT_MANIFEST; return locked(file, () => verifyRollbackUnlocked({ ...options, manifestPath: file })) }

async function runCli({ args = process.argv.slice(2), env = process.env, client, clientFactory = createGoogleClient, logger = value => console.log(JSON.stringify(value)), manifestPath = DEFAULT_MANIFEST } = {}) {
  const mode = parseMode(args)
  if (mode === "--dry-run") return dryRun({ manifestPath, logger })
  if (mode === "--apply" && env.DRIVE_CONTROLLED_TEST_CONFIRM !== APPLY_CONFIRMATION) throw error("APPLY_CONFIRMATION_REQUIRED")
  if (mode === "--rollback" && env.DRIVE_CONTROLLED_TEST_CONFIRM !== ROLLBACK_CONFIRMATION) throw error("ROLLBACK_CONFIRMATION_REQUIRED")
  const rootId = env.DRIVE_PASTA_CLIENTES_ID
  const realClient = client || clientFactory({ clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET, refreshToken: env.GOOGLE_REFRESH_TOKEN })
  if (mode === "--preflight") return preflight({ client: realClient, rootId, manifestPath, logger })
  if (mode === "--apply") return applyControlled({ client: realClient, rootId, manifestPath, confirmation: env.DRIVE_CONTROLLED_TEST_CONFIRM, logger })
  if (mode === "--verify") return verify({ client: realClient, rootId, manifestPath, logger })
  if (mode === "--rollback") return rollback({ client: realClient, rootId, manifestPath, confirmation: env.DRIVE_CONTROLLED_TEST_CONFIRM, logger })
  return verifyRollback({ client: realClient, rootId, manifestPath, logger })
}

if (require.main === module) {
  runCli().catch(cause => {
    console.error(JSON.stringify({ event: "drive_controlled_test_failed", code: cause?.code || "CONTROLLED_TEST_FAILED" }))
    process.exitCode = 1
  })
}

module.exports = { DEFAULT_MANIFEST, APPLY_CONFIRMATION, ROLLBACK_CONFIRMATION, FOLDER_MIME, FILE_MIME, markerParts, buildPayloads, writeManifestAtomic, readManifest, withManifestLock, parseMode, createRestrictedClient, createGoogleClient, newManifest, dryRun, preflight, applyControlled, verify, rollback, verifyRollback, runCli, sha256 }
