const assert = require("node:assert/strict")
const {
  CASE_PARTY_ROLES,
  mapContactToCaseParty,
  explainCaseParty,
  hasCasePartyDecisionTrace
} = require("../src/domain/crm-identity")

const contact = {
  id: "contact-audit",
  properties: {
    firstname: "Nome Sensivel",
    phone: "5511999999999"
  }
}
const caseContext = {
  dealId: "deal-audit",
  state: {
    nome: "Nome Sensivel",
    descricao: "Narrativa que nao pode entrar no trace",
    atendimentoParaTerceiro: false,
    telefoneEhDoCliente: true,
    whatsappContato: "5511999999999",
    _numero: "5511999999999"
  }
}

const defaultParty = mapContactToCaseParty({ contact, caseContext })
assert.equal(hasCasePartyDecisionTrace(defaultParty), false)
assert.deepEqual(explainCaseParty(defaultParty), {
  schemaVersion: 1,
  available: false,
  reason: "AUDIT_MODE_DISABLED_OR_TRACE_NOT_AVAILABLE"
})

let deliveredTrace = null
const auditedParty = mapContactToCaseParty({
  contact,
  caseContext,
  auditMode: {
    enabled: true,
    onTrace(trace) {
      deliveredTrace = trace
    }
  }
})
const explanation = explainCaseParty(auditedParty)

assert.equal(hasCasePartyDecisionTrace(auditedParty), true)
assert.equal(explanation.available, true)
assert.equal(explanation.inputContext.caseId, "deal-audit")
assert.equal(explanation.inputContext.contactId, "contact-audit")
assert.equal(explanation.inputContext.signals.thirdParty, false)
assert.equal(explanation.inputContext.signals.phoneOwnershipFlag, true)
assert.equal(explanation.inputContext.matches.assistedEndpoint, true)
assert.equal(explanation.decision.role, CASE_PARTY_ROLES.ASSISTED_PERSON)
assert.equal(explanation.decision.confidenceScore, 0.9)
assert.equal(explanation.decision.classificationSource, "CASE_ENDPOINT_MATCH")
assert.ok(explanation.appliedRules.some(item =>
  item.rule === "assistedPartyRule" &&
  item.matched === true &&
  item.producedRoles.includes(CASE_PARTY_ROLES.ASSISTED_PERSON)
))
assert.deepEqual(deliveredTrace, explanation)
assert.equal(Object.isFrozen(explanation), true)
assert.equal(Object.isFrozen(explanation.inputContext), true)

const serializedTrace = JSON.stringify(explanation)
assert.doesNotMatch(serializedTrace, /Nome Sensivel/)
assert.doesNotMatch(serializedTrace, /5511999999999/)
assert.doesNotMatch(serializedTrace, /Narrativa/)

assert.doesNotThrow(() => mapContactToCaseParty({
  contact,
  caseContext,
  auditMode: {
    enabled: true,
    onTrace() {
      throw new Error("consumer audit failure")
    }
  }
}), "falha do observador nao pode alterar classificacao")

const unclassified = mapContactToCaseParty({
  contact: {
    id: "contact-unclassified",
    properties: { firstname: "Pessoa", phone: "5511888888888" }
  },
  caseContext: {
    dealId: "deal-unclassified",
    state: {
      atendimentoParaTerceiro: true,
      telefoneEhDoCliente: false
    }
  },
  auditMode: true
})
const unclassifiedExplanation = explainCaseParty(unclassified)
assert.equal(unclassifiedExplanation.decision.role, "UNCLASSIFIED")
assert.equal(unclassifiedExplanation.decision.confidenceScore, 0)
assert.equal(
  unclassifiedExplanation.decision.classificationSource,
  "NO_SAFE_CLASSIFICATION"
)
assert.ok(unclassifiedExplanation.appliedRules.every(item =>
  typeof item.rule === "string" &&
  typeof item.matched === "boolean" &&
  Array.isArray(item.producedRoles)
))

console.log("crm-case-party-decision-audit: ok")
