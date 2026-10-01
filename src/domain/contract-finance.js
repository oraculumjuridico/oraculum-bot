"use strict"

const FINANCE_STATUS = Object.freeze({
  NOT_CONFIGURED: "nao_configurado",
  AWAITING_TRIGGER: "aguardando_gatilho",
  CURRENT: "em_dia",
  OVERDUE: "vencido",
  RENEGOTIATED: "renegociado",
  PAID: "quitado",
  SUSPENDED: "suspenso",
  NOT_APPLICABLE: "nao_se_aplica"
})

const FINANCE_PROPERTIES = Object.freeze([
  "oraculum_finance_applies",
  "oraculum_finance_status",
  "oraculum_finance_agreement_type",
  "oraculum_finance_trigger",
  "oraculum_finance_total_amount",
  "oraculum_finance_installment_amount",
  "oraculum_finance_installments_total",
  "oraculum_finance_installments_paid",
  "oraculum_finance_next_due_date",
  "oraculum_finance_outstanding_amount",
  "oraculum_finance_last_payment_date",
  "oraculum_finance_tracking_since"
])

const STATUS_LABELS = Object.freeze({
  [FINANCE_STATUS.NOT_CONFIGURED]: "Não configurado",
  [FINANCE_STATUS.AWAITING_TRIGGER]: "Aguardando condição do contrato",
  [FINANCE_STATUS.CURRENT]: "Em dia",
  [FINANCE_STATUS.OVERDUE]: "Parcela vencida",
  [FINANCE_STATUS.RENEGOTIATED]: "Renegociado",
  [FINANCE_STATUS.PAID]: "Quitado",
  [FINANCE_STATUS.SUSPENDED]: "Suspenso",
  [FINANCE_STATUS.NOT_APPLICABLE]: "Não se aplica"
})

function clean(value) {
  return value === null || value === undefined ? "" : String(value).trim()
}

function todaySaoPaulo(reference = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit"
  }).formatToParts(reference)
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]))
  return `${values.year}-${values.month}-${values.day}`
}

function integer(value, fallback = 0) {
  const parsed = Number.parseInt(clean(value), 10)
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback
}

function money(value) {
  if (typeof value === "number") return Number.isFinite(value) && value >= 0 ? Math.round(value * 100) : null
  let raw = clean(value).replace(/R\$\s*/gi, "").replace(/\s/g, "")
  if (!raw) return null
  if (raw.includes(",")) raw = raw.replace(/\./g, "").replace(",", ".")
  else if (/^\d{1,3}(\.\d{3})+$/.test(raw)) raw = raw.replace(/\./g, "")
  const parsed = Number(raw)
  return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed * 100) : null
}

function isoDate(value) {
  const raw = clean(value)
  if (!raw) return null
  const br = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  const candidate = br ? `${br[3]}-${br[2]}-${br[1]}` : raw.slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(candidate)) return null
  const parsed = new Date(`${candidate}T12:00:00Z`)
  return Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== candidate ? null : candidate
}

function formatMoney(cents) {
  if (!Number.isInteger(cents) || cents < 0) return "Não informado"
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100)
}

function formatDate(value) {
  const date = isoDate(value)
  if (!date) return "Não informado"
  const [year, month, day] = date.split("-")
  return `${day}/${month}/${year}`
}

function addMonth(value) {
  const date = isoDate(value)
  if (!date) return null
  const [year, month, day] = date.split("-").map(Number)
  const firstNext = new Date(Date.UTC(year, month, 1, 12))
  const lastDay = new Date(Date.UTC(firstNext.getUTCFullYear(), firstNext.getUTCMonth() + 1, 0, 12)).getUTCDate()
  firstNext.setUTCDate(Math.min(day, lastDay))
  return firstNext.toISOString().slice(0, 10)
}

function normalizeFinance(input = {}, today = todaySaoPaulo()) {
  const source = input.properties || input
  const cents = (direct, value) => Number.isInteger(direct) && direct >= 0 ? direct : money(value)
  const appliesRaw = source.oraculum_finance_applies ?? source.applies
  const applies = appliesRaw === true || ["true", "sim", "yes", "1"].includes(clean(appliesRaw).toLowerCase())
  const totalCents = cents(source.totalCents, source.oraculum_finance_total_amount ?? source.totalAmount)
  const installmentCents = cents(source.installmentCents, source.oraculum_finance_installment_amount ?? source.installmentAmount)
  const installmentsTotal = integer(source.oraculum_finance_installments_total ?? source.installmentsTotal)
  const installmentsPaid = Math.min(integer(source.oraculum_finance_installments_paid ?? source.installmentsPaid), installmentsTotal || Number.MAX_SAFE_INTEGER)
  const computedOutstanding = totalCents === null ? null : Math.max(0, totalCents - (installmentCents || 0) * installmentsPaid)
  const suppliedOutstanding = cents(source.outstandingCents, source.oraculum_finance_outstanding_amount ?? source.outstandingAmount)
  const outstandingCents = suppliedOutstanding === null ? computedOutstanding : suppliedOutstanding
  const nextDueDate = isoDate(source.oraculum_finance_next_due_date ?? source.nextDueDate)
  let status = clean(source.oraculum_finance_status ?? source.status) || FINANCE_STATUS.NOT_CONFIGURED
  if (!Object.values(FINANCE_STATUS).includes(status)) status = FINANCE_STATUS.NOT_CONFIGURED
  if (!applies && status !== FINANCE_STATUS.NOT_APPLICABLE) status = FINANCE_STATUS.NOT_CONFIGURED
  if (applies && installmentsTotal > 0 && installmentsPaid >= installmentsTotal) status = FINANCE_STATUS.PAID
  if (applies && outstandingCents === 0 && totalCents !== null) status = FINANCE_STATUS.PAID
  if (applies && nextDueDate && nextDueDate < today && ![FINANCE_STATUS.PAID, FINANCE_STATUS.SUSPENDED, FINANCE_STATUS.AWAITING_TRIGGER].includes(status)) {
    status = FINANCE_STATUS.OVERDUE
  }
  return {
    applies,
    status,
    agreementType: clean(source.oraculum_finance_agreement_type ?? source.agreementType),
    trigger: clean(source.oraculum_finance_trigger ?? source.trigger),
    totalCents,
    installmentCents,
    installmentsTotal,
    installmentsPaid,
    nextDueDate,
    outstandingCents,
    lastPaymentDate: isoDate(source.oraculum_finance_last_payment_date ?? source.lastPaymentDate),
    trackingSince: isoDate(source.oraculum_finance_tracking_since ?? source.trackingSince)
  }
}

function toHubSpotProperties(finance) {
  const state = normalizeFinance(finance)
  const amount = cents => Number.isInteger(cents) ? (cents / 100).toFixed(2) : ""
  return {
    oraculum_finance_applies: state.applies ? "true" : "false",
    oraculum_finance_status: state.status,
    oraculum_finance_agreement_type: state.agreementType,
    oraculum_finance_trigger: state.trigger,
    oraculum_finance_total_amount: amount(state.totalCents),
    oraculum_finance_installment_amount: amount(state.installmentCents),
    oraculum_finance_installments_total: String(state.installmentsTotal || 0),
    oraculum_finance_installments_paid: String(state.installmentsPaid || 0),
    oraculum_finance_next_due_date: state.nextDueDate || "",
    oraculum_finance_outstanding_amount: amount(state.outstandingCents),
    oraculum_finance_last_payment_date: state.lastPaymentDate || "",
    oraculum_finance_tracking_since: state.trackingSince || ""
  }
}

function parsePairs(text) {
  return Object.fromEntries(clean(text).split(/[;\n]+/).map(part => {
    const index = part.indexOf(":")
    return index > 0 ? [part.slice(0, index).trim().toLowerCase(), part.slice(index + 1).trim()] : null
  }).filter(Boolean))
}

function parseAgreementInput(text) {
  const pairs = parsePairs(text)
  const totalCents = money(pairs.total)
  const installmentsTotal = integer(pairs.parcelas)
  const installmentCents = money(pairs.valor || pairs.parcela)
  const nextDueDate = isoDate(pairs.vencimento || pairs.proximo || pairs["próximo"])
  if (totalCents === null || installmentsTotal < 1 || installmentCents === null || !nextDueDate) {
    return { ok: false, error: "FINANCE_AGREEMENT_INPUT_INVALID" }
  }
  return {
    ok: true,
    finance: normalizeFinance({
      applies: true,
      status: pairs.status || FINANCE_STATUS.CURRENT,
      agreementType: pairs.tipo || "parcelado",
      trigger: pairs.gatilho || "conforme contrato administrativo",
      totalAmount: totalCents / 100,
      installmentAmount: installmentCents / 100,
      installmentsTotal,
      installmentsPaid: integer(pairs.pagas),
      nextDueDate,
      trackingSince: isoDate(pairs.inicio || pairs.início) || todaySaoPaulo()
    })
  }
}

function parsePaymentInput(text, fallbackAmountCents, today = todaySaoPaulo()) {
  const pairs = parsePairs(text)
  const amountCents = money(pairs.valor || text) ?? fallbackAmountCents
  const paidAt = pairs.data ? isoDate(pairs.data) : today
  if (!Number.isInteger(amountCents) || amountCents <= 0 || !paidAt) return { ok: false, error: "FINANCE_PAYMENT_INPUT_INVALID" }
  return { ok: true, amountCents, paidAt }
}

function registerPayment(finance, payment) {
  const current = normalizeFinance(finance, payment.paidAt)
  if (!current.applies || current.status === FINANCE_STATUS.PAID) throw Object.assign(new Error("FINANCE_PAYMENT_NOT_ALLOWED"), { code: "FINANCE_PAYMENT_NOT_ALLOWED" })
  const installmentsPaid = current.installmentsPaid + 1
  const outstandingCents = current.outstandingCents === null ? null : Math.max(0, current.outstandingCents - payment.amountCents)
  const paid = (current.installmentsTotal > 0 && installmentsPaid >= current.installmentsTotal) || outstandingCents === 0
  return normalizeFinance({
    ...current,
    status: paid ? FINANCE_STATUS.PAID : FINANCE_STATUS.CURRENT,
    installmentsPaid,
    outstandingCents,
    nextDueDate: paid ? null : addMonth(current.nextDueDate),
    lastPaymentDate: payment.paidAt
  }, payment.paidAt)
}

function financeSummary(finance) {
  const state = normalizeFinance(finance)
  return [
    `Situação: ${STATUS_LABELS[state.status] || state.status}`,
    `Acordo: ${state.agreementType || "Não informado"}`,
    `Gatilho: ${state.trigger || "Não informado"}`,
    `Total: ${formatMoney(state.totalCents)}`,
    `Parcelas: ${state.installmentsPaid}/${state.installmentsTotal || 0}`,
    `Valor da parcela: ${formatMoney(state.installmentCents)}`,
    `Próximo vencimento: ${formatDate(state.nextDueDate)}`,
    `Pagamentos controlados desde: ${formatDate(state.trackingSince)}`,
    `Saldo: ${formatMoney(state.outstandingCents)}`
  ].join("\n")
}

module.exports = {
  FINANCE_STATUS,
  FINANCE_PROPERTIES,
  STATUS_LABELS,
  todaySaoPaulo,
  money,
  isoDate,
  addMonth,
  formatMoney,
  formatDate,
  normalizeFinance,
  toHubSpotProperties,
  parseAgreementInput,
  parsePaymentInput,
  registerPayment,
  financeSummary
}
