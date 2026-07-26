const { sanitizarTextoEntrada } = require("../utils/text")
const { definirTemperatura } = require("./lead-temperature")

const AREA_SIGLAS = [
  { sigla: "Prv", termos: ["inss", "previd", "aposentadoria", "beneficio"] },
  { sigla: "Trb", termos: ["trabalh"] },
  { sigla: "Cns", termos: ["consum", "produto", "servico", "fornecedor"] },
  { sigla: "Fam", termos: ["famil", "divor", "guarda", "pensao", "inventario"] },
  { sigla: "Bnc", termos: ["banc", "financ", "emprest", "consignado"] },
  { sigla: "Civ", termos: ["civel", "civil", "contrato", "indeniz"] }
]

function normalizarTextoTitulo(value = "") {
  return sanitizarTextoEntrada(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
}

function siglaAreaNegocio(area = "") {
  const texto = normalizarTextoTitulo(area)
  const regra = AREA_SIGLAS.find(item => item.termos.some(termo => texto.includes(termo)))
  return regra?.sigla || "Jur"
}

function numeroCasoNegocio(u = {}) {
  return sanitizarTextoEntrada(
    u.numeroCaso ||
    u.numero_caso ||
    u.numero_do_caso ||
    u.numero_de_caso ||
    ""
  )
}

function siglaNumeroCaso(numeroCaso = "") {
  const match = sanitizarTextoEntrada(numeroCaso).match(/^([A-Z]{2,4})\./)
  return match?.[1] || ""
}

function siglaCanonicaNegocio(u = {}) {
  return siglaNumeroCaso(numeroCasoNegocio(u)) || siglaAreaNegocio(u.area || u.area_juridica || u.tipo || u.situacao)
}

function classificacaoTituloNegocio(u = {}, { HS_STAGE = null, stage = null } = {}) {
  const stageAtual = sanitizarTextoEntrada(stage || u.negocioStageId || u.dealstage)
  const stagesCliente = new Set([
    HS_STAGE?.ANALISE,
    HS_STAGE?.AGUARDANDO_DOCS,
    HS_STAGE?.DOCS,
    HS_STAGE?.PROTOCOLO,
    HS_STAGE?.PROCESSO,
    HS_STAGE?.FINAL
  ].filter(Boolean))

  if (numeroCasoNegocio(u) || stagesCliente.has(stageAtual)) {
    return { tipo: "cliente", prefixo: "", bolinha: "🟢" }
  }

  const temperatura = sanitizarTextoEntrada(u.temperatura || u.temperaturaLead || definirTemperatura(u)).toLowerCase()
  if (temperatura === "quente") return { tipo: "lead_quente", prefixo: "LQ-", bolinha: "🟠" }
  if (temperatura === "morno") return { tipo: "lead_morno", prefixo: "LM-", bolinha: "🟡" }
  return { tipo: "lead_frio", prefixo: "LF-", bolinha: "⚪" }
}

function montarTituloNegocioHubSpot(u = {}, options = {}) {
  const numeroCaso = numeroCasoNegocio(u)
  const area = siglaCanonicaNegocio(u)
  const classificacao = classificacaoTituloNegocio(u, options)
  const identificador = numeroCaso
    ? (siglaNumeroCaso(numeroCaso) ? numeroCaso : `${area}-${numeroCaso}`)
    : `${classificacao.prefixo}${area}`
  return `${classificacao.bolinha} ${identificador}`
}

function aplicarTituloNegocioHubSpot(u = {}, props = {}, options = {}) {
  return {
    ...props,
    dealname: montarTituloNegocioHubSpot(
      {
        ...u,
        area: props.area_juridica || u.area,
        numeroCaso: props.numero_de_caso || props.numero_caso || props.numero_do_caso || u.numeroCaso,
        negocioStageId: props.dealstage || u.negocioStageId
      },
      options
    )
  }
}

module.exports = {
  siglaAreaNegocio,
  siglaNumeroCaso,
  siglaCanonicaNegocio,
  numeroCasoNegocio,
  classificacaoTituloNegocio,
  montarTituloNegocioHubSpot,
  aplicarTituloNegocioHubSpot
}
