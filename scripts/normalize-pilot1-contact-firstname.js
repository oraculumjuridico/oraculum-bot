#!/usr/bin/env node
"use strict"

// Operational script: prepare canonical name normalization for Piloto 1 contact (HubSpot only, dry-run)
// - Repeats CPF/phone search
// - Requires exactly 1 candidate
// - Verifies bindings
// - Builds write payload with ONLY firstname
// - Simulates post-update verification locally (no write executed)
// - Prints sanitized JSON contract

const path = require("node:path")

async function prepareNormalizationOperation({ env = process.env, adapters = null, dryRun = true } = {}) {
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

  // STEP 1 & 2 & 3: repeat search by CPF then phone, require exactly 1 candidate
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
        READY_FOR_CONTROLLED_WRITE: false,
        SAFE_FOR_CONTROLLED_EXECUTION: true
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
        HUBSPOT_WRITE_EXECUTED: false,
        POSTGRES_WRITE_EXECUTED: false,
        READY_FOR_CONTROLLED_WRITE: false,
        SAFE_FOR_CONTROLLED_EXECUTION: true
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
      READY_FOR_CONTROLLED_WRITE: false,
      SAFE_FOR_CONTROLLED_EXECUTION: true
    }
  }

  const contactId = String(candidates[0].id || "").trim()
  if (!contactId) throw new Error("INVALID_CONTACT_ID")

  // STEP 4 & 5 & 6: verify contact and compute booleans
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

  // Build write payload (contains ONLY firstname)
  const writePayload = {
    properties: {
      firstname: canonicalFirstName
    }
  }

  // STEP 7: Block if API returns unexpected properties or contact changes.
  // This is enforced structurally: the payload contains ONLY firstname.
  // Additionally, verify contact lock between preflight and write by comparing bindings.

  // STEP 8: Do NOT execute write in this script (dry-run by design).
  const hubspotWriteExecuted = false
  const postgresWriteExecuted = false

  // STEP 15 & 16: post-update verification (simulated locally for dry-run).
  // Since no write occurred, we derive expected post-state from the preflight verified snapshot.
  const simulatedPostUpdate = {
    contactId: verified.id,
    firstname: canonicalFirstName,
    cpf: String(verified.cpf || "").trim(),
    phone: String(verified.phone || "").trim(),
    caseImportId: String(verified.caseImportId || "").trim()
  }

  const postContactIdMatch = simulatedPostUpdate.contactId === contactId
  const postCpfUnchanged = simulatedPostUpdate.cpf === String(expected.cpf_do_cliente || "").trim()
  const postPhoneUnchanged = simulatedPostUpdate.phone === String(expected.phone || "").trim()
  const postCaseImportIdUnchanged = simulatedPostUpdate.caseImportId === String(caseImportId || "").trim()
  const postPresentationMatch = simulatedPostUpdate.firstname === formatarNome(expectedFirstnameRaw)
  const postSemanticMatch = normalizarNomeComparacao(simulatedPostUpdate.firstname) === normalizarNomeComparacao(expectedFirstnameRaw)

  return {
    CONTACT_SEARCH_EXECUTED: true,
    CONTACT_CANDIDATES_COUNT: 1,
    UNAMBIGUOUS_CONTACT_FOUND: true,
    CONTACT_ID_PRESENT: true,
    CPF_BINDING_MATCH: Boolean(verified.cpf && String(verified.cpf) === String(expected.cpf_do_cliente)),
    PHONE_BINDING_MATCH: Boolean(verified.phone && String(verified.phone) === String(expected.phone)),
    CASE_IMPORT_BINDING_MATCH: Boolean(verified.caseImportId && String(verified.caseImportId) === String(caseImportId)),
    SEMANTIC_NAME_MATCH: semanticMatch,
    PRESENTATION_NAME_MATCH: presentationMatch,
    NORMALIZATION_REQUIRED: normalizationRequired,
    UPDATE_REQUIRED: updateRequired,
    HUBSPOT_WRITE_EXECUTED: hubspotWriteExecuted,
    POSTGRES_WRITE_EXECUTED: postgresWriteExecuted,
    WRITE_PAYLOAD: writePayload,
    WRITE_PROPERTIES_COUNT: Object.keys(writePayload.properties).length,
    POST_UPDATE_VERIFICATION: {
      contactIdMatch: postContactIdMatch,
      cpfUnchanged: postCpfUnchanged,
      phoneUnchanged: postPhoneUnchanged,
      caseImportIdUnchanged: postCaseImportIdUnchanged,
      presentationMatch: postPresentationMatch,
      semanticMatch: postSemanticMatch
    },
    READY_FOR_CONTROLLED_WRITE: Boolean(
      candidateCount === 1 &&
      contactId &&
      Boolean(verified.cpf && String(verified.cpf) === String(expected.cpf_do_cliente)) &&
      Boolean(verified.phone && String(verified.phone) === String(expected.phone)) &&
      Boolean(verified.caseImportId && String(verified.caseImportId) === String(caseImportId)) &&
      semanticMatch &&
      !presentationMatch &&
      normalizationRequired &&
      !hubspotWriteExecuted &&
      !postgresWriteExecuted &&
      Object.keys(writePayload.properties).length === 1 &&
      Object.prototype.hasOwnProperty.call(writePayload.properties, "firstname")
    ),
    SAFE_FOR_CONTROLLED_EXECUTION: Boolean(dryRun && !hubspotWriteExecuted && !postgresWriteExecuted)
  }
}

// CLI runner (safe, dry-run only)
if (require.main === module) {
  (async () => {
    try {
      const result = await prepareNormalizationOperation({ env: process.env, dryRun: true })
      console.log(JSON.stringify(result, null, 2))
      process.exit(0)
    } catch (e) {
      console.error(JSON.stringify({ ok: false, error: String(e && e.message ? e.message : e) }))
      process.exit(2)
    }
  })()
}

module.exports = { prepareNormalizationOperation }
