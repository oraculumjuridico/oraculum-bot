const assert = require("node:assert/strict")
const { interpretarResultadoFinalizacaoCanonica } = require("../src/domain/canonical-finalization-outcome")

assert.deepEqual(
  interpretarResultadoFinalizacaoCanonica({ result: { completed: true, planHash: "plan-ok" } }),
  {
    completed: true,
    error: null,
    code: null,
    interruptedStep: null,
    hasPartialWrites: false,
    partialResources: {},
    planHash: "plan-ok",
    fallbackAllowed: false
  }
)

const semEscrita = interpretarResultadoFinalizacaoCanonica({
  result: { error: "hubspot indisponível", code: "CONTACT_FAILED", interruptedStep: "contact" }
})
assert.equal(semEscrita.completed, false)
assert.equal(semEscrita.fallbackAllowed, true)
assert.equal(semEscrita.hasPartialWrites, false)

const parcial = interpretarResultadoFinalizacaoCanonica({
  result: {
    error: "drive indisponível",
    interruptedStep: "drive",
    hasPartialWrites: true,
    partialResources: { contactId: "contact-1", dealId: "deal-1" }
  }
})
assert.equal(parcial.fallbackAllowed, false)
assert.equal(parcial.hasPartialWrites, true)
assert.deepEqual(parcial.partialResources, { contactId: "contact-1", dealId: "deal-1" })

console.log("canonical-finalization-outcome.test.js: ok")
