"use strict"

const assert = require("node:assert/strict")
const {
  consultationScope,
  consultationLifecycleScope,
  reengagementScope,
  reminderToday
} = require("../src/domain/internal-scheduler-plans")

{
  const start = "2026-08-20T15:00:00.000Z"
  const scope = consultationScope({
    phone: "5585999990000",
    name: "Cliente",
    eventId: "event-1",
    dealId: "deal-1",
    datetime: start,
    end: "2026-08-20T16:00:00.000Z",
    reminders: {
      "24h": "2026-08-19T15:00:00.000Z",
      "1h": "2026-08-20T14:00:00.000Z"
    }
  }, { todayHour: 9, now: "2026-08-19T14:50:00.000Z" })
  assert.equal(scope.scopeType, "consultation")
  assert.equal(scope.scopeId, "event-1")
  assert.deepEqual(scope.jobs.map(job => job.kind), [
    "consultation_reminder", "consultation_reminder", "consultation_reminder", "consultation_lifecycle"
  ])
  assert.deepEqual(scope.jobs.slice(0, 3).map(job => job.payload.tipo), ["24h", "hoje", "1h"])
  assert.equal(scope.jobs.at(-1).scheduledFor, "2026-08-20T16:00:00.000Z")
  assert.equal(new Set(scope.jobs.map(job => job.dedupeKey)).size, 4)
}

{
  assert.equal(reminderToday("2026-08-20T15:00:00.000Z", 9).toISOString(), "2026-08-20T12:00:00.000Z")
  assert.equal(consultationScope({}), null)
}

{
  const scope = consultationScope({
    phone: "5585999990000",
    eventId: "event-late",
    datetime: "2026-08-20T15:00:00.000Z",
    reminders: {
      "24h": "2026-08-19T15:00:00.000Z",
      "1h": "2026-08-20T14:00:00.000Z"
    }
  }, { now: "2026-08-20T14:20:00.000Z" })
  assert.deepEqual(scope.jobs.filter(job => job.kind === "consultation_reminder").map(job => job.payload.tipo), ["1h"])
}

{
  const scope = reengagementScope({
    phone: "5585999990000",
    dealId: "deal-1",
    jobs: [{
      id: "job-1",
      tipoEvento: "documentos_pendentes",
      scheduledFor: "2026-08-20T15:00:00.000Z"
    }]
  })
  assert.equal(scope.jobs.length, 1)
  assert.equal(scope.jobs[0].kind, "reengagement")
  assert.equal(scope.jobs[0].payload.jobId, "job-1")
  assert.match(scope.jobs[0].dedupeKey, /^reengagement:/)
}

{
  const scope = consultationLifecycleScope({
    action: "cancel",
    eventId: "old-event",
    dealId: "deal-1",
    scheduledFor: "2026-08-20T12:00:00.000Z"
  })
  assert.equal(scope.jobs.length, 1)
  assert.equal(scope.jobs[0].payload.action, "cancel")
  assert.equal(scope.jobs[0].scheduledFor, "2026-08-20T12:00:00.000Z")
  assert.equal(consultationLifecycleScope({ action: "unknown", eventId: "x" }), null)
}

console.log("internal-scheduler-plans.test.js: ok")
