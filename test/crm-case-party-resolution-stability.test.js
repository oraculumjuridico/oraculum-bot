const assert = require("node:assert/strict")
const {
  CASE_PARTY_ROLES,
  ATTRIBUTION_SOURCES,
  ATTRIBUTION_CONFIDENCE,
  createResolutionStabilityCache,
  createResolverStrategy,
  createMultiCasePartyContextResolver,
  createStandardMultiCasePartyContextResolver,
  mapContactToCaseParty,
  explainCaseParty
} = require("../src/domain/crm-identity")

const contactA = {
  id: "contact-stability",
  properties: {
    firstname: "Nome Privado",
    phone: "5511999999999"
  }
}
const contextA = {
  dealId: "deal-stability",
  state: {
    atendimentoParaTerceiro: false,
    telefoneEhDoCliente: true,
    whatsappContato: "5511999999999",
    _numero: "5511999999999"
  }
}

const fixedCache = createResolutionStabilityCache({
  secret: Buffer.alloc(32, 7)
})
const fingerprintA = fixedCache.fingerprint({
  contact: contactA,
  caseContext: contextA,
  roleRegistry: require("../src/domain/crm-identity").DEFAULT_CASE_PARTY_ROLE_REGISTRY,
  contextResolver: require("../src/domain/crm-identity").DEFAULT_CASE_PARTY_CONTEXT_RESOLVER,
  auditEnabled: false
})
const fingerprintSameDifferentOrder = fixedCache.fingerprint({
  caseContext: {
    state: {
      _numero: "5511999999999",
      whatsappContato: "5511999999999",
      telefoneEhDoCliente: true,
      atendimentoParaTerceiro: false
    },
    dealId: "deal-stability"
  },
  contact: {
    properties: {
      phone: "5511999999999",
      firstname: "Nome Privado"
    },
    id: "contact-stability"
  },
  roleRegistry: require("../src/domain/crm-identity").DEFAULT_CASE_PARTY_ROLE_REGISTRY,
  contextResolver: require("../src/domain/crm-identity").DEFAULT_CASE_PARTY_CONTEXT_RESOLVER,
  auditEnabled: false
})
assert.equal(fingerprintA, fingerprintSameDifferentOrder)
assert.match(fingerprintA, /^[a-f0-9]{64}$/)
assert.doesNotMatch(fingerprintA, /5511999999999|Nome Privado/)

let resolveCalls = 0
const countingResolver = {
  rules: [],
  resolve() {
    resolveCalls += 1
    return [{
      role: CASE_PARTY_ROLES.ASSISTED_PERSON,
      source: ATTRIBUTION_SOURCES.DERIVED,
      confidence: ATTRIBUTION_CONFIDENCE.HIGH,
      confidenceScore: 0.91,
      classificationSource: "COUNTING_RESOLVER",
      evidence: ["counting"]
    }]
  }
}
const stabilityCache = createResolutionStabilityCache({
  secret: Buffer.alloc(32, 8)
})
const contactBefore = structuredClone(contactA)
const first = mapContactToCaseParty({
  contact: contactA,
  caseContext: contextA,
  contextResolver: countingResolver,
  stabilityMode: { enabled: true, cache: stabilityCache }
})
const second = mapContactToCaseParty({
  contact: contactA,
  caseContext: contextA,
  contextResolver: countingResolver,
  stabilityMode: { enabled: true, cache: stabilityCache }
})
assert.equal(resolveCalls, 1, "fingerprint identico deve reutilizar decisao")
assert.deepEqual(first, second)
assert.deepEqual(contactA, contactBefore, "soft lock nao pode alterar Contact")

mapContactToCaseParty({
  contact: contactA,
  caseContext: {
    ...contextA,
    state: {
      ...contextA.state,
      telefoneEhDoCliente: false
    }
  },
  contextResolver: countingResolver,
  stabilityMode: { enabled: true, cache: stabilityCache }
})
assert.equal(resolveCalls, 2, "mudanca de contexto deve invalidar fingerprint")

let noCacheCalls = 0
const noCacheResolver = {
  rules: [],
  resolve() {
    noCacheCalls += 1
    return countingResolver.resolve()
  }
}
mapContactToCaseParty({
  contact: contactA,
  caseContext: contextA,
  contextResolver: noCacheResolver
})
mapContactToCaseParty({
  contact: contactA,
  caseContext: contextA,
  contextResolver: noCacheResolver
})
assert.equal(noCacheCalls, 2, "stability mode deve ser opt-in")

const auditCache = createResolutionStabilityCache({
  secret: Buffer.alloc(32, 9)
})
const standardMulti = createStandardMultiCasePartyContextResolver()
const auditFirst = mapContactToCaseParty({
  contact: contactA,
  caseContext: contextA,
  contextResolver: standardMulti,
  auditMode: true,
  stabilityMode: { enabled: true, cache: auditCache }
})
const auditSecond = mapContactToCaseParty({
  contact: contactA,
  caseContext: contextA,
  contextResolver: standardMulti,
  auditMode: true,
  stabilityMode: { enabled: true, cache: auditCache }
})
assert.equal(explainCaseParty(auditFirst).stability.cacheHit, false)
assert.equal(explainCaseParty(auditSecond).stability.cacheHit, true)
assert.equal(
  explainCaseParty(auditFirst).stability.fingerprint,
  explainCaseParty(auditSecond).stability.fingerprint
)

let firstOrderCalls = 0
let secondOrderCalls = 0
function strategy(name, priority, counter) {
  return createResolverStrategy({
    name,
    priority,
    version: "1",
    resolver() {
      counter()
      return [{
        role: CASE_PARTY_ROLES.REQUESTER,
        source: ATTRIBUTION_SOURCES.DERIVED,
        confidence: ATTRIBUTION_CONFIDENCE.MEDIUM,
        confidenceScore: 0.75,
        classificationSource: name,
        evidence: [name]
      }]
    }
  })
}
const resolverOrderA = createMultiCasePartyContextResolver({
  strategies: [
    strategy("alpha", 20, () => { firstOrderCalls += 1 }),
    strategy("beta", 10, () => { firstOrderCalls += 1 })
  ]
})
const resolverOrderB = createMultiCasePartyContextResolver({
  strategies: [
    strategy("beta", 10, () => { secondOrderCalls += 1 }),
    strategy("alpha", 20, () => { secondOrderCalls += 1 })
  ]
})
const orderCache = createResolutionStabilityCache({
  secret: Buffer.alloc(32, 10)
})
const orderFirst = mapContactToCaseParty({
  contact: contactA,
  caseContext: { dealId: "deal-order-stability", state: {} },
  contextResolver: resolverOrderA,
  stabilityMode: { enabled: true, cache: orderCache }
})
const orderSecond = mapContactToCaseParty({
  contact: contactA,
  caseContext: { dealId: "deal-order-stability", state: {} },
  contextResolver: resolverOrderB,
  stabilityMode: { enabled: true, cache: orderCache }
})
assert.equal(firstOrderCalls, 2)
assert.equal(secondOrderCalls, 0, "mesmo conjunto reordenado deve usar o mesmo lock")
assert.deepEqual(orderFirst, orderSecond)

let now = 1000
const ttlCache = createResolutionStabilityCache({
  ttlMs: 10,
  clock: () => now,
  secret: Buffer.alloc(32, 11)
})
ttlCache.set("key", { attributions: [] })
assert.ok(ttlCache.get("key"))
now += 11
assert.equal(ttlCache.get("key"), null)

let degradedCalls = 0
const degradedParty = mapContactToCaseParty({
  contact: contactA,
  caseContext: contextA,
  contextResolver: {
    rules: [],
    resolve() {
      degradedCalls += 1
      return countingResolver.resolve()
    }
  },
  stabilityMode: {
    enabled: true,
    cache: {
      fingerprint() {
        throw new Error("cache indisponivel")
      }
    }
  }
})
assert.equal(degradedCalls, 1, "falha do cache nao pode duplicar resolucao")
assert.equal(degradedParty.role, CASE_PARTY_ROLES.ASSISTED_PERSON)

console.log("crm-case-party-resolution-stability: ok")
