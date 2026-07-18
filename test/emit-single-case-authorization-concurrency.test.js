"use strict"

/**
 * TESTE DE CONCORRÊNCIA REAL — POSTGRESQL ISOLADO
 *
 * Este teste prova que duas emissões simultâneas para o mesmo binding
 * não produzem dois pares, não deixam registros parciais e terminam
 * de forma fail-closed.
 *
 * REQUISITOS:
 * - Duas conexões PostgreSQL independentes (clientA, clientB)
 * - Intercalação explícita com barreiras controladas
 * - Exercita código produtivo real (não reimplementação)
 * - Verificação do estado final persistido
 * - Isolamento READ COMMITTED (padrão PostgreSQL)
 * - Testes de rollback com falhas injetadas
 * - Schema exclusivo por cenário
 * - Execução sequencial (não paralela)
 *
 * EXECUÇÃO:
 * - Modo normal: pula se TEST_POSTGRES_DATABASE_URL não estiver definida
 * - Modo obrigatório: REQUIRE_REAL_POSTGRES_CONCURRENCY_TEST=1 falha se não houver PostgreSQL
 */

const assert = require("node:assert/strict")
const { test } = require("node:test")
const crypto = require("node:crypto")
const { Pool } = require("pg")

const { TABLE_NAME, CREATE_TABLE_SQL } = require("../src/infrastructure/single-case-authorization-postgres")
const { migrateSingleCaseAuthorizationV2 } = require("../src/infrastructure/single-case-authorization-v2-migration")
const { migrateSingleCaseAuthorizationV3 } = require("../src/infrastructure/single-case-authorization-v3-migration")
const { emitAuthorizationPair } = require("../src/domain/single-case-authorization-emitter")
const { authorizationPayload, AUTHORIZATION_SCHEMA_VERSION, AUTH_SCOPES } = require("../src/domain/single-case-apply-contracts")
const { createSingleCaseAuthorizationSigner } = require("../src/domain/single-case-authorization-signer")

// ── CONFIGURAÇÃO ─────────────────────────────────────────────────────────────

const TEST_DATABASE_URL = process.env.TEST_POSTGRES_DATABASE_URL
const OPERATIONAL_DATABASE_URL = process.env.EXTERNAL_STATE_DATABASE_URL
const REQUIRE_REAL_TEST = process.env.REQUIRE_REAL_POSTGRES_CONCURRENCY_TEST === "1"

const CASE_ID = "test-concurrency-case"
const CASE_FP = "abc123def456"
const CASE_NUM = "TST.260717.001"
const APH = "a".repeat(64)
const PH = "b".repeat(64)
const MH = "c".repeat(64)
const REH = "d".repeat(64)
const ISSUER_A = "issuer-a"
const ISSUER_B = "issuer-b"
const NOW = "2026-07-17T12:00:00.000Z"
const FUTURE = "2026-07-17T12:30:00.000Z"

// Timeouts curtos para testes
const LOCK_TIMEOUT_MS = 10000  // 10s
const STATEMENT_TIMEOUT_MS = 15000  // 15s
const BARRIER_TIMEOUT_MS = 20000  // 20s
const LOCK_OBSERVATION_TIMEOUT_MS = 5000  // 5s para observar contenção

function makeSchemaName() {
  return `test_auth_${crypto.randomBytes(8).toString("hex")}`
}

// Normalizar pg_blocking_pids para array de inteiros
function normalizeBlockingPids(value) {
  if (!Array.isArray(value)) {
    throw new Error("CONCURRENCY_BLOCKING_PIDS_INVALID: esperado array, recebeu " + typeof value)
  }

  const normalized = value.map(Number)
  if (normalized.some(pid => !Number.isInteger(pid) || pid <= 0)) {
    throw new Error("CONCURRENCY_BLOCKING_PIDS_INVALID: array contém valores inválidos")
  }

  return normalized
}

// Observar se B está aguardando lock de A usando pg_blocking_pids
async function observeLockContention(pool, schemaName, pidA, pidB, timeoutMs = LOCK_OBSERVATION_TIMEOUT_MS) {
  const start = Date.now()

  while (Date.now() - start < timeoutMs) {
    try {
      const monitor = await pool.connect()
      try {
        await monitor.query(`SET search_path TO ${schemaName}`)

        // Consultar pg_stat_activity para A e B simultaneamente
        const result = await monitor.query(`
          SELECT
            pid,
            state,
            wait_event_type,
            wait_event,
            xact_start,
            pg_blocking_pids(pid) AS blocking_pids
          FROM pg_stat_activity
          WHERE pid = ANY($1::int[])
        `, [[pidB, pidA]])

        if (result.rowCount >= 2) {
          const rowB = result.rows.find(r => r.pid === pidB)
          const rowA = result.rows.find(r => r.pid === pidA)

          if (!rowB || !rowA) {
            console.log(`[LOCK OBSERVATION] A ou B não encontrados em pg_stat_activity`)
            continue
          }

          // Confirmar que B está em estado de espera por Lock
          if (rowB.wait_event_type !== 'Lock') {
            continue
          }

          // Confirmar que A possui transação aberta
          if (rowA.xact_start === null) {
            console.log(`[LOCK OBSERVATION] A não possui transação aberta`)
            continue
          }

          // Confirmar que A está entre os bloqueadores de B
          let blockingPids
          try {
            blockingPids = normalizeBlockingPids(rowB.blocking_pids)
          } catch (err) {
            console.log(`[LOCK OBSERVATION] Erro ao normalizar blocking_pids: ${err.message}`)
            console.log(`[LOCK OBSERVATION] Valor recebido:`, rowB.blocking_pids)
            throw err
          }

          if (blockingPids.includes(pidA)) {
            console.log(`[LOCK OBSERVATION] B (PID ${pidB}) aguardando lock`)
            console.log(`[LOCK OBSERVATION] Bloqueadores: ${JSON.stringify(blockingPids)}`)
            console.log(`[LOCK OBSERVATION] A (PID ${pidA}) confirmado como bloqueador`)
            console.log(`[LOCK OBSERVATION] A possui transação aberta: ${rowA.xact_start !== null}`)
            console.log(`[LOCK OBSERVATION] B wait_event: ${rowB.wait_event}`)
            console.log(`[LOCK OBSERVATION] B state: ${rowB.state}`)
            console.log(`[LOCK OBSERVATION] A state: ${rowA.state}`)

            return {
              observed: true,
              evidence: {
                blocked_pid: pidB,
                blocking_pids: blockingPids,
                blocker_has_transaction: rowA.xact_start !== null,
                wait_event_type: rowB.wait_event_type,
                wait_event: rowB.wait_event,
                blocked_state: rowB.state,
                blocker_state: rowA.state
              }
            }
          } else {
            console.log(`[LOCK OBSERVATION] B aguardando lock, mas A não é bloqueador. Bloqueadores: ${JSON.stringify(blockingPids)}`)
          }
        }
      } finally {
        monitor.release()
      }
    } catch (err) {
      // Ignorar erros temporários de observação
      console.log(`[LOCK OBSERVATION] Erro temporário: ${err.message}`)
    }

    // Aguardar um pouco antes de tentar novamente
    await new Promise(resolve => setTimeout(resolve, 50))
  }

  return { observed: false }
}

async function setupTestSchema(pool, schemaName) {
  const setup = await pool.connect()
  try {
    // Criar schema exclusivo
    await setup.query(`CREATE SCHEMA IF NOT EXISTS ${schemaName}`)
    await setup.query(`SET search_path TO ${schemaName}`)

    // Configurar timeouts
    await setup.query(`SET lock_timeout = '${LOCK_TIMEOUT_MS}ms'`)
    await setup.query(`SET statement_timeout = '${STATEMENT_TIMEOUT_MS}ms'`)

    // Criar migration registry
    await setup.query(`CREATE TABLE IF NOT EXISTS oraculum_state_migrations (
      migration_id TEXT PRIMARY KEY,
      details JSONB,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`)

    // Aplicar schema V1
    await setup.query("BEGIN")
    await setup.query(CREATE_TABLE_SQL)
    await setup.query("COMMIT")

    // Aplicar migrations V2 e V3 com search_path configurado
    const poolWithSchema = new Pool({
      connectionString: TEST_DATABASE_URL,
      max: 1,
      options: `-c search_path=${schemaName}`
    })

    try {
      await migrateSingleCaseAuthorizationV2(poolWithSchema)
      await migrateSingleCaseAuthorizationV3(poolWithSchema)
    } finally {
      await poolWithSchema.end()
    }

    // Validar schema completo
    await setup.query(`SET search_path TO ${schemaName}`)

    const columns = await setup.query(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema=$1 AND table_name=$2
       ORDER BY column_name`,
      [schemaName, TABLE_NAME]
    )
    const columnNames = columns.rows.map(r => r.column_name).sort()
    const requiredColumns = [
      "authorization_id", "authorizable_plan_hash", "plan_hash", "manifest_hash",
      "reservation_evidence_hash", "consumed_at", "consumed_by", "operational_status",
      "superseded_at", "signature", "signature_algorithm", "schema_version",
      "authorization_type", "case_import_id", "case_fingerprint", "case_number",
      "scope", "issuer", "issued_at", "expires_at", "revoked", "revoked_at",
      "revocation_reason", "created_at", "audit_metadata"
    ].sort()

    const missing = requiredColumns.filter(col => !columnNames.includes(col))
    if (missing.length > 0) {
      throw new Error(`AUTHORIZATION_TEST_SCHEMA_INCOMPLETE: missing columns ${missing.join(", ")}`)
    }

    // Validar constraints V2 e V3
    const constraints = await setup.query(
      `SELECT conname FROM pg_constraint
       WHERE conrelid=to_regclass($1)
       AND conname = ANY($2::text[])`,
      [`${schemaName}.${TABLE_NAME}`, ["single_case_auth_v2_binding_check", "single_case_auth_consumption_check", "single_case_auth_v3_scope_check"]]
    )

    if (constraints.rowCount !== 3) {
      throw new Error("AUTHORIZATION_TEST_SCHEMA_INCOMPLETE: V2/V3 constraints missing")
    }

    // Validar que V2 scope check foi removida
    const v2ScopeCheck = await setup.query(
      `SELECT conname FROM pg_constraint
       WHERE conrelid=to_regclass($1)
       AND conname = $2`,
      [`${schemaName}.${TABLE_NAME}`, "single_case_auth_v2_scope_check"]
    )

    if (v2ScopeCheck.rowCount > 0) {
      throw new Error("AUTHORIZATION_TEST_SCHEMA_INCOMPLETE: V2 scope constraint should be replaced by V3")
    }

    // Validar índice de binding ativo
    const indexes = await setup.query(
      `SELECT indexname FROM pg_indexes
       WHERE schemaname=$1
       AND tablename=$2
       AND indexname=$3`,
      [schemaName, TABLE_NAME, "single_case_auth_one_active_binding"]
    )

    if (indexes.rowCount !== 1) {
      throw new Error("AUTHORIZATION_TEST_SCHEMA_INCOMPLETE: active binding index missing")
    }

    console.log(`[SCHEMA ${schemaName}] Validado: 25 colunas, constraints V2/V3, índices presentes`)
  } finally {
    setup.release()
  }
}

function makeKeys(issuer) {
  return crypto.generateKeyPairSync("ed25519")
}

function makeSignedRecords(issuer) {
  const keys = makeKeys(issuer)
  const signer = createSingleCaseAuthorizationSigner({ privateKey: keys.privateKey, clock: () => NOW })

  const records = []
  for (const [type, scope] of Object.entries(AUTH_SCOPES)) {
    // Validar escopo antes de assinar - usar constantes produtivas
    const expectedScope = AUTH_SCOPES[type]
    if (!expectedScope) {
      throw new Error(`FIXTURE_SCOPE_INVALID: tipo ${type} não reconhecido em AUTH_SCOPES`)
    }

    if (JSON.stringify([...scope].sort()) !== JSON.stringify([...expectedScope].sort())) {
      throw new Error(`FIXTURE_SCOPE_INVALID: ${type} deveria ter ${JSON.stringify([...expectedScope].sort())}, recebeu ${JSON.stringify([...scope].sort())}`)
    }

    const record = {
      authorizationId: `new-${issuer}-${type}-${Date.now()}`,
      schemaVersion: AUTHORIZATION_SCHEMA_VERSION,
      type,
      caseImportId: CASE_ID,
      caseFingerprint: CASE_FP,
      caseNumber: CASE_NUM,
      authorizablePlanHash: APH,
      planHash: PH,
      manifestHash: MH,
      reservationEvidenceHash: REH,
      scope: [...scope].sort(),
      issuer,
      issuedAt: NOW,
      expiresAt: FUTURE,
      revoked: false,
    }
    records.push(signer.sign(record))
  }

  return records
}

async function insertExpiredPair(client, schemaName, issuer) {
  await client.query(`SET search_path TO ${schemaName}`)

  const keys = makeKeys(issuer)
  const simulatedNow = "2026-07-17T11:00:00.000Z"
  const simulatedIssuedAt = "2026-07-17T11:00:00.000Z"
  const simulatedExpiresAt = "2026-07-17T11:30:00.000Z"

  const signer = createSingleCaseAuthorizationSigner({
    privateKey: keys.privateKey,
    clock: () => simulatedNow
  })

  for (const [type, scope] of Object.entries(AUTH_SCOPES)) {
    const expectedScope = AUTH_SCOPES[type]
    if (!expectedScope) {
      throw new Error(`FIXTURE_SCOPE_INVALID: tipo ${type} não reconhecido em AUTH_SCOPES`)
    }

    if (JSON.stringify([...scope].sort()) !== JSON.stringify([...expectedScope].sort())) {
      throw new Error(`FIXTURE_SCOPE_INVALID: ${type} deveria ter ${JSON.stringify([...expectedScope].sort())}, recebeu ${JSON.stringify([...scope].sort())}`)
    }

    const record = {
      authorizationId: `expired-${issuer}-${type}`,
      schemaVersion: AUTHORIZATION_SCHEMA_VERSION,
      type,
      caseImportId: CASE_ID,
      caseFingerprint: CASE_FP,
      caseNumber: CASE_NUM,
      authorizablePlanHash: APH,
      planHash: PH,
      manifestHash: MH,
      reservationEvidenceHash: REH,
      scope: [...scope].sort(),
      issuer,
      issuedAt: simulatedIssuedAt,
      expiresAt: simulatedExpiresAt,
      revoked: false,
    }

    const signed = signer.sign(record)

    await client.query(
      `INSERT INTO ${TABLE_NAME} (
         authorization_id, schema_version, authorization_type,
         case_import_id, case_fingerprint, case_number,
         authorizable_plan_hash, plan_hash, manifest_hash, reservation_evidence_hash,
         scope, issuer, issued_at, expires_at,
         revoked, operational_status,
         consumed_at, consumed_by,
         signature, signature_algorithm,
         audit_metadata
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12,$13,$14,$15,$16,NULL,NULL,$17,$18,$19::jsonb)`,
      [
        signed.authorizationId, signed.schemaVersion, signed.type,
        signed.caseImportId, signed.caseFingerprint, signed.caseNumber,
        signed.authorizablePlanHash, signed.planHash, signed.manifestHash, signed.reservationEvidenceHash,
        JSON.stringify(signed.scope), signed.issuer, signed.issuedAt, signed.expiresAt,
        signed.revoked, "ACTIVE",
        signed.proof, signed.algorithm,
        "{}"
      ]
    )
  }
}

async function cleanupSchema(schemaName) {
  if (!schemaName) return

  // Criar novo pool temporário para cleanup (pool original pode estar encerrado)
  const cleanupPool = new Pool({ connectionString: TEST_DATABASE_URL, max: 1 })
  try {
    const client = await cleanupPool.connect()
    try {
      await client.query(`DROP SCHEMA IF EXISTS ${schemaName} CASCADE`)
      console.log(`[CLEANUP] Schema ${schemaName} removido`)
    } catch (err) {
      console.error(`[CLEANUP] Falha ao remover schema ${schemaName}:`, err.message)
      throw err  // Relançar erro de cleanup para não silenciar
    } finally {
      client.release()
    }
  } finally {
    await cleanupPool.end()
  }
}

// ── TESTE COM POSTGRESQL REAL ────────────────────────────────────────────────

async function testConcurrency() {
  if (TEST_DATABASE_URL === OPERATIONAL_DATABASE_URL) {
    throw new Error("SAFETY_VIOLATION: TEST_POSTGRES_DATABASE_URL aponta para banco operacional")
  }

  const schemaName = makeSchemaName()
  const pool = new Pool({ connectionString: TEST_DATABASE_URL, max: 5 })
  let clientA, clientB, pidA, pidB

  // Instrumentação de erros com precedência
  let primaryError = null
  let asyncError = null
  let cleanupError = null

  let unhandledRejections = []
  let uncaughtExceptions = []

  const rejectionHandler = (err) => {
    unhandledRejections.push(err)
    console.error(`[ERROR] unhandledRejection: ${err.message}`)
  }

  const exceptionHandler = (err) => {
    uncaughtExceptions.push(err)
    console.error(`[ERROR] uncaughtException: ${err.message}`)
  }

  process.on("unhandledRejection", rejectionHandler)
  process.on("uncaughtException", exceptionHandler)

  try {
    console.log(`\n[SCENARIO_START] Concorrência - Schema: ${schemaName}`)

    // Setup: aplicar schema V1 + V2 + V3
    await setupTestSchema(pool, schemaName)

    // Inserir par expirado inicial
    const init = await pool.connect()
    try {
      await init.query(`SET search_path TO ${schemaName}`)
      await init.query(`SET lock_timeout = '${LOCK_TIMEOUT_MS}ms'`)
      await init.query(`SET statement_timeout = '${STATEMENT_TIMEOUT_MS}ms'`)
      await insertExpiredPair(init, schemaName, "initial")
    } finally {
      init.release()
    }

    // Obter duas conexões independentes
    clientA = await pool.connect()
    clientB = await pool.connect()

    await clientA.query(`SET search_path TO ${schemaName}`)
    await clientA.query(`SET lock_timeout = '${LOCK_TIMEOUT_MS}ms'`)
    await clientA.query(`SET statement_timeout = '${STATEMENT_TIMEOUT_MS}ms'`)

    await clientB.query(`SET search_path TO ${schemaName}`)
    await clientB.query(`SET lock_timeout = '${LOCK_TIMEOUT_MS}ms'`)
    await clientB.query(`SET statement_timeout = '${STATEMENT_TIMEOUT_MS}ms'`)

    // Obter PIDs das conexões
    const pidResultA = await clientA.query("SELECT pg_backend_pid() AS pid")
    const pidResultB = await clientB.query("SELECT pg_backend_pid() AS pid")
    pidA = pidResultA.rows[0].pid
    pidB = pidResultB.rows[0].pid

    console.log(`[CONCURRENCY ${schemaName}] PID A: ${pidA}, PID B: ${pidB}`)

    // Verificar isolamento
    const isolationA = await clientA.query("SHOW transaction_isolation")
    const isolationB = await clientB.query("SHOW transaction_isolation")
    console.log(`[CONCURRENCY ${schemaName}] Isolamento A: ${isolationA.rows[0].transaction_isolation}`)
    console.log(`[CONCURRENCY ${schemaName}] Isolamento B: ${isolationB.rows[0].transaction_isolation}`)

    // Preparar registros
    const recordsA = makeSignedRecords(ISSUER_A)
    const recordsB = makeSignedRecords(ISSUER_B)
    const binding = {
      caseImportId: CASE_ID,
      caseFingerprint: CASE_FP,
      caseNumber: CASE_NUM,
      authorizablePlanHash: APH,
    }

    // Barreiras de sincronização
    let releaseB, notifyBStarted
    const barrierB = new Promise(resolve => { releaseB = resolve })
    const bStartedBarrier = new Promise(resolve => { notifyBStarted = resolve })

    // Emissor A: libera B e aguarda confirmação de contenção antes de COMMIT
    const emissionA = (async () => {
      try {
        console.log(`[EMISSOR A ${schemaName}] Iniciando emissão`)

        const hooks = {
          afterSupersede: async () => {
            console.log(`[EMISSOR A ${schemaName}] Após supersede, liberando B`)
            releaseB()

            // Aguardar B iniciar e ficar bloqueada
            console.log(`[EMISSOR A ${schemaName}] Aguardando B ficar bloqueada...`)
            await bStartedBarrier

            // Observar contenção
            const lockObservation = await observeLockContention(pool, schemaName, pidA, pidB)
            if (!lockObservation.observed) {
              throw new Error("CONCURRENCY_LOCK_CONTENTION_NOT_OBSERVED")
            }

            console.log(`[EMISSOR A ${schemaName}] Contenção confirmada, prosseguindo para COMMIT`)
            // Agora A pode fazer COMMIT, liberando os locks para B
          }
        }

        const result = await emitAuthorizationPair(clientA, recordsA, binding, hooks)
        console.log(`[EMISSOR A ${schemaName}] COMMIT`)

        return { success: true, issuer: ISSUER_A }
      } catch (err) {
        console.log(`[EMISSOR A ${schemaName}] ROLLBACK: ${err.message}`)
        return { success: false, error: err.code || err.message, constraint: err.constraint }
      }
    })()

    // Emissor B: aguarda liberação e notifica quando começar
    const emissionB = (async () => {
      await barrierB

      try {
        console.log(`[EMISSOR B ${schemaName}] Iniciando emissão (vai bloquear)`)

        // Notificar A que B começou (A aguardará observar contenção)
        notifyBStarted()

        const result = await emitAuthorizationPair(clientB, recordsB, binding)
        console.log(`[EMISSOR B ${schemaName}] COMMIT`)

        return { success: true, issuer: ISSUER_B }
      } catch (err) {
        console.log(`[EMISSOR B ${schemaName}] ROLLBACK/ERRO: ${err.message}`)
        // Aceitar apenas erros semânticos, não timeouts de infraestrutura
        if (err.code === "25P03" || err.code === "57014") {
          throw new Error(`INFRASTRUCTURE_TIMEOUT: ${err.code} - ${err.message}`)
        }
        return { success: false, error: err.code || err.message, constraint: err.constraint }
      }
    })()

    // Aguardar ambas emissões com allSettled (nenhuma abandona a outra)
    const [settledA, settledB] = await Promise.allSettled([emissionA, emissionB])

    // Extrair resultados ou erros
    const resultA = settledA.status === 'fulfilled' ? settledA.value : null
    const resultB = settledB.status === 'fulfilled' ? settledB.value : null
    const errorA = settledA.status === 'rejected' ? settledA.reason : null
    const errorB = settledB.status === 'rejected' ? settledB.reason : null

    console.log(`[CONCURRENCY ${schemaName}] Resultado A:`, resultA || `ERRO: ${errorA?.message}`)
    console.log(`[CONCURRENCY ${schemaName}] Resultado B:`, resultB || `ERRO: ${errorB?.message}`)

    // Erro de infraestrutura reprova o cenário
    if (errorA && (errorA.code === "25P03" || errorA.code === "57014")) {
      throw new Error(`INFRASTRUCTURE_TIMEOUT_A: ${errorA.code} - ${errorA.message}`)
    }
    if (errorB && (errorB.code === "25P03" || errorB.code === "57014")) {
      throw new Error(`INFRASTRUCTURE_TIMEOUT_B: ${errorB.code} - ${errorB.message}`)
    }

    // Erro não esperado também reprova
    if (errorA && !resultA) {
      throw new Error(`EMISSION_A_UNEXPECTED_ERROR: ${errorA.message}`)
    }
    if (errorB && !resultB) {
      throw new Error(`EMISSION_B_UNEXPECTED_ERROR: ${errorB.message}`)
    }

    // Validações de concorrência
    const successCount = [resultA, resultB].filter(r => r && r.success).length
    assert.equal(successCount, 1, "Exatamente uma emissão deve vencer")

    const winner = resultA && resultA.success ? resultA : resultB
    const loser = resultA && resultA.success ? resultB : resultA

    // Validar erro do perdedor - apenas erros semânticos aceitos
    assert(
      loser.error === "AUTHORIZATION_ALREADY_ACTIVE" ||
      (loser.error === "23505" && loser.constraint && loser.constraint.includes("single_case_auth_one_active_binding")),
      `Perdedor deve receber erro apropriado (não timeout de infraestrutura), recebeu: ${loser.error}`
    )

    // Validar estado final
    const verify = await pool.connect()
    try {
      await verify.query(`SET search_path TO ${schemaName}`)

      const active = await verify.query(
        `SELECT authorization_id, authorization_type, issuer, operational_status
         FROM ${TABLE_NAME}
         WHERE case_import_id = $1
           AND operational_status = 'ACTIVE'
         ORDER BY authorization_type`,
        [CASE_ID]
      )

      console.log(`[CONCURRENCY ${schemaName}] Registros ACTIVE finais:`, active.rowCount)

      assert.equal(active.rowCount, 2, "Deve ter exatamente 2 registros ACTIVE")
      assert.equal(active.rows[0].issuer, winner.issuer, "Ambos devem ser do emissor vencedor")
      assert.equal(active.rows[1].issuer, winner.issuer, "Ambos devem ser do emissor vencedor")
      assert.notEqual(active.rows[0].authorization_id, active.rows[1].authorization_id, "IDs devem ser distintos")

      const historical = await verify.query(
        `SELECT authorization_id, authorization_type, issuer, operational_status, superseded_at
         FROM ${TABLE_NAME}
         WHERE case_import_id = $1
           AND operational_status = 'HISTORICAL'
         ORDER BY authorization_type`,
        [CASE_ID]
      )

      console.log(`[CONCURRENCY ${schemaName}] Registros HISTORICAL finais:`, historical.rowCount)

      assert.equal(historical.rowCount, 2, "Par expirado deve estar HISTORICAL")
      assert.notEqual(historical.rows[0].superseded_at, null, "superseded_at deve estar preenchido")
      assert.notEqual(historical.rows[1].superseded_at, null, "superseded_at deve estar preenchido")
    } finally {
      verify.release()
    }

    return { ok: true, winner: winner.issuer, isolation: isolationA.rows[0].transaction_isolation, schema: schemaName }

  } catch (err) {
    // Capturar erro principal do corpo
    primaryError = err
    throw err
  } finally {
    // ═══ REMOVER INSTRUMENTAÇÃO ANTES DE QUALQUER CLEANUP ═══
    process.removeListener("unhandledRejection", rejectionHandler)
    process.removeListener("uncaughtException", exceptionHandler)

    // ═══ GUARDAR ERROS ASSÍNCRONOS ═══
    if (unhandledRejections.length > 0 && !asyncError) {
      console.error(`[ERROR] ${unhandledRejections.length} unhandledRejection(s) detectados`)
      asyncError = new Error(`UNHANDLED_REJECTION_DETECTED: ${unhandledRejections[0].message}`)
      asyncError.cause = unhandledRejections[0]
    }

    if (uncaughtExceptions.length > 0 && !asyncError) {
      console.error(`[ERROR] ${uncaughtExceptions.length} uncaughtException(s) detectados`)
      asyncError = new Error(`UNCAUGHT_EXCEPTION_DETECTED: ${uncaughtExceptions[0].message}`)
      asyncError.cause = uncaughtExceptions[0]
    }

    // ═══ EXECUTAR CLEANUP COMPLETO ═══
    try {
      if (clientA) {
        try {
          await clientA.query("ROLLBACK").catch(() => {})
        } catch {}
        clientA.release()
      }

      if (clientB) {
        try {
          await clientB.query("ROLLBACK").catch(() => {})
        } catch {}
        clientB.release()
      }

      await pool.end()
      await cleanupSchema(schemaName)
    } catch (err) {
      console.error(`[CLEANUP] Erro durante cleanup:`, err.message)
      cleanupError = err
    }

    console.log(`[SCENARIO_END] Concorrência - Schema: ${schemaName} removido`)

    // ═══ ESCOLHER ERRO A RELANÇAR COM PRECEDÊNCIA ═══
    const errorToThrow = primaryError || asyncError || cleanupError

    if (errorToThrow) {
      // Preservar erros secundários como causa
      if (errorToThrow === primaryError && (asyncError || cleanupError)) {
        const secondaryErrors = [asyncError, cleanupError].filter(Boolean)
        if (secondaryErrors.length > 0) {
          console.error(`[ERROR] Erros secundários preservados: ${secondaryErrors.map(e => e.message).join(', ')}`)
          if (!errorToThrow.cause) {
            errorToThrow.cause = secondaryErrors[0]
          }
        }
      }

      throw errorToThrow
    }
  }
}

async function testRollbackAfterSupersede() {
  const schemaName = makeSchemaName()
  const pool = new Pool({ connectionString: TEST_DATABASE_URL, max: 2 })

  // Instrumentação de erros com precedência
  let primaryError = null
  let asyncError = null
  let cleanupError = null

  let unhandledRejections = []
  let uncaughtExceptions = []

  const rejectionHandler = (err) => {
    unhandledRejections.push(err)
    console.error(`[ERROR] unhandledRejection: ${err.message}`)
  }

  const exceptionHandler = (err) => {
    uncaughtExceptions.push(err)
    console.error(`[ERROR] uncaughtException: ${err.message}`)
  }

  process.on("unhandledRejection", rejectionHandler)
  process.on("uncaughtException", exceptionHandler)

  try {
    console.log(`\n[SCENARIO_START] Rollback após supersede - Schema: ${schemaName}`)
    await setupTestSchema(pool, schemaName)

    const client = await pool.connect()
    try {
      await client.query(`SET search_path TO ${schemaName}`)
      await client.query(`SET lock_timeout = '${LOCK_TIMEOUT_MS}ms'`)
      await client.query(`SET statement_timeout = '${STATEMENT_TIMEOUT_MS}ms'`)
      await insertExpiredPair(client, schemaName, "rollback-test-a")

      const records = makeSignedRecords("rollback-issuer")
      const binding = { caseImportId: CASE_ID, caseFingerprint: CASE_FP, caseNumber: CASE_NUM, authorizablePlanHash: APH }

      const hooks = {
        afterSupersede: async () => {
          throw new Error("INJECTED_FAILURE_AFTER_SUPERSEDE")
        }
      }

      await assert.rejects(
        () => emitAuthorizationPair(client, records, binding, hooks),
        /INJECTED_FAILURE_AFTER_SUPERSEDE/
      )

      const active = await client.query(
        `SELECT operational_status, superseded_at FROM ${TABLE_NAME} WHERE case_import_id = $1`,
        [CASE_ID]
      )

      assert.equal(active.rowCount, 2, "Par antigo deve existir")
      assert.equal(active.rows[0].operational_status, "ACTIVE", "Deve continuar ACTIVE")
      assert.equal(active.rows[0].superseded_at, null, "superseded_at deve continuar NULL")

      console.log(`[ROLLBACK ${schemaName}] Rollback após supersede validado`)
    } finally {
      client.release()
    }

    console.log(`[SCENARIO_END] Rollback após supersede - Schema: ${schemaName} removido`)
    return { ok: true, schema: schemaName }
  } catch (err) {
    primaryError = err
    throw err
  } finally {
    // ═══ REMOVER INSTRUMENTAÇÃO ═══
    process.removeListener("unhandledRejection", rejectionHandler)
    process.removeListener("uncaughtException", exceptionHandler)

    // ═══ GUARDAR ERROS ASSÍNCRONOS ═══
    if (unhandledRejections.length > 0 && !asyncError) {
      asyncError = new Error(`UNHANDLED_REJECTION_DETECTED: ${unhandledRejections[0].message}`)
      asyncError.cause = unhandledRejections[0]
    }

    if (uncaughtExceptions.length > 0 && !asyncError) {
      asyncError = new Error(`UNCAUGHT_EXCEPTION_DETECTED: ${uncaughtExceptions[0].message}`)
      asyncError.cause = uncaughtExceptions[0]
    }

    // ═══ EXECUTAR CLEANUP ═══
    try {
      await pool.end()
      await cleanupSchema(schemaName)
    } catch (err) {
      cleanupError = err
    }

    // ═══ ESCOLHER ERRO A RELANÇAR ═══
    const errorToThrow = primaryError || asyncError || cleanupError
    if (errorToThrow && errorToThrow !== primaryError) {
      throw errorToThrow
    }
  }
}

async function testRollbackAfterFirstInsert() {
  const schemaName = makeSchemaName()
  const pool = new Pool({ connectionString: TEST_DATABASE_URL, max: 2 })

  // Instrumentação de erros com precedência
  let primaryError = null
  let asyncError = null
  let cleanupError = null

  let unhandledRejections = []
  let uncaughtExceptions = []

  const rejectionHandler = (err) => {
    unhandledRejections.push(err)
    console.error(`[ERROR] unhandledRejection: ${err.message}`)
  }

  const exceptionHandler = (err) => {
    uncaughtExceptions.push(err)
    console.error(`[ERROR] uncaughtException: ${err.message}`)
  }

  process.on("unhandledRejection", rejectionHandler)
  process.on("uncaughtException", exceptionHandler)

  try {
    console.log(`\n[SCENARIO_START] Rollback após primeiro INSERT - Schema: ${schemaName}`)
    await setupTestSchema(pool, schemaName)

    const client = await pool.connect()
    try {
      await client.query(`SET search_path TO ${schemaName}`)
      await client.query(`SET lock_timeout = '${LOCK_TIMEOUT_MS}ms'`)
      await client.query(`SET statement_timeout = '${STATEMENT_TIMEOUT_MS}ms'`)
      await insertExpiredPair(client, schemaName, "rollback-test-b")

      const records = makeSignedRecords("rollback-issuer")
      const binding = { caseImportId: CASE_ID, caseFingerprint: CASE_FP, caseNumber: CASE_NUM, authorizablePlanHash: APH }

      const hooks = {
        afterFirstInsert: async () => {
          throw new Error("INJECTED_FAILURE_AFTER_FIRST_INSERT")
        }
      }

      await assert.rejects(
        () => emitAuthorizationPair(client, records, binding, hooks),
        /INJECTED_FAILURE_AFTER_FIRST_INSERT/
      )

      const all = await client.query(
        `SELECT authorization_id, issuer FROM ${TABLE_NAME} WHERE case_import_id = $1`,
        [CASE_ID]
      )

      assert.equal(all.rowCount, 2, "Apenas par antigo deve existir")
      assert.equal(all.rows.every(r => r.issuer !== "rollback-issuer"), true, "Nenhum registro novo deve persistir")

      console.log(`[ROLLBACK ${schemaName}] Rollback após primeiro INSERT validado`)
    } finally {
      client.release()
    }

    console.log(`[SCENARIO_END] Rollback após primeiro INSERT - Schema: ${schemaName} removido`)
    return { ok: true, schema: schemaName }
  } catch (err) {
    primaryError = err
    throw err
  } finally {
    process.removeListener("unhandledRejection", rejectionHandler)
    process.removeListener("uncaughtException", exceptionHandler)

    if (unhandledRejections.length > 0 && !asyncError) {
      asyncError = new Error(`UNHANDLED_REJECTION_DETECTED: ${unhandledRejections[0].message}`)
      asyncError.cause = unhandledRejections[0]
    }

    if (uncaughtExceptions.length > 0 && !asyncError) {
      asyncError = new Error(`UNCAUGHT_EXCEPTION_DETECTED: ${uncaughtExceptions[0].message}`)
      asyncError.cause = uncaughtExceptions[0]
    }

    try {
      await pool.end()
      await cleanupSchema(schemaName)
    } catch (err) {
      cleanupError = err
    }

    const errorToThrow = primaryError || asyncError || cleanupError
    if (errorToThrow && errorToThrow !== primaryError) {
      throw errorToThrow
    }
  }
}

async function testUniqueConstraintDifferentiation() {
  const schemaName = makeSchemaName()
  const pool = new Pool({ connectionString: TEST_DATABASE_URL, max: 2 })

  // Instrumentação de erros com precedência
  let primaryError = null
  let asyncError = null
  let cleanupError = null

  let unhandledRejections = []
  let uncaughtExceptions = []

  const rejectionHandler = (err) => {
    unhandledRejections.push(err)
    console.error(`[ERROR] unhandledRejection: ${err.message}`)
  }

  const exceptionHandler = (err) => {
    uncaughtExceptions.push(err)
    console.error(`[ERROR] uncaughtException: ${err.message}`)
  }

  process.on("unhandledRejection", rejectionHandler)
  process.on("uncaughtException", exceptionHandler)

  try {
    console.log(`\n[SCENARIO_START] Diferenciação 23505 - Schema: ${schemaName}`)
    await setupTestSchema(pool, schemaName)

    const client = await pool.connect()
    try {
      await client.query(`SET search_path TO ${schemaName}`)
      await client.query(`SET lock_timeout = '${LOCK_TIMEOUT_MS}ms'`)
      await client.query(`SET statement_timeout = '${STATEMENT_TIMEOUT_MS}ms'`)
      const records = makeSignedRecords("duplicate-id-test")

      // Criar cópia com ID duplicado (viola PRIMARY KEY, não o índice de binding)
      // Não modificar objeto congelado diretamente
      const modifiedRecords = [
        records[0],
        { ...records[1], authorizationId: records[0].authorizationId }
      ]

      const binding = { caseImportId: CASE_ID, caseFingerprint: CASE_FP, caseNumber: CASE_NUM, authorizablePlanHash: APH }

      let caughtError = null
      try {
        await emitAuthorizationPair(client, modifiedRecords, binding)
      } catch (err) {
        caughtError = err
        console.log(`[23505 ALT] err.name: ${err.name}`)
        console.log(`[23505 ALT] err.message: ${err.message}`)
        console.log(`[23505 ALT] err.code: ${err.code || 'N/A'}`)
        console.log(`[23505 ALT] err.constraint: ${err.constraint || 'N/A'}`)
        console.log(`[23505 ALT] Erro ocorreu dentro de emitAuthorizationPair: SIM`)
      }

      if (!caughtError) {
        throw new Error("UNIQUE_CONSTRAINT_TEST_FAILED: nenhum erro capturado")
      }

      if (caughtError.message !== "UNIQUE_CONSTRAINT_VIOLATION") {
        throw new Error(`UNIQUE_CONSTRAINT_TEST_FAILED: esperado UNIQUE_CONSTRAINT_VIOLATION, recebeu ${caughtError.message}`)
      }

      console.log("[23505 ALT] Diferenciação confirmada: UNIQUE_CONSTRAINT_VIOLATION")
    } finally {
      client.release()
    }

    console.log(`[SCENARIO_END] Diferenciação 23505 - Schema: ${schemaName} removido`)
    return { ok: true, schema: schemaName }
  } catch (err) {
    primaryError = err
    throw err
  } finally {
    process.removeListener("unhandledRejection", rejectionHandler)
    process.removeListener("uncaughtException", exceptionHandler)

    if (unhandledRejections.length > 0 && !asyncError) {
      asyncError = new Error(`UNHANDLED_REJECTION_DETECTED: ${unhandledRejections[0].message}`)
      asyncError.cause = unhandledRejections[0]
    }

    if (uncaughtExceptions.length > 0 && !asyncError) {
      asyncError = new Error(`UNCAUGHT_EXCEPTION_DETECTED: ${uncaughtExceptions[0].message}`)
      asyncError.cause = uncaughtExceptions[0]
    }

    try {
      await pool.end()
      await cleanupSchema(schemaName)
    } catch (err) {
      cleanupError = err
    }

    const errorToThrow = primaryError || asyncError || cleanupError
    if (errorToThrow && errorToThrow !== primaryError) {
      throw errorToThrow
    }
  }
}

// ── TESTES ───────────────────────────────────────────────────────────────────

// Teste PAI único que executa os 4 cenários sequencialmente
test("PostgreSQL real: suite completa de concorrência (execução sequencial)", async () => {
  if (!TEST_DATABASE_URL) {
    if (REQUIRE_REAL_TEST) {
      throw new Error("REQUIRE_REAL_POSTGRES_CONCURRENCY_TEST=1 mas TEST_POSTGRES_DATABASE_URL não definida")
    }
    console.log("[SKIP] TEST_POSTGRES_DATABASE_URL não definida")
    console.log("[SKIP] Estrutura do teste validada, prova PostgreSQL não executada")
    return
  }

  console.log("\n════════════════════════════════════════════════════════════════")
  console.log("EXECUTANDO SUITE COMPLETA DE CONCORRÊNCIA (4 CENÁRIOS SEQUENCIAIS)")
  console.log("════════════════════════════════════════════════════════════════\n")

  // Cenário 1: Concorrência com duas emissões simultâneas
  console.log("┌─ CENÁRIO 1/4: Concorrência com duas emissões simultâneas")
  const result1 = await testConcurrency()
  console.log(`└─ Vencedor: ${result1.winner}, Isolamento: ${result1.isolation}`)
  assert.equal(result1.ok, true)

  // Cenário 2: Rollback após historização
  console.log("\n┌─ CENÁRIO 2/4: Rollback após historização")
  const result2 = await testRollbackAfterSupersede()
  console.log(`└─ OK`)
  assert.equal(result2.ok, true)

  // Cenário 3: Rollback após primeiro INSERT
  console.log("\n┌─ CENÁRIO 3/4: Rollback após primeiro INSERT")
  const result3 = await testRollbackAfterFirstInsert()
  console.log(`└─ OK`)
  assert.equal(result3.ok, true)

  // Cenário 4: Diferenciação de 23505
  console.log("\n┌─ CENÁRIO 4/4: Diferenciação de 23505")
  const result4 = await testUniqueConstraintDifferentiation()
  console.log(`└─ OK`)
  assert.equal(result4.ok, true)

  console.log("\n════════════════════════════════════════════════════════════════")
  console.log("SUITE COMPLETA: 4/4 CENÁRIOS PASSED")
  console.log("════════════════════════════════════════════════════════════════\n")
})

test("arquitetura: unidade produtiva é exportada e utilizável", () => {
  assert.equal(typeof emitAuthorizationPair, "function")
  // Note: hooks tem valor padrão {}, então .length retorna 3
  assert.equal(emitAuthorizationPair.length, 3, "Deve aceitar 3 parâmetros obrigatórios + hooks opcional")
})
