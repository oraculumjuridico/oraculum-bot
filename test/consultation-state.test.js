const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const { classificarEstadoEvento } = require("../src/domain/calendar-scheduling")

const futuro = new Date(Date.now() + 60 * 60 * 1000).toISOString()
const passado = new Date(Date.now() - 60 * 60 * 1000).toISOString()

assert.equal(classificarEstadoEvento({
  id: "futuro",
  status: "confirmed",
  start: { dateTime: futuro },
  end: { dateTime: futuro }
}).status, "agendada")

assert.equal(classificarEstadoEvento({
  id: "cancelado",
  status: "cancelled",
  start: { dateTime: futuro },
  end: { dateTime: futuro }
}).status, "cancelada")

assert.equal(classificarEstadoEvento({
  id: "encerrado",
  status: "confirmed",
  start: { dateTime: passado },
  end: { dateTime: passado }
}).status, "encerrada")

for (const status of ["realizada", "nao_compareceu"]) {
  assert.equal(classificarEstadoEvento({
    id: status,
    status: "confirmed",
    start: { dateTime: passado },
    end: { dateTime: passado },
    extendedProperties: { private: { consultaStatus: status } }
  }).status, status)
}

const server = fs.readFileSync(path.join(__dirname, "..", "server.js"), "utf8")
const escritasStageConsulta = [
  /hsMoverStage\([^\n]*HS_STAGE\.AGENDAMENTO/,
  /hsAtualizarEtapaNegocio\([^\n]*HS_STAGE\.AGENDAMENTO/,
  /dealstage\s*:\s*HS_STAGE\.AGENDAMENTO/,
  /negocioStageId\s*=\s*HS_STAGE\.AGENDAMENTO/
]
for (const padrao of escritasStageConsulta) {
  assert.equal(padrao.test(server), false, `escrita de stage Consulta encontrada: ${padrao}`)
}

console.log("consultation-state: ok")
