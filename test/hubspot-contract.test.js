const assert = require("assert")
const axios = require("axios")
const fs = require("fs")
const path = require("path")
const {
  configurarHubSpotCore,
  hsCriarContato,
  hsCriarNegocio,
  hsAtualizarContato,
  hsAtualizarNegocio,
  filtrarPropsHubSpot,
  montarPropsContatoHubSpot,
  montarPropsAusentesContatoHubSpot
} = require("../src/domain/hubspot-core")
const {
  configurarHubSpotSync,
  sincronizarContatoNegocioHubSpot,
  hsMoverStageSeguro
} = require("../src/domain/hubspot-sync")
const { mapearTipoCaso } = require("../src/domain/lead-temperature")
const {
  CONTACT_WRITE_PROPERTIES,
  MANAGED_CONTACT_PROPERTIES,
  DEAL_WRITE_PROPERTIES,
  MANAGED_DEAL_PROPERTIES,
  validateHubSpotProperties,
  normalizeCpfHubSpot
} = require("../src/domain/hubspot-contract")
const {
  normalizarNumeroWhatsAppEnvio,
  normalizarTelefoneHubSpot
} = require("../src/domain/phone-name")

const axiosOriginal = {
  get: axios.get,
  post: axios.post,
  patch: axios.patch,
  put: axios.put
}
const consoleWarnOriginal = console.warn
const consoleErrorOriginal = console.error

function lerCsvSimples(filePath) {
  const linhas = fs.readFileSync(filePath, "utf8").split(/\r?\n/).filter(Boolean)
  const headers = linhas.shift().split(",").map(header => header.replace(/^"|"$/g, ""))
  return linhas.map(linha => {
    const colunas = []
    let atual = ""
    let aspas = false
    for (let i = 0; i < linha.length; i++) {
      const char = linha[i]
      if (char === '"' && linha[i + 1] === '"') {
        atual += '"'
        i++
      } else if (char === '"') {
        aspas = !aspas
      } else if (char === "," && !aspas) {
        colunas.push(atual)
        atual = ""
      } else {
        atual += char
      }
    }
    colunas.push(atual)
    return Object.fromEntries(headers.map((header, index) => [header, colunas[index] || ""]))
  })
}

function propriedadesExportadasHubSpot(nomeArquivo) {
  let csvPath

  // Strategy 1: Use environment variable
  if (process.env.HUBSPOT_CONTACTS_CSV && nomeArquivo.includes("contacts")) {
    csvPath = process.env.HUBSPOT_CONTACTS_CSV
  } else if (process.env.HUBSPOT_DEALS_CSV && nomeArquivo.includes("deals")) {
    csvPath = process.env.HUBSPOT_DEALS_CSV
  } else {
    // Strategy 2: Try sibling folder ../Hubspot
    const siblingPath = path.join(__dirname, "..", "..", "Hubspot", nomeArquivo)
    if (fs.existsSync(siblingPath)) {
      csvPath = siblingPath
    } else {
      // Strategy 3: Use fixture in test/fixtures
      const fixtureName = nomeArquivo.includes("contacts") ? "hubspot-contacts-contract.csv" : "hubspot-deals-contract.csv"
      csvPath = path.join(__dirname, "fixtures", fixtureName)
    }
  }

  if (!fs.existsSync(csvPath)) {
    throw new Error(`CSV file not found: ${csvPath}`)
  }

  return new Set(lerCsvSimples(csvPath).map(row => row["Nome interno"]).filter(Boolean))
}

function restaurarAxios() {
  Object.assign(axios, axiosOriginal)
  console.warn = consoleWarnOriginal
  console.error = consoleErrorOriginal
}

async function executar() {
  const requests = []
  const warnings = []
  const errors = []
  console.warn = warning => warnings.push(JSON.parse(warning))
  console.error = message => errors.push(String(message))

  const contatosExportados = propriedadesExportadasHubSpot("hubspot-properties-export-contacts-2026-06-26.csv")
  const negociosExportados = propriedadesExportadasHubSpot("hubspot-properties-export-deals-2026-06-27.csv")
  for (const property of CONTACT_WRITE_PROPERTIES) {
    assert.equal(contatosExportados.has(property) || MANAGED_CONTACT_PROPERTIES.has(property), true, `propriedade de contato sem fonte oficial: ${property}`)
  }
  for (const property of DEAL_WRITE_PROPERTIES) {
    assert.equal(negociosExportados.has(property) || MANAGED_DEAL_PROPERTIES.has(property), true, `propriedade de negocio sem fonte oficial: ${property}`)
  }

  assert.equal(CONTACT_WRITE_PROPERTIES.has("firstname"), true)
  assert.equal(CONTACT_WRITE_PROPERTIES.has("cpf_do_cliente"), true)
  assert.equal(CONTACT_WRITE_PROPERTIES.has("date_of_birth"), true)
  assert.equal(CONTACT_WRITE_PROPERTIES.has("email"), true)
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
      urgencia: "Urgentissima"
    }, warning => warnings.push(warning)),
    { dealname: "Caso", urgencia: "Urgentissima" }
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
      invalidEnums: []
    }
  ])

  assert.deepEqual(
    validateHubSpotProperties("contacts", {
      area_juridica: "Familia",
      origem_lead: "Bot Whatsapp",
      tipo_de_caso: "Outro"
    }, warning => warnings.push(warning)),
    {
      origem_lead: "Bot Whatsapp",
      tipo_de_caso: "Outro"
    }
  )
  assert.equal(warnings.at(-1).invalidEnums.includes("area_juridica"), true)
  for (const area_juridica of ["Previdenciário (INSS)", "Trabalhista", "Outros"]) {
    assert.deepEqual(
      validateHubSpotProperties("contacts", { area_juridica }),
      { area_juridica }
    )
  }

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
    mobilephone: "5511999999999",
    city: "São Paulo"
  })

  const propsContatoCompleto = montarPropsContatoHubSpot("5581999990000", {
    nome: "Ana Souza",
    email: "ana@example.com",
    cpf: "529.982.247-25",
    dataNascimento: "1990-01-02",
    cidade: "Recife",
    uf: "PE",
    area: "Trabalhista",
    tipo: "Verbas rescisorias",
    beneficio: "Rescisao",
    origemCaptacao: "admin_assistido_ia",
    numeroCaso: "CLT.260708.001",
    pastaDriveLink: "https://drive.example/folder"
  })
  assert.deepEqual(propsContatoCompleto, {
    firstname: "Ana",
    lastname: "Souza",
    email: "ana@example.com",
    work_email: "ana@example.com",
    phone: "5581999990000",
    mobilephone: "5581999990000",
    city: "Recife",
    state: "PE",
    area_juridica: "Trabalhista",
    beneficio: "Rescisao",
    beneficio_de_interesse: "Rescisao",
    cpf_do_cliente: "52998224725",
    date_of_birth: "1990-01-02",
    origem_lead: "Bot Whatsapp",
    pasta_drive: "https://drive.example/folder",
    situacao_caso: "Verbas rescisorias",
    tipo_de_caso: "Direito trabalhista"
  })
  assert.deepEqual(
    montarPropsAusentesContatoHubSpot({
      properties: {
        firstname: "Ana Antiga",
        email: "ana-antiga@example.com",
        cpf_do_cliente: "",
        date_of_birth: null,
        city: "Recife"
      }
    }, propsContatoCompleto),
    {
      lastname: "Souza",
      work_email: "ana@example.com",
      mobilephone: "5581999990000",
      state: "PE",
      area_juridica: "Trabalhista",
      beneficio: "Rescisao",
      beneficio_de_interesse: "Rescisao",
      cpf_do_cliente: "52998224725",
      date_of_birth: "1990-01-02",
      origem_lead: "Bot Whatsapp",
      pasta_drive: "https://drive.example/folder",
      situacao_caso: "Verbas rescisorias",
      tipo_de_caso: "Direito trabalhista"
    }
  )

  const propsPlaceholder = montarPropsContatoHubSpot("5581999990000", {
    nome: "Bia Placeholder",
    telefone: "informar depois",
    email: "email do cliente",
    cpf: "11111111111",
    cidade: "Recife",
    uf: "PE"
  })
  assert.equal(propsPlaceholder.phone, undefined)
  assert.equal(propsPlaceholder.mobilephone, undefined)
  assert.equal(propsPlaceholder.email, undefined)
  assert.equal(propsPlaceholder.work_email, undefined)
  assert.equal(propsPlaceholder.cpf_do_cliente, undefined)
  assert.deepEqual(propsPlaceholder.city, "Recife")
  assert.deepEqual(propsPlaceholder.state, "PE")

  const propsPreservaExistente = montarPropsContatoHubSpot("5581999990000", {
    nome: "Carlos",
    telefone: "",
    cpf: "",
    cidade: "Recife",
    uf: "PE"
  })
  assert.equal(propsPreservaExistente.phone, undefined)
  assert.equal(propsPreservaExistente.mobilephone, undefined)
  assert.equal(propsPreservaExistente.cpf_do_cliente, undefined)

  assert.equal(normalizeCpfHubSpot("529.982.247-25"), "52998224725")
  assert.equal(normalizeCpfHubSpot("52998224725"), "52998224725")
  assert.equal(montarPropsContatoHubSpot("5581999990000", { nome: "Maria Souza", cpf: "529.982.247-25" }).cpf_do_cliente, "52998224725")
  assert.equal(montarPropsContatoHubSpot("5581999990000", { nome: "Maria Souza", cpf: "" }).cpf_do_cliente, undefined)
  assert.equal(montarPropsContatoHubSpot("5581999990000", { nome: "Maria Souza", cpf: "11111111111" }).cpf_do_cliente, undefined)
  assert.equal(montarPropsContatoHubSpot("5581999990000", { nome: "Maria Souza", cpf: "cpf do cliente" }).cpf_do_cliente, undefined)

  assert.equal(normalizarTelefoneHubSpot("(81) 99999-0000"), "5581999990000")
  assert.equal(normalizarTelefoneHubSpot("55 (81) 99999-0000"), "5581999990000")
  assert.equal(normalizarTelefoneHubSpot("(81) 3333-0000"), "558133330000")
  assert.equal(normalizarTelefoneHubSpot("55 (81) 3333-0000"), "558133330000")
  assert.equal(normalizarNumeroWhatsAppEnvio("5581999990000"), "558199990000")
  assert.equal(montarPropsContatoHubSpot("5581999990000", { nome: "Nome da cliente" }).firstname, undefined)
  assert.equal(montarPropsContatoHubSpot("5581999990000", { nome: "Maria Souza", cidade: "cidade da cliente" }).city, undefined)

  const propsContatoPrevidenciario = montarPropsContatoHubSpot("5581999990001", {
    nome: "Pessoa Fictícia",
    area: "INSS",
    tipo: "Aposentadoria"
  })
  assert.equal(propsContatoPrevidenciario.area_juridica, "Previdenciário (INSS)")

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
  assert.equal(criacaoDeal.body.properties.dealname, "⚪ LF-Prv")
  assert.equal(criacaoDeal.body.properties.urgencia, "Moderada")
  assert.equal(criacaoDeal.body.properties.etapa_do_bot, "inicio")

  const postSucesso = axios.post
  axios.post = async () => {
    const error = new Error("HubSpot rejeitou o negócio")
    error.response = {
      status: 400,
      data: {
        category: "VALIDATION_ERROR",
        message: "Property value was not valid"
      }
    }
    throw error
  }
  assert.equal(
    await hsCriarNegocio({
      nome: "Terceiro",
      area: "Civil",
      descricao: "Caso para terceiro",
      urgencia: "normal",
      cidade: "Recife"
    }, { dealname: "Terceiro - Civil - ORA-TESTE" }),
    null
  )
  assert.equal(errors.some(message =>
    message.includes("\"operation\":\"criarNegocio\"") &&
    message.includes("\"httpStatus\":400") &&
    message.includes("\"properties\"")
  ), true)
  axios.post = postSucesso

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
    tipo_de_caso: "valor_inexistente"
  })
  assert.equal(requests.length, requestsAntesDoEnumInvalido + 1)
  assert.deepEqual(requests.at(-1).body.properties, { dealname: "Caso atualizado" })
  assert.equal(warnings.some(warning =>
    warning.objectType === "deals" &&
    warning.invalidEnums.includes("tipo_de_caso")
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
  assert.equal(
    mapearTipoCaso({ area: "Trabalhista", tipo: "Verbas rescisorias" }),
    "trab_demissao"
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
