const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")

const {
  configurarClientMenuUi,
  menuCliente
} = require("../src/domain/client-menu-ui")
const {
  isClientScreen,
  gerarBotoesDaTela,
  gerarAudioDaTela
} = require("../src/domain/declarative-screen-guard")

configurarClientMenuUi({
  podeMostrarMenuCliente: () => true,
  respostaRecomecoMenuPrincipal: () => ({ texto: "Recomeçar", opcoes: null }),
  saudacaoPorHorarioCliente: () => "Bom dia",
  formatarSituacaoJuridica: situacao => situacao || "Em análise"
})

const usuario = {
  nome: "Maria Silva",
  numeroCaso: "ORA-1001",
  area: "Previdenciário",
  situacao: "Benefício em análise",
  _menuClienteJaApresentado: true,
  _mostrarPainelCasosCliente: false
}

const menu = menuCliente(usuario, null, {
  textoAudioBase: "Bom dia, Maria. Seu atendimento atual está em análise"
})
const idsMenu = ["m_status", "m_docs", "m_adv"]

assert.equal(isClientScreen(menu), true)
assert.equal(menu.id, "menu_principal_cliente")
assert.deepEqual(menu.acoes.map(acao => acao.id), idsMenu)
assert.deepEqual(gerarBotoesDaTela(menu).map(botao => botao.id), idsMenu)
for (const acao of menu.acoes) {
  assert.equal(
    gerarAudioDaTela(menu).includes(`Para ${acao.label}, toque em ${acao.label}`),
    true
  )
}

const casos = [
  {
    id: "deal-1",
    numeroCaso: "ORA-1001",
    area: "Previdenciário",
    situacao: "Em análise"
  },
  {
    id: "deal-2",
    numeroCaso: "ORA-1002",
    area: "Trabalhista",
    situacao: "Documentos pendentes"
  }
]
const usuarioComCasos = {
  ...usuario,
  negocioId: "deal-2",
  _mostrarPainelCasosCliente: true,
  _acaoPendente: "status"
}
const selecao = menuCliente(usuarioComCasos, casos)
const idsSelecao = ["m_caso_0", "m_caso_1", "m_novocaso"]

assert.equal(isClientScreen(selecao), true)
assert.equal(selecao.id, "selecao_caso_cliente")
assert.deepEqual(selecao.acoes.map(acao => acao.id), idsSelecao)
assert.deepEqual(gerarBotoesDaTela(selecao).map(botao => botao.id), idsSelecao)
for (const acao of selecao.acoes) {
  assert.equal(
    gerarAudioDaTela(selecao).includes(`Para ${acao.label}, toque em ${acao.label}`),
    true
  )
}

const menuAposSelecao = menuCliente({
  ...usuarioComCasos,
  _mostrarPainelCasosCliente: false
}, casos, {
  textoAudioBase: "Você selecionou o caso Trabalhista, número ORA-1002"
})
assert.match(menuAposSelecao.texto, /📂 \*Caso ativo:\*.*ORA-1002/)
assert.match(menuAposSelecao.textoAudioBase, /ORA-1002/)

const server = fs.readFileSync(path.join(__dirname, "..", "server.js"), "utf8")
const inicio = server.indexOf("async function menuClienteComAudio")
const fim = server.indexOf("async function abrirSelecaoCasoParaAcao", inicio)
const apresentador = server.slice(inicio, fim)

assert.match(apresentador, /gerarAudioDaTela\(tela\)/)
assert.match(apresentador, /gerarBotoesDaTela\(tela\)/)
assert.doesNotMatch(apresentador, /textoAudioOpcoesMenuCliente/)
assert.doesNotMatch(apresentador, /textoAudioSelecaoCaso/)

for (const trecho of [
  'if (text?.startsWith("m_caso_"))',
  "restaurarEstadoNegocioHubSpot(u, caso.negocio)",
  "if (acaoPendente) return await executarAcaoPendenteCliente(from, u)",
  'if (text === "m_inicio")'
]) {
  assert.equal(server.includes(trecho), true)
}

console.log("client-menu-declarative.test.js: ok")
