"use strict"

const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")

const source = fs.readFileSync(path.join(__dirname, "..", "server.js"), "utf8")
const start = source.indexOf("function limparDadosCasoAtual")
const end = source.indexOf("function limparDadosAtendimento", start)
const cleanup = source.slice(start, end)

for (const field of [
  "_areaDetectada",
  "_audioCanalTranscricao",
  "_resumoDescricaoIA",
  "_relatoAntecipadoPreAtendimento",
  "nomenclaturaJuridica",
  "tipo_de_caso",
  "oraculum_case_subtype",
  "objetivo",
  "recebe_beneficio"
]) {
  assert.match(cleanup, new RegExp(`${field}: null`), `novo caso deve limpar ${field}`)
}

assert.match(source, /async function abrirNovoCasoCliente[\s\S]*?limparDadosCasoAtual\(u\)/)
assert.match(source, /function criarSnapshotCasoCliente[\s\S]*?nomenclaturaJuridica: u\.nomenclaturaJuridica \|\| null/)
assert.match(source, /function restaurarCasoAnteriorCliente[\s\S]*?nomenclaturaJuridica: caso\.nomenclaturaJuridica \|\| null/)

console.log("new-case-state-isolation.test.js: ok")
