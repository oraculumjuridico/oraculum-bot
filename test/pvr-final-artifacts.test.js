"use strict"

const test = require("node:test")
const assert = require("node:assert/strict")
const crypto = require("node:crypto")
const fs = require("node:fs/promises")
const os = require("node:os")
const path = require("node:path")
const { caseFingerprintFor } = require("../src/domain/single-case-target")
const { createPvrFinalArtifacts, writePvrFinalArtifacts } = require("../src/domain/pvr-final-artifacts")
const { createSingleCaseContentResolver } = require("../src/adapters/single-case-content-resolver")

const digest = value => crypto.createHash("sha256").update(value).digest("hex")
const CASE_IMPORT_ID = "pvr-stage-five-fixture"
const CASE_NUMBER = "PVR.260801.999"

async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "pvr-stage-five-")), contentRoot = path.join(root, "content")
  await fs.mkdir(contentRoot)
  const contents = [], physicalOccurrences = []
  for (const index of [1, 2]) {
    const bytes = Buffer.from(`pvr-fixture-${index}`), sha256 = digest(bytes), localReference = path.join(contentRoot, `doc-${index}.pdf`)
    await fs.writeFile(localReference, bytes)
    const contentDocumentId = `C-${sha256.slice(0, 20)}`
    contents.push({ contentDocumentId, sha256, analysisStatus: "ANALYZED", quarantined: false })
    physicalOccurrences.push({ physicalDocumentId: `P-${index}`, contentDocumentId, sha256, localReference })
  }
  const identityConfirmed = {
    schemaVersion: 1, caseImportId: CASE_IMPORT_ID, identityConfirmationApplied: true, safeToPlanHubSpot: true,
    area: "Previdenciario", nomesEncontrados: "Cliente de Teste",
    reviewedInventory: { contents, physicalOccurrences }
  }
  const basePlan = {
    schemaVersion: 1, source: "single_case_import_bridge", caseImportId: CASE_IMPORT_ID,
    caseFingerprint: caseFingerprintFor(CASE_IMPORT_ID), caseNumber: CASE_NUMBER, officialNumber: CASE_NUMBER,
    contactPlan: { existingContactId: "contact-fixture-1", reusePolicy: "REQUIRE_EXISTING_UNIQUE", properties: { firstname: "Cliente de Teste" } },
    dealPlan: { existingDealId: "deal-fixture-1", caseNumber: CASE_NUMBER, reusePolicy: "REQUIRE_EXISTING_UNIQUE", properties: { numero_de_caso: CASE_NUMBER, area_juridica: "Previdenciario" } },
    drivePlan: { reusePolicy: "REQUIRE_EXISTING_LOGICAL_ID" },
    existingResourcePolicy: { contact: "REQUIRE_EXISTING_UNIQUE", deal: "REQUIRE_EXISTING_UNIQUE", drive: "REQUIRE_EXISTING_LOGICAL_ID" },
    caseNumberReservationSync: { source: "OFFICIAL_POSTGRES_RESERVATION", status: "SYNCHRONIZED", reservationKey: `case-import:${CASE_IMPORT_ID}`, caseNumber: CASE_NUMBER },
    safeToApply: false, pendingDependencies: []
  }
  return { root, contentRoot, identityConfirmed, basePlan }
}

test("basePlan PVR sincronizado produz plano e manifesto oficiais sem acesso externo", async () => {
  const input = await fixture()
  try {
    const { plan, manifest } = await createPvrFinalArtifacts(input)
    assert.equal(plan.caseImportId, CASE_IMPORT_ID)
    assert.equal(plan.caseFingerprint, caseFingerprintFor(CASE_IMPORT_ID))
    assert.equal(plan.caseNumber, CASE_NUMBER)
    assert.equal(plan.dealPlan.caseNumber, CASE_NUMBER)
    assert.equal(plan.contactPlan.existingContactId, "contact-fixture-1")
    assert.equal(plan.dealPlan.existingDealId, "deal-fixture-1")
    assert.equal(plan.contactPlan.reusePolicy, "REQUIRE_EXISTING_UNIQUE")
    assert.equal(plan.dealPlan.reusePolicy, "REQUIRE_EXISTING_UNIQUE")
    assert.equal(plan.drivePlan.reusePolicy, "REQUIRE_EXISTING_LOGICAL_ID")
    assert.deepEqual(plan.caseNumberReservationSync, input.basePlan.caseNumberReservationSync)
    assert.equal(plan.safeToApply, false)
    assert.equal(plan.status, "PLANNED_NOT_EXECUTED")
    assert.equal(manifest.length, 2)
    assert.ok(manifest.every(entry => entry.caseImportId === CASE_IMPORT_ID && !path.isAbsolute(entry.relativePath)))
  } finally { await fs.rm(input.root, { recursive: true, force: true }) }
})

for (const [name, mutate, code] of [
  ["sem reserva sincronizada", value => { delete value.basePlan.caseNumberReservationSync }, "PVR_RESERVATION_SYNC_INVALID"],
  ["PVR divergente", value => { value.basePlan.officialNumber = "PVR.260801.998" }, "PVR_BASE_PLAN_INVALID"],
  ["identidade nao confirmada", value => { value.identityConfirmed.identityConfirmationApplied = false }, "IDENTITY_CONFIRMED_INVALID"],
  ["hash divergente", value => { value.identityConfirmed.reviewedInventory.contents[0].sha256 = "0".repeat(64) }, "CONTENT_(ID_COLLISION|INVENTORY_INVALID)"],
  ["path fora da raiz", value => { value.identityConfirmed.reviewedInventory.physicalOccurrences[0].localReference = path.join(value.root, "outside.pdf") }, "CONTENT_REFERENCE_OUTSIDE_ROOT"]
]) test(`falha fechado: ${name}`, async () => {
  const input = await fixture()
  try {
    if (name === "path fora da raiz") await fs.writeFile(path.join(input.root, "outside.pdf"), "outside")
    mutate(input)
    await assert.rejects(() => createPvrFinalArtifacts(input), new RegExp(code))
  } finally { await fs.rm(input.root, { recursive: true, force: true }) }
})

test("arquivo de conteudo ausente bloqueia", async () => {
  const input = await fixture()
  try {
    await fs.unlink(input.identityConfirmed.reviewedInventory.physicalOccurrences[0].localReference)
    await assert.rejects(() => createPvrFinalArtifacts(input), /CONTENT_REFERENCE_INVALID/)
  } finally { await fs.rm(input.root, { recursive: true, force: true }) }
})

test("manifesto valida tamanho e hash antes de disponibilizar conteudo", async () => {
  const input = await fixture()
  try {
    const { manifest } = await createPvrFinalArtifacts(input)
    const first = manifest[0]
    await fs.writeFile(path.join(input.contentRoot, first.relativePath), "alterado-com-tamanho-diferente")
    await assert.rejects(() => createSingleCaseContentResolver({ root: input.contentRoot, entries: manifest }).resolve(first.contentDocumentId), /CONTENT_REFERENCE_SIZE_MISMATCH/)
  } finally { await fs.rm(input.root, { recursive: true, force: true }) }
})

test("escrita do par e idempotente, mas estado parcial ou divergente bloqueia", async () => {
  const input = await fixture()
  try {
    const artifacts = await createPvrFinalArtifacts(input)
    const first = await writePvrFinalArtifacts({ root: input.root, caseImportId: CASE_IMPORT_ID, ...artifacts })
    assert.equal(first.written, true)
    assert.equal((await writePvrFinalArtifacts({ root: input.root, caseImportId: CASE_IMPORT_ID, ...artifacts })).reused, true)
    await fs.writeFile(first.plan, "{}\n")
    await assert.rejects(() => writePvrFinalArtifacts({ root: input.root, caseImportId: CASE_IMPORT_ID, ...artifacts }), /PVR_ARTIFACT_DIVERGENT/)
    await fs.unlink(first.manifest)
    await assert.rejects(() => writePvrFinalArtifacts({ root: input.root, caseImportId: CASE_IMPORT_ID, ...artifacts }), /PVR_ARTIFACT_PAIR_INCOMPLETE/)
  } finally { await fs.rm(input.root, { recursive: true, force: true }) }
})
