const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")

const {
  gerarAudioDaTela,
  gerarBotoesDaTela
} = require("../src/domain/declarative-screen")
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
    assert.equal(audio.includes(`Para ${acao.label}, toque em ${acao.label}`), true)
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

verificarParidade(telaEnvioDoc(usuario, () => [
  { id: "docs_pular_doc", title: "Não tenho este" },
  { id: "docs_depois", title: "Continuar depois" },
  { id: "m_inicio", title: "Menu do cliente" }
]))

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
