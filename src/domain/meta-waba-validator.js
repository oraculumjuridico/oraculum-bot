const axios = require("axios")
const { META_TEMPLATES } = require("./meta-templates")

const GRAPH_VERSION = process.env.META_GRAPH_VERSION || "v19.0"
const GRAPH_BASE_URL = `https://graph.facebook.com/${GRAPH_VERSION}`

function obterWabaConfigurada(env = process.env) {
  return env.WHATSAPP_BUSINESS_ACCOUNT_ID || env.WABA_ID || env.WHATSAPP_WABA_ID || ""
}

function contarParametrosBody(templateMeta) {
  const body = (templateMeta.components || []).find(component => component.type === "BODY")
  const text = body?.text || ""
  const matches = Array.from(text.matchAll(/\{\{\s*(\d+)\s*\}\}/g))
  if (!matches.length) return 0
  return Math.max(...matches.map(match => Number(match[1]) || 0))
}

function possuiHeader(templateMeta) {
  return (templateMeta.components || []).some(component => component.type === "HEADER")
}

function normalizarCatalogo() {
  return Object.entries(META_TEMPLATES).map(([id, template]) => ({
    id,
    nome: template.nome || template.nomeCatalogo || id,
    nomeConfigurado: template.nome || "",
    nomeCatalogo: template.nomeCatalogo || template.nome || id,
    idioma: template.idioma || "pt_BR",
    headerEsperado: template.componentes ? template.componentes.some(c => (c.tipo || c.type || "").toUpperCase() === "HEADER") : Boolean(template.headerImageUrl),
    parametrosEsperados: Number.isInteger(template.parametrosEsperados) ? template.parametrosEsperados : null,
    critico: template.critico === true
  }))
}

async function graphGet(path, params = {}, token = process.env.WHATSAPP_TOKEN) {
  const response = await axios.get(`${GRAPH_BASE_URL}/${path}`, {
    params,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    }
  })
  return response.data
}

async function listarTemplatesWaba(wabaId, token) {
  const templates = []
  let path = `${wabaId}/message_templates`
  let params = {
    fields: "id,name,language,status,category,components",
    limit: 100
  }

  while (path) {
    const data = await graphGet(path, params, token)
    templates.push(...(data.data || []))

    const next = data.paging?.next
    if (!next) break

    const nextUrl = new URL(next)
    path = nextUrl.pathname.replace(new RegExp(`^/${GRAPH_VERSION}/?`), "")
    params = Object.fromEntries(nextUrl.searchParams.entries())
  }

  return templates
}

async function listarPhoneNumbersWaba(wabaId, token) {
  const phoneNumbers = []
  let path = `${wabaId}/phone_numbers`
  let params = {
    fields: "id,display_phone_number,verified_name",
    limit: 100
  }

  while (path) {
    const data = await graphGet(path, params, token)
    phoneNumbers.push(...(data.data || []))

    const next = data.paging?.next
    if (!next) break

    const nextUrl = new URL(next)
    path = nextUrl.pathname.replace(new RegExp(`^/${GRAPH_VERSION}/?`), "")
    params = Object.fromEntries(nextUrl.searchParams.entries())
  }

  return phoneNumbers
}

function registrar(report, ok, texto, { critical = false } = {}) {
  const prefixo = ok ? "✓" : critical ? "✗" : "⚠"
  report.linhas.push(`${prefixo} ${texto}`)
  if (!ok && critical) report.divergenciasCriticas.push(texto)
  if (!ok && !critical) report.warnings.push(texto)
}

function compararTemplates(report, templatesMeta) {
  const templatesPorChave = new Map()
  for (const template of templatesMeta) {
    templatesPorChave.set(`${template.name}:${template.language}`, template)
  }

  for (const esperado of normalizarCatalogo()) {
    const templateMeta = templatesPorChave.get(`${esperado.nome}:${esperado.idioma}`)
    const rotulo = esperado.nome || esperado.nomeCatalogo

    if (!esperado.nomeConfigurado && esperado.critico) {
      registrar(report, false, `${rotulo} sem nome configurado em WHATSAPP_TEMPLATE_TERCEIRO`)
      continue
    }

    if (!templateMeta) {
      registrar(report, false, `Template "${rotulo}" ausente`)
      continue
    }

    registrar(report, true, `${rotulo} existe`)
    registrar(report, templateMeta.language === esperado.idioma, `${rotulo} idioma ${templateMeta.language || "-"} esperado ${esperado.idioma}`)
    registrar(report, templateMeta.status === "APPROVED", `${rotulo} ${templateMeta.status || "STATUS_DESCONHECIDO"}`)
    registrar(report, Boolean(templateMeta.category), `${rotulo} categoria ${templateMeta.category || "-"}`)

    const headerEncontrado = possuiHeader(templateMeta)
    registrar(
      report,
      headerEncontrado === esperado.headerEsperado,
      `${rotulo} header ${headerEncontrado ? "presente" : "ausente"} esperado ${esperado.headerEsperado ? "presente" : "ausente"}`
    )

    const parametrosEncontrados = contarParametrosBody(templateMeta)
    if (esperado.parametrosEsperados === null) {
      registrar(report, true, `${rotulo} parâmetros ${parametrosEncontrados}`)
    } else {
      registrar(
        report,
        parametrosEncontrados === esperado.parametrosEsperados,
        `${rotulo} parâmetros ${parametrosEncontrados} esperado ${esperado.parametrosEsperados}`
      )
    }
  }
}

async function validarMetaWaba(options = {}) {
  const env = options.env || process.env
  const token = env.WHATSAPP_TOKEN || ""
  const phoneNumberId = env.PHONE_NUMBER_ID || ""
  const wabaId = obterWabaConfigurada(env)
  const report = {
    ok: false,
    wabaId,
    phoneNumberId,
    templates: [],
    linhas: ["[META WABA] Validação da configuração"],
    warnings: [],
    divergenciasCriticas: []
  }

  if (!token) registrar(report, false, "WHATSAPP_TOKEN ausente", { critical: true })
  if (!phoneNumberId) registrar(report, false, "PHONE_NUMBER_ID ausente", { critical: true })
  if (!wabaId) registrar(report, false, "WABA ausente: configure WHATSAPP_BUSINESS_ACCOUNT_ID, WABA_ID ou WHATSAPP_WABA_ID", { critical: true })
  if (!token || !phoneNumberId || !wabaId) {
    report.ok = report.divergenciasCriticas.length === 0
    return report
  }

  try {
    await graphGet("me", { fields: "id,name" }, token)
    registrar(report, true, "Conexão com Graph API OK")
  } catch (error) {
    registrar(report, false, `Graph API inacessível: ${error.response?.data?.error?.message || error.message}`, { critical: true })
    report.ok = false
    return report
  }

  let phoneInfo = null
  try {
    phoneInfo = await graphGet(phoneNumberId, { fields: "id,display_phone_number,verified_name" }, token)
    registrar(report, true, "Número encontrado")
  } catch (error) {
    registrar(report, false, `PHONE_NUMBER_ID não encontrado/acessível: ${error.response?.data?.error?.message || error.message}`, { critical: true })
  }

  try {
    await graphGet(wabaId, { fields: "id,name" }, token)
    registrar(report, true, "WABA encontrada")
  } catch (error) {
    registrar(report, false, `WABA inacessível pelo token: ${error.response?.data?.error?.message || error.message}`, { critical: true })
  }

  let phoneNumbersWaba = []
  try {
    phoneNumbersWaba = await listarPhoneNumbersWaba(wabaId, token)
    registrar(report, true, `${phoneNumbersWaba.length} nÃºmero(s) listado(s) na WABA`)
  } catch (error) {
    registrar(report, false, `Falha ao listar nÃºmeros da WABA: ${error.response?.data?.error?.message || error.message}`, { critical: true })
  }

  const phoneWabaId = phoneNumbersWaba.some(phone => String(phone?.id || "") === String(phoneNumberId)) ? wabaId : ""
  registrar(
    report,
    phoneWabaId === wabaId,
    `PHONE_NUMBER_ID ${phoneNumberId} ${phoneWabaId === wabaId ? "pertence" : "não pertence"} à WABA ${wabaId}`,
    { critical: true }
  )

  try {
    report.templates = await listarTemplatesWaba(wabaId, token)
    registrar(report, true, `${report.templates.length} template(s) listado(s) na WABA`)
    for (const template of [...report.templates].sort((a, b) => String(a.name).localeCompare(String(b.name)))) {
      registrar(report, true, `WABA template ${template.name || "-"} ${template.language || "-"} ${template.status || "-"} ${template.category || "-"}`)
    }
    compararTemplates(report, report.templates)
  } catch (error) {
    registrar(report, false, `Falha ao listar templates da WABA: ${error.response?.data?.error?.message || error.message}`, { critical: true })
  }

  report.ok = report.divergenciasCriticas.length === 0
  return report
}

function formatarRelatorioMetaWaba(report) {
  return report.linhas.join("\n")
}

async function validarMetaWabaNoBoot(options = {}) {
  const ambiente = String(options.nodeEnv || process.env.NODE_ENV || "development").toLowerCase()
  const producao = ambiente === "production"
  const report = await validarMetaWaba(options)
  const relatorio = formatarRelatorioMetaWaba(report)

  if (report.ok) {
    console.log(relatorio)
    return report
  }

  if (producao) {
    console.error(relatorio)
    throw new Error(`Configuração Meta/WABA inválida: ${report.divergenciasCriticas.join("; ")}`)
  }

  console.warn(relatorio)
  return report
}

module.exports = {
  validarMetaWaba,
  validarMetaWabaNoBoot,
  formatarRelatorioMetaWaba,
  contarParametrosBody,
  possuiHeader,
  normalizarCatalogo
}
