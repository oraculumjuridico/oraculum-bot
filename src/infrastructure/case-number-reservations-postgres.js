"use strict"

const MIGRATION_ID = "case-number-reservations-v1"
const RECONCILIATION_MIGRATION_ID = "case-number-reservations-v2-reconcile-checks"
const TABLE_NAME = "case_number_reservations"
const PVR_CASE_NUMBER = /^PVR\.\d{6}\.\d{3}$/
const CASE_IMPORT_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{2,127}$/
const PVR_ADOPTION_AREA = "INSS"
const CHECKS = {
  case_number: {
    name: "case_number_reservations_number_format",
    sql: "CHECK (case_number ~ '^[A-Z]{2,4}\\.[0-9]{6}\\.[0-9]{3}$')",
    missing: "CASE_NUMBER_FORMAT_CHECK_MISSING",
    mismatch: "CASE_NUMBER_FORMAT_CHECK_MISMATCH"
  },
  status: {
    name: "case_number_reservations_status_check",
    sql: "CHECK (status IN ('reserved'))",
    missing: "STATUS_CHECK_MISSING",
    mismatch: "STATUS_CHECK_MISMATCH"
  },
  area: {
    name: "case_number_reservations_area_check",
    sql: "CHECK (area = btrim(area) AND char_length(area) BETWEEN 1 AND 80)",
    missing: "AREA_CHECK_MISSING",
    mismatch: "AREA_CHECK_MISMATCH"
  }
}
const CREATE_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS case_number_reservations (
    reservation_key TEXT PRIMARY KEY,
    case_number TEXT NOT NULL UNIQUE,
    area TEXT NOT NULL CONSTRAINT ${CHECKS.area.name} ${CHECKS.area.sql},
    status TEXT NOT NULL DEFAULT 'reserved' CONSTRAINT ${CHECKS.status.name} ${CHECKS.status.sql},
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT ${CHECKS.case_number.name} ${CHECKS.case_number.sql}
  )
`
const EXPECTED_COLUMNS = {
  reservation_key: { type: "text", nullable: false }, case_number: { type: "text", nullable: false },
  area: { type: "text", nullable: false }, status: { type: "text", nullable: false, defaultPattern: /reserved/ },
  created_at: { type: "timestamp with time zone", nullable: false, defaultPattern: /(current_timestamp|now\(\))/i }
}

function normalizeExpression(value) {
  return String(value || "").toLowerCase().replace(/::text/g, "").replace(/[()\s"]/g, "")
}
function checkMatches(column, expression) {
  const value = normalizeExpression(expression)
  if (column === "case_number") return value.includes("case_number~'^[a-z]{2,4}\\.[0-9]{6}\\.[0-9]{3}$'")
  if (column === "status") return value === "status='reserved'" || value === "status=any(array['reserved'])" || value === "statusin'reserved'"
  if (column === "area") return value.includes("area=btrimarea") && (value.includes("char_lengtharea>=1") || value.includes("char_lengthareabetween1and80")) && (value.includes("char_lengtharea<=80") || value.includes("char_lengthareabetween1and80"))
  return false
}

async function readStructuralSchema(queryable) {
  const columnsResult = await queryable.query(`SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = $1 ORDER BY ordinal_position`, [TABLE_NAME])
  if (!columnsResult.rowCount) return { ok: false, codes: ["TABLE_MISSING"] }
  const codes = new Set(), columns = new Map(columnsResult.rows.map(row => [row.column_name, row]))
  for (const [name, expected] of Object.entries(EXPECTED_COLUMNS)) {
    const actual = columns.get(name)
    if (!actual) { codes.add("COLUMN_MISSING"); continue }
    if (actual.data_type !== expected.type) codes.add("COLUMN_TYPE_MISMATCH")
    if (!expected.nullable && actual.is_nullable !== "NO") codes.add("NOT_NULL_MISSING")
    if (expected.defaultPattern && !expected.defaultPattern.test(String(actual.column_default || ""))) codes.add("DEFAULT_MISMATCH")
  }
  const constraints = await queryable.query(`SELECT tc.constraint_type, array_agg(kcu.column_name ORDER BY kcu.ordinal_position) AS columns FROM information_schema.table_constraints tc JOIN information_schema.key_column_usage kcu ON tc.constraint_catalog=kcu.constraint_catalog AND tc.constraint_schema=kcu.constraint_schema AND tc.constraint_name=kcu.constraint_name WHERE tc.table_schema=current_schema() AND tc.table_name=$1 AND tc.constraint_type IN ('PRIMARY KEY','UNIQUE') GROUP BY tc.constraint_name,tc.constraint_type`, [TABLE_NAME])
  const normalized = constraints.rows.map(row => ({ type: row.constraint_type, columns: Array.isArray(row.columns) ? row.columns : String(row.columns).replace(/[{}]/g, "").split(",") }))
  if (!normalized.some(item => item.type === "PRIMARY KEY" && item.columns.length === 1 && item.columns[0] === "reservation_key")) codes.add("PRIMARY_KEY_MISMATCH")
  if (!normalized.some(item => item.type === "UNIQUE" && item.columns.length === 1 && item.columns[0] === "case_number")) codes.add("UNIQUE_CONSTRAINT_MISSING")
  return { ok: codes.size === 0, codes: [...codes].sort() }
}

async function readCheckSchema(queryable) {
  const result = await queryable.query(`SELECT c.conname, pg_get_expr(c.conbin,c.conrelid) AS expression, array_agg(a.attname ORDER BY a.attname) FILTER (WHERE a.attname IS NOT NULL) AS columns FROM pg_constraint c LEFT JOIN unnest(c.conkey) key(attnum) ON true LEFT JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=key.attnum WHERE c.conrelid=to_regclass($1) AND c.contype='c' GROUP BY c.oid,c.conname,c.conbin,c.conrelid`, [TABLE_NAME])
  const codes = new Set(), state = {}
  for (const [column, expected] of Object.entries(CHECKS)) {
    const related = result.rows.filter(row => (row.columns || []).includes(column))
    const matching = related.filter(row => checkMatches(column, row.expression))
    state[column] = matching.length === 1 && related.length === 1 ? "valid" : related.length === 0 ? "missing" : "mismatch"
    if (state[column] === "missing") codes.add(expected.missing)
    if (state[column] === "mismatch") codes.add(expected.mismatch)
  }
  return { ok: codes.size === 0, codes: [...codes].sort(), state }
}

async function validateBasicCaseNumberReservationSchema(queryable) { return readStructuralSchema(queryable) }
async function validateCaseNumberReservationSchema(queryable) {
  const basic = await readStructuralSchema(queryable)
  if (!basic.ok) return basic
  const checks = await readCheckSchema(queryable)
  return { ok: checks.ok, codes: checks.codes }
}

async function validateReservationData(queryable) {
  const result = await queryable.query(`SELECT COUNT(*) FILTER (WHERE case_number IS NULL OR case_number !~ '^[A-Z]{2,4}\\.[0-9]{6}\\.[0-9]{3}$')::integer AS invalid_number, COUNT(*) FILTER (WHERE status IS NULL OR status <> 'reserved')::integer AS invalid_status, COUNT(*) FILTER (WHERE area IS NULL OR area <> btrim(area) OR char_length(area) NOT BETWEEN 1 AND 80)::integer AS invalid_area, (SELECT COUNT(*)::integer FROM (SELECT reservation_key FROM case_number_reservations GROUP BY reservation_key HAVING COUNT(*)>1) duplicates) AS duplicate_keys, (SELECT COUNT(*)::integer FROM (SELECT case_number FROM case_number_reservations GROUP BY case_number HAVING COUNT(*)>1) duplicates) AS duplicate_numbers FROM case_number_reservations`)
  const row = result.rows[0], codes = []
  if (row.invalid_number > 0) codes.push("INVALID_CASE_NUMBER_DATA")
  if (row.invalid_status > 0) codes.push("INVALID_STATUS_DATA")
  if (row.invalid_area > 0) codes.push("INVALID_AREA_DATA")
  if (row.duplicate_keys > 0) codes.push("DUPLICATE_RESERVATION_KEY_DATA")
  if (row.duplicate_numbers > 0) codes.push("DUPLICATE_CASE_NUMBER_DATA")
  return { ok: codes.length === 0, codes }
}

async function migrationRegistry(client, migrationId) {
  const registry = await client.query("SELECT to_regclass('oraculum_state_migrations') AS table_name")
  if (!registry.rows[0]?.table_name) throw new Error("MIGRATION_REGISTRY_MISSING")
  return client.query("SELECT migration_id FROM oraculum_state_migrations WHERE migration_id=$1", [migrationId])
}
async function recordMigration(client, migrationId, details) {
  await client.query("INSERT INTO oraculum_state_migrations(migration_id,details,applied_at) VALUES($1,$2,CURRENT_TIMESTAMP)", [migrationId, JSON.stringify(details)])
}

async function migrateCaseNumberReservations(pool) {
  const client = await pool.connect()
  try {
    await client.query("BEGIN")
    const prior = await migrationRegistry(client, MIGRATION_ID)
    if (!prior.rowCount) await client.query(CREATE_TABLE_SQL)
    const validation = await validateCaseNumberReservationSchema(client)
    if (!validation.ok) throw new Error(`SCHEMA_INCOMPATIBLE:${validation.codes.join(',')}`)
    if (!prior.rowCount) await recordMigration(client, MIGRATION_ID, { table: TABLE_NAME, schemaVersion: 1, installation: "new" })
    await client.query("COMMIT")
    return { ok: true, migrationId: MIGRATION_ID, applied: !prior.rowCount, schema: validation }
  } catch (error) { await client.query("ROLLBACK").catch(() => {}); throw error } finally { client.release() }
}

async function planCaseNumberReservationReconciliation(queryable) {
  const basic = await validateBasicCaseNumberReservationSchema(queryable)
  if (!basic.ok) return { ok: false, classification: "INCOMPATIBLE", codes: basic.codes, additions: [] }
  const checks = await readCheckSchema(queryable)
  if (checks.codes.some(code => code.endsWith("_MISMATCH"))) return { ok: false, classification: "CONFLICTING_CHECKS", codes: checks.codes, additions: [] }
  const data = await validateReservationData(queryable)
  if (!data.ok) return { ok: false, classification: "INCOMPATIBLE_DATA", codes: data.codes, additions: [] }
  const additions = Object.entries(checks.state).filter(([, state]) => state === "missing").map(([column]) => CHECKS[column].name)
  return { ok: true, classification: additions.length ? "LEGACY_RECONCILABLE" : "ALREADY_RECONCILED", codes: [], additions }
}

async function reconcileCaseNumberReservations(pool) {
  const client = await pool.connect()
  try {
    await client.query("BEGIN")
    const prior = await migrationRegistry(client, RECONCILIATION_MIGRATION_ID)
    const plan = await planCaseNumberReservationReconciliation(client)
    if (!plan.ok) throw new Error(`RECONCILIATION_BLOCKED:${plan.codes.join(',')}`)
    if (!prior.rowCount) {
      for (const name of plan.additions) {
        const expected = Object.values(CHECKS).find(check => check.name === name)
        await client.query(`ALTER TABLE case_number_reservations ADD CONSTRAINT ${expected.name} ${expected.sql}`)
      }
    }
    const validation = await validateCaseNumberReservationSchema(client)
    if (!validation.ok) throw new Error(`POST_RECONCILIATION_INVALID:${validation.codes.join(',')}`)
    if (!prior.rowCount) await recordMigration(client, RECONCILIATION_MIGRATION_ID, { table: TABLE_NAME, schemaVersion: 2, adoption: "legacy-structure", addedChecks: plan.additions })
    await client.query("COMMIT")
    return { ok: true, migrationId: RECONCILIATION_MIGRATION_ID, applied: !prior.rowCount, plan, schema: validation }
  } catch (error) { await client.query("ROLLBACK").catch(() => {}); throw error } finally { client.release() }
}

function pvrAdoptionKey(caseImportId) {
  if (typeof caseImportId !== "string" || !CASE_IMPORT_ID.test(caseImportId) || caseImportId.includes("..") || /[\\/]/.test(caseImportId)) throw new Error("CASE_IMPORT_ID_INVALID")
  return `case-import:${caseImportId}`
}

function validPvrReservation(row, key, caseNumber) {
  return row && Object.getPrototypeOf(row) === Object.prototype && row.reservation_key === key && row.case_number === caseNumber && row.area === PVR_ADOPTION_AREA && row.status === "reserved"
}

async function selectPvrReservation(client, column, value) {
  const result = await client.query(`SELECT reservation_key, case_number, area, status FROM ${TABLE_NAME} WHERE ${column}=$1 FOR UPDATE`, [value])
  if (!result || !Number.isInteger(result.rowCount) || !Array.isArray(result.rows) || result.rowCount !== result.rows.length || result.rowCount > 1) throw new Error("PVR_ADOPTION_RESPONSE_INVALID")
  return result.rowCount ? result.rows[0] : null
}

// The existing primary-key and unique-number constraints arbitrate absent-row races;
// SELECT ... FOR UPDATE protects any matching persisted row through the transaction.
async function adoptExistingPvrReservation({ pool, caseImportId, caseNumber, validateSchema = validateCaseNumberReservationSchema } = {}) {
  const key = pvrAdoptionKey(caseImportId)
  if (!PVR_CASE_NUMBER.test(caseNumber || "")) throw new Error("PVR_CASE_NUMBER_INVALID")
  if (!pool || typeof pool.connect !== "function" || typeof validateSchema !== "function") throw new Error("PVR_ADOPTION_PORT_INVALID")
  const client = await pool.connect()
  try {
    await client.query("BEGIN")
    const schema = await validateSchema(client)
    if (!schema || schema.ok !== true || !Array.isArray(schema.codes) || schema.codes.length) throw new Error("PVR_ADOPTION_SCHEMA_INVALID")

    const byKey = await selectPvrReservation(client, "reservation_key", key)
    const byNumber = await selectPvrReservation(client, "case_number", caseNumber)
    if (byKey && !validPvrReservation(byKey, key, caseNumber)) throw new Error(byKey.case_number !== caseNumber ? "PVR_ADOPTION_KEY_CONFLICT" : "PVR_ADOPTION_STATE_INVALID")
    if (byNumber && !validPvrReservation(byNumber, key, caseNumber)) throw new Error(byNumber.reservation_key !== key ? "PVR_ADOPTION_NUMBER_CONFLICT" : "PVR_ADOPTION_STATE_INVALID")
    if (byKey || byNumber) {
      if (!byKey || !byNumber || byKey.reservation_key !== byNumber.reservation_key || byKey.case_number !== byNumber.case_number) throw new Error("PVR_ADOPTION_RESULT_INCONSISTENT")
      await client.query("COMMIT")
      return { reservation: byKey, created: false, reused: true }
    }

    const inserted = await client.query(`INSERT INTO ${TABLE_NAME}(reservation_key,case_number,area,status) VALUES($1,$2,$3,'reserved') ON CONFLICT DO NOTHING RETURNING reservation_key, case_number, area, status`, [key, caseNumber, PVR_ADOPTION_AREA])
    if (!inserted || !Number.isInteger(inserted.rowCount) || !Array.isArray(inserted.rows) || inserted.rowCount !== inserted.rows.length || inserted.rowCount > 1) throw new Error("PVR_ADOPTION_RESPONSE_INVALID")
    const finalByKey = await selectPvrReservation(client, "reservation_key", key)
    const finalByNumber = await selectPvrReservation(client, "case_number", caseNumber)
    if (!validPvrReservation(finalByKey, key, caseNumber) || !validPvrReservation(finalByNumber, key, caseNumber) || finalByKey.reservation_key !== finalByNumber.reservation_key) throw new Error("PVR_ADOPTION_CONFLICT")
    await client.query("COMMIT")
    return { reservation: finalByKey, created: inserted.rowCount === 1, reused: inserted.rowCount === 0 }
  } catch (error) { await client.query("ROLLBACK").catch(() => {}); throw error } finally { if (typeof client.release === "function") client.release() }
}

module.exports = { MIGRATION_ID, RECONCILIATION_MIGRATION_ID, TABLE_NAME, CHECKS, CREATE_TABLE_SQL, PVR_ADOPTION_AREA, normalizeExpression, checkMatches, validateBasicCaseNumberReservationSchema, validateCaseNumberReservationSchema, validateReservationData, planCaseNumberReservationReconciliation, migrateCaseNumberReservations, reconcileCaseNumberReservations, pvrAdoptionKey, adoptExistingPvrReservation }
