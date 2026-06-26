const { google } = require("googleapis")
const { sanitizarTextoEntrada } = require("../utils/text")
const { logDebug, logErro } = require("../utils/logging")

const {
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
  GOOGLE_REFRESH_TOKEN
} = process.env

const CALENDAR_ID = "oraculum.juridico@gmail.com"
const TIMEZONE = "America/Sao_Paulo"

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

  // Agrupa slots por dia — máximo 3 por dia
  const slotsPorDia = {}
  const cursor = new Date(agora)
  cursor.setMinutes(0, 0, 0)
  cursor.setHours(cursor.getHours() + 1)

  while (cursor < fim) {
    const localStr = cursor.toLocaleString("en-US", { timeZone: TIMEZONE })
    const local = new Date(localStr)
    const diaSemana = local.getDay()
    const hora = local.getHours()
    const ehUtil = diaSemana >= 1 && diaSemana <= 5
    const ehSabado = diaSemana === 6
    const horaOk = (ehUtil && hora >= 9 && hora < 17) ||
                   (ehSabado && hora >= 9 && hora < 15)

    if (horaOk) {
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
        if (slotsPorDia[diaKey].length < 3) {
          slotsPorDia[diaKey].push(new Date(cursor))
        }
      }
    }
    cursor.setHours(cursor.getHours() + 1)
  }

  // Flatten — todos os slots organizados por dia
  const todosSlots = Object.values(slotsPorDia).flat()

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

// Cria evento no Google Calendar
async function criarEventoConsulta(cliente, dataHora, duracaoMin) {
  const calendar = getCalendar()

  // Cancela evento anterior se existir
  if (cliente._eventoCalendarId) {
    try {
      await calendar.events.delete({ calendarId: CALENDAR_ID, eventId: cliente._eventoCalendarId })
      logDebug(`[CALENDAR] Evento anterior cancelado: ${cliente._eventoCalendarId}`)
    } catch (e) {
      logErro("calendar", "Falha ao cancelar evento anterior: " + e.message)
    }
  }

  const inicio = new Date(dataHora)
  const fim = new Date(inicio.getTime() + duracaoMin * 60 * 1000)

  const evento = await calendar.events.insert({
    calendarId: CALENDAR_ID,
    requestBody: {
      summary: `Consulta Jurídica — ${cliente.nome || "Cliente"}`,
      description: [
        `Área: ${cliente.area || "—"}`,
        `Caso: ${cliente.numeroCaso || "—"}`,
        `WhatsApp: ${cliente._numero || "—"}`,
        `Situação: ${cliente.situacao || "—"}`
      ].join("\n"),
      start: { dateTime: inicio.toISOString(), timeZone: TIMEZONE },
      end: { dateTime: fim.toISOString(), timeZone: TIMEZONE },
      reminders: {
        useDefault: false,
        overrides: [
          { method: "popup", minutes: 30 },
          { method: "email", minutes: 60 }
        ]
      }
    }
  })

  return evento.data.id
}

async function obterEstadoEventoConsulta(eventId) {
  const evento = sanitizarTextoEntrada(eventId)
  if (!evento) return { encontrado: false, motivo: "eventId_ausente" }

  try {
    const cal = getCalendar()
    const ev = await cal.events.get({ calendarId: CALENDAR_ID, eventId: evento })
    const status = ev.data?.status || null
    const dtInicio = ev.data?.start?.dateTime || ev.data?.start?.date || null
    const dtFim = ev.data?.end?.dateTime || ev.data?.end?.date || dtInicio
    const dataFim = dtFim ? new Date(dtFim) : null
    return {
      encontrado: true,
      cancelado: status === "cancelled",
      passou: dataFim instanceof Date && !isNaN(dataFim.getTime()) ? dataFim < new Date() : false,
      status,
      inicio: dtInicio,
      fim: dtFim
    }
  } catch (e) {
    if (e?.code === 404 || e?.response?.status === 404 || e?.status === 404) {
      return { encontrado: false, cancelado: true, motivo: "evento_nao_encontrado" }
    }
    throw e
  }
}

module.exports = {
  buscarHorariosDisponiveis,
  criarEventoConsulta,
  obterEstadoEventoConsulta
}
