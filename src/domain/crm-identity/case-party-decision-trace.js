const DECISION_TRACE_SCHEMA_VERSION = 1
const traces = new WeakMap()

function deepClone(value) {
  if (value === undefined) return undefined
  return JSON.parse(JSON.stringify(value))
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value
  for (const child of Object.values(value)) deepFreeze(child)
  return Object.freeze(value)
}

function auditEnabled(auditMode) {
  return auditMode === true || auditMode?.enabled === true
}

function countItems(value) {
  if (!value) return 0
  return Array.isArray(value) ? value.length : 1
}

function sanitizeInputContext(resolutionContext = {}) {
  const state = resolutionContext.state || {}
  const caseContext = resolutionContext.caseContext || {}
  return {
    caseId: String(
      caseContext.caseId ||
      caseContext.dealId ||
      caseContext.negocioId ||
      caseContext.id ||
      caseContext.numeroCaso ||
      ""
    ),
    contactId: String(resolutionContext.contact?.contactId || ""),
    signals: {
      thirdParty: resolutionContext.thirdParty === true,
      phoneOwnershipFlag: typeof state.telefoneEhDoCliente === "boolean"
        ? state.telefoneEhDoCliente
        : null,
      hasDeclaredRelationship: Boolean(state.relacaoComAtendido),
      hasLegacyRoleHint: Boolean(state.papelContato),
      explicitRoleCount: countItems(
        caseContext.explicitRoles || caseContext.roleHints
      ),
      metadataRoleCount: countItems(caseContext.metadata?.casePartyRoles),
      relationshipHintCount: countItems(caseContext.relationshipHints)
    },
    matches: {
      assistedContact: resolutionContext.matches?.assistedContact === true,
      assistedEndpoint: resolutionContext.matches?.assistedPhone === true,
      actorContact: resolutionContext.matches?.actorContact === true,
      actorEndpoint: resolutionContext.matches?.actorPhone === true
    }
  }
}

function createDecisionTrace({
  caseParty,
  resolutionContext,
  appliedRules = [],
  appliedResolvers = [],
  stability = null
}) {
  return deepFreeze({
    schemaVersion: DECISION_TRACE_SCHEMA_VERSION,
    available: true,
    inputContext: sanitizeInputContext(resolutionContext),
    decision: {
      status: caseParty.status,
      role: caseParty.role,
      confidenceScore: caseParty.confidenceScore,
      classificationSource: caseParty.classificationSource
    },
    stability: stability
      ? {
          fingerprint: stability.fingerprint || null,
          cacheHit: stability.cacheHit === true,
          degraded: stability.degraded === true
        }
      : null,
    appliedRules: appliedRules.map(item => ({
      rule: String(item.rule || "anonymousRule"),
      matched: item.matched === true,
      producedRoles: [...new Set(item.producedRoles || [])].sort()
    })),
    appliedResolvers: appliedResolvers.map(item => ({
      resolver: String(item.resolver || "anonymousResolver"),
      priority: Number.isFinite(Number(item.priority)) ? Number(item.priority) : 0,
      producedRoles: [...new Set(item.producedRoles || [])].sort()
    }))
  })
}

function attachDecisionTrace(caseParty, trace, auditMode = true) {
  if (!auditEnabled(auditMode)) return caseParty
  traces.set(caseParty, trace)
  if (typeof auditMode?.onTrace === "function") {
    try {
      auditMode.onTrace(trace, caseParty)
    } catch {
      // Observabilidade nunca interfere na classificacao operacional.
    }
  }
  return caseParty
}

function explainCaseParty(caseParty) {
  const trace = caseParty && typeof caseParty === "object"
    ? traces.get(caseParty)
    : null
  if (!trace) {
    return deepFreeze({
      schemaVersion: DECISION_TRACE_SCHEMA_VERSION,
      available: false,
      reason: "AUDIT_MODE_DISABLED_OR_TRACE_NOT_AVAILABLE"
    })
  }
  return deepFreeze(deepClone(trace))
}

function hasCasePartyDecisionTrace(caseParty) {
  return Boolean(caseParty && typeof caseParty === "object" && traces.has(caseParty))
}

module.exports = {
  DECISION_TRACE_SCHEMA_VERSION,
  auditEnabled,
  sanitizeInputContext,
  createDecisionTrace,
  attachDecisionTrace,
  explainCaseParty,
  hasCasePartyDecisionTrace
}
