const assert = require("node:assert/strict")
const fs = require("fs")
const path = require("path")
const {
  aplicarHeadersSeguranca,
  criarRateLimiter
} = require("../src/domain/http-security")

function respostaMock() {
  return {
    headers: {},
    statusCode: null,
    payload: null,
    setHeader(nome, valor) {
      this.headers[nome] = valor
    },
    status(code) {
      this.statusCode = code
      return this
    },
    json(payload) {
      this.payload = payload
      return payload
    }
  }
}

{
  const res = respostaMock()
  let nextCalled = false
  aplicarHeadersSeguranca({}, res, () => {
    nextCalled = true
  })
  assert.equal(nextCalled, true)
  assert.equal(res.headers["X-Content-Type-Options"], "nosniff")
  assert.equal(res.headers["X-Frame-Options"], "DENY")
  assert.equal(res.headers["Strict-Transport-Security"], "max-age=31536000; includeSubDomains")
}

{
  const limitar = criarRateLimiter({ limite: 1, janelaMs: 60000, escopo: "teste" })
  const req = { ip: "127.0.0.1" }
  const primeira = respostaMock()
  let executou = 0
  limitar(req, primeira, () => {
    executou += 1
  })
  assert.equal(executou, 1)

  const segunda = respostaMock()
  limitar(req, segunda, () => {
    executou += 1
  })
  assert.equal(executou, 1)
  assert.equal(segunda.statusCode, 429)
  assert.equal(segunda.headers["Retry-After"] !== undefined, true)
}

const server = fs.readFileSync(path.join(__dirname, "..", "server.js"), "utf8")
assert.match(server, /app\.disable\("x-powered-by"\)/)
assert.match(server, /limitarAudios,\s+validarUrlAudioAssinada,\s+express\.static/s)
assert.doesNotMatch(server, /app\.use\("\/audios", express\.static/)

console.log("http-security.test.js: ok")
