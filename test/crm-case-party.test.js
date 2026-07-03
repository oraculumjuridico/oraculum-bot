const assert = require("node:assert/strict")
const {
  CASE_PARTY_ROLES,
  CASE_PARTY_STATUS,
  ATTRIBUTION_SOURCES,
  createCasePartyRoleRegistry,
  mapContactToCaseParty,
  hasCasePartyRole
} = require("../src/domain/crm-identity")

const simpleContact = {
  id: "contact-simple",
  properties: {
    firstname: "Maria Silva",
    phone: "5511999999999"
  }
}
const simpleContext = {
  dealId: "deal-simple",
  state: {
    atendimentoParaTerceiro: false,
    telefoneEhDoCliente: true,
    whatsappContato: "5511999999999",
    _numero: "5511999999999"
  }
}
const simpleContactBefore = structuredClone(simpleContact)
const simpleContextBefore = structuredClone(simpleContext)
const simpleParty = mapContactToCaseParty({
  contact: simpleContact,
  caseContext: simpleContext
})

assert.equal(simpleParty.kind, "CaseParty")
assert.equal(simpleParty.caseId, "deal-simple")
assert.deepEqual(simpleParty.contactRef, {
  type: "HUBSPOT_CONTACT",
  contactId: "contact-simple"
})
assert.equal(simpleParty.status, CASE_PARTY_STATUS.CLASSIFIED)
assert.equal(simpleParty.role, CASE_PARTY_ROLES.ASSISTED_PERSON)
assert.equal(simpleParty.confidenceScore, 0.9)
assert.equal(simpleParty.classificationSource, "CASE_ENDPOINT_MATCH")
assert.equal(hasCasePartyRole(simpleParty, CASE_PARTY_ROLES.ASSISTED_PERSON), true)
assert.equal(hasCasePartyRole(simpleParty, CASE_PARTY_ROLES.REQUESTER), true)
assert.ok(simpleParty.roles.every(role =>
  role.confidenceScore >= 0 &&
  role.confidenceScore <= 1 &&
  typeof role.classificationSource === "string"
))
assert.deepEqual(simpleContact, simpleContactBefore, "mapper nao pode alterar Contact")
assert.deepEqual(simpleContext, simpleContextBefore, "mapper nao pode alterar contexto")
assert.equal(Object.isFrozen(simpleParty), true)
assert.equal(Object.isFrozen(simpleParty.roles), true)

const requesterContact = {
  id: "contact-requester",
  properties: {
    firstname: "Joao Souza",
    phone: "5511888888888"
  }
}
const thirdPartyContext = {
  dealId: "deal-third-party",
  actorContactId: "contact-requester",
  state: {
    atendimentoParaTerceiro: true,
    telefoneEhDoCliente: false,
    nome: "Ana Souza",
    nomeContato: "Joao Souza",
    relacaoComAtendido: "filho",
    _numero: "5511888888888",
    whatsappContato: "5511777777777"
  }
}
const requesterParty = mapContactToCaseParty({
  contact: requesterContact,
  caseContext: thirdPartyContext
})

assert.equal(hasCasePartyRole(requesterParty, CASE_PARTY_ROLES.REQUESTER), true)
assert.equal(hasCasePartyRole(requesterParty, CASE_PARTY_ROLES.ASSISTED_PERSON), false)
assert.equal(
  hasCasePartyRole(requesterParty, CASE_PARTY_ROLES.REPRESENTATIVE),
  false,
  "parentesco nao pode atribuir representacao automaticamente"
)
assert.deepEqual(requesterParty.relationship, {
  declaredType: "filho",
  source: "legacy.relacaoComAtendido"
})

const assistedContact = {
  id: "contact-assisted",
  properties: {
    firstname: "Ana Souza",
    phone: "5511777777777"
  }
}
const assistedParty = mapContactToCaseParty({
  contact: assistedContact,
  caseContext: thirdPartyContext
})
assert.equal(hasCasePartyRole(assistedParty, CASE_PARTY_ROLES.ASSISTED_PERSON), true)
assert.equal(hasCasePartyRole(assistedParty, CASE_PARTY_ROLES.REQUESTER), false)

const ambiguousParty = mapContactToCaseParty({
  contact: {
    id: "contact-ambiguous",
    properties: { firstname: "Pessoa", phone: "5511666666666" }
  },
  caseContext: {
    dealId: "deal-ambiguous",
    state: {
      atendimentoParaTerceiro: true,
      telefoneEhDoCliente: false
    }
  }
})
assert.equal(ambiguousParty.status, CASE_PARTY_STATUS.UNCLASSIFIED)
assert.equal(ambiguousParty.role, "UNCLASSIFIED")
assert.equal(ambiguousParty.confidenceScore, 0)
assert.equal(ambiguousParty.classificationSource, "NO_SAFE_CLASSIFICATION")
assert.deepEqual(ambiguousParty.roles, [])

const explicitRepresentative = mapContactToCaseParty({
  contact: requesterContact,
  caseContext: {
    ...thirdPartyContext,
    explicitRoles: [{
      role: CASE_PARTY_ROLES.REPRESENTATIVE,
      evidence: ["admin.confirmed_representation"]
    }]
  }
})
const representativeRole = explicitRepresentative.roles.find(
  item => item.role === CASE_PARTY_ROLES.REPRESENTATIVE
)
assert.equal(representativeRole.source, ATTRIBUTION_SOURCES.EXPLICIT)
assert.ok(representativeRole.evidence.includes("admin.confirmed_representation"))
assert.equal(representativeRole.confidenceScore, 1)
assert.equal(representativeRole.classificationSource, "CASE_METADATA_EXPLICIT_ROLE")

const metadataClassified = mapContactToCaseParty({
  contact: simpleContact,
  caseContext: {
    dealId: "deal-metadata",
    metadata: {
      casePartyRoles: [{
        contactId: "contact-simple",
        role: CASE_PARTY_ROLES.CLIENT,
        confidenceScore: 0.99,
        evidence: ["case.metadata.client"]
      }]
    }
  }
})
assert.equal(metadataClassified.role, CASE_PARTY_ROLES.CLIENT)
assert.equal(metadataClassified.confidenceScore, 0.99)
assert.equal(metadataClassified.classificationSource, "CASE_METADATA_EXPLICIT_ROLE")

const extendedRegistry = createCasePartyRoleRegistry().extend([{
  role: "GUARDIAN",
  aliases: ["tutor", "responsavel_legal"],
  priority: 90
}])
const guardianParty = mapContactToCaseParty({
  contact: requesterContact,
  caseContext: {
    dealId: "deal-guardian",
    state: {
      atendimentoParaTerceiro: true,
      telefoneEhDoCliente: false
    },
    relationshipHints: [{
      contactId: "contact-requester",
      role: "tutor",
      confidenceScore: 0.88,
      evidence: ["case.relationship.guardian"]
    }]
  },
  roleRegistry: extendedRegistry
})
assert.equal(guardianParty.role, "GUARDIAN")
assert.equal(guardianParty.confidenceScore, 0.88)
assert.equal(guardianParty.classificationSource, "RELATIONSHIP_HINT")
assert.equal(hasCasePartyRole(guardianParty, "GUARDIAN"), true)

assert.throws(
  () => mapContactToCaseParty({
    contact: { id: "contact-without-case" },
    caseContext: {}
  }),
  /caseId obrigatorio/
)
assert.throws(
  () => mapContactToCaseParty({
    contact: {},
    caseContext: { dealId: "deal-without-contact" }
  }),
  /contactId obrigatorio/
)

console.log("crm-case-party: ok")
