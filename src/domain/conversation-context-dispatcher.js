const { obterContextoConversaAtivo } = require("./conversation-context")
const { defaultConversationContextRegistry } = require("./conversation-context-registry")

function criarEnvelopeMensagemContexto({
  from = "",
  nomeWA = "",
  text = "",
  msgObj = null,
  recebidoEm = Date.now()
} = {}) {
  const buttonId = String(msgObj?.interactive?.button_reply?.id || "").trim()
  const listId = String(msgObj?.interactive?.list_reply?.id || "").trim()
  const tipoMensagem = String(msgObj?.type || "").trim()

  return {
    canal: "whatsapp",
    from: String(from || "").trim(),
    nomeWA: String(nomeWA || "").trim(),
    messageId: String(msgObj?.id || "").trim(),
    tipoEntrada: buttonId ? "botao" : listId ? "lista" : tipoMensagem || "texto",
    texto: String(text || "").trim(),
    buttonId,
    listId,
    audioId: String(msgObj?.audio?.id || msgObj?.voice?.id || "").trim(),
    rawMessage: msgObj,
    recebidoEm
  }
}

async function dispatchConversationContext({
  from,
  nomeWA,
  text,
  msgObj,
  usuario,
  registry = defaultConversationContextRegistry,
  agora = Date.now()
} = {}) {
  const contexto = obterContextoConversaAtivo(usuario, agora)
  if (!contexto) return { consumiu: false, seguirFluxoNormal: true }

  const handler = registry?.obter?.(contexto.tipo)
  if (!handler || typeof handler.processar !== "function") {
    return { consumiu: false, seguirFluxoNormal: true }
  }

  const envelope = criarEnvelopeMensagemContexto({ from, nomeWA, text, msgObj, recebidoEm: agora })
  const resultado = await handler.processar({ envelope, contexto, usuario })
  if (!resultado || resultado.consumiu !== true) {
    return { consumiu: false, seguirFluxoNormal: true }
  }

  return {
    consumiu: true,
    seguirFluxoNormal: resultado.seguirFluxoNormal === true,
    resposta: resultado.resposta || null
  }
}

module.exports = {
  criarEnvelopeMensagemContexto,
  dispatchConversationContext
}
