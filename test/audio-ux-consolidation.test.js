const assert = require("assert")
const fs = require("fs")
const path = require("path")

const server = fs.readFileSync(path.join(__dirname, "..", "server.js"), "utf8")

assert.match(
  server,
  /async function telaConfirmarDadosAudio\(from, u, opcoesAudio = \{\}\)/
)
assert.match(
  server,
  /async function proximaConfirmacaoProgressiva\(from, u, opcoesAudio = \{\}\)/
)
assert.match(
  server,
  /if \(introducaoAudio\) textoAudio = `\$\{introducaoAudio\} \$\{textoAudio\}`/
)
assert.match(
  server,
  /const textoComIntroducaoAudio = texto => introducaoAudio \? `\$\{introducaoAudio\} \$\{texto\}` : texto/
)

const transicoes = [
  "Atualizei seu relato. Agora vou confirmar seus dados com você.",
  "Atualizei sua situação. Agora vou confirmar seus dados com você.",
  "Ótimo! Vou mostrar um resumo dos seus dados para você confirmar."
]

for (const texto of transicoes) {
  assert.ok(
    !server.includes(`gerarAudioAtendente(u.atendente, \`${texto}\`)`),
    `a transição deve integrar o áudio seguinte: ${texto}`
  )
}

assert.match(
  server,
  /return telaConfirmarDadosAudio\(from, u, \{ introducaoAudio \}\)/
)
assert.ok(
  (server.match(/introducaoAudio:/g) || []).length >= 10,
  "as transições consolidadas devem ser encaminhadas ao próximo áudio"
)

console.log("audio-ux-consolidation.test.js: OK")
