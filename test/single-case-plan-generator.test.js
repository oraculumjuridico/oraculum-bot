"use strict"

const test = require("node:test")
const assert = require("node:assert/strict")
const crypto = require("node:crypto")
const { generateSingleCaseApplyPlan } = require("../src/domain/single-case-plan-generator")
const { caseFingerprintFor } = require("../src/domain/single-case-target")
const { montarTituloNegocioHubSpot } = require("../src/domain/hubspot-deal-title")

const digest = value => crypto.createHash("sha256").update(value).digest("hex")
const CASE_ID = "case-pilot-sanitized"
const FINGERPRINT = caseFingerprintFor(CASE_ID)
const CASE_NUMBER = "PRV.260714.707"

function fixture() {
  const contents = Array.from({ length: 12 }, (_, index) => {
    const sha256 = digest(`bytes-${index}`)
    return { contentDocumentId: `C-${sha256.slice(0, 20)}`, sha256, analysisStatus: index === 4 ? "IGNORED" : "ANALYZED", quarantined: false, physicalDocumentIds: [] }
  })
  const physicalOccurrences = []
  for (let index = 0; index < 12; index++) physicalOccurrences.push({ physicalDocumentId: `P-${String(index + 1).padStart(2, "0")}`, contentDocumentId: contents[index].contentDocumentId, sha256: contents[index].sha256 })
  physicalOccurrences.push({ physicalDocumentId: "P-13", contentDocumentId: contents[2].contentDocumentId, sha256: contents[2].sha256 })
  physicalOccurrences.push({ physicalDocumentId: "P-14", contentDocumentId: contents[6].contentDocumentId, sha256: contents[6].sha256 })
  const contentFiles = Object.fromEntries(physicalOccurrences.map((item, index) => [item.physicalDocumentId, { relativePath: `files/${index % 12}-${item.physicalDocumentId}.pdf`, sha256: item.sha256, size: Number.parseInt(item.sha256.slice(0, 6), 16) + 1 }]))
  for (const duplicate of ["P-13", "P-14"]) {
    const original = duplicate === "P-13" ? "P-03" : "P-07"
    contentFiles[duplicate].size = contentFiles[original].size
  }
  const identityConfirmed = { schemaVersion: 1, caseImportId: CASE_ID, identityConfirmationApplied: true, safeToPlanHubSpot: true, reviewedInventory: { contents, physicalOccurrences } }
  const basePlan = { schemaVersion: 1, caseImportId: CASE_ID, safeToPlanHubSpot: true, safeToApply: false, contactPlan: { properties: { cpf_do_cliente: "fixture-cpf", phone: "fixture-phone" } }, dealPlan: { caseNumber: CASE_NUMBER, properties: { numero_de_caso: CASE_NUMBER, pipeline: "default", dealstage: "appointmentscheduled", area_juridica: "Previdenciário (INSS)", temperatura_lead: "Quente", hs_priority: "high" } }, documentPlan: { physicalOccurrences: 14, uniqueContents: 12, ignoredNonDocumentContents: 1, binaryDuplicateOccurrences: 2 }, pendingDependencies: [] , caseNumberReservationSync: { source: "OFFICIAL_POSTGRES_RESERVATION" } }
  return { identityConfirmed, basePlan, caseNumber: CASE_NUMBER, caseImportId: CASE_ID, fingerprint: FINGERPRINT, driveRules: { areaName: "Area Ficticia", caseName: `${CASE_NUMBER} - Cliente Ficticio` }, contentFiles }
}

test("gera inventário e manifesto determinísticos compatíveis com o executor", () => {
  const input = fixture(), before = structuredClone(input), first = generateSingleCaseApplyPlan(input), second = generateSingleCaseApplyPlan(input)
  assert.deepEqual(first, second)
  assert.deepEqual(input, before)
  assert.equal(first.plan.documentPlan.contents.length, 12)
  assert.equal(first.plan.documentPlan.occurrences.length, 14)
  assert.equal(first.plan.documentPlan.contents.filter(item => item.eligible).length, 11)
  assert.equal(first.plan.documentPlan.contents.filter(item => !item.eligible).length, 1)
  assert.equal(first.plan.documentPlan.driveEligibleUniqueContents, 11)
  assert.equal(new Set(first.plan.documentPlan.contents.map(item => item.sha256)).size, 12)
  assert.equal(new Set(first.plan.documentPlan.contents.map(item => item.contentDocumentId)).size, 12)
  const ids = new Set(first.plan.documentPlan.contents.map(item => item.contentDocumentId))
  assert.ok(first.plan.documentPlan.occurrences.every(item => ids.has(item.contentDocumentId)))
  assert.deepEqual(first.plan.documentPlan.contents.map(item => item.sha256).sort(), input.identityConfirmed.reviewedInventory.contents.map(item => item.sha256).sort())
  assert.equal(first.manifest.length, 11)
  assert.equal(new Set(first.manifest.map(item => item.contentDocumentId)).size, 11)
  assert.ok(first.manifest.every(item => !require("node:path").isAbsolute(item.relativePath) && !item.relativePath.split(/[\\/]/).includes("..")))
  const duplicateChoices = [input.contentFiles["P-03"].relativePath, input.contentFiles["P-13"].relativePath].sort()
  assert.equal(first.manifest.find(item => item.contentDocumentId === input.identityConfirmed.reviewedInventory.contents[2].contentDocumentId).relativePath, duplicateChoices[0])
  assert.ok(first.plan.drivePlan.area.logicalId.startsWith("area:"))
  assert.equal(first.plan.drivePlan.case.logicalId, `case:${FINGERPRINT}`)
  assert.equal(first.plan.safeToApply, false)
  assert.deepEqual(first.plan.pendingDependencies, ["EXPLICIT_APPLY_AUTHORIZATION", "EXTERNAL_WRITES_AUTHORIZATION"])
  assert.equal(JSON.stringify({ contents: first.plan.documentPlan.contents, occurrences: first.plan.documentPlan.occurrences, manifest: first.manifest }).includes("Pessoa Real"), false)
  assert.equal(JSON.stringify(first.manifest).includes(":\\"), false)
})

test("duplicidades físicas preservam ocorrências sem aumentar uploads", () => {
  const result = generateSingleCaseApplyPlan(fixture())
  assert.equal(result.plan.documentPlan.occurrences.length - result.plan.documentPlan.contents.length, 2)
  assert.equal(result.manifest.length, 11)
})

test("usa contagens declaradas do caso sem herdar as contagens de outro piloto", () => {
  const input = fixture()
  input.identityConfirmed.reviewedInventory.contents.splice(5)
  input.identityConfirmed.reviewedInventory.physicalOccurrences = input.identityConfirmed.reviewedInventory.physicalOccurrences.filter(item => input.identityConfirmed.reviewedInventory.contents.some(content => content.contentDocumentId === item.contentDocumentId))
  input.contentFiles = Object.fromEntries(input.identityConfirmed.reviewedInventory.physicalOccurrences.map(item => [item.physicalDocumentId, input.contentFiles[item.physicalDocumentId]]))
  input.basePlan.documentPlan = { physicalOccurrences: 6, uniqueContents: 5, ignoredNonDocumentContents: 1, binaryDuplicateOccurrences: 1 }
  const result = generateSingleCaseApplyPlan(input)
  assert.equal(result.plan.documentPlan.contents.length, 5)
  assert.equal(result.plan.documentPlan.occurrences.length, 6)
  assert.equal(result.plan.documentPlan.driveEligibleUniqueContents, 4)
  assert.equal(result.manifest.length, 4)
})

test("falha fechado para hash ausente", () => { const input = fixture(); delete input.identityConfirmed.reviewedInventory.contents[0].sha256; assert.throws(() => generateSingleCaseApplyPlan(input), /CONTENT_HASH_MISSING/) })
test("falha fechado para hash duplicado", () => { const input = fixture(); input.identityConfirmed.reviewedInventory.contents[1].sha256 = input.identityConfirmed.reviewedInventory.contents[0].sha256; assert.throws(() => generateSingleCaseApplyPlan(input), /CONTENT_HASH_DUPLICATED/) })
test("falha fechado para colisão de ID", () => { const input = fixture(); input.identityConfirmed.reviewedInventory.contents[1].contentDocumentId = input.identityConfirmed.reviewedInventory.contents[0].contentDocumentId; assert.throws(() => generateSingleCaseApplyPlan(input), /CONTENT_ID_COLLISION/) })
test("falha fechado para ocorrência sem conteúdo", () => { const input = fixture(); input.identityConfirmed.reviewedInventory.physicalOccurrences[0].contentDocumentId = `C-${"f".repeat(20)}`; assert.throws(() => generateSingleCaseApplyPlan(input), /OCCURRENCE_CONTENT_MISSING/) })
test("falha fechado para contagem de ocorrências divergente", () => { const input = fixture(); input.identityConfirmed.reviewedInventory.physicalOccurrences.pop(); assert.throws(() => generateSingleCaseApplyPlan(input), /OCCURRENCE_COUNT_MISMATCH/) })
test("falha fechado para contagem elegível divergente", () => { const input = fixture(); input.identityConfirmed.reviewedInventory.contents[0].analysisStatus = "IGNORED"; assert.throws(() => generateSingleCaseApplyPlan(input), /ELIGIBLE_CONTENT_COUNT_MISMATCH/) })
test("bloqueia referência com traversal", () => { const input = fixture(); input.contentFiles["P-01"].relativePath = "../outside.pdf"; assert.throws(() => generateSingleCaseApplyPlan(input), /CONTENT_INVENTORY_INVALID/) })
test("valida identidade, caso, fingerprint e número", () => {
  let input = fixture(); input.identityConfirmed.identityConfirmationApplied = false; assert.throws(() => generateSingleCaseApplyPlan(input), /IDENTITY_CONFIRMED_INVALID/)
  input = fixture(); input.caseImportId = "other-case"; assert.throws(() => generateSingleCaseApplyPlan(input), /CASE_IMPORT_ID_INVALID/)
  input = fixture(); input.fingerprint = "0".repeat(12); assert.throws(() => generateSingleCaseApplyPlan(input), /FINGERPRINT_INVALID/)
  input = fixture(); input.caseNumber = "INVALID"; assert.throws(() => generateSingleCaseApplyPlan(input), /CASE_NUMBER_INVALID/)
})

test("valida destinos Drive", () => {
  let input = fixture(); input.driveRules.areaName = ""; assert.throws(() => generateSingleCaseApplyPlan(input), /DRIVE_AREA_DESTINATION_INVALID/)
  input = fixture(); input.driveRules.caseName = ""; assert.throws(() => generateSingleCaseApplyPlan(input), /DRIVE_CASE_DESTINATION_INVALID/)
})

test("dealname está presente no plano final e não é vazio", () => {
  const input = fixture()
  const result = generateSingleCaseApplyPlan(input)
  assert.ok(result.plan.dealPlan.properties.dealname)
  assert.ok(String(result.plan.dealPlan.properties.dealname).trim().length > 0)
})

test("dealname é proveniente da fonte oficial montarTituloNegocioHubSpot", () => {
  const input = fixture()
  const result = generateSingleCaseApplyPlan(input)
  const expected = montarTituloNegocioHubSpot({
    area: input.basePlan.dealPlan.properties.area_juridica,
    numeroCaso: input.basePlan.dealPlan.caseNumber
  })
  assert.equal(result.plan.dealPlan.properties.dealname, expected)
})

test("dealname não usa valor fixo do Piloto 1", () => {
  const input = fixture()
  input.caseNumber = "CIV.260710.001"
  input.basePlan.dealPlan.caseNumber = "CIV.260710.001"
  input.basePlan.dealPlan.properties.numero_de_caso = "CIV.260710.001"
  input.basePlan.dealPlan.properties.area_juridica = "Civil"
  const result = generateSingleCaseApplyPlan(input)
  assert.equal(result.plan.dealPlan.properties.dealname, "🟢 Civ-CIV.260710.001")
})

test("dealname preserva os outros campos do dealPlan.properties do plano base", () => {
  const input = fixture()
  const result = generateSingleCaseApplyPlan(input)
  const props = result.plan.dealPlan.properties
  assert.equal(props.numero_de_caso, input.basePlan.dealPlan.caseNumber)
  assert.equal(props.pipeline, "default")
  assert.equal(props.dealstage, "appointmentscheduled")
  assert.equal(props.area_juridica, "Previdenciário (INSS)")
  assert.equal(props.temperatura_lead, "Quente")
  assert.equal(props.hs_priority, "high")
  assert.ok(props.dealname)
})

test("dealname é compatível com diferentes áreas dos três pilotos", () => {
  const areas = [
    { input: "Previdenciário (INSS)", expected: "Prv" },
    { input: "Trabalhista", expected: "Trb" },
    { input: "Consumidor", expected: "Cns" }
  ]
  for (const { input: area, expected } of areas) {
    const plan = { ...fixture().basePlan, dealPlan: { ...fixture().basePlan.dealPlan, properties: { ...fixture().basePlan.dealPlan.properties, area_juridica: area } } }
    const result = generateSingleCaseApplyPlan({ ...fixture(), basePlan: plan })
    assert.ok(result.plan.dealPlan.properties.dealname.startsWith(`🟢 ${expected}-`))
  }
})

test("area_juridica ausente bloqueia a geração do plano", () => {
  const input = fixture()
  delete input.basePlan.dealPlan.properties.area_juridica
  assert.throws(() => generateSingleCaseApplyPlan(input), /DEAL_AREA_JURIDICA_MISSING/)
})

test("area_juridica vazia bloqueia a geração do plano", () => {
  const input = fixture()
  input.basePlan.dealPlan.properties.area_juridica = "   "
  assert.throws(() => generateSingleCaseApplyPlan(input), /DEAL_AREA_JURIDICA_MISSING/)
})
