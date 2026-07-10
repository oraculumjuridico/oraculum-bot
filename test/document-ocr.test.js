const assert = require("node:assert/strict")

const {
  SUPPORTED_OCR_IMAGE_MIME_TYPES,
  executarOCRImagem
} = require("../src/domain/document-ocr")

function criarWorkerFalso(result, calls) {
  return {
    async setParameters(parameters) {
      calls.parameters = parameters
    },
    async recognize(buffer, recognizeOptions, output, jobId) {
      calls.recognize = {
        buffer,
        recognizeOptions,
        output,
        jobId
      }
      if (result instanceof Error) {
        throw result
      }
      return result
    },
    async terminate() {
      calls.terminated = true
    }
  }
}

async function main() {
  assert.equal(SUPPORTED_OCR_IMAGE_MIME_TYPES.has("image/png"), true)
  assert.equal(SUPPORTED_OCR_IMAGE_MIME_TYPES.has("application/pdf"), false)

  const original = Buffer.from("imagem-processada")
  const copia = Buffer.from(original)
  const calls = {}
  const resultado = await executarOCRImagem(
    {
      buffer: original,
      mimeType: "image/png"
    },
    {
      createWorker: async (language, oem, workerOptions, workerConfig) => {
        calls.worker = {
          language,
          oem,
          workerOptions,
          workerConfig
        }
        return criarWorkerFalso({
          data: {
            text: "Texto lido pelo OCR",
            confidence: 93.4
          }
        }, calls)
      },
      language: "por",
      workerOptions: { cacheMethod: "readOnly" },
      workerConfig: { load_system_dawg: "0" },
      parameters: { preserve_interword_spaces: "1" },
      recognizeOptions: { rectangle: { top: 0, left: 0, width: 100, height: 50 } },
      output: { text: true },
      jobId: "ocr-test"
    }
  )

  assert.equal(Buffer.compare(original, copia), 0, "o buffer original nao pode ser alterado")
  assert.equal(calls.worker.language, "por")
  assert.equal(calls.worker.workerOptions.cacheMethod, "readOnly")
  assert.equal(calls.worker.workerConfig.load_system_dawg, "0")
  assert.deepEqual(calls.parameters, { preserve_interword_spaces: "1" })
  assert.notEqual(calls.recognize.buffer, original, "o OCR deve receber uma copia do buffer")
  assert.equal(Buffer.compare(calls.recognize.buffer, original), 0)
  assert.equal(calls.recognize.jobId, "ocr-test")
  assert.equal(calls.terminated, true)
  assert.equal(resultado.textoCompleto, "Texto lido pelo OCR")
  assert.equal(resultado.paginasProcessadas, 1)
  assert.equal(resultado.confianca, 93.4)
  assert.equal(resultado.avisos.length, 0)
  assert.equal(resultado.erros.length, 0)
  assert.ok(resultado.tempoProcessamentoMs >= 0)

  const textoVazio = await executarOCRImagem(
    { buffer: Buffer.from("png"), mimeType: "image/png" },
    {
      createWorker: async () => criarWorkerFalso({
        data: {
          text: "   "
        }
      }, {})
    }
  )
  assert.equal(textoVazio.textoCompleto, "   ")
  assert.equal(textoVazio.paginasProcessadas, 1)
  assert.equal(textoVazio.confianca, null)
  assert.equal(textoVazio.erros.length, 0)
  assert.ok(textoVazio.avisos.some(aviso => aviso.code === "OCR_TEXT_EMPTY"))
  assert.ok(textoVazio.avisos.some(aviso => aviso.code === "OCR_CONFIDENCE_UNAVAILABLE"))

  const mimeInvalido = await executarOCRImagem({
    buffer: Buffer.from("pdf"),
    mimeType: "application/pdf"
  }, {
    createWorker: async () => {
      throw new Error("nao deveria criar worker para mime invalido")
    }
  })
  assert.equal(mimeInvalido.textoCompleto, "")
  assert.equal(mimeInvalido.paginasProcessadas, 0)
  assert.equal(mimeInvalido.confianca, null)
  assert.equal(mimeInvalido.erros[0].code, "OCR_IMAGE_UNSUPPORTED_MIME")

  const falhaOCR = await executarOCRImagem(
    { buffer: Buffer.from("png"), mimeType: "image/png" },
    {
      createWorker: async () => criarWorkerFalso(
        Object.assign(new Error("falha no engine"), { code: "OCR_ENGINE_DOWN" }),
        calls
      )
    }
  )
  assert.equal(falhaOCR.textoCompleto, "")
  assert.equal(falhaOCR.paginasProcessadas, 0)
  assert.equal(falhaOCR.confianca, null)
  assert.equal(falhaOCR.erros[0].code, "OCR_ENGINE_DOWN")
}

main()
  .then(() => console.log("document-ocr.test.js: ok"))
  .catch(error => {
    console.error(error)
    process.exitCode = 1
  })
