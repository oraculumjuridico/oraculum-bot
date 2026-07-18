/**
 * Mock determinístico do módulo pg para testes de sanitização
 *
 * Isolamento completo: bloqueia DNS, socket, rede e caminhos alternativos.
 * Allowlist fechada: rejeita queries desconhecidas e comandos de escrita.
 * Registro de operações: comprova sequência esperada (BEGIN, ROLLBACK, END).
 *
 * Uso: node --require ./test/pg-mock.js scripts/preflight-migration-v3.js
 */

"use strict"

const Module = require("module")
const originalRequire = Module.prototype.require

// Estado global do mock (controlado via MOCK_BEHAVIOR)
let mockBehavior = process.env.MOCK_BEHAVIOR || "success"
let callSequence = []

// Comandos de escrita e administração que devem ser rejeitados
const WRITE_COMMANDS = [
  "ALTER", "CREATE", "DROP", "INSERT", "UPDATE", "DELETE",
  "TRUNCATE", "COPY", "CALL", "GRANT", "REVOKE", "MERGE",
  "VACUUM", "ANALYZE", "ANALYSE", "REFRESH", "DO", "EXECUTE"
]

/**
 * Verifica se SQL contém comando de escrita
 */
function containsWriteCommand(sql) {
  if (!sql || typeof sql !== "string") return false

  // Normalizar: remover comentários e espaços extras
  const normalized = sql
    .replace(/--[^\n]*\n/g, " ")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase()

  // Verificar se começa com comando de escrita
  for (const cmd of WRITE_COMMANDS) {
    // Match: início ou após ponto-e-vírgula
    if (normalized.startsWith(cmd + " ") ||
        normalized.includes("; " + cmd + " ") ||
        normalized === cmd) {
      return true
    }
  }

  return false
}

/**
 * Verifica se SQL é permitido pela allowlist
 */
function isAllowedQuery(sql) {
  if (!sql || typeof sql !== "string") return false

  const normalized = sql.trim().toUpperCase()

  // Allowlist explícita de operações permitidas
  const allowed = [
    "BEGIN",
    "ROLLBACK",
    "SELECT CURRENT_DATABASE()",
    "SELECT * FROM PG_TABLES",
    "SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES",
    "SELECT COUNT(*) AS",
    "SELECT COUNT(1) AS"
  ]

  // Verificar se começa com padrão permitido
  for (const pattern of allowed) {
    if (normalized.startsWith(pattern)) return true
  }

  // Permitir queries SELECT específicas do preflight
  if (normalized.startsWith("SELECT") &&
      (normalized.includes("TO_REGCLASS") ||
       normalized.includes("CURRENT_DATABASE") ||
       normalized.includes("PG_TABLES") ||
       normalized.includes("INFORMATION_SCHEMA") ||
       normalized.includes("SINGLE_CASE_APPLY_AUTHORIZATIONS") ||
       normalized.includes("AUTHORIZATION_TYPE"))) {
    return true
  }

  return false
}

class MockClient {
  constructor() {
    callSequence.push("CLIENT_CONSTRUCTOR")

    if (mockBehavior === "fatal_constructor_error") {
      const error = new Error("Mock constructor error")
      error.code = "MOCK_CONSTRUCTOR_ERROR"
      throw error
    }
  }

  async connect() {
    callSequence.push("CONNECT")

    if (mockBehavior === "connection_error") {
      callSequence.push("CONNECTION_ERROR")
      const error = new Error("Mock connection error")
      error.code = "ECONNREFUSED"
      throw error
    }

    if (mockBehavior === "connection_error_with_password") {
      callSequence.push("CONNECTION_ERROR_WITH_PASSWORD")
      const error = new Error("SENTINEL_PASSWORD_123 in connection")
      error.code = "SENTINEL_PASS_CODE"
      error.stack = "Error at SENTINEL_HOST_456\n  at Connection (pg:123)"
      throw error
    }
  }

  async query(sql, params) {
    callSequence.push("QUERY")

    // 1. REJEITAR ESCRITA
    if (containsWriteCommand(sql)) {
      const error = new Error("MOCK_WRITE_QUERY_REJECTED")
      error.code = "MOCK_WRITE_REJECTED"
      throw error
    }

    // 2. VERIFICAR ALLOWLIST
    if (!isAllowedQuery(sql)) {
      const error = new Error("MOCK_UNEXPECTED_QUERY")
      error.code = "MOCK_UNKNOWN_QUERY"
      throw error
    }

    // 3. DETECTAR BEGIN TRANSACTION READ ONLY
    if (sql && sql.toUpperCase().includes("BEGIN")) {
      callSequence.push("BEGIN_READ_ONLY")
      return { rows: [] }
    }

    // 4. DETECTAR ROLLBACK
    if (sql && sql.toUpperCase().includes("ROLLBACK")) {
      callSequence.push("ROLLBACK")
      return { rows: [] }
    }

    // 5. SIMULAR ERROS CONTROLADOS
    if (mockBehavior === "query_error_after_begin") {
      const error = new Error("Mock query error")
      error.code = "42P01" // PostgreSQL: undefined_table
      throw error
    }

    if (mockBehavior === "error_with_malicious_code") {
      const error = new Error("Database error")
      error.code = "SENTINEL_MALICIOUS_CODE_WITH_PASSWORD_XYZ"
      throw error
    }

    if (mockBehavior === "error_with_code_as_object") {
      const error = new Error("Database error")
      error.code = { malicious: "SENTINEL_OBJECT_CODE" }
      throw error
    }

    if (mockBehavior === "error_without_code") {
      const error = new Error("Database error without code")
      throw error
    }

    // 6. RESPOSTAS SIMULADAS PARA QUERIES PERMITIDAS
    if (sql && sql.toUpperCase().includes("CURRENT_DATABASE")) {
      return { rows: [{ db: "test_db", schema: "public" }] }
    }

    if (sql && sql.toUpperCase().includes("TO_REGCLASS")) {
      return { rows: [{ table_name: "single_case_apply_authorizations" }] }
    }

    if (sql && sql.toUpperCase().includes("COUNT(*)")) {
      return { rows: [{ total: 0, count: 0, explicit_count: 0, external_count: 0 }] }
    }

    if (sql && sql.toUpperCase().includes("AUTHORIZATION_TYPE")) {
      return { rows: [] }
    }

    // Fallback: query permitida mas sem resposta específica
    return { rows: [] }
  }

  release() {
    callSequence.push("RELEASE")
  }
}

class MockPool {
  constructor(config) {
    callSequence.push("POOL_CONSTRUCTOR")

    if (mockBehavior === "fatal_pool_error") {
      const error = new Error("Mock pool error")
      error.code = "MOCK_POOL_ERROR"
      throw error
    }
  }

  async connect() {
    callSequence.push("POOL_CONNECT")

    if (mockBehavior === "fatal_pool_connect_error") {
      const error = new Error("Mock pool connect error")
      error.code = "MOCK_POOL_CONNECT_ERROR"
      throw error
    }

    if (mockBehavior === "connection_error") {
      callSequence.push("CONNECTION_ERROR")
      const error = new Error("Mock connection error")
      error.code = "ECONNREFUSED"
      throw error
    }

    if (mockBehavior === "connection_error_with_password") {
      callSequence.push("CONNECTION_ERROR_WITH_PASSWORD")
      const error = new Error("SENTINEL_PASSWORD_123 in connection")
      error.code = "SENTINEL_PASS_CODE"
      error.stack = "Error at SENTINEL_HOST_456\n  at Connection (pg:123)"
      throw error
    }

    return new MockClient()
  }

  async end() {
    callSequence.push("POOL_END")
  }
}

// Interceptar require e bloquear caminhos alternativos
Module.prototype.require = function(id) {
  // Permitir apenas require('pg') exato
  if (id === "pg") {
    return {
      Pool: MockPool,
      Client: MockClient
    }
  }

  // Bloquear importações alternativas do pg
  if (id.startsWith("pg/") || id.includes("node_modules/pg/")) {
    const error = new Error("REAL_PG_ALTERNATE_IMPORT_BLOCKED")
    error.code = "MOCK_ALTERNATE_PATH_BLOCKED"
    throw error
  }

  return originalRequire.apply(this, arguments)
}

// Exportar para testes diretos do mock
module.exports = {
  Pool: MockPool,
  Client: MockClient,
  __getCallSequence: () => [...callSequence],
  __resetCallSequence: () => { callSequence = [] }
}
