const CONTACT_WRITE_PROPERTIES = new Set([
  "firstname",
  "phone",
  "city",
  "state"
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
  "numero_de_caso"
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
  hs_priority: new Set(["low", "medium", "high"]),
  urgencia: new Set(["Alta", "Moderada", "Baixa"])
}

function validateHubSpotProperties(objectType, properties = {}, onWarning = () => {}) {
  const allowed = objectType === "contacts"
    ? CONTACT_WRITE_PROPERTIES
    : objectType === "deals"
      ? DEAL_WRITE_PROPERTIES
      : new Set()
  const enumValues = objectType === "deals" ? DEAL_ENUM_VALUES : {}
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
  DEAL_WRITE_PROPERTIES,
  DEAL_ENUM_VALUES,
  validateHubSpotProperties
}
