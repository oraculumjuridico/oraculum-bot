"use strict"

const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const vm = require("node:vm")

const source = fs.readFileSync(path.join(__dirname, "..", "server.js"), "utf8")
const start = source.indexOf("function resolverTelefoneInterfaceAdmin")
const end = source.indexOf("async function telaAdminPrioridades", start)
assert.ok(start >= 0 && end > start, "resolucao de telefone da interface Admin ausente")
assert.match(source, /function resolverTelefoneInterfaceAdmin/)

const sandbox = {
  sanitizarTextoEntrada: value => String(value || "").trim(),
  normalizarNumeroWhatsAppEnvio: value => String(value || "").replace(/\D/g, ""),
  gerarBriefingCaso: u => ({
    nome: u.nome || "Cliente",
    numeroCaso: null,
    stageLabel: "Em analise",
    proximaAcao: "acompanhar"
  }),
  motivoPrioridadeAdmin: () => "Revisar",
  nomePrioridadeAdmin: u => u.nome || "Cliente",
  result: null
}
vm.runInNewContext(`${source.slice(start, end)}\nresult = linhaPrioridadeAdmin`, sandbox)

const telefoneCompleto = "5511666666666"
const linhaComTelefone = sandbox.result({
  from: telefoneCompleto,
  u: { nome: "Pessoa Ficticia", _numero: "5511777777777", whatsappContato: "5511888888888" }
}, 1, { adminAutenticado: true })
assert.match(linhaComTelefone, new RegExp(telefoneCompleto))
assert.doesNotMatch(linhaComTelefone, /5511777777777|5511888888888/)

const linhaNaoAutenticada = sandbox.result({ from: telefoneCompleto, u: { nome: "Pessoa Ficticia" } }, 1)
assert.doesNotMatch(linhaNaoAutenticada, new RegExp(telefoneCompleto))

const linhaSemTelefone = sandbox.result({ u: { nome: "Pessoa Ficticia" } }, 2, { adminAutenticado: true })
assert.match(linhaSemTelefone, /Pessoa Ficticia/)
assert.doesNotMatch(linhaSemTelefone, /📱/)

console.log("admin-priority-phone-mask.test.js: ok")
