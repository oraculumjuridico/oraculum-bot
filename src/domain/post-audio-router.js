function criarPostAudioRouter({
  STAGES,
  executarRecomecoFluxo,
  executarEncerramentoFluxo,
  retomarUltimaPergunta,
  iniciarTimer,
  responderComTimer,
  telaAudioNoFluxo,
  aplicarSugestaoFluxoOutro,
  setStage,
  sincronizarNegocio,
  telaDescreverCaso
}) {
  return async function processarPosAudio({ from, u, text }) {
    if (u.stage === STAGES.AUDIO_FLUXO_CONFIRMA) {
      const acao = u._audioFluxoAcao || "continuar"
      if (text === "audio_fluxo_recomecar") {
        u._audioFluxoTexto = null
        u._audioFluxoAcao = null
        u._audioFluxoResposta = null
        return { handled: true, response: await executarRecomecoFluxo(from, u) }
      }
      if (text === "audio_fluxo_encerrar") {
        u._audioFluxoTexto = null
        u._audioFluxoAcao = null
        u._audioFluxoResposta = null
        return { handled: true, response: await executarEncerramentoFluxo(from, u) }
      }
      if (text === "audio_fluxo_seguir") {
        u._audioFluxoTexto = null
        u._audioFluxoResposta = null
        u._audioFluxoAcao = null
        if (acao === "recomecar") return { handled: true, response: await executarRecomecoFluxo(from, u) }
        if (acao === "encerrar") return { handled: true, response: await executarEncerramentoFluxo(from, u) }
        const ultimaPergunta = retomarUltimaPergunta(u)
        if (ultimaPergunta) {
          iniciarTimer(from)
          return { handled: true, response: ultimaPergunta }
        }
        return { handled: true, response: await executarRecomecoFluxo(from, u) }
      }
      return { handled: true, response: responderComTimer(from, telaAudioNoFluxo(u._audioFluxoTexto || "", u._audioFluxoResposta || "continuar o atendimento")) }
    }

    if (u.stage === STAGES.SUGESTAO_FLUXO_OUTRO) {
      if (text === "sug_fluxo" && u._sugestaoFluxo?.categoria) {
        aplicarSugestaoFluxoOutro(u, u._sugestaoFluxo.categoria)
        u._sugestaoFluxo = null
        setStage(u, STAGES.GATILHO)
        await sincronizarNegocio(u)
        iniciarTimer(from)
        return { handled: true, response: { texto: "✅ Certo! Vamos registrar sua solicitação.", opcoes: [{ id: "cont", title: "▶️ Continuar" }] } }
      }
      if (text === "sug_nao") {
        u._sugestaoFluxo = null
        setStage(u, STAGES.COLETA_DESC_AUDIO)
        iniciarTimer(from)
        return { handled: true, response: telaDescreverCaso() }
      }
      return { handled: false, response: null }
    }

    if (u.stage === STAGES.EXPLICAR_TUDO_OFERTA) {
      if (text === "explicar_tudo") {
        u._descOrigemStage = "explicar_tudo"
        setStage(u, STAGES.COLETA_DESC_AUDIO)
        iniciarTimer(from)
        return { handled: true, response: telaDescreverCaso() }
      }
      if (text === "seguir_fluxo") {
        u._proximoStageAposDescricao = null
        u._proximaPerguntaAposDescricao = null
        setStage(u, STAGES.GATILHO)
        iniciarTimer(from)
        return { handled: true, response: { texto: "✅ Certo! Vamos registrar sua solicitação.", opcoes: [{ id: "cont", title: "▶️ Continuar" }] } }
      }
      setStage(u, STAGES.COLETA_DESC_AUDIO)
      iniciarTimer(from)
      return { handled: true, response: telaDescreverCaso() }
    }

    return { handled: false, response: null }
  }
}

module.exports = {
  criarPostAudioRouter
}
