"use strict"

const assert = require("node:assert")
const path = require("node:path")
const fs = require("node:fs")
const os = require("node:os")
const { test } = require("node:test")
const { createPilot1HubSpotDealControlled, AUTHORIZATION_VALUE } = require("../scripts/create-pilot1-hubspot-deal-controlled")

function createMockAdapter(opts = {}) {
  const state = { dealCreated: false, associationCreated: false }
  const callDetails = []

  return {
    adapters: {
      contacts: {
        findContactsByCpf: async () => {
          callDetails.push({ method: "contacts.findContactsByCpf" })
          if (opts.throwContactSearch) throw opts.throwContactSearch
          if (opts.ambiguousContact) throw new Error("ADAPTER_AMBIGUOUS_RESULT")
          return opts.contactCandidates || []
        },
        findContactsByPhone: async () => {
          callDetails.push({ method: "contacts.findContactsByPhone" })
          if (opts.throwContactSearch) throw opts.throwContactSearch
          if (opts.ambiguousContact) throw new Error("ADAPTER_AMBIGUOUS_RESULT")
          return opts.contactCandidates || []
        },
        verify: async () => {
          callDetails.push({ method: "contacts.verify" })
          if (opts.throwContactVerify) throw opts.throwContactVerify
          return {
            verified: true,
            id: String(opts.contactId || "contact-1").trim(),
            cpf: String(opts.contactCpf || "52998224725").trim(),
            phone: String(opts.contactPhone || "5511999999999").trim(),
            firstname: String(opts.contactName || "JOÃO DA SILVA").trim(),
            fieldsHash: "mock-contact-hash",
            caseImportId: String(opts.contactCaseImportId || "mock-case-123").trim()
          }
        }
      },
      deals: {
        findByCaseNumber: async () => {
          callDetails.push({ method: "deals.findByCaseNumber" })
          if (opts.throwDealSearch) throw opts.throwDealSearch
          if (Array.isArray(opts.dealCandidates)) return opts.dealCandidates
          if (state.dealCreated) return [{ id: "deal-created" }]
          return []
        },
        create: async (payload) => {
          callDetails.push({ method: "deals.create", payload: payload?.properties || payload })
          if (opts.throwDealCreate) throw opts.throwDealCreate
          if (opts.dealCreateValidationError) throw opts.dealCreateValidationError
          if (opts.dealCreateEmptyId) {
            state.dealCreated = true
            return { id: "" }
          }
          if (opts.dealCreateNullResult) {
            state.dealCreated = true
            return null
          }
          state.dealCreated = true
          return { id: "deal-created" }
        },
        verify: async (dealId, props) => {
          callDetails.push({ method: "deals.verify", dealId, props })
          if (opts.throwDealVerify) throw opts.throwDealVerify
          const result = { ...(props || {}) }
          result.verified = true
          result.id = String(dealId).trim()
          result.caseNumber = String(opts.dealCaseNumber !== undefined ? opts.dealCaseNumber : (props?.numero_de_caso || "PROC.202400.001")).trim()
          result.pipeline = String(opts.dealPipeline !== undefined ? opts.dealPipeline : (props?.pipeline || "default")).trim()
          result.stage = String(opts.dealStage !== undefined ? opts.dealStage : (props?.dealstage || "appointmentscheduled")).trim()
          result.fieldsHash = "mock-deal-hash"
          if (opts.dealname !== undefined) result.dealname = String(opts.dealname).trim()
          return result
        }
      },
      associations: {
        find: async () => {
          callDetails.push({ method: "associations.find" })
          if (opts.throwAssocFind) throw opts.throwAssocFind
          if (Array.isArray(opts.associationCandidates) && opts.associationCandidates.length > 0) return opts.associationCandidates
          if (state.associationCreated) return [{ id: "assoc-created", toObjectId: String(opts.contactId || "contact-1").trim(), associationTypes: [{ category: "HUBSPOT_DEFINED", typeId: 3 }] }]
          return []
        },
        create: async () => {
          callDetails.push({ method: "associations.create" })
          if (opts.throwAssocCreate) throw opts.throwAssocCreate
          state.associationCreated = true
          return { id: "assoc-created" }
        },
        verify: async () => {
          callDetails.push({ method: "associations.verify" })
          if (opts.throwAssocVerify) throw opts.throwAssocVerify
          return { verified: true, id: "assoc-created", contactId: String(opts.contactId || "contact-1").trim(), dealId: "deal-created", relation: "deal_to_contact" }
        }
      }
    },
    callDetails,
    reset: () => {
      callDetails.length = 0
      state.dealCreated = false
      state.associationCreated = false
    }
  }
}

function createEnv(root) {
  return {
    SINGLE_CASE_P1_CASE_IMPORT_ID: "mock-case-123",
    SINGLE_CASE_PLANS_ROOT: root,
    SINGLE_CASE_P1_ALLOW_DEAL_CREATION: AUTHORIZATION_VALUE
  }
}

const FIXTURE_PLAN = {
  caseImportId: "mock-case-123",
  safeToApply: false,
  dealPlan: {
    caseNumber: "PROC.202400.001",
    properties: {
      dealname: "Caso PROC.202400.001",
      pipeline: "default",
      dealstage: "appointmentscheduled",
      numero_de_caso: "PROC.202400.001",
      area_juridica: "Previdenciário (INSS)",
      temperatura_lead: "Quente",
      hs_priority: "high"
    }
  },
  contactPlan: {
    properties: {
      firstname: "JOÃO DA SILVA",
      cpf_do_cliente: "52998224725",
      phone: "5511999999999"
    }
  },
  associationPlan: {
    type: "deal_to_contact",
    primaryOnly: true
  }
}

function createTempPlan(overrides = {}) {
  const dir = path.join(os.tmpdir(), "oraculum-test-" + Date.now() + "-" + Math.random().toString(36).slice(2, 8))
  fs.mkdirSync(dir, { recursive: true })
  const plan = Object.assign({}, FIXTURE_PLAN, overrides)
  fs.writeFileSync(path.join(dir, "plan.json"), JSON.stringify(plan))
  return dir
}

function cleanupPath(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true }) } catch {}
}

// 1. sem autorização
test("sem-autorizacao", async () => {
  const dir = createTempPlan()
  try {
    const mock = createMockAdapter({ contactCandidates: [{ id: "contact-1" }] })
    const env = { SINGLE_CASE_P1_CASE_IMPORT_ID: "mock-case-123", SINGLE_CASE_PLANS_ROOT: dir }
    const result = await createPilot1HubSpotDealControlled({ env, adapters: mock.adapters })
    assert.strictEqual(result.AUTHORIZED, false)
    assert.strictEqual(result.CONTACT_SEARCHES, 0)
    assert.strictEqual(result.DEAL_SEARCHES, 0)
    assert.strictEqual(result.DEAL_CREATES, 0)
    assert.strictEqual(result.ASSOCIATION_CREATES, 0)
  } finally { cleanupPath(dir) }
})

// 2. autorização incorreta
test("autorizacao-incorreta", async () => {
  const dir = createTempPlan()
  try {
    const mock = createMockAdapter({ contactCandidates: [{ id: "contact-1" }] })
    const env = { SINGLE_CASE_P1_ALLOW_DEAL_CREATION: "WRONG_VALUE", SINGLE_CASE_P1_CASE_IMPORT_ID: "mock-case-123", SINGLE_CASE_PLANS_ROOT: dir }
    const result = await createPilot1HubSpotDealControlled({ env, adapters: mock.adapters })
    assert.strictEqual(result.AUTHORIZED, false)
    assert.strictEqual(result.DEAL_CREATES, 0)
  } finally { cleanupPath(dir) }
})

// 3. contato não encontrado
test("contato-nao-encontrado", async () => {
  const dir = createTempPlan()
  try {
    const mock = createMockAdapter({ contactCandidates: [] })
    const env = createEnv(dir)
    const result = await createPilot1HubSpotDealControlled({ env, adapters: mock.adapters })
    assert.strictEqual(result.CONTACT_CANDIDATES_COUNT, 0)
    assert.strictEqual(result.UNAMBIGUOUS_CONTACT_FOUND, false)
    assert.strictEqual(result.DEAL_SEARCHES, 0)
    assert.strictEqual(result.DEAL_CREATES, 0)
  } finally { cleanupPath(dir) }
})

// 4. múltiplos contatos
test("multiplos-contatos", async () => {
  const dir = createTempPlan()
  try {
    const mock = createMockAdapter({ contactCandidates: [{ id: "c1" }, { id: "c2" }] })
    const env = createEnv(dir)
    const result = await createPilot1HubSpotDealControlled({ env, adapters: mock.adapters })
    assert.strictEqual(result.CONTACT_CANDIDATES_COUNT, 2)
    assert.strictEqual(result.UNAMBIGUOUS_CONTACT_FOUND, false)
    assert.strictEqual(result.DEAL_SEARCHES, 0)
    assert.strictEqual(result.DEAL_CREATES, 0)
  } finally { cleanupPath(dir) }
})

// 5. bindings divergentes
test("bindings-divergentes", async () => {
  const dir = createTempPlan()
  try {
    const mock = createMockAdapter({
      contactCandidates: [{ id: "contact-1" }],
      contactCpf: "12345678900",
      contactPhone: "5511999999999",
      contactName: "JOÃO DA SILVA",
      contactCaseImportId: "mock-case-123"
    })
    const env = createEnv(dir)
    const result = await createPilot1HubSpotDealControlled({ env, adapters: mock.adapters })
    assert.strictEqual(result.CPF_BINDING_MATCH, false)
    assert.strictEqual(result.DEAL_SEARCHES, 0)
    assert.strictEqual(result.DEAL_CREATES, 0)
  } finally { cleanupPath(dir) }
})

// 6. negócio já existente
test("negocio-ja-existente", async () => {
  const dir = createTempPlan()
  try {
    const mock = createMockAdapter({
      contactCandidates: [{ id: "contact-1" }],
      dealCandidates: [{ id: "deal-existing" }],
      dealCaseNumber: "PROC.202400.001",
      dealPipeline: "default",
      dealStage: "appointmentscheduled"
    })
    const env = createEnv(dir)
    const result = await createPilot1HubSpotDealControlled({ env, adapters: mock.adapters })
    assert.strictEqual(result.DEAL_CREATES, 0)
    assert.strictEqual(result.DEAL_CANDIDATES_COUNT, 1)
    assert.strictEqual(result.DEAL_CASE_NUMBER_MATCH, true)
    assert.strictEqual(result.PIPELINE_MATCH, true)
    assert.strictEqual(result.STAGE_MATCH, true)
    assert.strictEqual(result.SAFE_FOR_REAL_EXECUTION, true)
  } finally { cleanupPath(dir) }
})

// 7. múltiplos negócios
test("multiplos-negocios", async () => {
  const dir = createTempPlan()
  try {
    const mock = createMockAdapter({
      contactCandidates: [{ id: "contact-1" }],
      dealCandidates: [{ id: "deal-1" }, { id: "deal-2" }]
    })
    const env = createEnv(dir)
    const result = await createPilot1HubSpotDealControlled({ env, adapters: mock.adapters })
    assert.strictEqual(result.DEAL_CANDIDATES_COUNT, 2)
    assert.strictEqual(result.UNAMBIGUOUS_DEAL_FOUND, false)
    assert.strictEqual(result.DEAL_CREATES, 0)
    assert.strictEqual(result.ASSOCIATION_CREATES, 0)
  } finally { cleanupPath(dir) }
})

// 8. sucesso com uma criação e uma associação
test("sucesso-criacao-e-associacao", async () => {
  const dir = createTempPlan()
  try {
    const mock = createMockAdapter({
      contactCandidates: [{ id: "contact-1" }],
      associationCandidates: []
    })
    const env = createEnv(dir)
    const result = await createPilot1HubSpotDealControlled({ env, adapters: mock.adapters })
    assert.strictEqual(result.AUTHORIZED, true)
    assert.strictEqual(result.CONTACT_SEARCHES, 1)
    assert.strictEqual(result.DEAL_SEARCHES, 1)
    assert.strictEqual(result.DEAL_CREATES, 1)
    assert.strictEqual(result.ASSOCIATION_CREATES, 1)
    assert.strictEqual(result.POST_CREATE_DEAL_READS, 1)
    assert.strictEqual(result.POST_CREATE_ASSOCIATION_READS, 1)
    assert.strictEqual(result.DEAL_CASE_NUMBER_MATCH, true)
    assert.strictEqual(result.PIPELINE_MATCH, true)
    assert.strictEqual(result.STAGE_MATCH, true)
    assert.strictEqual(result.CONTACT_ASSOCIATION_MATCH, true)
    assert.strictEqual(result.SAFE_FOR_REAL_EXECUTION, true)
  } finally { cleanupPath(dir) }
})

// 9. payload completo conforme o dealPlan
test("payload-completo-conforme-dealplan", async () => {
  const dir = createTempPlan()
  try {
    const mock = createMockAdapter({
      contactCandidates: [{ id: "contact-1" }],
      associationCandidates: []
    })
    const env = createEnv(dir)
    const result = await createPilot1HubSpotDealControlled({ env, adapters: mock.adapters })
    assert.strictEqual(result.DEAL_CREATES, 1)
    const createCall = mock.callDetails.find(c => c.method === "deals.create")
    assert.ok(createCall, "deals.create must be called")
    assert.deepStrictEqual(createCall.payload, FIXTURE_PLAN.dealPlan.properties)
  } finally { cleanupPath(dir) }
})

// 10. campo extra bloqueado
test("campo-extra-bloqueado", async () => {
  const dir = createTempPlan({
    dealPlan: {
      caseNumber: "PROC.202400.001",
      properties: Object.assign({}, FIXTURE_PLAN.dealPlan.properties, { campo_extra: "valor_proibido" })
    }
  })
  try {
    const mock = createMockAdapter({ contactCandidates: [{ id: "contact-1" }] })
    const env = createEnv(dir)
    const result = await createPilot1HubSpotDealControlled({ env, adapters: mock.adapters })
    assert.strictEqual(result.BLOCK_REASON, "UNKNOWN_DEAL_PROPERTIES")
    assert.ok(result.UNKNOWN_DEAL_PROPERTIES.includes("campo_extra"))
    assert.strictEqual(result.DEAL_SEARCHES, 0)
    assert.strictEqual(result.DEAL_CREATES, 0)
  } finally { cleanupPath(dir) }
})

// 11. campo obrigatório ausente bloqueado
test("campo-obrigatorio-ausente-bloqueado", async () => {
  const dir = createTempPlan({
    dealPlan: {
      caseNumber: "PROC.202400.001",
      properties: Object.assign({}, FIXTURE_PLAN.dealPlan.properties, { dealname: "" })
    }
  })
  try {
    const mock = createMockAdapter({ contactCandidates: [{ id: "contact-1" }] })
    const env = createEnv(dir)
    const result = await createPilot1HubSpotDealControlled({ env, adapters: mock.adapters })
    assert.strictEqual(result.BLOCK_REASON, "REQUIRED_DEAL_PROPERTIES_MISSING")
    assert.ok(result.MISSING_REQUIRED_DEAL_PROPERTIES.includes("dealname"))
    assert.strictEqual(result.DEAL_SEARCHES, 0)
    assert.strictEqual(result.DEAL_CREATES, 0)
  } finally { cleanupPath(dir) }
})

// 12. falha na criação do negócio
test("falha-criacao-negocio", async () => {
  const dir = createTempPlan()
  try {
    const mock = createMockAdapter({
      contactCandidates: [{ id: "contact-1" }],
      throwDealCreate: new Error("HUBSPOT_HTTP_500")
    })
    const env = createEnv(dir)
    const result = await createPilot1HubSpotDealControlled({ env, adapters: mock.adapters })
    assert.strictEqual(result.DEAL_CREATE_EXTERNAL_EFFECT_UNKNOWN, true)
    assert.strictEqual(result.DEAL_CREATE_CLASSIFICATION, "DEAL_CREATE_EXTERNAL_EFFECT_UNKNOWN")
    assert.strictEqual(result.RETRY_ALLOWED, false)
    assert.strictEqual(result.READONLY_RECONCILIATION_REQUIRED, true)
    assert.strictEqual(result.DEAL_CREATES, 1)
    assert.strictEqual(result.ASSOCIATION_CREATES, 0)
    const assocCreateCalls = mock.callDetails.filter(c => c.method === "associations.create")
    assert.strictEqual(assocCreateCalls.length, 0)
  } finally { cleanupPath(dir) }
})

// 13. segunda criação bloqueada
test("segunda-criacao-bloqueada", async () => {
  const dir = createTempPlan()
  try {
    const mock = createMockAdapter({
      contactCandidates: [{ id: "contact-1" }],
      associationCandidates: []
    })
    const env = createEnv(dir)
    const result1 = await createPilot1HubSpotDealControlled({ env, adapters: mock.adapters })
    assert.strictEqual(result1.DEAL_CREATES, 1)
    assert.strictEqual(result1.SAFE_FOR_REAL_EXECUTION, true)

    const result2 = await createPilot1HubSpotDealControlled({ env, adapters: mock.adapters })
    assert.strictEqual(result2.DEAL_CREATES, 0)
    assert.strictEqual(result2.DEAL_SEARCHES, 1)

    const createCalls = mock.callDetails.filter(c => c.method === "deals.create")
    assert.strictEqual(createCalls.length, 1)
  } finally { cleanupPath(dir) }
})

// 14. falha na associação
test("falha-associacao", async () => {
  const dir = createTempPlan()
  try {
    const mock = createMockAdapter({
      contactCandidates: [{ id: "contact-1" }],
      associationCandidates: [],
      throwAssocCreate: new Error("HUBSPOT_HTTP_500")
    })
    const env = createEnv(dir)
    const result = await createPilot1HubSpotDealControlled({ env, adapters: mock.adapters })
    assert.strictEqual(result.DEAL_CREATES, 1)
    assert.strictEqual(result.ASSOCIATION_CREATE_FAILED, true)
    assert.strictEqual(result.ASSOCIATION_CREATES, 1)
  } finally { cleanupPath(dir) }
})

// 15. segunda associação bloqueada
test("segunda-associacao-bloqueada", async () => {
  const dir = createTempPlan()
  try {
    // First call creates deal and association
    const mock = createMockAdapter({
      contactCandidates: [{ id: "contact-1" }],
      associationCandidates: []
    })
    const env = createEnv(dir)
    const result1 = await createPilot1HubSpotDealControlled({ env, adapters: mock.adapters })
    assert.strictEqual(result1.ASSOCIATION_CREATES, 1)
    assert.strictEqual(result1.CONTACT_ASSOCIATION_MATCH, true)

    // Second call: deal exists, association exists, no new creation
    const result2 = await createPilot1HubSpotDealControlled({ env, adapters: mock.adapters })
    assert.strictEqual(result2.DEAL_CREATES, 0)
    assert.strictEqual(result2.ASSOCIATION_CREATES, 0)
    assert.strictEqual(result2.DEAL_CANDIDATES_COUNT, 1)

    const assocCreateCalls = mock.callDetails.filter(c => c.method === "associations.create")
    assert.strictEqual(assocCreateCalls.length, 1)
  } finally { cleanupPath(dir) }
})

// 16. negócio pós-criação divergente
test("negocio-pos-criacao-divergente", async () => {
  const dir = createTempPlan()
  try {
    const mock = createMockAdapter({
      contactCandidates: [{ id: "contact-1" }],
      associationCandidates: [],
      dealCaseNumber: "PROC.202400.002"
    })
    const env = createEnv(dir)
    const result = await createPilot1HubSpotDealControlled({ env, adapters: mock.adapters })
    assert.strictEqual(result.DEAL_CREATES, 1)
    assert.strictEqual(result.DEAL_CASE_NUMBER_MATCH, false)
    assert.strictEqual(result.SAFE_FOR_REAL_EXECUTION, false)
  } finally { cleanupPath(dir) }
})

// 17. pipeline divergente
test("pipeline-divergente", async () => {
  const dir = createTempPlan()
  try {
    const mock = createMockAdapter({
      contactCandidates: [{ id: "contact-1" }],
      associationCandidates: [],
      dealPipeline: "wrong-pipeline"
    })
    const env = createEnv(dir)
    const result = await createPilot1HubSpotDealControlled({ env, adapters: mock.adapters })
    assert.strictEqual(result.DEAL_CREATES, 1)
    assert.strictEqual(result.PIPELINE_MATCH, false)
    assert.strictEqual(result.SAFE_FOR_REAL_EXECUTION, false)
  } finally { cleanupPath(dir) }
})

// 18. estágio divergente
test("estagio-divergente", async () => {
  const dir = createTempPlan()
  try {
    const mock = createMockAdapter({
      contactCandidates: [{ id: "contact-1" }],
      associationCandidates: [],
      dealStage: "wrong-stage"
    })
    const env = createEnv(dir)
    const result = await createPilot1HubSpotDealControlled({ env, adapters: mock.adapters })
    assert.strictEqual(result.DEAL_CREATES, 1)
    assert.strictEqual(result.STAGE_MATCH, false)
    assert.strictEqual(result.SAFE_FOR_REAL_EXECUTION, false)
  } finally { cleanupPath(dir) }
})

// 19. campo planejado divergente
test("campo-planejado-divergente", async () => {
  const dir = createTempPlan()
  try {
    const mock = createMockAdapter({
      contactCandidates: [{ id: "contact-1" }],
      associationCandidates: [],
      dealname: "Nome divergente",
      dealStage: "appointmentscheduled",
      dealPipeline: "default"
    })
    const env = createEnv(dir)
    const result = await createPilot1HubSpotDealControlled({ env, adapters: mock.adapters })
    assert.strictEqual(result.DEAL_CREATES, 1)
    assert.strictEqual(result.PLANNED_DEAL_FIELDS_MATCH, false)
    assert.strictEqual(result.PLANNED_DEAL_FIELDS.dealname, false)
    assert.strictEqual(result.SAFE_FOR_REAL_EXECUTION, false)
  } finally { cleanupPath(dir) }
})

// 20. associação pós-criação ausente
test("associacao-pos-criacao-ausente", async () => {
  const dir = createTempPlan()
  try {
    let findCallCount = 0
    const mock = createMockAdapter({
      contactCandidates: [{ id: "contact-1" }],
      associationCandidates: []
    })
    // Override find to return empty on post-create read
    const originalFind = mock.adapters.associations.find.bind(mock.adapters.associations)
    mock.adapters.associations.find = async () => {
      findCallCount++
      if (findCallCount === 1) return [] // first find after create returns empty
      return []
    }
    const env = createEnv(dir)
    const result = await createPilot1HubSpotDealControlled({ env, adapters: mock.adapters })
    assert.strictEqual(result.DEAL_CREATES, 1)
    assert.strictEqual(result.ASSOCIATION_CREATES, 1)
    assert.strictEqual(result.CONTACT_ASSOCIATION_MATCH, false)
    assert.strictEqual(result.SAFE_FOR_REAL_EXECUTION, false)
  } finally { cleanupPath(dir) }
})

// 21. falha na leitura posterior
test("falha-leitura-posterior", async () => {
  const dir = createTempPlan()
  try {
    const mock = createMockAdapter({
      contactCandidates: [{ id: "contact-1" }],
      associationCandidates: [],
      throwDealVerify: new Error("HUBSPOT_HTTP_500")
    })
    const env = createEnv(dir)
    const result = await createPilot1HubSpotDealControlled({ env, adapters: mock.adapters })
    assert.strictEqual(result.DEAL_CREATES, 1)
    assert.strictEqual(result.DEAL_READ_FAILED, true)
    assert.strictEqual(result.SAFE_FOR_REAL_EXECUTION, false)
  } finally { cleanupPath(dir) }
})

// 22. timeout durante deals.create
test("timeout-deal-create", async () => {
  const dir = createTempPlan()
  try {
    const mock = createMockAdapter({
      contactCandidates: [{ id: "contact-1" }],
      associationCandidates: [],
      throwDealCreate: new Error("Request timeout after 30000ms")
    })
    const env = createEnv(dir)
    const result = await createPilot1HubSpotDealControlled({ env, adapters: mock.adapters })
    assert.strictEqual(result.DEAL_CREATE_EXTERNAL_EFFECT_UNKNOWN, true)
    assert.strictEqual(result.DEAL_CREATE_CLASSIFICATION, "DEAL_CREATE_EXTERNAL_EFFECT_UNKNOWN")
    assert.strictEqual(result.RETRY_ALLOWED, false)
    assert.strictEqual(result.READONLY_RECONCILIATION_REQUIRED, true)
    assert.strictEqual(result.DEAL_CREATES, 1)
    assert.strictEqual(result.ASSOCIATION_CREATES, 0)
    const assocCreateCalls = mock.callDetails.filter(c => c.method === "associations.create")
    assert.strictEqual(assocCreateCalls.length, 0)
  } finally { cleanupPath(dir) }
})

// 23. AbortError durante deals.create
test("abort-error-deal-create", async () => {
  const dir = createTempPlan()
  try {
    const abortError = Object.assign(new Error("aborted"), { name: "AbortError" })
    const mock = createMockAdapter({
      contactCandidates: [{ id: "contact-1" }],
      associationCandidates: [],
      throwDealCreate: abortError
    })
    const env = createEnv(dir)
    const result = await createPilot1HubSpotDealControlled({ env, adapters: mock.adapters })
    assert.strictEqual(result.DEAL_CREATE_EXTERNAL_EFFECT_UNKNOWN, true)
    assert.strictEqual(result.DEAL_CREATE_CLASSIFICATION, "DEAL_CREATE_EXTERNAL_EFFECT_UNKNOWN")
    assert.strictEqual(result.RETRY_ALLOWED, false)
    assert.strictEqual(result.READONLY_RECONCILIATION_REQUIRED, true)
    assert.strictEqual(result.DEAL_CREATES, 1)
    assert.strictEqual(result.ASSOCIATION_CREATES, 0)
  } finally { cleanupPath(dir) }
})

// 24. ECONNRESET durante deals.create
test("econnreset-deal-create", async () => {
  const dir = createTempPlan()
  try {
    const mock = createMockAdapter({
      contactCandidates: [{ id: "contact-1" }],
      associationCandidates: [],
      throwDealCreate: new Error("ECONNRESET")
    })
    const env = createEnv(dir)
    const result = await createPilot1HubSpotDealControlled({ env, adapters: mock.adapters })
    assert.strictEqual(result.DEAL_CREATE_EXTERNAL_EFFECT_UNKNOWN, true)
    assert.strictEqual(result.DEAL_CREATE_CLASSIFICATION, "DEAL_CREATE_EXTERNAL_EFFECT_UNKNOWN")
    assert.strictEqual(result.RETRY_ALLOWED, false)
    assert.strictEqual(result.READONLY_RECONCILIATION_REQUIRED, true)
    assert.strictEqual(result.DEAL_CREATES, 1)
    assert.strictEqual(result.ASSOCIATION_CREATES, 0)
  } finally { cleanupPath(dir) }
})

// 25. resposta vazia ou inválida
test("resposta-vazia-deal-create", async () => {
  const dir = createTempPlan()
  try {
    const mock = createMockAdapter({
      contactCandidates: [{ id: "contact-1" }],
      associationCandidates: [],
      dealCreateEmptyId: true
    })
    const env = createEnv(dir)
    const result = await createPilot1HubSpotDealControlled({ env, adapters: mock.adapters })
    assert.strictEqual(result.DEAL_CREATE_EXTERNAL_EFFECT_UNKNOWN, true)
    assert.strictEqual(result.DEAL_CREATE_CLASSIFICATION, "DEAL_CREATE_EXTERNAL_EFFECT_UNKNOWN")
    assert.strictEqual(result.RETRY_ALLOWED, false)
    assert.strictEqual(result.READONLY_RECONCILIATION_REQUIRED, true)
    assert.strictEqual(result.DEAL_CREATES, 1)
    assert.strictEqual(result.ASSOCIATION_CREATES, 0)
  } finally { cleanupPath(dir) }
})

// 26. erro genérico de transporte
test("erro-transporte-deal-create", async () => {
  const dir = createTempPlan()
  try {
    const mock = createMockAdapter({
      contactCandidates: [{ id: "contact-1" }],
      associationCandidates: [],
      throwDealCreate: new Error("Network transport failure")
    })
    const env = createEnv(dir)
    const result = await createPilot1HubSpotDealControlled({ env, adapters: mock.adapters })
    assert.strictEqual(result.DEAL_CREATE_EXTERNAL_EFFECT_UNKNOWN, true)
    assert.strictEqual(result.DEAL_CREATE_CLASSIFICATION, "DEAL_CREATE_EXTERNAL_EFFECT_UNKNOWN")
    assert.strictEqual(result.RETRY_ALLOWED, false)
    assert.strictEqual(result.READONLY_RECONCILIATION_REQUIRED, true)
    assert.strictEqual(result.DEAL_CREATES, 1)
    assert.strictEqual(result.ASSOCIATION_CREATES, 0)
  } finally { cleanupPath(dir) }
})

// 27. erro de validação comprovadamente anterior ao envio
test("validacao-anterior-ao-envio", async () => {
  const dir = createTempPlan()
  try {
    const mock = createMockAdapter({
      contactCandidates: [{ id: "contact-1" }],
      associationCandidates: [],
      dealCreateValidationError: new Error("Validation failed before send: invalid payload")
    })
    const env = createEnv(dir)
    const result = await createPilot1HubSpotDealControlled({ env, adapters: mock.adapters })
    assert.strictEqual(result.DEAL_CREATE_CONFIRMED_NOT_EXECUTED, true)
    assert.strictEqual(result.DEAL_CREATE_CLASSIFICATION, "DEAL_CREATE_CONFIRMED_NOT_EXECUTED")
    assert.strictEqual(result.RETRY_ALLOWED, true)
    assert.strictEqual(result.READONLY_RECONCILIATION_REQUIRED, false)
    assert.strictEqual(result.DEAL_CREATES, 1)
    assert.strictEqual(result.ASSOCIATION_CREATES, 0)
    const assocCreateCalls = mock.callDetails.filter(c => c.method === "associations.create")
    assert.strictEqual(assocCreateCalls.length, 0)
  } finally { cleanupPath(dir) }
})

// 28. ausência de tentativa de associação após efeito desconhecido
test("sem-associacao-apos-efeito-desconhecido", async () => {
  const dir = createTempPlan()
  try {
    const mock = createMockAdapter({
      contactCandidates: [{ id: "contact-1" }],
      associationCandidates: [],
      throwDealCreate: new Error("HUBSPOT_HTTP_500")
    })
    const env = createEnv(dir)
    const result = await createPilot1HubSpotDealControlled({ env, adapters: mock.adapters })
    assert.strictEqual(result.DEAL_CREATES, 1)
    assert.strictEqual(result.ASSOCIATION_CREATES, 0)
    const assocCreateCalls = mock.callDetails.filter(c => c.method === "associations.create")
    assert.strictEqual(assocCreateCalls.length, 0)
    assert.strictEqual(result.DEAL_CREATE_EXTERNAL_EFFECT_UNKNOWN, true)
  } finally { cleanupPath(dir) }
})

// 29. bloqueio explícito de repetição
test("bloqueio-repeticao-apos-efeito-desconhecido", async () => {
  const dir = createTempPlan()
  try {
    const mock = createMockAdapter({
      contactCandidates: [{ id: "contact-1" }],
      associationCandidates: [],
      throwDealCreate: new Error("timeout")
    })
    const env = createEnv(dir)
    const result = await createPilot1HubSpotDealControlled({ env, adapters: mock.adapters })
    assert.strictEqual(result.RETRY_ALLOWED, false)
    assert.strictEqual(result.DEAL_CREATE_EXTERNAL_EFFECT_UNKNOWN, true)
    assert.strictEqual(result.SAFE_FOR_REAL_EXECUTION, false)
  } finally { cleanupPath(dir) }
})

// 30. exigência de reconciliação somente leitura
test("reconciliacao-readonly-requerida", async () => {
  const dir = createTempPlan()
  try {
    const mock = createMockAdapter({
      contactCandidates: [{ id: "contact-1" }],
      associationCandidates: [],
      throwDealCreate: new Error("connection reset")
    })
    const env = createEnv(dir)
    const result = await createPilot1HubSpotDealControlled({ env, adapters: mock.adapters })
    assert.strictEqual(result.READONLY_RECONCILIATION_REQUIRED, true)
    assert.strictEqual(result.DEAL_CREATE_EXTERNAL_EFFECT_UNKNOWN, true)
    assert.strictEqual(result.SAFE_FOR_REAL_EXECUTION, false)
  } finally { cleanupPath(dir) }
})
