"use strict"

const assert = require("node:assert/strict")
const axios = require("axios")
const { hsSincronizarNotaAnalise } = require("../src/domain/hubspot-core")
const { markerForCase } = require("../src/domain/hubspot-analysis-note")

const original = { get: axios.get, post: axios.post, patch: axios.patch, put: axios.put }
const originalHubSpotToken = process.env.HUBSPOT_TOKEN

async function main() {
  process.env.HUBSPOT_TOKEN = "fake-test-token"
  const requests = []
  let existing = false
  const marker = markerForCase("ORC.260814.900")
  axios.get = async url => {
    requests.push(["get", url])
    if (url.includes("/associations/notes")) {
      return { data: { results: existing ? [{ id: "note-analysis-1" }] : [] } }
    }
    throw new Error("URL inesperada")
  }
  axios.post = async (url, body) => {
    requests.push(["post", url, body])
    if (url.includes("/batch/read")) {
      return { data: { results: [{ id: "note-analysis-1", properties: { hs_note_body: `conteÃºdo\n${marker}` } }] } }
    }
    existing = true
    return { data: { id: "note-analysis-1" } }
  }
  axios.patch = async (url, body) => {
    requests.push(["patch", url, body])
    return { data: { id: "note-analysis-1" } }
  }
  axios.put = async url => {
    requests.push(["put", url])
    return { data: {} }
  }

  const input = {
    dealId: "deal-correct",
    contactId: "contact-certain",
    contactUnambiguous: true,
    caseNumber: "ORC.260814.900",
    clientName: "Cliente SintÃ©tico",
    summary: "Resumo sintÃ©tico sem dados reais."
  }
  const created = await hsSincronizarNotaAnalise(input)
  assert.equal(created.action, "created")
  const createRequest = requests.find(item => item[0] === "post" && item[1].endsWith("/objects/notes"))
  assert.ok(createRequest)
  assert.deepEqual(createRequest[2].associations.map(item => item.types[0].associationTypeId), [214, 202])
  assert.equal(requests.some(item => item[0] === "put"), false)

  const updated = await hsSincronizarNotaAnalise({ ...input, summary: "Resumo sintÃ©tico atualizado." })
  assert.equal(updated.action, "updated")
  assert.equal(updated.noteId, created.noteId)
  assert.equal(requests.filter(item => item[0] === "post" && item[1].endsWith("/objects/notes")).length, 1)
  assert.equal(requests.filter(item => item[0] === "post" && item[1].includes("/batch/read")).length, 1)
  assert.equal(requests.filter(item => item[0] === "patch").length, 1)
  assert.equal(requests.find(item => item[0] === "patch")[2].properties.hs_note_body.includes("Resumo sintÃ©tico atualizado."), true)
  console.log("hubspot-analysis-note-adapter.test.js: ok")
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
}).finally(() => {
  Object.assign(axios, original)
  if (originalHubSpotToken === undefined) delete process.env.HUBSPOT_TOKEN
  else process.env.HUBSPOT_TOKEN = originalHubSpotToken
})
