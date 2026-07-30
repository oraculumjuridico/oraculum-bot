"use strict"

const HUBSPOT_URGENCY_PROPERTY = "urgencia"
const HUBSPOT_URGENCY_HIGH = "Alta"
const LOCAL_URGENCY_HIGH = "alta"

function normalizarUrgenciaHubSpotAdmin(value) {
  const normalized = String(value || "").trim().toLowerCase()
  return ({
    alta: "alta",
    moderada: "normal",
    baixa: "baixa"
  })[normalized] || null
}

function resolverUrgenciaAdmin({ hubspot, snapshot, local } = {}) {
  const hubspotNormalizada = normalizarUrgenciaHubSpotAdmin(hubspot)
  if (hubspotNormalizada) return hubspotNormalizada
  if (["alta", "normal", "baixa"].includes(snapshot)) return snapshot
  if (["alta", "normal", "baixa"].includes(local)) return local
  return "normal"
}

async function persistirUrgenciaAltaAdmin({
  item,
  atualizarNegocio,
  criarNotaContato,
  criarNotaNegocio,
  gerarBriefing
} = {}) {
  const u = item?.u
  if (!u?.negocioId || typeof atualizarNegocio !== "function") {
    return { persisted: false, reason: "negocio_indisponivel", notaContato: false, notaNegocio: false }
  }

  const anterior = u.urgencia || "normal"
  const atualizado = await atualizarNegocio(u.negocioId, {
    [HUBSPOT_URGENCY_PROPERTY]: HUBSPOT_URGENCY_HIGH
  })
  if (!atualizado) {
    return { persisted: false, reason: "hubspot_update_failed", anterior, notaContato: false, notaNegocio: false }
  }

  u.urgencia = LOCAL_URGENCY_HIGH
  const briefing = typeof gerarBriefing === "function" ? gerarBriefing(u) : {}
  const corpo = [
    "Caso marcado como urgente pelo admin.",
    `Caso: ${u.numeroCaso || "-"}`,
    `Urgencia anterior: ${anterior}`,
    `Proxima acao: ${briefing?.proximaAcao || "revisar com prioridade"}`
  ].join("\n")

  let notaContato = false
  let notaNegocio = false
  const noteFailures = []

  if (u.contatoId && typeof criarNotaContato === "function") {
    try {
      notaContato = Boolean(await criarNotaContato(u.contatoId, "CASO MARCADO URGENTE", corpo))
      if (!notaContato) noteFailures.push("contact_note_returned_false")
    } catch {
      noteFailures.push("contact_note_exception")
    }
  }

  if (typeof criarNotaNegocio === "function") {
    try {
      notaNegocio = Boolean(await criarNotaNegocio(u.negocioId, "CASO MARCADO URGENTE", corpo))
      if (!notaNegocio) noteFailures.push("deal_note_returned_false")
    } catch {
      noteFailures.push("deal_note_exception")
    }
  }

  return {
    persisted: true,
    reason: null,
    anterior,
    notaContato,
    notaNegocio,
    notesComplete: Boolean(notaContato && notaNegocio),
    noteFailures,
    hubspotProperty: HUBSPOT_URGENCY_PROPERTY,
    hubspotValue: HUBSPOT_URGENCY_HIGH,
    localValue: LOCAL_URGENCY_HIGH
  }
}

module.exports = {
  HUBSPOT_URGENCY_PROPERTY,
  HUBSPOT_URGENCY_HIGH,
  LOCAL_URGENCY_HIGH,
  normalizarUrgenciaHubSpotAdmin,
  resolverUrgenciaAdmin,
  persistirUrgenciaAltaAdmin
}
