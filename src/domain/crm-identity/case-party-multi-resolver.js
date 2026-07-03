const {
  ATTRIBUTION_SOURCES,
  ATTRIBUTION_CONFIDENCE
} = require("./case-party")
const {
  createCasePartyContextResolver,
  explicitRoleRule,
  legacyRoleHintRule,
  relationshipHintRule,
  assistedPartyRule,
  requesterRule,
  simpleCaseAssistedRule
} = require("./case-party-context-resolver")

function createResolverStrategy({
  name,
  priority = 0,
  version = 1,
  supports = () => true,
  resolver
}) {
  const normalizedName = String(name || "").trim()
  if (!normalizedName) throw new Error("nome obrigatorio para estrategia de resolucao")
  if (typeof supports !== "function") throw new Error("supports deve ser funcao")
  if (
    typeof resolver !== "function" &&
    typeof resolver?.resolve !== "function"
  ) {
    throw new Error(`resolver invalido para estrategia: ${normalizedName}`)
  }
  return Object.freeze({
    name: normalizedName,
    priority: Number.isFinite(Number(priority)) ? Number(priority) : 0,
    version: String(version || "1"),
    supports,
    resolver
  })
}

function selectResolverStrategies(strategies, context) {
  return strategies
    .filter(strategy => strategy.supports(context) === true)
    .sort((left, right) =>
      right.priority - left.priority ||
      left.name.localeCompare(right.name)
    )
}

function confidenceRank(confidence) {
  return {
    [ATTRIBUTION_CONFIDENCE.HIGH]: 3,
    [ATTRIBUTION_CONFIDENCE.MEDIUM]: 2,
    [ATTRIBUTION_CONFIDENCE.LOW]: 1
  }[confidence] || 0
}

function sourceRank(source) {
  return source === ATTRIBUTION_SOURCES.EXPLICIT ? 2 : 1
}

function compareCandidates(left, right) {
  return sourceRank(right.attribution.source) - sourceRank(left.attribution.source) ||
    Number(right.attribution.confidenceScore || 0) -
      Number(left.attribution.confidenceScore || 0) ||
    confidenceRank(right.attribution.confidence) -
      confidenceRank(left.attribution.confidence) ||
    right.strategy.priority - left.strategy.priority ||
    left.strategy.name.localeCompare(right.strategy.name) ||
    String(left.attribution.classificationSource || "").localeCompare(
      String(right.attribution.classificationSource || "")
    )
}

function mergeResolverResults(results, roleRegistry) {
  const candidatesByRole = new Map()
  for (const result of results) {
    for (const attribution of result.attributions || []) {
      const role = roleRegistry.resolve(attribution.role)
      if (!role) continue
      const candidates = candidatesByRole.get(role) || []
      candidates.push({
        attribution: { ...attribution, role },
        strategy: result.strategy
      })
      candidatesByRole.set(role, candidates)
    }
  }

  const merged = []
  for (const [role, candidates] of candidatesByRole) {
    candidates.sort(compareCandidates)
    const winner = candidates[0]
    merged.push({
      ...winner.attribution,
      role,
      evidence: [...new Set(
        candidates.flatMap(candidate => candidate.attribution.evidence || [])
      )].sort()
    })
  }
  return merged.sort((left, right) =>
    Number(right.confidenceScore || 0) - Number(left.confidenceScore || 0) ||
    roleRegistry.priority(right.role) - roleRegistry.priority(left.role) ||
    left.role.localeCompare(right.role)
  )
}

function executeStrategy(strategy, context, traceEnabled) {
  const resolver = strategy.resolver
  if (typeof resolver === "function") {
    const attributions = resolver(context) || []
    return {
      strategy,
      attributions,
      appliedRules: traceEnabled
        ? [{
            rule: `${strategy.name}:strategyFunction`,
            matched: attributions.length > 0,
            producedRoles: attributions.map(item => item.role)
          }]
        : []
    }
  }
  if (traceEnabled && typeof resolver.resolveWithTrace === "function") {
    const result = resolver.resolveWithTrace(context)
    return {
      strategy,
      attributions: result.attributions || [],
      appliedRules: (result.appliedRules || []).map(item => ({
        ...item,
        rule: `${strategy.name}:${item.rule}`
      }))
    }
  }
  return {
    strategy,
    attributions: resolver.resolve(context) || [],
    appliedRules: []
  }
}

function createMultiCasePartyContextResolver({
  strategies
}) {
  const configured = (strategies || []).map(strategy =>
    strategy?.resolver && strategy?.name
      ? createResolverStrategy(strategy)
      : strategy
  )
  if (!configured.length) throw new Error("ao menos uma estrategia e obrigatoria")

  function execute(context, traceEnabled) {
    const selected = selectResolverStrategies(configured, context)
    const results = selected.map(strategy =>
      executeStrategy(strategy, context, traceEnabled)
    )
    return {
      attributions: mergeResolverResults(results, context.roleRegistry),
      appliedRules: results.flatMap(result => result.appliedRules),
      appliedResolvers: selected.map(strategy => ({
        resolver: strategy.name,
        priority: strategy.priority,
        producedRoles: [...new Set(
          (results.find(result => result.strategy === strategy)?.attributions || [])
            .map(item => context.roleRegistry.resolve(item.role))
            .filter(Boolean)
        )].sort()
      }))
    }
  }

  return Object.freeze({
    strategies: Object.freeze([...configured]),
    resolve(context) {
      return execute(context, false).attributions
    },
    resolveWithTrace(context) {
      return execute(context, true)
    }
  })
}

function hasMetadataRoles(context) {
  return Boolean(
    (context.caseContext.explicitRoles || context.caseContext.roleHints)?.length ||
    context.caseContext.metadata?.casePartyRoles?.length
  )
}

function hasRelationshipHints(context) {
  return Boolean(
    (Array.isArray(context.caseContext.relationshipHints)
      ? context.caseContext.relationshipHints.length
      : context.caseContext.relationshipHints)
  )
}

function createStandardMultiCasePartyContextResolver() {
  return createMultiCasePartyContextResolver({
    strategies: [
      createResolverStrategy({
        name: "metadataResolver",
        priority: 300,
        supports: hasMetadataRoles,
        resolver: createCasePartyContextResolver({
          rules: [explicitRoleRule]
        })
      }),
      createResolverStrategy({
        name: "relationshipHintResolver",
        priority: 200,
        supports: hasRelationshipHints,
        resolver: createCasePartyContextResolver({
          rules: [relationshipHintRule]
        })
      }),
      createResolverStrategy({
        name: "fallbackResolver",
        priority: 100,
        resolver: createCasePartyContextResolver({
          rules: [
            legacyRoleHintRule,
            assistedPartyRule,
            requesterRule,
            simpleCaseAssistedRule
          ]
        })
      })
    ]
  })
}

module.exports = {
  createResolverStrategy,
  selectResolverStrategies,
  confidenceRank,
  sourceRank,
  compareCandidates,
  mergeResolverResults,
  executeStrategy,
  createMultiCasePartyContextResolver,
  hasMetadataRoles,
  hasRelationshipHints,
  createStandardMultiCasePartyContextResolver
}
