#!/usr/bin/env node
"use strict"

require("dotenv").config({ quiet: true })

const fs = require("node:fs/promises")
const path = require("node:path")
const { Pool } = require("pg")
const { validateFormat } = require("../src/domain/case-number")
const { fingerprint, SOURCE_KIND } = require("../src/domain/case-number-plan-sync")
const { validateCaseNumberReservationSchema } = require("../src/infrastructure/case-number-reservations-postgres")

const fail = code => { throw new Error(code) }

function parseArgs(argv) {
  let planPath
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index]
    if (arg === "--plan-path") planPath = argv[++index]
    else if (arg.startsWith("--plan-path=")) planPath = arg.slice("--plan-path=".length)
    else fail("INVALID_ARGUMENT")
  }
  if (!planPath || typeof planPath !== "string" || !planPath.trim()) fail("PLAN_PATH_MISSING")
  return Object.freeze({ planPath })
}

function resolvePlanPath(input, stateDir) {
  const plansRoot = path.resolve(stateDir, "plans")
  const planPath = path.resolve(input)
  if (planPath === plansRoot || !planPath.startsWith(`${plansRoot}${path.sep}`)) fail("PLAN_PATH_INVALID")
  if (path.extname(planPath).toLowerCase() !== ".json") fail("PLAN_PATH_INVALID")
  return planPath
}

function validatePlanBinding(plan) {
  if (!plan || typeof plan !== "object" || Array.isArray(plan)) fail("PLAN_BINDING_MISSING")
  if (typeof plan.caseImportId !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._:-]{2,127}$/.test(plan.caseImportId)) fail("PLAN_BINDING_MISSING")
  if (!/^[a-f0-9]{12}$/.test(plan.caseFingerprint || "")) fail("PLAN_FINGERPRINT_INVALID")

  const number = plan.dealPlan?.caseNumber
  if (!number || number === "PENDING_RESERVATION" || !validateFormat(number)) fail("PLAN_RESERVED_NUMBER_MISSING")

  const area = plan.dealPlan?.properties?.area_juridica
  if (typeof area !== "string" || !area || area !== area.trim() || area.length > 80) fail("PLAN_AREA_MISSING")

  const sync = plan.caseNumberReservationSync
  if (plan.status !== "PLANNED_NOT_EXECUTED" || plan.externalActionsExecuted === true || plan.importExecuted === true) fail("PLAN_STATUS_INVALID")
  if (sync?.status !== "SYNCHRONIZED" || sync?.source !== SOURCE_KIND) fail("PLAN_STATUS_INVALID")
  const reservationKey = `case-import:${plan.caseImportId}`
  if (!/^[a-f0-9]{12}$/.test(sync.reservationKeyFingerprint || "")) fail("PLAN_FINGERPRINT_INVALID")
  if (sync.reservationKeyFingerprint !== fingerprint(reservationKey)) fail("PLAN_FINGERPRINT_INVALID")

  return Object.freeze({ reservationKey, number, area, status: "reserved" })
}

function exactMatch(row, expected) {
  return Boolean(row)
    && row.reservation_key === expected.reservationKey
    && row.case_number === expected.number
    && row.area === expected.area
    && row.status === expected.status
}

async function reconcile({ client, plan, schemaValidator = validateCaseNumberReservationSchema }) {
  let transactionStarted = false
  let committed = false
  let rolledBack = false
  let created = false
  let planValidated = false
  try {
    await client.query("BEGIN")
    transactionStarted = true

    const expected = validatePlanBinding(plan)
    planValidated = true
    const schema = await schemaValidator(client)
    if (!schema?.ok) fail("RESERVATION_SCHEMA_INVALID")

    const byKey = await client.query(
      `SELECT reservation_key, case_number, area, status
         FROM case_number_reservations
        WHERE reservation_key = $1
        FOR UPDATE`,
      [expected.reservationKey]
    )
    if (byKey.rowCount > 1) fail("RESERVATION_KEY_CONFLICT")

    const byNumber = await client.query(
      `SELECT reservation_key, case_number, area, status
         FROM case_number_reservations
        WHERE case_number = $1
        FOR UPDATE`,
      [expected.number]
    )
    if (byNumber.rowCount > 1) fail("CASE_NUMBER_CONFLICT")

    const keyRow = byKey.rows[0]
    const numberRow = byNumber.rows[0]
    if (keyRow) {
      if (keyRow.case_number !== expected.number) fail("RESERVATION_KEY_CONFLICT")
      if (keyRow.area !== expected.area) fail("AREA_MISMATCH")
      if (keyRow.status !== expected.status) fail("STATUS_MISMATCH")
      if (!numberRow) fail("POST_INSERT_VALIDATION_FAILED")
      if (numberRow && numberRow.reservation_key !== expected.reservationKey) fail("CASE_NUMBER_CONFLICT")
      if (!exactMatch(keyRow, expected)) fail("POST_INSERT_VALIDATION_FAILED")
      await client.query("COMMIT")
      committed = true
      return Object.freeze({
        targetCase: "P1",
        planValid: true,
        conflictsFound: false,
        transactionStarted,
        reservationCreated: false,
        idempotentExistingMatch: true,
        postInsertValidation: true,
        commitExecuted: true,
        rollbackExecuted: false,
        planChanged: false,
        externalWritesExecuted: false,
        databaseWriteExecuted: false,
        result: "ALREADY_RECONCILED_AND_VALID",
      })
    }
    if (numberRow) fail("CASE_NUMBER_CONFLICT")

    let inserted
    try {
      inserted = await client.query(
        `INSERT INTO case_number_reservations
           (reservation_key, case_number, area, status, created_at)
         VALUES ($1, $2, $3, 'reserved', CURRENT_TIMESTAMP)
         RETURNING reservation_key, case_number, area, status`,
        [expected.reservationKey, expected.number, expected.area]
      )
    } catch (error) {
      if (error?.code === "23505") {
        if (error.constraint === "case_number_reservations_case_number_key") fail("CASE_NUMBER_CONFLICT")
        fail("RESERVATION_KEY_CONFLICT")
      }
      throw error
    }
    if (inserted.rowCount !== 1 || !exactMatch(inserted.rows[0], expected)) fail("POST_INSERT_VALIDATION_FAILED")
    created = true

    const verified = await client.query(
      `SELECT reservation_key, case_number, area, status
         FROM case_number_reservations
        WHERE reservation_key = $1`,
      [expected.reservationKey]
    )
    if (verified.rowCount !== 1 || !exactMatch(verified.rows[0], expected)) fail("POST_INSERT_VALIDATION_FAILED")

    await client.query("COMMIT")
    committed = true
    return Object.freeze({
      targetCase: "P1",
      planValid: true,
      conflictsFound: false,
      transactionStarted,
      reservationCreated: true,
      idempotentExistingMatch: false,
      postInsertValidation: true,
      commitExecuted: true,
      rollbackExecuted: false,
      planChanged: false,
      externalWritesExecuted: false,
      databaseWriteExecuted: true,
      result: "RESERVATION_CREATED_AND_VALIDATED",
    })
  } catch (error) {
    if (transactionStarted && !committed) {
      await client.query("ROLLBACK").then(() => { rolledBack = true }).catch(() => {})
    }
    error.audit = Object.freeze({
      targetCase: "P1",
      planValid: planValidated,
      conflictsFound: true,
      transactionStarted,
      reservationCreated: created && !rolledBack,
      idempotentExistingMatch: false,
      postInsertValidation: false,
      commitExecuted: false,
      rollbackExecuted: rolledBack,
      planChanged: false,
      externalWritesExecuted: false,
    })
    throw error
  }
}

function sanitizedOutput(result) {
  return {
    TARGET_CASE: result.targetCase,
    PLAN_VALID: result.planValid,
    CONFLICTS_FOUND: result.conflictsFound,
    TRANSACTION_STARTED: result.transactionStarted,
    RESERVATION_CREATED: result.reservationCreated,
    IDEMPOTENT_EXISTING_MATCH: result.idempotentExistingMatch,
    POST_INSERT_VALIDATION: result.postInsertValidation,
    COMMIT_EXECUTED: result.commitExecuted,
    ROLLBACK_EXECUTED: result.rollbackExecuted,
    PLAN_CHANGED: false,
    EXTERNAL_WRITES_EXECUTED: false,
  }
}

async function main({
  argv = process.argv.slice(2),
  env = process.env,
  PoolClass = Pool,
  readFile = fs.readFile,
  output = console.log,
  schemaValidator = validateCaseNumberReservationSchema,
} = {}) {
  const args = parseArgs(argv)
  if (String(env.CASE_NUMBER_RESERVATION_MODE || "").toLowerCase() !== "postgres") fail("POSTGRES_MODE_REQUIRED")
  const connectionString = env.EXTERNAL_STATE_DATABASE_URL
  if (!connectionString) fail("POSTGRES_CONNECTION_REQUIRED")

  const planPath = resolvePlanPath(args.planPath, env.CASE_IMPORT_STATE_DIR || path.join(process.cwd(), "data", "case-import"))
  let contents
  try { contents = await readFile(planPath, "utf8") } catch (error) {
    if (error?.code === "ENOENT") fail("PLAN_FILE_NOT_FOUND")
    fail("PLAN_FILE_NOT_FOUND")
  }
  let plan
  try { plan = JSON.parse(contents) } catch { fail("PLAN_PARSE_INVALID") }
  validatePlanBinding(plan)

  const pool = new PoolClass({ connectionString, max: 1 })
  let client
  try {
    client = await pool.connect()
    const result = await reconcile({ client, plan, schemaValidator })
    output(JSON.stringify(sanitizedOutput(result)))
    return result
  } finally {
    if (client && typeof client.release === "function") client.release()
    await pool.end()
  }
}

if (require.main === module) {
  main().catch(error => {
    const allowed = new Set([
      "PLAN_PATH_MISSING", "PLAN_PATH_INVALID", "PLAN_FILE_NOT_FOUND", "PLAN_PARSE_INVALID",
      "PLAN_RESERVED_NUMBER_MISSING", "PLAN_BINDING_MISSING", "PLAN_FINGERPRINT_INVALID",
      "PLAN_AREA_MISSING", "PLAN_STATUS_INVALID", "RESERVATION_KEY_CONFLICT",
      "CASE_NUMBER_CONFLICT", "AREA_MISMATCH", "STATUS_MISMATCH", "RESERVATION_SCHEMA_INVALID",
      "POST_INSERT_VALIDATION_FAILED", "POSTGRES_MODE_REQUIRED", "POSTGRES_CONNECTION_REQUIRED",
      "INVALID_ARGUMENT",
    ])
    const code = allowed.has(error.message) ? error.message : "RECONCILIATION_FAILED"
    console.error(JSON.stringify({ ...sanitizedOutput(error.audit || {}), ERROR_CODE: code }))
    process.exitCode = 1
  })
}

module.exports = { parseArgs, resolvePlanPath, validatePlanBinding, exactMatch, reconcile, sanitizedOutput, main }
