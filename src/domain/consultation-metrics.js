const fs = require("fs")
const path = require("path")
const { classificarEstadoCalendar } = require("./consultation-read-model")

const METRICS_FILE = path.join(__dirname, "..", "..", "data", "consulta-metrics.json")

function calcularMetricasConsulta(eventos = []) {
  const metricas = {
    total: 0,
    agendadas: 0,
    canceladas: 0,
    realizadas: 0,
    nao_compareceu: 0,
    encerradas_sem_resultado: 0
  }
  for (const evento of eventos) {
    metricas.total++
    const status = classificarEstadoCalendar(evento).status
    if (status === "agendada") metricas.agendadas++
    else if (status === "cancelada") metricas.canceladas++
    else if (status === "realizada") metricas.realizadas++
    else if (status === "nao_compareceu") metricas.nao_compareceu++
    else if (status === "encerrada") metricas.encerradas_sem_resultado++
  }
  return metricas
}

function persistirMetricasConsulta(eventos = [], extras = {}) {
  const payload = {
    atualizadoEm: new Date().toISOString(),
    fonte: "google_calendar",
    ...calcularMetricasConsulta(eventos),
    ...extras
  }
  fs.mkdirSync(path.dirname(METRICS_FILE), { recursive: true })
  const temporario = `${METRICS_FILE}.${process.pid}.tmp`
  fs.writeFileSync(temporario, JSON.stringify(payload, null, 2), "utf8")
  fs.renameSync(temporario, METRICS_FILE)
  console.log(JSON.stringify({ evento: "consulta_metricas", ...payload }))
  return payload
}

module.exports = {
  METRICS_FILE,
  calcularMetricasConsulta,
  persistirMetricasConsulta
}
