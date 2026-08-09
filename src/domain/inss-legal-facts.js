"use strict"

const { sanitizarTextoEntrada } = require("../utils/text")

const BOOLEAN_FIELDS = new Set([
  "houvePericia",
  "incapacidadeAtual",
  "cartaDecisaoAdministrativa",
  "recursoAdministrativo",
  "beneficioAnterior"
])

const INSS_LEGAL_FIELDS = new Set([
  "beneficio", "dataRequerimento", "motivo", "houvePericia", "dataPericia",
  "inicioIncapacidade", "incapacidadeAtual", "limitacoesAtuais", "atividadeHabitual",
  "vinculosContribuicoes", "nb", "protocoloRequerimento", "cartaDecisaoAdministrativa",
  "recursoAdministrativo", "beneficioAnterior", "resultadoPericia"
])

const DATE_FIELDS = new Set(["dataRequerimento", "dataPericia", "inicioIncapacidade"])
const CORRECTION_SIGNAL = /\b(corrig\w*|correcao|na verdade|falei errado|informei errado|nao foi)\b/i

function plain(value) {
  return String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR").replace(/\s+/g, " ").trim()
}

function present(value) {
  return value !== null && value !== undefined && String(value).trim() !== ""
}

function sameValue(left, right) {
  if (typeof left === "boolean" || typeof right === "boolean") return left === right
  return plain(left) === plain(right)
}

function answer(value, origem = "cliente", status = "confirmado", extra = {}) {
  return { valor: value, status, origem, ...extra }
}

function addFact(facts, field, value, origem, status = "confirmado", extra = {}) {
  if (!INSS_LEGAL_FIELDS.has(field) || !present(value) || Object.prototype.hasOwnProperty.call(facts, field)) return
  facts[field] = answer(value, origem, status, extra)
}

function firstMatch(text, patterns = []) {
  for (const pattern of patterns) {
    const match = text.match(pattern)
    if (match?.[1]) return sanitizarTextoEntrada(match[1]).replace(/[.,;]+$/, "").trim()
  }
  return ""
}

function extractDateNear(text, marker) {
  const date = "(\\d{1,2}[/-]\\d{1,2}(?:[/-]\\d{2,4})?|\\d{1,2}\\s+de\\s+[a-zç]+(?:\\s+de\\s+\\d{4})?|(?:janeiro|fevereiro|marco|março|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)(?:\\s+de\\s+\\d{4})?)"
  const after = text.match(new RegExp(`(?:${marker})[^.!?\\n]{0,45}?${date}`, "i"))
  if (after?.[1]) return after[1]
  const before = text.match(new RegExp(`${date}[^.!?\\n]{0,30}?(?:${marker})`, "i"))
  return before?.[1] || ""
}

function extractBenefit(text) {
  const normalized = plain(text)
  const catalog = [
    [/\b(auxilio[- ]?doenca|auxilio por incapacidade temporaria|beneficio por incapacidade temporaria)\b/, "Auxilio por incapacidade temporaria"],
    [/\b(aposentadoria por incapacidade permanente|aposentadoria por invalidez)\b/, "Aposentadoria por incapacidade permanente"],
    [/\b(bpc|loas|beneficio de prestacao continuada)\b/, "BPC/LOAS"],
    [/\b(salario maternidade)\b/, "Salario-maternidade"],
    [/\b(pensao por morte)\b/, "Pensao por morte"],
    [/\b(auxilio acidente)\b/, "Auxilio-acidente"],
    [/\b(aposentadoria(?: por idade| por tempo de contribuicao)?)\b/, match => match[1]]
  ]
  for (const [pattern, value] of catalog) {
    const match = normalized.match(pattern)
    if (match) return typeof value === "function" ? value(match) : value
  }
  return ""
}

function hasUncertainty(text) {
  const normalized = plain(text)
  if (!normalized) return true
  return /\b(acho|talvez|possivelmente|provavelmente|parece que|nao sei|nao lembro|nao tenho certeza|pode ser|mais ou menos|por volta|aproximad|nessa epoca|nessa data|creio que)\b/.test(normalized)
}

function extractStandaloneDate(text) {
  const normalized = sanitizarTextoEntrada(text)
  const complete = normalized.match(/\b(\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?|\d{1,2}\s+de\s+(?:janeiro|fevereiro|mar[cç]o|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)(?:\s+de\s+\d{4})?)\b/i)
  if (complete?.[1]) return complete[1]
  const month = normalized.match(/\b(?:foi|era|ocorreu|aconteceu)?\s*(?:em|no m[eê]s de)\s+(janeiro|fevereiro|mar[cç]o|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)(?:\s+de\s+\d{4})?\b/i)
  return month?.[1] || ""
}

function isExplicitCorrection(text) {
  return CORRECTION_SIGNAL.test(plain(text))
}

function previousValue(previousAnswers, field) {
  return previousAnswers?.[field]?.valor
}

function inferCorrectionField(text, previousAnswers = {}) {
  const normalized = plain(text)
  const dateCorrection = extractStandaloneDate(text) || /\b(?:foi|era)\s+(?:em\s+)?(?:janeiro|fevereiro|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)\b/.test(normalized)
  if (/\bbeneficio\b|\bauxilio[- ]?doenca\b|\bbpc\b|\bloas\b|\baposentadoria\b/.test(normalized)) return "beneficio"
  if (/\bmotivo\b|\brazao\b|\bporque\b/.test(normalized)) return "motivo"
  if (/\bpericia\b/.test(normalized)) {
    if (dateCorrection || /\bdata\b|\bdia\b|\bmes\b/.test(normalized)) return "dataPericia"
    if (/\b(nao houve|nao fiz|nao passei|houve|fiz|passei)\b/.test(normalized)) return "houvePericia"
  }
  if (dateCorrection) {
    const candidates = [...DATE_FIELDS].filter(field => present(previousValue(previousAnswers, field)))
    if (candidates.length === 1) return candidates[0]
  }
  return null
}

function extractCorrectionValue(field, text) {
  const normalized = plain(text)
  if (DATE_FIELDS.has(field)) {
    const explicit = extractStandaloneDate(text)
    if (explicit) return explicit
    const months = [...String(text).matchAll(/\b(?:foi|era)\s+(?:em\s+)?(janeiro|fevereiro|mar[cç]o|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)(?:\s+de\s+\d{4})?\b/gi)]
    return months.at(-1)?.[1] || ""
  }
  if (field === "beneficio") return extractBenefit(text)
  if (field === "houvePericia") {
    if (/\b(nao houve|nao fiz|nao passei|sem pericia)\b/.test(normalized)) return false
    if (/\b(houve|fiz|passei|realizei)\b/.test(normalized)) return true
  }
  if (field === "motivo") {
    return firstMatch(text, [
      /(?:motivo|raz[aã]o)\s*(?:correto|real)?\s*(?:era|foi|:)?\s*([^.!?\n]{3,180})/i,
      /(?:porque|pois)\s+([^.!?\n]{3,180})/i
    ])
  }
  return ""
}

function markUncertain(facts, raw, expectedField, origem) {
  for (const fact of Object.values(facts)) fact.status = "precisa_conferir"
  if (!Object.keys(facts).length && expectedField && INSS_LEGAL_FIELDS.has(expectedField)) {
    addFact(facts, expectedField, raw, origem, "precisa_conferir", { reasonCode: "semantic_uncertainty" })
  }
  return facts
}

function extractInssLegalFacts(text, { expectedField = null, origem = "cliente" } = {}) {
  const raw = sanitizarTextoEntrada(text?.text || text)
  const normalized = plain(raw)
  const facts = {}
  if (!raw) return facts

  const benefit = extractBenefit(raw)
  addFact(facts, "beneficio", benefit, origem)

  const requestDate = extractDateNear(raw, "der|requerimento|requeri|protocolei|pedi|pedido")
  addFact(facts, "dataRequerimento", requestDate, origem)
  const examDate = extractDateNear(raw, "pericia|perícia")
  addFact(facts, "dataPericia", examDate, origem)
  const incapacityDate = raw.match(/(?:incapacidade|sintomas|afastamento)\s+(?:come[cç](?:ou|aram)|inici(?:ou|aram)|desde)\s+(?:em\s+)?([^.!?\n,;]{2,40})/i)?.[1] || ""
  addFact(facts, "inicioIncapacidade", incapacityDate, origem)

  if (/\b(nao fiz|nao passei|nao houve|sem) (?:a )?pericia\b/.test(normalized)) {
    addFact(facts, "houvePericia", false, origem)
  } else if (/\b(fiz|passei|houve|depois da|apos a|realizei|compareci) (?:a |pela )?pericia\b/.test(normalized)) {
    addFact(facts, "houvePericia", true, origem)
  }

  const denied = /\b(indeferid|negad|negaram|nao concedid|recusad)\b/.test(normalized)
  if (denied) {
    const reason = firstMatch(raw, [
      /(?:indeferid[oa]|negad[oa]|negaram|recusad[oa])[^.!?\n]{0,35}?(?:porque|pois|motivo(?: foi)?|alegaram que|disseram que)\s+([^.!?\n]{3,180})/i,
      /(?:porque|pois)\s+([^.!?\n]{3,180})/i
    ])
    addFact(facts, "motivo", reason, origem)
    addFact(facts, "resultadoPericia", /pericia/.test(normalized) ? "Indeferido apos pericia" : "Indeferido", origem)
  }

  if (/\b(ainda|continuo|permane[cç]o)[^.!?]{0,45}\b(incapaz|doente|afastad|sem conseguir trabalhar|com limitac)/.test(normalized)) {
    addFact(facts, "incapacidadeAtual", true, origem)
  } else if (/\b(nao estou mais incapaz|estou apt[oa]|voltei a trabalhar|recuperei|sem incapacidade atual)\b/.test(normalized)) {
    addFact(facts, "incapacidadeAtual", false, origem)
  }

  const limitations = firstMatch(raw, [
    /(?:minhas? limita[cç][oõ]es? (?:s[aã]o|incluem)|n[aã]o consigo|tenho dificuldade (?:para|de))\s+([^.!?\n]{3,180})/i
  ])
  addFact(facts, "limitacoesAtuais", limitations, origem)
  const occupation = firstMatch(raw, [/(?:trabalho|trabalhava|sou|atuo|atividade habitual)\s+(?:como|de|era)?\s*([^.!?\n,;]{3,100})/i])
  addFact(facts, "atividadeHabitual", occupation, origem)
  const contributions = firstMatch(raw, [/(?:contribui[cç][oõ]es?|v[ií]nculos?|cnis)\s*(?:s[aã]o|est[aã]o|:)?\s*([^.!?\n]{3,180})/i])
  addFact(facts, "vinculosContribuicoes", contributions, origem)

  const nb = raw.match(/\bNB\s*[:nº°.-]*\s*([\d .-]{8,24})/i)?.[1]?.replace(/\s+/g, " ").trim()
  addFact(facts, "nb", nb, origem)
  const protocol = raw.match(/\b(?:protocolo|requerimento)\s*[:nº°.-]*\s*(\d[\d .-]{7,24})/i)?.[1]?.replace(/\s+/g, " ").trim()
  addFact(facts, "protocoloRequerimento", protocol, origem)

  if (/\b(nao recebi|nao tenho|sem) (?:a )?(?:carta|decisao administrativa)\b/.test(normalized)) addFact(facts, "cartaDecisaoAdministrativa", false, origem)
  else if (/\b(recebi|tenho) (?:a )?(?:carta|decisao administrativa)\b/.test(normalized)) addFact(facts, "cartaDecisaoAdministrativa", true, origem)
  if (/\b(nao recorri|nao apresentei recurso|sem recurso administrativo)\b/.test(normalized)) addFact(facts, "recursoAdministrativo", false, origem)
  else if (/\b(recorr[ií]|entrei com recurso|apresentei recurso|recurso administrativo em andamento)\b/.test(normalized)) addFact(facts, "recursoAdministrativo", true, origem)
  if (/\b(nunca tive|nao tive|sem) (?:beneficio anterior|outro beneficio)\b/.test(normalized)) addFact(facts, "beneficioAnterior", false, origem)
  else if (/\b(tive|recebi|ja tive) (?:beneficio anterior|outro beneficio)\b/.test(normalized)) addFact(facts, "beneficioAnterior", true, origem)

  const uncertain = hasUncertainty(raw)
  if (expectedField && INSS_LEGAL_FIELDS.has(expectedField) && !Object.keys(facts).length && !uncertain) {
    if (BOOLEAN_FIELDS.has(expectedField)) {
      if (/^(sim|s|confirmo|houve|tenho|continua)[.!]?$/.test(normalized)) addFact(facts, expectedField, true, origem)
      else if (/^(nao|n|negativo|nao houve|nao tenho)[.!]?$/.test(normalized)) addFact(facts, expectedField, false, origem)
    } else if (DATE_FIELDS.has(expectedField)) {
      addFact(facts, expectedField, extractStandaloneDate(raw), origem)
    } else if (!/^(sim|nao|s|n)[.!]?$/.test(normalized)) {
      addFact(facts, expectedField, raw, origem)
    }
  }
  return uncertain ? markUncertain(facts, raw, expectedField, origem) : facts
}

function trustedDocumentFacts(documents = {}) {
  const facts = {}
  for (const item of Array.isArray(documents?.facts) ? documents.facts : []) {
    const trusted = item?.trusted === true || ["confirmed", "delivered"].includes(String(item?.status || "").toLowerCase())
    const principal = ["titular", "primary_holder"].includes(String(item?.partyRole || "").toLowerCase())
    if (!trusted || !principal || item?.review === true || !INSS_LEGAL_FIELDS.has(item?.field) || !present(item?.value)) continue
    addFact(facts, item.field, item.value, "documento_confirmado")
  }
  return facts
}

function mergeInssFacts({ data = {}, usuario = {}, documents = {} } = {}) {
  const text = [
    data.descricao?.valor, data.tipoCaso?.valor, data.situacao?.valor,
    usuario.descricao, usuario.assuntoResumo, usuario.tipoCaso, usuario.tipo, usuario.situacao
  ].filter(present).join(". ")
  const narrativeFacts = extractInssLegalFacts(text, { origem: "relato" })
  const documentFacts = trustedDocumentFacts(documents)
  const merged = { ...data }
  const divergences = []
  for (const [field, fact] of Object.entries(narrativeFacts)) {
    if (!present(merged[field]?.valor)) merged[field] = fact
  }
  for (const [field, fact] of Object.entries(documentFacts)) {
    if (present(merged[field]?.valor) && !sameValue(merged[field].valor, fact.valor)) {
      divergences.push({ field, sources: [merged[field].origem || "estado", "documento_confirmado"] })
    } else if (!present(merged[field]?.valor)) merged[field] = fact
  }
  return { data: merged, divergences, narrativeFacts, documentFacts }
}

function isInssLegalField(field) {
  return INSS_LEGAL_FIELDS.has(field)
}

function buildInssLegalAnswerResult(field, content, { previousAnswers = {} } = {}) {
  if (!isInssLegalField(field)) return null
  const raw = sanitizarTextoEntrada(content?.text || content)
  if (isExplicitCorrection(raw)) {
    const correctedField = inferCorrectionField(raw, previousAnswers)
    if (!correctedField) {
      return { persisted: true, canonicalAnswers: {}, skipDefaultAnswer: true, correctionAmbiguous: true }
    }
    const correctedValue = extractCorrectionValue(correctedField, raw)
    if (!present(correctedValue) && correctedValue !== false) {
      return { persisted: true, canonicalAnswers: {}, skipDefaultAnswer: true, correctionAmbiguous: true }
    }
    const uncertain = hasUncertainty(raw)
    return {
      persisted: true,
      canonicalAnswers: {
        [correctedField]: answer(correctedValue, "cliente", uncertain ? "precisa_conferir" : "confirmado", {
          correcao: true,
          valorAnterior: previousValue(previousAnswers, correctedField) ?? null
        })
      },
      skipDefaultAnswer: true,
      correctedField
    }
  }
  return {
    persisted: true,
    canonicalAnswers: extractInssLegalFacts(raw, { expectedField: field, origem: "cliente" }),
    skipDefaultAnswer: true
  }
}

module.exports = {
  BOOLEAN_FIELDS,
  INSS_LEGAL_FIELDS,
  DATE_FIELDS,
  hasUncertainty,
  inferCorrectionField,
  extractInssLegalFacts,
  trustedDocumentFacts,
  mergeInssFacts,
  isInssLegalField,
  buildInssLegalAnswerResult,
  sameValue
}
