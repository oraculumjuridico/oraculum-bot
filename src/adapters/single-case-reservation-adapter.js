"use strict"

const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{2,127}$/
const CASE_NUMBER = /^[A-Z]{2,4}\.[0-9]{6}\.[0-9]{3}$/
const fail = code => { throw new Error(code) }

function createSingleCaseReservationAdapter({ repository, expectedCaseNumber } = {}) {
  if (!repository || typeof repository.findByKey !== "function") fail("RESERVATION_REPOSITORY_MISSING")
  if (expectedCaseNumber !== undefined && !CASE_NUMBER.test(expectedCaseNumber)) fail("RESERVATION_CASE_NUMBER_CONFIGURATION_INVALID")
  const read = async (caseImportId, caseNumber) => {
    if (!ID.test(caseImportId || "")) fail("RESERVATION_CASE_INVALID")
    if (!CASE_NUMBER.test(caseNumber || "")) fail("RESERVATION_CASE_NUMBER_INVALID")
    if (expectedCaseNumber !== undefined && caseNumber !== expectedCaseNumber) fail("RESERVATION_CASE_NUMBER_MISMATCH")
    let record
    try { record = await repository.findByKey(`case-import:${caseImportId}`) } catch { fail("RESERVATION_READ_FAILED") }
    if (!record) fail("RESERVATION_NOT_FOUND")
    if (record.reservation_key !== `case-import:${caseImportId}`) fail("RESERVATION_CASE_MISMATCH")
    if (record.case_number !== caseNumber) fail("RESERVATION_CASE_NUMBER_MISMATCH")
    if (record.status !== "reserved") fail("RESERVATION_STATUS_INVALID")
    return record
  }
  return Object.freeze({
    async verify(caseImportId, caseNumber) {
      await read(caseImportId, caseNumber)
      return Object.freeze({ verified: true, caseImportId, caseNumber, evidenceId: `case-import:${caseImportId}` })
    },
    async verifyPvrAdoption(caseImportId, caseNumber) {
      const record = await read(caseImportId, caseNumber)
      return Object.freeze({ reservationKey: record.reservation_key, caseNumber: record.case_number, status: record.status })
    }
  })
}

module.exports = { createSingleCaseReservationAdapter }
