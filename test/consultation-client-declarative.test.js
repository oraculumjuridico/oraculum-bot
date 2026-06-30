const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")

const {
  isClientScreen,
  gerarBotoesDaTela,
  gerarAudioDaTela
} = require("../src/domain/declarative-screen-guard")
const {
  telaConsultaAdvogado,
  telaBuscandoHorarios,
  telaConsultaSemHorarios,
  telaHorariosConsulta,
  telaDuracaoConsulta,
  telaConfirmacaoConsulta,
  telaFalhaAgendamento,
  telaAgendamentoConfirmado,
  telaConfirmarCancelamentoConsulta,
  telaCancelamentoIndisponivel,
  telaConsultaCancelada,
  telaFalhaCancelamentoConsulta
} = require("../src/domain/client-appointment-ui")
const { opcoesStatusCliente } = require("../src/domain/cliente-status-ui")

const slots = [
  new Date("2026-07-01T13:00:00.000Z"),
  new Date("2026-07-01T14:00:00.000Z")
]
const telas = [
  telaConsultaAdvogado("📂 Caso ativo: ORA-1"),
  telaBuscandoHorarios(),
  telaConsultaSemHorarios("📂 Caso ativo: ORA-1"),
  telaHorariosConsulta({
    cabecalhoCaso: "📂 Caso ativo: ORA-1",
    slots,
    pagina: 1,
    temMais: true,
    formatarSlot: slot => slot.toISOString()
  }),
  telaDuracaoConsulta({
    dataHora: "1º de julho às 10h",
    dataHoraAudio: "primeiro de julho às dez horas",
    primeiroNome: "Maria"
  }),
  telaConfirmacaoConsulta({
    dataHora: "1º de julho às 10h",
    dataHoraAudio: "primeiro de julho às dez horas",
    duracao: "30 minutos",
    nome: "Maria",
    numeroCaso: "ORA-1"
  }),
  telaFalhaAgendamento(),
  telaAgendamentoConfirmado({
    dataHora: "1º de julho às 10h",
    dataHoraAudio: "primeiro de julho às dez horas",
    duracao: "30 minutos",
    numeroCaso: "ORA-1",
    primeiroNome: "Maria"
  }),
  telaConfirmarCancelamentoConsulta("1º de julho às 10h", "primeiro de julho às dez horas"),
  telaCancelamentoIndisponivel(),
  telaCancelamentoIndisponivel({ alterada: true }),
  telaConsultaCancelada("1º de julho às 10h", "primeiro de julho às dez horas"),
  telaFalhaCancelamentoConsulta()
]

assert.equal(telas.length, 13)
for (const tela of telas) {
  assert.equal(isClientScreen(tela), true, `${tela.id} deve usar createClientScreen`)
  assert.deepEqual(
    gerarBotoesDaTela(tela).map(botao => botao.id),
    tela.acoes.map(acao => acao.id),
    `${tela.id} deve derivar a UI de acoes[]`
  )
  const audio = gerarAudioDaTela(tela)
  for (const acao of tela.acoes) {
    assert.equal(
      audio.includes(`Para ${acao.label}, toque em ${acao.label}`),
      true,
      `${tela.id} deve narrar ${acao.id}`
    )
  }
}

assert.deepEqual(
  telaConsultaAdvogado("").acoes.map(acao => acao.id),
  ["adv_agendar_ligacao", "adv_urg", "m_inicio"]
)
assert.deepEqual(
  telaHorariosConsulta({
    slots,
    pagina: 1,
    temMais: true,
    formatarSlot: slot => slot.toISOString()
  }).acoes.map(acao => acao.id),
  ["slots_pagina_anterior", "slot_0", "slot_1", "slots_proxima_pagina", "m_inicio"]
)
assert.deepEqual(
  telaDuracaoConsulta().acoes.map(acao => acao.id),
  ["dur_20", "dur_30", "dur_45", "dur_60", "m_inicio"]
)
assert.deepEqual(
  telaConfirmacaoConsulta().acoes.map(acao => acao.id),
  ["ag_confirmar", "ag_outro_horario", "m_inicio"]
)
assert.deepEqual(
  telaConfirmarCancelamentoConsulta().acoes.map(acao => acao.id),
  ["cliente_cancelar_consulta_sim", "m_status"]
)

const statusComConsulta = opcoesStatusCliente(null, false, true).map(opcao => opcao.id)
assert.deepEqual(
  statusComConsulta,
  ["adv_agendar_ligacao", "cliente_cancelar_consulta", "m_inicio"],
  "reagendamento e cancelamento devem continuar disponíveis no status"
)

const server = fs.readFileSync(path.join(__dirname, "..", "server.js"), "utf8")
for (const trecho of [
  "setStage(u, STAGES.AGENDAMENTO_HORARIO)",
  "setStage(u, STAGES.AGENDAMENTO_DURACAO)",
  "setStage(u, STAGES.AGENDAMENTO_CONFIRMAR)",
  'if (text === "slots_proxima_pagina")',
  'if (text === "slots_pagina_anterior")',
  'if (text === "ag_outro_horario")',
  'if (text === "ag_confirmar")',
  "criarEventoConsulta(u, slot, duracao",
  "cancelarEventoConsultaUsuario(u, \"cancelado_cliente_whatsapp\"",
  'if (text === "cliente_cancelar_consulta_sim")'
]) {
  assert.equal(server.includes(trecho), true, `fluxo preservado: ${trecho}`)
}

const inicioAgendamento = server.indexOf("async function iniciarAgendamento")
const fimAgendamento = server.indexOf("function textoAudioOpcoes", inicioAgendamento)
const apresentacaoAgendamento = server.slice(inicioAgendamento, fimAgendamento)
assert.match(apresentacaoAgendamento, /telaHorariosConsulta\(/)
assert.match(apresentacaoAgendamento, /gerarAudioDaTela\(telaHorarios\)/)
assert.match(apresentacaoAgendamento, /gerarBotoesDaTela\(telaHorarios\)/)
assert.doesNotMatch(apresentacaoAgendamento, /const opcoes = slots/)

const inicioStages = server.indexOf("if (u.stage === STAGES.AGENDAMENTO_HORARIO)")
const fimStages = server.indexOf("async function processarInterno", inicioStages)
const stagesAgendamento = server.slice(inicioStages, fimStages)
assert.doesNotMatch(stagesAgendamento, /opcoes:\s*\[/)
assert.doesNotMatch(stagesAgendamento, /Primeira opção: confirmar/)

console.log("consultation-client-declarative.test.js: ok")
