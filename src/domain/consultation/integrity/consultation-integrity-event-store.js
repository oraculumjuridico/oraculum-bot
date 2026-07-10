const crypto = require("node:crypto")
const fs = require("node:fs")
const path = require("node:path")
const { mirrorStateFile } = require("../../../infrastructure/external-state-repository")

const SCHEMA_VERSION = 3
const EVENT_TYPES = new Set([
  "consultation.integrity_drift_detected",
  "consultation.self_healed"
])
const INTEGRITY_EVENTS_FILE = process.env.CONSULTA_INTEGRITY_EVENTS_FILE ||
  path.join(path.resolve(process.env.ORACULUM_DATA_DIR || path.join(__dirname, "..", "..", "..", "..", "data")), "consultation-integrity-events.jsonl")
const LOCK_FILE = `${INTEGRITY_EVENTS_FILE}.lock`

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function acquireLock() {
  fs.mkdirSync(path.dirname(INTEGRITY_EVENTS_FILE), { recursive: true })
  for (let attempt = 0; attempt < 80; attempt++) {
    try {
      return fs.openSync(LOCK_FILE, "wx")
    } catch (error) {
      if (error.code !== "EEXIST") throw error
      await sleep(25)
    }
  }
  throw new Error("timeout ao adquirir lock do event store de integridade")
}

function hashIntegrityEvent(event) {
  const { eventHash, ...payload } = event
  return crypto.createHash("sha256").update(JSON.stringify(payload)).digest("hex")
}

function readIntegrityEvents() {
  if (!fs.existsSync(INTEGRITY_EVENTS_FILE)) return []
  const events = fs.readFileSync(INTEGRITY_EVENTS_FILE, "utf8")
    .split(/\r?\n/)
    .filter(Boolean)
    .map(line => JSON.parse(line))
  let previousEventHash = null
  for (const event of events) {
    if (
      event.schemaVersion !== SCHEMA_VERSION ||
      !EVENT_TYPES.has(event.type) ||
      event.previousEventHash !== previousEventHash ||
      event.eventHash !== hashIntegrityEvent(event)
    ) {
      const error = new Error("cadeia do event store de integridade corrompida")
      error.code = "CONSULTATION_INTEGRITY_EVENT_CHAIN_CORRUPTED"
      throw error
    }
    previousEventHash = event.eventHash
  }
  return events
}

async function appendIntegrityEvent({ type, timestamp, payload }) {
  if (!EVENT_TYPES.has(type)) throw new Error(`tipo de evento de integridade invalido: ${type}`)
  const lock = await acquireLock()
  try {
    const existing = readIntegrityEvents()
    const event = {
      schemaVersion: SCHEMA_VERSION,
      eventId: crypto.randomUUID(),
      sequence: existing.length + 1,
      type,
      timestamp: new Date(timestamp).toISOString(),
      payload,
      previousEventHash: existing.at(-1)?.eventHash || null,
      recordedAt: new Date().toISOString()
    }
    event.eventHash = hashIntegrityEvent(event)
    fs.appendFileSync(INTEGRITY_EVENTS_FILE, `${JSON.stringify(event)}\n`, "utf8")
    mirrorStateFile(INTEGRITY_EVENTS_FILE).catch(() => {})
    return event
  } finally {
    try { fs.closeSync(lock) } catch {}
    try { fs.unlinkSync(LOCK_FILE) } catch {}
  }
}

module.exports = {
  SCHEMA_VERSION,
  EVENT_TYPES,
  INTEGRITY_EVENTS_FILE,
  LOCK_FILE,
  hashIntegrityEvent,
  readIntegrityEvents,
  appendIntegrityEvent
}
