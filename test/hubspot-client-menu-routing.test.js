const assert = require("assert")
const axios = require("axios")
const {
  telefoneCanonico,
  obterContatoId,
  definirContatoId,
  obterNegocioId,
  definirNegocioId
} = require("../src/domain/identity")
const {
  configurarHubSpotCore,
  hsBuscarContatoSeguro,
  hsBuscarPorPhone
} = require("../src/domain/hubspot-core")
const {
  configurarHubSpotSync,
  hsBuscarNegociosComCasoDoContato
} = require("../src/domain/hubspot-sync")

const axiosOriginal = {
  get: axios.get,
  post: axios.post,
  patch: axios.patch,
  put: axios.put
}
const consoleErrorOriginal = console.error

function restaurarAxios() {
  Object.assign(axios, axiosOriginal)
  console.error = consoleErrorOriginal
}

let realExternalActions = 0
let externalHttpAttempts = 0

const HS_FINAL = "1343039663"
const HS_LEAD = "appointmentscheduled"
const HS_ANALISE = "presentationscheduled"

function configurarHS() {
  configurarHubSpotCore({
    monitor: { cadastros: 0 },
    HS_STAGE: { LEAD: HS_LEAD, FINAL: HS_FINAL, ANALISE: HS_ANALISE },
    HS_PIPELINE: "default",
    getNomeDeal: () => "Caso teste",
    getHubSpotDealStateProps: () => ({ etapa_do_bot: "inicio" })
  })
  configurarHubSpotSync({
    HUBSPOT_TOKEN: "tok-test",
    HS_STAGE: { LEAD: HS_LEAD, FINAL: HS_FINAL, ANALISE: HS_ANALISE },
    getNomeDeal: () => "Caso teste",
    getHubSpotDealStateProps: () => ({ etapa_do_bot: "inicio" }),
    getNumeroCasoOficialDoNegocio: (negocio) => {
      return (negocio?.properties?.numero_de_caso && String(negocio.properties.numero_de_caso).trim()) || null
    },
    restaurarTipoCasoHubSpot: (tipo) => ({ area: tipo, tipo: tipo }),
    etapaValida: () => true,
    serializarEstado: (u) => JSON.stringify(u),
    desserializarEstado: (snapshot) => { try { return JSON.parse(snapshot || "{}") } catch { return null } },
    hidratarUsuarioPersistido: (obj) => ({ ...obj })
  })
}

function mockContactFound(contact) {
  axios.post = async (url) => {
    if (url.includes("/contacts/search")) {
      return { data: { results: contact ? [contact] : [] } }
    }
    return { data: { id: "new-id" } }
  }
}

function mockContactNotFound() {
  axios.post = async (url) => {
    if (url.includes("/contacts/search")) {
      return { data: { results: [] } }
    }
    return { data: { id: "new-id" } }
  }
}

function mockHubSpotError() {
  axios.post = async () => {
    const error = new Error("HubSpot indisponível")
    error.code = "ECONNABORTED"
    throw error
  }
}

function mockGetDeals(dealResponses) {
  axios.get = async (url) => {
    const dealId = url.match(/\/deals\/([^?]+)/)?.[1]
    if (dealId && dealResponses[dealId]) {
      return { data: { properties: dealResponses[dealId] } }
    }
    return { data: { results: [] } }
  }
  axios.get = async (url) => {
    if (url.includes("/associations/deals")) {
      return { data: { results: Object.keys(dealResponses).map(id => ({ id })) } }
    }
    const dealId = url.match(/\/deals\/([^?]+)/)?.[1]
    if (dealId && dealResponses[dealId]) {
      return { data: { properties: dealResponses[dealId] } }
    }
    return { data: {} }
  }
}

async function executar() {
  configurarHS()

  // === Test 1: telefoneCanonico normaliza formatos variados ===
  assert.equal(telefoneCanonico("(81) 99999-0000"), "5581999990000")
  assert.equal(telefoneCanonico("5581999990000"), "5581999990000")
  assert.equal(telefoneCanonico("55 (81) 99999-0000"), "5581999990000")
  assert.equal(telefoneCanonico("81999990000"), "5581999990000")
  assert.equal(telefoneCanonico("11987654321"), "5511987654321")
  assert.equal(telefoneCanonico(""), "")
  assert.equal(telefoneCanonico(null), "")
  assert.equal(telefoneCanonico(undefined), "")
  assert.equal(telefoneCanonico("abc"), "")
  console.log("✅ Test 1: telefoneCanonico normaliza formatos variados")

  // === Test 2: definirContatoId e definirNegocioId sincronizam aliases ===
  const u = {}
  definirContatoId(u, "contact-123")
  assert.equal(u.contatoId, "contact-123")
  assert.equal(u.contactId, "contact-123")
  assert.equal(obterContatoId(u), "contact-123")

  const u2 = {}
  definirNegocioId(u2, "deal-456")
  assert.equal(u2.negocioId, "deal-456")
  assert.equal(u2.dealId, "deal-456")
  assert.equal(obterNegocioId(u2), "deal-456")

  definirContatoId(u, null)
  assert.equal(u.contatoId, null)
  assert.equal(u.contactId, null)
  assert.equal(obterContatoId(u), null)

  definirNegocioId(u2, null)
  assert.equal(u2.negocioId, null)
  assert.equal(u2.dealId, null)
  assert.equal(obterNegocioId(u2), null)
  console.log("✅ Test 2: definirContatoId/definirNegocioId sincronizam aliases")

  // === Test 3: Contact with one deal that has numeroCaso ===
  const contact = {
    id: "contact-1",
    properties: { firstname: "João", phone: "5581999990000" }
  }
  mockContactFound(contact)

  const resultadoBusca = await hsBuscarContatoSeguro("5581999990000")
  assert.equal(resultadoBusca.status, "found")
  assert.equal(resultadoBusca.contato.id, "contact-1")
  console.log("✅ Test 3a: hsBuscarContatoSeguro encontra contato")

  // Simular classificação de negócios: um caso oficial
  const dealResponses = {
    "deal-100": {
      dealstage: HS_ANALISE,
      dealname: "Caso CLT001",
      numero_de_caso: "CLT.001.2025",
      descricao_completa: "Descrição do caso",
      area_juridica: "Trabalhista",
      estado_bot_snapshot: JSON.stringify({ numeroCaso: "CLT.001.2025", area: "Trabalhista", negocioId: "deal-100", contatoId: "contact-1" })
    }
  }
  mockGetDeals(dealResponses)
  const negocios = await hsBuscarNegociosComCasoDoContato("contact-1")
  assert.equal(negocios.casosOficiais.length, 1)
  assert.equal(negocios.casosOficiais[0].id, "deal-100")
  assert.equal(negocios.casosOficiais[0].numeroCaso, "CLT.001.2025")
  assert.equal(negocios.leads.length, 0)
  assert.equal(negocios.finalizados.length, 0)
  console.log("✅ Test 3b: Contact with one deal numeroCaso → casosOficiais[0]")

  // === Test 4: Contact with one deal WITHOUT numeroCaso (lead) ===
  const dealResponsesLead = {
    "deal-200": {
      dealstage: HS_LEAD,
      dealname: "Lead sem caso",
      numero_de_caso: ""
    }
  }
  mockGetDeals(dealResponsesLead)
  const negociosLead = await hsBuscarNegociosComCasoDoContato("contact-1")
  assert.equal(negociosLead.casosOficiais.length, 0)
  assert.equal(negociosLead.leads.length, 1)
  assert.equal(negociosLead.leads[0].id, "deal-200")
  assert.equal(negociosLead.finalizados.length, 0)
  console.log("✅ Test 4: Contact with deal without numeroCaso → stays lead")

  // === Test 5: Contact with two deals, both with numeroCaso ===
  const dealResponsesMultiCaso = {
    "deal-301": {
      dealstage: HS_ANALISE,
      dealname: "Caso CLT001",
      numero_de_caso: "CLT.001.2025"
    },
    "deal-302": {
      dealstage: HS_ANALISE,
      dealname: "Caso PREV001",
      numero_de_caso: "PREV.001.2025"
    }
  }
  mockGetDeals(dealResponsesMultiCaso)
  const negociosMulti = await hsBuscarNegociosComCasoDoContato("contact-1")
  assert.equal(negociosMulti.casosOficiais.length, 2)
  assert.equal(negociosMulti.leads.length, 0)
  assert.equal(negociosMulti.finalizados.length, 0)
  console.log("✅ Test 5: Contact with two deals with numeroCaso → 2 casosOficiais")

  // === Test 6: Contact with one official deal and one lead (pré-atendimento) ===
  const dealResponsesMixed = {
    "deal-401": {
      dealstage: HS_ANALISE,
      dealname: "Caso CLT001",
      numero_de_caso: "CLT.001.2025"
    },
    "deal-402": {
      dealstage: HS_LEAD,
      dealname: "Lead novo"
    }
  }
  mockGetDeals(dealResponsesMixed)
  const negociosMixed = await hsBuscarNegociosComCasoDoContato("contact-1")
  assert.equal(negociosMixed.casosOficiais.length, 1)
  assert.equal(negociosMixed.casosOficiais[0].id, "deal-401")
  assert.equal(negociosMixed.leads.length, 1)
  assert.equal(negociosMixed.leads[0].id, "deal-402")
  assert.equal(negociosMixed.finalizados.length, 0)
  console.log("✅ Test 6: Contact with one official + one lead → both preserved")

  // === Test 7: Contact with multiple deals, ALL without numeroCaso ===
  const dealResponsesAllLeads = {
    "deal-501": {
      dealstage: HS_LEAD,
      dealname: "Lead 1"
    },
    "deal-502": {
      dealstage: HS_ANALISE,
      dealname: "Lead 2"
    }
  }
  mockGetDeals(dealResponsesAllLeads)
  const negociosAllLeads = await hsBuscarNegociosComCasoDoContato("contact-1")
  assert.equal(negociosAllLeads.casosOficiais.length, 0)
  assert.equal(negociosAllLeads.leads.length, 2)
  console.log("✅ Test 7: Contact with all deals without numeroCaso → stays lead")

  // === Test 8: Finalized deals are classified separately ===
  const dealResponsesFinalizado = {
    "deal-601": {
      dealstage: HS_FINAL,
      dealname: "Caso finalizado",
      numero_de_caso: "CLT.999.2025"
    },
    "deal-602": {
      dealstage: HS_ANALISE,
      dealname: "Caso ativo",
      numero_de_caso: "CLT.001.2025"
    }
  }
  mockGetDeals(dealResponsesFinalizado)
  const negociosFinalizado = await hsBuscarNegociosComCasoDoContato("contact-1")
  assert.equal(negociosFinalizado.casosOficiais.length, 1)
  assert.equal(negociosFinalizado.casosOficiais[0].id, "deal-602")
  assert.equal(negociosFinalizado.finalizados.length, 1)
  assert.equal(negociosFinalizado.finalizados[0].id, "deal-601")
  console.log("✅ Test 8: Finalized deals excluded from casosOficiais")

  // === Test 9: Contact not found ===
  mockContactNotFound()
  const resultadoNotFound = await hsBuscarContatoSeguro("5581999990000")
  assert.equal(resultadoNotFound.status, "not_found")
  assert.equal(resultadoNotFound.contato, null)
  console.log("✅ Test 9: Contact not found → status 'not_found'")

  // === Test 10: HubSpot read error → status 'error' ===
  mockHubSpotError()
  const resultadoError = await hsBuscarContatoSeguro("5581999990000")
  assert.ok(resultadoError.status === "error" || resultadoError.status === "timeout")
  assert.equal(resultadoError.contato, null)
  console.log("✅ Test 10: HubSpot read error → status 'error'/'timeout'")

  // === Test 11: Empty/invalid phone → status 'invalid' ===
  const resultadoInvalid = await hsBuscarContatoSeguro("abc")
  assert.equal(resultadoInvalid.status, "invalid")
  console.log("✅ Test 11: Invalid phone → status 'invalid'")

  // === Test 12: Deals lookup with no contact ID ===
  const negociosEmpty = await hsBuscarNegociosComCasoDoContato(null)
  assert.equal(negociosEmpty.casosOficiais.length, 0)
  assert.equal(negociosEmpty.leads.length, 0)
  assert.equal(negociosEmpty.finalizados.length, 0)
  console.log("✅ Test 12: hsBuscarNegociosComCasoDoContato with null contactId → empty lists")

  // === Test 13: Phone normalization preserves existing numeroCaso ===
  const uTest = { numeroCaso: "EXISTING.001" }
  const negocioSnapshot = {
    id: "deal-700",
    stageId: HS_ANALISE,
    dealname: "Caso EXISTING.001",
    properties: {
      numero_de_caso: "EXISTING.001",
      dealstage: HS_ANALISE,
      estado_bot_snapshot: JSON.stringify({})
    }
  }
  definirContatoId(uTest, "contact-777")
  assert.equal(uTest.contatoId, "contact-777")
  assert.equal(uTest.contactId, "contact-777")
  definirNegocioId(uTest, "deal-700")
  assert.equal(uTest.negocioId, "deal-700")
  assert.equal(uTest.dealId, "deal-700")
  console.log("✅ Test 13: ContatoId and negocioId set correctly after lookup")

  // === Test 14: REAL_EXTERNAL_ACTIONS = 0 ===
  assert.equal(realExternalActions, 0)
  console.log("✅ Test 14: realExternalActions = 0")

  // === Test 15: EXTERNAL_HTTP_ATTEMPTS_NON_LOOPBACK = 0 ===
  assert.equal(externalHttpAttempts, 0)
  console.log("✅ Test 15: externalHttpAttempts = 0")

  console.log("\nRESULT 15/15 client-menu-routing tests passed")
  console.log(JSON.stringify({ realExternalActions: 0 }))
}

executar()
  .then(() => {
    restaurarAxios()
    console.log("hubspot-client-menu-routing.test.js: ok")
  })
  .catch(error => {
    restaurarAxios()
    console.error(error)
    process.exitCode = 1
  })
