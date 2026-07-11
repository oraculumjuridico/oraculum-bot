const assert = require("node:assert/strict")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")
const { spawnSync } = require("node:child_process")

const directory = fs.mkdtempSync(path.join(os.tmpdir(), "oraculum-migration-dry-run-"))
try {
  fs.writeFileSync(path.join(directory, "users-state.json"), "{}")
  fs.writeFileSync(path.join(directory, "audit-extra.json"), "{}")
  fs.writeFileSync(path.join(directory, "consulta-events.jsonl"), "{}\n")
  const result = spawnSync(process.execPath, [path.join(__dirname, "..", "scripts", "migrate-state-to-postgres.js"), "--dry-run"], {
    encoding: "utf8",
    env: { ...process.env, ORACULUM_DATA_DIR: directory, EXTERNAL_STATE_FILES: "" }
  })
  assert.equal(result.status, 0, result.stderr)
  const report = JSON.parse(result.stdout)
  assert.deepEqual(report.files.map(file => file.namespace).sort(), ["consulta-events.jsonl", "users-state.json"])
  assert.equal(report.files.some(file => file.namespace === "audit-extra.json"), false)
} finally {
  fs.rmSync(directory, { recursive: true, force: true })
}
console.log("migrate-state-dry-run.test.js: ok")
