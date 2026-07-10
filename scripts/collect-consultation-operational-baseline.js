require("dotenv").config({ quiet: true })

const fs = require("node:fs")
const path = require("node:path")

const ROOT = path.join(__dirname, "..")
const DEFAULT_INTEGRITY_FILE = path.join(ROOT, "data", "consultation-integrity-events.jsonl")

function readJsonLines(file) {
  if (!fs.existsSync(file)) return { exists: false, records: [] }
  const records = fs.readFileSync(file, "utf8")
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line, index) => {
      try {
        return JSON.parse(line)
      } catch {
        return { _invalid: true, line: index + 1 }
      }
    })
  return { exists: true, records }
}

function withinWindow(value, since, until) {
  const timestamp = new Date(value).getTime()
  return Number.isFinite(timestamp) &&
    timestamp >= since.getTime() &&
    timestamp <= until.getTime()
}

function recoveryDurations(events) {
  const pendingByConsultation = new Map()
  const durations = []
  for (const event of [...events].sort((a, b) =>
    String(a.timestamp || "").localeCompare(String(b.timestamp || ""))
  )) {
    const consultationId = String(event.payload?.consultationId || "")
    if (!consultationId) continue
    if (event.type === "consultation.integrity_drift_detected") {
      const queue = pendingByConsultation.get(consultationId) || []
      queue.push(new Date(event.payload?.detectedAt || event.timestamp).getTime())
      pendingByConsultation.set(consultationId, queue)
    }
    if (event.type === "consultation.self_healed") {
      const queue = pendingByConsultation.get(consultationId) || []
      const started = queue.shift()
      const finished = new Date(event.payload?.repairedAt || event.timestamp).getTime()
      if (Number.isFinite(started) && Number.isFinite(finished) && finished >= started) {
        durations.push(finished - started)
      }
    }
  }
  return durations
}

function scanFailures(logFiles, since, until) {
  const result = {
    filesConfigured: logFiles.length,
    filesRead: 0,
    hubspot: 0,
    calendar: 0
  }
  const timestampPattern = /(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z)/
  for (const file of logFiles) {
    if (!fs.existsSync(file)) continue
    result.filesRead += 1
    for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
      if (!/\b(?:erro|error|falha|failed)\b/i.test(line)) continue
      const timestamp = line.match(timestampPattern)?.[1]
      if (!timestamp || !withinWindow(timestamp, since, until)) continue
      if (/hubspot/i.test(line)) result.hubspot += 1
      if (/calendar/i.test(line)) result.calendar += 1
    }
  }
  return result
}

function collectOperationalBaseline({
  auditReport = null,
  integrityFile = DEFAULT_INTEGRITY_FILE,
  logFiles = [],
  since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
  until = new Date()
} = {}) {
  const integritySource = readJsonLines(integrityFile)
  const integrityEvents = integritySource.records.filter(event =>
    !event._invalid && withinWindow(event.timestamp, since, until)
  )
  const drifts = integrityEvents.filter(event =>
    event.type === "consultation.integrity_drift_detected"
  )
  const selfHealings = integrityEvents.filter(event =>
    event.type === "consultation.self_healed"
  )
  const durations = recoveryDurations(integrityEvents)
  const failures = scanFailures(logFiles, since, until)
  const logsAvailable = failures.filesRead > 0

  return {
    generatedAt: new Date().toISOString(),
    mode: "READ_ONLY_OBSERVATION",
    window: {
      since: since.toISOString(),
      until: until.toISOString()
    },
    metrics: {
      consultationsAudited: auditReport?.escopo?.deals ?? null,
      auditFindings: auditReport?.totais
        ? Object.values(auditReport.totais).reduce((sum, value) => sum + Number(value || 0), 0)
        : null,
      driftsDetected: drifts.length,
      selfHealingsExecuted: selfHealings.length,
      hubspotSyncFailures: logsAvailable ? failures.hubspot : null,
      calendarFailures: logsAvailable ? failures.calendar : null,
      averageRecoveryMs: durations.length
        ? Math.round(durations.reduce((sum, value) => sum + value, 0) / durations.length)
        : null,
      integrityEventsRecorded: integrityEvents.length
    },
    evidence: {
      auditReportAvailable: Boolean(auditReport),
      integrityStoreAvailable: integritySource.exists,
      invalidIntegrityRecords: integritySource.records.filter(item => item._invalid).length,
      configuredLogFiles: failures.filesConfigured,
      readableLogFiles: failures.filesRead,
      recoveryPairs: durations.length
    },
    limitations: [
      ...(!auditReport ? ["consultations_audited_unavailable_without_live_audit"] : []),
      ...(!integritySource.exists ? ["integrity_store_not_found"] : []),
      ...(!logsAvailable ? ["persistent_logs_not_available"] : []),
      ...(!durations.length ? ["recovery_duration_not_measurable"] : [])
    ]
  }
}

function configuredLogFiles() {
  return String(process.env.CONSULTATION_LOG_FILES || "")
    .split(",")
    .map(item => item.trim())
    .filter(Boolean)
    .map(file => path.resolve(ROOT, file))
}

async function main() {
  const live = process.argv.includes("--live")
  let auditReport = null
  if (live) {
    const { executarAuditoriaReadOnly } = require("./audit-consulta-phase1")
    auditReport = await executarAuditoriaReadOnly()
  }
  console.log(JSON.stringify(collectOperationalBaseline({
    auditReport,
    logFiles: configuredLogFiles()
  }), null, 2))
}

if (require.main === module) {
  main().catch(error => {
    console.error(JSON.stringify({
      mode: "READ_ONLY_OBSERVATION",
      error: error.message
    }))
    process.exitCode = 1
  })
}

module.exports = {
  DEFAULT_INTEGRITY_FILE,
  readJsonLines,
  recoveryDurations,
  scanFailures,
  collectOperationalBaseline
}
