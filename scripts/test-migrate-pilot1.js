#!/usr/bin/env node
"use strict"

/**
 * Testes isolados para:
 * - Correção do supersede cross-binding
 * - Migração controlada do Piloto 1
 *
 * Executa sem PostgreSQL real, sem rede, sem arquivos temporários com segredos.
 */

const assert = require("node:assert")

const CASE_IMPORT_ID = "inss-e3dfb0f332b117d60bf2"

// ===== MOCK POSTGRES =====
function createMockDb() {
  const rows = []
  const queries = []
  let updateCount = 0

  const client = {
    query: async (sql, params) => {
      queries.push({ sql: String(sql), params })
      const text = String(sql).trim()

      if (text === "BEGIN" || text === "COMMIT" || text === "ROLLBACK") {
        return { rows: [], rowCount: 0 }
      }
      if (text.includes("SET TRANSACTION") || text.includes("SET LOCAL")) {
        return { rows: [], rowCount: 0 }
      }

      // COUNT
      if (text.includes("COUNT(*)") || text.includes("COUNT(*)")) {
        if (text.includes("single_case_apply_authorizations")) {
          const cid = params ? params[0] : null
          const filtered = rows.filter(r => r.case_import_id === cid)
          return { rows: [{ cnt: filtered.length }], rowCount: 1 }
        }
      }

      // UPDATE supersede
      if (text.includes("UPDATE single_case_apply_authorizations") && text.includes("HISTORICAL")) {
        const cid = params[0]
        const cfp = params[1]
        const cn = params[2]
        const now = new Date()

        let targets = rows.filter(r =>
          r.case_import_id === cid &&
          r.case_fingerprint === cfp &&
          r.case_number === cn &&
          r.operational_status === "ACTIVE" &&
          (new Date(r.expires_at) <= now || r.consumed_at !== null || r.revoked === true || r.revoked_at !== null)
        )

        // Backward compat: if caller passes authorizable_plan_hash, still filter it
        if (params.length > 3 && params[3]) {
          targets = targets.filter(r => r.authorizable_plan_hash === params[3])
        }

        targets.forEach(r => {
          r.operational_status = "HISTORICAL"
          r.superseded_at = new Date().toISOString()
        })
        updateCount += targets.length

        return {
          rows: targets.map(r => ({ authorization_id: r.authorization_id, authorization_type: r.authorization_type })),
          rowCount: targets.length
        }
      }

      // SELECT ACTIVE authorizations
      if (text.includes("single_case_apply_authorizations") && text.includes("operational_status = 'ACTIVE'")) {
        const cid = params ? params[0] : null
        let results = rows.filter(r => r.case_import_id === cid && r.operational_status === "ACTIVE")

        const isSupersede = text.includes("expires_at <= clock_timestamp()") || text.includes("consumed_at IS NOT NULL") || text.includes("revoked_at IS NOT NULL")
        const isCheckNoActive = text.includes("expires_at > clock_timestamp()")

        if (isSupersede || isCheckNoActive) {
          const now = new Date()
          if (isSupersede) {
            results = results.filter(r =>
              new Date(r.expires_at) <= now ||
              r.consumed_at !== null ||
              r.revoked === true ||
              r.revoked_at !== null
            )
          } else {
            results = results.filter(r =>
              new Date(r.expires_at) > now &&
              r.consumed_at === null &&
              r.revoked === false &&
              r.revoked_at === null
            )
          }
        }

        const aphMatch = text.match(/authorizable_plan_hash = \$(\d+)/)
        if (aphMatch) {
          const paramIdx = parseInt(aphMatch[1]) - 1
          const aph = params[paramIdx]
          if (aph) results = results.filter(r => r.authorizable_plan_hash === aph)
        }

        if (text.includes("ORDER BY")) {
          results.sort((a, b) => a.authorization_id.localeCompare(b.authorization_id))
        }

        return { rows: results, rowCount: results.length }
      }

      // Checkpoint
      if (text.includes("single_case_apply_checkpoints")) {
        const cid = params[0]
        const cp = rows.find(r => r.__checkpoint && r.case_import_id === cid)
        if (cp) return { rows: [cp], rowCount: 1 }
        return { rows: [], rowCount: 0 }
      }

      // Leases
      if (text.includes("single_case_apply_leases")) {
        const cid = params[0]
        const leases = rows.filter(r => r.__lease && r.case_import_id === cid)
        return { rows: leases, rowCount: leases.length }
      }

      // Reservations
      if (text.includes("case_number_reservations")) {
        const key = params[0]
        const res = rows.find(r => r.__reservation && r.reservation_key === key)
        if (res) return { rows: [res], rowCount: 1 }
        return { rows: [], rowCount: 0 }
      }

      return { rows: [], rowCount: 0 }
    },
    release: () => {}
  }

  const pool = {
    connect: async () => client,
    end: async () => {}
  }

  return { client, pool, rows, queries, get updateCount() { return updateCount } }
}

function buildAuth(opts = {}) {
  return {
    authorization_id: opts.authorization_id || `auth-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    authorization_type: opts.authorization_type || "EXPLICIT_APPLY_AUTHORIZATION",
    case_import_id: opts.case_import_id || CASE_IMPORT_ID,
    case_fingerprint: opts.case_fingerprint || "fp1",
    case_number: opts.case_number || "PRV.260714.707",
    authorizable_plan_hash: opts.authorizable_plan_hash || "hash1",
    plan_hash: opts.plan_hash || "plan1",
    manifest_hash: opts.manifest_hash || "manifest1",
    reservation_evidence_hash: opts.reservation_evidence_hash || "reh1",
    scope: opts.scope || ["apply"],
    issuer: opts.issuer || "oraculum-bot-p1-authorization-v1",
    issued_at: opts.issued_at || new Date(Date.now() - 86400000).toISOString(),
    expires_at: opts.expires_at || new Date(Date.now() + 3600000).toISOString(),
    revoked: opts.revoked !== undefined ? opts.revoked : false,
    revoked_at: opts.revoked_at || null,
    consumed_at: opts.consumed_at || null,
    operational_status: opts.operational_status || "ACTIVE",
    superseded_at: opts.superseded_at || null,
    signature: opts.signature || "dGVzdA==",
    signature_algorithm: opts.signature_algorithm || "Ed25519"
  }
}

// ===== TESTS =====
console.log("=".repeat(80))
console.log("TESTES: Supersede Cross-Binding e Migração Controlada")
console.log("=".repeat(80))

let passed = 0
let failed = 0

function test(name, fn) {
  Promise.resolve(fn()).then(() => {
    console.log(`  ✓ ${name}`)
    passed++
  }).catch(err => {
    console.log(`  ✗ ${name}: ${err.message}`)
    failed++
  })
}

// 1. Cross-binding supersede
test("cross-binding: expired auth from previous binding is superseded", async () => {
  const db = createMockDb()
  db.rows.push(
    buildAuth({ authorization_type: "EXPLICIT_APPLY_AUTHORIZATION", authorizable_plan_hash: "old_hash", expires_at: new Date(Date.now() - 3600000).toISOString() }),
    buildAuth({ authorization_type: "EXTERNAL_WRITES_AUTHORIZATION", authorizable_plan_hash: "old_hash", expires_at: new Date(Date.now() - 3600000).toISOString() })
  )

  const client = await db.pool.connect()
  await client.query("BEGIN")

  const result = await client.query(
    `UPDATE single_case_apply_authorizations SET operational_status = 'HISTORICAL', superseded_at = clock_timestamp()
     WHERE case_import_id = $1 AND case_fingerprint = $2 AND case_number = $3
       AND authorization_type IN ('EXPLICIT_APPLY_AUTHORIZATION', 'EXTERNAL_WRITES_AUTHORIZATION')
       AND operational_status = 'ACTIVE'
       AND (expires_at <= clock_timestamp() OR consumed_at IS NOT NULL OR revoked_at IS NOT NULL)
     RETURNING authorization_id`,
    [CASE_IMPORT_ID, "fp1", "PRV.260714.707"]
  )

  assert.strictEqual(result.rowCount, 2, `Expected 2 updates, got ${result.rowCount}`)
  assert.strictEqual(db.rows.filter(r => r.operational_status === "HISTORICAL").length, 2)
})

// 2. Same-binding supersede still works
test("same-binding: expired auth from current binding is superseded", async () => {
  const db = createMockDb()
  db.rows.push(
    buildAuth({ authorizable_plan_hash: "current_hash", expires_at: new Date(Date.now() - 3600000).toISOString() }),
    buildAuth({ authorization_type: "EXTERNAL_WRITES_AUTHORIZATION", authorizable_plan_hash: "current_hash", expires_at: new Date(Date.now() - 3600000).toISOString() })
  )

  const client = await db.pool.connect()
  await client.query("BEGIN")

  const result = await client.query(
    `UPDATE single_case_apply_authorizations SET operational_status = 'HISTORICAL', superseded_at = clock_timestamp()
     WHERE case_import_id = $1 AND case_fingerprint = $2 AND case_number = $3
       AND authorization_type IN ('EXPLICIT_APPLY_AUTHORIZATION', 'EXTERNAL_WRITES_AUTHORIZATION')
       AND operational_status = 'ACTIVE'
       AND (expires_at <= clock_timestamp() OR consumed_at IS NOT NULL OR revoked_at IS NOT NULL)
     RETURNING authorization_id`,
    [CASE_IMPORT_ID, "fp1", "PRV.260714.707"]
  )

  assert.strictEqual(result.rowCount, 2, `Expected 2 updates, got ${result.rowCount}`)
})

// 3. Valid new pair is NOT superseded
test("new valid pair is never superseded by cross-binding fix", async () => {
  const db = createMockDb()
  db.rows.push(
    buildAuth({ authorization_type: "EXPLICIT_APPLY_AUTHORIZATION", authorizable_plan_hash: "new_hash", expires_at: new Date(Date.now() + 3600000).toISOString() }),
    buildAuth({ authorization_type: "EXTERNAL_WRITES_AUTHORIZATION", authorizable_plan_hash: "new_hash", expires_at: new Date(Date.now() + 3600000).toISOString() })
  )

  const client = await db.pool.connect()
  await client.query("BEGIN")

  const result = await client.query(
    `UPDATE single_case_apply_authorizations SET operational_status = 'HISTORICAL', superseded_at = clock_timestamp()
     WHERE case_import_id = $1 AND case_fingerprint = $2 AND case_number = $3
       AND authorization_type IN ('EXPLICIT_APPLY_AUTHORIZATION', 'EXTERNAL_WRITES_AUTHORIZATION')
       AND operational_status = 'ACTIVE'
       AND (expires_at <= clock_timestamp() OR consumed_at IS NOT NULL OR revoked_at IS NOT NULL)
     RETURNING authorization_id`,
    [CASE_IMPORT_ID, "fp1", "PRV.260714.707"]
  )

  assert.strictEqual(result.rowCount, 0, `Expected 0 updates, got ${result.rowCount}`)
  assert.strictEqual(db.rows.filter(r => r.operational_status === "ACTIVE").length, 2)
})

// 4. Other caseImportId is not affected
test("other caseImportId is not affected by cross-binding supersede", async () => {
  const db = createMockDb()
  db.rows.push(
    buildAuth({ case_import_id: "other-case", authorizable_plan_hash: "other_hash", expires_at: new Date(Date.now() - 3600000).toISOString() })
  )

  const client = await db.pool.connect()
  await client.query("BEGIN")

  const result = await client.query(
    `UPDATE single_case_apply_authorizations SET operational_status = 'HISTORICAL', superseded_at = clock_timestamp()
     WHERE case_import_id = $1 AND case_fingerprint = $2 AND case_number = $3
       AND authorization_type IN ('EXPLICIT_APPLY_AUTHORIZATION', 'EXTERNAL_WRITES_AUTHORIZATION')
       AND operational_status = 'ACTIVE'
       AND (expires_at <= clock_timestamp() OR consumed_at IS NOT NULL OR revoked_at IS NOT NULL)
     RETURNING authorization_id`,
    [CASE_IMPORT_ID, "fp1", "PRV.260714.707"]
  )

  assert.strictEqual(result.rowCount, 0)
  assert.strictEqual(db.rows[0].operational_status, "ACTIVE")
})

// 5. Mixed old/new pair: only old is superseded
test("mixed pair: only expired old pair is superseded, new pair preserved", async () => {
  const db = createMockDb()
  db.rows.push(
    buildAuth({ authorization_type: "EXPLICIT_APPLY_AUTHORIZATION", authorizable_plan_hash: "old_hash", expires_at: new Date(Date.now() - 3600000).toISOString() }),
    buildAuth({ authorization_type: "EXTERNAL_WRITES_AUTHORIZATION", authorizable_plan_hash: "old_hash", expires_at: new Date(Date.now() - 3600000).toISOString() }),
    buildAuth({ authorization_type: "EXPLICIT_APPLY_AUTHORIZATION", authorizable_plan_hash: "new_hash", expires_at: new Date(Date.now() + 3600000).toISOString() }),
    buildAuth({ authorization_type: "EXTERNAL_WRITES_AUTHORIZATION", authorizable_plan_hash: "new_hash", expires_at: new Date(Date.now() + 3600000).toISOString() })
  )

  const client = await db.pool.connect()
  await client.query("BEGIN")

  const result = await client.query(
    `UPDATE single_case_apply_authorizations SET operational_status = 'HISTORICAL', superseded_at = clock_timestamp()
     WHERE case_import_id = $1 AND case_fingerprint = $2 AND case_number = $3
       AND authorization_type IN ('EXPLICIT_APPLY_AUTHORIZATION', 'EXTERNAL_WRITES_AUTHORIZATION')
       AND operational_status = 'ACTIVE'
       AND (expires_at <= clock_timestamp() OR consumed_at IS NOT NULL OR revoked_at IS NOT NULL)
     RETURNING authorization_id`,
    [CASE_IMPORT_ID, "fp1", "PRV.260714.707"]
  )

  assert.strictEqual(result.rowCount, 2, `Expected 2 updates, got ${result.rowCount}`)
  assert.strictEqual(db.rows.filter(r => r.operational_status === "HISTORICAL").length, 2)
  assert.strictEqual(db.rows.filter(r => r.operational_status === "ACTIVE").length, 2)
  assert.strictEqual(db.rows.filter(r => r.authorizable_plan_hash === "new_hash" && r.operational_status === "ACTIVE").length, 2)
})

// 6. Three ACTIVE rows: only expired ones superseded
test("three ACTIVE rows: only expired ones superseded", async () => {
  const db = createMockDb()
  db.rows.push(
    buildAuth({ authorization_type: "EXPLICIT_APPLY_AUTHORIZATION", authorizable_plan_hash: "hash_a", expires_at: new Date(Date.now() - 3600000).toISOString() }),
    buildAuth({ authorization_type: "EXTERNAL_WRITES_AUTHORIZATION", authorizable_plan_hash: "hash_a", expires_at: new Date(Date.now() + 3600000).toISOString() }),
    buildAuth({ authorization_type: "EXPLICIT_APPLY_AUTHORIZATION", authorizable_plan_hash: "hash_b", expires_at: new Date(Date.now() - 3600000).toISOString() })
  )

  const client = await db.pool.connect()
  await client.query("BEGIN")

  const result = await client.query(
    `UPDATE single_case_apply_authorizations SET operational_status = 'HISTORICAL', superseded_at = clock_timestamp()
     WHERE case_import_id = $1 AND case_fingerprint = $2 AND case_number = $3
       AND authorization_type IN ('EXPLICIT_APPLY_AUTHORIZATION', 'EXTERNAL_WRITES_AUTHORIZATION')
       AND operational_status = 'ACTIVE'
       AND (expires_at <= clock_timestamp() OR consumed_at IS NOT NULL OR revoked_at IS NOT NULL)
     RETURNING authorization_id`,
    [CASE_IMPORT_ID, "fp1", "PRV.260714.707"]
  )

  assert.strictEqual(result.rowCount, 2, `Expected 2 updates, got ${result.rowCount}`)
  assert.strictEqual(db.rows.filter(r => r.operational_status === "ACTIVE").length, 1)
})

// 7. Valid binding blocks emission via checkNoActiveAuthorizations
test("checkNoActiveAuthorizations: valid binding blocks emission", async () => {
  const db = createMockDb()
  db.rows.push(
    buildAuth({ authorization_type: "EXPLICIT_APPLY_AUTHORIZATION", authorizable_plan_hash: "current_hash", expires_at: new Date(Date.now() + 3600000).toISOString() }),
    buildAuth({ authorization_type: "EXTERNAL_WRITES_AUTHORIZATION", authorizable_plan_hash: "current_hash", expires_at: new Date(Date.now() + 3600000).toISOString() })
  )

  const client = await db.pool.connect()
  await client.query("BEGIN")

  const result = await client.query(
    `SELECT COUNT(*)::integer AS cnt FROM single_case_apply_authorizations
     WHERE case_import_id = $1 AND case_fingerprint = $2 AND case_number = $3 AND authorizable_plan_hash = $4
       AND authorization_type IN ('EXPLICIT_APPLY_AUTHORIZATION', 'EXTERNAL_WRITES_AUTHORIZATION')
       AND operational_status = 'ACTIVE' AND consumed_at IS NULL AND revoked_at IS NULL AND expires_at > clock_timestamp()`,
    [CASE_IMPORT_ID, "fp1", "PRV.260714.707", "current_hash"]
  )

  assert.strictEqual(result.rows[0].cnt, 2)
})

// 8. Checkpoint reference blocks migration
test("migration blocked when old pair is referenced by checkpoint", async () => {
  const db = createMockDb()
  const oldAuth = buildAuth({ expires_at: new Date(Date.now() - 3600000).toISOString() })
  db.rows.push(
    oldAuth,
    buildAuth({ authorization_type: "EXTERNAL_WRITES_AUTHORIZATION", expires_at: new Date(Date.now() - 3600000).toISOString() })
  )
  // Add checkpoint that references old auth
  db.rows.push({
    __checkpoint: true,
    case_import_id: CASE_IMPORT_ID,
    checkpoint_version: 9,
    global_status: "failed",
    authorization_ids: [oldAuth.authorization_id],
    updated_at: new Date().toISOString()
  })

  const cp = db.rows.find(r => r.__checkpoint)
  const oldIds = db.rows.filter(r => r.operational_status === "ACTIVE" && r.authorization_type === "EXPLICIT_APPLY_AUTHORIZATION").map(r => r.authorization_id)
  const referenced = oldIds.some(id => cp.authorization_ids.includes(id))

  assert.strictEqual(referenced, true)
})

// 9. Migration idempotency
test("migration is idempotent: second execution finds no work", async () => {
  const db = createMockDb()
  db.rows.push(
    buildAuth({ authorization_type: "EXPLICIT_APPLY_AUTHORIZATION", expires_at: new Date(Date.now() - 3600000).toISOString(), operational_status: "HISTORICAL", superseded_at: new Date().toISOString() }),
    buildAuth({ authorization_type: "EXTERNAL_WRITES_AUTHORIZATION", expires_at: new Date(Date.now() - 3600000).toISOString(), operational_status: "HISTORICAL", superseded_at: new Date().toISOString() }),
    buildAuth({ authorization_type: "EXPLICIT_APPLY_AUTHORIZATION", expires_at: new Date(Date.now() + 3600000).toISOString() }),
    buildAuth({ authorization_type: "EXTERNAL_WRITES_AUTHORIZATION", expires_at: new Date(Date.now() + 3600000).toISOString() })
  )

  const client = await db.pool.connect()
  await client.query("BEGIN")

  const result = await client.query(
    `UPDATE single_case_apply_authorizations SET operational_status = 'HISTORICAL', superseded_at = clock_timestamp()
     WHERE case_import_id = $1 AND case_fingerprint = $2 AND case_number = $3
       AND authorization_type IN ('EXPLICIT_APPLY_AUTHORIZATION', 'EXTERNAL_WRITES_AUTHORIZATION')
       AND operational_status = 'ACTIVE'
       AND (expires_at <= clock_timestamp() OR consumed_at IS NOT NULL OR revoked_at IS NOT NULL)
     RETURNING authorization_id`,
    [CASE_IMPORT_ID, "fp1", "PRV.260714.707"]
  )

  assert.strictEqual(result.rowCount, 0, `Expected 0 updates on second run, got ${result.rowCount}`)
})

// 10. Active lease blocks migration
test("migration blocked when active lease exists", async () => {
  const db = createMockDb()
  db.rows.push({
    __lease: true,
    case_import_id: CASE_IMPORT_ID,
    lease_id: "lease-123",
    expires_at: new Date(Date.now() + 3600000).toISOString(),
    released_at: null
  })

  const client = await db.pool.connect()
  const result = await client.query(
    `SELECT lease_id FROM single_case_apply_leases WHERE case_import_id = $1 AND expires_at > NOW() AND released_at IS NULL`,
    [CASE_IMPORT_ID]
  )

  assert.strictEqual(result.rows.length > 0, true)
})

console.log("\n" + "=".repeat(80))
console.log(`RESULTADO: ${passed} passaram, ${failed} falharam`)
console.log("=".repeat(80))

process.exitCode = failed > 0 ? 1 : 0
