"use strict"

const crypto = require("node:crypto")

async function initializeContractFinance(pool) {
  if (!pool || typeof pool.query !== "function") throw new Error("FINANCE_POOL_MISSING")
  await pool.query(`
    CREATE TABLE IF NOT EXISTS oraculum_contract_finance (
      deal_id VARCHAR(64) PRIMARY KEY,
      contact_id VARCHAR(64),
      case_number VARCHAR(64),
      snapshot JSONB NOT NULL,
      source VARCHAR(32) NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS oraculum_contract_finance_events (
      id UUID PRIMARY KEY,
      deal_id VARCHAR(64) NOT NULL,
      event_type VARCHAR(40) NOT NULL,
      source VARCHAR(32) NOT NULL,
      actor_id VARCHAR(100),
      payload JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `)
  await pool.query("CREATE INDEX IF NOT EXISTS oraculum_contract_finance_events_deal_idx ON oraculum_contract_finance_events(deal_id, created_at DESC)")
}

function createContractFinanceRepository({ pool } = {}) {
  if (!pool || typeof pool.query !== "function") throw new Error("FINANCE_POOL_MISSING")

  async function upsert({ dealId, contactId = null, caseNumber = null, snapshot, source, actorId = null, eventType = "synchronized" }) {
    if (!dealId || !snapshot || !source) throw new Error("FINANCE_UPSERT_INVALID")
    const client = typeof pool.connect === "function" ? await pool.connect() : pool
    try {
      if (client !== pool) await client.query("BEGIN")
      const previous = await client.query("SELECT snapshot FROM oraculum_contract_finance WHERE deal_id=$1", [String(dealId)])
      const changed = JSON.stringify(previous.rows?.[0]?.snapshot || null) !== JSON.stringify(snapshot)
      await client.query(`INSERT INTO oraculum_contract_finance(deal_id,contact_id,case_number,snapshot,source,updated_at)
        VALUES($1,$2,$3,$4::jsonb,$5,CURRENT_TIMESTAMP)
        ON CONFLICT(deal_id) DO UPDATE SET contact_id=EXCLUDED.contact_id,case_number=EXCLUDED.case_number,
          snapshot=EXCLUDED.snapshot,source=EXCLUDED.source,updated_at=CURRENT_TIMESTAMP`,
      [String(dealId), contactId ? String(contactId) : null, caseNumber || null, JSON.stringify(snapshot), source])
      if (changed) {
        await client.query(`INSERT INTO oraculum_contract_finance_events(id,deal_id,event_type,source,actor_id,payload)
          VALUES($1,$2,$3,$4,$5,$6::jsonb)`,
        [crypto.randomUUID(), String(dealId), eventType, source, actorId ? String(actorId) : null, JSON.stringify(snapshot)])
      }
      if (client !== pool) await client.query("COMMIT")
      return { ok: true, changed }
    } catch (error) {
      if (client !== pool) await client.query("ROLLBACK").catch(() => {})
      throw error
    } finally {
      if (client !== pool) client.release()
    }
  }

  async function get(dealId) {
    const result = await pool.query("SELECT deal_id AS \"dealId\",contact_id AS \"contactId\",case_number AS \"caseNumber\",snapshot,source,updated_at AS \"updatedAt\" FROM oraculum_contract_finance WHERE deal_id=$1", [String(dealId)])
    return result.rows?.[0] || null
  }

  async function listDue({ throughDate, limit = 100 } = {}) {
    const result = await pool.query(`SELECT deal_id AS "dealId",contact_id AS "contactId",case_number AS "caseNumber",snapshot,source,updated_at AS "updatedAt"
      FROM oraculum_contract_finance
      WHERE snapshot->>'applies'='true'
        AND snapshot->>'status' NOT IN ('quitado','suspenso','nao_se_aplica','nao_configurado','aguardando_gatilho')
        AND NULLIF(snapshot->>'nextDueDate','')::date <= $1::date
      ORDER BY NULLIF(snapshot->>'nextDueDate','')::date ASC LIMIT $2`, [throughDate, Math.max(1, Math.min(500, Number(limit) || 100))])
    return result.rows || []
  }

  return Object.freeze({ upsert, get, listDue })
}

module.exports = { initializeContractFinance, createContractFinanceRepository }
