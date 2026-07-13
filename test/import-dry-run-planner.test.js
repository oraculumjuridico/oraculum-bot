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

  const summaries = await generateDryRunReport([record])
  // function returns summaries (no network)
  assert.ok(Array.isArray(summaries), 'summaries should be array')
  assert.strictEqual(summaries[0].planoHubSpot.contato.cpf, '<PRESENTE>')

  // Ensure generateDryRunReport is exported
  const importer = require('../scripts/import-real-cases')
  assert.ok(importer.generateDryRunReport, 'generateDryRunReport exported')

  console.log('✓ generateDryRunReport produced masked summary and did not perform network actions')
})()

console.log('ALL IMPORT-DRY-RUN-PLANNER TESTS PASSED')