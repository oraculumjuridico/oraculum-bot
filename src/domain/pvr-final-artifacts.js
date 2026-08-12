"use strict"

const fs = require("node:fs/promises")
const path = require("node:path")
const { CASE_ID, caseFingerprintFor } = require("./single-case-target")
const { generateSingleCaseApplyPlan, documentPlanDeclarationFor } = require("./single-case-plan-generator")
const { buildContentFiles } = require("./single-case-content-manifest")

const PVR = /^PVR\.\d{6}\.\d{3}$/
const HUBSPOT_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{2,127}$/
const fail = code => { throw new Error(code) }
const json = value => `${JSON.stringify(value, null, 2)}\n`
const clone = value => structuredClone(value)

function validateSynchronizedPvrBasePlan(basePlan) {
  if (!basePlan || Object.getPrototypeOf(basePlan) !== Object.prototype || basePlan.source !== "single_case_import_bridge" || !CASE_ID.test(basePlan.caseImportId || "") || !PVR.test(basePlan.caseNumber || "") || basePlan.officialNumber !== basePlan.caseNumber || basePlan.caseFingerprint !== caseFingerprintFor(basePlan.caseImportId) || basePlan.safeToApply !== false) fail("PVR_BASE_PLAN_INVALID")
  if (basePlan.dealPlan?.caseNumber !== basePlan.caseNumber || basePlan.dealPlan?.properties?.numero_de_caso !== basePlan.caseNumber) fail("PVR_CASE_NUMBER_DIVERGENT")
  if (!HUBSPOT_ID.test(basePlan.contactPlan?.existingContactId || "") || !HUBSPOT_ID.test(basePlan.dealPlan?.existingDealId || "")) fail("PVR_EXISTING_RESOURCE_INVALID")
  if (basePlan.contactPlan?.reusePolicy !== "REQUIRE_EXISTING_UNIQUE" || basePlan.dealPlan?.reusePolicy !== "REQUIRE_EXISTING_UNIQUE" || basePlan.drivePlan?.reusePolicy !== "REQUIRE_EXISTING_LOGICAL_ID") fail("PVR_REUSE_POLICY_INVALID")
  const sync = basePlan.caseNumberReservationSync, key = `case-import:${basePlan.caseImportId}`
  if (!sync || sync.source !== "OFFICIAL_POSTGRES_RESERVATION" || sync.status !== "SYNCHRONIZED" || sync.reservationKey !== key || sync.caseNumber !== basePlan.caseNumber) fail("PVR_RESERVATION_SYNC_INVALID")
}

function driveRulesFor(basePlan) {
  const area = basePlan.dealPlan?.properties?.area_juridica
  const name = basePlan.contactPlan?.properties?.firstname || "Caso"
  if (typeof area !== "string" || !area.trim()) fail("DEAL_AREA_JURIDICA_MISSING")
  return { areaName: area.trim(), caseName: `${basePlan.caseNumber} - ${name}` }
}

async function createPvrFinalArtifacts({ basePlan, identityConfirmed, contentRoot, io = fs } = {}) {
  validateSynchronizedPvrBasePlan(basePlan)
  if (!identityConfirmed || identityConfirmed.caseImportId !== basePlan.caseImportId || identityConfirmed.identityConfirmationApplied !== true || identityConfirmed.safeToPlanHubSpot !== true) fail("IDENTITY_CONFIRMED_INVALID")
  const contentFiles = await buildContentFiles(identityConfirmed, contentRoot, { io })
  const generationBase = clone(basePlan)
  generationBase.documentPlan = documentPlanDeclarationFor(identityConfirmed.reviewedInventory)
  const generated = generateSingleCaseApplyPlan({
    identityConfirmed,
    basePlan: generationBase,
    caseNumber: basePlan.caseNumber,
    caseImportId: basePlan.caseImportId,
    fingerprint: basePlan.caseFingerprint,
    driveRules: driveRulesFor(basePlan),
    contentFiles
  })
  const plan = generated.plan
  plan.status = "PLANNED_NOT_EXECUTED"
  plan.externalActionsExecuted = false
  plan.importExecuted = false
  plan.safeToApply = false
  plan.pendingDependencies = ["FINAL_EXTERNAL_RESOURCES_PREFLIGHT_REQUIRED", "SIGNED_AUTHORIZATIONS_REQUIRED", "FINAL_PREFLIGHT_REQUIRED"]
  // The executor consumes an array; caseImportId is repeated on each entry so
  // the stored manifest remains directly attributable without changing it.
  const manifest = generated.manifest.map(entry => ({ ...entry, caseImportId: basePlan.caseImportId }))
  return { plan, manifest }
}

function artifactPaths({ root, caseImportId }) {
  if (typeof root !== "string" || !root.trim() || !CASE_ID.test(caseImportId || "")) fail("PVR_ARTIFACT_PATH_INVALID")
  const base = path.resolve(root)
  return { plan: path.join(base, "plans", `${caseImportId}.json`), manifest: path.join(base, "content-manifests", `${caseImportId}.json`) }
}

async function readIfPresent(file, io) {
  try { return await io.readFile(file, "utf8") } catch (error) { if (error?.code === "ENOENT") return null; throw error }
}

async function writePvrFinalArtifacts({ root, caseImportId, plan, manifest, io = fs } = {}) {
  const paths = artifactPaths({ root, caseImportId }), expectedPlan = json(plan), expectedManifest = json(manifest)
  const [priorPlan, priorManifest] = await Promise.all([readIfPresent(paths.plan, io), readIfPresent(paths.manifest, io)])
  if ((priorPlan === null) !== (priorManifest === null)) fail("PVR_ARTIFACT_PAIR_INCOMPLETE")
  if (priorPlan !== null) {
    if (priorPlan !== expectedPlan || priorManifest !== expectedManifest) fail("PVR_ARTIFACT_DIVERGENT")
    return { ...paths, written: false, reused: true }
  }
  await Promise.all([io.mkdir(path.dirname(paths.plan), { recursive: true }), io.mkdir(path.dirname(paths.manifest), { recursive: true })])
  const nonce = `${process.pid}.${Date.now()}.${Math.random().toString(16).slice(2)}`
  const temporaryPlan = `${paths.plan}.${nonce}.tmp`, temporaryManifest = `${paths.manifest}.${nonce}.tmp`
  try {
    await Promise.all([io.writeFile(temporaryPlan, expectedPlan, { encoding: "utf8", mode: 0o600, flag: "wx" }), io.writeFile(temporaryManifest, expectedManifest, { encoding: "utf8", mode: 0o600, flag: "wx" })])
    await io.link(temporaryPlan, paths.plan)
    try { await io.link(temporaryManifest, paths.manifest) } catch (error) { await io.unlink(paths.plan).catch(() => {}); throw error }
  } catch (error) {
    if (error?.code === "EEXIST") fail("PVR_ARTIFACT_CONCURRENT_OR_DIVERGENT")
    throw error
  } finally {
    await Promise.all([io.unlink(temporaryPlan).catch(() => {}), io.unlink(temporaryManifest).catch(() => {})])
  }
  return { ...paths, written: true, reused: false }
}

module.exports = { createPvrFinalArtifacts, writePvrFinalArtifacts, validateSynchronizedPvrBasePlan }
