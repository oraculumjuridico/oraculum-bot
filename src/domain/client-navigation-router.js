function criarClientNavigationRouter({
  podeMostrarMenuCliente,
  setStage,
  iniciarTimer,
  getPrimeiroNomeRetomada,
  iniciarFluxoRelatoLivre,
  menuClienteComAudio,
  abrirNovoCasoCliente
}) {
  return async function processarNavegacaoCliente({ from, u, text }) {
    if (u.stage === "inicio") {
      if (podeMostrarMenuCliente(u)) {
        // Cliente retornando — perguntar se quer acompanhar ou abrir novo caso
        setStage(u, "inicio_retorno"); iniciarTimer(from)
        const nomeExib = getPrimeiroNomeRetomada(u)
        return {
          handled: true,
          response: {
            texto: `Que bom te ver novamente, *${nomeExib}* 😊\n\nVocê já possui um atendimento conosco.\n\n📄 Caso: *${u.numeroCaso}*\n⚖️ Área: ${u.area}\n\nO que deseja fazer?`,
            opcoes: [
            { id: "ret_acompanhar", title: "📊 Acompanhar meu caso" },
            { id: "ret_novo",       title: "➕ Abrir novo caso" }
            ]
          }
        }
      }
      return { handled: true, response: await iniciarFluxoRelatoLivre(from, u, { boasVindas: true }) }
    }

    if (u.stage === "inicio_retorno") {
      if (text === "ret_acompanhar") {
        if (!podeMostrarMenuCliente(u)) {
          return { handled: true, response: await iniciarFluxoRelatoLivre(from, u, { boasVindas: true }) }
        }
        setStage(u, "cliente"); iniciarTimer(from)
        return { handled: true, response: await menuClienteComAudio(from, u) }
      }
      if (text === "ret_novo") {
        return { handled: true, response: await abrirNovoCasoCliente(from, u) }
      }
    }

    return { handled: false, response: null }
  }
}

module.exports = {
  criarClientNavigationRouter
}
