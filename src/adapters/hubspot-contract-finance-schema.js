"use strict"

const axios = require("axios")

const GROUP = "oraculum_financeiro"
const CONTRACT_FINANCE_PROPERTY_DEFINITIONS = Object.freeze([
  { name: "oraculum_finance_applies", label: "Cobrança contratual aplicável", type: "bool", fieldType: "booleancheckbox" },
  {
    name: "oraculum_finance_status", label: "Situação financeira", type: "enumeration", fieldType: "select",
    options: [
      ["nao_configurado", "Não configurado"], ["aguardando_gatilho", "Aguardando condição do contrato"],
      ["em_dia", "Em dia"], ["vencido", "Parcela vencida"], ["renegociado", "Renegociado"],
      ["quitado", "Quitado"], ["suspenso", "Suspenso"], ["nao_se_aplica", "Não se aplica"]
    ].map(([value, label], displayOrder) => ({ value, label, displayOrder, hidden: false }))
  },
  {
    name: "oraculum_finance_agreement_type", label: "Tipo de acordo financeiro", type: "enumeration", fieldType: "select",
    options: [
      ["parcelado", "Parcelado"], ["a_vista", "À vista"], ["percentual", "Percentual"],
      ["entrada_e_parcelas", "Entrada e parcelas"], ["outro", "Outro"]
    ].map(([value, label], displayOrder) => ({ value, label, displayOrder, hidden: false }))
  },
  { name: "oraculum_finance_trigger", label: "Condição de início da cobrança", type: "string", fieldType: "textarea" },
  { name: "oraculum_finance_total_amount", label: "Valor total contratado", type: "number", fieldType: "number" },
  { name: "oraculum_finance_installment_amount", label: "Valor da parcela", type: "number", fieldType: "number" },
  { name: "oraculum_finance_installments_total", label: "Quantidade de parcelas", type: "number", fieldType: "number" },
  { name: "oraculum_finance_installments_paid", label: "Parcelas pagas", type: "number", fieldType: "number" },
  { name: "oraculum_finance_next_due_date", label: "Próximo vencimento", type: "date", fieldType: "date" },
  { name: "oraculum_finance_outstanding_amount", label: "Saldo a receber", type: "number", fieldType: "number" },
  { name: "oraculum_finance_last_payment_date", label: "Último pagamento", type: "date", fieldType: "date" },
  { name: "oraculum_finance_tracking_since", label: "Controlar pagamentos a partir de", type: "date", fieldType: "date" }
])

async function ensureContractFinanceProperties({ token = process.env.HUBSPOT_TOKEN, client = axios } = {}) {
  if (!token) throw Object.assign(new Error("HUBSPOT_TOKEN_REQUIRED"), { code: "HUBSPOT_TOKEN_REQUIRED" })
  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }
  const groupsResponse = await client.get("https://api.hubapi.com/crm/v3/properties/deals/groups", { headers })
  const groups = new Set((groupsResponse.data?.results || []).map(item => item.name))
  if (!groups.has(GROUP)) {
    await client.post("https://api.hubapi.com/crm/v3/properties/deals/groups", {
      name: GROUP,
      label: "Controle financeiro",
      displayOrder: -1
    }, { headers })
  }
  const response = await client.get("https://api.hubapi.com/crm/v3/properties/deals", { headers })
  const existing = new Set((response.data?.results || []).map(item => item.name))
  const result = []
  for (const definition of CONTRACT_FINANCE_PROPERTY_DEFINITIONS) {
    if (existing.has(definition.name)) {
      result.push({ name: definition.name, action: "preserved" })
      continue
    }
    await client.post("https://api.hubapi.com/crm/v3/properties/deals", {
      groupName: GROUP,
      hidden: false,
      formField: false,
      description: "Controle interno Oráculum. Não altera a etapa jurídica do caso.",
      ...definition
    }, { headers })
    result.push({ name: definition.name, action: "created" })
  }
  return { ok: true, result }
}

module.exports = { CONTRACT_FINANCE_PROPERTY_DEFINITIONS, ensureContractFinanceProperties }
