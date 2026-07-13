"use strict"

const assert = require("node:assert/strict")
const fsp = require("node:fs/promises")
const os = require("node:os")
const path = require("node:path")
const {
  APPLY_CONFIRMATION, ROLLBACK_CONFIRMATION, TIMEZONE, buildPayload, markerParts,
  writeManifestAtomic, readManifest, restrictedClient, createGoogleClient,
  dryRun, preflight, applyControlled, verify, rollback, verifyRollback, runCli
} = require("../scripts/calendar-controlled-test")

const UUID = "11111111-2222-4333-8444-555555555555"
const CALENDAR = "fixture-calendar"

class FakeCalendar {
  constructor(options = {}) { this.options = options; this.calls = []; this.event = null }
  async request(input) {
    this.calls.push(structuredClone(input))
    if (input.operation === "calendarGet") return { id: CALENDAR, timeZone: this.options.timezone || TIMEZONE, accessRole: this.options.accessRole || "owner", primary: false, deleted: Boolean(this.options.deleted) }
    if (input.operation === "eventsList") {
      if (this.options.partial) return { items: [], nextPageToken: "more" }
      if (this.options.duplicate && input.privateExtendedProperty) return { items: [{ id: "existing" }] }
      if (this.options.conflict && !input.privateExtendedProperty) return { items: [{ id: "conflict" }] }
      return { items: [] }
    }
    if (input.operation === "eventsInsert") {
      this.event = { id: "controlled-event-id", status: "confirmed", ...structuredClone(input.requestBody) }
      if (this.options.failInsertResponse) throw Object.assign(new Error("private"), { code: "INSERT_FAILED" })
      return structuredClone(this.event)
    }
    if (input.operation === "eventsGet") {
      if (this.options.failGetAfterInsert && this.event) throw Object.assign(new Error("private"), { code: "GET_AFTER_INSERT_FAILED" })
      if (this.options.notFound || !this.event) throw Object.assign(new Error("private"), { code: this.options.gone ? "GOOGLE_410_FAILED" : "GOOGLE_404_FAILED" })
      return structuredClone(this.event)
    }
    if (input.operation === "eventsDelete") { this.event = null; this.options.notFound = true; return {} }
    throw new Error(`unexpected ${input.operation}`)
  }
}

async function realManifest(dir, client = new FakeCalendar()) {
  const file = path.join(dir, `${Math.random()}.json`)
  await dryRun({ manifestPath: file, now: new Date("2027-01-01T12:00:00.000Z"), uuid: () => UUID })
  await preflight({ client, calendarId: CALENDAR, manifestPath: file })
  return { file, client }
}

async function appliedManifest(dir, client = new FakeCalendar()) {
  const ctx = await realManifest(dir, client)
  await applyControlled({ client, calendarId: CALENDAR, manifestPath: ctx.file, confirmation: APPLY_CONFIRMATION })
  return ctx
}

async function main() {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), "calendar-controlled-test-"))
  try {
    const defaultFile = path.join(dir, "default.json")
    let envRead = false; let factoryCalled = false
    const env = new Proxy({}, { get() { envRead = true; throw new Error("env forbidden") } })
    const initial = await runCli({ args: [], env, manifestPath: defaultFile, clientFactory: () => { factoryCalled = true }, logger: () => {} })
    assert.equal(initial.status.dryRun, "completed"); assert.equal(initial.eventId, null); assert.equal(envRead, false); assert.equal(factoryCalled, false)
    await assert.rejects(runCli({ args: ["--aply"], manifestPath: path.join(dir, "typo") }), e => e.code === "UNKNOWN_ARGUMENT")
    await assert.rejects(runCli({ args: ["--dry-run", "--verify"], manifestPath: path.join(dir, "multi") }), e => e.code === "MULTIPLE_MODES_NOT_ALLOWED")
    await assert.rejects(dryRun({ manifestPath: defaultFile }), e => e.code === "MANIFEST_ALREADY_EXISTS")

    const payload = buildPayload(initial.marker, initial.timestamps.plannedStartAt, initial.timestamps.plannedEndAt)
    assert.equal(payload.summary, initial.marker); assert.equal(markerParts(initial.marker).uuid.length, 36)
    assert.equal(Object.hasOwn(payload, "attendees"), false); assert.equal(Object.hasOwn(payload, "conferenceData"), false)
    assert.equal(Object.hasOwn(payload, "attachments"), false)
    assert.deepEqual(payload.reminders, { useDefault: false, overrides: [] })
    assert.doesNotMatch(JSON.stringify(payload), /dealId|contactId|personId|cpf|telefone|email|numero.?caso|hubspot|users-state/i)

    const concurrentFile = path.join(dir, "concurrent.json")
    const both = await Promise.allSettled([dryRun({ manifestPath: concurrentFile, now: new Date("2027-01-01"), uuid: () => UUID }), dryRun({ manifestPath: concurrentFile, now: new Date("2027-01-01"), uuid: () => UUID })])
    assert.equal(both.filter(x => x.status === "fulfilled").length, 1); assert.equal(both.filter(x => x.reason?.code === "MANIFEST_LOCKED").length, 1)

    for (const [options, code] of [[{ deleted: true }, "CALENDAR_DELETED"], [{ timezone: "UTC" }, "CALENDAR_TIMEZONE_DIVERGENT"], [{ accessRole: "reader" }, "SHARED_CALENDAR_REVIEW_REQUIRED"], [{ partial: true }, "EVENTS_LIST_RESPONSE_PARTIAL"], [{ duplicate: true }, "PREFLIGHT_CARDINALITY_NOT_ZERO"], [{ conflict: true }, "EVENT_WINDOW_CONFLICT"]]) {
      const file = path.join(dir, `${code}.json`); await dryRun({ manifestPath: file, now: new Date("2027-01-01"), uuid: () => UUID }); const client = new FakeCalendar(options)
      await assert.rejects(preflight({ client, calendarId: CALENDAR, manifestPath: file }), e => e.code === code)
      assert.equal(client.calls.some(c => ["eventsInsert", "eventsDelete"].includes(c.operation)), false)
    }

    const confirmation = await realManifest(dir)
    for (const value of ["", APPLY_CONFIRMATION.toLowerCase(), `${APPLY_CONFIRMATION} `]) {
      let initialized = false
      await assert.rejects(runCli({ args: ["--apply"], env: { CALENDAR_CONTROLLED_TEST_CONFIRM: value }, manifestPath: confirmation.file, clientFactory: () => { initialized = true } }), e => e.code === "APPLY_CONFIRMATION_REQUIRED")
      assert.equal(initialized, false)
    }

    const applied = await appliedManifest(dir)
    assert.equal(applied.client.calls.filter(c => c.operation === "eventsInsert").length, 1)
    const insert = applied.client.calls.find(c => c.operation === "eventsInsert")
    assert.equal(insert.sendUpdates, "none"); assert.equal(Object.hasOwn(insert.requestBody, "attendees"), false); assert.equal(Object.hasOwn(insert.requestBody, "conferenceData"), false)
    assert.equal(applied.client.calls.some(c => c.operation === "eventsPatch"), false)
    assert.equal((await readManifest(applied.file)).eventId, "controlled-event-id")

    const failedAfterInsertClient = new FakeCalendar({ failGetAfterInsert: true })
    const failedAfterInsert = await realManifest(dir, failedAfterInsertClient)
    await assert.rejects(applyControlled({ client: failedAfterInsertClient, calendarId: CALENDAR, manifestPath: failedAfterInsert.file, confirmation: APPLY_CONFIRMATION }), e => e.code === "GET_AFTER_INSERT_FAILED")
    const failedAfterInsertManifest = await readManifest(failedAfterInsert.file)
    assert.equal(failedAfterInsertManifest.eventId, "controlled-event-id")
    assert.equal(failedAfterInsertManifest.status.apply, "event_created_validation_required")
    assert.equal(failedAfterInsertManifest.status.rollback, "pending")

    const failValidation = await appliedManifest(dir)
    failValidation.client.event.summary = "divergent"
    await assert.rejects(verify({ client: failValidation.client, calendarId: CALENDAR, manifestPath: failValidation.file }), e => e.code === "CONTROLLED_EVENT_VALIDATION_FAILED")
    assert.equal((await readManifest(failValidation.file)).status.verify, "pending")

    assert.equal((await readManifest(applied.file)).status.verify, "pending")
    await verify({ client: applied.client, calendarId: CALENDAR, manifestPath: applied.file })
    assert.equal((await readManifest(applied.file)).status.verify, "completed")
    assert.equal(applied.client.calls.filter(c => c.operation === "eventsGet").length > 0, true)

    const dryRollback = path.join(dir, "dry-rollback.json"); await dryRun({ manifestPath: dryRollback, now: new Date("2027-01-01"), uuid: () => UUID })
    await assert.rejects(rollback({ client: new FakeCalendar(), calendarId: CALENDAR, manifestPath: dryRollback, confirmation: ROLLBACK_CONFIRMATION }), e => e.code === "ROLLBACK_VERIFIED_APPLY_REQUIRED")
    for (const value of ["", ROLLBACK_CONFIRMATION.toLowerCase(), `${ROLLBACK_CONFIRMATION} `]) {
      let initialized = false
      await assert.rejects(runCli({ args: ["--rollback"], env: { CALENDAR_CONTROLLED_TEST_CONFIRM: value }, manifestPath: applied.file, clientFactory: () => { initialized = true } }), e => e.code === "ROLLBACK_CONFIRMATION_REQUIRED")
      assert.equal(initialized, false)
    }

    const divergent = await appliedManifest(dir); await verify({ client: divergent.client, calendarId: CALENDAR, manifestPath: divergent.file }); divergent.client.event.description = "bad"
    await assert.rejects(rollback({ client: divergent.client, calendarId: CALENDAR, manifestPath: divergent.file, confirmation: ROLLBACK_CONFIRMATION }), e => e.code === "CONTROLLED_EVENT_VALIDATION_FAILED")
    assert.equal(divergent.client.calls.some(c => c.operation === "eventsDelete"), false)

    const idDivergent = await appliedManifest(dir); await verify({ client: idDivergent.client, calendarId: CALENDAR, manifestPath: idDivergent.file }); idDivergent.client.event.id = "different-event-id"
    await assert.rejects(rollback({ client: idDivergent.client, calendarId: CALENDAR, manifestPath: idDivergent.file, confirmation: ROLLBACK_CONFIRMATION }), e => e.code === "CONTROLLED_EVENT_VALIDATION_FAILED")
    assert.equal(idDivergent.client.calls.some(c => c.operation === "eventsDelete"), false)

    const hashDivergent = await appliedManifest(dir); await verify({ client: hashDivergent.client, calendarId: CALENDAR, manifestPath: hashDivergent.file }); const hashManifest = await readManifest(hashDivergent.file); hashManifest.payloadHash = "0".repeat(64); await writeManifestAtomic(hashDivergent.file, hashManifest)
    await assert.rejects(rollback({ client: hashDivergent.client, calendarId: CALENDAR, manifestPath: hashDivergent.file, confirmation: ROLLBACK_CONFIRMATION }), e => e.code === "CONTROLLED_EVENT_VALIDATION_FAILED")
    assert.equal(hashDivergent.client.calls.some(c => c.operation === "eventsDelete"), false)

    await rollback({ client: applied.client, calendarId: CALENDAR, manifestPath: applied.file, confirmation: ROLLBACK_CONFIRMATION })
    const deletes = applied.client.calls.filter(c => c.operation === "eventsDelete")
    assert.equal(deletes.length, 1); assert.equal(deletes[0].eventId, "controlled-event-id"); assert.equal(deletes[0].sendUpdates, "none")
    await verifyRollback({ client: applied.client, calendarId: CALENDAR, manifestPath: applied.file })
    assert.equal((await readManifest(applied.file)).status.verifyRollback, "completed")

    const cancelled = await appliedManifest(dir); await verify({ client: cancelled.client, calendarId: CALENDAR, manifestPath: cancelled.file }); await rollback({ client: cancelled.client, calendarId: CALENDAR, manifestPath: cancelled.file, confirmation: ROLLBACK_CONFIRMATION }); cancelled.client.options.notFound = false; cancelled.client.event = { id: "controlled-event-id", status: "cancelled", ...buildPayload((await readManifest(cancelled.file)).marker, (await readManifest(cancelled.file)).timestamps.plannedStartAt, (await readManifest(cancelled.file)).timestamps.plannedEndAt) }
    await verifyRollback({ client: cancelled.client, calendarId: CALENDAR, manifestPath: cancelled.file })

    const genericFailure = await appliedManifest(dir); await verify({ client: genericFailure.client, calendarId: CALENDAR, manifestPath: genericFailure.file }); await rollback({ client: genericFailure.client, calendarId: CALENDAR, manifestPath: genericFailure.file, confirmation: ROLLBACK_CONFIRMATION }); genericFailure.client.options.notFound = false; genericFailure.client.request = async () => { throw Object.assign(new Error("private"), { code: "NOT_FOUND" }) }
    await assert.rejects(verifyRollback({ client: genericFailure.client, calendarId: CALENDAR, manifestPath: genericFailure.file }), e => e.code === "NOT_FOUND")

    const logs = []
    const logFile = path.join(dir, "log-calendar.json"); await dryRun({ manifestPath: logFile, now: new Date("2027-01-01"), uuid: () => UUID }); await preflight({ client: new FakeCalendar(), calendarId: CALENDAR, manifestPath: logFile, logger: item => logs.push(JSON.stringify(item)) })
    assert.equal(logs.join(" ").includes(CALENDAR), false)
    const loggedManifest = await readManifest(logFile); assert.notEqual(loggedManifest.calendarIdHash, null); assert.notEqual(loggedManifest.calendarIdHash, CALENDAR)

    assert.throws(() => restrictedClient(new FakeCalendar(), "--verify").request({ operation: "eventsInsert", sendUpdates: "none" }), e => e.code === "GOOGLE_OPERATION_NOT_ALLOWED")
    assert.throws(() => restrictedClient(new FakeCalendar(), "--rollback").request({ operation: "eventsDelete", sendUpdates: "all" }), e => e.code === "SEND_UPDATES_UNSAFE")

    for (const status of [401, 403, 404, 429, 500]) {
      let attempts = 0; let options
      const googleModule = { auth: { OAuth2: class { setCredentials() {} } }, calendar: () => ({ calendarList: { get: async (_r, o) => { attempts++; options = o; const e = new Error("private title"); e.response = { status, data: { secret: true } }; throw e } }, events: {} }) }
      const client = createGoogleClient({ clientId: "id", clientSecret: "secret", refreshToken: "refresh", googleModule, timeoutMs: 1234 })
      await assert.rejects(client.request({ operation: "calendarGet", calendarId: CALENDAR }), e => e.code === `GOOGLE_${status}_FAILED` && !e.message.includes("private"))
      assert.equal(attempts, status === 429 || status >= 500 ? 3 : 1); assert.equal(options.timeout, 1234)
    }

    const atomic = path.join(dir, "atomic", "manifest.json"); await writeManifestAtomic(atomic, { marker: initial.marker }); assert.equal((await fsp.readdir(path.dirname(atomic))).some(n => n.endsWith(".tmp")), false)
    const source = await fsp.readFile(path.join(__dirname, "..", "scripts", "calendar-controlled-test.js"), "utf8")
    assert.doesNotMatch(source, /require\([^\n]*(server|calendar-scheduling|consultation|hubspot|users-state)/i)
    assert.doesNotMatch(source, /events\.patch|batch/i)
    console.log("calendar-controlled-test.test.js: ok")
  } finally { await fsp.rm(dir, { recursive: true, force: true }) }
}

main().catch(e => { console.error(e); process.exitCode = 1 })
