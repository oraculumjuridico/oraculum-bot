"use strict"

const {
  CAMPOS_ADMIN_ASSISTIDO,
  camposFaltantesAdminAssistido,
  campoAdminAssistidoPreenchido,
  normalizarCampoAdminAssistido,
  normalizarAreaJuridicaAdminAssistido
} = require("./admin-assisted-ai-schema")
const { montarNomeCompletoHubSpot } = require("./admin-name-resolver")
const { pendingPostHumanLegalQuestions } = require("./admin-assisted-intake-catalog")
const { mergeInssFacts } = require("./inss-legal-facts")
const { isBpcCase, mergeBpcFacts } = require("./bpc-legal-facts")

const CONTACT_FIELDS = Object.freeze({
  nomeCompleto: ["firstname", "lastname"], cpf: ["cpf_do_cliente"], dataNascimento: ["date_of_birth"],
  telefone: ["phone"], email: ["email", "work_email"], cidade: ["city"], uf: ["state"]
})
const DEAL_FIELDS = Object.freeze({
  areaJuridica: ["area_juridica"], tipoCaso: ["tipo_de_caso"],
  descricao: ["description", "descricao_completa"], beneficio: ["beneficio"],
  motivo: ["motivo"], situacao: ["situacao_caso"], nb: ["nb"]
})
const USER_FIELDS = Object.freeze({
  nomeCompleto: ["nome"], cpf: ["cpf"], dataNascimento: ["dataNascimento"],
  telefone: ["whatsappContato"], email: ["email"], cidade: ["cidade"], uf: ["uf"],
  areaJuridica: ["area"], tipoCaso: ["tipo", "tipoCaso"], descricao: ["descricao"],
  beneficio: ["beneficio"], motivo: ["motivo"], situacao: ["situacao"], nb: ["nb"],
  dataRequerimento: ["dataRequerimento"], resultadoPericia: ["resultadoPericia"],
  houvePericia: ["houvePericia"], dataPericia: ["dataPericia"],
  inicioIncapacidade: ["inicioIncapacidade"], incapacidadeAtual: ["incapacidadeAtual"],
  limitacoesAtuais: ["limitacoesAtuais"], atividadeHabitual: ["atividadeHabitual"],
  vinculosContribuicoes: ["vinculosContribuicoes"], protocoloRequerimento: ["protocoloRequerimento"],
  cartaDecisaoAdministrativa: ["cartaDecisaoAdministrativa"], recursoAdministrativo: ["recursoAdministrativo"],
  beneficioAnterior: ["beneficioAnterior"],
  bpcRequerenteTipo: ["bpcRequerenteTipo"], bpcDeficiencia: ["bpcDeficiencia"],
  bpcImpedimentoLongoPrazo: ["bpcImpedimentoLongoPrazo"], bpcComposicaoFamiliar: ["bpcComposicaoFamiliar"],
  bpcDespesas: ["bpcDespesas"], bpcCadUnico: ["bpcCadUnico"],
  bpcSituacaoAdministrativa: ["bpcSituacaoAdministrativa"]
})

const CAMPOS_CADASTRAIS = new Set([
  "nomeCompleto", "cpf", "dataNascimento", "telefone", "email", "cidade", "uf"
])

const SITUACOES_INSS_COM_NB = new Set([
  "beneficio concedido",
  "beneficio cessado",
  "beneficio cortado",
  "beneficio suspenso",
  "beneficio revisado"
])

function present(value) { return value !== null && value !== undefined && String(value).trim() !== "" }
function normalize(value) { return String(value ?? "").trim().replace(/\s+/g, " ").toLocaleLowerCase("pt-BR") }
function normalizeIndicator(value) {
  return normalize(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "")
}
function properties(source) { return source?.properties && typeof source.properties === "object" ? source.properties : source }
function read(source, aliases) {
  const object = properties(source) || {}
  for (const key of aliases || []) if (present(object[key])) return object[key]
  return null
}
function sourceLoaded(source) { return Boolean(source && source.loaded !== false) }

function respostaValida(campo, resposta) {
  if (!present(resposta?.valor)) return false
  // Respostas legadas sem status permanecem compatíveis como "inferido".
  const normalizado = normalizarCampoAdminAssistido(campo, resposta.valor, resposta?.status || "inferido")
  return ["confirmado", "inferido"].includes(normalizado.status) &&
    campoAdminAssistidoPreenchido(normalizado, campo)
}

function recebeBeneficioConfirmado(valor) {
  if (valor === true) return true
  return ["sim", "true", "1"].includes(normalizeIndicator(valor))
}

function indicadorNbObrigatorio(usuario = {}, data = {}) {
  if (recebeBeneficioConfirmado(usuario.recebeBeneficio) ||
      recebeBeneficioConfirmado(usuario.recebe_beneficio)) return true
  return SITUACOES_INSS_COM_NB.has(normalizeIndicator(data.situacao?.valor))
}

function camposJuridicosInssCondicionais(usuario, data, area) {
  if (area !== "INSS" || !indicadorNbObrigatorio(usuario, data)) return []
  return campoAdminAssistidoPreenchido(data.nb, "nb") ? [] : ["nb"]
}

function resolveComplementaryContext({
  usuario = {}, contact, deal, answered = {}, documents = {},
  expectedContactId, expectedDealId
} = {}) {
  const identityInvalid =
    (expectedContactId && String(contact?.id || "") !== String(expectedContactId)) ||
    (expectedDealId && String(deal?.id || "") !== String(expectedDealId)) ||
    (contact?.dealIds && expectedDealId && !contact.dealIds.map(String).includes(String(expectedDealId)))
  const divergences = []
  let data = {}
  for (const field of Object.keys(CAMPOS_ADMIN_ASSISTIDO)) {
    const resposta = respostaValida(field, answered[field]) ? answered[field].valor : null
    const candidates = [
      ["resposta", resposta],
      ["usuario", read(usuario, USER_FIELDS[field])],
      ["contato", sourceLoaded(contact)
        ? field === "nomeCompleto"
          ? montarNomeCompletoHubSpot(contact)
          : read(contact, CONTACT_FIELDS[field])
        : null],
      ["negocio", sourceLoaded(deal) ? read(deal, DEAL_FIELDS[field]) : null]
    ].filter(([, value]) => present(value))
    const distinct = new Map(candidates.map(([source, value]) => [normalize(value), { source, value }]))
    if (distinct.size > 1) divergences.push({ field, sources: candidates.map(([source]) => source) })
    const selected = candidates[0]
    data[field] = selected
      ? { valor: selected[1], status: "confirmado", origem: selected[0] }
      : { valor: "", status: "ausente", origem: "nenhuma" }
  }
  const area = normalizarAreaJuridicaAdminAssistido(data.areaJuridica?.valor || "Outros")
  if (area === "INSS") {
    const semantic = mergeInssFacts({ data, usuario, documents })
    data = semantic.data
    divergences.push(...semantic.divergences)
    if (isBpcCase({ ...data, ...usuario })) {
      const bpcSemantic = mergeBpcFacts({ data, usuario, documents })
      data = bpcSemantic.data
      divergences.push(...bpcSemantic.divergences)
    }
  }
  const missing = camposFaltantesAdminAssistido(data, area)
  const responded = new Set(Object.entries(answered)
    .filter(([field, item]) => respostaValida(field, item))
    .map(([field]) => field))
  const obrigatoriosAtuais = missing
    .filter(field => area !== "INSS" || field !== "motivo")
    .filter(field => !responded.has(field))
  const juridicosCondicionais = camposJuridicosInssCondicionais(usuario, data, area)
    .filter(field => !responded.has(field))
  const camposCadastraisPendentes = obrigatoriosAtuais.filter(field => CAMPOS_CADASTRAIS.has(field))
  const perguntasJuridicasDinamicas = area === "INSS"
    ? pendingPostHumanLegalQuestions({ area, data }).map(item => item.id).filter(field => !responded.has(field))
    : []
  const camposJuridicosPendentes = [...new Set([
    ...obrigatoriosAtuais.filter(field => !CAMPOS_CADASTRAIS.has(field)),
    ...juridicosCondicionais,
    ...perguntasJuridicasDinamicas
  ])]
  const camposPendentes = [...camposCadastraisPendentes, ...camposJuridicosPendentes]
  const revisaoHumana = identityInvalid || divergences.length > 0
  return {
    data, camposCadastraisPendentes, camposJuridicosPendentes, camposPendentes,
    documents, contactLoaded: sourceLoaded(contact), dealLoaded: sourceLoaded(deal),
    divergences, divergencias: divergences, revisaoHumana, humanReviewRequired: revisaoHumana,
    reviewReason: identityInvalid ? "contexto_contato_negocio_invalido" : divergences.length ? "dados_divergentes" : null
  }
}

function resolveComplementaryFields(input) {
  return resolveComplementaryContext(input).camposPendentes
}

module.exports = {
  CONTACT_FIELDS, DEAL_FIELDS, respostaValida, recebeBeneficioConfirmado,
  indicadorNbObrigatorio, resolveComplementaryContext, resolveComplementaryFields
}
