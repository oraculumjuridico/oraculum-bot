async function handle({
  u,
  texto,
  from,
  stages,
  iniciarTimer
}) {
  if (
    u.stage !== stages.CONFIRMAR_ENTRADA ||
    !texto ||
    texto === "entrada_ok" ||
    texto === "entrada_corrigir" ||
    u._entradaPendenteTipo === "cidade"
  ) {
    return { success: false, response: null }
  }

  iniciarTimer(from)
  return {
    success: true,
    response: {
      texto: "Não consegui identificar a informação. Por favor, me diga novamente. Pode falar ou digitar. 🎙️",
      opcoes: null
    }
  }
}

module.exports = { handle }
