"use strict"

const test = require("node:test")
const assert = require("node:assert/strict")
const templatesPath = require.resolve("../src/domain/meta-templates")
const validatorPath = require.resolve("../src/domain/meta-waba-validator")
const { META_TEMPLATES } = require("../src/domain/meta-templates")
const { enviarSolicitacaoAdaptativa } = require("../src/domain/post-human-adaptive-sender")
const { normalizarCatalogo, possuiHeader } = require("../src/domain/meta-waba-validator")

function repository() {
  return {
    updateStatus: async (_id, status, payload = {}) => ({ cycleId: "cycle", status, ...payload })
  }
}

test("contrato oficial v3 possui cabeçalho de imagem, um texto no corpo, rodapé e nenhum botão", () => {
  const template = META_TEMPLATES.casoAtualizacao
  assert.equal(template.nome, "caso_atualizacao_v3")
  assert.equal(template.idioma, "pt_BR")
  assert.equal(template.status, "APPROVED")
  assert.equal(template.categoria, "UTILITY")
  assert.equal(template.parametrosEsperados, 1)
  assert.deepEqual(template.componentes.map(item => item.tipo), ["HEADER", "BODY", "FOOTER"])
  assert.equal(template.componentes[0].formato, "IMAGE")
  assert.deepEqual(template.componentes[1].parametros, [{ tipo: "text", ordem: 1 }])
  assert.equal(template.componentes.some(item => item.tipo === "BUTTONS"), false)
})

test("mock fora da janela envia exatamente um texto e a mídia oficial", async () => {
  const calls = []
  const result = await enviarSolicitacaoAdaptativa({
    telefone: "fixture", solicitacao: { texto: "Solicitação objetiva" },
    usuario: { ultimaMsg: 1 }, cycle: { cycleId: "cycle" }, repository: repository(),
    deps: {
      templateConfig: { ...META_TEMPLATES.casoAtualizacao, headerImageUrl: "https://example.invalid/approved.png" },
      buildTemplateParams: solicitation => [solicitation.texto],
      sendTemplate: async (...args) => (calls.push(args), { id: "mock-id" })
    },
    now: () => Date.UTC(2026, 6, 28)
  })
  assert.equal(result.tipoEnvio, "template")
  assert.equal(calls[0][1], "caso_atualizacao_v3")
  assert.deepEqual(calls[0][2], ["Solicitação objetiva"])
  assert.equal(calls[0][4].headerImageUrl, "https://example.invalid/approved.png")
})

test("fora da janela bloqueia contrato ausente ou mídia oficial ausente", async () => {
  for (const templateConfig of [undefined, META_TEMPLATES.casoAtualizacao]) {
    let sent = 0
    const result = await enviarSolicitacaoAdaptativa({
      telefone: "fixture", solicitacao: { texto: "x" }, usuario: { ultimaMsg: 1 },
      cycle: { cycleId: "cycle" }, repository: repository(),
      deps: {
        templateConfig, buildTemplateParams: () => ["x"],
        sendTemplate: async () => { sent++ }
      },
      now: () => Date.UTC(2026, 6, 28)
    })
    assert.equal(result.failed, true)
    assert.equal(sent, 0)
  }
})

test("variável canônica POST_HUMAN_TEMPLATE_IMAGE_URL tem prioridade sobre alias legado", () => {
  const previousCanonical = process.env.POST_HUMAN_TEMPLATE_IMAGE_URL
  const previousLegacy = process.env.WHATSAPP_TEMPLATE_CASO_ATUALIZACAO_IMAGEM_URL
  try {
    process.env.POST_HUMAN_TEMPLATE_IMAGE_URL = "https://canonical.example/img.png"
    process.env.WHATSAPP_TEMPLATE_CASO_ATUALIZACAO_IMAGEM_URL = "https://legacy.example/img.png"
    delete require.cache[templatesPath]
    const { META_TEMPLATES: reloaded } = require(templatesPath)
    assert.equal(reloaded.casoAtualizacao.headerImageUrl, "https://canonical.example/img.png")
  } finally {
    if (previousCanonical === undefined) delete process.env.POST_HUMAN_TEMPLATE_IMAGE_URL
    else process.env.POST_HUMAN_TEMPLATE_IMAGE_URL = previousCanonical
    if (previousLegacy === undefined) delete process.env.WHATSAPP_TEMPLATE_CASO_ATUALIZACAO_IMAGEM_URL
    else process.env.WHATSAPP_TEMPLATE_CASO_ATUALIZACAO_IMAGEM_URL = previousLegacy
    delete require.cache[templatesPath]
  }
})

test("alias legado WHATSAPP_TEMPLATE_CASO_ATUALIZACAO_IMAGEM_URL continua funcionando", () => {
  const previousCanonical = process.env.POST_HUMAN_TEMPLATE_IMAGE_URL
  const previousLegacy = process.env.WHATSAPP_TEMPLATE_CASO_ATUALIZACAO_IMAGEM_URL
  try {
    delete process.env.POST_HUMAN_TEMPLATE_IMAGE_URL
    process.env.WHATSAPP_TEMPLATE_CASO_ATUALIZACAO_IMAGEM_URL = "https://legacy.example/img.png"
    delete require.cache[templatesPath]
    const { META_TEMPLATES: reloaded } = require(templatesPath)
    assert.equal(reloaded.casoAtualizacao.headerImageUrl, "https://legacy.example/img.png")
  } finally {
    if (previousCanonical === undefined) delete process.env.POST_HUMAN_TEMPLATE_IMAGE_URL
    else process.env.POST_HUMAN_TEMPLATE_IMAGE_URL = previousCanonical
    if (previousLegacy === undefined) delete process.env.WHATSAPP_TEMPLATE_CASO_ATUALIZACAO_IMAGEM_URL
    else process.env.WHATSAPP_TEMPLATE_CASO_ATUALIZACAO_IMAGEM_URL = previousLegacy
    delete require.cache[templatesPath]
  }
})

test("ausência das duas URLs mantém headerImageUrl vazio", () => {
  const previousCanonical = process.env.POST_HUMAN_TEMPLATE_IMAGE_URL
  const previousLegacy = process.env.WHATSAPP_TEMPLATE_CASO_ATUALIZACAO_IMAGEM_URL
  try {
    delete process.env.POST_HUMAN_TEMPLATE_IMAGE_URL
    delete process.env.WHATSAPP_TEMPLATE_CASO_ATUALIZACAO_IMAGEM_URL
    delete require.cache[templatesPath]
    const { META_TEMPLATES: reloaded } = require(templatesPath)
    assert.equal(reloaded.casoAtualizacao.headerImageUrl, "")
  } finally {
    if (previousCanonical === undefined) delete process.env.POST_HUMAN_TEMPLATE_IMAGE_URL
    else process.env.POST_HUMAN_TEMPLATE_IMAGE_URL = previousCanonical
    if (previousLegacy === undefined) delete process.env.WHATSAPP_TEMPLATE_CASO_ATUALIZACAO_IMAGEM_URL
    else process.env.WHATSAPP_TEMPLATE_CASO_ATUALIZACAO_IMAGEM_URL = previousLegacy
    delete require.cache[templatesPath]
  }
})

test("contrato com HEADER continua esperando HEADER mesmo sem URL", () => {
  const catalogo = normalizarCatalogo()
  const atualizacao = catalogo.find(item => item.id === "casoAtualizacao")
  assert.ok(atualizacao, "casoAtualizacao deve existir no catálogo")
  assert.equal(atualizacao.headerEsperado, true)
})

test("templates legados sem componentes caem para Boolean(headerImageUrl)", () => {
  const catalogo = normalizarCatalogo()
  const terceiro = catalogo.find(item => item.id === "casoTerceiroAberto")
  assert.ok(terceiro, "casoTerceiroAberto deve existir no catálogo")
  assert.equal(terceiro.headerEsperado, false)
})
