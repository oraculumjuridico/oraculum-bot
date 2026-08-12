"use strict"

const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")

const server = fs.readFileSync(path.join(__dirname, "..", "server.js"), "utf8")
const summary = fs.readFileSync(path.join(__dirname, "..", "src", "domain", "admin-summary-ui.js"), "utf8")

const buildStart = server.indexOf("async function gerarResumoDiarioOperacional")
const buildEnd = server.indexOf("function usuariosAdminOrdenados", buildStart)
assert.match(server.slice(buildStart, buildEnd), /return\s*\{\s*ok:\s*true,/)

const screenStart = server.indexOf("async function telaAdminResumoDiario")
const screenEnd = server.indexOf("async function telaDetalheCasoAdmin", screenStart)
assert.match(server.slice(screenStart, screenEnd), /textoResumoDiarioOperacional\(resumo\)/)
assert.match(summary, /Agendamentos futuros:/)

console.log("admin-daily-summary-success.test.js: ok")
