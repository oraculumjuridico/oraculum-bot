const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const {
  classificarEstadoEvento,
  selecionarEventoConsultaMaisRecente,
  horarioDentroDoExpediente
} = require("../src/domain/calendar-scheduling")
const { calcularMetricasConsulta } = require("../src/domain/consultation-metrics")

const dealId = "deal-1"
const metadata = {
  private: {
    dealId,
    personId: "person-1",
    contactId: "contact-1",
    tipoConsulta: "inicial",
    versaoIntegracao: "2"
  }
}
const futuro1 = new Date(Date.now() + 60 * 60 * 1000).toISOString()
const futuro2 = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString()
const passado = new Date(Date.now() - 60 * 60 * 1000).toISOString()

for (const [horario, duracao, esperado, descricao] of [
  ["2026-08-12T08:00:00-03:00", 60, true, "inicio do expediente"],
  ["2026-08-12T11:00:00-03:00", 60, true, "termina ao meio-dia"],
  ["2026-08-12T11:30:00-03:00", 60, false, "nao atravessa o almoco"],
  ["2026-08-12T12:00:00-03:00", 30, false, "almoco bloqueado"],
  ["2026-08-12T13:30:00-03:00", 60, true, "retorno do almoco"],
  ["2026-08-12T17:00:00-03:00", 60, true, "termina as dezoito"],
  ["2026-08-12T17:30:00-03:00", 60, false, "nao ultrapassa as dezoito"],
  ["2026-08-15T09:00:00-03:00", 60, true, "sabado preservado"],
  ["2026-08-15T14:00:00-03:00", 60, true, "ultimo slot completo do sabado"],
  ["2026-08-15T14:30:00-03:00", 60, false, "nao ultrapassa quinze no sabado"],
  ["2026-08-16T09:00:00-03:00", 60, false, "domingo fechado"]
]) {
  assert.equal(horarioDentroDoExpediente(horario, duracao), esperado, descricao)
}

const novo = { id: "evt-1", status: "confirmed", start: { dateTime: futuro1 }, end: { dateTime: futuro1 }, extendedProperties: metadata }
assert.equal(classificarEstadoEvento(novo).status, "agendada", "nova consulta")

assert.equal(classificarEstadoEvento({ ...novo, status: "cancelled" }).status, "cancelada", "cancelamento cliente/admin")

assert.equal(classificarEstadoEvento({
  ...novo,
  start: { dateTime: passado },
  end: { dateTime: passado }
}).status, "encerrada", "expiracao nao presume realizacao")

const reagendado = { ...novo, id: "evt-2", start: { dateTime: futuro2 }, end: { dateTime: futuro2 } }
assert.equal(selecionarEventoConsultaMaisRecente([novo, reagendado], dealId).id, "evt-2", "reagendamento seleciona evento novo")
assert.equal(
  selecionarEventoConsultaMaisRecente([{ ...reagendado, status: "cancelled" }, novo], dealId).id,
  "evt-1",
  "evento ativo prevalece sobre evento cancelado mais recente"
)

for (const resultado of ["realizada", "nao_compareceu"]) {
  assert.equal(classificarEstadoEvento({
    ...novo,
    start: { dateTime: passado },
    end: { dateTime: passado },
    extendedProperties: { private: { ...metadata.private, consultaStatus: resultado } }
  }).status, resultado, `resultado manual ${resultado}`)
}

const server = fs.readFileSync(path.join(__dirname, "..", "server.js"), "utf8")
const calendarSource = fs.readFileSync(path.join(__dirname, "..", "src", "domain", "calendar-scheduling.js"), "utf8")
assert.match(server, /await atualizarEstadoConsultaUsuario\(u\)/, "retomada atualiza estado pelo Calendar")
assert.match(server, /AGENDAMENTO:\s*"1343040832"/, "stage Agendamento advogado pertence ao pipeline")
assert.match(server, /consultaStatus\s*===\s*"agendada"[\s\S]{0,80}HS_STAGE\.AGENDAMENTO/, "consulta ativa prevalece no pipeline")
assert.match(server, /calcularStageAposAgendamento[\s\S]{0,300}HS_STAGE\.AGUARDANDO_DOCS[\s\S]{0,100}HS_STAGE\.DOCS/, "fim da consulta restaura estágio documental")
assert.doesNotMatch(calendarSource, /HUBSPOT|dealstage|1343040832/, "fonte central nao consulta HubSpot")
assert.doesNotMatch(calendarSource, /cliente\._eventoCalendarId/, "criacao nao decide por eventId do snapshot")
assert.match(calendarSource, /chaveIdempotencia/, "evento possui chave idempotente")
assert.match(calendarSource, /\.filter\(slot => horarioAindaPodeSerAgendado\(slot, agora\)\)/, "fonte remove slots vencidos")
assert.match(calendarSource, /horario de consulta ja venceu ou esta muito proximo/, "criacao rejeita horario vencido")
assert.match(server, /slots = resultado\.slots\.filter\(slot => horarioAindaPodeSerAgendado\(slot\)\)/, "tela revalida slots antes de mostrar")
assert.match(server, /!slotEscolhido \|\| !horarioAindaPodeSerAgendado\(slotEscolhido\)/, "clique em botao antigo atualiza horarios")

const metricas = calcularMetricasConsulta([
  novo,
  { ...novo, id: "cancelada", status: "cancelled" },
  {
    ...novo,
    id: "realizada",
    extendedProperties: { private: { ...metadata.private, consultaStatus: "realizada" } }
  },
  {
    ...novo,
    id: "faltou",
    extendedProperties: { private: { ...metadata.private, consultaStatus: "nao_compareceu" } }
  }
])
assert.deepEqual(metricas, {
  total: 4,
  agendadas: 1,
  canceladas: 1,
  realizadas: 1,
  nao_compareceu: 1,
  encerradas_sem_resultado: 0
})

console.log("consultation-flows: ok")
