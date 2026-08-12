"use strict"

const test = require("node:test")
const assert = require("node:assert/strict")
const { atualizarHubSpotSeguro } = require("../src/domain/post-human-hubspot-updater")

test("fatos juridicos do caso sao mesclados sem apagar os existentes", async () => {
  const writes = []
  const result = await atualizarHubSpotSeguro({
    objectType: "deal", objectId: "D", expectedDealId: "D", contactId: "P",
    current: { oraculum_case_facts: JSON.stringify({ empresa: "Empresa Piloto" }) },
    incoming: { oraculum_case_facts: JSON.stringify({ motivo: "Verbas rescisorias" }) },
    deps: { isAssociated: async () => true, update: async (...args) => writes.push(args), createReviewNote: async () => {} }
  })
  assert.equal(result.humanReviewRequired, false)
  assert.deepEqual(JSON.parse(writes[0][2].oraculum_case_facts), {
    empresa: "Empresa Piloto", motivo: "Verbas rescisorias"
  })
})

test("fato juridico divergente nao sobrescreve o valor anterior", async () => {
  let writes = 0
  const result = await atualizarHubSpotSeguro({
    objectType: "deal", objectId: "D", expectedDealId: "D", contactId: "P",
    current: { oraculum_case_facts: JSON.stringify({ empresa: "Empresa A" }) },
    incoming: { oraculum_case_facts: JSON.stringify({ empresa: "Empresa B" }) },
    deps: { isAssociated: async () => true, update: async () => { writes++ }, createReviewNote: async () => {} }
  })
  assert.equal(writes, 0)
  assert.equal(result.humanReviewRequired, true)
  assert.deepEqual(result.divergences, [{ field: "oraculum_case_facts", keys: ["empresa"] }])
})
