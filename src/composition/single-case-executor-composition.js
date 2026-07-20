"use strict"

const { createSingleCaseApplyExecutor, REQUIRED_METHODS } = require("../domain/single-case-apply")
const HASH = /^[a-f0-9]{64}$/

function validateDependency(name, value, expectedMethods) {
  if (!value || typeof value !== "object") throw new Error(`${name}_MISSING`)
  for (const method of expectedMethods) {
    if (typeof value[method] !== "function") throw new Error(`${name}_METHOD_MISSING:${method}`)
  }
}

function createSingleCaseExecutorComposition({
  plans,
  authorizations,
  coordination,
  reservation,
  hubspot,
  drive,
  content,
  clock,
  authorizationVerifier,
  rebindResumeVerifier
}) {
  // Validate all mandatory dependencies (fail-closed)
  if (typeof clock !== "function") throw new Error("CLOCK_INVALID")

  // authorizationVerifier is mandatory; no fallback
  if (!authorizationVerifier || typeof authorizationVerifier !== "object" || typeof authorizationVerifier.verify !== "function") {
    throw new Error("AUTHORIZATION_VERIFIER_MISSING")
  }

  // rebindResumeVerifier is optional; validated when resumeMode="REBIND"
  if (rebindResumeVerifier !== undefined) {
    if (rebindResumeVerifier === null || typeof rebindResumeVerifier.verifyResumeProof !== "function") {
      throw new Error("REBIND_RESUME_VERIFIER_INVALID")
    }
  }

  validateDependency("plans", plans, REQUIRED_METHODS.plans)
  validateDependency("authorizations", authorizations, REQUIRED_METHODS.authorizations)
  validateDependency("coordination", coordination, REQUIRED_METHODS.coordination)
  validateDependency("reservation", reservation, REQUIRED_METHODS.reservation)
  validateDependency("content", content, REQUIRED_METHODS.content)

  // HubSpot adapter (required)
  if (!hubspot || typeof hubspot !== "object") throw new Error("HUBSPOT_ADAPTERS_MISSING")
  validateDependency("hubspot.contacts", hubspot.contacts, REQUIRED_METHODS.contacts)
  validateDependency("hubspot.deals", hubspot.deals, REQUIRED_METHODS.deals)
  validateDependency("hubspot.associations", hubspot.associations, REQUIRED_METHODS.associations)

  // Drive adapter (required; no automatic fallback)
  validateDependency("drive", drive, REQUIRED_METHODS.drive)

  // Build the adapters object for the executor
  const adapters = Object.freeze({
    plans: plans,
    authorizations: authorizations,
    coordination: coordination,
    reservation: reservation,
    contacts: hubspot.contacts,
    deals: hubspot.deals,
    associations: hubspot.associations,
    drive: drive,
    content: content
  })

  // Create and return the executor
  const executor = createSingleCaseApplyExecutor({ authorizationVerifier, rebindResumeVerifier })

  // Return a callable that binds adapters and dependencies
  return Object.freeze(async (args) => {
    if (!args || typeof args !== "object") throw new Error("EXECUTOR_ARGS_INVALID")
    if (!args.caseImportId || typeof args.caseImportId !== "string") throw new Error("CASE_IMPORT_ID_INVALID")
    if (!HASH.test(args.planHash || "")) throw new Error("PLAN_HASH_INVALID")
    if (!HASH.test(args.manifestHash || "")) throw new Error("MANIFEST_HASH_INVALID")
    // resumeMode is optional
    if (args.resumeMode !== undefined && args.resumeMode !== "REBIND") {
      throw new Error("RESUME_MODE_INVALID")
    }
    // Call the executor with bound adapters
    return executor({
      caseImportId: args.caseImportId,
      planHash: args.planHash,
      manifestHash: args.manifestHash,
      resumeMode: args.resumeMode,
      adapters,
      authorizationVerifier,
      now: clock,
      owner: args.owner || "composition-executor"
    })
  })
}

module.exports = { createSingleCaseExecutorComposition }
