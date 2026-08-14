"use strict"

const assert = require("node:assert/strict")
const {
  construirSinaisDocumentais,
  avaliarDocumentoComIA
} = require("../src/domain/document-ai-assistant")

async function main() {
  const pipeline = {
    digitalizacao: { applied: true, confidence: 0.82, reason: "perspective_corrected" },
    selectedVariant: "text_enhanced",
    ocr: { textoCompleto: "NOME MARIA CPF 529.982.247-25", confianca: 51 },
    classificacao: {
      tipoDocumento: "RG frente",
      categoria: "documentos_pessoais",
      confianca: 0.61,
      candidatos: [{ tipoDocumento: "RG frente", confianca: 0.61 }]
    },
    extracao: { camposExtraidos: { nome: "Maria Segredo", cpf: "52998224725" } },
    qualidade: { warnings: ["possible_blur"] },
    variantSelection: { safe: false, conflict: false }
  }
  const signals = construirSinaisDocumentais(pipeline, {
    documentoId: "doc_rg",
    documentoLabel: "RG",
    folha: "frente"
  })
  const serialized = JSON.stringify(signals)
  assert.deepEqual(signals.extractedFieldNames.sort(), ["cpf", "nome"])
  assert.equal(serialized.includes("Maria Segredo"), false)
  assert.equal(serialized.includes("52998224725"), false)
  assert.equal(serialized.includes("529.982"), false)

  let sentBody
  const reviewed = await avaliarDocumentoComIA({ pipeline, contexto: { documentoId: "doc_rg", folha: "frente" } }, {
    env: { GROQ_KEY: "fake" },
    http: {
      post: async (_url, body) => {
        sentBody = body
        return { data: { choices: [{ message: { content: '{"recommendation":"request_new_image","reasonCode":"possible_blur","missingFieldGroups":["identity"]}' } }] } }
      }
    }
  })
  assert.equal(reviewed.used, true)
  assert.equal(reviewed.recommendation, "request_new_image")
  assert.equal(JSON.stringify(sentBody).includes("Maria Segredo"), false)

  const safe = await avaliarDocumentoComIA({
    pipeline: {
      ...pipeline,
      qualidade: { warnings: [] },
      variantSelection: { safe: true, conflict: false }
    }
  }, { env: { GROQ_KEY: "fake" }, http: { post: async () => { throw new Error("não deve chamar") } } })
  assert.equal(safe.reason, "deterministic_result_safe")
  console.log("document-ai-assistant.test.js: ok")
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
})
