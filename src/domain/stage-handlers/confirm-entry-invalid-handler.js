async function handleConfirmEntryInvalid({
  u,
  from,
  stages,
  iniciarTimer
}) {
  if (u.stage !== stages.CONFIRMAR_ENTRADA) {
    return { handled: false, response: null }
  }

  iniciarTimer(from)
  return {
    handled: true,
    response: {
      texto: "Confirme a informação ou me diga a correção agora. Pode falar ou digitar. 🎙️",
      opcoes: [{ id: "entrada_ok", title: "✅ Confirmar" }]
    }
  }
}

module.exports = {
  handleConfirmEntryInvalid
}
