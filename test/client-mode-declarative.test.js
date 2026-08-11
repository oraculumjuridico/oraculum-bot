const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")

const {
  isClientScreen,
  gerarBotoesDaTela,
  gerarAudioDaTela
} = require("../src/domain/declarative-screen-guard")
const { telaModoAtendimento } = require("../src/domain/client-mode-ui")
const { perguntaAtualPreAtendimento } = require("../src/domain/pre-atendimento-ui")

const telas = [
  telaModoAtendimento(),
  telaModoAtendimento({ atendente: "Ana", boasVindas: true }),
  telaModoAtendimento({ reapresentacao: true })
]
const idsEsperados = ["modo_audio", "modo_texto"]

for (const tela of telas) {
  assert.equal(isClientScreen(tela), true)
  assert.equal(tela.id, "modo_atendimento")
  assert.deepEqual(tela.acoes.map(acao => acao.id), idsEsperados)
  assert.deepEqual(gerarBotoesDaTela(tela).map(botao => botao.id), idsEsperados)
  const audio = gerarAudioDaTela(tela)
  for (const acao of tela.acoes) {
    assert.equal(
      audio.includes(`Para ${acao.label}, toque em ${acao.label}`),
      true
    )
  }
  assert.equal(tela.audio, audio)
}

assert.match(telas[1].textoAudioBase, /Meu nome é Ana/)
assert.match(telas[2].textoAudioBase, /Não entendi sua resposta/)

const perguntaEstrutural = perguntaAtualPreAtendimento("acolhimento_modo", {
  atendente: "Ana"
})
assert.equal(isClientScreen(perguntaEstrutural), true)
assert.deepEqual(
  perguntaEstrutural.opcoes.map(opcao => opcao.id),
  idsEsperados
)

const server = fs.readFileSync(path.join(__dirname, "..", "server.js"), "utf8")
const inicio = server.indexOf("async function telaEscolhaModo")
const fim = server.indexOf("async function telaParaQuem", inicio)
const apresentador = server.slice(inicio, fim)

assert.match(apresentador, /telaModoAtendimento\(\{/)
assert.match(apresentador, /gerarAudioDaTela\(tela\)/)
assert.match(apresentador, /gerarBotoesDaTela\(tela\)/)
assert.doesNotMatch(apresentador, /gerarAudioAtendente/)
assert.doesNotMatch(apresentador, /const opcoes =/)

for (const trecho of [
  "setStage(u, STAGES.ACOLHIMENTO_MODO)",
  "const modoAtendimento = detectarModoAtendimento(text)",
  'definirPreferenciaComunicacao(u, from, modoAtendimento === "texto" ? "texto" : "audio_sempre", "pre_atendimento")',
  "return await telaParaQuem(from, u)",
  "return await telaEscolhaModo(from, u, { comAudio: true })"
]) {
  assert.equal(server.includes(trecho), true, `fluxo preservado: ${trecho}`)
}

for (const legadoRemovido of [
  "Falha áudio reapresentação escolha modo",
  "Falha áudio boas-vindas+modo",
  "Falha áudio escolha modo"
]) {
  assert.equal(server.includes(legadoRemovido), false)
}

console.log("client-mode-declarative.test.js: ok")
