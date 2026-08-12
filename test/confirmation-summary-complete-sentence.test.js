"use strict"

const assert = require("node:assert/strict")

delete process.env.GROQ_KEY

const { gerarResumoDescricaoConfirmacao } = require("../src/domain/audio-legal-ai")

async function main() {
  const descricao = "Trabalhei durante três anos em uma loja. Fui demitido sem receber corretamente a rescisão. Também fazia horas extras todos os dias. Tenho documentos e conversas com o gerente."
  const u = { descricao }
  const resumo = await gerarResumoDescricaoConfirmacao(u)

  assert.equal(resumo, descricao)
  assert.doesNotMatch(resumo, /\.\.\.|…/)
  assert.match(resumo, /[.!?]$/)
  assert.equal(u.descricao, descricao, "o relato integral deve permanecer armazenado")

  console.log("confirmation-summary-complete-sentence.test.js: ok")
}

main().catch(erro => {
  console.error(erro)
  process.exitCode = 1
})
