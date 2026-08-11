"use strict"

const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const { inspecionarRespostaBuscaHubSpotAdmin } = require("../src/domain/admin-hubspot-search-response")
const { logInfo } = require("../src/utils/logging")

const responseEmpty = inspecionarRespostaBuscaHubSpotAdmin({ status: 200, data: { results: [], total: 0 } })
assert.equal(responseEmpty.ok, true)
assert.equal(responseEmpty.metadata.rawResultCount, 0)

const responseDeal = inspecionarRespostaBuscaHubSpotAdmin({ status: 200, data: { results: [{ id: "deal-1" }], total: 1, paging: { next: { after: "next" } } } })
assert.equal(responseDeal.ok, true)
assert.equal(responseDeal.metadata.rawResultCount, 1)
assert.equal(responseDeal.metadata.hasPaging, true)

for (const data of [undefined, null, "invalid", {}, { results: "invalid" }, { results: {} }, { results: null }]) {
  const inspected = inspecionarRespostaBuscaHubSpotAdmin({ status: 200, data })
  assert.equal(inspected.ok, false)
  assert.equal(inspected.reason, "invalid_hubspot_response")
}

const logs = []
const originalLog = console.log
console.log = value => logs.push(String(value))
try {
  logInfo({
    event: "admin.hubspot.search", status: "success", operation: "adminBuscarNegociosDireto",
    searchType: "direct", httpStatus: 200, resultsIsArray: true, rawResultCount: 0,
    total: 0, hasPaging: false, durationMs: 12, payload: "Bearer secret CPF 123.456.789-00"
  })
} finally {
  console.log = originalLog
}
const payload = JSON.parse(logs[0])
assert.equal(payload.httpStatus, "200")
assert.equal(payload.rawResultCount, "0")
assert.equal(Object.hasOwn(payload, "payload"), false)
assert.doesNotMatch(logs[0], /secret|123\.456\.789-00/)

const source = fs.readFileSync(path.join(__dirname, "..", "server.js"), "utf8")
assert.match(source, /inspecionarRespostaBuscaHubSpotAdmin\(res\)/)
assert.match(source, /errorCode: "INVALID_HUBSPOT_RESPONSE"/)
assert.match(source, /status: inspecao\.ok \? "success" : "invalid_response"/)
assert.match(source, /if \(!prioridades\.ok\) return telaAdminFalhaHubSpot\(\)/)
assert.match(source, /if \(!resumo\.ok\) return telaAdminFalhaHubSpot\(\)/)
assert.match(source, /if \(!resultado\.ok\) \{[\s\S]*?return \{ \.\.\.resultado, deals: \[\] \}/)

console.log("admin-hubspot-search-response.test.js: ok")
