const assert = require("node:assert/strict")
const {
  FINANCE_STATUS,
  parseAgreementInput,
  parsePaymentInput,
  registerPayment,
  normalizeFinance,
  toHubSpotProperties,
  addMonth,
  todaySaoPaulo
} = require("../src/domain/contract-finance")

const agreement = parseAgreementInput("total: 6.000,00; parcelas: 12; valor: 500,00; vencimento: 30/09/2026; gatilho: primeiro pagamento")
assert.equal(agreement.ok, true)
assert.equal(agreement.finance.totalCents, 600000)
assert.equal(agreement.finance.installmentsTotal, 12)
assert.equal(agreement.finance.nextDueDate, "2026-09-30")

const payment = parsePaymentInput("valor: 500,00; data: 30/09/2026", agreement.finance.installmentCents)
assert.equal(payment.ok, true)
const afterPayment = registerPayment(agreement.finance, payment)
assert.equal(afterPayment.installmentsPaid, 1)
assert.equal(afterPayment.outstandingCents, 550000)
assert.equal(afterPayment.nextDueDate, "2026-10-30")
assert.equal(afterPayment.status, FINANCE_STATUS.CURRENT)

assert.equal(addMonth("2026-01-31"), "2026-02-28")
assert.equal(todaySaoPaulo(new Date("2026-09-24T01:30:00Z")), "2026-09-23")
assert.equal(normalizeFinance({ applies: true, status: "em_dia", nextDueDate: "01/09/2026" }, "2026-09-23").status, FINANCE_STATUS.OVERDUE)
assert.equal(toHubSpotProperties(afterPayment).oraculum_finance_outstanding_amount, "5500.00")

let current = agreement.finance
for (let index = 0; index < 12; index++) current = registerPayment(current, { amountCents: 50000, paidAt: "2026-09-30" })
assert.equal(current.status, FINANCE_STATUS.PAID)
assert.equal(current.outstandingCents, 0)
assert.equal(current.nextDueDate, null)

assert.equal(parseAgreementInput("total: x; parcelas: 0").ok, false)
assert.equal(parsePaymentInput("valor: x", null).ok, false)
console.log("contract-finance.test.js: ok")
