"use strict"

const ANALYSIS_NOTE_PREFIX = "ORACULUM_ANALYSIS"
const MAX_NOTE_BODY_LENGTH = 65000
const syncLocks = new Map()

function cleanText(value) {
  if (value === null || value === undefined) return ""
  return String(value)
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

function redactSensitiveData(value) {
  return cleanText(value)
    .replace(/(?<!\d)(?:\+?55[\s.-]*)?(?:\(\d{2}\)|\d{2}[\s.-])[\s.-]*9?\d{4}[\s.-]\d{4}\b/g, "[TELEFONE OMITIDO]")
    .replace(/\b(?:telefone|celular|whats(?:app)?)\s*[:=]\s*\+?\d[\d\s().-]{7,}\d/gi, match => `${match.split(/[:=]/, 1)[0].trim()}: [TELEFONE OMITIDO]`)
    .replace(/\b\d{3}[.\s]?\d{3}[.\s]?\d{3}[-\s]?\d{2}\b/g, "[CPF OMITIDO]")
    .replace(/\b(?:credenciais?(?:\s+(?:do\s+)?gov(?:\.br)?)?|senha|password|passcode|access[_ -]?token|refresh[_ -]?token|token)\s*[:=]\s*[^\n.!?;]*/gi, match => `${match.split(/[:=]/, 1)[0].trim()}: [DADO SENSÃVEL OMITIDO]`)
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [TOKEN OMITIDO]")
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, "[TOKEN OMITIDO]")
    .replace(/https?:\/\/\S+/gi, "[LINK OMITIDO]")
}

function limitNoteBody(body, marker) {
  if (body.length <= MAX_NOTE_BODY_LENGTH) return body
  const suffix = `\n\n[CONTEÃšDO REDUZIDO PARA O LIMITE DO HUBSPOT]\n\n${marker}`
  return `${body.slice(0, Math.max(0, MAX_NOTE_BODY_LENGTH - suffix.length)).trimEnd()}${suffix}`
}

function uniqueList(value) {
  const values = Array.isArray(value) ? value : value ? [value] : []
  const seen = new Set()
  const result = []
  for (const item of values) {
    const raw = typeof item === "object"
      ? item.label || item.nome || item.name || item.categoria || item.category || item.tipo || ""
      : item
    const cleaned = redactSensitiveData(raw)
    const key = cleaned.toLocaleLowerCase("pt-BR")
    if (!cleaned || seen.has(key)) continue
    seen.add(key)
    result.push(cleaned)
  }
  return result
}

function markerForCase(caseNumber) {
  const normalized = cleanText(caseNumber).toUpperCase().replace(/[^A-Z0-9._-]/g, "-")
  if (!normalized) return ""
  return `[${ANALYSIS_NOTE_PREFIX}:${normalized}]`
}

function requiresHumanReview(status, reasons) {
  const normalized = cleanText(status).toLowerCase()
  return uniqueList(reasons).length > 0 || [
    "review_required",
    "revisao_necessaria",
    "revisÃ£o necessÃ¡ria",
    "human_review_required",
    "pending_human_review"
  ].includes(normalized)
}

function addSection(lines, heading, content, { bullets = false } = {}) {
  const values = uniqueList(content)
  if (!values.length) return
  lines.push("", heading, "")
  if (bullets) lines.push(...values.map(item => `â€¢ ${item}`))
  else lines.push(values.join("\n"))
}

function formatAnalysisNote(input = {}) {
  const caseNumber = redactSensitiveData(input.caseNumber)
  if (!caseNumber) return ""
  const descriptor = redactSensitiveData(input.clientName || input.caseType || "Caso")
  const marker = markerForCase(caseNumber)
  const reviewReasons = uniqueList(input.reviewReasons)
  const reviewRequired = requiresHumanReview(input.analysisStatus, reviewReasons)
  const analysisPoints = uniqueList([
    ...(Array.isArray(input.facts) ? input.facts : input.facts ? [input.facts] : []),
    ...(Array.isArray(input.preliminaryAnalysis) ? input.preliminaryAnalysis : input.preliminaryAnalysis ? [input.preliminaryAnalysis] : [])
  ])
  const lines = [
    "ANÃLISE JURÃDICA ATUALIZADA",
    `${caseNumber} â€” ${descriptor}`,
    "",
    "â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”"
  ]

  if (reviewRequired) lines.push("", "âš ï¸ REVISÃƒO HUMANA NECESSÃRIA")
  addSection(lines, "ðŸ“Œ SITUAÃ‡ÃƒO ATUAL", input.summary)
  addSection(lines, "âš–ï¸ PONTOS PARA ANÃLISE", analysisPoints, { bullets: true })
  addSection(lines, "ðŸ“‚ DOCUMENTOS EXISTENTES", input.documentsReceived, { bullets: true })
  addSection(lines, "â³ PENDÃŠNCIAS", input.documentsPending, { bullets: true })
  addSection(lines, "âž¡ï¸ PRÃ“XIMA AÃ‡ÃƒO", input.nextAction)
  if (reviewReasons.length) addSection(lines, "âš ï¸ OBSERVAÃ‡ÃƒO", reviewReasons, { bullets: reviewReasons.length > 1 })

  lines.push("", marker)
  return limitNoteBody(lines.join("\n"), marker)
}

function hasUsefulContent(input = {}) {
  return Boolean(
    cleanText(input.summary) ||
    uniqueList(input.facts).length ||
    uniqueList(input.preliminaryAnalysis).length ||
    uniqueList(input.documentsReceived).length ||
    uniqueList(input.documentsPending).length ||
    cleanText(input.nextAction) ||
    uniqueList(input.reviewReasons).length
  )
}

async function withSyncLock(key, task) {
  const previous = syncLocks.get(key) || Promise.resolve()
  let release
  const current = new Promise(resolve => { release = resolve })
  syncLocks.set(key, current)
  await previous.catch(() => {})
  try {
    return await task()
  } finally {
    release()
    if (syncLocks.get(key) === current) syncLocks.delete(key)
  }
}

async function syncAnalysisNote(input = {}, deps = {}) {
  const adapter = deps.adapter
  const dealId = cleanText(input.dealId)
  const caseNumber = cleanText(input.caseNumber)
  const marker = markerForCase(caseNumber)
  if (!adapter || !dealId || !marker || !hasUsefulContent(input)) {
    return { ok: false, skipped: true, reason: "analysis_note_input_incomplete" }
  }

  const lockKey = `${dealId}:${marker}`
  return withSyncLock(lockKey, async () => {
    try {
      const matches = await adapter.findByDealAndMarker({ dealId, marker })
      const existing = (Array.isArray(matches) ? matches : [])
        .filter(item => item?.id)
        .sort((left, right) => String(left.id).localeCompare(String(right.id)))[0]
      const body = formatAnalysisNote(input)
      let noteId
      let action

      if (existing) {
        noteId = String(existing.id)
        await adapter.update({ noteId, body })
        action = "updated"
      } else {
        const contactId = input.contactUnambiguous === true ? cleanText(input.contactId) : ""
        const created = await adapter.create({ body, dealId, contactId })
        noteId = cleanText(created?.id)
        if (!noteId) throw Object.assign(new Error("note id missing"), { code: "HUBSPOT_NOTE_ID_MISSING" })
        action = "created"
      }

      if (existing && input.contactUnambiguous === true && input.contactId) {
        await adapter.associateContact({ noteId, contactId: cleanText(input.contactId) })
      }
      return { ok: true, action, noteId, marker, duplicateMatches: Math.max(0, (matches?.length || 0) - 1) }
    } catch (error) {
      const code = cleanText(error?.code) || "HUBSPOT_ANALYSIS_NOTE_SYNC_FAILED"
      if (typeof deps.logError === "function") deps.logError({ operation: "syncAnalysisNote", code, dealId })
      return { ok: false, skipped: false, error: code }
    }
  })
}

module.exports = {
  ANALYSIS_NOTE_PREFIX,
  markerForCase,
  redactSensitiveData,
  formatAnalysisNote,
  syncAnalysisNote,
  requiresHumanReview
}
