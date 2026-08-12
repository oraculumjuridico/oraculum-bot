"use strict"

function normalize(value) {
  return String(value || "").normalize("NFKC").trim().toUpperCase().replace(/\s+/g, "")
}

function normalizePhone(value) {
  return String(value || "").replace(/\D/g, "")
}

function values(raw, normalizer = normalize) {
  return new Set(String(raw || "").split(",").map(normalizer).filter(Boolean))
}

function automationPilotConfig(env = process.env) {
  return {
    allowAll: String(env.AUTOMATION_ALLOW_ALL || "false").toLowerCase() === "true",
    cases: values(env.AUTOMATION_PILOT_CASES),
    deals: values(env.AUTOMATION_PILOT_DEAL_IDS),
    phones: values(env.AUTOMATION_PILOT_PHONES, normalizePhone)
  }
}

function automationTargetAllowed(target = {}, env = process.env) {
  const config = automationPilotConfig(env)
  if (config.allowAll) return true
  const caseNumber = normalize(target.numeroCaso || target.caseNumber || target.casoId)
  const dealId = normalize(target.dealId || target.negocioId)
  const phone = normalizePhone(target.phone || target.whatsapp || target.to)
  return Boolean(
    (caseNumber && config.cases.has(caseNumber)) ||
    (dealId && config.deals.has(dealId)) ||
    (phone && config.phones.has(phone))
  )
}

module.exports = { automationPilotConfig, automationTargetAllowed }
