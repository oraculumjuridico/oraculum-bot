/**
 * Teste de sanitização do output do preflight-migration-v3.js
 *
 * Objetivo: Provar que identificadores operacionais, credenciais e dados
 * sensíveis NÃO aparecem em stdout ou stderr, mesmo em cenários de erro.
 *
 * Isolamento: Usa mock determinístico do pg, sem DNS, socket ou rede real.
 * Mock fechado: rejeita queries desconhecidas e comandos de escrita.
 */

"use strict"

const { spawn } = require("child_process")
const { test } = require("node:test")
const assert = require("node:assert")
const path = require("path")

/**
 * Executa o preflight em subprocesso isolado com mock do pg
 */
function runPreflight(env = {}, mockBehavior = "success") {
  return new Promise((resolve) => {
    // Ambiente mínimo: apenas PATH e NODE necessários
    const minimalEnv = {
      PATH: process.env.PATH,
      NODE_PATH: process.env.NODE_PATH,
      SystemRoot: process.env.SystemRoot, // Windows
      MOCK_BEHAVIOR: mockBehavior
    }

    // Adicionar apenas as variáveis de teste necessárias
    for (const [key, value] of Object.entries(env)) {
      if (!key.includes("_DATABASE_URL") || key === "EXTERNAL_STATE_DATABASE_URL") {
        minimalEnv[key] = value
      }
    }

    // Garantir que credenciais PG* não vazam
    delete minimalEnv.PGHOST
    delete minimalEnv.PGPORT
    delete minimalEnv.PGUSER
    delete minimalEnv.PGPASSWORD
    delete minimalEnv.PGDATABASE
    delete minimalEnv.PGSERVICE
    delete minimalEnv.PGPASSFILE

    const mockPath = path.resolve(__dirname, "pg-mock.js")

    const child = spawn("node", [
      "--require", mockPath,
      "scripts/preflight-migration-v3.js"
    ], {
      env: minimalEnv,
      stdio: ["ignore", "pipe", "pipe"]
    })

    let stdout = ""
    let stderr = ""

    child.stdout.on("data", (data) => { stdout += data.toString() })
    child.stderr.on("data", (data) => { stderr += data.toString() })

    const timeout = setTimeout(() => {
      child.kill("SIGKILL")
      resolve({ code: -1, stdout, stderr, timedOut: true })
    }, 3000)

    child.on("close", (code) => {
      clearTimeout(timeout)
      resolve({ code, stdout, stderr, timedOut: false })
    })
  })
}

/**
 * AUTOTESTES DO MOCK
 */

test("mock: rejeita query desconhecida", async () => {
  const mock = require("./pg-mock.js")
  const client = new mock.Client()

  await assert.rejects(
    async () => await client.query("SELECT * FROM unknown_table"),
    { message: "MOCK_UNEXPECTED_QUERY" },
    "Query desconhecida deve ser rejeitada"
  )
})

test("mock: rejeita INSERT", async () => {
  const mock = require("./pg-mock.js")
  const client = new mock.Client()

  await assert.rejects(
    async () => await client.query("INSERT INTO test VALUES (1)"),
    { message: "MOCK_WRITE_QUERY_REJECTED" },
    "INSERT deve ser rejeitado"
  )
})

test("mock: rejeita UPDATE", async () => {
  const mock = require("./pg-mock.js")
  const client = new mock.Client()

  await assert.rejects(
    async () => await client.query("UPDATE test SET x = 1"),
    { message: "MOCK_WRITE_QUERY_REJECTED" },
    "UPDATE deve ser rejeitado"
  )
})

test("mock: rejeita DELETE", async () => {
  const mock = require("./pg-mock.js")
  const client = new mock.Client()

  await assert.rejects(
    async () => await client.query("DELETE FROM test"),
    { message: "MOCK_WRITE_QUERY_REJECTED" },
    "DELETE deve ser rejeitado"
  )
})

test("mock: aceita BEGIN TRANSACTION READ ONLY", async () => {
  const mock = require("./pg-mock.js")
  const client = new mock.Client()

  const result = await client.query("BEGIN TRANSACTION READ ONLY")
  assert.deepStrictEqual(result.rows, [], "BEGIN deve ser aceito")
})

test("mock: aceita ROLLBACK", async () => {
  const mock = require("./pg-mock.js")
  mock.__resetCallSequence()
  const client = new mock.Client()

  await client.query("ROLLBACK")
  const sequence = mock.__getCallSequence()

  assert.ok(sequence.includes("ROLLBACK"), "ROLLBACK deve ser registrado")
})

test("mock: aceita SELECT COUNT(*) com to_regclass", async () => {
  const mock = require("./pg-mock.js")
  const client = new mock.Client()

  const result = await client.query("SELECT COUNT(*) FROM pg_tables WHERE tablename = to_regclass('test')")
  assert.ok(result.rows, "Query permitida deve retornar rows")
})

test("mock: bloqueia importação alternativa pg/lib/client", () => {
  assert.throws(
    () => require("pg/lib/client"),
    { message: "REAL_PG_ALTERNATE_IMPORT_BLOCKED" },
    "Importação alternativa deve ser bloqueada"
  )
})

test("mock: registra POOL_END", async () => {
  const mock = require("./pg-mock.js")
  mock.__resetCallSequence()
  const pool = new mock.Pool({})

  await pool.end()
  const sequence = mock.__getCallSequence()

  assert.ok(sequence.includes("POOL_END"), "end() deve ser registrado")
})

test("mock: registra sequência completa", async () => {
  // Salvar MOCK_BEHAVIOR atual
  const originalBehavior = process.env.MOCK_BEHAVIOR
  process.env.MOCK_BEHAVIOR = "success"

  // Recarregar mock com novo comportamento
  delete require.cache[require.resolve("./pg-mock.js")]
  const mock = require("./pg-mock.js")
  mock.__resetCallSequence()

  const pool = new mock.Pool({})
  const client = await pool.connect()
  await client.query("BEGIN TRANSACTION READ ONLY")
  await client.query("SELECT current_database()")
  await client.query("ROLLBACK")
  client.release()
  await pool.end()

  const sequence = mock.__getCallSequence()

  assert.ok(sequence.includes("POOL_CONSTRUCTOR"), "Pool deve ser construído")
  assert.ok(sequence.includes("POOL_CONNECT"), "Pool deve conectar")
  assert.ok(sequence.includes("BEGIN_READ_ONLY"), "BEGIN deve ser registrado")
  assert.ok(sequence.includes("ROLLBACK"), "ROLLBACK deve ser registrado")
  assert.ok(sequence.includes("RELEASE"), "Release deve ser registrado")
  assert.ok(sequence.includes("POOL_END"), "End deve ser registrado")

  // Restaurar
  process.env.MOCK_BEHAVIOR = originalBehavior
})

/**
 * TESTES DE SANITIZAÇÃO DO PREFLIGHT
 */

test("preflight: falha fechada quando EXTERNAL_STATE_DATABASE_URL ausente", async () => {
  const { code, stdout, stderr, timedOut } = await runPreflight({}, "success")

  assert.strictEqual(timedOut, false, "Não deve ter timeout")
  assert.notStrictEqual(code, 0, "Deve retornar exit code não-zero")
  assert.match(stdout, /EXTERNAL_STATE_DATABASE_URL=ABSENT/, "Deve reportar variável ausente")
  assert.doesNotMatch(stdout, /password/i, "Stdout não deve conter 'password'")
  assert.doesNotMatch(stderr, /password/i, "Stderr não deve conter 'password'")
})

test("preflight: connection string com sentinelas NÃO aparece em output", async () => {
  const poisonedConnectionString = "postgresql://SENTINEL_USER_XYZ:SENTINEL_PASS_ABC@SENTINEL_HOST_123:5432/SENTINEL_DB_NAME"

  const { code, stdout, stderr, timedOut } = await runPreflight({
    EXTERNAL_STATE_DATABASE_URL: poisonedConnectionString
  }, "connection_error")

  assert.strictEqual(timedOut, false, "Não deve ter timeout")
  assert.notStrictEqual(code, 0, "Deve retornar exit code não-zero")

  // Deve ter confirmado variável presente
  assert.match(stdout, /EXTERNAL_STATE_DATABASE_URL=PRESENT/, "Deve reconhecer variável")

  // Sentinelas NÃO devem aparecer
  assert.doesNotMatch(stdout, /SENTINEL_USER_XYZ/, "Stdout não deve conter usuário sentinela")
  assert.doesNotMatch(stdout, /SENTINEL_PASS_ABC/, "Stdout não deve conter senha sentinela")
  assert.doesNotMatch(stdout, /SENTINEL_HOST_123/, "Stdout não deve conter host sentinela")
  assert.doesNotMatch(stdout, /SENTINEL_DB_NAME/, "Stdout não deve conter nome do banco sentinela")

  assert.doesNotMatch(stderr, /SENTINEL_USER_XYZ/, "Stderr não deve conter usuário sentinela")
  assert.doesNotMatch(stderr, /SENTINEL_PASS_ABC/, "Stderr não deve conter senha sentinela")
  assert.doesNotMatch(stderr, /SENTINEL_HOST_123/, "Stderr não deve conter host sentinela")
  assert.doesNotMatch(stderr, /SENTINEL_DB_NAME/, "Stderr não deve conter nome do banco sentinela")

  // Deve reportar erro sanitizado
  assert.match(stdout, /DATABASE_CONNECTION_OR_QUERY_ERROR|UNHANDLED_ERROR/, "Deve reportar erro sanitizado")
})

test("preflight: identificadores de case usados internamente NÃO aparecem em output", async () => {
  const { code, stdout, stderr, timedOut } = await runPreflight({
    EXTERNAL_STATE_DATABASE_URL: "postgresql://test:test@test-host:5432/test_db"
  }, "success")

  assert.strictEqual(timedOut, false, "Não deve ter timeout")

  // Deve ter chegado ao ROLLBACK (caminho normal)
  assert.match(stdout, /ROLLBACK executado/, "Deve ter executado ROLLBACK")

  // Identificadores hard-coded no script NÃO devem aparecer no output
  assert.doesNotMatch(stdout, /inss-e3dfb0f332b117d60bf2/, "Stdout não deve conter [CASE_IMPORT_ID_REDACTED]")
  assert.doesNotMatch(stdout, /PRV\.260714\.707/, "Stdout não deve conter [CASE_NUMBER_REDACTED]")
  assert.doesNotMatch(stderr, /inss-e3dfb0f332b117d60bf2/, "Stderr não deve conter [CASE_IMPORT_ID_REDACTED]")
  assert.doesNotMatch(stderr, /PRV\.260714\.707/, "Stderr não deve conter [CASE_NUMBER_REDACTED]")
})

test("preflight: catch interno alcançado com ROLLBACK comprovado", async () => {
  const { code, stdout, stderr, timedOut } = await runPreflight({
    EXTERNAL_STATE_DATABASE_URL: "postgresql://test:test@test-host:5432/test_db"
  }, "query_error_after_begin")

  assert.strictEqual(timedOut, false, "Não deve ter timeout")
  assert.notStrictEqual(code, 0, "Deve retornar exit code não-zero")

  // Deve ter iniciado transação READ ONLY
  assert.match(stdout, /Transação READ ONLY iniciada/, "Deve confirmar BEGIN")

  // Deve reportar erro sanitizado (catch interno)
  assert.match(stdout, /ERRO_TIPO: DATABASE_CONNECTION_OR_QUERY_ERROR/, "Catch interno alcançado")
  assert.match(stdout, /ERRO_CODIGO: (42P01|UNKNOWN)/, "Código sanitizado")
  assert.match(stdout, /BLOCKED_DATABASE_ERROR/, "Conclusão de erro")

  // Não deve vazar sentinelas
  assert.doesNotMatch(stdout, /SENTINEL/, "Não deve vazar sentinelas")
  assert.doesNotMatch(stderr, /SENTINEL/, "Stderr não deve conter sentinelas")
})

test("preflight: catch fatal alcançado sem vazamento", async () => {
  const { code, stdout, stderr, timedOut } = await runPreflight({
    EXTERNAL_STATE_DATABASE_URL: "postgresql://test:test@test-host:5432/test_db"
  }, "fatal_pool_error")

  assert.strictEqual(timedOut, false, "Não deve ter timeout")
  assert.notStrictEqual(code, 0, "Deve retornar exit code não-zero")

  // Deve reportar erro fatal (catch externo)
  assert.match(stdout, /ERRO_TIPO: UNHANDLED_ERROR/, "Catch fatal alcançado")
  assert.match(stdout, /ERRO_CODIGO: (MOCK_POOL_ERROR|UNKNOWN)/, "Código sanitizado")

  // Não deve vazar sentinelas de erro
  assert.doesNotMatch(stdout, /Mock pool error/, "Não deve vazar mensagem de erro literal")
  assert.doesNotMatch(stderr, /SENTINEL/, "Stderr não deve conter sentinelas")
})

test("preflight: NÃO usa DATABASE_URL como fallback", async () => {
  const { code, stdout, stderr, timedOut } = await runPreflight({
    EXTERNAL_STATE_DATABASE_URL: "",
    DATABASE_URL: "postgresql://fallback:secret@fallback-host:5432/fallback_db"
  }, "success")

  assert.strictEqual(timedOut, false, "Não deve ter timeout")
  assert.notStrictEqual(code, 0, "Deve retornar exit code não-zero")
  assert.match(stdout, /EXTERNAL_STATE_DATABASE_URL=ABSENT/, "Deve reportar variável ausente")
  assert.doesNotMatch(stdout, /fallback/, "Não deve usar DATABASE_URL")
})

test("preflight: error.code malicioso é normalizado para UNKNOWN", async () => {
  const { code, stdout, stderr, timedOut } = await runPreflight({
    EXTERNAL_STATE_DATABASE_URL: "postgresql://test:test@test-host:5432/test_db"
  }, "error_with_malicious_code")

  assert.strictEqual(timedOut, false, "Não deve ter timeout")
  assert.notStrictEqual(code, 0, "Deve retornar exit code não-zero")

  // Sentinela maliciosa no code não deve aparecer
  assert.doesNotMatch(stdout, /SENTINEL_MALICIOUS_CODE_WITH_PASSWORD_XYZ/, "Code malicioso não deve vazar")
  assert.doesNotMatch(stderr, /SENTINEL_MALICIOUS_CODE/, "Stderr não deve conter code malicioso")

  // Deve normalizar para UNKNOWN
  assert.match(stdout, /ERRO_CODIGO: UNKNOWN/, "Code inválido deve virar UNKNOWN")
})

test("preflight: error.code como objeto é normalizado", async () => {
  const { code, stdout, stderr, timedOut } = await runPreflight({
    EXTERNAL_STATE_DATABASE_URL: "postgresql://test:test@test-host:5432/test_db"
  }, "error_with_code_as_object")

  assert.strictEqual(timedOut, false, "Não deve ter timeout")
  assert.notStrictEqual(code, 0, "Deve retornar exit code não-zero")

  assert.doesNotMatch(stdout, /SENTINEL_OBJECT_CODE/, "Object code não deve vazar")
  assert.doesNotMatch(stdout, /\[object Object\]/, "Não deve imprimir [object Object]")
  assert.match(stdout, /ERRO_CODIGO: UNKNOWN/, "Object code deve virar UNKNOWN")
})

test("preflight: error.code ausente resulta em UNKNOWN", async () => {
  const { code, stdout, stderr, timedOut } = await runPreflight({
    EXTERNAL_STATE_DATABASE_URL: "postgresql://test:test@test-host:5432/test_db"
  }, "error_without_code")

  assert.strictEqual(timedOut, false, "Não deve ter timeout")
  assert.notStrictEqual(code, 0, "Deve retornar exit code não-zero")
  assert.match(stdout, /ERRO_CODIGO: UNKNOWN/, "Ausência de code deve resultar em UNKNOWN")
})

test("preflight: senha em error.message e stack não vaza", async () => {
  const { code, stdout, stderr, timedOut } = await runPreflight({
    EXTERNAL_STATE_DATABASE_URL: "postgresql://test:SENTINEL_PASSWORD_123@test-host:5432/test_db"
  }, "connection_error_with_password")

  assert.strictEqual(timedOut, false, "Não deve ter timeout")
  assert.notStrictEqual(code, 0, "Deve retornar exit code não-zero")

  // Deve ter alcançado caminho de erro
  assert.match(stdout, /ERRO_TIPO: (DATABASE_CONNECTION_OR_QUERY_ERROR|UNHANDLED_ERROR)/, "Caminho de erro alcançado")

  // Sentinelas de senha e host não devem aparecer
  assert.doesNotMatch(stdout, /SENTINEL_PASSWORD_123/, "Senha no error.message não deve vazar")
  assert.doesNotMatch(stdout, /SENTINEL_HOST_456/, "Host no stack não deve vazar")
  assert.doesNotMatch(stdout, /SENTINEL_PASS_CODE/, "Code malicioso não deve vazar")

  assert.doesNotMatch(stderr, /SENTINEL_PASSWORD/, "Stderr não deve conter senha")
  assert.doesNotMatch(stderr, /SENTINEL_HOST/, "Stderr não deve conter host")
})

test("preflight: caminho normal simulado com ROLLBACK comprovado", async () => {
  const { code, stdout, stderr, timedOut } = await runPreflight({
    EXTERNAL_STATE_DATABASE_URL: "postgresql://test:test@test-host:5432/test_db"
  }, "success")

  assert.strictEqual(timedOut, false, "Não deve ter timeout")

  // Deve confirmar variável presente
  assert.match(stdout, /EXTERNAL_STATE_DATABASE_URL=PRESENT/, "Variável confirmada")

  // Deve iniciar transação READ ONLY
  assert.match(stdout, /Transação READ ONLY iniciada/, "BEGIN READ ONLY executado")

  // Deve executar ROLLBACK
  assert.match(stdout, /ROLLBACK executado/, "ROLLBACK comprovado")

  // Deve ter conclusão
  assert.match(stdout, /CONCLUSÃO: (MIGRATION_V3_SAFE_TO_APPLY|MIGRATION_V3_BLOCKED_BY_EXISTING_ROWS)/, "Conclusão presente")

  // Não deve conter sentinelas
  assert.doesNotMatch(stdout, /SENTINEL/, "Não deve ter sentinelas")
  assert.doesNotMatch(stderr, /SENTINEL/, "Stderr não deve ter sentinelas")
})

test("preflight: código PostgreSQL válido (5 chars) é preservado", async () => {
  const { code, stdout, stderr, timedOut } = await runPreflight({
    EXTERNAL_STATE_DATABASE_URL: "postgresql://test:test@test-host:5432/test_db"
  }, "query_error_after_begin")

  assert.strictEqual(timedOut, false, "Não deve ter timeout")
  assert.notStrictEqual(code, 0, "Deve retornar exit code não-zero")

  // Mock retorna 42P01 (código PostgreSQL válido de 5 chars)
  assert.match(stdout, /ERRO_CODIGO: 42P01/, "Código PostgreSQL válido preservado")
})

console.log("✓ Todos os cenários de sanitização, isolamento e autotestes do mock executados")
