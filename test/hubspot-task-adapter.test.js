const assert = require("node:assert/strict")
const { createHubSpotTaskAdapter } = require("../src/adapters/hubspot-task-adapter")

;(async () => {
  const calls = []
  const client = {
    post: async (url, body) => {
      calls.push({ method: "post", url, body })
      if (url.endsWith("/search")) return { data: { results: [] } }
      return { data: { id: "task-test", properties: body.properties } }
    },
    patch: async (url, body) => { calls.push({ method: "patch", url, body }); return { data: { id: "task-test" } } },
    put: async (url, body) => { calls.push({ method: "put", url, body }); return { data: {} } },
    get: async url => {
      calls.push({ method: "get", url })
      return {
        data: {
          id: "task-test",
          properties: { hs_task_body: "[ORACULUM_TASK_KEY:CASE-REVIEW]" },
          associations: {
            contacts: { results: [{ id: "contact-test" }] },
            deals: { results: [{ id: "deal-test" }] }
          }
        }
      }
    }
  }
  const adapter = createHubSpotTaskAdapter({ token: "test-token", client })
  assert.deepEqual(await adapter.findByMarker("[ORACULUM_TASK_KEY:CASE-REVIEW]"), [])
  const created = await adapter.create({ hs_task_subject: "Teste" })
  assert.equal(created.id, "task-test")
  await adapter.associate("task-test", "contacts", "contact-test")
  await adapter.associate("task-test", "deals", "deal-test")
  const verification = await adapter.verify("task-test", "[ORACULUM_TASK_KEY:CASE-REVIEW]", {
    contactId: "contact-test",
    dealId: "deal-test"
  })
  assert.equal(verification.ok, true)
  assert.equal(calls.some(call => call.url.includes("task_to_contact")), true)
  assert.equal(calls.some(call => call.url.includes("task_to_deal")), true)
  console.log("hubspot-task-adapter.test.js: ok")
})().catch(error => { console.error(error); process.exitCode = 1 })
