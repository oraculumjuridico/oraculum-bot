"use strict"

const fs = require("node:fs/promises")
const path = require("node:path")
const crypto = require("node:crypto")

const fail = code => { throw new Error(code) }
const sha256 = value => crypto.createHash("sha256").update(value).digest("hex")

// This is the sole filesystem-to-manifest inventory step.  It deliberately
// follows real paths and measures the bytes before the plan generator sees it.
async function buildContentFiles(identityConfirmed, contentRoot, { io = fs } = {}) {
  const configuredRoot = await io.realpath(path.resolve(contentRoot)).catch(() => fail("CONTENT_ROOT_INVALID"))
  const result = {}
  for (const occurrence of identityConfirmed?.reviewedInventory?.physicalOccurrences || []) {
    if (typeof occurrence.localReference !== "string") fail("CONTENT_REFERENCE_INVALID")
    const candidate = await io.realpath(path.resolve(occurrence.localReference)).catch(() => fail("CONTENT_REFERENCE_INVALID"))
    if (candidate !== configuredRoot && !candidate.startsWith(`${configuredRoot}${path.sep}`)) fail("CONTENT_REFERENCE_OUTSIDE_ROOT")
    const bytes = await io.readFile(candidate).catch(() => fail("CONTENT_REFERENCE_INVALID"))
    const relativePath = path.relative(configuredRoot, candidate)
    if (!relativePath || path.isAbsolute(relativePath) || relativePath.split(path.sep).includes("..")) fail("CONTENT_REFERENCE_OUTSIDE_ROOT")
    result[occurrence.physicalDocumentId] = { relativePath, sha256: sha256(bytes), size: bytes.length }
  }
  return result
}

module.exports = { buildContentFiles }
