"use strict"

const assert = require("node:assert/strict")
const fs = require("node:fs")
const http = require("node:http")
const path = require("node:path")
const vm = require("node:vm")
const { createRequire } = require("node:module")

const root = path.join(__dirname, "..")
const serverPath = path.join(root, "server.js")
const realRequire = createRequire(serverPath)
const realConsultation = realRequire("./src/domain/consultation")

process.env.INTERNAL_WEBHOOK_SECRET = "test-secret"
process.env.DEBUG_LOGS = "false"

let scenario = null
const calls = []

const fakeAxios = {
  defaults: {},
  async get(url) {
    calls.push(url)
    return scenario.get(url)
  },
  async post() { throw new Error("UNEXPECTED_AXIOS_POST") },
  async patch() { throw new Error("UNEXPECTED_AXIOS_PATCH") },
  async delete() { throw new Error("UNEXPECTED_AXIOS_DELETE") }
}

function loadApp() {
  const source = fs.readFileSync(serverPath, "utf8")
  const sandbox = {
    __dirname: root,
    __filename: serverPath,
    Buffer,
    URL,
    clearImmediate,
    clearInterval,
    clearTimeout,
    console,
    global,
    module: { exports: {} },
    process,
    require(request) {
      if (request === "axios") return fakeAxios
      if (request === "./src/domain/consultation") {
        return {
          ...realConsultation,
          getConsultaCalendarEventState: async eventId => ({
            encontrado: true,
            eventId,
            status: "agendada",
            inicio: "2026-08-20T15:00:00.000Z",
            metadata: scenario.metadata
          })
        }
      }
      return realRequire(request)
    },
    setImmediate,
    setInterval,
    setTimeout
  }
  sandbox.exports = sandbox.module.exports
  vm.runInNewContext(source, sandbox, { filename: serverPath })
  return sandbox.module.exports.app
}

function listen(app) {
  return new Promise(resolve => {
    const server = app.listen(0, "127.0.0.1", () => resolve(server))
  })
}

function postJson(server, body) {
  const payload = JSON.stringify(body)
  const { port } = server.address()
  return new Promise((resolve, reject) => {
    const request = http.request({
      hostname: "127.0.0.1",
      port,
      path: "/consulta-lembrete-dados",
      method: "POST",
      headers: {
        "content-type": "application/json",
        "content-length": Buffer.byteLength(payload),
        "x-oraculum-secret": "test-secret"
      }
    }, response => {
      let raw = ""
      response.setEncoding("utf8")
      response.on("data", chunk => { raw += chunk })
      response.on("end", () => resolve({
        status: response.statusCode,
        body: raw ? JSON.parse(raw) : null
      }))
    })
    request.on("error", reject)
    request.end(payload)
  })
}

function close(server) {
  return new Promise(resolve => server.close(resolve))
}

;(async () => {
  const app = loadApp()
  const server = await listen(app)
  try {
    scenario = {
      metadata: { contactId: "contact-current", dealId: "deal-1" },
      async get(url) {
        if (url.includes("/contacts/contact-current?")) {
          return { data: { id: "contact-current", properties: { firstname: "Cliente", phone: "5511999999999" } } }
        }
        throw new Error(`UNEXPECTED_GET:${url}`)
      }
    }
    calls.length = 0
    const normal = await postJson(server, { eventId: "event-normal" })
    assert.equal(normal.status, 200)
    assert.equal(normal.body.phone, "5511999999999")
    assert.equal(calls.some(url => url.includes("/associations/contacts")), false)

    scenario = {
      metadata: { contactId: "contact-stale", dealId: "deal-1" },
      async get(url) {
        if (url.includes("/contacts/contact-stale?")) {
          throw Object.assign(new Error("not found"), { response: { status: 404 } })
        }
        if (url.includes("/deals/deal-1/associations/contacts")) {
          return { data: { results: [{ id: "contact-current" }] } }
        }
        if (url.includes("/contacts/contact-current?")) {
          return { data: { id: "contact-current", properties: { firstname: "Cliente", phone: "5511999999999" } } }
        }
        throw new Error(`UNEXPECTED_GET:${url}`)
      }
    }
    calls.length = 0
    const fallback = await postJson(server, { eventId: "event-fallback" })
    assert.equal(fallback.status, 200)
    assert.equal(fallback.body.phone, "5511999999999")
    assert.equal(calls.some(url => url.includes("/deals/deal-1/associations/contacts")), true)

    console.log("consultation-reminder-route.test.js: ok")
  } finally {
    await close(server)
  }
})().catch(error => {
  console.error(error)
  process.exit(1)
})
