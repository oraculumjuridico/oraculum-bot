"use strict"

const assert = require("node:assert/strict")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")
const vm = require("node:vm")
const { createRequire } = require("node:module")

const root = path.join(__dirname, "..")
const serverPath = path.join(root, "server.js")
const realRequire = createRequire(serverPath)
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "oraculum-post-human-off-"))
const previous = {}
for (const [key, value] of Object.entries({
  NODE_ENV: "test",
  PORT: "0",
  ORACULUM_DATA_DIR: tempDir,
  POST_HUMAN_COMPLEMENTATION_ENABLED: "false",
  POST_HUMAN_PILOT_CASES: "FLAG-OFF-1",
  DATABASE_URL: "",
  EXTERNAL_STATE_DATABASE_URL: "",
  WHATSAPP_TOKEN: "",
  PHONE_NUMBER_ID: "",
  WABA_ID: ""
})) {
  previous[key] = process.env[key]
  process.env[key] = value
}

const calls = {
  repositoryConstructed: 0,
  repositoryInitialized: 0,
  recovery: 0,
  meta: 0,
  hubspot: 0,
  drive: 0,
  featureSend: 0
}

class FakePostHumanCycleRepository {
  constructor() { calls.repositoryConstructed++ }
  async initialize() { calls.repositoryInitialized++; throw new Error("nao deveria inicializar") }
  async listRecoverable() { calls.recovery++; return [] }
}

function loadServer() {
  let source = fs.readFileSync(serverPath, "utf8")
  source = source.replace(
    /iniciarServidor\(\)\s*$/,
    "module.exports = { iniciarServidor, encerrarServidor, telaDetalheCasoAdmin, sessoesAdminWhatsApp, users }"
  )
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
      if (request === "./src/domain/post-human-cycle-model") {
        const real = realRequire(request)
        return { ...real, PostHumanCycleRepository: FakePostHumanCycleRepository }
      }
      if (request === "./src/domain/meta-waba-validator") {
        return { validarMetaWabaNoBoot: async () => { calls.meta++; return { ok: true } } }
      }
      if (request === "./src/infrastructure/external-state-repository") {
        const real = realRequire(request)
        return {
          ...real,
          initializeExternalStateRepository: async () => ({ enabled: false, restoredFiles: 0 }),
          getPool: () => null,
          closeExternalStateRepository: async () => {}
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
  return sandbox.module.exports
}

;(async () => {
  console.log("BOOT_TEST loading")
  const loaded = loadServer()
  console.log("BOOT_TEST starting")
  await loaded.iniciarServidor()
  console.log("BOOT_TEST started")
  assert.equal(calls.repositoryConstructed, 0)
  assert.equal(calls.repositoryInitialized, 0)
  assert.equal(calls.recovery, 0)

  loaded.sessoesAdminWhatsApp.set("5511999999999", {
    casos: [{
      from: "5511888888888",
      u: { negocioId: "deal-off", contatoId: "contact-off", numeroCaso: "FLAG-OFF-1", nome: "Teste" }
    }],
    casoIdx: 0
  })
  const screen = await loaded.telaDetalheCasoAdmin("5511999999999", 0)
  assert.ok(!screen.opcoes.some(option => String(option?.id || "").startsWith("admin_post_human_completed_")))

  const { montarBotaoAtendimentoRealizado, _actionContextCountForTests } =
    realRequire("./src/domain/admin-post-human-complementation")
  assert.equal(montarBotaoAtendimentoRealizado("deal-off", "FLAG-OFF-1", {
    adminId: "5511999999999", contatoId: "contact-off"
  }), null)
  assert.equal(_actionContextCountForTests(), 0)

  const { createPostHumanDispatcher } = realRequire("./src/domain/post-human-dispatcher")
  let repositoryReads = 0
  const dispatcher = createPostHumanDispatcher({
    isEnabled: () => false,
    repository: { getActiveCycles: async () => { repositoryReads++; return [] } },
    saveInformation: async () => { calls.hubspot++ },
    legacyDocumentPipeline: async () => { calls.drive++ }
  })
  const response = await dispatcher({
    from: "5511888888888",
    msgType: "text",
    content: "mensagem antiga",
    usuario: { contatoId: "contact-off" }
  })
  assert.equal(response.handled, false)
  assert.equal(response.legacyFlowAllowed, true)
  let legacyCalls = 0
  if (response.legacyFlowAllowed) legacyCalls++
  assert.equal(legacyCalls, 1)
  assert.equal(repositoryReads, 0)
  assert.equal(calls.hubspot, 0)
  assert.equal(calls.drive, 0)
  assert.equal(calls.featureSend, 0)

  assert.equal(calls.meta, 1)
  console.log("RESULT 1/1 server flag off passed")
  await loaded.encerrarServidor("TEST")
})().finally(() => {
  for (const [key, value] of Object.entries(previous)) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
  fs.rmSync(tempDir, { recursive: true, force: true })
}).catch(error => {
  console.error(error)
  process.exitCode = 1
})
