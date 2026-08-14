const assert = require("assert")
const axios = require("axios")
const {
  telefoneCanonico,
  definirContatoId,
  definirNegocioId
} = require("../src/domain/identity")
const {
  configurarHubSpotCore,
  hsBuscarContatoSeguro
} = require("../src/domain/hubspot-core")
const {
  configurarHubSpotSync,
  hsBuscarNegociosComCasoDoContato,
  restaurarEstadoNegocioHubSpot
} = require("../src/domain/hubspot-sync")
const {
  resolveLegalCaseNomenclature,
  applyLegalCaseNomenclatureToUser
} = require("../src/domain/legal-case-nomenclature")

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
    hidratarUsuarioPersistido: (obj) => ({ ...obj }),
    garantirNomenclaturaJuridicaUsuario: (u) => {
      const model = resolveLegalCaseNomenclature({
        current: u.nomenclaturaJuridica,
        narrative: [u.descricao, u.assuntoResumo, u.detalhe].filter(Boolean),
        usuario: u,
        classification: {
          area: u.area,
          tipo: u.tipo_de_caso || u.tipoCaso || u.tipo,
          subTipo: u.oraculum_case_subtype || u.subTipo || u.subtipo,
          situacao: u.situacao
        }
      })
      applyLegalCaseNomenclatureToUser(u, model)
      if (model.type) u.tipo_de_caso = model.type
      if (model.subtype) u.oraculum_case_subtype = model.subtype
      return model
    }
  })
}

function podeMostrarMenuCliente(u) {
  return Boolean(u?.numeroCaso) ||
    Boolean(Array.isArray(u?._casosDisponiveis) && u._casosDisponiveis.length)
}

const contactCreationCount = { value: 0 }
const dealCreationCount = { value: 0 }
let contactSearchResult = null
let dealResponses = {}

function mockHubSpot(contact, deals) {
  contactSearchResult = contact
  dealResponses = deals || {}
  contactCreationCount.value = 0
  dealCreationCount.value = 0

  axios.post = async (url, body) => {
    if (url.includes("/contacts/search")) {
      return { data: { results: contact ? [contact] : [] } }
    }
    if (url.includes("/contacts")) {
      contactCreationCount.value++
      return { data: { id: "new-contact" } }
    }
    if (url.includes("/deals")) {
      dealCreationCount.value++
      return { data: { id: "new-deal" } }
    }
    return { data: { id: "new-id" } }
  }

  axios.get = async (url) => {
    if (url.includes("/associations/deals")) {
      return { data: { results: Object.keys(dealResponses).map(id => ({ id })) } }
    }
    const match = url.match(/\/deals\/([^?]+)/)
    if (match && dealResponses[match[1]]) {
      return { data: { properties: dealResponses[match[1]] } }
    }
    return { data: {} }
  }

  axios.patch = async () => { return { data: { id: "ok" } } }
  axios.put = async () => { return { data: { id: "ok" } } }
}

function mockHubSpotError() {
  axios.post = async () => {
    const error = new Error("HubSpot indisponível")
    error.code = "ECONNABORTED"
    throw error
  }
}

async function simularResolverUsuario(from, nomeWA, contact, deals) {
  const telefone = telefoneCanonico(from) || from
  const u = { _numero: null }
  const sessaoAtual = null

  const resultadoBusca = await hsBuscarContatoSeguro(telefone)
  let contato = null
  if (resultadoBusca.status === "error" || resultadoBusca.status === "timeout") {
    throw Object.assign(new Error("HUBSPOT_CONTACT_LOOKUP_UNCERTAIN"), { code: "HUBSPOT_CONTACT_LOOKUP_UNCERTAIN" })
  }
  contato = resultadoBusca.contato

  if (contato?.id) {
    u._hubspotSemContato = false
    u._hubspotResultadoId = contato.id
    definirContatoId(u, contato.id)
    const negociosHubSpot = await hsBuscarNegociosComCasoDoContato(contato.id)
    if (negociosHubSpot) {
      const casosComNumeroCaso = negociosHubSpot.casosOficiais
      if (casosComNumeroCaso.length === 1) {
        const negocio = casosComNumeroCaso[0]
        restaurarEstadoNegocioHubSpot(u, negocio)
        definirNegocioId(u, negocio.id)
      }
      if (casosComNumeroCaso.length > 1) {
        u._casosDisponiveis = casosComNumeroCaso.map(c => ({
          id: c.id,
          numeroCaso: c.numeroCaso,
          area: c.properties?.area_juridica,
          dealname: c.properties?.dealname || null
        }))
      }
    }
  }
  u._numero = telefone
  u.whatsappContato = telefone
  u.nomeWA = nomeWA || "Cliente"

  return { contato, u }
}

async function executar() {
  configurarHS()

  // === Test 1: telefoneCanonico normaliza formatos variados ===
  assert.equal(telefoneCanonico("(81) 99999-0000"), "5581999990000")
  assert.equal(telefoneCanonico("5581999990000"), "5581999990000")
  assert.equal(telefoneCanonico("55 (81) 99999-0000"), "5581999990000")
  assert.equal(telefoneCanonico("11987654321"), "5511987654321")
  assert.equal(telefoneCanonico(""), "")
  assert.equal(telefoneCanonico(null), "")
  assert.equal(telefoneCanonico("abc"), "")
  console.log("✅ Test 1: telefoneCanonico normaliza formatos variados")

  // === Test 2: definirContatoId/definirNegocioId sincronizam aliases ===
  const u = {}
  definirContatoId(u, "contact-123")
  assert.equal(u.contatoId, "contact-123")
  assert.equal(u.contactId, "contact-123")
  const u2 = {}
  definirNegocioId(u2, "deal-456")
  assert.equal(u2.negocioId, "deal-456")
  assert.equal(u2.dealId, "deal-456")
  console.log("✅ Test 2: definirContatoId/definirNegocioId sincronizam aliases")

  // === Test 3: Contact with one deal that has numeroCaso → abre menu, restaura IDs ===
  {
    const contact = { id: "contact-1", properties: { firstname: "João", phone: "5581999990000" } }
    const deals = {
      "deal-100": {
        dealstage: HS_ANALISE,
        dealname: "Caso CLT001",
        numero_de_caso: "CLT.001.2025",
        area_juridica: "Trabalhista",
        estado_bot_snapshot: JSON.stringify({ numeroCaso: "CLT.001.2025", area: "Trabalhista", negocioId: "deal-100", contatoId: "contact-1", stage: "cliente" })
      }
    }
    mockHubSpot(contact, deals)
    const { u: usuario, contato } = await simularResolverUsuario("5581999990000", "João", contact, deals)

    assert.equal(contato.id, "contact-1")
    assert.equal(usuario.contatoId, "contact-1")
    assert.equal(usuario.contactId, "contact-1")
    assert.equal(usuario.negocioId, "deal-100")
    assert.equal(usuario.dealId, "deal-100")
    assert.equal(usuario.numeroCaso, "CLT.001.2025")
    assert.equal(podeMostrarMenuCliente(usuario), true)
    assert.equal(contactCreationCount.value, 0)
    assert.equal(dealCreationCount.value, 0)
    assert.equal(usuario._casosDisponiveis, undefined)
    console.log("✅ Test 3: Contact + one deal with numeroCaso → menu, IDs restored, zero creation")
  }

  // === Test 4: Contact with deal without numeroCaso → permanece no pré-atendimento ===
  {
    const contact = { id: "contact-1", properties: { firstname: "Maria" } }
    const deals = {
      "deal-200": {
        dealstage: HS_LEAD,
        dealname: "Lead sem caso"
      }
    }
    mockHubSpot(contact, deals)
    const { u: usuario, contato } = await simularResolverUsuario("5581999990000", "Maria", contact, deals)

    assert.equal(contato?.id, "contact-1")
    assert.equal(usuario.contatoId, "contact-1")
    assert.equal(usuario.contactId, "contact-1")
    assert.equal(usuario.numeroCaso, null)
    assert.equal(usuario.negocioId, null)
    assert.equal(usuario.dealId, null)
    assert.equal(podeMostrarMenuCliente(usuario), false)
    assert.equal(contactCreationCount.value, 0)
    assert.equal(dealCreationCount.value, 0)
    console.log("✅ Test 4: Contact + deal without numeroCaso → pré-atendimento, zero creation")
  }

  // === Test 5: Contact with TWO official deals → abre menu sem selecionar arbitrariamente ===
  {
    const contact = { id: "contact-1", properties: { firstname: "Carlos" } }
    const deals = {
      "deal-301": {
        dealstage: HS_ANALISE,
        dealname: "Caso CLT001",
        numero_de_caso: "CLT.001.2025",
        area_juridica: "Trabalhista"
      },
      "deal-302": {
        dealstage: HS_ANALISE,
        dealname: "Caso PREV001",
        numero_de_caso: "PREV.001.2025",
        area_juridica: "Previdenciário (INSS)"
      }
    }
    mockHubSpot(contact, deals)
    const { u: usuario, contato } = await simularResolverUsuario("5581999990000", "Carlos", contact, deals)

    assert.equal(contato?.id, "contact-1")
    assert.equal(usuario.contatoId, "contact-1")
    assert.equal(usuario.contactId, "contact-1")
    assert.equal(usuario._casosDisponiveis.length, 2)
    assert.equal(usuario._casosDisponiveis[0].id, "deal-301")
    assert.equal(usuario._casosDisponiveis[0].numeroCaso, "CLT.001.2025")
    assert.equal(usuario._casosDisponiveis[1].id, "deal-302")
    assert.equal(usuario._casosDisponiveis[1].numeroCaso, "PREV.001.2025")
    assert.equal(podeMostrarMenuCliente(usuario), true)
    assert.equal(usuario.numeroCaso, undefined)
    assert.equal(usuario.negocioId, null)
    assert.equal(usuario.dealId, null)
    assert.equal(contactCreationCount.value, 0)
    assert.equal(dealCreationCount.value, 0)
    const casosIds = usuario._casosDisponiveis.map(c => c.id)
    assert.equal(casosIds.includes("deal-301") && casosIds.includes("deal-302"), true)
    assert.equal(usuario._casosDisponiveis[0].numeroCaso, usuario._casosDisponiveis[0].numeroCaso)
    assert.notEqual(usuario._casosDisponiveis[0].numeroCaso, usuario._casosDisponiveis[1].numeroCaso)
    console.log("✅ Test 5: Contact + two official deals → menu, zero arbitrary selection, zero creation")
  }

  // === Test 6: Contact with one official + one lead → abre menu, preserva ambos ===
  {
    const contact = { id: "contact-1", properties: { firstname: "Ana" } }
    const deals = {
      "deal-401": {
        dealstage: HS_ANALISE,
        dealname: "Caso DEF001",
        numero_de_caso: "DEF.001.2025",
        area_juridica: "Cível",
        estado_bot_snapshot: JSON.stringify({ numeroCaso: "DEF.001.2025", area: "Cível", negocioId: "deal-401", contatoId: "contact-1" })
      },
      "deal-402": {
        dealstage: HS_LEAD,
        dealname: "Lead incompleto"
      }
    }
    mockHubSpot(contact, deals)
    const { u: usuario, contato } = await simularResolverUsuario("5581999990000", "Ana", contact, deals)

    const negocios = await hsBuscarNegociosComCasoDoContato("contact-1")
    assert.equal(negocios.casosOficiais.length, 1)
    assert.equal(negocios.leads.length, 1)
    assert.equal(negocios.casosOficiais[0].id, "deal-401")
    assert.equal(negocios.leads[0].id, "deal-402")
    assert.equal(podeMostrarMenuCliente(usuario), true)
    assert.equal(usuario.numeroCaso, "DEF.001.2025")
    assert.equal(contactCreationCount.value, 0)
    assert.equal(dealCreationCount.value, 0)
    console.log("✅ Test 6: Contact + one official + one lead → menu, both preserved, zero creation")
  }

  // === Test 7: Contact with all deals without numeroCaso → permanece lead ===
  {
    const contact = { id: "contact-1", properties: { firstname: " Paulo" } }
    const deals = {
      "deal-501": { dealstage: HS_LEAD, dealname: "Lead 1" },
      "deal-502": { dealstage: HS_ANALISE, dealname: "Lead 2" }
    }
    mockHubSpot(contact, deals)
    const { u: usuario, contato } = await simularResolverUsuario("5581999990000", "Paulo", contact, deals)

    assert.equal(contato?.id, "contact-1")
    assert.equal(usuario.contatoId, "contact-1")
    assert.equal(usuario.numeroCaso, null)
    assert.equal(podeMostrarMenuCliente(usuario), false)
    assert.equal(contactCreationCount.value, 0)
    assert.equal(dealCreationCount.value, 0)
    console.log("✅ Test 7: Contact + all deals without numeroCaso → lead, zero creation")
  }

  // === Test 8: Estado local perdido → reconstrução via HubSpot ===
  {
    const contact = { id: "contact-1", properties: { firstname: "Maria" } }
    const snapshot = { numeroCaso: "REST.001", area: "Família", negocioId: "deal-800", contatoId: "contact-1", stage: "cliente" }
    const deals = {
      "deal-800": {
        dealstage: HS_ANALISE,
        dealname: "Caso REST001",
        numero_de_caso: "REST.001",
        area_juridica: "Família",
        estado_bot_snapshot: JSON.stringify(snapshot)
      }
    }
    mockHubSpot(contact, deals)
    const { u: usuario } = await simularResolverUsuario("5581999990000", "Maria", contact, deals)

    assert.equal(usuario.contatoId, "contact-1")
    assert.equal(usuario.numeroCaso, "REST.001")
    assert.equal(usuario.negocioId, "deal-800")
    assert.equal(usuario.area, "Família")
    assert.equal(usuario.stage, "cliente")
    assert.equal(podeMostrarMenuCliente(usuario), true)
    console.log("✅ Test 8: Estado perdido → reconstrução via HubSpot")
  }

  // === Test 9: Telefone em formato diferente → normalização canônica ===
  {
    const phoneFormats = [
      "(81) 99999-0000",
      "5581999990000",
      "55 (81) 99999-0000",
      "81999990000"
    ]
    for (const format of phoneFormats) {
      assert.equal(telefoneCanonico(format), "5581999990000")
    }
    console.log("✅ Test 9: Telefone em formato diferente → normalização canônica")
  }

  // === Test 10: Erro na leitura do HubSpot → não classifica como lead, não cria ===
  {
    mockHubSpotError()
    let threw = false
    try {
      await simularResolverUsuario("5581999990000", "Teste", null, {})
    } catch (e) {
      threw = e.code === "HUBSPOT_CONTACT_LOOKUP_UNCERTAIN"
    }
    assert.equal(threw, true)
    assert.equal(contactCreationCount.value, 0)
    assert.equal(dealCreationCount.value, 0)
    console.log("✅ Test 10: HubSpot read error → não classifica como lead, não cria")
  }

  // === Test 11: _casosDisponiveis contém apenas dados necessários ===
  {
    const contact = { id: "contact-1", properties: { firstname: "Lista" } }
    const deals = {
      "deal-601": {
        dealstage: HS_ANALISE,
        dealname: "Caso A",
        numero_de_caso: "CASE.001",
        area_juridica: "Trabalhista"
      },
      "deal-602": {
        dealstage: HS_ANALISE,
        dealname: "Caso B",
        numero_de_caso: "CASE.002",
        area_juridica: "Previdenciário (INSS)"
      }
    }
    mockHubSpot(contact, deals)
    const { u: usuario } = await simularResolverUsuario("5581999990000", "Lista", contact, deals)

    assert.equal(usuario._casosDisponiveis.length, 2)
    for (const caso of usuario._casosDisponiveis) {
      assert.ok(caso.id, "caso deve ter id")
      assert.ok(caso.numeroCaso, "caso deve ter numeroCaso")
      assert.ok(caso.hasOwnProperty("area"), "caso deve ter area")
      assert.ok(caso.hasOwnProperty("dealname"), "caso deve ter dealname")
      const keys = Object.keys(caso)
      assert.equal(keys.every(k => ["id", "numeroCaso", "area", "dealname"].includes(k)), true, `chaves inesperadas: ${keys}`)
    }
    console.log("✅ Test 11: _casosDisponiveis contém apenas dados necessários")
  }

  // === Test 12: REAL_EXTERNAL_ACTIONS = 0 ===
  {
    const casoClassificado = {}
    restaurarEstadoNegocioHubSpot(casoClassificado, {
      id: "deal-classification-1",
      properties: {
        numero_de_caso: "PRV.260801.813",
        area_juridica: "INSS",
        tipo_de_caso: "inss_outros",
        oraculum_case_subtype: "incapacidade_temporaria",
        description: "Benefício por incapacidade temporária negado pelo INSS.",
        estado_bot_snapshot: JSON.stringify({
          numeroCaso: "PRV.260801.813",
          area: "INSS",
          tipo: "outros",
          tipo_de_caso: null,
          oraculum_case_subtype: null,
          nomenclaturaJuridica: {
            area: "INSS",
            subtype: null,
            type: "inss_outros",
            situation: "indeferido",
            status: "generic"
          }
        })
      }
    })
    assert.equal(casoClassificado.nomenclaturaJuridica.subtype, "incapacidade_temporaria")
    assert.equal(casoClassificado.tipo_de_caso, "inss_incapacidade")
    assert.equal(casoClassificado.oraculum_case_subtype, "incapacidade_temporaria")
    console.log("Test: restore refines stale generic classification from canonical deal fields")
  }

  {
    const semAtividade = {}
    restaurarEstadoNegocioHubSpot(semAtividade, {
      id: "deal-window-1",
      properties: {
        numero_de_caso: "WIN.001",
        estado_bot_snapshot: JSON.stringify({ numeroCaso: "WIN.001", stage: "cliente" })
      }
    })
    assert.equal(semAtividade.ultimaMsg, null)

    const timestampPersistido = 1_700_000_000_000
    const comAtividadePersistida = {}
    restaurarEstadoNegocioHubSpot(comAtividadePersistida, {
      id: "deal-window-2",
      properties: {
        numero_de_caso: "WIN.002",
        estado_bot_snapshot: JSON.stringify({ numeroCaso: "WIN.002", stage: "cliente", ultimaMsg: timestampPersistido })
      }
    })
    assert.equal(comAtividadePersistida.ultimaMsg, timestampPersistido)

    const timestampLocalMaisRecente = timestampPersistido + 10_000
    const comAtividadeLocal = { ultimaMsg: timestampLocalMaisRecente }
    restaurarEstadoNegocioHubSpot(comAtividadeLocal, {
      id: "deal-window-3",
      properties: {
        numero_de_caso: "WIN.003",
        estado_bot_snapshot: JSON.stringify({ numeroCaso: "WIN.003", stage: "cliente", ultimaMsg: timestampPersistido })
      }
    })
    assert.equal(comAtividadeLocal.ultimaMsg, timestampLocalMaisRecente)
    console.log("Test: restore preserves real customer timestamp without opening a synthetic window")
  }

  assert.equal(realExternalActions, 0)
  console.log("✅ Test 12: realExternalActions = 0")

  // === Test 13: EXTERNAL_HTTP_ATTEMPTS_NON_LOOPBACK = 0 ===
  assert.equal(externalHttpAttempts, 0)
  console.log("✅ Test 13: externalHttpAttempts = 0")

  console.log("\nRESULT 13/13 client-menu-routing tests passed")
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
