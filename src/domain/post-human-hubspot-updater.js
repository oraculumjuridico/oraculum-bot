"use strict"

const CONTACT_UPDATE_FIELDS = new Set([
  "firstname", "email", "work_email", "phone", "cpf_do_cliente", "date_of_birth", "city", "state", "address", "zip"
])
const DEAL_UPDATE_FIELDS = new Set([
  "description", "descricao_completa", "resumo_cliente", "area_juridica", "tipo_de_caso",
  "beneficio", "motivo", "situacao_caso", "nb", "urgencia", "oraculum_case_facts"
])
const PROTECTED_DEAL_FIELDS = new Set([
  "numero_de_caso", "dealstage", "hubspot_owner_id", "hs_object_id", "id",
  "associated_contact_id", "contact_id"
])

function normalize(value) { return String(value ?? "").trim().replace(/\s+/g, " ").toLocaleLowerCase("pt-BR") }
function empty(value) { return value === null || value === undefined || String(value).trim() === "" }

function jsonObject(value) {
  if (empty(value)) return {}
  try {
    const parsed = typeof value === "string" ? JSON.parse(value) : value
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null
  } catch {
    return null
  }
}

function planSafeUpdate(current = {}, incoming = {}, allowed = []) {
  const updates = {}; const divergences = []; const unchanged = []; const blocked = []
  const allow = new Set(allowed)
  for (const field of Object.keys(incoming)) {
    if (!allow.has(field)) { blocked.push({ field, reason: "property_not_allowed" }); continue }
    if (field === "oraculum_case_facts") {
      const atual = jsonObject(current[field])
      const recebido = jsonObject(incoming[field])
      if (!atual || !recebido) { blocked.push({ field, reason: "invalid_json_object" }); continue }
      const conflitos = Object.keys(recebido).filter(key => !empty(atual[key]) && normalize(atual[key]) !== normalize(recebido[key]))
      if (conflitos.length) { divergences.push({ field, keys: conflitos.sort() }); continue }
      const merged = JSON.stringify({ ...atual, ...recebido })
      if (normalize(current[field]) === normalize(merged)) unchanged.push(field)
      else updates[field] = merged
      continue
    }
    if (empty(current[field])) updates[field] = incoming[field]
    else if (normalize(current[field]) === normalize(incoming[field])) unchanged.push(field)
    else divergences.push({ field })
  }
  return { updates, divergences, unchanged, blocked }
}

async function atualizarHubSpotSeguro({
  objectType, objectId, contactId, expectedDealId, current = {}, incoming = {}, deps, cycleId
}) {
  const explicitAllowlist = objectType === "contact" ? CONTACT_UPDATE_FIELDS :
    objectType === "deal" ? DEAL_UPDATE_FIELDS : new Set()
  const plan = planSafeUpdate(current, incoming, explicitAllowlist)
  if (!explicitAllowlist.size || !objectId) plan.blocked.push({ field: "object", reason: "invalid_target" })
  if (objectType === "deal") {
    if (!contactId || !expectedDealId || String(objectId) !== String(expectedDealId)) {
      plan.blocked.push({ field: "association", reason: "cross_object_update_blocked" })
    } else {
      let associated = false
      try { associated = await deps.isAssociated(contactId, objectId) === true } catch {}
      if (!associated) plan.blocked.push({ field: "association", reason: "contact_deal_not_validated" })
    }
    for (const field of PROTECTED_DEAL_FIELDS) {
      if (field in incoming && !plan.blocked.some(item => item.field === field)) {
        plan.blocked.push({ field, reason: "protected_property" })
      }
      delete plan.updates[field]
    }
  }
  const failClosed = plan.blocked.length > 0
  if (failClosed) plan.updates = {}
  try {
    if (Object.keys(plan.updates).length) await deps.update(objectType, objectId, plan.updates)
    if (plan.divergences.length || failClosed) await deps.createReviewNote(objectType, objectId, {
      cycleId, fields: [...plan.divergences, ...plan.blocked].map(item => item.field)
    })
    return {
      ...plan, pending: false,
      humanReviewRequired: plan.divergences.length > 0 || failClosed,
      blocked: plan.blocked
    }
  } catch {
    return { ...plan, pending: true, error: "hubspot_indisponivel", humanReviewRequired: true }
  }
}

module.exports = {
  CONTACT_UPDATE_FIELDS, DEAL_UPDATE_FIELDS, PROTECTED_DEAL_FIELDS,
  planSafeUpdate, atualizarHubSpotSeguro
}
