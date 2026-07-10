const assert = require("node:assert/strict")
const {
  getConsultaView,
  montarConsultaView
} = require("../src/domain/consultation-read-model")

function estado(status, eventId = null, inicio = null, fim = null) {
  return {
    status,
    eventId,
    inicio,
    fim,
    metadata: {
      dealId: "deal-read-model",
      tipoConsulta: "inicial",
      versaoIntegracao: "3"
    }
  }
}

function evento(tipo, timestamp, calendarEventId, consultaStatus) {
  return {
    tipo,
    timestamp,
    consultaStatus,
    origem: "system",
    metadata: { calendarEventId }
  }
}

async function main() {
  const semConsulta = await getConsultaView("deal-sem-consulta", {
    obterEstadoConsulta: async () => estado("sem_consulta"),
    getConsultaTimeline: () => []
  })
  assert.equal(semConsulta.status, "sem_consulta")
  assert.equal(semConsulta.eventoAtual, null)
  assert.equal(semConsulta.flags.temConsultaAtiva, false)

  const remarcacoes = montarConsultaView(
    "deal-remarcado",
    estado("agendada", "evt-3", "2026-07-03T14:00:00.000Z", "2026-07-03T15:00:00.000Z"),
    [
      evento("consulta.scheduled", "2026-06-20T10:00:00.000Z", "evt-1", "agendada"),
      evento("consulta.rescheduled", "2026-06-21T10:00:00.000Z", "evt-2", "agendada"),
      evento("consulta.rescheduled", "2026-06-22T10:00:00.000Z", "evt-3", "agendada")
    ]
  )
  assert.equal(remarcacoes.status, "agendada")
  assert.equal(remarcacoes.metricas.remarcacoes, 2)
  assert.equal(remarcacoes.flags.quantidadeRemarcacoes, 2)
  assert.equal(remarcacoes.eventoAtual.calendarEventId, "evt-3")

  const reativada = montarConsultaView(
    "deal-reativado",
    estado("agendada", "evt-novo", "2026-07-05T14:00:00.000Z", "2026-07-05T15:00:00.000Z"),
    [
      evento("consulta.scheduled", "2026-06-20T10:00:00.000Z", "evt-antigo", "agendada"),
      evento("consulta.canceled", "2026-06-21T10:00:00.000Z", "evt-antigo", "cancelada"),
      evento("consulta.scheduled", "2026-06-22T10:00:00.000Z", "evt-novo", "agendada")
    ]
  )
  assert.equal(reativada.status, "agendada")
  assert.equal(reativada.flags.temConsultaAtiva, true)
  assert.equal(reativada.flags.foiCanceladaUltima, false)
  assert.equal(reativada.metricas.cancelamentos, 1)

  const noShow = montarConsultaView(
    "deal-no-show",
    estado("encerrada", "evt-expirado", "2026-06-20T14:00:00.000Z", "2026-06-20T15:00:00.000Z"),
    [evento("consulta.scheduled", "2026-06-10T10:00:00.000Z", "evt-expirado", "agendada")]
  )
  assert.equal(noShow.status, "nao_compareceu")
  assert.equal(noShow.flags.teveNoShow, true)
  assert.equal(noShow.metricas.noShow, 1)

  const cancelamentoVenceAtivo = montarConsultaView(
    "deal-inconsistente",
    estado("agendada", "evt-atual", "2026-07-06T14:00:00.000Z", "2026-07-06T15:00:00.000Z"),
    [
      evento("consulta.scheduled", "2026-06-20T10:00:00.000Z", "evt-atual", "agendada"),
      evento("consulta.canceled", "2026-06-21T10:00:00.000Z", "evt-atual", "cancelada")
    ]
  )
  assert.equal(cancelamentoVenceAtivo.status, "cancelada")
  assert.equal(cancelamentoVenceAtivo.statusCalendar, "agendada")
  assert.equal(cancelamentoVenceAtivo.flags.temConsultaAtiva, false)
  assert.equal(cancelamentoVenceAtivo.flags.foiCanceladaUltima, true)

  const concluida = montarConsultaView(
    "deal-concluido",
    estado("encerrada", "evt-concluido", "2026-06-20T14:00:00.000Z", "2026-06-20T15:00:00.000Z"),
    [
      evento("consulta.scheduled", "2026-06-10T10:00:00.000Z", "evt-concluido", "agendada"),
      evento("consulta.completed", "2026-06-20T15:05:00.000Z", "evt-concluido", "realizada")
    ]
  )
  assert.equal(concluida.status, "realizada")
  assert.equal(concluida.flags.teveNoShow, false)

  console.log("consultation-read-model.test.js: ok")
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
})
