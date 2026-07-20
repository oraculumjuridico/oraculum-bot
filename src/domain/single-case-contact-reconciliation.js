"use strict"

const { normalizePersonName } = require("./name-normalization")
const { canonicalize, sha256, deepClone, deepFreeze, validateContactVerificationEvidence } = require("./single-case-apply-contracts")

const DECISIONS = Object.freeze({ ELIGIBLE: "RECONCILIATION_ELIGIBLE", BLOCKED: "RECONCILIATION_BLOCKED", INDETERMINATE: "RECONCILIATION_INDETERMINATE" })
const validId = value => typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9._:-]{2,127}$/.test(value)

function checkNamePresentation(expectedProperties, observedProperties) {
  // Check if firstname values are semantically equivalent but presentation differs
  const expectedName = expectedProperties?.firstname
  const observedName = observedProperties?.firstname

  if (!expectedName || !observedName) {
    return { semanticMatch: false, presentationMatch: false, normalizationRequired: false, updateRequired: false }
  }

  // Normalize both to canonical form for semantic comparison
  const normalizedExpected = normalizePersonName(expectedName)
  const normalizedObserved = normalizePersonName(observedName)

  // Semantic match: do they represent the same name after normalization?
  const semanticMatch = normalizedExpected === normalizedObserved

  // Presentation match: is the observed value already in canonical form?
  const presentationMatch = observedName === normalizedObserved

  // Normalization required: semantic match but presentation differs
  const normalizationRequired = semanticMatch && !presentationMatch

  // Update required: needs HubSpot update (only if semantic match but wrong presentation)
  const updateRequired = normalizationRequired

  return { semanticMatch, presentationMatch, normalizationRequired, updateRequired }
}

function checkpointState(checkpoint, caseImportId) {
  if (!checkpoint || checkpoint.caseImportId !== caseImportId || checkpoint.steps?.reservation?.status !== "completed") throw new Error("RECONCILIATION_CHECKPOINT_INVALID")
  const contact = checkpoint.steps?.contact
  if (!contact || contact.status !== "failed" || contact.result !== undefined) throw new Error("RECONCILIATION_CONTACT_STATE_INVALID")
  return contact
}

function authorizationResumePlan(checkpoint, futureAuthorizationIds) {
  if (!Array.isArray(checkpoint?.authorizationIds) || !checkpoint.authorizationIds.length) throw new Error("RECONCILIATION_AUTHORIZATION_BINDING_INVALID")
  if (futureAuthorizationIds === undefined) return deepFreeze({ directRetryAllowed: false, checkpointRebindRequired: true, operation: "ATOMIC_CHECKPOINT_AUTHORIZATION_REBIND_REQUIRED" })
  if (!Array.isArray(futureAuthorizationIds) || !futureAuthorizationIds.length || futureAuthorizationIds.some(id => !validId(id))) throw new Error("RECONCILIATION_AUTHORIZATION_BINDING_INVALID")
  const equal = JSON.stringify([...checkpoint.authorizationIds].sort()) === JSON.stringify([...futureAuthorizationIds].sort())
  return deepFreeze({ directRetryAllowed: equal, checkpointRebindRequired: !equal, operation: equal ? "NO_REBIND_REQUIRED" : "ATOMIC_CHECKPOINT_AUTHORIZATION_REBIND_REQUIRED" })
}

function reconciliationEvidenceHash({ decision, reason, contactEvidence, namePresentation, resume }) {
  return sha256(canonicalize({
    decision,
    reason,
    contactEvidenceHash: sha256(canonicalize(contactEvidence)),
    namePresentationHash: sha256(canonicalize(namePresentation)),
    resumeHash: sha256(canonicalize(resume))
  }))
}

async function reconcileSingleCaseContactCheckpoint({ caseImportId, plan, checkpoint, authorizationState, contacts, futureAuthorizationIds } = {}) {
  try {
    if (!validId(caseImportId) || !plan || plan.caseImportId !== caseImportId || !plan.contactPlan?.properties) throw new Error("RECONCILIATION_CASE_BINDING_INVALID")
    checkpointState(checkpoint, caseImportId)
    if (authorizationState !== "PAIR_CONSUMED") throw new Error("RECONCILIATION_AUTHORIZATION_STATE_INVALID")
    if (!contacts || typeof contacts.findContactsByCpf !== "function" || typeof contacts.findContactsByPhone !== "function" || typeof contacts.verify !== "function") throw new Error("RECONCILIATION_CONTACT_PORT_INVALID")
    const properties = deepClone(plan.contactPlan.properties)
    const [byCpf, byPhone] = await Promise.all([contacts.findContactsByCpf(properties.cpf_do_cliente), contacts.findContactsByPhone(properties.phone)])
    if (!Array.isArray(byCpf) || !Array.isArray(byPhone)) throw new Error("RECONCILIATION_CONTACT_READ_INVALID")
    const candidates = new Map([...byCpf, ...byPhone].map(item => [item?.id, item]))
    if ([...candidates.keys()].some(id => !validId(id))) throw new Error("RECONCILIATION_CONTACT_READ_INVALID")
    if (candidates.size !== 1) return deepFreeze({ decision: DECISIONS.BLOCKED, reason: candidates.size ? "CONTACT_AMBIGUOUS" : "CONTACT_ABSENT", writesExecuted: false })
    const selected = [...candidates.values()][0]
    const evidence = await contacts.verify(selected.id, deepFreeze(deepClone(properties)), deepFreeze({ caseImportId }))
    validateContactVerificationEvidence(evidence, { contactId: selected.id, caseImportId, properties })

    // Require observed firstname for presentation verification
    const observedFirstname = evidence?.firstname
    if (!observedFirstname || typeof observedFirstname !== "string" || observedFirstname.trim().length === 0) {
      return deepFreeze({ decision: DECISIONS.INDETERMINATE, reason: "OBSERVED_FIRSTNAME_MISSING", writesExecuted: false })
    }

    // Check name presentation separately from semantic verification (firstname used in memory only)
    const nameCheck = checkNamePresentation(properties, evidence)

    // Create sanitized evidence projection without firstname
    const sanitizedEvidence = {
      verified: evidence.verified,
      id: evidence.id,
      cpf: evidence.cpf,
      phone: evidence.phone,
      fieldsHash: evidence.fieldsHash,
      caseImportId: evidence.caseImportId
    }

    const resume = { ...authorizationResumePlan(checkpoint, futureAuthorizationIds), ambiguity: "NONE" }
    const namePresentation = { ...nameCheck, materialDivergence: false }
    const result = {
      decision: DECISIONS.ELIGIBLE,
      reason: "CONTACT_READ_ONLY_VERIFIED",
      contactEvidence: sanitizedEvidence,
      namePresentation,
      resume,
      evidenceHash: null,
      checkpointWriteRequired: true,
      writesExecuted: false
    }
    result.evidenceHash = reconciliationEvidenceHash(result)
    return deepFreeze(result)
  } catch (error) {
    if (/CONTACT_FIELDS_DIVERGENCE|RECONCILIATION_.*(?:INVALID|STATE)/.test(error?.message || "")) return deepFreeze({ decision: DECISIONS.BLOCKED, reason: error.message, writesExecuted: false })
    return deepFreeze({ decision: DECISIONS.INDETERMINATE, reason: "RECONCILIATION_READ_FAILED", writesExecuted: false })
  }
}

module.exports = { DECISIONS, checkNamePresentation, authorizationResumePlan, reconciliationEvidenceHash, reconcileSingleCaseContactCheckpoint }
