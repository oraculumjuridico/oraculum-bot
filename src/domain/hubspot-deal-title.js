const { sanitizarTextoEntrada } = require("../utils/text")
const { definirTemperatura } = require("./lead-temperature")
const { resolveLegalCaseNomenclature } = require("./legal-case-nomenclature")

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

const CASE_TYPE_LABELS = Object.freeze({
  inss_bpc: "BPC LOAS",
  inss_incapacidade: "Benefício por Incapacidade",
  inss_aposentadoria: "Aposentadoria",
  inss_dependentes: "Benefício para Dependentes",
  inss_outros: "Demanda Previdenciária",
  bpc_idoso: "BPC LOAS Idoso",
  bpc_deficiencia: "BPC LOAS Deficiência",
  incapacidade_temporaria: "Auxílio por Incapacidade Temporária",
  incapacidade_permanente: "Aposentadoria por Incapacidade Permanente",
  auxilio_acidente: "Auxílio-acidente",
  pensao_morte: "Pensão por Morte",
  salario_maternidade: "Salário-maternidade",
  trab_demissao: "Demissão / Verbas Rescisórias",
  trab_direitos: "Direitos Trabalhistas",
  trab_acidente: "Acidente de Trabalho",
  trab_assedio: "Assédio no Trabalho",
  trab_outros: "Demanda Trabalhista",
  outros_revisao: "Revisão de Documentos",
  outros_livre: "Demanda Jurídica"
})

const AREA_CASE_LABELS = Object.freeze({
  prv: "Demanda Previdenciária",
  trb: "Demanda Trabalhista",
  cns: "Direito do Consumidor",
  fam: "Direito de Família",
  bnc: "Direito Bancário",
  civ: "Direito Civil",
  pnl: "Direito Penal",
  imb: "Direito Imobiliário"
})

function rotuloAreaCasoNegocio(u = {}) {
  const areaExplicita = sanitizarTextoEntrada(u.area || u.area_juridica || "")
  const sigla = (areaExplicita ? siglaAreaNegocio(areaExplicita) : siglaNumeroCaso(numeroCasoNegocio(u))).toLowerCase()
  return AREA_CASE_LABELS[sigla] || ""
}

function tipoCompativelComArea(type = "", area = "") {
  const tipo = sanitizarTextoEntrada(type).toLowerCase()
  const sigla = siglaAreaNegocio(area).toLowerCase()
  if (!tipo || !area) return true
  if (tipo.startsWith("inss_") || ["bpc_idoso", "bpc_deficiencia", "incapacidade_temporaria", "incapacidade_permanente", "auxilio_acidente", "pensao_morte", "salario_maternidade"].includes(tipo)) return sigla === "prv"
  if (tipo.startsWith("trab_")) return sigla === "trb"
  return true
}

function nomenclaturaJuridicaTitulo(u = {}) {
  const resolved = resolveLegalCaseNomenclature({
    current: u.nomenclaturaJuridica && typeof u.nomenclaturaJuridica === "object"
      ? u.nomenclaturaJuridica
      : null,
    narrative: [u.descricao, u.assuntoResumo, u.detalhe, u.objetivo].filter(Boolean),
    usuario: u,
    classification: {
      area: u.area || u.area_juridica,
      tipo: u.tipo_de_caso || u.tipoCaso || u.tipo,
      subTipo: u.oraculum_case_subtype || u.subTipo || u.subtipo,
      situacao: u.situacao,
      objetivo: u.objetivo
    }
  })
  const classificationConflict = resolved.divergences?.some(item => ["area", "subtype"].includes(item.field))
  return classificationConflict ? null : resolved
}

function rotuloTipoCasoNegocio(u = {}) {
  const areaExplicita = sanitizarTextoEntrada(u.area || u.area_juridica || "")
  const nomenclatura = nomenclaturaJuridicaTitulo(u)
  const nomenclaturaCompativel = tipoCompativelComArea(nomenclatura?.type, areaExplicita)
  const rotuloCanonico = nomenclaturaCompativel
    ? sanitizarTextoEntrada(nomenclatura?.subtypeLabel || "") || CASE_TYPE_LABELS[nomenclatura?.subtype] || CASE_TYPE_LABELS[nomenclatura?.type]
    : ""
  const explicit = sanitizarTextoEntrada(
    u.nomenclaturaJuridica?.subtypeLabel || u.caseTypeLabel || u.rotuloTipoCaso || ""
  )
  const explicitType = u.nomenclaturaJuridica?.type || u.tipo_de_caso || u.tipoCaso || u.caseType
  const tipoGenerico = value => ["inss_outros", "trab_outros", "outros_livre", "outros"].includes(sanitizarTextoEntrada(value).toLowerCase())
  if (explicit && tipoCompativelComArea(explicitType, areaExplicita) && !(tipoGenerico(explicitType) && rotuloCanonico && nomenclatura?.status === "specific")) return explicit
  const subtype = sanitizarTextoEntrada(
    u.oraculum_case_subtype || u.subTipo || u.subtipo || u.caseSubtype || ""
  ).toLowerCase()
  const type = sanitizarTextoEntrada(
    u.tipo_de_caso || u.tipoCaso || u.caseType || ""
  ).toLowerCase()
  const mapped = tipoCompativelComArea(subtype, areaExplicita) && tipoCompativelComArea(type, areaExplicita)
    ? CASE_TYPE_LABELS[subtype] || CASE_TYPE_LABELS[type]
    : null
  if (mapped && !(tipoGenerico(subtype || type) && rotuloCanonico && nomenclatura?.status === "specific")) return mapped
  const rotuloNomenclatura = nomenclaturaCompativel
    ? sanitizarTextoEntrada(nomenclatura?.subtypeLabel || "") || CASE_TYPE_LABELS[nomenclatura?.subtype] || CASE_TYPE_LABELS[nomenclatura?.type]
    : ""
  if (nomenclatura?.status === "specific" && rotuloNomenclatura) return rotuloNomenclatura
  return rotuloAreaCasoNegocio(u) || rotuloNomenclatura
}

function classificacaoTituloNegocio(u = {}, { HS_STAGE = null, stage = null } = {}) {
  const stageAtual = sanitizarTextoEntrada(stage || u.negocioStageId || u.dealstage)
  const stagesCliente = new Set([
    HS_STAGE?.ANALISE,
    HS_STAGE?.AGUARDANDO_DOCS,
    HS_STAGE?.DOCS,
    HS_STAGE?.AGENDAMENTO,
    HS_STAGE?.PROTOCOLO,
    HS_STAGE?.PROCESSO,
    HS_STAGE?.FINAL
  ].filter(Boolean))

  if (numeroCasoNegocio(u) || stagesCliente.has(stageAtual)) {
    return { tipo: "cliente", prefixo: "", bolinha: "🟢" }
  }

  const temperatura = sanitizarTextoEntrada(u.temperatura || u.temperaturaLead || definirTemperatura(u)).toLowerCase()
  if (temperatura === "quente") return { tipo: "lead_quente", prefixo: "LQ-", bolinha: "🟢" }
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
  const tipo = numeroCaso ? rotuloTipoCasoNegocio(u) : ""
  return `${classificacao.bolinha} ${identificador}${tipo ? ` - ${tipo}` : ""}`
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
  rotuloAreaCasoNegocio,
  rotuloTipoCasoNegocio,
  numeroCasoNegocio,
  classificacaoTituloNegocio,
  montarTituloNegocioHubSpot,
  aplicarTituloNegocioHubSpot
}
