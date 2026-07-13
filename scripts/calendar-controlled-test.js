"use strict"

const crypto = require("node:crypto")
const fs = require("node:fs")
const fsp = require("node:fs/promises")
const os = require("node:os")
const path = require("node:path")
const { resolveInstitutionalCalendarId } = require("../src/config/institutional-calendar")

const DEFAULT_MANIFEST = path.join(os.tmpdir(), "oraculum-calendar-controlled-test", "manifest.json")
const APPLY_CONFIRMATION = "APPLY_ONE_FICTITIOUS_EVENT"
const ROLLBACK_CONFIRMATION = "DELETE_ONLY_MANIFEST_EVENT"
const TIMEZONE = "America/Sao_Paulo"
const MODES = ["--dry-run", "--preflight", "--apply", "--verify", "--rollback", "--verify-rollback"]
const ALLOWED = {
  "--preflight": new Set(["calendarGet", "eventsList"]),
  "--apply": new Set(["calendarGet", "eventsList", "eventsInsert", "eventsGet"]),
  "--verify": new Set(["eventsGet"]),
  "--rollback": new Set(["eventsGet", "eventsDelete"]),
  "--verify-rollback": new Set(["eventsGet"])
}

function controlledError(code) { const e = new Error(code); e.code = code; return e }
function sha256(value) { return crypto.createHash("sha256").update(value).digest("hex") }
function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${stableJson(value[k])}`).join(",")}}`
  return JSON.stringify(value)
}

function markerParts(marker) {
  const match = /^ORACULUM_CALENDAR_TEST_(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z)_([0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i.exec(String(marker || ""))
  if (!match) throw controlledError("MARKER_INVALID")
  return { timestamp: match[1], uuid: match[2] }
}

function plannedWindow(now = new Date()) {
  const start = new Date(now.getTime() + 48 * 60 * 60 * 1000)
  start.setUTCMinutes(0, 0, 0)
  const end = new Date(start.getTime() + 15 * 60 * 1000)
  return { start: start.toISOString(), end: end.toISOString() }
}

function buildPayload(marker, start, end) {
  markerParts(marker)
  const payload = {
    summary: marker,
    description: `Fixture tecnica para teste controlado do Google Calendar. ${marker}`,
    start: { dateTime: new Date(start).toISOString(), timeZone: TIMEZONE },
    end: { dateTime: new Date(end).toISOString(), timeZone: TIMEZONE },
    extendedProperties: { private: { controlledTestMarker: marker } },
    reminders: { useDefault: false, overrides: [] }
  }
  const expected = ["description", "end", "extendedProperties", "reminders", "start", "summary"]
  if (Object.keys(payload).sort().join(",") !== expected.join(",")) throw controlledError("PAYLOAD_FIELDS_UNSAFE")
  if (new Date(payload.start.dateTime) <= new Date() || new Date(payload.end.dateTime) - new Date(payload.start.dateTime) !== 15 * 60 * 1000) throw controlledError("EVENT_WINDOW_INVALID")
  return payload
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
    if (cause?.code === "EEXIST") throw controlledError("MANIFEST_LOCKED")
    throw cause
  }
  try { return await task() } finally {
    await handle.close().catch(() => {})
    await fsp.unlink(lock).catch(() => {})
  }
}

function parseMode(args) {
  if (args.some(arg => !MODES.includes(arg))) throw controlledError("UNKNOWN_ARGUMENT")
  if (args.length > 1) throw controlledError("MULTIPLE_MODES_NOT_ALLOWED")
  return args[0] || "--dry-run"
}

function restrictedClient(client, mode) {
  const allowed = ALLOWED[mode]
  if (!allowed) throw controlledError("MODE_HAS_NO_GOOGLE_ACCESS")
  return { request(input) {
    if (!allowed.has(input.operation)) throw controlledError("GOOGLE_OPERATION_NOT_ALLOWED")
    if (["eventsInsert", "eventsDelete"].includes(input.operation) && input.sendUpdates !== "none") throw controlledError("SEND_UPDATES_UNSAFE")
    return client.request(input)
  } }
}

function createGoogleClient({ clientId, clientSecret, refreshToken, googleModule, timeoutMs = 15000 } = {}) {
  if (!clientId || !clientSecret || !refreshToken) throw controlledError("GOOGLE_CREDENTIALS_MISSING")
  const google = googleModule || require("googleapis").google
  const oauth = new google.auth.OAuth2(clientId, clientSecret, "urn:ietf:wg:oauth:2.0:oob")
  oauth.setCredentials({ refresh_token: refreshToken })
  const calendar = google.calendar({ version: "v3", auth: oauth })
  async function execute(call) {
    for (let attempt = 0; attempt < 3; attempt++) {
      try { return (await call()).data } catch (cause) {
        const status = Number(cause?.response?.status || cause?.code || 0)
        if ((status === 429 || status >= 500) && attempt < 2) continue
        if ([401, 403, 404, 410, 429].includes(status) || status >= 500) throw controlledError(`GOOGLE_${status || "REQUEST"}_FAILED`)
        throw controlledError("GOOGLE_REQUEST_FAILED")
      }
    }
  }
  return { request(input) {
    const options = { timeout: timeoutMs }
    if (input.operation === "calendarGet") return execute(() => calendar.calendarList.get({ calendarId: input.calendarId, fields: "id,timeZone,accessRole,primary,deleted" }, options))
    if (input.operation === "eventsList") return execute(() => calendar.events.list({ calendarId: input.calendarId, timeMin: input.timeMin, timeMax: input.timeMax, maxResults: input.maxResults, singleEvents: true, ...(input.privateExtendedProperty ? { privateExtendedProperty: input.privateExtendedProperty } : {}), fields: "nextPageToken,items(id,status)" }, options))
    if (input.operation === "eventsInsert") return execute(() => calendar.events.insert({ calendarId: input.calendarId, requestBody: input.requestBody, sendUpdates: input.sendUpdates }, options))
    if (input.operation === "eventsGet") return execute(() => calendar.events.get({ calendarId: input.calendarId, eventId: input.eventId, fields: "id,status,summary,description,start,end,extendedProperties,reminders,attendees,attachments,conferenceData,location,recurrence" }, options))
    if (input.operation === "eventsDelete") return execute(() => calendar.events.delete({ calendarId: input.calendarId, eventId: input.eventId, sendUpdates: input.sendUpdates }, options))
    throw controlledError("GOOGLE_OPERATION_UNKNOWN")
  } }
}

function validateCalendarId(calendarId) {
  if (!calendarId || calendarId === "primary") throw controlledError("CALENDAR_ID_REQUIRED")
  return String(calendarId)
}

async function validateCalendar(client, calendarId) {
  const calendar = await client.request({ operation: "calendarGet", calendarId })
  if (String(calendar?.id) !== String(calendarId)) throw controlledError("CALENDAR_ID_DIVERGENT")
  if (calendar.deleted) throw controlledError("CALENDAR_DELETED")
  if (calendar.timeZone !== TIMEZONE) throw controlledError("CALENDAR_TIMEZONE_DIVERGENT")
  if (calendar.accessRole !== "owner") throw controlledError("SHARED_CALENDAR_REVIEW_REQUIRED")
  return calendar
}

async function limitedEvents(client, calendarId, manifest, markerOnly = false) {
  const result = await client.request({
    operation: "eventsList", calendarId,
    timeMin: manifest.timestamps.plannedStartAt,
    timeMax: manifest.timestamps.plannedEndAt,
    maxResults: markerOnly ? 2 : 1,
    ...(markerOnly ? { privateExtendedProperty: [`controlledTestMarker=${manifest.marker}`] } : {})
  })
  if (!result || !Array.isArray(result.items) || result.nextPageToken) throw controlledError("EVENTS_LIST_RESPONSE_PARTIAL")
  return result.items
}

function validateEvent(manifest, event, { cancelled = false } = {}) {
  const payload = buildPayload(manifest.marker, manifest.timestamps.plannedStartAt, manifest.timestamps.plannedEndAt)
  const emptyOrAbsent = value => value == null || (Array.isArray(value) && value.length === 0)
  const sameInstant = (actual, expected) => Number.isFinite(Date.parse(actual)) && Date.parse(actual) === Date.parse(expected)
  const validTimezone = value => value == null || value === TIMEZONE
  const divergences = []
  if (String(event?.id) !== String(manifest.eventId)) divergences.push("eventId")
  if (event?.summary !== payload.summary) divergences.push("summary")
  if (event?.description !== payload.description) divergences.push("description")
  if (!sameInstant(event?.start?.dateTime, payload.start.dateTime) || !validTimezone(event?.start?.timeZone)) divergences.push("start")
  if (!sameInstant(event?.end?.dateTime, payload.end.dateTime) || !validTimezone(event?.end?.timeZone)) divergences.push("end")
  if (Date.parse(event?.end?.dateTime) - Date.parse(event?.start?.dateTime) !== 15 * 60 * 1000) divergences.push("duration")
  if (event?.extendedProperties?.private?.controlledTestMarker !== manifest.marker) divergences.push("marker")
  if (!emptyOrAbsent(event?.attendees)) divergences.push("attendees")
  if (!emptyOrAbsent(event?.attachments)) divergences.push("attachments")
  if (event?.conferenceData != null) divergences.push("conferenceData")
  if (event?.location != null && event.location !== "") divergences.push("location")
  if (!emptyOrAbsent(event?.recurrence)) divergences.push("recurrence")
  if (event?.reminders?.useDefault !== false || !emptyOrAbsent(event.reminders?.overrides)) divergences.push("reminders")
  if (cancelled ? event?.status !== "cancelled" : event?.status === "cancelled") divergences.push("status")
  if (sha256(stableJson(payload)) !== manifest.payloadHash) divergences.push("payloadHash")
  if (divergences.length) {
    const failure = controlledError("CONTROLLED_EVENT_VALIDATION_FAILED")
    failure.fields = [...new Set(divergences)].sort()
    throw failure
  }
  return true
}

function newManifest(marker, window, now = new Date()) {
  const payload = buildPayload(marker, window.start, window.end)
  return {
    marker, mode: "dry-run", calendarIdHash: null, eventId: null,
    payloadHash: sha256(stableJson(payload)), createdAt: now.toISOString(), updatedAt: now.toISOString(),
    timestamps: { plannedStartAt: window.start, plannedEndAt: window.end },
    status: { dryRun: "completed", preflight: "pending", apply: "pending", verify: "pending", rollback: "pending", verifyRollback: "pending" },
    step: "dry_run_completed", error: null
  }
}

async function dryRunUnlocked({ manifestPath = DEFAULT_MANIFEST, logger = () => {}, now = new Date(), uuid = crypto.randomUUID } = {}) {
  if (fs.existsSync(manifestPath)) throw controlledError("MANIFEST_ALREADY_EXISTS")
  const marker = `ORACULUM_CALENDAR_TEST_${now.toISOString().replace(/:/g, "-").replace(".", "-")}_${uuid()}`
  const manifest = newManifest(marker, plannedWindow(now), now)
  await writeManifestAtomic(manifestPath, manifest)
  logger({ event: "dry_run_complete", mode: "dry-run", marker, fields: ["summary", "description", "start", "end", "extendedProperties", "reminders"], payloadHash: manifest.payloadHash, plannedOperations: ["validate calendar", "create one event", "verify by manifest ID", "delete manifest ID", "verify rollback"], network: false, eventId: null })
  return manifest
}

async function preflightUnlocked({ client, calendarId, manifestPath, logger = () => {}, now = new Date() }) {
  const id = validateCalendarId(calendarId)
  const manifest = await readManifest(manifestPath)
  const restricted = restrictedClient(client, "--preflight")
  await validateCalendar(restricted, id)
  const markerEvents = await limitedEvents(restricted, id, manifest, true)
  if (markerEvents.length !== 0) throw controlledError("PREFLIGHT_CARDINALITY_NOT_ZERO")
  const conflicts = await limitedEvents(restricted, id, manifest, false)
  if (conflicts.length !== 0) throw controlledError("EVENT_WINDOW_CONFLICT")
  manifest.mode = "real"; manifest.calendarIdHash = sha256(id); manifest.status.preflight = "completed"
  manifest.step = "preflight_completed"; manifest.timestamps.preflightCompletedAt = now.toISOString(); manifest.updatedAt = now.toISOString()
  await writeManifestAtomic(manifestPath, manifest)
  logger({ event: "preflight_complete", mode: "preflight", calendarValidated: true, timezoneValidated: true, ownedCalendar: true, cardinality: 0, conflicts: 0 })
  return manifest
}

async function applyUnlocked({ client, calendarId, manifestPath, confirmation, logger = () => {} }) {
  if (confirmation !== APPLY_CONFIRMATION) throw controlledError("APPLY_CONFIRMATION_REQUIRED")
  const id = validateCalendarId(calendarId)
  const manifest = await readManifest(manifestPath)
  if (manifest.mode !== "real" || manifest.status.preflight !== "completed" || manifest.calendarIdHash !== sha256(id)) throw controlledError("REAL_PREFLIGHT_REQUIRED")
  if (manifest.eventId || manifest.status.apply === "completed") throw controlledError("MANIFEST_ALREADY_APPLIED")
  const restricted = restrictedClient(client, "--apply")
  await validateCalendar(restricted, id)
  if ((await limitedEvents(restricted, id, manifest, true)).length) throw controlledError("PREFLIGHT_CARDINALITY_NOT_ZERO")
  if ((await limitedEvents(restricted, id, manifest, false)).length) throw controlledError("EVENT_WINDOW_CONFLICT")
  const payload = buildPayload(manifest.marker, manifest.timestamps.plannedStartAt, manifest.timestamps.plannedEndAt)
  const created = await restricted.request({ operation: "eventsInsert", calendarId: id, requestBody: payload, sendUpdates: "none" })
  if (!created?.id) throw controlledError("EVENT_CREATE_RESPONSE_INVALID")
  manifest.eventId = String(created.id); manifest.status.apply = "event_created_validation_required"; manifest.step = "event_created"; manifest.updatedAt = new Date().toISOString()
  await writeManifestAtomic(manifestPath, manifest)
  try {
    const event = await restricted.request({ operation: "eventsGet", calendarId: id, eventId: manifest.eventId })
    validateEvent(manifest, event)
    manifest.status.apply = "completed"; manifest.step = "apply_completed"; manifest.timestamps.applyCompletedAt = new Date().toISOString(); manifest.updatedAt = manifest.timestamps.applyCompletedAt
    await writeManifestAtomic(manifestPath, manifest)
  } catch (cause) {
    manifest.error = cause?.code || "APPLY_FAILED"; manifest.updatedAt = new Date().toISOString(); await writeManifestAtomic(manifestPath, manifest); throw cause
  }
  logger({ event: "apply_complete", mode: "apply", eventCreated: true, notifications: false })
  return manifest
}

async function verifyUnlocked({ client, calendarId, manifestPath, logger = () => {}, now = new Date() }) {
  const id = validateCalendarId(calendarId); const manifest = await readManifest(manifestPath)
  const applyNeedsValidation = manifest.status.apply === "event_created_validation_required"
  if (!["completed", "event_created_validation_required"].includes(manifest.status.apply) || !manifest.eventId || manifest.calendarIdHash !== sha256(id)) throw controlledError("REAL_APPLY_REQUIRED")
  try { validateEvent(manifest, await restrictedClient(client, "--verify").request({ operation: "eventsGet", calendarId: id, eventId: manifest.eventId })) } catch (cause) {
    manifest.error = cause?.code || "VERIFY_FAILED"; manifest.updatedAt = now.toISOString(); await writeManifestAtomic(manifestPath, manifest); throw cause
  }
  if (applyNeedsValidation) {
    manifest.status.apply = "completed"
    manifest.timestamps.applyCompletedAt = now.toISOString()
  }
  manifest.status.verify = "completed"; manifest.step = "verify_completed"; manifest.error = null; manifest.timestamps.verifyCompletedAt = now.toISOString(); manifest.updatedAt = now.toISOString()
  await writeManifestAtomic(manifestPath, manifest); logger({ event: "verify_complete", mode: "verify", eventValidated: true }); return manifest
}

async function rollbackUnlocked({ client, calendarId, manifestPath, confirmation, logger = () => {} }) {
  if (confirmation !== ROLLBACK_CONFIRMATION) throw controlledError("ROLLBACK_CONFIRMATION_REQUIRED")
  const id = validateCalendarId(calendarId); const manifest = await readManifest(manifestPath)
  if (manifest.mode !== "real" || manifest.status.preflight !== "completed" || manifest.status.apply !== "completed" || manifest.status.verify !== "completed" || !manifest.eventId || manifest.calendarIdHash !== sha256(id)) throw controlledError("ROLLBACK_VERIFIED_APPLY_REQUIRED")
  const restricted = restrictedClient(client, "--rollback")
  validateEvent(manifest, await restricted.request({ operation: "eventsGet", calendarId: id, eventId: manifest.eventId }))
  await restricted.request({ operation: "eventsDelete", calendarId: id, eventId: manifest.eventId, sendUpdates: "none" })
  manifest.status.rollback = "completed"; manifest.step = "rollback_completed"; manifest.timestamps.rollbackCompletedAt = new Date().toISOString(); manifest.updatedAt = manifest.timestamps.rollbackCompletedAt
  await writeManifestAtomic(manifestPath, manifest); logger({ event: "rollback_complete", mode: "rollback", deletedEvents: 1, notifications: false }); return manifest
}

async function verifyRollbackUnlocked({ client, calendarId, manifestPath, logger = () => {}, now = new Date() }) {
  const id = validateCalendarId(calendarId); const manifest = await readManifest(manifestPath)
  if (manifest.status.rollback !== "completed" || !manifest.eventId || manifest.calendarIdHash !== sha256(id)) throw controlledError("ROLLBACK_COMPLETION_REQUIRED")
  const restricted = restrictedClient(client, "--verify-rollback")
  let removed = false
  try {
    const event = await restricted.request({ operation: "eventsGet", calendarId: id, eventId: manifest.eventId })
    validateEvent(manifest, event, { cancelled: true }); removed = true
  } catch (cause) {
    if (["GOOGLE_404_FAILED", "GOOGLE_410_FAILED"].includes(cause?.code)) removed = true
    else throw cause
  }
  if (!removed) throw controlledError("ROLLBACK_NOT_CONFIRMED")
  manifest.status.verifyRollback = "completed"; manifest.step = "verify_rollback_completed"; manifest.timestamps.verifyRollbackCompletedAt = now.toISOString(); manifest.updatedAt = now.toISOString()
  await writeManifestAtomic(manifestPath, manifest); logger({ event: "verify_rollback_complete", mode: "verify-rollback", eventRemoved: true }); return manifest
}

function lock(file, task) { return withManifestLock(file, task) }
function dryRun(o = {}) { const f = o.manifestPath || DEFAULT_MANIFEST; return lock(f, () => dryRunUnlocked({ ...o, manifestPath: f })) }
function preflight(o = {}) { const f = o.manifestPath || DEFAULT_MANIFEST; return lock(f, () => preflightUnlocked({ ...o, manifestPath: f })) }
function applyControlled(o = {}) { const f = o.manifestPath || DEFAULT_MANIFEST; return lock(f, () => applyUnlocked({ ...o, manifestPath: f })) }
function verify(o = {}) { const f = o.manifestPath || DEFAULT_MANIFEST; return lock(f, () => verifyUnlocked({ ...o, manifestPath: f })) }
function rollback(o = {}) { const f = o.manifestPath || DEFAULT_MANIFEST; return lock(f, () => rollbackUnlocked({ ...o, manifestPath: f })) }
function verifyRollback(o = {}) { const f = o.manifestPath || DEFAULT_MANIFEST; return lock(f, () => verifyRollbackUnlocked({ ...o, manifestPath: f })) }

async function runCli({ args = process.argv.slice(2), env = process.env, client, clientFactory = createGoogleClient, logger = v => console.log(JSON.stringify(v)), manifestPath = DEFAULT_MANIFEST, allowInstitutionalDefault = true } = {}) {
  const mode = parseMode(args)
  if (mode === "--dry-run") return dryRun({ manifestPath, logger })
  if (mode === "--apply" && env.CALENDAR_CONTROLLED_TEST_CONFIRM !== APPLY_CONFIRMATION) throw controlledError("APPLY_CONFIRMATION_REQUIRED")
  if (mode === "--rollback" && env.CALENDAR_CONTROLLED_TEST_CONFIRM !== ROLLBACK_CONFIRMATION) throw controlledError("ROLLBACK_CONFIRMATION_REQUIRED")
  const calendarId = resolveInstitutionalCalendarId(env.ORACULUM_GOOGLE_CALENDAR_ID || env.GOOGLE_CALENDAR_ID, { allowDefault: allowInstitutionalDefault })
  const realClient = client || clientFactory({ clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET, refreshToken: env.GOOGLE_REFRESH_TOKEN })
  if (mode === "--preflight") return preflight({ client: realClient, calendarId, manifestPath, logger })
  if (mode === "--apply") return applyControlled({ client: realClient, calendarId, manifestPath, confirmation: env.CALENDAR_CONTROLLED_TEST_CONFIRM, logger })
  if (mode === "--verify") return verify({ client: realClient, calendarId, manifestPath, logger })
  if (mode === "--rollback") return rollback({ client: realClient, calendarId, manifestPath, confirmation: env.CALENDAR_CONTROLLED_TEST_CONFIRM, logger })
  return verifyRollback({ client: realClient, calendarId, manifestPath, logger })
}

if (require.main === module) runCli().catch(cause => {
  console.error(JSON.stringify({
    event: "calendar_controlled_test_failed",
    code: cause?.code || "CONTROLLED_TEST_FAILED",
    ...(Array.isArray(cause?.fields) ? { fields: cause.fields } : {})
  }))
  process.exitCode = 1
})

module.exports = { DEFAULT_MANIFEST, APPLY_CONFIRMATION, ROLLBACK_CONFIRMATION, TIMEZONE, buildPayload, markerParts, plannedWindow, writeManifestAtomic, readManifest, parseMode, restrictedClient, createGoogleClient, dryRun, preflight, applyControlled, verify, rollback, verifyRollback, runCli, sha256 }
