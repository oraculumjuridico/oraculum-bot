const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")

const {
  canonicalizePipeline,
  consolidateCase,
  sanitizeCaseAnalysis,
  sanitizeAnalysisReport
} = require("../src/domain/local-case-document-analysis")

const {
  extrairDadosDocumento,
  resolverFamiliaDocumento
} = require("../src/domain/document-extractor")

const { classificarDocumento } = require("../src/domain/document-classifier")

function mockCompletePipeline(ocr) {
  // Use real classifier with synthetic text (no OCR fallback)
  const classificacao = classificarDocumento({
    textoOCR: ocr,
    quantidadePaginas: 1
  })

  const tipoDocumento = classificacao.tipoDocumento
  const familia = resolverFamiliaDocumento(tipoDocumento)
  const extracted = extrairDadosDocumento({
    tipoDocumento,
    textoOCR: ocr
  })

  return {
    preprocessamento: { erros: [], steps: ["real"] },
    ocr: { textoCompleto: ocr, confianca: 0.9, erros: [] },
    classificacao: {
      tipoDocumento: classificacao.tipoDocumento,
      confianca: classificacao.confianca,
      categoria: classificacao.categoria,
      erros: []
    },
    extracao: extracted
  }
}

function main() {
  console.log("Running integrated synthetic pipeline test with real classifier...")

  // Scenario 1: CPF document with requerimento - Real classifier classification
  const pipCpf = mockCompletePipeline(
    `
    Cadastro de Pessoas Físicas
    CPF: 123.456.789-09
    Nome: JOÃO SILVA
    Comprovante de Inscrição no CPF
    Requerimento: 87654321
    Telefone: (81) 99999-8888
    Email: joao@example.com
    Receita Federal
    `
  )

  const canoCpf = canonicalizePipeline(pipCpf, "cpf-sintético.pdf", 1)
  assert.ok(canoCpf.cpfs.includes("12345678909"), "CPF should be extracted")
  assert.ok(canoCpf.names.includes("JOÃO SILVA"), "Name should be extracted")
  assert.ok(canoCpf.requestNumbers.includes("87654321"), "Request number should be separate")
  assert.ok(canoCpf.phones.length > 0, "Phone should be extracted")
  assert.ok(canoCpf.emails.length > 0, "Email should be extracted")

  // Verify real classification happened
  assert.equal(pipCpf.classificacao.tipoDocumento, "CPF", "Should be classified as CPF by real classifier")

  // Scenario 2: Document classified as unknown - Real classifier with insufficient markers
  const pipUnknown = mockCompletePipeline(
    `
    Alguém: MARIA DOS SANTOS
    Algum número: 11111111111
    Contato: (85) 98888-7777
    Mensagem: contato@empresa.com.br
    `
  )

  const canoUnknown = canonicalizePipeline(pipUnknown, "desconhecido.pdf", 1)
  // Unknown document still extracts from OCR text fields
  assert.ok(canoUnknown.phones.length > 0, "Phone should be extracted from OCR even for unknown doc")
  assert.ok(canoUnknown.emails.length > 0, "Email should be extracted from OCR even for unknown doc")

  // Scenario 3: Full case consolidation with multiple documents - Real classification
  // Use real canonicalized results from real classifier
  const analyzedDocs = [
    canoCpf,
    canonicalizePipeline(
      mockCompletePipeline(
        `
        Registro Geral RG
        RG: 12.345.678-9
        Nome: JOÃO SILVA
        Data de Nascimento: 15/06/1980
        Carteira de Identidade
        `
      ),
      "doc2.pdf",
      1
    )
  ]

  const consolidated = consolidateCase({
    sourceFolder: "/test/case",
    importId: "test-001",
    files: [{ path: "doc1.pdf" }, { path: "doc2.pdf" }],
    analyzed: analyzedDocs,
    ignored: [],
    hashes: ["hash1", "hash2"],
    relativeRoot: "/test"
  })

  assert.ok(consolidated.numerosRequerimentoEncontrados.includes("87654321"), "Request numbers should be in consolidated case")

  // Scenario 4: Sanitization with all new fields
  // Create a minimal case object for sanitization test
  const caseForSanitization = {
    importId: "test-001",
    nomesEncontrados: ["JOÃO SILVA"],
    cpfsEncontrados: ["12345678909"],
    telefonesEncontrados: ["5581999998888"],
    emailsEncontrados: ["joao@example.com"],
    numerosBeneficioEncontrados: ["123456789-00"],
    numerosRequerimentoEncontrados: ["87654321"],
    numerosProcessoEncontrados: [],
    tiposBeneficioEncontrados: ["Aposentadoria por Invalidez"],
    datasNascimentoEncontradas: ["1980-06-15"],
    documentosClassificados: analyzedDocs.map(doc => ({
      file: doc.file,
      pageNumber: doc.pageNumber,
      tipo: doc.classification,
      confidence: doc.confidence
    })),
    ignoredFiles: [],
    conflicts: [],
    fileCount: 2,
    analyzedFileCount: 2,
    ignoredFileCount: 0,
    contentHashes: ["hash1", "hash2"],
    confidence: 0.87,
    reviewReasons: []
  }

  const sanitized = sanitizeCaseAnalysis(caseForSanitization, 0)

  // Verify all required fields exist
  assert.ok(sanitized.campos.telefone, "telefone field should exist")
  assert.ok(sanitized.campos.email, "email field should exist")
  assert.ok(sanitized.campos.numeroRequerimento, "numeroRequerimento field should exist")
  assert.ok(sanitized.campos.contato, "contato field should still exist for compatibility")

  // Verify diagnostic fields
  assert.ok(sanitized.diagnosticoCampos.identidade, "diagnosticoCampos.identidade should exist")
  assert.ok(sanitized.diagnosticoCampos.cpf, "diagnosticoCampos.cpf should exist")
  assert.ok(sanitized.diagnosticoCampos.telefone, "diagnosticoCampos.telefone should exist")
  assert.ok(sanitized.diagnosticoCampos.email, "diagnosticoCampos.email should exist")
  assert.ok(sanitized.diagnosticoCampos.numeroRequerimento, "diagnosticoCampos.numeroRequerimento should exist")

  // Verify no secret values are in sanitized
  const sanitizedJson = JSON.stringify(sanitized)
  assert.ok(!sanitizedJson.includes("JOÃO SILVA"), "Name should not appear in sanitized output")
  assert.ok(!sanitizedJson.includes("12345678909"), "CPF should not appear in sanitized output")
  assert.ok(!sanitizedJson.includes("5581999998888"), "Phone should not appear in sanitized output")
  assert.ok(!sanitizedJson.includes("joao@example.com"), "Email should not appear in sanitized output")
  assert.ok(!sanitizedJson.includes("87654321"), "Request number should not appear in sanitized output")

  // Verify diagnostic uses only counts and codes
  assert.equal(typeof sanitized.diagnosticoCampos.cpf.candidatosDetectados, "number")
  assert.equal(typeof sanitized.diagnosticoCampos.telefone.aceitos, "number")

  // Scenario 5: Full report sanitization
  const report = {
    version: 1,
    generatedAt: new Date().toISOString(),
    caseCount: 1,
    durationMs: 5000,
    cases: [caseForSanitization]
  }

  const sanitizedReport = sanitizeAnalysisReport(report)
  assert.equal(sanitizedReport.caseCount, 1)
  assert.ok(sanitizedReport.cases[0].campos.telefone)
  assert.ok(sanitizedReport.cases[0].campos.numeroRequerimento)
  assert.ok(sanitizedReport.cases[0].diagnosticoCampos)

  // Verify no secrets in report
  const reportJson = JSON.stringify(sanitizedReport)
  assert.ok(!reportJson.includes("JOÃO SILVA"), "No names in report")
  assert.ok(!reportJson.includes("12345678909"), "No CPF in report")
  assert.ok(!reportJson.includes("5581999998888"), "No phones in report")

  console.log("✓ Integrated synthetic pipeline tests passed")
  console.log("  ✓ Real classifier classification working")
  console.log("  ✓ CPF extraction and mapping working")
  console.log("  ✓ Request numbers separate from benefits")
  console.log("  ✓ Phone and email separated in fields")
  console.log("  ✓ Diagnostic structure with counts only")
  console.log("  ✓ Sanitization preserves no secrets")
  console.log("  ✓ Full pipeline integration working (real classifier + real extraction/canonicalization/consolidation/sanitization)")
}

main()
