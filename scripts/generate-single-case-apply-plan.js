#!/usr/bin/env node
"use strict"

const fs = require("node:fs/promises")
const path = require("node:path")
const crypto = require("node:crypto")
const { generateSingleCaseApplyPlan } = require("../src/domain/single-case-plan-generator")

const sha256 = value => crypto.createHash("sha256").update(value).digest("hex")
const fail = code => { throw new Error(code) }

function parseArgs(argv) {
  const result = {}
  for (let index = 0; index < argv.length; index++) {
    const match = argv[index].match(/^--([a-z0-9-]+)=(.*)$/)
    if (match) result[match[1]] = match[2]
    else if (/^--[a-z0-9-]+$/.test(argv[index])) result[argv[index].slice(2)] = argv[++index]
    else fail("INVALID_ARGUMENT")
  }
  for (const key of ["identity", "base-plan", "content-root", "output-plan", "output-manifest", "expected-plan-sha256"]) if (!result[key]) fail("ARGUMENT_MISSING")
  if (!/^[a-f0-9]{64}$/.test(result["expected-plan-sha256"])) fail("EXPECTED_PLAN_HASH_INVALID")
  return result
}

async function readJson(file) {
  try { return JSON.parse(await fs.readFile(path.resolve(file), "utf8")) } catch { fail("INPUT_JSON_INVALID") }
}

async function atomicWrite(file, value) {
  const target = path.resolve(file), temporary = `${target}.${process.pid}.tmp`
  await fs.mkdir(path.dirname(target), { recursive: true })
  await fs.writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", mode: 0o600, flag: "wx" })
  try { await fs.rename(temporary, target) } catch (error) { await fs.unlink(temporary).catch(() => {}); throw error }
}

function areaNameFor(value) {
  const normalized = String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
  if (normalized.includes("inss") || normalized.includes("previd")) return "Previdenciário"
  if (normalized.includes("trabalh")) return "Trabalhista"
  if (normalized.includes("consult")) return "Consulta Jurídica"
  if (normalized.includes("revis")) return "Revisão de documentos"
  return "Outros"
}

async function buildContentFiles(identityConfirmed, contentRoot) {
  const configuredRoot = await fs.realpath(path.resolve(contentRoot)).catch(() => fail("CONTENT_ROOT_INVALID"))
  const result = {}
  for (const occurrence of identityConfirmed?.reviewedInventory?.physicalOccurrences || []) {
    if (typeof occurrence.localReference !== "string") fail("CONTENT_REFERENCE_INVALID")
    const candidate = await fs.realpath(path.resolve(occurrence.localReference)).catch(() => fail("CONTENT_REFERENCE_INVALID"))
    if (candidate !== configuredRoot && !candidate.startsWith(`${configuredRoot}${path.sep}`)) fail("CONTENT_REFERENCE_OUTSIDE_ROOT")
    const bytes = await fs.readFile(candidate).catch(() => fail("CONTENT_REFERENCE_INVALID"))
    const relativePath = path.relative(configuredRoot, candidate)
    if (!relativePath || path.isAbsolute(relativePath) || relativePath.split(path.sep).includes("..")) fail("CONTENT_REFERENCE_OUTSIDE_ROOT")
    result[occurrence.physicalDocumentId] = { relativePath, sha256: sha256(bytes), size: bytes.length }
  }
  return result
}

async function main({ argv = process.argv.slice(2), output = console.log } = {}) {
  const args = parseArgs(argv)
  const identityConfirmed = await readJson(args.identity)
  const basePlanPath = path.resolve(args["base-plan"])
  const baseBytes = await fs.readFile(basePlanPath).catch(() => fail("BASE_PLAN_INVALID"))
  if (sha256(baseBytes) !== args["expected-plan-sha256"]) fail("BASE_PLAN_DIVERGENT")
  let basePlan
  try { basePlan = JSON.parse(baseBytes) } catch { fail("BASE_PLAN_INVALID") }
  const caseImportId = basePlan.caseImportId
  const caseNumber = basePlan.dealPlan?.caseNumber
  const fingerprint = sha256(caseImportId).slice(0, 12)
  const contentFiles = await buildContentFiles(identityConfirmed, args["content-root"])
  const driveRules = {
    areaName: areaNameFor(basePlan.dealPlan?.properties?.area_juridica),
    caseName: `${caseNumber} - ${basePlan.contactPlan?.properties?.firstname || ""}`
  }
  const generated = generateSingleCaseApplyPlan({ identityConfirmed, basePlan, caseNumber, caseImportId, fingerprint, driveRules, contentFiles })
  const outputPlan = path.resolve(args["output-plan"]), outputManifest = path.resolve(args["output-manifest"])
  if (outputPlan !== basePlanPath) fail("OUTPUT_PLAN_MUST_MATCH_BASE")
  const priorManifest = await fs.readFile(outputManifest, "utf8").catch(() => null)
  if (priorManifest !== null && priorManifest !== `${JSON.stringify(generated.manifest, null, 2)}\n`) fail("OUTPUT_MANIFEST_DIVERGENT")
  await atomicWrite(outputManifest, generated.manifest)
  await atomicWrite(outputPlan, generated.plan)
  const report = { planRegenerated: true, manifestGenerated: true, fingerprintMatch: generated.plan.caseFingerprint === fingerprint, caseNumberMatch: generated.plan.dealPlan.caseNumber === caseNumber, drivePlanPresent: !!generated.plan.drivePlan, documentContentsCount: generated.plan.documentPlan.contents.length, documentOccurrencesCount: generated.plan.documentPlan.occurrences.length, eligibleContentCount: generated.plan.documentPlan.contents.filter(item => item.eligible).length, manifestEntryCount: generated.manifest.length, futureUploadCount: generated.plan.documentPlan.driveEligibleUniqueContents, safeToApply: generated.plan.safeToApply, blockingCodes: generated.plan.pendingDependencies }
  output(JSON.stringify(report))
  return report
}

if (require.main === module) main().catch(error => { console.error(JSON.stringify({ ok: false, code: error.message })); process.exitCode = 1 })
module.exports = { main, parseArgs, buildContentFiles, areaNameFor, atomicWrite }
