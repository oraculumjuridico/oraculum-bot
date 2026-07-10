require("dotenv").config()

const axios = require("axios")
const { montarTituloNegocioHubSpot, numeroCasoNegocio } = require("../src/domain/hubspot-deal-title")
const { sanitizarTextoEntrada } = require("../src/utils/text")

const HS_STAGE = {
  LEAD: "appointmentscheduled",
  CADASTRO: "qualifiedtobuy",
  ANALISE: "presentationscheduled",
  AGUARDANDO_DOCS: "decisionmakerboughtin",
  DOCS: "contractsent",
  PROTOCOLO: "1343040098",
  PROCESSO: "1337291921",
  FINAL: "1343039663"
}

const PROPERTIES = [
  "dealname",
  "dealstage",
  "area_juridica",
  "numero_de_caso",
  "numero_caso",
  "numero_do_caso",
  "temperatura_lead",
  "createdate"
]

function headers() {
  return {
    Authorization: `Bearer ${process.env.HUBSPOT_TOKEN}`,
    "Content-Type": "application/json"
  }
}

function normalizarTemperaturaHubSpot(value = "") {
  const texto = sanitizarTextoEntrada(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
  if (texto.includes("quente")) return "quente"
  if (texto.includes("morno")) return "morno"
  return "frio"
}

function motivoMudanca(props = {}, tituloProposto = "") {
  const motivos = []
  if (sanitizarTextoEntrada(props.dealname) !== tituloProposto) motivos.push("titulo_fora_do_padrao")
  if (!sanitizarTextoEntrada(props.area_juridica)) motivos.push("area_ausente")
  const numero = numeroCasoNegocio(props)
  const stage = sanitizarTextoEntrada(props.dealstage)
  const stagesCliente = new Set([
    HS_STAGE.ANALISE,
    HS_STAGE.AGUARDANDO_DOCS,
    HS_STAGE.DOCS,
    HS_STAGE.PROTOCOLO,
    HS_STAGE.PROCESSO,
    HS_STAGE.FINAL
  ])
  if (stagesCliente.has(stage) && !numero) motivos.push("cliente_sem_numero_oficial")
  return motivos
}

function planoTitulo(deal = {}) {
  const props = deal.properties || {}
  const tituloProposto = montarTituloNegocioHubSpot({
    area: props.area_juridica,
    numeroCaso: numeroCasoNegocio(props),
    negocioStageId: props.dealstage,
    temperatura: normalizarTemperaturaHubSpot(props.temperatura_lead)
  }, {
    HS_STAGE,
    stage: props.dealstage
  })
  const motivos = motivoMudanca(props, tituloProposto)
  return {
    dealId: deal.id,
    tituloAtual: sanitizarTextoEntrada(props.dealname) || null,
    tituloProposto,
    stage: sanitizarTextoEntrada(props.dealstage) || null,
    area: sanitizarTextoEntrada(props.area_juridica) || null,
    numeroCaso: numeroCasoNegocio(props) || null,
    motivos,
    requerRevisaoHumana: motivos.includes("area_ausente") || motivos.includes("cliente_sem_numero_oficial")
  }
}

async function buscarPagina(after = null) {
  const body = {
    filterGroups: [],
    properties: PROPERTIES,
    sorts: [{ propertyName: "createdate", direction: "DESCENDING" }],
    limit: 100
  }
  if (after) body.after = after
  const res = await axios.post(
    "https://api.hubapi.com/crm/v3/objects/deals/search",
    body,
    { headers: headers() }
  )
  return res.data || {}
}

async function main() {
  if (!process.env.HUBSPOT_TOKEN) {
    console.error("HUBSPOT_TOKEN ausente. Auditoria live nao executada.")
    process.exitCode = 1
    return
  }

  const resultados = []
  let after = null
  do {
    const pagina = await buscarPagina(after)
    for (const deal of pagina.results || []) {
      const plano = planoTitulo(deal)
      if (plano.motivos.length) resultados.push(plano)
    }
    after = pagina.paging?.next?.after || null
  } while (after)

  const resumo = {
    modo: "dry-run",
    totalComMudanca: resultados.length,
    revisarManualmente: resultados.filter(item => item.requerRevisaoHumana).length,
    geradoEm: new Date().toISOString(),
    resultados
  }
  console.log(JSON.stringify(resumo, null, 2))
}

main().catch(err => {
  console.error(JSON.stringify({
    erro: "falha_auditoria_titulos_hubspot",
    mensagem: err.message,
    status: err.response?.status || null
  }))
  process.exitCode = 1
})
