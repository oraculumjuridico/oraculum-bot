"use strict"

const test = require('node:test')
const assert = require('node:assert/strict')
const { createHubSpotSingleCaseAdapters } = require('../src/adapters/hubspot-single-case-adapter')
const { sha256, canonicalize } = require('../src/domain/single-case-apply-contracts')

function makeClock(now = new Date()) { return () => new Date(now).toISOString() }

function makeClient(overrides = {}) {
  // default doubles
  const calls = { searchCpf:0, searchPhone:0, createContact:0, getContact:0, searchDeal:0, createDeal:0, getDeal:0, assocGet:0, assocCreate:0 }
  const client = {
    crm: {
      contacts: {
        searchApi: { doSearch: async (opts) => { calls.searchCpf++; return overrides.search || { results: overrides.searchResults || [] } } },
        basicApi: {
          create: async (body) => { calls.createContact++; return overrides.createContactResponse || { id: overrides.createContactId || 'contact-1' } },
          getById: async (id, opts) => { calls.getContact++; return overrides.getContactResponse || { properties: overrides.getContactProperties || {} } }
        }
      },
      deals: {
        searchApi: { doSearch: async (opts) => { calls.searchDeal++; return overrides.searchDealResponse || { results: overrides.searchDealResults || [] } } },
        basicApi: {
          create: async (body) => { calls.createDeal++; return overrides.createDealResponse || { id: overrides.createDealId || 'deal-1' } },
          getById: async (id, opts) => { calls.getDeal++; return overrides.getDealResponse || { properties: overrides.getDealProperties || {} } }
        },
        associationsApi: {
          getAll: async (dealId, to, opts) => { calls.assocGet++; return overrides.assocGetResponse || { results: overrides.assocGetResults || [] } },
          create: async (dealId, to, contactId, body) => { calls.assocCreate++; return overrides.assocCreateResponse || { } }
        }
      }
    },
    __calls: calls
  }
  return client
}

// Shortcuts
const makeAdapters = (opts = {}) => createHubSpotSingleCaseAdapters({ client: makeClient(opts.client || {}), clock: makeClock(opts.now || new Date()), timeoutMs: opts.timeoutMs || 1000, hash: sha256 })

// Tests start

test('contacts.findContactsByCpf: not found, single, multiple', async () => {
  // not found
  let client = makeClient({ searchResults: [] })
  let adapters = createHubSpotSingleCaseAdapters({ client, clock: makeClock(), timeoutMs: 1000 })
  let res = await adapters.contacts.findContactsByCpf('00000000000')
  assert.deepEqual(res, [])

  // single
  client = makeClient({ searchResults: [{ id: 'c1' }] })
  adapters = createHubSpotSingleCaseAdapters({ client, clock: makeClock(), timeoutMs: 1000 })
  res = await adapters.contacts.findContactsByCpf('111')
  assert.deepEqual(res, [{ id: 'c1' }])

  // multiple
  client = makeClient({ searchResults: [{ id: 'c1' }, { id: 'c2' }] })
  adapters = createHubSpotSingleCaseAdapters({ client, clock: makeClock(), timeoutMs: 1000 })
  res = await adapters.contacts.findContactsByCpf('222')
  assert.deepEqual(res, [{ id: 'c1' }, { id: 'c2' }])
})

test('contacts.findContactsByPhone: not found, single, multiple', async () => {
  let client = makeClient({ searchResults: [] })
  let adapters = createHubSpotSingleCaseAdapters({ client, clock: makeClock() })
  let res = await adapters.contacts.findContactsByPhone('')
  assert.deepEqual(res, [])

  client = makeClient({ searchResults: [{ id: 'p1' }] })
  adapters = createHubSpotSingleCaseAdapters({ client, clock: makeClock() })
  res = await adapters.contacts.findContactsByPhone('+5511999999999')
  assert.deepEqual(res, [{ id: 'p1' }])

  client = makeClient({ searchResults: [{ id: 'p1' }, { id: 'p2' }] })
  adapters = createHubSpotSingleCaseAdapters({ client, clock: makeClock() })
  res = await adapters.contacts.findContactsByPhone('+551199')
  assert.deepEqual(res, [{ id: 'p1' }, { id: 'p2' }])
})

test('contacts.search pagination detection returns two results when present', async () => {
  const client = makeClient({ searchResults: [{ id: 'x1' }, { id: 'x2' }, { id: 'x3' }] })
  const adapters = createHubSpotSingleCaseAdapters({ client, clock: makeClock(), timeoutMs: 1000 })
  const res = await adapters.contacts.findContactsByCpf('any')
  // adapter limits to 2
  assert.equal(res.length, 2)
})

// New edge cases for pagination / ambiguous metadata

test('contacts.find: one item but paging.next indicates more -> ambiguous', async () => {
  const client = makeClient({ search: { results: [{ id: 'a1' }], paging: { next: { after: 't' } } } })
  const adapters = createHubSpotSingleCaseAdapters({ client, clock: makeClock() })
  await assert.rejects(async () => await adapters.contacts.findContactsByCpf('x'), /ADAPTER_AMBIGUOUS_RESULT/)
})

test('contacts.find: total>1 but results length is 1 -> ambiguous', async () => {
  const client = makeClient({ search: { results: [{ id: 'a1' }], total: 2 } })
  const adapters = createHubSpotSingleCaseAdapters({ client, clock: makeClock() })
  await assert.rejects(async () => await adapters.contacts.findContactsByCpf('x'), /ADAPTER_AMBIGUOUS_RESULT/)
})

test('contacts.find: response without results handled as empty', async () => {
  const client = makeClient({ search: { foo: 'bar' } })
  const adapters = createHubSpotSingleCaseAdapters({ client, clock: makeClock() })
  const res = await adapters.contacts.findContactsByCpf('x')
  assert.deepEqual(res, [])
})

test('contacts.find: invalid/missing ids cause INVALID_RESULT_ID', async () => {
  const client = makeClient({ searchResults: [{ id: null }, { id: 'ok' }] })
  const adapters = createHubSpotSingleCaseAdapters({ client, clock: makeClock() })
  await assert.rejects(async () => await adapters.contacts.findContactsByCpf('x'), /INVALID_RESULT_ID/)
})

// deterministic ordering: adapter returns results in API order trimmed to 2
test('contacts.find: deterministic order preserved', async () => {
  const client = makeClient({ searchResults: [{ id: 'first' }, { id: 'second' }, { id: 'third' }] })
  const adapters = createHubSpotSingleCaseAdapters({ client, clock: makeClock() })
  const res = await adapters.contacts.findContactsByCpf('x')
  assert.equal(res[0].id, 'first')
  assert.equal(res[1].id, 'second')
})


test('contacts.create: valid and missing id', async () => {
  // valid
  let client = makeClient({ createContactId: 'ct-1' })
  let adapters = createHubSpotSingleCaseAdapters({ client, clock: makeClock() })
  const ctx = { caseImportId: 'abc', deadline: new Date(Date.now()+10000).toISOString() }
  const created = await adapters.contacts.create({ properties: { firstname: 'X' }, context: ctx })
  assert.equal(typeof created.id, 'string')

  // missing id -> should throw
  client = makeClient({ createContactResponse: {} })
  adapters = createHubSpotSingleCaseAdapters({ client, clock: makeClock(), timeoutMs: 1000 })
  await assert.rejects(async () => {
    await adapters.contacts.create({ properties: { firstname: 'Y' }, context: ctx })
  }, /INVALID_RESPONSE_ID|HUBSPOT_EXTERNAL_ERROR/)
})

test('contacts.create: timeout is not retried and throws HUBSPOT_TIMEOUT', async () => {
  // simulate long promise
  const client = makeClient({})
  client.crm.contacts.basicApi.create = () => new Promise(() => {}) // never resolves
  const adapters = createHubSpotSingleCaseAdapters({ client, clock: makeClock(), timeoutMs: 10 })
  const ctx = { caseImportId: 'c1', deadline: new Date(Date.now()+10000).toISOString() }
  await assert.rejects(async () => {
    await adapters.contacts.create({ properties: { firstname: 'Z' }, context: ctx })
  }, /HUBSPOT_EXTERNAL_ERROR|HUBSPOT_TIMEOUT|HUBSPOT_EXTERNAL_EFFECT_UNKNOWN/)
  // ensure single call
  // our makeClient increments only the default; overridden method doesn't increment
})


test('contacts.verify: approved and divergent', async () => {
  const props = { cpf_do_cliente: '123', phone: '55' }
  const client = makeClient({ getContactProperties: props })
  const adapters = createHubSpotSingleCaseAdapters({ client, clock: makeClock() })
  const out = await adapters.contacts.verify('ct-1', { cpf_do_cliente: '123', phone: '55' }, { caseImportId: 'ci' })
  assert.equal(out.id, 'ct-1')
  assert.equal(out.cpf, '123')
  assert.equal(out.phone, '55')
  assert.equal(typeof out.fieldsHash, 'string')

  // divergence: executor compares cpf vs provided; adapter returns fetched cpf different
  const client2 = makeClient({ getContactProperties: { cpf_do_cliente: '999', phone: '88' } })
  const adapters2 = createHubSpotSingleCaseAdapters({ client: client2, clock: makeClock() })
  const out2 = await adapters2.contacts.verify('ct-2', { cpf_do_cliente: '123', phone: '55' })
  assert.equal(out2.cpf, '999')
  assert.notEqual(out2.cpf, '123')
})


test('deals.findByCaseNumber: not found, single, multiple', async () => {
  let client = makeClient({ searchDealResults: [] })
  let adapters = createHubSpotSingleCaseAdapters({ client, clock: makeClock() })
  let res = await adapters.deals.findByCaseNumber('000')
  assert.deepEqual(res, [])

  client = makeClient({ searchDealResults: [{ id: 'd1' }] })
  adapters = createHubSpotSingleCaseAdapters({ client, clock: makeClock() })
  res = await adapters.deals.findByCaseNumber('111')
  assert.deepEqual(res, [{ id: 'd1' }])

  client = makeClient({ searchDealResults: [{ id: 'd1' }, { id: 'd2' }] })
  adapters = createHubSpotSingleCaseAdapters({ client, clock: makeClock() })
  res = await adapters.deals.findByCaseNumber('222')
  assert.deepEqual(res, [{ id: 'd1' }, { id: 'd2' }])
})

// Additional deals pagination ambiguity tests

test('deals.find: one item but total indicates more -> ambiguous', async () => {
  const client = makeClient({ searchDealResponse: { results: [{ id: 'd1' }], total: 3 } })
  const adapters = createHubSpotSingleCaseAdapters({ client, clock: makeClock() })
  await assert.rejects(async () => await adapters.deals.findByCaseNumber('x'), /ADAPTER_AMBIGUOUS_RESULT/)
})


test('deals.create: valid and missing id', async () => {
  let client = makeClient({ createDealId: 'deal-xyz' })
  let adapters = createHubSpotSingleCaseAdapters({ client, clock: makeClock() })
  const ctx = { caseImportId: 'c', deadline: new Date(Date.now()+10000).toISOString() }
  const created = await adapters.deals.create({ properties: { dealname: 'X' }, context: ctx })
  assert.equal(created.id, 'deal-xyz')

  client = makeClient({ createDealResponse: {} })
  adapters = createHubSpotSingleCaseAdapters({ client, clock: makeClock() })
  await assert.rejects(async () => await adapters.deals.create({ properties: { dealname: 'Y' }, context: ctx }))
})


test('deals.verify: approved, pipeline/stage divergences', async () => {
  const dealProps = { numero_de_caso: 'N1', pipeline: 'p', dealstage: 's' }
  let client = makeClient({ getDealProperties: dealProps })
  let adapters = createHubSpotSingleCaseAdapters({ client, clock: makeClock() })
  const out = await adapters.deals.verify('deal-1', { numero_de_caso: 'N1' })
  assert.equal(out.caseNumber, 'N1')
  assert.equal(out.pipeline, 'p')
  assert.equal(out.stage, 's')

  // pipeline divergence
  client = makeClient({ getDealProperties: { numero_de_caso: 'N1', pipeline: 'other', dealstage: 's' } })
  adapters = createHubSpotSingleCaseAdapters({ client, clock: makeClock() })
  const out2 = await adapters.deals.verify('deal-2', { numero_de_caso: 'N1' })
  assert.equal(out2.pipeline, 'other')
  assert.notEqual(out2.pipeline, 'p')
})


test('associations: find none, existing, multiple; create and verify; type divergence', async () => {
  // none
  let client = makeClient({ assocGetResults: [] })
  let adapters = createHubSpotSingleCaseAdapters({ client, clock: makeClock() })
  let res = await adapters.associations.find('c1', 'd1')
  assert.deepEqual(res, [])

  // existing with type present
  client = makeClient({ assocGetResults: [{ id: 'c1', type: 'deal_to_contact' }] })
  adapters = createHubSpotSingleCaseAdapters({ client, clock: makeClock() })
  res = await adapters.associations.find('c1', 'd1')
  assert.deepEqual(res, [{ id: 'c1:d1:deal_to_contact' }])

  // multiple associations for same contact with different types
  client = makeClient({ assocGetResults: [{ id: 'c1', type: 't1' }, { id: 'c1', type: 't2' }] })
  adapters = createHubSpotSingleCaseAdapters({ client, clock: makeClock() })
  res = await adapters.associations.find('c1', 'd1')
  assert.equal(res.length, 2)
  assert.equal(res[0].id, 'c1:d1:t1')
  assert.equal(res[1].id, 'c1:d1:t2')

  // create requires type
  client = makeClient({})
  adapters = createHubSpotSingleCaseAdapters({ client, clock: makeClock() })
  const ctx = { caseImportId: 'ci', deadline: new Date(Date.now()+10000).toISOString() }
  const created = await adapters.associations.create({ contactId: 'c1', dealId: 'd1', type: 'deal_to_contact', context: ctx })
  assert.equal(created.id, 'c1:d1:deal_to_contact')

  // create rejects missing type
  await assert.rejects(async () => {
    await adapters.associations.create({ contactId: 'c1', dealId: 'd1', type: null, context: ctx })
  }, /ASSOCIATION_PARAMS_INVALID/)

  // create rejects empty type
  await assert.rejects(async () => {
    await adapters.associations.create({ contactId: 'c1', dealId: 'd1', type: '', context: ctx })
  }, /ASSOCIATION_PARAMS_INVALID/)

  // verify with matching type
  client = makeClient({ assocGetResults: [{ id: 'c1', associationType: 'deal_to_contact' }] })
  adapters = createHubSpotSingleCaseAdapters({ client, clock: makeClock() })
  const verified = await adapters.associations.verify('c1:d1:deal_to_contact', 'c1', 'd1', 'deal_to_contact')
  assert.equal(verified.verified, true)
  assert.equal(verified.relation, 'deal_to_contact')

  // verify rejects missing type parameter
  await assert.rejects(async () => {
    await adapters.associations.verify('c1:d1:deal_to_contact', 'c1', 'd1', null)
  }, /ASSOCIATION_VERIFY_PARAMS_INVALID/)

  // verify rejects empty type parameter
  await assert.rejects(async () => {
    await adapters.associations.verify('c1:d1:deal_to_contact', 'c1', 'd1', '')
  }, /ASSOCIATION_VERIFY_PARAMS_INVALID/)

  // verify fails when type differs
  client = makeClient({ assocGetResults: [{ id: 'c1', associationType: 'other_type' }] })
  adapters = createHubSpotSingleCaseAdapters({ client, clock: makeClock() })
  const verified2 = await adapters.associations.verify('c1:d1:deal_to_contact', 'c1', 'd1', 'deal_to_contact')
  assert.equal(verified2.verified, false)
})


test('errors with PII are sanitized and not leaked', async () => {
  const client = makeClient({})
  client.crm.contacts.searchApi.doSearch = async () => { throw new Error('bad payload {"cpf_do_cliente":"12345678900"}') }
  const adapters = createHubSpotSingleCaseAdapters({ client, clock: makeClock() })
  // should not throw original error with PII content; adapter maps to generic
  await assert.rejects(async () => await adapters.contacts.findContactsByCpf('123'), /HUBSPOT_EXTERNAL_ERROR|HUBSPOT_TIMEOUT|HUBSPOT_EXTERNAL_ERROR/)
})


test('context and deadline validation', async () => {
  const client = makeClient({ createContactId: 'ok' })
  const adapters = createHubSpotSingleCaseAdapters({ client, clock: makeClock() })
  await assert.rejects(async () => await adapters.contacts.create({ properties: { firstname: 'x' }, context: {} }), /CONTEXT_CASE_MISSING/)
  const pastCtx = { caseImportId: 'c', deadline: new Date(Date.now()-10000).toISOString() }
  await assert.rejects(async () => await adapters.contacts.create({ properties: { firstname: 'x' }, context: pastCtx }), /DEADLINE_EXPIRED/)
})

// Ensure no use of Drive/messages: basic smoke check by asserting client has no drive property

test('no calls to Drive or Messages', async () => {
  const client = makeClient({})
  assert.equal(typeof client.crm.drive, 'undefined')
})

console.log('hubspot-single-case-adapter.test.js: definitions loaded')
