const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")

const {
  gerarAudioDaTela,
  gerarBotoesDaTela
} = require("../src/domain/declarative-screen")
const { orientarAudioAcao } = require("../src/domain/action-guidance")
const {
  telaEnvioDoc,
  telaDocsPendentesComImagem
} = require("../src/domain/documents-ui")

function verificarParidade(tela) {
  assert.equal(Array.isArray(tela.acoes), true)
  assert.deepEqual(
    gerarBotoesDaTela(tela).map(botao => botao.id),
    tela.acoes.map(acao => acao.id)
  )
  const audio = gerarAudioDaTela(tela)
  for (const acao of tela.acoes) {
    const orientacao = orientarAudioAcao(acao)
    assert.equal(audio.includes(orientacao.replace(/[.\s]+$/, "")), true)
  }
}

const usuario = {
  numeroCaso: "ORA-TESTE",
  area: "Trabalhista",
  tipo: "demissao",
  docsEntregues: [],
  docsAusentes: [],
  docsPulados: [],
  docsParciais: [],
  docsDispensados: [],
  docAtualIdx: 0
}

const telaDocumento = telaEnvioDoc({ ...usuario, tipo: "negado" }, () => [
  { id: "docs_pular_doc", title: "Não tenho este" },
  { id: "docs_depois", title: "Continuar depois" },
  { id: "m_inicio", title: "Menu do cliente" }
])
verificarParidade(telaDocumento)
assert.deepEqual(gerarBotoesDaTela(telaDocumento).map(botao => botao.title), [
  "Não tenho este",
  "Continuar depois",
  "Menu do cliente"
])
assert.equal(
  telaDocumento.acoes.find(acao => acao.id === "docs_pular_doc").textoAudio,
  "Se quiser deixar este documento para depois, escolha a opção: Não tenho este."
)
assert.equal(
  telaDocumento.acoes.find(acao => acao.id === "docs_depois").textoAudio,
  "Para continuar em outro momento, escolha a opção: Continuar depois."
)
const audioDocumento = gerarAudioDaTela(telaDocumento)
assert.match(audioDocumento, /Você já enviou zero de cinco documentos pessoais\./)
assert.match(audioDocumento, /Agora, envie a frente e o verso do RG ou da CNH\./)
assert.doesNotMatch(audioDocumento, /Também pode escolher não enviar este documento agora/)
assert.match(telaDocumento.texto, /📌 \*Agora:\* RG ou CNH/)
assert.match(telaDocumento.texto, /📄 \*Envie:\* Frente \(1 de 2\)/)

const pendente = {
  ...usuario,
  docsPulados: ["doc_rg"]
}
verificarParidade(telaDocsPendentesComImagem(pendente))

const server = fs.readFileSync(
  path.join(__dirname, "..", "server.js"),
  "utf8"
)
const documentsUiSource = fs.readFileSync(
  path.join(__dirname, "..", "src", "domain", "documents-ui.js"),
  "utf8"
)
const presentationSource = `${server}\n${documentsUiSource}`

for (const id of [
  "documentos_introducao",
  "documentos_pendentes",
  "documento_guiado_recebido",
  "documento_avulso_recebido",
  "documento_avulso_anexado",
  "documento_avulso_classificado",
  "documento_guiado_upload_falhou",
  "documento_avulso_upload_falhou",
  "documento_reenvio_falhou"
]) {
  assert.equal(presentationSource.includes(id), true, `tela ausente: ${id}`)
}

assert.doesNotMatch(server, /enviarAudioModoVoz\(from, u, textoAudioTelaDocumentoCaso\(u\)/)

console.log("documents-declarative-screens.test.js: ok")
