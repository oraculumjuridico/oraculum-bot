"use strict"

const fs = require("node:fs/promises")
const path = require("node:path")
const crypto = require("node:crypto")

const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{2,127}$/
const CASE_NUMBER = /^[A-Z]{2,4}\.[0-9]{6}\.[0-9]{3}$/
const FINGERPRINT = /^[a-f0-9]{12}$/
const fail = code => { throw new Error(code) }
const fingerprint = value => crypto.createHash("sha256").update(value).digest("hex").slice(0, 12)

function createSingleCasePlanLoader({ root, expectedFingerprint, expectedCaseNumber, io = fs } = {}) {
  if (typeof root !== "string" || !root.trim()) fail("PLAN_ROOT_MISSING")
  if (expectedFingerprint !== undefined && !FINGERPRINT.test(expectedFingerprint)) fail("PLAN_FINGERPRINT_CONFIGURATION_INVALID")
  if (expectedCaseNumber !== undefined && !CASE_NUMBER.test(expectedCaseNumber)) fail("PLAN_CASE_NUMBER_CONFIGURATION_INVALID")
  const resolvedRoot = path.resolve(root)
  return Object.freeze({ async loadByCaseImportId(caseImportId) {
    if (!ID.test(caseImportId || "") || caseImportId.includes("..") || /[\\/]/.test(caseImportId)) fail("PLAN_CASE_IMPORT_ID_INVALID")
    let entries
    try { entries = await io.readdir(resolvedRoot, { withFileTypes: true }) } catch { fail("PLAN_ROOT_UNAVAILABLE") }
    const matches = []
    for (const entry of entries) {
      if (!entry.isFile() || path.extname(entry.name).toLowerCase() !== ".json") continue
      const candidate = path.resolve(resolvedRoot, entry.name)
      if (!candidate.startsWith(`${resolvedRoot}${path.sep}`)) fail("PLAN_PATH_OUTSIDE_ROOT")
      let plan
      try { plan = JSON.parse(await io.readFile(candidate, "utf8")) } catch { fail("PLAN_JSON_INVALID") }
      if (plan?.caseImportId === caseImportId) matches.push(plan)
    }
    if (matches.length === 0) fail("PLAN_NOT_FOUND")
    if (matches.length !== 1) fail("PLAN_AMBIGUOUS")
    const plan = matches[0], actualFingerprint = fingerprint(caseImportId), caseNumber = plan.dealPlan?.caseNumber
    if (expectedFingerprint !== undefined && actualFingerprint !== expectedFingerprint) fail("PLAN_FINGERPRINT_MISMATCH")
    if (expectedCaseNumber !== undefined && caseNumber !== expectedCaseNumber) fail("PLAN_CASE_NUMBER_MISMATCH")
    if (!CASE_NUMBER.test(caseNumber || "")) fail("PLAN_CASE_NUMBER_INVALID")
    if (plan.safeToApply !== false) fail("PLAN_SAFE_TO_APPLY_INVALID")
    return structuredClone(plan)
  } })
}

module.exports = { createSingleCasePlanLoader }
