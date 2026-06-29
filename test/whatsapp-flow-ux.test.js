const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")

const source = fs.readFileSync(
  path.join(__dirname, "..", "server.js"),
  "utf8"
)

function trecho(inicio, fim) {
  const indiceInicio = source.indexOf(inicio)
  const indiceFim = source.indexOf(fim, indiceInicio)
  assert.notEqual(indiceInicio, -1, `Trecho inicial ausente: ${inicio}`)
  assert.notEqual(indiceFim, -1, `Trecho final ausente: ${fim}`)
  return source.slice(indiceInicio, indiceFim)
}

assert.equal(source.includes("Etapa 6 de 6 · *Relato*"), false)
assert.equal(
  source.includes("●●●○○○ 📝 Etapa 3 de 6 · *Relato*"),
  true
)

const retomadaAutomatica = trecho(
  "async function verificarRetomadaAutomatica",
  "async function tentarRestaurarClienteHubSpotParaMenu"
)
assert.match(retomadaAutomatica, /if \(!u\.modoTexto && u\.atendente\)/)
assert.doesNotMatch(retomadaAutomatica, /if \(u\.atendente\)/)

assert.equal(
  source.includes('assessoria_inicial: "escolher como você prefere ser atendido"'),
  false
)
assert.equal(
  source.match(/assessoria_inicial: "confirmar o entendimento do seu relato"/g)?.length,
  2
)

const opcaoInvalida = trecho(
  "function respostaOpcaoInvalidaRetomada",
  "async function responderImprevistoPreAtendimento"
)
assert.match(
  opcaoInvalida,
  /🤔 Não entendi\. Por favor, escolha uma das opções do menu para continuar\. 👇/
)

console.log("whatsapp-flow-ux.test.js: ok")
