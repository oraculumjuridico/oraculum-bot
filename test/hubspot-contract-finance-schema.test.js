const assert = require("node:assert/strict")
const {
  CONTRACT_FINANCE_PROPERTY_DEFINITIONS,
  ensureContractFinanceProperties
} = require("../src/adapters/hubspot-contract-finance-schema")

;(async () => {
  const calls = []
  const existingName = CONTRACT_FINANCE_PROPERTY_DEFINITIONS[0].name
  const client = {
    async get(url) {
      calls.push({ method: "get", url })
      return url.endsWith("/groups")
        ? { data: { results: [] } }
        : { data: { results: [{ name: existingName }] } }
    },
    async post(url, body) {
      calls.push({ method: "post", url, body })
      return { data: { name: body.name } }
    }
  }
  const result = await ensureContractFinanceProperties({ token: "test", client })
  assert.equal(result.ok, true)
  assert.equal(result.result.find(item => item.name === existingName).action, "preserved")
  assert.equal(calls.filter(call => call.method === "post").length, CONTRACT_FINANCE_PROPERTY_DEFINITIONS.length)
  assert.equal(calls.some(call => call.body?.name === "oraculum_financeiro" && call.body?.label === "Controle financeiro"), true)
  assert.equal(calls.some(call => call.body?.name === "oraculum_finance_register_payment"), true)
  assert.equal(calls.filter(call => call.method === "post" && call.body?.name !== "oraculum_financeiro").every(call => call.body.description.includes("Não altera a etapa jurídica")), true)
  console.log("hubspot-contract-finance-schema.test.js: ok")
})().catch(error => { console.error(error); process.exitCode = 1 })
