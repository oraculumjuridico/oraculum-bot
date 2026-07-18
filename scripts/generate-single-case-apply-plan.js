#!/usr/bin/env node
"use strict"

const fs = require("node:fs/promises")
const path = require("node:path")
const crypto = require("node:crypto")
const { generateSingleCaseApplyPlan } = require("../src/domain/single-case-plan-generator")
const { caseFingerprintFor } = require("../src/domain/single-case-target")

const sha256 = value => crypto.createHash("sha256").update(value).digest("hex")
const fail = code => { throw new Error(code) }

function parseArgs(argv) {
  const result = {}
  for (let index = 0; index < argv.length; index++) {
    const match = argv[index].match(/^--([a-z0-9-]+)=(.*)$/)
    if (match) result[match[1]] = match[2]
    else if (argv[index] === "--preserve-temporaries") result["preserve-temporaries"] = true
    else if (/^--[a-z0-9-]+$/.test(argv[index])) result[argv[index].slice(2)] = argv[++index]
    else fail("INVALID_ARGUMENT")
  }

  // Comparison mode: optional --comparison-output-dir for read-only audit
  const comparisonMode = !!result["comparison-output-dir"]

  if (comparisonMode) {
    for (const key of ["identity", "base-plan", "content-root", "comparison-output-dir", "expected-plan-sha256"]) if (!result[key]) fail("ARGUMENT_MISSING")
    if (!/^[a-f0-9]{64}$/.test(result["expected-plan-sha256"])) fail("EXPECTED_PLAN_HASH_INVALID")
    result._comparisonMode = true
    result._preserveTemporaries = !!result["preserve-temporaries"]
  } else {
    for (const key of ["identity", "base-plan", "content-root", "output-plan", "output-manifest", "expected-plan-sha256"]) if (!result[key]) fail("ARGUMENT_MISSING")
    if (!/^[a-f0-9]{64}$/.test(result["expected-plan-sha256"])) fail("EXPECTED_PLAN_HASH_INVALID")
    result._comparisonMode = false
  }

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
  const fingerprint = caseFingerprintFor(caseImportId)
  const contentFiles = await buildContentFiles(identityConfirmed, args["content-root"])
  const driveRules = {
    areaName: areaNameFor(basePlan.dealPlan?.properties?.area_juridica),
    caseName: `${caseNumber} - ${basePlan.contactPlan?.properties?.firstname || ""}`
  }
  const generated = generateSingleCaseApplyPlan({ identityConfirmed, basePlan, caseNumber, caseImportId, fingerprint, driveRules, contentFiles })

  if (args._comparisonMode) {
    // ═══ COMPARISON MODE: READ-ONLY AUDIT ═══
    const comparisonDir = path.resolve(args["comparison-output-dir"])
    const workspaceRoot = path.resolve(process.cwd())

    // Security: reject official directories
    const officialPlansDir = path.resolve("data/case-import/plans")
    const officialManifestsDir = path.resolve("data/case-import/content-manifests")
    if (comparisonDir === officialPlansDir || comparisonDir === officialManifestsDir || comparisonDir.startsWith(`${officialPlansDir}${path.sep}`) || comparisonDir.startsWith(`${officialManifestsDir}${path.sep}`)) {
      fail("COMPARISON_DIR_OFFICIAL_REJECTED")
    }

    // Security: reject paths inside workspace (prevents accidental versioning)
    if (comparisonDir === workspaceRoot || comparisonDir.startsWith(`${workspaceRoot}${path.sep}`)) {
      fail("COMPARISON_DIR_INSIDE_WORKSPACE_REJECTED")
    }

    // Create temporary output
    await fs.mkdir(comparisonDir, { recursive: true })
    const comparisonPlan = path.join(comparisonDir, `plan-${caseImportId}.json`)
    const comparisonManifest = path.join(comparisonDir, `manifest-${caseImportId}.json`)
    const planBytes = Buffer.from(JSON.stringify(generated.plan, null, 2) + "\n")
    const manifestBytes = Buffer.from(JSON.stringify(generated.manifest, null, 2) + "\n")
    await fs.writeFile(comparisonPlan, planBytes)
    await fs.writeFile(comparisonManifest, manifestBytes)

    // Calculate hashes
    const { authorizablePlanHash, reservationEvidenceHash } = require("../src/domain/single-case-apply-contracts")
    const planHash = sha256(planBytes)
    const manifestHash = sha256(manifestBytes)
    const authHash = authorizablePlanHash(generated.plan)

    // Calculate reservationEvidenceHash (requires PostgreSQL read-only access)
    // FAIL-CLOSED: comparison mode requires valid reservation evidence
    const postgresMode = String(process.env.CASE_NUMBER_RESERVATION_MODE || "").toLowerCase()
    if (postgresMode !== "postgres") fail("POSTGRES_MODE_REQUIRED")

    const connectionString = process.env.EXTERNAL_STATE_DATABASE_URL
    if (!connectionString) fail("POSTGRES_CONNECTION_REQUIRED")

    const { Pool } = require("pg")
    const pool = new Pool({ connectionString, max: 1, connectionTimeoutMillis: 10000, ssl: { rejectUnauthorized: false } })
    let client
    let resEvidenceHash
    try {
      client = await pool.connect()
      await client.query("BEGIN")
      await client.query("SET TRANSACTION READ ONLY")

      const reservationKey = `case-import:${caseImportId}`
      const expectedNumber = generated.plan.dealPlan.caseNumber
      const expectedFingerprint = fingerprint

      const res = await client.query(
        `SELECT reservation_key, case_number, status FROM case_number_reservations WHERE reservation_key = $1`,
        [reservationKey]
      )

      if (res.rowCount === 0) fail("RESERVATION_NOT_FOUND")
      if (res.rowCount > 1) fail("RESERVATION_AMBIGUOUS")

      const row = res.rows[0]
      if (row.reservation_key !== reservationKey) fail("RESERVATION_KEY_MISMATCH")
      if (row.case_number !== expectedNumber) fail("RESERVATION_NUMBER_MISMATCH")
      if (row.status !== "reserved") fail("RESERVATION_STATUS_INVALID")

      const reservationEvidence = {
        evidenceId: reservationKey,
        caseImportId,
        caseNumber: expectedNumber,
        verified: true
      }
      resEvidenceHash = reservationEvidenceHash(reservationEvidence)

      if (!resEvidenceHash || !/^[a-f0-9]{64}$/.test(resEvidenceHash)) fail("RESERVATION_EVIDENCE_HASH_INVALID")

      await client.query("ROLLBACK")
    } catch (err) {
      if (client) await client.query("ROLLBACK").catch(() => {})
      if (client && typeof client.release === "function") client.release()
      await pool.end().catch(() => {})
      // Re-throw with sanitized error if it's one of our codes
      const knownCodes = ["POSTGRES_MODE_REQUIRED", "POSTGRES_CONNECTION_REQUIRED", "RESERVATION_NOT_FOUND", "RESERVATION_AMBIGUOUS", "RESERVATION_KEY_MISMATCH", "RESERVATION_NUMBER_MISMATCH", "RESERVATION_STATUS_INVALID", "RESERVATION_EVIDENCE_HASH_INVALID"]
      if (knownCodes.includes(err.message)) throw err
      fail("RESERVATION_VERIFICATION_FAILED")
    } finally {
      if (client && typeof client.release === "function") client.release()
      await pool.end().catch(() => {})
    }

    // Load official artifacts for comparison
    const officialPlan = await readJson(path.join(officialPlansDir, `${caseImportId}.json`)).catch(() => null)
    const officialManifest = await readJson(path.join(officialManifestsDir, `${caseImportId}.json`)).catch(() => null)

    let officialHashes = null
    if (officialPlan && officialManifest) {
      const officialPlanBytes = Buffer.from(JSON.stringify(officialPlan, null, 2) + "\n")
      const officialManifestBytes = Buffer.from(JSON.stringify(officialManifest, null, 2) + "\n")

      // Note: official plan does NOT store reservationEvidenceHash
      // It only stores reservationKeyFingerprint and sync metadata
      officialHashes = {
        planHash: sha256(officialPlanBytes),
        manifestHash: sha256(officialManifestBytes),
        authorizablePlanHash: authorizablePlanHash(officialPlan)
      }
    }

    // Verify reservation binding against official plan
    const reservationBinding = officialPlan ? {
      caseImportIdMatch: officialPlan.caseImportId === caseImportId,
      caseFingerprintMatch: officialPlan.caseFingerprint === fingerprint,
      caseNumberMatch: officialPlan.dealPlan?.caseNumber === caseNumber,
      reservationSourceMatch: officialPlan.caseNumberReservationSync?.source === "OFFICIAL_POSTGRES_RESERVATION",
      reservationStatusMatch: officialPlan.caseNumberReservationSync?.status === "SYNCHRONIZED"
    } : null

    const report = {
      comparisonMode: true,
      readOnly: true,
      comparisonDir,
      caseImportId,
      caseNumber,
      fingerprint,
      generated: {
        planPath: comparisonPlan,
        manifestPath: comparisonManifest,
        planHash,
        manifestHash,
        authorizablePlanHash: authHash,
        reservationEvidenceHash: resEvidenceHash
      },
      official: officialHashes,
      match: officialHashes ? {
        planHash: planHash === officialHashes.planHash,
        manifestHash: manifestHash === officialHashes.manifestHash,
        authorizablePlanHash: authHash === officialHashes.authorizablePlanHash
      } : null,
      reservationBinding,
      fingerprintMatch: generated.plan.caseFingerprint === fingerprint,
      caseNumberMatch: generated.plan.dealPlan.caseNumber === caseNumber,
      documentContentsCount: generated.plan.documentPlan.contents.length,
      eligibleContentCount: generated.plan.documentPlan.contents.filter(item => item.eligible).length,
      manifestEntryCount: generated.manifest.length,
      limitation: "Official plan does not store reservationEvidenceHash. Only current reservation hash is provided."
    }

    // Cleanup temporaries unless --preserve-temporaries was specified
    if (!args._preserveTemporaries) {
      await fs.unlink(comparisonPlan).catch(() => {})
      await fs.unlink(comparisonManifest).catch(() => {})
      await fs.rmdir(comparisonDir).catch(() => {})  // only removes if empty
    }

    output(JSON.stringify(report, null, 2))
    return report
  }

  // ═══ NORMAL MODE: REGENERATION WITH WRITE ═══
  const outputPlan = path.resolve(args["output-plan"]), outputManifest = path.resolve(args["output-manifest"])
  if (outputPlan !== basePlanPath) fail("OUTPUT_PLAN_MUST_MATCH_BASE")
  const priorManifest = await fs.readFile(outputManifest, "utf8").catch(() => null)
  if (priorManifest !== null && priorManifest !== `${JSON.stringify(generated.manifest, null, 2)}\n`) fail("OUTPUT_MANIFEST_DIVERGENT")
  await atomicWrite(outputManifest, generated.manifest)
  await atomicWrite(outputPlan, generated.plan)
  const report = { planRegenerated: true, manifestGenerated: true, fingerprintMatch: generated.plan.caseFingerprint === fingerprint, caseNumberMatch: generated.plan.dealPlan.caseNumber === caseNumber, drivePlanPresent: !!generated.plan.drivePlan, documentContentsCount: generated.plan.documentPlan.contents.length, documentOccurrencesCount: generated.plan.documentPlan.occurrences.length, eligibleContentCount: generated.plan.documentPlan.contents.filter(item => item.eligible).length, manifestEntryCount: generated.manifest.length, futureUploadCount: generated.plan.driveEligibleUniqueContents, safeToApply: generated.plan.safeToApply, blockingCodes: generated.plan.pendingDependencies }
  output(JSON.stringify(report))
  return report
}

if (require.main === module) main().catch(error => { console.error(JSON.stringify({ ok: false, code: error.message })); process.exitCode = 1 })
module.exports = { main, parseArgs, buildContentFiles, areaNameFor, atomicWrite }
