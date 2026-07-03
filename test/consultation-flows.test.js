const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const {
  classificarEstadoEvento,
  selecionarEventoConsultaMaisRecente
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
assert.doesNotMatch(server, /negocioStageId\s*=\s*HS_STAGE\.AGENDAMENTO/, "retomada/agendamento nao escreve stage Consulta")
assert.doesNotMatch(server, /HS_STAGE\.AGENDAMENTO/, "stage Consulta nao participa do runtime")
assert.doesNotMatch(calendarSource, /HUBSPOT|dealstage|1343040832/, "fonte central nao consulta HubSpot")
assert.doesNotMatch(calendarSource, /cliente\._eventoCalendarId/, "criacao nao decide por eventId do snapshot")
assert.match(calendarSource, /chaveIdempotencia/, "evento possui chave idempotente")

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
