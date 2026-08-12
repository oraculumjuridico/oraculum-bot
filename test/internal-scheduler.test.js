"use strict"

const assert = require("node:assert/strict")
const { processInternalSchedule, sanitizedCode } = require("../src/domain/internal-scheduler");

(async () => {
  const completed = []
  const failed = []
  const repository = {
    async replaceScope(scope) { return { planned: scope.jobs.length } },
    async claimDue() {
      return [
        { id: "1", kind: "consultation_reminder", attempts: 1, maxAttempts: 5 },
        { id: "2", kind: "reengagement", attempts: 1, maxAttempts: 5 },
        { id: "3", kind: "consultation_lifecycle", attempts: 5, maxAttempts: 5 }
      ]
    },
    async complete(job, outcome, result) { completed.push({ job, outcome, result }) },
    async failJob(job, code, retryable) {
      const retrying = retryable && job.attempts < job.maxAttempts
      failed.push({ job, code, retryable, retrying })
      return { retrying }
    }
  }
  const summary = await processInternalSchedule({
    repository,
    planners: [async () => [{ scopeType: "x", scopeId: "1", jobs: [{}, {}] }]],
    dispatchers: {
      consultation_reminder: async () => ({ outcome: "sent" }),
      reengagement: async () => ({ outcome: "skipped", reason: "not_eligible" }),
      consultation_lifecycle: async () => { throw new Error("TEMPORARY_FAILURE") }
    }
  })
  assert.deepEqual(summary, {
    plannedScopes: 1, plannedJobs: 2, claimed: 3,
    sent: 1, skipped: 1, retried: 0, failed: 1
  })
  assert.deepEqual(completed.map(item => item.outcome), ["sent", "skipped"])
  assert.equal(failed[0].code, "TEMPORARY_FAILURE")
  assert.equal(sanitizedCode(new Error("contains private detail: 123")), "DISPATCH_FAILED")
  console.log("internal-scheduler.test.js: ok")
})().catch(error => { console.error(error); process.exit(1) })
