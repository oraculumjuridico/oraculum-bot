"use strict"

const crypto = require("node:crypto")
const { AUTHORIZATION_SCHEMA_VERSION, authorizationPayload, validateAuthorizationShape, validateAuthorizationDates } = require("./single-case-apply-contracts")

const fail = code => { throw new Error(code) }

function createSingleCaseAuthorizationSigner({ privateKey, clock } = {}) {
  if (!privateKey) fail("AUTHORIZATION_PRIVATE_KEY_MISSING")
  if (typeof clock !== "function") fail("AUTHORIZATION_CLOCK_MISSING")
  let key
  try { key = privateKey?.type === "private" ? privateKey : crypto.createPrivateKey(privateKey) } catch { fail("AUTHORIZATION_PRIVATE_KEY_INVALID") }
  if (key.type !== "private" || key.asymmetricKeyType !== "ed25519") fail("AUTHORIZATION_PRIVATE_KEY_INVALID")
  return Object.freeze({ sign(input) {
    let record
    try { record = structuredClone(input) } catch { fail("AUTHORIZATION_INPUT_INVALID") }
    if (record?.schemaVersion !== AUTHORIZATION_SCHEMA_VERSION) fail("AUTH_SCHEMA_INVALID")
    const shapeError = validateAuthorizationShape(record)
    if (shapeError) fail(shapeError)
    const dateError = validateAuthorizationDates(record, clock())
    if (dateError) fail(dateError)
    let proof
    try { proof = crypto.sign(null, Buffer.from(authorizationPayload(record)), key).toString("base64") } catch { fail("AUTHORIZATION_SIGN_FAILED") }
    return Object.freeze({ ...record, scope: Object.freeze([...record.scope].sort()), proof, algorithm: "Ed25519" })
  } })
}

module.exports = { createSingleCaseAuthorizationSigner }
