const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  mesclarItemAdminHubspotComMemoria,
  mesclarItensAdminPorIdentidade
} = require('../src/domain/admin-item-merge.js');

console.log('\n=== Teste da Funcao mesclarItemAdminHubspotComMemoria ===\n');

// Cenario 1: HubSpot com appointmentscheduled + Memoria com acolhimento_modo
console.log('Cenario 1: HubSpot (Lead) + Memoria (Pre-atendimento)');
const hs1 = {
  from: '+55111111111',
  u: {
    negocioId: 'deal-123',
    negocioStageId: 'appointmentscheduled',
    stage: null,
    nome: 'Cliente HubSpot',
    nomeWA: 'Cliente HS WA'
  },
  negocio: { id: 'deal-123', stageId: 'appointmentscheduled' },
  contato: { id: 'contact-456', name: 'Contato' }
};

const local1 = {
  from: '+5511987654321',
  u: {
    negocioId: 'deal-123',
    stage: 'acolhimento_modo',
    numeroCaso: null,
    nome: 'Cliente Local',
    nomeWA: 'Cliente Local WA'
  }
};

const merged1 = mesclarItemAdminHubspotComMemoria(hs1, local1);

assert.strictEqual(merged1.u.stage, 'acolhimento_modo', 'Stage local deve ser copiado');
assert.strictEqual(merged1.u.negocioStageId, 'appointmentscheduled', 'negocioStageId HubSpot preservado');
assert.strictEqual(merged1.u.negocioId, 'deal-123', 'negocioId preservado');
assert.strictEqual(merged1.u.nome, 'Cliente Local', 'Nome local copia');
assert.strictEqual(merged1.u.nomeWA, 'Cliente Local WA', 'nomeWA local copia');
assert.strictEqual(merged1.from, '+5511987654321', 'from local prevalece');
assert.strictEqual(merged1.negocio.id, 'deal-123', 'negocio HubSpot preservado');
assert.strictEqual(merged1.contato.id, 'contact-456', 'contato HubSpot preservado');

console.log('  OK - Stage local, nomes locais, from local, HubSpot IDs preservados\n');

// Cenario 2: Memoria sem stage local
console.log('Cenario 2: HubSpot (Lead) + Memoria SEM stage local');
const hs2 = {
  from: '+55222222222',
  u: {
    negocioId: 'deal-789',
    negocioStageId: 'appointmentscheduled',
    stage: 'appointmentscheduled',
    nome: 'Cliente HubSpot'
  },
  negocio: { id: 'deal-789' },
  contato: { id: 'contact-789' }
};

const local2 = {
  from: '+55222222222',
  u: {
    negocioId: 'deal-789',
    stage: null,
    numeroCaso: null
  }
};

const merged2 = mesclarItemAdminHubspotComMemoria(hs2, local2);

assert.strictEqual(merged2.u.stage, 'appointmentscheduled', 'Stage HubSpot preservado quando local null');
assert.strictEqual(merged2.u.negocioStageId, 'appointmentscheduled', 'negocioStageId HubSpot preservado');
assert.strictEqual(merged2.u.nome, 'Cliente HubSpot', 'Nome HubSpot preservado quando local null');

console.log('  OK - HubSpot Lead preservado quando memoria nao tem stage\n');

// Cenario 3: Memoria com null, undefined, string vazia
console.log('Cenario 3: Memoria com null/undefined/vazio nao apaga HubSpot');
const hs3 = {
  from: '+55333333333',
  u: {
    negocioId: 'deal-555',
    negocioStageId: 'appointmentscheduled',
    nome: 'Cliente Original',
    urgencia: 'alta',
    consultaStatus: 'agendada'
  },
  negocio: { id: 'deal-555' },
  contato: { id: 'contact-555' }
};

const local3 = {
  from: null,
  u: {
    negocioId: 'deal-555',
    stage: null,
    nome: null,
    urgencia: undefined,
    consultaStatus: ''
  }
};

const merged3 = mesclarItemAdminHubspotComMemoria(hs3, local3);

assert.strictEqual(merged3.u.nome, 'Cliente Original', 'Nome HubSpot nao e apagado por null');
assert.strictEqual(merged3.u.urgencia, 'alta', 'Urgencia HubSpot nao e apagada por undefined');
assert.strictEqual(merged3.u.consultaStatus, 'agendada', 'consultaStatus HubSpot nao e apagado por string vazia');
assert.strictEqual(merged3.from, '+55333333333', 'from HubSpot usado quando local nao e valido');

console.log('  OK - Campos HubSpot preservados quando memoria tem null/undefined/vazio\n');

// Cenario 4: Campo booleano local com false
console.log('Cenario 4: Campo booleano local com false nao e apagado');
const hs4 = {
  from: '+55444444444',
  u: {
    negocioId: 'deal-444',
    _ativo: true,
    _fluxoEncerrado: true
  },
  negocio: { id: 'deal-444' },
  contato: null
};

const local4 = {
  from: '+55444444444',
  u: {
    negocioId: 'deal-444',
    _ativo: false,
    _fluxoEncerrado: false
  }
};

const merged4 = mesclarItemAdminHubspotComMemoria(hs4, local4);

assert.strictEqual(merged4.u._ativo, false, '_ativo false deve ser preservado');
assert.strictEqual(merged4.u._fluxoEncerrado, false, '_fluxoEncerrado false deve ser preservado');

console.log('  OK - Campos booleanos false preservados\n');

// Cenario 5: Campos _ vazios nao apagam, campos _ validos prevalecem
console.log('Cenario 5: Campos _ vazios/validos');
const hs5 = {
  from: '+55555555555',
  u: {
    negocioId: 'deal-666',
    _numero: '+55111111111',
    _resumoDescricaoIA: 'Resumo HubSpot',
    _solicitouHumano: true
  },
  negocio: { id: 'deal-666' },
  contato: null
};

const local5 = {
  from: '+55555555555',
  u: {
    negocioId: 'deal-666',
    _numero: '+5511987654321',
    _resumoDescricaoIA: null,
    _solicitouHumano: false
  }
};

const merged5 = mesclarItemAdminHubspotComMemoria(hs5, local5);

assert.strictEqual(merged5.u._numero, '+5511987654321', '_numero local valido prevalece');
assert.strictEqual(merged5.u._resumoDescricaoIA, 'Resumo HubSpot', '_resumoDescricaoIA HubSpot preservado quando local null');
assert.strictEqual(merged5.u._solicitouHumano, false, '_solicitouHumano false local prevalece');

console.log('  OK - Campos _ gerenciados corretamente\n');

// Cenario 6: Argumentos invalidos
console.log('Cenario 6: Argumentos invalidos retornam alternativa valida');
const hs6 = {
  from: '+55666666666',
  u: { negocioId: 'deal-999', nome: 'Valido' },
  negocio: { id: 'deal-999' }
};

const merged6a = mesclarItemAdminHubspotComMemoria(null, hs6);
assert.strictEqual(merged6a.u.nome, 'Valido', 'null HubSpot retorna memoria');

const merged6b = mesclarItemAdminHubspotComMemoria(hs6, null);
assert.strictEqual(merged6b.u.nome, 'Valido', 'null memoria retorna HubSpot');

const merged6c = mesclarItemAdminHubspotComMemoria({ u: null }, hs6);
assert.strictEqual(merged6c.u.nome, 'Valido', 'HubSpot.u = null retorna memoria');

console.log('  OK - Argumentos invalidos tratados\n');

// Cenario 7: Nao copia campos nao permitidos
console.log('Cenario 7: Campos nao permitidos nao sao copiados');
const hs7 = {
  from: '+55777777777',
  u: {
    negocioId: 'deal-777',
    contatoId: 'contact-777',
    negocioStageId: 'appointmentscheduled',
    properties: { custom: 'value' }
  },
  negocio: { id: 'deal-777' },
  contato: { id: 'contact-777' }
};

const local7 = {
  from: '+55777777777',
  u: {
    negocioId: 'deal-777',
    contatoId: 'contact-novo',
    negocioStageId: 'novo-stage',
    properties: { novo: 'prop' },
    campoCustum: 'valor'
  }
};

const merged7 = mesclarItemAdminHubspotComMemoria(hs7, local7);

assert.strictEqual(merged7.u.contatoId, 'contact-777', 'contatoId HubSpot preservado (nao permitido copiar)');
assert.strictEqual(merged7.u.negocioStageId, 'appointmentscheduled', 'negocioStageId HubSpot preservado (nao permitido copiar)');
assert.strictEqual(merged7.u.properties, hs7.u.properties, 'properties HubSpot preservado (nao permitido copiar)');
assert.strictEqual(merged7.u.campoCustum, undefined, 'Campo nao permitido nao e copiado');

console.log('  OK - Campos protegidos mantidos, campos nao permitidos ignorados\n');

console.log('✓ Todos os testes da funcao de merge passaram\n');

function itemHubspot({ testeId, telefone, negocioId, stage = 'appointmentscheduled' }) {
  return {
    testeId,
    from: telefone,
    u: {
      negocioId,
      contatoId: `contato-${negocioId}`,
      negocioStageId: stage,
      stage,
      hubspotLink: 'https://fixture.invalid/hubspot'
    },
    negocio: { id: negocioId, properties: { dealstage: stage } },
    contato: { id: `contato-${negocioId}` },
    properties: { origem: 'hubspot' },
    linkExterno: 'https://fixture.invalid/externo'
  }
}

function itemLocal({ testeId, telefone, negocioId = '', stage = 'acolhimento_modo' }) {
  return {
    testeId,
    from: telefone,
    u: { negocioId, stage, documentos: [{ tipo: 'fixture' }], _testeOrigem: testeId }
  }
}

const telefoneA = '5511911110001'
const telefoneB = '5511922220002'
const ids = itens => itens.map(item => item.testeId)

// 1 HubSpot + 1 local: negocioId explícito e único.
const porNegocio = mesclarItensAdminPorIdentidade(
  [itemHubspot({ testeId: 'hubspot-id-1', telefone: telefoneA, negocioId: 'negocio-ficticio-a' })],
  [itemLocal({ testeId: 'local-id-1', telefone: telefoneB, negocioId: 'negocio-ficticio-a' })]
)
assert.equal(porNegocio.length, 1)
assert.equal(porNegocio[0].testeId, 'hubspot-id-1')
assert.equal(porNegocio[0].u.negocioId, 'negocio-ficticio-a')
assert.equal(porNegocio[0].u.stage, 'acolhimento_modo')

// Ambiguidade por negocioId preserva todos e a ordem original.
const ambiguoIdUmHs = mesclarItensAdminPorIdentidade(
  [itemHubspot({ testeId: 'hubspot-id-2', telefone: telefoneA, negocioId: 'negocio-ficticio-b' })],
  [
    itemLocal({ testeId: 'local-id-2', telefone: telefoneA, negocioId: 'negocio-ficticio-b' }),
    itemLocal({ testeId: 'local-id-3', telefone: telefoneB, negocioId: 'negocio-ficticio-b' })
  ]
)
assert.deepEqual(ids(ambiguoIdUmHs), ['hubspot-id-2', 'local-id-2', 'local-id-3'])

const ambiguoIdDoisHs = mesclarItensAdminPorIdentidade([
  itemHubspot({ testeId: 'hubspot-id-3', telefone: telefoneA, negocioId: 'negocio-ficticio-c' }),
  itemHubspot({ testeId: 'hubspot-id-4', telefone: telefoneB, negocioId: 'negocio-ficticio-c' })
], [itemLocal({ testeId: 'local-id-4', telefone: telefoneA, negocioId: 'negocio-ficticio-c' })])
assert.deepEqual(ids(ambiguoIdDoisHs), ['hubspot-id-3', 'hubspot-id-4', 'local-id-4'])

const ambiguoIdAmbos = mesclarItensAdminPorIdentidade([
  itemHubspot({ testeId: 'hubspot-id-5', telefone: telefoneA, negocioId: 'negocio-ficticio-d' }),
  itemHubspot({ testeId: 'hubspot-id-6', telefone: telefoneB, negocioId: 'negocio-ficticio-d' })
], [
  itemLocal({ testeId: 'local-id-5', telefone: telefoneA, negocioId: 'negocio-ficticio-d' }),
  itemLocal({ testeId: 'local-id-6', telefone: telefoneB, negocioId: 'negocio-ficticio-d' })
])
assert.deepEqual(ids(ambiguoIdAmbos), ['hubspot-id-5', 'hubspot-id-6', 'local-id-5', 'local-id-6'])

// ID local divergente bloqueia fallback, mesmo com telefone igual.
const idDivergente = mesclarItensAdminPorIdentidade(
  [itemHubspot({ testeId: 'hubspot-divergente', telefone: telefoneA, negocioId: 'negocio-ficticio-e' })],
  [itemLocal({ testeId: 'local-divergente', telefone: telefoneA, negocioId: 'negocio-ficticio-f' })]
)
assert.deepEqual(ids(idDivergente), ['hubspot-divergente', 'local-divergente'])

// Fallback único por telefone formatado e normalizado.
const hsTelefone = itemHubspot({ testeId: 'hubspot-telefone', telefone: telefoneA, negocioId: 'negocio-ficticio-g' })
const localTelefone = itemLocal({ testeId: 'local-telefone', telefone: '+55 (11) 91111-0001' })
const porTelefone = mesclarItensAdminPorIdentidade([hsTelefone], [localTelefone])
assert.equal(porTelefone.length, 1)
assert.equal(porTelefone[0].testeId, 'hubspot-telefone')
assert.equal(porTelefone[0].u.negocioId, 'negocio-ficticio-g')
assert.equal(porTelefone[0].u.contatoId, 'contato-negocio-ficticio-g')
assert.equal(porTelefone[0].u.negocioStageId, 'appointmentscheduled')
assert.equal(porTelefone[0].u.stage, 'acolhimento_modo')
assert.equal(porTelefone[0].from, localTelefone.from)
assert.equal(porTelefone[0].u.from, undefined)
assert.deepEqual(porTelefone[0].properties, { origem: 'hubspot' })
assert.equal(porTelefone[0].negocio, hsTelefone.negocio)
assert.equal(porTelefone[0].contato, hsTelefone.contato)
assert.equal(porTelefone[0].linkExterno, hsTelefone.linkExterno)
assert.equal(porTelefone[0].u.hubspotLink, hsTelefone.u.hubspotLink)

const telefoneNacionalNormalizado = mesclarItensAdminPorIdentidade(
  [itemHubspot({ testeId: 'hubspot-nacional', telefone: telefoneA, negocioId: 'negocio-ficticio-g2' })],
  [itemLocal({ testeId: 'local-nacional', telefone: '11911110001' })]
)
assert.equal(telefoneNacionalNormalizado.length, 1)
assert.equal(telefoneNacionalNormalizado[0].testeId, 'hubspot-nacional')

// Telefones diferentes, vazios e inválidos permanecem separados.
for (const [telefoneHubspot, telefoneLocal] of [
  [telefoneA, telefoneB],
  ['', ''],
  ['119111100011', '119111100011'],
  ['1191111000111', '1191111000111'],
  ['5511', '5511'],
  ['55119111100011234', '55119111100011234']
]) {
  const separados = mesclarItensAdminPorIdentidade(
    [itemHubspot({ testeId: 'hubspot-invalido', telefone: telefoneHubspot, negocioId: 'negocio-ficticio-h' })],
    [itemLocal({ testeId: 'local-invalido', telefone: telefoneLocal })]
  )
  assert.deepEqual(ids(separados), ['hubspot-invalido', 'local-invalido'])
}

// Ambiguidade por telefone preserva marcadores e ordem exata.
const doisHsTelefone = mesclarItensAdminPorIdentidade([
  itemHubspot({ testeId: 'hubspot-tel-1', telefone: telefoneA, negocioId: 'negocio-ficticio-i' }),
  itemHubspot({ testeId: 'hubspot-tel-2', telefone: telefoneA, negocioId: 'negocio-ficticio-j' })
], [itemLocal({ testeId: 'local-tel-1', telefone: telefoneA })])
assert.deepEqual(ids(doisHsTelefone), ['hubspot-tel-1', 'hubspot-tel-2', 'local-tel-1'])

const doisLocaisTelefone = mesclarItensAdminPorIdentidade(
  [itemHubspot({ testeId: 'hubspot-tel-3', telefone: telefoneA, negocioId: 'negocio-ficticio-k' })],
  [
    itemLocal({ testeId: 'local-tel-2', telefone: telefoneA }),
    itemLocal({ testeId: 'local-tel-3', telefone: telefoneA })
  ]
)
assert.deepEqual(ids(doisLocaisTelefone), ['hubspot-tel-3', 'local-tel-2', 'local-tel-3'])

const ambosTelefone = mesclarItensAdminPorIdentidade([
  itemHubspot({ testeId: 'hubspot-tel-4', telefone: telefoneA, negocioId: 'negocio-ficticio-l' }),
  itemHubspot({ testeId: 'hubspot-tel-5', telefone: telefoneA, negocioId: 'negocio-ficticio-m' })
], [
  itemLocal({ testeId: 'local-tel-4', telefone: telefoneA }),
  itemLocal({ testeId: 'local-tel-5', telefone: telefoneA })
])
assert.deepEqual(ids(ambosTelefone), ['hubspot-tel-4', 'hubspot-tel-5', 'local-tel-4', 'local-tel-5'])

// Colisões cruzadas: cada posição HubSpot e local participa de no máximo um merge.
const cruzadoHubspot = itemHubspot({ testeId: 'hubspot-cruzado-1', telefone: telefoneA, negocioId: 'negocio-cruzado-a' })
const cruzadoLocalId = itemLocal({ testeId: 'local-cruzado-id-1', telefone: telefoneB, negocioId: 'negocio-cruzado-a' })
const cruzadoLocalTelefone = itemLocal({ testeId: 'local-cruzado-tel-1', telefone: telefoneA })
const snapshotCruzado = structuredClone([cruzadoHubspot, cruzadoLocalId, cruzadoLocalTelefone])
const colisaoCruzada = mesclarItensAdminPorIdentidade(
  [cruzadoHubspot],
  [cruzadoLocalId, cruzadoLocalTelefone]
)
assert.deepEqual(ids(colisaoCruzada), ['hubspot-cruzado-1', 'local-cruzado-tel-1'])
assert.equal(colisaoCruzada[0].u._testeOrigem, 'local-cruzado-id-1')
assert.equal(colisaoCruzada[1].u._testeOrigem, 'local-cruzado-tel-1')
assert.deepEqual([cruzadoHubspot, cruzadoLocalId, cruzadoLocalTelefone], snapshotCruzado)

const mesmoTelefoneLocais = mesclarItensAdminPorIdentidade(
  [itemHubspot({ testeId: 'hubspot-cruzado-2', telefone: telefoneA, negocioId: 'negocio-cruzado-b' })],
  [
    itemLocal({ testeId: 'local-cruzado-id-2', telefone: telefoneA, negocioId: 'negocio-cruzado-b' }),
    itemLocal({ testeId: 'local-cruzado-tel-2', telefone: telefoneA })
  ]
)
assert.deepEqual(ids(mesmoTelefoneLocais), ['hubspot-cruzado-2', 'local-cruzado-tel-2'])
assert.equal(mesmoTelefoneLocais[0].u._testeOrigem, 'local-cruzado-id-2')

const idEmUmTelefoneNoOutro = mesclarItensAdminPorIdentidade([
  itemHubspot({ testeId: 'hubspot-cruzado-3', telefone: telefoneA, negocioId: 'negocio-cruzado-c' }),
  itemHubspot({ testeId: 'hubspot-cruzado-4', telefone: telefoneB, negocioId: 'negocio-cruzado-d' })
], [itemLocal({ testeId: 'local-cruzado-id-3', telefone: telefoneB, negocioId: 'negocio-cruzado-c' })])
assert.deepEqual(ids(idEmUmTelefoneNoOutro), ['hubspot-cruzado-3', 'hubspot-cruzado-4'])
assert.equal(idEmUmTelefoneNoOutro[0].u._testeOrigem, 'local-cruzado-id-3')
assert.equal(idEmUmTelefoneNoOutro[1].u._testeOrigem, undefined)

const ordemInversaCruzada = mesclarItensAdminPorIdentidade(
  [itemHubspot({ testeId: 'hubspot-cruzado-5', telefone: telefoneA, negocioId: 'negocio-cruzado-e' })],
  [
    itemLocal({ testeId: 'local-cruzado-tel-3', telefone: telefoneA }),
    itemLocal({ testeId: 'local-cruzado-id-4', telefone: telefoneB, negocioId: 'negocio-cruzado-e' })
  ]
)
assert.deepEqual(ids(ordemInversaCruzada), ['hubspot-cruzado-5', 'local-cruzado-tel-3'])
assert.equal(ordemInversaCruzada[0].u._testeOrigem, 'local-cruzado-id-4')

const hubspotSemId = itemHubspot({ testeId: 'hubspot-sem-id', telefone: telefoneA, negocioId: '' })
const fallbackHubspotSemId = mesclarItensAdminPorIdentidade(
  [hubspotSemId],
  [itemLocal({ testeId: 'local-sem-id', telefone: telefoneA })]
)
assert.equal(fallbackHubspotSemId.length, 1)
assert.equal(fallbackHubspotSemId[0].u._testeOrigem, 'local-sem-id')

// Itens órfãos permanecem intactos e a ordem geral é estável.
const hsOrfao = itemHubspot({ testeId: 'hubspot-orfao', telefone: telefoneA, negocioId: 'negocio-ficticio-n' })
assert.strictEqual(mesclarItensAdminPorIdentidade([hsOrfao], [])[0], hsOrfao)
const localOrfao = itemLocal({ testeId: 'local-orfao', telefone: telefoneB })
assert.strictEqual(mesclarItensAdminPorIdentidade([], [localOrfao])[0], localOrfao)
const ordemGeral = mesclarItensAdminPorIdentidade([
  itemHubspot({ testeId: 'hubspot-ordem-1', telefone: telefoneA, negocioId: 'negocio-ficticio-o' }),
  itemHubspot({ testeId: 'hubspot-ordem-2', telefone: telefoneB, negocioId: 'negocio-ficticio-p' })
], [
  itemLocal({ testeId: 'local-ordem-1', telefone: '5511933330003' }),
  itemLocal({ testeId: 'local-ordem-2', telefone: '5511944440004' })
])
assert.deepEqual(ids(ordemGeral), ['hubspot-ordem-1', 'hubspot-ordem-2', 'local-ordem-1', 'local-ordem-2'])

// Arrays, itens e estruturas internas de entrada não são mutados.
const entradasHubspot = [itemHubspot({ testeId: 'hubspot-imutavel', telefone: telefoneA, negocioId: 'negocio-ficticio-q' })]
const entradasLocais = [itemLocal({ testeId: 'local-imutavel', telefone: '+55 (11) 91111-0001' })]
const snapshotHubspot = structuredClone(entradasHubspot)
const snapshotLocais = structuredClone(entradasLocais)
mesclarItensAdminPorIdentidade(entradasHubspot, entradasLocais)
assert.deepEqual(entradasHubspot, snapshotHubspot)
assert.deepEqual(entradasLocais, snapshotLocais)

console.log('✓ Composição por identidade e proteções de ambiguidade passaram\n');

// ====================================================================
// VERIFICACOES DE INTEGRACAO COM server.js
// ====================================================================

console.log('=== Verificacoes de Integracao com server.js ===\n');

const serverPath = path.join(__dirname, '..', 'server.js');
const serverContent = fs.readFileSync(serverPath, 'utf8');

// Verificacao 1: Import da funcao
console.log('Verificacao 1: Import de mesclarItensAdminPorIdentidade');
const importRegex = /require\s*\(\s*["']\.\/src\/domain\/admin-item-merge["']\s*\)/;
assert.match(serverContent, importRegex, 'server.js deve importar de ./src/domain/admin-item-merge');
const importLineMatch = serverContent.match(/const\s*{\s*mesclarItensAdminPorIdentidade\s*}\s*=\s*require\s*\(\s*["']\.\/src\/domain\/admin-item-merge["']\s*\)/);
assert(importLineMatch, 'server.js deve importar mesclarItensAdminPorIdentidade');
console.log('  OK - Import encontrado\n');

// Verificacao 2: Composição aplicada em adminResumoOperacional
console.log('Verificacao 2: Chamada de mesclarItensAdminPorIdentidade em adminResumoOperacional');
const callRegex = /const\s+todos\s*=\s*mesclarItensAdminPorIdentidade\s*\(\s*ativos\s*,\s*memoria\s*\)/;
assert.match(serverContent, callRegex, 'adminResumoOperacional deve compor ativos e memoria pelo helper puro');
const inicioResumo = serverContent.indexOf('async function adminResumoOperacional()')
const fimResumo = serverContent.indexOf('function gerarAlertasOperacionaisAdmin', inicioResumo)
const trechoResumo = serverContent.slice(inicioResumo, fimResumo)
assert.doesNotMatch(trechoResumo, /const\s+vistos\s*=|for\s*\(const\s+item\s+of\s+memoria\)/, 'loop antigo não deve permanecer em adminResumoOperacional')
console.log('  OK - Chamada encontrada\n');

console.log('✓ Todas as verificacoes de integracao com server.js passaram\n');

