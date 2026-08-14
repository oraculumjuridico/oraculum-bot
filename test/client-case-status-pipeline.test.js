"use strict"

const assert = require("node:assert/strict")
const {
  montarBarraStatusCliente,
  montarBlocoAgendamentoStatus,
  montarAudioStatusCliente
} = require("../src/domain/cliente-status-ui")

const AGENDAMENTO = "1343040832"
const PROTOCOLO = "1343040098"

const horario = new Date("2026-08-14T08:30:00-03:00")
const bloco = montarBlocoAgendamentoStatus(true, horario).join("\n")
assert.match(bloco, /08h30/, "status visual deve preservar os 30 minutos")
assert.doesNotMatch(bloco, /08h\*/, "status visual não pode arredondar 08h30 para 08h")

const duranteConsulta = montarBarraStatusCliente({
  stageAtualHS: AGENDAMENTO,
  todosDocsEnviados: false,
  temFaltantesCriticos: true,
  temAgendamentoAtivo: true,
  temEventoCalendar: true,
  consultaPassou: false
})
assert.match(duranteConsulta, /✅ Registro/)
assert.match(duranteConsulta, /🔄 \*Análise jurídica\*/)
assert.match(duranteConsulta, /🔄 \*Documentos\*/)
assert.match(duranteConsulta, /🔄 \*Consulta com advogado\*/)
assert.match(duranteConsulta, /⚪ Protocolo/)

const emProtocolo = montarBarraStatusCliente({
  stageAtualHS: PROTOCOLO,
  todosDocsEnviados: true,
  temFaltantesCriticos: false,
  temAgendamentoAtivo: false,
  temEventoCalendar: true,
  consultaPassou: true
})
assert.match(emProtocolo, /✅ Análise jurídica/)
assert.match(emProtocolo, /✅ Documentos/)
assert.match(emProtocolo, /✅ Consulta com advogado/)
assert.match(emProtocolo, /🔄 \*Protocolo\*/)

assert.match(
  montarAudioStatusCliente({ stageAtualHS: AGENDAMENTO }),
  /consulta agendada com o advogado/
)

console.log("client-case-status-pipeline.test.js: ok")
