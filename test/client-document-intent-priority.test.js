const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const vm = require("node:vm")

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

const detectorSource = trecho(
  "function detectarIntencaoCliente",
  "function pareceDuvidaCasoAtualOuNovo"
)
const detectorContext = {
  normalizarTextoGatilho: texto => String(texto || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
}
vm.runInNewContext(
  `${detectorSource}; this.detectar = detectarIntencaoCliente`,
  detectorContext
)

for (const [texto, intencao] of [
  ["quero falar com advogado", "advogado"],
  ["qual o andamento do meu caso", "status"],
  ["status", "status"],
  ["documentos", "documentos"]
]) {
  assert.equal(detectorContext.detectar(texto), intencao)
}

const caminhoAudio = trecho(
  "const emFluxoDocumentoAudio",
  "if (intencaoAudio === \"novo_caso\""
)
const indiceComandoAudio = caminhoAudio.indexOf("detectarComandoDocumento(trans)")
const indiceAusenciaAudio = caminhoAudio.indexOf("textoIndicaDocumentoAusente(trans)")
const indiceIntencaoAudio = caminhoAudio.indexOf("detectarIntencaoCliente(trans)")
const indiceEncaminhamentoAudio = caminhoAudio.indexOf(
  "executarIntencaoDetectadaCliente(from, u, intencaoAudio, trans)"
)
const indiceNotaAudio = caminhoAudio.indexOf(
  '"OBSERVACAO EM AUDIO SOBRE DOCUMENTO"'
)
assert.equal(indiceComandoAudio < indiceIntencaoAudio, true)
assert.equal(indiceAusenciaAudio < indiceIntencaoAudio, true)
assert.equal(indiceIntencaoAudio < indiceEncaminhamentoAudio, true)
assert.equal(indiceEncaminhamentoAudio < indiceNotaAudio, true)
assert.match(
  caminhoAudio,
  /emFluxoDocumentoAudio && !comandoDocumentoAudio && !ausenciaDocumentoAudio && intencaoAudio/
)

const caminhoTexto = trecho(
  "const emFluxoDocumento = Boolean(",
  'if (comandoDoc === "doc_cpf_skip")'
)
const indiceComandoTexto = caminhoTexto.indexOf("detectarComandoDocumento(text)")
const indiceAusenciaTexto = caminhoTexto.indexOf("textoIndicaDocumentoAusente(text)")
const indiceIntencaoTexto = caminhoTexto.indexOf("detectarIntencaoCliente(text)")
const indiceEncaminhamentoTexto = caminhoTexto.indexOf(
  "executarIntencaoDetectadaCliente(from, u, intencaoDocumento, text)"
)
const indiceDocumentoAusente = caminhoTexto.indexOf(
  "if (docTexto && indicaAusenciaDocumento)"
)
const indiceDocumentoTextual = caminhoTexto.indexOf(
  "documentoAtualAceitaTexto(docTexto)"
)
const indiceNotaTexto = caminhoTexto.indexOf('"OBSERVACAO SOBRE DOCUMENTO"')
assert.equal(indiceComandoTexto < indiceIntencaoTexto, true)
assert.equal(indiceAusenciaTexto < indiceIntencaoTexto, true)
assert.equal(indiceIntencaoTexto < indiceEncaminhamentoTexto, true)
assert.equal(indiceEncaminhamentoTexto < indiceDocumentoAusente, true)
assert.equal(indiceEncaminhamentoTexto < indiceDocumentoTextual, true)
assert.equal(indiceEncaminhamentoTexto < indiceNotaTexto, true)
assert.match(caminhoTexto, /if \(docTexto && documentoAtualAceitaTexto\(docTexto\)\)/)
assert.match(caminhoTexto, /if \(docTexto && text\.length >= 20\)/)

for (const comando of [
  "doc_cpf_skip",
  "docs_reenviar",
  "docs_maisFotos",
  "docs_proxdoc",
  "docs_pular_doc",
  "docs_depois",
  "docs_rg_verso_junto",
  "docs_rg_sem_verso",
  "docs_enviar_faltantes",
  "docs_ver_status"
]) {
  assert.match(source, new RegExp(`comandoDoc === "${comando}"`))
}

console.log("client-document-intent-priority.test.js: ok")
