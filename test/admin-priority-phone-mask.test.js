"use strict"

const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const vm = require("node:vm")
const { mascararTelefoneLog } = require("../src/utils/logging")

const source = fs.readFileSync(path.join(__dirname, "..", "server.js"), "utf8")
const start = source.indexOf("function linhaPrioridadeAdmin")
const end = source.indexOf("async function telaAdminPrioridades", start)
assert.ok(start >= 0 && end > start, "linhaPrioridadeAdmin ausente")
assert.match(source, /logErroHubSpot,\s*mascararTelefoneLog\s*\}\s*= require\("\.\/src\/utils\/logging"\)/)

const sandbox = {
  mascararTelefoneLog,
  gerarBriefingCaso: u => ({
    nome: u.nome || "Cliente",
    numeroCaso: null,
    stageLabel: "Em analise",
    proximaAcao: "acompanhar"
  }),
  motivoPrioridadeAdmin: () => "Revisar",
  result: null
}
vm.runInNewContext(`${source.slice(start, end)}\nresult = linhaPrioridadeAdmin`, sandbox)

const telefoneCompleto = "5511666666666"
const linhaComTelefone = sandbox.result({
  from: telefoneCompleto,
  u: { nome: "Pessoa Ficticia", _numero: "5511777777777", whatsappContato: "5511888888888" }
}, 1)
assert.match(linhaComTelefone, /5511\*{5}6666/)
assert.doesNotMatch(linhaComTelefone, new RegExp(telefoneCompleto))

const linhaSemTelefone = sandbox.result({ u: { nome: "Pessoa Ficticia" } }, 2)
assert.match(linhaSemTelefone, /Pessoa Ficticia/)
assert.doesNotMatch(linhaSemTelefone, /📱/)

console.log("admin-priority-phone-mask.test.js: ok")
