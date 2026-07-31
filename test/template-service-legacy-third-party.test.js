"use strict"
const assert = require("node:assert/strict")
const transportPath = require.resolve("../src/domain/whatsapp-transport")
const servicePath = require.resolve("../src/domain/template-service")
const templatesPath = require.resolve("../src/domain/meta-templates")
const previousFlag = process.env.POST_HUMAN_COMPLEMENTATION_ENABLED
const previousName = process.env.WHATSAPP_TEMPLATE_TERCEIRO
;(async () => {
  try {
    process.env.POST_HUMAN_COMPLEMENTATION_ENABLED = "false"
    process.env.WHATSAPP_TEMPLATE_TERCEIRO = "caso_terceiro_aberto"
    delete require.cache[servicePath]; delete require.cache[templatesPath]
    const calls = []
    require.cache[transportPath] = { id: transportPath, filename: transportPath, loaded: true, exports: {
      enviar: async () => true,
      enviarTemplateWhatsApp: async (...args) => { calls.push(args); return true }
    } }
    const service = require("../src/domain/template-service")
    assert.equal(await service.casoTerceiro("5511999999999", {
      nomeAtendido: "Maria Silva", nomeSolicitante: "Joao Souza",
      numeroCaso: "CASO-123", area: "Civil"
    }), true)
    assert.equal(calls.length, 1)
    assert.deepEqual(calls[0].slice(0, 4), [
      "5511999999999", "caso_terceiro_aberto",
      ["Maria", "Joao", "CASO-123", "Civil"], "pt_BR"
    ])
    console.log("RESULT 1/1 legacy third-party template passed")
  } finally {
    delete require.cache[servicePath]; delete require.cache[templatesPath]; delete require.cache[transportPath]
    if (previousFlag === undefined) delete process.env.POST_HUMAN_COMPLEMENTATION_ENABLED
    else process.env.POST_HUMAN_COMPLEMENTATION_ENABLED = previousFlag
    if (previousName === undefined) delete process.env.WHATSAPP_TEMPLATE_TERCEIRO
    else process.env.WHATSAPP_TEMPLATE_TERCEIRO = previousName
  }
})().catch(error => { console.error(error); process.exitCode = 1 })
