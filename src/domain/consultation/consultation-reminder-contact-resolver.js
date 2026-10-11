"use strict"

function httpStatus(error) {
  return Number(error?.response?.status || error?.status || error?.code) || null
}

function controlledFailure(httpStatusCode, reasonCode) {
  return {
    ok: false,
    httpStatus: httpStatusCode,
    reasonCode,
    staleContactId: true,
    fallbackByDeal: true,
    resolvedContact: false
  }
}

async function resolveConsultationReminderContact({
  contactId,
  dealId,
  getContact,
  listDealContacts
} = {}) {
  if (typeof getContact !== "function" || typeof listDealContacts !== "function") {
    throw new Error("CONSULTATION_REMINDER_CONTACT_DEPS_MISSING")
  }

  if (!contactId) {
    return {
      ok: true,
      contact: null,
      staleContactId: false,
      fallbackByDeal: false,
      resolvedContact: false
    }
  }

  try {
    return {
      ok: true,
      contact: await getContact(contactId),
      staleContactId: false,
      fallbackByDeal: false,
      resolvedContact: true
    }
  } catch (error) {
    if (httpStatus(error) !== 404) throw error
  }

  if (!dealId) return controlledFailure(404, "stale_contact_deal_missing")

  let associations
  try {
    associations = await listDealContacts(dealId)
  } catch (error) {
    if (httpStatus(error) === 404) return controlledFailure(404, "stale_contact_deal_not_found")
    throw error
  }

  if (!Array.isArray(associations)) {
    return controlledFailure(502, "stale_contact_associations_invalid")
  }

  const associatedContactIds = [...new Set(associations
    .map(item => String(item?.id || "").trim())
    .filter(Boolean))]

  if (associatedContactIds.length === 0) {
    return controlledFailure(404, "stale_contact_deal_without_contact")
  }
  if (associatedContactIds.length !== 1) {
    return controlledFailure(409, "stale_contact_multiple_contacts")
  }

  try {
    return {
      ok: true,
      contact: await getContact(associatedContactIds[0]),
      staleContactId: true,
      fallbackByDeal: true,
      resolvedContact: true,
      reasonCode: "stale_contact_resolved_by_deal"
    }
  } catch (error) {
    if (httpStatus(error) === 404) {
      return controlledFailure(404, "stale_contact_associated_contact_not_found")
    }
    throw error
  }
}

module.exports = { httpStatus, resolveConsultationReminderContact }
