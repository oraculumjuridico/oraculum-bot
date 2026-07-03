const fs = require("node:fs")
const path = require("node:path")

const INTEGRITY_EVENTS_FILE = process.env.CONSULTA_INTEGRITY_EVENTS_FILE ||
  path.join(__dirname, "..", "data", "consultation-integrity-events.jsonl")
const DRIFT_EVENT = "consultation.integrity_drift_detected"
const SELF_HEALED_EVENT = "consultation.self_healed"
const OBSERVED_EVENT_TYPES = new Set([DRIFT_EVENT, SELF_HEALED_EVENT])

function readIntegrityEventsReadOnly(file = INTEGRITY_EVENTS_FILE) {
  if (!fs.existsSync(file)) return []
  return fs.readFileSync(file, "utf8")
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line, index) => {
      let event
      try {
        event = JSON.parse(line)
      } catch {
        const error = new Error(`evento de integridade invalido na linha ${index + 1}`)
        error.code = "CONSULTATION_INTEGRITY_METRICS_INVALID_JSON"
        throw error
      }
      if (!event || typeof event !== "object") {
        const error = new Error(`evento de integridade invalido na linha ${index + 1}`)
        error.code = "CONSULTATION_INTEGRITY_METRICS_INVALID_EVENT"
        throw error
      }
      return event
    })
}

function increment(counter, key) {
  const normalized = String(key || "UNKNOWN")
  counter[normalized] = (counter[normalized] || 0) + 1
}

function eventOccurrence(event) {
  return event.type === DRIFT_EVENT
    ? event.payload?.detectedAt || event.timestamp
    : event.payload?.repairedAt || event.timestamp
}

function aggregateIntegrityMetrics(events = []) {
  const observed = events
    .filter(event => OBSERVED_EVENT_TYPES.has(event?.type))
    .map(event => ({ event, occurrence: eventOccurrence(event) }))
    .sort((left, right) =>
      String(left.occurrence || "").localeCompare(String(right.occurrence || ""))
    )
  const driftsByType = {}
  const repairsByStrategy = {}
  let totalDrifts = 0
  let totalSelfHealings = 0

  for (const { event } of observed) {
    if (event.type === DRIFT_EVENT) {
      totalDrifts += 1
      increment(driftsByType, event.payload?.driftType)
    }
    if (event.type === SELF_HEALED_EVENT) {
      totalSelfHealings += 1
      increment(repairsByStrategy, event.payload?.repairStrategy)
    }
  }

  return {
    totalDrifts,
    totalSelfHealings,
    driftsByType,
    repairsByStrategy,
    firstOccurrence: observed[0]?.occurrence || null,
    lastOccurrence: observed.at(-1)?.occurrence || null
  }
}

function getConsultationIntegrityMetrics({
  file = INTEGRITY_EVENTS_FILE
} = {}) {
  return aggregateIntegrityMetrics(readIntegrityEventsReadOnly(file))
}

if (require.main === module) {
  try {
    process.stdout.write(`${JSON.stringify(getConsultationIntegrityMetrics(), null, 2)}\n`)
  } catch (error) {
    process.stderr.write(`${JSON.stringify({
      error: error.message,
      code: error.code || null
    })}\n`)
    process.exitCode = 1
  }
}

module.exports = {
  INTEGRITY_EVENTS_FILE,
  DRIFT_EVENT,
  SELF_HEALED_EVENT,
  readIntegrityEventsReadOnly,
  aggregateIntegrityMetrics,
  getConsultationIntegrityMetrics
}
