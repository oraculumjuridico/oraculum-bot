"use strict"

const BASE_URL = "https://api.hubapi.com"
const ASSOCIATION = Object.freeze({
  category: "HUBSPOT_DEFINED",
  typeId: 3,
  typeName: "deal_to_contact"
})

function fail(code) {
  throw new Error(code)
}

function createHubSpotHttpClient({ token, fetch: fetchImpl, clock, timeoutMs = 30000 }) {
  if (typeof token !== "string" || !token.trim()) fail("HUBSPOT_TOKEN_MISSING")
  if (typeof fetchImpl !== "function") fail("HUBSPOT_FETCH_MISSING")
  if (typeof clock !== "function") fail("CLOCK_INVALID")
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1) fail("TIMEOUT_INVALID")

  async function request({ method, path, body, write = false }) {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const response = await fetchImpl(`${BASE_URL}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: controller.signal
      })
      if (!response || typeof response.ok !== "boolean" || typeof response.status !== "number") fail("HUBSPOT_RESPONSE_INVALID")
      if (!response.ok) fail(`HUBSPOT_HTTP_${response.status}`)
      if (response.status === 204) return {}
      const value = await response.json()
      if (!value || typeof value !== "object") fail("HUBSPOT_RESPONSE_INVALID")
      return value
    } catch (error) {
      if (error?.name === "AbortError" || /TIMEOUT/i.test(String(error?.message || ""))) {
        fail(write ? "HUBSPOT_EXTERNAL_EFFECT_UNKNOWN" : "HUBSPOT_TIMEOUT")
      }
      if (/^HUBSPOT_(?:HTTP_\d+|RESPONSE_INVALID|EXTERNAL_EFFECT_UNKNOWN)$/.test(String(error?.message || ""))) throw error
      fail(write ? "HUBSPOT_EXTERNAL_EFFECT_UNKNOWN" : "HUBSPOT_HTTP_ERROR")
    } finally {
      clearTimeout(timer)
    }
  }

  const objectPort = objectType => Object.freeze({
    search: ({ propertyName, value, properties, limit }) => request({
      method: "POST",
      path: `/crm/v3/objects/${objectType}/search`,
      body: { filterGroups: [{ filters: [{ propertyName, operator: "EQ", value }] }], properties, limit }
    }),
    create: ({ properties }) => request({ method: "POST", path: `/crm/v3/objects/${objectType}`, body: { properties }, write: true }),
    getById: (id, { properties }) => request({ method: "GET", path: `/crm/v3/objects/${objectType}/${encodeURIComponent(id)}?properties=${encodeURIComponent(properties.join(","))}` })
  })

  const associations = Object.freeze({
    findDealContacts: dealId => request({ method: "GET", path: `/crm/v4/objects/deals/${encodeURIComponent(dealId)}/associations/contacts?limit=100` }),
    createDealContact: ({ dealId, contactId, associationCategory, associationTypeId }) => {
      if (associationCategory !== ASSOCIATION.category || associationTypeId !== ASSOCIATION.typeId) fail("HUBSPOT_ASSOCIATION_CONTRACT_INVALID")
      return request({
        method: "PUT",
        path: `/crm/v4/objects/deals/${encodeURIComponent(dealId)}/associations/contacts/${encodeURIComponent(contactId)}`,
        body: [{ associationCategory, associationTypeId }],
        write: true
      })
    }
  })

  return Object.freeze({ contacts: objectPort("contacts"), deals: objectPort("deals"), associations })
}

module.exports = { ASSOCIATION, createHubSpotHttpClient }
