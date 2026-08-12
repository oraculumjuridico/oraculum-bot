"use strict"

function sanitizedCode(error) {
  const value = String(error?.code || error?.message || "DISPATCH_FAILED").toUpperCase()
  return /^[A-Z][A-Z0-9_]{2,99}$/.test(value) ? value : "DISPATCH_FAILED"
}

async function processInternalSchedule({
  repository,
  planners = [],
  dispatchers = {},
  limit = 25,
  logger = () => {}
} = {}) {
  if (!repository || typeof repository.claimDue !== "function") throw new Error("SCHEDULER_REPOSITORY_MISSING")
  const summary = { plannedScopes: 0, plannedJobs: 0, claimed: 0, sent: 0, skipped: 0, retried: 0, failed: 0 }

  for (const planner of planners) {
    const scopes = await planner()
    for (const scope of scopes || []) {
      const result = await repository.replaceScope(scope)
      summary.plannedScopes += 1
      summary.plannedJobs += result.planned
    }
  }

  const jobs = await repository.claimDue(limit)
  summary.claimed = jobs.length
  for (const job of jobs) {
    try {
      const dispatch = dispatchers[job.kind]
      if (typeof dispatch !== "function") throw Object.assign(new Error("DISPATCHER_MISSING"), { retryable: false })
      const result = await dispatch(job)
      const outcome = result?.outcome === "sent" ? "sent" : "skipped"
      await repository.complete(job, outcome, result || {})
      summary[outcome] += 1
      logger("scheduler_job_completed", { kind: job.kind, outcome, attempts: job.attempts })
    } catch (error) {
      const failed = await repository.failJob(job, sanitizedCode(error), error?.retryable !== false)
      summary[failed.retrying ? "retried" : "failed"] += 1
      logger("scheduler_job_failed", { kind: job.kind, retrying: failed.retrying, errorCode: sanitizedCode(error) })
    }
  }
  return summary
}

module.exports = { sanitizedCode, processInternalSchedule }
