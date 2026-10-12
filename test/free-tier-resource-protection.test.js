"use strict"

const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")

const root = path.join(__dirname, "..")
const server = fs.readFileSync(path.join(root, "server.js"), "utf8")
const workflow = fs.readFileSync(path.join(root, ".github", "workflows", "internal-scheduler-wakeup.yml"), "utf8")
const externalState = fs.readFileSync(path.join(root, "src", "infrastructure", "external-state-repository.js"), "utf8")
const schedulerPostgres = fs.readFileSync(path.join(root, "src", "infrastructure", "internal-scheduler-postgres.js"), "utf8")
const appsScriptFallback = fs.readFileSync(path.join(root, "docs", "google-apps-script-agendador.gs"), "utf8")

const publicHealth = server.slice(server.indexOf('app.get("/health"'), server.indexOf('app.get("/health-interno"'))
assert.match(publicHealth, /externalStateHealth\(\{ probe: false \}\)/)
assert.doesNotMatch(publicHealth, /probe: true/)

assert.match(server, /INTERNAL_SCHEDULER_LOOP_ENABLED/)
assert.match(server, /if \(INTERNAL_SCHEDULER_LOOP_ENABLED\) \{\s*internalSchedulerTimer = setInterval/)
assert.match(server, /timeMax: new Date\(now\.getTime\(\) \+ 3 \* 24 \* 60 \* 60 \* 1000\)/)
assert.doesNotMatch(server, /timeMax: new Date\(now\.getTime\(\) \+ 370 \* 24/)
assert.match(server, /planners: \[planejarReconciliacaoDiariaNoAgendador, planejarReengajamentosNoAgendador\]/)
assert.match(server, /calendar_reconciliation: \(\) => reconciliarCalendarNoAgendador\(\)/)
assert.match(server, /await planejarConsultaPorEventoNoAgendador\(eventId\)/)
assert.match(server, /await cancelarEscopoConsultaNoAgendador\(idEvento\)/)

assert.match(workflow, /cron: "7,27,47 9-23 \* \* \*"/)
assert.match(workflow, /cron: "7,27,47 0 \* \* \*"/)
assert.doesNotMatch(workflow, /timezone:/)
assert.match(workflow, /parsed\?\.status !== 'ok'/)
assert.match(appsScriptFallback, /everyMinutes\(30\)/)
assert.doesNotMatch(appsScriptFallback, /everyMinutes\(5\)/)

assert.match(externalState, /oraculum_state_documents\.checksum IS DISTINCT FROM EXCLUDED\.checksum/)
assert.match(schedulerPostgres, /payload IS DISTINCT FROM EXCLUDED\.payload/)

console.log("free-tier-resource-protection.test.js: ok")
