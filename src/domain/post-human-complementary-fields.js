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
const { ADDRESS_FIELDS, extractSyntacticFacts, trustedAddressDocumentFacts, same: sameAddressValue } = require("./address-facts")
const { resolveLegalCaseNomenclature } = require("./legal-case-nomenclature")

const CONTACT_FIELDS = Object.freeze({
  nomeCompleto: ["firstname", "lastname"], cpf: ["cpf_do_cliente"], dataNascimento: ["date_of_birth"],
  telefone: ["phone"], email: ["email", "work_email"], cidade: ["city"], uf: ["state"],
  endereco: ["address"], cep: ["zip"]
})
const DEAL_FIELDS = Object.freeze({
  areaJuridica: ["area_juridica"], tipoCaso: ["tipo_de_caso"],
  descricao: ["description", "descricao_completa"], beneficio: ["beneficio"],
  motivo: ["motivo"], situacao: ["situacao_caso"], nb: ["nb"]
})
const USER_FIELDS = Object.freeze({
  nomeCompleto: ["nome"], cpf: ["cpf"], dataNascimento: ["dataNascimento"],
  telefone: ["whatsappContato"], email: ["email"], cidade: ["cidade"], uf: ["uf"],
  endereco: ["endereco", "address"], numeroEndereco: ["numeroEndereco"],
  complementoEndereco: ["complementoEndereco"], bairro: ["bairro"], cep: ["cep", "zip"],
  referenciaEndereco: ["referenciaEndereco"],
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
  bpcSituacaoAdministrativa: ["bpcSituacaoAdministrativa"],
  empresa: ["empresa"], parteContraria: ["parteContraria"], vinculoFamiliar: ["vinculoFamiliar"],
  fornecedor: ["fornecedor"], produtoServico: ["produtoServico"], problema: ["problema"],
  posicaoPenal: ["posicaoPenal"], contratoOuFato: ["contratoOuFato"], imovel: ["imovel"]
})

const CAMPOS_CADASTRAIS = new Set([
  "nomeCompleto", "cpf", "dataNascimento", "telefone", "email", "cidade", "uf",
  ...ADDRESS_FIELDS
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
  const documentAddressFacts = trustedAddressDocumentFacts(documents)
  const contactAddressFacts = sourceLoaded(contact)
    ? extractSyntacticFacts(read(contact, ["address"]) || "", { origem: "contato" }).facts
    : {}
  let data = {}
  for (const field of Object.keys(CAMPOS_ADMIN_ASSISTIDO)) {
    const resposta = respostaValida(field, answered[field]) ? answered[field].valor : null
    const candidates = [
      ["resposta", resposta],
      ["usuario", read(usuario, USER_FIELDS[field])],
      ["contato", sourceLoaded(contact)
        ? field === "nomeCompleto"
          ? montarNomeCompletoHubSpot(contact)
          : contactAddressFacts[field]?.valor || read(contact, CONTACT_FIELDS[field])
        : null],
      ["negocio", sourceLoaded(deal) ? read(deal, DEAL_FIELDS[field]) : null],
      ["documento_confirmado", documentAddressFacts[field]?.valor]
    ].filter(([, value]) => present(value))
    const distinct = candidates.filter(([, value], index, all) =>
      all.findIndex(([, prior]) => ADDRESS_FIELDS.has(field) ? sameAddressValue(prior, value) : normalize(prior) === normalize(value)) === index)
    const explicitCorrection = ADDRESS_FIELDS.has(field) && answered[field]?.correcao === true
    if (distinct.length > 1 && !explicitCorrection) divergences.push({ field, sources: candidates.map(([source]) => source) })
    const selected = candidates[0]
    data[field] = selected
      ? selected[0] === "resposta"
        ? { ...answered[field] }
        : { valor: selected[1], status: "confirmado", origem: selected[0] }
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
  const perguntasJuridicasDinamicas = pendingPostHumanLegalQuestions({ area, data })
    .map(item => item.id)
    .filter(field => !responded.has(field))
  const camposJuridicosPendentes = [...new Set([
    ...obrigatoriosAtuais.filter(field => !CAMPOS_CADASTRAIS.has(field)),
    ...juridicosCondicionais,
    ...perguntasJuridicasDinamicas
  ])]
  const camposPendentes = [...camposCadastraisPendentes, ...camposJuridicosPendentes]
  const nomenclaturaJuridica = resolveLegalCaseNomenclature({
    current: usuario.nomenclaturaJuridica,
    narrative: [data.descricao?.valor, data.objetivo?.valor, data.situacao?.valor],
    answered,
    usuario,
    deal,
    documents
  })
  if (nomenclaturaJuridica.divergences.length) {
    divergences.push(...nomenclaturaJuridica.divergences.map(item => ({
      ...item,
      source: "nomenclatura_juridica"
    })))
  }
  const requerRevisao = identityInvalid || divergences.length > 0
  return {
    data, camposCadastraisPendentes, camposJuridicosPendentes, camposPendentes,
    documents, contactLoaded: sourceLoaded(contact), dealLoaded: sourceLoaded(deal),
    nomenclaturaJuridica,
    divergences, divergencias: divergences, revisaoHumana: requerRevisao, humanReviewRequired: requerRevisao,
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
