"use strict"

const { validateFormat } = require("./case-number")
const { validateCaseFingerprint } = require("./single-case-target")
const { normalizePersonName } = require("./name-normalization")
const {
  AUTHORIZATION_SCHEMA_VERSION, CHECKPOINT_SCHEMA_VERSION, AUTH_SCOPES, canonicalize, sha256, deepClone, deepFreeze,
  groupDocuments, authorizablePlanHash, reservationEvidenceHash, validateAuthorizations, validateContactVerificationEvidence
} = require("./single-case-apply-contracts")

const STEP_DEFINITIONS = Object.freeze({
  reservation: [], contact: ["reservation"], deal: ["contact"], association: ["deal"],
  area_folder: ["association"], case_folder: ["area_folder"], uploads: ["case_folder"], final_verify: ["uploads"]
})
const STATES = new Set(["pending", "running", "completed", "failed"])
const TRANSITIONS = Object.freeze({ pending: ["running"], running: ["running", "completed", "failed"], failed: ["running"], completed: [] })
const REQUIRED_METHODS = Object.freeze({
  plans: ["loadByCaseImportId"], authorizations: ["loadForCase", "consumeAuthorizations"], coordination: ["acquireLease", "renewLease", "loadCheckpoint", "compareAndSetCheckpoint", "releaseLease"],
  reservation: ["verify"], contacts: ["findContactsByCpf", "findContactsByPhone", "create", "verify"],
  deals: ["findByCaseNumber", "create", "verify"], associations: ["find", "create", "verify"],
  drive: ["findAreaFolders", "createAreaFolder", "findCaseFolders", "createCaseFolder", "verifyFolder", "findFilesByHash", "upload", "verifyUpload"],
  content: ["loadBytes"]
})

const fail = code => { throw new Error(code) }
const validId = value => typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9._:-]{2,127}$/.test(value)
const oneOrNone = (value, code) => { if (!Array.isArray(value) || value.some(item => !validId(item?.id)) || value.length > 1) fail(code); return value[0] || null }
const evidence = (value, code) => { if (!value || value.verified !== true || !validId(value.id)) fail(code); return deepClone(value) }
const exactKeys = (value, allowed, code) => { if (!value || typeof value !== "object" || Object.keys(value).some(key => !allowed.includes(key))) fail(code) }
const isPlainObject = value => value !== null && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype
const LEGITIMATE_REBIND_CODES = new Set(["REBIND_RESUME_CHECKPOINT_REQUIRED", "REBIND_RESUME_CHECKPOINT_INVALID", "REBIND_RESUME_PROOF_INVALID", "REBIND_RESUME_PROOF_RECORDS_INVALID", "REBIND_RESUME_PROOF_RECORDS_MISMATCH", "REBIND_RESUME_VERIFIER_MISSING", "REBIND_RESUME_VERIFIER_INVALID", "RESUME_MODE_INVALID"])
const sanitizedErrorCode = error => {
  const msg = error?.message || ""
  if (LEGITIMATE_REBIND_CODES.has(msg)) return msg
  if (msg.includes("REBIND_RESUME_")) return "EXTERNAL_EFFECT_UNKNOWN"
  return /timeout/i.test(msg) ? "ADAPTER_TIMEOUT" : /fencing/i.test(msg) ? "FENCING_REJECTED" : /lease.*expir/i.test(msg) ? "LEASE_EXPIRED" : /CAS|version/i.test(msg) ? "CAS_CONFLICT" : /ambiguous|duplicate|multiple/i.test(msg) ? "ADAPTER_AMBIGUOUS_RESULT" : /AUTH.*EXPIRED/.test(msg) ? "AUTHORIZATION_EXPIRED" : /AUTH.*REVOKED/.test(msg) ? "AUTHORIZATION_REVOKED" : /VERIFY|DIVERGENCE|INVALID/.test(msg) ? "VERIFICATION_FAILED" : "EXTERNAL_EFFECT_UNKNOWN"
}
const verifyContactEvidence = (value, id, caseImportId, properties, invalidCode = "CONTACT_VERIFY_INVALID") => validateContactVerificationEvidence(value, { contactId: id, caseImportId, properties, invalidCode })
const verifyDealEvidence = (value, id, properties, code = "DEAL_VERIFY_INVALID") => { const verified = evidence(value, code); if (verified.id !== id || verified.caseNumber !== properties.numero_de_caso || verified.pipeline !== properties.pipeline || verified.stage !== properties.dealstage || verified.fieldsHash !== sha256(canonicalize(properties))) fail("DEAL_FIELDS_DIVERGENCE"); return verified }
const verifyAssociationEvidence = (value, id, contactId, dealId, type, code = "ASSOCIATION_VERIFY_INVALID") => { const verified = evidence(value, code); if (verified.id !== id || verified.contactId !== contactId || verified.dealId !== dealId || verified.relation !== type) fail("ASSOCIATION_DIVERGENCE"); return verified }
const verifyFolderEvidence = (value, id, destination, parentId, code) => { const verified = evidence(value, code); if (verified.id !== id || verified.logicalId !== destination.logicalId || verified.name !== destination.name || verified.parentId !== parentId || verified.trashed !== false) fail("FOLDER_DIVERGENCE"); return verified }
const verifyUploadEvidence = (value, id, document, parentId, size, code = "UPLOAD_VERIFY_INVALID") => { if (!value || value.verified !== true || value.id !== id || value.sha256 !== document.sha256 || value.contentDocumentId !== document.contentDocumentId || value.parentId !== parentId || value.size !== size || !Number.isInteger(value.size)) fail(code); return deepClone(value) }

function prepareCheckpointForExecution(checkpoint) {
  if (checkpoint.status === "completed") {
    checkpoint.status = "running"
    checkpoint.steps.final_verify = { status: "failed", errorCode: "REVERIFY_REQUIRED" }
    checkpoint.finalProof = null
  }
}

function validateAdapters(adapters, verifier) {
  if (!verifier || typeof verifier.verify !== "function") fail("AUTHORIZATION_VERIFIER_MISSING")
  for (const [name, methods] of Object.entries(REQUIRED_METHODS)) {
    if (!adapters?.[name]) fail(`ADAPTER_MISSING:${name}`)
    for (const method of methods) if (typeof adapters[name][method] !== "function") fail(`ADAPTER_METHOD_MISSING:${name}.${method}`)
  }
}

function validatePlan(plan, caseImportId) {
  if (!plan || plan.caseImportId !== caseImportId) fail("CASE_ISOLATION_FAILED")
  try { validateCaseFingerprint(caseImportId, plan.caseFingerprint) } catch { fail("CASE_FINGERPRINT_INVALID") }
  if (!validateFormat(plan.dealPlan?.caseNumber) || plan.dealPlan?.properties?.numero_de_caso !== plan.dealPlan.caseNumber || plan.caseNumberReservationSync?.source !== "OFFICIAL_POSTGRES_RESERVATION") fail("PLAN_NOT_SYNCHRONIZED")
  if (!plan.contactPlan?.properties?.cpf_do_cliente || !plan.contactPlan?.properties?.phone) fail("CONTACT_IDENTITY_MISSING")
  const documents = groupDocuments(plan)
  const eligible = documents.filter(item => item.eligible === true && item.kind === "document" && item.caseLinked === true)
  if (eligible.length !== plan.documentPlan.driveEligibleUniqueContents) fail("DOCUMENT_COUNT_MISMATCH")
  return eligible
}

function makeDecision(plan, hash, authorizations, instant) {
  return deepFreeze({ schemaVersion: 1, caseImportId: plan.caseImportId, caseFingerprint: plan.caseFingerprint, caseNumber: plan.dealPlan.caseNumber, authorizablePlanHash: hash, authorizationIds: authorizations.map(item => item.authorizationId).sort(), scopes: [...new Set(authorizations.flatMap(item => item.scope))].sort(), authorizationExpiresAt: authorizations.map(item => item.expiresAt).filter(Boolean).sort()[0] || null, validatedAt: instant, safeToApply: true, blockers: [] })
}

function makeContactDecision({ contactId, verified, fieldsHash, externalWriteRequired }) {
  return deepFreeze({
    contactId,
    verified,
    fieldsHash: fieldsHash || null,
    externalWriteRequired,
    decision: externalWriteRequired ? "CONTACT_REQUIRES_UPDATE" : "CONTACT_ALREADY_CORRECT_NO_EXTERNAL_WRITE"
  })
}

function newCheckpoint(decision) {
  return { schemaVersion: CHECKPOINT_SCHEMA_VERSION, caseImportId: decision.caseImportId, caseFingerprint: decision.caseFingerprint, caseNumber: decision.caseNumber, authorizablePlanHash: decision.authorizablePlanHash, authorizationIds: decision.authorizationIds, status: "pending", version: 0, steps: Object.fromEntries(Object.keys(STEP_DEFINITIONS).map(name => [name, { status: "pending" }])), resources: {}, uploads: {}, finalProof: null }
}

function validateCheckpoint(checkpoint, decision) {
  exactKeys(checkpoint, ["schemaVersion", "caseImportId", "caseFingerprint", "caseNumber", "authorizablePlanHash", "authorizationIds", "status", "version", "steps", "resources", "uploads", "finalProof"], "CHECKPOINT_SCHEMA_INVALID")
  if (!checkpoint || checkpoint.schemaVersion !== CHECKPOINT_SCHEMA_VERSION || !Number.isInteger(checkpoint.version) || checkpoint.version < 0 || checkpoint.caseImportId !== decision.caseImportId || checkpoint.caseFingerprint !== decision.caseFingerprint || checkpoint.caseNumber !== decision.caseNumber || checkpoint.authorizablePlanHash !== decision.authorizablePlanHash) fail("CHECKPOINT_SCHEMA_INVALID")
  if (!Array.isArray(checkpoint.authorizationIds) || canonicalize([...checkpoint.authorizationIds].sort()) !== canonicalize([...decision.authorizationIds].sort())) fail("CHECKPOINT_AUTHORIZATION_DIVERGENCE")
  if (!STATES.has(checkpoint.status) || !checkpoint.steps || !checkpoint.resources || !checkpoint.uploads) fail("CHECKPOINT_SCHEMA_INVALID")
  for (const [name, dependencies] of Object.entries(STEP_DEFINITIONS)) {
    const step = checkpoint.steps[name]
    exactKeys(step, ["status", "result", "errorCode"], "CHECKPOINT_STEP_INVALID")
    if (!step || !STATES.has(step.status)) fail("CHECKPOINT_STEP_INVALID")
    if (step.status === "completed" && dependencies.some(dep => checkpoint.steps[dep].status !== "completed")) fail("CHECKPOINT_STEP_SKIPPED")
    if (step.status === "completed" && !step.result) fail("CHECKPOINT_RESULT_MISSING")
    if (step.status === "completed") {
      const allowed = name === "reservation" ? ["verified", "caseImportId", "caseNumber", "evidenceId"] : name === "contact" ? ["id", "evidence", "decision"] : ["contact", "deal", "association", "area_folder", "case_folder"].includes(name) ? ["id", "evidence"] : name === "uploads" ? ["count"] : ["hash", "resources"]
      exactKeys(step.result, allowed, "CHECKPOINT_RESULT_INVALID")
    }
  }
  if (Object.keys(checkpoint.steps).length !== Object.keys(STEP_DEFINITIONS).length) fail("CHECKPOINT_STEP_INVALID")
  exactKeys(checkpoint.resources, ["contactId", "dealId", "associationId", "areaFolderId", "caseFolderId"], "CHECKPOINT_RESOURCE_INVALID")
  for (const name of ["contact", "deal", "association", "area_folder", "case_folder"]) if (checkpoint.steps[name].status === "completed" && (!validId(checkpoint.steps[name].result.id) || checkpoint.steps[name].result.evidence?.verified !== true)) fail("CHECKPOINT_RESULT_INVALID")
  if (checkpoint.steps.reservation.status === "completed" && checkpoint.steps.reservation.result.caseNumber !== decision.caseNumber) fail("CHECKPOINT_RESULT_INVALID")
  for (const [hash, upload] of Object.entries(checkpoint.uploads)) { exactKeys(upload, ["status", "fileId", "sha256", "size", "contentDocumentId", "parentId", "evidence"], "CHECKPOINT_UPLOAD_INVALID"); if (!/^[a-f0-9]{64}$/.test(hash) || upload.status !== "completed" || upload.sha256 !== hash || !validId(upload.fileId) || !Number.isInteger(upload.size) || upload.size < 1 || upload.evidence?.verified !== true) fail("CHECKPOINT_UPLOAD_INVALID") }
  for (const [step, resource] of [["contact", "contactId"], ["deal", "dealId"], ["association", "associationId"], ["area_folder", "areaFolderId"], ["case_folder", "caseFolderId"]]) if (checkpoint.steps[step].status === "completed" && checkpoint.resources[resource] !== checkpoint.steps[step].result.id) fail("CHECKPOINT_RESOURCE_DIVERGENCE")
  if (checkpoint.finalProof !== null) exactKeys(checkpoint.finalProof, ["hash", "resources"], "CHECKPOINT_PROOF_INVALID")
  if (checkpoint.status === "completed") {
    const proof = checkpoint.finalProof?.resources
    exactKeys(proof, ["reservation", "contactId", "dealId", "associationId", "areaFolderId", "caseFolderId", "uploads"], "CHECKPOINT_PROOF_INVALID")
    if (!proof || proof.contactId !== checkpoint.resources.contactId || proof.dealId !== checkpoint.resources.dealId || proof.associationId !== checkpoint.resources.associationId || proof.areaFolderId !== checkpoint.resources.areaFolderId || proof.caseFolderId !== checkpoint.resources.caseFolderId) fail("CHECKPOINT_PROOF_DIVERGENCE")
    const expectedUploads = Object.entries(checkpoint.uploads).map(([hash, upload]) => `${hash}:${upload.fileId}`).sort()
    const proofUploads = Array.isArray(proof.uploads) ? proof.uploads.map(upload => `${upload.sha256}:${upload.fileId}`).sort() : []
    if (canonicalize(expectedUploads) !== canonicalize(proofUploads)) fail("CHECKPOINT_PROOF_DIVERGENCE")
  }
  if (checkpoint.status === "completed" && (Object.values(checkpoint.steps).some(step => step.status !== "completed") || !checkpoint.finalProof?.hash || checkpoint.finalProof.hash !== sha256(canonicalize(checkpoint.finalProof.resources)))) fail("CHECKPOINT_FALSE_COMPLETION")
  return checkpoint
}

function transition(step, next) {
  if (!TRANSITIONS[step.status]?.includes(next)) fail("CHECKPOINT_TRANSITION_INVALID")
  step.status = next
}

async function executeSingleCaseApplyInternal({ caseImportId, planHash, manifestHash, adapters, authorizationVerifier, resumeMode, rebindResumeVerifier, now = () => new Date().toISOString(), owner = "fixture-executor" }) {
  if (!validId(caseImportId)) fail("INVALID_CASE_IMPORT_ID")
  if (!/^[a-f0-9]{64}$/.test(planHash || "")) fail("PLAN_HASH_INVALID")
  if (!/^[a-f0-9]{64}$/.test(manifestHash || "")) fail("MANIFEST_HASH_INVALID")
  // Validate resumeMode
  if (resumeMode !== undefined && resumeMode !== "REBIND") fail("RESUME_MODE_INVALID")
  if (resumeMode === "REBIND" && (!rebindResumeVerifier || typeof rebindResumeVerifier.verifyResumeProof !== "function")) {
    fail("REBIND_RESUME_VERIFIER_MISSING")
  }
  validateAdapters(adapters, authorizationVerifier)
  const original = await adapters.plans.loadByCaseImportId(caseImportId)
  const plan = deepFreeze(deepClone(original))
  const documents = validatePlan(plan, caseImportId)
  const hash = authorizablePlanHash(plan)
  let lease, checkpoint, outcome, primaryError, decision, verifiedReservation
  try {
    lease = await adapters.coordination.acquireLease({ caseImportId, owner, now: now() })
    if (!lease || lease.caseImportId !== caseImportId || !validId(lease.leaseId) || !Number.isInteger(lease.fencingToken) || lease.fencingToken < 1 || !Number.isInteger(lease.version) || !Number.isFinite(Date.parse(lease.expiresAt))) fail("LEASE_ACQUIRE_FAILED")
    const currentPlan = deepFreeze(deepClone(await adapters.plans.loadByCaseImportId(caseImportId)))
    validatePlan(currentPlan, caseImportId)
    if (authorizablePlanHash(currentPlan) !== hash) fail("PREFLIGHT_DECISION_STALE")
    const reservationContext = deepFreeze({ caseImportId, leaseId: lease.leaseId, fencingToken: lease.fencingToken, checkpointVersion: 0, authorizablePlanHash: hash, caseNumber: plan.dealPlan.caseNumber, authorizationIds: [], idempotencyKey: `${caseImportId}:reservation-preflight`, deadline: lease.expiresAt })
    verifiedReservation = await adapters.reservation.verify(caseImportId, plan.dealPlan.caseNumber, reservationContext)
    if (!verifiedReservation || verifiedReservation.verified !== true || verifiedReservation.caseImportId !== caseImportId || verifiedReservation.caseNumber !== plan.dealPlan.caseNumber) fail("RESERVATION_INVALID")
    // Branch: REBIND resume mode vs normal mode
    if (resumeMode === "REBIND") {
      // REBIND RESUME PATH: Records obtained from verifyResumeProof, already consumed by atomic rebind
      checkpoint = deepClone(await adapters.coordination.loadCheckpoint(caseImportId))
      if (!checkpoint) fail("REBIND_RESUME_CHECKPOINT_REQUIRED")

      // Minimal fail-closed validation before using checkpoint
      if (!isPlainObject(checkpoint)) fail("REBIND_RESUME_CHECKPOINT_INVALID")
      if (checkpoint.caseImportId !== caseImportId) fail("REBIND_RESUME_CHECKPOINT_INVALID")
      if (!Number.isInteger(checkpoint.version) || checkpoint.version < 0) fail("REBIND_RESUME_CHECKPOINT_INVALID")
      if (!Array.isArray(checkpoint.authorizationIds)) fail("REBIND_RESUME_CHECKPOINT_INVALID")
      if (checkpoint.authorizationIds.length !== 2) fail("REBIND_RESUME_CHECKPOINT_INVALID")
      for (const id of checkpoint.authorizationIds) {
        if (!validId(id)) fail("REBIND_RESUME_CHECKPOINT_INVALID")
      }
      if (new Set(checkpoint.authorizationIds).size !== checkpoint.authorizationIds.length) fail("REBIND_RESUME_CHECKPOINT_INVALID")

      const resumeProofRequest = deepFreeze({
        caseImportId,
        checkpoint: deepFreeze({
          version: checkpoint.version,
          authorizationIds: [...checkpoint.authorizationIds]
        }),
        expectedBindings: deepFreeze({
          caseImportId,
          caseFingerprint: plan.caseFingerprint,
          caseNumber: plan.dealPlan.caseNumber,
          authorizablePlanHash: hash,
          planHash,
          manifestHash,
          reservationEvidenceHash: reservationEvidenceHash(verifiedReservation),
          schemaVersion: AUTHORIZATION_SCHEMA_VERSION
        }),
        now: now()
      })

      const resumeProof = await rebindResumeVerifier.verifyResumeProof(resumeProofRequest)

      // Fail-closed validation of proof response
      if (!isPlainObject(resumeProof)) fail("REBIND_RESUME_PROOF_INVALID")
      if (!Object.hasOwn(resumeProof, "status")) fail("REBIND_RESUME_PROOF_INVALID")
      if (resumeProof.status !== "VALID_REBIND_RESUME") fail("REBIND_RESUME_PROOF_INVALID")
      if (!Object.hasOwn(resumeProof, "authorizationRecords")) fail("REBIND_RESUME_PROOF_INVALID")
      const records = resumeProof.authorizationRecords
      if (!Array.isArray(records) || records.length !== 2) fail("REBIND_RESUME_PROOF_INVALID")

      const authQuery = deepFreeze({
        caseImportId,
        caseFingerprint: plan.caseFingerprint,
        caseNumber: plan.dealPlan.caseNumber,
        authorizablePlanHash: hash,
        planHash,
        manifestHash,
        reservationEvidenceHash: reservationEvidenceHash(verifiedReservation),
        schemaVersion: AUTHORIZATION_SCHEMA_VERSION,
        requiredScopes: AUTH_SCOPES
      })

      const validated = validateAuthorizations(records, authQuery, authorizationVerifier, now())

      const validatedIds = validated.map(r => r.authorizationId).sort()
      const checkpointIds = [...checkpoint.authorizationIds].sort()
      if (JSON.stringify(validatedIds) !== JSON.stringify(checkpointIds)) {
        fail("REBIND_RESUME_PROOF_RECORDS_MISMATCH")
      }

      decision = makeDecision(plan, hash, validated, now())

      validateCheckpoint(checkpoint, decision)

      prepareCheckpointForExecution(checkpoint)
    } else {
      // NORMAL PATH: Original flow with loadForCase + consumeAuthorizations
      const authQuery = deepFreeze({ caseImportId, caseFingerprint: plan.caseFingerprint, caseNumber: plan.dealPlan.caseNumber, authorizablePlanHash: hash, planHash, manifestHash, reservationEvidenceHash: reservationEvidenceHash(verifiedReservation), schemaVersion: AUTHORIZATION_SCHEMA_VERSION, requiredScopes: AUTH_SCOPES })
      const records = await adapters.authorizations.loadForCase(authQuery)
      const validated = validateAuthorizations(records, authQuery, authorizationVerifier, now())
      decision = makeDecision(plan, hash, validated, now())
      checkpoint = deepClone(await adapters.coordination.loadCheckpoint(caseImportId) || newCheckpoint(decision))
      validateCheckpoint(checkpoint, decision)
      prepareCheckpointForExecution(checkpoint)
      const consumed = await adapters.authorizations.consumeAuthorizations({ ...authQuery, authorizationIds: decision.authorizationIds, consumedBy: `executor:${lease.leaseId}`, now: now() })
      if (consumed?.status !== "consumed") fail(`AUTHORIZATION_CONSUME_${String(consumed?.status || "unknown_result").toUpperCase()}`)
    }
    const save = async () => {
      const renewed = await adapters.coordination.renewLease({ caseImportId, leaseId: lease.leaseId, fencingToken: lease.fencingToken, now: now() })
      if (!renewed || renewed.leaseId !== lease.leaseId || renewed.fencingToken !== lease.fencingToken || Date.parse(renewed.expiresAt) <= Date.parse(now())) fail("LEASE_RENEW_FAILED")
      const expectedVersion = checkpoint.version
      const response = await adapters.coordination.compareAndSetCheckpoint({ caseImportId, leaseId: lease.leaseId, fencingToken: lease.fencingToken, expectedVersion, checkpoint: deepClone(checkpoint) })
      if (!response || response.saved !== true || response.version !== expectedVersion + 1) fail("CHECKPOINT_CAS_FAILED")
      checkpoint.version = response.version
    }
    const operationContext = async operation => {
      if (decision.authorizationExpiresAt && Date.parse(decision.authorizationExpiresAt) <= Date.parse(now())) fail("AUTH_EXPIRED")
      const renewed = await adapters.coordination.renewLease({ caseImportId, leaseId: lease.leaseId, fencingToken: lease.fencingToken, now: now() })
      if (!renewed || renewed.leaseId !== lease.leaseId || renewed.fencingToken !== lease.fencingToken || Date.parse(renewed.expiresAt) <= Date.parse(now())) fail("LEASE_EXPIRED")
      return deepFreeze({ caseImportId, leaseId: lease.leaseId, fencingToken: lease.fencingToken, checkpointVersion: checkpoint.version, authorizablePlanHash: decision.authorizablePlanHash, caseNumber: decision.caseNumber, authorizationIds: [...decision.authorizationIds], idempotencyKey: `${caseImportId}:${operation}`, deadline: renewed.expiresAt })
    }
    const run = async (name, action) => {
      const item = checkpoint.steps[name]
      if (item.status === "completed") return item.result
      for (const dependency of STEP_DEFINITIONS[name]) if (checkpoint.steps[dependency].status !== "completed") fail("CHECKPOINT_STEP_SKIPPED")
      transition(item, "running"); checkpoint.status = "running"; await save()
      try { const result = await action(); if (!result || typeof result !== "object") fail("STEP_RESULT_INVALID"); item.result = deepClone(result); transition(item, "completed"); await save(); return item.result }
      catch (error) { if (item.status === "running") { transition(item, "failed"); item.errorCode = sanitizedErrorCode(error); checkpoint.status = "failed"; await save().catch(() => {}) } throw error }
    }
    const reservation = await run("reservation", async () => verifiedReservation)
    const contact = await run("contact", async () => {
      const properties = deepClone(plan.contactPlan.properties)
      // Normalize person name before sending to HubSpot
      if (properties.firstname) {
        properties.firstname = normalizePersonName(properties.firstname)
      }
      const byCpf = oneOrNone(await adapters.contacts.findContactsByCpf(properties.cpf_do_cliente), "CONTACT_CPF_AMBIGUOUS")
      const byPhone = oneOrNone(await adapters.contacts.findContactsByPhone(properties.phone), "CONTACT_PHONE_AMBIGUOUS")
      if (byCpf && byPhone && byCpf.id !== byPhone.id) fail("CONTACT_IDENTITY_CONFLICT")
      let selected = byCpf || byPhone
      if (!selected) selected = await adapters.contacts.create({ properties: deepFreeze(deepClone(properties)), context: await operationContext("contact") })
      if (!validId(selected?.id)) fail("CONTACT_RESPONSE_INVALID")
      const verifyContext = await operationContext("contact-verify")
      const verified = verifyContactEvidence(await adapters.contacts.verify(selected.id, deepFreeze(deepClone(plan.contactPlan.properties)), verifyContext), selected.id, plan.caseImportId, plan.contactPlan.properties)
      checkpoint.resources.contactId = selected.id
      const contactDecision = makeContactDecision({ contactId: selected.id, verified: true, fieldsHash: verified.fieldsHash, externalWriteRequired: false })
      return { id: selected.id, evidence: verified, decision: contactDecision }
    })
    const deal = await run("deal", async () => {
      let selected = oneOrNone(await adapters.deals.findByCaseNumber(plan.dealPlan.caseNumber), "DEAL_AMBIGUOUS")
      if (!selected) selected = await adapters.deals.create({ properties: deepFreeze(deepClone(plan.dealPlan.properties)), context: await operationContext("deal") })
      if (!validId(selected?.id)) fail("DEAL_RESPONSE_INVALID")
      const verified = verifyDealEvidence(await adapters.deals.verify(selected.id, deepFreeze(deepClone(plan.dealPlan.properties))), selected.id, plan.dealPlan.properties)
      checkpoint.resources.dealId = selected.id
      return { id: selected.id, evidence: verified }
    })
    const association = await run("association", async () => {
      const found = oneOrNone(await adapters.associations.find(contact.id, deal.id), "ASSOCIATION_AMBIGUOUS")
      const selected = found || await adapters.associations.create({ contactId: contact.id, dealId: deal.id, type: plan.associationPlan.type, context: await operationContext("association") })
      const verified = verifyAssociationEvidence(await adapters.associations.verify(selected?.id, contact.id, deal.id, plan.associationPlan.type), selected?.id, contact.id, deal.id, plan.associationPlan.type)
      checkpoint.resources.associationId = selected.id
      return { id: selected.id, evidence: verified }
    })
    const area = await run("area_folder", async () => {
      let selected = oneOrNone(await adapters.drive.findAreaFolders(deepClone(plan.drivePlan.area)), "AREA_FOLDER_AMBIGUOUS")
      if (!selected) selected = await adapters.drive.createAreaFolder({ destination: deepFreeze(deepClone(plan.drivePlan.area)), context: await operationContext("area") })
      const verified = verifyFolderEvidence(await adapters.drive.verifyFolder(selected?.id), selected?.id, plan.drivePlan.area, "root", "AREA_FOLDER_VERIFY_INVALID")
      checkpoint.resources.areaFolderId = selected.id
      return { id: selected.id, evidence: verified }
    })
    const folder = await run("case_folder", async () => {
      let selected = oneOrNone(await adapters.drive.findCaseFolders(area.id, deepClone(plan.drivePlan.case)), "CASE_FOLDER_AMBIGUOUS")
      if (!selected) selected = await adapters.drive.createCaseFolder({ parentId: area.id, destination: deepFreeze(deepClone(plan.drivePlan.case)), context: await operationContext("case-folder") })
      const verified = verifyFolderEvidence(await adapters.drive.verifyFolder(selected?.id), selected?.id, plan.drivePlan.case, area.id, "CASE_FOLDER_VERIFY_INVALID")
      checkpoint.resources.caseFolderId = selected.id
      return { id: selected.id, evidence: verified }
    })
    await run("uploads", async () => {
      for (const document of documents) {
        if (checkpoint.uploads[document.sha256]?.status === "completed") continue
        await operationContext(`upload-read:${document.sha256}`)
        const bytes = await adapters.content.loadBytes(document.contentDocumentId)
        if (!Buffer.isBuffer(bytes)) fail("CONTENT_BYTES_INVALID")
        const actualHash = sha256(bytes)
        if (actualHash !== document.sha256) fail("CONTENT_HASH_DIVERGENCE")
        let selected = oneOrNone(await adapters.drive.findFilesByHash(folder.id, document.sha256), "UPLOAD_AMBIGUOUS")
        if (!selected) {
          const context = await operationContext(`upload:${actualHash}`)
          const upload = deepFreeze({
            parentId: folder.id,
            bytesBase64: bytes.toString("base64"),
            sha256: actualHash,
            size: bytes.length,
            document: { contentDocumentId: document.contentDocumentId, logicalName: document.logicalNames[0] },
            context,
            idempotencyKey: context.idempotencyKey
          })
          selected = await adapters.drive.upload(upload)
        }
        if (!validId(selected?.id)) fail("UPLOAD_RESPONSE_INVALID")
        const verified = verifyUploadEvidence(await adapters.drive.verifyUpload(selected.id, document.sha256), selected.id, document, folder.id, bytes.length)
        checkpoint.uploads[document.sha256] = { status: "completed", fileId: selected.id, sha256: document.sha256, size: bytes.length, contentDocumentId: document.contentDocumentId, parentId: folder.id, evidence: deepClone(verified) }
        await operationContext(`upload-checkpoint:${actualHash}`)
        await save()
      }
      return { count: Object.keys(checkpoint.uploads).length }
    })
    await run("final_verify", async () => {
      const verifyContext = await operationContext("final-contact-verify")
      verifyContactEvidence(await adapters.contacts.verify(contact.id, deepClone(plan.contactPlan.properties), verifyContext), contact.id, plan.caseImportId, plan.contactPlan.properties, "FINAL_CONTACT_INVALID")
      verifyDealEvidence(await adapters.deals.verify(deal.id, deepClone(plan.dealPlan.properties)), deal.id, plan.dealPlan.properties, "FINAL_DEAL_INVALID")
      verifyAssociationEvidence(await adapters.associations.verify(association.id, contact.id, deal.id, plan.associationPlan.type), association.id, contact.id, deal.id, plan.associationPlan.type, "FINAL_ASSOCIATION_INVALID")
      verifyFolderEvidence(await adapters.drive.verifyFolder(area.id), area.id, plan.drivePlan.area, "root", "FINAL_AREA_INVALID")
      verifyFolderEvidence(await adapters.drive.verifyFolder(folder.id), folder.id, plan.drivePlan.case, area.id, "FINAL_CASE_FOLDER_INVALID")
      if (Object.keys(checkpoint.uploads).length !== documents.length) fail("FINAL_UPLOAD_COUNT_INVALID")
      for (const document of documents) { const upload = checkpoint.uploads[document.sha256]; verifyUploadEvidence(await adapters.drive.verifyUpload(upload?.fileId, document.sha256), upload?.fileId, document, folder.id, upload?.size, "FINAL_UPLOAD_INVALID") }
      const proof = { reservation: reservation.caseNumber, contactId: contact.id, dealId: deal.id, associationId: association.id, areaFolderId: area.id, caseFolderId: folder.id, uploads: documents.map(item => ({ sha256: item.sha256, fileId: checkpoint.uploads[item.sha256].fileId })).sort((a, b) => a.sha256.localeCompare(b.sha256)) }
      return { hash: sha256(canonicalize(proof)), resources: proof }
    })
    checkpoint.finalProof = deepClone(checkpoint.steps.final_verify.result)
    checkpoint.status = "completed"; await save()
    validateCheckpoint(checkpoint, decision)
    outcome = { completed: true, decision, checkpoint: deepClone(checkpoint), safeToApply: true, operationalWarnings: [] }
  } catch (error) {
    primaryError = error
  } finally {
    if (validId(lease?.leaseId)) try { await adapters.coordination.releaseLease({ caseImportId, leaseId: lease.leaseId, fencingToken: lease.fencingToken }) } catch { if (outcome) outcome.operationalWarnings.push("LEASE_RELEASE_FAILED") }
  }
  if (primaryError) throw primaryError
  return outcome
}

function createSingleCaseApplyExecutor({ authorizationVerifier, rebindResumeVerifier }) {
  if (!authorizationVerifier || typeof authorizationVerifier.verify !== "function") fail("AUTHORIZATION_VERIFIER_MISSING")
  // rebindResumeVerifier is optional in the factory, but required when resumeMode="REBIND"
  // Validation happens at runtime in executeSingleCaseApplyInternal
  if (rebindResumeVerifier !== undefined && (rebindResumeVerifier === null || typeof rebindResumeVerifier.verifyResumeProof !== "function")) {
    fail("REBIND_RESUME_VERIFIER_INVALID")
  }
  return Object.freeze(async args => executeSingleCaseApplyInternal({ ...args, authorizationVerifier, rebindResumeVerifier }))
}

module.exports = { STEP_DEFINITIONS, STATES, TRANSITIONS, REQUIRED_METHODS, validateAdapters, validatePlan, makeDecision, makeContactDecision, newCheckpoint, validateCheckpoint, createSingleCaseApplyExecutor, sanitizedErrorCode }
