"use strict"

const test = require("node:test")
const assert = require("node:assert/strict")
const { resolveComplementaryContext } = require("../src/domain/post-human-complementary-fields")
const { atualizarHubSpotSeguro } = require("../src/domain/post-human-hubspot-updater")

test("leitura conjunta distingue fonte não carregada, vazio e resposta anterior", () => {
  const result = resolveComplementaryContext({
    usuario: { area: "INSS" },
    contact: { id: "P", loaded: false },
    deal: { id: "D", loaded: true, properties: { area_juridica: "INSS", tipo_de_caso: "" } },
    answered: { cidade: { valor: "Cidade já informada" } },
    previousPending: ["cidade", "tipoCaso"],
    expectedContactId: "P", expectedDealId: "D"
  })
  assert.equal(result.contactLoaded, false)
  assert.equal(result.dealLoaded, true)
  assert.equal(result.data.tipoCaso.status, "ausente")
  assert.equal(result.camposPendentes.includes("cidade"), false)
  assert.equal(result.camposPendentes.includes("tipoCaso"), true)
})

test("leitura conjunta não usa outro negócio e divergência exige revisão", () => {
  const wrongDeal = resolveComplementaryContext({
    usuario: { area: "INSS" },
    contact: { id: "P", dealIds: ["D-CORRETO"], properties: { city: "A" } },
    deal: { id: "D-ERRADO", properties: { area_juridica: "INSS" } },
    expectedContactId: "P", expectedDealId: "D-CORRETO"
  })
  assert.equal(wrongDeal.humanReviewRequired, true)
  assert.equal(wrongDeal.reviewReason, "contexto_contato_negocio_invalido")
  const divergent = resolveComplementaryContext({
    usuario: { cidade: "A" },
    contact: { id: "P", properties: { city: "B" } },
    deal: { id: "D" }, expectedContactId: "P", expectedDealId: "D"
  })
  assert.equal(divergent.humanReviewRequired, true)
  assert.deepEqual(divergent.divergences.map(item => item.field), ["cidade"])
})

test("negócio associado atualiza apenas campo vazio da allowlist", async () => {
  const writes = []
  const result = await atualizarHubSpotSeguro({
    objectType: "deal", objectId: "D1", expectedDealId: "D1", contactId: "P1",
    current: { description: "", tipo_de_caso: "inss_bpc" },
    incoming: { description: "Complemento", tipo_de_caso: "inss_bpc" },
    deps: {
      isAssociated: async (contact, deal) => contact === "P1" && deal === "D1",
      update: async (...args) => writes.push(args), createReviewNote: async () => {}
    }
  })
  assert.deepEqual(writes[0], ["deal", "D1", { description: "Complemento" }])
  assert.deepEqual(result.unchanged, ["tipo_de_caso"])
  assert.equal(result.humanReviewRequired, false)
})

test("múltiplos negócios, alvo cruzado e propriedade desconhecida falham sem escrita", async () => {
  for (const input of [
    { objectId: "D2", expectedDealId: "D1", incoming: { description: "x" } },
    { objectId: "D1", expectedDealId: "D1", incoming: { propriedade_inventada: "x" } }
  ]) {
    let writes = 0
    const result = await atualizarHubSpotSeguro({
      objectType: "deal", contactId: "P1", current: {}, ...input,
      deps: {
        isAssociated: async (_contact, deal) => deal === "D1",
        update: async () => { writes++ }, createReviewNote: async () => {}
      }
    })
    assert.equal(writes, 0)
    assert.equal(result.humanReviewRequired, true)
    assert.ok(result.blocked.length)
  }
})

test("campo jurídico preenchido divergente não é sobrescrito", async () => {
  let writes = 0
  const result = await atualizarHubSpotSeguro({
    objectType: "deal", objectId: "D", expectedDealId: "D", contactId: "P",
    current: { area_juridica: "INSS" }, incoming: { area_juridica: "Trabalhista" },
    deps: { isAssociated: async () => true, update: async () => { writes++ }, createReviewNote: async () => {} }
  })
  assert.equal(writes, 0)
  assert.equal(result.humanReviewRequired, true)
  assert.deepEqual(result.divergences, [{ field: "area_juridica" }])
})
