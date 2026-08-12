"use strict"

const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")

const source = fs.readFileSync(path.join(__dirname, "..", "server.js"), "utf8")
function trecho(inicio, fim) {
  const start = source.indexOf(inicio)
  const end = source.indexOf(fim, start)
  assert.ok(start >= 0 && end > start)
  return source.slice(start, end)
}

const handlers = [
  trecho('if (u.stage === STAGES.CONFIRMACAO)', 'if (text === "conf_corrigir")'),
  trecho('if (u.stage === STAGES.AUDIO_CONFIRMAR_DADOS)', 'if (text === "audio_dados_corrigir")')
]

for (const handler of handlers) {
  assert.match(handler, /await finalizarCadastro\(from, u\)/)
  assert.match(handler, /await enviarAudioModoVoz\(from, u, textoAudio/)
  assert.match(handler, /número do caso é/)
}
assert.doesNotMatch(handlers[1], /await enviarAudio\(from, urlAudioAtendente\(ogg\)\)/)

console.log("client-case-created-audio.test.js: ok")
