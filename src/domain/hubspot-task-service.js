const TASK_MARKER = "ORACULUM_TASK_KEY"

function clean(value) {
  return value === null || value === undefined ? "" : String(value).trim()
}

function taskMarker(key) {
  const normalized = clean(key)
  if (!normalized) throw Object.assign(new Error("task key required"), { code: "TASK_KEY_REQUIRED" })
  return `[${TASK_MARKER}:${normalized}]`
}

function normalizeTaskSpec(spec = {}) {
  const key = clean(spec.key)
  const marker = taskMarker(key)
  return {
    key,
    marker,
    subject: clean(spec.subject),
    body: [marker, clean(spec.body)].filter(Boolean).join("\n\n"),
    status: clean(spec.status) || "NOT_STARTED",
    priority: clean(spec.priority) || "MEDIUM",
    type: clean(spec.type) || "TODO",
    dueAt: clean(spec.dueAt),
    ownerId: clean(spec.ownerId),
    contactId: clean(spec.contactId),
    dealId: clean(spec.dealId)
  }
}

function taskProperties(task) {
  return {
    hs_task_subject: task.subject,
    hs_task_body: task.body,
    hs_task_status: task.status,
    hs_task_priority: task.priority,
    hs_task_type: task.type,
    hs_timestamp: task.dueAt,
    hubspot_owner_id: task.ownerId
  }
}

function createHubSpotTaskService(adapter = {}) {
  for (const method of ["findByMarker", "create", "update", "verify", "associate"]) {
    if (typeof adapter[method] !== "function") throw new Error(`task adapter missing ${method}`)
  }

  async function ensureTask(spec = {}) {
    const task = normalizeTaskSpec(spec)
    const matches = await adapter.findByMarker(task.marker)
    if (matches.length > 1) throw Object.assign(new Error("duplicate task marker"), { code: "TASK_MARKER_AMBIGUOUS" })
    let id
    let action
    if (matches.length === 1) {
      id = String(matches[0].id)
      await adapter.update(id, taskProperties(task))
      action = "updated"
    } else {
      const created = await adapter.create(taskProperties(task))
      id = String(created?.id || "")
      if (!id) throw Object.assign(new Error("task create not confirmed"), { code: "TASK_CREATE_UNCONFIRMED" })
      action = "created"
    }
    if (task.contactId) await adapter.associate(id, "contacts", task.contactId)
    if (task.dealId) await adapter.associate(id, "deals", task.dealId)
    const verified = await adapter.verify(id, task.marker, {
      contactId: task.contactId,
      dealId: task.dealId
    })
    if (!verified?.ok) throw Object.assign(new Error("task verification failed"), { code: "TASK_VERIFY_FAILED" })
    return { id, action, key: task.key, verified: true }
  }

  async function completeTask(spec = {}) {
    return ensureTask({ ...spec, status: "COMPLETED" })
  }

  return { ensureTask, completeTask }
}

module.exports = { TASK_MARKER, taskMarker, normalizeTaskSpec, taskProperties, createHubSpotTaskService }
