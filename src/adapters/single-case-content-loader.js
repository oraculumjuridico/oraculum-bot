"use strict"

const fs = require("node:fs/promises")
const path = require("node:path")

const fail = code => { throw new Error(code) }

function createSingleCaseContentLoader({ root, maxBytes = 25 * 1024 * 1024, resolveReference = value => value, io = fs } = {}) {
  if (typeof root !== "string" || !root.trim()) fail("CONTENT_ROOT_MISSING")
  if (!Number.isInteger(maxBytes) || maxBytes < 1) fail("CONTENT_LIMIT_INVALID")
  if (typeof resolveReference !== "function") fail("CONTENT_RESOLVER_INVALID")
  const configuredRoot = path.resolve(root)
  return Object.freeze({ async loadBytes(contentReference) {
    if (typeof contentReference !== "string" || !contentReference || contentReference.includes("\0")) fail("CONTENT_REFERENCE_INVALID")
    let realRoot, relative, candidate, realCandidate, stat
    try {
      realRoot = await io.realpath(configuredRoot)
      relative = resolveReference(contentReference)
      if (typeof relative !== "string" || !relative || path.isAbsolute(relative)) fail("CONTENT_REFERENCE_INVALID")
      candidate = path.resolve(realRoot, relative)
      if (!candidate.startsWith(`${realRoot}${path.sep}`)) fail("CONTENT_PATH_OUTSIDE_ROOT")
      realCandidate = await io.realpath(candidate)
      if (!realCandidate.startsWith(`${realRoot}${path.sep}`)) fail("CONTENT_PATH_OUTSIDE_ROOT")
      stat = await io.stat(realCandidate)
    } catch (error) {
      if (/^CONTENT_/.test(error?.message || "")) throw error
      fail("CONTENT_NOT_FOUND")
    }
    if (!stat.isFile()) fail("CONTENT_NOT_FILE")
    if (stat.size > maxBytes) fail("CONTENT_TOO_LARGE")
    let bytes
    try { bytes = await io.readFile(realCandidate) } catch { fail("CONTENT_READ_FAILED") }
    if (!Buffer.isBuffer(bytes) || bytes.length !== stat.size) fail("CONTENT_READ_FAILED")
    return bytes
  } })
}

module.exports = { createSingleCaseContentLoader }
