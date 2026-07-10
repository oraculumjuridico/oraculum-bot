const HORA_MS = 60 * 60 * 1000
const DIA_MS = 24 * HORA_MS

const PRIORIDADES = {
  no_show_consulta: 100,
  documentos_pendentes: 90,
  agendamento_nao_concluido: 80,
  abandono_7d: 70,
  abandono_24h: 60,
  abandono_2h: 50,
  descricao_pendente: 40
}

const STAGES_DESCRICAO = new Set([
  "descricao_caso",
  "coleta_desc",
  "coleta_desc_audio",
  "trab_out_desc",
  "out_desc"
])

const STAGES_AGENDAMENTO = new Set([
  "agendamento_horario",
  "agendamento_duracao",
  "agendamento_confirmar"
])

function normalizarStage(stage) {
  return String(stage || "").trim().toLowerCase()
}

function lista(valor) {
  return Array.isArray(valor) ? valor : []
}

function temTexto(valor) {
  return String(valor || "").trim().length > 0
}

function timestampMs(valor) {
  if (valor instanceof Date) return valor.getTime()
  if (typeof valor === "number") return valor
  if (typeof valor === "string" && valor.trim()) return Date.parse(valor)
  return NaN
}

function idadeDesde(timestamp, agora = Date.now()) {
  const ms = timestampMs(timestamp)
  if (!Number.isFinite(ms)) return null
  return Math.max(0, agora - ms)
}

function criarEvento(tipoEvento, template, motivo) {
  return {
    tipoEvento,
    template,
    prioridade: PRIORIDADES[tipoEvento],
    motivo
  }
}

function avaliarElegibilidadeReengajamento(usuario = {}) {
  const avisos = []
  const erros = []

  if (!usuario || typeof usuario !== "object") {
    return { elegivel: false, eventos: [], avisos: [], erros: ["usuario_invalido"] }
  }

  if (usuario.encerrado === true) {
    return { elegivel: false, eventos: [], avisos, erros }
  }

  if (usuario.optOut === true) {
    return { elegivel: false, eventos: [], avisos, erros }
  }

  const eventos = []
  const semNumeroCaso = !temTexto(usuario.numeroCaso)
  const stage = normalizarStage(usuario.stage)
  const idadeUltimaMsg = idadeDesde(usuario.ultimaMsg)

  if (usuario.ultimaMsg && idadeUltimaMsg === null) {
    avisos.push("ultimaMsg_invalida")
  }

  if (semNumeroCaso && idadeUltimaMsg !== null && idadeUltimaMsg > 2 * HORA_MS) {
    eventos.push(criarEvento(
      "abandono_2h",
      "retomada_atendimento",
      "lead_sem_numero_caso"
    ))
  }

  if (semNumeroCaso && idadeUltimaMsg !== null && idadeUltimaMsg > DIA_MS) {
    eventos.push(criarEvento(
      "abandono_24h",
      "retomada_atendimento",
      "lead_sem_numero_caso"
    ))
  }

  if (
    usuario.leadIncompletoCapturado === true &&
    semNumeroCaso &&
    idadeUltimaMsg !== null &&
    idadeUltimaMsg > 7 * DIA_MS
  ) {
    eventos.push(criarEvento(
      "abandono_7d",
      "retomada_atendimento",
      "lead_incompleto_capturado_sem_conversao"
    ))
  }

  if (!temTexto(usuario.descricao) && STAGES_DESCRICAO.has(stage)) {
    eventos.push(criarEvento(
      "descricao_pendente",
      "retomada_atendimento",
      "descricao_ausente"
    ))
  }

  if (
    !semNumeroCaso &&
    (lista(usuario.docsAusentes).length > 0 || lista(usuario.docsParciais).length > 0)
  ) {
    eventos.push(criarEvento(
      "documentos_pendentes",
      "caso_atualizacao",
      "documentos_ausentes_ou_parciais"
    ))
  }

  if (STAGES_AGENDAMENTO.has(stage) && usuario.consultaStatus !== "agendada") {
    eventos.push(criarEvento(
      "agendamento_nao_concluido",
      "retomada_atendimento",
      "agendamento_sem_confirmacao"
    ))
  }

  if (usuario.consultaStatus === "nao_compareceu") {
    eventos.push(criarEvento(
      "no_show_consulta",
      "caso_atualizacao",
      "consulta_nao_compareceu"
    ))
  }

  eventos.sort((a, b) => b.prioridade - a.prioridade)

  return {
    elegivel: eventos.length > 0,
    eventos,
    avisos,
    erros
  }
}

module.exports = {
  avaliarElegibilidadeReengajamento
}
