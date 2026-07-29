"use strict"

class PostHumanPostgresMock {
  constructor(onCall = null) { this.rows = []; this.calls = []; this.queue = Promise.resolve(); this.onCall = onCall }
  async query(sql, params = []) {
    this.calls.push({ sql, params }); this.onCall?.(sql, params)
    if (/SELECT 1 FROM post_human_cycles/.test(sql)) return { rows: [{ "?column?": 1 }] }
    if (/create_post_human_cycle/.test(sql)) {
      return this.queue = this.queue.then(() => {
        const existing = this.rows.find(row => row.negocio_id === params[1] && !["completed", "cancelled", "failed_terminal"].includes(row.status))
        if (existing) return { rows: [{ ...existing, already_existed: true }] }
        const row = {
          cycle_id: params[0], negocio_id: params[1], numero_caso: params[2], contato_id: params[3],
          sequencia: Math.max(0, ...this.rows.filter(item => item.negocio_id === params[1]).map(item => item.sequencia)) + 1,
          status: "pending", payload: {}, version: 0, created_at: new Date(), updated_at: new Date(), already_existed: false
        }
        this.rows.push(row); return { rows: [row] }
      })
    }
    if (/WHERE cycle_id=\$1/.test(sql) && /^SELECT/.test(sql.trim())) return { rows: this.rows.filter(row => row.cycle_id === params[0]) }
    if (/UPDATE post_human_cycles/.test(sql)) {
      const row = this.rows.find(item => item.cycle_id === params[0])
      if (!row || row.version !== params[8]) return { rows: [] }
      row.status = params[1]; row.estado_documental = params[2] || row.estado_documental
      row.send_attempt_id = params[3] || row.send_attempt_id; row.provider_message_id = params[4] || row.provider_message_id
      row.resultado_envio = params[5] || row.resultado_envio; row.erro = params[6]
      row.payload = { ...row.payload, ...JSON.parse(params[7]) }; row.updated_at = new Date(); row.version++
      return { rows: [row] }
    }
    if (/status = ANY/.test(sql)) {
      const statuses = params[0]
      return { rows: this.rows.filter(row => statuses.includes(row.status) &&
        (!params[1] || row.negocio_id === params[1]) && (!params[2] || row.contato_id === params[2])) }
    }
    throw new Error(`SQL nao suportado no mock: ${sql}`)
  }
}

module.exports = { PostHumanPostgresMock }
