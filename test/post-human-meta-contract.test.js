"use strict"

const test = require("node:test")
const assert = require("node:assert/strict")
const { META_TEMPLATES } = require("../src/domain/meta-templates")
const { enviarSolicitacaoAdaptativa } = require("../src/domain/post-human-adaptive-sender")

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
