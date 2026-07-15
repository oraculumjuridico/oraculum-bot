#!/usr/bin/env node
"use strict"

require("dotenv").config({ quiet: true })
const { Pool } = require("pg")
const { migrateCaseNumberReservations } = require("../src/infrastructure/case-number-reservations-postgres")

async function main({ env = process.env, PoolClass = Pool, output = console.log } = {}) {
  if (String(env.CASE_NUMBER_RESERVATION_MODE || "").toLowerCase() !== "postgres") throw new Error("POSTGRES_MODE_REQUIRED")
  const connectionString = env.EXTERNAL_STATE_DATABASE_URL || env.DATABASE_URL
  if (!connectionString) throw new Error("POSTGRES_CONNECTION_REQUIRED")
  const pool = new PoolClass({ connectionString })
  try {
    const result = await migrateCaseNumberReservations(pool)
    output(JSON.stringify({ ok: true, migrationId: result.migrationId, applied: result.applied, schemaValid: result.schema.ok }))
    return result
  } finally { await pool.end() }
}

if (require.main === module) main().catch(() => { console.error(JSON.stringify({ ok: false, error: "CASE_NUMBER_MIGRATION_FAILED" })); process.exitCode = 1 })
module.exports = { main }
