const crypto = require("node:crypto")

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize)
  if (!value || typeof value !== "object") return value
  return Object.keys(value).sort().reduce((result, key) => {
    result[key] = canonicalize(value[key])
    return result
  }, {})
}

function manifestStructuralPayload(manifest) {
  const { approval, ...structural } = manifest || {}
  return structural
}

function manifestStructuralDigest(manifest) {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(canonicalize(manifestStructuralPayload(manifest))))
    .digest("hex")
}

function domainVersionPayload(manifest) {
  const {
    approval,
    checksums,
    domainVersionSeal,
    ...versionedStructure
  } = manifest || {}
  return versionedStructure
}

function domainVersionSeal(manifest) {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(canonicalize(domainVersionPayload(manifest))))
    .digest("hex")
}

const APPROVED_DOMAIN_VERSION_SEALS = Object.freeze({
  "6.0.0": "f6b3c09c4a498e2044cd98bfeee3cc41709e99c16eceece7e1881ad327907e2b",
  "7.0.0": "6bf9d0f64100d8d3d943983fe6ef70c0bf26bf0c01b3fd68403ce962bb255a1f",
  "8.0.0": "a830b13364bb9b1ddcc75ba70ae22094fd4363583faf2a1141b0a85bc34ee4db",
  "9.0.0": "ba1fd44bb05686d67f1162a13ca67371334a1e9766e6796f87dd2db127546253"
})

function assertDomainVersionSeal(manifest) {
  const actual = domainVersionSeal(manifest)
  const registered = APPROVED_DOMAIN_VERSION_SEALS[manifest.domainVersion]
  if (!registered || manifest.domainVersionSeal !== actual || registered !== actual) {
    const error = new Error("estrutura de consulta alterada sem incremento de domainVersion")
    error.code = "CONSULTATION_DOMAIN_VERSION_SEAL_MISMATCH"
    error.expected = registered
    error.actual = actual
    throw error
  }
  return true
}

function assertExplicitApproval(manifest) {
  const approval = manifest?.approval || {}
  if (
    approval.approved !== true ||
    !approval.approvedBy ||
    !approval.approvedAt ||
    !approval.changeId
  ) {
    const error = new Error("mudanca estrutural de consulta sem aprovacao explicita")
    error.code = "CONSULTATION_CHANGE_NOT_APPROVED"
    throw error
  }
  const digest = manifestStructuralDigest(manifest)
  if (approval.structuralDigest !== digest) {
    const error = new Error("manifest de consulta alterado apos aprovacao")
    error.code = "CONSULTATION_APPROVAL_DIGEST_MISMATCH"
    error.expected = approval.structuralDigest
    error.actual = digest
    throw error
  }
  return true
}

function assertManifestStructure(manifest) {
  if (!manifest || manifest.manifestVersion !== 1) {
    throw Object.assign(new Error("consultation manifestVersion invalido"), {
      code: "CONSULTATION_MANIFEST_VERSION_INVALID"
    })
  }
  if (!/^\d+\.\d+\.\d+$/.test(manifest.domainVersion || "")) {
    throw Object.assign(new Error("consultation domainVersion invalido"), {
      code: "CONSULTATION_DOMAIN_VERSION_INVALID"
    })
  }
  if (!Number.isInteger(manifest.consultationVersion)) {
    throw Object.assign(new Error("consultationVersion ausente no manifest"), {
      code: "CONSULTATION_VERSION_MISSING"
    })
  }
  const allowed = [...(manifest.allowedFiles || [])].sort()
  const checksummed = Object.keys(manifest.checksums || {}).sort()
  if (!allowed.length || JSON.stringify(allowed) !== JSON.stringify(checksummed)) {
    throw Object.assign(new Error("allowedFiles e checksums do consultation manifest divergem"), {
      code: "CONSULTATION_MANIFEST_FILESET_MISMATCH"
    })
  }
  return true
}

function enforceConsultationChangeControl(manifest) {
  assertManifestStructure(manifest)
  assertDomainVersionSeal(manifest)
  assertExplicitApproval(manifest)
  return true
}

module.exports = {
  canonicalize,
  manifestStructuralPayload,
  manifestStructuralDigest,
  domainVersionPayload,
  domainVersionSeal,
  APPROVED_DOMAIN_VERSION_SEALS,
  assertDomainVersionSeal,
  assertExplicitApproval,
  assertManifestStructure,
  enforceConsultationChangeControl
}
