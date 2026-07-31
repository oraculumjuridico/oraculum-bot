const assert = require("node:assert/strict")
const { reconcileCaseState } = require("../src/domain/case-reconciler")

const report = reconcileCaseState({
  local: [{ sha256: "local-only" }, { sha256: "ok" }],
  drive: [{ sha256: "ok" }, { sha256: "duplicate" }, { sha256: "duplicate" }, { sha256: "quarantine", status: "quarantined" }],
  hubspot: [{ sha256: "ok" }, { sha256: "hubspot-only" }],
  driveFolders: [{ id: "one" }, { id: "two" }],
  consolidation: { complete: false }
})
assert.equal(report.mode, "readonly")
for (const code of [
  "LOCAL_NOT_UPLOADED",
  "DRIVE_NOT_REGISTERED_HUBSPOT",
  "DUPLICATE_DRIVE_FILE",
  "HUBSPOT_DOCUMENT_MISSING_DRIVE",
  "QUARANTINED_DOCUMENT",
  "CONSOLIDATION_INCOMPLETE",
  "DUPLICATE_CASE_FOLDER"
]) assert.equal(report.findings.some(item => item.code === code), true, code)
assert.throws(() => reconcileCaseState({}, { apply: true }), /applyFixes/)
console.log("case-reconciler.test.js: ok")
