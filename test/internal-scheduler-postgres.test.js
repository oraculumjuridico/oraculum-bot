"use strict"

const assert = require("node:assert/strict")
const {
  validateJob,
  initializeInternalScheduler,
  createInternalSchedulerRepository
} = require("../src/infrastructure/internal-scheduler-postgres");

function job() {
  return {
    kind: "reengagement",
    dedupeKey: "reengagement:phone:type:date",
    scopeType: "reengagement",
    scopeId: "5585999990000",
    scheduledFor: "2026-08-20T15:00:00.000Z",
    payload: { phone: "5585999990000" }
  }
}

(async () => {
  assert.equal(validateJob(job()).maxAttempts, 5)
  assert.equal(validateJob({ ...job(), kind: "calendar_reconciliation" }).kind, "calendar_reconciliation")
  assert.throws(() => validateJob({ ...job(), kind: "unknown" }), /SCHEDULER_JOB_INVALID/)
  assert.throws(() => validateJob({ ...job(), payload: [] }), /SCHEDULER_PAYLOAD_INVALID/)

  const initQueries = []
  await initializeInternalScheduler({ query: async sql => { initQueries.push(sql); return { rows: [], rowCount: 0 } } })
  assert.equal(initQueries.length, 3)
  assert.match(initQueries[0], /CREATE TABLE IF NOT EXISTS oraculum_scheduled_jobs/)
  assert.match(initQueries.join("\n"), /CREATE INDEX IF NOT EXISTS/)

  const transactionQueries = []
  const client = {
    async query(sql) {
      transactionQueries.push(String(sql))
      return { rows: [], rowCount: 0 }
    },
    release() { transactionQueries.push("RELEASE") }
  }
  const direct = []
  const pool = {
    async connect() { return client },
    async query(sql) {
      direct.push(String(sql))
      return { rows: [{ id: "job-1" }], rowCount: 1 }
    }
  }
  const repository = createInternalSchedulerRepository({ pool })
  const planned = await repository.replaceScope({
    scopeType: "reengagement", scopeId: "5585999990000", jobs: [job()]
  })
  assert.equal(planned.planned, 1)
  assert.match(transactionQueries.join("\n"), /ON CONFLICT\(dedupe_key\)/)
  assert.match(transactionQueries.join("\n"), /COMMIT/)

  await repository.claimDue()
  const claimQueries = transactionQueries.join("\n")
  assert.match(claimQueries, /\$1::timestamptz/)
  assert.match(claimQueries, /LIMIT \$2::integer/)

  const typedClaimQueries = []
  const typedClaimClient = {
    async query(sql) {
      const query = String(sql)
      typedClaimQueries.push(query)
      if (query.includes(`SELECT id FROM`)) return { rows: [{ id: "00000000-0000-4000-8000-000000000001" }], rowCount: 1 }
      if (query.includes(`UPDATE oraculum_scheduled_jobs`)) return { rows: [{ id: "00000000-0000-4000-8000-000000000001" }], rowCount: 1 }
      return { rows: [], rowCount: 0 }
    },
    release() {}
  }
  const typedClaimRepository = createInternalSchedulerRepository({
    pool: { async connect() { return typedClaimClient } }
  })
  await typedClaimRepository.claimDue()
  const typedClaimSql = typedClaimQueries.join("\n")
  assert.match(typedClaimSql, /lease_id=\$2::uuid/)
  assert.match(typedClaimSql, /\$3::integer \* INTERVAL/)
  assert.match(typedClaimSql, /ANY\(\$4::uuid\[\]\)/)

  await repository.complete({ id: "job-1", leaseId: "lease-1" }, "sent", { ok: true })
  assert.match(direct[0], /lease_id=\$2/)
  console.log("internal-scheduler-postgres.test.js: ok")
})().catch(error => { console.error(error); process.exit(1) })
