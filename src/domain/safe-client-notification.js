const crypto = require("node:crypto")

function insideWindow(lastInboundAt, now = Date.now()) {
  const timestamp = new Date(lastInboundAt || 0).getTime()
  return Number.isFinite(timestamp) && timestamp > 0 && now - timestamp <= 24 * 60 * 60 * 1000
}

function notificationKey(input = {}) {
  return crypto.createHash("sha256").update(JSON.stringify({
    caseNumber: input.caseNumber || "",
    type: input.type || "",
    recipient: input.recipient || "",
    payload: input.payload || {}
  })).digest("hex")
}

async function sendSafeClientNotification(input = {}, deps = {}) {
  if (!input.authorized && !deps.externalNotificationsEnabled) {
    return { sent: false, reason: "external_notification_disabled" }
  }
  const idempotencyKey = input.idempotencyKey || notificationKey(input)
  if (await deps.idempotency?.has?.(idempotencyKey)) return { sent: false, reason: "duplicate", idempotencyKey }

  let channel
  let sent = false
  if (insideWindow(input.lastInboundAt, input.now)) {
    channel = "freeform"
    sent = Boolean(await deps.sendFreeform?.(input.recipient, input.freeformText))
  } else {
    channel = "template"
    const template = input.template
    if (!template?.name || !Array.isArray(input.templateParams)) return { sent: false, reason: "template_required", idempotencyKey }
    if (Number.isInteger(template.expectedParams) && template.expectedParams !== input.templateParams.length) {
      return { sent: false, reason: "template_params_invalid", idempotencyKey }
    }
    sent = Boolean(await deps.sendTemplate?.(input.recipient, template.name, input.templateParams, template.language || "pt_BR"))
  }
  if (!sent) return { sent: false, reason: "transport_failed", channel, idempotencyKey }
  await deps.idempotency?.complete?.(idempotencyKey, { channel })
  await deps.record?.({ ...input, channel, idempotencyKey })
  return { sent: true, channel, idempotencyKey }
}

module.exports = { insideWindow, notificationKey, sendSafeClientNotification }
