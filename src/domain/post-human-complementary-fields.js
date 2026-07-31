"use strict"

const {
  CAMPOS_ADMIN_ASSISTIDO,
  camposFaltantesAdminAssistido,
  normalizarAreaJuridicaAdminAssistido
} = require("./admin-assisted-ai-schema")

const CONTACT_FIELDS = Object.freeze({
  nomeCompleto: ["firstname"], cpf: ["cpf_do_cliente"], dataNascimento: ["date_of_birth"],
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
  beneficio: ["beneficio"], motivo: ["motivo"], situacao: ["situacao"], nb: ["nb"]
})

function present(value) { return value !== null && value !== undefined && String(value).trim() !== "" }
function normalize(value) { return String(value ?? "").trim().replace(/\s+/g, " ").toLocaleLowerCase("pt-BR") }
function properties(source) { return source?.properties && typeof source.properties === "object" ? source.properties : source }
function read(source, aliases) {
  const object = properties(source) || {}
  for (const key of aliases || []) if (present(object[key])) return object[key]
  return null
}
function sourceLoaded(source) { return Boolean(source && source.loaded !== false) }

function resolveComplementaryContext({
  usuario = {}, contact, deal, answered = {}, previousPending = [], documents = {},
  expectedContactId, expectedDealId
} = {}) {
  const identityInvalid =
    (expectedContactId && String(contact?.id || "") !== String(expectedContactId)) ||
    (expectedDealId && String(deal?.id || "") !== String(expectedDealId)) ||
    (contact?.dealIds && expectedDealId && !contact.dealIds.map(String).includes(String(expectedDealId)))
  const divergences = []
  const data = {}
  for (const field of Object.keys(CAMPOS_ADMIN_ASSISTIDO)) {
    const candidates = [
      ["resposta", answered[field]?.valor],
      ["usuario", read(usuario, USER_FIELDS[field])],
      ["contato", sourceLoaded(contact) ? read(contact, CONTACT_FIELDS[field]) : null],
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
  const missing = camposFaltantesAdminAssistido(data, area)
  const alreadyAnswered = new Set(Object.entries(answered).filter(([, item]) => present(item?.valor)).map(([field]) => field))
  const camposPendentes = [...new Set([...previousPending, ...missing])]
    .filter(field => !alreadyAnswered.has(field))
  return {
    data, camposPendentes, documents, contactLoaded: sourceLoaded(contact), dealLoaded: sourceLoaded(deal),
    divergences, humanReviewRequired: identityInvalid || divergences.length > 0,
    reviewReason: identityInvalid ? "contexto_contato_negocio_invalido" : divergences.length ? "dados_divergentes" : null
  }
}

function resolveComplementaryFields(input) {
  return resolveComplementaryContext(input).camposPendentes
}

module.exports = {
  CONTACT_FIELDS, DEAL_FIELDS, resolveComplementaryContext, resolveComplementaryFields
}
