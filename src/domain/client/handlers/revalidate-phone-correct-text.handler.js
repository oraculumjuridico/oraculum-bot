async function handle({
  decision,
  u,
  texto,
  from,
  normalizarTelefone,
  formatarTelefoneExibicao,
  gerarAudioAtendente,
  enviarAudio,
  urlAudioAtendente,
  esperar,
  logErro,
  iniciarTimer,
  responderComTimer,
  voltarParaConfirmacao,
  proximaConfirmacaoProgressiva,
  flowAcolhimentoCidade
}) {
  if (
    decision?.nextAction !== "revalidate_phone_correct_text" ||
    !texto ||
    texto === "revalida_whatsapp_ok"
  ) {
    return { success: false, response: null }
  }

  const telNorm = normalizarTelefone(texto)
  if (telNorm && telNorm.replace(/\D/g, "").length >= 12) {
    u.whatsappContato = telNorm
    u.whatsappVerificado = true
    u.telefoneEhDoCliente = !u.atendimentoParaTerceiro
    const label = formatarTelefoneExibicao(telNorm)
    if (u._corrigindoWhatsappConfirmacao && !u.modoTexto) {
      try {
        const ogg = await gerarAudioAtendente(u.atendente, `Entendi! Vou usar o número ${label}.`)
        await enviarAudio(from, urlAudioAtendente(ogg))
        await esperar(2000)
      } catch (e) { logErro("tts", "Falha áudio novo número revalida", e) }
    }
    if (u._corrigindoWhatsappConfirmacao) {
      delete u._corrigindoWhatsappConfirmacao
      return {
        success: true,
        response: responderComTimer(from, await voltarParaConfirmacao(from, u))
      }
    }
    if (u._revalidandoCampos) {
      if (!Array.isArray(u._revalidaConfirmados)) u._revalidaConfirmados = []
      u._revalidaConfirmados.push("whatsapp")
      return {
        success: true,
        response: await proximaConfirmacaoProgressiva(from, u, {
          introducaoAudio: `Entendi! Vou usar o número ${label}.`
        })
      }
    }
    return {
      success: true,
      response: await flowAcolhimentoCidade(u, {
        from,
        introducaoAudio: `Entendi! Vou usar o número ${label}.`
      })
    }
  }

  iniciarTimer(from)
  return {
    success: true,
    response: responderComTimer(from, {
      texto: `📱 Etapa 4 de 6 · *WHATSAPP*\n\nNão consegui identificar o número. Informe com DDD. Pode falar ou digitar. 🎙️`,
      opcoes: [{ id: "revalida_whatsapp_ok", title: "✅ Confirmar atual" }]
    })
  }
}

module.exports = { handle }
