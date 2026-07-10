const { sanitizarTextoEntrada } = require("../utils/text")
const { criarDossieJuridico } = require("./legal-dossier")

const LIMITE_DIVERGENCIAS = 3
const LIMITE_PDFS = 3
const LIMITE_COPILOTO = 4

function normalizarArray(valor) {
  return Array.isArray(valor) ? valor : []
}

function texto(valor, fallback = "-") {
  const sanitizado = sanitizarTextoEntrada(valor)
  return sanitizado || fallback
}

function primeiroObjeto(...valores) {
  return valores.find(valor => valor && typeof valor === "object" && !Array.isArray(valor)) || null
}

function obterDocumentRegistryCaso(item = {}) {
  const u = item?.u || item || {}
  return primeiroObjeto(
    item.documentRegistry,
    item.registryDocumental,
    item.registry,
    item.dossieDocumental?.registry,
    u.documentRegistry,
    u.registryDocumental,
    u.documentosRegistry,
    u.registry,
    u.dossieDocumental?.registry
  )
}

function documentRegistryTemDocumentosProcessados(registry = null) {
  return normalizarArray(registry?.documentos).some(documento =>
    documento &&
    documento.vigente !== false &&
    !["erro", "pendente"].includes(String(documento.status || "").toLowerCase())
  )
}

function obterClienteCaso(item = {}) {
  const u = item?.u || item || {}
  return {
    nome: u.nome || u.nomeWA || u.nomePerfilWhatsApp || null,
    cpf: u.cpf || u.cpfCliente || null,
    telefone: u.whatsappContato || item.from || u._numero || null,
    cidade: u.cidade || null,
    uf: u.uf || null
  }
}

function obterNegocioCaso(item = {}) {
  const u = item?.u || item || {}
  return {
    properties: {
      numero_de_caso: u.numeroCaso || null,
      area_juridica: u.area || null,
      tipo_de_caso: u.tipo || u.situacao || null,
      pasta_drive: u.pastaDriveLink || null
    }
  }
}

function formatarDivergencia(divergencia = {}) {
  const campo = texto(divergencia.campo || divergencia.tipo || divergencia.code, "campo nao identificado")
  const gravidade = texto(divergencia.gravidade, "gravidade nao informada")
  const docA = texto(divergencia.documentoA?.tipoDocumento || divergencia.documentoA?.nome, "")
  const docB = texto(divergencia.documentoB?.tipoDocumento || divergencia.documentoB?.nome, "")
  const origem = [docA, docB].filter(Boolean).join(" x ")
  return origem ? `- ${campo} (${gravidade}) em ${origem}` : `- ${campo} (${gravidade})`
}

function formatarPdf(pdf = {}) {
  const nome = texto(pdf.arquivo || pdf.tipo, "PDF")
  const link = texto(pdf.drive?.webViewLink || pdf.webViewLink, "")
  return link ? `- ${nome}: ${link}` : `- ${nome}`
}

function formatarListaCurta(itens = [], vazio, formatador = item => `- ${texto(item)}`, limite = LIMITE_COPILOTO) {
  const lista = normalizarArray(itens).filter(Boolean)
  if (!lista.length) return [`- ${vazio}`]
  return lista.slice(0, limite).map(formatador)
}

function formatarCopiloto(dossie = {}) {
  const copiloto = dossie.copiloto || {}
  const linhas = []
  linhas.push(...formatarListaCurta(copiloto.riscos, "Sem risco documental automatico."))
  if (normalizarArray(copiloto.documentosSugeridos).length) {
    linhas.push(`- Solicitar: ${copiloto.documentosSugeridos.slice(0, LIMITE_COPILOTO).join(", ")}`)
  }
  if (normalizarArray(copiloto.observacoes).length) {
    linhas.push(...copiloto.observacoes.slice(0, 2).map(item => `- ${texto(item)}`))
  }
  return linhas
}

function montarResumoDossieJuridicoWhatsApp(dossie = {}) {
  const cliente = dossie.cliente || {}
  const caso = dossie.caso || {}
  const documentacao = dossie.documentacao || {}
  const recebidos = normalizarArray(documentacao.recebidos).length
  const pendentes = normalizarArray(documentacao.pendentes).length
  const percentual = Math.max(0, Math.min(100, Number(documentacao.percentual || 0)))
  const divergencias = normalizarArray(dossie.divergencias)
  const pdfs = normalizarArray(dossie.pdfs)

  return [
    "📁 *Dossiê Jurídico*",
    "",
    "👤 *Cliente:*",
    texto(cliente.nome, "Nome nao identificado"),
    texto(cliente.cpf, "CPF nao identificado"),
    "",
    "⚖️ *Caso:*",
    texto(caso.area, "Area nao definida"),
    texto(caso.tipo, "Tipo nao definido"),
    "",
    "📄 *Documentação*",
    "",
    `✅ Recebidos: ${recebidos}`,
    "",
    `❌ Pendentes: ${pendentes}`,
    "",
    `📊 Completo: ${percentual}%`,
    "",
    "⚠️ *Divergências*",
    "",
    ...formatarListaCurta(divergencias, "Nenhuma divergencia identificada.", formatarDivergencia, LIMITE_DIVERGENCIAS),
    "",
    "📎 *PDFs*",
    "",
    ...formatarListaCurta(pdfs, "Nenhum PDF gerado.", formatarPdf, LIMITE_PDFS),
    "",
    "🤖 *Copiloto*",
    "",
    ...formatarCopiloto(dossie)
  ].join("\n")
}

function montarDossieJuridicoAdminWhatsApp(item = {}, options = {}) {
  const registry = obterDocumentRegistryCaso(item)
  if (!documentRegistryTemDocumentosProcessados(registry)) return ""

  const dossie = criarDossieJuridico({
    registry,
    cliente: obterClienteCaso(item),
    negocio: obterNegocioCaso(item),
    caso: {
      area: item?.u?.area || registry.metadados?.area_juridica || registry.metadados?.areaJuridica || null,
      tipo: item?.u?.tipo || item?.u?.situacao || registry.metadados?.tipo_de_caso || registry.metadados?.tipoCaso || null,
      numeroHubSpot: item?.u?.numeroCaso || registry.metadados?.numeroCaso || registry.metadados?.casoId || null
    }
  }, options)

  return montarResumoDossieJuridicoWhatsApp(dossie)
}

module.exports = {
  obterDocumentRegistryCaso,
  documentRegistryTemDocumentosProcessados,
  montarResumoDossieJuridicoWhatsApp,
  montarDossieJuridicoAdminWhatsApp
}
