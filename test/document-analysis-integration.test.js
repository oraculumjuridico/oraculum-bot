const assert = require("node:assert/strict")

const {
  DOCUMENT_ANALYSIS_FILE,
  DOCUMENT_ANALYSIS_FOLDER,
  processarAnaliseDocumentalPosUpload,
  removerBuffers
} = require("../src/domain/document-analysis-integration")
const {
  DOCUMENT_STATE_FILE
} = require("../src/domain/document-state-repository")
const { confirmAndDecide } = require("../src/domain/document-requirement-engine")
const { normalizarEntradaDocumental } = require("../src/domain/document-input-normalizer")

async function main() {
  const arquivo = {
    id: "drive-file-1",
    name: "RG - Frente.jpg",
    webViewLink: "https://drive.google.com/file/d/drive-file-1/view"
  }
  const buffer = Buffer.from([0xff, 0xd8, 0xff, 0x00, 0x01])
  const salvos = []
  const arquivos = new Map()
  const chamadas = []

  const deps = {
    lerJsonEmSubpastaDrive: async (pastaDriveId, nomePasta, nomeArquivo) => {
      chamadas.push(["ler", pastaDriveId, nomePasta, nomeArquivo])
      return { dados: arquivos.get(nomeArquivo) || null }
    },
    salvarJsonEmSubpastaDrive: async (pastaDriveId, nomePasta, nomeArquivo, dados) => {
      chamadas.push(["salvar", pastaDriveId, nomePasta, nomeArquivo])
      arquivos.set(nomeArquivo, dados)
      salvos.push(dados)
      return { id: `${nomeArquivo}-id`, name: nomeArquivo, folderId: "admin-folder" }
    },
    executarPipelineDocumental: async input => {
      chamadas.push(["pipeline", input.mimeType])
      return {
        preprocessamento: {
          buffer: Buffer.from("processada"),
          mimeType: "image/png",
          original: { bytes: buffer.length },
          processed: { bytes: 10 },
          avisos: [],
          erros: []
        },
        ocr: {
          textoCompleto: "RG 12.345.678-9 MARIA",
          paginasProcessadas: 1,
          avisos: [],
          erros: []
        },
        classificacao: {
          tipoDocumento: "RG frente",
          categoria: "documentos_pessoais",
          confianca: 0.91
        },
        extracao: {
          camposExtraidos: { rg: "12.345.678-9", nome: "MARIA" },
          avisos: [],
          erros: []
        }
      }
    },
    agruparDocumentosProcessados: documentos => {
      chamadas.push(["agrupar", documentos[0].fileId])
      return {
        documentosPessoais: documentos,
        rgPares: [],
        rgFrentesSemVerso: documentos,
        rgVersosSemFrente: [],
        comprovantesResidencia: [],
        holerites: [],
        laudos: [],
        exames: [],
        receitas: [],
        documentosPrevidenciarios: [],
        documentosTrabalhistas: [],
        documentosProcessuais: [],
        outros: [],
        avisos: [{ code: "DOCUMENT_GROUPER_RG_INCOMPLETE", message: "rg incompleto" }],
        erros: []
      }
    },
    logDebug: () => {},
    logErro: () => {}
  }

  const resultado = await processarAnaliseDocumentalPosUpload({
    pastaDriveId: "pasta-caso",
    arquivo,
    buffer,
    mimeType: "image/jpeg",
    nomeOriginal: "foto.jpg",
    contexto: { fluxoDocumento: "guiado" }
  }, deps)

  assert.equal(resultado.ok, true)
  assert.equal(resultado.status, "concluido")
  assert.equal(salvos.length, 2)
  assert.equal(arquivos.get(DOCUMENT_ANALYSIS_FILE).analises.length, 1)
  assert.equal(arquivos.get(DOCUMENT_ANALYSIS_FILE).analises[0].arquivo.fileId, "drive-file-1")
  assert.equal(arquivos.get(DOCUMENT_ANALYSIS_FILE).analises[0].pipeline.preprocessamento.buffer.omitido, true)
  assert.equal(arquivos.get(DOCUMENT_ANALYSIS_FILE).analises[0].agrupamentos.documentosPessoais[0].fileId, "drive-file-1")
  assert.equal(arquivos.get(DOCUMENT_STATE_FILE).analysis.analises.length, 1)
  assert.equal(arquivos.get(DOCUMENT_STATE_FILE).registry.evidencias[0].fileId, "drive-file-1")
  assert.equal(arquivos.get(DOCUMENT_STATE_FILE).registry.evidencias[0].ocr.textoCompleto, "RG 12.345.678-9 MARIA")
  assert.equal("buffer" in arquivos.get(DOCUMENT_STATE_FILE).registry.evidencias[0], false)
  assert.equal(arquivos.get(DOCUMENT_STATE_FILE).version, 1)
  assert.deepEqual(chamadas.map(item => item[0]), ["ler", "ler", "pipeline", "agrupar", "salvar", "ler", "salvar"])
  assert.deepEqual(chamadas[0], ["ler", "pasta-caso", DOCUMENT_ANALYSIS_FOLDER, DOCUMENT_ANALYSIS_FILE])

  const repetido = await processarAnaliseDocumentalPosUpload({
    pastaDriveId: "pasta-caso",
    arquivo,
    buffer,
    mimeType: "image/jpeg"
  }, deps)

  assert.equal(repetido.skipped, true)
  assert.equal(repetido.reason, "arquivo ja processado")
  assert.equal(arquivos.get(DOCUMENT_ANALYSIS_FILE).analises.length, 1)
  assert.equal(arquivos.get(DOCUMENT_STATE_FILE).analysis.analises.length, 1)

  const reprocessado = await processarAnaliseDocumentalPosUpload({
    pastaDriveId: "pasta-caso",
    arquivo,
    buffer: Buffer.from([0xff, 0xd8, 0xff, 0x00, 0x02]),
    mimeType: "image/jpeg"
  }, deps)
  assert.equal(reprocessado.skipped, false)
  assert.deepEqual(arquivos.get(DOCUMENT_STATE_FILE).registry.evidencias
    .filter(item => item.fileId === "drive-file-1").map(item => item.version), [1, 2])

  const errosRegistrados = []
  const falha = await processarAnaliseDocumentalPosUpload({
    pastaDriveId: "pasta-caso",
    arquivo: { id: "drive-file-2", name: "CNH.jpg" },
    buffer,
    mimeType: "image/jpeg"
  }, {
    ...deps,
    executarPipelineDocumental: async () => {
      throw Object.assign(new Error("ocr indisponivel"), { code: "OCR_DOWN" })
    },
    logErro: (_tipo, msg) => errosRegistrados.push(msg)
  })

  assert.equal(falha.ok, false)
  assert.equal(falha.status, "erro")
  assert.equal(arquivos.get(DOCUMENT_ANALYSIS_FILE).analises.length, 2)
  assert.equal(arquivos.get(DOCUMENT_ANALYSIS_FILE).analises.at(-1).status, "erro")
  assert.equal(arquivos.get(DOCUMENT_ANALYSIS_FILE).analises.at(-1).erros[0].code, "OCR_DOWN")
  assert.equal(arquivos.get(DOCUMENT_STATE_FILE).analysis.analises.length, 2)
  assert.equal(errosRegistrados.length, 1)

  const conflitoCaixa = await processarAnaliseDocumentalPosUpload({
    pastaDriveId: "pasta-caso",
    arquivo: { id: "drive-file-conflict", name: "RG.jpg" },
    buffer,
    mimeType: "image/jpeg",
    contexto: { folha: "Frente", partyRole: "titular" }
  }, {
    ...deps,
    executarPipelineDocumental: async input => {
      const pipeline = await deps.executarPipelineDocumental(input)
      return { ...pipeline, classificacao: { ...pipeline.classificacao, tipoDocumento: "RG verso" } }
    }
  })
  assert.equal(conflitoCaixa.ok, true)
  const evidenciaConflitante = arquivos.get(DOCUMENT_STATE_FILE).registry.evidencias
    .find(item => item.fileId === "drive-file-conflict")
  assert.deepEqual(evidenciaConflitante.coverage, ["back"], "classificacao deve prevalecer sem inventar duas faces")
  const decisaoConflitante = confirmAndDecide(arquivos.get(DOCUMENT_STATE_FILE).registry, {
    fileId: "drive-file-conflict",
    origem: "test"
  }).decision
  assert.equal(decisaoConflitante.status, "partial")

  const pdfBuffer = Buffer.from("%PDF-1.4\nfixture parcial")
  const pngPage = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  const parcialPdf = await processarAnaliseDocumentalPosUpload({
    pastaDriveId: "pasta-caso",
    arquivo: { id: "drive-pdf-partial", name: "identidade.pdf" },
    buffer: pdfBuffer,
    mimeType: "application/pdf"
  }, {
    ...deps,
    normalizarEntradaDocumental: input => normalizarEntradaDocumental(input, {
      renderPdfPages: async () => ({
        renderedPages: [{ pageNumber: 1, buffer: pngPage }, { pageNumber: 3, buffer: pngPage }],
        totalPages: 3,
        truncated: false,
        pageErrors: [{ pageNumber: 2, code: "PDF_PAGE_RENDER_ERROR" }]
      })
    })
  })
  assert.equal(parcialPdf.ok, false)
  assert.equal(parcialPdf.status, "erro")
  assert.deepEqual(parcialPdf.evidencias.map(item => item.pageNumber), [1, 3])
  assert.equal(parcialPdf.evidencias.every(item => item.status === "review"), true)
  assert.ok(parcialPdf.registry.divergencias.some(item => item.code === "document_input_requires_review"))

  assert.deepEqual(removerBuffers({ a: Buffer.from("abc") }), {
    a: { tipo: "Buffer", bytes: 3, omitido: true }
  })
}

main()
  .then(() => console.log("document-analysis-integration.test.js: ok"))
  .catch(error => {
    console.error(error)
    process.exitCode = 1
  })
