const assert = require("node:assert/strict")
const {
  CONTACT_WRITE_PROPERTIES,
  DEAL_WRITE_PROPERTIES,
  DEAL_ENUM_VALUES
} = require("../src/domain/hubspot-contract")
const { executarHubSpotSmoke } = require("../smoke")

const ENUM_PROPERTIES = new Set([
  "tipo_de_caso",
  "temperatura_lead",
  "hs_priority"
])

function criarSchema(propriedades, enums = {}) {
  return {
    results: [...propriedades].map(name => ({
      name,
      type: ENUM_PROPERTIES.has(name) ? "enumeration" : "string",
      options: [...(enums[name] || [])].map(value => ({ value }))
    }))
  }
}

async function executar() {
  let chamadasSemToken = 0
  const semToken = await executarHubSpotSmoke({
    token: "",
    client: {
      get: async () => {
        chamadasSemToken++
        throw new Error("não deveria chamar API")
      }
    }
  })
  assert.equal(semToken.ok, false)
  assert.equal(semToken.motivo, "HUBSPOT_TOKEN ausente")
  assert.equal(chamadasSemToken, 0)

  const urls = []
  const clientValido = {
    get: async url => {
      urls.push(url)
      if (url.includes("/properties/contacts")) {
        return { data: criarSchema(CONTACT_WRITE_PROPERTIES) }
      }
      if (url.includes("/properties/deals")) {
        return { data: criarSchema(DEAL_WRITE_PROPERTIES, DEAL_ENUM_VALUES) }
      }
      return { data: { results: [] } }
    },
    post: () => { throw new Error("POST proibido no smoke") },
    patch: () => { throw new Error("PATCH proibido no smoke") },
    delete: () => { throw new Error("DELETE proibido no smoke") }
  }
  const valido = await executarHubSpotSmoke({
    token: "token-de-teste",
    client: clientValido
  })
  assert.equal(valido.ok, true)
  assert.equal(valido.motivo, "schema HubSpot válido")
  assert.equal(urls.length, 3)
  assert.equal(urls.every(url => url.startsWith("https://api.hubapi.com/")), true)

  const contactSemPhone = new Set(CONTACT_WRITE_PROPERTIES)
  contactSemPhone.delete("phone")
  const clientInvalido = {
    get: async url => {
      if (url.includes("/properties/contacts")) {
        return { data: criarSchema(contactSemPhone) }
      }
      if (url.includes("/properties/deals")) {
        return { data: criarSchema(DEAL_WRITE_PROPERTIES, DEAL_ENUM_VALUES) }
      }
      return { data: { results: [] } }
    }
  }
  const invalido = await executarHubSpotSmoke({
    token: "token-de-teste",
    client: clientInvalido
  })
  assert.equal(invalido.ok, false)
  assert.deepEqual(invalido.missingContactProperties, ["phone"])

  const enumsSemTipo = {
    ...DEAL_ENUM_VALUES,
    tipo_de_caso: new Set(["inss_aposentadoria"])
  }
  const enumInvalido = await executarHubSpotSmoke({
    token: "token-de-teste",
    client: {
      get: async url => {
        if (url.includes("/properties/contacts")) {
          return { data: criarSchema(CONTACT_WRITE_PROPERTIES) }
        }
        if (url.includes("/properties/deals")) {
          return { data: criarSchema(DEAL_WRITE_PROPERTIES, enumsSemTipo) }
        }
        return { data: { results: [] } }
      }
    }
  })
  assert.equal(enumInvalido.ok, false)
  assert.equal(
    enumInvalido.missingDealEnums.includes("tipo_de_caso:outros_livre"),
    true
  )

  console.log("hubspot-smoke.test.js: ok")
}

executar().catch(erro => {
  console.error(erro)
  process.exitCode = 1
})
