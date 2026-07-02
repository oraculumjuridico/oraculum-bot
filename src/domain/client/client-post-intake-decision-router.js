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

const ATOMIC_ACTIONS = Object.freeze({
  REVALIDATE_NAME_CONFIRM: "revalidate_name_confirm",
  REVALIDATE_NAME_CORRECT_TEXT: "revalidate_name_correct_text",
  REVALIDATE_NAME_AUDIO: "revalidate_name_audio",
  REVALIDATE_NAME_WAIT: "revalidate_name_wait",
  COLLECT_NAME_TEXT: "collect_name_text",
  COLLECT_NAME_AUDIO: "collect_name_audio",

  REVALIDATE_CITY_CONFIRM: "revalidate_city_confirm",
  REVALIDATE_CITY_SELECT: "revalidate_city_select",
  REVALIDATE_CITY_CORRECT_TEXT: "revalidate_city_correct_text",
  REVALIDATE_CITY_AUDIO: "revalidate_city_audio",
  REVALIDATE_CITY_WAIT: "revalidate_city_wait",
  COLLECT_CITY_TEXT: "collect_city_text",
  COLLECT_CITY_AUDIO: "collect_city_audio",

  REVALIDATE_PHONE_CONFIRM: "revalidate_phone_confirm",
  REVALIDATE_PHONE_CORRECT_TEXT: "revalidate_phone_correct_text",
  REVALIDATE_PHONE_AUDIO: "revalidate_phone_audio",
  REVALIDATE_PHONE_WAIT: "revalidate_phone_wait",
  COLLECT_PHONE_TEXT: "collect_phone_text",
  COLLECT_PHONE_AUDIO: "collect_phone_audio",
  CONFIRM_PHONE_ACCEPT: "confirm_phone_accept",
  CONFIRM_PHONE_CORRECT: "confirm_phone_correct",
  CONFIRM_PHONE_FALLBACK: "confirm_phone_fallback",

  THIRD_PARTY_CONTACT_NAME_TEXT: "third_party_contact_name_text",
  THIRD_PARTY_CONTACT_NAME_AUDIO: "third_party_contact_name_audio",
  THIRD_PARTY_ATTENDED_NAME_TEXT: "third_party_attended_name_text",
  THIRD_PARTY_ATTENDED_NAME_AUDIO: "third_party_attended_name_audio",
  THIRD_PARTY_PHONE_TEXT: "third_party_phone_text",
  THIRD_PARTY_PHONE_AUDIO: "third_party_phone_audio",
  THIRD_PARTY_INPUT_TEXT: "third_party_input_text",
  THIRD_PARTY_INPUT_AUDIO: "third_party_input_audio",

  START_INTAKE_TEXT: "start_intake_text",
  START_INTAKE_AUDIO: "start_intake_audio",
  SELECT_INTAKE_MODE_TEXT: "select_intake_mode_text",
  SELECT_INTAKE_MODE_AUDIO: "select_intake_mode_audio",
  SELECT_INTAKE_SUBJECT_TEXT: "select_intake_subject_text",
  SELECT_INTAKE_SUBJECT_AUDIO: "select_intake_subject_audio",
  CONFIRM_CONTACT_NAME_TEXT: "confirm_contact_name_text",
  CONFIRM_CONTACT_NAME_AUDIO: "confirm_contact_name_audio",
  CONFIRM_CLIENT_NAME_TEXT: "confirm_client_name_text",
  CONFIRM_CLIENT_NAME_AUDIO: "confirm_client_name_audio",
  CONFIRM_NAME_OWNER_TEXT: "confirm_name_owner_text",
  CONFIRM_NAME_OWNER_AUDIO: "confirm_name_owner_audio",
  CONFIRM_CLIENT_PHONE_TEXT: "confirm_client_phone_text",
  CONFIRM_CLIENT_PHONE_AUDIO: "confirm_client_phone_audio",

  FALLBACK: "fallback"
})

const LEGACY_ACTION_BY_ATOMIC_ACTION = Object.freeze({
  [ATOMIC_ACTIONS.REVALIDATE_NAME_CONFIRM]: NEXT_ACTIONS.REVALIDATE_NAME,
  [ATOMIC_ACTIONS.REVALIDATE_NAME_CORRECT_TEXT]: NEXT_ACTIONS.REVALIDATE_NAME,
  [ATOMIC_ACTIONS.REVALIDATE_NAME_AUDIO]: NEXT_ACTIONS.REVALIDATE_NAME,
  [ATOMIC_ACTIONS.REVALIDATE_NAME_WAIT]: NEXT_ACTIONS.REVALIDATE_NAME,
  [ATOMIC_ACTIONS.COLLECT_NAME_TEXT]: NEXT_ACTIONS.COLLECT_NAME,
  [ATOMIC_ACTIONS.COLLECT_NAME_AUDIO]: NEXT_ACTIONS.COLLECT_NAME,

  [ATOMIC_ACTIONS.REVALIDATE_CITY_CONFIRM]: NEXT_ACTIONS.REVALIDATE_CITY,
  [ATOMIC_ACTIONS.REVALIDATE_CITY_SELECT]: NEXT_ACTIONS.REVALIDATE_CITY,
  [ATOMIC_ACTIONS.REVALIDATE_CITY_CORRECT_TEXT]: NEXT_ACTIONS.REVALIDATE_CITY,
  [ATOMIC_ACTIONS.REVALIDATE_CITY_AUDIO]: NEXT_ACTIONS.REVALIDATE_CITY,
  [ATOMIC_ACTIONS.REVALIDATE_CITY_WAIT]: NEXT_ACTIONS.REVALIDATE_CITY,
  [ATOMIC_ACTIONS.COLLECT_CITY_TEXT]: NEXT_ACTIONS.COLLECT_CITY,
  [ATOMIC_ACTIONS.COLLECT_CITY_AUDIO]: NEXT_ACTIONS.COLLECT_CITY,

  [ATOMIC_ACTIONS.REVALIDATE_PHONE_CONFIRM]: NEXT_ACTIONS.REVALIDATE_PHONE,
  [ATOMIC_ACTIONS.REVALIDATE_PHONE_CORRECT_TEXT]: NEXT_ACTIONS.REVALIDATE_PHONE,
  [ATOMIC_ACTIONS.REVALIDATE_PHONE_AUDIO]: NEXT_ACTIONS.REVALIDATE_PHONE,
  [ATOMIC_ACTIONS.REVALIDATE_PHONE_WAIT]: NEXT_ACTIONS.REVALIDATE_PHONE,
  [ATOMIC_ACTIONS.COLLECT_PHONE_TEXT]: NEXT_ACTIONS.COLLECT_PHONE,
  [ATOMIC_ACTIONS.COLLECT_PHONE_AUDIO]: NEXT_ACTIONS.COLLECT_PHONE,
  [ATOMIC_ACTIONS.CONFIRM_PHONE_ACCEPT]: NEXT_ACTIONS.CONFIRM_PHONE,
  [ATOMIC_ACTIONS.CONFIRM_PHONE_CORRECT]: NEXT_ACTIONS.CONFIRM_PHONE,
  [ATOMIC_ACTIONS.CONFIRM_PHONE_FALLBACK]: NEXT_ACTIONS.CONFIRM_PHONE,

  [ATOMIC_ACTIONS.THIRD_PARTY_CONTACT_NAME_TEXT]: NEXT_ACTIONS.PROCESS_THIRD_PARTY,
  [ATOMIC_ACTIONS.THIRD_PARTY_CONTACT_NAME_AUDIO]: NEXT_ACTIONS.PROCESS_THIRD_PARTY,
  [ATOMIC_ACTIONS.THIRD_PARTY_ATTENDED_NAME_TEXT]: NEXT_ACTIONS.PROCESS_THIRD_PARTY,
  [ATOMIC_ACTIONS.THIRD_PARTY_ATTENDED_NAME_AUDIO]: NEXT_ACTIONS.PROCESS_THIRD_PARTY,
  [ATOMIC_ACTIONS.THIRD_PARTY_PHONE_TEXT]: NEXT_ACTIONS.PROCESS_THIRD_PARTY,
  [ATOMIC_ACTIONS.THIRD_PARTY_PHONE_AUDIO]: NEXT_ACTIONS.PROCESS_THIRD_PARTY,
  [ATOMIC_ACTIONS.THIRD_PARTY_INPUT_TEXT]: NEXT_ACTIONS.PROCESS_THIRD_PARTY,
  [ATOMIC_ACTIONS.THIRD_PARTY_INPUT_AUDIO]: NEXT_ACTIONS.PROCESS_THIRD_PARTY,
  [ATOMIC_ACTIONS.START_INTAKE_TEXT]: NEXT_ACTIONS.FALLBACK,
  [ATOMIC_ACTIONS.START_INTAKE_AUDIO]: NEXT_ACTIONS.FALLBACK,
  [ATOMIC_ACTIONS.SELECT_INTAKE_MODE_TEXT]: NEXT_ACTIONS.FALLBACK,
  [ATOMIC_ACTIONS.SELECT_INTAKE_MODE_AUDIO]: NEXT_ACTIONS.FALLBACK,
  [ATOMIC_ACTIONS.SELECT_INTAKE_SUBJECT_TEXT]: NEXT_ACTIONS.FALLBACK,
  [ATOMIC_ACTIONS.SELECT_INTAKE_SUBJECT_AUDIO]: NEXT_ACTIONS.FALLBACK,
  [ATOMIC_ACTIONS.CONFIRM_CONTACT_NAME_TEXT]: NEXT_ACTIONS.FALLBACK,
  [ATOMIC_ACTIONS.CONFIRM_CONTACT_NAME_AUDIO]: NEXT_ACTIONS.FALLBACK,
  [ATOMIC_ACTIONS.CONFIRM_CLIENT_NAME_TEXT]: NEXT_ACTIONS.FALLBACK,
  [ATOMIC_ACTIONS.CONFIRM_CLIENT_NAME_AUDIO]: NEXT_ACTIONS.FALLBACK,
  [ATOMIC_ACTIONS.CONFIRM_NAME_OWNER_TEXT]: NEXT_ACTIONS.FALLBACK,
  [ATOMIC_ACTIONS.CONFIRM_NAME_OWNER_AUDIO]: NEXT_ACTIONS.FALLBACK,
  [ATOMIC_ACTIONS.CONFIRM_CLIENT_PHONE_TEXT]: NEXT_ACTIONS.FALLBACK,
  [ATOMIC_ACTIONS.CONFIRM_CLIENT_PHONE_AUDIO]: NEXT_ACTIONS.FALLBACK,
  [ATOMIC_ACTIONS.FALLBACK]: NEXT_ACTIONS.FALLBACK
})

function atomicResult(nextAction, reason) {
  return {
    nextAction,
    legacyAction: LEGACY_ACTION_BY_ATOMIC_ACTION[nextAction] || NEXT_ACTIONS.FALLBACK,
    reason
  }
}

function routeRevalidation(field, source, text) {
  if (source === "audio") {
    return ATOMIC_ACTIONS[`REVALIDATE_${field}_AUDIO`]
  }
  if (!text) return ATOMIC_ACTIONS[`REVALIDATE_${field}_WAIT`]
  const confirmIds = {
    NAME: "revalida_nome_ok",
    CITY: "revalida_cidade_ok",
    PHONE: "revalida_phone_ok"
  }
  if (text === confirmIds[field]) {
    return ATOMIC_ACTIONS[`REVALIDATE_${field}_CONFIRM`]
  }
  if (field === "CITY" && text.startsWith("revalida_cidade_multipla_")) {
    return ATOMIC_ACTIONS.REVALIDATE_CITY_SELECT
  }
  return ATOMIC_ACTIONS[`REVALIDATE_${field}_CORRECT_TEXT`]
}

function routeThirdParty(stage, source, stages) {
  const suffix = source === "audio" ? "AUDIO" : "TEXT"
  if (stage === stages.ACOLHIMENTO_NOME_CONTATO) {
    return ATOMIC_ACTIONS[`THIRD_PARTY_CONTACT_NAME_${suffix}`]
  }
  if (stage === stages.COLETA_TEL_OUTRO) {
    return ATOMIC_ACTIONS[`THIRD_PARTY_ATTENDED_NAME_${suffix}`]
  }
  if (
    stage === stages.ACOLHIMENTO_CONFIRMA_WHATSAPP_OUTRO ||
    stage === stages.COLETA_TEL_WPP_CONTATO
  ) {
    return ATOMIC_ACTIONS[`THIRD_PARTY_PHONE_${suffix}`]
  }
  return ATOMIC_ACTIONS[`THIRD_PARTY_INPUT_${suffix}`]
}

function routeOnboarding(flow, source) {
  const suffix = source === "audio" ? "AUDIO" : "TEXT"
  const actions = {
    welcome: ATOMIC_ACTIONS[`START_INTAKE_${suffix}`],
    mode: ATOMIC_ACTIONS[`SELECT_INTAKE_MODE_${suffix}`],
    subject: ATOMIC_ACTIONS[`SELECT_INTAKE_SUBJECT_${suffix}`],
    contact_name_confirmation: ATOMIC_ACTIONS[`CONFIRM_CONTACT_NAME_${suffix}`],
    client_name_confirmation: ATOMIC_ACTIONS[`CONFIRM_CLIENT_NAME_${suffix}`],
    name_owner_confirmation: ATOMIC_ACTIONS[`CONFIRM_NAME_OWNER_${suffix}`],
    client_phone_confirmation: ATOMIC_ACTIONS[`CONFIRM_CLIENT_PHONE_${suffix}`]
  }
  return actions[flow] || ATOMIC_ACTIONS.FALLBACK
}

function routeClientPostIntake(decision = {}, ctx = {}) {
  const route = decision.route
  const mode = decision.data?.mode
  const stage = ctx.stage || decision.data?.stage || null
  const stages = ctx.stages || {}
  const text = typeof ctx.text === "string" ? ctx.text : ""
  const source = ctx.isAudio || decision.data?.source === "audio" ? "audio" : "text"

  if (route === ROUTES.ONBOARDING) {
    return atomicResult(
      routeOnboarding(decision.data?.flow, source),
      `${decision.data?.flow || "onboarding"}_${source}`
    )
  }

  if (route === ROUTES.THIRD_PARTY) {
    return atomicResult(
      routeThirdParty(stage, source, stages),
      `third_party_${source}`
    )
  }

  if (route === ROUTES.NAME && mode === "revalidation") {
    return atomicResult(routeRevalidation("NAME", source, text), `name_revalidation_${source}`)
  }
  if (route === ROUTES.CITY && mode === "revalidation") {
    return atomicResult(routeRevalidation("CITY", source, text), `city_revalidation_${source}`)
  }
  if (route === ROUTES.PHONE && mode === "revalidation") {
    const phoneText = text === "revalida_whatsapp_ok" ? "revalida_phone_ok" : text
    return atomicResult(routeRevalidation("PHONE", source, phoneText), `phone_revalidation_${source}`)
  }

  if (route === ROUTES.NAME && mode === "intake") {
    return atomicResult(
      source === "audio" ? ATOMIC_ACTIONS.COLLECT_NAME_AUDIO : ATOMIC_ACTIONS.COLLECT_NAME_TEXT,
      `name_intake_${source}`
    )
  }
  if (route === ROUTES.CITY && mode === "intake") {
    return atomicResult(
      source === "audio" ? ATOMIC_ACTIONS.COLLECT_CITY_AUDIO : ATOMIC_ACTIONS.COLLECT_CITY_TEXT,
      `city_intake_${source}`
    )
  }
  if (route === ROUTES.PHONE && mode === "intake") {
    return atomicResult(
      source === "audio" ? ATOMIC_ACTIONS.COLLECT_PHONE_AUDIO : ATOMIC_ACTIONS.COLLECT_PHONE_TEXT,
      `phone_intake_${source}`
    )
  }
  if (route === ROUTES.PHONE && mode === "confirmation") {
    const action = text === "tel_confirmar"
      ? ATOMIC_ACTIONS.CONFIRM_PHONE_ACCEPT
      : text === "tel_corrigir"
        ? ATOMIC_ACTIONS.CONFIRM_PHONE_CORRECT
        : ATOMIC_ACTIONS.CONFIRM_PHONE_FALLBACK
    return atomicResult(action, "phone_confirmation")
  }

  return atomicResult(
    ATOMIC_ACTIONS.FALLBACK,
    decision.data?.reason || "not_applicable"
  )
}

module.exports = {
  NEXT_ACTIONS,
  ATOMIC_ACTIONS,
  LEGACY_ACTION_BY_ATOMIC_ACTION,
  routeClientPostIntake
}
