const assert = require("node:assert/strict")

const {
  removerFormatacaoParaAudio,
  textoAudioOpcoes,
  textoAudioAutomatico,
  textoTemMarcadorVisual
} = require("../src/domain/text-utils")

assert.equal(removerFormatacaoParaAudio("*Olá* _mundo_"), "Olá mundo")
assert.equal(
  removerFormatacaoParaAudio("Consulte o CNIS"),
  "Consulte o extrato de contribuições do Meu INSS"
)
assert.equal(removerFormatacaoParaAudio("Item • Outro ━ Fim"), "Item . Outro . Fim")
assert.equal(removerFormatacaoParaAudio("```texto```"), "texto")

assert.equal(textoAudioOpcoes(), "")
assert.equal(
  textoAudioOpcoes(
    [
      { title: "✅ Sim!" },
      { title: "  " },
      { title: "❌ Não." }
    ],
    "Escolha"
  ),
  "Escolha: Primeira opcao: ✅ Sim. Segunda opcao: ❌ Não."
)

assert.equal(
  textoAudioAutomatico({
    texto: "*Escolha uma opção*",
    opcoes: [
      { title: "Continuar" },
      { title: "Voltar" }
    ]
  }),
  "Escolha uma opção Opcoes na tela: Primeira opcao: Continuar. Segunda opcao: Voltar."
)
assert.equal(textoAudioAutomatico({ texto: "Texto simples" }), "Texto simples")
assert.equal(textoAudioAutomatico({ texto: "palavra ".repeat(200) }).endsWith("..."), true)

assert.equal(textoTemMarcadorVisual("📄 Documento recebido"), true)
assert.equal(textoTemMarcadorVisual("😀 Olá"), true)
assert.equal(textoTemMarcadorVisual("Mensagem sem marcador"), false)
assert.equal(textoTemMarcadorVisual(""), true)

console.log("audio-text-utils.test.js: ok")
