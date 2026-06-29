const axios = require("axios")
const {
  CONTACT_WRITE_PROPERTIES,
  DEAL_WRITE_PROPERTIES,
  DEAL_ENUM_VALUES
} = require("./src/domain/hubspot-contract")

require("dotenv").config({ quiet: true })

const TIMEOUT_MS = 15000
const HUBSPOT_API = "https://api.hubapi.com"

function obterNomesPropriedades(schema) {
  return new Set((schema?.results || []).map(propriedade => propriedade.name))
}

function validarPropriedadesObrigatorias(schema, obrigatorias) {
  const existentes = obterNomesPropriedades(schema)
  return [...obrigatorias].filter(nome => !existentes.has(nome))
}

function validarEnumsEssenciais(schema) {
  const propriedades = new Map(
    (schema?.results || []).map(propriedade => [propriedade.name, propriedade])
  )
  const ausentes = []

  for (const [nome, valoresObrigatorios] of Object.entries(DEAL_ENUM_VALUES)) {
    const valoresExistentes = new Set(
      (propriedades.get(nome)?.options || []).map(opcao => opcao.value)
    )
    for (const valor of valoresObrigatorios) {
      if (!valoresExistentes.has(valor)) ausentes.push(`${nome}:${valor}`)
    }
  }

  return ausentes
}

async function executarHubSpotSmoke({
  client = axios,
  token = process.env.HUBSPOT_TOKEN
} = {}) {
  if (!token) {
    return {
      ok: false,
      motivo: "HUBSPOT_TOKEN ausente",
      checks: { authentication: false, contactSchema: false, dealSchema: false }
    }
  }

  const config = {
    headers: { Authorization: `Bearer ${token}` },
    timeout: TIMEOUT_MS
  }

  try {
    await client.get(
      `${HUBSPOT_API}/crm/v3/objects/contacts?limit=1&properties=hs_object_id`,
      config
    )
    const [contactSchemaResponse, dealSchemaResponse] = await Promise.all([
      client.get(`${HUBSPOT_API}/crm/v3/properties/contacts`, config),
      client.get(`${HUBSPOT_API}/crm/v3/properties/deals`, config)
    ])

    const missingContactProperties = validarPropriedadesObrigatorias(
      contactSchemaResponse.data,
      CONTACT_WRITE_PROPERTIES
    )
    const missingDealProperties = validarPropriedadesObrigatorias(
      dealSchemaResponse.data,
      DEAL_WRITE_PROPERTIES
    )
    const missingDealEnums = validarEnumsEssenciais(dealSchemaResponse.data)
    const ok =
      missingContactProperties.length === 0 &&
      missingDealProperties.length === 0 &&
      missingDealEnums.length === 0

    return {
      ok,
      motivo: ok ? "schema HubSpot válido" : "schema HubSpot incompatível",
      checks: { authentication: true, contactSchema: true, dealSchema: true },
      missingContactProperties,
      missingDealProperties,
      missingDealEnums
    }
  } catch (erro) {
    return {
      ok: false,
      motivo: erro?.response?.status
        ? `HubSpot respondeu HTTP ${erro.response.status}`
        : "HubSpot sem resposta",
      checks: { authentication: false, contactSchema: false, dealSchema: false }
    }
  }
}

async function main() {
  const resultado = await executarHubSpotSmoke()
  console.log(JSON.stringify(resultado, null, 2))
  if (!resultado.ok) process.exitCode = 1
}

if (require.main === module) {
  main().catch(erro => {
    console.error(JSON.stringify({ ok: false, motivo: erro.message }))
    process.exitCode = 1
  })
}

module.exports = {
  executarHubSpotSmoke,
  validarPropriedadesObrigatorias,
  validarEnumsEssenciais
}
