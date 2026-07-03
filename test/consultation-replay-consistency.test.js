const assert = require("node:assert/strict")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")

const eventsFile = path.join(os.tmpdir(), `consulta-replay-events-${process.pid}.jsonl`)
const decisionsFile = path.join(os.tmpdir(), `consulta-replay-decisions-${process.pid}.jsonl`)
process.env.CONSULTA_EVENTS_FILE = eventsFile
process.env.CONSULTA_DECISIONS_FILE = decisionsFile

const {
  appendConsultaEvent,
  getConsultaView,
  getConsultaHistory,
  getConsultaStateAt,
  getConsultaFullAudit
} = require("../src/domain/consultation")

async function main() {
  const dealId = "deal-replay-consistency"
  const events = [
    ["consulta.scheduled", "agendada", "evt-1", "2026-06-20T10:00:00.000Z"],
    ["consulta.rescheduled", "agendada", "evt-2", "2026-06-21T10:00:00.000Z"],
    ["consulta.canceled", "cancelada", "evt-2", "2026-06-22T10:00:00.000Z"],
    ["consulta.scheduled", "agendada", "evt-3", "2026-06-23T10:00:00.000Z"],
    ["consulta.completed", "realizada", "evt-3", "2026-06-24T10:00:00.000Z"]
  ]
  for (const [tipo, consultaStatus, calendarEventId, timestamp] of events) {
    await appendConsultaEvent({
      tipo,
      dealId,
      consultaStatus,
      timestamp,
      origem: tipo === "consulta.completed" ? "admin" : "client",
      metadata: {
        calendarEventId,
        inicio: "2026-06-24T09:00:00.000Z",
        fim: "2026-06-24T10:00:00.000Z",
        tipoConsulta: "inicial"
      }
    })
  }

  const dependencies = {
    obterEstadoConsulta: async () => ({
      status: "realizada",
      eventId: "evt-3",
      inicio: "2026-06-24T09:00:00.000Z",
      fim: "2026-06-24T10:00:00.000Z",
      metadata: { tipoConsulta: "inicial", versaoIntegracao: "3" }
    })
  }
  const view = await getConsultaView(dealId, dependencies)
  const replay = getConsultaStateAt(dealId)
  assert.equal(replay.status, view.status)
  assert.equal(replay.status, "realizada")
  assert.equal(replay.totalEvents, 5)

  const atCancellation = getConsultaStateAt(dealId, "2026-06-22T10:00:00.000Z")
  assert.equal(atCancellation.status, "cancelada")
  assert.equal(atCancellation.currentEvent.calendarEventId, "evt-2")

  const history = getConsultaHistory(dealId)
  assert.equal(history.length, 5)
  assert.ok(history.every((event, index) =>
    event.schemaVersion === 3 &&
    event.previousDealEventHash === (index ? history[index - 1].eventHash : null)
  ))

  const legal = await getConsultaFullAudit(dealId, dependencies)
  assert.equal(legal.consistency.consistent, true)
  assert.equal(legal.eventHistory.length, 5)
  assert.ok(legal.decisionHistory.length >= 3)
  assert.match(legal.legalSnapshotHash, /^[a-f0-9]{64}$/)

  const stored = fs.readFileSync(eventsFile, "utf8").trim().split(/\r?\n/)
  const tampered = JSON.parse(stored[1])
  tampered.consultaStatus = "adulterado"
  stored[1] = JSON.stringify(tampered)
  fs.writeFileSync(eventsFile, `${stored.join("\n")}\n`)
  assert.throws(
    () => getConsultaHistory(dealId),
    error => error.code === "CONSULTATION_EVENT_CHAIN_CORRUPTED"
  )

  console.log("consultation-replay-consistency.test.js: ok")
}

main()
  .finally(() => {
    try { fs.unlinkSync(eventsFile) } catch {}
    try { fs.unlinkSync(decisionsFile) } catch {}
  })
  .catch(error => {
    console.error(error)
    process.exitCode = 1
  })
