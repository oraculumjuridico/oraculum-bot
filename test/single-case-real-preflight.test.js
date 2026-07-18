"use strict"

const test = require("node:test")
const assert = require("node:assert/strict")
const crypto = require("node:crypto")
const fs = require("node:fs/promises")
const os = require("node:os")
const path = require("node:path")
const { caseFingerprintFor, resolveP1Target } = require("../src/domain/single-case-target")
const { runSingleCaseRealPreflight } = require("../src/composition/single-case-real-preflight")
const { AUTHORIZATION_SCHEMA_VERSION, AUTH_SCOPES, authorizablePlanHash, reservationEvidenceHash, authorizationPayload } = require("../src/domain/single-case-apply-contracts")

const CASE_ID = "fixture-p1-target", CASE_NUMBER = "PRV.260718.707", NOW = "2026-07-18T12:00:00.000Z"
const hash = value => crypto.createHash("sha256").update(value).digest("hex")
const plan = (id = CASE_ID, overrides = {}) => ({
  caseImportId: id, caseFingerprint: caseFingerprintFor(id), safeToApply: false,
  caseNumberReservationSync: { source: "OFFICIAL_POSTGRES_RESERVATION", status: "SYNCHRONIZED" },
  contactPlan: { properties: { firstname: "Fixture", cpf_do_cliente: "fixture", phone: "fixture" } },
  dealPlan: { caseNumber: CASE_NUMBER, properties: { numero_de_caso: CASE_NUMBER, pipeline: "fixture", dealstage: "fixture" } },
  associationPlan: { type: "deal_to_contact", primaryOnly: true }, drivePlan: { area: { logicalId: "area:fixture", name: "Fixture" }, case: { logicalId: "case:fixture", name: "Fixture" } },
  documentPlan: { driveEligibleUniqueContents: 1, contents: [{ contentDocumentId: "C-11111111111111111111", sha256: "1".repeat(64), eligible: true, kind: "document", caseLinked: true }], occurrences: [{ contentDocumentId: "C-11111111111111111111", sha256: "1".repeat(64), logicalName: "fixture.pdf" }] },
  deduplication: { contactKeys: ["cpf", "phone"], dealKey: "caseNumber", documentKey: "sha256" }, writeScope: [...AUTH_SCOPES.EXTERNAL_WRITES_AUTHORIZATION], ...overrides
})

async function roots() { const root = await fs.mkdtemp(path.join(os.tmpdir(), "p1-preflight-")); const plans = path.join(root, "plans"), manifests = path.join(root, "manifests"), content = path.join(root, "content"); await Promise.all([fs.mkdir(plans), fs.mkdir(manifests), fs.mkdir(content)]); return { root, plans, manifests, content } }
async function writeJson(file, value) { const bytes = Buffer.from(JSON.stringify(value)); await fs.writeFile(file, bytes); return bytes }

function authorizationRows({ planValue, planBytes, manifestBytes, privateKey, state = "active" }) {
  const expected = { caseImportId: CASE_ID, caseFingerprint: planValue.caseFingerprint, caseNumber: CASE_NUMBER, authorizablePlanHash: authorizablePlanHash(planValue), planHash: hash(planBytes), manifestHash: hash(manifestBytes), reservationEvidenceHash: reservationEvidenceHash({ verified: true, evidenceId: `case-import:${CASE_ID}`, caseImportId: CASE_ID, caseNumber: CASE_NUMBER }) }
  if (state === "absent") return []
  const rows = Object.entries(AUTH_SCOPES).map(([type, scope], index) => {
    const issuedAt = "2026-07-18T11:50:00.000Z", expiresAt = state === "expired" ? "2026-07-18T11:59:00.000Z" : "2026-07-18T12:20:00.000Z", revoked = state === "revoked"
    const record = { authorizationId: `fixture-authorization-${index + 1}`, schemaVersion: AUTHORIZATION_SCHEMA_VERSION, type, ...expected, scope: [...scope], issuer: "fixture-issuer", issuedAt, expiresAt, revoked }
    const signature = crypto.sign(null, Buffer.from(authorizationPayload(record)), privateKey).toString("base64")
    return { authorization_id: record.authorizationId, schema_version: record.schemaVersion, authorization_type: type, case_import_id: CASE_ID, case_fingerprint: record.caseFingerprint, case_number: CASE_NUMBER, authorizable_plan_hash: record.authorizablePlanHash, plan_hash: record.planHash, manifest_hash: record.manifestHash, reservation_evidence_hash: record.reservationEvidenceHash, scope: [...scope], issuer: record.issuer, issued_at: issuedAt, expires_at: expiresAt, revoked, revoked_at: revoked ? NOW : null, revocation_reason: revoked ? "fixture" : null, consumed_at: state === "consumed" ? NOW : null, consumed_by: state === "consumed" ? "fixture-executor" : null, signature, signature_algorithm: "Ed25519", operational_status: "ACTIVE" }
  })
  if (state === "divergent") rows[0].plan_hash = "f".repeat(64)
  return rows
}

async function harness(state = "active") {
  const dirs = await roots(), planValue = plan(), planBytes = await writeJson(path.join(dirs.plans, "arbitrary-name.json"), planValue), manifestBytes = await writeJson(path.join(dirs.manifests, `${CASE_ID}.json`), [{ reference: "fixture" }])
  const { privateKey, publicKey } = crypto.generateKeyPairSync("ed25519"), rows = authorizationRows({ planValue, planBytes, manifestBytes, privateKey, state }), calls = []
  const client = { async query(sql) { calls.push(sql); if (sql === "BEGIN TRANSACTION READ ONLY" || sql === "ROLLBACK") return { rows: [], rowCount: 0 }; if (/case_number_reservations/.test(sql)) return { rows: [{ reservation_key: `case-import:${CASE_ID}`, case_number: CASE_NUMBER, status: "reserved" }], rowCount: 1 }; if (/authorization_type = ANY/.test(sql)) return { rows, rowCount: rows.length }; throw new Error("UNEXPECTED_QUERY") }, release() { calls.push("RELEASE") } }
  const pool = { connect: async () => client, end: async () => { calls.push("END") } }
  const env = { CASE_NUMBER_RESERVATION_MODE: "postgres", EXTERNAL_STATE_DATABASE_URL: "postgresql://fixture.invalid/test", HUBSPOT_TOKEN: "fixture-token", GOOGLE_DRIVE_CLIENT_ID: "fixture-client", GOOGLE_DRIVE_CLIENT_SECRET: "fixture-secret", GOOGLE_DRIVE_REFRESH_TOKEN: "fixture-refresh", GOOGLE_DRIVE_ROOT_FOLDER_ID: "fixture-root", SINGLE_CASE_CONTENT_ROOT: dirs.content, SINGLE_CASE_APPLY_TRUSTED_PUBLIC_KEYS_JSON: JSON.stringify([{ algorithm: "Ed25519", issuer: "fixture-issuer", publicKeyPem: publicKey.export({ type: "spki", format: "pem" }) }]), SINGLE_CASE_P1_CASE_IMPORT_ID: CASE_ID, SINGLE_CASE_PLANS_ROOT: dirs.plans, SINGLE_CASE_MANIFESTS_ROOT: dirs.manifests }
  return { dirs, calls, run: () => runSingleCaseRealPreflight({ env, now: () => NOW, poolFactory: () => pool }) }
}

test("TEST_MULTIPLE_PLAN_FILES_DO_NOT_SELECT_WRONG_TARGET", async () => { const d = await roots(); try { await writeJson(path.join(d.plans, "p2.json"), plan("fixture-p2-target")); await writeJson(path.join(d.plans, "p1.json"), plan()); assert.equal((await resolveP1Target({ plansRoot: d.plans, caseImportId: CASE_ID })).plan.caseImportId, CASE_ID) } finally { await fs.rm(d.root, { recursive: true, force: true }) } })
test("TEST_P2_REJECTED", async () => { const d = await roots(); try { await writeJson(path.join(d.plans, "p2.json"), plan("fixture-p2-target")); await assert.rejects(() => resolveP1Target({ plansRoot: d.plans, caseImportId: CASE_ID }), /P1_PLAN_NOT_FOUND/) } finally { await fs.rm(d.root, { recursive: true, force: true }) } })
test("TEST_P3_REJECTED", async () => { const d = await roots(); try { await writeJson(path.join(d.plans, "p3.json"), plan("fixture-p3-target")); await assert.rejects(() => resolveP1Target({ plansRoot: d.plans, caseImportId: CASE_ID }), /P1_PLAN_NOT_FOUND/) } finally { await fs.rm(d.root, { recursive: true, force: true }) } })
test("TEST_OFFICIAL_P1_TARGET_RESOLUTION", async () => { const d = await roots(); try { await writeJson(path.join(d.plans, "not-derived-from-name.json"), plan()); assert.equal((await resolveP1Target({ plansRoot: d.plans, caseImportId: CASE_ID })).binding.caseImportId, CASE_ID) } finally { await fs.rm(d.root, { recursive: true, force: true }) } })
test("TEST_AMBIGUOUS_P1_TARGET_REJECTED", async () => { const d = await roots(); try { await writeJson(path.join(d.plans, "first.json"), plan()); await writeJson(path.join(d.plans, "second.json"), plan()); await assert.rejects(() => resolveP1Target({ plansRoot: d.plans, caseImportId: CASE_ID }), /P1_PLAN_AMBIGUOUS/) } finally { await fs.rm(d.root, { recursive: true, force: true }) } })
test("TEST_OFFICIAL_FINGERPRINT_FUNCTION_USED", () => assert.equal(plan().caseFingerprint, caseFingerprintFor(CASE_ID)))
test("TEST_FINGERPRINT_DIVERGENCE_REJECTED", async () => { const d = await roots(); try { await writeJson(path.join(d.plans, "p1.json"), plan(CASE_ID, { caseFingerprint: "0".repeat(12) })); await assert.rejects(() => resolveP1Target({ plansRoot: d.plans, caseImportId: CASE_ID }), /CASE_FINGERPRINT_DIVERGENT/) } finally { await fs.rm(d.root, { recursive: true, force: true }) } })
test("TEST_OFFICIAL_PREFLIGHT_PATH_USED", async () => { const h = await harness(); try { const result = await h.run(); assert.equal(result.readyForExecution, true); assert.equal(result.authorizationState, "PAIR_ACTIVE") } finally { await fs.rm(h.dirs.root, { recursive: true, force: true }) } })
for (const [name, state, expected] of [["TEST_CONSUMED_AUTHORIZATION_REJECTED", "consumed", "PAIR_CONSUMED"], ["TEST_REVOKED_AUTHORIZATION_REJECTED", "revoked", "PAIR_REVOKED"], ["TEST_EXPIRED_AUTHORIZATION_REJECTED", "expired", "PAIR_EXPIRED"]]) test(name, async () => { const h = await harness(state); try { const result = await h.run(); assert.equal(result.authorizationState, expected); assert.equal(result.readyForExecution, false) } finally { await fs.rm(h.dirs.root, { recursive: true, force: true }) } })
for (const [name, state, expected] of [["TEST_ABSENT_AUTHORIZATION_REJECTED", "absent", "PAIR_ABSENT"], ["TEST_DIVERGENT_AUTHORIZATION_REJECTED", "divergent", "PAIR_DIVERGENT"]]) test(name, async () => { const h = await harness(state); try { const result = await h.run(); assert.equal(result.authorizationState, expected); assert.equal(result.readyForExecution, false) } finally { await fs.rm(h.dirs.root, { recursive: true, force: true }) } })
test("TEST_READ_ONLY_ROLLBACK", async () => { const h = await harness(); try { const result = await h.run(); assert.equal(result.readOnlyTransactionStarted, true); assert.equal(result.rollbackExecuted, true); assert.ok(h.calls.includes("BEGIN TRANSACTION READ ONLY")); assert.ok(h.calls.includes("ROLLBACK")); assert.equal(h.calls.some(sql => typeof sql === "string" && /INSERT|UPDATE|DELETE|FOR UPDATE/i.test(sql)), false) } finally { await fs.rm(h.dirs.root, { recursive: true, force: true }) } })
test("TEST_ZERO_EXTERNAL_ACTIONS", async () => { const h = await harness(); try { assert.equal((await h.run()).externalActionsExecuted, 0) } finally { await fs.rm(h.dirs.root, { recursive: true, force: true }) } })
