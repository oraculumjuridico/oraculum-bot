const templateConsultaHandler = require("./conversation-context-handlers/template-consulta.handler")
const templateReengajamentoHandler = require("./conversation-context-handlers/template-reengajamento.handler")

function criarConversationContextRegistry() {
  const handlers = new Map()

  function registrar(handler) {
    if (!handler || typeof handler !== "object") return false
    const tipo = String(handler.tipo || "").trim()
    if (!tipo) return false
    handlers.set(tipo, handler)
    return true
  }

  function obter(tipo) {
    return handlers.get(String(tipo || "").trim()) || null
  }

  function listar() {
    return Array.from(handlers.keys())
  }

  return {
    registrar,
    obter,
    listar
  }
}

const defaultConversationContextRegistry = criarConversationContextRegistry()
defaultConversationContextRegistry.registrar(templateConsultaHandler)
defaultConversationContextRegistry.registrar(templateReengajamentoHandler)

module.exports = {
  criarConversationContextRegistry,
  defaultConversationContextRegistry
}
