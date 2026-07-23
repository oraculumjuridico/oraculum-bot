#!/usr/bin/env node
"use strict"

// Controlled Pilot 1 deal creation: create exactly one HubSpot deal and associate it with the confirmed contact.
// - Requires explicit authorization gate
// - Loads official dealPlan
// - Validates contact, deal, and payload constraints
// - Creates deal and association only when safe
// - Re-reads and verifies after creation
// - No real network is executed unless authorization is present and all preconditions pass

const path = require("node:path")
const { createSingleCasePlanLoader } = require("../src/adapters/single-case-plan-loader")
const { createHubSpotHttpClient } = require("../src/adapters/hubspot-http-client")
const { createHubSpotSingleCaseAdapters } = require("../src/adapters/hubspot-single-case-adapter")
const { normalizarNomeComparacao } = require("../src/domain/phone-name")
const { formatarNome } = require("../src/utils/text")
const { DEAL_WRITE_PROPERTIES } = require("../src/domain/hubspot-contract")
const { ASSOCIATION } = require("../src/adapters/hubspot-http-client")

const AUTHORIZATION_VALUE = "CONFIRM_EXACTLY_ONE_DEAL_AND_ASSOCIATION"

const REQUIRED_DEAL_PROPERTIES = new Set([
  "dealname",
  "pipeline",
  "dealstage",
  "numero_de_caso"
])

function classifyDealCreateError(error) {
  const m = String(error?.message || error || "").toLowerCase()
  if (/external_effect_uncertain/.test(m)) return "DEAL_CREATE_EXTERNAL_EFFECT_UNKNOWN"
  if (/timeout|abort|econnreset|connection.*reset|connection.*closed|transport|network.*error|socket|pipe|broken.*pipe/.test(m)) return "DEAL_CREATE_EXTERNAL_EFFECT_UNKNOWN"
  if (/empty|invalid.*response|no.*response|missing.*id|undefined.*id/.test(m)) return "DEAL_CREATE_EXTERNAL_EFFECT_UNKNOWN"
  if (/unauthorized|401|forbidden|403/.test(m)) return "DEAL_CREATE_CONFIRMED_NOT_EXECUTED"
  if (/not.*found|404/.test(m)) return "DEAL_CREATE_CONFIRMED_NOT_EXECUTED"
  if (/rate.*limit|429/.test(m)) return "DEAL_CREATE_CONFIRMED_NOT_EXECUTED"
  if (/invalid.*payload|missing.*field|validation.*error|before.*send|before.*submit/.test(m)) return "DEAL_CREATE_CONFIRMED_NOT_EXECUTED"
  return "DEAL_CREATE_EXTERNAL_EFFECT_UNKNOWN"
}

async function createPilot1HubSpotDealControlled({ env = process.env, adapters = null } = {}) {
  // Explicit authorization gate
  const auth = String(env.SINGLE_CASE_P1_ALLOW_DEAL_CREATION || "").trim()
  if (auth !== AUTHORIZATION_VALUE) {
    return {
      AUTHORIZED: false,
      CONTACT_SEARCHES: 0,
      DEAL_SEARCHES: 0,
      DEAL_CREATES: 0,
      ASSOCIATION_CREATES: 0,
      POST_CREATE_DEAL_READS: 0,
      POST_CREATE_ASSOCIATION_READS: 0,
      SAFE_FOR_REAL_EXECUTION: false
    }
  }

  const caseImportId = String(env.SINGLE_CASE_P1_CASE_IMPORT_ID || "").trim()
  if (!caseImportId) throw new Error("CASE_IMPORT_ID_MISSING")
  const plansRoot = String(env.SINGLE_CASE_PLANS_ROOT || path.join(process.cwd(), "data", "case-import", "plans"))

  const planLoader = createSingleCasePlanLoader({ root: plansRoot })
  let plan
  try {
    plan = await planLoader.loadByCaseImportId(caseImportId)
  } catch (e) {
    throw new Error(`PLAN_LOAD_FAILED:${String(e && e.message ? e.message : e)}`)
  }

  if (!plan?.dealPlan?.properties || Object.getPrototypeOf(plan.dealPlan.properties) !== Object.prototype) {
    throw new Error("DEAL_PROPERTIES_MISSING")
  }
  if (!plan?.associationPlan?.type || typeof plan.associationPlan.type !== "string") {
    throw new Error("ASSOCIATION_TYPE_MISSING")
  }

  const dealProps = plan.dealPlan.properties

  // Validate deal payload against closed list
  const unknownKeys = Object.keys(dealProps).filter(k => !DEAL_WRITE_PROPERTIES.has(k))
  if (unknownKeys.length > 0) {
    return {
      AUTHORIZED: true,
      CONTACT_SEARCHES: 0,
      DEAL_SEARCHES: 0,
      DEAL_CREATES: 0,
      ASSOCIATION_CREATES: 0,
      POST_CREATE_DEAL_READS: 0,
      POST_CREATE_ASSOCIATION_READS: 0,
      BLOCK_REASON: "UNKNOWN_DEAL_PROPERTIES",
      UNKNOWN_DEAL_PROPERTIES: unknownKeys,
      SAFE_FOR_REAL_EXECUTION: false
    }
  }

  // Validate required deal properties
  const missingRequired = [...REQUIRED_DEAL_PROPERTIES].filter(k => {
    const v = dealProps[k]
    return v === undefined || v === null || String(v).trim() === ""
  })
  if (missingRequired.length > 0) {
    return {
      AUTHORIZED: true,
      CONTACT_SEARCHES: 0,
      DEAL_SEARCHES: 0,
      DEAL_CREATES: 0,
      ASSOCIATION_CREATES: 0,
      POST_CREATE_DEAL_READS: 0,
      POST_CREATE_ASSOCIATION_READS: 0,
      BLOCK_REASON: "REQUIRED_DEAL_PROPERTIES_MISSING",
      MISSING_REQUIRED_DEAL_PROPERTIES: missingRequired,
      SAFE_FOR_REAL_EXECUTION: false
    }
  }

  if (String(dealProps.numero_de_caso || "").trim() !== String(plan.dealPlan.caseNumber || "").trim()) {
    return {
      AUTHORIZED: true,
      CONTACT_SEARCHES: 0,
      DEAL_SEARCHES: 0,
      DEAL_CREATES: 0,
      ASSOCIATION_CREATES: 0,
      POST_CREATE_DEAL_READS: 0,
      POST_CREATE_ASSOCIATION_READS: 0,
      BLOCK_REASON: "DEAL_CASE_NUMBER_MISMATCH",
      SAFE_FOR_REAL_EXECUTION: false
    }
  }

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
  let contactSearches = 0
  try {
    if (plan.contactPlan?.properties?.cpf_do_cliente) {
      candidates = await hubspotAdapters.contacts.findContactsByCpf(String(plan.contactPlan.properties.cpf_do_cliente))
      contactSearches++
    }
  } catch (e) {
    const m = String(e && e.message || "")
    if (/AMBIGUOUS|ADAPTER_AMBIGUOUS_RESULT/.test(m)) {
      return {
        AUTHORIZED: true,
        CONTACT_SEARCHES: contactSearches,
        DEAL_SEARCHES: 0,
        DEAL_CREATES: 0,
        ASSOCIATION_CREATES: 0,
        POST_CREATE_DEAL_READS: 0,
        POST_CREATE_ASSOCIATION_READS: 0,
        CONTACT_CANDIDATES_COUNT: -1,
        UNAMBIGUOUS_CONTACT_FOUND: false,
        BLOCK_REASON: "AMBIGUOUS_CPF",
        SAFE_FOR_REAL_EXECUTION: false
      }
    }
    throw new Error(`CPF_SEARCH_FAILED:${m}`)
  }

  if ((!candidates || candidates.length === 0) && plan.contactPlan?.properties?.phone) {
    try {
      candidates = await hubspotAdapters.contacts.findContactsByPhone(String(plan.contactPlan.properties.phone))
      contactSearches++
    } catch (e) {
      const m = String(e && e.message || "")
      if (/AMBIGUOUS|ADAPTER_AMBIGUOUS_RESULT/.test(m)) {
        return {
          AUTHORIZED: true,
          CONTACT_SEARCHES: contactSearches,
          DEAL_SEARCHES: 0,
          DEAL_CREATES: 0,
          ASSOCIATION_CREATES: 0,
          POST_CREATE_DEAL_READS: 0,
          POST_CREATE_ASSOCIATION_READS: 0,
          CONTACT_CANDIDATES_COUNT: -1,
          UNAMBIGUOUS_CONTACT_FOUND: false,
          BLOCK_REASON: "AMBIGUOUS_PHONE",
          SAFE_FOR_REAL_EXECUTION: false
        }
      }
      throw new Error(`PHONE_SEARCH_FAILED:${m}`)
    }
  }

  const contactCount = Array.isArray(candidates) ? candidates.length : 0
  if (contactCount !== 1) {
    return {
      AUTHORIZED: true,
      CONTACT_SEARCHES: contactSearches,
      DEAL_SEARCHES: 0,
      DEAL_CREATES: 0,
      ASSOCIATION_CREATES: 0,
      POST_CREATE_DEAL_READS: 0,
      POST_CREATE_ASSOCIATION_READS: 0,
      CONTACT_CANDIDATES_COUNT: contactCount,
      UNAMBIGUOUS_CONTACT_FOUND: false,
      SAFE_FOR_REAL_EXECUTION: false
    }
  }

  const contactId = String(candidates[0].id || "").trim()
  if (!contactId) throw new Error("INVALID_CONTACT_ID")

  let verified
  try {
    verified = await hubspotAdapters.contacts.verify(contactId, plan.contactPlan.properties, { caseImportId })
  } catch (e) {
    throw new Error(`VERIFY_FAILED:${String(e && e.message ? e.message : e)}`)
  }

  const expectedContact = plan.contactPlan.properties
  const cpfMatch = Boolean(verified.cpf && String(verified.cpf) === String(expectedContact.cpf_do_cliente))
  const phoneMatch = Boolean(verified.phone && String(verified.phone) === String(expectedContact.phone))
  const caseImportMatch = Boolean(verified.caseImportId && String(verified.caseImportId) === String(caseImportId))
  const semanticMatch = normalizarNomeComparacao(String(verified.firstname || "").trim()) === normalizarNomeComparacao(String(formatarNome(expectedContact.firstname || "")).trim())

  if (!cpfMatch || !phoneMatch || !caseImportMatch || !semanticMatch) {
    return {
      AUTHORIZED: true,
      CONTACT_SEARCHES: contactSearches,
      DEAL_SEARCHES: 0,
      DEAL_CREATES: 0,
      ASSOCIATION_CREATES: 0,
      POST_CREATE_DEAL_READS: 0,
      POST_CREATE_ASSOCIATION_READS: 0,
      CONTACT_CANDIDATES_COUNT: 1,
      UNAMBIGUOUS_CONTACT_FOUND: true,
      CONTACT_ID_PRESENT: true,
      CPF_BINDING_MATCH: cpfMatch,
      PHONE_BINDING_MATCH: phoneMatch,
      CONTACT_CASE_IMPORT_BINDING_MATCH: caseImportMatch,
      SEMANTIC_NAME_MATCH: semanticMatch,
      SAFE_FOR_REAL_EXECUTION: false
    }
  }

  // STEP 2: search deal by case number
  let dealCandidates = []
  let dealSearchError = null
  try {
    dealCandidates = await hubspotAdapters.deals.findByCaseNumber(plan.dealPlan.caseNumber)
  } catch (e) {
    dealSearchError = String(e && e.message ? e.message : e)
  }

  if (dealSearchError) {
    return {
      AUTHORIZED: true,
      CONTACT_SEARCHES: contactSearches,
      DEAL_SEARCHES: 1,
      DEAL_CREATES: 0,
      ASSOCIATION_CREATES: 0,
      POST_CREATE_DEAL_READS: 0,
      POST_CREATE_ASSOCIATION_READS: 0,
      CONTACT_CANDIDATES_COUNT: 1,
      UNAMBIGUOUS_CONTACT_FOUND: true,
      CONTACT_ID_PRESENT: true,
      CPF_BINDING_MATCH: cpfMatch,
      PHONE_BINDING_MATCH: phoneMatch,
      CONTACT_CASE_IMPORT_BINDING_MATCH: caseImportMatch,
      SEMANTIC_NAME_MATCH: semanticMatch,
      DEAL_SEARCH_FAILED: true,
      DEAL_SEARCH_ERROR: dealSearchError,
      SAFE_FOR_REAL_EXECUTION: false
    }
  }

  const dealCount = Array.isArray(dealCandidates) ? dealCandidates.length : 0
  if (dealCount > 1) {
    return {
      AUTHORIZED: true,
      CONTACT_SEARCHES: contactSearches,
      DEAL_SEARCHES: 1,
      DEAL_CREATES: 0,
      ASSOCIATION_CREATES: 0,
      POST_CREATE_DEAL_READS: 0,
      POST_CREATE_ASSOCIATION_READS: 0,
      CONTACT_CANDIDATES_COUNT: 1,
      UNAMBIGUOUS_CONTACT_FOUND: true,
      CONTACT_ID_PRESENT: true,
      CPF_BINDING_MATCH: cpfMatch,
      PHONE_BINDING_MATCH: phoneMatch,
      CONTACT_CASE_IMPORT_BINDING_MATCH: caseImportMatch,
      SEMANTIC_NAME_MATCH: semanticMatch,
      DEAL_CANDIDATES_COUNT: dealCount,
      UNAMBIGUOUS_DEAL_FOUND: false,
      SAFE_FOR_REAL_EXECUTION: false
    }
  }

  let dealId = null
  let dealVerified = null
  let dealCreateSucceeded = false

  if (dealCount === 1) {
    dealId = String(dealCandidates[0].id || "").trim()
    if (!dealId) throw new Error("INVALID_DEAL_ID")
    try {
      dealVerified = await hubspotAdapters.deals.verify(dealId, dealProps)
    } catch (e) {
      dealVerified = { caseNumber: "", pipeline: "", stage: "" }
    }
    return {
      AUTHORIZED: true,
      CONTACT_SEARCHES: contactSearches,
      DEAL_SEARCHES: 1,
      DEAL_CREATES: 0,
      ASSOCIATION_CREATES: 0,
      POST_CREATE_DEAL_READS: 1,
      POST_CREATE_ASSOCIATION_READS: 0,
      CONTACT_CANDIDATES_COUNT: 1,
      UNAMBIGUOUS_CONTACT_FOUND: true,
      CONTACT_ID_PRESENT: true,
      CPF_BINDING_MATCH: cpfMatch,
      PHONE_BINDING_MATCH: phoneMatch,
      CONTACT_CASE_IMPORT_BINDING_MATCH: caseImportMatch,
      SEMANTIC_NAME_MATCH: semanticMatch,
      DEAL_CANDIDATES_COUNT: dealCount,
      UNAMBIGUOUS_DEAL_FOUND: true,
      DEAL_ID_PRESENT: true,
      DEAL_CASE_NUMBER_MATCH: String(dealVerified.caseNumber || "").trim() === plan.dealPlan.caseNumber,
      PIPELINE_MATCH: String(dealVerified.pipeline || "").trim() === String(dealProps.pipeline || "").trim(),
      STAGE_MATCH: String(dealVerified.stage || "").trim() === String(dealProps.dealstage || "").trim(),
      SAFE_FOR_REAL_EXECUTION: true
    }
  }

  // STEP 3: create deal (dealCount === 0)
  let dealCreateError = null
  let dealCreateClassification = null
  try {
    const createResult = await hubspotAdapters.deals.create({ properties: dealProps, context: { caseImportId, idempotencyKey: `${caseImportId}:create-deal` } })
    dealId = String(createResult?.id || "").trim()
    if (!dealId) {
      dealCreateError = new Error("DEAL_CREATE_ID_MISSING")
      dealCreateClassification = "DEAL_CREATE_EXTERNAL_EFFECT_UNKNOWN"
    } else {
      dealCreateSucceeded = true
    }
  } catch (e) {
    dealCreateError = String(e && e.message ? e.message : e)
    dealCreateClassification = classifyDealCreateError(e)
  }

  if (dealCreateError) {
    const isUnknown = dealCreateClassification === "DEAL_CREATE_EXTERNAL_EFFECT_UNKNOWN"
    const isConfirmedNotExecuted = dealCreateClassification === "DEAL_CREATE_CONFIRMED_NOT_EXECUTED"
    return {
      AUTHORIZED: true,
      CONTACT_SEARCHES: contactSearches,
      DEAL_SEARCHES: 1,
      DEAL_CREATES: 1,
      ASSOCIATION_CREATES: 0,
      POST_CREATE_DEAL_READS: 0,
      POST_CREATE_ASSOCIATION_READS: 0,
      CONTACT_CANDIDATES_COUNT: 1,
      UNAMBIGUOUS_CONTACT_FOUND: true,
      CONTACT_ID_PRESENT: true,
      CPF_BINDING_MATCH: cpfMatch,
      PHONE_BINDING_MATCH: phoneMatch,
      CONTACT_CASE_IMPORT_BINDING_MATCH: caseImportMatch,
      SEMANTIC_NAME_MATCH: semanticMatch,
      DEAL_CREATE_CLASSIFICATION: dealCreateClassification,
      DEAL_CREATE_EXTERNAL_EFFECT_UNKNOWN: isUnknown,
      DEAL_CREATE_CONFIRMED_NOT_EXECUTED: isConfirmedNotExecuted,
      DEAL_CREATE_CONFIRMED_SUCCEEDED: false,
      DEAL_CREATE_ERROR: dealCreateError,
      RETRY_ALLOWED: !isUnknown,
      READONLY_RECONCILIATION_REQUIRED: isUnknown,
      SAFE_FOR_REAL_EXECUTION: false
    }
  }

  // STEP 4: read back created deal
  let dealVerifyError = null
  try {
    dealVerified = await hubspotAdapters.deals.verify(dealId, dealProps)
  } catch (e) {
    dealVerifyError = String(e && e.message ? e.message : e)
  }

  if (dealVerifyError) {
    return {
      AUTHORIZED: true,
      CONTACT_SEARCHES: contactSearches,
      DEAL_SEARCHES: 1,
      DEAL_CREATES: 1,
      ASSOCIATION_CREATES: 0,
      POST_CREATE_DEAL_READS: 1,
      POST_CREATE_ASSOCIATION_READS: 0,
      CONTACT_CANDIDATES_COUNT: 1,
      UNAMBIGUOUS_CONTACT_FOUND: true,
      CONTACT_ID_PRESENT: true,
      CPF_BINDING_MATCH: cpfMatch,
      PHONE_BINDING_MATCH: phoneMatch,
      CONTACT_CASE_IMPORT_BINDING_MATCH: caseImportMatch,
      SEMANTIC_NAME_MATCH: semanticMatch,
      DEAL_CREATE_SUCCEEDED: true,
      DEAL_CREATE_CONFIRMED_SUCCEEDED: true,
      DEAL_READ_FAILED: true,
      DEAL_READ_ERROR: dealVerifyError,
      SAFE_FOR_REAL_EXECUTION: false
    }
  }

  const caseNumberMatch = String(dealVerified.caseNumber || "").trim() === String(plan.dealPlan.caseNumber || "").trim()
  const pipelineMatch = String(dealVerified.pipeline || "").trim() === String(dealProps.pipeline || "").trim()
  const stageMatch = String(dealVerified.stage || "").trim() === String(dealProps.dealstage || "").trim()

  const plannedFieldKeys = Object.keys(dealProps).filter(k => k !== "numero_de_caso")
  const fieldMatches = {}
  let allFieldsMatch = true
  for (const key of plannedFieldKeys) {
    const expected = String(dealProps[key] || "").trim()
    const actual = String(dealVerified[key] || "").trim()
    fieldMatches[key] = actual === expected
    if (!fieldMatches[key]) allFieldsMatch = false
  }

  // STEP 5: check existing association before creating
  let existingAssociations = []
  try {
    existingAssociations = await hubspotAdapters.associations.find(contactId, dealId)
  } catch (e) {
    // If read fails, we'll attempt creation and let that fail or succeed
  }

  if (existingAssociations.length > 0) {
    return {
      AUTHORIZED: true,
      CONTACT_SEARCHES: contactSearches,
      DEAL_SEARCHES: 1,
      DEAL_CREATES: 1,
      ASSOCIATION_CREATES: 0,
      POST_CREATE_DEAL_READS: 1,
      POST_CREATE_ASSOCIATION_READS: 1,
      CONTACT_CANDIDATES_COUNT: 1,
      UNAMBIGUOUS_CONTACT_FOUND: true,
      CONTACT_ID_PRESENT: true,
      CPF_BINDING_MATCH: cpfMatch,
      PHONE_BINDING_MATCH: phoneMatch,
      CONTACT_CASE_IMPORT_BINDING_MATCH: caseImportMatch,
      SEMANTIC_NAME_MATCH: semanticMatch,
      DEAL_CREATE_SUCCEEDED: true,
      DEAL_CREATE_CONFIRMED_SUCCEEDED: true,
      DEAL_ID_PRESENT: true,
      DEAL_CASE_NUMBER_MATCH: caseNumberMatch,
      PIPELINE_MATCH: pipelineMatch,
      STAGE_MATCH: stageMatch,
      PLANNED_DEAL_FIELDS_MATCH: allFieldsMatch,
      PLANNED_DEAL_FIELDS: fieldMatches,
      ASSOCIATION_ALREADY_EXISTS: true,
      CONTACT_ASSOCIATION_MATCH: true,
      SAFE_FOR_REAL_EXECUTION: true
    }
  }

  // STEP 6: create association
  let associationCreateError = null
  let createdAssociationId = null
  try {
    const assocResult = await hubspotAdapters.associations.create({
      contactId,
      dealId,
      type: plan.associationPlan.type,
      context: { caseImportId, idempotencyKey: `${caseImportId}:create-association` }
    })
    createdAssociationId = String(assocResult?.id || "").trim()
    if (!createdAssociationId) throw new Error("ASSOCIATION_CREATE_ID_MISSING")
  } catch (e) {
    associationCreateError = String(e && e.message ? e.message : e)
  }

  if (associationCreateError) {
    return {
      AUTHORIZED: true,
      CONTACT_SEARCHES: contactSearches,
      DEAL_SEARCHES: 1,
      DEAL_CREATES: 1,
      ASSOCIATION_CREATES: 1,
      POST_CREATE_DEAL_READS: 1,
      POST_CREATE_ASSOCIATION_READS: 0,
      CONTACT_CANDIDATES_COUNT: 1,
      UNAMBIGUOUS_CONTACT_FOUND: true,
      CONTACT_ID_PRESENT: true,
      CPF_BINDING_MATCH: cpfMatch,
      PHONE_BINDING_MATCH: phoneMatch,
      CONTACT_CASE_IMPORT_BINDING_MATCH: caseImportMatch,
      SEMANTIC_NAME_MATCH: semanticMatch,
      DEAL_CREATE_SUCCEEDED: true,
      DEAL_CREATE_CONFIRMED_SUCCEEDED: true,
      DEAL_ID_PRESENT: true,
      DEAL_CASE_NUMBER_MATCH: caseNumberMatch,
      PIPELINE_MATCH: pipelineMatch,
      STAGE_MATCH: stageMatch,
      PLANNED_DEAL_FIELDS_MATCH: allFieldsMatch,
      PLANNED_DEAL_FIELDS: fieldMatches,
      ASSOCIATION_CREATE_FAILED: true,
      ASSOCIATION_CREATE_ERROR: associationCreateError,
      SAFE_FOR_REAL_EXECUTION: false
    }
  }

  // STEP 7: read back association
  let associationReadError = null
  let associations = []
  try {
    associations = await hubspotAdapters.associations.find(contactId, dealId)
  } catch (e) {
    associationReadError = String(e && e.message ? e.message : e)
  }

  if (associationReadError) {
    return {
      AUTHORIZED: true,
      CONTACT_SEARCHES: contactSearches,
      DEAL_SEARCHES: 1,
      DEAL_CREATES: 1,
      ASSOCIATION_CREATES: 1,
      POST_CREATE_DEAL_READS: 1,
      POST_CREATE_ASSOCIATION_READS: 1,
      CONTACT_CANDIDATES_COUNT: 1,
      UNAMBIGUOUS_CONTACT_FOUND: true,
      CONTACT_ID_PRESENT: true,
      CPF_BINDING_MATCH: cpfMatch,
      PHONE_BINDING_MATCH: phoneMatch,
      CONTACT_CASE_IMPORT_BINDING_MATCH: caseImportMatch,
      SEMANTIC_NAME_MATCH: semanticMatch,
      DEAL_CREATE_SUCCEEDED: true,
      DEAL_CREATE_CONFIRMED_SUCCEEDED: true,
      DEAL_ID_PRESENT: true,
      DEAL_CASE_NUMBER_MATCH: caseNumberMatch,
      PIPELINE_MATCH: pipelineMatch,
      STAGE_MATCH: stageMatch,
      PLANNED_DEAL_FIELDS_MATCH: allFieldsMatch,
      PLANNED_DEAL_FIELDS: fieldMatches,
      ASSOCIATION_CREATE_SUCCEEDED: true,
      ASSOCIATION_READ_FAILED: true,
      ASSOCIATION_READ_ERROR: associationReadError,
      SAFE_FOR_REAL_EXECUTION: false
    }
  }

  const associationMatch = associations.length > 0

  return {
    AUTHORIZED: true,
    CONTACT_SEARCHES: contactSearches,
    DEAL_SEARCHES: 1,
    DEAL_CREATES: 1,
    ASSOCIATION_CREATES: 1,
    POST_CREATE_DEAL_READS: 1,
    POST_CREATE_ASSOCIATION_READS: 1,
    CONTACT_CANDIDATES_COUNT: 1,
    UNAMBIGUOUS_CONTACT_FOUND: true,
    CONTACT_ID_PRESENT: true,
    CPF_BINDING_MATCH: cpfMatch,
    PHONE_BINDING_MATCH: phoneMatch,
    CONTACT_CASE_IMPORT_BINDING_MATCH: caseImportMatch,
    SEMANTIC_NAME_MATCH: semanticMatch,
      DEAL_CREATE_SUCCEEDED: true,
      DEAL_CREATE_CONFIRMED_SUCCEEDED: true,
      DEAL_ID_PRESENT: true,
      DEAL_CREATE_CONFIRMED_SUCCEEDED: true,
      DEAL_CASE_NUMBER_MATCH: caseNumberMatch,
      PIPELINE_MATCH: pipelineMatch,
      STAGE_MATCH: stageMatch,
      PLANNED_DEAL_FIELDS_MATCH: allFieldsMatch,
      PLANNED_DEAL_FIELDS: fieldMatches,
      CONTACT_ASSOCIATION_MATCH: associationMatch,
      SAFE_FOR_REAL_EXECUTION: Boolean(caseNumberMatch && pipelineMatch && stageMatch && allFieldsMatch && associationMatch)
  }
}

if (require.main === module) {
  (async () => {
    try {
      const result = await createPilot1HubSpotDealControlled({ env: process.env })
      console.log(JSON.stringify(result, null, 2))
      process.exit(result.SAFE_FOR_REAL_EXECUTION ? 0 : 2)
    } catch (e) {
      console.error(JSON.stringify({ ok: false, error: String(e && e.message ? e.message : e) }))
      process.exit(2)
    }
  })()
}

module.exports = { createPilot1HubSpotDealControlled, AUTHORIZATION_VALUE, REQUIRED_DEAL_PROPERTIES }
