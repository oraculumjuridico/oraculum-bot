"use strict"

const crypto = require("node:crypto")

const TABLE = "oraculum_scheduled_jobs"
const KINDS = new Set(["consultation_reminder", "consultation_lifecycle", "reengagement"])
const FINAL_STATUSES = new Set(["sent", "skipped", "cancelled", "failed"])

function fail(code) { throw new Error(code) }
function text(value, max = 200) {
  const normalized = String(value || "").trim()
  if (!normalized || normalized.length > max) fail("SCHEDULER_TEXT_INVALID")
  return normalized
}
function instant(value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) fail("SCHEDULER_DATE_INVALID")
  return date.toISOString()
}
function plainObject(value) {
  return value && Object.getPrototypeOf(value) === Object.prototype
}
function validateJob(job) {
  if (!plainObject(job) || !KINDS.has(job.kind)) fail("SCHEDULER_JOB_INVALID")
  const normalized = {
    kind: job.kind,
    dedupeKey: text(job.dedupeKey, 300),
    scopeType: text(job.scopeType, 64),
    scopeId: text(job.scopeId, 200),
    scheduledFor: instant(job.scheduledFor),
    payload: structuredClone(job.payload || {}),
    maxAttempts: Number.isInteger(job.maxAttempts) && job.maxAttempts > 0 && job.maxAttempts <= 10 ? job.maxAttempts : 5
  }
  if (!plainObject(normalized.payload)) fail("SCHEDULER_PAYLOAD_INVALID")
  return normalized
}

async function initializeInternalScheduler(pool) {
  if (!pool || typeof pool.query !== "function") fail("SCHEDULER_POOL_MISSING")
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${TABLE} (
      id UUID PRIMARY KEY,
      kind VARCHAR(40) NOT NULL,
      dedupe_key VARCHAR(300) NOT NULL UNIQUE,
      scope_type VARCHAR(64) NOT NULL,
      scope_id VARCHAR(200) NOT NULL,
      payload JSONB NOT NULL,
      scheduled_for TIMESTAMPTZ NOT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending','processing','sent','skipped','cancelled','failed')),
      attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
      max_attempts INTEGER NOT NULL DEFAULT 5 CHECK (max_attempts BETWEEN 1 AND 10),
      next_attempt_at TIMESTAMPTZ,
      lease_id UUID,
      lease_expires_at TIMESTAMPTZ,
      last_result JSONB,
      last_error_code VARCHAR(100),
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      completed_at TIMESTAMPTZ
    )
  `)
  await pool.query(`CREATE INDEX IF NOT EXISTS oraculum_scheduled_jobs_due_idx
    ON ${TABLE}(status, scheduled_for, next_attempt_at)`)
  await pool.query(`CREATE INDEX IF NOT EXISTS oraculum_scheduled_jobs_scope_idx
    ON ${TABLE}(scope_type, scope_id, status)`)
}

function createInternalSchedulerRepository({ pool, clock = () => new Date() } = {}) {
  if (!pool || typeof pool.connect !== "function") fail("SCHEDULER_POOL_MISSING")

  async function replaceScope({ scopeType, scopeId, jobs }) {
    const normalizedScopeType = text(scopeType, 64)
    const normalizedScopeId = text(scopeId, 200)
    const normalized = (jobs || []).map(validateJob)
    if (normalized.some(job => job.scopeType !== normalizedScopeType || job.scopeId !== normalizedScopeId)) {
      fail("SCHEDULER_SCOPE_MISMATCH")
    }
    const keep = normalized.map(job => job.dedupeKey)
    const client = await pool.connect()
    try {
      await client.query("BEGIN")
      await client.query(`UPDATE ${TABLE}
        SET status='cancelled', completed_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP,
            last_result=$3::jsonb
        WHERE scope_type=$1 AND scope_id=$2 AND status='pending'
          AND NOT (dedupe_key = ANY($4::text[]))`,
      [normalizedScopeType, normalizedScopeId, JSON.stringify({ reason: "replanned" }), keep])
      for (const job of normalized) {
        await client.query(`INSERT INTO ${TABLE}
          (id,kind,dedupe_key,scope_type,scope_id,payload,scheduled_for,status,max_attempts)
          VALUES($1,$2,$3,$4,$5,$6::jsonb,$7,'pending',$8)
          ON CONFLICT(dedupe_key) DO UPDATE SET
            payload=EXCLUDED.payload,
            scheduled_for=EXCLUDED.scheduled_for,
            max_attempts=EXCLUDED.max_attempts,
            updated_at=CURRENT_TIMESTAMP
          WHERE ${TABLE}.status='pending'`,
        [crypto.randomUUID(), job.kind, job.dedupeKey, job.scopeType, job.scopeId,
          JSON.stringify(job.payload), job.scheduledFor, job.maxAttempts])
      }
      await client.query("COMMIT")
      return { scopeType: normalizedScopeType, scopeId: normalizedScopeId, planned: normalized.length }
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {})
      throw error
    } finally { client.release() }
  }

  async function claimDue(limit = 25, leaseSeconds = 240) {
    const safeLimit = Math.max(1, Math.min(100, Number(limit) || 25))
    const safeLease = Math.max(30, Math.min(900, Number(leaseSeconds) || 240))
    const leaseId = crypto.randomUUID()
    const client = await pool.connect()
    try {
      await client.query("BEGIN")
      const selected = await client.query(`SELECT id FROM ${TABLE}
        WHERE (
          status='pending' AND scheduled_for <= $1
          AND (next_attempt_at IS NULL OR next_attempt_at <= $1)
        ) OR (
          status='processing' AND lease_expires_at <= $1
        )
        ORDER BY scheduled_for, created_at
        FOR UPDATE SKIP LOCKED LIMIT $2`, [clock().toISOString(), safeLimit])
      if (!selected.rows.length) {
        await client.query("COMMIT")
        return []
      }
      const ids = selected.rows.map(row => row.id)
      const claimed = await client.query(`UPDATE ${TABLE}
        SET status='processing', attempts=attempts+1, lease_id=$2,
            lease_expires_at=$1 + ($3 * INTERVAL '1 second'), updated_at=CURRENT_TIMESTAMP
        WHERE id = ANY($4::uuid[])
        RETURNING id,kind,dedupe_key AS "dedupeKey",scope_type AS "scopeType",
          scope_id AS "scopeId",payload,scheduled_for AS "scheduledFor",
          attempts,max_attempts AS "maxAttempts",lease_id AS "leaseId"
      `, [clock().toISOString(), leaseId, safeLease, ids])
      await client.query("COMMIT")
      return claimed.rows
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {})
      throw error
    } finally { client.release() }
  }

  async function complete(job, outcome, result = {}) {
    if (!FINAL_STATUSES.has(outcome) || outcome === "failed") fail("SCHEDULER_OUTCOME_INVALID")
    const response = await pool.query(`UPDATE ${TABLE}
      SET status=$3, last_result=$4::jsonb, completed_at=CURRENT_TIMESTAMP,
          lease_id=NULL, lease_expires_at=NULL, updated_at=CURRENT_TIMESTAMP
      WHERE id=$1 AND lease_id=$2 AND status='processing' RETURNING id`,
    [job.id, job.leaseId, outcome, JSON.stringify(result)])
    if (response.rowCount !== 1) fail("SCHEDULER_LEASE_LOST")
  }

  async function failJob(job, code = "DISPATCH_FAILED", retryable = true) {
    const canRetry = retryable && job.attempts < job.maxAttempts
    const delaySeconds = Math.min(3600, 30 * (2 ** Math.max(0, job.attempts - 1)))
    const response = await pool.query(`UPDATE ${TABLE} SET
      status=$3,
      next_attempt_at=CASE WHEN $3='pending' THEN CURRENT_TIMESTAMP + ($5 * INTERVAL '1 second') ELSE NULL END,
      last_error_code=$4,
      completed_at=CASE WHEN $3='failed' THEN CURRENT_TIMESTAMP ELSE NULL END,
      lease_id=NULL, lease_expires_at=NULL, updated_at=CURRENT_TIMESTAMP
      WHERE id=$1 AND lease_id=$2 AND status='processing' RETURNING id`,
    [job.id, job.leaseId, canRetry ? "pending" : "failed", text(code, 100), delaySeconds])
    if (response.rowCount !== 1) fail("SCHEDULER_LEASE_LOST")
    return { retrying: canRetry }
  }

  async function health() {
    const result = await pool.query(`SELECT status, COUNT(*)::int AS count FROM ${TABLE} GROUP BY status`)
    return Object.fromEntries(result.rows.map(row => [row.status, Number(row.count)]))
  }

  return Object.freeze({ replaceScope, claimDue, complete, failJob, health })
}

module.exports = { TABLE, KINDS, validateJob, initializeInternalScheduler, createInternalSchedulerRepository }
