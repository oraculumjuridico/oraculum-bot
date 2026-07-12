"use strict"

const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const vm = require("node:vm")

const source = fs.readFileSync(path.join(__dirname, "..", "server.js"), "utf8")
const start = source.indexOf("function nomeValidoParaExibicao")
const end = source.indexOf("async function resolverUsuarioPorHubSpot", start)
assert.ok(start >= 0 && end > start, "helpers de resolucao de nome ausentes")

const sandbox = {
  sanitizarTextoEntrada: valor => String(valor || "").trim(),
  result: null
}
vm.runInNewContext(`${source.slice(start, end)}\nresult = { resolverNomeBaseWhatsApp, resolverNomeBriefing }`, sandbox)

const { resolverNomeBaseWhatsApp, resolverNomeBriefing } = sandbox.result

assert.equal(
  resolverNomeBaseWhatsApp("Pessoa Ficticia", null),
  "Pessoa Ficticia",
  "pre-cadastro sem HubSpot deve preservar nomeWA recebido da Meta"
)
assert.equal(
  resolverNomeBaseWhatsApp("", { nomeWA: "Cliente", nomePerfilWhatsApp: "Perfil Ficticio" }),
  "Perfil Ficticio",
  "sessao antiga deve aproveitar nome de perfil valido"
)
assert.equal(
  resolverNomeBriefing({ nomeWA: "Cliente", nomePerfilWhatsApp: "Perfil Ficticio" }),
  "Perfil Ficticio",
  "placeholder Cliente nao deve encobrir nomePerfilWhatsApp"
)
assert.equal(
  resolverNomeBriefing({ nome: "Nome Confirmado", nomeConfirmado: true, nomeHubspot: "Nome HubSpot", nomeWA: "Nome Meta" }),
  "Nome Confirmado",
  "nome confirmado deve ter prioridade"
)
assert.equal(
  resolverNomeBriefing({ nome: "Nao Confirmado", nomeConfirmado: false, nomeHubspot: "Nome HubSpot", nomeWA: "Nome Meta" }),
  "Nome HubSpot",
  "nome nao confirmado nao deve superar nomeHubspot"
)
assert.equal(
  resolverNomeBriefing({ nomeWA: "Cliente", nomePerfilWhatsApp: "Cliente" }),
  "Cliente",
  "fallback final deve continuar Cliente"
)

console.log("name-resolution-fallback.test.js: ok")
