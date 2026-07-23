"use strict"

const assert = require("node:assert")
const path = require("node:path")
const fs = require("node:fs")
const os = require("node:os")
const { test } = require("node:test")
const { auditPilot1HubSpotDealReadonly } = require("../scripts/audit-pilot1-hubspot-deal-readonly")

function createMockClient({ searchResults = [], verifyResult = null, searchError = null, verifyError = null, dealSearchResult = null, dealSearchError = null, dealVerifyResult = null, dealVerifyError = null, associationResult = null, associationError = null } = {}) {
  const client = {
    contacts: {
      search: async () => {
        if (searchError) throw searchError
        return { results: searchResults, total: searchResults.length }
      },
      getById: async () => {
        if (verifyError) throw verifyError
        return { properties: verifyResult || {} }
      }
    },
    deals: {
      search: async () => {
        if (dealSearchError) throw dealSearchError
        return dealSearchResult || { results: [], total: 0 }
      },
      getById: async () => {
        if (dealVerifyError) throw dealVerifyError
        return { properties: dealVerifyResult || {} }
      }
    },
    associations: {
      findDealContacts: async () => {
        if (associationError) throw associationError
        return { results: associationResult || [] }
      }
    }
  }
  const adapters = {
    contacts: {
      findContactsByCpf: async (cpf) => {
        if (searchError) throw searchError
        if (searchResults.length > 2) throw new Error("ADAPTER_AMBIGUOUS_RESULT")
        return searchResults.map(r => ({ id: r.id }))
      },
      findContactsByPhone: async (phone) => {
        if (searchError) throw searchError
        if (searchResults.length > 2) throw new Error("ADAPTER_AMBIGUOUS_RESULT")
        return searchResults.map(r => ({ id: r.id }))
      },
      verify: async (contactId, properties, context) => {
        if (verifyError) throw verifyError
        return {
          verified: true,
          id: contactId,
          cpf: String(verifyResult?.cpf_do_cliente || "").trim(),
          phone: String(verifyResult?.phone || "").trim(),
          firstname: String(verifyResult?.firstname || "").trim(),
          fieldsHash: "mock-hash",
          caseImportId: String(verifyResult?.numero_caso || context?.caseImportId || "").trim()
        }
      }
    },
    deals: {
      findByCaseNumber: async (caseNumber) => {
        if (dealSearchError) throw dealSearchError
        const results = dealSearchResult?.results || []
        if (results.length > 2) throw new Error("ADAPTER_AMBIGUOUS_RESULT")
        return results.map(r => ({ id: r.id }))
      },
      verify: async (dealId, properties) => {
        if (dealVerifyError) throw dealVerifyError
        return {
          verified: true,
          id: dealId,
          caseNumber: String(dealVerifyResult?.numero_de_caso || "").trim(),
          pipeline: "",
          stage: "",
          fieldsHash: "mock-hash"
        }
      }
    },
    associations: {
      find: async (contactId, dealId) => {
        if (associationError) throw associationError
        const results = associationResult || []
        return results.filter(r => String(r.toObjectId || r.id) === String(contactId)).map(r => ({
          id: `${contactId}:${dealId}:deal_to_contact`,
          associationTypes: [{ category: "HUBSPOT_DEFINED", typeId: 3 }]
        }))
      }
    }
  }
  return { env: { SINGLE_CASE_P1_CASE_IMPORT_ID: "mock-case-123", SINGLE_CASE_PLANS_ROOT: path.join(process.cwd(), "data", "case-import", "plans") }, adapters }
}

const FIXTURE_PLAN = {
  caseImportId: "mock-case-123",
  safeToApply: false,
  dealPlan: { caseNumber: "PROC.202400.001" },
  contactPlan: {
    properties: {
      firstname: "JOÃO DA SILVA",
      cpf_do_cliente: "52998224725",
      phone: "5511999999999"
    }
  }
}

function createTempPlan() {
  const dir = path.join(os.tmpdir(), "oraculum-test-" + Date.now() + "-" + Math.random().toString(36).slice(2, 8))
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, "plan.json"), JSON.stringify(FIXTURE_PLAN))
  return dir
}

function cleanupPath(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true }) } catch {}
}

// 1. contato não encontrado
test("contato-nao-encontrado", async () => {
  const dir = createTempPlan()
  try {
    const { env, adapters } = createMockClient({ searchResults: [] })
    env.SINGLE_CASE_PLANS_ROOT = dir
    const result = await auditPilot1HubSpotDealReadonly({ env, adapters })
    assert.strictEqual(result.CONTACT_SEARCH_EXECUTED, true)
    assert.strictEqual(result.CONTACT_CANDIDATES_COUNT, 0)
    assert.strictEqual(result.UNAMBIGUOUS_CONTACT_FOUND, false)
    assert.strictEqual(result.DEAL_SEARCHES, 0)
    assert.strictEqual(result.SAFE_FOR_REAL_READONLY_AUDIT, false)
  } finally { cleanupPath(dir) }
})

// 2. múltiplos contatos
test("multiplos-contatos", async () => {
  const dir = createTempPlan()
  try {
    const { env, adapters } = createMockClient({ searchResults: [{ id: "c1" }, { id: "c2" }] })
    env.SINGLE_CASE_PLANS_ROOT = dir
    const result = await auditPilot1HubSpotDealReadonly({ env, adapters })
    assert.strictEqual(result.CONTACT_CANDIDATES_COUNT, 2)
    assert.strictEqual(result.UNAMBIGUOUS_CONTACT_FOUND, false)
    assert.strictEqual(result.DEAL_SEARCHES, 0)
    assert.strictEqual(result.SAFE_FOR_REAL_READONLY_AUDIT, false)
  } finally { cleanupPath(dir) }
})

// 3. bindings divergentes
test("bindings-divergentes", async () => {
  const dir = createTempPlan()
  try {
    const { env, adapters } = createMockClient({
      searchResults: [{ id: "contact-1" }],
      verifyResult: { cpf_do_cliente: "12345678900", phone: "5511999999999", firstname: "JOÃO DA SILVA", numero_caso: "mock-case-123" }
    })
    env.SINGLE_CASE_PLANS_ROOT = dir
    const result = await auditPilot1HubSpotDealReadonly({ env, adapters })
    assert.strictEqual(result.CPF_BINDING_MATCH, false)
    assert.strictEqual(result.DEAL_SEARCHES, 0)
    assert.strictEqual(result.SAFE_FOR_REAL_READONLY_AUDIT, false)
  } finally { cleanupPath(dir) }
})

// 4. zero negócios
test("zero-negocios", async () => {
  const dir = createTempPlan()
  try {
    const { env, adapters } = createMockClient({
      searchResults: [{ id: "contact-1" }],
      verifyResult: { cpf_do_cliente: "52998224725", phone: "5511999999999", firstname: "JOÃO DA SILVA", numero_caso: "mock-case-123" },
      dealSearchResult: { results: [], total: 0 }
    })
    env.SINGLE_CASE_PLANS_ROOT = dir
    const result = await auditPilot1HubSpotDealReadonly({ env, adapters })
    assert.strictEqual(result.DEAL_CANDIDATES_COUNT, 0)
    assert.strictEqual(result.UNAMBIGUOUS_DEAL_FOUND, false)
    assert.strictEqual(result.DEAL_SEARCHES, 1)
    assert.strictEqual(result.SAFE_FOR_REAL_READONLY_AUDIT, false)
  } finally { cleanupPath(dir) }
})

// 5. um negócio sem associação
test("um-negocio-sem-associacao", async () => {
  const dir = createTempPlan()
  try {
    const { env, adapters } = createMockClient({
      searchResults: [{ id: "contact-1" }],
      verifyResult: { cpf_do_cliente: "52998224725", phone: "5511999999999", firstname: "JOÃO DA SILVA", numero_caso: "mock-case-123" },
      dealSearchResult: { results: [{ id: "deal-1" }], total: 1 },
      dealVerifyResult: { numero_de_caso: "PROC.202400.001" },
      associationResult: []
    })
    env.SINGLE_CASE_PLANS_ROOT = dir
    const result = await auditPilot1HubSpotDealReadonly({ env, adapters })
    assert.strictEqual(result.DEAL_CANDIDATES_COUNT, 1)
    assert.strictEqual(result.UNAMBIGUOUS_DEAL_FOUND, true)
    assert.strictEqual(result.DEAL_ID_PRESENT, true)
    assert.strictEqual(result.CASE_NUMBER_MATCH, true)
    assert.strictEqual(result.CONTACT_ASSOCIATION_MATCH, false)
    assert.strictEqual(result.SAFE_FOR_REAL_READONLY_AUDIT, false)
  } finally { cleanupPath(dir) }
})

// 6. um negócio com associação correta
test("um-negocio-com-associacao-correta", async () => {
  const dir = createTempPlan()
  try {
    const { env, adapters } = createMockClient({
      searchResults: [{ id: "contact-1" }],
      verifyResult: { cpf_do_cliente: "52998224725", phone: "5511999999999", firstname: "JOÃO DA SILVA", numero_caso: "mock-case-123" },
      dealSearchResult: { results: [{ id: "deal-1" }], total: 1 },
      dealVerifyResult: { numero_de_caso: "PROC.202400.001" },
      associationResult: [{ toObjectId: "contact-1", id: "deal-1", associationTypes: [{ category: "HUBSPOT_DEFINED", typeId: 3 }] }]
    })
    env.SINGLE_CASE_PLANS_ROOT = dir
    const result = await auditPilot1HubSpotDealReadonly({ env, adapters })
    assert.strictEqual(result.DEAL_CANDIDATES_COUNT, 1)
    assert.strictEqual(result.UNAMBIGUOUS_DEAL_FOUND, true)
    assert.strictEqual(result.DEAL_ID_PRESENT, true)
    assert.strictEqual(result.CASE_NUMBER_MATCH, true)
    assert.strictEqual(result.CONTACT_ASSOCIATION_MATCH, true)
    assert.strictEqual(result.SAFE_FOR_REAL_READONLY_AUDIT, true)
  } finally { cleanupPath(dir) }
})

// 7. um negócio associado a outro contato
test("um-negocio-associado-a-outro-contato", async () => {
  const dir = createTempPlan()
  try {
    const { env, adapters } = createMockClient({
      searchResults: [{ id: "contact-1" }],
      verifyResult: { cpf_do_cliente: "52998224725", phone: "5511999999999", firstname: "JOÃO DA SILVA", numero_caso: "mock-case-123" },
      dealSearchResult: { results: [{ id: "deal-1" }], total: 1 },
      dealVerifyResult: { numero_de_caso: "PROC.202400.001" },
      associationResult: [{ toObjectId: "contact-999", id: "deal-1", associationTypes: [{ category: "HUBSPOT_DEFINED", typeId: 3 }] }]
    })
    env.SINGLE_CASE_PLANS_ROOT = dir
    const result = await auditPilot1HubSpotDealReadonly({ env, adapters })
    assert.strictEqual(result.DEAL_CANDIDATES_COUNT, 1)
    assert.strictEqual(result.UNAMBIGUOUS_DEAL_FOUND, true)
    assert.strictEqual(result.DEAL_ID_PRESENT, true)
    assert.strictEqual(result.CASE_NUMBER_MATCH, true)
    assert.strictEqual(result.CONTACT_ASSOCIATION_MATCH, false)
    assert.strictEqual(result.SAFE_FOR_REAL_READONLY_AUDIT, false)
  } finally { cleanupPath(dir) }
})

// 8. múltiplos negócios
test("multiplos-negocios", async () => {
  const dir = createTempPlan()
  try {
    const { env, adapters } = createMockClient({
      searchResults: [{ id: "contact-1" }],
      verifyResult: { cpf_do_cliente: "52998224725", phone: "5511999999999", firstname: "JOÃO DA SILVA", numero_caso: "mock-case-123" },
      dealSearchResult: { results: [{ id: "deal-1" }, { id: "deal-2" }], total: 2 }
    })
    env.SINGLE_CASE_PLANS_ROOT = dir
    const result = await auditPilot1HubSpotDealReadonly({ env, adapters })
    assert.strictEqual(result.DEAL_CANDIDATES_COUNT, 2)
    assert.strictEqual(result.UNAMBIGUOUS_DEAL_FOUND, false)
    assert.strictEqual(result.DEAL_SEARCHES, 1)
    assert.strictEqual(result.SAFE_FOR_REAL_READONLY_AUDIT, false)
  } finally { cleanupPath(dir) }
})

// 9. número interno divergente
test("numero-interno-divergente", async () => {
  const dir = createTempPlan()
  try {
    const { env, adapters } = createMockClient({
      searchResults: [{ id: "contact-1" }],
      verifyResult: { cpf_do_cliente: "52998224725", phone: "5511999999999", firstname: "JOÃO DA SILVA", numero_caso: "mock-case-123" },
      dealSearchResult: { results: [{ id: "deal-1" }], total: 1 },
      dealVerifyResult: { numero_de_caso: "PROC.202400.002" }
    })
    env.SINGLE_CASE_PLANS_ROOT = dir
    const result = await auditPilot1HubSpotDealReadonly({ env, adapters })
    assert.strictEqual(result.DEAL_CANDIDATES_COUNT, 1)
    assert.strictEqual(result.UNAMBIGUOUS_DEAL_FOUND, true)
    assert.strictEqual(result.CASE_NUMBER_MATCH, false)
    assert.strictEqual(result.SAFE_FOR_REAL_READONLY_AUDIT, false)
  } finally { cleanupPath(dir) }
})

// 10. caseImportId divergente
test("caseImportId-divergente", async () => {
  const dir = createTempPlan()
  try {
    const { env, adapters } = createMockClient({
      searchResults: [{ id: "contact-1" }],
      verifyResult: { cpf_do_cliente: "52998224725", phone: "5511999999999", firstname: "JOÃO DA SILVA", numero_caso: "OTHER-CASE" }
    })
    env.SINGLE_CASE_PLANS_ROOT = dir
    const result = await auditPilot1HubSpotDealReadonly({ env, adapters })
    assert.strictEqual(result.CASE_IMPORT_BINDING_MATCH, false)
    assert.strictEqual(result.DEAL_SEARCHES, 0)
    assert.strictEqual(result.SAFE_FOR_REAL_READONLY_AUDIT, false)
  } finally { cleanupPath(dir) }
})

// 11. falha na busca de negócio
test("falha-busca-negocio", async () => {
  const dir = createTempPlan()
  try {
    const { env, adapters } = createMockClient({
      searchResults: [{ id: "contact-1" }],
      verifyResult: { cpf_do_cliente: "52998224725", phone: "5511999999999", firstname: "JOÃO DA SILVA", numero_caso: "mock-case-123" },
      dealSearchError: new Error("HUBSPOT_HTTP_500")
    })
    env.SINGLE_CASE_PLANS_ROOT = dir
    const result = await auditPilot1HubSpotDealReadonly({ env, adapters })
    assert.strictEqual(result.DEAL_SEARCH_FAILED, true)
    assert.strictEqual(result.DEAL_SEARCHES, 1)
    assert.strictEqual(result.SAFE_FOR_REAL_READONLY_AUDIT, false)
  } finally { cleanupPath(dir) }
})

// 12. falha na consulta de associação
test("falha-consulta-associacao", async () => {
  const dir = createTempPlan()
  try {
    const { env, adapters } = createMockClient({
      searchResults: [{ id: "contact-1" }],
      verifyResult: { cpf_do_cliente: "52998224725", phone: "5511999999999", firstname: "JOÃO DA SILVA", numero_caso: "mock-case-123" },
      dealSearchResult: { results: [{ id: "deal-1" }], total: 1 },
      dealVerifyResult: { numero_de_caso: "PROC.202400.001" },
      associationError: new Error("HUBSPOT_HTTP_404")
    })
    env.SINGLE_CASE_PLANS_ROOT = dir
    const result = await auditPilot1HubSpotDealReadonly({ env, adapters })
    assert.strictEqual(result.DEAL_CANDIDATES_COUNT, 1)
    assert.strictEqual(result.UNAMBIGUOUS_DEAL_FOUND, true)
    assert.strictEqual(result.ASSOCIATION_READ_FAILED, true)
    assert.strictEqual(result.DEAL_SEARCHES, 1)
    assert.strictEqual(result.SAFE_FOR_REAL_READONLY_AUDIT, false)
  } finally { cleanupPath(dir) }
})

// 13. ausência de chamadas de criação ou atualização
test("ausencia-criacao-atualizacao", async () => {
  const dir = createTempPlan()
  try {
    const { env, adapters } = createMockClient({
      searchResults: [{ id: "contact-1" }],
      verifyResult: { cpf_do_cliente: "52998224725", phone: "5511999999999", firstname: "JOÃO DA SILVA", numero_caso: "mock-case-123" },
      dealSearchResult: { results: [], total: 0 }
    })
    env.SINGLE_CASE_PLANS_ROOT = dir
    const result = await auditPilot1HubSpotDealReadonly({ env, adapters })
    assert.strictEqual(result.DEAL_CANDIDATES_COUNT, 0)
    assert.strictEqual(result.UNAMBIGUOUS_DEAL_FOUND, false)
    assert.strictEqual(result.SAFE_FOR_REAL_READONLY_AUDIT, false)
    assert.strictEqual(result.DEAL_SEARCHES, 1)
  } finally { cleanupPath(dir) }
})
