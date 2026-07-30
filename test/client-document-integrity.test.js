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

const processamentoMidia = trecho(
  "async function processarMidia",
  "async function proximaConfirmacaoProgressiva"
)
const indiceProtecaoPendente = processamentoMidia.indexOf(
  "u._docClientePendenteId || u._docClientePendenteArquivo"
)
const indiceDownload = processamentoMidia.indexOf("await baixarMidia")
const indiceUploadAvulso = processamentoMidia.indexOf("await uploadDocumentoCano")
assert.notEqual(indiceProtecaoPendente, -1)
assert.notEqual(indiceDownload, -1)
assert.notEqual(indiceUploadAvulso, -1)
assert.equal(indiceProtecaoPendente < indiceDownload, true)
assert.equal(indiceProtecaoPendente < indiceUploadAvulso, true)
assert.match(processamentoMidia, /O arquivo pendente foi preservado/)

const anexoAvulso = trecho(
  'if (text === "doc_cliente_anexar")',
  'if (text?.startsWith("doc_cliente_tipo_"))'
)
const indiceRenomeacao = anexoAvulso.indexOf("await renomearArquivoDrive")
const indiceFalhaRenomeacao = anexoAvulso.indexOf("if (!arquivoRenomeado?.id)")
const indiceNotaAnexo = anexoAvulso.indexOf('"DOCUMENTO ANEXADO AO CASO"')
const indiceLimpezaPendente = anexoAvulso.lastIndexOf("u._docClientePendenteId = null")
assert.equal(indiceRenomeacao < indiceFalhaRenomeacao, true)
assert.equal(indiceFalhaRenomeacao < indiceNotaAnexo, true)
assert.equal(indiceFalhaRenomeacao < indiceLimpezaPendente, true)
assert.match(anexoAvulso, /arquivo permanece aguardando confirmação/)

const classificacaoAvulsa = trecho(
  'if (text?.startsWith("doc_cliente_tipo_"))',
  'if (text?.startsWith("m_caso_"))'
)
assert.match(classificacaoAvulsa, /if \(!arquivoRenomeado\?\.id\)/)
assert.equal(
  classificacaoAvulsa.indexOf("if (!arquivoRenomeado?.id)") <
    classificacaoAvulsa.indexOf('"DOCUMENTO ANEXADO AO CASO"'),
  true
)

const reenvio = trecho(
  'if (comandoDoc === "docs_reenviar")',
  'if (comandoDoc === "docs_maisFotos")'
)
const indiceSubstituicao = reenvio.indexOf("await marcarArquivoDriveSubstituido")
const indiceFalhaSubstituicao = reenvio.indexOf("if (!arquivoSubstituido?.id)")
const indiceNotaSubstituicao = reenvio.indexOf('"DOCUMENTO MARCADO COMO SUBSTITUIDO"')
const indiceLimpezaUltimo = reenvio.indexOf("u.ultimoArqId = null")
assert.equal(indiceSubstituicao < indiceFalhaSubstituicao, true)
assert.equal(indiceFalhaSubstituicao < indiceNotaSubstituicao, true)
assert.equal(indiceFalhaSubstituicao < indiceLimpezaUltimo, true)
assert.match(reenvio, /O arquivo atual foi mantido sem alterações/)

console.log("client-document-integrity.test.js: ok")
