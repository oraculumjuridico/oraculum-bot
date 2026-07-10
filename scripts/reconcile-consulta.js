require("dotenv").config({ quiet: true })

const fs = require("fs")
const path = require("path")
const {
  classificarEstadoCalendar,
  selecionarEventoConsultaMaisRecente,
  listConsultaCalendarEventsForReconciliation,
  definirResultadoConsulta,
  appendConsultaEvent,
  calcularMetricasConsulta,
  persistirMetricasConsulta
} = require("../src/domain/consultation")

const dryRun = process.argv.includes("--dry-run")
const USERS_FILE = path.join(__dirname, "..", "data", "users-state.json")

function carregarEstadoLocal() {
  try {
    return JSON.parse(fs.readFileSync(USERS_FILE, "utf8"))
  } catch {
    return { savedAt: null, users: {} }
  }
}

function salvarEstadoLocal(estado) {
  const temporario = `${USERS_FILE}.${process.pid}.tmp`
  fs.writeFileSync(temporario, JSON.stringify({
    ...estado,
    savedAt: new Date().toISOString()
  }, null, 2), "utf8")
  fs.renameSync(temporario, USERS_FILE)
}

async function reconciliarEventos(eventos) {
  const projetados = []
  const alteracoes = []
  for (const evento of eventos) {
    const estado = classificarEstadoCalendar(evento)
    const dealId = estado.metadata?.dealId
    const metadataHistorico = {
      calendarEventId: evento.id,
      inicio: estado.inicio,
      fim: estado.fim,
      tipoConsulta: estado.metadata?.tipoConsulta,
      versaoIntegracao: estado.metadata?.versaoIntegracao || "3"
    }
    if (estado.status !== "encerrada") {
      if (!dryRun && dealId) {
        const tipo = {
          agendada: estado.metadata?.eventoConsultaTipo || "consulta.scheduled",
          cancelada: "consulta.canceled",
          realizada: "consulta.completed",
          nao_compareceu: "consulta.no_show"
        }[estado.status]
        if (tipo) {
          await appendConsultaEvent({
            tipo,
            dealId,
            timestamp: estado.fim && estado.status !== "agendada" ? estado.fim : undefined,
            consultaStatus: estado.status,
            metadata: metadataHistorico,
            origem: "reconciliation",
            chaveIdempotencia: `calendar:${evento.id}:${estado.status}`
          })
        }
      }
      projetados.push(evento)
      continue
    }
    const regra = evento.extendedProperties?.private?.resultadoPadraoExpiracao
    const resultado = regra === "realizada" ? "realizada" : "nao_compareceu"
    alteracoes.push({
      dealId: estado.metadata?.dealId || null,
      eventId: evento.id,
      de: "encerrada",
      para: resultado
    })
    if (!dryRun) {
      await appendConsultaEvent({
        tipo: "consulta.expired",
        dealId,
        timestamp: estado.fim || new Date().toISOString(),
        consultaStatus: "encerrada",
        metadata: metadataHistorico,
        origem: "reconciliation",
        chaveIdempotencia: `calendar:${evento.id}:encerrada`
      })
      await definirResultadoConsulta(evento.id, resultado)
      await appendConsultaEvent({
        tipo: resultado === "realizada" ? "consulta.completed" : "consulta.no_show",
        dealId,
        consultaStatus: resultado,
        metadata: metadataHistorico,
        origem: "reconciliation",
        chaveIdempotencia: `calendar:${evento.id}:${resultado}`
      })
      projetados.push({
        ...evento,
        extendedProperties: {
          ...evento.extendedProperties,
          private: {
            ...(evento.extendedProperties?.private || {}),
            consultaStatus: resultado
          }
        }
      })
    } else {
      projetados.push({
        ...evento,
        extendedProperties: {
          ...evento.extendedProperties,
          private: {
            ...(evento.extendedProperties?.private || {}),
            consultaStatus: resultado
          }
        }
      })
    }
  }
  return { projetados, alteracoes }
}

function reconciliarSessoes(estadoLocal, eventos) {
  const porDeal = new Map()
  for (const evento of eventos) {
    const dealId = evento.extendedProperties?.private?.dealId
    if (!dealId) continue
    const lista = porDeal.get(String(dealId)) || []
    lista.push(evento)
    porDeal.set(String(dealId), lista)
  }

  const alteracoes = []
  for (const sessao of Object.values(estadoLocal.users || {})) {
    const dealId = sessao?.negocioId ? String(sessao.negocioId) : ""
    if (!dealId) continue
    const evento = selecionarEventoConsultaMaisRecente(porDeal.get(dealId) || [], dealId)
    const estado = evento
      ? classificarEstadoCalendar(evento)
      : { status: sessao.consultaStatus === "agendada" ? "cancelada" : "sem_consulta", eventId: null }
    if (sessao.consultaStatus !== estado.status) {
      alteracoes.push({
        dealId,
        de: sessao.consultaStatus || "sem_consulta",
        para: estado.status,
        eventId: estado.eventId || null
      })
      sessao.consultaStatus = estado.status
    }
  }
  return alteracoes
}

async function main() {
  const eventos = await listConsultaCalendarEventsForReconciliation()
  const { projetados, alteracoes: eventosAlterados } = await reconciliarEventos(eventos)
  const estadoLocal = carregarEstadoLocal()
  const sessoesAlteradas = reconciliarSessoes(estadoLocal, projetados)
  if (!dryRun && sessoesAlteradas.length) salvarEstadoLocal(estadoLocal)

  const metricas = dryRun
    ? calcularMetricasConsulta(projetados)
    : persistirMetricasConsulta(projetados, {
        eventosReconciliados: eventosAlterados.length,
        sessoesReconciliadas: sessoesAlteradas.length
      })

  const relatorio = {
    modo: dryRun ? "dry-run" : "apply",
    idempotente: true,
    eventosLidos: eventos.length,
    eventosAlterados,
    sessoesAlteradas,
    metricas
  }
  console.log(JSON.stringify(relatorio, null, 2))
}

if (require.main === module) {
  main().catch(e => {
    console.error(JSON.stringify({ erro: e.message, modo: dryRun ? "dry-run" : "apply" }))
    process.exitCode = 1
  })
}

module.exports = {
  reconciliarEventos,
  reconciliarSessoes
}
