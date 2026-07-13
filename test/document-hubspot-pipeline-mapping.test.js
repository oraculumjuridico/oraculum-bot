const assert = require('assert')
const { canonicalizePipeline, consolidateCase } = require('../src/domain/local-case-document-analysis')
const { planejarSincronizacaoDocumentalHubSpot } = require('../src/domain/document-hubspot-sync')

function maskPresent(value) {
  if (value === undefined || value === null || String(value).trim() === '') return '<AUSENTE>'
  return '<PRESENTE>'
}

// Helper to build a fake pipeline object similar to processPage output
function makePipeline({ nome, cpf, telefone, email, request, nb, processo }, tipoDocumento = 'cpf') {
  const campos = {}
  if (nome) campos['Nome'] = nome
  if (cpf) campos['CPF'] = cpf
  if (telefone) {
    campos['Telefone'] = telefone
    // mark phone as validated for planner acceptance
    campos['telefone_validado'] = true
  }
  if (email) {
    campos['Email'] = email
    // mark email as validated for planner acceptance
    campos['email_validado'] = true
  }
  if (request) campos['Numero do Requerimento'] = request
  if (nb) campos['NB'] = nb
  if (processo) campos['Numero do Processo'] = processo

  return {
    extracao: { camposExtraidos: campos, confiancaPorCampo: {} },
    ocr: { textoCompleto: Object.values(campos).join('\n') },
    classificacao: { tipoDocumento, confianca: 0.9 }
  }
}

// Test 1: end-to-end presence for single, well-formed synthetic case
;(function test_single_case_presence() {
  // Build canonicalized items and consolidated case so the planner can consult consolidation
  const p1 = makePipeline({ nome: 'Alice Silva', cpf: '123.456.789-09', telefone: '(81) 99999-8888', email: 'alice@example.com' }, 'cpf')
  const p2 = makePipeline({ nome: 'Alice Silva', cpf: '123.456.789-09' }, 'rg')
  const p3 = makePipeline({ processo: '0000001-00.2026.8.00.0001' }, 'processo')

  const c1 = canonicalizePipeline(p1, 'doc1.png', 1)
  const c2 = canonicalizePipeline(p2, 'doc2.png', 1)
  const c3 = canonicalizePipeline(p3, 'doc3.png', 1)

  const consolidated = consolidateCase({ sourceFolder: 'synthetic', importId: 'test-single', files: ['doc1.png','doc2.png','doc3.png'], analyzed: [c1,c2,c3], ignored: [], hashes: [], relativeRoot: process.cwd() })

  const registry = {
    documentos: [ { registryId: 'doc-1', versoes: [ p1 ] }, { registryId: 'doc-2', versoes: [ p2 ] }, { registryId: 'doc-3', versoes: [ p3 ] } ],
    metadados: { resumoDocumental: 'Documentos recebidos: 3. Pendencias: 0. Divergencias: 0.' },
    consolidatedCase: consolidated
  }

  const plano = planejarSincronizacaoDocumentalHubSpot({ registry })

  // Assertions: required fields must be present in props (non-empty)
  assert.ok(plano && plano.contato, 'plano.contato expected')
  const contatoProps = plano.contato.props || {}
  const negocioProps = plano.negocio.props || {}

  assert.ok(contatoProps.firstname && String(contatoProps.firstname).trim() !== '', 'firstname must be present')
  assert.ok(contatoProps.cpf_do_cliente && String(contatoProps.cpf_do_cliente).trim() !== '', 'cpf_do_cliente must be present')
  assert.ok(contatoProps.phone && String(contatoProps.phone).trim() !== '', 'phone must be present')
  assert.ok(contatoProps.email && String(contatoProps.email).trim() !== '', 'email must be present')
  assert.ok(negocioProps.resumo_cliente && String(negocioProps.resumo_cliente).trim() !== '', 'resumo_cliente must be present')

  // Print masked summary
  console.log('SINGLE CASE: firstname', maskPresent(contatoProps.firstname), 'cpf_do_cliente', maskPresent(contatoProps.cpf_do_cliente), 'phone', maskPresent(contatoProps.phone), 'email', maskPresent(contatoProps.email), 'resumo_cliente', maskPresent(negocioProps.resumo_cliente))
  console.log('✓ Single-case pipeline mapping assertions passed')
})()

// Test 2: conflicts and withheld fields — two distinct CPFs across documents
;(function test_conflicting_cpfs_and_omitted_multi_values() {
  // Build canonicalized analyzed items using canonicalizePipeline and then consolidateCase
  const p1 = makePipeline({ nome: 'Pedro A', cpf: '529.982.247-25', telefone: '(11) 91111-1111' }, 'cpf')
  const p2 = makePipeline({ nome: 'Pedro B', cpf: '168.995.350-09', telefone: '(11) 92222-2222' }, 'rg')

  // Build minimal canonicalized items manually with multiple cpfs to force conflict
  const c1 = { file: 'doc1.png', pageNumber: 1, names: ['Pedro A'], cpfs: ['11111111111'], phones: [], emails: [], classification: 'cpf', confidence: 0.9 }
  const c2 = { file: 'doc2.png', pageNumber: 1, names: ['Pedro B'], cpfs: ['22222222222'], phones: [], emails: [], classification: 'rg', confidence: 0.87 }

  const consolidated = consolidateCase({ sourceFolder: 'synthetic', importId: 'test-01', files: ['doc1.png','doc2.png'], analyzed: [c1,c2], ignored: [], hashes: [], relativeRoot: process.cwd() })

  // Expect conflict flagged and safeToPlanHubSpot false
  assert.ok(Array.isArray(consolidated.conflicts), 'consolidated.conflicts must be array')
  assert.ok(consolidated.conflicts.includes('multiple_valid_cpfs'), 'multiple_valid_cpfs conflict expected')
  assert.strictEqual(consolidated.safeToPlanHubSpot, false, 'safeToPlanHubSpot must be false on CPF conflict')

  console.log('CONFLICT CASE: conflicts', consolidated.conflicts.join(','), 'safeToPlanHubSpot', consolidated.safeToPlanHubSpot ? '<PRESENTE>' : '<CONFLITANTE>')

  // Now ensure that when registry contains these documents and the consolidated case is attached, the planner does not silently choose one CPF
  const registry = { documentos: [ { registryId: 'doc1', versoes: [p1] }, { registryId: 'doc2', versoes: [p2] } ], metadados: {}, consolidatedCase: consolidated }
  const plano = planejarSincronizacaoDocumentalHubSpot({ registry })
  const contatoProps = plano.contato.props || {}

  // CPF must not be confidently selected — either absent from props or blocked
  const cpfPresent = contatoProps.cpf_do_cliente && String(contatoProps.cpf_do_cliente).trim() !== ''
  const cpfBlocked = (plano.contato.bloqueados || []).some(b => b.campo === 'cpf_do_cliente')
  assert.ok(!cpfPresent || cpfBlocked, 'Two CPFs: either cpf absent from props or explicitly blocked')

  console.log('PLANNER ON CONFLICT: cpf', cpfPresent ? '<PRESENTE>' : '<AUSENTE>', 'blocked', cpfBlocked ? '<BLOQUEADO>' : '<AUSENTE>')

  // Planner no longer auto-consolidates; consolidatedCase must be attached by the producer.
  // Tests below therefore exercise planner behavior when consolidatedCase is provided (see above).

  // Multi-values for requerimento, beneficio, processo: ensure not sent when multiple
  const p3 = makePipeline({ request: '20230001' }, 'processo')
  const p4 = makePipeline({ request: '20230002' }, 'processo')
  const c3 = canonicalizePipeline(p3, 'doc3.png', 1)
  const c4 = canonicalizePipeline(p4, 'doc4.png', 1)
  const consolidated2 = consolidateCase({ sourceFolder: 'synthetic', importId: 'test-02', files: ['doc3.png','doc4.png'], analyzed: [c3,c4], ignored: [], hashes: [], relativeRoot: process.cwd() })

  assert.strictEqual(consolidated2.canonicalSuggestions.numero_requerimento, null, 'multiple requerimentos => no canonical suggestion')

  const registry2 = { documentos: [ { registryId: 'd3', versoes: [p3] }, { registryId: 'd4', versoes: [p4] } ], metadados: {} }
  const plano2 = planejarSincronizacaoDocumentalHubSpot({ registry: registry2 })
  const negocioProps = plano2.negocio.props || {}

  // Confirm negocio.props does not include any of the ambiguous fields
  const ambiguousFields = ['numero_requerimento', 'numero_beneficio', 'numero_de_caso', 'numero_processo']
  for (const f of ambiguousFields) {
    assert.ok(!Object.prototype.hasOwnProperty.call(negocioProps, f) || String(negocioProps[f]).trim() === '', `Ambiguous field ${f} must not be sent`)
  }

  console.log('MULTI-VALUE CASE: ambiguous fields omitted from deal props')
  console.log('✓ Conflict and multi-value assertions passed')
})()

console.log('ALL TESTS PASSED: document-hubspot-pipeline-mapping.test.js')
