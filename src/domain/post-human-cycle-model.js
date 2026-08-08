"use strict"

const fs = require("node:fs")
const path = require("node:path")
const crypto = require("node:crypto")
const { isDeepStrictEqual } = require("node:util")
const { sanitizeError } = require("./post-human-safe-log")

const ACTIVE = new Set(["pending", "analyzing", "ready_to_send", "sending", "message_sent", "awaiting_response", "human_review_required", "failed_transient"])
const TERMINAL = new Set(["completed", "failed_terminal", "cancelled"])
const RECOVERABLE = new Set(["pending", "analyzing", "ready_to_send", "awaiting_response", "human_review_required", "failed_transient"])
const TRANSITIONS = {
  pending: ["analyzing", "cancelled", "failed_transient", "failed_terminal"],
  analyzing: ["analyzing", "ready_to_send", "human_review_required", "completed", "failed_transient", "failed_terminal"],
  ready_to_send: ["sending", "analyzing", "cancelled", "failed_transient", "failed_terminal"],
  sending: ["message_sent", "failed_transient", "failed_terminal"],
  message_sent: ["awaiting_response", "completed", "failed_transient", "failed_terminal"],
  awaiting_response: ["awaiting_response", "analyzing", "human_review_required", "completed", "cancelled", "failed_transient", "failed_terminal"],
  human_review_required: ["analyzing", "cancelled", "completed"],
  failed_transient: ["analyzing", "cancelled", "failed_terminal"],
  failed_terminal: [], completed: [], cancelled: []
}

function nowIso(clock) { return new Date(clock ? clock() : Date.now()).toISOString() }
function normalizeRow(row) {
  if (!row) return null
  return {
    cycleId: row.cycle_id || row.cycleId,
    negocioId: row.negocio_id || row.negocioId,
    numeroCaso: row.numero_caso || row.numeroCaso,
    contatoId: row.contato_id || row.contatoId || null,
    sequencia: Number(row.sequencia),
    status: row.status,
    timestamps: row.timestamps || {
      createdAt: row.created_at?.toISOString?.() || row.created_at,
      updatedAt: row.updated_at?.toISOString?.() || row.updated_at
    },
    estadoDocumental: row.estado_documental ?? row.estadoDocumental ?? null,
    sendAttemptId: row.send_attempt_id ?? row.sendAttemptId ?? null,
    providerMessageId: row.provider_message_id ?? row.providerMessageId ?? null,
    resultadoEnvio: row.resultado_envio ?? row.resultadoEnvio ?? null,
    erro: row.erro || null,
    payload: row.payload || {},
    version: Number(row.version ?? 0),
    alreadyExisted: Boolean(row.already_existed ?? row.alreadyExisted)
  }
}

class PostHumanCycleRepository {
  constructor({ file, pool = null, clock = Date.now, mode } = {}) {
    this.file = path.resolve(file || path.join(process.cwd(), "data", "post-human-cycles.json"))
    this.pool = pool
    this.clock = clock
    this.mode = mode || (pool ? "postgres" : (process.env.NODE_ENV === "production" ? "postgres" : "local"))
    this.queue = Promise.resolve()
  }
  setPool(pool) { this.pool = pool; this.mode = "postgres"; return this }
  async initialize() {
    if (this.mode === "postgres") {
      if (!this.pool) throw new Error("post_human_postgres_required")
      await this.pool.query("SELECT 1 FROM post_human_cycles LIMIT 1")
      return { mode: "postgres" }
    }
    await fs.promises.mkdir(path.dirname(this.file), { recursive: true })
    try { await fs.promises.access(this.file) } catch { await this._atomicWrite({ version: 1, cycles: [] }) }
    return { mode: "local" }
  }
  async _read() { await this.initialize(); return JSON.parse(await fs.promises.readFile(this.file, "utf8")) }
  async _atomicWrite(data) {
    await fs.promises.mkdir(path.dirname(this.file), { recursive: true })
    const temporary = `${this.file}.${process.pid}.${Date.now()}.${crypto.randomUUID()}.tmp`
    await fs.promises.writeFile(temporary, JSON.stringify(data, null, 2), { encoding: "utf8", mode: 0o600 })
    await fs.promises.rename(temporary, this.file)
  }
  _serialized(operation) { const result = this.queue.then(operation); this.queue = result.catch(() => {}); return result }

  _createLocalCycle(db, { negocioId, numeroCaso, contatoId = null }) {
    const existing = db.cycles.find(c => c.negocioId === String(negocioId) && ACTIVE.has(c.status))
    if (existing) return { ...existing, alreadyExisted: true }
    const sequencia = Math.max(0, ...db.cycles.filter(c => c.negocioId === String(negocioId)).map(c => c.sequencia || 0)) + 1
    const timestamp = nowIso(this.clock)
    const cycle = {
      cycleId: crypto.randomUUID(), negocioId: String(negocioId), numeroCaso: String(numeroCaso),
      contatoId: contatoId ? String(contatoId) : null, sequencia, status: "pending",
      version: 0,
      timestamps: { createdAt: timestamp, updatedAt: timestamp, confirmadoEm: timestamp },
      estadoDocumental: null, sendAttemptId: null, providerMessageId: null,
      resultadoEnvio: null, erro: null, payload: {}
    }
    db.cycles.push(cycle)
    return cycle
  }

  async _compensateCreatedLocalCycle(expectedCycle) {
    return this._serialized(async () => {
      const db = await this._read()
      const index = db.cycles.findIndex(cycle => cycle.cycleId === expectedCycle.cycleId)
      if (index < 0) return { ok: true, removed: false, reason: "already_absent" }
      if (!isDeepStrictEqual(db.cycles[index], expectedCycle)) return { ok: false, removed: false, reason: "cycle_changed" }
      db.cycles.splice(index, 1)
      await this._atomicWrite(db)
      return { ok: true, removed: true }
    })
  }

  async createCycle({ negocioId, numeroCaso, contatoId = null }, { transaction = null } = {}) {
    if (!negocioId || !numeroCaso) throw new Error("negocioId e numeroCaso obrigatorios")
    if (this.mode === "postgres") {
      if (!this.pool) throw new Error("post_human_postgres_required")
      const cycleId = crypto.randomUUID()
      const result = await (transaction?.client || this.pool).query(
        "SELECT * FROM create_post_human_cycle($1::uuid,$2,$3,$4)",
        [cycleId, String(negocioId), String(numeroCaso), contatoId ? String(contatoId) : null]
      )
      if (result.rows[0]?.version === null || result.rows[0]?.version === undefined) {
        throw new Error("post_human_version_missing")
      }
      return normalizeRow(result.rows[0])
    }
    if (transaction?.mode === "local") {
      return this._serialized(async () => {
        const db = await this._read()
        const cycle = this._createLocalCycle(db, { negocioId, numeroCaso, contatoId })
        if (cycle.alreadyExisted) return cycle
        await this._atomicWrite(db)
        const expectedCycle = structuredClone(cycle)
        transaction.compensations.push(() => this._compensateCreatedLocalCycle(expectedCycle))
        return cycle
      })
    }
    return this._serialized(async () => {
      const db = await this._read()
      const cycle = this._createLocalCycle(db, { negocioId, numeroCaso, contatoId })
      if (!cycle.alreadyExisted) await this._atomicWrite(db)
      return cycle
    })
  }
  async getCycle(cycleId) {
    if (this.mode === "postgres") {
      const result = await this.pool.query("SELECT * FROM post_human_cycles WHERE cycle_id=$1::uuid", [cycleId])
      return normalizeRow(result.rows[0])
    }
    return (await this._read()).cycles.find(c => c.cycleId === cycleId) || null
  }
  async getActiveCycles({ negocioId, contatoId } = {}) {
    if (!negocioId && !contatoId) return []
    if (this.mode === "postgres") {
      const result = await this.pool.query(
        `SELECT * FROM post_human_cycles
         WHERE status = ANY($1::text[]) AND ($2::text IS NULL OR negocio_id=$2) AND ($3::text IS NULL OR contato_id=$3)
         ORDER BY created_at DESC`, [[...ACTIVE], negocioId || null, contatoId || null])
      return result.rows.map(normalizeRow)
    }
    return (await this._read()).cycles.filter(c => ACTIVE.has(c.status) &&
      (!negocioId || c.negocioId === String(negocioId)) && (!contatoId || c.contatoId === String(contatoId)))
  }
  async updateStatus(cycleId, status, extras = {}, options = {}) {
    const sanitized = { ...extras, erro: extras.erro ? sanitizeError(extras.erro) : extras.erro }
    if (this.mode === "postgres") {
      const current = await this.getCycle(cycleId)
      if (!current) throw new Error("ciclo nao encontrado")
      if (!TRANSITIONS[current.status]?.includes(status)) throw new Error(`transicao invalida: ${current.status}->${status}`)
      const result = await this.pool.query(
        `UPDATE post_human_cycles SET status=$2, estado_documental=COALESCE($3,estado_documental),
         send_attempt_id=COALESCE($4::uuid,send_attempt_id), provider_message_id=COALESCE($5,provider_message_id),
         resultado_envio=COALESCE($6,resultado_envio), erro=$7,
         payload=payload || $8::jsonb, updated_at=CURRENT_TIMESTAMP, version=version+1
         WHERE cycle_id=$1::uuid AND version=$9 RETURNING *`,
        [cycleId, status, sanitized.estadoDocumental || null, sanitized.sendAttemptId || null,
          sanitized.providerMessageId || null, sanitized.resultadoEnvio || null, sanitized.erro || null,
          JSON.stringify(Object.fromEntries(Object.entries(sanitized).filter(([key]) =>
            !["estadoDocumental", "sendAttemptId", "providerMessageId", "resultadoEnvio", "erro"].includes(key)))),
          Number(options.expectedVersion ?? current.version)]
      )
      if (!result.rows[0]) throw new Error("post_human_concurrency_conflict")
      return normalizeRow(result.rows[0])
    }
    return this._serialized(async () => {
      const db = await this._read(); const cycle = db.cycles.find(c => c.cycleId === cycleId)
      if (!cycle) throw new Error("ciclo nao encontrado")
      if (!TRANSITIONS[cycle.status]?.includes(status)) throw new Error(`transicao invalida: ${cycle.status}->${status}`)
      const expectedVersion = Number(options.expectedVersion ?? cycle.version ?? 0)
      if (Number(cycle.version ?? 0) !== expectedVersion) throw new Error("post_human_concurrency_conflict")
      cycle.status = status; Object.assign(cycle, sanitized)
      cycle.payload = {
        ...(cycle.payload || {}),
        ...Object.fromEntries(Object.entries(sanitized).filter(([key]) =>
          !["estadoDocumental", "sendAttemptId", "providerMessageId", "resultadoEnvio", "erro"].includes(key)))
      }
      cycle.version = expectedVersion + 1
      cycle.timestamps.updatedAt = nowIso(this.clock)
      if (TERMINAL.has(status)) cycle.timestamps[`${status}Em`] = cycle.timestamps.updatedAt
      await this._atomicWrite(db); return cycle
    })
  }
  async _replacePayload(cycleId, payload, expectedVersion) {
    if (this.mode === "postgres") {
      const result = await this.pool.query(
        `UPDATE post_human_cycles SET payload=$2::jsonb, updated_at=CURRENT_TIMESTAMP, version=version+1
         WHERE cycle_id=$1::uuid AND version=$3 RETURNING *`,
        [cycleId, JSON.stringify(payload || {}), Number(expectedVersion)]
      )
      if (!result.rows[0]) throw new Error("post_human_concurrency_conflict")
      return normalizeRow(result.rows[0])
    }
    return this._serialized(async () => {
      const db = await this._read()
      const cycle = db.cycles.find(item => item.cycleId === cycleId)
      if (!cycle) throw new Error("ciclo nao encontrado")
      if (Number(cycle.version || 0) !== Number(expectedVersion)) throw new Error("post_human_concurrency_conflict")
      cycle.payload = structuredClone(payload || {})
      cycle.version = Number(expectedVersion) + 1
      cycle.timestamps.updatedAt = nowIso(this.clock)
      await this._atomicWrite(db)
      return cycle
    })
  }
  async _mutatePayload(cycleId, mutate) {
    for (let attempt = 0; attempt < 3; attempt++) {
      const current = await this.getCycle(cycleId)
      if (!current) throw new Error("ciclo nao encontrado")
      const mutation = mutate(structuredClone(current.payload || {}), current)
      if (mutation.skip) return { cycle: current, ...mutation.result }
      try {
        const cycle = await this._replacePayload(cycleId, mutation.payload, current.version)
        return { cycle, ...mutation.result }
      } catch (error) {
        if (error.message !== "post_human_concurrency_conflict" || attempt === 2) throw error
      }
    }
  }
  async claimDocumentDecision(cycleId, { requirementId, revision, claimId, now, staleMs = 5 * 60 * 1000 } = {}) {
    if (!requirementId || !Number.isInteger(Number(revision)) || Number(revision) < 1) throw new Error("document_claim_invalid")
    const timestamp = now || nowIso(this.clock)
    return this._mutatePayload(cycleId, (payload, cycle) => {
      const claims = { ...(payload.documentDecisionClaims || {}) }
      const existing = claims[requirementId]
      if (Number(existing?.revision || 0) > Number(revision) ||
          (Number(existing?.revision) === Number(revision) && existing?.state === "completed")) {
        return { skip: true, result: { claimed: false, alreadyCompleted: true } }
      }
      if (Number(existing?.revision) === Number(revision) && existing?.state === "claimed") {
        const providerChanged = Boolean(cycle.providerMessageId) && cycle.providerMessageId !== existing.baselineProviderMessageId
        const attemptChanged = Boolean(cycle.sendAttemptId) && cycle.sendAttemptId !== existing.baselineSendAttemptId
        const deliveryMayHaveStarted = ["sending", "message_sent"].includes(cycle.status) ||
          providerChanged || attemptChanged || cycle.resultadoEnvio === "incerto" || TERMINAL.has(cycle.status)
        if (deliveryMayHaveStarted) {
          return { skip: true, result: { claimed: false, requiresFinalization: true } }
        }
      }
      const blockingClaim = Object.values(claims).find(item =>
        ["outbound_uncertain", "failed_after_transport"].includes(item?.state))
      const unsafeCycleStatus = ["sending", "message_sent", "awaiting_response", "failed_terminal"].includes(cycle.status)
      const unsafeSendResult = ["pendente", "incerto", "aceito_pelo_provider", "falha"].includes(cycle.resultadoEnvio)
      if (blockingClaim || unsafeCycleStatus || unsafeSendResult) {
        return {
          skip: true,
          result: {
            claimed: false,
            outboundInProgress: true,
            blockedState: blockingClaim?.state || cycle.status,
            blockedRevision: blockingClaim?.revision || null
          }
        }
      }
      if (Number(existing?.revision) === Number(revision) && existing?.state === "retryable") {
        const safeRetry = cycle.status === "failed_transient" && ["nao_enviado", "rejeitado"].includes(cycle.resultadoEnvio)
        if (!RECOVERABLE.has(cycle.status) || !safeRetry) {
          return { skip: true, result: { claimed: false, inProgress: true, blockedState: "retryable_not_safe" } }
        }
      } else if (existing?.state === "retryable") {
        const safeRetry = cycle.status === "failed_transient" && ["nao_enviado", "rejeitado"].includes(cycle.resultadoEnvio)
        if (!safeRetry) {
          return { skip: true, result: { claimed: false, inProgress: true, blockedState: "retryable_not_safe" } }
        }
      } else if (Number(existing?.revision) === Number(revision) && existing?.state === "claimed") {
        const providerChanged = Boolean(cycle.providerMessageId) && cycle.providerMessageId !== existing.baselineProviderMessageId
        const attemptChanged = Boolean(cycle.sendAttemptId) && cycle.sendAttemptId !== existing.baselineSendAttemptId
        const deliveryMayHaveStarted = ["sending", "message_sent"].includes(cycle.status) ||
          providerChanged || attemptChanged || cycle.resultadoEnvio === "incerto" || TERMINAL.has(cycle.status)
        if (deliveryMayHaveStarted) {
          return { skip: true, result: { claimed: false, requiresFinalization: true } }
        }
        const age = Date.parse(timestamp) - Date.parse(existing.claimedAt || timestamp)
        if (!Number.isFinite(age) || age < staleMs || !RECOVERABLE.has(cycle.status)) {
          return { skip: true, result: { claimed: false, inProgress: true } }
        }
      }
      const id = claimId || crypto.randomUUID()
      claims[requirementId] = {
        revision: Number(revision), state: "claimed", claimId: id, claimedAt: timestamp,
        baselineProviderMessageId: cycle.providerMessageId || null,
        baselineSendAttemptId: cycle.sendAttemptId || null
      }
      return {
        skip: false,
        payload: { ...payload, documentDecisionClaims: claims },
        result: { claimed: true, claimId: id, resumed: Boolean(existing) }
      }
    })
  }
  async completeDocumentDecision(cycleId, { requirementId, revision, claimId, now } = {}) {
    return this._mutatePayload(cycleId, payload => {
      const claims = { ...(payload.documentDecisionClaims || {}) }
      const existing = claims[requirementId]
      if (Number(existing?.revision || 0) > Number(revision) ||
          (Number(existing?.revision) === Number(revision) && existing?.state === "completed")) {
        return { skip: true, result: { completed: false, alreadyCompleted: true } }
      }
      if (claimId && existing?.claimId && existing.claimId !== claimId) {
        return { skip: true, result: { completed: false, claimMismatch: true } }
      }
      claims[requirementId] = {
        ...existing, revision: Number(revision), state: "completed", completedAt: now || nowIso(this.clock)
      }
      return { skip: false, payload: { ...payload, documentDecisionClaims: claims }, result: { completed: true } }
    })
  }
  async setDocumentDecisionClaimOutcome(cycleId, { requirementId, revision, claimId, state, reason, now } = {}) {
    if (!['retryable', 'outbound_uncertain', 'failed_after_transport'].includes(state)) throw new Error("document_claim_outcome_invalid")
    return this._mutatePayload(cycleId, payload => {
      const claims = { ...(payload.documentDecisionClaims || {}) }
      const existing = claims[requirementId]
      if (!existing || Number(existing.revision) !== Number(revision)) {
        return { skip: true, result: { updated: false, claimMissing: true } }
      }
      if (claimId && existing.claimId !== claimId) {
        return { skip: true, result: { updated: false, claimMismatch: true } }
      }
      claims[requirementId] = {
        ...existing,
        state,
        outcomeReason: reason || null,
        outcomeAt: now || nowIso(this.clock)
      }
      return { skip: false, payload: { ...payload, documentDecisionClaims: claims }, result: { updated: true, state } }
    })
  }
  async findActiveByBusiness(negocioId) { return (await this.getActiveCycles({ negocioId }))[0] || null }
  async findActiveByContact({ contatoId }) { return contatoId ? this.getActiveCycles({ contatoId }) : [] }
  async listRecoverable() {
    if (this.mode === "postgres") {
      const result = await this.pool.query("SELECT * FROM post_human_cycles WHERE status = ANY($1::text[]) ORDER BY created_at", [[...RECOVERABLE]])
      return result.rows.map(normalizeRow)
    }
    return (await this._read()).cycles.filter(c => RECOVERABLE.has(c.status))
  }
}

module.exports = { PostHumanCycleRepository, ACTIVE, TERMINAL, RECOVERABLE, TRANSITIONS, normalizeRow }
