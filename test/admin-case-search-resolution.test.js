"use strict"
const assert = require("node:assert/strict")
const fs = require("node:fs")
const vm = require("node:vm")
const source = fs.readFileSync("server.js", "utf8")
const start = source.indexOf("const ADMIN_DEAL_SEARCH_PROPERTIES")
const end = source.indexOf("\nasync function mapearComLimite", start)
assert.ok(start >= 0 && end > start)

function makeResolver(options = {}) {
  const calls = { cpf: 0, phoneSearch: 0, nameSearch: 0, strict: 0, logs: [], phoneSearchBody: null }
  const fail = options.fail || {}
  const sandbox = {
    Set, Map, Date, Promise,
    axios: { post: async (url, body) => {
      if (url.includes("deals/search")) {
        if (fail.case) throw Object.assign(new Error("case failed"), { code: "CASE_FAIL" })
        if (options.invalidDeal) return { data: { results: "invalid" } }
        return { data: { results: options.caseDeals || [], total: (options.caseDeals || []).length } }
      }
      const phoneSearch = body.filterGroups?.some(group => group.filters?.some(filter => filter.propertyName === "mobilephone"))
      if (phoneSearch) {
        calls.phoneSearch++
        calls.phoneSearchBody = body
        if (fail.phone) throw Object.assign(new Error("phone failed"), { code: "PHONE_FAIL" })
        if (options.invalidPhoneContacts) return { data: { results: "invalid" } }
        return { data: { results: options.phoneContacts || [] } }
      }
      calls.nameSearch++
      if (fail.name) throw Object.assign(new Error("name failed"), { code: "NAME_FAIL" })
      if (options.invalidContacts) return { data: { results: "invalid" } }
      return { data: { results: options.contacts || [] } }
    } },
    executarComRetryHubSpot: async fn => fn(), HS: () => ({}), sanitizarTextoEntrada: value => String(value || "").trim(),
    normalizarTelefoneHubSpot: value => `55${String(value || "").replace(/\D/g, "").replace(/^55/, "")}`,
    inspecionarRespostaBuscaHubSpotAdmin: result => Array.isArray(result?.data?.results) ? { ok: true } : { ok: false, reason: "invalid" },
    mapearNegociosHubSpotAdmin: data => data.results || [], logInfo: event => calls.logs.push(event), logErroHubSpot: () => {},
    hsBuscarPorCpf: async () => { calls.cpf++; if (fail.cpf) throw Object.assign(new Error("cpf failed"), { code: "CPF_FAIL" }); return options.identityContact || null },
    hsListarNegociosAtivosDoContatoEstrito: async id => {
      calls.strict++
      if (fail.deals) return { ok: false, deals: [], errorCode: "ASSOC_FAIL" }
      if (options.dealsByContact?.[id] === "invalid") return { ok: false, deals: [], errorCode: "INVALID_HUBSPOT_RESPONSE" }
      return { ok: true, deals: options.dealsByContact?.[id] || [] }
    },
    hsAdminBuscarNegociosDireto: async () => options.fallback || { ok: true, deals: [], total: 0, after: null }
  }
  vm.runInNewContext(`${source.slice(start, end)}; this.resolve = resolverConsultaCasoAdmin`, sandbox)
  return { resolve: sandbox.resolve, calls }
}
const ids = result => result.deals.map(deal => deal.id).sort().join(",")

;(async () => {
  let test = makeResolver({ caseDeals: [{ id: "case-1" }] })
  let result = await test.resolve("PRV.260714.707")
  assert.equal(ids(result), "case-1"); assert.equal(test.calls.nameSearch, 0)
  assert.equal(test.calls.cpf, 0); assert.equal(test.calls.phoneSearch, 0)
  assert.equal(test.calls.logs[0].searchStrategy, "case_number")
  result = await makeResolver({}).resolve("PRV.000000.000"); assert.equal(result.ok, true); assert.equal(result.deals.length, 0)

  const identity = { id: "contact-cpf" }
  test = makeResolver({ identityContact: identity, dealsByContact: { "contact-cpf": [{ id: "cpf-deal" }] } })
  assert.equal(ids(await test.resolve("529.982.247-25")), "cpf-deal"); assert.equal(test.calls.cpf, 1); assert.equal(test.calls.phoneSearch, 0)
  test = makeResolver({ identityContact: identity, dealsByContact: { "contact-cpf": [{ id: "cpf-deal" }] } })
  assert.equal(ids(await test.resolve("52998224725")), "cpf-deal"); assert.equal(test.calls.cpf, 1); assert.equal(test.calls.phoneSearch, 0)
  test = makeResolver({ phoneContacts: [{ id: "phone-1" }], dealsByContact: { "phone-1": [{ id: "phone-deal" }] } })
  assert.equal(ids(await test.resolve("(11) 99999-9999")), "phone-deal"); assert.equal(test.calls.phoneSearch, 1); assert.equal(test.calls.cpf, 0)
  assert.equal(test.calls.phoneSearchBody.filterGroups.map(group => group.filters[0].propertyName).sort().join(","), "mobilephone,phone")
  assert.equal(test.calls.phoneSearchBody.filterGroups[0].filters[0].value, "5511999999999")
  test = makeResolver({ phoneContacts: [{ id: "phone-2" }], dealsByContact: { "phone-2": [{ id: "numeric-phone-deal" }] } })
  assert.equal(ids(await test.resolve("11999999999")), "numeric-phone-deal"); assert.equal(test.calls.phoneSearch, 1); assert.equal(test.calls.cpf, 0)

  test = makeResolver({ phoneContacts: [{ id: "phone-a", properties: { phone: "5511999999999" } }, { id: "phone-b", properties: { mobilephone: "5511999999999" } }], dealsByContact: { "phone-a": [{ id: "a1" }], "phone-b": [{ id: "b1" }, { id: "b2" }] } })
  assert.equal(ids(await test.resolve("+55 11 99999-9999")), "a1,b1,b2"); assert.equal(test.calls.phoneSearch, 1); assert.equal(test.calls.strict, 2)
  assert.equal(test.calls.logs.some(event => JSON.stringify(event).includes("11999999999")), false)

  test = makeResolver({ contacts: [{ id: "a" }, { id: "b" }], dealsByContact: { a: [{ id: "a1" }, { id: "a2" }], b: [{ id: "b1" }] } })
  assert.equal(ids(await test.resolve("Joao Silva")), "a1,a2,b1")
  test = makeResolver({ contacts: [{ id: "a" }, { id: "b" }], dealsByContact: { a: [{ id: "123" }], b: [{ id: "456" }, { id: "123" }] }, fallback: { ok: true, deals: [{ id: "123" }, { id: "789" }], total: 2 } })
  assert.equal(ids(await test.resolve("Joao Silva")), "123,456,789")
  test = makeResolver({ contacts: [], fallback: { ok: true, deals: [{ id: "dealname" }], total: 1 } })
  assert.equal(ids(await test.resolve("Nome do Deal")), "dealname")
  assert.equal((await makeResolver({ phoneContacts: [] }).resolve("11999999999")).deals.length, 0)

  for (const options of [{ fail: { case: true } }, { invalidDeal: true }, { fail: { cpf: true } }, { fail: { phone: true } }, { fail: { name: true } }, { invalidContacts: true }, { invalidPhoneContacts: true }, { phoneContacts: [{ id: "a" }], fail: { deals: true } }, { contacts: [{ id: "a" }], dealsByContact: { a: "invalid" } }]) {
    const query = options.fail?.case || options.invalidDeal ? "PRV.260714.707" : options.fail?.cpf ? "52998224725" : options.fail?.phone || options.invalidPhoneContacts || options.phoneContacts ? "11999999999" : "Joao Silva"
    result = await makeResolver(options).resolve(query)
    assert.equal(result.ok, false, JSON.stringify(options))
  }
  console.log("admin-case-search-resolution.test.js: ok")
})().catch(error => { console.error(error); process.exitCode = 1 })
