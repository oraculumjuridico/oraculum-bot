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
  sincronizarContatoNegocioHubSpot
} = require("../src/domain/hubspot-sync")
const { mapearTipoCaso } = require("../src/domain/lead-temperature")

const axiosOriginal = {
  get: axios.get,
  post: axios.post,
  patch: axios.patch,
  put: axios.put
}

function restaurarAxios() {
  Object.assign(axios, axiosOriginal)
}

async function executar() {
  const requests = []

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
    state: "SP"
  })
  const atualizacaoContato = requests.find(item =>
    item.method === "patch" && item.url.endsWith("/contacts/contact-1")
  )
  assert.deepEqual(atualizacaoContato.body.properties, {
    firstname: "Maria",
    state: "SP"
  })

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
    descricao_completa: null
  })
  const atualizacaoDeal = requests.find(item =>
    item.method === "patch" && item.url.endsWith("/deals/deal-1")
  )
  assert.deepEqual(atualizacaoDeal.body.properties, { urgencia: "Alta" })

  configurarHubSpotSync({
    HS_STAGE: { FINAL: "closedwon" },
    getNomeDeal: () => "Caso de teste",
    getHubSpotDealProps: (_u, props) => props
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

  assert.equal(
    mapearTipoCaso({ area: "inss", tipo: "aposentadoria" }),
    "inss_aposentadoria"
  )
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
