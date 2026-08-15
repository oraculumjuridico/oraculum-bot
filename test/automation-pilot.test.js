"use strict"

const assert = require("node:assert/strict")
const { automationPilotConfig, automationTargetAllowed } = require("../src/domain/automation-pilot")

const env = {
  AUTOMATION_ALLOW_ALL: "false",
  AUTOMATION_PILOT_CASES: "PVR.260801.813",
  AUTOMATION_PILOT_DEAL_IDS: "deal-pilot",
  AUTOMATION_PILOT_PHONES: "+55 (81) 99999-0000"
}

assert.equal(automationTargetAllowed({}, {}), false)
assert.equal(automationTargetAllowed({ numeroCaso: "PVR.260801.813" }, env), true)
assert.equal(automationTargetAllowed({ dealId: "DEAL-PILOT" }, env), true)
assert.equal(automationTargetAllowed({ phone: "5581999990000" }, env), true)
assert.equal(automationTargetAllowed({ phone: "81999990000" }, env), true)
assert.equal(automationTargetAllowed({ phone: "558199990000" }, env), true)
assert.equal(automationTargetAllowed({ numeroCaso: "OUTRO", dealId: "outro", phone: "5581888880000" }, env), false)
assert.equal(automationTargetAllowed({}, { AUTOMATION_ALLOW_ALL: "true" }), true)

const config = automationPilotConfig(env)
assert.equal(config.allowAll, false)
assert.deepEqual([...config.cases], ["PVR.260801.813"])

console.log("automation-pilot.test.js: ok")
