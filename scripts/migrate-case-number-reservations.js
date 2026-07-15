#!/usr/bin/env node
"use strict"

require("dotenv").config({ quiet: true })
const { Pool } = require("pg")
const {
  migrateCaseNumberReservations,
  reconcileCaseNumberReservations,
  planCaseNumberReservationReconciliation,
  validateCaseNumberReservationSchema
} = require("../src/infrastructure/case-number-reservations-postgres")

function parseMode(argv) {
  const flags = argv.filter(arg => arg === "--verify" || arg === "--reconcile")
  if (flags.length > 1 || argv.some(arg => !flags.includes(arg))) throw new Error("INVALID_MIGRATION_MODE")
  return flags[0] === "--verify" ? "verify" : flags[0] === "--reconcile" ? "reconcile" : "install"
}

async function readOnlyVerification(pool) {
  const client = await pool.connect()
  try {
    await client.query("BEGIN")
    await client.query("SET TRANSACTION READ ONLY")
    const schema = await validateCaseNumberReservationSchema(client)
    await client.query("ROLLBACK")
    return { ok: schema.ok, mode: "verify", schema }
  } catch (error) { await client.query("ROLLBACK").catch(() => {}); throw error } finally { client.release() }
}

async function main({ argv = process.argv.slice(2), env = process.env, PoolClass = Pool, output = console.log, operations = {} } = {}) {
  if (String(env.CASE_NUMBER_RESERVATION_MODE || "").toLowerCase() !== "postgres") throw new Error("POSTGRES_MODE_REQUIRED")
  const connectionString = env.EXTERNAL_STATE_DATABASE_URL || env.DATABASE_URL
  if (!connectionString) throw new Error("POSTGRES_CONNECTION_REQUIRED")
  const mode = parseMode(argv)
  const pool = new PoolClass({ connectionString })
  try {
    if (mode === "verify") {
      const result = await (operations.verify || readOnlyVerification)(pool)
      output(JSON.stringify({ ok: result.ok, mode, codes: result.schema.codes }))
      return result
    }
    if (mode === "reconcile") {
      const client = await pool.connect()
      let plan
      try { plan = await planCaseNumberReservationReconciliation(client) } finally { client.release() }
      output(JSON.stringify({ ok: plan.ok, mode: "reconcile-plan", classification: plan.classification, codes: plan.codes, additions: plan.additions.length }))
      if (!plan.ok) throw new Error("RECONCILIATION_PLAN_BLOCKED")
      const result = await (operations.reconcile || reconcileCaseNumberReservations)(pool)
      output(JSON.stringify({ ok: true, mode, migrationId: result.migrationId, applied: result.applied, schemaValid: result.schema.ok }))
      return result
    }
    const result = await (operations.install || migrateCaseNumberReservations)(pool)
    output(JSON.stringify({ ok: true, mode, migrationId: result.migrationId, applied: result.applied, schemaValid: result.schema.ok }))
    return result
  } finally { await pool.end() }
}

if (require.main === module) main().catch(() => { console.error(JSON.stringify({ ok: false, error: "CASE_NUMBER_MIGRATION_FAILED" })); process.exitCode = 1 })
module.exports = { main, parseMode, readOnlyVerification }
