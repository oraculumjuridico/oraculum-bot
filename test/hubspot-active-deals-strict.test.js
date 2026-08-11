"use strict"

const assert = require("node:assert/strict")
const axios = require("axios")
const {
  configurarHubSpotSync,
  hsListarNegociosAtivosDoContatoEstrito
} = require("../src/domain/hubspot-sync")

configurarHubSpotSync({ HS_STAGE: { FINAL: "final" } })

const originalGet = axios.get

async function withAxiosGet(get, run) {
  axios.get = get
  try {
    await run()
  } finally {
    axios.get = originalGet
  }
}

;(async () => {
  await withAxiosGet(async url => {
    if (url.includes("/associations/deals")) return { data: { results: [{ id: "deal-1" }] } }
    return { data: { id: "deal-1", properties: { dealstage: "open", dealname: "Caso ativo", createdate: "2026-01-01" } } }
  }, async () => {
    const result = await hsListarNegociosAtivosDoContatoEstrito("contact-1")
    assert.deepEqual(result.ok, true)
    assert.deepEqual(result.deals.map(deal => deal.id), ["deal-1"])
  })

  await withAxiosGet(async () => ({ data: { results: [] } }), async () => {
    assert.deepEqual(await hsListarNegociosAtivosDoContatoEstrito("contact-empty"), { ok: true, deals: [] })
  })

  await withAxiosGet(async () => { throw Object.assign(new Error("network"), { code: "ECONNRESET" }) }, async () => {
    const result = await hsListarNegociosAtivosDoContatoEstrito("contact-error")
    assert.equal(result.ok, false)
    assert.equal(result.errorCode, "ECONNRESET")
  })

  await withAxiosGet(async () => ({ data: { results: "invalid" } }), async () => {
    const result = await hsListarNegociosAtivosDoContatoEstrito("contact-invalid")
    assert.equal(result.ok, false)
    assert.equal(result.errorCode, "INVALID_HUBSPOT_RESPONSE")
  })

  console.log("hubspot-active-deals-strict.test.js: ok")
})().catch(error => { console.error(error); process.exitCode = 1 })
