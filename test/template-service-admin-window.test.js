const assert = require("node:assert/strict")
const transport = require("../src/domain/whatsapp-transport")

const originalFreeform = transport.enviar
const originalTemplate = transport.enviarTemplateWhatsApp
const originalFreeformResult = transport.enviarComResultado
const originalTemplateResult = transport.enviarTemplateComResultado
const originalImageResult = transport.enviarImagemComResultado
const modulePath = require.resolve("../src/domain/template-service")

async function loadWithMocks({ imageAccepted = true } = {}) {
  let freeform = 0
  let image = 0
  let template = 0
  transport.enviar = async () => { freeform++; return true }
  transport.enviarTemplateWhatsApp = async () => { template++; return true }
  transport.enviarComResultado = async () => { freeform++; return { accepted: true, providerMessageId: "wamid.free", httpStatus: 200, channel: "freeform", destinationMasked: "5511*****9999", immediateError: null } }
  transport.enviarImagemComResultado = async () => {
    image++
    return imageAccepted
      ? { accepted: true, providerMessageId: "wamid.image", httpStatus: 200, channel: "freeform_image", destinationMasked: "5511*****9999", immediateError: null }
      : { accepted: false, channel: "freeform_image", destinationMasked: "5511*****9999", immediateError: "image_send_failed" }
  }
  transport.enviarTemplateComResultado = async () => { template++; return { accepted: true, providerMessageId: "wamid.template", httpStatus: 200, channel: "template", destinationMasked: "5511*****9999", immediateError: null } }
  delete require.cache[modulePath]
  const service = require(modulePath)
  return {
    service,
    counts: () => ({ freeform, image, template })
  }
}

;(async () => {
  const recent = await loadWithMocks()
  const free = await recent.service.atualizacaoCasoSegura("5511999999999", {
    ultimaMsg: Date.now() - 60_000,
    texto: "Mensagem recente",
    resumoTemplate: "Resumo"
  })
  assert.equal(free.channel, "freeform_image")
  assert.equal(free.fallback, false)
  assert.equal(free.providerMessageId, "wamid.image")
  assert.deepEqual(recent.counts(), { freeform: 0, image: 1, template: 0 })

  const fallback = await loadWithMocks({ imageAccepted: false })
  const textFallback = await fallback.service.atualizacaoCasoSegura("5511999999999", {
    ultimaMsg: Date.now() - 60_000,
    texto: "Mensagem recente"
  })
  assert.equal(textFallback.channel, "freeform_text")
  assert.equal(textFallback.fallback, true)
  assert.equal(textFallback.providerMessageId, "wamid.free")
  assert.deepEqual(fallback.counts(), { freeform: 1, image: 1, template: 0 })

  const old = await loadWithMocks()
  const templated = await old.service.atualizacaoCasoSegura("5511999999999", {
    ultimaMsg: Date.now() - 25 * 60 * 60 * 1000,
    texto: "Mensagem antiga",
    resumoTemplate: "Resumo aprovado"
  })
  assert.equal(templated.channel, "template")
  assert.deepEqual(old.counts(), { freeform: 0, image: 0, template: 1 })
  transport.enviar = originalFreeform
  transport.enviarTemplateWhatsApp = originalTemplate
  transport.enviarComResultado = originalFreeformResult
  transport.enviarTemplateComResultado = originalTemplateResult
  transport.enviarImagemComResultado = originalImageResult
  console.log("template-service-admin-window.test.js: ok")
})().catch(error => {
  transport.enviar = originalFreeform
  transport.enviarTemplateWhatsApp = originalTemplate
  transport.enviarComResultado = originalFreeformResult
  transport.enviarTemplateComResultado = originalTemplateResult
  transport.enviarImagemComResultado = originalImageResult
  console.error(error)
  process.exitCode = 1
})
