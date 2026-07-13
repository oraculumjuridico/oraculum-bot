const assert = require("node:assert/strict")

const {
  canonicalizePipeline,
  sanitizeCaseAnalysis,
  sanitizeAnalysisReport
} = require("../src/domain/local-case-document-analysis")

function mockPipeline(ocr = "", classification = {}) {
  return {
    preprocessamento: { erros: [] },
    ocr: { textoCompleto: ocr, erros: [] },
    classificacao: { tipoDocumento: "Documento desconhecido", confianca: 0.8, ...classification, erros: [] },
    extracao: { camposExtraidos: {}, erros: [] }
  }
}

function main() {
  // Request number with "requerimento" label
  const pipReq = canonicalizePipeline(
    mockPipeline("Requerimento: 12345678", {}),
    "test.pdf",
    1
  )
  assert.ok(pipReq.requestNumbers.includes("12345678"), "Should extract requerimento")

  // Request number with "protocolo" label
  const pipProtocolo = canonicalizePipeline(
    mockPipeline("Protocolo: 87654321", {}),
    "test.pdf",
    1
  )
  assert.ok(pipProtocolo.requestNumbers.includes("87654321"), "Should extract protocolo")

  // Request number with full label
  const pipFull = canonicalizePipeline(
    mockPipeline("Número do requerimento: 55555555", {}),
    "test.pdf",
    1
  )
  assert.ok(pipFull.requestNumbers.includes("55555555"), "Should extract com label completo")

  // Generic number without label should NOT be extracted
  const pipGeneric = canonicalizePipeline(
    mockPipeline("Algum número: 99999999", {}),
    "test.pdf",
    1
  )
  assert.equal(pipGeneric.requestNumbers.length, 0, "Should not extract generic number")

  // Phone and email separated in canonicalization
  const pipContato = canonicalizePipeline(
    mockPipeline("(81) 99999-8888 e contato@email.com", {}),
    "test.pdf",
    1
  )
  assert.ok(pipContato.phones.length > 0, "Should extract phone")
  assert.ok(pipContato.emails.length > 0, "Should extract email")

  // Sanitization separates telefone and email
  const caseItem = {
    nomesEncontrados: ["JOÃO SILVA"],
    cpfsEncontrados: ["12345678909"],
    telefonesEncontrados: ["5581999998888"],
    emailsEncontrados: ["joao@example.com"],
    numerosBeneficioEncontrados: [],
    numerosRequerimentoEncontrados: ["12345678"],
    numerosProcessoEncontrados: [],
    tiposBeneficioEncontrados: [],
    datasNascimentoEncontradas: [],
    documentosClassificados: [],
    ignoredFiles: [],
    conflicts: [],
    fileCount: 1,
    analyzedFileCount: 1,
    ignoredFileCount: 0,
    contentHashes: [],
    confidence: 0.85,
    reviewReasons: []
  }

  const sanitized = sanitizeCaseAnalysis(caseItem, 0)

  // Check that separate fields exist
  assert.equal(sanitized.campos.telefone, "encontrado", "telefone field should be separate and 'encontrado'")
  assert.equal(sanitized.campos.email, "encontrado", "email field should be separate and 'encontrado'")
  assert.equal(sanitized.campos.contato, "encontrado", "contato field should also exist for compatibility")

  // Check that numeroRequerimento appears in fields
  assert.equal(sanitized.campos.numeroRequerimento, "encontrado", "numeroRequerimento should be 'encontrado'")

  // Check diagnostic structure
  assert.ok(sanitized.diagnosticoCampos, "diagnosticoCampos should exist")
  assert.ok(sanitized.diagnosticoCampos.telefone, "diagnosticoCampos.telefone should exist")
  assert.ok(sanitized.diagnosticoCampos.email, "diagnosticoCampos.email should exist")
  assert.ok(sanitized.diagnosticoCampos.numeroRequerimento, "diagnosticoCampos.numeroRequerimento should exist")

  // Verify diagnostic contains only counts, no values
  assert.equal(typeof sanitized.diagnosticoCampos.telefone.candidatosDetectados, "number")
  assert.equal(typeof sanitized.diagnosticoCampos.email.aceitos, "number")
  assert.equal(typeof sanitized.diagnosticoCampos.numeroRequerimento.candidatosDetectados, "number")

  // Check report sanitization
  const report = {
    version: 1,
    generatedAt: new Date().toISOString(),
    caseCount: 1,
    durationMs: 100,
    cases: [caseItem]
  }

  const sanitizedReport = sanitizeAnalysisReport(report)
  assert.ok(sanitizedReport.cases[0].campos.telefone, "sanitized report should have telefone field")
  assert.ok(sanitizedReport.cases[0].campos.email, "sanitized report should have email field")
  assert.ok(sanitizedReport.cases[0].diagnosticoCampos, "sanitized report should have diagnosticoCampos")

  console.log("✓ Request number, telefone/email separation, and diagnostic tests passed")
}

main()
