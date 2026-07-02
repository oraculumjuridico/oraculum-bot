async function handle({
  decision,
  u,
  texto,
  from,
  mapearRegiaoPorUF,
  estadoPorExtenso,
  gerarAudioAtendente,
  enviarAudio,
  urlAudioAtendente,
  esperar,
  logErro,
  proximaConfirmacaoProgressiva
}) {
  if (
    decision?.nextAction !== "revalidate_city_select" ||
    !Array.isArray(u._cidadesMultiplas)
  ) {
    return { success: false, response: null }
  }

  if (typeof texto !== "string" || !texto.startsWith("revalida_cidade_multipla_")) {
    return { success: false, response: null }
  }

  const idx = parseInt(texto.replace("revalida_cidade_multipla_", ""), 10)
  const escolhida = u._cidadesMultiplas[idx]
  if (!escolhida) {
    return { success: false, response: null }
  }

  u.cidade = escolhida.cidade
  u.uf = escolhida.uf
  u.regiao = escolhida.regiao || mapearRegiaoPorUF(escolhida.uf)
  delete u._cidadesMultiplas
  if (!u.modoTexto) {
    try {
      const estadoFull = estadoPorExtenso(escolhida.uf) || escolhida.uf || ""
      const ogg = await gerarAudioAtendente(u.atendente, `Entendi! Cidade atualizada para ${escolhida.cidade}${estadoFull ? ", " + estadoFull : ""}.`)
      await enviarAudio(from, urlAudioAtendente(ogg))
      await esperar(2000)
    } catch (e) { logErro("tts", "Falha áudio cidade multipla revalida", e) }
  }
  if (!Array.isArray(u._revalidaConfirmados)) u._revalidaConfirmados = []
  u._revalidaConfirmados.push("cidade")
  return {
    success: true,
    response: await proximaConfirmacaoProgressiva(from, u)
  }
}

module.exports = { handle }
