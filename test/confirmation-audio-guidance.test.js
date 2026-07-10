const assert = require("node:assert/strict")
const fs = require("fs")
const path = require("path")

const server = fs.readFileSync(path.join(__dirname, "..", "server.js"), "utf8")

assert.match(
  server,
  /function textoAudioConfirmacaoNome\(nome, \{ pessoaAtendida = false \} = \{\}\)/
)
assert.match(
  server,
  /Se estiver, toque no botão Sim, está certo\. Se não estiver, digite o nome correto ou envie um novo áudio\./
)

const confirmacoesCurtas = [
  "const audioConfirmar = `${nomeLimpo}. Está correto?`",
  "const audioReconfirmar = `${nomeCorrecaoContato}. Está correto?`",
  "const audioReconfirmar = `${nomeCorrecaoExplicita}. Está correto?`",
  "const audioReconfirmar = `${nomeLimpoCorrecao}. Está correto?`",
  "const audioReconfirmar = `${nomeCorrecaoTitular}. Está correto?`",
  "const audioReconfirmar = `${nomeLimpoLivre}. Está correto?`"
]

for (const confirmacao of confirmacoesCurtas) {
  assert.equal(
    server.includes(confirmacao),
    false,
    `a confirmação curta não pode reaparecer: ${confirmacao}`
  )
}

assert.match(
  server,
  /Recebi seu áudio\.[\s\S]*toque em Confirmar envio\.[\s\S]*toque em Enviar novo áudio ou em Corrigir digitando\./
)
assert.match(
  server,
  /introducaoAudio: "Entendi! Vou acrescentar essa informação ao que você já me contou\."/
)
assert.doesNotMatch(
  server,
  /gerarAudioAtendente\(u\.atendente,\s*`Entendi! Vou acrescentar essa informação ao que você já me contou\.`\)/
)
assert.match(
  server,
  /Se estiver correta, toque em Confirmar\. Se quiser mudar, toque em Corrigir, digite a correção ou envie um novo áudio\./
)

console.log("confirmation-audio-guidance.test.js: ok")
