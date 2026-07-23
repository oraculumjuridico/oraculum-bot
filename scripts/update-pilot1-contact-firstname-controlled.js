#!/usr/bin/env node
"use strict"

// Controlled operational script: update canonical firstname for Piloto 1 contact (HubSpot write prepared)
// - Repeats CPF/phone search
// - Requires exactly 1 candidate
// - Verifies bindings and normalization contract
// - Executes at most ONE update call with ONLY firstname
// - Reads back by contactId and confirms invariants
// - Prints sanitized JSON contract

const path = require("node:path")

async function executeControlledFirstnameUpdate({ env = process.env, adapters = null } = {}) {
  // Validate required env
  const caseImportId = String(env.SINGLE_CASE_P1_CASE_IMPORT_ID || "").trim()
  if (!caseImportId) throw new Error("CASE_IMPORT_ID_MISSING")
  const plansRoot = String(env.SINGLE_CASE_PLANS_ROOT || path.join(process.cwd(), "data", "case-import", "plans"))

  // Static requires
  const { createSingleCasePlanLoader } = require("../src/adapters/single-case-plan-loader")
  const { createHubSpotHttpClient } = require("../src/adapters/hubspot-http-client")
  const { createHubSpotSingleCaseAdapters } = require("../src/adapters/hubspot-single-case-adapter")
  const { normalizarNomeComparacao } = require("../src/domain/phone-name")
  const { formatarNome } = require("../src/utils/text")

  // Load plan
  const planLoader = createSingleCasePlanLoader({ root: plansRoot })
  let plan
  try {
    plan = await planLoader.loadByCaseImportId(caseImportId)
  } catch (e) {
    throw new Error(`PLAN_LOAD_FAILED:${String(e && e.message ? e.message : e)}`)
  }
  const expected = plan && plan.contactPlan && plan.contactPlan.properties
  if (!expected || Object.getPrototypeOf(expected) !== Object.prototype) throw new Error("CONTACT_PROPERTIES_MISSING")

  // Authorization gate for real execution (bypassed when adapters are injected for tests)
  if (!adapters || !adapters.contacts) {
    const auth = String(env.SINGLE_CASE_P1_ALLOW_FIRSTNAME_UPDATE || "").trim()
    if (auth !== "CONFIRM_EXACTLY_ONE_UPDATE") {
      return {
        CONTACT_SEARCH_EXECUTED: false,
        CONTACT_CANDIDATES_COUNT: 0,
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
        POSTGRES_WRITE_EXECUTED: false,
        EXPLICIT_WRITE_AUTHORIZATION_MISSING: true,
        SAFE_FOR_CONTROLLED_WRITE_PREPARATION: false
      }
    }
  }

  // Build adapters
  let hubspotAdapters
  if (adapters && adapters.contacts) {
    hubspotAdapters = adapters
  } else {
    const token = String(env.HUBSPOT_TOKEN || "").trim()
    if (!token) throw new Error("HUBSPOT_TOKEN_MISSING")
    const client = createHubSpotHttpClient({ token, fetch: globalThis.fetch, clock: () => new Date().toISOString(), timeoutMs: 30000 })
    hubspotAdapters = createHubSpotSingleCaseAdapters({ client, clock: () => new Date().toISOString() })
  }

  // STEP 1: search by CPF
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
        HUBSPOT_WRITE_EXECUTED: false,
        POSTGRES_WRITE_EXECUTED: false,
        SAFE_FOR_CONTROLLED_WRITE_PREPARATION: false
      }
    }
    throw new Error(`CPF_SEARCH_FAILED:${m}`)
  }

  // STEP 2: fallback to phone search ONLY if CPF search returned zero candidates
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
          HUBSPOT_WRITE_EXECUTED: false,
          POSTGRES_WRITE_EXECUTED: false,
          SAFE_FOR_CONTROLLED_WRITE_PREPARATION: false
        }
      }
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
      POSTGRES_WRITE_EXECUTED: false,
      SAFE_FOR_CONTROLLED_WRITE_PREPARATION: false
    }
  }

  const contactId = String(candidates[0].id || "").trim()
  if (!contactId) throw new Error("INVALID_CONTACT_ID")

  // STEP 3: verify contact
  let verified
  try {
    verified = await hubspotAdapters.contacts.verify(contactId, expected, { caseImportId })
  } catch (e) {
    throw new Error(`VERIFY_FAILED:${String(e && e.message ? e.message : e)}`)
  }

  const observedFirstname = String(verified.firstname || "").trim()
  const expectedFirstnameRaw = String(expected.firstname || "").trim()
  const canonicalFirstName = formatarNome(expectedFirstnameRaw)

  const semanticMatch = normalizarNomeComparacao(observedFirstname) === normalizarNomeComparacao(expectedFirstnameRaw)
  const presentationMatch = observedFirstname === canonicalFirstName
  const normalizationRequired = Boolean(semanticMatch && !presentationMatch)
  const updateRequired = Boolean(normalizationRequired)

  // Block if preconditions fail
  const cpfMatch = Boolean(verified.cpf && String(verified.cpf) === String(expected.cpf_do_cliente))
  const phoneMatch = Boolean(verified.phone && String(verified.phone) === String(expected.phone))
  const caseImportMatch = Boolean(verified.caseImportId && String(verified.caseImportId) === String(caseImportId))

  if (!cpfMatch || !phoneMatch || !caseImportMatch || !semanticMatch || presentationMatch || !normalizationRequired) {
    return {
      CONTACT_SEARCH_EXECUTED: true,
      CONTACT_CANDIDATES_COUNT: 1,
      UNAMBIGUOUS_CONTACT_FOUND: true,
      CONTACT_ID_PRESENT: true,
      CPF_BINDING_MATCH: cpfMatch,
      PHONE_BINDING_MATCH: phoneMatch,
      CASE_IMPORT_BINDING_MATCH: caseImportMatch,
      SEMANTIC_NAME_MATCH: semanticMatch,
      PRESENTATION_NAME_MATCH: presentationMatch,
      NORMALIZATION_REQUIRED: normalizationRequired,
      UPDATE_REQUIRED: updateRequired,
      HUBSPOT_WRITE_EXECUTED: false,
      POSTGRES_WRITE_EXECUTED: false,
      SAFE_FOR_CONTROLLED_WRITE_PREPARATION: false
    }
  }

  // STEP 4: execute at most ONE update call
  let updateExecuted = false
  let updateError = null
  try {
    if (!updateExecuted) {
      const writePayload = {
        properties: {
          firstname: canonicalFirstName
        }
      }
      await hubspotAdapters.contacts.update(contactId, writePayload)
      updateExecuted = true
    }
  } catch (e) {
    updateError = String(e && e.message ? e.message : e)
  }

  if (!updateExecuted) {
    return {
      CONTACT_SEARCH_EXECUTED: true,
      CONTACT_CANDIDATES_COUNT: 1,
      UNAMBIGUOUS_CONTACT_FOUND: true,
      CONTACT_ID_PRESENT: true,
      CPF_BINDING_MATCH: cpfMatch,
      PHONE_BINDING_MATCH: phoneMatch,
      CASE_IMPORT_BINDING_MATCH: caseImportMatch,
      SEMANTIC_NAME_MATCH: semanticMatch,
      PRESENTATION_NAME_MATCH: presentationMatch,
      NORMALIZATION_REQUIRED: normalizationRequired,
      UPDATE_REQUIRED: updateRequired,
      HUBSPOT_WRITE_EXECUTED: false,
      POSTGRES_WRITE_EXECUTED: false,
      UPDATE_ERROR: updateError || "UPDATE_NOT_EXECUTED",
      SAFE_FOR_CONTROLLED_WRITE_PREPARATION: false
    }
  }

  // STEP 5: post-update verification by new read
  let postVerified
  let postReadError = null
  try {
    postVerified = await hubspotAdapters.contacts.verify(contactId, expected, { caseImportId })
  } catch (e) {
    postReadError = String(e && e.message ? e.message : e)
  }

  if (postReadError || !postVerified) {
    return {
      CONTACT_SEARCH_EXECUTED: true,
      CONTACT_CANDIDATES_COUNT: 1,
      UNAMBIGUOUS_CONTACT_FOUND: true,
      CONTACT_ID_PRESENT: true,
      CPF_BINDING_MATCH: cpfMatch,
      PHONE_BINDING_MATCH: phoneMatch,
      CASE_IMPORT_BINDING_MATCH: caseImportMatch,
      SEMANTIC_NAME_MATCH: semanticMatch,
      PRESENTATION_NAME_MATCH: presentationMatch,
      NORMALIZATION_REQUIRED: normalizationRequired,
      UPDATE_REQUIRED: updateRequired,
      HUBSPOT_WRITE_EXECUTED: true,
      POSTGRES_WRITE_EXECUTED: false,
      UPDATE_CALLS: 1,
      POST_UPDATE_READS: 0,
      POST_UPDATE_READ_FAILED: true,
      POST_UPDATE_READ_ERROR: postReadError || "POST_READ_NULL",
      SAFE_FOR_CONTROLLED_WRITE_PREPARATION: false
    }
  }

  const postFirstname = String(postVerified.firstname || "").trim()
  const postCpf = String(postVerified.cpf || "").trim()
  const postPhone = String(postVerified.phone || "").trim()
  const postCaseImportId = String(postVerified.caseImportId || "").trim()
  const postId = String(postVerified.id || "").trim()

  const postContactIdMatch = postId === contactId
  const postCpfUnchanged = postCpf === String(expected.cpf_do_cliente || "").trim()
  const postPhoneUnchanged = postPhone === String(expected.phone || "").trim()
  const postCaseImportIdUnchanged = postCaseImportId === String(caseImportId || "").trim()
  const postPresentationMatch = postFirstname === canonicalFirstName
  const postSemanticMatch = normalizarNomeComparacao(postFirstname) === normalizarNomeComparacao(expectedFirstnameRaw)

  const postVerificationPassed = postContactIdMatch && postCpfUnchanged && postPhoneUnchanged && postCaseImportIdUnchanged && postPresentationMatch && postSemanticMatch

  return {
    CONTACT_SEARCH_EXECUTED: true,
    CONTACT_CANDIDATES_COUNT: 1,
    UNAMBIGUOUS_CONTACT_FOUND: true,
    CONTACT_ID_PRESENT: true,
    CPF_BINDING_MATCH: cpfMatch,
    PHONE_BINDING_MATCH: phoneMatch,
    CASE_IMPORT_BINDING_MATCH: caseImportMatch,
    SEMANTIC_NAME_MATCH: semanticMatch,
    PRESENTATION_NAME_MATCH: presentationMatch,
    NORMALIZATION_REQUIRED: normalizationRequired,
    UPDATE_REQUIRED: updateRequired,
    HUBSPOT_WRITE_EXECUTED: true,
    POSTGRES_WRITE_EXECUTED: false,
    UPDATE_CALLS: 1,
    POST_UPDATE_READS: 1,
    POST_UPDATE_VERIFICATION: {
      contactIdMatch: postContactIdMatch,
      cpfUnchanged: postCpfUnchanged,
      phoneUnchanged: postPhoneUnchanged,
      caseImportIdUnchanged: postCaseImportIdUnchanged,
      presentationMatch: postPresentationMatch,
      semanticMatch: postSemanticMatch
    },
    SAFE_FOR_CONTROLLED_WRITE_PREPARATION: postVerificationPassed
  }
}

// CLI runner (preparation only; real execution must be explicitly confirmed)
if (require.main === module) {
  (async () => {
    try {
      const result = await executeControlledFirstnameUpdate({ env: process.env })
      console.log(JSON.stringify(result, null, 2))
      process.exit(0)
    } catch (e) {
      console.error(JSON.stringify({ ok: false, error: String(e && e.message ? e.message : e) }))
      process.exit(2)
    }
  })()
}

module.exports = { executeControlledFirstnameUpdate }
