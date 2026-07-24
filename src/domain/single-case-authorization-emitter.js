"use strict"

/**
 * UNIDADE TRANSACIONAL DE EMISSÃO DE AUTORIZAÇÕES
 *
 * Esta unidade encapsula a lógica atômica de emissão de autorizações:
 * 1. Historiza autorizações não utilizáveis (expiradas, consumidas, revogadas)
 * 2. Verifica que nenhuma autorização vigente permanece
 * 3. Insere par de autorizações atomicamente
 * 4. Traduz 23505 seletivamente
 * 5. Faz ROLLBACK integral em falhas
 *
 * Hooks opcionais para teste:
 * - afterSupersede: executado após historização (para testes de rollback)
 * - afterFirstInsert: executado após primeiro INSERT (para testes de rollback)
 */

const { TABLE_NAME, ALGORITHM } = require("../infrastructure/single-case-authorization-postgres")

/**
 * Historiza autorizações não mais utilizáveis em todos os bindings do mesmo caseImportId.
 *
 * Escopo corrigido: remove o filtro por authorizable_plan_hash para permitir
 * supersede entre bindings diferentes do mesmo caso, preservando apenas o par
 * atualmente válido que será verificado em checkNoActiveAuthorizations().
 */
async function supersedeNonUsableAuthorizations(client, caseImportId, caseFingerprint, caseNumber) {
  const res = await client.query(
    `UPDATE ${TABLE_NAME}
     SET operational_status = 'HISTORICAL',
         superseded_at = clock_timestamp()
     WHERE case_import_id = $1
       AND case_fingerprint = $2
       AND case_number = $3
       AND authorization_type IN ('EXPLICIT_APPLY_AUTHORIZATION', 'EXTERNAL_WRITES_AUTHORIZATION')
       AND operational_status = 'ACTIVE'
       AND (
         expires_at <= clock_timestamp()
         OR consumed_at IS NOT NULL
         OR revoked_at IS NOT NULL
       )
     RETURNING authorization_id, authorization_type, authorizable_plan_hash, expires_at, consumed_at, revoked_at`,
    [caseImportId, caseFingerprint, caseNumber]
  )
  return res.rows
}

/**
 * Verifica se existe autorização vigente e utilizável
 */
async function checkNoActiveAuthorizations(client, caseImportId, caseFingerprint, caseNumber, aph) {
  const res = await client.query(
    `SELECT COUNT(*)::integer AS cnt
     FROM ${TABLE_NAME}
     WHERE case_import_id = $1
       AND case_fingerprint = $2
       AND case_number = $3
       AND authorizable_plan_hash = $4
       AND authorization_type IN ('EXPLICIT_APPLY_AUTHORIZATION', 'EXTERNAL_WRITES_AUTHORIZATION')
       AND operational_status = 'ACTIVE'
       AND consumed_at IS NULL
       AND revoked_at IS NULL
       AND expires_at > clock_timestamp()`,
    [caseImportId, caseFingerprint, caseNumber, aph]
  )
  if (res.rows[0].cnt > 0) {
    throw new Error("AUTHORIZATION_ALREADY_ACTIVE")
  }
}

/**
 * Emite par de autorizações atomicamente
 *
 * @param {object} client - Cliente PostgreSQL
 * @param {array} signedRecords - Registros assinados [EXPLICIT, EXTERNAL]
 * @param {object} binding - { caseImportId, caseFingerprint, caseNumber, authorizablePlanHash }
 * @param {object} hooks - Hooks opcionais para teste: { afterSupersede, afterFirstInsert }
 * @returns {object} { committed: true, superseded: [...] }
 */
async function emitAuthorizationPair(client, signedRecords, binding, hooks = {}) {
    const { caseImportId, caseFingerprint, caseNumber, authorizablePlanHash, requestedBy, requestId } = binding
    if (typeof requestedBy !== "string" || !/^[A-Za-z][A-Za-z0-9._:-]{2,63}$/.test(requestedBy)) {
      throw new Error("EMIT_REQUESTED_BY_FORMAT_INVALID")
    }
    if (typeof requestId !== 'string' || !requestId) {
      throw new Error('EMIT_REQUEST_ID_MISSING')
    }

    await client.query("BEGIN")

    try {
      // 1. Supersede non-usable authorizations across all bindings for this caseImportId
      const superseded = await supersedeNonUsableAuthorizations(
        client,
        caseImportId,
        caseFingerprint,
        caseNumber
      )

    // Hook para teste: falha após historização
    if (hooks.afterSupersede) {
      await hooks.afterSupersede({ superseded })
    }

    // 2. Final check: ensure no vigent authorization remains
    await checkNoActiveAuthorizations(
      client,
      caseImportId,
      caseFingerprint,
      caseNumber,
      authorizablePlanHash
    )

    // 3. Insert both new authorizations atomically
    for (let i = 0; i < signedRecords.length; i++) {
      const signed = signedRecords[i]
      const res = await client.query(
        `INSERT INTO ${TABLE_NAME} (
           authorization_id, schema_version, authorization_type,
           case_import_id, case_fingerprint, case_number,
           authorizable_plan_hash, plan_hash, manifest_hash, reservation_evidence_hash,
           scope, issuer, issued_at, expires_at,
           revoked, operational_status,
           consumed_at, consumed_by,
           signature, signature_algorithm,
           audit_metadata
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12,$13,$14,$15,$16,NULL,NULL,$17,$18,$19::jsonb)
         RETURNING authorization_id, authorization_type`,
        [
          signed.authorizationId,
          signed.schemaVersion,
          signed.type,
          signed.caseImportId,
          signed.caseFingerprint,
          signed.caseNumber,
          signed.authorizablePlanHash,
          signed.planHash,
          signed.manifestHash,
          signed.reservationEvidenceHash,
          JSON.stringify(signed.scope),
          signed.issuer,
          signed.issuedAt,
          signed.expiresAt,
          false,
          "ACTIVE",
          signed.proof,
          ALGORITHM,
          JSON.stringify({ requestedBy, requestId }),
        ]
      )

      if (res.rowCount !== 1) {
        throw new Error("AUTHORIZATION_INSERT_FAILED")
      }

      // Hook para teste: falha após primeiro INSERT
      if (i === 0 && hooks.afterFirstInsert) {
        await hooks.afterFirstInsert({ inserted: res.rows[0] })
      }
    }

    await client.query("COMMIT")

    return { committed: true, superseded }

  } catch (err) {
    await client.query("ROLLBACK").catch(() => {})

    // Translate unique-index violation only for the authorization binding index
    if (err.code === "23505") {
      const constraintName = err.constraint || err.detail || ""
      if (constraintName.includes("single_case_auth_one_active_binding")) {
        throw new Error("AUTHORIZATION_ALREADY_ACTIVE")
      }
      // Other unique violations are distinct errors
      throw new Error("UNIQUE_CONSTRAINT_VIOLATION")
    }

    throw err
  }
}

module.exports = {
  supersedeNonUsableAuthorizations,
  checkNoActiveAuthorizations,
  emitAuthorizationPair,
}
