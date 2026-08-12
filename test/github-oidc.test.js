"use strict"

const assert = require("node:assert/strict")
const crypto = require("node:crypto")
const { verifyGitHubActionsOidc, bearerToken, DEFAULT_ISSUER, DEFAULT_AUDIENCE, DEFAULT_REPOSITORY } = require("../src/domain/github-oidc")

const { publicKey, privateKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 })
const jwk = publicKey.export({ format: "jwk" })
jwk.kid = "test-key"
jwk.alg = "RS256"
const now = Date.UTC(2026, 7, 12, 12, 0, 0)

function token(overrides = {}) {
  const header = Buffer.from(JSON.stringify({ alg: "RS256", kid: jwk.kid })).toString("base64url")
  const payload = Buffer.from(JSON.stringify({
    iss: DEFAULT_ISSUER, aud: DEFAULT_AUDIENCE, repository: DEFAULT_REPOSITORY,
    ref: "refs/heads/main", event_name: "schedule", iat: now / 1000 - 10,
    nbf: now / 1000 - 10, exp: now / 1000 + 300, ...overrides
  })).toString("base64url")
  const signature = crypto.sign("RSA-SHA256", Buffer.from(`${header}.${payload}`), privateKey).toString("base64url")
  return `${header}.${payload}.${signature}`
}

;(async () => {
  assert.equal(bearerToken({ authorization: "Bearer abc" }), "abc")
  assert.equal((await verifyGitHubActionsOidc(token(), { keys: [jwk], now })).ok, true)
  assert.equal((await verifyGitHubActionsOidc(token({ repository: "outra/repo" }), { keys: [jwk], now })).reason, "repository_or_ref_not_allowed")
  assert.equal((await verifyGitHubActionsOidc(token({ event_name: "push" }), { keys: [jwk], now })).reason, "event_not_allowed")
  assert.equal((await verifyGitHubActionsOidc(token({ exp: now / 1000 - 1 }), { keys: [jwk], now })).reason, "token_expired_or_not_active")
  console.log("github-oidc.test.js: ok")
})().catch(error => { console.error(error); process.exitCode = 1 })
