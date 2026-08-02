"use strict"

const crypto = require("node:crypto")
const { isPostHumanComplementationEnabled } = require("./post-human-feature-flag")

const ACTION_ID = "admin_post_human_completed"
const actionContexts = new Map()
function actionTtlMs() { return Math.max(1000, Number(process.env.POST_HUMAN_ACTION_TTL_MS || 15 * 60 * 1000)) }
function actionMaxContexts() { return Math.max(1, Math.min(10000, Number(process.env.POST_HUMAN_ACTION_MAX_CONTEXTS || 500))) }
function normalizeAdminId(value) { return String(value || "").normalize("NFKC").trim().replace(/[^\p{L}\p{N}@._+-]/gu, "").toUpperCase() }

function normalizeCaseNumber(value) {
  return String(value || "").normalize("NFKC").trim().toUpperCase().replace(/\s+/g, "")
}
function normalizePhone(value) { return String(value || "").replace(/\D/g, "") }

let legacyAllowlistWarningEmitted = false
function configuredPilotCases() {
  const canonical = String(process.env.POST_HUMAN_PILOT_CASES || "").trim()
  if (canonical) return canonical
  const legacy = String(process.env.POST_HUMAN_COMPLEMENTATION_ALLOWLIST || "").trim()
  if (legacy && !legacyAllowlistWarningEmitted) {
    legacyAllowlistWarningEmitted = true
    console.warn("[POST_HUMAN] alias legado de allowlist em uso; configure POST_HUMAN_PILOT_CASES")
  }
  return legacy
}

function getAllowedPilotCases(raw = configuredPilotCases()) {
  const source = String(raw ?? "").trim()
  if (!source) return new Set()
  const values = source.split(",").map(normalizeCaseNumber)
  if (!values.length || values.some(value => !value || value === "*" || !/^[A-Z0-9._/-]{1,80}$/.test(value))) return new Set()
  return new Set(values)
}

function isPilotCaseAllowed(numeroCaso, raw) {
  const normalized = normalizeCaseNumber(numeroCaso)
  return Boolean(normalized && getAllowedPilotCases(raw).has(normalized))
}

function pruneActionContexts(now = Date.now()) {
  for (const [token, context] of actionContexts) {
    if (now - context.createdAt >= actionTtlMs()) actionContexts.delete(token)
  }
}

function montarBotaoAtendimentoRealizado(negocioId, numeroCaso, options = {}) {
  const adminId = normalizeAdminId(options.adminId)
  const customerPhone = normalizePhone(options.customerPhone)
  if (!isPostHumanComplementationEnabled() || !negocioId || !numeroCaso || !adminId || !options.contatoId ||
      options.customerPhoneConfirmed !== true || customerPhone.length < 12 || customerPhone === normalizePhone(options.adminId)) return null
  const rawAllowlist = options.allowedCases ? options.allowedCases.join(",") : configuredPilotCases()
  if (!isPilotCaseAllowed(numeroCaso, rawAllowlist)) return null
  pruneActionContexts()
  if (actionContexts.size >= actionMaxContexts()) return null
  const token = crypto.randomBytes(18).toString("base64url")
  actionContexts.set(token, {
    negocioId: String(negocioId),
    numeroCaso: normalizeCaseNumber(numeroCaso),
    adminId,
    contatoId: String(options.contatoId),
    customerPhone,
    createdAt: Date.now()
  })
  return { id: `${ACTION_ID}_${token}`, title: "Enviar ao cliente" }
}

function consumeAction(id, from) {
  const match = String(id || "").match(/^admin_post_human_completed_([A-Za-z0-9_-]{24})$/)
  if (!match) return null
  pruneActionContexts()
  const context = actionContexts.get(match[1])
  const adminId = normalizeAdminId(from)
  if (!adminId || !context || context.adminId !== adminId) return null
  actionContexts.delete(match[1])
  return context
}

async function handleAtendimentoRealizadoConfirmation({ from, interactionId, usuario, isAdmin, repository, processCycle }) {
  if (!isPostHumanComplementationEnabled()) return { handled: false, reason: "feature_disabled" }
  if (!isAdmin(from)) return { handled: true, text: "Ação disponível apenas para administrador autorizado." }
  const context = consumeAction(interactionId, from)
  const normalizedUserCase = normalizeCaseNumber(usuario?.numeroCaso)
  if (!context || !isPilotCaseAllowed(normalizedUserCase) ||
      String(usuario?.negocioId) !== context.negocioId || String(usuario?.contatoId || "") !== context.contatoId ||
      normalizedUserCase !== context.numeroCaso) {
    return { handled: true, text: "Não foi possível confirmar o Negócio com segurança." }
  }
  try {
    usuario.telefoneNormalizado = context.customerPhone
    const cycle = await repository.createCycle({
      negocioId: context.negocioId, numeroCaso: context.numeroCaso, contatoId: usuario.contatoId
    })
    if (cycle.alreadyExisted) return { handled: true, existing: true, cycle, text: "Atendimento já havia sido registrado para este ciclo." }
    await processCycle?.(cycle, usuario)
    return { handled: true, existing: false, cycle, text: "Atendimento registrado. A análise do caso foi iniciada." }
  } catch {
    return { handled: true, failed: true, text: "Não foi possível registrar o atendimento com segurança. Nenhuma ação será repetida automaticamente." }
  }
}

module.exports = {
  ACTION_ID, normalizeCaseNumber, getAllowedPilotCases, isPilotCaseAllowed,
  normalizeAdminId,
  configuredPilotCases,
  montarBotaoAtendimentoRealizado, handleAtendimentoRealizadoConfirmation,
  _clearActionContextsForTests: () => actionContexts.clear(),
  _actionContextCountForTests: () => actionContexts.size,
  _pruneActionContextsForTests: pruneActionContexts,
  _resetLegacyAllowlistWarningForTests: () => { legacyAllowlistWarningEmitted = false }
}
