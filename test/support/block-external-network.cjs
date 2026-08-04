const http = require("node:http")
const https = require("node:https")
let attempts = 0
function blocked(...args) {
  const input = args[0]
  const host = typeof input === "string"
    ? (() => { try { return new URL(input).hostname } catch { return "" } })()
    : String(input?.hostname || input?.host || "").split(":")[0]
  if (host === "127.0.0.1" || host === "localhost" || host === "::1") {
    return originalRequest.call(this, ...args)
  }
  attempts += 1
  const error = new Error("EXTERNAL_HTTP_BLOCKED_IN_TEST")
  error.code = "EXTERNAL_HTTP_BLOCKED_IN_TEST"
  throw error
}
const originalRequest = http.request
const originalHttpsRequest = https.request
const originalFetch = global.fetch
http.request = blocked
https.request = function (...args) {
  const input = args[0]
  const host = typeof input === "string" ? (() => { try { return new URL(input).hostname } catch { return "" } })() : String(input?.hostname || input?.host || "").split(":")[0]
  if (host === "127.0.0.1" || host === "localhost" || host === "::1") return originalHttpsRequest.call(this, ...args)
  return blocked(...args)
}
http.get = function (...args) { const req = http.request(...args); req.end(); return req }
https.get = function (...args) { const req = https.request(...args); req.end(); return req }
if (typeof originalFetch === "function") {
  global.fetch = async function (input, init) {
    const url = typeof input === "string" || input instanceof URL ? String(input) : String(input?.url || "")
    const host = (() => { try { return new URL(url).hostname } catch { return "" } })()
    if (host === "127.0.0.1" || host === "localhost" || host === "::1") return originalFetch.call(this, input, init)
    attempts += 1
    const error = new Error("EXTERNAL_HTTP_BLOCKED_IN_TEST")
    error.code = "EXTERNAL_HTTP_BLOCKED_IN_TEST"
    throw error
  }
}
process.on("exit", () => {
  if (attempts) process.stderr.write(`EXTERNAL_HTTP_ATTEMPTS=${attempts}\n`)
})
