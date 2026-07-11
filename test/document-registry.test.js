const assert = require("node:assert/strict")

const {
  DOCUMENT_REGISTRY_VERSION,
  criarDocumentRegistry,
  atualizarDocumentRegistry,
  registrarDocumento,
  registrarPdfs
} = require("../src/domain/document-registry")

const NOW = "2026-07-08T12:00:00.000Z"

function pipeline(tipoDocumento, categoria, camposExtraidos = {}) {
  return {
    preprocessamento: { original: { bytes: 100 }, avisos: [], erros: [] },
    ocr: { textoCompleto: "texto OCR", paginasProcessadas: 1, avisos: [], erros: [] },
    classificacao: { tipoDocumento, categoria, confianca: 0.9 },
    extracao: { camposExtraidos, avisos: [], erros: [] }
  }
}

function analise({ fileId, nome, tipoDocumento, categoria, hash, status = "concluido", dataProcessamento = NOW }) {
  return {
    status,
    dataProcessamento,
    arquivo: {
      fileId,
      nome,
      mimeType: "image/jpeg",
      webViewLink: `https://drive.google.com/file/d/${fileId}/view`,
      hash
    },
    hash,
    pipeline: pipeline(tipoDocumento, categoria, { nome: "MARIA" }),
    agrupamentos: null,
    avisos: [],
    erros: status === "erro" ? [{ code: "OCR_ERROR", message: "falha OCR" }] : []
  }
}

function main() {
  const rgFrente = analise({
    fileId: "file-rg-frente",
    nome: "RG frente.jpg",
    tipoDocumento: "RG frente",
    categoria: "documentos_pessoais",
    hash: "hash-rg-frente"
  })
  const holerite = analise({
    fileId: "file-holerite",
    nome: "Holerite maio.jpg",
    tipoDocumento: "Holerite",
    categoria: "trabalhista",
    hash: "hash-holerite"
  })

  const registry = criarDocumentRegistry({
    numeroCaso: "ORA-001",
    pastaDriveId: "pasta-caso",
    analises: [rgFrente, holerite],
    agrupamentos: {
      documentosPessoais: [{ fileId: "file-rg-frente" }],
      rgFrentesSemVerso: [{ fileId: "file-rg-frente", tipoDocumento: "RG frente" }],
      holerites: [{ fileId: "file-holerite" }],
      documentosTrabalhistas: [{ fileId: "file-holerite" }]
    },
    documentosEsperados: [
      { tipoDocumento: "RG frente", label: "RG frente" },
      { tipoDocumento: "RG verso", label: "RG verso" },
      { tipoDocumento: "Holerite", label: "Holerite" }
    ]
  }, { now: NOW })

  assert.equal(registry.versao, DOCUMENT_REGISTRY_VERSION)
  assert.equal(registry.documentos.length, 2)
  assert.equal(registry.documentos[0].fileId, "file-rg-frente")
  assert.equal(registry.documentos[0].drive.webViewLink.includes("file-rg-frente"), true)
  assert.equal(registry.grupos.length, 4)
  assert.ok(registry.pendencias.some(p => p.code === "DOCUMENT_REGISTRY_RG_BACK_MISSING"))
  assert.ok(registry.pendencias.some(p => p.code === "DOCUMENT_REGISTRY_DOCUMENT_MISSING" && p.tipoDocumento === "RG verso"))
  assert.equal(registry.estatisticas.totalDocumentos, 2)
  assert.equal(registry.estatisticas.documentosVigentes, 2)
  assert.equal(registry.estatisticas.porTipo["RG frente"], 1)
  assert.equal(registry.metadados.casoId, "ORA-001")

  const reprocessado = atualizarDocumentRegistry(registry, {
    analises: [analise({
      fileId: "file-rg-frente",
      nome: "RG frente reprocessado.jpg",
      tipoDocumento: "RG frente",
      categoria: "documentos_pessoais",
      hash: "hash-rg-frente"
    })]
  }, { now: "2026-07-08T13:00:00.000Z" })

  const rgAtualizado = reprocessado.documentos.find(doc => doc.fileId === "file-rg-frente")
  assert.equal(rgAtualizado.versoes.length, 2)
  assert.equal(rgAtualizado.versaoAtual, 2)
  assert.equal(rgAtualizado.nome, "RG frente reprocessado.jpg")
  assert.equal(rgAtualizado.historicoProcessamento.at(-1).evento, "documento_reprocessado")
  assert.equal(reprocessado.estatisticas.totalVersoes, 3)

  const comDuplicado = atualizarDocumentRegistry(reprocessado, {
    documentos: [{
      fileId: "file-rg-frente-copia",
      nome: "RG frente copia.jpg",
      hash: "hash-rg-frente",
      tipoDocumento: "RG frente",
      categoria: "documentos_pessoais",
      webViewLink: "https://drive.google.com/file/d/file-rg-frente-copia/view"
    }]
  }, { now: "2026-07-08T14:00:00.000Z" })

  const duplicados = comDuplicado.documentos.filter(doc => doc.duplicado)
  assert.equal(duplicados.length, 2)
  assert.ok(comDuplicado.divergencias.some(div => div.code === "DOCUMENT_REGISTRY_DUPLICATE"))
  assert.equal(comDuplicado.estatisticas.documentosDuplicados, 2)

  const tipoAlterado = atualizarDocumentRegistry(comDuplicado, {
    documentos: [{
      fileId: "file-holerite",
      nome: "Holerite revisado.jpg",
      hash: "hash-holerite",
      tipoDocumento: "Documento desconhecido",
      categoria: "outros"
    }]
  }, { now: "2026-07-08T15:00:00.000Z" })

  const holeriteAtualizado = tipoAlterado.documentos.find(doc => doc.fileId === "file-holerite")
  assert.equal(holeriteAtualizado.versoes.length, 2)
  assert.ok(tipoAlterado.divergencias.some(div => div.code === "DOCUMENT_REGISTRY_TYPE_CHANGED"))

  const comPdf = registrarPdfs(tipoAlterado, [{
    tipo: "RG",
    arquivo: "RG.pdf",
    paginas: 1,
    fileId: "pdf-rg-v1",
    webViewLink: "https://drive.google.com/file/d/pdf-rg-v1/view",
    originais: [{ fileId: "file-rg-frente" }]
  }], { now: "2026-07-08T16:00:00.000Z" })

  assert.equal(comPdf.pdfs.length, 1)
  assert.equal(comPdf.pdfs[0].tipo, "RG")
  assert.equal(comPdf.pdfs[0].drive.fileId, "pdf-rg-v1")
  assert.equal(comPdf.estatisticas.totalPdfs, 1)

  const pdfIdempotenteInicial = registrarPdfs(comPdf, [{
    tipo: "DocumentosPessoais",
    arquivo: "01_Documentos_Pessoais.pdf",
    paginas: 2,
    hash: "hash-pdf-ficticio-v1",
    fileId: "pdf-ficticio-1",
    dataGeracao: "2026-07-08T16:10:00.000Z",
    originais: [
      { fileId: "original-a", nome: "original-a.png", referenciaArquivoOriginal: "origem-a", pageNumber: 1, metadadoPreservado: "a" },
      { fileId: "original-b", arquivo: "original-b.png", referenciaArquivoOriginal: "origem-b", folha: 2, metadadoPreservado: "b" }
    ]
  }], { now: "2026-07-08T16:10:00.000Z" })
  const pdfIdempotente = pdfIdempotenteInicial.pdfs.find(pdf => pdf.arquivo === "01_Documentos_Pessoais.pdf")
  assert.equal(pdfIdempotente.versao, 1)
  assert.equal(pdfIdempotente.dataGeracao, "2026-07-08T16:10:00.000Z")
  assert.equal(pdfIdempotente.originais[0].metadadoPreservado, "a")

  const pdfIgual = registrarPdfs(pdfIdempotenteInicial, [{
    tipo: "DocumentosPessoais", arquivo: "01_Documentos_Pessoais.pdf", paginas: 2,
    hash: "hash-pdf-ficticio-v1", fileId: "pdf-ficticio-1",
    originais: pdfIdempotente.originais
  }], { now: "2026-07-08T16:20:00.000Z" })
  assert.equal(pdfIgual.pdfs.length, 2)
  assert.equal(pdfIgual.pdfs.find(pdf => pdf.arquivo === "01_Documentos_Pessoais.pdf").versao, 1)
  assert.equal(pdfIgual.pdfs.find(pdf => pdf.arquivo === "01_Documentos_Pessoais.pdf").dataGeracao, "2026-07-08T16:10:00.000Z")

  const pdfOrdemInvertida = registrarPdfs(pdfIgual, [{
    tipo: "DocumentosPessoais", arquivo: "01_Documentos_Pessoais.pdf", paginas: 2,
    hash: "hash-pdf-ficticio-v1", fileId: "pdf-ficticio-1",
    originais: [...pdfIdempotente.originais].reverse()
  }], { now: "2026-07-08T16:30:00.000Z" })
  assert.equal(pdfOrdemInvertida.pdfs.find(pdf => pdf.arquivo === "01_Documentos_Pessoais.pdf").versao, 1)
  assert.equal(pdfOrdemInvertida.pdfs.find(pdf => pdf.arquivo === "01_Documentos_Pessoais.pdf").dataGeracao, "2026-07-08T16:10:00.000Z")

  const pdfHashAlterado = registrarPdfs(pdfOrdemInvertida, [{
    tipo: "DocumentosPessoais", arquivo: "01_Documentos_Pessoais.pdf", paginas: 2,
    hash: "hash-pdf-ficticio-v2", fileId: "pdf-ficticio-1", originais: pdfIdempotente.originais
  }], { now: "2026-07-08T16:40:00.000Z" })
  assert.equal(pdfHashAlterado.pdfs.find(pdf => pdf.arquivo === "01_Documentos_Pessoais.pdf").versao, 2)

  const pdfOriginalAlterado = registrarPdfs(pdfHashAlterado, [{
    tipo: "DocumentosPessoais", arquivo: "01_Documentos_Pessoais.pdf", paginas: 2,
    hash: "hash-pdf-ficticio-v2", fileId: "pdf-ficticio-1",
    originais: [pdfIdempotente.originais[0], { ...pdfIdempotente.originais[1], fileId: "original-c" }]
  }], { now: "2026-07-08T16:50:00.000Z" })
  assert.equal(pdfOriginalAlterado.pdfs.find(pdf => pdf.arquivo === "01_Documentos_Pessoais.pdf").versao, 3)

  const pdfSubstituido = registrarPdfs(comPdf, [{
    tipo: "RG",
    arquivo: "RG.pdf",
    paginas: 2,
    fileId: "pdf-rg-v2"
  }], { now: "2026-07-08T17:00:00.000Z" })

  assert.equal(pdfSubstituido.pdfs.length, 1)
  assert.equal(pdfSubstituido.pdfs[0].versao, 2)
  assert.equal(pdfSubstituido.pdfs[0].drive.fileId, "pdf-rg-v2")

  const erroRegistrado = registrarDocumento(pdfSubstituido, {
    fileId: "file-exame",
    nome: "Exame ilegivel.jpg",
    hash: "hash-exame",
    tipoDocumento: "Exame",
    categoria: "medico",
    status: "erro",
    erros: [{ code: "OCR_ERROR", message: "imagem ilegivel" }]
  }, { now: "2026-07-08T18:00:00.000Z" })

  assert.equal(erroRegistrado.documentos.find(doc => doc.fileId === "file-exame").status, "erro")
  assert.equal(erroRegistrado.estatisticas.documentosComErro, 1)

  const vazio = criarDocumentRegistry({
    documentosEsperados: ["CNH"]
  }, { now: NOW })
  assert.equal(vazio.documentos.length, 0)
  assert.equal(vazio.pendencias[0].code, "DOCUMENT_REGISTRY_DOCUMENT_MISSING")
}

main()
console.log("document-registry.test.js: ok")
