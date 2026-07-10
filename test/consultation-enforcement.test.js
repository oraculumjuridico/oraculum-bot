const assert = require("node:assert/strict")
const {
  forbidDirectCalendarUsage
} = require("../src/domain/consultation-guards")
const {
  getConsultaView
} = require("../src/domain/consultation-read-model")
const {
  getConsultaTimeline
} = require("../src/domain/consultation-events")

async function main() {
  const modeAnterior = process.env.CONSULTA_ENFORCEMENT_MODE
  const warnAnterior = console.warn

  try {
    process.env.CONSULTA_ENFORCEMENT_MODE = "strict"
    assert.throws(
      () => forbidDirectCalendarUsage(),
      erro => erro.code === "CONSULTA_DIRECT_READ_FORBIDDEN"
    )
    assert.throws(
      () => getConsultaTimeline("deal-direto"),
      erro => erro.code === "CONSULTA_DIRECT_READ_FORBIDDEN"
    )

    const view = await getConsultaView("deal-autorizado", {
      obterEstadoConsulta: async () => {
        forbidDirectCalendarUsage()
        return {
          status: "sem_consulta",
          eventId: null,
          inicio: null,
          fim: null,
          metadata: {}
        }
      },
      getConsultaTimeline
    })
    assert.equal(view.status, "sem_consulta")

    const warnings = []
    process.env.CONSULTA_ENFORCEMENT_MODE = "warn"
    console.warn = mensagem => warnings.push(String(mensagem))
    assert.deepEqual(getConsultaTimeline("deal-warning"), [])
    assert.equal(warnings.length, 1)
    assert.match(warnings[0], /leitura direta proibida/)
  } finally {
    console.warn = warnAnterior
    if (modeAnterior === undefined) delete process.env.CONSULTA_ENFORCEMENT_MODE
    else process.env.CONSULTA_ENFORCEMENT_MODE = modeAnterior
  }

  console.log("consultation-enforcement.test.js: ok")
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
})
