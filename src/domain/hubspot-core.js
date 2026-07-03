const axios = require("axios")
const { logErroHubSpot } = require("../utils/logging")
const { sanitizarTextoEntrada } = require("../utils/text")
const { normalizarNumeroWhatsAppEnvio } = require("./phone-name")
const { validateHubSpotProperties } = require("./hubspot-contract")

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

async function hsBuscarPorPhone(phone) {
  try {
    const phoneNormalizado = normalizarNumeroWhatsAppEnvio(phone)
    const res = await axios.post(
      "https://api.hubapi.com/crm/v3/objects/contacts/search",
      {
        filterGroups: [{ filters: [{ propertyName: "phone", operator: "EQ", value: phoneNormalizado }] }],
        properties: ["firstname", "area_juridica"]
      },
      { headers: HS() }
    )
    return res.data.results?.[0] || null
  } catch (e) {
    logErroHubSpot(e, { operation: "buscarPorPhone" })
    throw e
  }
}

async function hsCriarContato(from, u) {
  const telefone = normalizarNumeroWhatsAppEnvio(from)
  const nomeContato =
    (u?.nome && String(u.nome).trim()) ||
    (u?.nomePerfilWhatsApp && String(u.nomePerfilWhatsApp).trim()) ||
    (u?.nomeWA && String(u.nomeWA).trim()) ||
    "Lead WhatsApp"
  const props = validateHubSpotProperties(
    "contacts",
    filtrarPropsHubSpot({ firstname: nomeContato, phone: telefone, city: u.cidade || "" }),
    warnHubSpotPayload
  )
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
  try {
    const stage = opts.stage || deps.HS_STAGE.LEAD
    const dealname = opts.dealname || deps.getNomeDeal(u)
    const properties = validateHubSpotProperties(
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
  } catch (e) {
    logErroHubSpot(e, { operation: "associarContatoNegocio", contactId: cId, dealId: nId })
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
  hsBuscarPorPhone,
  hsCriarContato,
  hsCriarNegocio,
  hsAssociar,
  filtrarPropsHubSpot,
  hsAtualizarContato,
  hsAtualizarNegocio,
  hsCriarNota,
  hsCriarNotaNegocio
}
