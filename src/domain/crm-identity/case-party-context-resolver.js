const {
  ATTRIBUTION_SOURCES,
  ATTRIBUTION_CONFIDENCE
} = require("./case-party")
const {
  DEFAULT_CASE_PARTY_ROLE_REGISTRY
} = require("./case-party-role-registry")

function confidenceLabel(score) {
  if (score >= 0.85) return ATTRIBUTION_CONFIDENCE.HIGH
  if (score >= 0.55) return ATTRIBUTION_CONFIDENCE.MEDIUM
  return ATTRIBUTION_CONFIDENCE.LOW
}

function attribution({
  role,
  score,
  classificationSource,
  evidence = [],
  source = ATTRIBUTION_SOURCES.DERIVED
}) {
  return {
    role,
    source,
    confidence: confidenceLabel(score),
    confidenceScore: score,
    classificationSource,
    evidence
  }
}

function explicitRoleRule(context) {
  const inputs = [
    ...(context.caseContext.explicitRoles || context.caseContext.roleHints || []),
    ...(context.caseContext.metadata?.casePartyRoles || [])
  ]
  return inputs.flatMap(item => {
    const definition = typeof item === "string" ? { role: item } : item || {}
    if (
      definition.contactId &&
      definition.contactId !== context.contact.contactId
    ) return []
    const role = context.roleRegistry.resolve(definition.role)
    if (!role) return []
    return [attribution({
      role,
      score: definition.confidenceScore ?? 1,
      source: ATTRIBUTION_SOURCES.EXPLICIT,
      classificationSource: definition.classificationSource || "CASE_METADATA_EXPLICIT_ROLE",
      evidence: ["case_party.explicit_role", ...(definition.evidence || [])]
    })]
  })
}

function legacyRoleHintRule(context) {
  const hint = context.state.papelContato
  const role = context.roleRegistry.resolve(hint)
  if (!role) return []
  return [attribution({
    role,
    score: 0.7,
    classificationSource: "LEGACY_ROLE_HINT",
    evidence: [`legacy.papelContato:${context.normalizeRoleToken(hint)}`]
  })]
}

function relationshipHintRule(context) {
  const hints = context.caseContext.relationshipHints || []
  return (Array.isArray(hints) ? hints : [hints]).flatMap(hint => {
    if (!hint || typeof hint !== "object") return []
    if (hint.contactId && hint.contactId !== context.contact.contactId) return []
    const role = context.roleRegistry.resolve(hint.role)
    if (!role) return []
    const score = Number.isFinite(Number(hint.confidenceScore))
      ? Number(hint.confidenceScore)
      : 0.75
    return [attribution({
      role,
      score,
      source: hint.explicit === true
        ? ATTRIBUTION_SOURCES.EXPLICIT
        : ATTRIBUTION_SOURCES.DERIVED,
      classificationSource: hint.classificationSource || "RELATIONSHIP_HINT",
      evidence: [
        "case.relationship_hint",
        ...(hint.evidence || [])
      ]
    })]
  })
}

function assistedPartyRule(context) {
  if (
    !context.matches.assistedContact &&
    !context.matches.assistedPhone &&
    context.state.telefoneEhDoCliente !== true
  ) return []
  const score = context.matches.assistedContact
    ? 0.98
    : context.matches.assistedPhone
      ? 0.9
      : 0.72
  const role = context.roleRegistry.resolve("ASSISTED_PERSON")
  if (!role) return []
  return [attribution({
    role,
    score,
    classificationSource: context.matches.assistedContact
      ? "CASE_CONTACT_MATCH"
      : context.matches.assistedPhone
        ? "CASE_ENDPOINT_MATCH"
        : "LEGACY_OWNERSHIP_FLAG",
    evidence: [
      ...(context.matches.assistedContact ? ["legacy.assisted_contact_match"] : []),
      ...(context.matches.assistedPhone ? ["legacy.assisted_phone_match"] : []),
      ...(context.state.telefoneEhDoCliente === true
        ? ["legacy.telefoneEhDoCliente:true"]
        : [])
    ]
  })]
}

function requesterRule(context) {
  if (!context.matches.actorContact && !context.matches.actorPhone) return []
  const role = context.roleRegistry.resolve("REQUESTER")
  if (!role) return []
  return [attribution({
    role,
    score: context.matches.actorContact ? 0.96 : 0.85,
    classificationSource: context.matches.actorContact
      ? "CONVERSATION_ACTOR_CONTACT_MATCH"
      : "CONVERSATION_ACTOR_ENDPOINT_MATCH",
    evidence: [
      ...(context.matches.actorContact ? ["legacy.actor_contact_match"] : []),
      ...(context.matches.actorPhone ? ["legacy.actor_phone_match"] : [])
    ]
  })]
}

function simpleCaseAssistedRule(context) {
  if (
    context.thirdParty ||
    context.state.atendimentoParaTerceiro !== false ||
    context.existingRoles.has("ASSISTED_PERSON")
  ) return []
  const role = context.roleRegistry.resolve("ASSISTED_PERSON")
  if (!role) return []
  return [attribution({
    role,
    score: 0.65,
    classificationSource: "LEGACY_SIMPLE_CASE_CONTEXT",
    evidence: ["legacy.atendimentoParaTerceiro:false"]
  })]
}

const DEFAULT_CONTEXT_RULES = Object.freeze([
  explicitRoleRule,
  legacyRoleHintRule,
  relationshipHintRule,
  assistedPartyRule,
  requesterRule,
  simpleCaseAssistedRule
])

function createCasePartyContextResolver({
  rules = DEFAULT_CONTEXT_RULES
} = {}) {
  const configuredRules = [...rules]
  if (configuredRules.some(rule => typeof rule !== "function")) {
    throw new Error("regras de resolucao de Case Party devem ser funcoes")
  }
  function execute(context, traceEnabled = false) {
    const attributions = []
    const existingRoles = new Set()
    const appliedRules = []
    for (const rule of configuredRules) {
      const produced = rule({ ...context, existingRoles }) || []
      const accepted = []
      for (const item of produced) {
        const resolvedRole = context.roleRegistry.resolve(item.role)
        if (!resolvedRole) continue
        attributions.push({ ...item, role: resolvedRole })
        accepted.push(resolvedRole)
        existingRoles.add(resolvedRole)
      }
      if (traceEnabled) {
        appliedRules.push({
          rule: rule.ruleName || rule.name || "anonymousRule",
          matched: accepted.length > 0,
          producedRoles: accepted
        })
      }
    }
    return { attributions, appliedRules }
  }

  return Object.freeze({
    rules: Object.freeze(configuredRules),
    resolve(context) {
      return execute(context, false).attributions
    },
    resolveWithTrace(context) {
      return execute(context, true)
    },
    extend(additionalRules = []) {
      return createCasePartyContextResolver({
        rules: [...configuredRules, ...additionalRules]
      })
    }
  })
}

const DEFAULT_CASE_PARTY_CONTEXT_RESOLVER = createCasePartyContextResolver()

function resolveCasePartyContext({
  contact,
  state,
  caseContext,
  matches,
  thirdParty,
  normalizeRoleToken,
  roleRegistry = DEFAULT_CASE_PARTY_ROLE_REGISTRY,
  resolver = DEFAULT_CASE_PARTY_CONTEXT_RESOLVER
}) {
  return resolver.resolve({
    contact,
    state,
    caseContext,
    matches,
    thirdParty,
    normalizeRoleToken,
    roleRegistry
  })
}

function resolveCasePartyContextWithTrace({
  contact,
  state,
  caseContext,
  matches,
  thirdParty,
  normalizeRoleToken,
  roleRegistry = DEFAULT_CASE_PARTY_ROLE_REGISTRY,
  resolver = DEFAULT_CASE_PARTY_CONTEXT_RESOLVER
}) {
  const context = {
    contact,
    state,
    caseContext,
    matches,
    thirdParty,
    normalizeRoleToken,
    roleRegistry
  }
  if (typeof resolver.resolveWithTrace === "function") {
    return resolver.resolveWithTrace(context)
  }
  return {
    attributions: resolver.resolve(context),
    appliedRules: [],
    appliedResolvers: []
  }
}

module.exports = {
  confidenceLabel,
  attribution,
  explicitRoleRule,
  legacyRoleHintRule,
  relationshipHintRule,
  assistedPartyRule,
  requesterRule,
  simpleCaseAssistedRule,
  DEFAULT_CONTEXT_RULES,
  createCasePartyContextResolver,
  DEFAULT_CASE_PARTY_CONTEXT_RESOLVER,
  resolveCasePartyContext,
  resolveCasePartyContextWithTrace
}
