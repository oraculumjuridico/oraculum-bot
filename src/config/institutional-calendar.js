"use strict"

const INSTITUTIONAL_CALENDAR_ID = "oraculum.juridico@gmail.com"

function calendarConfigurationError(code) {
  const error = new Error(code)
  error.code = code
  return error
}

function resolveInstitutionalCalendarId(explicitId, { allowDefault = true } = {}) {
  const candidate = String(explicitId || (allowDefault ? INSTITUTIONAL_CALENDAR_ID : "")).trim()
  if (!candidate || candidate === "primary") throw calendarConfigurationError("CALENDAR_ID_REQUIRED")
  return candidate
}

module.exports = {
  INSTITUTIONAL_CALENDAR_ID,
  resolveInstitutionalCalendarId
}
