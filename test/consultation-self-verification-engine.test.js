const assert = require("node:assert/strict")
const {
  verifyConsultationIntegrity
} = require("../src/domain/consultation/integrity/consultation-self-verification-engine")

const dealId = "deal-self-verification"
const base = {
  dealId,
  status: "agendada",
  currentEvent: {
    calendarEventId: "evt-integrity",
    inicio: "2026-07-01T13:00:00.000Z",
    fim: "2026-07-01T14:00:00.000Z",
    tipoConsulta: "inicial"
  }
}

function loaders({ replay = base, readModel = base, calendar = base } = {}) {
  return {
    replay: async () => structuredClone(replay),
    readModel: async () => structuredClone(readModel),
    calendar: async () => structuredClone(calendar)
  }
}

async function main() {
  const healthy = await verifyConsultationIntegrity({ dealId, loaders: loaders() })
  assert.equal(healthy.healthy, true)
  assert.deepEqual(healthy.inconsistencies, [])
  assert.equal(healthy.replayHash, healthy.readModelHash)
  assert.equal(healthy.replayHash, healthy.calendarHash)

  const readModelDivergent = await verifyConsultationIntegrity({
    dealId,
    loaders: loaders({ readModel: { ...base, status: "cancelada" } })
  })
  assert.equal(readModelDivergent.healthy, false)
  assert.ok(readModelDivergent.inconsistencies.some(item =>
    item.field === "status" &&
    item.expected === "agendada" &&
    item.actual === "cancelada" &&
    item.source === "readModel"
  ))

  const calendarDivergent = await verifyConsultationIntegrity({
    dealId,
    loaders: loaders({
      calendar: {
        ...base,
        currentEvent: { ...base.currentEvent, inicio: "2026-07-02T13:00:00.000Z" }
      }
    })
  })
  assert.equal(calendarDivergent.healthy, false)
  assert.ok(calendarDivergent.inconsistencies.some(item =>
    item.field === "event.inicio" &&
    item.expected === "2026-07-01T13:00:00.000Z" &&
    item.actual === "2026-07-02T13:00:00.000Z" &&
    item.source === "calendar"
  ))

  console.log("consultation-self-verification-engine.test.js: ok")
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
})
