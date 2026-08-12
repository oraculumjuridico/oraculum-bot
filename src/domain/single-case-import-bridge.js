"use strict"

const { CASE_ID, caseFingerprintFor } = require("./single-case-target")

const PVR_CASE_NUMBER = /^PVR\.\d{6}\.\d{3}$/
const HUBSPOT_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{2,127}$/
const fail = code => { throw new Error(code) }
const clone = value => structuredClone(value)

function inventoryCaseImportId(inventory) {
  if (!inventory || Object.getPrototypeOf(inventory) !== Object.prototype) fail("INVENTORY_INVALID")
  const importId = inventory.importId
  const caseImportId = inventory.caseImportId
  if (importId !== undefined && caseImportId !== undefined && importId !== caseImportId) fail("CASE_IMPORT_ID_DIVERGENT")
  const value = caseImportId === undefined ? importId : caseImportId
  if (typeof value !== "string" || !CASE_ID.test(value) || value.includes("..") || /[\\/]/.test(value)) fail("CASE_IMPORT_ID_INVALID")
  return value
}

function confirmedIdentity(identityConfirmed, caseImportId) {
  if (!identityConfirmed || Object.getPrototypeOf(identityConfirmed) !== Object.prototype || identityConfirmed.schemaVersion !== 1 || identityConfirmed.identityConfirmationApplied !== true || identityConfirmed.safeToPlanHubSpot !== true || identityConfirmed.caseImportId !== caseImportId || !identityConfirmed.reviewedInventory || Object.getPrototypeOf(identityConfirmed.reviewedInventory) !== Object.prototype) fail("IDENTITY_CONFIRMED_INVALID")
  return clone(identityConfirmed)
}

function validPreflight(preflight, caseNumber) {
  if (!preflight || Object.getPrototypeOf(preflight) !== Object.prototype || preflight.ok !== true || preflight.applicable !== true || !Array.isArray(preflight.blockers)) fail("PVR_PREFLIGHT_INVALID")
  if (preflight.blockers.length) fail("PVR_PREFLIGHT_BLOCKERS_REMAIN")
  if (preflight.caseNumber !== undefined && preflight.caseNumber !== caseNumber) fail("PVR_PREFLIGHT_CASE_NUMBER_DIVERGENT")
  if (typeof preflight.contactId !== "string" || !HUBSPOT_ID.test(preflight.contactId)) fail("PVR_PREFLIGHT_CONTACT_ID_MISSING")
  if (typeof preflight.dealId !== "string" || !HUBSPOT_ID.test(preflight.dealId)) fail("PVR_PREFLIGHT_DEAL_ID_MISSING")
  return { contactId: preflight.contactId, dealId: preflight.dealId }
}

// Pure bridge only: it records already-proven external resources, but never authorizes a write.
function createSingleCaseImportBridgeBasePlan({ inventory, identityConfirmed, caseNumber, preflight } = {}) {
  const caseImportId = inventoryCaseImportId(inventory)
  if (!PVR_CASE_NUMBER.test(caseNumber || "")) fail("PVR_CASE_NUMBER_REQUIRED")
  if (inventory.officialNumber !== caseNumber) fail("PVR_INVENTORY_CASE_NUMBER_DIVERGENT")
  const identity = confirmedIdentity(identityConfirmed, caseImportId)
  const resources = validPreflight(preflight, caseNumber)
  const caseFingerprint = caseFingerprintFor(caseImportId)

  return {
    schemaVersion: 1,
    source: "single_case_import_bridge",
    caseImportId,
    caseFingerprint,
    caseNumber,
    officialNumber: caseNumber,
    identityConfirmed: identity,
    contactPlan: {
      existingContactId: resources.contactId,
      reusePolicy: "REQUIRE_EXISTING_UNIQUE"
    },
    dealPlan: {
      existingDealId: resources.dealId,
      caseNumber,
      properties: { numero_de_caso: caseNumber },
      reusePolicy: "REQUIRE_EXISTING_UNIQUE"
    },
    drivePlan: { reusePolicy: "REQUIRE_EXISTING_LOGICAL_ID" },
    existingResourcePolicy: {
      contact: "REQUIRE_EXISTING_UNIQUE",
      deal: "REQUIRE_EXISTING_UNIQUE",
      drive: "REQUIRE_EXISTING_LOGICAL_ID"
    },
    safeToPlanHubSpot: false,
    safeToApply: false,
    pendingDependencies: [
      "OFFICIAL_RESERVATION_SYNCHRONIZATION_REQUIRED",
      "FINAL_SINGLE_CASE_PLAN_AND_CONTENT_MANIFEST_REQUIRED",
      "EXPLICIT_AUTHORIZATIONS_REQUIRED"
    ]
  }
}

function synchronizePvrAdoptionToBasePlan({ basePlan, reservation } = {}) {
  if (!basePlan || Object.getPrototypeOf(basePlan) !== Object.prototype || basePlan.source !== "single_case_import_bridge" || basePlan.safeToApply !== false || !CASE_ID.test(basePlan.caseImportId || "") || !PVR_CASE_NUMBER.test(basePlan.caseNumber || "") || basePlan.officialNumber !== basePlan.caseNumber || basePlan.dealPlan?.caseNumber !== basePlan.caseNumber || basePlan.dealPlan?.properties?.numero_de_caso !== basePlan.caseNumber || !Array.isArray(basePlan.pendingDependencies)) fail("PVR_BASE_PLAN_INVALID")
  const key = `case-import:${basePlan.caseImportId}`
  if (!reservation || Object.getPrototypeOf(reservation) !== Object.prototype || reservation.reservation_key !== key || reservation.case_number !== basePlan.caseNumber || reservation.status !== "reserved") fail("PVR_ADOPTION_RESERVATION_INVALID")
  const prior = basePlan.caseNumberReservationSync
  if (prior?.source === "OFFICIAL_POSTGRES_RESERVATION" && prior?.status === "SYNCHRONIZED" && prior?.reservationKey === key && prior?.caseNumber === basePlan.caseNumber) return { plan: basePlan, changed: false, reused: true }
  const plan = clone(basePlan)
  plan.caseNumberReservationSync = { source: "OFFICIAL_POSTGRES_RESERVATION", status: "SYNCHRONIZED", reservationKey: key, caseNumber: basePlan.caseNumber }
  plan.pendingDependencies = plan.pendingDependencies.filter(item => item !== "OFFICIAL_RESERVATION_SYNCHRONIZATION_REQUIRED")
  plan.safeToApply = false
  return { plan, changed: true, reused: false }
}

module.exports = { createSingleCaseImportBridgeBasePlan, synchronizePvrAdoptionToBasePlan }
