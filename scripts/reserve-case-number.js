#!/usr/bin/env node
"use strict"

require("dotenv").config({ quiet: true })
const crypto = require("node:crypto")
const { Pool } = require("pg")
const { createPostgresAdapter, createService } = require("../src/domain/case-number")
const { validateCaseNumberReservationSchema } = require("../src/infrastructure/case-number-reservations-postgres")

function parseArgs(argv) {
  const values = {}
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index]
    if (arg === "--verify") values.verify = true
    else if (arg === "--case-import-id") values.caseImportId = argv[++index]
    else if (arg === "--area") values.area = argv[++index]
    else throw new Error("INVALID_ARGUMENT")
  }
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{2,127}$/.test(values.caseImportId || "")) throw new Error("INVALID_CASE_IMPORT_ID")
  if (!values.verify && (!values.area || values.area !== values.area.trim() || values.area.length > 80)) throw new Error("INVALID_AREA")
  return values
}

function reservationKey(caseImportId) { return `case-import:${caseImportId}` }
function fingerprint(value) { return crypto.createHash("sha256").update(String(value)).digest("hex").slice(0, 12) }

async function main({ argv = process.argv.slice(2), env = process.env, PoolClass = Pool, output = console.log, serviceFactory = createService, adapterFactory = createPostgresAdapter } = {}) {
  if (String(env.CASE_NUMBER_RESERVATION_MODE || "").toLowerCase() !== "postgres") throw new Error("POSTGRES_MODE_REQUIRED")
  const connectionString = env.EXTERNAL_STATE_DATABASE_URL || env.DATABASE_URL
  if (!connectionString) throw new Error("POSTGRES_CONNECTION_REQUIRED")
  const args = parseArgs(argv)
  const pool = new PoolClass({ connectionString })
  try {
    const schema = await validateCaseNumberReservationSchema(pool)
    if (!schema.ok) throw new Error(`SCHEMA_INVALID:${schema.codes.join(',')}`)
    const adapter = adapterFactory({ pool })
    if (adapter.isTestAdapter) throw new Error("TEST_ADAPTER_FORBIDDEN")
    const key = reservationKey(args.caseImportId)
    if (args.verify) {
      const existing = await adapter.findByKey(key)
      const result = { ok: true, readOnly: true, caseImportFingerprint: fingerprint(args.caseImportId), reservationExists: Boolean(existing) }
      output(JSON.stringify(result)); return result
    }
    const result = await serviceFactory(adapter).reserve({ key, area: args.area })
    if (!result.reserved) throw new Error("RESERVATION_UNAVAILABLE")
    const persisted = await adapter.findByKey(key)
    if (!persisted || persisted.case_number !== result.numero) throw new Error("RESERVATION_VERIFICATION_FAILED")
    const sanitized = { ok: true, caseImportFingerprint: fingerprint(args.caseImportId), caseNumber: result.numero, reused: result.reused }
    output(JSON.stringify(sanitized)); return sanitized
  } finally { await pool.end() }
}

if (require.main === module) main().catch(() => { console.error(JSON.stringify({ ok: false, error: "CASE_NUMBER_RESERVATION_FAILED" })); process.exitCode = 1 })
module.exports = { main, parseArgs, reservationKey, fingerprint }
