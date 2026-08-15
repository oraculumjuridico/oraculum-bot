"use strict"

const assert = require("node:assert/strict")
const axios = require("axios")
const { hsSincronizarNotaOperacional } = require("../src/domain/hubspot-core")

const original = { get: axios.get, post: axios.post, patch: axios.patch, put: axios.put }
const originalHubSpotToken = process.env.HUBSPOT_TOKEN

async function main() {
  process.env.HUBSPOT_TOKEN = "fake-test-token"
  const requests = []
  let existing = false
  axios.get = async url => {
    requests.push(["get", url])
    return { data: { results: existing ? [{ id: "note-operational-1" }] : [] } }
  }
  axios.post = async (url, body) => {
    requests.push(["post", url, body])
    if (url.includes("/batch/read")) {
      return { data: { results: [{ id: "note-operational-1", properties: { hs_note_body: "[ORACULUM_OPERATIONAL:PRV.1]" } }] } }
    }
    existing = true
    return { data: { id: "note-operational-1" } }
  }
  axios.patch = async (url, body) => {
    requests.push(["patch", url, body])
    return { data: { id: "note-operational-1" } }
  }
  axios.put = async url => {
    requests.push(["put", url])
    return { data: {} }
  }

  const input = {
    dealId: "deal-1",
    contactId: "contact-1",
    caseNumber: "PRV.1",
    vaultUrl: "https://oraculum.example/admin/credenciais/token-seguro"
  }
  const created = await hsSincronizarNotaOperacional(input)
  const updated = await hsSincronizarNotaOperacional(input)
  assert.equal(created.action, "created")
  assert.equal(updated.action, "updated")
  assert.equal(requests.filter(item => item[0] === "post" && item[1].endsWith("/objects/notes")).length, 1)
  const body = requests.find(item => item[0] === "post" && item[1].endsWith("/objects/notes"))[2].properties.hs_note_body
  assert.match(body, /DADOS PESSOAIS E CREDENCIAIS · PRV\.1/)
  assert.match(body, /ABRIR REGISTRO SEGURO/)
  assert.match(body, /<a href=/)
  assert.match(body, /token-seguro/)
  assert.doesNotMatch(body, /senha123|password_ciphertext/)
  console.log("hubspot-operational-note-adapter.test.js: ok")
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
}).finally(() => {
  Object.assign(axios, original)
  if (originalHubSpotToken === undefined) delete process.env.HUBSPOT_TOKEN
  else process.env.HUBSPOT_TOKEN = originalHubSpotToken
})
