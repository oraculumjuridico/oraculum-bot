const crypto = require("node:crypto")

const TRANSIENT_FIELDS = new Set([
  "generatedAt",
  "replayedAt",
  "loadedAt",
  "syncedAt",
  "lastCheckedAt",
  "requestId",
  "traceId"
])

function isTransientField(key) {
  return TRANSIENT_FIELDS.has(key) || key.startsWith("_runtime")
}

function canonicalizeConsultationState(value) {
  if (value === null || ["string", "number", "boolean"].includes(typeof value)) return value
  if (value instanceof Date) return value.toISOString()
  if (Array.isArray(value)) {
    return value
      .map(canonicalizeConsultationState)
      .filter(item => item !== undefined)
  }
  if (typeof value !== "object") return undefined

  return Object.keys(value)
    .filter(key => !isTransientField(key))
    .sort()
    .reduce((result, key) => {
      const normalized = canonicalizeConsultationState(value[key])
      if (normalized !== undefined) result[key] = normalized
      return result
    }, {})
}

function hashConsultationState(state) {
  const canonical = canonicalizeConsultationState(state)
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(canonical))
    .digest("hex")
}

function generateIntegritySnapshot({
  readModelState,
  replayState,
  calendarProjection,
  generatedAt = new Date().toISOString()
}) {
  return {
    generatedAt: new Date(generatedAt).toISOString(),
    readModelHash: hashConsultationState(readModelState),
    replayHash: hashConsultationState(replayState),
    calendarHash: hashConsultationState(calendarProjection)
  }
}

module.exports = {
  TRANSIENT_FIELDS,
  canonicalizeConsultationState,
  hashConsultationState,
  generateIntegritySnapshot
}
