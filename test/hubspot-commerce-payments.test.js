"use strict"

const assert = require("node:assert/strict")
const { discoverPaymentSchema, mapPayment, createHubSpotCommercePayments } = require("../src/adapters/hubspot-commerce-payments")

const definitions = [
  { name: "hs_amount_paid", label: "Amount paid", options: [] },
  { name: "hs_payment_date", label: "Payment date", options: [] },
  { name: "hs_status", label: "Status", options: [{ value: "succeeded", label: "Paid" }] },
  { name: "hs_currency_code", label: "Currency code", options: [] },
  { name: "hs_reference_number", label: "Reference number", options: [] },
  { name: "hs_external_payment_method", label: "External payment method", options: [] },
  { name: "hs_internal_comment", label: "Internal comment", options: [] }
]

const schema = discoverPaymentSchema(definitions)
assert.equal(schema.amount, "hs_amount_paid")
assert.equal(schema.paidStatus, "succeeded")
assert.equal(schema.canCreate, true)
assert.equal(discoverPaymentSchema(definitions.map(item => ({
  ...item,
  modificationMetadata: { readOnlyValue: true }
}))).canCreate, false)
assert.equal(mapPayment({ id: "p1", properties: {
  hs_amount_paid: "500.00", hs_payment_date: "2026-09-23T12:00:00Z",
  hs_status: "succeeded", hs_currency_code: "BRL", hs_reference_number: "REF"
} }, schema).settled, true)

;(async () => {
  const calls = []
  const paymentRecord = {
    id: "p1",
    properties: {
      hs_amount_paid: "500.00", hs_payment_date: "2026-09-23T12:00:00Z",
      hs_status: "succeeded", hs_currency_code: "BRL", hs_reference_number: "REF"
    }
  }
  const client = {
    async get(url) {
      calls.push({ method: "get", url })
      if (url.includes("/properties/commerce_payments")) return { data: { results: definitions } }
      if (url.includes("/associations/commerce_payments/deals/types")) return { data: { results: [{ id: "392", name: "commerce_payment_to_deal" }] } }
      if (url.includes("/objects/deals/")) return { data: { results: [] } }
      throw new Error(`unexpected get ${url}`)
    },
    async post(url, body) {
      calls.push({ method: "post", url, body })
      if (url.endsWith("/commerce_payments/batch/read")) return { data: { results: [paymentRecord] } }
      if (url.endsWith("/commerce_payments")) return { data: paymentRecord }
      throw new Error(`unexpected post ${url}`)
    }
  }
  const adapter = createHubSpotCommercePayments({ token: "test", client })
  await adapter.initialize()
  const created = await adapter.createManualPayment({ dealId: "d1", amountCents: 50000, paidAt: "2026-09-23", reference: "REF" })
  assert.equal(created.action, "created")
  const creation = calls.find(call => call.method === "post" && call.url.endsWith("/commerce_payments"))
  assert.equal(creation.body.properties.hs_amount_paid, "500.00")
  assert.equal(creation.body.associations[0].to.id, "d1")
  assert.equal(creation.body.associations[0].types[0].associationTypeId, 392)
  console.log("hubspot-commerce-payments.test.js: ok")
})().catch(error => { console.error(error); process.exitCode = 1 })
