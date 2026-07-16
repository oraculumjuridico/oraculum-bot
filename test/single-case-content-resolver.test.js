"use strict"

const test = require("node:test")
const assert = require("node:assert/strict")
const fs = require("node:fs/promises")
const os = require("node:os")
const path = require("node:path")
const crypto = require("node:crypto")
const { createSingleCaseContentResolver } = require("../src/adapters/single-case-content-resolver")

const hash = bytes => crypto.createHash("sha256").update(bytes).digest("hex")
async function setup() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "resolver-")), entries = []
  for (let index = 1; index <= 11; index++) {
    const bytes = Buffer.from(`content-${index}`), relativePath = `f${index}.bin`, contentDocumentId = `C-${hash(bytes).slice(0, 20)}`
    await fs.writeFile(path.join(root, relativePath), bytes)
    entries.push({ contentDocumentId, reference: contentDocumentId, relativePath, sha256: hash(bytes), size: bytes.length })
  }
  return { root, entries }
}

test("resolve 11 IDs determinísticos com hash e tamanho", async () => {
  const fixture = await setup()
  try { const resolver = createSingleCaseContentResolver(fixture); for (const entry of fixture.entries) assert.equal(await resolver.resolve(entry.contentDocumentId), entry.relativePath) }
  finally { await fs.rm(fixture.root, { recursive: true, force: true }) }
})

test("ausente e múltiplo", async () => {
  const fixture = await setup()
  try {
    const resolver = createSingleCaseContentResolver(fixture)
    await assert.rejects(() => resolver.resolve("missing-reference"), /CONTENT_REFERENCE_NOT_FOUND/)
    const duplicate = createSingleCaseContentResolver({ root: fixture.root, entries: [fixture.entries[0], fixture.entries[0]] })
    await assert.rejects(() => duplicate.resolve(fixture.entries[0].reference), /CONTENT_REFERENCE_AMBIGUOUS/)
  } finally { await fs.rm(fixture.root, { recursive: true, force: true }) }
})

test("hash e tamanho divergentes são bloqueados", async () => {
  const fixture = await setup()
  try {
    fixture.entries[0].sha256 = "0".repeat(64)
    await assert.rejects(() => createSingleCaseContentResolver(fixture).resolve(fixture.entries[0].reference), /CONTENT_REFERENCE_HASH_MISMATCH/)
    fixture.entries[0].sha256 = hash(Buffer.from("content-1")); fixture.entries[0].size++
    await assert.rejects(() => createSingleCaseContentResolver(fixture).resolve(fixture.entries[0].reference), /CONTENT_REFERENCE_SIZE_MISMATCH/)
  } finally { await fs.rm(fixture.root, { recursive: true, force: true }) }
})

test("entrada exige ID como referência e rejeita caminho absoluto", async () => {
  const fixture = await setup()
  try {
    assert.throws(() => createSingleCaseContentResolver({ root: fixture.root, entries: [{ ...fixture.entries[0], reference: "different-id" }] }), /CONTENT_RESOLVER_ENTRY_INVALID/)
    assert.throws(() => createSingleCaseContentResolver({ root: fixture.root, entries: [{ ...fixture.entries[0], relativePath: path.resolve(fixture.root, "x") }] }), /CONTENT_RESOLVER_ENTRY_INVALID/)
  } finally { await fs.rm(fixture.root, { recursive: true, force: true }) }
})

test("traversal e symlink externo", async () => {
  const fixture = await setup(), outside = await fs.mkdtemp(path.join(os.tmpdir(), "outside-"))
  try {
    assert.throws(() => createSingleCaseContentResolver({ root: fixture.root, entries: [{ ...fixture.entries[0], relativePath: "../x" }] }), /CONTENT_RESOLVER_ENTRY_INVALID/)
    const realRoot = await fs.realpath(fixture.root), escaped = path.join(outside, "x"), entry = { ...fixture.entries[0], relativePath: "link" }
    const io = { ...fs, realpath: async value => path.resolve(value) === path.join(realRoot, "link") ? escaped : fs.realpath(value) }
    await assert.rejects(() => createSingleCaseContentResolver({ root: fixture.root, entries: [entry], io }).resolve(entry.reference), /CONTENT_REFERENCE_OUTSIDE_ROOT/)
  } finally { await fs.rm(fixture.root, { recursive: true, force: true }); await fs.rm(outside, { recursive: true, force: true }) }
})

test("erros não expõem caminho pessoal", async () => {
  const fixture = await setup()
  try { await assert.rejects(() => createSingleCaseContentResolver(fixture).resolve("missing-reference"), error => !error.message.includes(fixture.root)) }
  finally { await fs.rm(fixture.root, { recursive: true, force: true }) }
})
