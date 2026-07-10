const assert = require("node:assert/strict")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")

const arquivo = path.join(os.tmpdir(), `consulta-events-test-${process.pid}.jsonl`)
process.env.CONSULTA_EVENTS_FILE = arquivo
const {
  appendConsultaEvent,
  getConsultaHistory,
  getConsultaTimeline
} = require("../src/domain/consultation-events")

async function main() {
  const dealId = "deal-event-source"
  await assert.rejects(
    appendConsultaEvent({
      tipo: "consulta.scheduled",
      dealId: "deal-sem-versao",
      consultaStatus: "agendada",
      origem: "system"
    }),
    erro => erro.code === "CONSULTATION_EVENT_SCHEMA_VERSION_REQUIRED"
  )
  const base = {
    schemaVersion: 3,
    dealId,
    metadata: {
      inicio: "2026-06-27T10:00:00.000Z",
      fim: "2026-06-27T11:00:00.000Z",
      duracaoMin: 60
    }
  }
  await appendConsultaEvent({
    ...base,
    tipo: "consulta.scheduled",
    timestamp: "2026-06-20T10:00:00.000Z",
    consultaStatus: "agendada",
    origem: "client",
    metadata: { ...base.metadata, calendarEventId: "evt-1" }
  })
  await appendConsultaEvent({
    ...base,
    tipo: "consulta.rescheduled",
    timestamp: "2026-06-21T10:00:00.000Z",
    consultaStatus: "agendada",
    origem: "client",
    metadata: { ...base.metadata, calendarEventId: "evt-2" }
  })
  await appendConsultaEvent({
    ...base,
    tipo: "consulta.rescheduled",
    timestamp: "2026-06-22T10:00:00.000Z",
    consultaStatus: "agendada",
    origem: "admin",
    metadata: { ...base.metadata, calendarEventId: "evt-3" }
  })
  await appendConsultaEvent({
    ...base,
    tipo: "consulta.expired",
    timestamp: "2026-06-24T11:00:00.000Z",
    consultaStatus: "encerrada",
    origem: "reconciliation",
    metadata: { ...base.metadata, calendarEventId: "evt-3" }
  })
  const noShow = await appendConsultaEvent({
    ...base,
    tipo: "consulta.no_show",
    timestamp: "2026-06-24T11:01:00.000Z",
    consultaStatus: "nao_compareceu",
    origem: "reconciliation",
    metadata: { ...base.metadata, calendarEventId: "evt-3" }
  })
  const retry = await appendConsultaEvent({
    ...base,
    tipo: "consulta.no_show",
    timestamp: "2026-06-24T11:02:00.000Z",
    consultaStatus: "nao_compareceu",
    origem: "reconciliation",
    metadata: { ...base.metadata, calendarEventId: "evt-3" }
  })

  assert.equal(noShow.appended, true)
  assert.equal(retry.appended, false, "retry nao duplica evento historico")

  await appendConsultaEvent({
    ...base,
    dealId: "deal-completed",
    tipo: "consulta.scheduled",
    timestamp: "2026-06-20T10:00:00.000Z",
    consultaStatus: "agendada",
    origem: "client",
    metadata: { ...base.metadata, calendarEventId: "evt-completed" }
  })
  await appendConsultaEvent({
    ...base,
    dealId: "deal-completed",
    tipo: "consulta.canceled",
    timestamp: "2026-06-21T10:00:00.000Z",
    consultaStatus: "cancelada",
    origem: "client",
    metadata: { ...base.metadata, calendarEventId: "evt-completed" }
  })
  await appendConsultaEvent({
    ...base,
    dealId: "deal-completed",
    tipo: "consulta.completed",
    timestamp: "2026-06-22T10:00:00.000Z",
    consultaStatus: "realizada",
    origem: "admin",
    metadata: { ...base.metadata, calendarEventId: "evt-completed-2" }
  })

  const history = getConsultaHistory(dealId)
  assert.deepEqual(history.map(evento => evento.tipo), [
    "consulta.scheduled",
    "consulta.rescheduled",
    "consulta.rescheduled",
    "consulta.expired",
    "consulta.no_show"
  ])
  assert.equal(history.filter(evento => evento.tipo === "consulta.rescheduled").length, 2)

  const timeline = getConsultaTimeline(dealId)
  assert.deepEqual(timeline.map(item => item.ordem), [1, 2, 3, 4, 5])
  assert.equal(timeline[0].de, "sem_consulta")
  assert.equal(timeline.at(-1).para, "nao_compareceu")
  assert.ok(timeline.every((item, index) => index === 0 || item.timestamp >= timeline[index - 1].timestamp))
  assert.deepEqual(getConsultaHistory("deal-completed").map(evento => evento.tipo), [
    "consulta.scheduled",
    "consulta.canceled",
    "consulta.completed"
  ])

  console.log("consultation-events: ok")
}

main()
  .finally(() => {
    try { fs.unlinkSync(arquivo) } catch {}
    try { fs.unlinkSync(`${arquivo}.lock`) } catch {}
  })
  .catch(e => {
    console.error(e)
    process.exitCode = 1
  })
