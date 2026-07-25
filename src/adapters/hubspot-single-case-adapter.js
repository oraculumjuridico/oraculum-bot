"use strict"

const { canonicalize, sha256, contactVerificationHash } = require("../domain/single-case-apply-contracts")
const { validateHubSpotProperties } = require("../domain/hubspot-contract")
const { ASSOCIATION } = require("./hubspot-http-client")

const CONTACT_SEARCH_PROPERTIES = [
  "firstname", "email", "phone", "cpf_do_cliente", "date_of_birth",
  "city", "state", "area_juridica", "beneficio", "beneficio_de_interesse",
  "numero_caso", "numero_do_caso", "origem_lead", "pasta_drive",
  "situacao_caso", "tipo_de_caso", "work_email"
]

const DEAL_SEARCH_PROPERTIES = [
  "dealname", "dealstage", "pipeline", "hubspot_owner_id",
  "description", "area_juridica", "resumo_cliente", "descricao_completa",
  "estado_bot_snapshot", "etapa_do_bot", "tipo_de_caso", "temperatura_lead",
  "hs_priority", "urgencia", "cidade", "pasta_drive", "origem_atendimento",
  "numero_de_caso"
]

function sanitizeError(error) {
  const m = String(error?.message || error || "").toLowerCase()
  if (/timeout/.test(m)) return { code: "TIMEOUT", safe: true }
  if (/not.*found|404/.test(m)) return { code: "NOT_FOUND", safe: true }
  if (/ambiguous|duplicate|multiple/.test(m)) return { code: "AMBIGUOUS", safe: true }
  if (/rate.*limit|429/.test(m)) return { code: "RATE_LIMIT", safe: true }
  if (/unauthorized|401|forbidden|403/.test(m)) return { code: "AUTH_FAILED", safe: true }
  return { code: "EXTERNAL_EFFECT_UNKNOWN", safe: false }
}

function validateContext(context) {
  if (!context || typeof context !== "object") throw new Error("CONTEXT_INVALID")
  if (!context.caseImportId || typeof context.caseImportId !== "string") throw new Error("CONTEXT_CASE_MISSING")
  if (context.deadline && typeof context.deadline === "string") {
    if (new Date(context.deadline) <= new Date()) throw new Error("DEADLINE_EXPIRED")
  }
  // idempotencyKey, leaseId, fencingToken are optional but if present must be strings/numbers
  return true
}

function createHubSpotSingleCaseAdapters({ client, clock, timeoutMs = 30000, retryPolicy = null, hash = sha256 }) {
  if (!client || typeof client !== "object" || !client.contacts || !client.deals || !client.associations) throw new Error("HUBSPOT_CLIENT_INVALID")
  if (typeof clock !== "function") throw new Error("CLOCK_INVALID")
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1) throw new Error("TIMEOUT_INVALID")
  if (typeof hash !== "function") throw new Error("HASH_INVALID")

  const withTimeout = async (promise, label) => {
    try {
      return await Promise.race([
        promise,
        new Promise((_, reject) => setTimeout(() => reject(new Error(`TIMEOUT:${label}`)), timeoutMs))
      ])
    } catch (e) {
      const se = sanitizeError(e)
      if (se.code === "TIMEOUT") throw new Error("HUBSPOT_TIMEOUT")
      // For safe-known conditions, map to controlled results. For others, throw generic.
      throw new Error("HUBSPOT_EXTERNAL_ERROR")
    }
  }

  const validIdRe = /^[A-Za-z0-9][A-Za-z0-9._:-]{2,127}$/

  const contacts = {
    findContactsByCpf: async (cpf) => {
      if (!cpf || typeof cpf !== "string") return []
      try {
        const res = await withTimeout(
          client.contacts.search({ propertyName: "cpf_do_cliente", value: String(cpf).trim(), properties: CONTACT_SEARCH_PROPERTIES, limit: 2 }),
          "findContactsByCpf"
        )
        const results = res?.results || []
        if (!Array.isArray(results)) return []

        // detect additional pages / total indicating ambiguity
        const hasMore = (typeof res.total === 'number' && res.total > results.length) || Boolean(res?.paging?.next)
        if (hasMore) throw new Error('ADAPTER_AMBIGUOUS_RESULT')

        const ids = results.map(r => String(r?.id || ''))
        if (ids.some(id => id.length === 0)) throw new Error('INVALID_RESULT_ID')
        return ids.slice(0, 2).map(id => ({ id }))
      } catch (e) {
        // Preserve internal adapter errors
        if (/ADAPTER_AMBIGUOUS_RESULT|INVALID_RESULT_ID/.test(String(e.message || ''))) throw e
        const se = sanitizeError(e)
        if (se.safe) return []
        throw new Error("HUBSPOT_EXTERNAL_ERROR")
      }
    },

    findContactsByPhone: async (phone) => {
      if (!phone || typeof phone !== "string") return []
      try {
        const res = await withTimeout(
          client.contacts.search({ propertyName: "phone", value: String(phone).trim(), properties: CONTACT_SEARCH_PROPERTIES, limit: 2 }),
          "findContactsByPhone"
        )
        const results = res?.results || []
        if (!Array.isArray(results)) return []

        const hasMore = (typeof res.total === 'number' && res.total > results.length) || Boolean(res?.paging?.next)
        if (hasMore) throw new Error('ADAPTER_AMBIGUOUS_RESULT')

        const ids = results.map(r => String(r?.id || ''))
        if (ids.some(id => id.length === 0)) throw new Error('INVALID_RESULT_ID')
        return ids.slice(0, 2).map(id => ({ id }))
      } catch (e) {
        // Preserve internal adapter errors
        if (/ADAPTER_AMBIGUOUS_RESULT|INVALID_RESULT_ID/.test(String(e.message || ''))) throw e
        const se = sanitizeError(e)
        if (se.safe) return []
        throw new Error("HUBSPOT_EXTERNAL_ERROR")
      }
    },

    create: async ({ properties, context }) => {
      validateContext(context)
      if (!properties || typeof properties !== "object") throw new Error("PROPERTIES_INVALID")
      const validated = validateHubSpotProperties("contacts", properties)
      if (!Object.keys(validated).length) throw new Error("NO_VALID_PROPERTIES")
      try {
        const res = await withTimeout(
          client.contacts.create({ properties: validated }),
          "createContact"
        )
        const id = String(res?.id || "")
        if (!id || !validIdRe.test(id)) throw new Error("INVALID_RESPONSE_ID")
        return { id }
      } catch (e) {
        // If the underlying call timed out, treat as potentially applied (effect unknown)
        if (/TIMEOUT|HUBSPOT_EXTERNAL_EFFECT_UNKNOWN/.test(String(e.message || ''))) throw new Error('HUBSPOT_EXTERNAL_EFFECT_UNKNOWN')
        throw new Error("HUBSPOT_EXTERNAL_ERROR")
      }
    },

    update: async (contactId, payload) => {
      if (!contactId || typeof contactId !== "string") throw new Error("CONTACT_ID_INVALID")
      if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new Error("PAYLOAD_INVALID")
      const properties = payload.properties
      if (!properties || typeof properties !== "object" || Array.isArray(properties)) throw new Error("PROPERTIES_INVALID")
      const keys = Object.keys(properties)
      if (keys.length !== 1) throw new Error("PROPERTIES_COUNT_MUST_BE_ONE")
      if (!Object.hasOwn(properties, "firstname")) throw new Error("PROPERTY_NOT_ALLOWED")
      const firstname = String(properties.firstname || "").trim()
      if (!firstname) throw new Error("FIRSTNAME_EMPTY")
      try {
        await withTimeout(
          client.contacts.update(contactId, { properties: { firstname } }),
          "updateContact"
        )
        return { updated: true }
      } catch (e) {
        if (/TIMEOUT|HUBSPOT_EXTERNAL_EFFECT_UNKNOWN/.test(String(e.message || ''))) throw new Error('HUBSPOT_EXTERNAL_EFFECT_UNKNOWN')
        throw new Error("HUBSPOT_EXTERNAL_ERROR")
      }
    },

    verify: async (contactId, properties, context = {}) => {
      if (!contactId || typeof contactId !== "string") throw new Error("CONTACT_ID_INVALID")
      if (!properties || typeof properties !== "object") throw new Error("PROPERTIES_INVALID")
      try {
        const res = await withTimeout(
          client.contacts.getById(contactId, { properties: CONTACT_SEARCH_PROPERTIES }),
          "verifyContact"
        )
        const props = res?.properties || {}
        const cpf = String(props.cpf_do_cliente || "").trim()
        const phone = String(props.phone || "").trim()
        const firstname = String(props.firstname || "").trim()
        const fieldsHash = contactVerificationHash(properties, props, hash)
        return { verified: true, id: contactId, cpf, phone, firstname, fieldsHash, caseImportId: context?.caseImportId || null }
      } catch (e) {
        throw new Error("HUBSPOT_EXTERNAL_ERROR")
      }
    }
  }

  const deals = {
    findByCaseNumber: async (caseNumber) => {
      if (!caseNumber || typeof caseNumber !== "string") return []
      try {
        const res = await withTimeout(
          client.deals.search({ propertyName: "numero_de_caso", value: String(caseNumber).trim(), properties: DEAL_SEARCH_PROPERTIES, limit: 2 }),
          "findByCaseNumber"
        )
        const results = res?.results || []
        if (!Array.isArray(results)) return []

        const hasMore = (typeof res.total === 'number' && res.total > results.length) || Boolean(res?.paging?.next)
        if (hasMore) throw new Error('ADAPTER_AMBIGUOUS_RESULT')

        const ids = results.map(r => String(r?.id || ''))
        if (ids.some(id => id.length === 0)) throw new Error('INVALID_RESULT_ID')
        return ids.slice(0, 2).map(id => ({ id }))
      } catch (e) {
        // Preserve internal adapter errors
        if (/ADAPTER_AMBIGUOUS_RESULT|INVALID_RESULT_ID/.test(String(e.message || ''))) throw e
        const se = sanitizeError(e)
        if (se.safe) return []
        throw new Error("HUBSPOT_EXTERNAL_ERROR")
      }
    },

    create: async ({ properties, context }) => {
      validateContext(context)
      if (!properties || typeof properties !== "object") throw new Error("PROPERTIES_INVALID")
      const validated = validateHubSpotProperties("deals", properties)
      if (!Object.keys(validated).length) throw new Error("NO_VALID_PROPERTIES")
      try {
        const res = await withTimeout(
          client.deals.create({ properties: validated }),
          "createDeal"
        )
        const id = String(res?.id || "")
        if (!id || !validIdRe.test(id)) throw new Error("INVALID_RESPONSE_ID")
        return { id }
      } catch (e) {
        if (/TIMEOUT|HUBSPOT_EXTERNAL_EFFECT_UNKNOWN/.test(String(e.message || ''))) throw new Error('HUBSPOT_EXTERNAL_EFFECT_UNKNOWN')
        throw new Error("HUBSPOT_EXTERNAL_ERROR")
      }
    },

    verify: async (dealId, properties) => {
      if (!dealId || typeof dealId !== "string") throw new Error("DEAL_ID_INVALID")
      if (!properties || typeof properties !== "object") throw new Error("PROPERTIES_INVALID")
      try {
        const res = await withTimeout(
          client.deals.getById(dealId, { properties: DEAL_SEARCH_PROPERTIES }),
          "verifyDeal"
        )
        const props = res?.properties || {}
        const caseNumber = String(props.numero_de_caso || "").trim()
        const pipeline = String(props.pipeline || "").trim()
        const stage = String(props.dealstage || "").trim()
        const verifiedProperties = Object.fromEntries(
          Object.keys(properties).map(name => [name, props[name] ?? ""])
        )
        const fieldsHash = hash(canonicalize(verifiedProperties))
        return { verified: true, id: dealId, caseNumber, pipeline, stage, fieldsHash }
      } catch (e) {
        throw new Error("HUBSPOT_EXTERNAL_ERROR")
      }
    }
  }

  const associations = {
    find: async (contactId, dealId) => {
      if (!contactId || !dealId) return []
      try {
        const res = await withTimeout(client.associations.findDealContacts(dealId), "findAssociation")
        const results = res?.results || []
        if (!Array.isArray(results)) return []
        const matches = results.filter(r => String(r.toObjectId || r.id) === String(contactId))
        // Return all associations; executor decides on uniqueness
        return matches.map(r => {
          const types = Array.isArray(r.associationTypes) ? r.associationTypes : []
          const exact = types.find(item => item.category === ASSOCIATION.category && item.typeId === ASSOCIATION.typeId)
          if (!exact) throw new Error('ASSOCIATION_TYPE_MISSING')
          return { id: `${contactId}:${dealId}:${ASSOCIATION.typeName}` }
        })
      } catch (e) {
        const se = sanitizeError(e)
        if (se.safe) return []
        if (/ASSOCIATION_TYPE_MISSING/.test(String(e.message || ''))) throw e
        throw new Error("HUBSPOT_EXTERNAL_ERROR")
      }
    },

    create: async ({ contactId, dealId, type, context }) => {
      validateContext(context)
      if (!contactId || !dealId || type !== ASSOCIATION.typeName) throw new Error("ASSOCIATION_PARAMS_INVALID")
      try {
        await withTimeout(
          client.associations.createDealContact({ dealId, contactId, associationCategory: ASSOCIATION.category, associationTypeId: ASSOCIATION.typeId }),
          "createAssociation"
        )
        return { id: `${contactId}:${dealId}:${type}` }
      } catch (e) {
        if (/TIMEOUT|HUBSPOT_EXTERNAL_EFFECT_UNKNOWN/.test(String(e.message || ''))) throw new Error('HUBSPOT_EXTERNAL_EFFECT_UNKNOWN')
        throw new Error("HUBSPOT_EXTERNAL_ERROR")
      }
    },

    verify: async (associationId, contactId, dealId, type) => {
      if (!associationId || !contactId || !dealId || type !== ASSOCIATION.typeName) throw new Error("ASSOCIATION_VERIFY_PARAMS_INVALID")
      try {
        const res = await withTimeout(client.associations.findDealContacts(dealId), "verifyAssociation")
        const results = res?.results || []
        if (!Array.isArray(results)) return { verified: false, id: associationId, contactId, dealId, relation: type }
        // Find matching association by contactId
        const matches = results.filter(r => String(r.toObjectId || r.id) === String(contactId))
        if (matches.length === 0) return { verified: false, id: associationId, contactId, dealId, relation: type }
        // Require exact type match (no fallback)
        const matchWithType = matches.find(r => Array.isArray(r.associationTypes) && r.associationTypes.some(item => item.category === ASSOCIATION.category && item.typeId === ASSOCIATION.typeId))
        const verified = Boolean(matchWithType)
        const actualType = type
        return { verified, id: associationId, contactId, dealId, relation: actualType }
      } catch (e) {
        throw new Error("HUBSPOT_EXTERNAL_ERROR")
      }
    }
  }

  return Object.freeze({ contacts: Object.freeze(contacts), deals: Object.freeze(deals), associations: Object.freeze(associations) })
}

module.exports = { createHubSpotSingleCaseAdapters }
