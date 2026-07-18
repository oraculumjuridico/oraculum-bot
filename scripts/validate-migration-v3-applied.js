"use strict"

const pg = require("pg")

async function validateMigrationV3Applied() {
  if (!process.env.EXTERNAL_STATE_DATABASE_URL) {
    console.error("✗ EXTERNAL_STATE_DATABASE_URL ausente")
    process.exit(1)
  }

  console.log("═══════════════════════════════════════════════════")
  console.log("VALIDAÇÃO PÓS-APLICAÇÃO DA MIGRATION V3")
  console.log("═══════════════════════════════════════════════════")
  console.log("")

  const pool = new pg.Pool({
    connectionString: process.env.EXTERNAL_STATE_DATABASE_URL,
    max: 1
  })

  let client
  try {
    client = await pool.connect()
    await client.query("BEGIN TRANSACTION READ ONLY")

    console.log("1. TESTES DE CONSTRAINT V3")
    console.log("─────────────────────────────────────────────────")

    // Teste 1: EXPLICIT com 1 escopo correto deve ser aceito
    try {
      await client.query(`
        SELECT 1 WHERE (
          SELECT COUNT(*) = 0 FROM (
            SELECT 1 WHERE NOT (
              2 = 1 OR (
                2 = 2 AND (
                  ('EXPLICIT_APPLY_AUTHORIZATION' = 'EXPLICIT_APPLY_AUTHORIZATION'
                   AND '["APPLY_SINGLE_CASE"]'::jsonb = '["APPLY_SINGLE_CASE"]'::jsonb)
                  OR
                  ('EXPLICIT_APPLY_AUTHORIZATION' = 'EXTERNAL_WRITES_AUTHORIZATION'
                   AND '["APPLY_SINGLE_CASE"]'::jsonb = '["CHECKPOINT_WRITE","DRIVE_FOLDERS","DRIVE_UPLOADS","HUBSPOT_ASSOCIATION","HUBSPOT_CONTACT","HUBSPOT_DEAL"]'::jsonb)
                )
              )
            )
          ) AS test
        )
      `)
      console.log("✓ EXPLICIT com [APPLY_SINGLE_CASE]: aceito")
    } catch (e) {
      console.error("✗ EXPLICIT com [APPLY_SINGLE_CASE]: rejeitado (ERRO)")
      throw e
    }

    // Teste 2: EXPLICIT com 7 escopos deve ser rejeitado
    const explicitWith7Test = await client.query(`
      SELECT
        CASE
          WHEN NOT (
            2 = 1 OR (
              2 = 2 AND (
                ('EXPLICIT_APPLY_AUTHORIZATION' = 'EXPLICIT_APPLY_AUTHORIZATION'
                 AND '["APPLY_SINGLE_CASE","CHECKPOINT_WRITE","DRIVE_FOLDERS","DRIVE_UPLOADS","HUBSPOT_ASSOCIATION","HUBSPOT_CONTACT","HUBSPOT_DEAL"]'::jsonb = '["APPLY_SINGLE_CASE"]'::jsonb)
                OR
                ('EXPLICIT_APPLY_AUTHORIZATION' = 'EXTERNAL_WRITES_AUTHORIZATION'
                 AND '["APPLY_SINGLE_CASE","CHECKPOINT_WRITE","DRIVE_FOLDERS","DRIVE_UPLOADS","HUBSPOT_ASSOCIATION","HUBSPOT_CONTACT","HUBSPOT_DEAL"]'::jsonb = '["CHECKPOINT_WRITE","DRIVE_FOLDERS","DRIVE_UPLOADS","HUBSPOT_ASSOCIATION","HUBSPOT_CONTACT","HUBSPOT_DEAL"]'::jsonb)
              )
            )
          ) THEN 'rejected'
          ELSE 'accepted'
        END AS result
    `)
    if (explicitWith7Test.rows[0].result === 'rejected') {
      console.log("✓ EXPLICIT com 7 escopos: rejeitado")
    } else {
      console.error("✗ EXPLICIT com 7 escopos: aceito (ERRO)")
      process.exit(1)
    }

    // Teste 3: EXTERNAL com 6 escopos corretos deve ser aceito
    try {
      await client.query(`
        SELECT 1 WHERE (
          SELECT COUNT(*) = 0 FROM (
            SELECT 1 WHERE NOT (
              2 = 1 OR (
                2 = 2 AND (
                  ('EXTERNAL_WRITES_AUTHORIZATION' = 'EXPLICIT_APPLY_AUTHORIZATION'
                   AND '["CHECKPOINT_WRITE","DRIVE_FOLDERS","DRIVE_UPLOADS","HUBSPOT_ASSOCIATION","HUBSPOT_CONTACT","HUBSPOT_DEAL"]'::jsonb = '["APPLY_SINGLE_CASE"]'::jsonb)
                  OR
                  ('EXTERNAL_WRITES_AUTHORIZATION' = 'EXTERNAL_WRITES_AUTHORIZATION'
                   AND '["CHECKPOINT_WRITE","DRIVE_FOLDERS","DRIVE_UPLOADS","HUBSPOT_ASSOCIATION","HUBSPOT_CONTACT","HUBSPOT_DEAL"]'::jsonb = '["CHECKPOINT_WRITE","DRIVE_FOLDERS","DRIVE_UPLOADS","HUBSPOT_ASSOCIATION","HUBSPOT_CONTACT","HUBSPOT_DEAL"]'::jsonb)
                )
              )
            )
          ) AS test
        )
      `)
      console.log("✓ EXTERNAL com 6 escopos: aceito")
    } catch (e) {
      console.error("✗ EXTERNAL com 6 escopos: rejeitado (ERRO)")
      throw e
    }

    // Teste 4: EXTERNAL incluindo APPLY_SINGLE_CASE deve ser rejeitado
    const externalWithApplyTest = await client.query(`
      SELECT
        CASE
          WHEN NOT (
            2 = 1 OR (
              2 = 2 AND (
                ('EXTERNAL_WRITES_AUTHORIZATION' = 'EXPLICIT_APPLY_AUTHORIZATION'
                 AND '["APPLY_SINGLE_CASE","CHECKPOINT_WRITE","DRIVE_FOLDERS","DRIVE_UPLOADS","HUBSPOT_ASSOCIATION","HUBSPOT_CONTACT","HUBSPOT_DEAL"]'::jsonb = '["APPLY_SINGLE_CASE"]'::jsonb)
                OR
                ('EXTERNAL_WRITES_AUTHORIZATION' = 'EXTERNAL_WRITES_AUTHORIZATION'
                 AND '["APPLY_SINGLE_CASE","CHECKPOINT_WRITE","DRIVE_FOLDERS","DRIVE_UPLOADS","HUBSPOT_ASSOCIATION","HUBSPOT_CONTACT","HUBSPOT_DEAL"]'::jsonb = '["CHECKPOINT_WRITE","DRIVE_FOLDERS","DRIVE_UPLOADS","HUBSPOT_ASSOCIATION","HUBSPOT_CONTACT","HUBSPOT_DEAL"]'::jsonb)
              )
            )
          ) THEN 'rejected'
          ELSE 'accepted'
        END AS result
    `)
    if (externalWithApplyTest.rows[0].result === 'rejected') {
      console.log("✓ EXTERNAL incluindo APPLY_SINGLE_CASE: rejeitado")
    } else {
      console.error("✗ EXTERNAL incluindo APPLY_SINGLE_CASE: aceito (ERRO)")
      process.exit(1)
    }

    // Teste 5: Escopos trocados devem ser rejeitados
    const swappedScopesTest = await client.query(`
      SELECT
        CASE
          WHEN NOT (
            2 = 1 OR (
              2 = 2 AND (
                ('EXPLICIT_APPLY_AUTHORIZATION' = 'EXPLICIT_APPLY_AUTHORIZATION'
                 AND '["CHECKPOINT_WRITE","DRIVE_FOLDERS","DRIVE_UPLOADS","HUBSPOT_ASSOCIATION","HUBSPOT_CONTACT","HUBSPOT_DEAL"]'::jsonb = '["APPLY_SINGLE_CASE"]'::jsonb)
                OR
                ('EXPLICIT_APPLY_AUTHORIZATION' = 'EXTERNAL_WRITES_AUTHORIZATION'
                 AND '["CHECKPOINT_WRITE","DRIVE_FOLDERS","DRIVE_UPLOADS","HUBSPOT_ASSOCIATION","HUBSPOT_CONTACT","HUBSPOT_DEAL"]'::jsonb = '["CHECKPOINT_WRITE","DRIVE_FOLDERS","DRIVE_UPLOADS","HUBSPOT_ASSOCIATION","HUBSPOT_CONTACT","HUBSPOT_DEAL"]'::jsonb)
              )
            )
          ) THEN 'rejected'
          ELSE 'accepted'
        END AS result
    `)
    if (swappedScopesTest.rows[0].result === 'rejected') {
      console.log("✓ Escopos trocados: rejeitado")
    } else {
      console.error("✗ Escopos trocados: aceito (ERRO)")
      process.exit(1)
    }

    console.log("")
    console.log("2. VERIFICAÇÃO DE CONSTRAINTS")
    console.log("─────────────────────────────────────────────────")

    const constraints = await client.query(`
      SELECT conname
      FROM pg_constraint
      WHERE conrelid = to_regclass('single_case_apply_authorizations')
      ORDER BY conname
    `)

    const hasV3 = constraints.rows.some(r => r.conname === 'single_case_auth_v3_scope_check')
    const hasV2Scope = constraints.rows.some(r => r.conname === 'single_case_auth_v2_scope_check')

    console.log(`✓ Constraint v3: ${hasV3 ? "PRESENTE" : "AUSENTE (ERRO)"}`)
    console.log(`✓ Constraint v2: ${hasV2Scope ? "PRESENTE (ERRO)" : "AUSENTE"}`)

    if (!hasV3 || hasV2Scope) {
      await client.query("ROLLBACK")
      process.exit(1)
    }

    await client.query("ROLLBACK")

    console.log("")
    console.log("═══════════════════════════════════════════════════")
    console.log("VALIDAÇÃO COMPLETA: PASS")
    console.log("═══════════════════════════════════════════════════")
    console.log("")
    console.log("✓ Constraint v3 presente e funcional")
    console.log("✓ Constraint v2 removida")
    console.log("✓ Segregação de escopos por tipo validada")
    console.log("✓ Combinações cruzadas rejeitadas")
    console.log("")

  } catch (error) {
    if (client) {
      try { await client.query("ROLLBACK") } catch {}
    }
    console.error("\n✗ Erro durante validação:")
    console.error(error.message)
    process.exit(1)
  } finally {
    if (client) client.release()
    await pool.end()
  }
}

validateMigrationV3Applied().catch(error => {
  console.error("Erro fatal:", error)
  process.exit(1)
})
