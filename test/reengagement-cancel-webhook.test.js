const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")

const {
  cancelarReengajamentosPendentes,
  montarPayloadCancelamentoReengajamento
} = require("../src/domain/reengagement-cancel-webhook")

const envOriginal = {
  REENGAGEMENT_CANCEL_WEBHOOK_URL: process.env.REENGAGEMENT_CANCEL_WEBHOOK_URL,
  REENGAGEMENT_CANCEL_WEBHOOK_TIMEOUT_MS: process.env.REENGAGEMENT_CANCEL_WEBHOOK_TIMEOUT_MS
}

function restaurarEnv() {
  for (const [key, value] of Object.entries(envOriginal)) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
}

function loggerMock() {
  return {
    debug: [],
    erros: [],
    logDebug(...args) {
      this.debug.push(args)
    },
    logErro(...args) {
      this.erros.push(args)
    }
  }
}

async function main() {
  {
    const payload = montarPayloadCancelamentoReengajamento({
      phone: " 5511999990000 ",
      dealId: " deal-1 ",
      contactId: " contact-1 ",
      numeroCaso: " PREV.260701.001 ",
      receivedAt: "2026-07-09T12:00:00.000Z"
    })
    assert.deepEqual(payload, {
      phone: "5511999990000",
      dealId: "deal-1",
      contactId: "contact-1",
      numeroCaso: "PREV.260701.001",
      reason: "user_replied",
      receivedAt: "2026-07-09T12:00:00.000Z"
    })
  }

  {
    delete process.env.REENGAGEMENT_CANCEL_WEBHOOK_URL
    let chamadas = 0
    const resultado = cancelarReengajamentosPendentes(
      { phone: "5511999990000" },
      { httpClient: { post: async () => { chamadas += 1 } } }
    )
    assert.deepEqual(resultado, { disparado: false, motivo: "webhook_ausente" })
    assert.equal(chamadas, 0)
  }

  {
    const logger = loggerMock()
    let chamada = null
    const resultado = cancelarReengajamentosPendentes({
      phone: "5511999990000",
      dealId: "deal-1",
      contactId: "contact-1",
      numeroCaso: "PREV.260701.001",
      receivedAt: "2026-07-09T12:00:00.000Z"
    }, {
      webhookUrl: "https://make.example/reengajamento-cancelar",
      timeoutMs: 25,
      logger,
      httpClient: {
        post: async (url, payload, options) => {
          chamada = { url, payload, options }
          return { status: 202 }
        }
      }
    })

    assert.equal(resultado.disparado, true)
    assert.equal(resultado.payload.phone, "5511999990000")
    const final = await resultado.request
    assert.deepEqual(final, { ok: true, status: 202, payload: resultado.payload })
    assert.equal(chamada.url, "https://make.example/reengajamento-cancelar")
    assert.equal(chamada.options.timeout, 25)
    assert.equal(chamada.options.headers["Content-Type"], "application/json")
    assert.equal(logger.erros.length, 0)
    assert.equal(logger.debug.length, 1)
  }

  {
    const logger = loggerMock()
    const resultado = cancelarReengajamentosPendentes({ phone: "5511999990000" }, {
      webhookUrl: "https://make.example/reengajamento-cancelar",
      logger,
      httpClient: {
        post: async () => {
          const error = new Error("HTTP 500")
          error.response = { status: 500 }
          throw error
        }
      }
    })
    const final = await resultado.request
    assert.equal(final.ok, false)
    assert.equal(final.erro, "HTTP 500")
    assert.equal(logger.erros.length, 1)
  }

  {
    const logger = loggerMock()
    let timeoutRecebido = null
    const resultado = cancelarReengajamentosPendentes({ phone: "5511999990000" }, {
      webhookUrl: "https://make.example/reengajamento-cancelar",
      timeoutMs: 10,
      logger,
      httpClient: {
        post: async (_url, _payload, options) => {
          timeoutRecebido = options.timeout
          const error = new Error("timeout")
          error.code = "ECONNABORTED"
          throw error
        }
      }
    })
    const final = await resultado.request
    assert.equal(timeoutRecebido, 10)
    assert.equal(final.ok, false)
    assert.equal(final.erro, "timeout")
    assert.equal(logger.erros.length, 1)
  }

  {
    let resolver = null
    const pendente = new Promise(resolve => { resolver = resolve })
    const resultado = cancelarReengajamentosPendentes({ phone: "5511999990000" }, {
      webhookUrl: "https://make.example/reengajamento-cancelar",
      logger: loggerMock(),
      httpClient: {
        post: () => pendente
      }
    })
    assert.equal(resultado.disparado, true)
    resolver({ status: 200 })
    const final = await resultado.request
    assert.equal(final.ok, true)
  }

  {
    const serverSource = fs.readFileSync(path.join(__dirname, "..", "server.js"), "utf8")
    const trecho = serverSource.slice(
      serverSource.indexOf("const estadoHubSpotAntes = serializarEstado(u)"),
      serverSource.indexOf("const contextoResultado = await dispatchConversationContext")
    )
    assert.match(trecho, /cancelarReengajamentosPendentes\(/)
    assert.match(trecho, /reason:\s*"user_replied"/)
  }

  console.log("reengagement-cancel-webhook.test.js: ok")
}

main()
  .catch(error => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(restaurarEnv)
