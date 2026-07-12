const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { mesclarItemAdminHubspotComMemoria } = require('../src/domain/admin-item-merge.js');

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

// ====================================================================
// VERIFICACOES DE INTEGRACAO COM server.js
// ====================================================================

console.log('=== Verificacoes de Integracao com server.js ===\n');

const serverPath = path.join(__dirname, '..', 'server.js');
const serverContent = fs.readFileSync(serverPath, 'utf8');

// Verificacao 1: Import da funcao
console.log('Verificacao 1: Import de mesclarItemAdminHubspotComMemoria');
const importRegex = /require\s*\(\s*["']\.\/src\/domain\/admin-item-merge["']\s*\)/;
assert.match(serverContent, importRegex, 'server.js deve importar de ./src/domain/admin-item-merge');
const importLineMatch = serverContent.match(/const\s*{\s*mesclarItemAdminHubspotComMemoria\s*}\s*=\s*require\s*\(\s*["']\.\/src\/domain\/admin-item-merge["']\s*\)/);
assert(importLineMatch, 'server.js deve exportar mesclarItemAdminHubspotComMemoria no require');
console.log('  OK - Import encontrado\n');

// Verificacao 2: Chamada da funcao em adminResumoOperacional
console.log('Verificacao 2: Chamada de mesclarItemAdminHubspotComMemoria em adminResumoOperacional');
const callRegex = /mesclarItemAdminHubspotComMemoria\s*\(\s*todos\[idx\]\s*,\s*item\s*\)/;
assert.match(serverContent, callRegex, 'server.js deve chamar mesclarItemAdminHubspotComMemoria(todos[idx], item)');
console.log('  OK - Chamada encontrada\n');

// Verificacao 3: Atribuicao do resultado de volta ao array
console.log('Verificacao 3: Atribuicao do resultado de volta ao array');
const assignmentRegex = /todos\[idx\]\s*=\s*mesclarItemAdminHubspotComMemoria\s*\(\s*todos\[idx\]\s*,\s*item\s*\)/;
assert.match(serverContent, assignmentRegex, 'server.js deve atribuir o resultado: todos[idx] = mesclarItemAdminHubspotComMemoria(todos[idx], item)');
console.log('  OK - Atribuicao encontrada\n');

// Verificacao 4: Contexto de duplicacao de negocioId
console.log('Verificacao 4: Contexto de tratamento de negocioId duplicado');
const contextRegex = /else\s+if\s*\(\s*id\s*&&\s*vistos\.has\s*\(\s*id\s*\)\s*\)/;
assert.match(serverContent, contextRegex, 'server.js deve verificar negocioId duplicado com: else if (id && vistos.has(id))');
console.log('  OK - Contexto de duplicacao encontrado\n');

console.log('✓ Todas as verificacoes de integracao com server.js passaram\n');

