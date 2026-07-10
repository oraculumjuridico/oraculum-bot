const assert = require("node:assert/strict")

const { dispatchConversationContext } = require("../src/domain/conversation-context-dispatcher")
const { defaultConversationContextRegistry } = require("../src/domain/conversation-context-registry")

async function main() {
  assert.ok(
    defaultConversationContextRegistry.listar().includes("template_reengajamento"),
    "handler template_reengajamento deve estar registrado"
  )

  const usuario = {
    contextoConversa: {
      tipo: "template_reengajamento",
      entidade: { jobId: "job-1" },
      dados: { tipoEvento: "abandono_2h" },
      expiracao: new Date(Date.now() + 60_000).toISOString()
    }
  }

  const resultado = await dispatchConversationContext({
    from: "5511999990000",
    nomeWA: "Cliente",
    text: "quero continuar",
    msgObj: { id: "wamid.1", type: "text" },
    usuario
  })

  assert.deepEqual(resultado, {
    consumiu: true,
    seguirFluxoNormal: true,
    resposta: null
  })
  assert.equal(usuario.contextoConversa, null)

  const consulta = {
    contextoConversa: {
      tipo: "template_consulta",
      entidade: { eventId: "evt-1" },
      dados: {},
      expiracao: new Date(Date.now() + 60_000).toISOString()
    }
  }
  const resultadoConsulta = await dispatchConversationContext({
    text: "ok",
    msgObj: { id: "wamid.2", type: "text" },
    usuario: consulta
  })
  assert.equal(resultadoConsulta.consumiu, false)
  assert.equal(consulta.contextoConversa.tipo, "template_consulta")

  console.log("conversation-context-reengagement.test.js: ok")
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
})
