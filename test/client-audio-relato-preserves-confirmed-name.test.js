"use strict"

const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")

const server = fs.readFileSync(path.join(__dirname, "..", "server.js"), "utf8")
const inicio = server.indexOf("async function processarAudioCanalAtendimento")
const fim = server.indexOf("async function transcreverAudioRespostaCadastral", inicio)
const fluxoAudio = server.slice(inicio, fim)

const preservacao = fluxoAudio.indexOf("if (u._revalidandoCampos && u._aguardandoRelatoAposNome)")
const revalidacao = fluxoAudio.indexOf("// \"Recomeçar\" — confirmação progressiva campo a campo")

assert.ok(preservacao >= 0, "áudio deve reconhecer relato inicial após nome confirmado")
assert.ok(revalidacao > preservacao, "preservação deve ocorrer antes da revalidação progressiva")
assert.match(fluxoAudio.slice(preservacao, revalidacao), /u\._aguardandoRelatoAposNome = false/)
assert.match(fluxoAudio.slice(preservacao, revalidacao), /u\._revalidandoCampos = false/)

console.log("client-audio-relato-preserves-confirmed-name.test.js: ok")
