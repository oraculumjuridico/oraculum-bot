const crypto = require("crypto")
const fs = require("fs")
const path = require("path")
const { forbidDirectEventStoreUsage } = require("./consultation-guards")
const {
  assertEventModelVersion,
  assertEventSchemaVersion
} = require("./consultation/event-versioning")

assertEventModelVersion()

const EVENTS_FILE = process.env.CONSULTA_EVENTS_FILE ||
  path.join(__dirname, "..", "..", "data", "consulta-events.jsonl")
const LOCK_FILE = `${EVENTS_FILE}.lock`
const TIPOS = new Set([
  "consulta.scheduled",
  "consulta.rescheduled",
  "consulta.canceled",
  "consulta.expired",
  "consulta.completed",
  "consulta.no_show"
])
const ORIGENS = new Set(["system", "admin", "client", "reconciliation"])

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function adquirirLock() {
  fs.mkdirSync(path.dirname(EVENTS_FILE), { recursive: true })
  for (let tentativa = 0; tentativa < 80; tentativa++) {
    try {
      return fs.openSync(LOCK_FILE, "wx")
    } catch (e) {
      if (e.code !== "EEXIST") throw e
      await sleep(25)
    }
  }
  throw new Error("timeout ao adquirir lock do historico de consultas")
}

function lerEventos() {
  if (!fs.existsSync(EVENTS_FILE)) return []
  return fs.readFileSync(EVENTS_FILE, "utf8")
    .split(/\r?\n/)
    .filter(Boolean)
    .map(linha => {
      try { return JSON.parse(linha) } catch { return null }
    })
    .filter(Boolean)
    .map((evento, index, eventos) => {
      assertEventSchemaVersion(evento)
      const previousEventHash = index > 0 ? eventos[index - 1].eventHash : null
      const previousDealEvents = eventos.slice(0, index)
        .filter(item => item.dealId === evento.dealId)
      const previousDealEventHash = previousDealEvents.at(-1)?.eventHash || null
      if (
        evento.previousEventHash !== previousEventHash ||
        evento.previousDealEventHash !== previousDealEventHash ||
        evento.dealSequence !== previousDealEvents.length + 1 ||
        evento.eventHash !== calcularHashEvento(evento)
      ) {
        const error = new Error("cadeia imutavel de eventos de consulta corrompida")
        error.code = "CONSULTATION_EVENT_CHAIN_CORRUPTED"
        throw error
      }
      return evento
    })
}

function calcularHashEvento(evento) {
  const { eventHash, ...payload } = evento
  return crypto.createHash("sha256").update(JSON.stringify(payload)).digest("hex")
}

function normalizarMetadata(metadata = {}) {
  const inicio = metadata.inicio || null
  const fim = metadata.fim || null
  let duracaoMin = metadata.duracaoMin
  if (!Number.isFinite(Number(duracaoMin)) && inicio && fim) {
    duracaoMin = Math.max(0, Math.round((new Date(fim).getTime() - new Date(inicio).getTime()) / 60000))
  }
  return {
    calendarEventId: metadata.calendarEventId || metadata.eventId || null,
    inicio,
    fim,
    duracaoMin: Number.isFinite(Number(duracaoMin)) ? Number(duracaoMin) : null,
    tipoConsulta: metadata.tipoConsulta || "inicial",
    versaoIntegracao: metadata.versaoIntegracao || "3"
  }
}

function criarChaveEvento({ tipo, dealId, consultaStatus, metadata, origem, chaveIdempotencia }) {
  if (chaveIdempotencia) return String(chaveIdempotencia)
  return [
    tipo,
    dealId,
    metadata.calendarEventId || "-",
    consultaStatus,
    origem
  ].join(":")
}

async function appendConsultaEvent({
  schemaVersion,
  tipo,
  dealId,
  timestamp = new Date().toISOString(),
  consultaStatus,
  metadata = {},
  origem = "system",
  chaveIdempotencia = null
}) {
  assertEventSchemaVersion({ schemaVersion })
  if (!TIPOS.has(tipo)) throw new Error(`tipo de evento de consulta invalido: ${tipo}`)
  if (!dealId) throw new Error("dealId obrigatorio no evento de consulta")
  if (!ORIGENS.has(origem)) throw new Error(`origem de evento invalida: ${origem}`)

  const meta = normalizarMetadata(metadata)
  const chave = criarChaveEvento({
    tipo,
    dealId: String(dealId),
    consultaStatus,
    metadata: meta,
    origem,
    chaveIdempotencia
  })
  const eventId = crypto.createHash("sha256").update(chave).digest("hex")
  const lock = await adquirirLock()
  try {
    const existentes = lerEventos()
    const existente = existentes.find(evento => evento.eventId === eventId || evento.chaveIdempotencia === chave)
    if (existente) return { evento: existente, appended: false }

    const evento = {
      schemaVersion,
      eventId,
      sequence: existentes.length + 1,
      tipo,
      dealId: String(dealId),
      timestamp: new Date(timestamp).toISOString(),
      consultaStatus,
      metadata: meta,
      origem,
      chaveIdempotencia: chave,
      registradoEm: new Date().toISOString(),
      previousEventHash: existentes.at(-1)?.eventHash || null,
      dealSequence: existentes.filter(item => item.dealId === String(dealId)).length + 1,
      previousDealEventHash: existentes.filter(item => item.dealId === String(dealId)).at(-1)?.eventHash || null
    }
    evento.eventHash = calcularHashEvento(evento)
    fs.appendFileSync(EVENTS_FILE, `${JSON.stringify(evento)}\n`, "utf8")
    return { evento, appended: true }
  } finally {
    try { fs.closeSync(lock) } catch {}
    try { fs.unlinkSync(LOCK_FILE) } catch {}
  }
}

function ordenarEventos(eventos) {
  return [...eventos].sort((a, b) =>
    String(a.timestamp).localeCompare(String(b.timestamp)) ||
    Number(a.sequence || 0) - Number(b.sequence || 0)
  )
}

function getConsultaHistory(dealId) {
  const id = String(dealId || "")
  if (!id) return []
  return ordenarEventos(lerEventos().filter(evento => evento.dealId === id))
}

function getConsultaTimeline(dealId) {
  let statusAnterior = "sem_consulta"
  return getConsultaHistory(dealId).map((evento, index) => {
    const item = {
      ordem: index + 1,
      de: statusAnterior,
      para: evento.consultaStatus,
      ...evento
    }
    statusAnterior = evento.consultaStatus
    return item
  })
}

module.exports = {
  EVENTS_FILE,
  appendConsultaEvent,
  getConsultaHistory: (...args) => {
    forbidDirectEventStoreUsage()
    return getConsultaHistory(...args)
  },
  getConsultaTimeline: (...args) => {
    forbidDirectEventStoreUsage()
    return getConsultaTimeline(...args)
  },
  normalizarMetadata,
  calcularHashEvento
}
