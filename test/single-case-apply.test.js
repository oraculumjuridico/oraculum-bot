"use strict"

const test = require("node:test")
const assert = require("node:assert/strict")
const crypto = require("node:crypto")
const fs = require("node:fs")
const path = require("node:path")
const { createSingleCaseApplyExecutor, validateAdapters, validateCheckpoint, newCheckpoint, makeDecision } = require("../src/domain/single-case-apply")
const { AUTH_SCOPES, AUTHORIZATION_SCHEMA_VERSION, canonicalize, authorizablePlanHash, reservationEvidenceHash, authorizationPayload, createAuthorizationVerifier, groupDocuments, sha256 } = require("../src/domain/single-case-apply-contracts")
const cli = require("../scripts/apply-single-case")

const NOW = "2026-07-15T12:00:00.000Z"
const PLAN_HASH = "1".repeat(64), MANIFEST_HASH = "2".repeat(64)
const fixture = () => JSON.parse(fs.readFileSync(path.join(__dirname, "fixtures", "single-case-apply-plan.json"), "utf8"))
const keys = crypto.generateKeyPairSync("ed25519")
const verifier = createAuthorizationVerifier({ trustedIssuers: { "fixture-authority": keys.publicKey } })
const executor = createSingleCaseApplyExecutor({ authorizationVerifier: verifier })
const clone = value => structuredClone(value)

function signAuthorization(record) {
  return { ...record, proof: crypto.sign(null, Buffer.from(authorizationPayload(record)), keys.privateKey).toString("base64") }
}

function authorizationRecords(plan, mutate = record => record) {
  const hash = authorizablePlanHash(plan)
  return Object.entries(AUTH_SCOPES).map(([type, scope], index) => {
    const evidence = { verified: true, caseImportId: plan.caseImportId, caseNumber: plan.dealPlan.caseNumber, evidenceId: "reservation-proof" }
    const base = { authorizationId: `fixture-auth-${index + 1}`, schemaVersion: AUTHORIZATION_SCHEMA_VERSION, type, caseImportId: plan.caseImportId, caseFingerprint: plan.caseFingerprint, caseNumber: plan.dealPlan.caseNumber, authorizablePlanHash: hash, planHash: PLAN_HASH, manifestHash: MANIFEST_HASH, reservationEvidenceHash: reservationEvidenceHash(evidence), scope: [...scope], issuer: "fixture-authority", issuedAt: "2026-07-15T11:45:00.000Z", expiresAt: "2026-07-15T12:15:00.000Z", revoked: false }
    return signAuthorization(mutate(base, index))
  })
}

function fakeSystem(plan = fixture(), options = {}) {
  const log = [], counts = {}, records = options.records || authorizationRecords(plan)
  const expectedAuthorizationIds = records.map(item => item.authorizationId).sort()
  const state = { checkpoint: options.checkpoint || null, checkpointVersion: options.checkpoint?.version || 0, lease: null, token: 0, contacts: [], deals: [], associations: [], areas: [], folders: [], files: new Map() }
  const count = name => { log.push(name); counts[name] = (counts[name] || 0) + 1 }
  const id = (prefix, length) => `${prefix}-${String(length + 1).padStart(3, "0")}`
  const maybeTimeout = name => { if (options.timeout === name) throw new Error("SIMULATED_TIMEOUT") }
  const validateContext = context => {
    const preflight = context?.idempotencyKey === `${plan.caseImportId}:reservation-preflight`
    if (!context || !Object.isFrozen(context) || !Object.isFrozen(context.authorizationIds) || context.caseImportId !== plan.caseImportId || context.leaseId !== state.lease?.leaseId || context.fencingToken !== state.lease?.fencingToken || context.checkpointVersion !== (preflight ? 0 : state.checkpointVersion) || context.caseNumber !== plan.dealPlan.caseNumber || !Array.isArray(context.authorizationIds) || (!preflight && canonicalize([...context.authorizationIds].sort()) !== canonicalize(expectedAuthorizationIds)) || (preflight && context.authorizationIds.length !== 0) || Date.parse(context.deadline) <= Date.parse(NOW) || context.authorizablePlanHash !== authorizablePlanHash(plan) || typeof context.idempotencyKey !== "string" || !context.idempotencyKey.startsWith(`${plan.caseImportId}:`)) throw new Error("FENCING_REJECTED")
  }
  const coordination = {
    acquireLease: async ({ caseImportId, owner, now }) => {
      const current = Date.parse(now)
      if (state.lease && Date.parse(state.lease.expiresAt) > current) throw new Error("LEASE_ALREADY_HELD")
      state.token += 1
      state.lease = options.malformedLease || { caseImportId, leaseId: `lease-${state.token}`, fencingToken: state.token, version: state.token, owner, expiresAt: new Date(current + 60000).toISOString() }
      if (options.afterLease) options.afterLease(options, records)
      return clone(state.lease)
    },
    renewLease: async request => { if (!state.lease || request.fencingToken !== state.lease.fencingToken || Date.parse(state.lease.expiresAt) <= Date.parse(request.now)) throw new Error("FENCING_TOKEN_STALE"); state.lease.expiresAt = new Date(Date.parse(request.now) + 60000).toISOString(); return clone(state.lease) },
    loadCheckpoint: async () => clone(state.checkpoint),
    compareAndSetCheckpoint: async request => {
      if (!state.lease || request.leaseId !== state.lease.leaseId || request.fencingToken !== state.lease.fencingToken) throw new Error("FENCING_TOKEN_STALE")
      if (request.expectedVersion !== state.checkpointVersion) throw new Error("CAS_VERSION_DIVERGENCE")
      const completedStep = Object.entries(request.checkpoint.steps).find(([name, item]) => item.status === "completed" && state.checkpoint?.steps?.[name]?.status !== "completed")?.[0]
      if (options.crashAfterEffect && options.crashAfterEffect === completedStep && !options.crashed) { options.crashed = true; throw new Error("SIMULATED_CRASH_AFTER_EFFECT") }
      state.checkpointVersion += 1; state.checkpoint = clone(request.checkpoint); state.checkpoint.version = state.checkpointVersion
      return { saved: true, version: state.checkpointVersion }
    },
    releaseLease: async request => { count("lease.release"); if (options.releaseFail) throw new Error("secret-token-and-pii-should-not-leak"); if (state.lease?.leaseId === request.leaseId) state.lease = null; return { released: true } }
  }
  const adapters = {
    plans: { loadByCaseImportId: async caseImportId => { count(`plan:${caseImportId}`); return options.wrongPlan ? { ...clone(plan), caseImportId: "fixture-other" } : clone(plan) } },
    authorizations: { loadForCase: async query => { count("auth.load"); if (options.nullAuth) return null; return clone(options.currentRecords || records) }, consumeAuthorizations: async () => { count("auth.consume"); return { status: options.consumeStatus || "consumed" } } },
    coordination,
    reservation: { verify: async (caseImportId, caseNumber, context) => { validateContext(context); if (options.reservationGate) await options.reservationGate; return { verified: true, caseImportId, caseNumber, evidenceId: "reservation-proof" } } },
    contacts: {
      findContactsByCpf: async cpf => { maybeTimeout("contact"); return options.multiContacts ? [{ id: "contact-a" }, { id: "contact-b" }] : options.cpfContact ? [{ id: options.cpfContact }] : state.contacts.filter(item => item.properties.cpf_do_cliente === cpf).map(item => ({ id: item.id })) },
      findContactsByPhone: async phone => options.multiPhone ? [{ id: "phone-a" }, { id: "phone-b" }] : options.phoneContact ? [{ id: options.phoneContact }] : state.contacts.filter(item => item.properties.phone === phone).map(item => ({ id: item.id })),
      create: async ({ properties, context }) => { validateContext(context); count("contact.create"); if (options.mutatePayload) { try { properties.phone = "mutated" } catch {} } if (options.emptyContactId) return { id: "" }; const item = { id: id("contact", state.contacts.length), properties: clone(properties), caseImportId: plan.caseImportId }; state.contacts.push(item); return { id: item.id } },
      verify: async contactId => { if (options.nullContactVerify) return null; const item = state.contacts.find(x => x.id === contactId); return item ? { verified: true, id: item.id, cpf: item.properties.cpf_do_cliente, phone: item.properties.phone, fieldsHash: sha256(canonicalize(item.properties)), caseImportId: item.caseImportId } : null }
    },
    deals: {
      findByCaseNumber: async number => options.multiDeals ? [{ id: "deal-a" }, { id: "deal-b" }] : state.deals.filter(item => item.properties.numero_de_caso === number).map(item => ({ id: item.id })),
      create: async ({ properties, context }) => { validateContext(context); count("deal.create"); const item = { id: id("deal", state.deals.length), properties: clone(properties) }; state.deals.push(item); return { id: item.id } },
      verify: async dealId => { const item = state.deals.find(x => x.id === dealId); return item ? { verified: true, id: item.id, caseNumber: item.properties.numero_de_caso, pipeline: item.properties.pipeline, stage: item.properties.dealstage, fieldsHash: sha256(canonicalize(item.properties)) } : null }
    },
    associations: {
      find: async (contactId, dealId) => state.associations.filter(item => item.contactId === contactId && item.dealId === dealId && item.type === plan.associationPlan.type).map(item => ({ id: item.id })),
      create: async ({ contactId, dealId, type, context }) => { validateContext(context); count("association.create"); const item = { id: id("association", state.associations.length), contactId, dealId, type }; state.associations.push(item); return { id: item.id } },
      verify: async (associationId, contactId, dealId, type) => { const item = state.associations.find(x => x.id === associationId); return item ? { verified: item.contactId === contactId && item.dealId === dealId && item.type === type, id: item.id, contactId: item.contactId, dealId: item.dealId, relation: item.type } : null }
    },
    drive: {
      findAreaFolders: async destination => options.multiAreas ? [{ id: "area-a" }, { id: "area-b" }] : state.areas.filter(item => item.logicalId === destination.logicalId && item.name === destination.name && item.parentId === "root").map(item => ({ id: item.id })),
      createAreaFolder: async ({ destination, context }) => { validateContext(context); count("area.create"); const item = { id: id("area", state.areas.length), ...clone(destination), parentId: "root", trashed: false }; state.areas.push(item); return { id: item.id } },
      findCaseFolders: async (parentId, destination) => options.multiFolders ? [{ id: "folder-a" }, { id: "folder-b" }] : state.folders.filter(item => item.parentId === parentId && item.logicalId === destination.logicalId && item.name === destination.name).map(item => ({ id: item.id })),
      createCaseFolder: async ({ parentId, destination, context }) => { validateContext(context); count("folder.create"); const item = { id: id("folder", state.folders.length), ...clone(destination), parentId, trashed: false }; state.folders.push(item); return { id: item.id } },
      verifyFolder: async folderId => { const item = [...state.areas, ...state.folders].find(x => x.id === folderId); return item ? { verified: true, id: item.id, parentId: item.parentId, logicalId: item.logicalId, name: item.name, trashed: item.trashed } : null },
      findFilesByHash: async (folderId, hash) => [...state.files.values()].filter(item => item.parentId === folderId && item.sha256 === hash).map(item => ({ id: item.id })),
      upload: async payload => { const { parentId, bytesBase64, sha256: expected, size, document, context, idempotencyKey } = payload; validateContext(context); if (!Object.isFrozen(payload) || !Object.isFrozen(document) || idempotencyKey !== context.idempotencyKey) throw new Error("UPLOAD_PAYLOAD_MUTABLE"); count(`upload:${expected}`); if (options.mutateUploadPayload) { try { payload.parentId = "malicious-parent"; payload.document.contentDocumentId = "malicious-document"; payload.bytesBase64 = Buffer.from("malicious").toString("base64") } catch {} } const received = Buffer.from(bytesBase64, "base64"); if (received.length !== size) throw new Error("UPLOAD_SIZE_DIVERGENCE"); const stored = options.corruptUpload === expected ? Buffer.from("corrupted-after-receipt") : received; const actual = sha256(stored); const item = { id: id("file", state.files.size), sha256: actual, size: stored.length, logicalName: document.logicalName, contentDocumentId: document.contentDocumentId, parentId, bytes: stored }; state.files.set(`${parentId}:${actual}`, item); if (options.crashAfterUploadHash === expected && !options.uploadCrashed) { options.uploadCrashed = true; throw new Error("SIMULATED_CRASH_AFTER_UPLOAD") } return { id: item.id } },
      verifyUpload: async (fileId, hash) => { const item = [...state.files.values()].find(value => value.id === fileId); return item ? { verified: sha256(item.bytes) === hash, id: item.id, sha256: sha256(item.bytes), size: item.reportedSize ?? item.bytes.length, parentId: item.parentId, contentDocumentId: item.contentDocumentId } : { verified: false, id: fileId, sha256: hash, size: 0 } }
    },
    content: { loadBytes: async contentDocumentId => { const number = Number(contentDocumentId.slice(1)); const bytes = Buffer.from(`fixture-content-${String(number === 0 ? 12 : number).padStart(2, "0")}`); if (options.changedContent === contentDocumentId) return Buffer.from("changed"); return bytes } }
  }
  return { adapters, state, log, counts, options }
}

const run = system => executor({ caseImportId: fixture().caseImportId, planHash: PLAN_HASH, manifestHash: MANIFEST_HASH, adapters: system.adapters, now: () => NOW })
const storedFileEntry = (system, hash) => [...system.state.files.entries()].find(([, item]) => item.sha256 === hash)
const effectContext = (plan, system, lease, overrides = {}) => Object.freeze({
  caseImportId: plan.caseImportId,
  leaseId: lease.leaseId,
  fencingToken: lease.fencingToken,
  checkpointVersion: system.state.checkpointVersion,
  authorizablePlanHash: authorizablePlanHash(plan),
  caseNumber: plan.dealPlan.caseNumber,
  authorizationIds: Object.freeze(authorizationRecords(plan).map(item => item.authorizationId).sort()),
  idempotencyKey: `${plan.caseImportId}:fixture-effect`,
  deadline: lease.expiresAt,
  ...overrides
})

test("execucao autorizada conclui onze uploads", async () => { const system = fakeSystem(); const result = await run(system); assert.equal(result.completed, true); assert.equal(system.state.files.size, 11); assert.equal(result.checkpoint.status, "completed") })
test("chamada operacional expõe somente um objeto de argumentos", () => assert.equal(executor.length, 1))
test("objeto fabricado sem prova é recusado", async () => { const p = fixture(); const records = authorizationRecords(p); records[0] = { ...records[0], proof: "" }; await assert.rejects(() => run(fakeSystem(p, { records })), /AUTH_PROOF_INVALID/) })
test("assinatura adulterada é recusada", async () => { const p = fixture(); const records = authorizationRecords(p); records[0].caseNumber = "PRV.260715.999"; await assert.rejects(() => run(fakeSystem(p, { records })), /AUTH_PROOF_INVALID/) })
test("emissor desconhecido é recusado", async () => { const p = fixture(); const records = authorizationRecords(p, r => ({ ...r, issuer: "unknown" })); await assert.rejects(() => run(fakeSystem(p, { records })), /AUTH_ISSUER_UNKNOWN/) })
test("data impossível é recusada", async () => { const p = fixture(); const records = authorizationRecords(p, r => ({ ...r, issuedAt: "not-a-date" })); await assert.rejects(() => run(fakeSystem(p, { records })), /AUTH_DATE_INVALID/) })
test("data futura é recusada", async () => { const p = fixture(); const records = authorizationRecords(p, r => ({ ...r, issuedAt: "2026-07-16T12:00:00.000Z", expiresAt: "2026-07-16T12:30:00.000Z" })); await assert.rejects(() => run(fakeSystem(p, { records })), /AUTH_ISSUED_IN_FUTURE/) })
test("autorização expirada é recusada", async () => { const p = fixture(); const records = authorizationRecords(p, r => ({ ...r, issuedAt: "2026-07-15T11:00:00.000Z", expiresAt: "2026-07-15T11:30:00.000Z" })); await assert.rejects(() => run(fakeSystem(p, { records })), /AUTH_EXPIRED/) })
test("autorização revogada é recusada", async () => { const p = fixture(); const records = authorizationRecords(p, r => ({ ...r, revoked: true })); await assert.rejects(() => run(fakeSystem(p, { records })), /AUTH_REVOKED/) })
test("escopo ausente é recusado", async () => { const p = fixture(); const records = authorizationRecords(p, (r, i) => i ? { ...r, scope: [] } : r); await assert.rejects(() => run(fakeSystem(p, { records })), /AUTH_SCOPE_INVALID/) })
test("autorização duplicada é recusada", async () => { const p = fixture(); const records = authorizationRecords(p); records.push(clone(records[0])); await assert.rejects(() => run(fakeSystem(p, { records })), /AUTH_AMBIGUOUS/) })
test("campo relevante muda o hash", () => { const p = fixture(), changed = fixture(); changed.dealPlan.properties.dealstage = "other"; assert.notEqual(authorizablePlanHash(p), authorizablePlanHash(changed)) })
test("metadado irrelevante não muda o hash", () => { const p = fixture(), changed = fixture(); changed.operationalTimestamp = "another"; changed.safeToApply = false; assert.equal(authorizablePlanHash(p), authorizablePlanHash(changed)) })
test("canonicalização rejeita undefined", () => assert.throws(() => canonicalize({ value: undefined }), /NON_JSON_VALUE/))
test("canonicalização rejeita NaN", () => assert.throws(() => canonicalize({ value: NaN }), /NON_JSON_VALUE/))
test("canonicalização ordena chaves", () => assert.equal(canonicalize({ b: 2, a: 1 }), canonicalize({ a: 1, b: 2 })))
test("método de adaptador ausente bloqueia antes do plano", async () => { const system = fakeSystem(); delete system.adapters.drive.upload; await assert.rejects(() => run(system), /ADAPTER_METHOD_MISSING/); assert.equal(system.log.length, 0) })
test("resposta nula da autorização é bloqueada", async () => await assert.rejects(() => run(fakeSystem(fixture(), { nullAuth: true })), /AUTH_REPOSITORY_RESPONSE_INVALID/))
test("verificação incompleta do contato é bloqueada", async () => await assert.rejects(() => run(fakeSystem(fixture(), { nullContactVerify: true })), /CONTACT_VERIFY_INVALID/))
test("timeout simulado é propagado e checkpoint falha", async () => { const system = fakeSystem(fixture(), { timeout: "contact" }); await assert.rejects(() => run(system), /SIMULATED_TIMEOUT/); assert.equal(system.state.checkpoint.steps.contact.status, "failed") })
test("múltiplos contatos por CPF bloqueiam", async () => await assert.rejects(() => run(fakeSystem(fixture(), { multiContacts: true })), /CONTACT_CPF_AMBIGUOUS/))
test("CPF e telefone divergentes bloqueiam", async () => await assert.rejects(() => run(fakeSystem(fixture(), { cpfContact: "contact-a", phoneContact: "contact-b" })), /CONTACT_IDENTITY_CONFLICT/))
test("múltiplos negócios bloqueiam", async () => await assert.rejects(() => run(fakeSystem(fixture(), { multiDeals: true })), /DEAL_AMBIGUOUS/))
test("múltiplas pastas de área bloqueiam", async () => await assert.rejects(() => run(fakeSystem(fixture(), { multiAreas: true })), /AREA_FOLDER_AMBIGUOUS/))
test("múltiplas pastas de caso bloqueiam", async () => await assert.rejects(() => run(fakeSystem(fixture(), { multiFolders: true })), /CASE_FOLDER_AMBIGUOUS/))
test("bytes alterados depois da autorização bloqueiam", async () => await assert.rejects(() => run(fakeSystem(fixture(), { changedContent: "D05" })), /CONTENT_HASH_DIVERGENCE/))
test("upload que não preserva os bytes recebidos é bloqueado", async () => { const hash = fixture().documentPlan.contents[4].sha256; await assert.rejects(() => run(fakeSystem(fixture(), { corruptUpload: hash })), /UPLOAD_VERIFY_INVALID/) })
test("fixture deriva 14 ocorrências e 12 conteúdos", () => { const p = fixture(); assert.equal(p.documentPlan.occurrences.length, 14); assert.equal(new Set(p.documentPlan.occurrences.map(x => x.sha256)).size, 12) })
test("fixture deriva duas ocorrências binárias excedentes", () => { const p = fixture(); assert.equal(p.documentPlan.occurrences.length - new Set(p.documentPlan.occurrences.map(x => x.sha256)).size, 2) })
test("fixture deriva 11 elegíveis e um não documental", () => { const grouped = groupDocuments(fixture()); assert.equal(grouped.filter(x => x.eligible && x.kind === "document").length, 11); assert.equal(grouped.filter(x => x.kind === "non_document").length, 1) })
test("nomes diferentes do mesmo hash não amplificam uploads", async () => { const system = fakeSystem(); await run(system); assert.equal(Object.keys(system.counts).filter(x => x.startsWith("upload:")).length, 11) })
test("hashes diferentes são preservados", () => assert.equal(new Set(groupDocuments(fixture()).map(x => x.sha256)).size, 12))
test("mesmo nome com hashes diferentes preserva ambos", () => { const p = fixture(); p.documentPlan.occurrences[1].logicalName = p.documentPlan.occurrences[0].logicalName; assert.equal(groupDocuments(p).filter(x => x.logicalNames.includes(p.documentPlan.occurrences[0].logicalName)).length, 2) })
test("metadados críticos conflitantes para mesmo hash bloqueiam", () => { const p = fixture(); p.documentPlan.contents.push({ ...p.documentPlan.contents[0], contentDocumentId: "DX", eligible: false }); p.documentPlan.occurrences.push({ contentDocumentId: "DX", sha256: p.documentPlan.contents[0].sha256, logicalName: "x.pdf" }); assert.throws(() => groupDocuments(p), /DOCUMENT_METADATA_CONFLICT/) })
test("checkpoint truncado é recusado", () => { const p = fixture(), hash = authorizablePlanHash(p), decision = makeDecision(p, hash, [{ authorizationId: "fixture-auth-a", scope: [] }], NOW); assert.throws(() => validateCheckpoint({ schemaVersion: 2 }, decision), /CHECKPOINT_SCHEMA_INVALID/) })
test("checkpoint falsamente concluído é recusado", () => { const p = fixture(), decision = makeDecision(p, authorizablePlanHash(p), [{ authorizationId: "fixture-auth-a", scope: [] }], NOW), cp = newCheckpoint(decision); cp.status = "completed"; assert.throws(() => validateCheckpoint(cp, decision), /CHECKPOINT_(FALSE_COMPLETION|PROOF_DIVERGENCE|PROOF_INVALID)/) })
test("checkpoint concluído exige reverificação dos recursos", async () => { const options = {}, system = fakeSystem(fixture(), options); await run(system); options.nullContactVerify = true; await assert.rejects(() => run(system), /FINAL_CONTACT_INVALID/) })
test("segunda aquisição concorrente de lease é bloqueada", async () => { const system = fakeSystem(); await system.adapters.coordination.acquireLease({ caseImportId: fixture().caseImportId, owner: "a", now: NOW }); await assert.rejects(() => system.adapters.coordination.acquireLease({ caseImportId: fixture().caseImportId, owner: "b", now: NOW }), /LEASE_ALREADY_HELD/) })
test("duas execuções concorrentes não avançam simultaneamente", async () => { let release; const gate = new Promise(resolve => { release = resolve }); const system = fakeSystem(fixture(), { reservationGate: gate }); const first = run(system); while (!system.state.lease) await new Promise(resolve => setImmediate(resolve)); await assert.rejects(() => run(system), /LEASE_ALREADY_HELD/); release(); await first; assert.equal(system.counts["contact.create"], 1) })
test("lease expirado permite retomada com fencing maior", async () => { const system = fakeSystem(); const first = await system.adapters.coordination.acquireLease({ caseImportId: fixture().caseImportId, owner: "a", now: NOW }); const later = new Date(Date.parse(first.expiresAt) + 1).toISOString(); const second = await system.adapters.coordination.acquireLease({ caseImportId: fixture().caseImportId, owner: "b", now: later }); assert(second.fencingToken > first.fencingToken) })
test("fencing token antigo é recusado", async () => { const system = fakeSystem(); const first = await system.adapters.coordination.acquireLease({ caseImportId: fixture().caseImportId, owner: "a", now: NOW }); const later = new Date(Date.parse(first.expiresAt) + 1).toISOString(); await system.adapters.coordination.acquireLease({ caseImportId: fixture().caseImportId, owner: "b", now: later }); await assert.rejects(() => system.adapters.coordination.compareAndSetCheckpoint({ caseImportId: fixture().caseImportId, leaseId: first.leaseId, fencingToken: first.fencingToken, expectedVersion: 0, checkpoint: {} }), /FENCING_TOKEN_STALE/) })
test("CAS com versão divergente é recusado", async () => { const system = fakeSystem(); const lease = await system.adapters.coordination.acquireLease({ caseImportId: fixture().caseImportId, owner: "a", now: NOW }); await assert.rejects(() => system.adapters.coordination.compareAndSetCheckpoint({ caseImportId: fixture().caseImportId, leaseId: lease.leaseId, fencingToken: lease.fencingToken, expectedVersion: 9, checkpoint: {} }), /CAS_VERSION_DIVERGENCE/) })

test("zero autorizações bloqueiam", async () => await assert.rejects(() => run(fakeSystem(fixture(), { records: [] })), /AUTH_AMBIGUOUS/))
test("somente autorização de apply bloqueia", async () => { const p=fixture(),records=authorizationRecords(p);await assert.rejects(()=>run(fakeSystem(p,{records:[records[0]]})),/AUTH_AMBIGUOUS/) })
test("somente autorização de escrita bloqueia", async () => { const p=fixture(),records=authorizationRecords(p);await assert.rejects(()=>run(fakeSystem(p,{records:[records[1]]})),/AUTH_AMBIGUOUS/) })
test("mesmo authorizationId nos dois tipos bloqueia", async () => { const p=fixture(),records=authorizationRecords(p,(r,i)=>i?{...r,authorizationId:"fixture-auth-1"}:r);await assert.rejects(()=>run(fakeSystem(p,{records})),/AUTH_ID_DUPLICATE/) })
test("schema desconhecido bloqueia", async () => { const p=fixture(),records=authorizationRecords(p,r=>({...r,schemaVersion:99}));await assert.rejects(()=>run(fakeSystem(p,{records})),/AUTH_SCHEMA_INVALID/) })
test("data ausente bloqueia", async () => { const p=fixture(),records=authorizationRecords(p);delete records[0].issuedAt;await assert.rejects(()=>run(fakeSystem(p,{records})),/AUTH_DATE_INVALID/) })
test("múltiplos contatos por telefone bloqueiam", async () => await assert.rejects(()=>run(fakeSystem(fixture(),{multiPhone:true})),/CONTACT_PHONE_AMBIGUOUS/))
test("mesmo contato por CPF e telefone é reutilizado", async () => { const s=fakeSystem();s.state.contacts.push({id:"contact-existing",properties:clone(fixture().contactPlan.properties),caseImportId:fixture().caseImportId});await run(s);assert.equal(s.counts["contact.create"],undefined) })
test("contato apenas por CPF é verificado e reutilizado", async () => { const s=fakeSystem();s.state.contacts.push({id:"contact-existing",properties:{...clone(fixture().contactPlan.properties),phone:"other"},caseImportId:fixture().caseImportId});s.options.cpfContact="contact-existing";await assert.rejects(()=>run(s),/CONTACT_FIELDS_DIVERGENCE/) })
test("payload malicioso não altera contato esperado", async () => { const s=fakeSystem(fixture(),{mutatePayload:true});await run(s);assert.equal(s.state.contacts[0].properties.phone,fixture().contactPlan.properties.phone) })
test("payload agregado de upload resiste a mutação maliciosa", async () => { const s=fakeSystem(fixture(),{mutateUploadPayload:true});const result=await run(s);for(const document of groupDocuments(fixture()).filter(item=>item.eligible&&item.kind==="document")){const upload=result.checkpoint.uploads[document.sha256],item=[...s.state.files.values()].find(value=>value.id===upload.fileId);assert.equal(item.parentId,result.checkpoint.resources.caseFolderId);assert.equal(item.sha256,document.sha256);assert.equal(item.contentDocumentId,document.contentDocumentId)}assert.equal(result.completed,true) })
test("ID vazio de contato bloqueia", async () => await assert.rejects(()=>run(fakeSystem(fixture(),{emptyContactId:true})),/CONTACT_RESPONSE_INVALID/))
test("autorização expirada após lease bloqueia antes de efeito", async () => { const p=fixture(),invalid=authorizationRecords(p,r=>({...r,issuedAt:"2026-07-15T11:00:00.000Z",expiresAt:"2026-07-15T11:30:00.000Z"}));const s=fakeSystem(p,{afterLease:o=>{o.currentRecords=invalid}});await assert.rejects(()=>run(s),/AUTH_EXPIRED/);assert.equal(s.counts["contact.create"],undefined) })
test("autorização revogada após lease bloqueia antes de efeito", async () => { const p=fixture(),invalid=authorizationRecords(p,r=>({...r,revoked:true}));const s=fakeSystem(p,{afterLease:o=>{o.currentRecords=invalid}});await assert.rejects(()=>run(s),/AUTH_REVOKED/);assert.equal(s.counts["contact.create"],undefined) })
test("autorização substituída após lease bloqueia", async () => { const p=fixture(),invalid=authorizationRecords(p,r=>({...r,caseImportId:"other-case"}));const s=fakeSystem(p,{afterLease:o=>{o.currentRecords=invalid}});await assert.rejects(()=>run(s),/AUTH_BINDING_INVALID/) })
test("autorização consumida não é relida durante uploads", async () => { const s=fakeSystem();await run(s);assert.equal(s.counts["auth.load"],1);assert.equal(s.counts["auth.consume"],1);assert.equal(s.state.files.size,11) })
test("lease malformado com ID é liberado", async () => { const s=fakeSystem(fixture(),{malformedLease:{caseImportId:fixture().caseImportId,leaseId:"lease-bad",fencingToken:"bad",version:1,expiresAt:NOW}});await assert.rejects(()=>run(s),/LEASE_ACQUIRE_FAILED/);assert.equal(s.counts["lease.release"],1) })
test("falha de liberação após sucesso gera warning sanitizado", async () => { const s=fakeSystem(fixture(),{releaseFail:true});const result=await run(s);assert.deepEqual(result.operationalWarnings,["LEASE_RELEASE_FAILED"]) })
test("erro principal é preservado quando liberação também falha", async () => { const s=fakeSystem(fixture(),{releaseFail:true,multiDeals:true});await assert.rejects(()=>run(s),/DEAL_AMBIGUOUS/);assert.equal(s.state.checkpoint.steps.deal.errorCode,"ADAPTER_AMBIGUOUS_RESULT") })
test("canonicalização rejeita array esparso",()=>assert.throws(()=>canonicalize([1,,3]),/NON_JSON_VALUE/))
test("canonicalização rejeita chave Symbol",()=>{const x={};x[Symbol("x")]=1;assert.throws(()=>canonicalize(x),/NON_JSON_VALUE/)})
test("canonicalização rejeita getter",()=>{const x={};Object.defineProperty(x,"v",{get(){return 1},enumerable:true});assert.throws(()=>canonicalize(x),/NON_JSON_VALUE/)})
test("canonicalização rejeita protótipo personalizado",()=>assert.throws(()=>canonicalize(Object.create({x:1})),/NON_JSON_VALUE/))
test("multiplicidade física altera hash sem alterar uploads",()=>{const p=fixture(),changed=fixture();changed.documentPlan.occurrences.push(clone(changed.documentPlan.occurrences[0]));assert.notEqual(authorizablePlanHash(p),authorizablePlanHash(changed));assert.equal(groupDocuments(p).filter(x=>x.eligible&&x.kind==="document").length,groupDocuments(changed).filter(x=>x.eligible&&x.kind==="document").length)})
test("comprovante estruturalmente válido mas divergente bloqueia",async()=>{const s=fakeSystem();await run(s);s.state.checkpoint.finalProof.resources.contactId="contact-other";s.state.checkpoint.finalProof.hash=sha256(canonicalize(s.state.checkpoint.finalProof.resources));await assert.rejects(()=>run(s),/CHECKPOINT_PROOF_DIVERGENCE/)})
test("checkpoint com etapa extra bloqueia",async()=>{const s=fakeSystem();await run(s);s.state.checkpoint.steps.extra={status:"completed",result:{}};await assert.rejects(()=>run(s),/CHECKPOINT_STEP_INVALID/)})
test("fencing antigo é recusado em efeito externo com contexto integralmente válido",async()=>{const p=fixture(),s=fakeSystem(p),first=await s.adapters.coordination.acquireLease({caseImportId:p.caseImportId,owner:"a",now:NOW}),stale=effectContext(p,s,first);assert.equal((await s.adapters.reservation.verify(p.caseImportId,p.dealPlan.caseNumber,stale)).verified,true);const later=new Date(Date.parse(first.expiresAt)+1).toISOString(),currentLease=await s.adapters.coordination.acquireLease({caseImportId:p.caseImportId,owner:"b",now:later});await assert.rejects(()=>s.adapters.contacts.create({properties:p.contactPlan.properties,context:stale}),/FENCING_REJECTED/);const created=await s.adapters.contacts.create({properties:p.contactPlan.properties,context:effectContext(p,s,currentLease)});assert.match(created.id,/^contact-/)})
test("contexto de efeito exige versão exata do checkpoint",async()=>{const p=fixture(),s=fakeSystem(p),lease=await s.adapters.coordination.acquireLease({caseImportId:p.caseImportId,owner:"a",now:NOW});await assert.rejects(()=>s.adapters.reservation.verify(p.caseImportId,p.dealPlan.caseNumber,effectContext(p,s,lease,{checkpointVersion:1})),/FENCING_REJECTED/)})
test("contexto de efeito exige conjunto canônico exato de autorizações",async()=>{const p=fixture(),s=fakeSystem(p),lease=await s.adapters.coordination.acquireLease({caseImportId:p.caseImportId,owner:"a",now:NOW});await assert.rejects(()=>s.adapters.reservation.verify(p.caseImportId,p.dealPlan.caseNumber,effectContext(p,s,lease,{authorizationIds:Object.freeze(["fixture-auth-1","fixture-auth-other"])})),/FENCING_REJECTED/)})
test("reverificação rejeita CPF alterado",async()=>{const s=fakeSystem();await run(s);s.state.contacts[0].properties.cpf_do_cliente="00000000000";await assert.rejects(()=>run(s),/CONTACT_FIELDS_DIVERGENCE/)})
test("reverificação rejeita telefone alterado",async()=>{const s=fakeSystem();await run(s);s.state.contacts[0].properties.phone="5500000000000";await assert.rejects(()=>run(s),/CONTACT_FIELDS_DIVERGENCE/)})
test("reverificação rejeita número do negócio alterado",async()=>{const s=fakeSystem();await run(s);s.state.deals[0].properties.numero_de_caso="PRV.260715.999";await assert.rejects(()=>run(s),/DEAL_FIELDS_DIVERGENCE/)})
test("reverificação rejeita associação divergente",async()=>{const s=fakeSystem();await run(s);s.state.associations[0].dealId="deal-other";await assert.rejects(()=>run(s),/FINAL_ASSOCIATION_INVALID/)})
test("reverificação rejeita parent de pasta divergente",async()=>{const s=fakeSystem();await run(s);s.state.folders[0].parentId="area-other";await assert.rejects(()=>run(s),/FOLDER_DIVERGENCE/)})
test("reverificação rejeita pasta na lixeira",async()=>{const s=fakeSystem();await run(s);s.state.folders[0].trashed=true;await assert.rejects(()=>run(s),/FOLDER_DIVERGENCE/)})
test("reverificação rejeita upload ausente",async()=>{const s=fakeSystem();await run(s);const hash=fixture().documentPlan.contents[0].sha256,key=storedFileEntry(s,hash)[0];s.state.files.delete(key);await assert.rejects(()=>run(s),/FINAL_UPLOAD_INVALID/)})
test("reverificação rejeita upload com hash diferente",async()=>{const s=fakeSystem();await run(s);const hash=fixture().documentPlan.contents[0].sha256;storedFileEntry(s,hash)[1].bytes=Buffer.from("different");await assert.rejects(()=>run(s),/FINAL_UPLOAD_INVALID/)})
test("reverificação rejeita upload com tamanho diferente",async()=>{const s=fakeSystem();await run(s);const hash=fixture().documentPlan.contents[0].sha256;storedFileEntry(s,hash)[1].reportedSize=999;await assert.rejects(()=>run(s),/FINAL_UPLOAD_INVALID/)})

test("busca de upload exige simultaneamente parent e hash",async()=>{const s=fakeSystem();await run(s);const hash=fixture().documentPlan.contents[0].sha256,folder=s.state.folders[0].id;assert.equal((await s.adapters.drive.findFilesByHash(folder,hash)).length,1);assert.equal((await s.adapters.drive.findFilesByHash("folder-other",hash)).length,0);assert.equal((await s.adapters.drive.findFilesByHash(folder,"0".repeat(64))).length,0)})
test("mesmo hash em outra pasta não é reutilizado",async()=>{const p=fixture(),s=fakeSystem(p),document=groupDocuments(p).find(item=>item.eligible&&item.kind==="document"),bytes=Buffer.from("fixture-content-01"),foreign={id:"file-foreign",sha256:document.sha256,parentId:"folder-foreign",contentDocumentId:document.contentDocumentId,bytes};s.state.files.set(`folder-foreign:${document.sha256}`,foreign);await run(s);assert.equal(s.counts[`upload:${document.sha256}`],1);assert.equal((await s.adapters.drive.findFilesByHash(s.state.folders[0].id,document.sha256)).length,1)})

for (const index of [4,10]) test(`queda após upload individual ${index+1} retoma sem duplicar`,async()=>{const hash=fixture().documentPlan.contents[index].sha256,options={crashAfterUploadHash:hash},s=fakeSystem(fixture(),options);await assert.rejects(()=>run(s),/SIMULATED_CRASH_AFTER_UPLOAD/);const uploaded=storedFileEntry(s,hash)?.[1];assert(uploaded);assert.equal(uploaded.parentId,s.state.folders[0].id);assert.equal(s.state.checkpoint.uploads[hash],undefined);options.crashAfterUploadHash=null;await run(s);assert.equal(s.counts[`upload:${hash}`],1);assert.equal((await s.adapters.drive.findFilesByHash(s.state.folders[0].id,hash)).length,1);assert.equal(Object.keys(s.state.checkpoint.uploads).length,11)})

for (const step of ["contact", "deal", "association", "area_folder", "case_folder", "uploads"]) {
  test(`retomada após efeito sem checkpoint não duplica ${step}`, async () => {
    const options = { crashAfterEffect: step }, system = fakeSystem(fixture(), options)
    await assert.rejects(() => run(system), /SIMULATED_CRASH_AFTER_EFFECT/)
    options.crashAfterEffect = null
    await run(system)
    const key = step === "area_folder" ? "area.create" : step === "case_folder" ? "folder.create" : step === "uploads" ? null : `${step}.create`
    if (key) assert.equal(system.counts[key], 1)
    else assert.equal(Math.max(...Object.entries(system.counts).filter(([name]) => name.startsWith("upload:")).map(([, count]) => count)), 1)
  })
}

test("CLI distingue argumento ausente", () => assert.throws(() => cli.parseArgs([]), /CASE_IMPORT_ID_MISSING/))
test("CLI distingue argumento inválido", () => assert.throws(() => cli.parseArgs(["--case-import-id", "!"]), /CASE_IMPORT_ID_INVALID/))
test("CLI distingue argumentos excedentes", () => assert.throws(() => cli.parseArgs(["--case-import-id", fixture().caseImportId, "extra"]), /CLI_ARGUMENTS_EXCESS/))
test("CLI real falha fechado quando configuração está ausente", async () => await assert.rejects(() => cli.main({ argv: ["--case-import-id", fixture().caseImportId], env: {} }), /POSTGRES_MODE_REQUIRED/))
