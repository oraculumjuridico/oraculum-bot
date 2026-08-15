"use strict"

function normalize(value) {
  return String(value || "").normalize("NFKC").trim().toUpperCase().replace(/\s+/g, "")
}

function normalizePhone(value) {
  return String(value || "").replace(/\D/g, "")
}

function phoneVariants(value) {
  const digits = normalizePhone(value)
  if (!digits) return new Set()
  const variants = new Set([digits])
  const withCountry = digits.startsWith("55") ? digits : `55${digits}`
  variants.add(withCountry)
  if (withCountry.length === 13 && withCountry[4] === "9") {
    variants.add(`${withCountry.slice(0, 4)}${withCountry.slice(5)}`)
  } else if (withCountry.length === 12) {
    variants.add(`${withCountry.slice(0, 4)}9${withCountry.slice(4)}`)
  }
  for (const variant of [...variants]) {
    if (variant.startsWith("55")) variants.add(variant.slice(2))
  }
  return variants
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
  const allowedByPhone = phone && [...phoneVariants(phone)].some(variant =>
    [...config.phones].some(configured => phoneVariants(configured).has(variant))
  )
  return Boolean(
    (caseNumber && config.cases.has(caseNumber)) ||
    (dealId && config.deals.has(dealId)) ||
    allowedByPhone
  )
}

module.exports = { automationPilotConfig, automationTargetAllowed }
