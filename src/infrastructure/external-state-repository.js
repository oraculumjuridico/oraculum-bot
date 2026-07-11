"use strict"

const fs = require("node:fs")
const fsp = require("node:fs/promises")
const path = require("node:path")
const crypto = require("node:crypto")
const { Pool } = require("pg")

const SCHEMA_VERSION = 1
const DEFAULT_FILES = [
  "users-state.json",
  "webhook-inbox.json",
  "admin-assisted-sessions.json",
  "callback-idempotency.json",
  "consulta-events.jsonl",
  "consultation-decisions.jsonl",
  "consultation-integrity-events.jsonl"
]

let pool = null
let dataDir = null
let enabled = false
let required = false
let queue = Promise.resolve()
let lastSuccessAt = null
let lastError = null
let pendingWrites = 0
let restoredFiles = 0

function boolEnv(name, fallback = false) {
  const value = String(process.env[name] ?? "").trim().toLowerCase()
  if (!value) return fallback
  return ["1", "true", "yes", "sim"].includes(value)
}

function isCiSmokeTest() {
  return process.env.NODE_ENV === "test" && boolEnv("CI") && boolEnv("CI_SMOKE_TEST")
}

function configuredFiles() {
  const extra = String(process.env.EXTERNAL_STATE_FILES || "").split(",").map(v => v.trim()).filter(Boolean)
  return [...new Set([...DEFAULT_FILES, ...extra])]
}

function safeFileName(file) {
  const name = path.basename(String(file || ""))
  if (!name || (!name.endsWith(".json") && !name.endsWith(".jsonl"))) throw new Error("arquivo de estado externo invalido")
  return name
}

function checksum(content) {
  return crypto.createHash("sha256").update(content).digest("hex")
}

function createPool(connectionString) {
  return new Pool({
    connectionString,
    max: Math.max(1, Math.min(3, Number(process.env.EXTERNAL_STATE_POOL_MAX || 2))),
    connectionTimeoutMillis: Math.max(3000, Number(process.env.EXTERNAL_STATE_CONNECT_TIMEOUT_MS || 10000)),
    idleTimeoutMillis: 30000,
    keepAlive: true,
    ssl: boolEnv("EXTERNAL_STATE_SSL", true) ? { rejectUnauthorized: false } : false
  })
}

async function ensureSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS oraculum_state_documents (
      namespace VARCHAR(128) PRIMARY KEY,
      schema_version INTEGER NOT NULL,
      format VARCHAR(16) NOT NULL CHECK (format IN ('json', 'jsonl')),
      content TEXT NOT NULL,
      checksum VARCHAR(64) NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS oraculum_state_migrations (
      migration_id VARCHAR(128) PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      details TEXT NOT NULL
    )
  `)
}

async function atomicLocalWrite(file, content) {
  await fsp.mkdir(path.dirname(file), { recursive: true })
  const temporary = `${file}.${process.pid}.${Date.now()}.remote.tmp`
  await fsp.writeFile(temporary, content, { encoding: "utf8", mode: 0o600 })
  await fsp.rename(temporary, file)
}

async function hydrateLocalCache() {
  const response = await pool.query(
    "SELECT namespace, format, content, checksum FROM oraculum_state_documents WHERE namespace = ANY($1::text[])",
    [configuredFiles()]
  )
  let restored = 0
  for (const row of response.rows) {
    if (checksum(row.content) !== row.checksum) throw new Error(`checksum remoto invalido: ${row.namespace}`)
    if (row.format === "json") JSON.parse(row.content)
    await atomicLocalWrite(path.join(dataDir, safeFileName(row.namespace)), row.content)
    restored += 1
  }
  restoredFiles = restored
  return restored
}

async function initializeExternalStateRepository({ directory, hydrate = true } = {}) {
  dataDir = path.resolve(directory || process.env.ORACULUM_DATA_DIR || path.join(process.cwd(), "data"))
  const provider = String(process.env.EXTERNAL_STATE_PROVIDER || "").trim().toLowerCase()
  const connectionString = process.env.EXTERNAL_STATE_DATABASE_URL || process.env.DATABASE_URL || ""
  enabled = provider === "postgres" || provider === "neon" || Boolean(connectionString)
  const requiredByConfiguration = boolEnv("EXTERNAL_STATE_REQUIRED", process.env.NODE_ENV === "production")
  required = requiredByConfiguration && !isCiSmokeTest()
  if (!enabled) {
    if (required) throw new Error("persistencia externa obrigatoria mas nao configurada")
    return { enabled: false, required, restoredFiles: 0 }
  }
  if (!connectionString) throw new Error("EXTERNAL_STATE_DATABASE_URL ausente")
  pool = createPool(connectionString)
  try {
    await ensureSchema()
    if (hydrate) await hydrateLocalCache()
    lastSuccessAt = new Date().toISOString()
    lastError = null
    return { enabled: true, required, restoredFiles: hydrate ? restoredFiles : 0 }
  } catch (error) {
    lastError = error.message
    await pool.end().catch(() => {})
    pool = null
    if (required || !boolEnv("EXTERNAL_STATE_ALLOW_EPHEMERAL_FALLBACK", false)) throw error
    enabled = false
    return { enabled: false, required, fallback: true, error: error.message, restoredFiles: 0 }
  }
}

async function upsertContent(namespace, format, content) {
  if (!pool) return false
  if (format === "json") JSON.parse(content)
  await pool.query(`
    INSERT INTO oraculum_state_documents(namespace, schema_version, format, content, checksum, updated_at)
    VALUES($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
    ON CONFLICT(namespace) DO UPDATE SET
      schema_version = EXCLUDED.schema_version,
      format = EXCLUDED.format,
      content = EXCLUDED.content,
      checksum = EXCLUDED.checksum,
      updated_at = CURRENT_TIMESTAMP
  `, [namespace, SCHEMA_VERSION, format, content, checksum(content)])
  lastSuccessAt = new Date().toISOString()
  lastError = null
  return true
}

function enqueue(task) {
  if (!enabled || !pool) return Promise.resolve(false)
  pendingWrites += 1
  const operation = queue.then(task)
  queue = operation.catch(error => {
    lastError = error.message
    if (required) console.error(JSON.stringify({ event: "external_state_write_failed", error: error.message }))
  }).finally(() => { pendingWrites -= 1 })
  return operation
}

function mirrorStateFile(file, content = null) {
  const namespace = safeFileName(file)
  const format = namespace.endsWith(".jsonl") ? "jsonl" : "json"
  return enqueue(async () => {
    const current = content === null ? await fsp.readFile(file, "utf8") : String(content)
    return upsertContent(namespace, format, current)
  })
}

async function flushExternalState({ throwOnError = required } = {}) {
  await queue
  if (throwOnError && lastError) throw new Error(`persistencia externa indisponivel: ${lastError}`)
  return { pendingWrites, lastSuccessAt, lastError }
}

async function migrateLocalState({ force = false } = {}) {
  if (!pool) throw new Error("repositorio externo nao inicializado")
  const migrationId = `json-files-v${SCHEMA_VERSION}`
  const prior = await pool.query("SELECT migration_id FROM oraculum_state_migrations WHERE migration_id=$1", [migrationId])
  if (prior.rowCount && !force) return { migrated: 0, skipped: true, migrationId }
  let migrated = 0
  const details = []
  for (const name of configuredFiles()) {
    const file = path.join(dataDir, safeFileName(name))
    if (!fs.existsSync(file)) continue
    const content = await fsp.readFile(file, "utf8")
    if (!content.trim()) continue
    const format = name.endsWith(".jsonl") ? "jsonl" : "json"
    await upsertContent(name, format, content)
    migrated += 1
    details.push({ namespace: name, bytes: Buffer.byteLength(content), checksum: checksum(content) })
  }
  await pool.query(`
    INSERT INTO oraculum_state_migrations(migration_id, details, applied_at)
    VALUES($1, $2, CURRENT_TIMESTAMP)
    ON CONFLICT(migration_id) DO UPDATE SET details=EXCLUDED.details, applied_at=CURRENT_TIMESTAMP
  `, [migrationId, JSON.stringify(details)])
  return { migrated, skipped: false, migrationId, details }
}

async function externalStateHealth({ probe = false } = {}) {
  let database = enabled && pool ? "configured" : "disabled"
  let databaseBytes = null
  let freePlanUsagePercent = null
  if (probe && pool) {
    try {
      await pool.query("SELECT 1")
      const size = await pool.query("SELECT pg_database_size(current_database()) AS bytes")
      databaseBytes = Number(size.rows?.[0]?.bytes || 0)
      freePlanUsagePercent = Number(((databaseBytes / (500 * 1024 * 1024)) * 100).toFixed(2))
      database = "ok"; lastSuccessAt = new Date().toISOString(); lastError = null
    }
    catch (error) { database = "error"; lastError = error.message }
  }
  return { provider: enabled ? "postgres" : "local-ephemeral", enabled, required, database, databaseBytes, freePlanUsagePercent, restoredFiles, pendingWrites, lastSuccessAt, lastError: lastError ? "present" : null }
}

async function closeExternalStateRepository() {
  await flushExternalState({ throwOnError: false })
  if (pool) await pool.end()
  pool = null
}

module.exports = {
  DEFAULT_FILES,
  configuredFiles,
  initializeExternalStateRepository,
  mirrorStateFile,
  flushExternalState,
  migrateLocalState,
  externalStateHealth,
  closeExternalStateRepository
}
