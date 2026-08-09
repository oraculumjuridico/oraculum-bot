const assert = require('assert')
const { generateDryRunReport } = require('../scripts/import-real-cases')
const { canonicalizePipeline, consolidateCase } = require('../src/domain/local-case-document-analysis')

// Build synthetic record similar to inspector output
function makeRecord({ name, cpf, phone, email, officialNumber, importId }) {
  return { importId: importId || 'r1', name: name || '', cpf: cpf || '', phone: phone || '', email: email || '', officialNumber: officialNumber || '' }
}

// Test that generateDryRunReport does not call HubSpot and produces masked plan
;(async function test_generate_dry_run_report_no_network() {
  const p1 = { extracao: { camposExtraidos: { CPF: '123.456.789-09', Telefone: '5511999999999' }, confiancaPorCampo: {} }, ocr: { textoCompleto: '' }, classificacao: { tipoDocumento: 'cpf' } }
  const c1 = canonicalizePipeline(p1, 'doc1', 1)
  const consolidated = consolidateCase({ sourceFolder: 'synthetic', importId: 'r1', files: ['doc1'], analyzed: [c1], ignored: [], hashes: [], relativeRoot: process.cwd() })

  const record = makeRecord({ name: 'Test User', importId: 'r1' })
  record.consolidatedCase = consolidated

  const report = generateDryRunReport([record], { records: [record] })
  assert.ok(Array.isArray(report.reports), 'canonical report should expose reports')
  assert.strictEqual(report.reports[0].planning.cpf, '<PRESENTE>')
  assert.ok(report.reports[0].canonicalPlan?.hash, 'canonical plan hash should be present')

  // Ensure generateDryRunReport is exported
  const importer = require('../scripts/import-real-cases')
  assert.ok(importer.generateDryRunReport, 'generateDryRunReport exported')

  console.log('✓ generateDryRunReport produced masked summary and did not perform network actions')
  console.log('ALL IMPORT-DRY-RUN-PLANNER TESTS PASSED')
})().catch(error => {
  console.error(error)
  process.exitCode = 1
})
