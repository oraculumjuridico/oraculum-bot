"use strict"

const { STATES } = require("./post-human-document-analyzer")
const {
  CAMPOS_ADMIN_ASSISTIDO,
  perguntaCampoAdminAssistido
} = require("./admin-assisted-ai-schema")

function list(items) { return (items || []).map(item => `• ${item}`).join("\n") }

function construirSolicitacao(analise, usuario = {}) {
  switch (analise.estado) {
    case STATES.SEM_DOCUMENTOS:
      return { tipo: "documentos", texto: `Para continuarmos o caso ${usuario.numeroCaso || ""}, envie:\n${list(analise.ausentes || analise.listaDocumental)}\nVocê pode enviar os arquivos por aqui.` }
    case STATES.DOCUMENTOS_PARCIAIS:
      return { tipo: "documentos", texto: `Recebemos: ${analise.recebidos.join(", ") || "parte dos documentos"}.\nAinda precisamos de:\n${list([...analise.ausentes, ...analise.parciais])}` }
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
