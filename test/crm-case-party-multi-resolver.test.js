const assert = require("node:assert/strict")
const {
  CASE_PARTY_ROLES,
  ATTRIBUTION_SOURCES,
  ATTRIBUTION_CONFIDENCE,
  createCasePartyRoleRegistry,
  createResolverStrategy,
  createMultiCasePartyContextResolver,
  createStandardMultiCasePartyContextResolver,
  mapContactToCaseParty,
  explainCaseParty
} = require("../src/domain/crm-identity")

const contact = {
  id: "contact-multi",
  properties: {
    firstname: "Maria Silva",
    phone: "5511999999999"
  }
}
const caseContext = {
  dealId: "deal-multi",
  metadata: {
    casePartyRoles: [{
      contactId: "contact-multi",
      role: CASE_PARTY_ROLES.CLIENT,
      confidenceScore: 0.99,
      evidence: ["metadata.client"]
    }]
  },
  state: {
    atendimentoParaTerceiro: false,
    telefoneEhDoCliente: true,
    whatsappContato: "5511999999999",
    _numero: "5511999999999"
  }
}

const standardMultiResolver = createStandardMultiCasePartyContextResolver()
const multiParty = mapContactToCaseParty({
  contact,
  caseContext,
  contextResolver: standardMultiResolver,
  auditMode: true
})
const multiExplanation = explainCaseParty(multiParty)

assert.equal(multiParty.role, CASE_PARTY_ROLES.CLIENT)
assert.equal(multiParty.confidenceScore, 0.99)
assert.ok(multiParty.roles.some(item =>
  item.role === CASE_PARTY_ROLES.ASSISTED_PERSON
))
assert.deepEqual(
  multiExplanation.appliedResolvers.map(item => item.resolver),
  ["metadataResolver", "fallbackResolver"],
  "relationship resolver nao deve ser selecionado sem hints"
)
assert.ok(multiExplanation.appliedRules.some(item =>
  item.rule === "metadataResolver:explicitRoleRule" &&
  item.matched === true
))

let unsupportedCalls = 0
const unsupported = createResolverStrategy({
  name: "unsupportedResolver",
  priority: 999,
  supports: () => false,
  resolver() {
    unsupportedCalls += 1
    return []
  }
})
const supported = createResolverStrategy({
  name: "supportedResolver",
  priority: 10,
  resolver: () => [{
    role: CASE_PARTY_ROLES.REQUESTER,
    source: ATTRIBUTION_SOURCES.DERIVED,
    confidence: ATTRIBUTION_CONFIDENCE.MEDIUM,
    confidenceScore: 0.7,
    classificationSource: "SUPPORTED_STRATEGY",
    evidence: ["supported"]
  }]
})
const selectionResolver = createMultiCasePartyContextResolver({
  strategies: [unsupported, supported]
})
const selectionParty = mapContactToCaseParty({
  contact,
  caseContext: { dealId: "deal-selection", state: {} },
  contextResolver: selectionResolver,
  auditMode: true
})
assert.equal(unsupportedCalls, 0)
assert.equal(selectionParty.role, CASE_PARTY_ROLES.REQUESTER)
assert.deepEqual(
  explainCaseParty(selectionParty).appliedResolvers.map(item => item.resolver),
  ["supportedResolver"]
)

const derivedHighScore = createResolverStrategy({
  name: "derivedHighScore",
  priority: 500,
  resolver: () => [{
    role: CASE_PARTY_ROLES.REPRESENTATIVE,
    source: ATTRIBUTION_SOURCES.DERIVED,
    confidence: ATTRIBUTION_CONFIDENCE.HIGH,
    confidenceScore: 0.99,
    classificationSource: "DERIVED_HIGH_SCORE",
    evidence: ["derived"]
  }]
})
const explicitLowerScore = createResolverStrategy({
  name: "explicitLowerScore",
  priority: 10,
  resolver: () => [{
    role: CASE_PARTY_ROLES.REPRESENTATIVE,
    source: ATTRIBUTION_SOURCES.EXPLICIT,
    confidence: ATTRIBUTION_CONFIDENCE.MEDIUM,
    confidenceScore: 0.6,
    classificationSource: "EXPLICIT_LOWER_SCORE",
    evidence: ["explicit"]
  }]
})
function classifyWithOrder(strategies) {
  return mapContactToCaseParty({
    contact,
    caseContext: { dealId: "deal-deterministic", state: {} },
    contextResolver: createMultiCasePartyContextResolver({ strategies })
  })
}
const orderA = classifyWithOrder([derivedHighScore, explicitLowerScore])
const orderB = classifyWithOrder([explicitLowerScore, derivedHighScore])
assert.deepEqual(orderA, orderB, "resultado nao pode depender da ordem de registro")
assert.equal(orderA.role, CASE_PARTY_ROLES.REPRESENTATIVE)
assert.equal(orderA.confidenceScore, 0.6)
assert.equal(orderA.classificationSource, "EXPLICIT_LOWER_SCORE")
assert.deepEqual(
  orderA.roles[0].evidence,
  ["derived", "explicit"],
  "evidencias dos resolvers devem ser combinadas"
)

const extendedRegistry = createCasePartyRoleRegistry().extend([{
  role: "GUARDIAN",
  aliases: ["tutor"],
  priority: 90
}])
const guardianResolver = createMultiCasePartyContextResolver({
  strategies: [
    createResolverStrategy({
      name: "guardianPlugin",
      priority: 100,
      supports: context => context.caseContext.metadata?.guardian === true,
      resolver: () => [{
        role: "tutor",
        source: ATTRIBUTION_SOURCES.EXPLICIT,
        confidence: ATTRIBUTION_CONFIDENCE.HIGH,
        confidenceScore: 1,
        classificationSource: "GUARDIAN_PLUGIN",
        evidence: ["plugin.guardian"]
      }]
    })
  ]
})
const guardianParty = mapContactToCaseParty({
  contact,
  caseContext: {
    dealId: "deal-guardian-plugin",
    metadata: { guardian: true },
    state: {}
  },
  roleRegistry: extendedRegistry,
  contextResolver: guardianResolver
})
assert.equal(guardianParty.role, "GUARDIAN")
assert.equal(guardianParty.classificationSource, "GUARDIAN_PLUGIN")

const defaultParty = mapContactToCaseParty({ contact, caseContext })
assert.equal(
  defaultParty.role,
  CASE_PARTY_ROLES.CLIENT,
  "resolver single atual deve continuar sendo o default"
)

console.log("crm-case-party-multi-resolver: ok")
