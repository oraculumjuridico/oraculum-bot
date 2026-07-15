"use strict"

const crypto = require("node:crypto")
const { validateFormat } = require("./case-number")

const PENDING_NUMBER = "PENDING_RESERVATION"
const RESERVATION_DEPENDENCY = "CASE_NUMBER_RESERVATION"
const SOURCE_KIND = "OFFICIAL_POSTGRES_RESERVATION"

function fingerprint(value) {
  return crypto.createHash("sha256").update(String(value)).digest("hex").slice(0, 12)
}

function validatePlanForCaseNumberSync(plan) {
  const errors = []
  if (!plan || typeof plan !== "object" || Array.isArray(plan)) errors.push("PLAN_INVALID")
  if (typeof plan?.caseImportId !== "string" || !plan.caseImportId.trim()) errors.push("CASE_IMPORT_ID_MISSING")
  if (!plan?.dealPlan || typeof plan.dealPlan !== "object" || Array.isArray(plan.dealPlan)) errors.push("DEAL_PLAN_MISSING")
  if (!Array.isArray(plan?.pendingDependencies)) errors.push("PENDING_DEPENDENCIES_INVALID")
  if (plan?.safeToPlanHubSpot !== true) errors.push("PLAN_NOT_SAFE_TO_PLAN")
  if (plan?.safeToApply !== false) errors.push("SAFE_TO_APPLY_MUST_REMAIN_FALSE")
  const number = plan?.dealPlan?.caseNumber
  if (number !== PENDING_NUMBER && !validateFormat(number)) errors.push("PLAN_CASE_NUMBER_INVALID")
  if (Array.isArray(plan?.pendingDependencies)) {
    const reservationDependencies = plan.pendingDependencies.filter(item => item === RESERVATION_DEPENDENCY).length
    if (number === PENDING_NUMBER && reservationDependencies !== 1) errors.push("RESERVATION_DEPENDENCY_INCONSISTENT")
    if (number !== PENDING_NUMBER && reservationDependencies > 0) errors.push("RESERVATION_DEPENDENCY_INCONSISTENT")
  }
  return { valid: errors.length === 0, errors }
}

function validateReservationForPlan({ plan, reservation, source }) {
  const errors = []
  const expectedKey = `case-import:${plan.caseImportId}`
  if (!reservation || typeof reservation !== "object") errors.push("RESERVATION_MISSING")
  if (reservation?.reservation_key !== expectedKey) errors.push("RESERVATION_KEY_MISMATCH")
  if (!validateFormat(reservation?.case_number)) errors.push("RESERVATION_NUMBER_INVALID")
  if (reservation?.status !== undefined && reservation.status !== "reserved") errors.push("RESERVATION_STATUS_INVALID")
  const plannedArea = plan?.dealPlan?.properties?.area_juridica
  if (plannedArea && reservation?.area !== plannedArea) errors.push("RESERVATION_AREA_MISMATCH")
  if (!source || source.kind !== SOURCE_KIND || source.verified !== true || !/^\d{4}-\d{2}-\d{2}T/.test(source.verifiedAt || "")) errors.push("RESERVATION_SOURCE_INVALID")
  return { valid: errors.length === 0, errors }
}

function applyCaseNumberReservationToPlan({ plan, reservation, source }) {
  const planValidation = validatePlanForCaseNumberSync(plan)
  if (!planValidation.valid) throw new Error(`CASE_NUMBER_PLAN_INVALID:${planValidation.errors.join(",")}`)
  const reservationValidation = validateReservationForPlan({ plan, reservation, source })
  if (!reservationValidation.valid) throw new Error(`CASE_NUMBER_RESERVATION_INVALID:${reservationValidation.errors.join(",")}`)
  const current = plan.dealPlan.caseNumber
  if (current !== PENDING_NUMBER && current !== reservation.case_number) throw new Error("PLAN_CASE_NUMBER_CONFLICT")

  const dependencies = plan.pendingDependencies.filter(item => item !== RESERVATION_DEPENDENCY)
  const keyFingerprint = fingerprint(reservation.reservation_key)
  const prior = plan.caseNumberReservationSync
  if (current === reservation.case_number && !plan.pendingDependencies.includes(RESERVATION_DEPENDENCY) && prior?.reservationKeyFingerprint === keyFingerprint) {
    return { plan, changed: false, reused: true }
  }

  const updated = structuredClone(plan)
  updated.dealPlan.caseNumber = reservation.case_number
  updated.dealPlan.properties = { ...(updated.dealPlan.properties || {}), numero_de_caso: reservation.case_number }
  updated.pendingDependencies = dependencies
  updated.safeToApply = false
  updated.caseNumberReservationSync = {
    status: "SYNCHRONIZED",
    source: SOURCE_KIND,
    reservationKeyFingerprint: keyFingerprint,
    synchronizedAt: source.verifiedAt
  }
  return { plan: updated, changed: true, reused: false }
}

module.exports = {
  PENDING_NUMBER,
  RESERVATION_DEPENDENCY,
  SOURCE_KIND,
  fingerprint,
  validatePlanForCaseNumberSync,
  validateReservationForPlan,
  applyCaseNumberReservationToPlan
}
