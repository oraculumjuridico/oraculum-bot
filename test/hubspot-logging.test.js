const assert = require("node:assert/strict")
const {
  configurarLogging,
  detalhesErroHubSpot,
  logErroHubSpot
} = require("../src/utils/logging")

function executar() {
  const erroHttp = new Error(
    "Falha para telefone 5511999999999 CPF 123.456.789-01 Bearer token-secreto"
  )
  erroHttp.response = {
    status: 429,
    data: {
      category: "RATE_LIMITS",
      correlationId: "correlation-123",
      message: erroHttp.message
    },
    headers: {
      authorization: "Bearer nao-pode-aparecer",
      "x-hubspot-correlation-id": "correlation-header"
    }
  }

  const detalhes = detalhesErroHubSpot(erroHttp, {
    operation: "atualizarNegocio",
    contactId: "contact-123",
    dealId: "deal-456",
    properties: {
      dealname: "Relato privado",
      urgencia: "Alta"
    }
  })

  assert.equal(detalhes.operation, "atualizarNegocio")
  assert.equal(detalhes.contactId, "contact-123")
  assert.equal(detalhes.dealId, "deal-456")
  assert.equal(detalhes.httpStatus, 429)
  assert.equal(detalhes.correlationId, "correlation-123")
  assert.equal(detalhes.errorCode, "RATE_LIMITS")
  assert.deepEqual(detalhes.properties, ["dealname", "urgencia"])
  assert.equal(detalhes.message.includes("token-secreto"), false)
  assert.equal(detalhes.message.includes("5511999999999"), false)
  assert.equal(detalhes.message.includes("123.456.789-01"), false)
  assert.equal(JSON.stringify(detalhes).includes("Relato privado"), false)
  assert.equal(JSON.stringify(detalhes).includes("nao-pode-aparecer"), false)

  const erroSemResposta = new Error("socket timeout")
  erroSemResposta.code = "ETIMEDOUT"
  const semResposta = detalhesErroHubSpot(erroSemResposta, {
    operation: "buscarContato"
  })
  assert.equal(semResposta.httpStatus, null)
  assert.equal(semResposta.correlationId, null)
  assert.equal(semResposta.errorCode, "ETIMEDOUT")
  assert.equal(semResposta.message, "socket timeout")

  const porHeader = new Error("erro")
  porHeader.response = {
    status: 500,
    data: {},
    headers: { "x-hubspot-correlation-id": "correlation-header" }
  }
  assert.equal(
    detalhesErroHubSpot(porHeader).correlationId,
    "correlation-header"
  )

  const monitor = { erros: [] }
  const consoleErrorOriginal = console.error
  console.error = () => {}
  try {
    configurarLogging({ monitor })
    const registrado = logErroHubSpot(erroHttp, {
      operation: "atualizarContato",
      contactId: "contact-123",
      properties: ["firstname"]
    })
    assert.equal(registrado.httpStatus, 429)
    assert.equal(monitor.erros.length, 1)
    assert.equal(monitor.erros[0].tipo, "hubspot")
    assert.equal(monitor.erros[0].msg.includes("token-secreto"), false)
    assert.equal(monitor.erros[0].msg.includes("5511999999999"), false)
    assert.equal(monitor.erros[0].msg.includes("123.456.789-01"), false)
  } finally {
    console.error = consoleErrorOriginal
  }

  console.log("hubspot-logging.test.js: ok")
}

try {
  executar()
} catch (erro) {
  console.error(erro)
  process.exitCode = 1
}
