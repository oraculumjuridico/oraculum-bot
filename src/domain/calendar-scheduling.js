const { google } = require("googleapis")
const crypto = require("crypto")
const { sanitizarTextoEntrada } = require("../utils/text")
const { logDebug, logErro } = require("../utils/logging")
const { INSTITUTIONAL_CALENDAR_ID: CALENDAR_ID } = require("../config/institutional-calendar")
const { forbidDirectCalendarUsage } = require("./consultation-guards")

let appendConsultaEvent = async () => ({ appended: false })

function configurarConsultaEventSink(eventSink) {
  if (typeof eventSink !== "function") throw new Error("event sink de consulta invalido")
  appendConsultaEvent = eventSink
}

const {
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
  GOOGLE_REFRESH_TOKEN
} = process.env

const TIMEZONE = "America/Sao_Paulo"
const SLOT_MINIMO_ANTECEDENCIA_MS = 5 * 60 * 1000

function horarioAindaPodeSerAgendado(dataHora, agora = new Date()) {
  const slot = new Date(dataHora)
  const referencia = new Date(agora)
  return Number.isFinite(slot.getTime()) &&
    Number.isFinite(referencia.getTime()) &&
    slot.getTime() >= referencia.getTime() + SLOT_MINIMO_ANTECEDENCIA_MS
}

function partesNoFuso(dataHora) {
  const partes = new Intl.DateTimeFormat("en-US", {
    timeZone: TIMEZONE,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  }).formatToParts(new Date(dataHora))
  return Object.fromEntries(partes.map(parte => [parte.type, parte.value]))
}

function horarioDentroDoExpediente(dataHora, duracaoMin = 60) {
  const inicio = new Date(dataHora)
  const duracao = Number(duracaoMin)
  if (!Number.isFinite(inicio.getTime()) || !Number.isFinite(duracao) || duracao <= 0) return false

  const local = partesNoFuso(inicio)
  const minutoInicio = Number(local.hour) * 60 + Number(local.minute)
  const minutoFim = minutoInicio + duracao
  const dia = local.weekday

  if (["Mon", "Tue", "Wed", "Thu", "Fri"].includes(dia)) {
    const dentroDaManha = minutoInicio >= 8 * 60 && minutoFim <= 12 * 60
    const dentroDaTarde = minutoInicio >= 13 * 60 + 30 && minutoFim <= 18 * 60
    return dentroDaManha || dentroDaTarde
  }
  if (dia === "Sat") return minutoInicio >= 9 * 60 && minutoFim <= 15 * 60
  return false
}

function getCalendar() {
  const oauth2 = new google.auth.OAuth2(
    GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET,
    "urn:ietf:wg:oauth:2.0:oob"
  )
  oauth2.setCredentials({ refresh_token: GOOGLE_REFRESH_TOKEN })
  return google.calendar({ version: "v3", auth: oauth2 })
}

// Gera slots de horário disponíveis nos próximos 7 dias
async function buscarHorariosDisponiveis(pagina = 0) {
  const calendar = getCalendar()
  const agora = new Date()
  const fim = new Date(agora.getTime() + 7 * 24 * 60 * 60 * 1000)

  // Busca eventos ocupados
  const freebusy = await calendar.freebusy.query({
    requestBody: {
      timeMin: agora.toISOString(),
      timeMax: fim.toISOString(),
      timeZone: TIMEZONE,
      items: [{ id: CALENDAR_ID }]
    }
  })

  const ocupados = freebusy.data.calendars[CALENDAR_ID]?.busy || []

  // Agrupa os slots por dia; a paginação limita o volume exibido no WhatsApp.
  const slotsPorDia = {}
  const cursor = new Date(agora)
  cursor.setSeconds(0, 0)
  cursor.setMinutes(cursor.getMinutes() < 30 ? 30 : 0)
  if (cursor <= agora) cursor.setMinutes(cursor.getMinutes() + 30)

  while (cursor < fim) {
    if (horarioDentroDoExpediente(cursor, 60)) {
      const slotInicio = new Date(cursor)
      const slotFim = new Date(cursor.getTime() + 60 * 60 * 1000)
      const livre = !ocupados.some(ev => {
        const evInicio = new Date(ev.start)
        const evFim = new Date(ev.end)
        return slotInicio < evFim && slotFim > evInicio
      })

      if (livre) {
        const diaKey = cursor.toLocaleString("en-CA", { timeZone: TIMEZONE }).slice(0, 10)
        if (!slotsPorDia[diaKey]) slotsPorDia[diaKey] = []
        slotsPorDia[diaKey].push(new Date(cursor))
      }
    }
    cursor.setMinutes(cursor.getMinutes() + 30)
  }

  // Flatten — todos os slots organizados por dia
  const todosSlots = Object.values(slotsPorDia)
    .flat()
    .filter(slot => horarioAindaPodeSerAgendado(slot, agora))

  // Paginação — 6 slots por página
  const porPagina = 6
  const inicio = pagina * porPagina
  return {
    slots: todosSlots.slice(inicio, inicio + porPagina),
    totalSlots: todosSlots.length,
    temMais: todosSlots.length > inicio + porPagina,
    pagina
  }
}

async function registrarHistoricoAgendamento({
  tipo,
  dealId,
  eventId,
  inicio,
  fim,
  duracaoMin,
  tipoConsulta,
  origem
}) {
  try {
    await appendConsultaEvent({
      tipo,
      dealId,
      consultaStatus: "agendada",
      metadata: {
        calendarEventId: eventId,
        inicio,
        fim,
        duracaoMin,
        tipoConsulta: tipoConsulta || "inicial",
        versaoIntegracao: "3"
      },
      origem: origem || "system",
      chaveIdempotencia: `calendar:${eventId}:agendada`
    })
  } catch (e) {
    logErro("consulta_eventos", "Falha ao registrar agendamento: " + e.message)
  }
}

// Cria evento no Google Calendar
async function criarEventoConsulta(cliente, dataHora, duracaoMin, opcoes = {}) {
  const calendar = opcoes.calendar || getCalendar()
  const dealId = sanitizarTextoEntrada(cliente?.negocioId)
  if (!dealId) throw new Error("dealId obrigatorio para criar consulta")
  const inicio = new Date(dataHora)
  const fim = new Date(inicio.getTime() + duracaoMin * 60 * 1000)
  if (isNaN(inicio.getTime()) || !Number.isFinite(Number(duracaoMin))) {
    throw new Error("dataHora e duracaoMin validos sao obrigatorios")
  }
  if (!horarioAindaPodeSerAgendado(inicio)) {
    throw new Error("horario de consulta ja venceu ou esta muito proximo")
  }
  if (!horarioDentroDoExpediente(inicio, duracaoMin)) {
    throw new Error("horario de consulta fora do expediente")
  }
  const chaveIdempotencia = `${dealId}:${inicio.toISOString()}:${Number(duracaoMin)}`
  const eventosExistentes = await listarEventosConsultaPorDeal(dealId, { showDeleted: true, calendar })
  for (const existente of eventosExistentes) {
    const estado = classificarEstadoEvento(existente)
    const mesmaChave = existente.extendedProperties?.private?.chaveIdempotencia === chaveIdempotencia
    if (mesmaChave && estado.status === "agendada") {
      await registrarHistoricoAgendamento({
        tipo: existente.extendedProperties?.private?.eventoConsultaTipo || "consulta.scheduled",
        dealId,
        eventId: existente.id,
        inicio: estado.inicio,
        fim: estado.fim,
        duracaoMin,
        tipoConsulta: existente.extendedProperties?.private?.tipoConsulta,
        origem: opcoes.origem || cliente.origemConsulta || "system"
      })
      logDebug(`[CALENDAR] Retry idempotente reutilizou evento: ${existente.id}`)
      return existente.id
    }
  }
  const revisao = eventosExistentes.filter(evento =>
    evento.extendedProperties?.private?.chaveIdempotencia === chaveIdempotencia
  ).length
  const eventIdDeterministico = crypto.createHash("sha256")
    .update(`${chaveIdempotencia}:${revisao}`)
    .digest("hex")
    .slice(0, 32)

  const eventosAtivosAnteriores = eventosExistentes.filter(evento =>
    classificarEstadoEvento(evento).status === "agendada" && evento.id !== eventIdDeterministico
  )
  await cancelarEventosAtivosDoDeal(dealId, { excetoEventId: eventIdDeterministico, calendar })

  const tipoHistorico = eventosAtivosAnteriores.length ? "consulta.rescheduled" : "consulta.scheduled"

  try {
    const evento = await calendar.events.insert({
      calendarId: CALENDAR_ID,
      requestBody: {
        id: eventIdDeterministico,
        summary: `Consulta Jurídica — ${cliente.nome || "Cliente"}`,
        description: [
          `Área: ${cliente.area || "—"}`,
          `Caso: ${cliente.numeroCaso || "—"}`,
          `WhatsApp: ${cliente._numero || "—"}`,
          `Situação: ${cliente.situacao || "—"}`
        ].join("\n"),
        start: { dateTime: inicio.toISOString(), timeZone: TIMEZONE },
        end: { dateTime: fim.toISOString(), timeZone: TIMEZONE },
        extendedProperties: {
          private: {
            dealId,
            personId: String(cliente.personId || cliente.contatoId || ""),
            contactId: String(cliente.contatoId || ""),
            tipoConsulta: String(cliente.tipoConsulta || "inicial"),
            versaoIntegracao: "3",
            chaveIdempotencia,
            eventoConsultaTipo: tipoHistorico,
            resultadoPadraoExpiracao: String(cliente.resultadoPadraoExpiracao || "nao_compareceu")
          }
        },
        reminders: {
          useDefault: false,
          overrides: [
            { method: "popup", minutes: 30 },
            { method: "email", minutes: 60 }
          ]
        }
      }
    })
    await registrarHistoricoAgendamento({
      tipo: tipoHistorico,
      dealId,
      eventId: evento.data.id,
      inicio: inicio.toISOString(),
      fim: fim.toISOString(),
      duracaoMin,
      tipoConsulta: cliente.tipoConsulta,
      origem: opcoes.origem || cliente.origemConsulta || "system"
    })
    return evento.data.id
  } catch (e) {
    const status = e?.code || e?.response?.status || e?.status
    if (status === 409) {
      const existente = await calendar.events.get({ calendarId: CALENDAR_ID, eventId: eventIdDeterministico })
      const idExistente = existente.data?.id || eventIdDeterministico
      await registrarHistoricoAgendamento({
        tipo: tipoHistorico,
        dealId,
        eventId: idExistente,
        inicio: inicio.toISOString(),
        fim: fim.toISOString(),
        duracaoMin,
        tipoConsulta: cliente.tipoConsulta,
        origem: opcoes.origem || cliente.origemConsulta || "system"
      })
      return idExistente
    }
    throw e
  }
}

function classificarEstadoEvento(ev = {}) {
  const status = ev.status || null
  const privado = ev.extendedProperties?.private || {}
  const statusManual = sanitizarTextoEntrada(privado.consultaStatus).toLowerCase()
  const dtInicio = ev.start?.dateTime || ev.start?.date || null
  const dtFim = ev.end?.dateTime || ev.end?.date || dtInicio
  const dataFim = dtFim ? new Date(dtFim) : null
  const passou = dataFim instanceof Date && !isNaN(dataFim.getTime()) ? dataFim < new Date() : false

  let consultaStatus = "sem_consulta"
  if (statusManual === "realizada" || statusManual === "nao_compareceu") {
    consultaStatus = statusManual
  } else if (status === "cancelled") {
    consultaStatus = "cancelada"
  } else if (passou) {
    consultaStatus = "encerrada"
  } else if (dtInicio) {
    consultaStatus = "agendada"
  }

  return {
    status: consultaStatus,
    encontrado: true,
    cancelado: consultaStatus === "cancelada",
    passou,
    statusCalendar: status,
    inicio: dtInicio,
    fim: dtFim,
    eventId: ev.id || null,
    summary: ev.summary || "",
    description: ev.description || "",
    metadata: privado,
    fonte: "calendar"
  }
}

async function obterEstadoEventoConsulta(eventId) {
  const evento = sanitizarTextoEntrada(eventId)
  if (!evento) return { encontrado: false, motivo: "eventId_ausente" }

  try {
    const cal = getCalendar()
    const ev = await cal.events.get({ calendarId: CALENDAR_ID, eventId: evento })
    return classificarEstadoEvento(ev.data || {})
  } catch (e) {
    if (e?.code === 404 || e?.response?.status === 404 || e?.status === 404) {
      return { status: "cancelada", encontrado: false, cancelado: true, motivo: "evento_nao_encontrado", fonte: "calendar" }
    }
    throw e
  }
}

async function buscarEventoConsultaPorDeal(dealId) {
  const eventos = await listarEventosConsultaPorDeal(dealId, { showDeleted: true })
  return selecionarEventoConsultaMaisRecente(eventos, dealId)
}

async function listarEventosConsultaPorDeal(dealId, { showDeleted = true, calendar = null } = {}) {
  const id = sanitizarTextoEntrada(dealId)
  if (!id) return []
  const cal = calendar || getCalendar()
  const res = await cal.events.list({
    calendarId: CALENDAR_ID,
    privateExtendedProperty: [`dealId=${id}`],
    singleEvents: true,
    showDeleted,
    maxResults: 50
  })
  return (res.data?.items || []).filter(ev => ev?.extendedProperties?.private?.dealId === id)
}

async function cancelarEventosAtivosDoDeal(dealId, { excetoEventId = "", calendar = null } = {}) {
  const id = sanitizarTextoEntrada(dealId)
  if (!id) return []
  const cal = calendar || getCalendar()
  const eventos = await listarEventosConsultaPorDeal(id, { showDeleted: false, calendar: cal })
  const cancelados = []
  for (const evento of eventos) {
    if (evento.id === excetoEventId || classificarEstadoEvento(evento).status !== "agendada") continue
    try {
      await cal.events.delete({ calendarId: CALENDAR_ID, eventId: evento.id })
      cancelados.push(evento.id)
    } catch (e) {
      const status = e?.code || e?.response?.status || e?.status
      if (status !== 404 && status !== 410) throw e
    }
  }
  return cancelados
}

function selecionarEventoConsultaMaisRecente(eventos = [], dealId = "") {
  const id = sanitizarTextoEntrada(dealId)
  const candidatos = [...(Array.isArray(eventos) ? eventos : [])]
    .filter(ev => !id || ev?.extendedProperties?.private?.dealId === id)
  const ativos = candidatos.filter(evento => classificarEstadoEvento(evento).status === "agendada")
  return (ativos.length ? ativos : candidatos).sort((a, b) => {
      const da = a.start?.dateTime || a.start?.date || ""
      const db = b.start?.dateTime || b.start?.date || ""
      return String(db).localeCompare(String(da))
    })[0] || null
}

async function listarEventosConsultaAtivos() {
  const cal = getCalendar()
  const res = await cal.events.list({
    calendarId: CALENDAR_ID,
    timeMin: new Date().toISOString(),
    singleEvents: true,
    showDeleted: false,
    orderBy: "startTime",
    maxResults: 250
  })
  return (res.data?.items || [])
    .map(classificarEstadoEvento)
    .filter(estado => estado.status === "agendada" && estado.metadata?.dealId)
}

async function listarTodosEventosConsulta({
  timeMin = new Date(Date.now() - 730 * 24 * 60 * 60 * 1000).toISOString(),
  timeMax = new Date(Date.now() + 730 * 24 * 60 * 60 * 1000).toISOString()
} = {}) {
  const cal = getCalendar()
  const eventos = []
  let pageToken
  do {
    const res = await cal.events.list({
      calendarId: CALENDAR_ID,
      timeMin,
      timeMax,
      singleEvents: true,
      showDeleted: true,
      maxResults: 250,
      pageToken
    })
    eventos.push(...(res.data?.items || []))
    pageToken = res.data?.nextPageToken
  } while (pageToken)
  return eventos.filter(evento => evento?.extendedProperties?.private?.dealId)
}

async function buscarPrimeiroEventoCalendarNoIntervalo(inicio, fim) {
  const cal = getCalendar()
  const eventos = await cal.events.list({
    calendarId: CALENDAR_ID,
    timeMin: new Date(inicio).toISOString(),
    timeMax: new Date(fim).toISOString(),
    singleEvents: true,
    maxResults: 1
  })
  return eventos.data?.items?.[0] || null
}

async function obterEstadoConsulta(dealId) {
  const id = sanitizarTextoEntrada(dealId)
  if (!id) return { status: "sem_consulta", encontrado: false, eventId: null, inicio: null, fim: null, fonte: "calendar" }
  try {
    const evento = await buscarEventoConsultaPorDeal(id)
    if (evento) return classificarEstadoEvento(evento)
  } catch (e) {
    logErro("calendar", "obterEstadoConsulta: " + e.message)
    throw e
  }
  return { status: "sem_consulta", encontrado: false, eventId: null, inicio: null, fim: null, fonte: "calendar" }
}

async function definirResultadoConsulta(eventId, status) {
  const evento = sanitizarTextoEntrada(eventId)
  const resultado = sanitizarTextoEntrada(status).toLowerCase()
  if (!evento || !["realizada", "nao_compareceu"].includes(resultado)) {
    throw new Error("eventId e status manual valido sao obrigatorios")
  }
  const cal = getCalendar()
  const atual = await cal.events.get({ calendarId: CALENDAR_ID, eventId: evento })
  const privateAtual = atual.data?.extendedProperties?.private || {}
  await cal.events.patch({
    calendarId: CALENDAR_ID,
    eventId: evento,
    requestBody: {
      extendedProperties: {
        private: {
          ...privateAtual,
          consultaStatus: resultado,
          consultaStatusAtualizadoEm: new Date().toISOString()
        }
      }
    }
  })
  return obterEstadoEventoConsulta(evento)
}

async function vincularEventoConsulta(eventId, metadata = {}) {
  const evento = sanitizarTextoEntrada(eventId)
  if (!evento) throw new Error("eventId obrigatorio")
  const cal = getCalendar()
  const atual = await cal.events.get({ calendarId: CALENDAR_ID, eventId: evento })
  const privateAtual = atual.data?.extendedProperties?.private || {}
  const privados = {
    ...privateAtual,
    dealId: String(metadata.dealId || privateAtual.dealId || ""),
    personId: String(metadata.personId || privateAtual.personId || metadata.contactId || ""),
    contactId: String(metadata.contactId || privateAtual.contactId || ""),
    tipoConsulta: String(metadata.tipoConsulta || privateAtual.tipoConsulta || "inicial"),
    versaoIntegracao: "3"
  }
  await cal.events.patch({
    calendarId: CALENDAR_ID,
    eventId: evento,
    requestBody: { extendedProperties: { private: privados } }
  })
  return { ...classificarEstadoEvento(atual.data || {}), metadata: privados }
}

module.exports = {
  horarioDentroDoExpediente,
  configurarConsultaEventSink,
  buscarHorariosDisponiveis,
  criarEventoConsulta,
  obterEstadoEventoConsulta: (...args) => {
    forbidDirectCalendarUsage()
    return obterEstadoEventoConsulta(...args)
  },
  obterEstadoConsulta: (...args) => {
    forbidDirectCalendarUsage()
    return obterEstadoConsulta(...args)
  },
  definirResultadoConsulta,
  buscarEventoConsultaPorDeal: (...args) => {
    forbidDirectCalendarUsage()
    return buscarEventoConsultaPorDeal(...args)
  },
  listarEventosConsultaAtivos: (...args) => {
    forbidDirectCalendarUsage()
    return listarEventosConsultaAtivos(...args)
  },
  listarTodosEventosConsulta: (...args) => {
    forbidDirectCalendarUsage()
    return listarTodosEventosConsulta(...args)
  },
  buscarPrimeiroEventoCalendarNoIntervalo: (...args) => {
    forbidDirectCalendarUsage()
    return buscarPrimeiroEventoCalendarNoIntervalo(...args)
  },
  vincularEventoConsulta,
  classificarEstadoEvento: (...args) => {
    forbidDirectCalendarUsage()
    return classificarEstadoEvento(...args)
  },
  selecionarEventoConsultaMaisRecente: (...args) => {
    forbidDirectCalendarUsage()
    return selecionarEventoConsultaMaisRecente(...args)
  },
  listarEventosConsultaPorDeal: (...args) => {
    forbidDirectCalendarUsage()
    return listarEventosConsultaPorDeal(...args)
  },
  cancelarEventosAtivosDoDeal
}
