async function handleConfirmEntryFinalAcceptance({
  u,
  texto,
  from,
  stages,
  limparEntradaPendente,
  sincronizarContatoNegocioHubSpot,
  setStage,
  iniciarTimer,
  primeiroNomeCliente,
  enviarAudioModoVoz,
  flowAcolhimentoConfirmaWhatsapp,
  normalizarNumeroWhatsAppEnvio,
  flowAcolhimentoCidade,
  voltarParaConfirmacao,
  enviarAudioPedidoCidade,
  aproveitarRelatoAudioClienteNovoCaso,
  respostaRecomecoMenuPrincipal,
  telaConfirmarDadosAudio,
  iniciarFluxoRelatoLivre
}) {
  if (u.stage !== stages.CONFIRMAR_ENTRADA || texto !== "entrada_ok") {
    return { handled: false, response: null }
  }

  const origem = u._entradaPendenteOrigem
  const tipo = u._entradaPendenteTipo
  const valor = u._entradaPendenteValor
  if (!["nome", "telefone", "cidade"].includes(tipo)) {
    return { handled: false, response: null }
  }
  limparEntradaPendente(u)
  if (tipo === "nome") {
    u.nome = valor
    u.nomeConfirmado = true
    if (!(u._novoCasoParaTerceiro && !u.whatsappContato)) {
      await sincronizarContatoNegocioHubSpot(u, { permitirAtualizacaoNome: true })
    }
    if (origem === "coleta_tel_outro") {
      setStage(u, "coleta_tel_wpp"); iniciarTimer(from)
      const primeiroNome = primeiroNomeCliente(u) || "você"
      await enviarAudioModoVoz(from, u, `Agora preciso do WhatsApp com DDD de ${primeiroNome}. Pode falar em áudio ou digitar.`, "novo caso terceiro whatsapp")
      return { handled: true, response: { texto: `📱 Etapa 4 de 6 · *WHATSAPP*\n\nQual é o WhatsApp com DDD de *${primeiroNome}* para contato da equipe?`, opcoes: null } }
    }
    iniciarTimer(from)
    return { handled: true, response: await flowAcolhimentoConfirmaWhatsapp(u, { from }) }
  }
  if (tipo === "telefone") {
    u.whatsappContato = normalizarNumeroWhatsAppEnvio(valor)
    if (origem === "coleta_tel_wpp_contato") {
      // Se nome já foi coletado (fluxo de terceiro via assessoria), avança para cidade
      if (u.nomeConfirmado && u.nome) {
        u.whatsappVerificado = true
        // Para si: número alternativo informado ainda é do cliente → true. Para terceiro → false.
        u.telefoneEhDoCliente = !u.atendimentoParaTerceiro
        iniciarTimer(from)
        return { handled: true, response: await flowAcolhimentoCidade(u, { from }) }
      }
      setStage(u, "coleta_nome"); iniciarTimer(from)
      return { handled: true, response: { texto: "👤 Etapa 2 de 6 · *NOME DA PESSOA ATENDIDA*\n\nQual é o nome completo da pessoa que será atendida?", opcoes: null } }
    }
    if (origem === "coleta_tel_wpp") {
      u.whatsappVerificado = true
      u.telefoneEhDoCliente = u._novoCasoParaTerceiro ? false : true
      if (u._corrigindoWhatsappConfirmacao) {
        delete u._corrigindoWhatsappConfirmacao
        return { handled: true, response: await voltarParaConfirmacao(from, u) }
      }
      if (u._novoCasoParaTerceiro) {
        setStage(u, stages.ACOLHIMENTO_CIDADE); iniciarTimer(from)
        if (u.modoTexto !== true) {
          const nomeTerceiro = u.nome ? u.nome.split(" ")[0] : null
          await enviarAudioPedidoCidade(from, u.atendente, { nomeTerceiro })
        }
        return {
          handled: true,
          response: {
            texto: `📍 Etapa 5 de 6 · *CIDADE*\n\nAgora, em qual cidade a pessoa atendida mora?\n\nSe preferir, pode informar o CEP também.`,
            opcoes: null
          }
        }
      }
      if (u._novoCasoDeCliente) {
        const relatoPendente = await aproveitarRelatoAudioClienteNovoCaso(from, u)
        if (relatoPendente) return { handled: true, response: relatoPendente }
        setStage(u, stages.AUDIO_AGUARDANDO); iniciarTimer(from)
        await enviarAudioModoVoz(from, u, "Número registrado. Agora me conte a nova situação. Pode falar em áudio ou digitar.", "novo caso terceiro relato")
        return {
          handled: true,
          response: {
            texto: `Número registrado. ✅\n\nAgora me conte a nova situação. Pode falar em áudio ou digitar.`,
            opcoes: null
          }
        }
      }
      setStage(u, stages.ACOLHIMENTO_CIDADE); iniciarTimer(from)
      if (u.modoTexto !== true) await enviarAudioPedidoCidade(from, u.atendente)
      return {
        handled: true,
        response: {
          texto: `📍 Etapa 5 de 6 · *CIDADE*\n\nAgora, em qual cidade você mora?\n\nSe preferir, pode informar o CEP também.`,
          opcoes: null
        }
      }
    }
    iniciarTimer(from)
    return { handled: true, response: respostaRecomecoMenuPrincipal(u) }
  }
  if (tipo === "cidade") {
    u.cidade = valor
    await sincronizarContatoNegocioHubSpot(u)
    if (["coleta_cidade", "coleta_cidade_regiao", "__coleta_cidade_legado__"].includes(origem)) {
      iniciarTimer(from)
      if (u.descricao || u._audioCanalTranscricao) {
        setStage(u, stages.AUDIO_CONFIRMAR_DADOS)
        return { handled: true, response: await telaConfirmarDadosAudio(from, u) }
      }
      return { handled: true, response: await iniciarFluxoRelatoLivre(from, u, { boasVindas: false }) }
    }
    return { handled: true, response: await flowAcolhimentoConfirmaWhatsapp(u, { from }) }
  }

  return { handled: false, response: null }
}

module.exports = {
  handleConfirmEntryFinalAcceptance
}
