"use strict"

const MIGRATION_ID = "case-number-reservations-v1"
const TABLE_NAME = "case_number_reservations"
const CREATE_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS case_number_reservations (
    reservation_key TEXT PRIMARY KEY,
    case_number TEXT NOT NULL UNIQUE,
    area TEXT NOT NULL CHECK (area = btrim(area) AND char_length(area) BETWEEN 1 AND 80),
    status TEXT NOT NULL DEFAULT 'reserved' CHECK (status IN ('reserved')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT case_number_reservations_number_format CHECK (case_number ~ '^[A-Z]{2,4}\\.[0-9]{6}\\.[0-9]{3}$')
  )
`

const EXPECTED_COLUMNS = {
  reservation_key: { type: "text", nullable: false },
  case_number: { type: "text", nullable: false },
  area: { type: "text", nullable: false },
  status: { type: "text", nullable: false, defaultPattern: /reserved/ },
  created_at: { type: "timestamp with time zone", nullable: false, defaultPattern: /(current_timestamp|now\(\))/i }
}

async function validateCaseNumberReservationSchema(queryable) {
  const columnsResult = await queryable.query(`
    SELECT column_name, data_type, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_schema = current_schema() AND table_name = $1
    ORDER BY ordinal_position
  `, [TABLE_NAME])
  if (!columnsResult.rowCount) return { ok: false, codes: ["TABLE_MISSING"] }
  const codes = new Set()
  const columns = new Map(columnsResult.rows.map(row => [row.column_name, row]))
  for (const [name, expected] of Object.entries(EXPECTED_COLUMNS)) {
    const actual = columns.get(name)
    if (!actual) { codes.add("COLUMN_MISSING"); continue }
    if (actual.data_type !== expected.type) codes.add("COLUMN_TYPE_MISMATCH")
    if (!expected.nullable && actual.is_nullable !== "NO") codes.add("NOT_NULL_MISSING")
    if (expected.defaultPattern && !expected.defaultPattern.test(String(actual.column_default || ""))) codes.add("DEFAULT_MISMATCH")
  }
  const constraints = await queryable.query(`
    SELECT tc.constraint_type, array_agg(kcu.column_name ORDER BY kcu.ordinal_position) AS columns
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON tc.constraint_catalog = kcu.constraint_catalog
     AND tc.constraint_schema = kcu.constraint_schema
     AND tc.constraint_name = kcu.constraint_name
    WHERE tc.table_schema = current_schema() AND tc.table_name = $1
      AND tc.constraint_type IN ('PRIMARY KEY', 'UNIQUE')
    GROUP BY tc.constraint_name, tc.constraint_type
  `, [TABLE_NAME])
  const normalized = constraints.rows.map(row => ({ type: row.constraint_type, columns: Array.isArray(row.columns) ? row.columns : String(row.columns).replace(/[{}]/g, "").split(",") }))
  if (!normalized.some(item => item.type === "PRIMARY KEY" && item.columns.length === 1 && item.columns[0] === "reservation_key")) codes.add("PRIMARY_KEY_MISMATCH")
  if (!normalized.some(item => item.type === "UNIQUE" && item.columns.length === 1 && item.columns[0] === "case_number")) codes.add("UNIQUE_CONSTRAINT_MISSING")
  return { ok: codes.size === 0, codes: [...codes].sort() }
}

async function migrateCaseNumberReservations(pool) {
  const client = await pool.connect()
  try {
    await client.query("BEGIN")
    const registry = await client.query("SELECT to_regclass('oraculum_state_migrations') AS table_name")
    if (!registry.rows[0]?.table_name) throw new Error("MIGRATION_REGISTRY_MISSING")
    const prior = await client.query("SELECT migration_id FROM oraculum_state_migrations WHERE migration_id=$1", [MIGRATION_ID])
    if (!prior.rowCount) await client.query(CREATE_TABLE_SQL)
    const validation = await validateCaseNumberReservationSchema(client)
    if (!validation.ok) throw new Error(`SCHEMA_INCOMPATIBLE:${validation.codes.join(',')}`)
    if (!prior.rowCount) {
      await client.query(
        "INSERT INTO oraculum_state_migrations(migration_id, details, applied_at) VALUES($1,$2,CURRENT_TIMESTAMP)",
        [MIGRATION_ID, JSON.stringify({ table: TABLE_NAME, schemaVersion: 1 })]
      )
    }
    await client.query("COMMIT")
    return { ok: true, migrationId: MIGRATION_ID, applied: !prior.rowCount, schema: validation }
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {})
    throw error
  } finally {
    client.release()
  }
}

module.exports = { MIGRATION_ID, TABLE_NAME, CREATE_TABLE_SQL, validateCaseNumberReservationSchema, migrateCaseNumberReservations }
