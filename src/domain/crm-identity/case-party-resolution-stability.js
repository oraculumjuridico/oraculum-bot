const crypto = require("node:crypto")

const CONTEXT_FINGERPRINT_VERSION = 1

function canonicalize(value, seen = new WeakSet()) {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) return value
  if (typeof value === "number") return Number.isFinite(value) ? value : String(value)
  if (value instanceof Date) return value.toISOString()
  if (Array.isArray(value)) return value.map(item => canonicalize(item, seen))
  if (!value || typeof value !== "object") return undefined
  if (seen.has(value)) return "[Circular]"
  seen.add(value)
  const normalized = {}
  for (const key of Object.keys(value).sort()) {
    const child = canonicalize(value[key], seen)
    if (child !== undefined) normalized[key] = child
  }
  seen.delete(value)
  return normalized
}

function stableSerialize(value) {
  return JSON.stringify(canonicalize(value))
}

function describeRoleRegistry(roleRegistry) {
  return [...(roleRegistry?.roles || [])]
    .map(role => ({
      role,
      priority: roleRegistry.priority(role)
    }))
    .sort((left, right) => left.role.localeCompare(right.role))
}

function describeContextResolver(contextResolver) {
  if (Array.isArray(contextResolver?.strategies)) {
    return {
      type: "multi",
      strategies: contextResolver.strategies
        .map(strategy => ({
          name: strategy.name,
          priority: strategy.priority,
          version: strategy.version || "1"
        }))
        .sort((left, right) =>
          left.name.localeCompare(right.name) ||
          left.priority - right.priority ||
          left.version.localeCompare(right.version)
        )
    }
  }
  return {
    type: "single",
    rules: (contextResolver?.rules || [])
      .map(rule => rule.ruleName || rule.name || "anonymousRule")
  }
}

function contextFingerprintPayload({
  contact,
  caseContext,
  roleRegistry,
  contextResolver,
  auditEnabled = false
}) {
  return {
    fingerprintVersion: CONTEXT_FINGERPRINT_VERSION,
    contact: canonicalize(contact),
    caseContext: canonicalize(caseContext),
    roleRegistry: describeRoleRegistry(roleRegistry),
    contextResolver: describeContextResolver(contextResolver),
    auditEnabled: auditEnabled === true
  }
}

function createContextFingerprint(input, secret) {
  if (!secret) throw new Error("segredo efemero obrigatorio para fingerprint")
  return crypto
    .createHmac("sha256", secret)
    .update(stableSerialize(contextFingerprintPayload(input)))
    .digest("hex")
}

function cloneResolution(resolution) {
  return JSON.parse(JSON.stringify(resolution))
}

function createResolutionStabilityCache({
  maxEntries = 500,
  ttlMs = 15 * 60 * 1000,
  clock = () => Date.now(),
  secret = crypto.randomBytes(32)
} = {}) {
  const maximum = Math.max(1, Number(maxEntries) || 500)
  const ttl = Math.max(1, Number(ttlMs) || 15 * 60 * 1000)
  const entries = new Map()

  function removeExpired() {
    const now = clock()
    for (const [key, entry] of entries) {
      if (entry.expiresAt <= now) entries.delete(key)
    }
  }

  function trim() {
    while (entries.size > maximum) {
      entries.delete(entries.keys().next().value)
    }
  }

  return Object.freeze({
    fingerprint(input) {
      return createContextFingerprint(input, secret)
    },
    get(key) {
      const entry = entries.get(key)
      if (!entry) return null
      if (entry.expiresAt <= clock()) {
        entries.delete(key)
        return null
      }
      entries.delete(key)
      entries.set(key, entry)
      return cloneResolution(entry.resolution)
    },
    set(key, resolution) {
      entries.delete(key)
      entries.set(key, {
        expiresAt: clock() + ttl,
        resolution: cloneResolution(resolution)
      })
      trim()
    },
    clear() {
      entries.clear()
    },
    prune() {
      removeExpired()
      return entries.size
    },
    get size() {
      removeExpired()
      return entries.size
    }
  })
}

const DEFAULT_RESOLUTION_STABILITY_CACHE = createResolutionStabilityCache()

function stabilityEnabled(stabilityMode) {
  return stabilityMode === true || stabilityMode?.enabled === true
}

function resolveStableDecision({
  stabilityMode,
  fingerprintInput,
  resolve
}) {
  if (!stabilityEnabled(stabilityMode)) {
    return {
      resolution: resolve(),
      stability: null
    }
  }
  const cache = stabilityMode?.cache || DEFAULT_RESOLUTION_STABILITY_CACHE
  let fingerprint
  let cached
  try {
    fingerprint = cache.fingerprint(fingerprintInput)
    cached = cache.get(fingerprint)
  } catch {
    return {
      resolution: resolve(),
      stability: {
        fingerprint: null,
        cacheHit: false,
        degraded: true
      }
    }
  }
  if (cached) {
    return {
      resolution: cached,
      stability: { fingerprint, cacheHit: true }
    }
  }
  const resolution = resolve()
  try {
    cache.set(fingerprint, resolution)
  } catch {
    return {
      resolution,
      stability: {
        fingerprint,
        cacheHit: false,
        degraded: true
      }
    }
  }
  return {
    resolution,
    stability: { fingerprint, cacheHit: false }
  }
}

module.exports = {
  CONTEXT_FINGERPRINT_VERSION,
  canonicalize,
  stableSerialize,
  describeRoleRegistry,
  describeContextResolver,
  contextFingerprintPayload,
  createContextFingerprint,
  createResolutionStabilityCache,
  DEFAULT_RESOLUTION_STABILITY_CACHE,
  stabilityEnabled,
  resolveStableDecision
}
