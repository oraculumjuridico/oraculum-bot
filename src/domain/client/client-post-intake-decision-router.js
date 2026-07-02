const { ROUTES } = require("./client-intake-decision-router")

const NEXT_ACTIONS = Object.freeze({
  REVALIDATE_NAME: "revalidate_name",
  COLLECT_NAME: "collect_name",
  REVALIDATE_CITY: "revalidate_city",
  COLLECT_CITY: "collect_city",
  REVALIDATE_PHONE: "revalidate_phone",
  COLLECT_PHONE: "collect_phone",
  CONFIRM_PHONE: "confirm_phone",
  PROCESS_THIRD_PARTY: "process_third_party",
  FALLBACK: "fallback"
})

function routeClientPostIntake(decision = {}) {
  const route = decision.route
  const mode = decision.data?.mode
  const actions = new Map([
    [`${ROUTES.NAME}:revalidation`, NEXT_ACTIONS.REVALIDATE_NAME],
    [`${ROUTES.NAME}:intake`, NEXT_ACTIONS.COLLECT_NAME],
    [`${ROUTES.CITY}:revalidation`, NEXT_ACTIONS.REVALIDATE_CITY],
    [`${ROUTES.CITY}:intake`, NEXT_ACTIONS.COLLECT_CITY],
    [`${ROUTES.PHONE}:revalidation`, NEXT_ACTIONS.REVALIDATE_PHONE],
    [`${ROUTES.PHONE}:intake`, NEXT_ACTIONS.COLLECT_PHONE],
    [`${ROUTES.PHONE}:confirmation`, NEXT_ACTIONS.CONFIRM_PHONE]
  ])

  if (route === ROUTES.THIRD_PARTY) {
    return {
      nextAction: NEXT_ACTIONS.PROCESS_THIRD_PARTY,
      reason: "third_party_intake"
    }
  }

  const nextAction = actions.get(`${route}:${mode}`)
  if (nextAction) {
    return {
      nextAction,
      reason: `${route}_${mode}`
    }
  }

  return {
    nextAction: NEXT_ACTIONS.FALLBACK,
    reason: decision.data?.reason || "not_applicable"
  }
}

module.exports = {
  NEXT_ACTIONS,
  routeClientPostIntake
}
