const assert = require("node:assert/strict")
const {
  hashConsultationState,
  generateIntegritySnapshot
} = require("../src/domain/consultation/integrity/consultation-integrity-hash")

function main() {
  const state = {
    dealId: "deal-integrity",
    status: "agendada",
    event: {
      inicio: "2026-07-01T13:00:00.000Z",
      metadata: { tipo: "inicial", duracaoMin: 60 }
    },
    generatedAt: "2026-06-28T10:00:00.000Z"
  }
  assert.equal(hashConsultationState(state), hashConsultationState(structuredClone(state)))

  const reordered = {
    generatedAt: "2030-01-01T00:00:00.000Z",
    event: {
      metadata: { duracaoMin: 60, tipo: "inicial" },
      inicio: "2026-07-01T13:00:00.000Z"
    },
    status: "agendada",
    dealId: "deal-integrity"
  }
  assert.equal(hashConsultationState(state), hashConsultationState(reordered))

  const changed = structuredClone(state)
  changed.status = "cancelada"
  assert.notEqual(hashConsultationState(state), hashConsultationState(changed))

  const snapshot = generateIntegritySnapshot({
    readModelState: state,
    replayState: reordered,
    calendarProjection: changed,
    generatedAt: "2026-06-28T12:00:00.000Z"
  })
  assert.deepEqual(Object.keys(snapshot), [
    "generatedAt",
    "readModelHash",
    "replayHash",
    "calendarHash"
  ])
  assert.equal(snapshot.readModelHash, snapshot.replayHash)
  assert.notEqual(snapshot.readModelHash, snapshot.calendarHash)
  assert.match(snapshot.readModelHash, /^[a-f0-9]{64}$/)

  console.log("consultation-integrity-hash.test.js: ok")
}

main()
