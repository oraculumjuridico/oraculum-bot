"use strict"

const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")

const source = fs.readFileSync(path.join(__dirname, "..", "server.js"), "utf8")

const analysisStart = source.indexOf("async function telaAdminCasosAnalise")
const analysisEnd = source.indexOf("async function telaAdminCasosDocumentos", analysisStart)
const analysisBlock = source.slice(analysisStart, analysisEnd)
assert.match(analysisBlock, /hidratarNomesPrioridadesAdmin\(itens\.slice/)
assert.match(analysisBlock, /itens\.splice\(inicio, itensPagina\.length, \.\.\.itensPagina\)/)

const listStart = source.indexOf("function telaAdminListaCasos")
const listEnd = source.indexOf("function telaAdminFalhaHubSpot", listStart)
const listBlock = source.slice(listStart, listEnd)
assert.match(listBlock, /primeiroEUltimoNome\(resolverNomeBriefing\(item\.u\)\)/)
assert.match(listBlock, /nomeCurto:\s*nomesOpcoes\[idx\]/)

console.log("admin-analysis-client-name.test.js: ok")
