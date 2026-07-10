const { carregarEstadoDocumental } = require("./document-state-repository")
const { gerarChecklistDocumental } = require("./document-checklist")
const { detectarDivergenciasDocumentais } = require("./document-divergence-detector")
const { criarDossieJuridico } = require("./legal-dossier")

const ORIGEM = Object.freeze({
  DOCUMENT_STATE: "document-state",
  REGISTRY: "registry",
  CHECKLIST: "checklist",
  DIVERGENCES: "divergences",
  DOSSIER: "dossier",
  HUBSPOT: "HubSpot",
  GOOGLE_CALENDAR: "Google Calendar",
  GROQ: "Groq",
  DESCONHECIDA: "desconhecida"
})

function normalizarTexto(valor = "") {
  return String(valor || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
}

function normalizarArray(valor) {
  return Array.isArray(valor) ? valor : []
}

function objeto(valor) {
  return valor && typeof valor === "object" && !Array.isArray(valor) ? valor : {}
}

function resposta({ origem, resposta, confianca = 0.5, usouIA = false }) {
  return {
    origem,
    resposta,
    confianca,
    usouIA
  }
}

async function resolverEstadoDocumental(contexto = {}, deps = {}) {
  const direto = contexto.documentState || contexto.estadoDocumental || contexto.stateDocumental
  if (direto && typeof direto === "object") return direto
  const pastaDriveId = contexto.pastaDriveId || contexto.pastaId || contexto.driveFolderId
  if (!pastaDriveId) return null
  if (typeof deps.carregarEstadoDocumental === "function") {
    return deps.carregarEstadoDocumental(pastaDriveId, deps)
  }
  return carregarEstadoDocumental(pastaDriveId, deps)
}

async function montarFontes(contexto = {}, deps = {}) {
  const estado = await resolverEstadoDocumental(contexto, deps)
  const registry = contexto.registry || contexto.documentRegistry || estado?.registry || {}
  const checklist = contexto.checklist || estado?.checklist || (
    normalizarArray(registry.documentos).length ? gerarChecklistDocumental(registry, contexto) : {}
  )
  const divergences = contexto.divergences || contexto.divergencias || estado?.divergences || (
    normalizarArray(registry.documentos).length ? detectarDivergenciasDocumentais(registry) : {}
  )
  const dossier = contexto.dossier || contexto.dossie || estado?.dossier || (
    normalizarArray(registry.documentos).length
      ? criarDossieJuridico({ registry, checklist, divergenciasDocumentais: divergences, cliente: contexto.cliente, caso: contexto.caso })
      : {}
  )
  return {
    estado: estado || {},
    registry,
    checklist,
    divergences,
    dossier,
    hubspot: contexto.hubspot || contexto.HubSpot || {},
    calendar: contexto.calendar || contexto.googleCalendar || contexto.GoogleCalendar || {}
  }
}

function consultaChecklist(pergunta) {
  return /(documento|documentacao|documenta[cç][aã]o).*(falta|faltam|pendente|pendentes)|percentual|porcentagem|completo|completa/.test(pergunta)
}

function consultaPercentual(pergunta) {
  return /percentual|porcentagem|quanto.*complet|completo|completa/.test(pergunta)
}

function consultaRegistry(pergunta) {
  return /\b(cpf|rg|nome|telefone|whatsapp|cidade|uf|ultimo|ultima|laudo|documento)\b/.test(pergunta)
}

function consultaUltimoLaudo(pergunta) {
  return /(ultimo|ultima|mais recente).*(laudo|atestado)|\blaudo\b/.test(pergunta)
}

function consultaDivergencia(pergunta) {
  return /diverg[eê]ncia|divergente|inconsist[eê]ncia|conflito|dados diferentes/.test(pergunta)
}

function consultaDossie(pergunta) {
  return /dossi[eê]|area do caso|tipo do caso|numero do caso|n[uú]mero do caso|responsavel|pdf|link|pasta/.test(pergunta)
}

function requerIA(pergunta) {
  return /resuma|resumo|explique|explica|historico|hist[oó]rico|analise|an[aá]lise|interprete|orienta/.test(pergunta)
}

function itensChecklistPendentes(checklist = {}) {
  return normalizarArray(checklist.pendentes).map(item => item.item || item.tipoDocumento || item.label || item).filter(Boolean)
}

function itensChecklistRecebidos(checklist = {}) {
  return normalizarArray(checklist.recebidos).map(item => item.item || item.tipoDocumento || item.label || item).filter(Boolean)
}

function responderChecklist(pergunta, checklist = {}) {
  const pendentes = itensChecklistPendentes(checklist)
  const recebidos = itensChecklistRecebidos(checklist)
  const percentual = Number(checklist.percentualCompleto || checklist.percentual || 0)
  if (consultaPercentual(pergunta)) {
    return resposta({
      origem: ORIGEM.CHECKLIST,
      resposta: `A documentacao esta ${percentual}% completa.`,
      confianca: 0.92
    })
  }
  if (pendentes.length) {
    return resposta({
      origem: ORIGEM.CHECKLIST,
      resposta: `Documentos pendentes: ${pendentes.join(", ")}.`,
      confianca: 0.92
    })
  }
  if (recebidos.length || percentual === 100) {
    return resposta({
      origem: ORIGEM.CHECKLIST,
      resposta: "Nao ha documentos pendentes no checklist atual.",
      confianca: 0.9
    })
  }
  return null
}

function camposExtraidos(documento = {}) {
  const versoes = normalizarArray(documento.versoes)
  const versao = versoes.at(-1) || documento
  return versao.extracao?.camposExtraidos || documento.extracao?.camposExtraidos || {}
}

function documentoElegivel(documento = {}) {
  return documento && documento.vigente !== false && documento.status !== "erro"
}

function valorCampoRegistry(registry = {}, aliases = []) {
  for (const documento of normalizarArray(registry.documentos)) {
    if (!documentoElegivel(documento)) continue
    const campos = camposExtraidos(documento)
    const encontrado = Object.entries(campos).find(([campo, valor]) =>
      valor !== null &&
      valor !== undefined &&
      String(valor).trim() &&
      aliases.some(alias => normalizarTexto(campo) === normalizarTexto(alias))
    )
    if (encontrado) return encontrado[1]
  }
  return null
}

function ultimoDocumentoPorTipo(registry = {}, tipo = "") {
  const alvo = normalizarTexto(tipo)
  return normalizarArray(registry.documentos)
    .filter(documento => documentoElegivel(documento))
    .filter(documento => normalizarTexto(documento.tipoDocumento || documento.nome).includes(alvo))
    .sort((a, b) => String(b.atualizadoEm || b.criadoEm || "").localeCompare(String(a.atualizadoEm || a.criadoEm || "")))[0] || null
}

function responderRegistry(pergunta, registry = {}) {
  if (!normalizarArray(registry.documentos).length) return null
  if (/\bcpf\b/.test(pergunta)) {
    const cpf = valorCampoRegistry(registry, ["cpf", "cpf_do_cliente", "cpf do cliente"])
    if (cpf) return resposta({ origem: ORIGEM.REGISTRY, resposta: `CPF identificado: ${cpf}.`, confianca: 0.88 })
  }
  if (/\bnome\b/.test(pergunta)) {
    const nome = valorCampoRegistry(registry, ["nome", "nome completo", "nome_completo", "nomeCompleto"])
    if (nome) return resposta({ origem: ORIGEM.REGISTRY, resposta: `Nome identificado: ${nome}.`, confianca: 0.86 })
  }
  if (consultaUltimoLaudo(pergunta)) {
    const laudo = ultimoDocumentoPorTipo(registry, "laudo")
    if (laudo) {
      return resposta({
        origem: ORIGEM.REGISTRY,
        resposta: `Ultimo laudo identificado: ${laudo.nome || laudo.tipoDocumento || laudo.fileId || "documento sem nome"}.`,
        confianca: 0.84
      })
    }
  }
  return null
}

function responderDivergencias(divergences = {}) {
  const lista = normalizarArray(divergences.divergencias)
  if (!lista.length) {
    return resposta({
      origem: ORIGEM.DIVERGENCES,
      resposta: "Nao ha divergencias documentais identificadas.",
      confianca: 0.9
    })
  }
  const resumo = lista.slice(0, 4).map(item => {
    const campo = item.campo || item.tipo || "campo"
    const gravidade = item.gravidade || "gravidade nao informada"
    return `${campo} (${gravidade})`
  }).join(", ")
  return resposta({
    origem: ORIGEM.DIVERGENCES,
    resposta: `Ha ${lista.length} divergencia(s): ${resumo}.`,
    confianca: 0.9
  })
}

function responderDossie(pergunta, dossier = {}) {
  const dossie = objeto(dossier)
  if (!Object.keys(dossie).length) return null
  if (/area do caso|\barea\b|\b[aá]rea\b/.test(pergunta) && dossie.caso?.area) {
    return resposta({ origem: ORIGEM.DOSSIER, resposta: `Area do caso: ${dossie.caso.area}.`, confianca: 0.88 })
  }
  if (/tipo do caso|\btipo\b/.test(pergunta) && dossie.caso?.tipo) {
    return resposta({ origem: ORIGEM.DOSSIER, resposta: `Tipo do caso: ${dossie.caso.tipo}.`, confianca: 0.88 })
  }
  if (/pdf|link|pasta/.test(pergunta)) {
    const pdfs = normalizarArray(dossie.links?.pdfs || dossie.pdfs)
    if (pdfs.length) {
      const lista = pdfs.slice(0, 3).map(pdf => pdf.webViewLink || pdf.drive?.webViewLink || pdf.arquivo || pdf.tipo).filter(Boolean)
      return resposta({ origem: ORIGEM.DOSSIER, resposta: `PDFs do dossie: ${lista.join(", ")}.`, confianca: 0.86 })
    }
    if (dossie.links?.pastaDrive) {
      return resposta({ origem: ORIGEM.DOSSIER, resposta: `Pasta do caso: ${dossie.links.pastaDrive}.`, confianca: 0.84 })
    }
  }
  if (/dossi[eê]|caso/.test(pergunta) && dossie.caso) {
    const partes = [
      dossie.caso.area ? `area ${dossie.caso.area}` : null,
      dossie.caso.tipo ? `tipo ${dossie.caso.tipo}` : null,
      dossie.documentacao ? `documentacao ${Number(dossie.documentacao.percentual || 0)}% completa` : null
    ].filter(Boolean)
    if (partes.length) return resposta({ origem: ORIGEM.DOSSIER, resposta: `Dossie: ${partes.join("; ")}.`, confianca: 0.82 })
  }
  return null
}

function responderHubSpot(pergunta, hubspot = {}) {
  const props = hubspot.properties || hubspot
  if (!Object.keys(objeto(props)).length) return null
  if (/stage|status|etapa/.test(pergunta) && props.dealstage) {
    return resposta({ origem: ORIGEM.HUBSPOT, resposta: `Status HubSpot: ${props.dealstage}.`, confianca: 0.78 })
  }
  if (/numero do caso|n[uú]mero do caso|protocolo/.test(pergunta) && props.numero_de_caso) {
    return resposta({ origem: ORIGEM.HUBSPOT, resposta: `Numero do caso: ${props.numero_de_caso}.`, confianca: 0.8 })
  }
  return null
}

function responderCalendar(pergunta, calendar = {}) {
  if (!Object.keys(objeto(calendar)).length) return null
  const inicio = calendar.inicio || calendar.datetime || calendar.start?.dateTime || calendar.start
  if (/consulta|agenda|audiencia|audi[eê]ncia|horario|hor[aá]rio/.test(pergunta) && inicio) {
    return resposta({ origem: ORIGEM.GOOGLE_CALENDAR, resposta: `Evento agendado para ${inicio}.`, confianca: 0.78 })
  }
  return null
}

async function fallbackIA(perguntaOriginal, contexto = {}, deps = {}) {
  const consultarGroq = deps.consultarGroq || deps.responderComGroq || deps.groq
  if (typeof consultarGroq !== "function") {
    return resposta({
      origem: ORIGEM.DESCONHECIDA,
      resposta: "Nao encontrei uma fonte deterministica para responder essa pergunta.",
      confianca: 0.2,
      usouIA: false
    })
  }
  const texto = await consultarGroq({ pergunta: perguntaOriginal, contexto })
  return resposta({
    origem: ORIGEM.GROQ,
    resposta: texto || "Nao foi possivel gerar uma resposta pela IA.",
    confianca: texto ? 0.55 : 0.25,
    usouIA: true
  })
}

async function consultarAssistenteJuridico(input = {}, deps = {}) {
  const perguntaOriginal = input.pergunta || ""
  const pergunta = normalizarTexto(perguntaOriginal)
  const contexto = input.contexto || {}
  if (!pergunta) {
    return resposta({
      origem: ORIGEM.DESCONHECIDA,
      resposta: "Informe uma pergunta para consulta operacional.",
      confianca: 0.1,
      usouIA: false
    })
  }

  const fontes = await montarFontes(contexto, deps)

  if (consultaChecklist(pergunta)) {
    const resultado = responderChecklist(pergunta, fontes.checklist)
    if (resultado) return resultado
  }
  if (consultaDivergencia(pergunta)) {
    return responderDivergencias(fontes.divergences)
  }
  if (consultaRegistry(pergunta)) {
    const resultado = responderRegistry(pergunta, fontes.registry)
    if (resultado) return resultado
  }
  if (consultaDossie(pergunta)) {
    const resultado = responderDossie(pergunta, fontes.dossier)
    if (resultado) return resultado
  }

  const hubspot = responderHubSpot(pergunta, fontes.hubspot)
  if (hubspot) return hubspot
  const calendar = responderCalendar(pergunta, fontes.calendar)
  if (calendar) return calendar

  if (requerIA(pergunta) || deps.usarIAParaDesconhecida === true) {
    return fallbackIA(perguntaOriginal, contexto, deps)
  }

  return resposta({
    origem: ORIGEM.DESCONHECIDA,
    resposta: "Nao encontrei uma fonte deterministica para responder essa pergunta.",
    confianca: 0.2,
    usouIA: false
  })
}

module.exports = {
  ORIGEM_LEGAL_ASSISTANT: ORIGEM,
  consultarAssistenteJuridico
}
