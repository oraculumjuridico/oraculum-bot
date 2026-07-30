const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")

const server = fs.readFileSync(path.join(__dirname, "..", "server.js"), "utf8")
const legacyIntakeRouter = fs.readFileSync(
  path.join(__dirname, "..", "src", "domain", "legacy-intake-router.js"),
  "utf8"
)

function trechoEntre(inicio, fim) {
  const posicaoInicial = server.indexOf(inicio)
  const posicaoFinal = server.indexOf(fim, posicaoInicial)
  assert.notEqual(posicaoInicial, -1, `Trecho inicial ausente: ${inicio}`)
  assert.notEqual(posicaoFinal, -1, `Trecho final ausente: ${fim}`)
  return server.slice(posicaoInicial, posicaoFinal)
}

const boasVindas = trechoEntre(
  "async function iniciarFluxoRelatoLivre",
  "function deveCapturarLeadIncompleto"
)
assert.match(boasVindas, /Farei algumas perguntas para preparar seu caso/)
assert.doesNotMatch(boasVindas, /Seja muito bem-vindo\(a\)/)
assert.doesNotMatch(boasVindas, /━━━━━━━━━━━━━━━/)

const novoCaso = trechoEntre(
  "async function abrirNovoCasoCliente",
  "async function iniciarMensagemUrgenteCliente"
)
assert.match(novoCaso, /Para quem é este novo atendimento\?/)
assert.match(novoCaso, /Seu caso atual continuará registrado/)
assert.doesNotMatch(novoCaso, /Escolha como deseja abrir este novo atendimento/)

const novoCasoDeclarativo = trechoEntre(
  "function flowNovoCasoConfirma",
  "function flowColetaTelOutro"
)
for (const id of ["nc_meu", "nc_outro", "m_inicio"]) {
  assert.match(novoCasoDeclarativo, new RegExp(`id: "${id}"`))
}
assert.match(novoCasoDeclarativo, /Para quem é este novo atendimento\?/)

assert.match(server, /🎙️ \*Conte o que aconteceu\*/)
assert.doesNotMatch(server, /Fale com calma — estou aqui para ouvir você\./)

const ocorrenciasDescricao =
  legacyIntakeRouter.match(/Conte o que aconteceu e inclua os detalhes que considerar importantes\./g) || []
assert.equal(ocorrenciasDescricao.length, 2)
assert.doesNotMatch(legacyIntakeRouter, /Tenho todo o tempo do mundo!/)

const posHumano = trechoEntre(
  "function criarDispatcherPosHumano",
  "cancelarReengajamentosPendentes({"
)
for (const texto of [
  "REVISÃO PÓS-ATENDIMENTO",
  "Há mais de um caso aguardando complemento. Selecione o caso no Menu do Cliente para continuar.",
  "Tudo bem. Seu progresso foi salvo e você pode responder depois.",
  "Recebi sua informação. Ela seguirá para revisão segura antes de qualquer atualização.",
  "Informação recebida e vinculada ao seu caso. Você pode continuar enviando os itens pendentes.",
  "Informação recebida e vinculada ao seu caso."
]) {
  assert.ok(posHumano.includes(texto), `texto pós-humano ausente: ${texto}`)
}
assert.doesNotMatch(posHumano, /\uFFFD/)

console.log("pilot-ux-messages.test.js: ok")
