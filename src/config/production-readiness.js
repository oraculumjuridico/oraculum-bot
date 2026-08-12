"use strict"

function texto(value) {
  return String(value || "").trim()
}

function habilitado(value) {
  return texto(value).toLowerCase() === "true"
}

function presente(env, names) {
  return names.some(name => Boolean(texto(env[name])))
}

function check(key, category, required, ok, missing = [], detail = "") {
  return Object.freeze({
    key,
    category,
    required: Boolean(required),
    status: ok ? "ready" : (required ? "blocked" : "optional"),
    missing: ok ? [] : [...missing],
    detail
  })
}

function avaliarProntidaoProducao(env = process.env) {
  const production = texto(env.NODE_ENV).toLowerCase() === "production"
  const persistenceRequired = production || habilitado(env.EXTERNAL_STATE_REQUIRED)
  const schedulerEnabled = habilitado(env.INTERNAL_SCHEDULER_ENABLED)
  const postHumanConfigured = texto(env.POST_HUMAN_COMPLEMENTATION_ENABLED)
  const postHumanEnabled = postHumanConfigured
    ? postHumanConfigured.toLowerCase() === "true"
    : production
  const automationRestricted = habilitado(env.AUTOMATION_ALLOW_ALL) || presente(env, [
    "AUTOMATION_PILOT_CASES",
    "AUTOMATION_PILOT_DEAL_IDS",
    "AUTOMATION_PILOT_PHONES"
  ])
  const postHumanRestricted = presente(env, [
    "POST_HUMAN_PILOT_CASES",
    "POST_HUMAN_COMPLEMENTATION_ALLOWLIST"
  ])

  const checks = [
    check("runtime.production", "runtime", true, production, ["NODE_ENV"], "Runtime deve operar explicitamente em modo production."),
    check("meta.inbound", "whatsapp", true,
      presente(env, ["WHATSAPP_TOKEN"]) && presente(env, ["PHONE_NUMBER_ID"]) && presente(env, ["VERIFY_TOKEN"]) && presente(env, ["APP_SECRET", "META_APP_SECRET"]),
      ["WHATSAPP_TOKEN", "PHONE_NUMBER_ID", "VERIFY_TOKEN", "APP_SECRET|META_APP_SECRET"],
      "Recebimento, assinatura e resposta pelo WhatsApp."),
    check("hubspot.crm", "crm", true, presente(env, ["HUBSPOT_TOKEN"]), ["HUBSPOT_TOKEN"], "Contato, Negócio e tarefas do caso."),
    check("google.workspace", "documents-calendar", true,
      presente(env, ["GOOGLE_CLIENT_ID"]) && presente(env, ["GOOGLE_CLIENT_SECRET"]) && presente(env, ["GOOGLE_REFRESH_TOKEN"]) && presente(env, ["DRIVE_PASTA_CLIENTES_ID"]),
      ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "GOOGLE_REFRESH_TOKEN", "DRIVE_PASTA_CLIENTES_ID"],
      "Drive privado e Google Calendar."),
    check("persistence.external", "persistence", persistenceRequired,
      !persistenceRequired || presente(env, ["EXTERNAL_STATE_DATABASE_URL"]),
      ["EXTERNAL_STATE_DATABASE_URL"],
      "Estado durável, inbox do webhook e recuperação após reinício."),
    check("internal.authentication", "security", true, presente(env, ["INTERNAL_WEBHOOK_SECRET"]), ["INTERNAL_WEBHOOK_SECRET"], "Proteção das rotas internas."),
    check("public.base_url", "runtime", true, presente(env, ["PUBLIC_BASE_URL", "APP_URL", "RENDER_EXTERNAL_URL"]), ["PUBLIC_BASE_URL|APP_URL|RENDER_EXTERNAL_URL"], "Links e callbacks públicos."),
    check("admin.whatsapp", "administration", true,
      presente(env, ["WHATSAPP_ADMIN"]) && presente(env, ["ADMIN_WHATSAPP_PASSWORD_HASH", "ADMIN_WHATSAPP_PASSWORD"]),
      ["WHATSAPP_ADMIN", "ADMIN_WHATSAPP_PASSWORD_HASH|ADMIN_WHATSAPP_PASSWORD"],
      "Acesso administrativo pelo WhatsApp."),
    check("audio.transcription", "audio", false, presente(env, ["ASSEMBLYAI_KEY"]), ["ASSEMBLYAI_KEY"], "Transcrição de áudios recebidos."),
    check("ai.legal", "ai", false, presente(env, ["GROQ_KEY"]), ["GROQ_KEY"], "Classificação e apoio jurídico; há fallback determinístico."),
    check("tts.lightning", "audio", false, presente(env, ["LIGHTNING_TTS_URL"]), ["LIGHTNING_TTS_URL"], "Voz Supertonic; há fallback textual/Google."),
    check("scheduler.safe_scope", "automation", schedulerEnabled,
      !schedulerEnabled || automationRestricted,
      ["AUTOMATION_PILOT_CASES|AUTOMATION_PILOT_DEAL_IDS|AUTOMATION_PILOT_PHONES|AUTOMATION_ALLOW_ALL"],
      "Agendador interno deve ter escopo explícito."),
    check("post_human.safe_scope", "post-human", postHumanEnabled,
      !postHumanEnabled || postHumanRestricted,
      ["POST_HUMAN_PILOT_CASES|POST_HUMAN_COMPLEMENTATION_ALLOWLIST"],
      "Complementação pós-atendimento deve ter allowlist explícita.")
  ]

  const blockers = checks.filter(item => item.required && item.status !== "ready")
  const optionalUnavailable = checks.filter(item => !item.required && item.status !== "ready")
  return Object.freeze({
    ready: blockers.length === 0,
    mode: production ? "production" : "non-production",
    blockers: blockers.map(item => item.key),
    optionalUnavailable: optionalUnavailable.map(item => item.key),
    checks
  })
}

module.exports = {
  avaliarProntidaoProducao
}
