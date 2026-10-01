"use strict"

const axios = require("axios")

function normalize(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
}

function writable(definition) {
  return definition?.modificationMetadata?.readOnlyValue !== true && definition?.calculated !== true
}

function findProperty(definitions, names, labels, { writableOnly = false } = {}) {
  const byName = new Set(names.map(normalize))
  const byLabel = new Set(labels.map(normalize))
  const candidates = writableOnly ? definitions.filter(writable) : definitions
  return candidates.find(item => byName.has(normalize(item.name))) ||
    candidates.find(item => byLabel.has(normalize(item.label))) || null
}

function discoverPaymentSchema(definitions = []) {
  const amount = findProperty(definitions,
    ["hs_amount_paid", "hs_amount", "hs_gross_amount"],
    ["Amount paid", "Valor pago", "Gross amount", "Valor bruto"])
  const date = findProperty(definitions,
    ["hs_payment_date", "hs_paid_at"],
    ["Payment date", "Data do pagamento"])
  const status = findProperty(definitions,
    ["hs_status", "hs_payment_status"],
    ["Status", "Situação"])
  const currency = findProperty(definitions,
    ["hs_currency_code"],
    ["Currency code", "Código da moeda"])
  const reference = findProperty(definitions,
    ["hs_reference_number", "hs_external_reference_id"],
    ["Reference number", "Número de referência", "External Reference ID"])
  const method = findProperty(definitions,
    ["hs_external_payment_method", "hs_payment_method"],
    ["External payment method", "Método de pagamento externo", "Payment method"])
  const comment = findProperty(definitions,
    ["hs_internal_comment"],
    ["Internal comment", "Comentário interno"])
  const createAmount = findProperty(definitions,
    ["hs_amount", "hs_gross_amount", "hs_amount_paid"],
    ["Gross amount", "Valor bruto", "Amount paid", "Valor pago"], { writableOnly: true })
  const createDate = findProperty(definitions,
    ["hs_payment_date", "hs_paid_at"],
    ["Payment date", "Data do pagamento"], { writableOnly: true })
  const createStatus = findProperty(definitions,
    ["hs_status", "hs_payment_status"],
    ["Status", "Situação"], { writableOnly: true })
  const createCurrency = findProperty(definitions,
    ["hs_currency_code"],
    ["Currency code", "Código da moeda"], { writableOnly: true })
  if (!amount || !date || !status || !currency) {
    throw Object.assign(new Error("HUBSPOT_PAYMENT_SCHEMA_INCOMPLETE"), { code: "HUBSPOT_PAYMENT_SCHEMA_INCOMPLETE" })
  }
  const paidOption = (status.options || []).find(option =>
    ["paid", "succeeded", "completed", "success", "processado", "pago", "concluido"].some(term =>
      normalize(option.value).includes(term) || normalize(option.label).includes(term)))
  return {
    amount: amount.name,
    date: date.name,
    status: status.name,
    currency: currency.name,
    reference: reference?.name || null,
    method: method?.name || null,
    comment: comment?.name || null,
    createAmount: createAmount?.name || null,
    createDate: createDate?.name || null,
    createStatus: createStatus?.name || null,
    createCurrency: createCurrency?.name || null,
    canCreate: Boolean(createAmount && createDate && createStatus && createCurrency),
    paidStatus: paidOption?.value || "succeeded",
    paidValues: new Set([
      "paid", "succeeded", "completed", "success", "processado", "pago", "concluido",
      ...((status.options || []).filter(option =>
        ["paid", "succeeded", "completed", "success", "processado", "pago", "concluido"].some(term =>
          normalize(option.value).includes(term) || normalize(option.label).includes(term)))
        .map(option => normalize(option.value)))
    ])
  }
}

function cents(value) {
  const parsed = Number(String(value ?? "").replace(",", "."))
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed * 100) : null
}

function isoDate(value) {
  if (!value) return null
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return /^\d{4}-\d{2}-\d{2}$/.test(String(value)) ? String(value) : null
  return parsed.toISOString().slice(0, 10)
}

function mapPayment(record, schema) {
  const props = record?.properties || {}
  return {
    id: String(record?.id || ""),
    amountCents: cents(props[schema.amount]),
    paidAt: isoDate(props[schema.date]),
    status: String(props[schema.status] || ""),
    currency: String(props[schema.currency] || ""),
    reference: schema.reference ? String(props[schema.reference] || "") : "",
    settled: schema.paidValues.has(normalize(props[schema.status]))
  }
}

function createHubSpotCommercePayments({ token = process.env.HUBSPOT_TOKEN, client = axios } = {}) {
  if (!token) throw Object.assign(new Error("HUBSPOT_TOKEN_REQUIRED"), { code: "HUBSPOT_TOKEN_REQUIRED" })
  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }
  let schema = null
  let associationTypeId = null

  async function initialize() {
    const [propertiesResponse, associationsResponse] = await Promise.all([
      client.get("https://api.hubapi.com/crm/v3/properties/commerce_payments", { headers }),
      client.get("https://api.hubapi.com/crm/v3/associations/commerce_payments/deals/types", { headers })
    ])
    schema = discoverPaymentSchema(propertiesResponse.data?.results || [])
    const association = (associationsResponse.data?.results || []).find(item => item.id)
    if (!association?.id) throw Object.assign(new Error("HUBSPOT_PAYMENT_DEAL_ASSOCIATION_MISSING"), { code: "HUBSPOT_PAYMENT_DEAL_ASSOCIATION_MISSING" })
    associationTypeId = Number(association.id)
    return { ok: true, schema: { ...schema, paidValues: [...schema.paidValues] }, associationTypeId }
  }

  async function ensureReady() {
    if (!schema || !associationTypeId) await initialize()
  }

  async function listDealPayments(dealId) {
    await ensureReady()
    const associations = await client.get(
      `https://api.hubapi.com/crm/v3/objects/deals/${encodeURIComponent(dealId)}/associations/commerce_payments?limit=500`,
      { headers }
    )
    const ids = (associations.data?.results || []).map(item => String(item.id || "")).filter(Boolean)
    if (!ids.length) return []
    const response = await client.post("https://api.hubapi.com/crm/v3/objects/commerce_payments/batch/read", {
      properties: [schema.amount, schema.date, schema.status, schema.currency, schema.reference, schema.method, schema.comment].filter(Boolean),
      propertiesWithHistory: [],
      inputs: ids.map(id => ({ id }))
    }, { headers })
    return (response.data?.results || []).map(record => mapPayment(record, schema))
  }

  async function createManualPayment({ dealId, amountCents, paidAt, reference, comment = "Pagamento administrativo registrado pelo Oráculum" }) {
    await ensureReady()
    if (!schema.canCreate) throw Object.assign(new Error("HUBSPOT_PAYMENT_CREATE_UNAVAILABLE"), { code: "HUBSPOT_PAYMENT_CREATE_UNAVAILABLE" })
    const existing = (await listDealPayments(dealId)).find(payment => reference && payment.reference === reference)
    if (existing) return { payment: existing, action: "preserved" }
    const properties = {
      [schema.createAmount]: (Number(amountCents) / 100).toFixed(2),
      [schema.createDate]: `${paidAt}T12:00:00-03:00`,
      [schema.createStatus]: schema.paidStatus,
      [schema.createCurrency]: "BRL"
    }
    if (schema.reference && reference) properties[schema.reference] = reference
    if (schema.method) properties[schema.method] = "other"
    if (schema.comment) properties[schema.comment] = comment
    const response = await client.post("https://api.hubapi.com/crm/v3/objects/commerce_payments", {
      properties,
      associations: [{
        to: { id: String(dealId) },
        types: [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId }]
      }]
    }, { headers })
    const mapped = mapPayment(response.data, schema)
    return {
      payment: {
        ...mapped,
        amountCents: mapped.amountCents || Number(amountCents),
        paidAt: mapped.paidAt || paidAt,
        status: mapped.status || schema.paidStatus,
        currency: mapped.currency || "BRL",
        reference: mapped.reference || reference || "",
        settled: true
      },
      action: "created"
    }
  }

  return Object.freeze({ initialize, listDealPayments, createManualPayment })
}

module.exports = { discoverPaymentSchema, mapPayment, createHubSpotCommercePayments }
