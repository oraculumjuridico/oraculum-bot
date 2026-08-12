"use strict"

const PVR_CASE_NUMBER = /^PVR\.\d{6}\.\d{3}$/
const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{2,127}$/
const PVR_BLOCKER = "pvr_existing_resource_preflight_required"

function result({ applicable = true, contactId = null, dealId = null, blockers = [] } = {}) {
  return Object.freeze({ ok: applicable && blockers.length === 0, applicable, contactId, dealId, blockers: Object.freeze([...blockers]) })
}

function contactKeys(identity = {}) {
  return [
    ["CPF", identity.cpf, "findContactsByCpf"],
    ["PHONE", identity.phone, "findContactsByPhone"],
    ["EMAIL", identity.email, "findContactsByEmail"]
  ].filter(([, value]) => typeof value === "string" && value.trim())
}

function idsFrom(records) {
  if (!Array.isArray(records)) return null
  const ids = records.map(record => String(record?.id || ""))
  if (ids.some(id => !ID.test(id))) return null
  return [...new Set(ids)]
}

async function preflightExistingPvrResources({ caseNumber, identity = {}, hubspot } = {}) {
  if (!PVR_CASE_NUMBER.test(caseNumber || "")) return result({ applicable: false, blockers: ["PVR_CASE_NUMBER_REQUIRED"] })
  const blockers = []
  if (!hubspot?.contacts || !hubspot?.deals) return result({ blockers: ["PVR_PREFLIGHT_PORT_INVALID"] })

  const evidence = []
  for (const [name, value, method] of contactKeys(identity)) {
    if (typeof hubspot.contacts[method] !== "function") {
      blockers.push(`CONTACT_${name}_LOOKUP_UNAVAILABLE`)
      continue
    }
    let records
    try { records = await hubspot.contacts[method](value) } catch { blockers.push(`CONTACT_${name}_LOOKUP_FAILED`); continue }
    const ids = idsFrom(records)
    if (ids === null) { blockers.push(`CONTACT_${name}_RESPONSE_INVALID`); continue }
    if (ids.length === 0) { blockers.push(`CONTACT_${name}_NOT_FOUND`); continue }
    if (ids.length !== 1) { blockers.push(`CONTACT_${name}_AMBIGUOUS`); continue }
    evidence.push(ids[0])
  }
  if (!evidence.length && blockers.length === 0) blockers.push("CONTACT_IDENTITY_EVIDENCE_MISSING")
  const contactIds = [...new Set(evidence)]
  if (contactIds.length > 1) blockers.push("CONTACT_IDENTITY_CONFLICT")
  const contactId = blockers.some(blocker => blocker.startsWith("CONTACT_")) ? null : contactIds[0] || null

  let dealId = null
  if (typeof hubspot.deals.findByCaseNumber !== "function") blockers.push("DEAL_LOOKUP_UNAVAILABLE")
  else {
    let records
    try { records = await hubspot.deals.findByCaseNumber(caseNumber) } catch { blockers.push("DEAL_LOOKUP_FAILED") }
    if (records !== undefined) {
      const ids = idsFrom(records)
      if (ids === null) blockers.push("DEAL_RESPONSE_INVALID")
      else if (ids.length === 0) blockers.push("DEAL_NOT_FOUND")
      else if (ids.length !== 1) blockers.push("DEAL_AMBIGUOUS")
      else dealId = ids[0]
    }
  }

  if (blockers.length) return result({ contactId: null, dealId: null, blockers })
  return result({ contactId, dealId })
}

function reviewReasonsAfterPvrPreflight(reviewReasons = [], preflight) {
  const reasons = Array.isArray(reviewReasons) ? [...reviewReasons] : []
  if (!preflight?.ok) return reasons
  return reasons.filter(reason => reason !== PVR_BLOCKER)
}

module.exports = { PVR_BLOCKER, preflightExistingPvrResources, reviewReasonsAfterPvrPreflight }
