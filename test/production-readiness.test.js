"use strict"

const assert = require("node:assert/strict")
const { avaliarProntidaoProducao } = require("../src/config/production-readiness")

const complete = {
  NODE_ENV: "production",
  WHATSAPP_TOKEN: "configured",
  PHONE_NUMBER_ID: "configured",
  VERIFY_TOKEN: "configured",
  APP_SECRET: "configured",
  HUBSPOT_TOKEN: "configured",
  GOOGLE_CLIENT_ID: "configured",
  GOOGLE_CLIENT_SECRET: "configured",
  GOOGLE_REFRESH_TOKEN: "configured",
  DRIVE_PASTA_CLIENTES_ID: "configured",
  EXTERNAL_STATE_DATABASE_URL: "postgresql://configured.invalid/db",
  INTERNAL_WEBHOOK_SECRET: "configured",
  PUBLIC_BASE_URL: "https://example.invalid",
  WHATSAPP_ADMIN: "5500000000000",
  ADMIN_WHATSAPP_PASSWORD_HASH: "configured",
  POST_HUMAN_PILOT_CASES: "TESTE.001"
}

const ready = avaliarProntidaoProducao(complete)
assert.equal(ready.ready, true)
assert.deepEqual(ready.blockers, [])
assert.equal(ready.checks.some(item => Object.values(item).includes("configured")), false, "diagnóstico não pode expor valores")

const missing = avaliarProntidaoProducao({ NODE_ENV: "production" })
assert.equal(missing.ready, false)
assert.equal(missing.blockers.includes("meta.inbound"), true)
assert.equal(missing.blockers.includes("persistence.external"), true)

const unsafeScheduler = avaliarProntidaoProducao({ ...complete, INTERNAL_SCHEDULER_ENABLED: "true" })
assert.equal(unsafeScheduler.ready, false)
assert.equal(unsafeScheduler.blockers.includes("scheduler.safe_scope"), true)

const safeScheduler = avaliarProntidaoProducao({
  ...complete,
  INTERNAL_SCHEDULER_ENABLED: "true",
  AUTOMATION_PILOT_CASES: "TESTE.001"
})
assert.equal(safeScheduler.ready, true)

const { POST_HUMAN_PILOT_CASES, ...withoutPostHumanScope } = complete
const unsafePostHuman = avaliarProntidaoProducao({ ...withoutPostHumanScope, POST_HUMAN_COMPLEMENTATION_ENABLED: "true" })
assert.equal(unsafePostHuman.ready, false)
assert.equal(unsafePostHuman.blockers.includes("post_human.safe_scope"), true)

console.log("production-readiness.test.js: ok")
