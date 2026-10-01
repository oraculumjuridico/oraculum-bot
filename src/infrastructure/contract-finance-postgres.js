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
  await pool.query(`
    CREATE TABLE IF NOT EXISTS oraculum_contract_finance_payments (
      payment_id VARCHAR(100) PRIMARY KEY,
      deal_id VARCHAR(64) NOT NULL,
      amount_cents BIGINT NOT NULL,
      paid_at DATE NOT NULL,
      status VARCHAR(40) NOT NULL,
      source VARCHAR(32) NOT NULL,
      target_snapshot JSONB,
      processing_state VARCHAR(20) NOT NULL DEFAULT 'pending',
      processed_at TIMESTAMPTZ
    )
  `)
  await pool.query("ALTER TABLE oraculum_contract_finance_payments ADD COLUMN IF NOT EXISTS target_snapshot JSONB")
  await pool.query("ALTER TABLE oraculum_contract_finance_payments ADD COLUMN IF NOT EXISTS processing_state VARCHAR(20) NOT NULL DEFAULT 'pending'")
  await pool.query("ALTER TABLE oraculum_contract_finance_payments ALTER COLUMN processed_at DROP NOT NULL")
  await pool.query("CREATE INDEX IF NOT EXISTS oraculum_contract_finance_payments_deal_idx ON oraculum_contract_finance_payments(deal_id, paid_at DESC)")
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

  async function listConfigured({ limit = 100 } = {}) {
    const result = await pool.query(`SELECT deal_id AS "dealId",contact_id AS "contactId",case_number AS "caseNumber",snapshot,source,updated_at AS "updatedAt"
      FROM oraculum_contract_finance
      WHERE snapshot->>'applies'='true'
        AND snapshot->>'status' NOT IN ('quitado','nao_se_aplica','nao_configurado')
      ORDER BY updated_at ASC LIMIT $1`, [Math.max(1, Math.min(500, Number(limit) || 100))])
    return result.rows || []
  }

  async function getPayment(paymentId) {
    const result = await pool.query(`SELECT payment_id AS "paymentId",deal_id AS "dealId",amount_cents AS "amountCents",
      paid_at AS "paidAt",status,source,target_snapshot AS "targetSnapshot",processing_state AS "processingState",processed_at AS "processedAt"
      FROM oraculum_contract_finance_payments WHERE payment_id=$1`, [String(paymentId)])
    return result.rows?.[0] || null
  }

  async function preparePayment({ paymentId, dealId, amountCents, paidAt, status, source = "hubspot_native", targetSnapshot }) {
    await pool.query(`INSERT INTO oraculum_contract_finance_payments(payment_id,deal_id,amount_cents,paid_at,status,source,target_snapshot,processing_state)
      VALUES($1,$2,$3,$4::date,$5,$6,$7::jsonb,'pending') ON CONFLICT(payment_id) DO NOTHING`,
    [String(paymentId), String(dealId), Number(amountCents), paidAt, String(status || "paid"), source, JSON.stringify(targetSnapshot)])
    return getPayment(paymentId)
  }

  async function completePayment(paymentId) {
    const result = await pool.query(`UPDATE oraculum_contract_finance_payments
      SET processing_state='applied',processed_at=CURRENT_TIMESTAMP WHERE payment_id=$1 AND processing_state<>'applied'`, [String(paymentId)])
    return { ok: true, changed: Boolean(result.rowCount) }
  }

  return Object.freeze({ upsert, get, listDue, listConfigured, getPayment, preparePayment, completePayment })
}

module.exports = { initializeContractFinance, createContractFinanceRepository }
