"use strict"

const test = require("node:test")
const assert = require("node:assert/strict")
const fs = require("node:fs/promises")
const os = require("node:os")
const path = require("node:path")
const crypto = require("node:crypto")
const { main, parseArgs, areaNameFor } = require("../scripts/generate-single-case-apply-plan")

const sha256 = value => crypto.createHash("sha256").update(value).digest("hex")

async function harness() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "single-case-plan-")), contentRoot = path.join(root, "content")
  await fs.mkdir(contentRoot)
  const contents = [], physicalOccurrences = []
  for (let index = 0; index < 12; index++) {
    const bytes = Buffer.from(`sanitized-${index}`), hash = sha256(bytes), contentDocumentId = `C-${hash.slice(0, 20)}`, file = path.join(contentRoot, `file-${index}.pdf`)
    await fs.writeFile(file, bytes)
    contents.push({ contentDocumentId, sha256: hash, analysisStatus: index === 4 ? "IGNORED" : "ANALYZED", quarantined: false })
    physicalOccurrences.push({ physicalDocumentId: `P-${index + 1}`, contentDocumentId, sha256: hash, localReference: file })
  }
  for (const [suffix, sourceIndex] of [[13, 2], [14, 6]]) {
    const source = physicalOccurrences[sourceIndex], copy = path.join(contentRoot, `copy-${suffix}.pdf`)
    await fs.copyFile(source.localReference, copy)
    physicalOccurrences.push({ ...source, physicalDocumentId: `P-${suffix}`, localReference: copy })
  }
  const caseImportId = "case-script-sanitized", caseNumber = "PRV.260714.707"
  const identity = { schemaVersion: 1, caseImportId, identityConfirmationApplied: true, safeToPlanHubSpot: true, reviewedInventory: { contents, physicalOccurrences } }
  const plan = { schemaVersion: 1, caseImportId, safeToPlanHubSpot: true, safeToApply: false, contactPlan: { properties: { firstname: "Cliente Ficticio", cpf_do_cliente: "fixture", phone: "fixture" } }, dealPlan: { caseNumber, properties: { numero_de_caso: caseNumber, area_juridica: "Previdenciário (INSS)", pipeline: "fixture", dealstage: "fixture" } }, documentPlan: { physicalOccurrences: 14, uniqueContents: 12, ignoredNonDocumentContents: 1, binaryDuplicateOccurrences: 2 }, caseNumberReservationSync: { source: "OFFICIAL_POSTGRES_RESERVATION" } }
  const identityPath = path.join(root, "identity.json"), planPath = path.join(root, "plan.json"), manifestPath = path.join(root, "manifest.json")
  await fs.writeFile(identityPath, JSON.stringify(identity)); const planBytes = Buffer.from(JSON.stringify(plan)); await fs.writeFile(planPath, planBytes)
  const argv = ["--identity", identityPath, "--base-plan", planPath, "--content-root", contentRoot, "--output-plan", planPath, "--output-manifest", manifestPath, "--expected-plan-sha256", sha256(planBytes)]
  return { root, planPath, manifestPath, argv }
}

test("script gera somente artefatos locais sanitizados", async t => {
  const h = await harness(); t.after(() => fs.rm(h.root, { recursive: true, force: true }))
  const output = [], report = await main({ argv: h.argv, output: value => output.push(value) })
  const plan = JSON.parse(await fs.readFile(h.planPath)), manifest = JSON.parse(await fs.readFile(h.manifestPath))
  assert.equal(report.planRegenerated, true)
  assert.equal(plan.documentPlan.contents.length, 12)
  assert.equal(plan.documentPlan.occurrences.length, 14)
  assert.equal(manifest.length, 11)
  assert.ok(manifest.every(item => !path.isAbsolute(item.relativePath)))
  assert.equal(output.length, 1)
})

test("script recusa plano-base divergente", async t => {
  const h = await harness(); t.after(() => fs.rm(h.root, { recursive: true, force: true }))
  h.argv[h.argv.length - 1] = "0".repeat(64)
  await assert.rejects(() => main({ argv: h.argv, output() {} }), /BASE_PLAN_DIVERGENT/)
})

test("parser exige argumentos explícitos e regra de área é canônica", () => {
  assert.throws(() => parseArgs([]), /ARGUMENT_MISSING/)
  assert.equal(areaNameFor("Previdenciário (INSS)"), "Previdenciário")
  assert.equal(areaNameFor("Trabalhista"), "Trabalhista")
})
