const assert = require("node:assert/strict")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")

const eventsFile = path.join(os.tmpdir(), `consulta-proof-events-${process.pid}.jsonl`)
const decisionsFile = path.join(os.tmpdir(), `consulta-proof-decisions-${process.pid}.jsonl`)
process.env.CONSULTA_EVENTS_FILE = eventsFile
process.env.CONSULTA_DECISIONS_FILE = decisionsFile

const {
  appendConsultaEvent,
  buildConsultaLegalDossier,
  verifyConsultaLegalDossier
} = require("../src/domain/consultation")

async function main() {
  const dealId = "deal-legal-proof"
  await appendConsultaEvent({
    tipo: "consulta.scheduled",
    dealId,
    consultaStatus: "agendada",
    timestamp: "2026-06-20T10:00:00.000Z",
    origem: "client",
    metadata: {
      calendarEventId: "evt-proof",
      inicio: "2026-06-21T13:00:00.000Z",
      fim: "2026-06-21T14:00:00.000Z"
    }
  })
  await appendConsultaEvent({
    tipo: "consulta.completed",
    dealId,
    consultaStatus: "realizada",
    timestamp: "2026-06-21T14:05:00.000Z",
    origem: "admin",
    metadata: {
      calendarEventId: "evt-proof",
      inicio: "2026-06-21T13:00:00.000Z",
      fim: "2026-06-21T14:00:00.000Z"
    }
  })

  const dependencies = {
    obterEstadoConsulta: async () => ({
      status: "realizada",
      eventId: "evt-proof",
      inicio: "2026-06-21T13:00:00.000Z",
      fim: "2026-06-21T14:00:00.000Z",
      metadata: { tipoConsulta: "inicial", versaoIntegracao: "3" }
    })
  }
  const options = { generatedAt: "2026-12-31T23:59:59.000Z" }
  const first = await buildConsultaLegalDossier(dealId, dependencies, options)
  const second = await buildConsultaLegalDossier(dealId, dependencies, options)

  assert.deepEqual(first.dossier, second.dossier)
  assert.deepEqual(first.proof, second.proof)
  assert.deepEqual(first.summary, second.summary)
  assert.equal(first.verification.valid, true)
  assert.equal(first.verification.admissible, true)
  assert.match(first.dossier.narrative.text, /Consulta agendada/)
  assert.match(first.dossier.narrative.text, /Consulta marcada como realizada/)

  const tampered = structuredClone(first.dossier)
  tampered.eventHistory[0].consultaStatus = "adulterado"
  const invalid = verifyConsultaLegalDossier(tampered)
  assert.equal(invalid.valid, false)
  assert.ok(invalid.errors.includes("event_chain_invalid"))
  assert.ok(invalid.errors.includes("proof_invalid"))

  console.log("consultation-legal-proof.test.js: ok")
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
