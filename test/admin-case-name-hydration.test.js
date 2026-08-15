"use strict"

const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")

const source = fs.readFileSync(path.join(__dirname, "..", "server.js"), "utf8")

const hydrationStart = source.indexOf("async function hidratarNomesCasosNumeradosAdmin")
const hydrationEnd = source.indexOf("\nfunction nomePrioridadeAdmin", hydrationStart)
assert.ok(hydrationStart >= 0 && hydrationEnd > hydrationStart)
const hydrationBlock = source.slice(hydrationStart, hydrationEnd)

assert.match(hydrationBlock, /!item\.u\?\.numeroCaso\s*\|\|\s*!item\.u\?\.negocioId/)
assert.match(hydrationBlock, /hsAdminBuscarContatoDoNegocio\(item\.u\.negocioId\)/)
assert.match(hydrationBlock, /hidratarDadosContatoAdmin\(item, contato\)/)

const listStart = source.indexOf("async function telaAdminListaCasos")
const listEnd = source.indexOf("\nfunction telaAdminFalhaHubSpot", listStart)
assert.ok(listStart >= 0 && listEnd > listStart)
const listBlock = source.slice(listStart, listEnd)

const hydrateIndex = listBlock.indexOf("await hidratarNomesCasosNumeradosAdmin")
const saveIndex = listBlock.indexOf("salvarListaCasosAdmin")
assert.ok(hydrateIndex >= 0)
assert.ok(saveIndex > hydrateIndex, "a sessão admin deve salvar a página depois da hidratação")
assert.doesNotMatch(hydrationBlock, /axios\.(?:post|patch|put|delete)/)

console.log("admin-case-name-hydration.test.js: ok")
