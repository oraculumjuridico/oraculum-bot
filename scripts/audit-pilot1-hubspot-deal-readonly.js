#!/usr/bin/env node
"use strict"

// Read-only audit script: determine if Pilot 1 deal exists and its association with the confirmed contact
// - Loads plan, locates contact, verifies bindings
// - Searches deal by internal case number
// - Checks association with contact when exactly one deal is found
// - Returns sanitized JSON contract

const path = require("node:path")

async function auditPilot1HubSpotDealReadonly({ env = process.env, adapters = null } = {}) {
  const caseImportId = String(env.SINGLE_CASE_P1_CASE_IMPORT_ID || "").trim()
  if (!caseImportId) throw new Error("CASE_IMPORT_ID_MISSING")
  const plansRoot = String(env.SINGLE_CASE_PLANS_ROOT || path.join(process.cwd(), "data", "case-import", "plans"))

  const { createSingleCasePlanLoader } = require("../src/adapters/single-case-plan-loader")
  const { createHubSpotHttpClient } = require("../src/adapters/hubspot-http-client")
  const { createHubSpotSingleCaseAdapters } = require("../src/adapters/hubspot-single-case-adapter")
  const { normalizarNomeComparacao } = require("../src/domain/phone-name")
  const { formatarNome } = require("../src/utils/text")

  const planLoader = createSingleCasePlanLoader({ root: plansRoot })
  let plan
  try {
    plan = await planLoader.loadByCaseImportId(caseImportId)
  } catch (e) {
    throw new Error(`PLAN_LOAD_FAILED:${String(e && e.message ? e.message : e)}`)
  }
  const expected = plan && plan.contactPlan && plan.contactPlan.properties
  if (!expected || Object.getPrototypeOf(expected) !== Object.prototype) throw new Error("CONTACT_PROPERTIES_MISSING")

  const expectedCaseNumber = String(plan?.dealPlan?.caseNumber || "").trim()
  if (!expectedCaseNumber) throw new Error("CASE_NUMBER_MISSING")

  let hubspotAdapters
  if (adapters && adapters.contacts) {
    hubspotAdapters = adapters
  } else {
    const token = String(env.HUBSPOT_TOKEN || "").trim()
    if (!token) throw new Error("HUBSPOT_TOKEN_MISSING")
    const client = createHubSpotHttpClient({ token, fetch: globalThis.fetch, clock: () => new Date().toISOString(), timeoutMs: 30000 })
    hubspotAdapters = createHubSpotSingleCaseAdapters({ client, clock: () => new Date().toISOString() })
  }

  // STEP 1: search contact by CPF
  let candidates = []
  try {
    if (expected.cpf_do_cliente) {
      candidates = await hubspotAdapters.contacts.findContactsByCpf(String(expected.cpf_do_cliente))
    }
  } catch (e) {
    const m = String(e && e.message || "")
    if (/AMBIGUOUS|ADAPTER_AMBIGUOUS_RESULT/.test(m)) {
      return {
        CONTACT_SEARCH_EXECUTED: true,
        CONTACT_CANDIDATES_COUNT: -1,
        UNAMBIGUOUS_CONTACT_FOUND: false,
        BLOCK_REASON: "AMBIGUOUS_CPF",
        DEAL_SEARCHES: 0,
        SAFE_FOR_REAL_READONLY_AUDIT: false
      }
    }
    throw new Error(`CPF_SEARCH_FAILED:${m}`)
  }

  if ((!candidates || candidates.length === 0) && expected.phone) {
    try {
      candidates = await hubspotAdapters.contacts.findContactsByPhone(String(expected.phone))
    } catch (e) {
      const m = String(e && e.message || "")
      if (/AMBIGUOUS|ADAPTER_AMBIGUOUS_RESULT/.test(m)) {
        return {
          CONTACT_SEARCH_EXECUTED: true,
          CONTACT_CANDIDATES_COUNT: -1,
          UNAMBIGUOUS_CONTACT_FOUND: false,
          BLOCK_REASON: "AMBIGUOUS_PHONE",
          DEAL_SEARCHES: 0,
          SAFE_FOR_REAL_READONLY_AUDIT: false
        }
      }
      throw new Error(`PHONE_SEARCH_FAILED:${m}`)
    }
  }

  const contactCount = Array.isArray(candidates) ? candidates.length : 0
  if (contactCount !== 1) {
    return {
      CONTACT_SEARCH_EXECUTED: true,
      CONTACT_CANDIDATES_COUNT: contactCount,
      UNAMBIGUOUS_CONTACT_FOUND: false,
      CONTACT_ID_PRESENT: false,
      CPF_BINDING_MATCH: null,
      PHONE_BINDING_MATCH: null,
      CASE_IMPORT_BINDING_MATCH: null,
      SEMANTIC_NAME_MATCH: null,
      DEAL_SEARCHES: 0,
      SAFE_FOR_REAL_READONLY_AUDIT: false
    }
  }

  const contactId = String(candidates[0].id || "").trim()
  if (!contactId) throw new Error("INVALID_CONTACT_ID")

  let verified
  try {
    verified = await hubspotAdapters.contacts.verify(contactId, expected, { caseImportId })
  } catch (e) {
    throw new Error(`VERIFY_FAILED:${String(e && e.message ? e.message : e)}`)
  }

  const cpfMatch = Boolean(verified.cpf && String(verified.cpf) === String(expected.cpf_do_cliente))
  const phoneMatch = Boolean(verified.phone && String(verified.phone) === String(expected.phone))
  const caseImportMatch = Boolean(verified.caseImportId && String(verified.caseImportId) === String(caseImportId))
  const semanticMatch = normalizarNomeComparacao(String(verified.firstname || "").trim()) === normalizarNomeComparacao(String(expected.firstname || "").trim())

  if (!cpfMatch || !phoneMatch || !caseImportMatch || !semanticMatch) {
    return {
      CONTACT_SEARCH_EXECUTED: true,
      CONTACT_CANDIDATES_COUNT: 1,
      UNAMBIGUOUS_CONTACT_FOUND: true,
      CONTACT_ID_PRESENT: true,
      CPF_BINDING_MATCH: cpfMatch,
      PHONE_BINDING_MATCH: phoneMatch,
      CASE_IMPORT_BINDING_MATCH: caseImportMatch,
      SEMANTIC_NAME_MATCH: semanticMatch,
      DEAL_SEARCHES: 0,
      SAFE_FOR_REAL_READONLY_AUDIT: false
    }
  }

  // STEP 2: search deal by case number
  let dealCandidates = []
  let dealSearchError = null
  try {
    dealCandidates = await hubspotAdapters.deals.findByCaseNumber(expectedCaseNumber)
  } catch (e) {
    dealSearchError = String(e && e.message ? e.message : e)
  }

  if (dealSearchError) {
    return {
      CONTACT_SEARCH_EXECUTED: true,
      CONTACT_CANDIDATES_COUNT: 1,
      UNAMBIGUOUS_CONTACT_FOUND: true,
      CONTACT_ID_PRESENT: true,
      CPF_BINDING_MATCH: cpfMatch,
      PHONE_BINDING_MATCH: phoneMatch,
      CASE_IMPORT_BINDING_MATCH: caseImportMatch,
      SEMANTIC_NAME_MATCH: semanticMatch,
      DEAL_SEARCHES: 1,
      DEAL_SEARCH_FAILED: true,
      DEAL_SEARCH_ERROR: dealSearchError,
      SAFE_FOR_REAL_READONLY_AUDIT: false
    }
  }

  const dealCount = Array.isArray(dealCandidates) ? dealCandidates.length : 0
  if (dealCount !== 1) {
    return {
      CONTACT_SEARCH_EXECUTED: true,
      CONTACT_CANDIDATES_COUNT: 1,
      UNAMBIGUOUS_CONTACT_FOUND: true,
      CONTACT_ID_PRESENT: true,
      CPF_BINDING_MATCH: cpfMatch,
      PHONE_BINDING_MATCH: phoneMatch,
      CASE_IMPORT_BINDING_MATCH: caseImportMatch,
      SEMANTIC_NAME_MATCH: semanticMatch,
      DEAL_SEARCHES: 1,
      DEAL_CANDIDATES_COUNT: dealCount,
      UNAMBIGUOUS_DEAL_FOUND: false,
      SAFE_FOR_REAL_READONLY_AUDIT: false
    }
  }

  const dealId = String(dealCandidates[0].id || "").trim()
  if (!dealId) throw new Error("INVALID_DEAL_ID")

  // STEP 3: verify deal
  let dealVerified
  try {
    dealVerified = await hubspotAdapters.deals.verify(dealId, { numero_de_caso: expectedCaseNumber })
  } catch (e) {
    throw new Error(`DEAL_VERIFY_FAILED:${String(e && e.message ? e.message : e)}`)
  }

  const caseNumberMatch = String(dealVerified.caseNumber || "").trim() === expectedCaseNumber

  // STEP 4: check association
  let associationMatch = false
  let associationError = null
  try {
    const associations = await hubspotAdapters.associations.find(contactId, dealId)
    associationMatch = associations.length > 0
  } catch (e) {
    associationError = String(e && e.message ? e.message : e)
  }

  if (associationError) {
    return {
      CONTACT_SEARCH_EXECUTED: true,
      CONTACT_CANDIDATES_COUNT: 1,
      UNAMBIGUOUS_CONTACT_FOUND: true,
      CONTACT_ID_PRESENT: true,
      CPF_BINDING_MATCH: cpfMatch,
      PHONE_BINDING_MATCH: phoneMatch,
      CASE_IMPORT_BINDING_MATCH: caseImportMatch,
      SEMANTIC_NAME_MATCH: semanticMatch,
      DEAL_SEARCHES: 1,
      DEAL_CANDIDATES_COUNT: 1,
      UNAMBIGUOUS_DEAL_FOUND: true,
      DEAL_ID_PRESENT: true,
      CASE_NUMBER_MATCH: caseNumberMatch,
      ASSOCIATION_READ_FAILED: true,
      ASSOCIATION_READ_ERROR: associationError,
      SAFE_FOR_REAL_READONLY_AUDIT: false
    }
  }

  return {
    CONTACT_SEARCH_EXECUTED: true,
    CONTACT_CANDIDATES_COUNT: 1,
    UNAMBIGUOUS_CONTACT_FOUND: true,
    CONTACT_ID_PRESENT: true,
    CPF_BINDING_MATCH: cpfMatch,
    PHONE_BINDING_MATCH: phoneMatch,
    CASE_IMPORT_BINDING_MATCH: caseImportMatch,
    SEMANTIC_NAME_MATCH: semanticMatch,
    DEAL_SEARCHES: 1,
    DEAL_CANDIDATES_COUNT: 1,
    UNAMBIGUOUS_DEAL_FOUND: true,
    DEAL_ID_PRESENT: true,
    CASE_NUMBER_MATCH: caseNumberMatch,
    CONTACT_ASSOCIATION_MATCH: associationMatch,
    SAFE_FOR_REAL_READONLY_AUDIT: Boolean(caseNumberMatch && associationMatch)
  }
}

if (require.main === module) {
  (async () => {
    try {
      const result = await auditPilot1HubSpotDealReadonly({ env: process.env })
      console.log(JSON.stringify(result, null, 2))
      process.exit(0)
    } catch (e) {
      console.error(JSON.stringify({ ok: false, error: String(e && e.message ? e.message : e) }))
      process.exit(2)
    }
  })()
}

module.exports = { auditPilot1HubSpotDealReadonly }
