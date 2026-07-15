"use strict"

const { validateFormat } = require("./case-number")
const {
  AUTHORIZABLE_SCHEMA_VERSION, CHECKPOINT_SCHEMA_VERSION, AUTH_SCOPES, canonicalize, sha256, deepClone, deepFreeze,
  groupDocuments, authorizablePlanHash, validateAuthorizations
} = require("./single-case-apply-contracts")

const STEP_DEFINITIONS = Object.freeze({
  reservation: [], contact: ["reservation"], deal: ["contact"], association: ["deal"],
  area_folder: ["association"], case_folder: ["area_folder"], uploads: ["case_folder"], final_verify: ["uploads"]
})
const STATES = new Set(["pending", "running", "completed", "failed"])
const TRANSITIONS = Object.freeze({ pending: ["running"], running: ["running", "completed", "failed"], failed: ["running"], completed: [] })
const REQUIRED_METHODS = Object.freeze({
  plans: ["loadByCaseImportId"], authorizations: ["loadForCase"], coordination: ["acquireLease", "renewLease", "loadCheckpoint", "compareAndSetCheckpoint", "releaseLease"],
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
const sanitizedErrorCode = error => /timeout/i.test(error?.message || "") ? "ADAPTER_TIMEOUT" : /fencing/i.test(error?.message || "") ? "FENCING_REJECTED" : /lease.*expir/i.test(error?.message || "") ? "LEASE_EXPIRED" : /CAS|version/i.test(error?.message || "") ? "CAS_CONFLICT" : /ambiguous|duplicate|multiple/i.test(error?.message || "") ? "ADAPTER_AMBIGUOUS_RESULT" : /AUTH.*EXPIRED/.test(error?.message || "") ? "AUTHORIZATION_EXPIRED" : /AUTH.*REVOKED/.test(error?.message || "") ? "AUTHORIZATION_REVOKED" : /VERIFY|DIVERGENCE|INVALID/.test(error?.message || "") ? "VERIFICATION_FAILED" : "EXTERNAL_EFFECT_UNKNOWN"
const verifyContactEvidence = (value, id, properties, code = "CONTACT_VERIFY_INVALID") => { const verified = evidence(value, code); if (verified.id !== id || verified.cpf !== properties.cpf_do_cliente || verified.phone !== properties.phone || verified.fieldsHash !== sha256(canonicalize(properties)) || verified.caseImportId == null) fail("CONTACT_FIELDS_DIVERGENCE"); return verified }
const verifyDealEvidence = (value, id, properties, code = "DEAL_VERIFY_INVALID") => { const verified = evidence(value, code); if (verified.id !== id || verified.caseNumber !== properties.numero_de_caso || verified.pipeline !== properties.pipeline || verified.stage !== properties.dealstage || verified.fieldsHash !== sha256(canonicalize(properties))) fail("DEAL_FIELDS_DIVERGENCE"); return verified }
const verifyAssociationEvidence = (value, id, contactId, dealId, type, code = "ASSOCIATION_VERIFY_INVALID") => { const verified = evidence(value, code); if (verified.id !== id || verified.contactId !== contactId || verified.dealId !== dealId || verified.relation !== type) fail("ASSOCIATION_DIVERGENCE"); return verified }
const verifyFolderEvidence = (value, id, destination, parentId, code) => { const verified = evidence(value, code); if (verified.id !== id || verified.logicalId !== destination.logicalId || verified.name !== destination.name || verified.parentId !== parentId || verified.trashed !== false) fail("FOLDER_DIVERGENCE"); return verified }
const verifyUploadEvidence = (value, id, document, parentId, size, code = "UPLOAD_VERIFY_INVALID") => { if (!value || value.verified !== true || value.id !== id || value.sha256 !== document.sha256 || value.contentDocumentId !== document.contentDocumentId || value.parentId !== parentId || value.size !== size || !Number.isInteger(value.size)) fail(code); return deepClone(value) }

function validateAdapters(adapters, verifier) {
  if (!verifier || typeof verifier.verify !== "function") fail("AUTHORIZATION_VERIFIER_MISSING")
  for (const [name, methods] of Object.entries(REQUIRED_METHODS)) {
    if (!adapters?.[name]) fail(`ADAPTER_MISSING:${name}`)
    for (const method of methods) if (typeof adapters[name][method] !== "function") fail(`ADAPTER_METHOD_MISSING:${name}.${method}`)
  }
}

function validatePlan(plan, caseImportId) {
  if (!plan || plan.caseImportId !== caseImportId) fail("CASE_ISOLATION_FAILED")
  if (!/^[a-f0-9]{12}$/.test(plan.caseFingerprint || "")) fail("CASE_FINGERPRINT_INVALID")
  if (!validateFormat(plan.dealPlan?.caseNumber) || plan.dealPlan?.properties?.numero_de_caso !== plan.dealPlan.caseNumber || plan.caseNumberReservationSync?.source !== "OFFICIAL_POSTGRES_RESERVATION") fail("PLAN_NOT_SYNCHRONIZED")
  if (!plan.contactPlan?.properties?.cpf_do_cliente || !plan.contactPlan?.properties?.phone) fail("CONTACT_IDENTITY_MISSING")
  const documents = groupDocuments(plan)
  const eligible = documents.filter(item => item.eligible === true && item.kind === "document" && item.caseLinked === true)
  if (eligible.length !== plan.documentPlan.driveEligibleUniqueContents) fail("DOCUMENT_COUNT_MISMATCH")
  return eligible
}

function makeDecision(plan, hash, authorizations, instant) {
  return deepFreeze({ schemaVersion: 1, caseImportId: plan.caseImportId, caseFingerprint: plan.caseFingerprint, caseNumber: plan.dealPlan.caseNumber, authorizablePlanHash: hash, authorizationIds: authorizations.map(item => item.authorizationId).sort(), scopes: [...new Set(authorizations.flatMap(item => item.scope))].sort(), validatedAt: instant, safeToApply: true, blockers: [] })
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
      const allowed = name === "reservation" ? ["verified", "caseImportId", "caseNumber", "evidenceId"] : ["contact", "deal", "association", "area_folder", "case_folder"].includes(name) ? ["id", "evidence"] : name === "uploads" ? ["count"] : ["hash", "resources"]
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

async function executeSingleCaseApplyInternal({ caseImportId, adapters, authorizationVerifier, now = () => new Date().toISOString(), owner = "fixture-executor" }) {
  if (!validId(caseImportId)) fail("INVALID_CASE_IMPORT_ID")
  validateAdapters(adapters, authorizationVerifier)
  const original = await adapters.plans.loadByCaseImportId(caseImportId)
  const plan = deepFreeze(deepClone(original))
  const documents = validatePlan(plan, caseImportId)
  const hash = authorizablePlanHash(plan)
  const authQuery = deepFreeze({ caseImportId, caseFingerprint: plan.caseFingerprint, caseNumber: plan.dealPlan.caseNumber, authorizablePlanHash: hash, schemaVersion: AUTHORIZABLE_SCHEMA_VERSION, requiredScopes: AUTH_SCOPES })
  const records = await adapters.authorizations.loadForCase(authQuery)
  const validated = validateAuthorizations(records, authQuery, authorizationVerifier, now())
  const decision = makeDecision(plan, hash, validated, now())
  let lease, checkpoint, outcome, primaryError
  try {
    lease = await adapters.coordination.acquireLease({ caseImportId, owner, now: now() })
    if (!lease || lease.caseImportId !== caseImportId || !validId(lease.leaseId) || !Number.isInteger(lease.fencingToken) || lease.fencingToken < 1 || !Number.isInteger(lease.version) || !Number.isFinite(Date.parse(lease.expiresAt))) fail("LEASE_ACQUIRE_FAILED")
    const currentPlan = deepFreeze(deepClone(await adapters.plans.loadByCaseImportId(caseImportId)))
    validatePlan(currentPlan, caseImportId)
    if (authorizablePlanHash(currentPlan) !== decision.authorizablePlanHash) fail("PREFLIGHT_DECISION_STALE")
    checkpoint = await adapters.coordination.loadCheckpoint(caseImportId) || newCheckpoint(decision)
    validateCheckpoint(checkpoint, decision)
    if (checkpoint.status === "completed") {
      checkpoint.status = "running"
      checkpoint.steps.final_verify = { status: "failed", errorCode: "REVERIFY_REQUIRED" }
      checkpoint.finalProof = null
    }
    const save = async () => {
      const renewed = await adapters.coordination.renewLease({ caseImportId, leaseId: lease.leaseId, fencingToken: lease.fencingToken, now: now() })
      if (!renewed || renewed.leaseId !== lease.leaseId || renewed.fencingToken !== lease.fencingToken || Date.parse(renewed.expiresAt) <= Date.parse(now())) fail("LEASE_RENEW_FAILED")
      const expectedVersion = checkpoint.version
      const response = await adapters.coordination.compareAndSetCheckpoint({ caseImportId, leaseId: lease.leaseId, fencingToken: lease.fencingToken, expectedVersion, checkpoint: deepClone(checkpoint) })
      if (!response || response.saved !== true || response.version !== expectedVersion + 1) fail("CHECKPOINT_CAS_FAILED")
      checkpoint.version = response.version
    }
    const revalidateAuthorizations = async () => {
      const current = await adapters.authorizations.loadForCase(authQuery)
      const checked = validateAuthorizations(current, authQuery, authorizationVerifier, now())
      if (canonicalize(checked.map(item => item.authorizationId).sort()) !== canonicalize(decision.authorizationIds)) fail("AUTHORIZATION_SET_CHANGED")
    }
    const operationContext = async operation => {
      await revalidateAuthorizations()
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

    await revalidateAuthorizations()
    const reservation = await run("reservation", async () => { const context = await operationContext("reservation"); const result = await adapters.reservation.verify(caseImportId, plan.dealPlan.caseNumber, context); if (!result || result.verified !== true || result.caseNumber !== plan.dealPlan.caseNumber) fail("RESERVATION_INVALID"); return result })
    const contact = await run("contact", async () => {
      const properties = deepClone(plan.contactPlan.properties)
      const byCpf = oneOrNone(await adapters.contacts.findContactsByCpf(properties.cpf_do_cliente), "CONTACT_CPF_AMBIGUOUS")
      const byPhone = oneOrNone(await adapters.contacts.findContactsByPhone(properties.phone), "CONTACT_PHONE_AMBIGUOUS")
      if (byCpf && byPhone && byCpf.id !== byPhone.id) fail("CONTACT_IDENTITY_CONFLICT")
      let selected = byCpf || byPhone
      if (!selected) selected = await adapters.contacts.create({ properties: deepFreeze(deepClone(properties)), context: await operationContext("contact") })
      if (!validId(selected?.id)) fail("CONTACT_RESPONSE_INVALID")
      const verified = verifyContactEvidence(await adapters.contacts.verify(selected.id, deepFreeze(deepClone(plan.contactPlan.properties))), selected.id, plan.contactPlan.properties)
      checkpoint.resources.contactId = selected.id
      return { id: selected.id, evidence: verified }
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
      verifyContactEvidence(await adapters.contacts.verify(contact.id, deepClone(plan.contactPlan.properties)), contact.id, plan.contactPlan.properties, "FINAL_CONTACT_INVALID")
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

function createSingleCaseApplyExecutor({ authorizationVerifier }) {
  if (!authorizationVerifier || typeof authorizationVerifier.verify !== "function") fail("AUTHORIZATION_VERIFIER_MISSING")
  return Object.freeze(async args => executeSingleCaseApplyInternal({ ...args, authorizationVerifier }))
}

module.exports = { STEP_DEFINITIONS, STATES, TRANSITIONS, REQUIRED_METHODS, validateAdapters, validatePlan, makeDecision, newCheckpoint, validateCheckpoint, createSingleCaseApplyExecutor }
