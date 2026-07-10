const assert = require("node:assert/strict")
const fs = require("node:fs")
const http = require("node:http")
const os = require("node:os")
const path = require("node:path")
const vm = require("node:vm")
const { createRequire } = require("node:module")
const { logInfo } = require("../src/utils/logging")

const root = path.join(__dirname, "..")
const realRequire = createRequire(path.join(root, "server.js"))
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "oraculum-operational-logging-"))

process.env.INTERNAL_WEBHOOK_SECRET = "test-secret"
process.env.CALLBACK_IDEMPOTENCY_FILE = path.join(tempDir, "callback-idempotency.json")
process.env.DEBUG_LOGS = "false"

const fakeTemplateService = {
  retomadaAtendimento: async () => true,
  casoAtualizacao: async () => true,
  consultaLembrete: async () => true,
  templateTipoConsultaLembrete: tipo => `consulta_${tipo}`
}

function carregarServerParaTeste() {
  const serverPath = path.join(root, "server.js")
  let source = fs.readFileSync(serverPath, "utf8")
  source = source.replace(
    'const USERS_STATE_FILE = path.join(DATA_DIR, "users-state.json")',
    `const USERS_STATE_FILE = ${JSON.stringify(path.join(tempDir, "users-state.json"))}`
  )
  source = source.replace("carregarUsersPersistidos()\r\ncarregarWebhookInbox()\r\ncarregarSessoesAdminAssistidasPersistidas(sessoesAdminWhatsApp)\r\nrestaurarTimersPersistidos()", "")
  source = source.replace("carregarUsersPersistidos()\ncarregarWebhookInbox()\ncarregarSessoesAdminAssistidasPersistidas(sessoesAdminWhatsApp)\nrestaurarTimersPersistidos()", "")
  source = source.replace(/iniciarServidor\(\)\s*$/, "module.exports = { app, users }")

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
    require: request => {
      if (request === "./src/domain/template-service") return fakeTemplateService
      if (request === "./src/domain/meta-waba-validator") {
        return { validarMetaWabaNoBoot: async () => ({ ok: true }) }
      }
      return realRequire(request)
    },
    setImmediate,
    setInterval,
    setTimeout
  }
  sandbox.exports = sandbox.module.exports

  vm.runInNewContext(source, sandbox, { filename: serverPath })
  return sandbox.module.exports
}

function listen(app) {
  return new Promise(resolve => {
    const server = app.listen(0, "127.0.0.1", () => resolve(server))
  })
}

function fechar(server) {
  return new Promise(resolve => server.close(resolve))
}

function postJson(server, pathUrl, body) {
  const { port } = server.address()
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(body || {})
    const req = http.request({
      hostname: "127.0.0.1",
      port,
      path: pathUrl,
      method: "POST",
      headers: {
        "content-type": "application/json",
        "content-length": Buffer.byteLength(payload),
        "x-internal-secret": "test-secret"
      }
    }, res => {
      let raw = ""
      res.setEncoding("utf8")
      res.on("data", chunk => { raw += chunk })
      res.on("end", () => {
        let json = null
        try { json = raw ? JSON.parse(raw) : null } catch {}
        resolve({
          status: res.statusCode,
          requestId: res.headers["x-request-id"],
          body: json
        })
      })
    })
    req.on("error", reject)
    req.write(payload)
    req.end()
  })
}

(async () => {
  const logs = []
  const consoleLogOriginal = console.log
  console.log = message => logs.push(String(message))

  try {
    const info = logInfo({
      event: "teste.operacional",
      route: "/teste",
      status: "ok",
      requestId: "req-1",
      phone: "5511999999999",
      dealId: "deal-1",
      contactId: "contact-1",
      numeroCaso: "PREV.260701.001"
    })
    assert.equal(info.event, "teste.operacional")
    assert.equal(info.phoneMasked, "5511*****9999")
    assert.equal(logs.at(-1).includes("5511999999999"), false)

    const { app } = carregarServerParaTeste()
    const server = await listen(app)
    try {
      logs.length = 0
      const resposta = await postJson(server, "/reengagement-candidates", {})
      assert.equal(resposta.status, 200)
      assert.ok(resposta.requestId)
      assert.deepEqual(resposta.body, { candidates: [] })

      const estruturados = logs.map(item => {
        try { return JSON.parse(item) } catch { return null }
      }).filter(Boolean)
      const inicio = estruturados.find(item => item.event === "endpoint.start")
      const fim = estruturados.find(item => item.event === "endpoint.finish")
      assert.ok(inicio)
      assert.ok(fim)
      assert.equal(inicio.requestId, resposta.requestId)
      assert.equal(fim.requestId, resposta.requestId)
      assert.equal(fim.status, "200")
      assert.equal(typeof fim.durationMs, "number")
    } finally {
      await fechar(server)
    }
  } finally {
    console.log = consoleLogOriginal
    fs.rmSync(tempDir, { recursive: true, force: true })
  }

  console.log("operational-logging.test.js: ok")
  process.exit(0)
})().catch(err => {
  console.error(err)
  process.exit(1)
})
