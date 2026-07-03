const {
  DEFAULT_CASE_PARTY_ROLE_REGISTRY
} = require("./case-party-role-registry")

const CASE_PARTY_SCHEMA_VERSION = 1

const CASE_PARTY_ROLES = Object.freeze({
  ASSISTED_PERSON: "ASSISTED_PERSON",
  REQUESTER: "REQUESTER",
  REPRESENTATIVE: "REPRESENTATIVE",
  CLIENT: "CLIENT",
  FINANCIAL_RESPONSIBLE: "FINANCIAL_RESPONSIBLE",
  AUTHORIZED_CONTACT: "AUTHORIZED_CONTACT",
  INTERESTED_THIRD_PARTY: "INTERESTED_THIRD_PARTY"
})

const ATTRIBUTION_SOURCES = Object.freeze({
  EXPLICIT: "EXPLICIT",
  DERIVED: "DERIVED"
})

const ATTRIBUTION_CONFIDENCE = Object.freeze({
  HIGH: "HIGH",
  MEDIUM: "MEDIUM",
  LOW: "LOW"
})

const CASE_PARTY_STATUS = Object.freeze({
  CLASSIFIED: "CLASSIFIED",
  UNCLASSIFIED: "UNCLASSIFIED"
})
const UNCLASSIFIED_ROLE = "UNCLASSIFIED"
const CONFIDENCE_SCORES = Object.freeze({
  [ATTRIBUTION_CONFIDENCE.HIGH]: 0.95,
  [ATTRIBUTION_CONFIDENCE.MEDIUM]: 0.7,
  [ATTRIBUTION_CONFIDENCE.LOW]: 0.4
})

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value
  for (const child of Object.values(value)) deepFreeze(child)
  return Object.freeze(value)
}

function normalizeEvidence(evidence = []) {
  return [...new Set(
    (Array.isArray(evidence) ? evidence : [evidence])
      .map(item => String(item || "").trim())
      .filter(Boolean)
  )].sort()
}

function createRoleAttribution({
  role,
  source = ATTRIBUTION_SOURCES.DERIVED,
  confidence = ATTRIBUTION_CONFIDENCE.MEDIUM,
  confidenceScore = null,
  classificationSource = null,
  evidence = [],
  roleRegistry = DEFAULT_CASE_PARTY_ROLE_REGISTRY
}) {
  const resolvedRole = roleRegistry.resolve(role)
  if (!resolvedRole) {
    throw new Error(`papel de Case Party invalido: ${role || "-"}`)
  }
  if (!Object.values(ATTRIBUTION_SOURCES).includes(source)) {
    throw new Error(`origem de atribuicao invalida: ${source || "-"}`)
  }
  if (!Object.values(ATTRIBUTION_CONFIDENCE).includes(confidence)) {
    throw new Error(`confianca de atribuicao invalida: ${confidence || "-"}`)
  }
  const score = confidenceScore === null || confidenceScore === undefined
    ? CONFIDENCE_SCORES[confidence]
    : Number(confidenceScore)
  if (!Number.isFinite(score) || score < 0 || score > 1) {
    throw new Error(`score de confianca invalido: ${confidenceScore}`)
  }
  return deepFreeze({
    role: resolvedRole,
    source,
    confidence,
    confidenceScore: score,
    classificationSource: String(
      classificationSource ||
      (source === ATTRIBUTION_SOURCES.EXPLICIT ? "EXPLICIT_ROLE" : "DERIVED_CONTEXT")
    ),
    evidence: normalizeEvidence(evidence)
  })
}

function mergeRoleAttributions(
  attributions = [],
  roleRegistry = DEFAULT_CASE_PARTY_ROLE_REGISTRY
) {
  const byRole = new Map()
  const priority = {
    [ATTRIBUTION_CONFIDENCE.LOW]: 1,
    [ATTRIBUTION_CONFIDENCE.MEDIUM]: 2,
    [ATTRIBUTION_CONFIDENCE.HIGH]: 3
  }
  for (const attribution of attributions) {
    const normalized = createRoleAttribution({ ...attribution, roleRegistry })
    const existing = byRole.get(normalized.role)
    if (!existing) {
      byRole.set(normalized.role, normalized)
      continue
    }
    const preferred = (
      normalized.source === ATTRIBUTION_SOURCES.EXPLICIT &&
      existing.source !== ATTRIBUTION_SOURCES.EXPLICIT
    ) || (
      normalized.source === existing.source &&
      priority[normalized.confidence] > priority[existing.confidence]
    )
      ? normalized
      : existing
    byRole.set(normalized.role, createRoleAttribution({
      ...preferred,
      confidenceScore: Math.max(existing.confidenceScore, normalized.confidenceScore),
      evidence: [...existing.evidence, ...normalized.evidence],
      roleRegistry
    }))
  }
  return [...byRole.values()].sort((left, right) =>
    right.confidenceScore - left.confidenceScore ||
    roleRegistry.priority(right.role) - roleRegistry.priority(left.role) ||
    left.role.localeCompare(right.role)
  )
}

function createCaseParty({
  caseId,
  contactId,
  roleAttributions = [],
  relationship = null,
  roleRegistry = DEFAULT_CASE_PARTY_ROLE_REGISTRY
}) {
  const normalizedCaseId = String(caseId || "").trim()
  const normalizedContactId = String(contactId || "").trim()
  if (!normalizedCaseId) throw new Error("caseId obrigatorio para Case Party")
  if (!normalizedContactId) throw new Error("contactId obrigatorio para Case Party legado")

  const roles = mergeRoleAttributions(roleAttributions, roleRegistry)
  const primary = roles[0] || null
  return deepFreeze({
    schemaVersion: CASE_PARTY_SCHEMA_VERSION,
    kind: "CaseParty",
    caseId: normalizedCaseId,
    contactRef: {
      type: "HUBSPOT_CONTACT",
      contactId: normalizedContactId
    },
    status: roles.length
      ? CASE_PARTY_STATUS.CLASSIFIED
      : CASE_PARTY_STATUS.UNCLASSIFIED,
    role: primary?.role || UNCLASSIFIED_ROLE,
    confidenceScore: primary?.confidenceScore ?? 0,
    classificationSource: primary?.classificationSource || "NO_SAFE_CLASSIFICATION",
    roles,
    relationship: relationship
      ? {
          declaredType: String(relationship.declaredType || "").trim() || null,
          source: String(relationship.source || "").trim() || null
        }
      : null
  })
}

function hasCasePartyRole(caseParty, role) {
  return Boolean(caseParty?.roles?.some(item => item.role === role))
}

module.exports = {
  CASE_PARTY_SCHEMA_VERSION,
  CASE_PARTY_ROLES,
  ATTRIBUTION_SOURCES,
  ATTRIBUTION_CONFIDENCE,
  CASE_PARTY_STATUS,
  UNCLASSIFIED_ROLE,
  CONFIDENCE_SCORES,
  deepFreeze,
  normalizeEvidence,
  createRoleAttribution,
  mergeRoleAttributions,
  createCaseParty,
  hasCasePartyRole
}
