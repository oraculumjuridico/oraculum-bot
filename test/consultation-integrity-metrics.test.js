const assert = require("node:assert/strict")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")
const {
  aggregateIntegrityMetrics,
  getConsultationIntegrityMetrics
} = require("../scripts/consultation-integrity-metrics")

const events = [
  {
    type: "consultation.self_healed",
    timestamp: "2026-06-03T10:05:00.000Z",
    payload: {
      repairedAt: "2026-06-03T10:05:00.000Z",
      repairStrategy: "REFRESH_SESSION_PROJECTION"
    }
  },
  {
    type: "consultation.integrity_drift_detected",
    timestamp: "2026-06-01T10:00:00.000Z",
    payload: {
      detectedAt: "2026-06-01T10:00:00.000Z",
      driftType: "READ_MODEL_OUTDATED"
    }
  },
  {
    type: "consultation.integrity_drift_detected",
    timestamp: "2026-06-03T10:00:00.000Z",
    payload: {
      detectedAt: "2026-06-03T10:00:00.000Z",
      driftType: "READ_MODEL_OUTDATED"
    }
  },
  {
    type: "consultation.integrity_drift_detected",
    timestamp: "2026-06-02T10:00:00.000Z",
    payload: {
      detectedAt: "2026-06-02T10:00:00.000Z",
      driftType: "CALENDAR_PROJECTION_DRIFT"
    }
  },
  {
    type: "evento.nao_observado",
    timestamp: "2026-01-01T00:00:00.000Z",
    payload: {}
  }
]

assert.deepEqual(aggregateIntegrityMetrics(events), {
  totalDrifts: 3,
  totalSelfHealings: 1,
  driftsByType: {
    READ_MODEL_OUTDATED: 2,
    CALENDAR_PROJECTION_DRIFT: 1
  },
  repairsByStrategy: {
    REFRESH_SESSION_PROJECTION: 1
  },
  firstOccurrence: "2026-06-01T10:00:00.000Z",
  lastOccurrence: "2026-06-03T10:05:00.000Z"
})

const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "consulta-integrity-metrics-"))
const missingFile = path.join(temporaryDirectory, "missing.jsonl")
assert.deepEqual(getConsultationIntegrityMetrics({ file: missingFile }), {
  totalDrifts: 0,
  totalSelfHealings: 0,
  driftsByType: {},
  repairsByStrategy: {},
  firstOccurrence: null,
  lastOccurrence: null
})

const eventFile = path.join(temporaryDirectory, "events.jsonl")
fs.writeFileSync(eventFile, events.map(JSON.stringify).join("\n") + "\n")
assert.equal(getConsultationIntegrityMetrics({ file: eventFile }).totalDrifts, 3)

const invalidFile = path.join(temporaryDirectory, "invalid.jsonl")
fs.writeFileSync(invalidFile, "{invalid}\n")
assert.throws(
  () => getConsultationIntegrityMetrics({ file: invalidFile }),
  error => error.code === "CONSULTATION_INTEGRITY_METRICS_INVALID_JSON"
)

fs.rmSync(temporaryDirectory, { recursive: true, force: true })
console.log("consultation-integrity-metrics: ok")
