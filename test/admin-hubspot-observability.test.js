"use strict"

const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")

const source = fs.readFileSync(path.join(__dirname, "..", "server.js"), "utf8")

assert.match(source, /ok: false,\s*deals: \[\], total: 0, after: null,\s*errorCode/)
assert.match(source, /Não foi possível consultar os casos no HubSpot agora\. Tente novamente em alguns minutos\./)
assert.match(source, /casosAtivos: "adm_casos_ativos"/)
assert.match(source, /hsAdminBuscarTodosNegociosPorStages/)
assert.match(source, /do \{[\s\S]*?\} while \(after\)/)
assert.match(source, /async function hsAdminBuscarNegociosDireto/)
assert.match(source, /query: texto/)
assert.match(source, /A lista anterior expirou\. Abra novamente Filas de casos e selecione o caso\./)
assert.match(source, /event: "admin\.cases\.query"/)
assert.match(source, /event: "admin\.cases\.session"/)
assert.doesNotMatch(source.slice(source.indexOf("function telaAdminFalhaHubSpot"), source.indexOf("async function telaAdminCasosNovos")), /phone|nome|token/i)

console.log("admin-hubspot-observability.test.js: ok")
