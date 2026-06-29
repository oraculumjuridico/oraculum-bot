const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")

const {
  createClientScreen,
  isClientScreen,
  validateClientScreen,
  gerarBotoesDaTela,
  gerarAudioDaTela
} = require("../src/domain/declarative-screen-guard")

const warnings = []
const logger = { warn: message => warnings.push(message) }

const tela = createClientScreen({
  id: "guard_test",
  titulo: "Teste",
  textoAudioBase: "Escolha uma opção",
  acoes: [{ id: "continuar", label: "Continuar" }]
}, { logger })

assert.equal(isClientScreen(tela), true)
assert.equal(validateClientScreen(tela, { logger }), true)
assert.deepEqual(gerarBotoesDaTela(tela, { logger }), [
  { id: "continuar", title: "Continuar" }
])
assert.match(gerarAudioDaTela(tela, { logger }), /Para Continuar, toque em Continuar/)
assert.equal(warnings.length, 0)

createClientScreen({
  id: "sem_acoes",
  titulo: "Inválida",
  textoAudioBase: "Texto"
}, { logger })
assert.match(warnings.pop(), /criada sem acoes\[\]/)

const legacy = {
  id: "legacy",
  textoAudioBase: "Texto legado",
  acoes: [{ id: "ok", label: "OK" }]
}
assert.equal(validateClientScreen(legacy, { logger }), false)
assert.match(warnings.pop(), /não foi criada por createClientScreen/)

const sourceRoot = path.join(__dirname, "..", "src")
const directEngineConsumers = []

function scan(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name)
    if (entry.isDirectory()) {
      scan(absolute)
      continue
    }
    if (!entry.name.endsWith(".js")) continue
    if (entry.name === "declarative-screen.js" || entry.name === "declarative-screen-guard.js") continue
    const source = fs.readFileSync(absolute, "utf8")
    if (/require\([\"'][^\"']*declarative-screen[\"']\)/.test(source)) {
      directEngineConsumers.push(path.relative(sourceRoot, absolute))
    }
  }
}

scan(sourceRoot)
assert.deepEqual(
  directEngineConsumers,
  [],
  `novas telas devem importar declarative-screen-guard: ${directEngineConsumers.join(", ")}`
)

const server = fs.readFileSync(path.join(__dirname, "..", "server.js"), "utf8")
assert.match(server, /require\(\"\.\/src\/domain\/declarative-screen-guard\"\)/)
assert.doesNotMatch(server, /require\(\"\.\/src\/domain\/declarative-screen\"\)/)

console.log("declarative-screen-guard.test.js: ok")
