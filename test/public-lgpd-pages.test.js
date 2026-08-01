"use strict"

const test = require("node:test")
const assert = require("node:assert/strict")
const http = require("node:http")
const { app } = require("../server")

function get(server, path) {
  return new Promise((resolve, reject) => {
    const executeRequest = () => {
      const address = server.address()
      const request = http.get({ host: "127.0.0.1", port: address.port, path }, response => {
        const chunks = []
        response.on("data", chunk => chunks.push(chunk))
        response.on("end", () => resolve({
          status: response.statusCode,
          contentType: response.headers["content-type"],
          body: Buffer.concat(chunks).toString("utf8")
        }))
      })
      request.on("error", reject)
    }

    if (server.listening) executeRequest()
    else server.once("listening", executeRequest)
  })
}

test("rotas públicas LGPD respondem HTML 200 com conteúdo e navegação esperados", async t => {
  const server = app.listen(0, "127.0.0.1")
  t.after(() => new Promise(resolve => server.close(resolve)))

  const privacy = await get(server, "/politica-de-privacidade")
  assert.equal(privacy.status, 200)
  assert.match(privacy.contentType, /^text\/html/)
  for (const text of [
    "Oráculum Advocacia e Consultoria Jurídica",
    "Meta/WhatsApp",
    "HubSpot",
    "Google Drive",
    "Seus direitos",
    "oraculum.juridico@gmail.com",
    "/exclusao-de-dados"
  ]) assert.match(privacy.body, new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")))

  const deletion = await get(server, "/exclusao-de-dados")
  assert.equal(deletion.status, 200)
  assert.match(deletion.contentType, /^text\/html/)
  for (const text of [
    "Solicitação de exclusão de dados",
    "nome completo",
    "número de WhatsApp",
    "número do protocolo",
    "Confirmação",
    "hipótese permitida pela LGPD",
    "/politica-de-privacidade"
  ]) assert.match(deletion.body, new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")))

  const combined = privacy.body + deletion.body
  assert.doesNotMatch(combined, /HUBSPOT_TOKEN|WHATSAPP_TOKEN|GOOGLE_CLIENT_SECRET|Bearer\s+[A-Za-z0-9._-]+/)
})
