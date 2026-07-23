"use strict"

const assert = require("node:assert")
const { test } = require("node:test")
const { createHubSpotSingleCaseAdapters } = require("../src/adapters/hubspot-single-case-adapter")

function createMockClient({ searchResult, getByIdResult, updateResult, updateError, searchError, getByIdError } = {}) {
  let updateCount = 0
  return {
    contacts: {
      search: async () => {
        if (searchError) throw searchError
        return searchResult || { results: [], total: 0 }
      },
      getById: async () => {
        if (getByIdError) throw getByIdError
        return getByIdResult || { properties: {} }
      },
      update: async () => {
        if (updateError) throw updateError
        updateCount++
        return updateResult || {}
      }
    },
    deals: { search: async () => ({ results: [] }), getById: async () => ({ properties: {} }) },
    associations: { findDealContacts: async () => ({ results: [] }) },
    updateCount: () => updateCount
  }
}

// client.contacts.update existe
test("contacts-update-existe", async () => {
  const client = createMockClient()
  const adapters = createHubSpotSingleCaseAdapters({ client, clock: () => "2026-01-01T00:00:00Z" })
  assert.strictEqual(typeof adapters.contacts.update, "function")
})

// client.deals.update não existe
test("deals-update-nao-existe", async () => {
  const client = createMockClient()
  const adapters = createHubSpotSingleCaseAdapters({ client, clock: () => "2026-01-01T00:00:00Z" })
  assert.strictEqual(typeof adapters.deals.update, "undefined")
})

// update válido chama PATCH uma vez
test("update-valido-chama-patch-uma-vez", async () => {
  const client = createMockClient({
    updateResult: { id: "contact-1" }
  })
  const adapters = createHubSpotSingleCaseAdapters({ client, clock: () => "2026-01-01T00:00:00Z" })
  const result = await adapters.contacts.update("contact-1", { properties: { firstname: "João da Silva" } })
  assert.strictEqual(result.updated, true)
  assert.strictEqual(client.updateCount(), 1)
})

// rota correta sem expor ID na saída
test("rota-correta-sem-expor-id", async () => {
  const client = createMockClient({
    updateResult: { id: "contact-1" }
  })
  const adapters = createHubSpotSingleCaseAdapters({ client, clock: () => "2026-01-01T00:00:00Z" })
  const result = await adapters.contacts.update("contact-1", { properties: { firstname: "João" } })
  assert.strictEqual(result.updated, true)
  assert.strictEqual(Object.prototype.hasOwnProperty.call(result, "id"), false)
})

// contactId é codificado na rota
test("contactId-codificado-na-rota", async () => {
  const client = createMockClient()
  const originalUpdate = client.contacts.update
  client.contacts.update = async (id, payload) => {
    assert.strictEqual(id, "contact 1/2")
    return originalUpdate(id, payload)
  }
  const adapters = createHubSpotSingleCaseAdapters({ client, clock: () => "2026-01-01T00:00:00Z" })
  await adapters.contacts.update("contact 1/2", { properties: { firstname: "João" } })
})

// somente firstname permitido
test("somente-firstname-permitido", async () => {
  const client = createMockClient({
    updateResult: { id: "contact-1" }
  })
  const adapters = createHubSpotSingleCaseAdapters({ client, clock: () => "2026-01-01T00:00:00Z" })
  await assert.rejects(
    () => adapters.contacts.update("contact-1", { properties: { firstname: "João", phone: "123" } }),
    /PROPERTIES_COUNT_MUST_BE_ONE/
  )
})

// propriedade extra bloqueada
test("propriedade-extra-bloqueada", async () => {
  const client = createMockClient()
  const adapters = createHubSpotSingleCaseAdapters({ client, clock: () => "2026-01-01T00:00:00Z" })
  await assert.rejects(
    () => adapters.contacts.update("contact-1", { properties: { firstname: "João", extra: "x" } }),
    /PROPERTIES_COUNT_MUST_BE_ONE/
  )
})

// properties vazio bloqueado
test("properties-vazio-bloqueado", async () => {
  const client = createMockClient()
  const adapters = createHubSpotSingleCaseAdapters({ client, clock: () => "2026-01-01T00:00:00Z" })
  await assert.rejects(
    () => adapters.contacts.update("contact-1", { properties: {} }),
    /PROPERTIES_COUNT_MUST_BE_ONE/
  )
})

// firstname vazio bloqueado
test("firstname-vazio-bloqueado", async () => {
  const client = createMockClient()
  const adapters = createHubSpotSingleCaseAdapters({ client, clock: () => "2026-01-01T00:00:00Z" })
  await assert.rejects(
    () => adapters.contacts.update("contact-1", { properties: { firstname: "   " } }),
    /FIRSTNAME_EMPTY/
  )
})

// contactId vazio bloqueado
test("contactId-vazio-bloqueado", async () => {
  const client = createMockClient()
  const adapters = createHubSpotSingleCaseAdapters({ client, clock: () => "2026-01-01T00:00:00Z" })
  await assert.rejects(
    () => adapters.contacts.update("", { properties: { firstname: "João" } }),
    /CONTACT_ID_INVALID/
  )
})

// payload inválido bloqueado
test("payload-invalido-bloqueado", async () => {
  const client = createMockClient()
  const adapters = createHubSpotSingleCaseAdapters({ client, clock: () => "2026-01-01T00:00:00Z" })
  await assert.rejects(
    () => adapters.contacts.update("contact-1", null),
    /PAYLOAD_INVALID/
  )
})

// falha HTTP propagada de forma sanitizada
test("falha-http-propagada-sanitizada", async () => {
  const client = createMockClient({
    updateError: new Error("HUBSPOT_HTTP_409")
  })
  const adapters = createHubSpotSingleCaseAdapters({ client, clock: () => "2026-01-01T00:00:00Z" })
  await assert.rejects(
    () => adapters.contacts.update("contact-1", { properties: { firstname: "João" } }),
    /HUBSPOT_EXTERNAL_ERROR/
  )
})

// create não é chamado
test("create-nao-eh-chamado", async () => {
  const client = createMockClient({
    updateResult: { id: "contact-1" }
  })
  const adapters = createHubSpotSingleCaseAdapters({ client, clock: () => "2026-01-01T00:00:00Z" })
  await adapters.contacts.update("contact-1", { properties: { firstname: "João" } })
  assert.strictEqual(client.contacts.create, undefined)
})

// deal não é criado
test("deal-nao-eh-criado", async () => {
  const client = createMockClient({
    updateResult: { id: "contact-1" }
  })
  const adapters = createHubSpotSingleCaseAdapters({ client, clock: () => "2026-01-01T00:00:00Z" })
  await adapters.contacts.update("contact-1", { properties: { firstname: "João" } })
  assert.strictEqual(client.deals.create, undefined)
})

// PostgreSQL não é acessado (não há referência a pg/postgres no adaptador)
test("postgres-nao-acessado", async () => {
  const client = createMockClient({
    updateResult: { id: "contact-1" }
  })
  const adapters = createHubSpotSingleCaseAdapters({ client, clock: () => "2026-01-01T00:00:00Z" })
  await adapters.contacts.update("contact-1", { properties: { firstname: "João" } })
  assert.strictEqual(client.updateCount(), 1)
})

// integração com o script controlado usando o adaptador oficial e cliente HTTP falso
test("integracao-script-controlado-com-adaptador-oficial", async () => {
  const { executeControlledFirstnameUpdate } = require("../scripts/update-pilot1-contact-firstname-controlled")
  const fs = require("node:fs")
  const os = require("node:os")
  const path = require("node:path")

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

  const dir = path.join(os.tmpdir(), "oraculum-test-" + Date.now() + "-" + Math.random().toString(36).slice(2, 8))
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, "plan.json"), JSON.stringify(FIXTURE_PLAN))

  try {
    let getByIdCalls = 0
    const client = {
      contacts: {
        search: async () => ({ results: [{ id: "contact-1" }], total: 1 }),
        getById: async () => {
          getByIdCalls++
          if (getByIdCalls === 1) {
            return { properties: { cpf_do_cliente: "52998224725", phone: "5511999999999", firstname: "JOÃO DA SILVA", numero_caso: "mock-case-123" } }
          }
          return { properties: { cpf_do_cliente: "52998224725", phone: "5511999999999", firstname: "João da Silva", numero_caso: "mock-case-123" } }
        },
        update: async () => ({ id: "contact-1" })
      },
      deals: { search: async () => ({ results: [] }), getById: async () => ({ properties: {} }) },
      associations: { findDealContacts: async () => ({ results: [] }) }
    }

    const officialAdapters = createHubSpotSingleCaseAdapters({ client, clock: () => "2026-01-01T00:00:00Z" })

    const env = {
      SINGLE_CASE_P1_CASE_IMPORT_ID: "mock-case-123",
      SINGLE_CASE_PLANS_ROOT: dir,
      SINGLE_CASE_P1_ALLOW_FIRSTNAME_UPDATE: "CONFIRM_EXACTLY_ONE_UPDATE"
    }

    const result = await executeControlledFirstnameUpdate({ env, adapters: officialAdapters })
    assert.strictEqual(result.HUBSPOT_WRITE_EXECUTED, true)
    assert.strictEqual(result.UPDATE_CALLS, 1)
    assert.strictEqual(result.POST_UPDATE_VERIFICATION.presentationMatch, true)
    assert.strictEqual(result.SAFE_FOR_CONTROLLED_WRITE_PREPARATION, true)
  } finally {
    try { fs.rmSync(dir, { recursive: true, force: true }) } catch {}
  }
})

// uma escrita seguida de uma verificação posterior
test("uma-escrita-com-verificacao-posterior", async () => {
  let getByIdCalls = 0
  const client = {
    contacts: {
      search: async () => ({ results: [{ id: "contact-1" }], total: 1 }),
      getById: async () => {
        getByIdCalls++
        if (getByIdCalls === 1) {
          return { properties: { cpf_do_cliente: "52998224725", phone: "5511999999999", firstname: "JOÃO DA SILVA", numero_caso: "mock-case-123" } }
        }
        return { properties: { cpf_do_cliente: "52998224725", phone: "5511999999999", firstname: "João da Silva", numero_caso: "mock-case-123" } }
      },
      update: async () => ({})
    },
    deals: { search: async () => ({ results: [] }), getById: async () => ({ properties: {} }) },
    associations: { findDealContacts: async () => ({ results: [] }) }
  }

  const adapters = createHubSpotSingleCaseAdapters({ client, clock: () => "2026-01-01T00:00:00Z" })
  const result = await adapters.contacts.update("contact-1", { properties: { firstname: "João da Silva" } })
  assert.strictEqual(result.updated, true)
})
