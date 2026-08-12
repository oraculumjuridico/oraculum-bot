const assert = require("node:assert/strict")
const { consolidarDocumentosDoCaso, prepararDocumentosDasAnalises } = require("../src/domain/document-consolidation")

function analise(fileId, tipo, hash) {
  return {
    status: "concluido",
    versaoPipeline: "fixture-v1",
    arquivo: { fileId, nome: `${fileId}.png`, nomeOriginal: `${fileId}.png`, mimeType: "image/png", webViewLink: `fixture://${fileId}`, hash },
    pipeline: { classificacao: { tipoDocumento: tipo, categoria: "ficticia" }, extracao: { camposExtraidos: {} } }
  }
}

async function main() {
  const paginasPdf = await prepararDocumentosDasAnalises([{
    status: "concluido",
    arquivo: { fileId: "pdf-1", nome: "entrada.pdf", mimeType: "application/pdf" },
    pipeline: { units: [
      { unit: { pageNumber: 1 }, pipeline: { classificacao: { tipoDocumento: "RG frente" }, extracao: { camposExtraidos: { nome: "Pessoa Piloto" } } } },
      { unit: { pageNumber: 2 }, pipeline: { classificacao: { tipoDocumento: "RG verso" }, extracao: { camposExtraidos: {} } } }
    ] }
  }], {
    baixarArquivoDrive: async () => Buffer.from("pdf-ficticio"),
    normalizarEntradaDocumental: async () => ({ units: [
      { pageNumber: 1, mimeType: "image/png", buffer: Buffer.from("pagina-1") },
      { pageNumber: 2, mimeType: "image/png", buffer: Buffer.from("pagina-2") }
    ] })
  })
  assert.equal(paginasPdf.documentos.length, 2)
  assert.equal(paginasPdf.arquivosPreparados, 1)
  assert.ok(paginasPdf.documentos.every(item => item.sourceFileId === "pdf-1"))
  assert.deepEqual(paginasPdf.documentos.map(item => item.classificacao.tipoDocumento), ["RG frente", "RG verso"])
  assert.ok(paginasPdf.documentos.every(item => item.mimeType === "image/png" && Buffer.isBuffer(item.buffer)))

  let estado = {
    analysis: { analises: [analise("pessoal-1", "RG frente", "h1"), analise("ctps-1", "CTPS pagina", "h2"), analise("residencia-1", "Comprovante de residencia", "h3"), { status: "erro", arquivo: { fileId: "erro-1" } }] },
    registry: {},
    pdfs: []
  }
  const downloads = []
  const salvos = []
  const estadosPersistidos = []
  let documentosAgrupados
  let composicoes = 0
  let versaoRegistry = 0
  let falhaPdfAtiva = true
  const downloadsComExcecao = new Set()
  const deps = {
    carregarEstadoDocumental: async () => estado,
    atualizarEstadoDocumental: async (_pastaId, parcial) => {
      assert.equal(JSON.stringify(parcial).includes('"buffer"'), false)
      estado = { ...estado, ...parcial }
      estadosPersistidos.push(parcial)
      return { arquivo: { id: "estado-ficticio" }, estado }
    },
    baixarArquivoDrive: async fileId => {
      downloads.push(fileId)
      if (downloadsComExcecao.has(fileId)) {
        const error = new Error("mensagem sensivel ficticia")
        error.code = "DOWNLOAD_TIMEOUT"
        throw error
      }
      return fileId === "download-falho" ? null : Buffer.from(`fixture-${fileId}`)
    },
    agruparDocumentosProcessados: documentos => {
      documentosAgrupados = documentos
      return {
        documentosPessoais: documentos.filter(item => item.classificacao.tipoDocumento === "RG frente"),
        ctps: [{ documentos: documentos.filter(item => item.classificacao.tipoDocumento.includes("CTPS")) }],
        comprovantesResidencia: documentos.filter(item => item.classificacao.tipoDocumento.includes("Comprovante")),
        avisos: [], erros: []
      }
    },
    comporPdfsDocumentais: async grupos => {
      composicoes += 1
      assert.equal(grupos.documentosPessoais.length, 1)
      assert.equal(grupos.ctps[0].documentos.length, 1)
      assert.equal(grupos.comprovantesResidencia.length, 1)
      return {
        pdfsGerados: [
          { tipo: "DocumentosPessoais", arquivo: "01_Documentos_Pessoais.pdf", buffer: Buffer.from("pdf-pessoal"), paginas: 1, originais: [{ fileId: "pessoal-1", nome: "pessoal-1.png" }] },
          { tipo: "CTPS_1", arquivo: "02_CTPS_1.pdf", buffer: Buffer.from("pdf-ctps"), paginas: 1, originais: [{ fileId: "ctps-1", nome: "ctps-1.png" }] },
          { tipo: "ComprovanteResidencia", arquivo: "04_Comprovante_de_Residencia.pdf", buffer: Buffer.from("pdf-residencia"), paginas: 1, originais: [{ fileId: "residencia-1", nome: "residencia-1.png" }] },
          { tipo: "Falha", arquivo: "Falha.pdf", buffer: Buffer.from("pdf-falha"), paginas: 1, originais: [] }
        ], avisos: [], erros: []
      }
    },
    salvarArquivoBinarioDrive: async (pastaId, nome, buffer, mimeType) => {
      assert.equal(pastaId, "pasta-ficticia")
      assert.equal(mimeType, "application/pdf")
      assert.ok(Buffer.isBuffer(buffer))
      salvos.push(nome)
      return nome === "Falha.pdf" && falhaPdfAtiva ? null : { id: `drive-${nome}`, name: nome, webViewLink: `fixture://${nome}`, mimeType }
    },
    criarDocumentRegistry: input => ({ versao: "fixture", documentos: input.analises, pdfs: input.pdfs, metadados: {}, versaoMaterial: ++versaoRegistry }),
    atualizarDocumentRegistry: (registry, input) => ({ ...registry, pdfs: input.pdfs, versaoMaterial: ++versaoRegistry }),
    logDebug: () => {}, logErro: () => {}
  }

  const primeiro = await consolidarDocumentosDoCaso({ pastaDriveId: "pasta-ficticia", numeroCaso: "CASO-FICTICIO", documentosEsperados: ["pessoais", "ctps", "residencia"] }, deps)
  assert.equal(primeiro.ok, false)
  assert.equal(primeiro.skipped, false)
  assert.equal(primeiro.reason, "consolidacao incompleta")
  assert.deepEqual(downloads, ["pessoal-1", "ctps-1", "residencia-1"])
  assert.equal(documentosAgrupados.length, 3)
  assert.deepEqual(salvos, ["01_Documentos_Pessoais.pdf", "02_CTPS_1.pdf", "04_Comprovante_de_Residencia.pdf", "Falha.pdf"])
  assert.equal(primeiro.pdfsSalvos, 3)
  assert.ok(primeiro.erros.some(item => item.code === "DOCUMENT_CONSOLIDATION_PDF_SAVE_FAILED"))
  assert.equal(estado.registry.metadados.consolidacaoCompleta, false)
  assert.equal(estado.registry.metadados.assinaturaConsolidacao, null)
  assert.equal(estado.analysis.analises.length, 4)
  assert.ok(estado.pdfs.every(pdf => pdf.originais.every(original => original.fileId && original.nome)))
  const segundo = await consolidarDocumentosDoCaso({ pastaDriveId: "pasta-ficticia", numeroCaso: "CASO-FICTICIO", documentosEsperados: ["pessoais", "ctps", "residencia"] }, deps)
  assert.equal(segundo.ok, false)
  assert.equal(segundo.skipped, false)
  assert.equal(segundo.reason, "consolidacao incompleta")
  assert.equal(downloads.length, 6)
  assert.equal(composicoes, 2)
  assert.equal(salvos.filter(nome => nome === "Falha.pdf").length, 2)

  falhaPdfAtiva = false
  const terceiro = await consolidarDocumentosDoCaso({ pastaDriveId: "pasta-ficticia", numeroCaso: "CASO-FICTICIO", documentosEsperados: ["pessoais", "ctps", "residencia"] }, deps)
  assert.equal(terceiro.ok, true)
  assert.equal(terceiro.skipped, false)
  assert.equal(estado.registry.metadados.consolidacaoCompleta, true)
  assert.ok(estado.registry.metadados.assinaturaConsolidacao)
  assert.deepEqual(estado.registry.metadados.pdfsEsperados, ["01_Documentos_Pessoais.pdf", "02_CTPS_1.pdf", "04_Comprovante_de_Residencia.pdf", "Falha.pdf"])
  assert.equal(estado.pdfs.length, 4)
  assert.ok(estado.pdfs.every(pdf => pdf.fileId))
  const downloadsAposSucesso = downloads.length
  const composicoesAposSucesso = composicoes
  const versaoAposSucesso = versaoRegistry

  const quarto = await consolidarDocumentosDoCaso({ pastaDriveId: "pasta-ficticia", numeroCaso: "CASO-FICTICIO", documentosEsperados: ["pessoais", "ctps", "residencia"] }, deps)
  assert.equal(quarto.skipped, true)
  assert.equal(quarto.reason, "consolidacao sem alteracoes")
  assert.equal(downloads.length, downloadsAposSucesso)
  assert.equal(composicoes, composicoesAposSucesso)
  assert.equal(versaoRegistry, versaoAposSucesso)

  estado.analysis.analises.push(analise("download-falho", "RG verso", "h4"))
  estado.analysis.analises.push(analise("download-excecao", "RG verso", "h5"))
  downloadsComExcecao.add("download-excecao")
  const quinto = await consolidarDocumentosDoCaso({ pastaDriveId: "pasta-ficticia", numeroCaso: "CASO-FICTICIO", documentosEsperados: ["pessoais", "ctps", "residencia"] }, deps)
  const avisosDownload = quinto.avisos.filter(item => item.code === "DOCUMENT_CONSOLIDATION_DOWNLOAD_FAILED")
  assert.equal(avisosDownload.length, 2)
  assert.ok(avisosDownload.some(item => item.fileId === "download-falho" && item.technicalCode === "DOWNLOAD_EMPTY"))
  assert.ok(avisosDownload.some(item => item.fileId === "download-excecao" && item.technicalCode === "DOWNLOAD_TIMEOUT"))
  assert.equal(JSON.stringify(avisosDownload).includes("mensagem sensivel"), false)
  assert.equal(documentosAgrupados.length, 3, "outros documentos devem continuar apos falhas de download")
  assert.equal(quinto.ok, false)
  assert.equal(quinto.skipped, false)
  assert.equal(quinto.reason, "consolidacao incompleta")
  assert.equal(estado.registry.metadados.consolidacaoCompleta, false)
  assert.equal(estado.registry.metadados.assinaturaConsolidacao, null)
  assert.equal(JSON.stringify(estado).includes("mensagem sensivel"), false)
  const tentativasNullAntes = downloads.filter(fileId => fileId === "download-falho").length
  const tentativasExcecaoAntes = downloads.filter(fileId => fileId === "download-excecao").length
  const sexta = await consolidarDocumentosDoCaso({ pastaDriveId: "pasta-ficticia", numeroCaso: "CASO-FICTICIO", documentosEsperados: ["pessoais", "ctps", "residencia"] }, deps)
  assert.equal(sexta.skipped, false)
  assert.equal(downloads.filter(fileId => fileId === "download-falho").length, tentativasNullAntes + 1)
  assert.equal(downloads.filter(fileId => fileId === "download-excecao").length, tentativasExcecaoAntes + 1)

  let estadoSemElegiveisPersistido
  const semElegiveis = await consolidarDocumentosDoCaso({ pastaDriveId: "pasta-zero", documentosEsperados: [] }, {
    ...deps,
    carregarEstadoDocumental: async () => ({ analysis: { analises: [{ status: "erro", arquivo: { fileId: "invalido" } }] }, registry: {}, pdfs: [] }),
    atualizarEstadoDocumental: async (_pastaId, parcial) => { estadoSemElegiveisPersistido = parcial; return { arquivo: { id: "estado-zero" } } },
    agruparDocumentosProcessados: () => ({ avisos: [], erros: [] }),
    comporPdfsDocumentais: async () => ({ pdfsGerados: [], avisos: [], erros: [] })
  })
  assert.equal(semElegiveis.ok, false)
  assert.equal(semElegiveis.skipped, false)
  assert.equal(semElegiveis.reason, "consolidacao incompleta")
  assert.equal(estadoSemElegiveisPersistido.registry.metadados.consolidacaoCompleta, false)
  assert.equal(estadoSemElegiveisPersistido.registry.metadados.assinaturaConsolidacao, null)

  let estadoSemPdfsPersistido
  const semPdfs = await consolidarDocumentosDoCaso({ pastaDriveId: "pasta-sem-pdfs", documentosEsperados: [] }, {
    ...deps,
    carregarEstadoDocumental: async () => ({ analysis: { analises: [analise("elegivel-sem-pdf", "Documento ficticio", "hz")] }, registry: {}, pdfs: [] }),
    atualizarEstadoDocumental: async (_pastaId, parcial) => { estadoSemPdfsPersistido = parcial; return { arquivo: { id: "estado-sem-pdfs" } } },
    agruparDocumentosProcessados: documentos => ({ outros: documentos, avisos: [], erros: [] }),
    comporPdfsDocumentais: async () => ({ pdfsGerados: [], avisos: [], erros: [] })
  })
  assert.equal(semPdfs.ok, false)
  assert.equal(semPdfs.skipped, false)
  assert.equal(semPdfs.reason, "consolidacao incompleta")
  assert.equal(estadoSemPdfsPersistido.registry.metadados.consolidacaoCompleta, false)
  assert.equal(estadoSemPdfsPersistido.registry.metadados.assinaturaConsolidacao, null)
  assert.ok(estadosPersistidos.length >= 3)
}

main().then(() => console.log("document-consolidation.test.js: ok")).catch(error => { console.error(error); process.exitCode = 1 })
