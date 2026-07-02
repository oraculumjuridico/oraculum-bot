async function handleConfirmEntryCorrectedName({
  u,
  texto,
  from,
  stages,
  extrairNomeDaCorrecaoExplicita,
  formatarNome,
  limparTextoSomenteLetras,
  ehNomeAparente,
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
    u._entradaPendenteTipo !== "nome"
  ) {
    return { handled: false, response: null }
  }

  const nomeLimpo = extrairNomeDaCorrecaoExplicita(texto) || formatarNome(limparTextoSomenteLetras(texto))
  if (ehNomeAparente(nomeLimpo, nomeLimpo !== formatarNome(limparTextoSomenteLetras(texto)) ? nomeLimpo : texto) !== true) {
    return { handled: false, response: null }
  }

  u._entradaPendenteValor = nomeLimpo
  const barra = "●●○○○○ 👤 Etapa 2 de 6 · *Nome*\n\n"
  if (!u.modoTexto) {
    try {
      const ogg = await gerarAudioAtendente(u.atendente, `Entendi! O nome é ${nomeLimpo}. Está correto? Se não estiver, me diga o nome correto agora.`)
      await enviarAudio(from, urlAudioAtendente(ogg))
      await esperar(4000)
    } catch (e) { logErro("tts", "Falha áudio reconfirmar nome entrada", e) }
  }
  return {
    handled: true,
    response: {
      texto: `${barra}Você informou: *${nomeLimpo}*\nEstá correto? Se não estiver, é só me dizer o nome correto agora. Pode falar ou digitar. 🎙️`,
      opcoes: [{ id: "entrada_ok", title: "✅ Confirmar" }]
    }
  }
}

module.exports = {
  handleConfirmEntryCorrectedName
}
