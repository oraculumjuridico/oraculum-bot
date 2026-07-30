function key(value) {
  return String(value || "").trim()
}

function indexBy(items = [], field) {
  const map = new Map()
  for (const item of items || []) {
    const value = key(item?.[field])
    if (!value) continue
    if (!map.has(value)) map.set(value, [])
    map.get(value).push(item)
  }
  return map
}

function reconcileCaseState(input = {}, options = {}) {
  const local = input.local || []
  const drive = input.drive || []
  const hubspot = input.hubspot || []
  const findings = []
  const localHash = indexBy(local, "sha256")
  const driveHash = indexBy(drive, "sha256")
  const hubspotHash = indexBy(hubspot, "sha256")

  for (const [sha256, items] of localHash) {
    if (!driveHash.has(sha256)) findings.push({ code: "LOCAL_NOT_UPLOADED", sha256, count: items.length })
  }
  for (const [sha256, items] of driveHash) {
    if (!hubspotHash.has(sha256)) findings.push({ code: "DRIVE_NOT_REGISTERED_HUBSPOT", sha256, count: items.length })
    if (items.length > 1) findings.push({ code: "DUPLICATE_DRIVE_FILE", sha256, count: items.length })
  }
  for (const [sha256, items] of hubspotHash) {
    if (!driveHash.has(sha256)) findings.push({ code: "HUBSPOT_DOCUMENT_MISSING_DRIVE", sha256, count: items.length })
  }
  for (const item of [...local, ...drive, ...hubspot]) {
    if (item?.status === "quarantined") findings.push({ code: "QUARANTINED_DOCUMENT", sha256: key(item.sha256) || null })
    if (item?.preservedOutsideConsolidatedPdf) findings.push({ code: "PRESERVED_OUTSIDE_PDF", sha256: key(item.sha256) || null })
    if (item?.uploadFailed) findings.push({ code: "UPLOAD_FAILED", sha256: key(item.sha256) || null })
  }
  if (input.consolidation?.complete !== true) findings.push({ code: "CONSOLIDATION_INCOMPLETE" })
  if (Number(input.driveFolders?.length || 0) > 1) findings.push({ code: "DUPLICATE_CASE_FOLDER", count: input.driveFolders.length })

  const report = {
    mode: options.apply === true ? "apply" : "readonly",
    ok: findings.length === 0,
    findings,
    counts: { local: local.length, drive: drive.length, hubspot: hubspot.length }
  }
  if (options.apply === true) {
    if (typeof options.applyFixes !== "function") throw new Error("explicit applyFixes adapter required")
    report.applyRequired = true
  }
  return report
}

module.exports = { reconcileCaseState }
