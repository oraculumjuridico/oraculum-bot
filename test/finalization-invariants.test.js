const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const {
  assertFinalizationInvariants,
  collectFinalizationViolations
} = require("../src/domain/finalization-invariants")
const {
  normalizarNumeroWhatsAppEnvio
} = require("../src/domain/phone-name")

function casoValido(overrides = {}) {
  return {
    nome: "Maria da Silva",
    nomeConfirmado: true,
    whatsappContato: "5581999999999",
    whatsappVerificado: true,
    telefoneEhDoCliente: true,
    atendimentoParaTerceiro: false,
    cidade: "Recife",
    uf: "PE",
    descricao: "Preciso analisar uma situação jurídica.",
    area: "Civil",
    ...overrides
  }
}

function violations(u) {
  return collectFinalizationViolations({
    from: "5581999999999",
    u,
    normalizarNumeroWhatsAppEnvio
  })
}

assert.deepEqual(violations(casoValido()), [])
assert.doesNotThrow(() => assertFinalizationInvariants({
  from: "5581999999999",
  u: casoValido(),
  normalizarNumeroWhatsAppEnvio
}))

assert.deepEqual(
  violations(casoValido({
    atendimentoParaTerceiro: true,
    telefoneEhDoCliente: false,
    whatsappContato: "5581888888888"
  })),
  []
)

for (const [field, changes] of [
  ["nome", { nome: null }],
  ["nome", { nomeConfirmado: false }],
  ["telefone", { whatsappVerificado: false }],
  ["telefone", { whatsappContato: "123" }],
  ["cidade", { cidade: null }],
  ["relato", { descricao: null, _audioCanalTranscricao: null, assuntoResumo: null }],
  ["area", { area: null }],
  ["identidade", { telefoneEhDoCliente: null }],
  ["identidade", { atendimentoParaTerceiro: true, telefoneEhDoCliente: true }],
  ["identidade", { _novoCasoParaTerceiro: true, atendimentoParaTerceiro: false }]
]) {
  assert.ok(violations(casoValido(changes)).includes(field), field)
}

const estadoInvalido = casoValido({
  nome: null,
  cidade: null,
  descricao: null
})
const antes = structuredClone(estadoInvalido)
assert.throws(
  () => assertFinalizationInvariants({
    from: "5581999999999",
    u: estadoInvalido,
    normalizarNumeroWhatsAppEnvio
  }),
  error =>
    error.code === "FINALIZATION_INVARIANTS_VIOLATION" &&
    error.violations.includes("nome") &&
    error.violations.includes("cidade") &&
    error.violations.includes("relato")
)
assert.deepEqual(estadoInvalido, antes)

const server = fs.readFileSync(
  path.join(__dirname, "..", "server.js"),
  "utf8"
)
const inicio = server.indexOf("async function finalizarCadastro")
const telefone = server.indexOf("const telefoneContato", inicio)
const guarda = server.indexOf("assertFinalizationInvariants", inicio)
const primeiroEfeito = server.indexOf("u.numeroCaso =", inicio)
assert.ok(inicio >= 0)
assert.ok(guarda > inicio && guarda < telefone)
assert.ok(guarda < primeiroEfeito)

console.log("finalization-invariants.test.js: ok")
