const assert = require("node:assert/strict")
const { sendSafeClientNotification } = require("../src/domain/safe-client-notification")

;(async () => {
  const completed = new Set()
  const calls = []
  const deps = {
    externalNotificationsEnabled: false,
    idempotency: {
      has: async key => completed.has(key),
      complete: async key => completed.add(key)
    },
    sendFreeform: async () => { calls.push("freeform"); return true },
    sendTemplate: async () => { calls.push("template"); return true },
    record: async item => calls.push(`record:${item.channel}`)
  }
  const disabled = await sendSafeClientNotification({ recipient: "masked" }, deps)
  assert.equal(disabled.reason, "external_notification_disabled")

  const freeform = await sendSafeClientNotification({
    authorized: true,
    recipient: "masked",
    caseNumber: "CASE.1",
    type: "docs",
    lastInboundAt: new Date(Date.now() - 60_000).toISOString(),
    freeformText: "Mensagem"
  }, deps)
  assert.equal(freeform.channel, "freeform")

  const template = await sendSafeClientNotification({
    authorized: true,
    recipient: "masked",
    caseNumber: "CASE.2",
    type: "reminder",
    lastInboundAt: "2020-01-01T00:00:00.000Z",
    template: { name: "approved_template", expectedParams: 1 },
    templateParams: ["Cliente"]
  }, deps)
  assert.equal(template.channel, "template")
  assert.deepEqual(calls.filter(item => ["freeform", "template"].includes(item)), ["freeform", "template"])
  console.log("safe-client-notification.test.js: ok")
})().catch(error => { console.error(error); process.exitCode = 1 })
