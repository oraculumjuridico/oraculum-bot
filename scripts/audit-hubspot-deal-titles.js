require("dotenv").config()

const axios = require("axios")
const {
  montarTituloNegocioHubSpot,
  numeroCasoNegocio,
  rotuloTipoCasoNegocio
} = require("../src/domain/hubspot-deal-title")
const { resolveLegalCaseNomenclature } = require("../src/domain/legal-case-nomenclature")
const { sanitizarTextoEntrada } = require("../src/utils/text")

const CONFIRMATION = "RECONCILE_DEAL_NOMENCLATURE"
const APPLY = process.argv.includes("--apply")
const SUMMARY_ONLY = process.argv.includes("--summary-only")

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
  "dealname", "dealstage", "area_juridica", "numero_de_caso",
  "numero_caso", "numero_do_caso", "temperatura_lead", "createdate",
  "tipo_de_caso", "oraculum_case_subtype", "description",
  "resumo_cliente", "descricao_completa"
]

function headers() {
  return {
    Authorization: `Bearer ${process.env.HUBSPOT_TOKEN}`,
    "Content-Type": "application/json"
  }
}

function normalizarTemperaturaHubSpot(value = "") {
  const texto = sanitizarTextoEntrada(value).normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "").toLowerCase()
  if (texto.includes("quente")) return "quente"
  if (texto.includes("morno")) return "morno"
  return "frio"
}

function planoTitulo(deal = {}) {
  const props = deal.properties || {}
  const numeroCaso = numeroCasoNegocio(props)
  const usuario = {
    area: props.area_juridica,
    numeroCaso,
    negocioStageId: props.dealstage,
    temperatura: normalizarTemperaturaHubSpot(props.temperatura_lead),
    tipo_de_caso: props.tipo_de_caso,
    oraculum_case_subtype: props.oraculum_case_subtype,
    descricao: props.description || props.descricao_completa,
    assuntoResumo: props.resumo_cliente
  }
  const nomenclatura = resolveLegalCaseNomenclature({
    narrative: [usuario.descricao, usuario.assuntoResumo].filter(Boolean),
    usuario,
    deal: { properties: props },
    classification: {
      area: usuario.area,
      tipo: usuario.tipo_de_caso,
      subTipo: usuario.oraculum_case_subtype
    }
  })
  const classificationConflict = nomenclatura.divergences.some(item => ["area", "subtype"].includes(item.field))
  if (!classificationConflict && nomenclatura.subtype) {
    usuario.nomenclaturaJuridica = nomenclatura
  }
  const referencia = rotuloTipoCasoNegocio(usuario)
  const tituloProposto = montarTituloNegocioHubSpot(usuario, {
    HS_STAGE,
    stage: props.dealstage
  })
  const motivos = []
  if (!numeroCaso) motivos.push("caso_sem_numero_oficial")
  if (!sanitizarTextoEntrada(props.area_juridica)) motivos.push("area_ausente")
  if (!referencia) motivos.push("referencia_juridica_nao_determinada")
  if (classificationConflict) motivos.push("classificacao_divergente")
  if (sanitizarTextoEntrada(props.dealname) !== tituloProposto) motivos.push("titulo_fora_do_padrao")

  const aplicavel = Boolean(numeroCaso && referencia && !classificationConflict)
  const propriedades = aplicavel && motivos.includes("titulo_fora_do_padrao")
    ? { dealname: tituloProposto }
    : {}
  if (aplicavel && !sanitizarTextoEntrada(props.oraculum_case_subtype) && nomenclatura.subtype) {
    propriedades.oraculum_case_subtype = nomenclatura.subtype
  }

  return {
    dealId: String(deal.id || ""),
    tituloAtual: sanitizarTextoEntrada(props.dealname) || null,
    tituloProposto,
    numeroCaso: numeroCaso || null,
    referencia: referencia || null,
    motivos,
    propriedades,
    aplicavel: aplicavel && Object.keys(propriedades).length > 0,
    requerRevisaoHumana: !aplicavel
  }
}

async function buscarPagina(after = null) {
  const body = {
    filterGroups: [], properties: PROPERTIES,
    sorts: [{ propertyName: "createdate", direction: "DESCENDING" }], limit: 100
  }
  if (after) body.after = after
  const res = await axios.post("https://api.hubapi.com/crm/v3/objects/deals/search", body, { headers: headers() })
  return res.data || {}
}

async function aplicarPlano(plano) {
  if (!plano.aplicavel) return false
  await axios.patch(
    `https://api.hubapi.com/crm/v3/objects/deals/${plano.dealId}`,
    { properties: plano.propriedades },
    { headers: headers() }
  )
  return true
}

async function main() {
  if (!process.env.HUBSPOT_TOKEN) throw new Error("HUBSPOT_TOKEN_AUSENTE")
  if (APPLY && !process.argv.includes(`--confirm=${CONFIRMATION}`)) {
    throw new Error("CONFIRMACAO_LIVE_OBRIGATORIA")
  }

  const resultados = []
  let after = null
  let atualizados = 0
  do {
    const pagina = await buscarPagina(after)
    for (const deal of pagina.results || []) {
      const plano = planoTitulo(deal)
      if (!plano.motivos.length || (!plano.aplicavel && !plano.requerRevisaoHumana)) continue
      resultados.push(plano)
      if (APPLY && await aplicarPlano(plano)) atualizados += 1
    }
    after = pagina.paging?.next?.after || null
  } while (after)

  const resumo = {
    modo: APPLY ? "apply" : "dry-run",
    totalAnalisadoComPendencia: resultados.length,
    prontosParaCorrecao: resultados.filter(item => item.aplicavel).length,
    revisarManualmente: resultados.filter(item => item.requerRevisaoHumana).length,
    motivos: Object.fromEntries([...new Set(resultados.flatMap(item => item.motivos))].sort().map(motivo => [
      motivo,
      resultados.filter(item => item.motivos.includes(motivo)).length
    ])),
    alteracoesPlanejadas: {
      titulos: resultados.filter(item => item.propriedades.dealname).length,
      subtiposVazios: resultados.filter(item => item.propriedades.oraculum_case_subtype).length
    },
    atualizados,
    geradoEm: new Date().toISOString(),
    ...(SUMMARY_ONLY ? {} : { resultados })
  }
  console.log(JSON.stringify(resumo, null, 2))
  return resumo
}

if (require.main === module) {
  main().catch(err => {
    console.error(JSON.stringify({ erro: "falha_reconciliacao_titulos_hubspot", mensagem: err.message, status: err.response?.status || null }))
    process.exitCode = 1
  })
}

module.exports = { CONFIRMATION, planoTitulo, main }
