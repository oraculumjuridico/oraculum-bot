const assert = require("node:assert/strict")
const { createCanonicalCasePlan } = require("../src/domain/canonical-case-plan")
const { STEPS, createCanonicalCaseExecutor } = require("../src/domain/canonical-case-executor")

;(async () => {
  const storage = new Map()
  const calls = []
  const adapters = Object.fromEntries(STEPS.map(step => [step, async () => {
    calls.push(step)
    return { verified: true }
  }]))
  const repository = {
    load: async key => storage.get(key) || null,
    save: async (key, value) => storage.set(key, JSON.parse(JSON.stringify(value)))
  }
  const plan = createCanonicalCasePlan({
    identity: { name: "Cliente Teste", phone: "masked" },
    caseNumber: { value: "CASE.TEST.001" }
  })
  const executor = createCanonicalCaseExecutor({ adapters, checkpointRepository: repository })
  const first = await executor.execute(plan)
  assert.equal(first.completed, true)
  assert.deepEqual(calls, STEPS)
  calls.length = 0
  const second = await executor.execute({ ...plan, status: "ready" })
  assert.equal(second.resumed, true)
  assert.deepEqual(calls, [])
  console.log("canonical-case-executor.test.js: ok")
})().catch(error => { console.error(error); process.exitCode = 1 })
