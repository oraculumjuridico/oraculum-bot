require("dotenv").config()

const axios = require("axios")
const {
  findConsultaCalendarEvent,
  vincularEventoConsulta
} = require("../src/domain/consultation")

const STAGE = {
  ANALISE: "presentationscheduled",
  AGUARDANDO_DOCS: "decisionmakerboughtin",
  DOCS: "contractsent",
  PROTOCOLO: "1343040098",
  PROCESSO: "1337291921",
  FINAL: "1343039663"
}

const aplicar = process.argv.includes("--apply")
const headers = {
  Authorization: `Bearer ${process.env.HUBSPOT_TOKEN}`,
  "Content-Type": "application/json"
}

function parseSnapshot(raw) {
  try {
    const parsed = JSON.parse(raw || "{}")
    return parsed && typeof parsed === "object" ? parsed : {}
  } catch {
    return {}
  }
}

function calcularStageJuridico(snapshot) {
  const recebidos = Array.isArray(snapshot.docsEntregues) ? snapshot.docsEntregues : []
  const faltantes = Array.isArray(snapshot.docs_faltantes)
    ? snapshot.docs_faltantes
    : (Array.isArray(snapshot.docs_status?.faltantesCriticos) ? snapshot.docs_status.faltantesCriticos : [])
  const recebeuAlgum = Boolean(snapshot.documentosEnviados) || recebidos.length > 0
  if (!recebeuAlgum) return STAGE.ANALISE
  if (faltantes.length > 0) return STAGE.AGUARDANDO_DOCS
  return STAGE.DOCS
}

async function listarDealsCandidatos() {
  const todos = []
  let after
  do {
    const body = {
      filterGroups: [{
        filters: [{
          propertyName: "dealstage",
          operator: "IN",
          values: [
            "appointmentscheduled",
            "qualifiedtobuy",
            STAGE.ANALISE,
            STAGE.AGUARDANDO_DOCS,
            STAGE.DOCS,
            STAGE.PROTOCOLO,
            STAGE.PROCESSO,
            STAGE.FINAL
          ]
        }]
      }],
      properties: ["dealstage", "dealname", "estado_bot_snapshot", "numero_de_caso"],
      limit: 100
    }
    if (after) body.after = after
    const res = await axios.post("https://api.hubapi.com/crm/v3/objects/deals/search", body, { headers })
    todos.push(...(res.data?.results || []))
    after = res.data?.paging?.next?.after
  } while (after)
  return todos
}

async function migrarDeal(deal) {
  const snapshot = parseSnapshot(deal.properties?.estado_bot_snapshot)
  const evento = await findConsultaCalendarEvent(deal.id)
  const eventId = evento?.id || null

  const inconsistencia = evento ? null : "deal_sem_evento_calendar"
  const novoStage = calcularStageJuridico(snapshot)

  if (aplicar && eventId) {
    await vincularEventoConsulta(eventId, {
      dealId: deal.id,
      personId: snapshot.personId || snapshot.contatoId,
      contactId: snapshot.contatoId,
      tipoConsulta: snapshot.tipoConsulta || "inicial"
    })
  }

  return {
    dealId: deal.id,
    numeroCaso: deal.properties?.numero_de_caso || null,
    eventId,
    estadoCalendar: evento ? "encontrado" : "sem_consulta",
    novoStage,
    inconsistencia,
    aplicado: aplicar
  }
}

async function main() {
  if (!process.env.HUBSPOT_TOKEN) throw new Error("HUBSPOT_TOKEN ausente")
  const deals = await listarDealsCandidatos()
  const resultados = []
  for (const deal of deals) {
    try {
      resultados.push(await migrarDeal(deal))
    } catch (e) {
      resultados.push({ dealId: deal.id, erro: e.response?.data?.message || e.message, aplicado: false })
    }
  }
  console.log(JSON.stringify({
    modo: aplicar ? "apply" : "dry-run",
    total: resultados.length,
    inconsistencias: resultados.filter(item => item.inconsistencia || item.erro).length,
    resultados
  }, null, 2))
}

main().catch(e => {
  console.error(e.message)
  process.exitCode = 1
})
