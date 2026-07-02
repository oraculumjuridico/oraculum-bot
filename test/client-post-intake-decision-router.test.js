const assert = require("node:assert/strict")
const { ROUTES } = require("../src/domain/client/client-intake-decision-router")
const {
  NEXT_ACTIONS,
  ATOMIC_ACTIONS,
  LEGACY_ACTION_BY_ATOMIC_ACTION,
  routeClientPostIntake
} = require("../src/domain/client/client-post-intake-decision-router")

const stages = {
  ACOLHIMENTO_NOME_CONTATO: "acolhimento_nome_contato",
  COLETA_TEL_OUTRO: "coleta_tel_outro",
  ACOLHIMENTO_CONFIRMA_WHATSAPP_OUTRO: "acolhimento_confirma_whatsapp_outro",
  COLETA_TEL_WPP_CONTATO: "coleta_tel_wpp_contato"
}

function decision(route, mode, source = "text", stage = "stage_test") {
  return Object.freeze({
    route,
    data: Object.freeze({ mode, source, stage }),
    handled: true
  })
}

const cases = [
  [decision(ROUTES.NAME, "revalidation"), { text: "revalida_nome_ok" }, ATOMIC_ACTIONS.REVALIDATE_NAME_CONFIRM, NEXT_ACTIONS.REVALIDATE_NAME],
  [decision(ROUTES.NAME, "revalidation"), { text: "Maria Silva" }, ATOMIC_ACTIONS.REVALIDATE_NAME_CORRECT_TEXT, NEXT_ACTIONS.REVALIDATE_NAME],
  [decision(ROUTES.NAME, "revalidation", "audio"), { isAudio: true }, ATOMIC_ACTIONS.REVALIDATE_NAME_AUDIO, NEXT_ACTIONS.REVALIDATE_NAME],
  [decision(ROUTES.CITY, "revalidation"), { text: "revalida_cidade_multipla_1" }, ATOMIC_ACTIONS.REVALIDATE_CITY_SELECT, NEXT_ACTIONS.REVALIDATE_CITY],
  [decision(ROUTES.CITY, "intake"), { text: "Recife" }, ATOMIC_ACTIONS.COLLECT_CITY_TEXT, NEXT_ACTIONS.COLLECT_CITY],
  [decision(ROUTES.CITY, "intake", "audio"), { isAudio: true }, ATOMIC_ACTIONS.COLLECT_CITY_AUDIO, NEXT_ACTIONS.COLLECT_CITY],
  [decision(ROUTES.PHONE, "revalidation"), { text: "revalida_whatsapp_ok" }, ATOMIC_ACTIONS.REVALIDATE_PHONE_CONFIRM, NEXT_ACTIONS.REVALIDATE_PHONE],
  [decision(ROUTES.PHONE, "intake", "audio"), { isAudio: true }, ATOMIC_ACTIONS.COLLECT_PHONE_AUDIO, NEXT_ACTIONS.COLLECT_PHONE],
  [decision(ROUTES.PHONE, "confirmation"), { text: "tel_confirmar" }, ATOMIC_ACTIONS.CONFIRM_PHONE_ACCEPT, NEXT_ACTIONS.CONFIRM_PHONE],
  [decision(ROUTES.PHONE, "confirmation"), { text: "tel_corrigir" }, ATOMIC_ACTIONS.CONFIRM_PHONE_CORRECT, NEXT_ACTIONS.CONFIRM_PHONE],
  [decision(ROUTES.PHONE, "confirmation"), { text: "?" }, ATOMIC_ACTIONS.CONFIRM_PHONE_FALLBACK, NEXT_ACTIONS.CONFIRM_PHONE]
]

for (const [inputDecision, ctx, atomicAction, legacyAction] of cases) {
  const before = JSON.stringify(inputDecision)
  const result = routeClientPostIntake(inputDecision, { ...ctx, stages })
  assert.equal(result.nextAction, atomicAction)
  assert.equal(result.legacyAction, legacyAction)
  assert.equal(JSON.stringify(inputDecision), before)
}

for (const [stage, source, expected] of [
  [stages.ACOLHIMENTO_NOME_CONTATO, "text", ATOMIC_ACTIONS.THIRD_PARTY_CONTACT_NAME_TEXT],
  [stages.ACOLHIMENTO_NOME_CONTATO, "audio", ATOMIC_ACTIONS.THIRD_PARTY_CONTACT_NAME_AUDIO],
  [stages.COLETA_TEL_OUTRO, "text", ATOMIC_ACTIONS.THIRD_PARTY_ATTENDED_NAME_TEXT],
  [stages.COLETA_TEL_OUTRO, "audio", ATOMIC_ACTIONS.THIRD_PARTY_ATTENDED_NAME_AUDIO],
  [stages.COLETA_TEL_WPP_CONTATO, "text", ATOMIC_ACTIONS.THIRD_PARTY_PHONE_TEXT]
]) {
  const result = routeClientPostIntake(
    decision(ROUTES.THIRD_PARTY, undefined, source, stage),
    { stage, stages, isAudio: source === "audio", text: source === "text" ? "entrada" : "" }
  )
  assert.equal(result.nextAction, expected)
  assert.equal(result.legacyAction, NEXT_ACTIONS.PROCESS_THIRD_PARTY)
}

for (const reason of ["excluded_stage", "ambiguous", "invalid_input", "not_applicable"]) {
  assert.deepEqual(
    routeClientPostIntake({ route: ROUTES.FALLBACK, data: { reason }, handled: false }),
    {
      nextAction: ATOMIC_ACTIONS.FALLBACK,
      legacyAction: NEXT_ACTIONS.FALLBACK,
      reason
    }
  )
}

for (const action of Object.values(ATOMIC_ACTIONS)) {
  assert.equal(typeof LEGACY_ACTION_BY_ATOMIC_ACTION[action], "string")
}

console.log("client-post-intake-decision-router.test.js: ok")
