"use strict"

const { STATES } = require("./post-human-document-analyzer")
const { DOCS_BASE, DOCS_EXTRA, getDocumentosListaCaso } = require("./documents-core")
const {
  CAMPOS_ADMIN_ASSISTIDO,
  perguntaCampoAdminAssistido
} = require("./admin-assisted-ai-schema")

function catalogoDocumentalCanonico(usuario) {
  const documentosDoCaso = getDocumentosListaCaso(usuario)
  const documentosConhecidos = [
    ...documentosDoCaso,
    ...DOCS_BASE,
    ...Object.values(DOCS_EXTRA).flat()
  ]
  const labels = new Map()
  for (const documento of documentosConhecidos) {
    if (documento?.id && documento?.label && !labels.has(documento.id)) {
      labels.set(documento.id, documento.label)
    }
  }
  return labels
}

function nomesDocumentos(items, usuario) {
  const labels = catalogoDocumentalCanonico(usuario)
  return (items || []).map(item => {
    const id = typeof item === "object" ? String(item?.id || "") : String(item || "")
    const labelInformado = typeof item === "object" ? String(item?.label || "") : ""
    const label = labels.get(id) || labelInformado || (!/^doc_/i.test(id) ? id : "")
    if (!label) throw new Error(`codigo_documento_sem_rotulo_canonico:${id}`)
    return label
  })
}

function construirSolicitacaoDocumentos(items, usuario) {
  const linhas = nomesDocumentos(items, usuario).map(label => `📎 *${label}*`).join("\n")
  return {
    tipo: "documentos",
    texto: [
      "👋 Olá! Para dar continuidade ao seu atendimento, identificamos alguns documentos que ainda estão pendentes.",
      "",
      "📄 *DOCUMENTOS PENDENTES*",
      "",
      linhas,
      "",
      "Você pode enviar os documentos que já possui e completar os demais posteriormente.",
      "",
      `📁 *Caso: ${usuario.numeroCaso || ""}*`,
      "",
      "👇 Para enviar documentos ou continuar seu atendimento, acesse o *Menu do Cliente* abaixo."
    ].join("\n")
  }
}

function construirSolicitacao(analise, usuario = {}) {
  switch (analise.estado) {
    case STATES.SEM_DOCUMENTOS:
      return construirSolicitacaoDocumentos(analise.ausentes || analise.listaDocumental, usuario)
    case STATES.DOCUMENTOS_PARCIAIS:
      return construirSolicitacaoDocumentos([...(analise.ausentes || []), ...(analise.parciais || [])], usuario)
    case STATES.DOCUMENTOS_COMPLETOS:
      return { tipo: "nenhuma", texto: "Recebemos a documentação necessária. O caso seguirá para análise." }
    case STATES.DOCUMENTOS_NAO_ANALISADOS:
      return { tipo: "revisao", texto: "Recebemos seus arquivos e eles estão em análise. Avisaremos quando a conferência terminar." }
    case STATES.INFORMACOES_COMPLEMENTARES_PENDENTES: {
      const campo = analise.camposPendentes?.[0]
      return campo && CAMPOS_ADMIN_ASSISTIDO[campo]
        ? { tipo: "informacoes", campo, campos: analise.camposPendentes, texto: `${perguntaCampoAdminAssistido(campo)} Você também pode responder “respondo depois”.` }
        : { tipo: "revisao", texto: "Estamos revisando as informações do seu caso e retornaremos por aqui." }
    }
    default:
      return { tipo: "revisao", texto: "Estamos revisando as informações do seu caso e retornaremos por aqui." }
  }
}

module.exports = { construirSolicitacao }
