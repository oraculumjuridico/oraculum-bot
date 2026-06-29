const assert = require("assert")
const axios = require("axios")
const {
  configurarHubSpotCore,
  hsCriarContato,
  hsCriarNegocio,
  hsAtualizarContato,
  hsAtualizarNegocio,
  filtrarPropsHubSpot
} = require("../src/domain/hubspot-core")
const {
  configurarHubSpotSync,
  sincronizarContatoNegocioHubSpot,
  hsMoverStageSeguro
} = require("../src/domain/hubspot-sync")
const { mapearTipoCaso } = require("../src/domain/lead-temperature")
const {
  CONTACT_WRITE_PROPERTIES,
  DEAL_WRITE_PROPERTIES,
  validateHubSpotProperties
} = require("../src/domain/hubspot-contract")

const axiosOriginal = {
  get: axios.get,
  post: axios.post,
  patch: axios.patch,
  put: axios.put
}
const consoleWarnOriginal = console.warn

function restaurarAxios() {
  Object.assign(axios, axiosOriginal)
  console.warn = consoleWarnOriginal
}

async function executar() {
  const requests = []
  const warnings = []
  console.warn = warning => warnings.push(JSON.parse(warning))

  assert.equal(CONTACT_WRITE_PROPERTIES.has("firstname"), true)
  assert.equal(CONTACT_WRITE_PROPERTIES.has("dealstage"), false)
  assert.equal(DEAL_WRITE_PROPERTIES.has("dealstage"), true)
  assert.equal(DEAL_WRITE_PROPERTIES.has("phone"), false)

  assert.deepEqual(
    validateHubSpotProperties("contacts", {
      firstname: "Maria",
      dealstage: "appointmentscheduled"
    }, warning => warnings.push(warning)),
    { firstname: "Maria" }
  )
  assert.deepEqual(
    validateHubSpotProperties("deals", {
      dealname: "Caso",
      phone: "5511999999999",
      urgencia: "Urgentíssima"
    }, warning => warnings.push(warning)),
    { dealname: "Caso" }
  )
  assert.deepEqual(warnings, [
    {
      event: "hubspot_payload_validation",
      objectType: "contacts",
      unknownProperties: ["dealstage"],
      invalidEnums: []
    },
    {
      event: "hubspot_payload_validation",
      objectType: "deals",
      unknownProperties: ["phone"],
      invalidEnums: ["urgencia"]
    }
  ])

  axios.post = async (url, body) => {
    requests.push({ method: "post", url, body })
    return { data: { id: url.endsWith("/contacts") ? "contact-1" : "deal-1" } }
  }
  axios.patch = async (url, body) => {
    requests.push({ method: "patch", url, body })
    return { data: { id: url.split("/").pop() } }
  }

  configurarHubSpotCore({
    monitor: { cadastros: 0 },
    HS_STAGE: { LEAD: "appointmentscheduled" },
    HS_PIPELINE: "default",
    getNomeDeal: () => "Caso de teste",
    getHubSpotDealStateProps: () => ({ etapa_do_bot: "inicio" })
  })

  assert.deepEqual(
    filtrarPropsHubSpot({
      valido: "ok",
      vazio: "",
      nulo: null,
      ausente: undefined,
      etapa_do_bot: ""
    }),
    { valido: "ok", etapa_do_bot: "" }
  )

  const contactId = await hsCriarContato("5511999999999", {
    nome: "Maria",
    cidade: "São Paulo"
  })
  assert.equal(contactId, "contact-1")
  const criacaoContato = requests.find(item => item.url.endsWith("/contacts"))
  assert.deepEqual(criacaoContato.body.properties, {
    firstname: "Maria",
    phone: "5511999999999",
    city: "São Paulo"
  })

  await hsAtualizarContato("contact-1", {
    firstname: "Maria",
    city: "",
    state: "SP",
    dealstage: "appointmentscheduled"
  })
  const atualizacaoContato = requests.find(item =>
    item.method === "patch" && item.url.endsWith("/contacts/contact-1")
  )
  assert.deepEqual(atualizacaoContato.body.properties, {
    firstname: "Maria",
    state: "SP"
  })

  const requestsAntesDoPayloadVazio = requests.length
  assert.equal(
    await hsAtualizarContato("contact-1", { dealstage: "appointmentscheduled" }),
    null
  )
  assert.equal(requests.length, requestsAntesDoPayloadVazio)
  assert.equal(warnings.some(warning =>
    warning.objectType === "contacts" &&
    warning.unknownProperties.includes("dealstage")
  ), true)

  const dealId = await hsCriarNegocio({
    nome: "Maria",
    area: "inss",
    assuntoResumo: "Aposentadoria",
    urgencia: "normal",
    cidade: "São Paulo",
    origemCaptacao: "whatsapp"
  })
  assert.equal(dealId, "deal-1")
  const criacaoDeal = requests.find(item => item.url.endsWith("/deals"))
  assert.equal(criacaoDeal.body.properties.pipeline, "default")
  assert.equal(criacaoDeal.body.properties.dealstage, "appointmentscheduled")
  assert.equal(criacaoDeal.body.properties.urgencia, "Moderada")
  assert.equal(criacaoDeal.body.properties.etapa_do_bot, "inicio")

  await hsAtualizarNegocio("deal-1", {
    urgencia: "Alta",
    descricao_completa: null,
    phone: "5511999999999"
  })
  const atualizacaoDeal = requests.find(item =>
    item.method === "patch" && item.url.endsWith("/deals/deal-1")
  )
  assert.deepEqual(atualizacaoDeal.body.properties, { urgencia: "Alta" })
  assert.equal(warnings.some(warning =>
    warning.objectType === "deals" &&
    warning.unknownProperties.includes("phone")
  ), true)

  const requestsAntesDoEnumInvalido = requests.length
  await hsAtualizarNegocio("deal-1", {
    dealname: "Caso atualizado",
    urgencia: "Urgentíssima"
  })
  assert.equal(requests.length, requestsAntesDoEnumInvalido + 1)
  assert.deepEqual(requests.at(-1).body.properties, { dealname: "Caso atualizado" })
  assert.equal(warnings.some(warning =>
    warning.objectType === "deals" &&
    warning.invalidEnums.includes("urgencia")
  ), true)

  const requestsAntesDoDealVazio = requests.length
  assert.equal(
    await hsAtualizarNegocio("deal-1", {
      phone: "5511999999999",
      tipo_de_caso: "valor_inexistente"
    }),
    null
  )
  assert.equal(requests.length, requestsAntesDoDealVazio)

  const stagesTeste = {
    ANALISE: "presentationscheduled",
    AGUARDANDO_DOCS: "decisionmakerboughtin",
    PROTOCOLO: "1343040098",
    PROCESSO: "1337291921",
    FINAL: "1343039663"
  }
  configurarHubSpotSync({
    HS_STAGE: stagesTeste,
    getNomeDeal: () => "Caso de teste",
    getHubSpotDealProps: (_u, props) => props
  })

  for (const stageProtegido of [
    stagesTeste.PROTOCOLO,
    stagesTeste.PROCESSO,
    stagesTeste.FINAL
  ]) {
    const requestsAntesDaProtecao = requests.length
    assert.equal(
      await hsMoverStageSeguro(
        "deal-stage-protegido",
        stagesTeste.AGUARDANDO_DOCS,
        stageProtegido,
        false
      ),
      false
    )
    assert.equal(requests.length, requestsAntesDaProtecao)
  }

  const requestsAntesDoStagePermitido = requests.length
  assert.equal(
    await hsMoverStageSeguro(
      "deal-stage-permitido",
      stagesTeste.AGUARDANDO_DOCS,
      stagesTeste.ANALISE,
      false
    ),
    true
  )
  assert.equal(requests.length, requestsAntesDoStagePermitido + 1)
  assert.deepEqual(requests.at(-1).body.properties, {
    dealstage: stagesTeste.AGUARDANDO_DOCS
  })

  await sincronizarContatoNegocioHubSpot({
    contatoId: "contact-2",
    nome: "João",
    cidade: "Campinas",
    uf: "SP"
  })
  const sincronizacaoContato = requests.find(item =>
    item.method === "patch" && item.url.endsWith("/contacts/contact-2")
  )
  assert.equal(sincronizacaoContato.body.properties.firstname, "João")
  assert.equal(sincronizacaoContato.body.properties.city, "Campinas")
  assert.equal(sincronizacaoContato.body.properties.state, "SP")
  assert.equal("uf" in sincronizacaoContato.body.properties, false)

  const tiposValidos = [
    ["inss", "aposentadoria", "inss_aposentadoria"],
    ["inss", "bpc", "inss_bpc"],
    ["inss", "incapacidade", "inss_incapacidade"],
    ["inss", "dependentes", "inss_dependentes"],
    ["inss", "inss_outros", "inss_outros"],
    ["trabalhista", "demissao", "trab_demissao"],
    ["trabalhista", "direitos", "trab_direitos"],
    ["trabalhista", "acidente", "trab_acidente"],
    ["trabalhista", "assedio", "trab_assedio"],
    ["trabalhista", "outros", "trab_outros"],
    ["outros", "revisao", "outros_revisao"],
    ["outros", "livre", "outros_livre"],
    ["outros", "outros", "outros_livre"]
  ]
  for (const [area, tipo, esperado] of tiposValidos) {
    assert.equal(mapearTipoCaso({ area, tipo }), esperado)
  }
  assert.equal(
    mapearTipoCaso({ area: " INSS ", tipo: " APOSENTADORIA " }),
    "inss_aposentadoria"
  )

  for (const entrada of [
    { area: "area_familia", tipo: "outros" },
    { area: "area_consumidor", tipo: "outros" },
    { area: "area_penal", tipo: "outros" },
    { area: "area_civil", tipo: "outros" },
    { area: "area_imovel", tipo: "outros" },
    { area: "outros", tipo: "desconhecido" },
    { area: "", tipo: "revisao" },
    { area: "outros", tipo: "" }
  ]) {
    assert.equal(mapearTipoCaso(entrada), null)
  }
}

executar()
  .then(() => {
    restaurarAxios()
    console.log("hubspot-contract.test.js: ok")
  })
  .catch(error => {
    restaurarAxios()
    console.error(error)
    process.exitCode = 1
  })
