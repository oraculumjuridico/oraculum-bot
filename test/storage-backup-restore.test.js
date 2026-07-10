const assert = require("node:assert/strict")
const crypto = require("node:crypto")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")
const {
  createBackup,
  restoreBackup,
  verifySnapshot
} = require("../scripts/storage-snapshot")

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, JSON.stringify(value, null, 2))
}

function hashTree(root) {
  const result = {}
  const visit = current => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const absolute = path.join(current, entry.name)
      if (entry.isDirectory()) visit(absolute)
      if (entry.isFile()) {
        const relative = path.relative(root, absolute).replaceAll("\\", "/")
        result[relative] = crypto.createHash("sha256").update(fs.readFileSync(absolute)).digest("hex")
      }
    }
  }
  visit(root)
  return result
}

function main() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "oraculum-storage-restore-"))
  const data = path.join(root, "data")
  const backups = path.join(root, "external-backups")
  const restored = path.join(root, "restored-data")

  try {
    writeJson(path.join(data, "users-state.json"), {
      savedAt: "2026-07-03T12:00:00.000Z",
      users: { "5581999999999": { stage: "MENU" } }
    })
    writeJson(path.join(data, "webhook-inbox.json"), {
      version: 1,
      records: {
        "wamid.pending": {
          status: "pending",
          payload: { message: { id: "wamid.pending" } }
        }
      },
      receipts: {
        "wamid.completed": {
          status: "completed",
          messageId: "wamid.completed"
        }
      }
    })
    fs.writeFileSync(
      path.join(data, "consulta-events.jsonl"),
      `${JSON.stringify({ type: "consulta.scheduled", id: "event-1" })}\n`
    )
    fs.writeFileSync(
      path.join(data, "consultation-decisions.jsonl"),
      `${JSON.stringify({ decisionId: "decision-1" })}\n`
    )
    fs.writeFileSync(
      path.join(data, "consultation-integrity-events.jsonl"),
      `${JSON.stringify({ type: "consultation.self_healed", id: "integrity-1" })}\n`
    )
    fs.writeFileSync(path.join(data, "ignored.lock"), "lock")
    fs.writeFileSync(path.join(data, "ignored.tmp"), "temporary")

    const original = hashTree(data)
    delete original["ignored.lock"]
    delete original["ignored.tmp"]

    const snapshot = createBackup({ source: data, destination: backups })
    const manifest = verifySnapshot(snapshot)
    assert.equal(manifest.files.length, 5)
    assert.equal(manifest.files.some(file => file.path.endsWith(".lock")), false)
    assert.equal(manifest.files.some(file => file.path.endsWith(".tmp")), false)

    fs.rmSync(data, { recursive: true, force: true })
    assert.equal(fs.existsSync(data), false)

    assert.throws(
      () => restoreBackup({ snapshot, target: restored }),
      /--confirm-restore/
    )
    restoreBackup({ snapshot, target: restored, confirmed: true })
    assert.deepEqual(hashTree(restored), original)

    const inbox = JSON.parse(
      fs.readFileSync(path.join(restored, "webhook-inbox.json"), "utf8")
    )
    assert.equal(inbox.records["wamid.pending"].status, "pending")
    assert.equal(inbox.receipts["wamid.completed"].status, "completed")

    fs.appendFileSync(path.join(snapshot, "users-state.json"), "\ncorrompido")
    assert.throws(() => verifySnapshot(snapshot), /Unexpected non-whitespace|checksum mismatch/)
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
  console.log("storage-backup-restore.test.js: ok")
}

main()
