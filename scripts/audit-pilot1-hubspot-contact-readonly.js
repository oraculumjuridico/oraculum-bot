#!/usr/bin/env node
"use strict"

// Read-only HubSpot contact audit for Piloto 1 (commit 6894046 modules only)
// - Loads the plan by SINGLE_CASE_P1_CASE_IMPORT_ID from SINGLE_CASE_PLANS_ROOT
// - Searches HubSpot by cpf then phone using hubspot-single-case-adapter
// - Requires exactly one contact candidate; otherwise blocks
// - Verifies contact via adapter.verify and computes normalization booleans
// - Prints a sanitized JSON object (no PII)

const path = require("node:path")

async function audit({ env = process.env, adapters = null } = {}) {
  // Validate env
  const caseImportId = String(env.SINGLE_CASE_P1_CASE_IMPORT_ID || "").trim()
  if (!caseImportId) throw new Error("CASE_IMPORT_ID_MISSING")
  const plansRoot = String(env.SINGLE_CASE_PLANS_ROOT || path.join(process.cwd(), "data", "case-import", "plans"))

  // Use static requires (no dynamic require) to comply with consultation architecture
  const { createSingleCasePlanLoader } = require("../src/adapters/single-case-plan-loader")
  const { createHubSpotHttpClient } = require("../src/adapters/hubspot-http-client")
  const { createHubSpotSingleCaseAdapters } = require("../src/adapters/hubspot-single-case-adapter")
  const { normalizarNomeComparacao } = require("../src/domain/phone-name")
  const { formatarNome } = require("../src/utils/text")

  // Load plan (allow injectedPlan for tests)
  let plan = null
  if (typeof arguments[0] === 'object' && arguments[0] !== null && Object.prototype.hasOwnProperty.call(arguments[0], 'injectedPlan') && arguments[0].injectedPlan) {
    plan = arguments[0].injectedPlan
  } else if (typeof env === 'object' && env && env.__INJECTED_PLAN) {
    // support env-level injection for tests without changing call signature
    plan = env.__INJECTED_PLAN
  } else {
    const planLoader = createSingleCasePlanLoader({ root: plansRoot })
    try {
      plan = await planLoader.loadByCaseImportId(caseImportId)
    } catch (e) {
      throw new Error(`PLAN_LOAD_FAILED:${String(e && e.message ? e.message : e)}`)
    }
  }
  const expected = plan && plan.contactPlan && plan.contactPlan.properties
  if (!expected || Object.getPrototypeOf(expected) !== Object.prototype) throw new Error("CONTACT_PROPERTIES_MISSING")

  // Build adapters: allow injection for tests; otherwise create from env HUBSPOT_TOKEN
  let hubspotAdapters
  if (adapters && adapters.contacts) {
    hubspotAdapters = adapters
  } else {
    const token = String(env.HUBSPOT_TOKEN || "").trim()
    if (!token) throw new Error("HUBSPOT_TOKEN_MISSING")
    const client = createHubSpotHttpClient({ token, fetch: globalThis.fetch, clock: () => new Date().toISOString(), timeoutMs: 30000 })
    hubspotAdapters = createHubSpotSingleCaseAdapters({ client, clock: () => new Date().toISOString() })
  }

  // Search by CPF then phone
  let candidates = []
  try {
    if (expected.cpf_do_cliente) {
      candidates = await hubspotAdapters.contacts.findContactsByCpf(String(expected.cpf_do_cliente))
    }
  } catch (e) {
    // ADAPTER_AMBIGUOUS_RESULT or other adapter errors bubble as Errors; treat ambiguous specially
    const m = String(e && e.message || "")
    if (/AMBIGUOUS|ADAPTER_AMBIGUOUS_RESULT/.test(m)) return { CONTACT_SEARCH_EXECUTED: true, CONTACT_CANDIDATES_COUNT: -1, UNAMBIGUOUS_CONTACT_FOUND: false, BLOCK_REASON: 'AMBIGUOUS_CPF' }
    throw new Error(`CPF_SEARCH_FAILED:${m}`)
  }

  if ((!candidates || candidates.length === 0) && expected.phone) {
    try {
      candidates = await hubspotAdapters.contacts.findContactsByPhone(String(expected.phone))
    } catch (e) {
      const m = String(e && e.message || "")
      if (/AMBIGUOUS|ADAPTER_AMBIGUOUS_RESULT/.test(m)) return { CONTACT_SEARCH_EXECUTED: true, CONTACT_CANDIDATES_COUNT: -1, UNAMBIGUOUS_CONTACT_FOUND: false, BLOCK_REASON: 'AMBIGUOUS_PHONE' }
      throw new Error(`PHONE_SEARCH_FAILED:${m}`)
    }
  }

  const candidateCount = Array.isArray(candidates) ? candidates.length : 0
  if (candidateCount !== 1) {
    return {
      CONTACT_SEARCH_EXECUTED: true,
      CONTACT_CANDIDATES_COUNT: candidateCount,
      UNAMBIGUOUS_CONTACT_FOUND: false,
      CONTACT_ID_PRESENT: false,
      CPF_BINDING_MATCH: null,
      PHONE_BINDING_MATCH: null,
      CASE_IMPORT_BINDING_MATCH: null,
      SEMANTIC_NAME_MATCH: null,
      PRESENTATION_NAME_MATCH: null,
      NORMALIZATION_REQUIRED: null,
      UPDATE_REQUIRED: null,
      HUBSPOT_WRITE_EXECUTED: false,
      POSTGRES_WRITE_EXECUTED: false
    }
  }

  const contactId = String(candidates[0].id || "").trim()
  if (!contactId) throw new Error("INVALID_CONTACT_ID")

  // Verify contact (adapter.verify signature: verify(contactId, properties, context))
  let verified
  try {
    verified = await hubspotAdapters.contacts.verify(contactId, expected, { caseImportId })
  } catch (e) {
    throw new Error(`VERIFY_FAILED:${String(e && e.message || e)}`)
  }

  const observedFirstname = String(verified.firstname || "").trim()
  const expectedFirstname = String(expected.firstname || "").trim()

  const semanticMatch = normalizarNomeComparacao(observedFirstname) === normalizarNomeComparacao(expectedFirstname)
  const presentationMatch = observedFirstname === formatarNome(expectedFirstname)
  const normalizationRequired = Boolean(semanticMatch && !presentationMatch)
  const updateRequired = Boolean(normalizationRequired)

  return {
    CONTACT_SEARCH_EXECUTED: true,
    CONTACT_CANDIDATES_COUNT: 1,
    UNAMBIGUOUS_CONTACT_FOUND: true,
    CONTACT_ID_PRESENT: true,
    CPF_BINDING_MATCH: Boolean(verified.cpf && String(verified.cpf) === String(expected.cpf_do_cliente)),
    PHONE_BINDING_MATCH: Boolean(verified.phone && String(verified.phone) === String(expected.phone)),
    CASE_IMPORT_BINDING_MATCH: Boolean(verified.caseImportId && String(verified.caseImportId) === String(caseImportId)),
    SEMANTIC_NAME_MATCH: Boolean(semanticMatch),
    PRESENTATION_NAME_MATCH: Boolean(presentationMatch),
    NORMALIZATION_REQUIRED: Boolean(normalizationRequired),
    UPDATE_REQUIRED: Boolean(updateRequired),
    HUBSPOT_WRITE_EXECUTED: false,
    POSTGRES_WRITE_EXECUTED: false
  }
}

// CLI runner: safe to run in Render environment (uses env HUBSPOT_TOKEN and SINGLE_CASE_P1_CASE_IMPORT_ID)
if (require.main === module) {
  (async () => {
    try {
      const result = await audit({ env: process.env })
      // Print sanitized JSON only
      console.log(JSON.stringify(result, null, 2))
      process.exit(0)
    } catch (e) {
      console.error(JSON.stringify({ ok: false, error: String(e && e.message ? e.message : e) }))
      process.exit(2)
    }
  })()
}

module.exports = { audit }
