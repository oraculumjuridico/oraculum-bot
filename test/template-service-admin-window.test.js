const assert = require("node:assert/strict")
const transport = require("../src/domain/whatsapp-transport")

const originalFreeform = transport.enviar
const originalTemplate = transport.enviarTemplateWhatsApp
const modulePath = require.resolve("../src/domain/template-service")

async function loadWithMocks() {
  let freeform = 0
  let template = 0
  transport.enviar = async () => { freeform++; return true }
  transport.enviarTemplateWhatsApp = async () => { template++; return true }
  delete require.cache[modulePath]
  const service = require(modulePath)
  return { service, counts: () => ({ freeform, template }) }
}

;(async () => {
  const recent = await loadWithMocks()
  const free = await recent.service.atualizacaoCasoSegura("5511999999999", {
    ultimaMsg: Date.now() - 60_000,
    texto: "Mensagem recente",
    resumoTemplate: "Resumo"
  })
  assert.equal(free.channel, "freeform")
  assert.deepEqual(recent.counts(), { freeform: 1, template: 0 })

  const old = await loadWithMocks()
  const templated = await old.service.atualizacaoCasoSegura("5511999999999", {
    ultimaMsg: Date.now() - 25 * 60 * 60 * 1000,
    texto: "Mensagem antiga",
    resumoTemplate: "Resumo aprovado"
  })
  assert.equal(templated.channel, "template")
  assert.deepEqual(old.counts(), { freeform: 0, template: 1 })
  transport.enviar = originalFreeform
  transport.enviarTemplateWhatsApp = originalTemplate
  console.log("template-service-admin-window.test.js: ok")
})().catch(error => {
  transport.enviar = originalFreeform
  transport.enviarTemplateWhatsApp = originalTemplate
  console.error(error)
  process.exitCode = 1
})
