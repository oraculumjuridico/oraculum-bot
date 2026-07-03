const crypto = require("node:crypto")
const fs = require("node:fs")
const path = require("node:path")
const {
  enforceConsultationChangeControl
} = require("./consultation-change-control")

const DEFAULT_ROOT = path.join(__dirname, "..", "..", "..")
const DEFAULT_MANIFEST = path.join(__dirname, "consultation-manifest.json")

function fileChecksum(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex")
}

function loadConsultationManifest(manifestPath = DEFAULT_MANIFEST) {
  return JSON.parse(fs.readFileSync(manifestPath, "utf8"))
}

function assertPathInsideRoot(root, relativeFile) {
  const absolute = path.resolve(root, relativeFile)
  const normalizedRoot = `${path.resolve(root)}${path.sep}`
  if (!absolute.startsWith(normalizedRoot)) {
    const error = new Error(`arquivo fora da raiz no consultation manifest: ${relativeFile}`)
    error.code = "CONSULTATION_MANIFEST_PATH_ESCAPE"
    throw error
  }
  return absolute
}

function checkConsultationIntegrity({
  root = DEFAULT_ROOT,
  manifestPath = DEFAULT_MANIFEST,
  manifest = null
} = {}) {
  const currentManifest = manifest || loadConsultationManifest(manifestPath)
  enforceConsultationChangeControl(currentManifest)
  const violations = []

  for (const relativeFile of currentManifest.allowedFiles) {
    const absolute = assertPathInsideRoot(root, relativeFile)
    if (!fs.existsSync(absolute)) {
      violations.push({ file: relativeFile, reason: "missing" })
      continue
    }
    const actual = fileChecksum(absolute)
    const expected = currentManifest.checksums[relativeFile]
    if (actual !== expected) violations.push({ file: relativeFile, reason: "checksum", expected, actual })
  }

  if (violations.length) {
    const error = new Error(`integridade do dominio de consulta violada em ${violations.length} arquivo(s)`)
    error.code = "CONSULTATION_INTEGRITY_VIOLATION"
    error.violations = violations
    throw error
  }
  return {
    status: "ok",
    domainVersion: currentManifest.domainVersion,
    consultationVersion: currentManifest.consultationVersion,
    filesChecked: currentManifest.allowedFiles.length
  }
}

module.exports = {
  DEFAULT_ROOT,
  DEFAULT_MANIFEST,
  fileChecksum,
  loadConsultationManifest,
  assertPathInsideRoot,
  checkConsultationIntegrity
}
