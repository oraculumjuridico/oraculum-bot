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
  validateHubSpotProperties
}
