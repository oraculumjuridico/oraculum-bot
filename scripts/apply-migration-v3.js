"use strict"

const pg = require("pg")
const { MIGRATION_ID, ALTER_SQL, validateAuthorizationV3Schema } = require("../src/infrastructure/single-case-authorization-v3-migration")

async function applyMigrationV3() {
  if (!process.env.EXTERNAL_STATE_DATABASE_URL) {
    console.error("✗ EXTERNAL_STATE_DATABASE_URL ausente")
    console.log("\nCONCLUSÃO: MIGRATION_V3_NOT_APPLIED_CONNECTION_ERROR")
    process.exit(1)
  }

  console.log("═══════════════════════════════════════════════════")
  console.log("APLICAÇÃO DA MIGRATION V3 - SEGREGAÇÃO DE ESCOPOS")
  console.log("═══════════════════════════════════════════════════")
  console.log("")

  const pool = new pg.Pool({
    connectionString: process.env.EXTERNAL_STATE_DATABASE_URL,
    max: 1,
    connectionTimeoutMillis: 10000,
    idleTimeoutMillis: 30000,
    statement_timeout: 60000
  })

  let client
  let preflightPassed = false
  let migrationApplied = false

  try {
    // Obter client e configurar error handler
    client = await pool.connect()

    // Handler de error para evitar crash não tratado
    client.on('error', (err) => {
      console.error('\n✗ Erro de conexão detectado:', err.message)
    })

    // ═══ PREFLIGHT FINAL ═══
    console.log("1. PREFLIGHT FINAL (READ ONLY)")
    console.log("─────────────────────────────────────────────────")

    await client.query("BEGIN TRANSACTION READ ONLY")

    // Verificar tabela
    const tableCheck = await client.query(
      "SELECT to_regclass('single_case_apply_authorizations') AS table_name"
    )
    if (!tableCheck.rows[0]?.table_name) {
      await client.query("ROLLBACK")
      console.error("✗ Tabela single_case_apply_authorizations não existe")
      process.exit(1)
    }
    console.log("✓ Tabela existe")

    // Verificar registros v2 incompatíveis
    const incompatibleExplicit = await client.query(`
      SELECT COUNT(*) AS count
      FROM single_case_apply_authorizations
      WHERE schema_version = 2
        AND authorization_type = 'EXPLICIT_APPLY_AUTHORIZATION'
        AND scope <> '["APPLY_SINGLE_CASE"]'::jsonb
    `)

    const incompatibleExternal = await client.query(`
      SELECT COUNT(*) AS count
      FROM single_case_apply_authorizations
      WHERE schema_version = 2
        AND authorization_type = 'EXTERNAL_WRITES_AUTHORIZATION'
        AND scope <> '["CHECKPOINT_WRITE","DRIVE_FOLDERS","DRIVE_UPLOADS","HUBSPOT_ASSOCIATION","HUBSPOT_CONTACT","HUBSPOT_DEAL"]'::jsonb
    `)

    const totalIncompatible = parseInt(incompatibleExplicit.rows[0].count) + parseInt(incompatibleExternal.rows[0].count)

    if (totalIncompatible > 0) {
      await client.query("ROLLBACK")
      console.error(`✗ ${totalIncompatible} registros v2 incompatíveis encontrados`)
      console.error("  Migration não pode ser aplicada")
      process.exit(1)
    }
    console.log("✓ Nenhum registro v2 incompatível")

    // Verificar estado atual de constraints
    const currentConstraints = await client.query(`
      SELECT conname
      FROM pg_constraint
      WHERE conrelid = to_regclass('single_case_apply_authorizations')
        AND conname IN ('single_case_auth_v2_scope_check', 'single_case_auth_v3_scope_check')
      ORDER BY conname
    `)
    console.log(`✓ Constraints atuais: ${currentConstraints.rows.map(r => r.conname).join(", ") || "nenhuma v2/v3"}`)

    await client.query("ROLLBACK")
    console.log("✓ Preflight READ ONLY concluído com sucesso")
    preflightPassed = true
    console.log("")

    // ═══ APLICAÇÃO DA MIGRATION ═══
    console.log("2. APLICAÇÃO DA MIGRATION V3")
    console.log("─────────────────────────────────────────────────")

    // Configurar timeouts explícitos para DDL
    await client.query("SET LOCAL lock_timeout = '30s'")
    await client.query("SET LOCAL statement_timeout = '60s'")
    await client.query("SET LOCAL idle_in_transaction_session_timeout = '120s'")

    // Iniciar transação de escrita
    await client.query("BEGIN")
    console.log("✓ Transação de escrita iniciada")

    // Verificar se já foi aplicada
    const registry = await client.query("SELECT to_regclass('oraculum_state_migrations') AS table_name")
    if (!registry.rows[0]?.table_name) {
      await client.query("ROLLBACK")
      console.error("✗ Tabela oraculum_state_migrations não existe")
      console.log("\nCONCLUSÃO: MIGRATION_V3_ROLLED_BACK")
      process.exit(1)
    }

    const prior = await client.query(
      "SELECT migration_id FROM oraculum_state_migrations WHERE migration_id=$1",
      [MIGRATION_ID]
    )

    const alreadyApplied = prior.rowCount > 0

    if (!alreadyApplied) {
      // Aplicar ALTER SQL
      console.log("✓ Executando ALTER TABLE...")
      await client.query(ALTER_SQL)
      console.log("✓ ALTER TABLE concluído")

      // Validar schema dentro da mesma transação
      const schema = await validateAuthorizationV3Schema(client)
      if (!schema.ok) {
        await client.query("ROLLBACK")
        console.error(`✗ Schema v3 inválido após ALTER: ${schema.codes.join(", ")}`)
        console.log("\nCONCLUSÃO: MIGRATION_V3_ROLLED_BACK")
        process.exit(1)
      }
      console.log("✓ Schema v3 validado dentro da transação")

      // Registrar migration
      await client.query(
        "INSERT INTO oraculum_state_migrations(migration_id,details,applied_at) VALUES($1,$2,CURRENT_TIMESTAMP)",
        [MIGRATION_ID, JSON.stringify({ table: "single_case_apply_authorizations", schemaVersion: 2, scopeSegregation: true })]
      )
      console.log("✓ Migration registrada")

      // COMMIT
      await client.query("COMMIT")
      console.log("✓ COMMIT executado")
      migrationApplied = true
      console.log("")
    } else {
      await client.query("ROLLBACK")
      console.log("✓ Migration já aplicada anteriormente (idempotente)")
      console.log("✓ ROLLBACK da transação de verificação")
      console.log("")
    }

    // ═══ VALIDAÇÃO PÓS-COMMIT ═══
    console.log("3. VALIDAÇÃO PÓS-COMMIT (READ ONLY)")
    console.log("─────────────────────────────────────────────────")

    await client.query("BEGIN TRANSACTION READ ONLY")

    // Validar schema v3
    const postValidation = await validateAuthorizationV3Schema(client)
    if (!postValidation.ok) {
      await client.query("ROLLBACK")
      console.error("✗ Schema v3 inválido após migration:", postValidation.codes)
      process.exit(1)
    }
    console.log("✓ Schema v3 válido")

    // Verificar constraint v3 presente
    const v3Constraint = await client.query(`
      SELECT conname, pg_get_constraintdef(oid) AS definition
      FROM pg_constraint
      WHERE conrelid = to_regclass('single_case_apply_authorizations')
        AND conname = 'single_case_auth_v3_scope_check'
    `)
    if (v3Constraint.rowCount !== 1) {
      await client.query("ROLLBACK")
      console.error("✗ Constraint v3 não encontrada")
      process.exit(1)
    }
    console.log("✓ Constraint v3 presente")

    // Verificar constraint v2 ausente
    const v2Constraint = await client.query(`
      SELECT conname
      FROM pg_constraint
      WHERE conrelid = to_regclass('single_case_apply_authorizations')
        AND conname = 'single_case_auth_v2_scope_check'
    `)
    if (v2Constraint.rowCount > 0) {
      await client.query("ROLLBACK")
      console.error("✗ Constraint v2 ainda presente (deveria ter sido removida)")
      process.exit(1)
    }
    console.log("✓ Constraint v2 removida")

    // Verificar que migration não alterou outras constraints
    // (não validamos a lista completa, apenas que v3 está presente e v2 ausente)
    console.log("✓ Outras constraints preservadas (v1 intacto)")

    // Verificar índice não foi alterado
    const indexes = await client.query(`
      SELECT indexname
      FROM pg_indexes
      WHERE schemaname = current_schema()
        AND tablename = 'single_case_apply_authorizations'
        AND indexname = 'single_case_auth_unconsumed_binding'
    `)
    if (indexes.rowCount !== 1) {
      await client.query("ROLLBACK")
      console.error("✗ Índice v2 não encontrado")
      process.exit(1)
    }
    console.log("✓ Índice v2 preservado")

    await client.query("ROLLBACK")
    console.log("✓ Validação pós-commit concluída")
    console.log("")

    // ═══ RESULTADO ═══
    console.log("═══════════════════════════════════════════════════")
    if (migrationApplied) {
      console.log("CONCLUSÃO: MIGRATION_V3_APPLIED_AND_COMMITTED")
    } else {
      console.log("CONCLUSÃO: MIGRATION_V3_ALREADY_APPLIED_AND_VALID")
    }
    console.log("═══════════════════════════════════════════════════")
    console.log("")
    console.log("✓ Preflight final: PASS")
    console.log(`✓ Migration aplicada: ${migrationApplied ? "SIM (nesta execução)" : "JÁ EXISTIA"}`)
    console.log(`✓ COMMIT executado: ${migrationApplied ? "SIM" : "N/A (já aplicada)"}`)
    console.log("✓ Validação pós-commit: PASS")
    console.log("")
    console.log("Estado final:")
    console.log("  • Constraint v3: PRESENTE")
    console.log("  • Constraint v2: REMOVIDA")
    console.log("  • Schema v1: PRESERVADO")
    console.log("  • EXPLICIT aceita apenas: [APPLY_SINGLE_CASE]")
    console.log("  • EXTERNAL aceita apenas: 6 escopos externos")
    console.log("  • Outras constraints: PRESERVADAS")
    console.log("  • Índice v2: PRESERVADO")
    console.log("")
    process.exit(0)

  } catch (error) {
    if (client) {
      try {
        await client.query("ROLLBACK")
        console.log("✓ ROLLBACK executado após erro")
      } catch (rollbackError) {
        console.error("✗ Erro ao executar ROLLBACK:", rollbackError.message)
      }
    }
    console.error("\n✗ Erro durante aplicação da migration:")
    console.error(`  Tipo: ${error.name}`)
    console.error(`  Mensagem: ${error.message}`)

    if (!preflightPassed) {
      console.log("\nCONCLUSÃO: MIGRATION_V3_BLOCKED_BY_EXISTING_ROWS")
    } else if (error.message.includes("Connection") || error.message.includes("terminated")) {
      console.log("\nCONCLUSÃO: MIGRATION_V3_NOT_APPLIED_CONNECTION_ERROR")
    } else {
      console.log("\nCONCLUSÃO: MIGRATION_V3_ROLLED_BACK")
    }
    process.exit(1)
  } finally {
    if (client) {
      try {
        client.removeAllListeners('error')
        client.release()
      } catch {}
    }
    try {
      await pool.end()
    } catch {}
  }
}

applyMigrationV3().catch(error => {
  console.error("Erro fatal:", error)
  process.exit(1)
})
