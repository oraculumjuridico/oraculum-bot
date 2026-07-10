const assert = require("node:assert/strict")
const sharp = require("sharp")

const {
  comporPdfsDocumentais
} = require("../src/domain/document-pdf-composer")

async function imagem(cor) {
  return sharp({
    create: {
      width: 120,
      height: 80,
      channels: 3,
      background: cor
    }
  }).png().toBuffer()
}

function gruposVazios() {
  return {
    documentosPessoais: [],
    rgPares: [],
    rgFrentesSemVerso: [],
    rgVersosSemFrente: [],
    comprovantesResidencia: [],
    holerites: [],
    laudos: [],
    exames: [],
    receitas: [],
    documentosPrevidenciarios: [],
    documentosTrabalhistas: [],
    documentosProcessuais: [],
    outros: []
  }
}

function doc(tipoDocumento, buffer, referencia, extra = {}) {
  return {
    tipoDocumento,
    categoria: extra.categoria || null,
    subtipo: extra.subtipo || null,
    buffer,
    mimeType: "image/png",
    fileId: referencia,
    referenciaArquivoOriginal: `${referencia}.png`,
    webViewLink: `https://drive.google.com/file/d/${referencia}/view`
  }
}

function porTipo(resultado, tipo) {
  return resultado.pdfsGerados.find(pdf => pdf.tipo === tipo)
}

function assertPdfValido(pdf, paginas) {
  assert.ok(Buffer.isBuffer(pdf.buffer))
  assert.equal(pdf.buffer.subarray(0, 5).toString("ascii"), "%PDF-")
  assert.equal(pdf.paginas, paginas)
  assert.equal(pdf.originais.length, paginas)
  assert.ok(pdf.buffer.length > 500)
}

async function main() {
  const frente = doc("RG frente", await imagem("#ffffff"), "rg-frente", { categoria: "documentos_pessoais" })
  const verso = doc("RG verso", await imagem("#eeeeee"), "rg-verso", { categoria: "documentos_pessoais" })
  const holerite1 = doc("Holerite", await imagem("#d0e8ff"), "holerite-05", { categoria: "trabalhista" })
  const holerite2 = doc("Holerite", await imagem("#c0ddff"), "holerite-06", { categoria: "trabalhista" })
  const laudo1 = doc("Laudo", await imagem("#ffe0e0"), "laudo-1", { categoria: "medico" })
  const laudo2 = doc("Laudo", await imagem("#ffd0d0"), "laudo-2", { categoria: "medico" })
  const desconhecido = doc("Documento desconhecido", await imagem("#dddddd"), "outro-1", { categoria: "outros" })

  const gruposRGCompleto = gruposVazios()
  gruposRGCompleto.documentosPessoais.push(frente, verso)
  gruposRGCompleto.rgPares.push({ chave: "maria", frente, verso })

  const resultadoRGCompleto = await comporPdfsDocumentais(gruposRGCompleto)
  assertPdfValido(porTipo(resultadoRGCompleto, "RG"), 2)
  assert.equal(porTipo(resultadoRGCompleto, "RG").arquivo, "RG.pdf")
  assert.equal(porTipo(resultadoRGCompleto, "RG").originais[0].fileId, "rg-frente")
  assert.equal(resultadoRGCompleto.avisos.some(aviso => aviso.code === "DOCUMENT_PDF_RG_INCOMPLETE"), false)

  const gruposRGFrente = gruposVazios()
  gruposRGFrente.documentosPessoais.push(frente)
  gruposRGFrente.rgFrentesSemVerso.push(frente)

  const resultadoRGFrente = await comporPdfsDocumentais(gruposRGFrente)
  assertPdfValido(porTipo(resultadoRGFrente, "RG"), 1)
  assert.ok(resultadoRGFrente.avisos.some(aviso => aviso.code === "DOCUMENT_PDF_RG_INCOMPLETE"))

  const gruposHolerites = gruposVazios()
  gruposHolerites.holerites.push(holerite1, holerite2)
  gruposHolerites.documentosTrabalhistas.push(holerite1, holerite2)
  const resultadoHolerites = await comporPdfsDocumentais(gruposHolerites)
  assertPdfValido(porTipo(resultadoHolerites, "Holerites"), 2)
  assertPdfValido(porTipo(resultadoHolerites, "DocumentosTrabalhistas"), 2)

  const gruposLaudos = gruposVazios()
  gruposLaudos.laudos.push(laudo1, laudo2)
  const resultadoLaudos = await comporPdfsDocumentais(gruposLaudos)
  assertPdfValido(porTipo(resultadoLaudos, "Laudos"), 2)
  assert.equal(resultadoLaudos.erros.length, 0)

  const resultadoVazio = await comporPdfsDocumentais(gruposVazios())
  assert.deepEqual(resultadoVazio.pdfsGerados, [])
  assert.equal(resultadoVazio.erros.length, 0)

  const gruposOutros = gruposVazios()
  gruposOutros.outros.push(desconhecido)
  const resultadoOutros = await comporPdfsDocumentais(gruposOutros)
  assertPdfValido(porTipo(resultadoOutros, "Outros"), 1)
  assert.equal(porTipo(resultadoOutros, "Outros").originais[0].tipoDocumento, "Documento desconhecido")

  const gruposSemBuffer = gruposVazios()
  gruposSemBuffer.laudos.push({
    tipoDocumento: "Laudo",
    fileId: "laudo-sem-buffer",
    referenciaArquivoOriginal: "laudo-sem-buffer.pdf"
  })
  const resultadoSemBuffer = await comporPdfsDocumentais(gruposSemBuffer)
  assert.deepEqual(resultadoSemBuffer.pdfsGerados, [])
  assert.ok(resultadoSemBuffer.avisos.some(aviso => aviso.code === "DOCUMENT_PDF_SOURCE_BUFFER_MISSING"))

  const invalido = await comporPdfsDocumentais(null)
  assert.equal(invalido.pdfsGerados.length, 0)
  assert.equal(invalido.erros[0].code, "DOCUMENT_PDF_GROUPS_INVALID")
}

main()
  .then(() => console.log("document-pdf-composer.test.js: ok"))
  .catch(error => {
    console.error(error)
    process.exitCode = 1
  })
