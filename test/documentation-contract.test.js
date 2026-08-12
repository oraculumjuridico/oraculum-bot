"use strict"

const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const { functionsFrom } = require("../scripts/generate-function-catalog")

const root = path.resolve(__dirname, "..")

function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const full = path.join(directory, entry.name)
    return entry.isDirectory() ? walk(full) : [full]
  })
}

for (const relative of [
  "README.md",
  "docs/ORACULUM_SYSTEM_GUIDE.md",
  "docs/ORACULUM_RUNTIME_ARCHITECTURE.md",
  "docs/operations/PRODUCTION_RUNBOOK.md",
  "docs/reference/FUNCTION_CATALOG.md"
]) {
  assert.equal(fs.existsSync(path.join(root, relative)), true, `documento obrigatório ausente: ${relative}`)
}

const files = [
  path.join(root, "server.js"),
  path.join(root, "tts.js"),
  ...walk(path.join(root, "src")).filter(file => file.endsWith(".js"))
]
const functionCount = files.reduce((sum, file) => sum + functionsFrom(file).length, 0)
const catalog = fs.readFileSync(path.join(root, "docs/reference/FUNCTION_CATALOG.md"), "utf8")
assert.match(catalog, new RegExp(`Total: \\*\\*${functionCount} funções\\*\\*`), "catálogo desatualizado; execute npm run docs:catalog")

const guide = fs.readFileSync(path.join(root, "docs/ORACULUM_SYSTEM_GUIDE.md"), "utf8")
for (const principle of ["Segurança e sigilo", "Mesma pessoa, mesmo caso", "Não inventar certeza", "Humano no controle"]) {
  assert.match(guide, new RegExp(principle))
}
assert.match(guide, /Helena \| F4/)
assert.match(guide, /Clara \| F1/)
assert.match(guide, /inbox durável/i)
assert.match(guide, /nenhum upload cria permissão pública/)

console.log(`documentation-contract.test.js: ok (${functionCount} funções)`)
