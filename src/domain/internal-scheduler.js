"use strict"

function sanitizedCode(error) {
  const value = String(error?.code || error?.message || "DISPATCH_FAILED").toUpperCase()
  // PostgreSQL uses five-character SQLSTATE values, and several start with a
  // digit (for example 42P01). Prefixing them keeps the response safe while
  // retaining enough information to diagnose production persistence failures.
  if (/^[0-9A-Z]{5}$/.test(value)) return `PG_${value}`
  return /^[A-Z][A-Z0-9_]{2,99}$/.test(value) ? value : "DISPATCH_FAILED"
}

function withSchedulerPhase(error, phase) {
  const normalized = error instanceof Error ? error : new Error("SCHEDULER_OPERATION_FAILED")
  if (!normalized.schedulerPhase) normalized.schedulerPhase = phase
  return normalized
}

async function processInternalSchedule({
  repository,
  planners = [],
  dispatchers = {},
  limit = 25,
  claimPasses = 1,
  logger = () => {}
} = {}) {
  if (!repository || typeof repository.claimDue !== "function") throw new Error("SCHEDULER_REPOSITORY_MISSING")
  const summary = { plannedScopes: 0, plannedJobs: 0, claimed: 0, sent: 0, skipped: 0, retried: 0, failed: 0 }

  for (const planner of planners) {
    let scopes
    try {
      scopes = await planner()
    } catch (error) {
      throw withSchedulerPhase(error, "planner")
    }
    for (const scope of scopes || []) {
      let result
      try {
        result = await repository.replaceScope(scope)
      } catch (error) {
        throw withSchedulerPhase(error, "planning_persistence")
      }
      summary.plannedScopes += 1
      summary.plannedJobs += result.planned
    }
  }

  const passes = Math.max(1, Math.min(3, Number(claimPasses) || 1))
  for (let pass = 0; pass < passes; pass++) {
    let jobs
    try {
      jobs = await repository.claimDue(limit)
    } catch (error) {
      throw withSchedulerPhase(error, "claim")
    }
    summary.claimed += jobs.length
    if (!jobs.length) break
    let continueClaim = false
    for (const job of jobs) {
      try {
        const dispatch = dispatchers[job.kind]
        if (typeof dispatch !== "function") throw Object.assign(new Error("DISPATCHER_MISSING"), { retryable: false })
        const result = await dispatch(job)
        if (result?.continueClaim === true) continueClaim = true
        const outcome = result?.outcome === "sent" ? "sent" : "skipped"
        await repository.complete(job, outcome, result || {})
        summary[outcome] += 1
        logger("scheduler_job_completed", { kind: job.kind, outcome, attempts: job.attempts })
      } catch (error) {
        let failed
        try {
          failed = await repository.failJob(job, sanitizedCode(error), error?.retryable !== false)
        } catch (persistenceError) {
          throw withSchedulerPhase(persistenceError, "job_result_persistence")
        }
        summary[failed.retrying ? "retried" : "failed"] += 1
        logger("scheduler_job_failed", { kind: job.kind, retrying: failed.retrying, errorCode: sanitizedCode(error) })
      }
    }
    if (!continueClaim) break
  }
  return summary
}

module.exports = { sanitizedCode, withSchedulerPhase, processInternalSchedule }
