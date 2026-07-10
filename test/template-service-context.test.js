const assert = require("node:assert/strict")

const transportPath = require.resolve("../src/domain/whatsapp-transport")
const servicePath = require.resolve("../src/domain/template-service")

let chamadasTemplate = 0
let proximoResultado = true

require.cache[transportPath] = {
  id: transportPath,
  filename: transportPath,
  loaded: true,
  exports: {
    enviar: async () => true,
    enviarTemplateWhatsApp: async () => {
      chamadasTemplate += 1
      return proximoResultado
    }
  }
}
delete require.cache[servicePath]

const templateService = require("../src/domain/template-service")

async function main() {
  const contexto = {
    tipo: "template_consulta",
    entidade: { eventId: "evt-1" },
    dados: { templateTipo: "consulta_lembrete_24h" },
    expiracao: new Date(Date.now() + 60_000).toISOString()
  }

  const semUsuario = await templateService.consultaLembrete("5581999999999", "24h", [], {
    contextoConversa: contexto,
    requireContextoConversa: true
  })
  assert.equal(semUsuario, false)
  assert.equal(chamadasTemplate, 0)

  const usuario = { contextoConversa: null }
  const enviado = await templateService.consultaLembrete("5581999999999", "24h", [], {
    usuario,
    contextoConversa: contexto,
    requireContextoConversa: true
  })
  assert.equal(enviado, true)
  assert.equal(chamadasTemplate, 1)
  assert.equal(usuario.contextoConversa.tipo, "template_consulta")

  const anterior = { tipo: "anterior" }
  const usuarioComContexto = { contextoConversa: anterior }
  proximoResultado = false
  const falhou = await templateService.consultaLembrete("5581999999999", "24h", [], {
    usuario: usuarioComContexto,
    contextoConversa: contexto,
    requireContextoConversa: true
  })
  assert.equal(falhou, false)
  assert.equal(usuarioComContexto.contextoConversa, anterior)

  console.log("template-service-context.test.js: ok")
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
})
