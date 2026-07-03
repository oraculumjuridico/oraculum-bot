require("dotenv").config()

const axios = require("axios")
const fs = require("fs")
const path = require("path")
const {
  classificarEstadoCalendar,
  selecionarEventoConsultaMaisRecente,
  listConsultaCalendarEventsForReconciliation
} = require("../src/domain/consultation")

const LEGACY_CONSULTA_STAGE = "1343040832"
const STAGES_CONHECIDOS = [
  "appointmentscheduled",
  "qualifiedtobuy",
  "presentationscheduled",
  "decisionmakerboughtin",
  "contractsent",
  LEGACY_CONSULTA_STAGE,
  "1343040098",
  "1337291921",
  "1343039663"
]

const achados = {
  criticos: [],
  medios: [],
  aceitaveis: []
}

function registrar(nivel, codigo, detalhes = {}) {
  achados[nivel].push({ codigo, ...detalhes })
}

function limparAchados() {
  for (const nivel of Object.keys(achados)) achados[nivel].length = 0
}

function snapshot(raw) {
  try {
    const valor = JSON.parse(raw || "{}")
    return valor && typeof valor === "object" ? valor : {}
  } catch {
    return { _invalido: true }
  }
}

function consultaSnapshotAtiva(snap) {
  return snap.consultaStatus === "agendada" ||
    snap.consulta_ativa === true
}

function criarClientesReadOnly() {
  const hubspot = axios.create({
    headers: {
      Authorization: `Bearer ${process.env.HUBSPOT_TOKEN}`,
      "Content-Type": "application/json"
    }
  })
  for (const metodo of ["patch", "put", "delete"]) {
    hubspot[metodo] = async () => { throw new Error(`AUDITOR_READ_ONLY: metodo ${metodo} bloqueado`) }
  }

  return { hubspot }
}

async function listarDeals(hubspot) {
  const deals = []
  let after
  do {
    const body = {
      filterGroups: [{ filters: [{ propertyName: "dealstage", operator: "IN", values: STAGES_CONHECIDOS }] }],
      properties: [
        "dealstage",
        "estado_bot_snapshot",
        "numero_de_caso",
        "createdate",
        "closedate"
      ],
      limit: 100
    }
    if (after) body.after = after
    const res = await hubspot.post("https://api.hubapi.com/crm/v3/objects/deals/search", body)
    deals.push(...(res.data?.results || []))
    after = res.data?.paging?.next?.after
  } while (after)
  return deals
}

function carregarSessoesLocais() {
  try {
    const raw = fs.readFileSync(path.join(__dirname, "..", "data", "users-state.json"), "utf8")
    const parsed = JSON.parse(raw)
    return Object.values(parsed?.users || {}).filter(item => item && typeof item === "object")
  } catch {
    return []
  }
}

function auditar(deals, eventos, sessoesLocais = []) {
  limparAchados()
  const dealsPorId = new Map(deals.map(deal => [String(deal.id), deal]))
  const eventosPorId = new Map(eventos.map(ev => [String(ev.id), ev]))
  const ativosPorDeal = new Map()

  for (const evento of eventos) {
    const estado = classificarEstadoCalendar(evento)
    const meta = evento.extendedProperties?.private || {}
    const ausentes = ["dealId", "personId", "contactId"].filter(campo => !meta[campo])
    if (ausentes.length) {
      const nivel = estado.status === "agendada"
        ? (ausentes.includes("dealId") ? "criticos" : "medios")
        : "aceitaveis"
      registrar(nivel,
        "EVENTO_METADATA_AUSENTE", { eventId: evento.id, status: estado.status, campos: ausentes })
    }
    if (estado.status === "agendada" && meta.dealId) {
      const lista = ativosPorDeal.get(String(meta.dealId)) || []
      lista.push(evento)
      ativosPorDeal.set(String(meta.dealId), lista)
      if (!dealsPorId.has(String(meta.dealId))) {
        registrar("criticos", "EVENTO_ATIVO_DEAL_INEXISTENTE", { eventId: evento.id, dealId: meta.dealId })
      }
    }
  }

  for (const [dealId, lista] of ativosPorDeal) {
    if (lista.length > 1) {
      registrar("criticos", "MULTIPLOS_EVENTOS_ATIVOS", {
        dealId,
        eventIds: lista.map(item => item.id)
      })
    }
  }

  for (const deal of deals) {
    const dealId = String(deal.id)
    const snap = snapshot(deal.properties?.estado_bot_snapshot)
    const eventoAtivo = selecionarEventoConsultaMaisRecente(ativosPorDeal.get(dealId) || [], dealId)

    if (snap._invalido) registrar("medios", "SNAPSHOT_INVALIDO", { dealId })

    if (consultaSnapshotAtiva(snap) && !eventoAtivo) {
      registrar("criticos", "SNAPSHOT_ATIVO_SEM_EVENTO", { dealId })
    }

    if (eventoAtivo) {
      registrar("aceitaveis", "CALENDAR_ATIVO_STAGE_JURIDICO_PRESERVADO", {
        dealId, eventId: eventoAtivo.id, dealstage: deal.properties?.dealstage
      })
    }
  }

  for (const sessao of sessoesLocais) {
    const dealId = sessao.negocioId ? String(sessao.negocioId) : null
    const evento = selecionarEventoConsultaMaisRecente(ativosPorDeal.get(dealId) || [], dealId)
    if (sessao.consultaStatus === "agendada" && !evento) {
      registrar("criticos", "SESSAO_LOCAL_ATIVA_SEM_EVENTO", { dealId })
      continue
    }
    if (sessao.consultaStatus === "agendada" && evento) {
      const estado = classificarEstadoCalendar(evento)
      if (estado.status !== "agendada") {
        registrar("criticos", "SESSAO_LOCAL_ATIVA_EVENTO_NAO_ATIVO", {
          dealId, eventId: evento.id, statusCalendar: estado.status
        })
      }
    }
  }

  return {
    geradoEm: new Date().toISOString(),
    modo: "READ_ONLY",
    escopo: {
      deals: deals.length,
      sessoesLocais: sessoesLocais.length,
      eventosConsulta: eventos.length,
      eventosAtivos: [...ativosPorDeal.values()].flat().length,
      snapshotsAtivos: deals.filter(deal => consultaSnapshotAtiva(snapshot(deal.properties?.estado_bot_snapshot))).length,
      dealsNoStageLegado: deals.filter(deal => deal.properties?.dealstage === LEGACY_CONSULTA_STAGE).length,
      eventosPorStatus: eventos.reduce((acc, evento) => {
        const status = classificarEstadoCalendar(evento).status
        acc[status] = (acc[status] || 0) + 1
        return acc
      }, {}),
      dealsPorStage: deals.reduce((acc, deal) => {
        const stage = deal.properties?.dealstage || "sem_stage"
        acc[stage] = (acc[stage] || 0) + 1
        return acc
      }, {})
    },
    totais: {
      criticos: achados.criticos.length,
      medios: achados.medios.length,
      aceitaveis: achados.aceitaveis.length
    },
    achados
  }
}

async function executarAuditoriaReadOnly() {
  if (!process.env.HUBSPOT_TOKEN) throw new Error("HUBSPOT_TOKEN ausente")
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET || !process.env.GOOGLE_REFRESH_TOKEN) {
    throw new Error("Credenciais Google ausentes")
  }
  const { hubspot } = criarClientesReadOnly()
  const [deals, eventos] = await Promise.all([
    listarDeals(hubspot),
    listConsultaCalendarEventsForReconciliation()
  ])
  return auditar(deals, eventos, carregarSessoesLocais())
}

async function main() {
  console.log(JSON.stringify(await executarAuditoriaReadOnly(), null, 2))
}

if (require.main === module) {
  main().catch(e => {
    console.error(JSON.stringify({ modo: "READ_ONLY", erro: e.response?.data?.message || e.message }))
    process.exitCode = 1
  })
}

module.exports = {
  LEGACY_CONSULTA_STAGE,
  STAGES_CONHECIDOS,
  snapshot,
  consultaSnapshotAtiva,
  auditar,
  executarAuditoriaReadOnly
}
