const { assertCanonicalCasePlanReady, PLAN_STATUS } = require("./canonical-case-plan")

const STEPS = Object.freeze([
  "identity",
  "contact",
  "deal",
  "association",
  "case_number",
  "drive",
  "documents",
  "hubspot",
  "tasks",
  "internal_notifications",
  "final_verify"
])

function createCheckpoint(plan) {
  return {
    schemaVersion: 1,
    planHash: plan.hash,
    status: "pending",
    steps: Object.fromEntries(STEPS.map(step => [step, { status: "pending" }]))
  }
}

function createCanonicalCaseExecutor({ adapters = {}, checkpointRepository } = {}) {
  if (!checkpointRepository?.load || !checkpointRepository?.save) throw new Error("checkpoint repository required")

  async function execute(plan) {
    assertCanonicalCasePlanReady(plan)
    let checkpoint = await checkpointRepository.load(plan.hash) || createCheckpoint(plan)
    if (checkpoint.planHash !== plan.hash) throw Object.assign(new Error("checkpoint plan mismatch"), { code: "CHECKPOINT_PLAN_MISMATCH" })
    if (checkpoint.status === "completed") return { completed: true, resumed: true, checkpoint }

    for (const step of STEPS) {
      if (checkpoint.steps[step]?.status === "completed") continue
      const handler = adapters[step]
      if (typeof handler !== "function") throw Object.assign(new Error(`canonical adapter missing ${step}`), { code: "CANONICAL_ADAPTER_MISSING", step })
      checkpoint.steps[step] = { status: "processing", startedAt: new Date().toISOString() }
      await checkpointRepository.save(plan.hash, checkpoint)
      try {
        const result = await handler(plan, checkpoint)
        checkpoint.steps[step] = { status: "completed", completedAt: new Date().toISOString(), result: result || null }
        await checkpointRepository.save(plan.hash, checkpoint)
      } catch (error) {
        checkpoint.status = "blocked"
        checkpoint.steps[step] = { status: "failed", code: error.code || "CANONICAL_STEP_FAILED" }
        await checkpointRepository.save(plan.hash, checkpoint)
        throw error
      }
    }
    checkpoint.status = "completed"
    checkpoint.completedAt = new Date().toISOString()
    await checkpointRepository.save(plan.hash, checkpoint)
    plan.status = PLAN_STATUS.APPLIED
    return { completed: true, resumed: false, checkpoint }
  }

  return { execute }
}

module.exports = { STEPS, createCheckpoint, createCanonicalCaseExecutor }
