"use strict"

const assert = require("node:assert/strict")
const {
  ehCallbackFluxoCliente,
  alinharEtapaAoCallbackCliente
} = require("../src/domain/client/client-flow-callback-router")

const STAGES = {
  CONFIRMACAO: "confirmacao",
  AUDIO_CONFIRMAR_DADOS: "audio_confirmar_dados",
  AGENDAMENTO_HORARIO: "agendamento_horario",
  AGENDAMENTO_DURACAO: "agendamento_duracao",
  AGENDAMENTO_CONFIRMAR: "agendamento_confirmar",
  CLIENTE: "cliente"
}

for (const texto of ["conf_ok", "conf_corrigir", "audio_dados_confirmar", "audio_dados_corrigir", "slot_0", "dur_30", "ag_confirmar"]) {
  assert.equal(ehCallbackFluxoCliente({ tipo: "interactive", texto }), true, texto)
}
assert.equal(ehCallbackFluxoCliente({ tipo: "audio", texto: "audio_dados_confirmar" }), false)

const confirmacaoAudio = {
  stage: "audio_aguardando",
  lastPerguntaPayload: { opcoes: [{ id: "audio_dados_confirmar" }, { id: "audio_dados_corrigir" }] }
}
assert.equal(alinharEtapaAoCallbackCliente(confirmacaoAudio, "audio_dados_confirmar", STAGES), true)
assert.equal(confirmacaoAudio.stage, STAGES.AUDIO_CONFIRMAR_DADOS)

const correcaoTexto = {
  stage: "audio_aguardando",
  lastPerguntaPayload: { opcoes: [{ id: "conf_ok" }, { id: "conf_corrigir" }] }
}
assert.equal(alinharEtapaAoCallbackCliente(correcaoTexto, "conf_corrigir", STAGES), true)
assert.equal(correcaoTexto.stage, STAGES.CONFIRMACAO)

const horario = { stage: "cliente", _slotsDisponiveis: ["2027-08-12T21:00:00.000Z"] }
assert.equal(alinharEtapaAoCallbackCliente(horario, "slot_0", STAGES), true)
assert.equal(horario.stage, STAGES.AGENDAMENTO_HORARIO)

const duracao = { stage: "cliente", _slotEscolhido: "2027-08-12T21:00:00.000Z" }
assert.equal(alinharEtapaAoCallbackCliente(duracao, "dur_30", STAGES), true)
assert.equal(duracao.stage, STAGES.AGENDAMENTO_DURACAO)

const agendamento = { stage: "cliente", _slotEscolhido: "2027-08-12T21:00:00.000Z" }
assert.equal(alinharEtapaAoCallbackCliente(agendamento, "ag_confirmar", STAGES), true)
assert.equal(agendamento.stage, STAGES.AGENDAMENTO_CONFIRMAR)

const antigo = {
  stage: "cliente",
  numeroCaso: "202608120001",
  lastPerguntaPayload: { opcoes: [{ id: "conf_ok" }] }
}
assert.equal(alinharEtapaAoCallbackCliente(antigo, "conf_ok", STAGES), false)
assert.equal(antigo.stage, "cliente")

const callbackSemTela = { stage: "audio_aguardando", lastPerguntaPayload: null }
assert.equal(alinharEtapaAoCallbackCliente(callbackSemTela, "conf_ok", STAGES), false)
assert.equal(callbackSemTela.stage, "audio_aguardando")

const documentosAposReinicio = {
  stage: "audio_aguardando",
  etapa: "audio_aguardando",
  numeroCaso: "CDC.260812.001",
  lastPerguntaPayload: null
}
assert.equal(alinharEtapaAoCallbackCliente(documentosAposReinicio, "docs_intro_ok", STAGES), true)
assert.equal(documentosAposReinicio.stage, STAGES.CLIENTE)

console.log("client-flow-callback-router.test.js: ok")
