"use strict"

const assert = require("node:assert/strict")
const {
  initializeContractFinance,
  createContractFinanceRepository
} = require("../src/infrastructure/contract-finance-postgres")

;(async () => {
  const init = []
  await initializeContractFinance({ query: async sql => { init.push(String(sql)); return { rows: [], rowCount: 0 } } })
  assert.equal(init.length, 8)
  assert.match(init.join("\n"), /oraculum_contract_finance_events/)
  assert.match(init.join("\n"), /oraculum_contract_finance_payments/)

  const statements = []
  const client = {
    async query(sql) {
      statements.push(String(sql))
      if (String(sql).startsWith("SELECT snapshot")) return { rows: [] }
      return { rows: [], rowCount: 1 }
    },
    release() { statements.push("RELEASE") }
  }
  const pool = {
    async connect() { return client },
    async query(sql) {
      if (String(sql).startsWith("SELECT deal_id")) return { rows: [] }
      return { rows: [], rowCount: 0 }
    }
  }
  const repository = createContractFinanceRepository({ pool })
  const result = await repository.upsert({
    dealId: "deal-1",
    caseNumber: "PRV.TESTE.001",
    snapshot: { applies: true, status: "em_dia", nextDueDate: "2026-10-10" },
    source: "whatsapp_admin"
  })
  assert.equal(result.changed, true)
  assert.match(statements.join("\n"), /ON CONFLICT\(deal_id\)/)
  assert.match(statements.join("\n"), /oraculum_contract_finance_events/)
  assert.match(statements.join("\n"), /COMMIT/)

  await repository.listDue({ throughDate: "2026-10-10" })
  await repository.listConfigured()
  assert.equal(await repository.getPayment("payment-1"), null)
  await repository.preparePayment({
    paymentId: "payment-1", dealId: "deal-1", amountCents: 50000,
    paidAt: "2026-10-10", status: "succeeded", targetSnapshot: { installmentsPaid: 1 }
  })
  await repository.completePayment("payment-1")
  console.log("contract-finance-postgres.test.js: ok")
})().catch(error => { console.error(error); process.exitCode = 1 })
