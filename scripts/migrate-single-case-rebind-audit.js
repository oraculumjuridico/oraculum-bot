#!/usr/bin/env node
"use strict"

require("dotenv").config({ quiet: true })
const { Pool } = require("pg")
const {
  migrateSingleCaseRebindAudit,
  validateSingleCaseRebindAuditSchema
} = require("../src/infrastructure/single-case-rebind-postgres")

function parseMode(argv) {
  if (argv.length === 0) return "install"
  if (argv.length === 1 && argv[0] === "--verify") return "verify"
  throw new Error("INVALID_MIGRATION_MODE")
}

async function readOnlyVerification(pool) {
  const client = await pool.connect()
  try {
    await client.query("BEGIN")
    await client.query("SET TRANSACTION READ ONLY")
    const schema = await validateSingleCaseRebindAuditSchema(client)
    await client.query("ROLLBACK")
    return { ok: schema.ok, mode: "verify", schema }
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {})
    throw error
  } finally {
    client.release()
  }
}

async function main({ argv = process.argv.slice(2), env = process.env, PoolClass = Pool, output = console.log, operations = {} } = {}) {
  const connectionString = env.EXTERNAL_STATE_DATABASE_URL
  if (!connectionString) throw new Error("POSTGRES_CONNECTION_REQUIRED")
  const mode = parseMode(argv)
  const pool = new PoolClass({ connectionString })
  try {
    if (mode === "verify") {
      const result = await (operations.verify || readOnlyVerification)(pool)
      output(JSON.stringify({ ok: result.ok, mode, codes: result.schema.codes }))
      return result
    }
    const result = await (operations.install || migrateSingleCaseRebindAudit)(pool)
    output(JSON.stringify({ ok: true, mode, migrationId: result.migrationId, applied: result.applied, schemaValid: result.schema.ok }))
    return result
  } finally {
    await pool.end()
  }
}

if (require.main === module) main().catch(() => { console.error(JSON.stringify({ ok: false, error: "REBIND_AUDIT_MIGRATION_FAILED" })); process.exitCode = 1 })

module.exports = { main, parseMode, readOnlyVerification }
