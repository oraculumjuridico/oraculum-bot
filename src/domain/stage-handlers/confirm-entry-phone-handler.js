async function handleConfirmEntryPhone({
  u,
  texto,
  from,
  stages,
  normalizarTelefone,
  formatarTelefoneExibicao,
  gerarAudioAtendente,
  enviarAudio,
  urlAudioAtendente,
  esperar,
  logErro
}) {
  if (
    u.stage !== stages.CONFIRMAR_ENTRADA ||
    !texto ||
    texto === "entrada_ok" ||
    texto === "entrada_corrigir" ||
    u._entradaPendenteTipo !== "telefone"
  ) {
    return { handled: false, response: null }
  }

  const telNorm = normalizarTelefone(texto)
  if (!telNorm || telNorm.replace(/\D/g, "").length < 12) {
    return { handled: false, response: null }
  }

  u._entradaPendenteValor = telNorm
  const label = formatarTelefoneExibicao(telNorm)
  if (!u.modoTexto) {
    try {
      const ogg = await gerarAudioAtendente(u.atendente, `Entendi! O número é ${label}. Está correto? Se não estiver, me diga o número correto agora.`)
      await enviarAudio(from, urlAudioAtendente(ogg))
      await esperar(4000)
    } catch (e) { logErro("tts", "Falha áudio reconfirmar telefone entrada", e) }
  }
  return {
    handled: true,
    response: {
      texto: `●●●●○○ 📱 Etapa 4 de 6 · *WhatsApp*\n\nVocê informou: *${label}*\nEstá correto? Se não estiver, é só me dizer o número correto agora. Pode falar ou digitar. 🎙️`,
      opcoes: [{ id: "entrada_ok", title: "✅ Confirmar" }]
    }
  }
}

module.exports = {
  handleConfirmEntryPhone
}
