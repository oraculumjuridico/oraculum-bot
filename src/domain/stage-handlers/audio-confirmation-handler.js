async function handleAudioConfirmation({
  u,
  texto,
  from,
  stages,
  setStage,
  iniciarTimer,
  telaConfirmarAreaAudio,
  responderComTimer,
  classificarAreaAudio,
  aplicarClassificacaoJuridica,
  gerarAudioAtendente,
  enviarAudio,
  urlAudioAtendente,
  esperar,
  logErro,
  normalizarTextoCRM,
  telaConfirmarTranscricao
}) {
  if (u.stage !== stages.AUDIO_CONFIRMAR_TRANSCRICAO) {
    return { handled: false, response: null }
  }

  const seguirAposClassificacaoAudio = async () => {
    setStage(u, stages.AUDIO_CONFIRMAR_AREA_CANAL)
    iniciarTimer(from)
    return await telaConfirmarAreaAudio(from, u)
  }
  if (texto === "audio_transcricao_ok") {
    if (!u._audioCanalTranscricao) {
      iniciarTimer(from)
      return { handled: true, response: responderComTimer(from, { texto: "Não encontrei a transcrição anterior. Envie seu áudio novamente, por favor.", opcoes: [{ id: "audio_enviar", title: "🎤 Enviar áudio" }] }) }
    }
    const classificacao = await classificarAreaAudio(u._audioCanalTranscricao)
    aplicarClassificacaoJuridica(u, classificacao)
    return { handled: true, response: await seguirAposClassificacaoAudio() }
  }
  if (texto === "audio_transcricao_novo") {
    setStage(u, stages.AUDIO_AGUARDANDO)
    iniciarTimer(from)
    try {
      const ogg = await gerarAudioAtendente(u.atendente,
        `Tudo bem! Pode enviar um novo áudio agora. Fale com calma explicando sua situação.`)
      await enviarAudio(from, urlAudioAtendente(ogg))
      await esperar(3000)
    } catch (e) { logErro("tts", "Falha áudio novo envio", e) }
    return {
      handled: true,
      response: {
        texto: `🎙️ Pode enviar seu novo áudio agora.\n\n_Fale com calma. Estou aqui para ouvir você._`,
        opcoes: null
      }
    }
  }
  if (texto === "audio_transcricao_texto") {
    iniciarTimer(from)
    try {
      const ogg = await gerarAudioAtendente(u.atendente,
        `Tudo bem! Digite agora sua situação com suas próprias palavras. Pode escrever à vontade.`)
      await enviarAudio(from, urlAudioAtendente(ogg))
      await esperar(3000)
    } catch (e) { logErro("tts", "Falha áudio corrigir texto", e) }
    return {
      handled: true,
      response: {
        texto: `✍️ Digite abaixo sua situação com suas próprias palavras.\n\n_Escreva à vontade. Estou aqui para ajudar._`,
        opcoes: null
      }
    }
  }
  if (texto) {
    u._audioCanalTranscricao = normalizarTextoCRM(texto)
    const classificacao = await classificarAreaAudio(u._audioCanalTranscricao)
    aplicarClassificacaoJuridica(u, classificacao)
    return { handled: true, response: await seguirAposClassificacaoAudio() }
  }
  iniciarTimer(from)
  return { handled: true, response: responderComTimer(from, await telaConfirmarTranscricao(from, u.atendente, u._audioCanalTranscricao || "", u.area)) }
}

module.exports = {
  handleAudioConfirmation
}
