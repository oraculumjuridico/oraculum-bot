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

async function imagemDocumentoInclinado() {
  return sharp(Buffer.from(`
    <svg width="800" height="600" xmlns="http://www.w3.org/2000/svg">
      <rect width="800" height="600" fill="#737373"/>
      <polygon points="115,95 700,135 650,520 150,485" fill="#ffffff" stroke="#111111" stroke-width="10"/>
      <text x="250" y="290" font-size="42" fill="#111111">DOCUMENTO</text>
    </svg>
  `)).jpeg({ quality: 92 }).toBuffer()
}

function gruposVazios() {
  return {
    documentosPessoais: [],
    rgPares: [],
    rgFrentesSemVerso: [],
    rgVersosSemFrente: [],
    comprovantesResidencia: [],
    ctps: [],
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
    webViewLink: `fixture://${referencia}`
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
  const certidao = doc("Certidao de nascimento", await imagem("#fafafa"), "certidao-ficticia", { categoria: "documentos_pessoais" })
  const residencia = doc("Comprovante de residencia", await imagem("#f0f0f0"), "residencia-ficticia", { categoria: "documentos_pessoais" })
  const ctpsA1 = { ...doc("CTPS pagina", await imagem("#e0e0ff"), "ctps-a-1"), pageNumber: 1 }
  const ctpsA2 = { ...doc("CTPS pagina", await imagem("#d0d0ff"), "ctps-a-2"), pageNumber: 2 }
  const ctpsB = { ...doc("CTPS pagina", await imagem("#c0c0ff"), "ctps-b-1"), pageNumber: 1 }
  const holerite1 = doc("Holerite", await imagem("#d0e8ff"), "holerite-05", { categoria: "trabalhista" })
  const holerite2 = doc("Holerite", await imagem("#c0ddff"), "holerite-06", { categoria: "trabalhista" })
  const laudo1 = doc("Laudo", await imagem("#ffe0e0"), "laudo-1", { categoria: "medico" })
  const laudo2 = doc("Laudo", await imagem("#ffd0d0"), "laudo-2", { categoria: "medico" })
  const desconhecido = doc("Documento desconhecido", await imagem("#dddddd"), "outro-1", { categoria: "outros" })

  const gruposRGCompleto = gruposVazios()
  gruposRGCompleto.documentosPessoais.push(frente, verso, certidao)
  gruposRGCompleto.rgPares.push({ chave: "maria", frente, verso })
  gruposRGCompleto.comprovantesResidencia.push(residencia)
  gruposRGCompleto.ctps.push({ chave: "a", confiavel: true, documentos: [ctpsA1, ctpsA2] }, { chave: "b", confiavel: true, documentos: [ctpsB] })

  const resultadoRGCompleto = await comporPdfsDocumentais(gruposRGCompleto)
  assertPdfValido(porTipo(resultadoRGCompleto, "DocumentosPessoais"), 3)
  assert.equal(porTipo(resultadoRGCompleto, "DocumentosPessoais").arquivo, "01_Documentos_Pessoais.pdf")
  assert.equal(porTipo(resultadoRGCompleto, "DocumentosPessoais").originais[0].fileId, "rg-frente")
  assertPdfValido(porTipo(resultadoRGCompleto, "ComprovanteResidencia"), 1)
  assert.equal(porTipo(resultadoRGCompleto, "ComprovanteResidencia").arquivo, "04_Comprovante_de_Residencia.pdf")
  assertPdfValido(porTipo(resultadoRGCompleto, "CTPS_1"), 2)
  assert.equal(porTipo(resultadoRGCompleto, "CTPS_1").arquivo, "02_CTPS_1.pdf")
  assert.deepEqual(porTipo(resultadoRGCompleto, "CTPS_1").originais.map(item => item.fileId), ["ctps-a-1", "ctps-a-2"])
  assert.equal(porTipo(resultadoRGCompleto, "CTPS_2").arquivo, "03_CTPS_2.pdf")
  assert.equal(resultadoRGCompleto.pdfsGerados.some(pdf => ["RG.pdf", "CNH.pdf", "Certidao.pdf"].includes(pdf.arquivo)), false)
  assert.equal(resultadoRGCompleto.avisos.some(aviso => aviso.code === "DOCUMENT_PDF_RG_INCOMPLETE"), false)

  const gruposRGFrente = gruposVazios()
  gruposRGFrente.documentosPessoais.push(frente)
  gruposRGFrente.rgFrentesSemVerso.push(frente)

  const resultadoRGFrente = await comporPdfsDocumentais(gruposRGFrente)
  assertPdfValido(porTipo(resultadoRGFrente, "DocumentosPessoais"), 1)
  assert.ok(resultadoRGFrente.avisos.some(aviso => aviso.code === "DOCUMENT_PDF_RG_INCOMPLETE"))

  const gruposHolerites = gruposVazios()
  gruposHolerites.holerites.push(holerite1, holerite2)
  gruposHolerites.documentosTrabalhistas.push(holerite1, holerite2)
  const resultadoHolerites = await comporPdfsDocumentais(gruposHolerites)
  assertPdfValido(porTipo(resultadoHolerites, "Holerites"), 2)
  assert.equal(porTipo(resultadoHolerites, "DocumentosTrabalhistas"), undefined)

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

  const gruposScanner = gruposVazios()
  gruposScanner.outros.push(doc("Documento desconhecido", await imagemDocumentoInclinado(), "scanner-1", { categoria: "outros" }))
  const resultadoScanner = await comporPdfsDocumentais(gruposScanner)
  assert.equal(porTipo(resultadoScanner, "Outros").digitalizacoes[0].applied, true)
  assert.ok(porTipo(resultadoScanner, "Outros").digitalizacoes[0].confidence >= 0.68)

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
