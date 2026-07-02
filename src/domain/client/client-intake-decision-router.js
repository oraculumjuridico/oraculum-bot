const ROUTES = Object.freeze({
  NAME: "name",
  CITY: "city",
  PHONE: "phone",
  THIRD_PARTY: "third_party",
  FALLBACK: "fallback"
})

function routeClientIntake(input = {}, ctx = {}) {
  const value = typeof input === "string" ? { text: input } : (input || {})
  const stages = ctx.stages || {}
  const stage = ctx.stage || value.stage || null
  const text = typeof value.text === "string" ? value.text : ""
  const hasInput = Boolean(text.trim() || value.isAudio)

  if (stage === stages.CONFIRMAR_ENTRADA || stage === stages.CORRIGIR_DADOS) {
    return {
      route: ROUTES.FALLBACK,
      data: { stage, reason: "excluded_stage" },
      handled: false
    }
  }

  if (ctx.ambiguous || (Array.isArray(ctx.candidates) && ctx.candidates.length > 1)) {
    return {
      route: ROUTES.FALLBACK,
      data: { stage, reason: "ambiguous" },
      handled: false
    }
  }

  const thirdPartyStages = new Set([
    stages.ACOLHIMENTO_NOME_CONTATO,
    stages.COLETA_TEL_OUTRO,
    stages.ACOLHIMENTO_CONFIRMA_NOME_CONTATO,
    stages.ACOLHIMENTO_CONFIRMA_WHATSAPP_OUTRO,
    stages.COLETA_TEL_WPP_CONTATO
  ].filter(Boolean))
  if (thirdPartyStages.has(stage)) {
    return {
      route: ROUTES.THIRD_PARTY,
      data: { stage, source: value.isAudio ? "audio" : "text" },
      handled: hasInput
    }
  }

  const decisions = new Map([
    [stages.REVALIDA_NOME, { route: ROUTES.NAME, mode: "revalidation" }],
    [stages.ACOLHIMENTO_NOME, { route: ROUTES.NAME, mode: "intake" }],
    [stages.REVALIDA_CIDADE, { route: ROUTES.CITY, mode: "revalidation" }],
    [stages.ACOLHIMENTO_CIDADE, { route: ROUTES.CITY, mode: "intake" }],
    [stages.REVALIDA_WHATSAPP, { route: ROUTES.PHONE, mode: "revalidation" }],
    [stages.COLETA_TEL_WPP, { route: ROUTES.PHONE, mode: "intake" }],
    [stages.COLETA_TEL_WPP_CONFIRMA, { route: ROUTES.PHONE, mode: "confirmation" }]
  ])
  const decision = decisions.get(stage)
  if (decision) {
    return {
      route: decision.route,
      data: {
        stage,
        mode: decision.mode,
        source: value.isAudio ? "audio" : "text"
      },
      handled: hasInput || decision.mode === "confirmation"
    }
  }

  return {
    route: ROUTES.FALLBACK,
    data: { stage, reason: hasInput ? "not_applicable" : "invalid_input" },
    handled: false
  }
}

module.exports = {
  ROUTES,
  routeClientIntake
}
