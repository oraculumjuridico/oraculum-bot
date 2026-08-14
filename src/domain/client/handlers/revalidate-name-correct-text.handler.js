async function handle({
  decision,
  u,
  texto,
  from,
  extrairNomeDaCorrecaoExplicita,
  formatarNome,
  limparTextoSomenteLetras,
  ehNomeAparente,
  parecePuraNegacaoSemNome,
  sincronizarContatoNegocioHubSpot,
  gerarAudioAtendente,
  enviarAudio,
  urlAudioAtendente,
  esperar,
  logErro,
  iniciarTimer,
  responderComTimer,
  proximaConfirmacaoProgressiva
}) {
  if (
    decision?.nextAction !== "revalidate_name_correct_text" ||
    !texto ||
    texto === "revalida_nome_ok"
  ) {
    return { success: false, response: null }
  }

  const nomeCorrecaoRevalida = extrairNomeDaCorrecaoExplicita(texto)
  const nomeLimpo = nomeCorrecaoRevalida || formatarNome(limparTextoSomenteLetras(texto))
  if (ehNomeAparente(nomeLimpo, nomeCorrecaoRevalida ? nomeLimpo : texto) === true) {
    u.nome = nomeLimpo
    u.nomeConfirmado = true
    await sincronizarContatoNegocioHubSpot(u, { permitirAtualizacaoNome: true })
    if (!u.modoTexto) {
      try {
        const ogg = await gerarAudioAtendente(u.atendente, `Entendi! Nome atualizado para ${nomeLimpo}.`)
        await enviarAudio(from, urlAudioAtendente(ogg))
        await esperar(2000)
      } catch (e) { logErro("tts", "Falha áudio atualizar nome revalida", e) }
    }
    if (!Array.isArray(u._revalidaConfirmados)) u._revalidaConfirmados = []
    u._revalidaConfirmados.push("nome")
    return {
      success: true,
      response: await proximaConfirmacaoProgressiva(from, u)
    }
  }

  if (parecePuraNegacaoSemNome(texto)) {
    return { success: false, response: null }
  }

  iniciarTimer(from)
  return {
    success: true,
    response: responderComTimer(from, {
      texto: `👤 Etapa 2 de 6 · *SEU NOME*\n\nNão consegui identificar o nome. Por favor, informe apenas o nome completo. Pode falar ou digitar. 🎙️`,
      opcoes: [{ id: "revalida_nome_ok", title: "✅ Confirmar atual" }]
    })
  }
}

module.exports = { handle }
