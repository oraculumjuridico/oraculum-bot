const assert = require("node:assert/strict")
const fs = require("node:fs")
const http = require("node:http")
const os = require("node:os")
const path = require("node:path")
const vm = require("node:vm")
const { createRequire } = require("node:module")

const root = path.join(__dirname, "..")
const realRequire = createRequire(path.join(root, "server.js"))
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "oraculum-health-interno-"))

process.env.INTERNAL_WEBHOOK_SECRET = "test-secret"
process.env.CALLBACK_IDEMPOTENCY_FILE = path.join(tempDir, "callback-idempotency.json")
process.env.REENGAGEMENT_CANCEL_WEBHOOK_URL = "https://example.invalid/segredo-nao-deve-aparecer"
process.env.DEBUG_LOGS = "false"
process.env.ORACULUM_DATA_DIR = tempDir

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

function getJson(server, pathUrl) {
  const { port } = server.address()
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: "127.0.0.1",
      port,
      path: pathUrl,
      method: "GET",
      headers: { "x-internal-secret": "test-secret" }
    }, res => {
      let raw = ""
      res.setEncoding("utf8")
      res.on("data", chunk => { raw += chunk })
      res.on("end", () => resolve({
        status: res.statusCode,
        body: raw ? JSON.parse(raw) : null
      }))
    })
    req.on("error", reject)
    req.end()
  })
}

function prepararArquivos() {
  fs.mkdirSync(tempDir, { recursive: true })
  fs.writeFileSync(
    path.join(tempDir, "users-state.json"),
    JSON.stringify({ savedAt: new Date().toISOString(), users: {} }, null, 2),
    "utf8"
  )
  fs.writeFileSync(
    process.env.CALLBACK_IDEMPOTENCY_FILE,
    JSON.stringify({
      schemaVersion: 1,
      updatedAt: new Date().toISOString(),
      records: {
        processingAtual: {
          status: "processing",
          expiresAt: new Date(Date.now() + 60_000).toISOString()
        },
        completedAtual: {
          status: "completed",
          expiresAt: new Date(Date.now() + 60_000).toISOString()
        },
        completedExpirado: {
          status: "completed",
          expiresAt: new Date(Date.now() - 60_000).toISOString()
        }
      }
    }, null, 2),
    "utf8"
  )
}

(async () => {
  prepararArquivos()
  const { app } = carregarServerParaTeste()
  const statePersistence = realRequire("./src/domain/state-persistence")
  const { logErro } = realRequire("./src/utils/logging")

  statePersistence.registrarMensagensWebhook([
    { key: "pending-1", messageId: "m1", from: "5511999990000", receivedAt: new Date().toISOString(), payload: {} },
    { key: "processing-1", messageId: "m2", from: "5511999990001", receivedAt: new Date().toISOString(), payload: {} },
    { key: "error-1", messageId: "m3", from: "5511999990002", receivedAt: new Date().toISOString(), payload: {} },
    { key: "completed-1", messageId: "m4", from: "5511999990003", receivedAt: new Date().toISOString(), payload: {} }
  ])
  statePersistence.marcarWebhookProcessing("processing-1")
  statePersistence.marcarWebhookProcessing("error-1")
  statePersistence.marcarWebhookError("error-1", new Error("erro teste"))
  statePersistence.marcarWebhookCompleted("completed-1")

  const consoleErrorOriginal = console.error
  console.error = () => {}
  try {
    logErro("hubspot", "erro teste hubspot")
    logErro("hubspot", "erro teste hubspot 2")
    logErro("drive", "erro teste drive")
  } finally {
    console.error = consoleErrorOriginal
  }

  const server = await listen(app)
  try {
    const resposta = await getJson(server, "/health-interno")
    assert.equal(resposta.status, 200)

    assert.deepEqual(resposta.body.callbackIdempotency, {
      totalRecords: 3,
      processing: 1,
      completed: 2,
      expired: 1
    })
    assert.equal(resposta.body.webhookInbox.pending, 1)
    assert.equal(resposta.body.webhookInbox.processing, 1)
    assert.equal(resposta.body.webhookInbox.error, 1)
    assert.equal(resposta.body.webhookInbox.completed, 1)
    assert.equal(resposta.body.persistencia.usersStateExists, true)
    assert.equal(resposta.body.persistencia.dataDirConfigured, true)
    assert.equal(resposta.body.persistencia.dataDirWritable, true)
    assert.equal(resposta.body.persistenciaExterna.enabled, false)
    assert.equal(resposta.body.persistenciaExterna.provider, "local-ephemeral")
    assert.ok(resposta.body.persistencia.usersStateLastModified)
    assert.equal(resposta.body.persistencia.webhookInboxExists, true)
    assert.equal(resposta.body.persistencia.callbackStoreExists, true)
    assert.equal(resposta.body.ultimosErrosPorCategoria.hubspot, 2)
    assert.equal(resposta.body.ultimosErrosPorCategoria.drive, 1)
    assert.equal(resposta.body.reengajamento.REENGAGEMENT_CANCEL_WEBHOOK_URL_configurado, true)
    assert.equal(JSON.stringify(resposta.body).includes("example.invalid"), false)
    assert.equal(JSON.stringify(resposta.body).includes("segredo-nao-deve-aparecer"), false)
  } finally {
    await fechar(server)
    fs.rmSync(tempDir, { recursive: true, force: true })
  }

  console.log("health-interno-operacional.test.js: ok")
  process.exit(0)
})().catch(err => {
  console.error(err)
  process.exit(1)
})
