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

const RESULT_FIELDS_BY_STEP = Object.freeze({
  identity: ["verified", "name", "cpf", "phone", "email"],
  contact: ["id", "action", "verified", "pastaDriveMissing"],
  deal: ["id", "action", "verified"],
  association: ["id", "action", "verified", "contactId", "dealId", "relation"],
  case_number: ["id", "value", "action", "verified", "evidenceId"],
  drive: ["id", "action", "verified", "parentId"],
  hubspot: ["updated", "contactId", "dealId"],
  final_verify: ["verified", "contactId", "dealId", "folderId", "associationId", "documentsCount", "tasksCount"]
})

function projectScalarFields(source, fields) {
  if (!source || typeof source !== "object") return source ?? null
  const projected = {}
  for (const field of fields) {
    const value = source[field]
    if (["string", "number", "boolean"].includes(typeof value) || value === null) projected[field] = value
  }
  return projected
}

function projectList(items, fields) {
  if (!Array.isArray(items)) return []
  return items.map(item => projectScalarFields(item, fields))
}

function projectStepResult(step, result) {
  if (!result || typeof result !== "object") return result ?? null
  if (step === "documents") return {
    count: Number.isFinite(result.count) ? result.count : 0,
    documents: projectList(result.documents, ["sha256", "fileId", "action", "reason", "error"])
  }
  if (step === "tasks") return {
    created: Number.isFinite(result.created) ? result.created : 0,
    tasks: projectList(result.tasks, ["id", "key", "action", "error", "verified"])
  }
  if (step === "internal_notifications") return {
    sent: Number.isFinite(result.sent) ? result.sent : 0,
    notifications: projectList(result.notifications, ["type", "sent", "error"])
  }
  return projectScalarFields(result, RESULT_FIELDS_BY_STEP[step] || ["id", "action", "verified"])
}

function projectCanonicalCheckpointForPersistence(checkpoint) {
  if (!checkpoint || typeof checkpoint !== "object") return null
  const steps = {}
  for (const step of STEPS) {
    const source = checkpoint.steps?.[step]
    if (!source || typeof source !== "object") continue
    steps[step] = projectScalarFields(source, ["status", "startedAt", "completedAt", "code"])
    if (Object.prototype.hasOwnProperty.call(source, "result")) steps[step].result = projectStepResult(step, source.result)
  }
  return {
    schemaVersion: Number.isInteger(checkpoint.schemaVersion) ? checkpoint.schemaVersion : 1,
    planHash: typeof checkpoint.planHash === "string" ? checkpoint.planHash : null,
    status: typeof checkpoint.status === "string" ? checkpoint.status : "pending",
    ...(typeof checkpoint.completedAt === "string" ? { completedAt: checkpoint.completedAt } : {}),
    steps,
    resources: projectScalarFields(checkpoint.resources, ["contactId", "dealId", "associationId", "caseFolderId", "caseNumber"])
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
    return projectCanonicalCheckpointForPersistence(checkpoint)
  }

  return { execute }
}

module.exports = { STEPS, createCheckpoint, createCanonicalCaseExecutor, projectCanonicalCheckpointForPersistence }
