const assert = require("node:assert/strict")

const {
  telaClienteCasoAtualOuNovo,
  telaAudioClienteCasoAtualOuNovo,
  telaAudioNoFluxo,
  gerarFallbackEmpatico
} = require("../src/domain/client-message-builders")

const opcoesCaso = [
  { id: "audio_cliente_caso_atual", title: "📄 Caso atual" },
  { id: "audio_cliente_novo_caso", title: "➕ Novo caso" },
  { id: "m_inicio", title: "🏠 Menu do cliente" }
]

assert.deepEqual(telaAudioClienteCasoAtualOuNovo("Meu relato"), {
  texto: "🎙️ *Recebi seu áudio.*\n\nParece que você contou uma situação com detalhes:\n\n\"Meu relato\"\n\nEssa mensagem é sobre o caso atual ou você quer abrir um novo caso?",
  opcoes: opcoesCaso
})

assert.deepEqual(telaClienteCasoAtualOuNovo("Minha dúvida", "texto"), {
  texto: "💬 *Entendi sua dúvida.*\n\nParece que você quer saber se esta situação entra no caso atual ou se precisa abrir outro atendimento:\n\n\"Minha dúvida\"\n\nEssa mensagem é sobre o caso atual ou você quer abrir um novo caso?",
  opcoes: opcoesCaso
})
assert.match(telaClienteCasoAtualOuNovo("Minha dúvida", "audio").texto, /^🎙️ \*Recebi seu áudio\.\*/)

const relatoLongo = "a".repeat(361)
assert.match(telaAudioClienteCasoAtualOuNovo(relatoLongo).texto, new RegExp(`"${"a".repeat(360)}\\.\\.\\."`))
assert.match(telaClienteCasoAtualOuNovo(relatoLongo).texto, new RegExp(`"${"a".repeat(360)}\\.\\.\\."`))

assert.deepEqual(telaAudioNoFluxo("Relato transcrito", "enviar documentos"), {
  texto: "🎙️ *Áudio transcrito*\n\n\"Relato transcrito\"\n\nMinha recomendação agora é *enviar documentos*.\n\nComo você quer seguir?",
  opcoes: [
    { id: "audio_fluxo_seguir", title: "✅ Seguir recomendação" },
    { id: "audio_fluxo_recomecar", title: "🔄 Recomeçar" },
    { id: "audio_fluxo_encerrar", title: "👋 Encerrar" }
  ]
})
assert.match(telaAudioNoFluxo("", "").texto, /continuar o atendimento/)
assert.match(telaAudioNoFluxo("b".repeat(321), "continuar").texto, new RegExp(`"${"b".repeat(320)}\\.\\.\\."`))

assert.equal(
  gerarFallbackEmpatico("INSS", "alta"),
  "Entendo que você está sem receber e isso pesa muito. Vamos cuidar disso juntos."
)
assert.equal(
  gerarFallbackEmpatico("INSS", "normal"),
  "Entendo o quanto essa situação com o INSS é desgastante. Pode contar comigo."
)
assert.equal(
  gerarFallbackEmpatico("Consumidor", "alta"),
  "Você tem razão em buscar seus direitos. Nossa equipe vai analisar o que aconteceu."
)
assert.equal(
  gerarFallbackEmpatico("Outra", "normal"),
  "Entendi o que você está passando. Nossa equipe vai analisar seu caso com atenção."
)

console.log("client-message-builders.test.js: ok")
