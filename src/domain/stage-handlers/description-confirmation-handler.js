async function handleDescriptionConfirmation({
  u,
  texto,
  from,
  stages,
  normalizarTextoCRM,
  sincronizarNegocio,
  respostaAposConfirmarDescricao,
  entrarEtapaDescricao,
  iniciarTimer,
  telaDescreverCaso
}) {
  if (u.stage !== stages.DESC_CONFIRMA) {
    return { handled: false, response: null }
  }

  if (texto === "desc_ok") {
    u.descricao = normalizarTextoCRM((u._descTemp || "").trim())
    u._descTemp  = null
    await sincronizarNegocio(u)
    return { handled: true, response: await respostaAposConfirmarDescricao(from, u) }
  }
  if (texto === "desc_corrigir") {
    if (u._audioDescBuffer) {
      u.audiosDescCorrigidos.push({
        buffer: u._audioDescBuffer,
        mimeType: u._audioDescMime,
        nome: u._audioDescNome
      })
    }
    u._descTemp = null
    u._audioDescBuffer = null
    u._audioDescMime = null
    u._audioDescNome = null
    entrarEtapaDescricao(u, u._descOrigemStage === "explicar_tudo" ? stages.COLETA_DESC_AUDIO : (u._descOrigemStage || stages.COLETA_DESC_AUDIO))
    iniciarTimer(from)
    return { handled: true, response: telaDescreverCaso() }
  }
  iniciarTimer(from)
  return {
    handled: true,
    response: {
      texto: "Transcrição recebida.",
      opcoes: [
      { id: "desc_ok", title: "✅ Confirmar" },
      { id: "desc_corrigir", title: "✏️ Corrigir" }
      ]
    }
  }
}

module.exports = {
  handleDescriptionConfirmation
}
