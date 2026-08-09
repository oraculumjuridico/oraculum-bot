"use strict"

const { sanitizarTextoEntrada } = require("../utils/text")
const { ESTADOS_EXTENSO } = require("./geo-search")

const ADDRESS_FIELDS = new Set([
  "endereco", "numeroEndereco", "complementoEndereco", "bairro",
  "cidade", "uf", "cep", "referenciaEndereco"
])
const CORRECTION_SIGNAL = /\b(corrig\w*|correcao|na verdade|falei errado|informei errado|moro agora)\b/i

function plain(value) {
  return String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR").replace(/\s+/g, " ").trim()
}

function present(value) {
  return value !== null && value !== undefined && String(value).trim() !== ""
}

function normalizeCep(value) {
  const digits = String(value || "").replace(/\D/g, "")
  return digits.length === 8 && !/^(\d)\1{7}$/.test(digits) ? digits : null
}

function normalizeUf(value) {
  const normalized = plain(value)
  for (const [uf, name] of Object.entries(ESTADOS_EXTENSO)) {
    if (normalized === uf.toLowerCase() || normalized === plain(name)) return uf
  }
  return null
}

function uncertainText(value) {
  return /\b(acho|talvez|deve ser|nao sei|nao lembro|sem certeza|provavelmente|mais ou menos|por volta)\b/.test(plain(value))
}

function makeFact(value, { original, origem = "cliente", status = "confirmado", normalized = false, reasonCode, extra = {} } = {}) {
  return {
    valor: value,
    status,
    origem,
    valorInformado: original ?? value,
    estadoEndereco: status === "precisa_conferir" ? "incerto" : normalized ? "normalizado" : "confirmado",
    ...(reasonCode ? { reasonCode } : {}),
    ...extra
  }
}

function extractReference(raw) {
  const match = raw.match(/(?:^|[.;]\s*|,\s*)((?:perto|proximo|pr[oó]ximo|depois|antes|ao lado|em frente|refer[eê]ncia)\b[^.!?]*)/i)
  if (!match) return { text: raw, reference: "" }
  return {
    text: `${raw.slice(0, match.index)} ${raw.slice((match.index || 0) + match[0].length)}`.replace(/\s+/g, " ").trim(),
    reference: sanitizarTextoEntrada(match[1]).replace(/[.,;]+$/, "").trim()
  }
}

function extractExplicitUf(raw) {
  const sigla = raw.match(/(?:^|[,/\-\s])([A-Z]{2})(?=$|[,.;\s])/)
  if (sigla && normalizeUf(sigla[1])) return normalizeUf(sigla[1])
  const normalized = plain(raw)
  for (const [uf, name] of Object.entries(ESTADOS_EXTENSO)) {
    if (new RegExp(`\\b${plain(name).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(normalized)) return uf
  }
  return null
}

function cleanComponent(value) {
  return sanitizarTextoEntrada(value).replace(/^[,.;\-\s]+|[,.;\-\s]+$/g, "").trim()
}

function extractSyntacticFacts(input, { expectedField = null, origem = "cliente" } = {}) {
  const raw = sanitizarTextoEntrada(input?.text || input)
  const facts = {}
  if (!raw) return { facts, raw, cityCandidate: "", uncertain: false }
  const uncertainty = uncertainText(raw)
  const { text, reference } = extractReference(raw)
  if (reference) facts.referenciaEndereco = makeFact(reference, { original: reference, origem, status: uncertainty ? "precisa_conferir" : "confirmado" })

  const cepMatch = text.match(/\b(\d{5})-?(\d{3})\b/)
  if (cepMatch) {
    const cep = normalizeCep(cepMatch[0])
    facts.cep = cep
      ? makeFact(cep, { original: cepMatch[0], origem, normalized: cepMatch[0] !== cep })
      : makeFact(cepMatch[0], { original: cepMatch[0], origem, status: "invalido", reasonCode: "invalid_cep" })
  } else if (expectedField === "cep" && /\d/.test(text)) {
    facts.cep = makeFact(cleanComponent(text), { original: raw, origem, status: "invalido", reasonCode: "invalid_cep" })
  }

  const uf = extractExplicitUf(text)
  if (uf) facts.uf = makeFact(uf, { original: raw, origem, normalized: !new RegExp(`\\b${uf}\\b`, "i").test(raw) })

  const withoutCep = text.replace(/\bCEP\s*[:\-]?\s*/ig, "").replace(/\b\d{5}-?\d{3}\b/g, "")
  const addressMatch = withoutCep.match(/(?:moro|resido|fica|endereco(?: e|:)?|endere[cç]o(?: e|:)?|na|no)\s+(?:na|no|em)?\s*((?:rua|avenida|av\.?|travessa|estrada|rodovia|alameda|pra[cç]a)\s+[^.!?]+)/i)
  const addressSource = addressMatch?.[1] || (/^(?:rua|avenida|av\.?|travessa|estrada|rodovia|alameda|pra[cç]a)\b/i.test(withoutCep.trim()) ? withoutCep.trim() : "")
  let cityCandidate = ""
  if (addressSource) {
    const parts = addressSource.split(",").map(cleanComponent).filter(Boolean)
    const looseParts = []
    if (parts[0]) facts.endereco = makeFact(parts[0], { original: parts[0], origem })
    for (const part of parts.slice(1)) {
      if (!facts.numeroEndereco && /^(?:n(?:umero|[º°o])?\.?\s*)?\d+[a-z]?$/i.test(part)) {
        facts.numeroEndereco = makeFact(part.replace(/^n(?:umero|[º°o])?\.?\s*/i, ""), { original: part, origem, normalized: true })
      } else if (!facts.numeroEndereco && /^(?:s\/?n|sem numero|numero nao tem|nao tem numero)$/i.test(plain(part))) {
        facts.numeroEndereco = makeFact("S/N", { original: part, origem, normalized: true })
      } else if (/^(?:ap(?:to)?\.?|apartamento|bloco|casa|sala|lote|quadra)\b/i.test(part) && !facts.complementoEndereco) {
        facts.complementoEndereco = makeFact(part, { original: part, origem })
      } else if (/^bairro\b/i.test(part) && !facts.bairro) {
        facts.bairro = makeFact(cleanComponent(part.replace(/^bairro\s*/i, "")), { original: part, origem, normalized: true })
      } else if (!normalizeUf(part) && !/^perto|proximo|depois|antes|ao lado/i.test(plain(part))) {
        looseParts.push(part.replace(/\s*[-/]\s*[A-Z]{2}$/i, "").trim())
      }
    }
    if (looseParts.length) {
      if (uf) {
        cityCandidate = looseParts.at(-1)
        if (looseParts.length > 1 && !facts.bairro) facts.bairro = makeFact(looseParts[0], { original: looseParts[0], origem })
      }
      else if ((cepMatch || facts.numeroEndereco) && looseParts.length === 1 && !facts.bairro) {
        facts.bairro = makeFact(looseParts[0], { original: looseParts[0], origem })
      } else cityCandidate = looseParts.at(-1)
    }
  }

  const bairro = text.match(/\bbairro\s+([^,.;]{2,80})/i)?.[1]
  if (bairro && !facts.bairro) facts.bairro = makeFact(cleanComponent(bairro), { original: bairro, origem })
  const numero = text.match(/\b(?:numero|n[º°o.]?)\s*(\d+[a-z]?|s\/?n|sem numero)\b/i)?.[1]
  if (numero && !facts.numeroEndereco) facts.numeroEndereco = makeFact(/^\d/i.test(numero) ? numero : "S/N", { original: numero, origem, normalized: !/^\d/.test(numero) })
  const complement = text.match(/\b(?:complemento|ap(?:to)?\.?|apartamento|bloco|casa|sala)\s*[:\-]?\s*([^,.;]{1,80})/i)
  if (complement && !facts.complementoEndereco) facts.complementoEndereco = makeFact(cleanComponent(`${complement[0]}`), { original: complement[0], origem })

  if (expectedField === "endereco" && !facts.endereco && /^(?:rua|avenida|av\.?|travessa|estrada|rodovia|alameda|pra[cç]a)\b/i.test(text.trim())) {
    facts.endereco = makeFact(cleanComponent(text.split(",")[0]), { original: raw, origem })
  }
  if (expectedField === "numeroEndereco" && !facts.numeroEndereco && /^(?:\d+[a-z]?|s\/?n|sem numero|numero nao tem)$/i.test(plain(text))) {
    facts.numeroEndereco = makeFact(/^\d/i.test(text.trim()) ? text.trim() : "S/N", { original: raw, origem, normalized: !/^\d/.test(text.trim()) })
  }
  if (expectedField === "bairro" && !facts.bairro && text.trim()) facts.bairro = makeFact(cleanComponent(text), { original: raw, origem })
  if (expectedField === "complementoEndereco" && !facts.complementoEndereco && text.trim()) facts.complementoEndereco = makeFact(cleanComponent(text), { original: raw, origem })
  if (expectedField === "referenciaEndereco" && !facts.referenciaEndereco && text.trim()) facts.referenciaEndereco = makeFact(cleanComponent(text), { original: raw, origem })

  if (!cityCandidate) {
    const explicitResidence = withoutCep.match(/\b(?:moro|resido)\s+(?:em|na cidade de)\s+([^,.;-]{2,60})/i)
    if (explicitResidence?.[1]) cityCandidate = cleanComponent(explicitResidence[1])
    const cityUf = withoutCep.match(/(?:^|[,;]\s*)([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ '\-]{1,60})\s*[-/,]\s*(?:[A-Z]{2}|[A-Za-zÀ-ÿ ]+)(?:[.;,]|$)/)
    if (!cityCandidate && cityUf?.[1]) cityCandidate = cleanComponent(cityUf[1])
    if (!cityCandidate && expectedField === "cidade" && !addressSource && !uf && !uncertainty) cityCandidate = cleanComponent(withoutCep.replace(/^(?:moro|resido|em|na cidade de)\s+/i, ""))
  }

  if (expectedField === "uf" && !facts.uf && text.trim()) {
    facts.uf = makeFact(cleanComponent(text), { original: raw, origem, status: "invalido", reasonCode: "invalid_uf" })
  }

  if (uncertainty) {
    for (const fact of Object.values(facts)) {
      fact.status = "precisa_conferir"
      fact.estadoEndereco = "incerto"
      fact.reasonCode ||= "semantic_uncertainty"
    }
    if (expectedField && ADDRESS_FIELDS.has(expectedField) && !facts[expectedField]) {
      facts[expectedField] = makeFact(raw, { original: raw, origem, status: "precisa_conferir", reasonCode: "semantic_uncertainty" })
    }
  }
  return { facts, raw, cityCandidate, uncertain: uncertainty }
}

function same(left, right) {
  if (left == null || right == null) return false
  const leftCep = normalizeCep(left)
  const rightCep = normalizeCep(right)
  if (leftCep && rightCep) return leftCep === rightCep
  return plain(left) === plain(right)
}

function previousValue(previousAnswers, field) {
  const item = previousAnswers?.[field]
  return item && typeof item === "object" && Object.prototype.hasOwnProperty.call(item, "valor")
    ? item.valor
    : item
}

function applyCorrectionMetadata(facts, raw, previousAnswers) {
  if (!CORRECTION_SIGNAL.test(plain(raw))) return facts
  for (const [field, fact] of Object.entries(facts)) {
    const previous = previousValue(previousAnswers, field)
    if (!present(previous) || same(previous, fact.valor)) continue
    fact.correcao = true
    fact.valorAnterior = previous
    fact.historico = [...(previousAnswers?.[field]?.historico || []), {
      valor: previous,
      origem: previousAnswers?.[field]?.origem || "estado_anterior"
    }]
  }
  return facts
}

async function buildAddressAnswerResult(field, content, {
  previousAnswers = {}, known = {}, resolveLocation
} = {}) {
  if (!ADDRESS_FIELDS.has(field)) return null
  const parsed = extractSyntacticFacts(content, { expectedField: field })
  const facts = parsed.facts
  let location = null
  const cep = facts.cep?.status !== "invalido" ? facts.cep?.valor : null
  if (typeof resolveLocation === "function" && (cep || parsed.cityCandidate)) {
    location = await resolveLocation(cep || [parsed.cityCandidate, facts.uf?.valor].filter(Boolean).join(", "))
  }
  if (location?.multiplos) {
    facts.cidade = makeFact(parsed.cityCandidate || parsed.raw, {
      original: parsed.raw, status: "precisa_conferir", reasonCode: "ambiguous_city",
      extra: { opcoes: (location.opcoes || []).map(item => ({ cidade: item.cidade, uf: item.uf })) }
    })
  } else if (location) {
    if (location.cidade) facts.cidade = makeFact(location.cidade, { original: parsed.cityCandidate || parsed.raw, normalized: !same(location.cidade, parsed.cityCandidate) })
    if (location.uf) facts.uf = makeFact(String(location.uf).toUpperCase(), { original: facts.uf?.valor || parsed.raw, normalized: !same(location.uf, facts.uf?.valor) })
    if (location.cep && !facts.cep) facts.cep = makeFact(normalizeCep(location.cep), { original: location.cep, normalized: true, origem: "lookup_cep" })
  } else if (parsed.cityCandidate) {
    const knownCity = previousValue(previousAnswers, "cidade") || known.cidade
    if (same(parsed.cityCandidate, knownCity)) facts.cidade = makeFact(knownCity, { original: parsed.cityCandidate })
    else facts.cidade = makeFact(parsed.cityCandidate, { original: parsed.cityCandidate, status: "precisa_conferir", reasonCode: "city_not_validated" })
  }

  const conflicts = []
  for (const key of ["cidade", "uf", "cep"]) {
    const prior = previousValue(previousAnswers, key) || known[key]
    const incoming = facts[key]?.valor
    if (!present(prior) || !present(incoming) || same(prior, incoming)) continue
    const explicitCorrection = CORRECTION_SIGNAL.test(plain(parsed.raw))
    if (!explicitCorrection) {
      conflicts.push({ field: key, existing: prior, incoming })
      facts[key].status = "precisa_conferir"
      facts[key].estadoEndereco = "divergente"
      facts[key].reasonCode = "address_divergence"
    }
  }
  if (facts.cep?.status === "confirmado" && location) {
    const cityPrior = previousValue(previousAnswers, "cidade") || known.cidade
    const ufPrior = previousValue(previousAnswers, "uf") || known.uf
    if ((cityPrior && location.cidade && !same(cityPrior, location.cidade)) || (ufPrior && location.uf && !same(ufPrior, location.uf))) {
      facts.cep.status = "precisa_conferir"
      facts.cep.estadoEndereco = "divergente"
      facts.cep.reasonCode = "cep_location_conflict"
    }
  }
  applyCorrectionMetadata(facts, parsed.raw, previousAnswers)
  const confirmed = Object.fromEntries(Object.entries(facts).filter(([, fact]) => fact.status === "confirmado"))
  return {
    persisted: true,
    canonicalAnswers: facts,
    canonicalPatch: { values: Object.fromEntries(Object.entries(confirmed).map(([key, fact]) => [key, fact.valor])) },
    skipDefaultAnswer: true,
    requiresConfirmation: Object.values(facts).some(fact => ["precisa_conferir", "contraditorio", "invalido"].includes(fact.status)),
    humanReviewRequired: false,
    reviewReason: conflicts.length ? "address_divergence" : Object.values(facts).find(fact => fact.reasonCode)?.reasonCode || null,
    divergences: conflicts
  }
}

function trustedAddressDocumentFacts(documents = {}) {
  const facts = {}
  for (const item of Array.isArray(documents?.facts) ? documents.facts : []) {
    const trusted = item?.trusted === true || ["confirmed", "delivered"].includes(String(item?.status || "").toLowerCase())
    const principal = ["titular", "primary_holder"].includes(String(item?.partyRole || "").toLowerCase())
    if (!trusted || !principal || item?.review === true || Number(item?.confidence ?? 1) < 0.9 || !ADDRESS_FIELDS.has(item?.field) || !present(item?.value)) continue
    facts[item.field] = makeFact(item.value, { origem: "documento_confirmado", original: item.value })
  }
  return facts
}

module.exports = {
  ADDRESS_FIELDS,
  normalizeCep,
  normalizeUf,
  uncertainText,
  extractSyntacticFacts,
  buildAddressAnswerResult,
  trustedAddressDocumentFacts,
  same
}
