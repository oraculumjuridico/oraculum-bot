const assert = require("node:assert/strict")

const {
  formatarSituacaoJuridica,
  formatarDetalheJuridico,
  resumirFrasesCompletas,
  detectarReferenciaTerceiro,
  formatarValorCorrecao,
  classificarReuniaoCliente
} = require("../src/domain/text-utils")

assert.equal(formatarSituacaoJuridica("cortado"), "Benefício previdenciário cancelado indevidamente")
assert.equal(formatarSituacaoJuridica("", "Demissao"), "Demissão sem justa causa")
assert.equal(formatarSituacaoJuridica("", "", "novo_assunto"), "Novo assunto")
assert.equal(formatarSituacaoJuridica(), "Não informado")

assert.equal(formatarDetalheJuridico("benefício negado"), "Benefício negado.")
assert.equal(formatarDetalheJuridico("já termina!"), "Já termina!")
assert.equal(formatarDetalheJuridico("", "resumo disponível"), "Resumo disponível.")
assert.equal(formatarDetalheJuridico(), "Não informado")
assert.equal(formatarDetalheJuridico("a".repeat(141)), `${"A"}${"a".repeat(140)}.`)
assert.equal(
  resumirFrasesCompletas("Primeira frase completa. Segunda frase também completa. Terceira frase que não deve entrar.", 55),
  "Primeira frase completa. Segunda frase também completa."
)
assert.equal(resumirFrasesCompletas("Relato longo sem pontuação " + "detalhado ".repeat(30), 50).includes("..."), false)

const referenciaMae = detectarReferenciaTerceiro("Preciso de atendimento para minha mãe")
assert.equal(referenciaMae?.relacao, "mae")
assert.equal(referenciaMae?.label, "mãe")
assert.equal(detectarReferenciaTerceiro("O atendimento é para mim"), null)

assert.equal(
  formatarValorCorrecao("cidade", "Campinas", { uf: "SP", regiao: "Sudeste" }),
  "Campinas, SP (Sudeste)"
)
assert.equal(formatarValorCorrecao("nome", "  Maria  "), "Maria")
assert.equal(formatarValorCorrecao("nome", null), "Não informado")

for (const entrada of [
  { summary: "[CASO] Reunião" },
  { description: "Consulta jurídica" },
  { tituloHubSpot: "Consulta principal" },
  { corpoHubSpot: "Consulta com advogado" }
]) {
  assert.equal(classificarReuniaoCliente(entrada), "consulta_caso")
}
assert.equal(classificarReuniaoCliente({ summary: "Reunião interna" }), "pontual")
assert.equal(classificarReuniaoCliente(), "pontual")

console.log("text-utils.test.js: ok")
