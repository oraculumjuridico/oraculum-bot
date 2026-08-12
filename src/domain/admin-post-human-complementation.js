"use strict"

const crypto = require("node:crypto")
const path = require("node:path")
const { isPostHumanComplementationEnabled } = require("./post-human-feature-flag")
const { PostHumanActionContextRepository } = require("./post-human-action-context-repository")

const ACTION_ID = "admin_post_human_completed"
const DEFAULT_PRODUCTION_PILOT_CASES = "PRV.260801.813"
const actionContexts = new Map()
function actionTtlMs() { return Math.max(1000, Number(process.env.POST_HUMAN_ACTION_TTL_MS || 15 * 60 * 1000)) }
function actionMaxContexts() { return Math.max(1, Math.min(10000, Number(process.env.POST_HUMAN_ACTION_MAX_CONTEXTS || 500))) }
function normalizeAdminId(value) { return String(value || "").normalize("NFKC").trim().replace(/[^\p{L}\p{N}@._+-]/gu, "").toUpperCase() }
function normalizeCaseNumber(value) { return String(value || "").normalize("NFKC").trim().toUpperCase().replace(/\s+/g, "") }
function normalizePhone(value) { return String(value || "").replace(/\D/g, "") }

let legacyAllowlistWarningEmitted = false
let defaultRepository = null
const pendingCreates = new Map()
function configuredPilotCases() {
  const canonical = String(process.env.POST_HUMAN_PILOT_CASES || "").trim()
  if (canonical) return canonical
  const legacy = String(process.env.POST_HUMAN_COMPLEMENTATION_ALLOWLIST || "").trim()
  if (legacy && !legacyAllowlistWarningEmitted) { legacyAllowlistWarningEmitted = true; console.warn("[POST_HUMAN] alias legado de allowlist em uso; configure POST_HUMAN_PILOT_CASES") }
  if (legacy) return legacy
  return String(process.env.NODE_ENV || "").trim().toLowerCase() === "production"
    ? DEFAULT_PRODUCTION_PILOT_CASES
    : ""
}
function getAllowedPilotCases(raw = configuredPilotCases()) {
  const source = String(raw ?? "").trim(); if (!source) return new Set()
  const values = source.split(",").map(normalizeCaseNumber)
  return !values.length || values.some(value => !value || value === "*" || !/^[A-Z0-9._/-]{1,80}$/.test(value)) ? new Set() : new Set(values)
}
function isPilotCaseAllowed(numeroCaso, raw) { const normalized = normalizeCaseNumber(numeroCaso); return Boolean(normalized && getAllowedPilotCases(raw).has(normalized)) }
function repositoryFor(options) {
  if (options?.actionContextRepository) return options.actionContextRepository
  if (!defaultRepository) defaultRepository = new PostHumanActionContextRepository({ file: path.join(process.cwd(), "data", "post-human-action-contexts.json") })
  return defaultRepository
}
function pruneActionContexts(now = Date.now()) {
  for (const [token, context] of actionContexts) {
    if (Number(context.expiresAt) <= now) actionContexts.delete(token)
  }
}
function safeLog(logger, status, reason, startedAt) {
  try { logger?.({ event: "post_human.action_confirmation", status, failureCode: reason, operation: "admin_post_human_completed", durationMs: Date.now() - startedAt }) } catch {}
}
function tokenFromInteraction(id) { return String(id || "").match(/^admin_post_human_completed_([A-Za-z0-9_-]{24})$/)?.[1] || null }
async function waitForActionContextButton(button) {
  const token = tokenFromInteraction(button?.id)
  if (token && pendingCreates.has(token)) await pendingCreates.get(token)
  return button || null
}

function montarBotaoAtendimentoRealizado(negocioId, numeroCaso, options = {}) {
  const adminId = normalizeAdminId(options.adminId); const customerPhone = normalizePhone(options.customerPhone)
  if (!isPostHumanComplementationEnabled() || !negocioId || !numeroCaso || !adminId || !options.contatoId || options.customerPhoneConfirmed !== true || customerPhone.length < 12 || customerPhone === normalizePhone(options.adminId)) return null
  const rawAllowlist = options.allowedCases ? options.allowedCases.join(",") : configuredPilotCases()
  if (!isPilotCaseAllowed(numeroCaso, rawAllowlist)) return null
  pruneActionContexts()
  if (actionContexts.size >= actionMaxContexts()) return null
  const contextRepository = repositoryFor(options)
  const createdAt = contextRepository.clock ? contextRepository.clock() : Date.now(); const token = crypto.randomBytes(18).toString("base64url")
  const button = { id: `${ACTION_ID}_${token}`, title: "✅ Atendimento realizado" }
  const context = { token, negocioId: String(negocioId), numeroCaso: normalizeCaseNumber(numeroCaso), adminId, contatoId: String(options.contatoId), customerPhone, createdAt, expiresAt: createdAt + actionTtlMs(), consumedAt: null }
  // This Map is only a UI/cache compatibility guard. PostgreSQL (or the
  // durable local test backend) remains the authoritative source of context.
  actionContexts.set(token, context)
  const pending = contextRepository.create(context).catch(error => {
    actionContexts.delete(token)
    throw error
  })
  pendingCreates.set(token, pending.finally(() => pendingCreates.delete(token)))
  return button
}

async function handleAtendimentoRealizadoConfirmation({ from, interactionId, usuario, isAdmin, repository, actionContextRepository, confirmHubspotContext, processCycle, logger }) {
  const startedAt = Date.now()
  if (!isPostHumanComplementationEnabled()) return { handled: false, reason: "feature_disabled" }
  if (!isAdmin(from)) return { handled: true, text: "Ação disponível apenas para administrador autorizado." }
  const token = tokenFromInteraction(interactionId)
  let inspected
  try {
    if (token && pendingCreates.has(token)) await pendingCreates.get(token)
    inspected = token ? await repositoryFor({ actionContextRepository }).inspect(token, normalizeAdminId(from)) : { ok: false, reason: "context_missing" }
  } catch {
    inspected = { ok: false, reason: "context_error" }
  }
  if (!inspected.ok) { safeLog(logger, "rejected", inspected.reason, startedAt); return { handled: true, reason: inspected.reason, text: "Não foi possível confirmar o Negócio com segurança." } }
  const context = inspected.context; const normalizedUserCase = normalizeCaseNumber(usuario?.numeroCaso)
  let reason = null
  if (!isPilotCaseAllowed(context.numeroCaso)) reason = "case_not_allowed"
  else if (String(usuario?.negocioId) !== context.negocioId) reason = "deal_context_mismatch"
  else if (String(usuario?.contatoId || "") !== context.contatoId) reason = "contact_context_mismatch"
  else if (normalizedUserCase !== context.numeroCaso) reason = "case_context_mismatch"
  if (reason) { safeLog(logger, "rejected", reason, startedAt); return { handled: true, reason, text: "Não foi possível confirmar o Negócio com segurança." } }
  let hubspot
  // The server always supplies the live HubSpot reader.  Keeping a no-op
  // default preserves isolated legacy domain tests; it is never wired in the
  // production click route.
  try { hubspot = await (confirmHubspotContext || (async () => ({ ok: true })))(context) } catch { hubspot = { ok: false, reason: "hubspot_error" } }
  if (!hubspot?.ok) { reason = hubspot?.reason || "hubspot_invalid_response"; safeLog(logger, "rejected", reason, startedAt); return { handled: true, reason, text: "Não foi possível confirmar o Negócio com segurança." } }
  let persisted
  try {
    const contextRepository = repositoryFor({ actionContextRepository })
    persisted = await contextRepository.withTransaction(async transaction => {
      const consumed = await contextRepository.consume(token, normalizeAdminId(from), context, { transaction })
      if (!consumed.ok) return { consumed, cycle: null }
      const cycle = await repository.createCycle(
        { negocioId: context.negocioId, numeroCaso: context.numeroCaso, contatoId: context.contatoId },
        { transaction }
      )
      return { consumed, cycle }
    })
  } catch (error) {
    const failureReason = error?.code === "post_human_local_compensation_conflict" ? "cycle_compensation_conflict_preserved" : "cycle_create_failed_rolled_back"
    safeLog(logger, "error", failureReason, startedAt)
    return { handled: true, failed: true, reason: failureReason, text: "Não foi possível registrar o atendimento com segurança. Nenhuma ação será repetida automaticamente." }
  }
  if (!persisted.consumed.ok) { safeLog(logger, "rejected", persisted.consumed.reason, startedAt); return { handled: true, reason: persisted.consumed.reason, text: "Não foi possível confirmar o Negócio com segurança." } }
  if (token) actionContexts.delete(token)
  try {
    usuario.telefoneNormalizado = context.customerPhone
    const cycle = persisted.cycle
    safeLog(logger, "accepted", "ok", startedAt)
    if (cycle.alreadyExisted) return { handled: true, existing: true, cycle, text: "Atendimento já havia sido registrado para este ciclo." }
    const processed = await processCycle?.(cycle, usuario)
    if (processed?.skipped) return { handled: true, existing: false, cycle, skipped: true, text: "Nova mensagem do cliente surgiu durante a análise. O envio foi cancelado e o caso precisa ser revisado." }
    const processedCycle = processed?.cycle || processed
    if (processedCycle?.status === "completed") return { handled: true, existing: false, cycle: processedCycle, text: "Atendimento humano registrado. Não há complementação pendente para este caso." }
    return { handled: true, existing: false, cycle, text: "Atendimento humano registrado. A verificação de pendências foi iniciada." }
  } catch { safeLog(logger, "error", "cycle_creation_error", startedAt); return { handled: true, failed: true, text: "Não foi possível registrar o atendimento com segurança. Nenhuma ação será repetida automaticamente." } }
}

module.exports = { ACTION_ID, normalizeCaseNumber, getAllowedPilotCases, isPilotCaseAllowed, normalizeAdminId, configuredPilotCases, montarBotaoAtendimentoRealizado, waitForActionContextButton, handleAtendimentoRealizadoConfirmation,
  _clearActionContextsForTests: () => { actionContexts.clear() },
  _actionContextCountForTests: () => actionContexts.size, _pruneActionContextsForTests: pruneActionContexts, _resetLegacyAllowlistWarningForTests: () => { legacyAllowlistWarningEmitted = false } }
