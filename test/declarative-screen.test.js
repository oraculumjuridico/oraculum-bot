const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")

const {
  criarTela,
  gerarBotoesDaTela,
  gerarAudioDaTela
} = require("../src/domain/declarative-screen")

const tela = criarTela({
  id: "status_cliente",
  titulo: "Status do caso",
  textoAudioBase: "Seu caso está em análise.",
  acoes: [
    { id: "m_docs", label: "Enviar documentos" },
    { id: "m_adv", label: "Falar com advogado" },
    { id: "m_inicio", label: "Menu do cliente" }
  ]
})

assert.deepEqual(gerarBotoesDaTela(tela), [
  { id: "m_docs", title: "Enviar documentos" },
  { id: "m_adv", title: "Falar com advogado" },
  { id: "m_inicio", title: "Menu do cliente" }
])

const audio = gerarAudioDaTela(tela)
for (const acao of tela.acoes) {
  assert.match(audio, new RegExp(`Para ${acao.label}, toque em ${acao.label}`))
}

assert.equal(
  criarTela({
    id: "filtrada",
    titulo: "Filtrada",
    textoAudioBase: "Escolha",
    acoes: [null, { id: "ok", label: "Continuar" }, false]
  }).acoes.length,
  1
)

const server = fs.readFileSync(
  path.join(__dirname, "..", "server.js"),
  "utf8"
)
const inicio = server.indexOf("async function telaStatusCliente")
const fim = server.indexOf("async function telaConfirmarCancelamentoConsultaCliente", inicio)
assert.notEqual(inicio, -1)
assert.notEqual(fim, -1)
const statusCliente = server.slice(inicio, fim)

assert.match(statusCliente, /const telaStatus = criarTela\(\{/)
assert.match(statusCliente, /acoes: opcoesStatusCliente\(/)
assert.match(statusCliente, /gerarAudioDaTela\(telaStatus\)/)
assert.match(statusCliente, /gerarBotoesDaTela\(telaStatus\)/)
assert.equal(
  statusCliente.match(/opcoesStatusCliente\(/g)?.length,
  1,
  "as opções de status devem ser calculadas uma única vez"
)

console.log("declarative-screen.test.js: ok")
