"use strict"

const { ASSOCIATION, createHubSpotHttpClient } = require("../adapters/hubspot-http-client")
const { createHubSpotSingleCaseAdapters } = require("../adapters/hubspot-single-case-adapter")
const { REQUIRED_METHODS } = require("../domain/single-case-apply")
const { createSingleCaseAuthorizationComponents } = require("./single-case-authorization-components")
const { createSingleCaseCoordinationComponents } = require("./single-case-coordination-components")
const { createSingleCaseExecutorComposition } = require("./single-case-executor-composition")

const DEFAULT_OWNER_ID = "single-case-real-composition"
const DEFAULT_TIMEOUT_MS = 30000
const DEFAULT_LEASE_DURATION_MS = 60000

function requiredPort(name, value, methods) {
  if (!value || typeof value !== "object") throw new Error(`${name}_MISSING`)
  for (const method of methods) if (typeof value[method] !== "function") throw new Error(`${name}_METHOD_MISSING:${method}`)
  return value
}

function integerSetting(value, fallback, minimum, maximum, code) {
  if (value === undefined || value === "") return fallback
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) throw new Error(code)
  return parsed
}

function createSingleCaseRealComposition({
  env,
  fetchImpl,
  pool,
  clock,
  drive,
  planLoader,
  contentLoader,
  reservation,
  componentFactories = {}
} = {}) {
  if (!env || typeof env !== "object" || Array.isArray(env)) throw new Error("ENV_MISSING")
  if (typeof env.HUBSPOT_TOKEN !== "string" || !env.HUBSPOT_TOKEN.trim()) throw new Error("HUBSPOT_TOKEN_MISSING")
  if (typeof fetchImpl !== "function") throw new Error("HUBSPOT_FETCH_MISSING")
  if (!pool || typeof pool.query !== "function" || typeof pool.connect !== "function") throw new Error("POOL_MISSING")
  if (typeof clock !== "function") throw new Error("CLOCK_INVALID")
  requiredPort("DRIVE", drive, REQUIRED_METHODS.drive)
  requiredPort("PLAN_LOADER", planLoader, REQUIRED_METHODS.plans)
  requiredPort("CONTENT_LOADER", contentLoader, REQUIRED_METHODS.content)
  requiredPort("RESERVATION", reservation, REQUIRED_METHODS.reservation)

  const factories = {
    authorization: componentFactories.authorization || createSingleCaseAuthorizationComponents,
    coordination: componentFactories.coordination || createSingleCaseCoordinationComponents,
    hubspotClient: componentFactories.hubspotClient || createHubSpotHttpClient,
    hubspotAdapters: componentFactories.hubspotAdapters || createHubSpotSingleCaseAdapters,
    executor: componentFactories.executor || createSingleCaseExecutorComposition
  }
  for (const [name, factory] of Object.entries(factories)) if (typeof factory !== "function") throw new Error(`COMPONENT_FACTORY_INVALID:${name}`)

  const timeoutMs = integerSetting(env.SINGLE_CASE_HUBSPOT_TIMEOUT_MS, DEFAULT_TIMEOUT_MS, 1, 300000, "HUBSPOT_TIMEOUT_INVALID")
  const leaseDurationMs = integerSetting(env.SINGLE_CASE_LEASE_DURATION_MS, DEFAULT_LEASE_DURATION_MS, 1000, 3600000, "LEASE_DURATION_INVALID")
  const ownerId = typeof env.SINGLE_CASE_OWNER_ID === "string" && env.SINGLE_CASE_OWNER_ID.trim() ? env.SINGLE_CASE_OWNER_ID.trim() : DEFAULT_OWNER_ID

  const authorization = factories.authorization({ pool, env })
  requiredPort("AUTHORIZATIONS", authorization?.authorizationRepository, REQUIRED_METHODS.authorizations)
  if (!authorization?.authorizationVerifier || typeof authorization.authorizationVerifier.verify !== "function") throw new Error("AUTHORIZATION_VERIFIER_MISSING")
  const coordinationComponents = factories.coordination({ pool, clock, ownerId, leaseDurationMs })
  requiredPort("COORDINATION", coordinationComponents?.coordination, REQUIRED_METHODS.coordination)
  const hubspotClient = factories.hubspotClient({ token: env.HUBSPOT_TOKEN, fetch: fetchImpl, clock, timeoutMs })
  const hubspot = factories.hubspotAdapters({ client: hubspotClient, clock, timeoutMs })

  const executor = factories.executor({
    plans: planLoader,
    authorizations: authorization.authorizationRepository,
    coordination: coordinationComponents.coordination,
    reservation,
    hubspot,
    drive,
    content: contentLoader,
    clock,
    authorizationVerifier: authorization.authorizationVerifier
  })
  if (typeof executor !== "function") throw new Error("EXECUTOR_INVALID")

  const adapters = Object.freeze({
    plans: planLoader,
    authorizations: authorization.authorizationRepository,
    coordination: coordinationComponents.coordination,
    reservation,
    hubspot,
    drive,
    content: contentLoader
  })
  const configurationSummary = Object.freeze({
    mode: "REAL_COMPONENTS_CONSTRUCTED_EXECUTION_BLOCKED",
    hubspotTransport: "INJECTED_FETCH",
    postgresPool: "INJECTED_POOL",
    drive: "INJECTED_PORT",
    planLoader: "INJECTED_PORT",
    contentLoader: "INJECTED_PORT",
    authorizationVerifier: "ED25519_TRUSTED_ISSUERS",
    associationDirection: "deals_to_contacts",
    associationTypeName: ASSOCIATION.typeName,
    associationCategory: ASSOCIATION.category,
    associationTypeId: ASSOCIATION.typeId,
    timeoutMs,
    leaseDurationMs
  })

  return Object.freeze({ executor, adapters, configurationSummary })
}

module.exports = { createSingleCaseRealComposition }
