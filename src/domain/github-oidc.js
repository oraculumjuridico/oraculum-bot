"use strict"

const crypto = require("node:crypto")

const DEFAULT_ISSUER = "https://token.actions.githubusercontent.com"
const DEFAULT_AUDIENCE = "oraculum-internal-scheduler"
const DEFAULT_REPOSITORY = "oraculumjuridico/oraculum-bot"
let jwksCache = { expiresAt: 0, keys: [] }

function decodeBase64Url(value) {
  return Buffer.from(String(value || ""), "base64url")
}

function decodeJson(value) {
  return JSON.parse(decodeBase64Url(value).toString("utf8"))
}

async function oidcKeys({ issuer, fetchImpl = fetch, now = Date.now() } = {}) {
  if (jwksCache.expiresAt > now && jwksCache.keys.length) return jwksCache.keys
  const configuration = await fetchImpl(`${issuer}/.well-known/openid-configuration`)
  if (!configuration.ok) throw Object.assign(new Error("oidc_configuration_unavailable"), { code: "OIDC_CONFIGURATION_UNAVAILABLE" })
  const metadata = await configuration.json()
  if (!String(metadata.jwks_uri || "").startsWith(`${issuer}/`)) throw Object.assign(new Error("oidc_jwks_uri_invalid"), { code: "OIDC_JWKS_URI_INVALID" })
  const response = await fetchImpl(metadata.jwks_uri)
  if (!response.ok) throw Object.assign(new Error("oidc_jwks_unavailable"), { code: "OIDC_JWKS_UNAVAILABLE" })
  const body = await response.json()
  jwksCache = { expiresAt: now + 60 * 60 * 1000, keys: Array.isArray(body.keys) ? body.keys : [] }
  return jwksCache.keys
}

function expectedAudience(payload, audience) {
  const aud = Array.isArray(payload.aud) ? payload.aud : [payload.aud]
  return aud.includes(audience)
}

async function verifyGitHubActionsOidc(token, options = {}) {
  const issuer = options.issuer || DEFAULT_ISSUER
  const audience = options.audience || DEFAULT_AUDIENCE
  const repository = String(options.repository || DEFAULT_REPOSITORY).toLowerCase()
  const ref = options.ref || "refs/heads/main"
  const nowSeconds = Math.floor(Number(options.now || Date.now()) / 1000)
  const parts = String(token || "").split(".")
  if (parts.length !== 3) return { ok: false, reason: "token_malformed" }
  let header
  let payload
  try { header = decodeJson(parts[0]); payload = decodeJson(parts[1]) } catch { return { ok: false, reason: "token_malformed" } }
  if (header.alg !== "RS256" || !header.kid) return { ok: false, reason: "algorithm_not_allowed" }
  if (payload.iss !== issuer || !expectedAudience(payload, audience)) return { ok: false, reason: "issuer_or_audience_invalid" }
  if (Number(payload.exp || 0) <= nowSeconds || Number(payload.nbf || 0) > nowSeconds + 30 || Number(payload.iat || 0) > nowSeconds + 30) return { ok: false, reason: "token_expired_or_not_active" }
  if (String(payload.repository || "").toLowerCase() !== repository || payload.ref !== ref) return { ok: false, reason: "repository_or_ref_not_allowed" }
  if (!['schedule', 'workflow_dispatch'].includes(String(payload.event_name || ""))) return { ok: false, reason: "event_not_allowed" }
  try {
    const keys = options.keys || await oidcKeys({ issuer, fetchImpl: options.fetchImpl, now: Number(options.now || Date.now()) })
    const jwk = keys.find(item => item.kid === header.kid && (!item.alg || item.alg === "RS256"))
    if (!jwk) return { ok: false, reason: "signing_key_not_found" }
    const valid = crypto.verify("RSA-SHA256", Buffer.from(`${parts[0]}.${parts[1]}`), crypto.createPublicKey({ key: jwk, format: "jwk" }), decodeBase64Url(parts[2]))
    return valid ? { ok: true, claims: { repository: payload.repository, ref: payload.ref, runId: payload.run_id || null } } : { ok: false, reason: "signature_invalid" }
  } catch {
    return { ok: false, reason: "verification_unavailable" }
  }
}

function bearerToken(headers = {}) {
  const authorization = String(headers.authorization || headers.Authorization || "")
  const match = authorization.match(/^Bearer\s+(.+)$/i)
  return match ? match[1].trim() : ""
}

module.exports = {
  DEFAULT_ISSUER,
  DEFAULT_AUDIENCE,
  DEFAULT_REPOSITORY,
  verifyGitHubActionsOidc,
  bearerToken
}
