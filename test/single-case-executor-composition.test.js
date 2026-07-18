"use strict"

const test = require("node:test")
const assert = require("node:assert/strict")
const { createSingleCaseExecutorComposition } = require("../src/composition/single-case-executor-composition")
const { REQUIRED_METHODS } = require("../src/domain/single-case-apply")
const { AUTH_SCOPES, AUTHORIZATION_SCHEMA_VERSION, authorizablePlanHash, reservationEvidenceHash, canonicalize, sha256 } = require("../src/domain/single-case-apply-contracts")
const { caseFingerprintFor } = require("../src/domain/single-case-target")

const NOW = "2026-07-15T12:00:00.000Z"
const BYTES = Buffer.from("fixture-composition-content")
const PLAN_HASH = "3".repeat(64), MANIFEST_HASH = "4".repeat(64)
const clone = value => structuredClone(value)

function plan(overrides = {}) {
  const value = {
    schemaVersion: 1,
    caseImportId: "fixture-composition-case",
    caseFingerprint: caseFingerprintFor("fixture-composition-case"),
    safeToPlanHubSpot: true,
    safeToApply: true,
    pendingDependencies: [],
    dealPlan: { caseNumber: "PRV.260715.654", properties: { numero_de_caso: "PRV.260715.654", pipeline: "fixture-pipeline", dealstage: "fixture-stage", dealname: "Caso ficticio" } },
    contactPlan: { properties: { firstname: "Pessoa Ficticia", cpf_do_cliente: "52998224725", phone: "5511999999999" } },
    associationPlan: { type: "deal_to_contact", primaryOnly: true },
    caseNumberReservationSync: { source: "OFFICIAL_POSTGRES_RESERVATION", reservationKeyFingerprint: "abcdef123456" },
    drivePlan: { area: { logicalId: "AREA-FIXTURE", name: "Area Ficticia" }, case: { logicalId: "CASE-FIXTURE", name: "Caso Ficticio" } },
    deduplication: { contactKeys: ["cpf", "phone"], dealKey: "caseNumber", documentKey: "sha256" },
    writeScope: ["HUBSPOT_CONTACT", "HUBSPOT_DEAL", "HUBSPOT_ASSOCIATION", "DRIVE_FOLDERS", "DRIVE_UPLOADS", "CHECKPOINT_WRITE"],
    documentPlan: {
      driveEligibleUniqueContents: 1,
      contents: [{ contentDocumentId: "D01", sha256: sha256(BYTES), eligible: true, kind: "document", caseLinked: true }],
      occurrences: [{ contentDocumentId: "D01", sha256: sha256(BYTES), logicalName: "fixture.pdf" }]
    }
  }
  return Object.assign(value, overrides)
}

function authorizations(value) {
  const hash = authorizablePlanHash(value)
  return Object.entries(AUTH_SCOPES).map(([type, scope], index) => ({
    authorizationId: `fixture-composition-auth-${index + 1}`,
    schemaVersion: AUTHORIZATION_SCHEMA_VERSION,
    type,
    caseImportId: value.caseImportId,
    caseFingerprint: value.caseFingerprint,
    caseNumber: value.dealPlan.caseNumber,
    authorizablePlanHash: hash,
    planHash: PLAN_HASH,
    manifestHash: MANIFEST_HASH,
    reservationEvidenceHash: reservationEvidenceHash({ verified: true, caseImportId: value.caseImportId, caseNumber: value.dealPlan.caseNumber, evidenceId: "fixture-reservation-proof" }),
    scope: [...scope],
    issuer: "fixture-authority",
    issuedAt: "2026-07-15T11:45:00.000Z",
    expiresAt: "2026-07-15T12:15:00.000Z",
    revoked: false,
    proof: "fixture-proof"
  }))
}

function system(options = {}) {
  const value = options.plan || plan()
  const records = options.records === undefined ? authorizations(value) : options.records
  const state = {
    checkpoint: options.checkpoint || null,
    version: options.checkpoint?.version || 0,
    lease: null,
    contacts: options.contact ? [clone(options.contact)] : [],
    deals: options.deal ? [clone(options.deal)] : [],
    associations: options.association ? [clone(options.association)] : [],
    areas: [], folders: [], files: new Map(), calls: {}
  }
  const count = name => { state.calls[name] = (state.calls[name] || 0) + 1 }
  const contextValid = context => {
    const expectedVersion = context.idempotencyKey === `${value.caseImportId}:reservation-preflight` ? 0 : state.version
    if (context.caseImportId !== value.caseImportId || context.leaseId !== state.lease?.leaseId || context.fencingToken !== state.lease?.fencingToken || context.checkpointVersion !== expectedVersion) throw new Error("FENCING_REJECTED")
  }
  const contacts = {
    findContactsByCpf: async cpf => options.multipleContacts ? [{ id: "contact-a" }, { id: "contact-b" }] : options.cpfContact ? [{ id: options.cpfContact }] : state.contacts.filter(item => item.properties.cpf_do_cliente === cpf).map(item => ({ id: item.id })),
    findContactsByPhone: async phone => options.multiplePhones ? [{ id: "contact-a" }, { id: "contact-b" }] : options.phoneContact ? [{ id: options.phoneContact }] : state.contacts.filter(item => item.properties.phone === phone).map(item => ({ id: item.id })),
    create: async ({ properties, context }) => { contextValid(context); count("contacts.create"); if (options.contactUnknown) throw new Error("HUBSPOT_EXTERNAL_EFFECT_UNKNOWN"); const item = { id: "contact-created", properties: clone(properties), caseImportId: value.caseImportId }; state.contacts.push(item); return { id: item.id } },
    verify: async id => { const item = state.contacts.find(entry => entry.id === id); return item && { verified: true, id, cpf: item.properties.cpf_do_cliente, phone: item.properties.phone, fieldsHash: sha256(canonicalize(item.properties)), caseImportId: item.caseImportId } }
  }
  const deals = {
    findByCaseNumber: async number => { count("deals.find"); return options.multipleDeals ? [{ id: "deal-a" }, { id: "deal-b" }] : state.deals.filter(item => item.properties.numero_de_caso === number).map(item => ({ id: item.id })) },
    create: async ({ properties, context }) => { contextValid(context); count("deals.create"); const item = { id: "deal-created", properties: clone(properties) }; state.deals.push(item); return { id: item.id } },
    verify: async id => { const item = state.deals.find(entry => entry.id === id); return item && { verified: true, id, caseNumber: item.properties.numero_de_caso, pipeline: item.properties.pipeline, stage: item.properties.dealstage, fieldsHash: sha256(canonicalize(item.properties)) } }
  }
  const associations = {
    find: async (contactId, dealId) => { count("associations.find"); return state.associations.filter(item => item.contactId === contactId && item.dealId === dealId).map(item => ({ id: item.id })) },
    create: async ({ contactId, dealId, type, context }) => { contextValid(context); count("associations.create"); const item = { id: "association-created", contactId, dealId, type }; state.associations.push(item); return { id: item.id } },
    verify: async (id, contactId, dealId, type) => { const item = state.associations.find(entry => entry.id === id); return item && { verified: true, id, contactId: item.contactId, dealId: item.dealId, relation: item.type } }
  }
  const drive = {
    findAreaFolders: async destination => { count("drive.findAreaFolders"); return state.areas.filter(item => item.logicalId === destination.logicalId).map(item => ({ id: item.id })) },
    createAreaFolder: async ({ destination, context }) => { contextValid(context); count("drive.createAreaFolder"); const item = { id: "area-created", ...clone(destination), parentId: "root", trashed: false }; state.areas.push(item); return { id: item.id } },
    findCaseFolders: async (parentId, destination) => { count("drive.findCaseFolders"); return state.folders.filter(item => item.parentId === parentId && item.logicalId === destination.logicalId).map(item => ({ id: item.id })) },
    createCaseFolder: async ({ parentId, destination, context }) => { contextValid(context); count("drive.createCaseFolder"); const item = { id: "folder-created", ...clone(destination), parentId, trashed: false }; state.folders.push(item); return { id: item.id } },
    verifyFolder: async id => { const item = [...state.areas, ...state.folders].find(entry => entry.id === id); return item && { verified: true, id, logicalId: item.logicalId, name: item.name, parentId: item.parentId, trashed: false } },
    findFilesByHash: async (parentId, hash) => { count("drive.findFilesByHash"); const item = state.files.get(`${parentId}:${hash}`); return item ? [{ id: item.id }] : [] },
    upload: async ({ parentId, bytesBase64, sha256: hash, size, document, context }) => { contextValid(context); count("drive.upload"); const item = { id: "file-created", parentId, sha256: hash, size, contentDocumentId: document.contentDocumentId, bytes: Buffer.from(bytesBase64, "base64") }; state.files.set(`${parentId}:${hash}`, item); return { id: item.id } },
    verifyUpload: async (id, hash) => { const item = [...state.files.values()].find(entry => entry.id === id); return item && { verified: true, id, sha256: hash, size: item.size, parentId: item.parentId, contentDocumentId: item.contentDocumentId } }
  }
  const dependencies = {
    plans: { loadByCaseImportId: async id => { count(`plans.load:${id}`); return clone(options.wrongCase ? { ...value, caseImportId: "fixture-other-case" } : value) } },
    authorizations: { loadForCase: async () => clone(records), consumeAuthorizations: async () => ({ status: options.consumeStatus || "consumed" }) },
    coordination: {
      acquireLease: async ({ caseImportId }) => { state.lease = { caseImportId, leaseId: "lease-fixture", fencingToken: 1, version: 1, expiresAt: "2026-07-15T12:01:00.000Z" }; return clone(state.lease) },
      renewLease: async () => { if (options.rejectFencing) throw new Error("FENCING_TOKEN_STALE"); return clone(state.lease) },
      loadCheckpoint: async () => clone(state.checkpoint),
      compareAndSetCheckpoint: async ({ expectedVersion, checkpoint }) => { if (expectedVersion !== state.version) throw new Error("CAS_VERSION_DIVERGENCE"); state.version += 1; state.checkpoint = clone(checkpoint); state.checkpoint.version = state.version; return { saved: true, version: state.version } },
      releaseLease: async () => { state.lease = null; return { released: true } }
    },
    reservation: { verify: async (caseImportId, caseNumber, context) => { contextValid(context); return { verified: true, caseImportId, caseNumber, evidenceId: "fixture-reservation-proof" } } },
    hubspot: { contacts, deals, associations },
    drive,
    content: { loadBytes: async () => Buffer.from(BYTES) },
    clock: () => NOW,
    authorizationVerifier: options.verifier || { verify: () => ({ valid: true }) }
  }
  return { value, state, dependencies }
}

const compose = item => createSingleCaseExecutorComposition(item.dependencies)
const execute = item => compose(item)({ caseImportId: item.value.caseImportId, planHash: PLAN_HASH, manifestHash: MANIFEST_HASH })

test("factory válida retorna função e conclui pelo executor real", async () => { const item = system(); const executor = compose(item); assert.equal(typeof executor, "function"); assert.equal((await executor({ caseImportId: item.value.caseImportId, planHash: PLAN_HASH, manifestHash: MANIFEST_HASH })).completed, true) })

for (const [dependency, methods] of Object.entries(REQUIRED_METHODS)) {
  test(`bloqueia dependência ausente: ${dependency}`, () => { const item = system(); if (["contacts", "deals", "associations"].includes(dependency)) delete item.dependencies.hubspot[dependency]; else delete item.dependencies[dependency]; assert.throws(() => compose(item), new RegExp(`${dependency === "contacts" || dependency === "deals" || dependency === "associations" ? `hubspot.${dependency}` : dependency}_MISSING`)) })
  for (const method of methods) test(`bloqueia método ausente: ${dependency}.${method}`, () => { const item = system(); const target = ["contacts", "deals", "associations"].includes(dependency) ? item.dependencies.hubspot[dependency] : item.dependencies[dependency]; delete target[method]; assert.throws(() => compose(item), new RegExp(`METHOD_MISSING:${method}`)) })
}

test("bloqueia agrupador HubSpot ausente", () => { const item = system(); delete item.dependencies.hubspot; assert.throws(() => compose(item), /HUBSPOT_ADAPTERS_MISSING/) })
test("bloqueia clock inválido", () => { const item = system(); item.dependencies.clock = null; assert.throws(() => compose(item), /CLOCK_INVALID/) })
test("bloqueia verificador ausente", () => { const item = system(); delete item.dependencies.authorizationVerifier; assert.throws(() => compose(item), /AUTHORIZATION_VERIFIER_MISSING/) })
test("bloqueia argumentos operacionais inválidos", async () => { const executor = compose(system()); await assert.rejects(() => executor(), /EXECUTOR_ARGS_INVALID/); await assert.rejects(() => executor({}), /CASE_IMPORT_ID_INVALID/); await assert.rejects(() => executor({caseImportId:"fixture-composition-case"}), /PLAN_HASH_INVALID/); await assert.rejects(() => executor({caseImportId:"fixture-composition-case",planHash:PLAN_HASH}), /MANIFEST_HASH_INVALID/) })
test("CLI real falha fechado sem configuraÃ§Ã£o", async () => { const cli = require("../scripts/apply-single-case"); await assert.rejects(() => cli.main({ argv: ["--case-import-id", "fixture-composition-case"], env: {} }), /POSTGRES_MODE_REQUIRED/) })

test("reutiliza contato, negócio e associação existentes", async () => { const value = plan(); const item = system({ contact: { id: "contact-existing", properties: clone(value.contactPlan.properties), caseImportId: value.caseImportId }, deal: { id: "deal-existing", properties: clone(value.dealPlan.properties) }, association: { id: "association-existing", contactId: "contact-existing", dealId: "deal-existing", type: value.associationPlan.type } }); await execute(item); assert.equal(item.state.calls["contacts.create"], undefined); assert.equal(item.state.calls["deals.create"], undefined); assert.equal(item.state.calls["associations.create"], undefined) })
test("cria exatamente um contato, negócio e associação quando ausentes", async () => { const item = system(); await execute(item); assert.equal(item.state.calls["contacts.create"], 1); assert.equal(item.state.calls["deals.create"], 1); assert.equal(item.state.calls["associations.create"], 1) })
test("múltiplos contatos bloqueiam antes de negócio e Drive", async () => { const item = system({ multipleContacts: true }); await assert.rejects(() => execute(item), /CONTACT_CPF_AMBIGUOUS/); assert.equal(item.state.calls["deals.find"], undefined); assert.equal(item.state.calls["drive.findAreaFolders"], undefined) })
test("CPF e telefone divergentes bloqueiam", async () => { const item = system({ cpfContact: "contact-a", phoneContact: "contact-b" }); await assert.rejects(() => execute(item), /CONTACT_IDENTITY_CONFLICT/) })
test("múltiplos negócios bloqueiam antes de associação e Drive", async () => { const item = system({ multipleDeals: true }); await assert.rejects(() => execute(item), /DEAL_AMBIGUOUS/); assert.equal(item.state.calls["associations.find"], undefined); assert.equal(item.state.calls["drive.findAreaFolders"], undefined) })
test("autorização ausente bloqueia depois da lease e antes de efeitos", async () => { const item = system({ records: [] }); await assert.rejects(() => execute(item), /AUTH_AMBIGUOUS/); assert.equal(item.state.calls["contacts.create"], undefined) })
test("autorização expirada bloqueia depois da lease e antes de efeitos", async () => { const item = system({ verifier: { verify: () => ({ valid: false, reason: "AUTH_EXPIRED" }) } }); await assert.rejects(() => execute(item), /AUTH_EXPIRED/); assert.equal(item.state.calls["contacts.create"], undefined) })
test("plano não sincronizado falha fechado", async () => { const value = plan(); value.caseNumberReservationSync.source = "PENDING_RESERVATION"; const item = system({ plan: value, records: [] }); await assert.rejects(() => execute(item), /PLAN_NOT_SYNCHRONIZED/) })
test("retomada de checkpoint concluído reverifica sem duplicar efeitos", async () => { const item = system(); await execute(item); const first = clone(item.state.calls); await execute(item); assert.equal(item.state.calls["contacts.create"], first["contacts.create"]); assert.equal(item.state.calls["deals.create"], first["deals.create"]); assert.equal(item.state.calls["drive.upload"], first["drive.upload"]) })
test("fencing rejeitado interrompe antes do primeiro efeito externo", async () => { const item = system({ rejectFencing: true }); await assert.rejects(() => execute(item), /FENCING_TOKEN_STALE/); assert.equal(item.state.calls["contacts.create"], undefined) })
test("isolamento usa somente o caseImportId solicitado", async () => { const item = system(); await execute(item); assert.equal(item.state.calls[`plans.load:${item.value.caseImportId}`], 2); assert.equal(Object.keys(item.state.calls).some(key => key.startsWith("plans.load:") && key !== `plans.load:${item.value.caseImportId}`), false) })
test("Drive é alcançado apenas depois de contato, negócio e associação", async () => { const item = system(); await execute(item); assert.equal(item.state.calls["contacts.create"], 1); assert.equal(item.state.calls["deals.create"], 1); assert.equal(item.state.calls["associations.create"], 1); assert.equal(item.state.calls["drive.createAreaFolder"], 1) })
test("a composição não aceita nem encaminha Meta, Calendar ou mensagens", () => { const item = system(); item.dependencies.meta = { send: () => assert.fail() }; item.dependencies.calendar = { create: () => assert.fail() }; item.dependencies.messages = { send: () => assert.fail() }; const executor = compose(item); assert.equal(typeof executor, "function"); assert.deepEqual(Object.keys(REQUIRED_METHODS).sort(), ["associations", "authorizations", "contacts", "content", "coordination", "deals", "drive", "plans", "reservation"].sort()) })

test("efeito externo desconhecido é persistido e jamais repetido", async () => {
  const item = system({ contactUnknown: true })
  let received
  try { await execute(item) } catch (error) { received = error.message }
  const evidence = {
    contactsCreate: item.state.calls["contacts.create"],
    error: received,
    checkpoint: item.state.checkpoint.steps.contact.errorCode,
    deals: item.state.calls["deals.find"] || 0,
    associations: item.state.calls["associations.find"] || 0,
    drive: item.state.calls["drive.findAreaFolders"] || 0
  }
  assert.deepEqual(evidence, { contactsCreate: 1, error: "HUBSPOT_EXTERNAL_EFFECT_UNKNOWN", checkpoint: "EXTERNAL_EFFECT_UNKNOWN", deals: 0, associations: 0, drive: 0 })
  assert.equal(item.state.checkpoint.steps.contact.status, "failed")
})
