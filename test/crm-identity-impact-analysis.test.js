const assert = require("node:assert/strict")
const {
  analyzeIdentityImpact
} = require("../scripts/crm-identity-impact-analysis")

assert.deepEqual(analyzeIdentityImpact(), {
  totalContacts: 0,
  suspectedThirdPartyCases: 0,
  suspectedRepresentations: 0,
  contactsWithoutClearPerson: 0,
  estimatedMigrationImpact: {
    level: "NONE",
    contactsRequiringReview: 0,
    casesRequiringReview: 0,
    aliasedPersonReferences: 0,
    evidenceCoverage: {
      hubspotContacts: 0,
      hubspotDeals: 0,
      localSessions: 0,
      calendarEvents: 0
    }
  }
})

const simple = analyzeIdentityImpact({
  contacts: [{
    id: "contact-simple",
    properties: { firstname: "Maria Silva", phone: "5511999999999" }
  }],
  deals: [{
    id: "deal-simple",
    properties: {
      estado_bot_snapshot: JSON.stringify({
        nome: "Maria Silva",
        _numero: "5511999999999",
        whatsappContato: "5511999999999",
        telefoneEhDoCliente: true
      })
    },
    associations: { contacts: { results: [{ id: "contact-simple" }] } }
  }]
})
assert.equal(simple.suspectedThirdPartyCases, 0)
assert.equal(simple.suspectedRepresentations, 0)
assert.equal(simple.contactsWithoutClearPerson, 0)
assert.equal(simple.estimatedMigrationImpact.level, "NONE")

const representation = analyzeIdentityImpact({
  contacts: [{
    id: "contact-representative",
    properties: { firstname: "Joao Souza", phone: "5511888888888" }
  }],
  deals: [{
    id: "deal-third-party",
    properties: {
      estado_bot_snapshot: JSON.stringify({
        nome: "Ana Souza",
        nomeContato: "Joao Souza",
        relacaoComAtendido: "filho",
        atendimentoParaTerceiro: true,
        telefoneEhDoCliente: false,
        _numero: "5511888888888",
        whatsappContato: "5511777777777"
      })
    },
    associations: {
      contacts: { results: [{ id: "contact-representative" }] }
    }
  }]
})
assert.equal(representation.suspectedThirdPartyCases, 1)
assert.equal(representation.suspectedRepresentations, 1)
assert.equal(representation.contactsWithoutClearPerson, 1)
assert.equal(representation.estimatedMigrationImpact.casesRequiringReview, 1)

const alias = analyzeIdentityImpact({
  contacts: [{
    id: "contact-alias",
    properties: { firstname: "Carlos Lima", phone: "5511666666666" }
  }],
  deals: [{
    id: "deal-alias",
    properties: {
      estado_bot_snapshot: JSON.stringify({
        nome: "Paula Lima",
        nomeContato: "Carlos Lima",
        atendimentoParaTerceiro: true,
        telefoneEhDoCliente: false
      })
    },
    associations: { contacts: { results: [{ id: "contact-alias" }] } }
  }],
  calendarEvents: [{
    extendedProperties: {
      private: {
        dealId: "deal-alias",
        personId: "contact-alias",
        contactId: "contact-alias"
      }
    }
  }]
})
assert.equal(alias.estimatedMigrationImpact.aliasedPersonReferences, 1)
assert.equal(alias.contactsWithoutClearPerson, 1)
assert.equal(alias.estimatedMigrationImpact.level, "HIGH")

console.log("crm-identity-impact-analysis: ok")
