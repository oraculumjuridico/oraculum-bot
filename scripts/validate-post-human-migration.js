"use strict"

const { Pool } = require("pg")

const REQUIRED_COLUMNS = [
  { name: "cycle_id", dataType: "uuid", nullable: false, expectedDefault: null },
  { name: "negocio_id", dataType: "text", nullable: false, expectedDefault: null },
  { name: "numero_caso", dataType: "text", nullable: false, expectedDefault: null },
  { name: "contato_id", dataType: "text", nullable: true, expectedDefault: null },
  { name: "sequencia", dataType: "integer", nullable: false, expectedDefault: null },
  { name: "status", dataType: "text", nullable: false, expectedDefault: null },
  { name: "estado_documental", dataType: "text", nullable: true, expectedDefault: null },
  { name: "send_attempt_id", dataType: "uuid", nullable: true, expectedDefault: null },
  { name: "provider_message_id", dataType: "text", nullable: true, expectedDefault: null },
  { name: "resultado_envio", dataType: "text", nullable: true, expectedDefault: null },
  { name: "erro", dataType: "text", nullable: true, expectedDefault: null },
  { name: "payload", dataType: "jsonb", nullable: false, expectedDefault: "{}::jsonb" },
  { name: "version", dataType: "integer", nullable: false, expectedDefault: "0" },
  { name: "created_at", dataType: "timestamp with time zone", nullable: false, expectedDefault: "CURRENT_TIMESTAMP" },
  { name: "updated_at", dataType: "timestamp with time zone", nullable: false, expectedDefault: "CURRENT_TIMESTAMP" }
]

const REQUIRED_STATUSES = [
  "pending", "analyzing", "ready_to_send", "sending", "message_sent",
  "awaiting_response", "human_review_required", "failed_transient",
  "failed_terminal", "completed", "cancelled"
]
const ACTIVE_STATUSES = REQUIRED_STATUSES.slice(0, 8)
const DOCUMENT_STATES = [
  "SEM_DOCUMENTOS", "DOCUMENTOS_PARCIAIS", "DOCUMENTOS_COMPLETOS",
  "DOCUMENTOS_NAO_ANALISADOS", "INFORMACOES_COMPLEMENTARES_PENDENTES",
  "REVISAO_HUMANA_NECESSARIA"
]
const SEND_RESULTS = ["pendente", "aceito_pelo_provider", "entregue", "falha", "incerto"]

const REQUIRED_INDEXES = [
  {
    name: "post_human_one_active_cycle_per_business",
    unique: true,
    columns: ["negocio_id"],
    order: ["ASC"],
    predicateColumn: "status",
    predicateValues: ACTIVE_STATUSES
  },
  {
    name: "post_human_cycles_contact_active",
    unique: false,
    columns: ["contato_id", "updated_at"],
    order: ["ASC", "DESC"],
    predicateCanonical: "contato_idisnotnull"
  },
  {
    name: "post_human_cycles_recovery",
    unique: false,
    columns: ["status", "updated_at"],
    order: ["ASC", "ASC"],
    predicatePattern: null
  }
]

function createPool(connectionString) {
  return new Pool({
    connectionString,
    max: 1,
    connectionTimeoutMillis: 10000,
    idleTimeoutMillis: 30000
  })
}

function sanitizeMessage(message, env = process.env) {
  if (!message) return "Erro desconhecido"
  let sanitized = String(message)
  const url = env.EXTERNAL_STATE_DATABASE_URL
  if (url) {
    const escaped = url.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    sanitized = sanitized.replace(new RegExp(escaped, "gi"), "***")
  }
  sanitized = sanitized.replace(/\b(postgresql|postgres):\/\/[^@\s]+@/gi, "$1://***@")
  sanitized = sanitized.replace(/password\s*=\s*[^&\s;]+/gi, "password=***")
  return sanitized
}

function normalizeDefault(raw) {
  if (raw === null || raw === undefined) return null
  const value = String(raw).trim()
  if (/^0(?:::(?:integer|numeric))?$/.test(value)) return "0"
  if (/^'?\{\}'?::jsonb?$/.test(value)) return "{}::jsonb"
  if (/^(?:CURRENT_TIMESTAMP(?:\(0\))?|now\(\))$/i.test(value)) return "CURRENT_TIMESTAMP"
  return value
}

function canonicalSql(definition) {
  return String(definition)
    .replace(/::(?:text|character varying|integer|bigint|text\[\])\b/gi, "")
    .replace(/[\s"()]/g, "")
    .toLowerCase()
}

function parseExactEnumRule(definition, column, nullable = false) {
  const compact = String(definition)
    .replace(/::(?:text\[\]|text|character varying)/gi, "")
    .replace(/[\s()]/g, "")
  const matches = [...compact.matchAll(/'((?:''|[^'])*)'/g)]
  if (matches.length === 0) return null
  const markerList = matches.map(() => "'value'").join(",")
  const skeleton = compact.replace(/'((?:''|[^'])*)'/g, "'value'").toLowerCase()
  const prefix = nullable ? `${column.toLowerCase()}isnullor` : ""
  const expectedIn = `check${prefix}${column.toLowerCase()}in${markerList}`
  const expectedAny = `check${prefix}${column.toLowerCase()}=anyarray[${markerList}]`
  if (skeleton !== expectedIn && skeleton !== expectedAny) return null
  return new Set(matches.map(item => item[1].replace(/''/g, "'")))
}

function assertExactSet(actual, expected, label) {
  if (!actual || actual.size !== expected.length || expected.some(value => !actual.has(value))) {
    throw new Error(`${label}: valores permitidos divergentes`)
  }
}

function requireConstraint(constraints, name, type, columns) {
  const constraint = constraints.get(name)
  if (!constraint) throw new Error(`Constraint ${name} não encontrada`)
  if (constraint.contype !== type) throw new Error(`Constraint ${name}: tipo divergente`)
  if (constraint.convalidated !== true) throw new Error(`Constraint ${name}: não validada`)
  if (constraint.conenforced !== true) throw new Error(`Constraint ${name}: não enforced`)
  if (JSON.stringify(constraint.columns) !== JSON.stringify(columns)) {
    throw new Error(`Constraint ${name}: colunas não conferem`)
  }
  return constraint.definition
}

function assertExactCheck(definition, canonical, label) {
  if (canonicalSql(definition) !== `check${canonical}`) throw new Error(`Constraint ${label} divergente`)
}

async function validatePostHumanMigration(options = {}) {
  const env = options.env || process.env
  const connectionString = env.EXTERNAL_STATE_DATABASE_URL
  if (!options.pool && !connectionString) {
    throw new Error("EXTERNAL_STATE_DATABASE_URL ausente")
  }

  const ownsPool = !options.pool
  const pool = options.pool || (options.poolFactory ? options.poolFactory() : createPool(connectionString))
  let client

  try {
    client = await pool.connect()
    await client.query("BEGIN TRANSACTION READ ONLY")

    const tableCheck = await client.query("SELECT to_regclass('public.post_human_cycles') AS table_name")
    if (!tableCheck.rows[0]?.table_name) throw new Error("Tabela post_human_cycles não encontrada")

    const funcCheck = await client.query("SELECT to_regprocedure('public.create_post_human_cycle(uuid,text,text,text)') AS func_name")
    if (!funcCheck.rows[0]?.func_name) {
      throw new Error("Função create_post_human_cycle(uuid,text,text,text) não encontrada")
    }

    const columnsCheck = await client.query(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'post_human_cycles'
    `)
    const existingColumns = new Map(columnsCheck.rows.map(row => [row.column_name, row]))
    if (existingColumns.size !== REQUIRED_COLUMNS.length) {
      throw new Error(`Número de colunas inválido: ${existingColumns.size} (esperado ${REQUIRED_COLUMNS.length})`)
    }
    for (const required of REQUIRED_COLUMNS) {
      const existing = existingColumns.get(required.name)
      if (!existing) throw new Error(`Coluna ${required.name} não encontrada`)
      if (existing.data_type !== required.dataType) {
        throw new Error(`Coluna ${required.name}: tipo ${existing.data_type} (esperado ${required.dataType})`)
      }
      const nullable = existing.is_nullable === "YES"
      if (nullable !== required.nullable) {
        throw new Error(`Coluna ${required.name}: nulabilidade ${existing.is_nullable} (esperado ${required.nullable ? "YES" : "NO"})`)
      }
      if (normalizeDefault(existing.column_default) !== required.expectedDefault) {
        throw new Error(`Coluna ${required.name}: default ${existing.column_default} (esperado ${required.expectedDefault ?? "nenhum"})`)
      }
    }

    const constraintsCheck = await client.query(`
      SELECT constraint_row.conname,
             constraint_row.contype,
             constraint_row.conkey,
             constraint_row.convalidated,
             constraint_row.conenforced,
             pg_get_constraintdef(constraint_row.oid, true) AS definition,
             array_agg(attribute.attname ORDER BY key.ordinality)
               FILTER (WHERE key.attnum IS NOT NULL) AS columns
      FROM pg_catalog.pg_constraint constraint_row
      LEFT JOIN LATERAL unnest(constraint_row.conkey) WITH ORDINALITY AS key(attnum, ordinality) ON true
      LEFT JOIN pg_catalog.pg_attribute attribute
        ON attribute.attrelid = constraint_row.conrelid AND attribute.attnum = key.attnum
      WHERE conrelid = to_regclass('public.post_human_cycles')
      GROUP BY constraint_row.oid, constraint_row.conname, constraint_row.contype,
               constraint_row.conkey, constraint_row.convalidated, constraint_row.conenforced
    `)
    const constraints = new Map(constraintsCheck.rows.map(row => [row.conname, row]))

    const primaryKey = requireConstraint(constraints, "post_human_cycles_pkey", "p", ["cycle_id"])
    if (canonicalSql(primaryKey) !== "primarykeycycle_id") throw new Error("Constraint post_human_cycles_pkey divergente")
    const unique = requireConstraint(constraints, "post_human_cycles_negocio_id_sequencia_key", "u", ["negocio_id", "sequencia"])
    if (canonicalSql(unique) !== "uniquenegocio_id,sequencia") throw new Error("Constraint post_human_cycles_negocio_id_sequencia_key divergente")

    assertExactCheck(requireConstraint(constraints, "post_human_cycles_negocio_id_check", "c", ["negocio_id"]), "lengthnegocio_idbetween1and128", "post_human_cycles_negocio_id_check")
    assertExactCheck(requireConstraint(constraints, "post_human_cycles_numero_caso_check", "c", ["numero_caso"]), "lengthnumero_casobetween3and80", "post_human_cycles_numero_caso_check")
    assertExactCheck(requireConstraint(constraints, "post_human_cycles_contato_id_check", "c", ["contato_id"]), "contato_idisnullorlengthcontato_idbetween1and128", "post_human_cycles_contato_id_check")
    assertExactCheck(requireConstraint(constraints, "post_human_cycles_sequencia_check", "c", ["sequencia"]), "sequencia>0", "post_human_cycles_sequencia_check")

    const statusDef = requireConstraint(constraints, "post_human_cycles_status_check", "c", ["status"])
    assertExactSet(parseExactEnumRule(statusDef, "status"), REQUIRED_STATUSES, "Constraint status")
    const documentDef = requireConstraint(constraints, "post_human_cycles_estado_documental_check", "c", ["estado_documental"])
    assertExactSet(parseExactEnumRule(documentDef, "estado_documental", true), DOCUMENT_STATES, "Constraint estado_documental")
    const sendResultDef = requireConstraint(constraints, "post_human_cycles_resultado_envio_check", "c", ["resultado_envio"])
    assertExactSet(parseExactEnumRule(sendResultDef, "resultado_envio", true), SEND_RESULTS, "Constraint resultado_envio")

    assertExactCheck(requireConstraint(constraints, "post_human_cycles_provider_message_id_check", "c", ["provider_message_id"]), "provider_message_idisnullorlengthprovider_message_id<=256", "post_human_cycles_provider_message_id_check")
    assertExactCheck(requireConstraint(constraints, "post_human_cycles_erro_check", "c", ["erro"]), "erroisnullorlengtherro<=1000", "post_human_cycles_erro_check")
    assertExactCheck(requireConstraint(constraints, "post_human_cycles_version_check", "c", ["version"]), "version>=0", "post_human_cycles_version_check")

    const indexesCheck = await client.query(`
      SELECT index_class.relname AS indexname,
             ix.indisunique,
             access_method.amname AS access_method,
             ix.indisvalid,
             ix.indisready,
             ix.indislive,
             array_agg(attribute.attname ORDER BY key.ordinality)
               FILTER (WHERE key.ordinality <= ix.indnkeyatts) AS columns,
             array_agg(CASE WHEN (ix.indoption[key.ordinality - 1] & 1) = 1 THEN 'DESC' ELSE 'ASC' END
               ORDER BY key.ordinality)
               FILTER (WHERE key.ordinality <= ix.indnkeyatts) AS ordering,
             pg_get_expr(ix.indpred, ix.indrelid, true) AS predicate
      FROM pg_catalog.pg_index ix
      JOIN pg_catalog.pg_class table_class ON table_class.oid = ix.indrelid
      JOIN pg_catalog.pg_namespace namespace ON namespace.oid = table_class.relnamespace
      JOIN pg_catalog.pg_class index_class ON index_class.oid = ix.indexrelid
      JOIN pg_catalog.pg_am access_method ON access_method.oid = index_class.relam
      JOIN LATERAL unnest(ix.indkey) WITH ORDINALITY AS key(attnum, ordinality) ON true
      JOIN pg_catalog.pg_attribute attribute
        ON attribute.attrelid = ix.indrelid AND attribute.attnum = key.attnum
      WHERE namespace.nspname = 'public' AND table_class.relname = 'post_human_cycles'
      GROUP BY index_class.relname, ix.indisunique, access_method.amname,
               ix.indisvalid, ix.indisready, ix.indislive, ix.indpred, ix.indrelid
    `)
    const indexes = new Map(indexesCheck.rows.map(row => [row.indexname, row]))
    for (const required of REQUIRED_INDEXES) {
      const actual = indexes.get(required.name)
      if (!actual) throw new Error(`Índice ${required.name} não encontrado`)
      if (Boolean(actual.indisunique) !== required.unique) throw new Error(`Índice ${required.name}: unicidade não confere`)
      if (actual.access_method !== "btree") throw new Error(`Índice ${required.name}: access method deve ser btree`)
      if (actual.indisvalid !== true) throw new Error(`Índice ${required.name}: indisvalid deve ser true`)
      if (actual.indisready !== true) throw new Error(`Índice ${required.name}: indisready deve ser true`)
      if (actual.indislive !== true) throw new Error(`Índice ${required.name}: indislive deve ser true`)
      if (JSON.stringify(actual.columns) !== JSON.stringify(required.columns)) throw new Error(`Índice ${required.name}: colunas não conferem`)
      if (JSON.stringify(actual.ordering) !== JSON.stringify(required.order)) throw new Error(`Índice ${required.name}: ordenação não confere`)
      if (required.predicateValues) {
        assertExactSet(parseExactEnumRule(`CHECK (${actual.predicate})`, required.predicateColumn), required.predicateValues, `Índice ${required.name}: predicado`)
      } else if (required.predicateCanonical) {
        if (canonicalSql(actual.predicate) !== required.predicateCanonical) throw new Error(`Índice ${required.name}: predicado parcial não confere`)
      } else if (actual.predicate !== null) {
        throw new Error(`Índice ${required.name}: não deve ter predicado parcial`)
      }
    }

    await client.query("ROLLBACK")
    return { ok: true }
  } catch (error) {
    if (client) {
      try { await client.query("ROLLBACK") } catch {}
    }
    throw error
  } finally {
    if (client) {
      try { client.release() } catch {}
    }
    if (ownsPool) {
      try { await pool.end() } catch {}
    }
  }
}

async function main() {
  if (!process.env.EXTERNAL_STATE_DATABASE_URL) {
    console.error("✗ EXTERNAL_STATE_DATABASE_URL ausente")
    process.exit(1)
  }
  try {
    await validatePostHumanMigration()
    console.log("✓ Validação da migration pós-humana: PASS")
    console.log("  • Tabela, função, colunas, constraints e índices: válidos")
  } catch (error) {
    console.error("✗ Validação da migration pós-humana: FAIL")
    console.error("  Motivo:", sanitizeMessage(error.message))
    process.exit(1)
  }
}

if (require.main === module) {
  main().catch(error => {
    console.error("Erro fatal:", sanitizeMessage(error.message))
    process.exit(1)
  })
}

module.exports = { validatePostHumanMigration, sanitizeMessage }
