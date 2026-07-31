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

const RESOURCE_STEP_MAP = Object.freeze({
  contact: "contactId",
  deal: "dealId",
  association: "associationId",
  drive: "caseFolderId",
  case_number: "caseNumber"
})

function createCheckpoint(plan) {
  return {
    schemaVersion: 1,
    planHash: plan.hash,
    status: "pending",
    steps: Object.fromEntries(STEPS.map(step => [step, { status: "pending" }])),
    resources: {},
    context: {}
  }
}

function createCanonicalCaseExecutor({ adapters = {}, checkpointRepository } = {}) {
  if (!checkpointRepository?.load || !checkpointRepository?.save) throw new Error("checkpoint repository required")

  async function execute(plan, runtimeContext = {}) {
    assertCanonicalCasePlanReady(plan)
    let checkpoint = await checkpointRepository.load(plan.hash) || createCheckpoint(plan)
    if (checkpoint.planHash !== plan.hash) throw Object.assign(new Error("checkpoint plan mismatch"), { code: "CHECKPOINT_PLAN_MISMATCH" })
    checkpoint.context = checkpoint.context || {}
    // ISOCAÇÃO DE EXECUÇÃO: o contexto local (incluindo u) é anexado ao
    // checkpoint desta execução apenas. Adaptadores leem de checkpoint.context,
    // nunca de um singleton global.
    if (runtimeContext && typeof runtimeContext === "object" && !checkpoint.context.u) {
      checkpoint.context.u = runtimeContext.u
    }
    if (checkpoint.status === "completed") return { completed: true, resumed: true, checkpoint }

    for (const step of STEPS) {
      if (checkpoint.steps[step]?.status === "completed") continue
      const handler = adapters[step]
      if (typeof handler !== "function") throw Object.assign(new Error(`canonical adapter missing ${step}`), { code: "CANONICAL_ADAPTER_MISSING", step })
      checkpoint.steps[step] = { status: "processing", startedAt: new Date().toISOString() }
      await checkpointRepository.save(plan.hash, buildPersistedCheckpoint(checkpoint))
      try {
        const result = await handler(plan, checkpoint)
        checkpoint.steps[step] = { status: "completed", completedAt: new Date().toISOString(), result: result || null }
        const resourceKey = RESOURCE_STEP_MAP[step]
        if (resourceKey && result && typeof result === "object" && result.id) {
          checkpoint.resources[resourceKey] = result.id
        }
        await checkpointRepository.save(plan.hash, buildPersistedCheckpoint(checkpoint))
      } catch (error) {
        checkpoint.status = "blocked"
        checkpoint.steps[step] = { status: "failed", code: error.code || "CANONICAL_STEP_FAILED" }
        await checkpointRepository.save(plan.hash, buildPersistedCheckpoint(checkpoint))
        throw error
      }
    }
    checkpoint.status = "completed"
    checkpoint.completedAt = new Date().toISOString()
    await checkpointRepository.save(plan.hash, buildPersistedCheckpoint(checkpoint))
    return { completed: true, resumed: false, checkpoint, planStatus: PLAN_STATUS.APPLIED }
  }

  function buildPersistedCheckpoint(checkpoint) {
    // Remover contexto runtime (u) antes da persistência para evitar vazamento de dados pessoais.
    // Recursos técnicos (contactId, dealId, caseFolderId, status) são preservados em checkpoint.resources e steps.
    if (checkpoint.context && checkpoint.context.u) {
      return { ...checkpoint, context: { ...checkpoint.context, u: undefined } }
    }
    return checkpoint
  }

  return { execute }
}

module.exports = { STEPS, createCheckpoint, createCanonicalCaseExecutor }
