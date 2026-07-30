const crypto = require("node:crypto")

const PLAN_VERSION = "oraculum-canonical-case-plan-v1"
const PLAN_STATUS = Object.freeze({
  DRAFT: "draft",
  REVIEW_REQUIRED: "review_required",
  READY: "ready",
  APPLIED: "applied"
})

function clean(value) {
  return value === null || value === undefined ? null : String(value).trim() || null
}

function unique(values = []) {
  return [...new Set((values || []).filter(Boolean))]
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable)
  if (!value || typeof value !== "object") return value
  return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, stable(item)]))
}

function planHash(plan = {}) {
  const material = { ...plan }
  delete material.hash
  delete material.createdAt
  delete material.updatedAt
  return crypto.createHash("sha256").update(JSON.stringify(stable(material))).digest("hex")
}

function normalizeDocument(document = {}) {
  return {
    sha256: clean(document.sha256),
    fileId: clean(document.fileId),
    name: clean(document.name || document.nome),
    mimeType: clean(document.mimeType),
    type: clean(document.type || document.tipoDocumento),
    partyRole: clean(document.partyRole || document.documentOwnerRole),
    confidence: Number.isFinite(Number(document.confidence ?? document.confianca))
      ? Number(document.confidence ?? document.confianca)
      : null,
    status: clean(document.status) || "received",
    quarantineReason: clean(document.quarantineReason),
    originalPreserved: document.originalPreserved !== false
  }
}

function deriveBlockers(plan) {
  const blockers = []
  if (!plan.identity?.name) blockers.push("identity_name_missing")
  if (!plan.identity?.cpf && !plan.identity?.phone && !plan.identity?.email) blockers.push("identity_safe_key_missing")
  if (plan.identity?.ambiguous) blockers.push("identity_ambiguous")
  if (plan.contact?.ambiguous) blockers.push("contact_ambiguous")
  if (plan.deal?.ambiguous) blockers.push("deal_ambiguous")
  if (plan.association?.ambiguous) blockers.push("association_ambiguous")
  if (plan.drive?.ambiguous) blockers.push("drive_folder_ambiguous")
  if (!plan.caseNumber?.value && !plan.caseNumber?.reservationRequired) blockers.push("case_number_missing")
  for (const divergence of plan.divergences || []) blockers.push(`divergence:${clean(divergence.code) || "unknown"}`)
  for (const document of plan.documents?.received || []) {
    if (!document.sha256) blockers.push("document_hash_missing")
    if (["quarantined", "review_required"].includes(document.status)) blockers.push(`document_review:${document.sha256 || document.name || "unknown"}`)
    if (!document.partyRole) blockers.push(`document_party_unresolved:${document.sha256 || document.name || "unknown"}`)
  }
  return unique([...(plan.review?.blockers || []), ...blockers])
}

function createCanonicalCasePlan(input = {}) {
  const received = (input.documents?.received || []).map(normalizeDocument)
  const plan = {
    version: PLAN_VERSION,
    source: clean(input.source) || "unknown",
    status: PLAN_STATUS.DRAFT,
    identity: {
      name: clean(input.identity?.name),
      cpf: clean(input.identity?.cpf),
      dateOfBirth: clean(input.identity?.dateOfBirth),
      phone: clean(input.identity?.phone),
      email: clean(input.identity?.email),
      provenance: input.identity?.provenance || {},
      ambiguous: Boolean(input.identity?.ambiguous)
    },
    contact: {
      action: clean(input.contact?.action) || "resolve",
      id: clean(input.contact?.id),
      properties: input.contact?.properties || {},
      ambiguous: Boolean(input.contact?.ambiguous)
    },
    deal: {
      action: clean(input.deal?.action) || "resolve",
      id: clean(input.deal?.id),
      properties: input.deal?.properties || {},
      ambiguous: Boolean(input.deal?.ambiguous)
    },
    association: {
      required: input.association?.required !== false,
      verified: Boolean(input.association?.verified),
      ambiguous: Boolean(input.association?.ambiguous)
    },
    caseNumber: {
      value: clean(input.caseNumber?.value),
      reservationRequired: Boolean(input.caseNumber?.reservationRequired)
    },
    confirmedData: input.confirmedData || {},
    inferredData: input.inferredData || {},
    divergences: input.divergences || [],
    parties: input.parties || [],
    documents: {
      received,
      pending: unique(input.documents?.pending || []),
      quarantined: received.filter(document => document.status === "quarantined")
    },
    drive: {
      canonicalFolderId: clean(input.drive?.canonicalFolderId),
      canonicalFolderUrl: clean(input.drive?.canonicalFolderUrl),
      quarantineFolderId: clean(input.drive?.quarantineFolderId),
      ambiguous: Boolean(input.drive?.ambiguous),
      uploads: input.drive?.uploads || []
    },
    hubspot: {
      contactUpdates: input.hubspot?.contactUpdates || {},
      dealUpdates: input.hubspot?.dealUpdates || {}
    },
    tasks: input.tasks || [],
    nextAction: clean(input.nextAction),
    review: {
      required: Boolean(input.review?.required),
      blockers: unique(input.review?.blockers || [])
    },
    notifications: {
      internal: input.notifications?.internal || [],
      external: input.notifications?.external || [],
      externalAuthorized: Boolean(input.notifications?.externalAuthorized)
    },
    createdAt: input.createdAt || new Date().toISOString()
  }
  plan.review.blockers = deriveBlockers(plan)
  plan.review.required = plan.review.required || plan.review.blockers.length > 0
  plan.status = plan.review.required ? PLAN_STATUS.REVIEW_REQUIRED : PLAN_STATUS.READY
  plan.hash = planHash(plan)
  return plan
}

function validateCanonicalCasePlan(plan = {}) {
  const errors = []
  if (plan.version !== PLAN_VERSION) errors.push("invalid_plan_version")
  if (!plan.hash || plan.hash !== planHash(plan)) errors.push("invalid_plan_hash")
  if (!Object.values(PLAN_STATUS).includes(plan.status)) errors.push("invalid_plan_status")
  if (plan.status === PLAN_STATUS.READY && (plan.review?.required || plan.review?.blockers?.length)) errors.push("ready_plan_has_blockers")
  if ((plan.documents?.received || []).some(document => document.status === "approved" && (!document.sha256 || !document.partyRole))) {
    errors.push("approved_document_missing_identity_evidence")
  }
  if (Object.keys(plan.hubspot?.contactUpdates || {}).some(key => ["numero_caso", "numero_do_caso"].includes(key))) {
    errors.push("legacy_contact_case_number_forbidden")
  }
  if ((plan.notifications?.external || []).length && !plan.notifications?.externalAuthorized) {
    errors.push("external_notifications_not_authorized")
  }
  return { ok: errors.length === 0, errors }
}

function assertCanonicalCasePlanReady(plan = {}) {
  const validation = validateCanonicalCasePlan(plan)
  if (!validation.ok) {
    const error = new Error(`canonical case plan invalid: ${validation.errors.join(",")}`)
    error.code = "CANONICAL_CASE_PLAN_INVALID"
    error.errors = validation.errors
    throw error
  }
  if (plan.status !== PLAN_STATUS.READY) {
    const error = new Error("canonical case plan requires human review")
    error.code = "CANONICAL_CASE_PLAN_REVIEW_REQUIRED"
    error.blockers = plan.review?.blockers || []
    throw error
  }
  return true
}

module.exports = {
  PLAN_VERSION,
  PLAN_STATUS,
  createCanonicalCasePlan,
  validateCanonicalCasePlan,
  assertCanonicalCasePlanReady,
  planHash
}
