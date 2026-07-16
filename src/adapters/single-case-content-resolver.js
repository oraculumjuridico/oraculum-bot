"use strict"

const fs = require("node:fs/promises")
const path = require("node:path")
const crypto = require("node:crypto")

const HASH = /^[a-f0-9]{64}$/
const REFERENCE = /^[A-Za-z0-9][A-Za-z0-9._:-]{2,127}$/
const fail = code => { throw new Error(code) }

function createSingleCaseContentResolver({ root, entries, io = fs } = {}) {
  if (typeof root !== "string" || !root.trim()) fail("CONTENT_RESOLVER_ROOT_MISSING")
  if (!Array.isArray(entries) || entries.length === 0) fail("CONTENT_RESOLVER_ENTRIES_MISSING")
  const base = path.resolve(root), byReference = new Map()
  for (const entry of entries) {
    if (!entry || !REFERENCE.test(entry.contentDocumentId || "") || entry.reference !== entry.contentDocumentId || typeof entry.relativePath !== "string" || path.isAbsolute(entry.relativePath) || !path.resolve(base, entry.relativePath).startsWith(`${base}${path.sep}`) || !HASH.test(entry.sha256 || "") || !Number.isInteger(entry.size) || entry.size < 1) fail("CONTENT_RESOLVER_ENTRY_INVALID")
    const matches = byReference.get(entry.reference) || []
    matches.push({ ...entry })
    byReference.set(entry.reference, matches)
  }

  const one = contentReference => {
    const matches = byReference.get(contentReference) || []
    if (matches.length === 0) fail("CONTENT_REFERENCE_NOT_FOUND")
    if (matches.length !== 1) fail("CONTENT_REFERENCE_AMBIGUOUS")
    return matches[0]
  }

  return Object.freeze({
    async resolve(contentReference) {
      const entry = one(contentReference)
      const realRoot = await io.realpath(base).catch(() => fail("CONTENT_RESOLVER_ROOT_UNAVAILABLE"))
      const candidate = path.resolve(realRoot, entry.relativePath)
      if (!candidate.startsWith(`${realRoot}${path.sep}`)) fail("CONTENT_REFERENCE_OUTSIDE_ROOT")
      const real = await io.realpath(candidate).catch(() => fail("CONTENT_REFERENCE_NOT_FOUND"))
      if (!real.startsWith(`${realRoot}${path.sep}`)) fail("CONTENT_REFERENCE_OUTSIDE_ROOT")
      const bytes = await io.readFile(real).catch(() => fail("CONTENT_REFERENCE_READ_FAILED"))
      if (!Buffer.isBuffer(bytes) || bytes.length !== entry.size) fail("CONTENT_REFERENCE_SIZE_MISMATCH")
      if (crypto.createHash("sha256").update(bytes).digest("hex") !== entry.sha256) fail("CONTENT_REFERENCE_HASH_MISMATCH")
      return entry.relativePath
    },
    resolveReference(contentReference) { return one(contentReference).relativePath }
  })
}

module.exports = { createSingleCaseContentResolver }
