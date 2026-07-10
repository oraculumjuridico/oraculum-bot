const assert = require("node:assert/strict")

const {
  executarPipelineDocumental
} = require("../src/domain/document-pipeline-orchestrator")

async function main() {
  const ordem = []
  const imagemOriginal = Buffer.from("imagem-original")
  const imagemProcessada = Buffer.from("imagem-processada")

  const sucesso = await executarPipelineDocumental(
    { buffer: imagemOriginal, mimeType: "image/jpeg" },
    {
      preprocessarImagemDocumento: async (input) => {
        ordem.push("preprocessamento")
        assert.equal(input.buffer, imagemOriginal)
        assert.equal(input.mimeType, "image/jpeg")
        return {
          buffer: imagemProcessada,
          mimeType: "image/png",
          extension: ".png",
          original: { bytes: imagemOriginal.length, mimeType: "image/jpeg" },
          processed: { bytes: imagemProcessada.length, width: 100, height: 50 },
          steps: ["copy_buffer", "png_derivative"]
        }
      },
      executarOCRImagem: async (input) => {
        ordem.push("ocr")
        assert.equal(input.buffer, imagemProcessada)
        assert.equal(input.mimeType, "image/png")
        return {
          textoCompleto: "Nome: MARIA DA SILVA CPF: 123.456.789-09 RG: 12.345.678-9",
          paginasProcessadas: 1,
          confianca: 91,
          tempoProcessamentoMs: 12,
          avisos: [],
          erros: []
        }
      },
      classificarDocumento: async (input) => {
        ordem.push("classificacao")
        assert.match(input.textoOCR, /MARIA DA SILVA/)
        assert.equal(input.quantidadePaginas, 1)
        assert.equal(input.metadadosImagem.mimeType, "image/png")
        assert.deepEqual(input.metadadosImagem.steps, ["copy_buffer", "png_derivative"])
        return {
          tipoDocumento: "RG frente",
          categoria: "documentos_pessoais",
          subtipo: "identidade",
          confianca: 0.92,
          justificativa: "Sinais encontrados: rg.",
          candidatos: [{ tipoDocumento: "RG frente", confianca: 0.92 }]
        }
      },
      extrairDadosDocumento: async (input) => {
        ordem.push("extracao")
        assert.equal(input.tipoDocumento, "RG frente")
        assert.match(input.textoOCR, /CPF/)
        assert.equal(input.resultadoClassificador.tipoDocumento, "RG frente")
        return {
          camposExtraidos: { nome: "MARIA DA SILVA", cpf: "123.456.789-09" },
          confiancaPorCampo: { nome: 0.84, cpf: 0.9 },
          camposNaoEncontrados: ["dataNascimento"],
          avisos: [{ code: "DOCUMENT_FIELDS_NOT_FOUND", message: "um ou mais campos esperados nao foram encontrados" }],
          erros: []
        }
      }
    }
  )

  assert.deepEqual(ordem, ["preprocessamento", "ocr", "classificacao", "extracao"])
  assert.equal(sucesso.preprocessamento.buffer, imagemProcessada)
  assert.equal(sucesso.ocr.textoCompleto.includes("MARIA"), true)
  assert.equal(sucesso.classificacao.tipoDocumento, "RG frente")
  assert.equal(sucesso.extracao.camposExtraidos.cpf, "123.456.789-09")

  const falhaPreprocessamento = await executarPipelineDocumental(
    { buffer: imagemOriginal, mimeType: "image/jpeg" },
    {
      preprocessarImagemDocumento: async () => {
        const error = new Error("imagem invalida")
        error.code = "DOCUMENT_IMAGE_INVALID"
        throw error
      },
      executarOCRImagem: async () => {
        throw new Error("ocr nao deveria executar")
      }
    }
  )

  assert.equal(falhaPreprocessamento.preprocessamento.erros[0].code, "DOCUMENT_IMAGE_INVALID")
  assert.equal(falhaPreprocessamento.ocr.avisos[0].code, "DOCUMENT_PIPELINE_STEP_SKIPPED")
  assert.equal(falhaPreprocessamento.classificacao.avisos[0].code, "DOCUMENT_PIPELINE_STEP_SKIPPED")
  assert.equal(falhaPreprocessamento.extracao.avisos[0].code, "DOCUMENT_PIPELINE_STEP_SKIPPED")

  const chamadasOCRFalho = []
  const falhaOCR = await executarPipelineDocumental(
    { buffer: imagemOriginal, mimeType: "image/jpeg" },
    {
      preprocessarImagemDocumento: async () => {
        chamadasOCRFalho.push("preprocessamento")
        return {
          buffer: imagemProcessada,
          mimeType: "image/png",
          processed: { width: 100 },
          original: {},
          steps: []
        }
      },
      executarOCRImagem: async () => {
        chamadasOCRFalho.push("ocr")
        return {
          textoCompleto: "",
          paginasProcessadas: 0,
          confianca: null,
          tempoProcessamentoMs: 5,
          avisos: [],
          erros: [{ code: "OCR_PROCESSING_ERROR", message: "falha no OCR" }]
        }
      },
      classificarDocumento: async () => {
        chamadasOCRFalho.push("classificacao")
      },
      extrairDadosDocumento: async () => {
        chamadasOCRFalho.push("extracao")
      }
    }
  )

  assert.deepEqual(chamadasOCRFalho, ["preprocessamento", "ocr"])
  assert.equal(falhaOCR.preprocessamento.mimeType, "image/png")
  assert.equal(falhaOCR.ocr.erros[0].code, "OCR_PROCESSING_ERROR")
  assert.equal(falhaOCR.classificacao.avisos[0].message, "etapa classificacao interrompida porque ocr falhou")
  assert.equal(falhaOCR.extracao.avisos[0].message, "etapa extracao interrompida porque ocr falhou")

  const falhaClassificacao = await executarPipelineDocumental(
    { buffer: imagemOriginal, mimeType: "image/jpeg" },
    {
      preprocessarImagemDocumento: async () => ({
        buffer: imagemProcessada,
        mimeType: "image/png",
        processed: {},
        original: {},
        steps: []
      }),
      executarOCRImagem: async () => ({
        textoCompleto: "texto",
        paginasProcessadas: 1,
        confianca: 80,
        tempoProcessamentoMs: 4,
        avisos: [],
        erros: []
      }),
      classificarDocumento: async () => {
        throw Object.assign(new Error("classificador indisponivel"), { code: "CLASSIFIER_DOWN" })
      },
      extrairDadosDocumento: async () => {
        throw new Error("extracao nao deveria executar")
      }
    }
  )

  assert.equal(falhaClassificacao.ocr.textoCompleto, "texto")
  assert.equal(falhaClassificacao.classificacao.erros[0].code, "CLASSIFIER_DOWN")
  assert.equal(falhaClassificacao.extracao.avisos[0].message, "etapa extracao interrompida porque classificacao falhou")

  const falhaExtracao = await executarPipelineDocumental(
    { buffer: imagemOriginal, mimeType: "image/jpeg" },
    {
      preprocessarImagemDocumento: async () => ({
        buffer: imagemProcessada,
        mimeType: "image/png",
        processed: {},
        original: {},
        steps: []
      }),
      executarOCRImagem: async () => ({
        textoCompleto: "texto",
        paginasProcessadas: 1,
        confianca: 80,
        tempoProcessamentoMs: 4,
        avisos: [],
        erros: []
      }),
      classificarDocumento: async () => ({
        tipoDocumento: "Documento desconhecido",
        categoria: "outros",
        subtipo: null,
        confianca: 0.2,
        justificativa: "Texto insuficiente.",
        candidatos: []
      }),
      extrairDadosDocumento: async () => ({
        camposExtraidos: {},
        confiancaPorCampo: {},
        camposNaoEncontrados: [],
        avisos: [{ code: "DOCUMENT_TYPE_UNSUPPORTED", message: "tipo documental sem extrator configurado" }],
        erros: []
      })
    }
  )

  assert.equal(falhaExtracao.classificacao.tipoDocumento, "Documento desconhecido")
  assert.equal(falhaExtracao.extracao.avisos[0].code, "DOCUMENT_TYPE_UNSUPPORTED")
}

main()
  .then(() => console.log("document-pipeline-orchestrator.test.js: ok"))
  .catch(error => {
    console.error(error)
    process.exitCode = 1
  })
