"use strict"

const crypto = require("node:crypto")
const { createAuthorizationVerifier } = require("../domain/single-case-apply-contracts")
const { createSingleCaseAuthorizationSigner } = require("../domain/single-case-authorization-signer")
const { createSingleCaseAuthorizationRepository } = require("../infrastructure/single-case-authorization-postgres")

const PUBLIC_PEM = /^-----BEGIN PUBLIC KEY-----\r?\n[\s\S]+\r?\n-----END PUBLIC KEY-----\r?\n?$/
const PRIVATE_PEM = /-----BEGIN (?:ENCRYPTED |RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/
const ITEM_KEYS = Object.freeze(["algorithm", "issuer", "publicKeyPem"])

function trustedPublicKeysFromEnv(env = {}) {
  const encoded = env.SINGLE_CASE_APPLY_TRUSTED_PUBLIC_KEYS_JSON
  if (!encoded) throw new Error("AUTHORIZATION_PUBLIC_KEYS_MISSING")
  let configured
  try { configured = JSON.parse(encoded) } catch { throw new Error("AUTHORIZATION_PUBLIC_KEYS_INVALID") }
  if (!Array.isArray(configured) || configured.length === 0) throw new Error("AUTHORIZATION_PUBLIC_KEYS_INVALID")
  const entries = [], issuers = new Set(), fingerprints = new Set()
  for (const item of configured) {
    if (!item || Object.getPrototypeOf(item) !== Object.prototype || JSON.stringify(Object.keys(item).sort()) !== JSON.stringify([...ITEM_KEYS].sort()) || !/^[A-Za-z0-9._:-]{3,80}$/.test(item.issuer || "") || item.algorithm !== "Ed25519" || typeof item.publicKeyPem !== "string" || !item.publicKeyPem.trim() || PRIVATE_PEM.test(item.publicKeyPem) || !PUBLIC_PEM.test(item.publicKeyPem)) throw new Error("AUTHORIZATION_PUBLIC_KEYS_INVALID")
    let key
    try { key = crypto.createPublicKey({ key: item.publicKeyPem, format: "pem", type: "spki" }) } catch { throw new Error("AUTHORIZATION_PUBLIC_KEYS_INVALID") }
    if (key.type !== "public" || key.asymmetricKeyType !== "ed25519") throw new Error("AUTHORIZATION_PUBLIC_KEYS_INVALID")
    const fingerprint = crypto.createHash("sha256").update(key.export({ type: "spki", format: "der" })).digest("hex")
    if (issuers.has(item.issuer) || fingerprints.has(fingerprint)) throw new Error("AUTHORIZATION_PUBLIC_KEYS_DUPLICATE")
    issuers.add(item.issuer); fingerprints.add(fingerprint); entries.push([item.issuer, key])
  }
  return Object.freeze(Object.fromEntries(entries.sort(([a], [b]) => a.localeCompare(b))))
}

function createSingleCaseAuthorizationComponents({ pool, env }) {
  const trustedIssuers = trustedPublicKeysFromEnv(env)
  return Object.freeze({ authorizationRepository: createSingleCaseAuthorizationRepository({ pool }), authorizationVerifier: createAuthorizationVerifier({ trustedIssuers }), createAuthorizationSigner: dependencies => createSingleCaseAuthorizationSigner(dependencies) })
}

module.exports = { PUBLIC_PEM, PRIVATE_PEM, ITEM_KEYS, trustedPublicKeysFromEnv, createSingleCaseAuthorizationComponents }
