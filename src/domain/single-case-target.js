"use strict"

const crypto = require("node:crypto")
const fs = require("node:fs/promises")
const path = require("node:path")

const CASE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{2,127}$/
const FINGERPRINT = /^[a-f0-9]{12}$/
const CASE_NUMBER = /^[A-Z]{2,4}\.[0-9]{6}\.[0-9]{3}$/
const fail = code => { throw new Error(code) }

function caseFingerprintFor(caseImportId) {
  if (!CASE_ID.test(caseImportId || "") || caseImportId.includes("..") || /[\\/]/.test(caseImportId)) fail("CASE_IMPORT_ID_INVALID")
  return crypto.createHash("sha256").update(caseImportId).digest("hex").slice(0, 12)
}

function validateCaseFingerprint(caseImportId, storedFingerprint) {
  if (!FINGERPRINT.test(storedFingerprint || "") || storedFingerprint !== caseFingerprintFor(caseImportId)) fail("CASE_FINGERPRINT_DIVERGENT")
  return true
}

function validateP1PlanContract(plan, caseImportId) {
  if (!plan || Object.getPrototypeOf(plan) !== Object.prototype || plan.caseImportId !== caseImportId) fail("P1_CASE_BINDING_INVALID")
  validateCaseFingerprint(caseImportId, plan.caseFingerprint)
  const number = plan.dealPlan?.caseNumber
  if (!CASE_NUMBER.test(number || "") || plan.dealPlan?.properties?.numero_de_caso !== number || plan.caseNumberReservationSync?.source !== "OFFICIAL_POSTGRES_RESERVATION" || plan.caseNumberReservationSync?.status !== "SYNCHRONIZED" || plan.safeToApply !== false) fail("P1_PLAN_BINDING_INVALID")
  return Object.freeze({ caseImportId, caseFingerprint: plan.caseFingerprint, caseNumber: number })
}

async function resolveP1Target({ plansRoot, caseImportId, io = fs } = {}) {
  caseFingerprintFor(caseImportId)
  if (typeof plansRoot !== "string" || !plansRoot.trim()) fail("P1_PLANS_ROOT_MISSING")
  const root = path.resolve(plansRoot)
  let entries
  try { entries = await io.readdir(root, { withFileTypes: true }) } catch { fail("P1_PLANS_ROOT_UNAVAILABLE") }
  const matches = []
  for (const entry of entries) {
    if (!entry.isFile() || path.extname(entry.name).toLowerCase() !== ".json") continue
    const candidate = path.resolve(root, entry.name)
    if (!candidate.startsWith(`${root}${path.sep}`)) fail("P1_PLAN_PATH_INVALID")
    let bytes, plan
    try { bytes = await io.readFile(candidate); plan = JSON.parse(bytes) } catch { fail("P1_PLAN_CATALOG_INVALID") }
    if (plan?.caseImportId === caseImportId) matches.push({ bytes, plan, path: candidate })
  }
  if (matches.length === 0) fail("P1_PLAN_NOT_FOUND")
  if (matches.length !== 1) fail("P1_PLAN_AMBIGUOUS")
  const selected = matches[0]
  const binding = validateP1PlanContract(selected.plan, caseImportId)
  return Object.freeze({ plan: structuredClone(selected.plan), planBytes: Buffer.from(selected.bytes), planPath: selected.path, binding })
}

module.exports = { CASE_ID, FINGERPRINT, caseFingerprintFor, validateCaseFingerprint, validateP1PlanContract, resolveP1Target }
