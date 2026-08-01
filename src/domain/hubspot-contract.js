const PLACEHOLDER_VALUES = new Set([
  "",
  "nome do cliente",
  "nome da cliente",
  "cpf do cliente",
  "cpf da cliente",
  "telefone do cliente",
  "telefone da cliente",
  "email do cliente",
  "email da cliente",
  "cidade do cliente",
  "cidade da cliente",
  "nao informado",
  "não informado",
  "nao sei",
  "não sei",
  "sem informacao",
  "sem informação",
  "informar depois",
  "sem esse dado",
  "pular",
  "cliente",
  "você",
  "voce",
  "placeholder"
])

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
}

function isPlaceholderValue(value) {
  if (value === null || value === undefined) return false
  if (typeof value !== "string") return false
  const normalized = normalizeText(value)
  return !normalized ||
    PLACEHOLDER_VALUES.has(normalized) ||
    normalized.includes("informar depois") ||
    normalized.includes("nao sei") ||
    normalized.includes("sem informacao") ||
    /^(nome|cpf|telefone|email|cidade|uf|descricao|beneficio|situacao|motivo|area|tipo|data de nascimento)\s+(do|da)\s+(cliente|caso)$/.test(normalized)
}

function isValidCpf(value) {
  if (value === null || value === undefined) return false
  if (typeof value !== "string") return false
  const raw = value.trim()
  if (!raw || isPlaceholderValue(raw)) return false
  const digits = raw.replace(/\D/g, "")
  if (digits.length !== 11 || /^(\d)\1{10}$/.test(digits)) return false
  let sum = 0
  for (let i = 0; i < 9; i += 1) sum += Number(digits[i]) * (10 - i)
  let remainder = (sum * 10) % 11
  if (remainder === 10) remainder = 0
  if (remainder !== Number(digits[9])) return false
  sum = 0
  for (let i = 0; i < 10; i += 1) sum += Number(digits[i]) * (11 - i)
  remainder = (sum * 10) % 11
  if (remainder === 10) remainder = 0
  return remainder === Number(digits[10])
}

function normalizeCpfHubSpot(value) {
  if (!isValidCpf(value)) return null
  return String(value).replace(/\D/g, "")
}

function normalizeEmailHubSpot(value) {
  if (value === null || value === undefined) return null
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  if (!trimmed || isPlaceholderValue(trimmed)) return null
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed.toLowerCase()) ? trimmed : null
}

const { normalizarTelefoneHubSpot } = require("./phone-name")

const CONTACT_WRITE_PROPERTIES = new Set([
  "firstname",
  "lastname",
  "email",
  "phone",
  "mobilephone",
  "address",
  "city",
  "state",
  "zip",
  "area_juridica",
  "beneficio",
  "beneficio_de_interesse",
  "cpf_do_cliente",
  "date_of_birth",
  "origem_lead",
  "oraculum_referrer",
  "oraculum_identity_provenance",
  "hubspot_owner_id",
  "pasta_drive",
  "situacao_caso",
  "tipo_de_caso",
  "work_email"
])

// Propriedades confirmadas pelo organizador dos casos reais mais recente.
// O runtime apenas as utiliza; nunca tenta criá-las.
const MANAGED_CONTACT_PROPERTIES = new Set([
  "lastname",
  "mobilephone",
  "address",
  "zip",
  "oraculum_referrer",
  "oraculum_identity_provenance",
  "hubspot_owner_id"
])

const MANAGED_DEAL_PROPERTIES = new Set([
  "oraculum_case_subtype",
  "oraculum_case_import_id",
  "oraculum_document_status",
  "oraculum_documents_received",
  "oraculum_documents_pending",
  "oraculum_review_required",
  "oraculum_analysis_status"
  ,"oraculum_case_facts"
  ,"oraculum_case_history"
  ,"oraculum_case_periods"
  ,"oraculum_data_provenance"
  ,"oraculum_document_evidence"
  ,"oraculum_preliminary_analysis"
  ,"oraculum_possible_strategies"
  ,"oraculum_next_action"
  ,"oraculum_review_reasons"
  ,"oraculum_third_parties"
])

const DEAL_WRITE_PROPERTIES = new Set([
  "dealname",
  "pipeline",
  "dealstage",
  "hubspot_owner_id",
  "description",
  "area_juridica",
  "resumo_cliente",
  "descricao_completa",
  "estado_bot_snapshot",
  "etapa_do_bot",
  "tipo_de_caso",
  "temperatura_lead",
  "hs_priority",
  "urgencia",
  "cidade",
  "pasta_drive",
  "origem_atendimento",
  "numero_de_caso",
  "oraculum_case_subtype",
  "oraculum_case_import_id",
  "oraculum_document_status",
  "oraculum_documents_received",
  "oraculum_documents_pending",
  "oraculum_review_required",
  "oraculum_analysis_status"
  ,"oraculum_case_facts"
  ,"oraculum_case_history"
  ,"oraculum_case_periods"
  ,"oraculum_data_provenance"
  ,"oraculum_document_evidence"
  ,"oraculum_preliminary_analysis"
  ,"oraculum_possible_strategies"
  ,"oraculum_next_action"
  ,"oraculum_review_reasons"
  ,"oraculum_third_parties"
])

const DEAL_ENUM_VALUES = {
  tipo_de_caso: new Set([
    "inss_aposentadoria",
    "inss_bpc",
    "inss_incapacidade",
    "inss_dependentes",
    "inss_outros",
    "trab_demissao",
    "trab_direitos",
    "trab_acidente",
    "trab_assedio",
    "trab_outros",
    "outros_revisao",
    "outros_livre"
  ]),
  temperatura_lead: new Set(["Frio", "Morno", "Quente"]),
  hs_priority: new Set(["low", "medium", "high"])
}

const CONTACT_ENUM_VALUES = {
  area_juridica: new Set(["Previdenciário (INSS)", "Trabalhista", "Outros"]),
  origem_lead: new Set(["Bot Whatsapp"]),
  tipo_de_caso: new Set([
    "Aposentadoria",
    "Auxílio-doença",
    "BPC / LOAS",
    "Pensão por morte",
    "Salário-maternidade",
    "Revisão de benefício",
    "Direito trabalhista",
    "Outro"
  ])
}

function validateHubSpotProperties(objectType, properties = {}, onWarning = () => {}) {
  const allowed = objectType === "contacts"
    ? CONTACT_WRITE_PROPERTIES
    : objectType === "deals"
      ? DEAL_WRITE_PROPERTIES
      : new Set()
  const enumValues = objectType === "contacts"
    ? CONTACT_ENUM_VALUES
    : objectType === "deals"
      ? DEAL_ENUM_VALUES
      : {}
  const validProperties = {}
  const unknownProperties = []
  const invalidEnums = []

  for (const [property, value] of Object.entries(properties)) {
    if (!allowed.has(property)) {
      unknownProperties.push(property)
      continue
    }
    if (value === null || value === undefined) continue
    if (typeof value === "string" && !value.trim()) continue
    if (isPlaceholderValue(value)) continue
    if (property === "cpf_do_cliente") {
      const cpfNormalizado = normalizeCpfHubSpot(value)
      if (cpfNormalizado === null) continue
      validProperties[property] = cpfNormalizado
      continue
    }
    if (property === "email" || property === "work_email") {
      const emailNormalizado = normalizeEmailHubSpot(value)
      if (emailNormalizado === null) continue
      validProperties[property] = emailNormalizado
      continue
    }
    if (property === "phone" || property === "mobilephone") {
      const phoneNormalizado = normalizarTelefoneHubSpot(value)
      if (!phoneNormalizado) continue
      validProperties[property] = phoneNormalizado
      continue
    }
    if (enumValues[property] && !enumValues[property].has(value)) {
      invalidEnums.push(property)
      continue
    }
    validProperties[property] = value
  }

  if (unknownProperties.length || invalidEnums.length) {
    onWarning({
      event: "hubspot_payload_validation",
      objectType,
      unknownProperties,
      invalidEnums
    })
  }

  return validProperties
}

module.exports = {
  CONTACT_WRITE_PROPERTIES,
  MANAGED_CONTACT_PROPERTIES,
  DEAL_WRITE_PROPERTIES,
  MANAGED_DEAL_PROPERTIES,
  CONTACT_ENUM_VALUES,
  DEAL_ENUM_VALUES,
  validateHubSpotProperties,
  isPlaceholderValue,
  isValidCpf,
  normalizeCpfHubSpot
}
