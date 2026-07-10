const assert = require("node:assert/strict")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")
const {
  manifestStructuralDigest,
  enforceConsultationChangeControl
} = require("../src/domain/consultation/consultation-change-control")
const {
  loadConsultationManifest,
  checkConsultationIntegrity
} = require("../src/domain/consultation/consultation-integrity-check")
const consultation = require("../src/domain/consultation")

function main() {
  const productionManifest = loadConsultationManifest()
  assert.equal(enforceConsultationChangeControl(productionManifest), true)
  assert.equal(consultation.assertConsultationReleaseIntegrity().status, "ok")

  const changedWithoutApproval = structuredClone(productionManifest)
  changedWithoutApproval.domainVersion = "6.0.1"
  assert.throws(
    () => enforceConsultationChangeControl(changedWithoutApproval),
    error => error.code === "CONSULTATION_DOMAIN_VERSION_SEAL_MISMATCH"
  )

  const changedChecksum = structuredClone(productionManifest)
  changedChecksum.checksums[changedChecksum.allowedFiles[0]] = "0".repeat(64)
  assert.throws(
    () => enforceConsultationChangeControl(changedChecksum),
    error => error.code === "CONSULTATION_APPROVAL_DIGEST_MISMATCH"
  )

  const changedStructure = structuredClone(productionManifest)
  changedStructure.publicEntries.push("newStructuralEntry")
  changedStructure.approval.structuralDigest = manifestStructuralDigest(changedStructure)
  assert.throws(
    () => enforceConsultationChangeControl(changedStructure),
    error => error.code === "CONSULTATION_DOMAIN_VERSION_SEAL_MISMATCH"
  )

  const root = fs.mkdtempSync(path.join(os.tmpdir(), "consultation-immutable-"))
  for (const relativeFile of productionManifest.allowedFiles) {
    const destination = path.join(root, relativeFile)
    fs.mkdirSync(path.dirname(destination), { recursive: true })
    fs.copyFileSync(path.join(__dirname, "..", relativeFile), destination)
  }
  assert.equal(checkConsultationIntegrity({ root, manifest: productionManifest }).status, "ok")
  fs.appendFileSync(path.join(root, productionManifest.allowedFiles[0]), "\n// drift\n")
  assert.throws(
    () => checkConsultationIntegrity({ root, manifest: productionManifest }),
    error => error.code === "CONSULTATION_INTEGRITY_VIOLATION"
  )

  console.log("consultation-immutability.test.js: ok")
}

main()
