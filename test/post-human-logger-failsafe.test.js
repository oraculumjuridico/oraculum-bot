"use strict"
const assert = require("node:assert/strict")
const { createPostHumanDispatcher, recoverPostHumanCycles } = require("../src/domain/post-human-dispatcher")
;(async () => {
  const logger = () => { throw new Error("logger failure") }
  const dispatcher = createPostHumanDispatcher({
    isEnabled: () => true, repository: {},
    responseHandler: async () => { throw new Error("cpf 123.456.789-00") }, safeLogger: logger
  })
  const result = await dispatcher({ from: "5511999999999" })
  assert.equal(result.handled, false); assert.equal(result.reason, "safe_failure")
  const processed = []
  const recovery = await recoverPostHumanCycles({
    isEnabled: () => true,
    repository: { initialize: async () => {}, listRecoverable: async () => [
      { cycleId: "1", numeroCaso: "A", status: "pending" },
      { cycleId: "2", numeroCaso: "A", status: "analyzing" }
    ] },
    isCaseAllowed: () => true, findUser: async cycle => ({ id: cycle.cycleId }),
    processCycle: async cycle => { processed.push(cycle.cycleId); if (cycle.cycleId === "1") throw new Error("failed") },
    safeLogger: logger
  })
  assert.deepEqual(processed, ["1", "2"])
  assert.deepEqual(recovery, { initialized: true, recovered: 1, failed: 1 })
  console.log("RESULT 2/2 logger fail-safe passed")
})().catch(error => { console.error(error); process.exitCode = 1 })
