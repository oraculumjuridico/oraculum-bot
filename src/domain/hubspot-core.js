const axios = require("axios")
const { logErroHubSpot } = require("../utils/logging")
const { sanitizarTextoEntrada } = require("../utils/text")
const { normalizarNumeroWhatsAppEnvio, normalizarTelefoneHubSpot } = require("./phone-name")
const { telefoneCanonico } = require("./identity")
const { validateHubSpotProperties, isPlaceholderValue, normalizeCpfHubSpot } = require("./hubspot-contract")
const { montarTituloNegocioHubSpot } = require("./hubspot-deal-title")

let deps = {
  monitor: null,
  HS_STAGE: null,
  HS_PIPELINE: "default",
  getNomeDeal: null,
  getHubSpotDealStateProps: null
}

function configurarHubSpotCore(config = {}) {
  deps = { ...deps, ...config }
}

const HS = () => ({ Authorization: `Bearer ${process.env.HUBSPOT_TOKEN}`, "Content-Type": "application/json" })

function warnHubSpotPayload(warning) {
  console.warn(JSON.stringify(warning))
}

const CONTACT_SEARCH_PROPERTIES = [
  "firstname",
  "lastname",
  "email",
  "phone",
  "city",
  "state",
  "area_juridica",
  "beneficio",
  "beneficio_de_interesse",
  "cpf_do_cliente",
  "date_of_birth",
  "origem_lead",
  "mobilephone",
  "address",
  "zip",
  "oraculum_referrer",
  "oraculum_identity_provenance",
  "hubspot_owner_id",
  "pasta_drive",
  "situacao_caso",
  "tipo_de_caso",
  "work_email"
]

function normalizarAreaContatoHubSpot(area) {
  const texto = sanitizarTextoEntrada(area).toLowerCase()
  if (!texto) return ""
  if (texto.includes("inss") || texto.includes("previd")) return "Previdenciário (INSS)"
  if (texto.includes("trabalh")) return "Trabalhista"
  return "Outros"
}

function normalizarTipoContatoHubSpot(u = {}) {
  const texto = [
    u.tipo,
    u.situacao,
    u.beneficio,
    u.beneficioInteresse,
    u.descricao,
    u.assuntoResumo
  ].filter(Boolean).join(" ").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
  const area = normalizarAreaContatoHubSpot(u.area)

  if (!area && !texto.trim()) return ""
  if (area === "Trabalhista") return "Direito trabalhista"
  if (/\b(aposent|aposentadoria)\b/.test(texto)) return "Aposentadoria"
  if (/\b(auxilio.?doenca|incapacidade|pericia|beneficio por incapacidade)\b/.test(texto)) return "Auxílio-doença"
  if (/\b(bpc|loas)\b/.test(texto)) return "BPC / LOAS"
  if (/\b(pensao|pensao por morte|dependente)\b/.test(texto)) return "Pensão por morte"
  if (/\b(salario.?maternidade|maternidade)\b/.test(texto)) return "Salário-maternidade"
  if (/\b(revisao|revisar)\b/.test(texto)) return "Revisão de benefício"
  return "Outro"
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const EMAIL_PLACEHOLDERS_INVALIDOS = new Set([
  "email do cliente",
  "nao informado",
  "nao sei",
  "sem informacao"
])

function emailValidoHubSpot(email) {
  if (!email || typeof email !== "string") return false
  const trimmed = email.trim().toLowerCase()
  if (!trimmed) return false
  if (EMAIL_PLACEHOLDERS_INVALIDOS.has(trimmed)) return false
  return EMAIL_REGEX.test(trimmed)
}

function montarPropsContatoHubSpot(from, u = {}) {
  // A presença de uma chave vazia jamais pode ocultar o telefone oficial do webhook.
  const telefone = telefoneCanonico(u.whatsappContato, u.telefone, u._numero, from)
  const nomeContato =
    (u?.nome && String(u.nome).trim()) ||
    (u?.nomePerfilWhatsApp && String(u.nomePerfilWhatsApp).trim()) ||
    (u?.nomeWA && String(u.nomeWA).trim()) ||
    "Lead WhatsApp"
  const beneficio = sanitizarTextoEntrada(u.beneficio || u.beneficioInteresse || u.situacao)
  const areaJuridica = normalizarAreaContatoHubSpot(u.area)
  const nomeValido = isPlaceholderValue(nomeContato) ? "" : nomeContato
  const partesNome = nomeValido.split(/\s+/).filter(Boolean)
  const firstname = partesNome.shift() || nomeValido
  const lastname = partesNome.join(" ")

  const emailValido = emailValidoHubSpot(u.email)
  const enderecoCompleto = [
    u.address || u.endereco,
    u.numeroEndereco,
    u.complementoEndereco,
    u.bairro
  ].map(sanitizarTextoEntrada).filter(Boolean).join(", ")

  return validateHubSpotProperties(
    "contacts",
    filtrarPropsHubSpot({
      firstname,
      lastname,
      email: emailValido ? u.email : null,
      work_email: emailValido ? u.email : null,
      phone: telefone,
      mobilephone: telefone,
      address: enderecoCompleto,
      city: u.cidade || "",
      state: u.uf || "",
      zip: u.zip || u.cep || "",
      area_juridica: areaJuridica,
      beneficio,
      beneficio_de_interesse: beneficio,
      cpf_do_cliente: u.cpf || "",
      date_of_birth: u.dataNascimento || u.data_nascimento || "",
      origem_lead: sanitizarTextoEntrada(u?.origemCaptacao) ? "Bot Whatsapp" : "",
      oraculum_referrer: u.oraculumReferrer || u.indicador || "",
      oraculum_identity_provenance: u.oraculumIdentityProvenance || u.provenienciaIdentidade || "",
      hubspot_owner_id: u.hubspotOwnerId || "",
      pasta_drive: u.pastaDriveLink || "",
      situacao_caso: u.situacao || u.tipo || "",
      tipo_de_caso: normalizarTipoContatoHubSpot(u)
    }),
    warnHubSpotPayload
  )
}

function montarPropsAusentesContatoHubSpot(contatoExistente = {}, props = {}) {
  const atuais = contatoExistente?.properties || {}
  return Object.fromEntries(
    Object.entries(props).filter(([property, value]) => {
      if (property === "phone") return false
      if (value === null || value === undefined) return false
      if (typeof value === "string" && !value.trim()) return false
      const atual = atuais[property]
      return atual === null || atual === undefined || String(atual).trim() === ""
    })
  )
}

async function hsBuscarPorPhone(phone) {
  try {
    const phoneNormalizado = normalizarTelefoneHubSpot(phone)
    const res = await axios.post(
      "https://api.hubapi.com/crm/v3/objects/contacts/search",
      {
        filterGroups: [{ filters: [{ propertyName: "phone", operator: "EQ", value: phoneNormalizado }] }],
        properties: CONTACT_SEARCH_PROPERTIES
      },
      { headers: HS() }
    )
    return res.data.results?.[0] || null
  } catch (e) {
    logErroHubSpot(e, { operation: "buscarPorPhone" })
    throw e
  }
}

async function hsBuscarContatoSeguro(phone) {
  const phoneNormalizado = telefoneCanonico(phone)
  if (!phoneNormalizado) return { status: "invalid", contato: null }
  try {
    const contato = await hsBuscarPorPhone(phoneNormalizado)
    return contato ? { status: "found", contato } : { status: "not_found", contato: null }
  } catch (error) {
    return { status: error?.code === "ECONNABORTED" ? "timeout" : "error", contato: null, error }
  }
}

async function hsBuscarPorCpf(cpf) {
  const canonico = normalizeCpfHubSpot(cpf)
  if (!canonico) return null
  const legado = canonico.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4")
  try {
    const resultados = []
    for (const value of [canonico, legado]) {
      const res = await axios.post(
        "https://api.hubapi.com/crm/v3/objects/contacts/search",
        {
          filterGroups: [{ filters: [{ propertyName: "cpf_do_cliente", operator: "EQ", value }] }],
          properties: CONTACT_SEARCH_PROPERTIES,
          limit: 100
        },
        { headers: HS() }
      )
      resultados.push(...(res.data?.results || []))
    }
    const unicos = [...new Map(resultados.filter(item => item?.id).map(item => [String(item.id), item])).values()]
    if (unicos.length > 1) throw Object.assign(new Error("CPF corresponde a múltiplos contatos"), { code: "HUBSPOT_CONTACT_CPF_AMBIGUOUS" })
    return unicos[0] || null
  } catch (e) {
    logErroHubSpot(e, { operation: "buscarPorCpf" })
    throw e
  }
}

async function hsCriarContato(from, u) {
  const props = montarPropsContatoHubSpot(from, u)
  if (!telefoneCanonico(props.phone, props.mobilephone)) return null
  if (!Object.keys(props).length) return null
  try {
    const res = await axios.post("https://api.hubapi.com/crm/v3/objects/contacts", { properties: props }, { headers: HS() })
    deps.monitor.cadastros++
    return res.data.id
  } catch (e) {
    logErroHubSpot(e, { operation: "criarContato", properties: props })
    return null
  }
}

async function hsCriarNegocio(u, opts = {}) {
  let properties = {}
  try {
    const stage = opts.stage || deps.HS_STAGE.LEAD
    const dealname = montarTituloNegocioHubSpot(
      {
        ...u,
        numeroCaso: u.numeroCaso || opts.numeroCaso,
        negocioStageId: stage
      },
      { HS_STAGE: deps.HS_STAGE, stage }
    )
    properties = validateHubSpotProperties(
      "deals",
      filtrarPropsHubSpot({
        dealname,
        pipeline: deps.HS_PIPELINE,
        dealstage: stage,
        hubspot_owner_id: "90513737",
        area_juridica: u.area || "",
        resumo_cliente: u.assuntoResumo || u.descricao || "",
        descricao_completa: u.descricao || u.assuntoResumo || "",
        // urgencia normalizada para o HubSpot
        urgencia: { alta: "Alta", normal: "Moderada", baixa: "Baixa" }[u.urgencia] || "Moderada",
        cidade: u.cidade || "",
        pasta_drive: u.pastaDriveLink || "",
        origem_atendimento: sanitizarTextoEntrada(u?.origemCaptacao) || "whatsapp",
        ...deps.getHubSpotDealStateProps(u)
      }),
      warnHubSpotPayload
    )
    if (!Object.keys(properties).length) return null
    const res = await axios.post(
      "https://api.hubapi.com/crm/v3/objects/deals",
      { properties },
      { headers: HS() }
    )
    return res.data.id
  } catch (e) {
    logErroHubSpot(e, { operation: "criarNegocio", properties })
    return null
  }
}

async function hsAssociar(cId, nId) {
  try {
    await axios.put(`https://api.hubapi.com/crm/v3/objects/deals/${nId}/associations/contacts/${cId}/deal_to_contact`, {}, { headers: HS() })
    return true
  } catch (e) {
    logErroHubSpot(e, { operation: "associarContatoNegocio", contactId: cId, dealId: nId })
    return false
  }
}

function filtrarPropsHubSpot(props = {}) {
  return Object.fromEntries(
    Object.entries(props).filter(([key, value]) => {
      if (value === null || value === undefined) return false
      if (key === "etapa_do_bot" && value === "") return true
      if (typeof value === "string" && !value.trim()) return false
      return true
    })
  )
}

async function hsAtualizarContato(contactId, props = {}) {
  const propsValidas = validateHubSpotProperties(
    "contacts",
    filtrarPropsHubSpot(props),
    warnHubSpotPayload
  )
  if (!contactId || !Object.keys(propsValidas).length) return null
  try {
    await axios.patch(
      `https://api.hubapi.com/crm/v3/objects/contacts/${contactId}`,
      { properties: propsValidas },
      { headers: HS() }
    )
    return contactId
  } catch (e) {
    logErroHubSpot(e, {
      operation: "atualizarContato",
      contactId,
      properties: propsValidas
    })
    return null
  }
}

async function hsAtualizarNegocio(dealId, props = {}) {
  const propsValidas = validateHubSpotProperties(
    "deals",
    filtrarPropsHubSpot(props),
    warnHubSpotPayload
  )
  if (!dealId || !Object.keys(propsValidas).length) return null
  try {
    await axios.patch(
      `https://api.hubapi.com/crm/v3/objects/deals/${dealId}`,
      { properties: propsValidas },
      { headers: HS() }
    )
    return dealId
  } catch (e) {
    logErroHubSpot(e, {
      operation: "atualizarNegocio",
      dealId,
      properties: propsValidas
    })
    return null
  }
}

async function hsCriarNota(cId, tipo, corpo) {
  if (!cId) return false
  try {
    const res = await axios.post(
      "https://api.hubapi.com/crm/v3/objects/notes",
      { properties: { hs_note_body: `[${tipo}]\n\n${corpo}`, hs_timestamp: String(Date.now()) } },
      { headers: HS() }
    )
    await axios.put(`https://api.hubapi.com/crm/v3/objects/notes/${res.data.id}/associations/contacts/${cId}/note_to_contact`, {}, { headers: HS() })
    return true
  } catch (e) {
    logErroHubSpot(e, {
      operation: "criarNotaContato",
      contactId: cId,
      properties: ["hs_note_body", "hs_timestamp"]
    })
    return false
  }
}

async function hsCriarNotaNegocio(nId, tipo, corpo) {
  if (!nId) return false
  try {
    const res = await axios.post(
      "https://api.hubapi.com/crm/v3/objects/notes",
      { properties: { hs_note_body: `[${tipo}]\n\n${corpo}`, hs_timestamp: String(Date.now()) } },
      { headers: HS() }
    )
    await axios.put(
      `https://api.hubapi.com/crm/v3/objects/notes/${res.data.id}/associations/deals/${nId}/note_to_deal`,
      {},
      { headers: HS() }
    )
    return true
  } catch (e) {
    logErroHubSpot(e, {
      operation: "criarNotaNegocio",
      dealId: nId,
      properties: ["hs_note_body", "hs_timestamp"]
    })
    return false
  }
}

module.exports = {
  configurarHubSpotCore,
  HS,
  hsBuscarPorCpf,
  hsBuscarPorPhone,
  hsBuscarContatoSeguro,
  hsCriarContato,
  hsCriarNegocio,
  hsAssociar,
  filtrarPropsHubSpot,
  montarPropsContatoHubSpot,
  montarPropsAusentesContatoHubSpot,
  hsAtualizarContato,
  hsAtualizarNegocio,
  hsCriarNota,
  hsCriarNotaNegocio,
  emailValidoHubSpot
}
