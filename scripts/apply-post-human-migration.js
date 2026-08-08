"use strict"

const fs = require("node:fs")
const path = require("node:path")
const { Pool } = require("pg")

const MIGRATION_PATHS = [
  path.join(__dirname, "..", "migrations", "20260728_post_human_cycles.sql"),
  path.join(__dirname, "..", "migrations", "20260807_post_human_action_contexts.sql")
]

function createPool(connectionString) {
  return new Pool({
    connectionString,
    max: 1,
    connectionTimeoutMillis: 10000,
    idleTimeoutMillis: 30000,
    statement_timeout: 60000
  })
}

function sanitizeMessage(message, env = process.env) {
  if (!message) return "Erro desconhecido"
  let sanitized = String(message)
  const url = env.EXTERNAL_STATE_DATABASE_URL
  if (url) {
    const escaped = url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    sanitized = sanitized.replace(new RegExp(escaped, 'gi'), "***")
  }
  sanitized = sanitized.replace(/\b(postgresql|postgres):\/\/[^@\s]+@/gi, "$1://***@")
  sanitized = sanitized.replace(/password\s*=\s*[^&\s;]+/gi, "password=***")
  return sanitized
}

async function applyPostHumanMigration(options = {}) {
  const env = options.env || process.env
  const connectionString = env.EXTERNAL_STATE_DATABASE_URL
  if (!options.pool && !connectionString) {
    throw new Error("EXTERNAL_STATE_DATABASE_URL ausente")
  }

  const ownsPool = !options.pool
  const pool = options.pool || (options.poolFactory ? options.poolFactory() : createPool(connectionString))
  let client
  let began = false

  try {
    const sql = MIGRATION_PATHS.map(migrationPath => fs.readFileSync(migrationPath, "utf8")).join("\n\n")
    client = await pool.connect()
    await client.query("BEGIN")
    began = true
    await client.query(sql)
    await client.query("COMMIT")
    return { applied: true }
  } catch (error) {
    if (began && client) {
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

  console.log("Aplicando migration pós-humana...")
  try {
    await applyPostHumanMigration()
    console.log("✓ Migration aplicada com sucesso")
  } catch (error) {
    console.error("✗ Falha ao aplicar migration:", sanitizeMessage(error.message))
    process.exit(1)
  }
}

if (require.main === module) {
  main().catch(error => {
    console.error("Erro fatal:", sanitizeMessage(error.message))
    process.exit(1)
  })
}

module.exports = { applyPostHumanMigration, sanitizeMessage }
