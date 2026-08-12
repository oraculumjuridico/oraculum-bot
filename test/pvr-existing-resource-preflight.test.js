"use strict"

const assert = require("node:assert/strict")
const { preflightExistingPvrResources, reviewReasonsAfterPvrPreflight } = require("../src/domain/pvr-existing-resource-preflight")
const { createHubSpotSingleCaseAdapters } = require("../src/adapters/hubspot-single-case-adapter")

const PVR = "PVR.260801.813"
const identity = { cpf: "52998224725", phone: "5511999999999", email: "jesaias@example.test" }

function ports({ cpf = [], phone = [], email = [], deals = [], counters = { create: 0, update: 0 } } = {}) {
  const calls = { cpf: 0, phone: 0, email: 0, deal: [] }
  return {
    calls,
    hubspot: {
      contacts: {
        findContactsByCpf: async () => { calls.cpf++; return cpf },
        findContactsByPhone: async () => { calls.phone++; return phone },
        findContactsByEmail: async () => { calls.email++; return email },
        create: async () => { counters.create++; throw new Error("CREATE_MUST_NOT_BE_CALLED") },
        update: async () => { counters.update++; throw new Error("UPDATE_MUST_NOT_BE_CALLED") }
      },
      deals: {
        findByCaseNumber: async value => { calls.deal.push(value); return deals },
        findByName: async () => { throw new Error("DEALNAME_MUST_NOT_BE_USED") },
        create: async () => { counters.create++; throw new Error("CREATE_MUST_NOT_BE_CALLED") }
      }
    }
  }
}

async function main() {
  // A: all available identity evidence converges to one existing contact; F: one exact PVR deal.
  let fixture = ports({ cpf: [{ id: "contact-1" }], phone: [{ id: "contact-1" }], email: [{ id: "contact-1" }], deals: [{ id: "deal-1" }] })
  let outcome = await preflightExistingPvrResources({ caseNumber: PVR, identity, hubspot: fixture.hubspot })
  assert.deepEqual(outcome, { ok: true, applicable: true, contactId: "contact-1", dealId: "deal-1", blockers: [] })
  assert.deepEqual(fixture.calls.deal, [PVR])

  // B: one available key is enough when it yields one contact.
  fixture = ports({ phone: [{ id: "contact-2" }], deals: [{ id: "deal-2" }] })
  outcome = await preflightExistingPvrResources({ caseNumber: PVR, identity: { phone: identity.phone }, hubspot: fixture.hubspot })
  assert.equal(outcome.ok, true)
  assert.equal(outcome.contactId, "contact-2")

  // C: no matches; G: no deal.
  fixture = ports()
  outcome = await preflightExistingPvrResources({ caseNumber: PVR, identity: { cpf: identity.cpf }, hubspot: fixture.hubspot })
  assert.equal(outcome.ok, false)
  assert.deepEqual(outcome.blockers, ["CONTACT_CPF_NOT_FOUND", "DEAL_NOT_FOUND"])

  // D/E: ambiguity and conflicting identity evidence are both fail-closed.
  fixture = ports({ cpf: [{ id: "contact-3" }, { id: "contact-4" }], phone: [{ id: "contact-3" }], deals: [{ id: "deal-3" }] })
  outcome = await preflightExistingPvrResources({ caseNumber: PVR, identity: { cpf: identity.cpf, phone: identity.phone }, hubspot: fixture.hubspot })
  assert.equal(outcome.ok, false)
  assert(outcome.blockers.includes("CONTACT_CPF_AMBIGUOUS"))

  fixture = ports({ cpf: [{ id: "contact-5" }], phone: [{ id: "contact-6" }], deals: [{ id: "deal-4" }] })
  outcome = await preflightExistingPvrResources({ caseNumber: PVR, identity: { cpf: identity.cpf, phone: identity.phone }, hubspot: fixture.hubspot })
  assert.equal(outcome.ok, false)
  assert(outcome.blockers.includes("CONTACT_IDENTITY_CONFLICT"))

  // H/I/J: duplicate PVR deal blocks; only findByCaseNumber is called; no write method is invoked.
  const counters = { create: 0, update: 0 }
  fixture = ports({ cpf: [{ id: "contact-7" }], deals: [{ id: "deal-5" }, { id: "deal-6" }], counters })
  outcome = await preflightExistingPvrResources({ caseNumber: PVR, identity: { cpf: identity.cpf }, hubspot: fixture.hubspot })
  assert.equal(outcome.ok, false)
  assert.deepEqual(outcome.blockers, ["DEAL_AMBIGUOUS"])
  assert.deepEqual(fixture.calls.deal, [PVR])
  assert.deepEqual(counters, { create: 0, update: 0 })

  // The successful result only removes the stage-1 blocker; it does not mark any plan executable.
  const reasons = reviewReasonsAfterPvrPreflight(["pvr_existing_resource_preflight_required", "OTHER_BLOCKER"], { ok: true })
  assert.deepEqual(reasons, ["OTHER_BLOCKER"])
  assert.deepEqual(reviewReasonsAfterPvrPreflight(["pvr_existing_resource_preflight_required"], { ok: false }), ["pvr_existing_resource_preflight_required"])

  // K: this is an opt-in PVR preflight; non-PVR input makes no resource lookup.
  fixture = ports()
  outcome = await preflightExistingPvrResources({ caseNumber: "PRV.260801.813", identity, hubspot: fixture.hubspot })
  assert.equal(outcome.applicable, false)
  assert.deepEqual(fixture.calls, { cpf: 0, phone: 0, email: 0, deal: [] })

  // Adapter email lookup is read-only and queries the exact email property.
  const observed = []
  const adapters = createHubSpotSingleCaseAdapters({
    client: {
      contacts: { search: async query => { observed.push(query); return { results: [{ id: "contact-8" }] } }, create: async () => { throw new Error("UNEXPECTED_CREATE") }, getById: async () => ({ properties: {} }) },
      deals: { search: async () => ({ results: [] }), create: async () => { throw new Error("UNEXPECTED_CREATE") }, getById: async () => ({ properties: {} }) },
      associations: { findDealContacts: async () => ({ results: [] }), createDealContact: async () => ({}) }
    },
    clock: () => new Date().toISOString(),
    timeoutMs: 1
  })
  assert.deepEqual(await adapters.contacts.findContactsByEmail("JESAIAS@EXAMPLE.TEST"), [{ id: "contact-8" }])
  assert.equal(observed[0].propertyName, "email")
  assert.equal(observed[0].value, "jesaias@example.test")

  console.log("pvr-existing-resource-preflight.test.js: ok")
}

main().catch(error => { console.error(error); process.exitCode = 1 })
