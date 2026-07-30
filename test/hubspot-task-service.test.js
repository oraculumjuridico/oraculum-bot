const assert = require("node:assert/strict")
const { createHubSpotTaskService, taskMarker } = require("../src/domain/hubspot-task-service")

const records = []
const associations = []
const adapter = {
  findByMarker: async marker => records.filter(item => item.properties.hs_task_body.includes(marker)),
  create: async properties => {
    const record = { id: String(records.length + 1), properties }
    records.push(record)
    return record
  },
  update: async (id, properties) => {
    const record = records.find(item => item.id === id)
    record.properties = properties
    return record
  },
  associate: async (id, type, objectId) => associations.push(`${id}:${type}:${objectId}`),
  verify: async (id, marker, expected) => ({
    ok: Boolean(records.find(item => item.id === id)?.properties.hs_task_body.includes(marker)) &&
      (!expected.contactId || associations.includes(`${id}:contacts:${expected.contactId}`)) &&
      (!expected.dealId || associations.includes(`${id}:deals:${expected.dealId}`))
  })
}

;(async () => {
  const service = createHubSpotTaskService(adapter)
  const spec = {
    key: "CASE.TEST.001-REVIEW",
    subject: "Revisar documento",
    body: "Revisão humana necessária.",
    dueAt: "2026-08-05T20:00:00.000Z",
    ownerId: "owner-test",
    contactId: "contact-test",
    dealId: "deal-test"
  }
  const first = await service.ensureTask(spec)
  const second = await service.ensureTask({ ...spec, body: "Revisão atualizada." })
  assert.equal(first.action, "created")
  assert.equal(second.action, "updated")
  assert.equal(records.length, 1)
  assert.match(records[0].properties.hs_task_body, new RegExp(taskMarker(spec.key).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")))
  assert.equal(associations.includes("1:contacts:contact-test"), true)
  assert.equal(associations.includes("1:deals:deal-test"), true)
  console.log("hubspot-task-service.test.js: ok")
})().catch(error => { console.error(error); process.exitCode = 1 })
