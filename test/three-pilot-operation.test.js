"use strict"

const assert = require("node:assert/strict")
const { orderedPilots, APPLY_CONFIRMATION } = require("../scripts/apply-three-pilot-cases")

const selection = [{ importId: "p2" }, { importId: "p1-existing" }, { importId: "p3" }]
assert.deepEqual(orderedPilots(selection).map(item => item.importId), ["p1-existing", "p2", "p3"])
assert.equal(APPLY_CONFIRMATION, "APPLY_THREE_PILOTS_IDEMPOTENTLY")
console.log("three-pilot-operation.test.js ok")
