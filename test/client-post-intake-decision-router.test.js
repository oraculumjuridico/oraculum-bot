const assert = require("node:assert/strict")
const { ROUTES } = require("../src/domain/client/client-intake-decision-router")
const {
  NEXT_ACTIONS,
  routeClientPostIntake
} = require("../src/domain/client/client-post-intake-decision-router")

const cases = [
  [ROUTES.NAME, "revalidation", NEXT_ACTIONS.REVALIDATE_NAME],
  [ROUTES.NAME, "intake", NEXT_ACTIONS.COLLECT_NAME],
  [ROUTES.CITY, "revalidation", NEXT_ACTIONS.REVALIDATE_CITY],
  [ROUTES.CITY, "intake", NEXT_ACTIONS.COLLECT_CITY],
  [ROUTES.PHONE, "revalidation", NEXT_ACTIONS.REVALIDATE_PHONE],
  [ROUTES.PHONE, "intake", NEXT_ACTIONS.COLLECT_PHONE],
  [ROUTES.PHONE, "confirmation", NEXT_ACTIONS.CONFIRM_PHONE]
]

for (const [route, mode, expected] of cases) {
  const decision = Object.freeze({
    route,
    data: Object.freeze({ mode, stage: "stage_test" }),
    handled: true
  })
  const before = JSON.stringify(decision)
  const result = routeClientPostIntake(decision)
  assert.equal(result.nextAction, expected)
  assert.equal(result.reason, `${route}_${mode}`)
  assert.equal(JSON.stringify(decision), before)
}

assert.deepEqual(
  routeClientPostIntake({
    route: ROUTES.THIRD_PARTY,
    data: { stage: "acolhimento_nome_contato" },
    handled: true
  }),
  {
    nextAction: NEXT_ACTIONS.PROCESS_THIRD_PARTY,
    reason: "third_party_intake"
  }
)

for (const reason of [
  "excluded_stage",
  "ambiguous",
  "invalid_input",
  "not_applicable"
]) {
  assert.deepEqual(
    routeClientPostIntake({
      route: ROUTES.FALLBACK,
      data: { reason },
      handled: false
    }),
    {
      nextAction: NEXT_ACTIONS.FALLBACK,
      reason
    }
  )
}

assert.deepEqual(routeClientPostIntake(), {
  nextAction: NEXT_ACTIONS.FALLBACK,
  reason: "not_applicable"
})

console.log("client-post-intake-decision-router.test.js: ok")
