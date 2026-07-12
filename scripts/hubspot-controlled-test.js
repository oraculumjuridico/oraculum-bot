"use strict"

const crypto = require("node:crypto")
const fs = require("node:fs")
const fsp = require("node:fs/promises")
const os = require("node:os")
const path = require("node:path")
const axios = require("axios")
const { DEAL_WRITE_PROPERTIES, validateHubSpotProperties } = require("../src/domain/hubspot-contract")

const APPLY_CONFIRMATION = "APPLY_ONE_FICTITIOUS_CONTACT_DEAL_ASSOCIATION"
const ROLLBACK_CONFIRMATION = "ROLLBACK_ONLY_MANIFEST_OBJECTS"
const DEFAULT_MANIFEST = path.join(os.tmpdir(), "oraculum-hubspot-controlled-test", "manifest.json")
const MARKER_PATTERN = /^ORACULUM_TEST_(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z)_([0-9a-f-]{36})$/i

function sha256(value) {
  return crypto.createHash("sha256").update(String(value)).digest("hex")
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`
  }
  return JSON.stringify(value)
}

function markerParts(marker) {
  const match = String(marker || "").match(MARKER_PATTERN)
  if (!match) throw controlledError("MANIFEST_MARKER_INVALID")
  return { uuid: match[2].toLowerCase() }
}

function createMarker(now = new Date(), uuid = crypto.randomUUID()) {
  const timestamp = now.toISOString().replace(/[:.]/g, "-").replace(/-000Z$/, "-000Z")
  return `ORACULUM_TEST_${timestamp}_${uuid}`
}

function buildPayloads(marker, { includeOrigin = DEAL_WRITE_PROPERTIES.has("origem_atendimento") } = {}) {
  const { uuid } = markerParts(marker)
  const contactCandidate = {
    firstname: marker,
    email: `oraculum-test-${uuid}@example.com`
  }
  const dealCandidate = {
    dealname: marker,
    pipeline: "default",
    dealstage: "appointmentscheduled",
    description: `TESTE CONTROLADO ${marker}`,
    ...(includeOrigin ? { origem_atendimento: "teste_controlado" } : {})
  }
  const warnings = []
  const contact = validateHubSpotProperties("contacts", contactCandidate, warning => warnings.push(warning))
  const deal = validateHubSpotProperties("deals", dealCandidate, warning => warnings.push(warning))
  assertExactKeys(contact, ["email", "firstname"], "CONTACT_PAYLOAD_UNSAFE")
  assertExactKeys(deal, ["dealname", "dealstage", "description", "pipeline", ...(includeOrigin ? ["origem_atendimento"] : [])], "DEAL_PAYLOAD_UNSAFE")
  return { contact, deal, includeOrigin: Object.hasOwn(deal, "origem_atendimento"), warnings }
}

function assertExactKeys(value, expected, code) {
  const actual = Object.keys(value || {}).sort()
  const allowed = [...expected].sort()
  if (JSON.stringify(actual) !== JSON.stringify(allowed)) throw controlledError(code)
  if (actual.some(key => /phone|telefone|cpf|numero.*caso|caso.*numero/i.test(key))) throw controlledError(code)
}

function payloadHashes(payloads) {
  return {
    contact: sha256(stableJson(payloads.contact)),
    deal: sha256(stableJson(payloads.deal))
  }
}

function controlledError(code) {
  const error = new Error(code)
  error.code = code
  return error
}

async function writeManifestAtomic(file, manifest) {
  const destination = path.resolve(file)
  await fsp.mkdir(path.dirname(destination), { recursive: true })
  const temporary = `${destination}.${process.pid}.${Date.now()}.tmp`
  await fsp.writeFile(temporary, JSON.stringify(manifest, null, 2), { encoding: "utf8", mode: 0o600 })
  await fsp.rename(temporary, destination)
}

async function withManifestLock(file, task) {
  const destination = path.resolve(file)
  await fsp.mkdir(path.dirname(destination), { recursive: true })
  const lockPath = `${destination}.lock`
  let handle
  try {
    handle = await fsp.open(lockPath, "wx", 0o600)
  } catch (error) {
    if (error?.code === "EEXIST") throw controlledError("MANIFEST_LOCKED")
    throw error
  }
  try {
    return await task()
  } finally {
    await handle.close().catch(() => {})
    await fsp.unlink(lockPath).catch(() => {})
  }
}

async function readManifest(file) {
  const parsed = JSON.parse(await fsp.readFile(path.resolve(file), "utf8"))
  markerParts(parsed?.marker)
  return parsed
}

function newManifest(marker, payloads, now = new Date()) {
  return {
    marker,
    contactId: null,
    dealId: null,
    payloadHashes: payloadHashes(payloads),
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    status: {
      dryRun: "completed",
      preflight: "pending",
      contact: "pending",
      deal: "pending",
      association: "pending",
      verify: "pending",
      rollback: "pending",
      originProperty: payloads.includeOrigin ? "planned" : "omitted"
    }
  }
}

function createHttpClient({ token, axiosInstance = axios } = {}) {
  if (!token) throw controlledError("HUBSPOT_TOKEN_MISSING")
  return {
    async request({ method, path: requestPath, data }) {
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const response = await axiosInstance({
            method,
            url: `https://api.hubapi.com${requestPath}`,
            data,
            headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
            timeout: 15000,
            maxRedirects: 0
          })
          return response.data
        } catch (error) {
          const status = Number(error?.response?.status || 0)
          if (status === 429 && attempt < 2) {
            const retryAfter = Math.min(2000, Math.max(0, Number(error?.response?.headers?.["retry-after"] || 0) * 1000))
            await new Promise(resolve => setTimeout(resolve, retryAfter || 250 * (attempt + 1)))
            continue
          }
          if (status === 401 || status === 403) throw controlledError(`HUBSPOT_AUTH_${status}`)
          if (status === 429) throw controlledError("HUBSPOT_RATE_LIMITED")
          throw controlledError("HUBSPOT_HTTP_ERROR")
        }
      }
      throw controlledError("HUBSPOT_RATE_LIMITED")
    }
  }
}

async function searchExact(client, objectType, propertyName, value) {
  const data = await client.request({
    method: "post",
    path: `/crm/v3/objects/${objectType}/search`,
    data: {
      filterGroups: [{ filters: [{ propertyName, operator: "EQ", value }] }],
      properties: [propertyName],
      limit: 10
    }
  })
  if (!Array.isArray(data?.results) || !Number.isInteger(data?.total) || data.total !== data.results.length) {
    throw controlledError("HUBSPOT_SEARCH_RESPONSE_INVALID")
  }
  return data.results
}

async function originPropertyAvailable(client) {
  try {
    const property = await client.request({ method: "get", path: "/crm/v3/properties/deals/origem_atendimento" })
    return property?.name === "origem_atendimento"
  } catch {
    return false
  }
}

function safeLog(logger, event, details = {}) {
  logger({ event, ...details })
}

async function dryRunUnlocked({ manifestPath = DEFAULT_MANIFEST, logger = () => {}, now, uuid } = {}) {
  if (fs.existsSync(manifestPath)) throw controlledError("MANIFEST_ALREADY_EXISTS")
  const marker = createMarker(now || new Date(), uuid || crypto.randomUUID())
  const payloads = buildPayloads(marker)
  const manifest = newManifest(marker, payloads, now || new Date())
  await writeManifestAtomic(manifestPath, manifest)
  safeLog(logger, "dry_run_complete", {
    mode: "dry-run",
    marker,
    contactProperties: Object.keys(payloads.contact),
    dealProperties: Object.keys(payloads.deal),
    payloadHashes: manifest.payloadHashes,
    originPropertyPlanned: payloads.includeOrigin
  })
  return manifest
}

async function applyControlledUnlocked({ client, manifestPath = DEFAULT_MANIFEST, confirmation, logger = () => {}, now = new Date() } = {}) {
  if (confirmation !== APPLY_CONFIRMATION) throw controlledError("APPLY_CONFIRMATION_REQUIRED")
  if (!client) throw controlledError("HTTP_CLIENT_REQUIRED")
  const manifest = await readManifest(manifestPath)
  if (manifest.contactId || manifest.dealId || manifest.status?.apply === "completed") throw controlledError("MANIFEST_ALREADY_APPLIED")
  const includeOrigin = DEAL_WRITE_PROPERTIES.has("origem_atendimento") && await originPropertyAvailable(client)
  const payloads = buildPayloads(manifest.marker, { includeOrigin })
  manifest.payloadHashes = payloadHashes(payloads)
  manifest.status.originProperty = payloads.includeOrigin ? "available" : "unavailable_omitted"
  const contacts = await searchExact(client, "contacts", "email", payloads.contact.email)
  const deals = await searchExact(client, "deals", "dealname", payloads.deal.dealname)
  safeLog(logger, "preflight", { contacts: contacts.length, deals: deals.length, originPropertyIncluded: payloads.includeOrigin })
  if (contacts.length !== 0 || deals.length !== 0) throw controlledError("PREFLIGHT_CARDINALITY_NOT_ZERO")
  manifest.status.preflight = "completed"
  manifest.updatedAt = now.toISOString()
  await writeManifestAtomic(manifestPath, manifest)

  try {
    const contact = await client.request({ method: "post", path: "/crm/v3/objects/contacts", data: { properties: payloads.contact } })
    if (!contact?.id) throw controlledError("CONTACT_CREATE_NO_ID")
    manifest.contactId = String(contact.id)
    manifest.status.contact = "created"
    manifest.updatedAt = new Date().toISOString()
    await writeManifestAtomic(manifestPath, manifest)
  } catch (error) {
    manifest.status.contact = manifest.contactId ? "created_rollback_required" : "failed"
    manifest.updatedAt = new Date().toISOString()
    await writeManifestAtomic(manifestPath, manifest)
    throw controlledError(error?.code || "CONTACT_CREATE_FAILED")
  }

  try {
    const deal = await client.request({ method: "post", path: "/crm/v3/objects/deals", data: { properties: payloads.deal } })
    if (!deal?.id) throw controlledError("DEAL_CREATE_NO_ID")
    manifest.dealId = String(deal.id)
    manifest.status.deal = "created"
    manifest.updatedAt = new Date().toISOString()
    await writeManifestAtomic(manifestPath, manifest)
  } catch (error) {
    manifest.status.deal = "failed"
    manifest.status.rollback = "contact_only_required"
    manifest.updatedAt = new Date().toISOString()
    await writeManifestAtomic(manifestPath, manifest)
    throw controlledError(error?.code || "DEAL_CREATE_FAILED")
  }

  try {
    await client.request({
      method: "put",
      path: `/crm/v3/objects/deals/${encodeURIComponent(manifest.dealId)}/associations/contacts/${encodeURIComponent(manifest.contactId)}/deal_to_contact`,
      data: {}
    })
    manifest.status.association = "created"
    manifest.status.apply = "completed"
    manifest.updatedAt = new Date().toISOString()
    await writeManifestAtomic(manifestPath, manifest)
  } catch (error) {
    manifest.status.association = "failed"
    manifest.status.rollback = "created_ids_required"
    manifest.updatedAt = new Date().toISOString()
    await writeManifestAtomic(manifestPath, manifest)
    throw controlledError(error?.code || "ASSOCIATION_CREATE_FAILED")
  }

  safeLog(logger, "apply_complete", { mode: "apply", marker: manifest.marker, contactId: manifest.contactId, dealId: manifest.dealId })
  return manifest
}

async function fetchControlledObjects(client, manifest, { archived = false } = {}) {
  if (!manifest.contactId || !manifest.dealId) throw controlledError("MANIFEST_IDS_REQUIRED")
  const query = archived ? "&archived=true" : ""
  const contact = await client.request({ method: "get", path: `/crm/v3/objects/contacts/${encodeURIComponent(manifest.contactId)}?properties=firstname,email${query}` })
  const deal = await client.request({ method: "get", path: `/crm/v3/objects/deals/${encodeURIComponent(manifest.dealId)}?properties=dealname,description,origem_atendimento${query}` })
  const associations = await client.request({ method: "get", path: `/crm/v3/objects/deals/${encodeURIComponent(manifest.dealId)}/associations/contacts` })
  return { contact, deal, associations }
}

function validateControlledObjects(manifest, objects) {
  const { uuid } = markerParts(manifest.marker)
  const expectedEmail = `oraculum-test-${uuid}@example.com`
  const contactOk = String(objects.contact?.id) === String(manifest.contactId) &&
    objects.contact?.properties?.firstname === manifest.marker &&
    objects.contact?.properties?.email === expectedEmail
  const dealOk = String(objects.deal?.id) === String(manifest.dealId) &&
    objects.deal?.properties?.dealname === manifest.marker &&
    objects.deal?.properties?.description === `TESTE CONTROLADO ${manifest.marker}`
  const associationOk = (objects.associations?.results || []).some(item => String(item.id) === String(manifest.contactId))
  if (!contactOk || !dealOk || !associationOk) throw controlledError("CONTROLLED_OBJECT_VALIDATION_FAILED")
  return true
}

async function verifyControlledUnlocked({ client, manifestPath = DEFAULT_MANIFEST, logger = () => {} } = {}) {
  if (!client) throw controlledError("HTTP_CLIENT_REQUIRED")
  const manifest = await readManifest(manifestPath)
  const objects = await fetchControlledObjects(client, manifest)
  validateControlledObjects(manifest, objects)
  safeLog(logger, "verify_complete", { mode: "verify", marker: manifest.marker, contactId: manifest.contactId, dealId: manifest.dealId })
  return manifest
}

async function rollbackControlledUnlocked({ client, manifestPath = DEFAULT_MANIFEST, confirmation, logger = () => {} } = {}) {
  if (confirmation !== ROLLBACK_CONFIRMATION) throw controlledError("ROLLBACK_CONFIRMATION_REQUIRED")
  if (!client) throw controlledError("HTTP_CLIENT_REQUIRED")
  const manifest = await readManifest(manifestPath)
  if (manifest.status?.apply !== "completed" || manifest.status?.association !== "created") throw controlledError("ROLLBACK_REAL_APPLY_REQUIRED")
  const objects = await fetchControlledObjects(client, manifest)
  validateControlledObjects(manifest, objects)
  await client.request({ method: "delete", path: `/crm/v3/objects/deals/${encodeURIComponent(manifest.dealId)}` })
  manifest.status.rollback = "deal_archived"
  manifest.updatedAt = new Date().toISOString()
  await writeManifestAtomic(manifestPath, manifest)
  await client.request({ method: "delete", path: `/crm/v3/objects/contacts/${encodeURIComponent(manifest.contactId)}` })
  manifest.status.rollback = "objects_archived"
  manifest.updatedAt = new Date().toISOString()
  await writeManifestAtomic(manifestPath, manifest)
  const archived = {
    contact: await client.request({ method: "get", path: `/crm/v3/objects/contacts/${encodeURIComponent(manifest.contactId)}?properties=firstname,email&archived=true` }),
    deal: await client.request({ method: "get", path: `/crm/v3/objects/deals/${encodeURIComponent(manifest.dealId)}?properties=dealname,description&archived=true` })
  }
  if (String(archived.contact?.id) !== manifest.contactId || String(archived.deal?.id) !== manifest.dealId || archived.contact?.archived !== true || archived.deal?.archived !== true) {
    throw controlledError("ROLLBACK_ARCHIVE_VERIFICATION_FAILED")
  }
  manifest.status.rollback = "completed"
  manifest.updatedAt = new Date().toISOString()
  await writeManifestAtomic(manifestPath, manifest)
  safeLog(logger, "rollback_complete", { mode: "rollback", marker: manifest.marker, contactId: manifest.contactId, dealId: manifest.dealId })
  return manifest
}

function dryRun(options = {}) {
  const manifestPath = options.manifestPath || DEFAULT_MANIFEST
  return withManifestLock(manifestPath, () => dryRunUnlocked({ ...options, manifestPath }))
}

function applyControlled(options = {}) {
  const manifestPath = options.manifestPath || DEFAULT_MANIFEST
  return withManifestLock(manifestPath, () => applyControlledUnlocked({ ...options, manifestPath }))
}

function verifyControlled(options = {}) {
  const manifestPath = options.manifestPath || DEFAULT_MANIFEST
  return withManifestLock(manifestPath, () => verifyControlledUnlocked({ ...options, manifestPath }))
}

function rollbackControlled(options = {}) {
  const manifestPath = options.manifestPath || DEFAULT_MANIFEST
  return withManifestLock(manifestPath, () => rollbackControlledUnlocked({ ...options, manifestPath }))
}

function parseMode(args = []) {
  const unknown = args.filter(arg => !["--dry-run", "--apply", "--verify", "--rollback"].includes(arg))
  if (unknown.length) throw controlledError("UNKNOWN_ARGUMENT")
  const modes = args.filter(arg => ["--dry-run", "--apply", "--verify", "--rollback"].includes(arg))
  if (modes.length > 1) throw controlledError("MULTIPLE_MODES_NOT_ALLOWED")
  return modes[0] || "--dry-run"
}

async function runCli({ args = process.argv.slice(2), env = process.env, client, logger = value => console.log(JSON.stringify(value)), manifestPath = env.HUBSPOT_CONTROLLED_TEST_MANIFEST || DEFAULT_MANIFEST } = {}) {
  const mode = parseMode(args)
  if (mode === "--dry-run") return dryRun({ manifestPath, logger })
  if (mode === "--apply" && env.HUBSPOT_CONTROLLED_TEST_CONFIRM !== APPLY_CONFIRMATION) throw controlledError("APPLY_CONFIRMATION_REQUIRED")
  if (mode === "--rollback" && env.HUBSPOT_CONTROLLED_TEST_CONFIRM !== ROLLBACK_CONFIRMATION) throw controlledError("ROLLBACK_CONFIRMATION_REQUIRED")
  const httpClient = client || createHttpClient({ token: env.HUBSPOT_TOKEN })
  if (mode === "--apply") return applyControlled({ client: httpClient, manifestPath, confirmation: env.HUBSPOT_CONTROLLED_TEST_CONFIRM, logger })
  if (mode === "--verify") return verifyControlled({ client: httpClient, manifestPath, logger })
  return rollbackControlled({ client: httpClient, manifestPath, confirmation: env.HUBSPOT_CONTROLLED_TEST_CONFIRM, logger })
}

if (require.main === module) {
  require("dotenv").config({ quiet: true })
  runCli().catch(error => {
    console.error(JSON.stringify({ ok: false, error: error?.code || "CONTROLLED_TEST_FAILED" }))
    process.exitCode = 1
  })
}

module.exports = {
  APPLY_CONFIRMATION,
  ROLLBACK_CONFIRMATION,
  DEFAULT_MANIFEST,
  createMarker,
  buildPayloads,
  payloadHashes,
  createHttpClient,
  writeManifestAtomic,
  readManifest,
  dryRun,
  applyControlled,
  verifyControlled,
  rollbackControlled,
  parseMode,
  runCli
}
