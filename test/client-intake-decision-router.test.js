const assert = require("node:assert/strict")
const {
  ROUTES,
  routeClientIntake
} = require("../src/domain/client/client-intake-decision-router")

const stages = {
  REVALIDA_NOME: "revalida_nome",
  ACOLHIMENTO_NOME: "acolhimento_nome",
  REVALIDA_CIDADE: "revalida_cidade",
  ACOLHIMENTO_CIDADE: "acolhimento_cidade",
  REVALIDA_WHATSAPP: "revalida_whatsapp",
  COLETA_TEL_WPP: "coleta_tel_wpp",
  COLETA_TEL_WPP_CONFIRMA: "coleta_tel_wpp_confirma",
  ACOLHIMENTO_NOME_CONTATO: "acolhimento_nome_contato",
  ACOLHIMENTO_CONFIRMA_WHATSAPP_OUTRO: "acolhimento_confirma_whatsapp_outro",
  COLETA_TEL_OUTRO: "coleta_tel_outro",
  COLETA_TEL_WPP_CONTATO: "coleta_tel_wpp_contato",
  ACOLHIMENTO: "acolhimento",
  ACOLHIMENTO_MODO: "acolhimento_modo",
  ACOLHIMENTO_PARA_QUEM: "acolhimento_para_quem",
  ACOLHIMENTO_CONFIRMA_NOME_CONTATO: "acolhimento_confirma_nome_contato",
  ACOLHIMENTO_CONFIRMA_NOME: "acolhimento_confirma_nome",
  ACOLHIMENTO_CONFIRMA_TITULAR_NOME: "acolhimento_confirma_titular_nome",
  ACOLHIMENTO_CONFIRMA_WHATSAPP: "acolhimento_confirma_whatsapp",
  CONFIRMAR_ENTRADA: "confirmar_entrada",
  CORRIGIR_DADOS: "corrigir_dados"
}

function route(stage, input = { text: "entrada" }, extraCtx = {}) {
  return routeClientIntake(input, { stage, stages, ...extraCtx })
}

assert.deepEqual(route(stages.REVALIDA_NOME), {
  route: ROUTES.NAME,
  data: {
    stage: stages.REVALIDA_NOME,
    mode: "revalidation",
    source: "text"
  },
  handled: true
})

assert.equal(route(stages.ACOLHIMENTO_NOME).route, ROUTES.NAME)
assert.equal(route(stages.ACOLHIMENTO_NOME).data.mode, "intake")
assert.equal(route(stages.REVALIDA_CIDADE).route, ROUTES.CITY)
assert.equal(route(stages.ACOLHIMENTO_CIDADE).data.mode, "intake")
assert.equal(route(stages.REVALIDA_WHATSAPP).route, ROUTES.PHONE)
assert.equal(route(stages.COLETA_TEL_WPP).data.mode, "intake")
assert.equal(route(stages.COLETA_TEL_WPP_CONFIRMA, { text: "" }).handled, true)

for (const [stage, flow] of [
  [stages.ACOLHIMENTO, "welcome"],
  [stages.ACOLHIMENTO_MODO, "mode"],
  [stages.ACOLHIMENTO_PARA_QUEM, "subject"],
  [stages.ACOLHIMENTO_CONFIRMA_NOME_CONTATO, "contact_name_confirmation"],
  [stages.ACOLHIMENTO_CONFIRMA_NOME, "client_name_confirmation"],
  [stages.ACOLHIMENTO_CONFIRMA_TITULAR_NOME, "name_owner_confirmation"],
  [stages.ACOLHIMENTO_CONFIRMA_WHATSAPP, "client_phone_confirmation"]
]) {
  const result = route(stage)
  assert.equal(result.route, ROUTES.ONBOARDING)
  assert.equal(result.data.flow, flow)
  assert.equal(result.data.source, "text")
}

const onboardingAudio = route(
  stages.ACOLHIMENTO_CONFIRMA_NOME,
  { text: "", isAudio: true }
)
assert.equal(onboardingAudio.route, ROUTES.ONBOARDING)
assert.equal(onboardingAudio.data.source, "audio")
assert.equal(onboardingAudio.handled, true)

const audioTranscrito = route(stages.REVALIDA_CIDADE, {
  text: "Recife Pernambuco",
  isAudio: true
})
assert.equal(audioTranscrito.route, ROUTES.CITY)
assert.equal(audioTranscrito.data.source, "audio")

for (const stage of [
  stages.ACOLHIMENTO_NOME_CONTATO,
  stages.COLETA_TEL_OUTRO,
  stages.ACOLHIMENTO_CONFIRMA_WHATSAPP_OUTRO,
  stages.COLETA_TEL_WPP_CONTATO
]) {
  const terceiro = route(stage)
  assert.equal(terceiro.route, ROUTES.THIRD_PARTY)
  assert.equal(terceiro.handled, true)
}

const invalido = route("stage_desconhecido", { text: "" })
assert.deepEqual(invalido, {
  route: ROUTES.FALLBACK,
  data: { stage: "stage_desconhecido", reason: "invalid_input" },
  handled: false
})

const ambiguo = route(stages.REVALIDA_NOME, { text: "Maria Recife" }, {
  candidates: [ROUTES.NAME, ROUTES.CITY]
})
assert.equal(ambiguo.route, ROUTES.FALLBACK)
assert.equal(ambiguo.data.reason, "ambiguous")
assert.equal(ambiguo.handled, false)

for (const stage of [stages.CONFIRMAR_ENTRADA, stages.CORRIGIR_DADOS]) {
  const excluido = route(stage)
  assert.equal(excluido.route, ROUTES.FALLBACK)
  assert.equal(excluido.data.reason, "excluded_stage")
  assert.equal(excluido.handled, false)
}

const input = Object.freeze({ text: "Maria da Silva", isAudio: false })
const ctx = Object.freeze({
  stage: stages.REVALIDA_NOME,
  stages: Object.freeze({ ...stages })
})
const inputAntes = JSON.stringify(input)
const ctxAntes = JSON.stringify(ctx)
routeClientIntake(input, ctx)
assert.equal(JSON.stringify(input), inputAntes)
assert.equal(JSON.stringify(ctx), ctxAntes)

console.log("client-intake-decision-router.test.js: ok")
