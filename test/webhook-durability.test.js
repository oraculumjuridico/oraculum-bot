const assert = require("node:assert/strict")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")

const persistence = require("../src/domain/state-persistence")

function registro(messageId, texto = "mensagem confidencial") {
  const message = {
    id: messageId,
    from: "5581999999999",
    timestamp: "1783000000",
    type: "text",
    text: { body: texto }
  }
  return {
    key: persistence.criarChaveWebhookDuravel(message),
    messageId,
    from: message.from,
    receivedAt: "2026-07-02T12:00:00.000Z",
    payload: {
      value: {
        contacts: [{
          wa_id: message.from,
          profile: { name: "Cliente" }
        }]
      },
      message
    }
  }
}

function lerInbox(dataDir) {
  return JSON.parse(
    fs.readFileSync(path.join(dataDir, "webhook-inbox.json"), "utf8")
  )
}

async function main() {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "oraculum-webhook-inbox-"))
  const renameOriginal = fs.renameSync
  try {
    persistence.configurarStatePersistence({ DATA_DIR: dataDir })
    assert.deepEqual(
      persistence.carregarWebhookInbox(),
      { pending: 0, recovered: 0 }
    )

    const primeira = registro("wamid.primeira")
    const resultadoRegistro = persistence.registrarMensagensWebhook([primeira])
    assert.deepEqual(resultadoRegistro, {
      inserted: ["wamid.primeira"],
      duplicates: []
    })

    const persistidaAntesDoAck = lerInbox(dataDir)
    assert.equal(
      persistidaAntesDoAck.records["wamid.primeira"].status,
      "pending"
    )
    assert.equal(
      persistidaAntesDoAck.records["wamid.primeira"].messageId,
      "wamid.primeira"
    )
    assert.deepEqual(
      persistidaAntesDoAck.records["wamid.primeira"].payload,
      primeira.payload
    )
    assert.deepEqual(
      persistence.listarWebhookPendentes().map(item => item.key),
      ["wamid.primeira"]
    )

    assert.equal(
      persistence.marcarWebhookProcessing("wamid.primeira"),
      true
    )
    assert.equal(
      lerInbox(dataDir).records["wamid.primeira"].status,
      "processing"
    )

    const replayProcessing = persistence.carregarWebhookInbox()
    assert.deepEqual(replayProcessing, { pending: 1, recovered: 1 })
    assert.equal(
      persistence.listarWebhookPendentes()[0].status,
      "pending"
    )

    persistence.marcarWebhookProcessing("wamid.primeira")
    persistence.marcarWebhookError(
      "wamid.primeira",
      Object.assign(new Error("falha transitória"), { code: "ETIMEDOUT" })
    )
    const inboxComErro = lerInbox(dataDir)
    assert.equal(inboxComErro.records["wamid.primeira"].status, "error")
    assert.equal(
      inboxComErro.records["wamid.primeira"].lastError.code,
      "ETIMEDOUT"
    )

    const replayError = persistence.carregarWebhookInbox()
    assert.deepEqual(replayError, { pending: 1, recovered: 1 })
    assert.equal(
      persistence.listarWebhookPendentes()[0].status,
      "pending"
    )

    persistence.marcarWebhookProcessing("wamid.primeira")
    assert.equal(
      persistence.marcarWebhookCompleted("wamid.primeira"),
      true
    )
    const concluida = lerInbox(dataDir)
    assert.equal("wamid.primeira" in concluida.records, false)
    assert.equal(
      concluida.receipts["wamid.primeira"].messageId,
      "wamid.primeira"
    )
    assert.equal(
      JSON.stringify(concluida).includes("mensagem confidencial"),
      false
    )

    persistence.carregarWebhookInbox()
    const duplicadaAposRestart = persistence.registrarMensagensWebhook([
      registro("wamid.primeira", "não deve ser persistida")
    ])
    assert.deepEqual(duplicadaAposRestart, {
      inserted: [],
      duplicates: ["wamid.primeira"]
    })
    const aposDuplicata = lerInbox(dataDir)
    assert.equal(Object.keys(aposDuplicata.records).length, 0)
    assert.equal(Object.keys(aposDuplicata.receipts).length, 1)

    const segunda = registro("wamid.segunda", "segunda mensagem")
    persistence.registrarMensagensWebhook([segunda])
    persistence.carregarWebhookInbox()
    assert.deepEqual(
      persistence.listarWebhookPendentes().map(item => item.key),
      ["wamid.segunda"]
    )

    let falhasRename = 2
    fs.renameSync = (from, to) => {
      if (
        falhasRename > 0 &&
        String(from).includes("webhook-inbox.json.") &&
        String(to).endsWith("webhook-inbox.json")
      ) {
        falhasRename -= 1
        throw Object.assign(new Error("arquivo temporariamente bloqueado"), {
          code: "EPERM"
        })
      }
      return renameOriginal(from, to)
    }
    const terceira = registro("wamid.terceira", "terceira mensagem")
    persistence.registrarMensagensWebhook([terceira])
    fs.renameSync = renameOriginal
    assert.equal(falhasRename, 0)
    assert.equal(
      lerInbox(dataDir).records["wamid.terceira"].status,
      "pending"
    )

    const fallbackMessage = {
      from: "5581888888888",
      timestamp: "1783000001",
      type: "audio",
      audio: { id: "media-1" }
    }
    const fallbackA = persistence.criarChaveWebhookDuravel(fallbackMessage)
    const fallbackB = persistence.criarChaveWebhookDuravel(fallbackMessage)
    assert.equal(fallbackA, fallbackB)
    assert.match(fallbackA, /^fallback:[a-f0-9]{64}$/)

    const serverSource = fs.readFileSync(
      path.join(__dirname, "..", "server.js"),
      "utf8"
    )
    const endpointInicio = serverSource.indexOf('app.post("/webhook"')
    const endpointFim = serverSource.indexOf("const PORT", endpointInicio)
    const endpointSource = serverSource.slice(endpointInicio, endpointFim)
    const persistIndex = endpointSource.indexOf("registrarMensagensWebhook(mensagens)")
    const ackIndex = endpointSource.indexOf("res.sendStatus(200)")
    assert.ok(endpointInicio >= 0)
    assert.ok(persistIndex >= 0)
    assert.ok(ackIndex > persistIndex, "persistência deve ocorrer antes do ACK")
    assert.match(endpointSource, /catch[\s\S]*res\.sendStatus\(500\)/)

    const loadIndex = serverSource.indexOf("carregarWebhookInbox()")
    const listenIndex = serverSource.indexOf("app.listen(PORT")
    assert.ok(loadIndex >= 0)
    assert.ok(loadIndex < listenIndex, "inbox deve ser carregada antes do listen")
    assert.match(serverSource.slice(listenIndex), /drenarWebhookInbox/)

    const bloqueio = path.join(dataDir, "nao-e-diretorio")
    fs.writeFileSync(bloqueio, "arquivo")
    persistence.configurarStatePersistence({ DATA_DIR: bloqueio })
    persistence.carregarWebhookInbox()
    assert.throws(
      () => persistence.registrarMensagensWebhook([
        registro("wamid.falha-persistencia")
      ]),
      /EEXIST|ENOTDIR/
    )
  } finally {
    fs.renameSync = renameOriginal
    fs.rmSync(dataDir, { recursive: true, force: true })
  }
}

main()
  .then(() => console.log("webhook-durability.test.js: ok"))
  .catch(error => {
    console.error(error)
    process.exitCode = 1
  })
