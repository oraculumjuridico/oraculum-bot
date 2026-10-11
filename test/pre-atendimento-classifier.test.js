const assert = require("node:assert/strict")
const {
  detectarCampoCorrecaoPreAtendimento,
  classificarEntradaPreAtendimento
} = require("../src/domain/pre-atendimento-classifier")

;(async () => {
  for (const [mensagem, tema] of [
    ["Quero corrigir minha cidade", "cidade"],
    ["Meu WhatsApp está errado", "whatsapp"],
    ["O telefone não é esse", "whatsapp"],
    ["Esse não é meu WhatsApp", "whatsapp"],
    ["Meu nome está errado", "nome"],
    ["Na verdade, a urgência é alta", "urgencia"],
    ["Quero corrigir o relato", "descricao"]
  ]) {
    const resultado = await classificarEntradaPreAtendimento("confirmacao", mensagem, { usarIA: false })
    assert.deepEqual(resultado, { tipo: "correcao", confianca: 1, tema, origem: "regra" })
  }

  assert.equal(detectarCampoCorrecaoPreAtendimento("nome"), "nome")
  assert.equal(detectarCampoCorrecaoPreAtendimento("CEP"), "cidade")

  const relato = await classificarEntradaPreAtendimento(
    "audio_aguardando",
    "Meu marido me agrediu e preciso de ajuda",
    { usarIA: false }
  )
  assert.notEqual(relato.tipo, "correcao")

  console.log("pre-atendimento-classifier.test.js: ok")
})().catch(error => {
  console.error(error)
  process.exitCode = 1
})
