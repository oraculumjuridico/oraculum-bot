const assert = require("node:assert/strict")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")
const {
  refreshConsultationSessionProjection
} = require("../src/domain/consultation/projections/consultation-session-recovery")

async function main() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "consulta-session-recovery-"))
  const sessionFile = path.join(directory, "users-state.json")
  const eventStoreFile = path.join(directory, "consulta-events.jsonl")
  const consultationId = "deal-session-recovery"
  fs.writeFileSync(eventStoreFile, "EVENT_STORE_MUST_NOT_CHANGE\n")
  fs.writeFileSync(sessionFile, JSON.stringify({
    savedAt: "2026-06-01T00:00:00.000Z",
    users: {
      "5511999999999": {
        negocioId: consultationId,
        nome: "Cliente preservado",
        stage: "cliente",
        consultaStatus: "cancelada",
        tipoConsulta: "retorno",
        _consultaInicio: null,
        _consultaFim: null
      },
      "5511888888888": {
        negocioId: "outro-deal",
        consultaStatus: "sem_consulta"
      }
    }
  }, null, 2))

  const replay = async () => ({
    dealId: consultationId,
    status: "agendada",
    currentEvent: {
      calendarEventId: "evt-recovery",
      inicio: "2026-07-10T13:00:00.000Z",
      fim: "2026-07-10T14:00:00.000Z",
      tipoConsulta: "inicial"
    }
  })
  const times = [
    "2026-06-28T16:00:00.000Z",
    "2026-06-28T16:00:00.100Z",
    "2026-06-28T16:00:00.200Z"
  ]
  const first = await refreshConsultationSessionProjection({
    consultationId,
    sessionFile,
    replay,
    clock: () => times.shift()
  })
  assert.equal(first.refreshed, true)
  assert.notEqual(first.beforeHash, first.afterHash)

  const persisted = JSON.parse(fs.readFileSync(sessionFile, "utf8"))
  const recovered = persisted.users["5511999999999"]
  assert.equal(recovered.consultaStatus, "agendada")
  assert.equal(recovered.tipoConsulta, "inicial")
  assert.equal(recovered._consultaInicio, "2026-07-10T13:00:00.000Z")
  assert.equal(recovered._consultaFim, "2026-07-10T14:00:00.000Z")
  assert.equal(recovered.nome, "Cliente preservado")
  assert.equal(recovered.stage, "cliente")
  assert.equal(persisted.users["5511888888888"].consultaStatus, "sem_consulta")

  const beforeSecondRun = fs.readFileSync(sessionFile, "utf8")
  const secondTimes = ["2026-06-28T16:01:00.000Z", "2026-06-28T16:01:00.100Z"]
  const second = await refreshConsultationSessionProjection({
    consultationId,
    sessionFile,
    replay,
    clock: () => secondTimes.shift()
  })
  assert.equal(second.refreshed, false)
  assert.equal(second.beforeHash, second.afterHash)
  assert.equal(fs.readFileSync(sessionFile, "utf8"), beforeSecondRun)
  assert.equal(fs.readFileSync(eventStoreFile, "utf8"), "EVENT_STORE_MUST_NOT_CHANGE\n")

  console.log("consultation-session-recovery.test.js: ok")
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
})
