const { enviar, enviarComResultado, enviarTemplateWhatsApp, enviarTemplateComResultado } = require("./whatsapp-transport")
const { META_TEMPLATES } = require("./meta-templates")
const { normalizarContextoConversa } = require("./conversation-context")

const JANELA_WHATSAPP_24H_MS = 24 * 60 * 60 * 1000
const CONSULTA_LEMBRETE_TEMPLATES = {
  "24h": META_TEMPLATES.consultaLembrete24h,
  hoje: META_TEMPLATES.consultaLembreteHoje,
  "1h": META_TEMPLATES.consultaLembrete1h
}

function primeiroNomeTemplate(nome, fallback = "-") {
  const primeiroNome = String(nome || "").trim().split(/\s+/).filter(Boolean)[0]
  return primeiroNome || fallback
}

function opcoesTemplate(template) {
  return { headerImageUrl: template.headerImageUrl }
}

function conversaDentroJanela24h(ultimaMsg, agora = Date.now()) {
  const timestamp = Number(ultimaMsg || 0)
  return timestamp > 0 && agora - timestamp <= JANELA_WHATSAPP_24H_MS
}

function persistirContextoConversaAposTemplate(usuario, contextoConversa) {
  if (!usuario || typeof usuario !== "object") return false
  const contextoNormalizado = normalizarContextoConversa(contextoConversa)
  if (!contextoNormalizado) return false
  usuario.contextoConversa = contextoNormalizado
  return true
}

async function enviarTemplateCatalogado(to, template, params = [], options = {}) {
  if (!template?.nome || !to) return false
  if (template.exigeContratoComponentes &&
      (!Number.isInteger(template.parametrosEsperados) || !Array.isArray(template.componentes))) return false
  if (Number.isInteger(template.parametrosEsperados) && params.length !== template.parametrosEsperados) return false
  const opts = options && typeof options === "object" ? options : {}
  let contextoPersistidoAntesDoEnvio = false
  let contextoAnterior = null
  if (opts.requireContextoConversa) {
    if (!opts.usuario || typeof opts.usuario !== "object") return false
    contextoAnterior = opts.usuario.contextoConversa
    contextoPersistidoAntesDoEnvio = persistirContextoConversaAposTemplate(opts.usuario, opts.contextoConversa)
    if (!contextoPersistidoAntesDoEnvio) return false
  }
  const enviado = await enviarTemplateWhatsApp(to, template.nome, params, template.idioma, opcoesTemplate(template))
  if (!enviado && contextoPersistidoAntesDoEnvio) {
    opts.usuario.contextoConversa = contextoAnterior || null
  }
  if (enviado && !contextoPersistidoAntesDoEnvio) {
    persistirContextoConversaAposTemplate(opts.usuario, opts.contextoConversa)
  }
  return enviado
}

async function casoTerceiro(to, params = {}, options = {}) {
  const template = META_TEMPLATES.casoTerceiroAberto

  return enviarTemplateCatalogado(to, template, [
    primeiroNomeTemplate(params.nomeAtendido),
    primeiroNomeTemplate(params.nomeSolicitante, "uma pessoa próxima"),
    params.numeroCaso,
    params.area
  ], options)
}

async function casoAtualizacao(to, params = [], options = {}) {
  return enviarTemplateCatalogado(to, META_TEMPLATES.casoAtualizacao, params, options)
}

function templateTipoConsultaLembrete(tipo) {
  const chave = String(tipo || "").trim().toLowerCase()
  const template = CONSULTA_LEMBRETE_TEMPLATES[chave]
  return template?.nome || null
}

async function consultaLembrete(to, tipo, params = [], options = {}) {
  const chave = String(tipo || "").trim().toLowerCase()
  const template = CONSULTA_LEMBRETE_TEMPLATES[chave]
  return enviarTemplateCatalogado(to, template, params, options)
}

async function retomadaAtendimento(to, { ultimaMsg, texto, params = [] } = {}, options = {}) {
  const agora = Number.isFinite(Number(options?.agora)) ? Number(options.agora) : Date.now()
  if (!options?.forceTemplate && conversaDentroJanela24h(ultimaMsg, agora)) {
    return enviar(to, texto || "Podemos retomar seu atendimento por aqui.")
  }

  return enviarTemplateCatalogado(to, META_TEMPLATES.retomadaAtendimento, params, options)
}

async function atualizacaoCasoSegura(to, {
  ultimaMsg,
  texto,
  resumoTemplate,
  usuario
} = {}, options = {}) {
  const agora = Number.isFinite(Number(options?.agora)) ? Number(options.agora) : Date.now()
  if (conversaDentroJanela24h(ultimaMsg, agora)) {
    const result = await enviarComResultado(to, texto)
    return { ...result, sent: result.accepted, channel: "freeform" }
  }
  const resumo = String(resumoTemplate || texto || "").trim()
  if (!resumo) return { sent: false, channel: "template", reason: "template_param_missing" }
  const template = META_TEMPLATES.casoAtualizacao
  const result = await enviarTemplateComResultado(to, template.nome, [resumo], template.idioma, opcoesTemplate(template))
  return {
    ...result,
    sent: result.accepted,
    channel: "template",
    reason: result.accepted ? null : "template_send_failed"
  }
}

module.exports = {
  casoTerceiro,
  casoAtualizacao,
  consultaLembrete,
  retomadaAtendimento,
  atualizacaoCasoSegura,
  primeiroNomeTemplate,
  conversaDentroJanela24h,
  persistirContextoConversaAposTemplate,
  templateTipoConsultaLembrete
}
