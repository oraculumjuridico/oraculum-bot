const assert = require("node:assert/strict")
const fs = require("fs")
const path = require("path")

const server = fs.readFileSync(path.join(__dirname, "..", "server.js"), "utf8")
const productionFiles = [
  "server.js",
  "src/domain/client/handlers/revalidate-phone-confirm.handler.js",
  "src/domain/client/handlers/revalidate-phone-correct-text.handler.js",
  "src/domain/stage-handlers/confirm-entry-final-acceptance-handler.js"
].map(relativePath => fs.readFileSync(path.join(__dirname, "..", relativePath), "utf8"))

assert.match(
  server,
  /async function enviarAudioPedidoCidade\(from, atendente, opcoes = \{\}\)/
)
assert.match(
  server,
  /const \{ nomeTerceiro = null, introducaoAudio = "" \} = opcoes/
)
assert.match(
  server,
  /if \(!audioRetomadaEnviado && u\.modoTexto !== true\)/
)
assert.match(
  server,
  /await enviarAudioPedidoCidade\(from, u\.atendente, \{ nomeTerceiro, introducaoAudio \}\)/
)

for (const source of productionFiles) {
  assert.doesNotMatch(
    source,
    /suprimirAudio/,
    "nenhuma transição para a tela de cidade deve silenciar seu áudio"
  )
}

assert.match(
  server,
  /introducaoAudio: `Entendi! Vou usar o número \$\{label\}\.`/
)

console.log("city-audio-coverage.test.js: ok")
