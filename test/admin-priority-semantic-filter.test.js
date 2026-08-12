"use strict"

const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")

const source = fs.readFileSync(path.join(__dirname, "..", "server.js"), "utf8")

const scoreStart = source.indexOf("function scorePrioridadeAdmin")
const scoreEnd = source.indexOf("async function gerarPrioridadesAdmin", scoreStart)
const scoreBlock = source.slice(scoreStart, scoreEnd)
assert.match(scoreBlock, /maiorAlertaOperacionalAdmin/)
assert.doesNotMatch(scoreBlock, /scoreOperacional/)
assert.doesNotMatch(scoreBlock, /faltantesCriticos/)

const alertStart = source.indexOf("function gerarAlertasOperacionaisAdmin")
const alertEnd = source.indexOf("function maiorAlertaOperacionalAdmin", alertStart)
const alertBlock = source.slice(alertStart, alertEnd)
assert.match(alertBlock, /idadeConhecida/)
assert.match(alertBlock, /idadeConhecida\s*&&\s*idade\s*>\s*24/)

const priorityStart = source.indexOf("async function telaAdminPrioridades")
const priorityEnd = source.indexOf("async function telaAdminCasos", priorityStart)
const priorityBlock = source.slice(priorityStart, priorityEnd)
assert.match(priorityBlock, /hidratarNomesPrioridadesAdmin\(itens\.slice/)
assert.match(priorityBlock, /itens\.splice\(inicio, itensPagina\.length, \.\.\.itensPagina\)/)

const normalizeStart = source.indexOf("function normalizarItemAdminLocal")
const normalizeEnd = source.indexOf("async function hsAdminContarNegociosPorStages", normalizeStart)
const normalizeBlock = source.slice(normalizeStart, normalizeEnd)
assert.doesNotMatch(normalizeBlock, /nome:\s*snapshot\.nome\s*\|\|\s*nomeResolvido\s*\|\|\s*props\.dealname/)
assert.match(normalizeBlock, /area:\s*props\.area_juridica\s*\|\|\s*snapshot\.area/)

console.log("admin-priority-semantic-filter.test.js: ok")
