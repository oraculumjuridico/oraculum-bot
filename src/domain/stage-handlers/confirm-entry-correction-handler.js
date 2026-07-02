async function handleConfirmEntryCorrection({
  u,
  texto,
  from,
  stages,
  iniciarTimer,
  gerarAudioAtendente,
  enviarAudio,
  urlAudioAtendente,
  esperar,
  logErro
}) {
  if (u.stage !== stages.CONFIRMAR_ENTRADA || texto !== "entrada_corrigir") {
    return { handled: false, response: null }
  }

  // Legado: se alguém ainda enviar esse payload (ex: mensagem antiga), orienta a dizer a correção
  iniciarTimer(from)
  if (!u.modoTexto) {
    try {
      const ogg = await gerarAudioAtendente(u.atendente, "Sem problema. Me diga a informação correta agora, pode falar ou digitar.")
      await enviarAudio(from, urlAudioAtendente(ogg))
      await esperar(3000)
    } catch (e) { logErro("tts", "Falha áudio orientar correção entrada", e) }
  }
  return {
    handled: true,
    response: {
      texto: "Sem problema! Me diga a informação correta agora. Pode falar ou digitar. 🎙️",
      opcoes: null
    }
  }
}

module.exports = {
  handleConfirmEntryCorrection
}
