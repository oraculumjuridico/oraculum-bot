const axios = require("axios")

function headers(token) {
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }
}

function createHubSpotTaskAdapter({ token = process.env.HUBSPOT_TOKEN, client = axios } = {}) {
  if (!token) throw Object.assign(new Error("HUBSPOT_TOKEN required"), { code: "HUBSPOT_TOKEN_REQUIRED" })
  const requestHeaders = headers(token)
  return {
    async findByMarker(marker) {
      const response = await client.post("https://api.hubapi.com/crm/v3/objects/tasks/search", {
        filterGroups: [{ filters: [{ propertyName: "hs_task_body", operator: "CONTAINS_TOKEN", value: marker }] }],
        properties: ["hs_task_subject", "hs_task_body", "hs_task_status", "hs_timestamp", "hubspot_owner_id"],
        limit: 100
      }, { headers: requestHeaders })
      return response.data?.results || []
    },
    async create(properties) {
      const response = await client.post("https://api.hubapi.com/crm/v3/objects/tasks", { properties }, { headers: requestHeaders })
      return response.data
    },
    async update(id, properties) {
      const response = await client.patch(`https://api.hubapi.com/crm/v3/objects/tasks/${encodeURIComponent(id)}`, { properties }, { headers: requestHeaders })
      return response.data
    },
    async associate(taskId, objectType, objectId) {
      const associationType = objectType === "contacts" ? "task_to_contact" : "task_to_deal"
      await client.put(
        `https://api.hubapi.com/crm/v3/objects/tasks/${encodeURIComponent(taskId)}/associations/${objectType}/${encodeURIComponent(objectId)}/${associationType}`,
        {},
        { headers: requestHeaders }
      )
      return true
    },
    async verify(id, marker, expected = {}) {
      const response = await client.get(
        `https://api.hubapi.com/crm/v3/objects/tasks/${encodeURIComponent(id)}?properties=hs_task_body,hs_task_status,hs_timestamp&associations=contacts,deals`,
        { headers: requestHeaders }
      )
      const record = response.data
      const contacts = (record?.associations?.contacts?.results || []).map(item => String(item.id))
      const deals = (record?.associations?.deals?.results || []).map(item => String(item.id))
      return {
        ok: Boolean(record?.properties?.hs_task_body?.includes(marker)) &&
          (!expected.contactId || contacts.includes(String(expected.contactId))) &&
          (!expected.dealId || deals.includes(String(expected.dealId))),
        record
      }
    }
  }
}

module.exports = { createHubSpotTaskAdapter }
