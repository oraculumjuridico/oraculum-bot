"use strict"

const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")

const source = fs.readFileSync(path.join(__dirname, "..", "server.js"), "utf8")
const guardStart = source.indexOf("function etapaPermitidaComCasoOficial")
const guardEnd = source.indexOf("function getNumeroCasoOficialDoNegocio", guardStart)
const allowed = source.slice(guardStart, guardEnd)

for (const stage of [
  "STAGES.CLIENTE",
  "STAGES.DOCUMENTOS",
  "STAGES.AGENDAMENTO_HORARIO",
  "STAGES.AGENDAMENTO_DURACAO",
  "STAGES.AGENDAMENTO_CONFIRMAR",
  "STAGES.AGUARDANDO_URGENTE",
  "STAGES.URGENTE_AUDIO_CONFIRMA",
  "STAGES.URGENTE_AUDIO_ERRO_TRANSCRICAO"
]) assert.match(allowed, new RegExp(stage.replace(".", "\\.")))

for (const forbidden of [
  "STAGES.ACOLHIMENTO",
  "STAGES.AUDIO_AGUARDANDO",
  "STAGES.ACOLHIMENTO_NOME",
  "STAGES.ACOLHIMENTO_CIDADE",
  "STAGES.AUDIO_CONFIRMAR_DADOS",
  "STAGES.CONFIRMACAO"
]) assert.doesNotMatch(allowed, new RegExp(forbidden.replace(".", "\\.")))

console.log("official-case-never-preintake.test.js: ok")
