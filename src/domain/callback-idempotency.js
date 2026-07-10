const crypto = require("crypto")
const fs = require("fs")
const path = require("path")
const { mirrorStateFile } = require("../infrastructure/external-state-repository")

const SCHEMA_VERSION = 1
const DEFAULT_RETENTION_MS = 7 * 24 * 60 * 60 * 1000
const DEFAULT_PROCESSING_TTL_MS = 15 * 60 * 1000
const DATA_DIR = path.resolve(process.env.ORACULUM_DATA_DIR || path.join(__dirname, "..", "..", "data"))
const CALLBACK_IDEMPOTENCY_FILE = process.env.CALLBACK_IDEMPOTENCY_FILE ||
  path.join(DATA_DIR, "callback-idempotency.json")

function retentionMs() {
  const configured = Number(process.env.CALLBACK_IDEMPOTENCY_RETENTION_MS)
  return Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_RETENTION_MS
}

function processingTtlMs() {
  const configured = Number(process.env.CALLBACK_IDEMPOTENCY_PROCESSING_TTL_MS)
  return Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_PROCESSING_TTL_MS
}

function emptyStore() {
  return {
    schemaVersion: SCHEMA_VERSION,
    updatedAt: null,
    records: {}
  }
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue)
  if (value && typeof value === "object") {
    return Object.keys(value).sort().reduce((acc, key) => {
      acc[key] = stableValue(value[key] === undefined ? null : value[key])
      return acc
    }, {})
  }
  return value === undefined ? null : value
}

function createCallbackKey(route, payload = {}) {
  const normalizedRoute = String(route || "").trim().toLowerCase()
  const base = JSON.stringify({
    route: normalizedRoute,
    payload: stableValue(payload)
  })
  return `${normalizedRoute}:${crypto.createHash("sha256").update(base).digest("hex")}`
}

function writeJsonAtomic(file, payload) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const temporary = `${file}.${process.pid}.${Date.now()}.tmp`
  let descriptor = null
  try {
    descriptor = fs.openSync(temporary, "wx", 0o600)
    fs.writeFileSync(descriptor, JSON.stringify(payload, null, 2), "utf8")
    fs.fsyncSync(descriptor)
    fs.closeSync(descriptor)
    descriptor = null
    fs.renameSync(temporary, file)
    mirrorStateFile(file).catch(error => console.error(JSON.stringify({ event: "callback_external_mirror_failed", error: error.message })))
  } finally {
    if (descriptor !== null) {
      try { fs.closeSync(descriptor) } catch {}
    }
    if (fs.existsSync(temporary)) {
      try { fs.unlinkSync(temporary) } catch {}
    }
  }
}

function readStore() {
  if (!fs.existsSync(CALLBACK_IDEMPOTENCY_FILE)) return emptyStore()
  const parsed = JSON.parse(fs.readFileSync(CALLBACK_IDEMPOTENCY_FILE, "utf8"))
  if (parsed?.schemaVersion !== SCHEMA_VERSION) {
    throw new Error(`schema de callback idempotency incompativel: ${parsed?.schemaVersion}`)
  }
  return {
    ...emptyStore(),
    ...parsed,
    records: parsed.records && typeof parsed.records === "object" ? parsed.records : {}
  }
}

function removeExpired(store, nowMs = Date.now()) {
  let changed = false
  for (const [key, record] of Object.entries(store.records || {})) {
    if (Date.parse(record?.expiresAt || "") <= nowMs) {
      delete store.records[key]
      changed = true
    }
  }
  return changed
}

function recoverAbandonedProcessing(store, nowMs = Date.now()) {
  let recovered = 0
  const ttl = processingTtlMs()
  for (const [key, record] of Object.entries(store.records || {})) {
    if (record?.status !== "processing") continue
    const updatedAt = Date.parse(record.updatedAt || record.createdAt || "")
    if (!Number.isFinite(updatedAt)) continue
    if (updatedAt + ttl > nowMs) continue
    delete store.records[key]
    recovered += 1
  }
  return recovered
}

function recoverCallbackIdempotencyAbandonedProcessing(nowMs = Date.now()) {
  const store = readStore()
  const expired = removeExpired(store, nowMs)
  const recovered = recoverAbandonedProcessing(store, nowMs)
  if (expired || recovered > 0) {
    store.updatedAt = new Date(nowMs).toISOString()
    writeJsonAtomic(CALLBACK_IDEMPOTENCY_FILE, store)
  }
  return { recovered }
}

function beginCallbackExecution(key, metadata = {}) {
  if (!key) throw new Error("chave de idempotencia obrigatoria")
  const store = readStore()
  const cleaned = removeExpired(store)
  const recovered = recoverAbandonedProcessing(store)
  const existing = store.records[key]
  if (existing) {
    if (cleaned || recovered > 0) {
      store.updatedAt = new Date().toISOString()
      writeJsonAtomic(CALLBACK_IDEMPOTENCY_FILE, store)
    }
    return { started: false, record: existing }
  }

  const now = new Date()
  const record = {
    key,
    status: "processing",
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + retentionMs()).toISOString(),
    metadata: stableValue(metadata)
  }
  store.records[key] = record
  store.updatedAt = now.toISOString()
  writeJsonAtomic(CALLBACK_IDEMPOTENCY_FILE, store)
  return { started: true, record }
}

function completeCallbackExecution(key) {
  const store = readStore()
  removeExpired(store)
  const now = new Date()
  const record = store.records[key] || { key, createdAt: now.toISOString(), metadata: {} }
  record.status = "completed"
  record.completedAt = now.toISOString()
  record.updatedAt = now.toISOString()
  record.expiresAt = new Date(now.getTime() + retentionMs()).toISOString()
  store.records[key] = record
  store.updatedAt = now.toISOString()
  writeJsonAtomic(CALLBACK_IDEMPOTENCY_FILE, store)
  return record
}

function abandonCallbackExecution(key) {
  if (!key) return false
  const store = readStore()
  removeExpired(store)
  if (!store.records[key] || store.records[key].status !== "processing") return false
  delete store.records[key]
  store.updatedAt = new Date().toISOString()
  writeJsonAtomic(CALLBACK_IDEMPOTENCY_FILE, store)
  return true
}

module.exports = {
  CALLBACK_IDEMPOTENCY_FILE,
  createCallbackKey,
  beginCallbackExecution,
  completeCallbackExecution,
  abandonCallbackExecution,
  recoverCallbackIdempotencyAbandonedProcessing
}
