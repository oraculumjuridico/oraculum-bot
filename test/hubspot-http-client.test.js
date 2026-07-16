"use strict"

const test = require("node:test")
const assert = require("node:assert/strict")
const { ASSOCIATION, createHubSpotHttpClient } = require("../src/adapters/hubspot-http-client")

const clock = () => "2026-07-16T12:00:00.000Z"
const response = (body = {}, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => body })

function harness(handler = async () => response({ results: [] })) {
  const calls = []
  const fetch = async (url, options) => {
    calls.push({ url, method: options.method, headers: options.headers, body: options.body })
    return handler(url, options)
  }
  return { calls, client: createHubSpotHttpClient({ token: "fixture-secret", fetch, clock, timeoutMs: 20 }) }
}

test("contrato canônico de associação é negócio para contato", () => assert.deepEqual(ASSOCIATION, { category: "HUBSPOT_DEFINED", typeId: 3, typeName: "deal_to_contact" }))

test("busca associação por GET na direção correta", async () => {
  const h = harness(async () => response({ results: [{ toObjectId: "222", associationTypes: [{ category: "HUBSPOT_DEFINED", typeId: 3 }] }] }))
  const result = await h.client.associations.findDealContacts("111")
  assert.equal(result.results.length, 1)
  assert.equal(h.calls[0].method, "GET")
  assert.match(h.calls[0].url, /\/deals\/111\/associations\/contacts\?limit=100$/)
})

test("criação captura IDs, categoria e type ID sem rede", async () => {
  const h = harness()
  await h.client.associations.createDealContact({ dealId: "111", contactId: "222", associationCategory: "HUBSPOT_DEFINED", associationTypeId: 3 })
  assert.equal(h.calls.length, 1)
  assert.equal(h.calls[0].method, "PUT")
  assert.match(h.calls[0].url, /\/deals\/111\/associations\/contacts\/222$/)
  assert.deepEqual(JSON.parse(h.calls[0].body), [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: 3 }])
  assert.equal(h.calls[0].headers.Authorization, "Bearer fixture-secret")
})

test("tipo inverso e type ID 4 falham antes do transporte", async () => {
  const h = harness()
  assert.throws(() => h.client.associations.createDealContact({ dealId: "111", contactId: "222", associationCategory: "HUBSPOT_DEFINED", associationTypeId: 4 }), /HUBSPOT_ASSOCIATION_CONTRACT_INVALID/)
  assert.equal(h.calls.length, 0)
})

test("erro HTTP é sanitizado sem token ou PII", async () => {
  const h = harness(async () => response({ secret: "fixture-secret", cpf: "123" }, 403))
  await assert.rejects(() => h.client.contacts.search({ propertyName: "cpf_do_cliente", value: "123", properties: [], limit: 2 }), error => error.message === "HUBSPOT_HTTP_403" && !/fixture-secret|123/.test(error.message))
})

test("timeout de leitura é sanitizado", async () => {
  const h = harness(async (url, options) => new Promise((resolve, reject) => options.signal.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })))))
  await assert.rejects(() => h.client.associations.findDealContacts("111"), /HUBSPOT_TIMEOUT/)
})

test("timeout de escrita é efeito externo desconhecido e não tem retry", async () => {
  let attempts = 0
  const h = harness(async (url, options) => { attempts += 1; return new Promise((resolve, reject) => options.signal.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })))) })
  await assert.rejects(() => h.client.associations.createDealContact({ dealId: "111", contactId: "222", associationCategory: "HUBSPOT_DEFINED", associationTypeId: 3 }), /HUBSPOT_EXTERNAL_EFFECT_UNKNOWN/)
  assert.equal(attempts, 1)
})

test("busca vazia e múltipla permanecem observáveis ao adapter", async () => {
  for (const results of [[], [{ toObjectId: "222" }, { toObjectId: "333" }]]) {
    const h = harness(async () => response({ results }))
    assert.deepEqual((await h.client.associations.findDealContacts("111")).results, results)
  }
})
