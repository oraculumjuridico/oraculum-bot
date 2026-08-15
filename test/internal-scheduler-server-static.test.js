"use strict"

const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")

const server = fs.readFileSync(path.join(__dirname, "..", "server.js"), "utf8")
assert.match(server, /app\.post\("\/internal\/processar-agendamentos", validarWebhookInterno/)
assert.match(server, /initializeInternalScheduler\(schedulerPool\)/)
assert.match(server, /INTERNAL_SCHEDULER_DATABASE_REQUIRED/)
assert.match(server, /setInterval\(\(\) =>/)
assert.match(server, /consultation_user_resolution/)
assert.match(server, /CONSULTATION_CONTEXT_TEMPORARILY_UNAVAILABLE/)
assert.match(server, /scheduler_cycle_completed/)
assert.match(server, /consultation_planning_skipped/)
assert.doesNotMatch(server, /datastore:searchRecords/)
console.log("internal-scheduler-server-static.test.js: ok")
