const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const crypto = require("node:crypto")
const source = fs.readFileSync(require("node:path").join(__dirname, "..", "scripts", "import-real-cases.js"), "utf8")
const {
  extractVerified,
  caseImportIdForRelativeFolder,
  isExistingInternalPvrCaseNumber,
  getBlockingReviewReasons,
  selectSingleCaseImportRecord,
  resolveCaseNumberForApply
} = require("../scripts/import-real-cases")

assert.match(source, /confirm-live-import/)
assert.match(source, /IMPORT_AUTOMATIONS_CONFIRMED_DISABLED/)
assert.match(source, /cpf_do_cliente.*phone.*email/s)
assert.match(source, /numero_de_caso/)
assert.match(source, /checkpoint\.json/)
assert.match(source, /timeout: 15000/)
assert.match(source, /allow-readonly-hubspot/)
assert.match(source, /pilotCandidates/)
assert.match(source, /area_juridica:\s*"Previdenciário \(INSS\)"/)
assert.doesNotMatch(source, /PrevidenciÃ|PrevidenciÃƒ/)
assert.match(source, /offlineByDefault.*command === "audit".*command === "review".*command === "dry-run"/)
assert.doesNotMatch(source, /console\.log\([^\n]*(cpf|phone|email|name)/i)

// Existing internal PVR numbers are official numbers, never candidates for reservation.
assert.deepEqual(extractVerified("PVR.260801.813").officialNumbers, ["PVR.260801.813"])
assert.deepEqual(extractVerified("PVR.260801.81").officialNumbers, [])
assert.deepEqual(extractVerified("XPVR.260801.813").officialNumbers, [])
assert.equal(isExistingInternalPvrCaseNumber("PVR.260801.813"), true)
assert.equal(isExistingInternalPvrCaseNumber("PVR.260801.81"), false)
assert.equal(getBlockingReviewReasons(["pvr_existing_resource_preflight_required"]).includes("pvr_existing_resource_preflight_required"), true)
assert.deepEqual(extractVerified("0000000-00.0000.0.00.0000").officialNumbers, ["0000000-00.0000.0.00.0000"])
assert.deepEqual(extractVerified("sem numero oficial").officialNumbers, [])
assert.deepEqual(extractVerified("PVR.260801.813\n0000000-00.0000.0.00.0000").officialNumbers, ["0000000-00.0000.0.00.0000", "PVR.260801.813"])

const relativeFolder = "1 - INSS\\Jesaías Belmiro Leite Mendes"
const expectedImportId = `inss-${crypto.createHash("sha256").update(relativeFolder.toLowerCase()).digest("hex").slice(0, 20)}`
assert.equal(caseImportIdForRelativeFolder(relativeFolder), expectedImportId)
assert.equal(caseImportIdForRelativeFolder(relativeFolder), caseImportIdForRelativeFolder(relativeFolder))

const pvrDecision = resolveCaseNumberForApply({ officialNumber: "PVR.260801.813" })
assert.deepEqual(pvrDecision, { caseNumber: "PVR.260801.813", source: "official_number", requiresReservation: false })
assert.deepEqual(resolveCaseNumberForApply({}, { caseNumber: "PRV.260801.123" }), { caseNumber: "PRV.260801.123", source: "checkpoint", requiresReservation: false })
assert.deepEqual(resolveCaseNumberForApply({}, undefined), { caseNumber: null, source: "none", requiresReservation: true })

const records = [{ importId: "inss-target" }, { importId: "inss-other" }]
assert.deepEqual(selectSingleCaseImportRecord(records, "inss-target"), records[0])
assert.throws(() => selectSingleCaseImportRecord(records, "inss-missing"), /CASE_IMPORT_ID_NOT_FOUND/)
assert.throws(() => selectSingleCaseImportRecord([{ importId: "inss-target" }, { importId: "inss-target" }], "inss-target"), /CASE_IMPORT_ID_AMBIGUOUS/)

// Pilot selection function validations
assert.match(source, /applyPilotSelection/)
assert.match(source, /pilot_selection_must_have_exactly_3_entries/)
assert.match(source, /pilot_selection_contains_duplicate_importIds/)
assert.match(source, /pilot_selection_mismatch/)

// Canonical report structure validations
assert.match(source, /buildCanonicalDryRunReport/)
assert.match(source, /phoneSource/)
assert.match(source, /_pilotMeta/)
assert.match(source, /pilot_manifest/)

// Numero de caso states must be distinct (no duplicate return)
const processStateMatch = source.match(/const processState = [\s\S]*?^\s{4}\}/m)
assert(processStateMatch, "processState should be defined with clear if/else chain")

// Verify numero_de_caso logic doesn't have duplicate returns
const processStateBody = processStateMatch[0]
const hasNaoAnalisado = processStateBody.includes('<NÃO ANALISADO>')
const hasBloqueado = processStateBody.includes('<BLOQUEADO>')
const hasPresente = processStateBody.includes('<PRESENTE>')
const seraBloqueadoCount = (processStateBody.match(/SERÁ GERADO NO APPLY/g) || []).length
assert(hasNaoAnalisado && hasBloqueado && hasPresente && seraBloqueadoCount === 1, "numero_de_caso must have all 4 distinct states without duplication")

// Check phone handling includes source tracking
assert.match(source, /phoneSource\s*=\s*['"]pilot_manifest['"]/)
assert.match(source, /phoneSource\s*=\s*['"]hubspot['"]/)
assert.match(source, /phoneSource\s*=\s*['"]inventory['"]/)
assert.match(source, /phoneSource\s*=\s*['"]not_found['"]/)

// Verify canonical report is returned from generateDryRunReport
assert.match(source, /function generateDryRunReport.*return canonical/s)

// Verify pilot selection metadata is merged into records
assert.match(source, /record\._pilotMeta/)

console.log("import-real-cases.test.js: ok")
