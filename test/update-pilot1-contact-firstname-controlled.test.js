"use strict"

const assert = require("node:assert")
const path = require("node:path")
const fs = require("node:fs")
const os = require("node:os")
const { test } = require("node:test")
const { executeControlledFirstnameUpdate } = require("../scripts/update-pilot1-contact-firstname-controlled")

function mockAdapters({ searchResults = [], verifyResult = null, postVerifyResult = null, searchError = null, verifyError = null, updateError = null, postVerifyError = null } = {}) {
  let updateCount = 0
  let verifyCalls = 0
  const client = {
    contacts: {
      search: async () => {
        if (searchError) throw searchError
        return { results: searchResults, total: searchResults.length }
      },
      getById: async () => {
        if (verifyCalls === 1 && postVerifyError) throw postVerifyError
        if (verifyCalls === 0 && verifyError) throw verifyError
        const result = verifyCalls === 0 ? verifyResult : postVerifyResult
        verifyCalls++
        return { properties: result || {} }
      }
    },
    deals: { search: async () => ({ results: [] }), getById: async () => ({ properties: {} }) },
    associations: { findDealContacts: async () => ({ results: [] }) }
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
        if (verifyCalls === 1 && postVerifyError) throw postVerifyError
        if (verifyCalls === 0 && verifyError) throw verifyError
        const result = verifyCalls === 0 ? verifyResult : postVerifyResult
        verifyCalls++
        const base = {
          verified: true,
          id: result?.id || contactId,
          cpf: String(result.cpf_do_cliente || "").trim(),
          phone: String(result.phone || "").trim(),
          firstname: String(result.firstname || "").trim(),
          fieldsHash: "mock-hash",
          caseImportId: String(result.numero_caso || context?.caseImportId || "").trim()
        }
        return base
      },
      update: async (contactId, payload) => {
        if (updateError) throw updateError
        if (updateCount >= 1) throw new Error("UPDATE_ALREADY_EXECUTED")
        updateCount++
        return { id: contactId, ...payload }
      }
    }
  }
  return { env: { HUBSPOT_TOKEN: "mock-token", SINGLE_CASE_P1_CASE_IMPORT_ID: "mock-case-123", SINGLE_CASE_PLANS_ROOT: path.join(process.cwd(), "data", "case-import", "plans") }, adapters, updateCount: () => updateCount, verifyCalls: () => verifyCalls }
}

const FIXTURE_PLAN = {
  caseImportId: "mock-case-123",
  safeToApply: false,
  dealPlan: {
    caseNumber: "PROC.202400.001"
  },
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
  const file = path.join(dir, "plan.json")
  fs.writeFileSync(file, JSON.stringify(FIXTURE_PLAN))
  return dir
}

function cleanupPath(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true }) } catch {}
}

// 1. Sucesso com uma única escrita
test("sucesso-uma-escrita", async () => {
  const dir = createTempPlan()
  try {
    const { env, adapters, updateCount, verifyCalls } = mockAdapters({
      searchResults: [{ id: "contact-1" }],
      verifyResult: {
        cpf_do_cliente: "52998224725",
        phone: "5511999999999",
        firstname: "JOÃO DA SILVA",
        numero_caso: "mock-case-123"
      },
      postVerifyResult: {
        cpf_do_cliente: "52998224725",
        phone: "5511999999999",
        firstname: "João da Silva",
        numero_caso: "mock-case-123"
      }
    })
    env.SINGLE_CASE_PLANS_ROOT = dir
    const result = await executeControlledFirstnameUpdate({ env, adapters })
    assert.strictEqual(result.CONTACT_SEARCH_EXECUTED, true)
    assert.strictEqual(result.CONTACT_CANDIDATES_COUNT, 1)
    assert.strictEqual(result.UNAMBIGUOUS_CONTACT_FOUND, true)
    assert.strictEqual(result.CPF_BINDING_MATCH, true)
    assert.strictEqual(result.PHONE_BINDING_MATCH, true)
    assert.strictEqual(result.CASE_IMPORT_BINDING_MATCH, true)
    assert.strictEqual(result.SEMANTIC_NAME_MATCH, true)
    assert.strictEqual(result.PRESENTATION_NAME_MATCH, false)
    assert.strictEqual(result.NORMALIZATION_REQUIRED, true)
    assert.strictEqual(result.HUBSPOT_WRITE_EXECUTED, true)
    assert.strictEqual(result.POSTGRES_WRITE_EXECUTED, false)
    assert.strictEqual(result.UPDATE_CALLS, 1)
    assert.strictEqual(updateCount(), 1)
    assert.strictEqual(verifyCalls(), 2)
    assert.strictEqual(result.POST_UPDATE_READS, 1)
    assert.strictEqual(result.POST_UPDATE_VERIFICATION.contactIdMatch, true)
    assert.strictEqual(result.POST_UPDATE_VERIFICATION.cpfUnchanged, true)
    assert.strictEqual(result.POST_UPDATE_VERIFICATION.phoneUnchanged, true)
    assert.strictEqual(result.POST_UPDATE_VERIFICATION.caseImportIdUnchanged, true)
    assert.strictEqual(result.POST_UPDATE_VERIFICATION.presentationMatch, true)
    assert.strictEqual(result.POST_UPDATE_VERIFICATION.semanticMatch, true)
    assert.strictEqual(result.SAFE_FOR_CONTROLLED_WRITE_PREPARATION, true)
  } finally {
    cleanupPath(dir)
  }
})

// 2. Zero candidatos
test("zero-candidatos", async () => {
  const dir = createTempPlan()
  try {
    const { env, adapters } = mockAdapters({ searchResults: [] })
    env.SINGLE_CASE_PLANS_ROOT = dir
    const result = await executeControlledFirstnameUpdate({ env, adapters })
    assert.strictEqual(result.CONTACT_SEARCH_EXECUTED, true)
    assert.strictEqual(result.CONTACT_CANDIDATES_COUNT, 0)
    assert.strictEqual(result.UNAMBIGUOUS_CONTACT_FOUND, false)
    assert.strictEqual(result.HUBSPOT_WRITE_EXECUTED, false)
    assert.strictEqual(result.SAFE_FOR_CONTROLLED_WRITE_PREPARATION, false)
  } finally {
    cleanupPath(dir)
  }
})

// 3. Múltiplos candidatos
test("multiplos-candidatos", async () => {
  const dir = createTempPlan()
  try {
    const { env, adapters } = mockAdapters({
      searchResults: [{ id: "c1" }, { id: "c2" }]
    })
    env.SINGLE_CASE_PLANS_ROOT = dir
    const result = await executeControlledFirstnameUpdate({ env, adapters })
    assert.strictEqual(result.CONTACT_CANDIDATES_COUNT, 2)
    assert.strictEqual(result.UNAMBIGUOUS_CONTACT_FOUND, false)
    assert.strictEqual(result.HUBSPOT_WRITE_EXECUTED, false)
    assert.strictEqual(result.SAFE_FOR_CONTROLLED_WRITE_PREPARATION, false)
  } finally {
    cleanupPath(dir)
  }
})

// 4. Divergência de CPF
test("divergencia-cpf", async () => {
  const dir = createTempPlan()
  try {
    const { env, adapters } = mockAdapters({
      searchResults: [{ id: "contact-1" }],
      verifyResult: { cpf_do_cliente: "12345678900", phone: "5511999999999", firstname: "JOÃO DA SILVA", numero_caso: "mock-case-123" }
    })
    env.SINGLE_CASE_PLANS_ROOT = dir
    const result = await executeControlledFirstnameUpdate({ env, adapters })
    assert.strictEqual(result.CPF_BINDING_MATCH, false)
    assert.strictEqual(result.HUBSPOT_WRITE_EXECUTED, false)
    assert.strictEqual(result.SAFE_FOR_CONTROLLED_WRITE_PREPARATION, false)
  } finally {
    cleanupPath(dir)
  }
})

// 5. Divergência de telefone
test("divergencia-telefone", async () => {
  const dir = createTempPlan()
  try {
    const { env, adapters } = mockAdapters({
      searchResults: [{ id: "contact-1" }],
      verifyResult: { cpf_do_cliente: "52998224725", phone: "5511988888888", firstname: "JOÃO DA SILVA", numero_caso: "mock-case-123" }
    })
    env.SINGLE_CASE_PLANS_ROOT = dir
    const result = await executeControlledFirstnameUpdate({ env, adapters })
    assert.strictEqual(result.PHONE_BINDING_MATCH, false)
    assert.strictEqual(result.HUBSPOT_WRITE_EXECUTED, false)
    assert.strictEqual(result.SAFE_FOR_CONTROLLED_WRITE_PREPARATION, false)
  } finally {
    cleanupPath(dir)
  }
})

// 6. Divergência de caseImportId
test("divergencia-caseImportId", async () => {
  const dir = createTempPlan()
  try {
    const { env, adapters } = mockAdapters({
      searchResults: [{ id: "contact-1" }],
      verifyResult: { cpf_do_cliente: "52998224725", phone: "5511999999999", firstname: "JOÃO DA SILVA", numero_caso: "OTHER-CASE" }
    })
    env.SINGLE_CASE_PLANS_ROOT = dir
    const result = await executeControlledFirstnameUpdate({ env, adapters })
    assert.strictEqual(result.CASE_IMPORT_BINDING_MATCH, false)
    assert.strictEqual(result.HUBSPOT_WRITE_EXECUTED, false)
    assert.strictEqual(result.SAFE_FOR_CONTROLLED_WRITE_PREPARATION, false)
  } finally {
    cleanupPath(dir)
  }
})

// 7. Nome semanticamente diferente
test("nome-semanticamente-diferente", async () => {
  const dir = createTempPlan()
  try {
    const { env, adapters } = mockAdapters({
      searchResults: [{ id: "contact-1" }],
      verifyResult: { cpf_do_cliente: "52998224725", phone: "5511999999999", firstname: "PEDRO SOUZA", numero_caso: "mock-case-123" }
    })
    env.SINGLE_CASE_PLANS_ROOT = dir
    const result = await executeControlledFirstnameUpdate({ env, adapters })
    assert.strictEqual(result.SEMANTIC_NAME_MATCH, false)
    assert.strictEqual(result.HUBSPOT_WRITE_EXECUTED, false)
    assert.strictEqual(result.SAFE_FOR_CONTROLLED_WRITE_PREPARATION, false)
  } finally {
    cleanupPath(dir)
  }
})

// 8. Nome já canônico
test("nome-ja-canônico", async () => {
  const dir = createTempPlan()
  try {
    const { env, adapters } = mockAdapters({
      searchResults: [{ id: "contact-1" }],
      verifyResult: { cpf_do_cliente: "52998224725", phone: "5511999999999", firstname: "João da Silva", numero_caso: "mock-case-123" }
    })
    env.SINGLE_CASE_PLANS_ROOT = dir
    const result = await executeControlledFirstnameUpdate({ env, adapters })
    assert.strictEqual(result.PRESENTATION_NAME_MATCH, true)
    assert.strictEqual(result.NORMALIZATION_REQUIRED, false)
    assert.strictEqual(result.HUBSPOT_WRITE_EXECUTED, false)
    assert.strictEqual(result.SAFE_FOR_CONTROLLED_WRITE_PREPARATION, false)
  } finally {
    cleanupPath(dir)
  }
})

// 9. Falha no update
test("falha-no-update", async () => {
  const dir = createTempPlan()
  try {
    const { env, adapters, updateCount } = mockAdapters({
      searchResults: [{ id: "contact-1" }],
      verifyResult: { cpf_do_cliente: "52998224725", phone: "5511999999999", firstname: "JOÃO DA SILVA", numero_caso: "mock-case-123" },
      updateError: new Error("HUBSPOT_HTTP_500")
    })
    env.SINGLE_CASE_PLANS_ROOT = dir
    const result = await executeControlledFirstnameUpdate({ env, adapters })
    assert.strictEqual(result.HUBSPOT_WRITE_EXECUTED, false)
    assert.strictEqual(result.UPDATE_CALLS, undefined)
    assert.strictEqual(updateCount(), 0)
    assert.ok(result.UPDATE_ERROR)
    assert.strictEqual(result.SAFE_FOR_CONTROLLED_WRITE_PREPARATION, false)
  } finally {
    cleanupPath(dir)
  }
})

// 10. Uma chamada de update apenas
test("uma-chamada-update-apenas", async () => {
  const dir = createTempPlan()
  try {
    const { env, adapters, updateCount } = mockAdapters({
      searchResults: [{ id: "contact-1" }],
      verifyResult: {
        cpf_do_cliente: "52998224725",
        phone: "5511999999999",
        firstname: "JOÃO DA SILVA",
        numero_caso: "mock-case-123"
      },
      postVerifyResult: {
        cpf_do_cliente: "52998224725",
        phone: "5511999999999",
        firstname: "João da Silva",
        numero_caso: "mock-case-123"
      }
    })
    env.SINGLE_CASE_PLANS_ROOT = dir
    const result = await executeControlledFirstnameUpdate({ env, adapters })
    assert.strictEqual(result.HUBSPOT_WRITE_EXECUTED, true)
    assert.strictEqual(result.UPDATE_CALLS, 1)
    assert.strictEqual(updateCount(), 1)
    assert.strictEqual(result.POST_UPDATE_VERIFICATION.presentationMatch, true)
    assert.strictEqual(result.SAFE_FOR_CONTROLLED_WRITE_PREPARATION, true)
  } finally {
    cleanupPath(dir)
  }
})

// 11. contactId alterado depois do update
test("contactId-alterado-depois", async () => {
  const dir = createTempPlan()
  try {
    const { env, adapters } = mockAdapters({
      searchResults: [{ id: "contact-1" }],
      verifyResult: { cpf_do_cliente: "52998224725", phone: "5511999999999", firstname: "JOÃO DA SILVA", numero_caso: "mock-case-123" },
      postVerifyResult: { cpf_do_cliente: "52998224725", phone: "5511999999999", firstname: "João da Silva", numero_caso: "mock-case-123", id: "contact-999" }
    })
    env.SINGLE_CASE_PLANS_ROOT = dir
    const result = await executeControlledFirstnameUpdate({ env, adapters })
    assert.strictEqual(result.HUBSPOT_WRITE_EXECUTED, true)
    assert.strictEqual(result.POST_UPDATE_VERIFICATION.contactIdMatch, false)
    assert.strictEqual(result.SAFE_FOR_CONTROLLED_WRITE_PREPARATION, false)
  } finally {
    cleanupPath(dir)
  }
})

// 12. CPF alterado depois do update
test("cpf-alterado-depois", async () => {
  const dir = createTempPlan()
  try {
    const { env, adapters } = mockAdapters({
      searchResults: [{ id: "contact-1" }],
      verifyResult: { cpf_do_cliente: "52998224725", phone: "5511999999999", firstname: "JOÃO DA SILVA", numero_caso: "mock-case-123" },
      postVerifyResult: { cpf_do_cliente: "00000000000", phone: "5511999999999", firstname: "João da Silva", numero_caso: "mock-case-123" }
    })
    env.SINGLE_CASE_PLANS_ROOT = dir
    const result = await executeControlledFirstnameUpdate({ env, adapters })
    assert.strictEqual(result.HUBSPOT_WRITE_EXECUTED, true)
    assert.strictEqual(result.POST_UPDATE_VERIFICATION.cpfUnchanged, false)
    assert.strictEqual(result.SAFE_FOR_CONTROLLED_WRITE_PREPARATION, false)
  } finally {
    cleanupPath(dir)
  }
})

// 13. Telefone alterado depois do update
test("telefone-alterado-depois", async () => {
  const dir = createTempPlan()
  try {
    const { env, adapters } = mockAdapters({
      searchResults: [{ id: "contact-1" }],
      verifyResult: { cpf_do_cliente: "52998224725", phone: "5511999999999", firstname: "JOÃO DA SILVA", numero_caso: "mock-case-123" },
      postVerifyResult: { cpf_do_cliente: "52998224725", phone: "5511988888888", firstname: "João da Silva", numero_caso: "mock-case-123" }
    })
    env.SINGLE_CASE_PLANS_ROOT = dir
    const result = await executeControlledFirstnameUpdate({ env, adapters })
    assert.strictEqual(result.HUBSPOT_WRITE_EXECUTED, true)
    assert.strictEqual(result.POST_UPDATE_VERIFICATION.phoneUnchanged, false)
    assert.strictEqual(result.SAFE_FOR_CONTROLLED_WRITE_PREPARATION, false)
  } finally {
    cleanupPath(dir)
  }
})

// 14. caseImportId alterado depois do update
test("caseImportId-alterado-depois", async () => {
  const dir = createTempPlan()
  try {
    const { env, adapters } = mockAdapters({
      searchResults: [{ id: "contact-1" }],
      verifyResult: { cpf_do_cliente: "52998224725", phone: "5511999999999", firstname: "JOÃO DA SILVA", numero_caso: "mock-case-123" },
      postVerifyResult: { cpf_do_cliente: "52998224725", phone: "5511999999999", firstname: "João da Silva", numero_caso: "OTHER-CASE" }
    })
    env.SINGLE_CASE_PLANS_ROOT = dir
    const result = await executeControlledFirstnameUpdate({ env, adapters })
    assert.strictEqual(result.HUBSPOT_WRITE_EXECUTED, true)
    assert.strictEqual(result.POST_UPDATE_VERIFICATION.caseImportIdUnchanged, false)
    assert.strictEqual(result.SAFE_FOR_CONTROLLED_WRITE_PREPARATION, false)
  } finally {
    cleanupPath(dir)
  }
})

// 15. Nome incorreto depois do update
test("nome-incorreto-depois", async () => {
  const dir = createTempPlan()
  try {
    const { env, adapters } = mockAdapters({
      searchResults: [{ id: "contact-1" }],
      verifyResult: { cpf_do_cliente: "52998224725", phone: "5511999999999", firstname: "JOÃO DA SILVA", numero_caso: "mock-case-123" },
      postVerifyResult: { cpf_do_cliente: "52998224725", phone: "5511999999999", firstname: "JOÃO DA SILVA", numero_caso: "mock-case-123" }
    })
    env.SINGLE_CASE_PLANS_ROOT = dir
    const result = await executeControlledFirstnameUpdate({ env, adapters })
    assert.strictEqual(result.HUBSPOT_WRITE_EXECUTED, true)
    assert.strictEqual(result.POST_UPDATE_VERIFICATION.presentationMatch, false)
    assert.strictEqual(result.POST_UPDATE_VERIFICATION.semanticMatch, true)
    assert.strictEqual(result.SAFE_FOR_CONTROLLED_WRITE_PREPARATION, false)
  } finally {
    cleanupPath(dir)
  }
})

// 16. Falha na leitura posterior
test("falha-leitura-posterior", async () => {
  const dir = createTempPlan()
  try {
    const { env, adapters, updateCount } = mockAdapters({
      searchResults: [{ id: "contact-1" }],
      verifyResult: { cpf_do_cliente: "52998224725", phone: "5511999999999", firstname: "JOÃO DA SILVA", numero_caso: "mock-case-123" },
      updateError: null,
      postVerifyError: new Error("HUBSPOT_HTTP_404")
    })
    env.SINGLE_CASE_PLANS_ROOT = dir
    const result = await executeControlledFirstnameUpdate({ env, adapters })
    assert.strictEqual(result.HUBSPOT_WRITE_EXECUTED, true)
    assert.strictEqual(result.UPDATE_CALLS, 1)
    assert.strictEqual(updateCount(), 1)
    assert.strictEqual(result.POST_UPDATE_READ_FAILED, true)
    assert.strictEqual(result.SAFE_FOR_CONTROLLED_WRITE_PREPARATION, false)
  } finally {
    cleanupPath(dir)
  }
})

// 17. CLI sem autorização explícita: zero busca e zero escrita
test("cli-sem-autorizacao", async () => {
  const dir = createTempPlan()
  try {
    const env = {
      SINGLE_CASE_P1_CASE_IMPORT_ID: "mock-case-123",
      SINGLE_CASE_PLANS_ROOT: dir,
      HUBSPOT_TOKEN: "mock-token"
    }
    const result = await executeControlledFirstnameUpdate({ env })
    assert.strictEqual(result.EXPLICIT_WRITE_AUTHORIZATION_MISSING, true)
    assert.strictEqual(result.CONTACT_SEARCH_EXECUTED, false)
    assert.strictEqual(result.HUBSPOT_WRITE_EXECUTED, false)
    assert.strictEqual(result.POSTGRES_WRITE_EXECUTED, false)
    assert.strictEqual(result.SAFE_FOR_CONTROLLED_WRITE_PREPARATION, false)
  } finally {
    cleanupPath(dir)
  }
})

// 18. Autorização incorreta: zero busca e zero escrita
test("autorizacao-incorreta", async () => {
  const dir = createTempPlan()
  try {
    const env = {
      SINGLE_CASE_P1_CASE_IMPORT_ID: "mock-case-123",
      SINGLE_CASE_PLANS_ROOT: dir,
      HUBSPOT_TOKEN: "mock-token",
      SINGLE_CASE_P1_ALLOW_FIRSTNAME_UPDATE: "WRONG"
    }
    const result = await executeControlledFirstnameUpdate({ env })
    assert.strictEqual(result.EXPLICIT_WRITE_AUTHORIZATION_MISSING, true)
    assert.strictEqual(result.CONTACT_SEARCH_EXECUTED, false)
    assert.strictEqual(result.HUBSPOT_WRITE_EXECUTED, false)
    assert.strictEqual(result.POSTGRES_WRITE_EXECUTED, false)
    assert.strictEqual(result.SAFE_FOR_CONTROLLED_WRITE_PREPARATION, false)
  } finally {
    cleanupPath(dir)
  }
})

// 19. Autorização exata com mock: fluxo permitido
test("autorizacao-exata-com-mock", async () => {
  const dir = createTempPlan()
  try {
    const { env, adapters, updateCount, verifyCalls } = mockAdapters({
      searchResults: [{ id: "contact-1" }],
      verifyResult: {
        cpf_do_cliente: "52998224725",
        phone: "5511999999999",
        firstname: "JOÃO DA SILVA",
        numero_caso: "mock-case-123"
      },
      postVerifyResult: {
        cpf_do_cliente: "52998224725",
        phone: "5511999999999",
        firstname: "João da Silva",
        numero_caso: "mock-case-123"
      }
    })
    env.SINGLE_CASE_PLANS_ROOT = dir
    env.SINGLE_CASE_P1_ALLOW_FIRSTNAME_UPDATE = "CONFIRM_EXACTLY_ONE_UPDATE"
    const result = await executeControlledFirstnameUpdate({ env, adapters })
    assert.strictEqual(result.HUBSPOT_WRITE_EXECUTED, true)
    assert.strictEqual(result.UPDATE_CALLS, 1)
    assert.strictEqual(updateCount(), 1)
    assert.strictEqual(verifyCalls(), 2)
    assert.strictEqual(result.POST_UPDATE_VERIFICATION.presentationMatch, true)
    assert.strictEqual(result.SAFE_FOR_CONTROLLED_WRITE_PREPARATION, true)
  } finally {
    cleanupPath(dir)
  }
})