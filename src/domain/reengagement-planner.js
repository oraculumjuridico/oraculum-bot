const {
  avaliarElegibilidadeReengajamento
} = require("./reengagement-engine")

const HORA_MS = 60 * 60 * 1000
const DIA_MS = 24 * HORA_MS

const OFFSET_EVENTO_MS = {
  abandono_2h: 2 * HORA_MS,
  abandono_24h: DIA_MS,
  abandono_7d: 7 * DIA_MS,
  descricao_pendente: 2 * HORA_MS,
  agendamento_nao_concluido: 2 * HORA_MS,
  documentos_pendentes: DIA_MS
}

function timestampMs(valor) {
  if (valor instanceof Date) return valor.getTime()
  if (typeof valor === "number") return valor
  if (typeof valor === "string" && valor.trim()) return Date.parse(valor)
  return NaN
}

function valorTexto(valor) {
  return String(valor || "").trim()
}

function telefoneUsuario(usuario = {}) {
  return valorTexto(
    usuario.phone ||
    usuario.telefone ||
    usuario.whatsapp ||
    usuario.whatsappContato ||
    usuario._numero ||
    usuario.numero
  )
}

function idJob({ phone, numeroCaso, tipoEvento }) {
  const partes = [phone]
  if (valorTexto(numeroCaso)) partes.push(valorTexto(numeroCaso))
  partes.push(tipoEvento)
  return partes.join(":")
}

function scheduledForEvento(tipoEvento, usuario, agoraMs) {
  if (tipoEvento === "no_show_consulta") return new Date(agoraMs).toISOString()

  const base = timestampMs(usuario?.ultimaMsg)
  if (!Number.isFinite(base)) return null

  const offset = OFFSET_EVENTO_MS[tipoEvento]
  if (!Number.isFinite(offset)) return null

  return new Date(base + offset).toISOString()
}

function avaliarComRelogio(usuario, agoraMs) {
  if (!Number.isFinite(agoraMs)) {
    return avaliarElegibilidadeReengajamento(usuario)
  }

  const dateNowOriginal = Date.now
  Date.now = () => agoraMs
  try {
    return avaliarElegibilidadeReengajamento(usuario)
  } finally {
    Date.now = dateNowOriginal
  }
}

function normalizarEntrada(usuario = {}, options = {}) {
  if (
    usuario &&
    typeof usuario === "object" &&
    Object.prototype.hasOwnProperty.call(usuario, "usuario") &&
    !Object.prototype.hasOwnProperty.call(options, "agora")
  ) {
    return {
      usuario: usuario.usuario || {},
      options: { agora: usuario.agora }
    }
  }

  return { usuario, options }
}

function planejarReengajamentos(entrada = {}, opcoes = {}) {
  const { usuario, options } = normalizarEntrada(entrada, opcoes)
  const agoraMsCandidate = timestampMs(options.agora)
  const agoraMs = Number.isFinite(agoraMsCandidate) ? agoraMsCandidate : Date.now()
  const avaliacao = avaliarComRelogio(usuario, agoraMs)
  const avisos = [...(avaliacao.avisos || [])]
  const erros = [...(avaliacao.erros || [])]
  const phone = telefoneUsuario(usuario)
  const numeroCaso = valorTexto(usuario?.numeroCaso)
  const porId = new Map()

  for (const evento of avaliacao.eventos || []) {
    const scheduledFor = scheduledForEvento(evento.tipoEvento, usuario, agoraMs)
    if (!scheduledFor) {
      avisos.push(`evento_sem_ultimaMsg_valida:${evento.tipoEvento}`)
      continue
    }

    const job = {
      id: idJob({ phone, numeroCaso, tipoEvento: evento.tipoEvento }),
      tipoEvento: evento.tipoEvento,
      template: evento.template,
      prioridade: evento.prioridade,
      scheduledFor,
      motivo: evento.motivo,
      phone,
      numeroCaso,
      contatoId: valorTexto(usuario?.contatoId),
      negocioId: valorTexto(usuario?.negocioId)
    }

    const existente = porId.get(job.id)
    if (!existente || job.prioridade > existente.prioridade) {
      porId.set(job.id, job)
    }
  }

  const jobs = [...porId.values()].sort((a, b) =>
    (b.prioridade - a.prioridade) ||
    (Date.parse(a.scheduledFor) - Date.parse(b.scheduledFor))
  )

  return { jobs, avisos, erros }
}

module.exports = {
  planejarReengajamentos
}
