#!/usr/bin/env node
"use strict"

require("dotenv").config({ quiet: true })
const fs = require("node:fs/promises")
const path = require("node:path")
const { Pool } = require("pg")
const { createPostgresAdapter } = require("../src/domain/case-number")
const { validateCaseNumberReservationSchema } = require("../src/infrastructure/case-number-reservations-postgres")
const { SOURCE_KIND, fingerprint, validatePlanForCaseNumberSync, applyCaseNumberReservationToPlan } = require("../src/domain/case-number-plan-sync")

function parseArgs(argv) {
  const result = { verify: false }
  for (let index = 0; index < argv.length; index++) {
    if (argv[index] === "--plan") result.plan = argv[++index]
    else if (argv[index].startsWith("--plan=")) result.plan = argv[index].slice("--plan=".length)
    else if (argv[index] === "--verify") result.verify = true
    else throw new Error("INVALID_ARGUMENT")
  }
  if (!result.plan) throw new Error("PLAN_PATH_REQUIRED")
  return result
}

function resolvePlanPath(input, stateDir) {
  const root = path.resolve(stateDir)
  const planPath = path.resolve(input)
  if (planPath !== root && !planPath.startsWith(`${root}${path.sep}`)) throw new Error("PLAN_OUTSIDE_STATE_DIR")
  if (path.extname(planPath).toLowerCase() !== ".json") throw new Error("PLAN_FILE_INVALID")
  return planPath
}

async function atomicWriteJson(file, value, io = fs) {
  const temporary = `${file}.${process.pid}.${Date.now()}.tmp`
  await io.writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", mode: 0o600, flag: "wx" })
  try { await io.rename(temporary, file) } catch (error) { await io.unlink(temporary).catch(() => {}); throw error }
}

async function main({ argv = process.argv.slice(2), env = process.env, PoolClass = Pool, output = console.log, now = () => new Date().toISOString(), write = atomicWriteJson, adapterFactory = createPostgresAdapter } = {}) {
  if (String(env.CASE_NUMBER_RESERVATION_MODE || "").trim().toLowerCase() !== "postgres") throw new Error("POSTGRES_MODE_REQUIRED")
  const connectionString = env.EXTERNAL_STATE_DATABASE_URL || env.DATABASE_URL
  if (!connectionString) throw new Error("POSTGRES_CONNECTION_REQUIRED")
  const args = parseArgs(argv)
  const planPath = resolvePlanPath(args.plan, env.CASE_IMPORT_STATE_DIR || path.join(process.cwd(), "data", "case-import"))
  const plan = JSON.parse(await fs.readFile(planPath, "utf8"))
  const planValidation = validatePlanForCaseNumberSync(plan)
  if (!planValidation.valid) throw new Error(`CASE_NUMBER_PLAN_INVALID:${planValidation.errors.join(",")}`)
  const pool = new PoolClass({ connectionString })
  let client
  try {
    client = await pool.connect()
    await client.query("BEGIN")
    await client.query("SET TRANSACTION READ ONLY")
    const schema = await validateCaseNumberReservationSchema(client)
    if (!schema.ok) throw new Error(`SCHEMA_INVALID:${schema.codes.join(",")}`)
    const adapter = adapterFactory({ pool: client })
    if (adapter.isTestAdapter) throw new Error("TEST_ADAPTER_FORBIDDEN")
    const reservation = await adapter.findByKey(`case-import:${plan.caseImportId}`)
    if (!reservation) throw new Error("RESERVATION_NOT_FOUND")
    await client.query("ROLLBACK")
    if (typeof client.release === "function") client.release()
    client = null
    const result = applyCaseNumberReservationToPlan({ plan, reservation, source: { kind: SOURCE_KIND, verified: true, verifiedAt: now() } })
    if (!args.verify && result.changed) await write(planPath, result.plan)
    const report = { ok: true, readOnly: args.verify, changed: args.verify ? false : result.changed, wouldChange: args.verify ? result.changed : undefined, reused: result.reused, caseImportFingerprint: fingerprint(plan.caseImportId), caseNumber: reservation.case_number, safeToApply: result.plan.safeToApply }
    output(JSON.stringify(report)); return report
  } catch (error) {
    if (client) await client.query("ROLLBACK").catch(() => {})
    throw error
  } finally {
    if (client && typeof client.release === "function") client.release()
    await pool.end()
  }
}

if (require.main === module) main().catch(() => { console.error(JSON.stringify({ ok: false, error: "CASE_NUMBER_PLAN_SYNC_FAILED" })); process.exitCode = 1 })
module.exports = { main, parseArgs, resolvePlanPath, atomicWriteJson }
