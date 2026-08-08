"use strict"

const fs = require("node:fs")
const path = require("node:path")

function normalizeRow(row) {
  if (!row) return null
  return {
    token: String(row.token), adminId: String(row.admin_id ?? row.adminId), negocioId: String(row.negocio_id ?? row.negocioId),
    contatoId: String(row.contato_id ?? row.contatoId), numeroCaso: String(row.numero_caso ?? row.numeroCaso),
    customerPhone: String(row.customer_phone ?? row.customerPhone), createdAt: new Date(row.created_at ?? row.createdAt).getTime(),
    expiresAt: new Date(row.expires_at ?? row.expiresAt).getTime(), consumedAt: row.consumed_at ?? row.consumedAt ?? null
  }
}

class PostHumanActionContextRepository {
  constructor({ file, pool = null, clock = Date.now, mode } = {}) {
    this.file = path.resolve(file || path.join(process.cwd(), "data", "post-human-action-contexts.json"))
    this.pool = pool; this.clock = clock
    this.mode = mode || (pool ? "postgres" : (process.env.NODE_ENV === "production" ? "postgres" : "local"))
    this.queue = Promise.resolve()
  }
  async initialize() {
    if (this.mode === "postgres") {
      if (!this.pool) throw new Error("post_human_postgres_required")
      await this.pool.query("SELECT 1 FROM post_human_action_contexts LIMIT 1")
      return { mode: "postgres" }
    }
    await fs.promises.mkdir(path.dirname(this.file), { recursive: true })
    try { await fs.promises.access(this.file) } catch { await this._write({ contexts: [] }) }
    return { mode: "local" }
  }
  async _read() { await this.initialize(); return JSON.parse(await fs.promises.readFile(this.file, "utf8")) }
  async _write(data) {
    await fs.promises.mkdir(path.dirname(this.file), { recursive: true })
    const temporary = `${this.file}.${process.pid}.${Date.now()}.tmp`
    await fs.promises.writeFile(temporary, JSON.stringify(data), { encoding: "utf8", mode: 0o600 })
    await fs.promises.rename(temporary, this.file)
  }
  _serialized(operation) { const result = this.queue.then(operation); this.queue = result.catch(() => {}); return result }
  async withTransaction(operation) {
    if (typeof operation !== "function") throw new Error("post_human_transaction_operation_required")
    await this.initialize()
    if (this.mode === "postgres") {
      if (typeof this.pool.connect !== "function") throw new Error("post_human_transaction_client_required")
      const client = await this.pool.connect()
      try {
        await client.query("BEGIN")
        const result = await operation({ mode: "postgres", client })
        await client.query("COMMIT")
        return result
      } catch (error) {
        await client.query("ROLLBACK").catch(() => {})
        throw error
      } finally {
        client.release()
      }
    }
    return this._serialized(async () => {
      const transaction = { mode: "local", stores: new Map(), compensations: [] }
      try {
        const result = await operation(transaction)
        const stores = [...transaction.stores.values()].sort((left, right) => left.commitOrder - right.commitOrder)
        for (const store of stores) await store.write(store.data)
        return result
      } catch (error) {
        let compensationFailed = false
        for (const compensate of transaction.compensations.reverse()) {
          try {
            const compensation = await compensate()
            if (!compensation?.ok) compensationFailed = true
          } catch {
            compensationFailed = true
          }
        }
        if (compensationFailed) {
          const conflict = new Error("post_human_local_compensation_conflict")
          conflict.code = "post_human_local_compensation_conflict"
          conflict.cause = error
          throw conflict
        }
        throw error
      }
    })
  }
  async _localTransactionStore(transaction) {
    const key = `action-context:${this.file}`
    if (!transaction.stores.has(key)) {
      const original = await this._read()
      transaction.stores.set(key, {
        commitOrder: 20,
        data: structuredClone(original),
        write: data => this._write(data)
      })
    }
    return transaction.stores.get(key)
  }
  async create(context) {
    await this.initialize()
    if (this.mode === "postgres") {
      await this.pool.query(
        `INSERT INTO post_human_action_contexts
          (token,admin_id,negocio_id,contato_id,numero_caso,customer_phone,created_at,expires_at)
         VALUES($1,$2,$3,$4,$5,$6,to_timestamp($7 / 1000.0),to_timestamp($8 / 1000.0))`,
        [context.token, context.adminId, context.negocioId, context.contatoId, context.numeroCaso, context.customerPhone, context.createdAt, context.expiresAt]
      )
      return context
    }
    return this._serialized(async () => { const db = await this._read(); db.contexts.push(context); await this._write(db); return context })
  }
  _inspectContext(context, adminId, now) {
    if (!context) return { ok: false, reason: "context_missing" }
    if (context.adminId !== adminId) return { ok: false, reason: "admin_mismatch" }
    if (context.consumedAt) return { ok: false, reason: "context_already_consumed" }
    if (Number(context.expiresAt) <= now) return { ok: false, reason: "context_expired" }
    return { ok: true, context: normalizeRow(context) }
  }
  async inspect(token, adminId) {
    await this.initialize()
    if (this.mode === "postgres") {
      const current = await this.pool.query("SELECT *, CURRENT_TIMESTAMP AS current_time FROM post_human_action_contexts WHERE token=$1", [token])
      const context = normalizeRow(current.rows[0])
      const now = current.rows[0]?.current_time ? new Date(current.rows[0].current_time).getTime() : this.clock()
      return this._inspectContext(context, adminId, now)
    }
    const now = this.clock()
    return this._serialized(async () => {
      const db = await this._read(); const context = db.contexts.find(item => item.token === token)
      return this._inspectContext(context, adminId, now)
    })
  }
  async consume(token, adminId, expectedContext = null, { transaction = null } = {}) {
    if (transaction?.mode === "local") {
      const now = this.clock()
      const store = await this._localTransactionStore(transaction)
      const context = store.data.contexts.find(item => item.token === token)
      const inspected = this._inspectContext(context, adminId, now)
      if (!inspected.ok) return inspected
      if (expectedContext && (context.negocioId !== expectedContext.negocioId || context.contatoId !== expectedContext.contatoId || context.numeroCaso !== expectedContext.numeroCaso)) return { ok: false, reason: "context_changed" }
      context.consumedAt = new Date(now).toISOString()
      return { ok: true, context: normalizeRow(context) }
    }
    await this.initialize()
    const now = this.clock()
    if (this.mode === "postgres") {
      // The state transition is one conditional statement, so concurrent
      // callbacks can never both receive an actionable context.
      const expectedWhere = expectedContext ? " AND negocio_id=$3 AND contato_id=$4 AND numero_caso=$5" : ""
      const parameters = expectedContext
        ? [token, adminId, expectedContext.negocioId, expectedContext.contatoId, expectedContext.numeroCaso]
        : [token, adminId]
      const queryable = transaction?.client || this.pool
      const consumed = await queryable.query(
        `UPDATE post_human_action_contexts SET consumed_at=CURRENT_TIMESTAMP
          WHERE token=$1 AND admin_id=$2${expectedWhere} AND consumed_at IS NULL AND expires_at > CURRENT_TIMESTAMP RETURNING *`, parameters
      )
      if (consumed.rows[0]) return { ok: true, context: normalizeRow(consumed.rows[0]) }
      const current = await queryable.query("SELECT *, CURRENT_TIMESTAMP AS current_time FROM post_human_action_contexts WHERE token=$1", [token])
      const refreshed = normalizeRow(current.rows[0])
      const currentTime = current.rows[0]?.current_time ? new Date(current.rows[0].current_time).getTime() : now
      const inspected = this._inspectContext(refreshed, adminId, currentTime)
      if (!inspected.ok) return inspected
      if (expectedContext && (refreshed.negocioId !== expectedContext.negocioId || refreshed.contatoId !== expectedContext.contatoId || refreshed.numeroCaso !== expectedContext.numeroCaso)) return { ok: false, reason: "context_changed" }
      return { ok: false, reason: "context_expired" }
    }
    return this._serialized(async () => {
      const db = await this._read(); const context = db.contexts.find(item => item.token === token)
      const inspected = this._inspectContext(context, adminId, now)
      if (!inspected.ok) return inspected
      if (expectedContext && (context.negocioId !== expectedContext.negocioId || context.contatoId !== expectedContext.contatoId || context.numeroCaso !== expectedContext.numeroCaso)) return { ok: false, reason: "context_changed" }
      context.consumedAt = new Date(now).toISOString(); await this._write(db)
      return { ok: true, context: normalizeRow(context) }
    })
  }
}

module.exports = { PostHumanActionContextRepository, normalizeActionContextRow: normalizeRow }
