const assert = require("node:assert/strict")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")
const {
  collectOperationalBaseline
} = require("../scripts/collect-consultation-operational-baseline")

const temp = fs.mkdtempSync(path.join(os.tmpdir(), "consulta-baseline-"))
const integrityFile = path.join(temp, "integrity.jsonl")
const logFile = path.join(temp, "runtime.log")
const since = new Date("2026-06-01T00:00:00.000Z")
const until = new Date("2026-07-01T00:00:00.000Z")

const records = [
  {
    type: "consultation.integrity_drift_detected",
    timestamp: "2026-06-10T10:00:00.000Z",
    payload: {
      consultationId: "deal-1",
      detectedAt: "2026-06-10T10:00:00.000Z"
    }
  },
  {
    type: "consultation.self_healed",
    timestamp: "2026-06-10T10:02:00.000Z",
    payload: {
      consultationId: "deal-1",
      repairedAt: "2026-06-10T10:02:00.000Z"
    }
  }
]
fs.writeFileSync(integrityFile, records.map(JSON.stringify).join("\n") + "\n")
fs.writeFileSync(logFile, [
  "2026-06-11T10:00:00.000Z [ERRO] [HUBSPOT] falha sync",
  "2026-06-12T10:00:00.000Z [ERRO] [CALENDAR] falha listagem",
  "2026-05-01T10:00:00.000Z [ERRO] [CALENDAR] fora da janela"
].join("\n"))

const result = collectOperationalBaseline({
  auditReport: {
    escopo: { deals: 4 },
    totais: { criticos: 1, medios: 2, aceitaveis: 3 }
  },
  integrityFile,
  logFiles: [logFile],
  since,
  until
})

assert.equal(result.mode, "READ_ONLY_OBSERVATION")
assert.deepEqual(result.metrics, {
  consultationsAudited: 4,
  auditFindings: 6,
  driftsDetected: 1,
  selfHealingsExecuted: 1,
  hubspotSyncFailures: 1,
  calendarFailures: 1,
  averageRecoveryMs: 120000,
  integrityEventsRecorded: 2
})
assert.equal(result.evidence.recoveryPairs, 1)

const unavailable = collectOperationalBaseline({
  integrityFile: path.join(temp, "missing.jsonl"),
  since,
  until
})
assert.equal(unavailable.metrics.consultationsAudited, null)
assert.equal(unavailable.metrics.hubspotSyncFailures, null)
assert.equal(unavailable.metrics.calendarFailures, null)
assert.equal(unavailable.metrics.averageRecoveryMs, null)
assert.ok(unavailable.limitations.includes("integrity_store_not_found"))

fs.rmSync(temp, { recursive: true, force: true })
console.log("consultation-operational-baseline: ok")
