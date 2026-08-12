"use strict"

const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")

const source = fs.readFileSync(path.join(__dirname, "..", "server.js"), "utf8")
const start = source.indexOf("async function perguntarNomeProprio")
const end = source.indexOf("function textoSolicitarNomeRepresentante", start)
const handler = source.slice(start, end)

assert.ok(start >= 0 && end > start)
assert.match(handler, /u\.nomeHubspot \|\| u\.nome/)
assert.match(handler, /ehNomeAparente\(nomeExistente, nomeExistente\) === true/)
assert.match(handler, /u\._nomeTemp = nomeExistente/)
assert.match(handler, /STAGES\.ACOLHIMENTO_CONFIRMA_NOME/)
assert.match(handler, /id: "nome_confirmar"/)
assert.match(handler, /Encontrei seu nome como/)

console.log("client-existing-name-confirmation.test.js: ok")
