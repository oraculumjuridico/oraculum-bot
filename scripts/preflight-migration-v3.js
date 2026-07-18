"use strict"

const pg = require("pg")

async function preflightMigrationV3() {
  // Verificar variáveis
  if (!process.env.EXTERNAL_STATE_DATABASE_URL) {
    console.log("EXTERNAL_STATE_DATABASE_URL=ABSENT")
    process.exit(1)
  }

  console.log("EXTERNAL_STATE_DATABASE_URL=PRESENT")
  console.log(`CASE_NUMBER_RESERVATION_MODE=${process.env.CASE_NUMBER_RESERVATION_MODE || "ABSENT"}`)
  console.log("")

  const pool = new pg.Pool({
    connectionString: process.env.EXTERNAL_STATE_DATABASE_URL,
    max: 1
  })

  let client
  try {
    client = await pool.connect()

    // 1. Abrir transação READ ONLY
    await client.query("BEGIN TRANSACTION READ ONLY")
    console.log("✓ Transação READ ONLY iniciada")

    // 2. Confirmar banco e schema
    const dbInfo = await client.query("SELECT current_database() AS db, current_schema() AS schema")
    console.log(`✓ Banco: ${dbInfo.rows[0].db}, Schema: ${dbInfo.rows[0].schema}`)
    console.log("")

    // Verificar se tabela existe
    const tableCheck = await client.query(
      "SELECT to_regclass('single_case_apply_authorizations') AS table_name"
    )
    if (!tableCheck.rows[0]?.table_name) {
      console.log("✗ Tabela single_case_apply_authorizations não existe")
      await client.query("ROLLBACK")
      console.log("\nCONCLUSÃO: BLOCKED_DATABASE_ERROR")
      process.exit(1)
    }
    console.log("✓ Tabela single_case_apply_authorizations existe")
    console.log("")

    // 3. Contar registros schema_version = 2
    const v2Count = await client.query(
      "SELECT COUNT(*) AS total FROM single_case_apply_authorizations WHERE schema_version = 2"
    )
    console.log(`Total registros schema_version=2: ${v2Count.rows[0].total}`)

    // Detalhamento por tipo, status, consumo, expiração
    const v2Details = await client.query(`
      SELECT
        authorization_type,
        operational_status,
        CASE WHEN consumed_at IS NULL THEN 'not_consumed' ELSE 'consumed' END AS consumption,
        CASE WHEN expires_at > CURRENT_TIMESTAMP THEN 'active' ELSE 'expired' END AS expiration,
        COUNT(*) AS count
      FROM single_case_apply_authorizations
      WHERE schema_version = 2
      GROUP BY authorization_type, operational_status, consumption, expiration
      ORDER BY authorization_type, operational_status, consumption, expiration
    `)

    console.log("\nDetalhamento v2:")
    for (const row of v2Details.rows) {
      console.log(`  ${row.authorization_type} | ${row.operational_status} | ${row.consumption} | ${row.expiration}: ${row.count}`)
    }
    console.log("")

    // 4. Contar registros incompatíveis com v3
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

    console.log(`Registros incompatíveis com v3:`)
    console.log(`  EXPLICIT_APPLY_AUTHORIZATION com escopo incorreto: ${incompatibleExplicit.rows[0].count}`)
    console.log(`  EXTERNAL_WRITES_AUTHORIZATION com escopo incorreto: ${incompatibleExternal.rows[0].count}`)
    console.log(`  Total incompatível: ${totalIncompatible}`)
    console.log("")

    // Se houver incompatíveis, detalhar se impediriam constraint
    if (totalIncompatible > 0) {
      const incompatibleDetails = await client.query(`
        SELECT
          authorization_type,
          operational_status,
          CASE WHEN consumed_at IS NULL THEN 'not_consumed' ELSE 'consumed' END AS consumption,
          CASE WHEN expires_at > CURRENT_TIMESTAMP THEN 'active' ELSE 'expired' END AS expiration,
          COUNT(*) AS count
        FROM single_case_apply_authorizations
        WHERE schema_version = 2
          AND (
            (authorization_type = 'EXPLICIT_APPLY_AUTHORIZATION' AND scope <> '["APPLY_SINGLE_CASE"]'::jsonb)
            OR
            (authorization_type = 'EXTERNAL_WRITES_AUTHORIZATION' AND scope <> '["CHECKPOINT_WRITE","DRIVE_FOLDERS","DRIVE_UPLOADS","HUBSPOT_ASSOCIATION","HUBSPOT_CONTACT","HUBSPOT_DEAL"]'::jsonb)
          )
        GROUP BY authorization_type, operational_status, consumption, expiration
        ORDER BY authorization_type, operational_status
      `)

      console.log("Detalhamento de incompatíveis:")
      for (const row of incompatibleDetails.rows) {
        console.log(`  ${row.authorization_type} | ${row.operational_status} | ${row.consumption} | ${row.expiration}: ${row.count}`)
      }
      console.log("")
      console.log("⚠️  TODOS os registros v2 impediriam ADD CONSTRAINT da v3")
      console.log("")
    }

    // 5. Verificar caso específico
    const specificCase = await client.query(`
      SELECT
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE authorization_type = 'EXPLICIT_APPLY_AUTHORIZATION') AS explicit_count,
        COUNT(*) FILTER (WHERE authorization_type = 'EXTERNAL_WRITES_AUTHORIZATION') AS external_count,
        COUNT(*) FILTER (WHERE consumed_at IS NULL) AS unconsumed,
        COUNT(*) FILTER (WHERE expires_at > CURRENT_TIMESTAMP) AS active
      FROM single_case_apply_authorizations
      WHERE schema_version = 2
        AND case_import_id = 'inss-e3dfb0f332b117d60bf2'
        AND case_number = 'PRV.260714.707'
    `)

    console.log(`Caso específico (inss-e3dfb0f332b117d60bf2 / PRV.260714.707):`)
    console.log(`  Total: ${specificCase.rows[0].total}`)
    console.log(`  EXPLICIT: ${specificCase.rows[0].explicit_count}`)
    console.log(`  EXTERNAL: ${specificCase.rows[0].external_count}`)
    console.log(`  Não consumidas: ${specificCase.rows[0].unconsumed}`)
    console.log(`  Vigentes: ${specificCase.rows[0].active}`)
    console.log("")

    // 7. ROLLBACK
    await client.query("ROLLBACK")
    console.log("✓ ROLLBACK executado")
    console.log("")

    // Conclusão
    if (totalIncompatible > 0) {
      console.log("═══════════════════════════════════════════════════")
      console.log("CONCLUSÃO: MIGRATION_V3_BLOCKED_BY_EXISTING_ROWS")
      console.log("═══════════════════════════════════════════════════")
      console.log(`${totalIncompatible} registro(s) v2 com escopo incompatível impedem ADD CONSTRAINT`)
      console.log("")
      console.log("Ação necessária antes de aplicar v3:")
      console.log("  1. Revogar registros incompatíveis, OU")
      console.log("  2. Aguardar expiração natural, OU")
      console.log("  3. Considerar migração com UPDATE corretivo (quebra assinaturas)")
    } else {
      console.log("═══════════════════════════════════════════════════")
      console.log("CONCLUSÃO: MIGRATION_V3_SAFE_TO_APPLY")
      console.log("═══════════════════════════════════════════════════")
      console.log("✓ Nenhum registro v2 incompatível encontrado")
      console.log("✓ Migration v3 pode ser aplicada com segurança")
    }

  } catch (error) {
    if (client) {
      try { await client.query("ROLLBACK") } catch {}
    }
    console.error("\n✗ Erro durante preflight:")
    console.error(error.message)
    console.log("\nCONCLUSÃO: BLOCKED_DATABASE_ERROR")
    process.exit(1)
  } finally {
    if (client) client.release()
    await pool.end()
  }
}

preflightMigrationV3().catch(error => {
  console.error("Erro fatal:", error)
  process.exit(1)
})
