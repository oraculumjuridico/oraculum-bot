const assert = require("node:assert/strict")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "oraculum-callback-idempotency-"))
const tempFile = path.join(tempDir, "callback-idempotency.json")

process.env.CALLBACK_IDEMPOTENCY_FILE = tempFile
process.env.CALLBACK_IDEMPOTENCY_PROCESSING_TTL_MS = "1000"

delete require.cache[require.resolve("../src/domain/callback-idempotency")]
const {
  createCallbackKey,
  beginCallbackExecution,
  recoverCallbackIdempotencyAbandonedProcessing
} = require("../src/domain/callback-idempotency")

try {
  const key = createCallbackKey("lembrete", { eventId: "evt-1", tipo: "24h" })
  assert.equal(beginCallbackExecution(key, { route: "/lembrete" }).started, true)
  assert.equal(beginCallbackExecution(key, { route: "/lembrete" }).started, false)

  const store = JSON.parse(fs.readFileSync(tempFile, "utf8"))
  store.records[key].updatedAt = new Date(Date.now() - 60_000).toISOString()
  fs.writeFileSync(tempFile, JSON.stringify(store, null, 2), "utf8")

  assert.deepEqual(recoverCallbackIdempotencyAbandonedProcessing(), { recovered: 1 })
  assert.equal(beginCallbackExecution(key, { route: "/lembrete" }).started, true)

  console.log("callback-idempotency.test.js: ok")
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true })
}
