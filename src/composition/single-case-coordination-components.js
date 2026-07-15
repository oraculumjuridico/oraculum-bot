"use strict"

const { createSingleCaseCoordinationRepository } = require("../infrastructure/single-case-coordination-postgres")

function createSingleCaseCoordinationComponents({ pool, clock, ownerId, leaseDurationMs }) {
  if (!pool || typeof clock !== "function") throw new Error("COORDINATION_CONFIGURATION_INVALID")
  return Object.freeze({ coordination: createSingleCaseCoordinationRepository({ pool, now: clock, ownerId, leaseDurationMs }) })
}

module.exports = { createSingleCaseCoordinationComponents }
