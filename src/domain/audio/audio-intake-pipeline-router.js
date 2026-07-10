async function handleAudioIntake(ctx) {
  const {
    from,
    nomeWA,
    u,
    ehAudio,
    midia,
    STAGES,
    formatarNome,
    uploadPastaAudio,
    transcrever,
    detectarComandoDocumento,
    textoIndicaDocumentoAusente,
    detectarIntencaoCliente,
    executarIntencaoDetectadaCliente,
    responderComTimer,
    getDocumentoAtualGuia,
    hsCriarNota,
    iniciarTimer,
    responderTelaDocumento,
    criarTela,
    fraseEnvioDocumentoAudio,
    pareceNovaSituacaoCliente,
    normalizarTextoCRM,
    confirmarAberturaNovoCasoCliente,
    telaAudioClienteCasoAtualOuNovo,
    enviarAudioModoVoz,
    textoAudioOpcoes,
    setStage,
    telaConfirmarUrgenteComAudio,
    iniciarConfirmacaoDescricao,
    salvarEtapa
  } = ctx

  if (!ehAudio) return { handled: false, response: null }

  const eUrg = u.stage === STAGES.AGUARDANDO_URGENTE
  const eDescricao = u.stage === STAGES.COLETA_DESC_AUDIO
  const eDescricaoLivre = ["trab_out_desc", "out_desc"].includes(u.stage)
  const nomePasta = eUrg ? "Mensagem Urgente" : (eDescricao ? "Descricao do Caso" : "Audio Geral")
  const prNome = formatarNome(u.nome || nomeWA || "cliente").split(" ")[0]
  const ultNome = formatarNome(u.nome || nomeWA || "").split(" ").filter(Boolean).slice(-1)[0] || ""
  const nomeCliente = ultNome && ultNome !== prNome ? `${prNome} ${ultNome}` : prNome

  let arquivoAud = null
  if (u.pastaDriveId && !eDescricao && !eDescricaoLivre && !eUrg) {
    arquivoAud = await uploadPastaAudio(u.pastaDriveId, nomeCliente, nomePasta, midia.buffer, midia.mimeType)
  }
  const trans = await transcrever(midia.buffer, midia.mimeType, { origem: eUrg ? "urgente" : (eDescricao || eDescricaoLivre ? "descricao" : "cliente") })

  if (u.stage === STAGES.CLIENTE && trans) {
    const emFluxoDocumentoAudio = Boolean(u._docsClienteGuiado || u.etapa === "documentos")
    const comandoDocumentoAudio = emFluxoDocumentoAudio ? detectarComandoDocumento(trans) : null
    const ausenciaDocumentoAudio = emFluxoDocumentoAudio ? textoIndicaDocumentoAusente(trans) : false
    const intencaoAudio = detectarIntencaoCliente(trans)
    if (emFluxoDocumentoAudio && !comandoDocumentoAudio && !ausenciaDocumentoAudio && intencaoAudio) {
      const respostaIntencao = await executarIntencaoDetectadaCliente(from, u, intencaoAudio, trans)
      return { handled: true, response: respostaIntencao ? responderComTimer(from, respostaIntencao) : {} }
    }
    if (emFluxoDocumentoAudio) {
      const { doc: docAudio, folha: folhaAudio } = getDocumentoAtualGuia(u)
      if (docAudio) {
        await hsCriarNota(
          u.contatoId,
          "OBSERVACAO EM AUDIO SOBRE DOCUMENTO",
          `De: ${u.nome || "-"} (${from})\nCaso: ${u.numeroCaso || "-"}\nDocumento atual: ${docAudio.label}\nItem: ${folhaAudio}\n\nTranscricao:\n"${trans}"`
        )
        iniciarTimer(from)
        return {
          handled: true,
          response: responderTelaDocumento(from, u, criarTela({
            id: "documento_observacao_audio",
            titulo: "Observação de documento",
            texto: `✅ Áudio anotado no seu caso.\n\nAgora envie *${folhaAudio}* do documento *${docAudio.label}* quando estiver pronto.`,
            textoAudioBase: `Áudio anotado no seu caso. ${fraseEnvioDocumentoAudio(docAudio, folhaAudio)}`,
            acoes: [
              { id: "docs_depois", label: "Continuar depois" },
              { id: "m_inicio", label: "🏠 Menu do cliente" }
            ]
          }))
        }
      }
    }
    if (intencaoAudio === "novo_caso" && pareceNovaSituacaoCliente(trans)) {
      u._audioClientePendenteTexto = normalizarTextoCRM(trans)
      u._audioClientePendenteArquivo = arquivoAud?.webViewLink || null
      return { handled: true, response: responderComTimer(from, await confirmarAberturaNovoCasoCliente(from, u)) }
    }
    if (intencaoAudio) {
      const respostaIntencao = await executarIntencaoDetectadaCliente(from, u, intencaoAudio, trans)
      if (respostaIntencao) return { handled: true, response: responderComTimer(from, respostaIntencao) }
    }
    if (pareceNovaSituacaoCliente(trans)) {
      u._audioClientePendenteTexto = normalizarTextoCRM(trans)
      u._audioClientePendenteArquivo = arquivoAud?.webViewLink || null
      const telaAudioCasoAtualOuNovo = telaAudioClienteCasoAtualOuNovo(trans)
      await enviarAudioModoVoz(
        from,
        u,
        `Recebi seu áudio. Essa mensagem é sobre o caso atual ou você quer abrir um novo caso? ${textoAudioOpcoes(telaAudioCasoAtualOuNovo.opcoes)}`,
        "áudio cliente caso atual ou novo"
      )
      return { handled: true, response: responderComTimer(from, telaAudioCasoAtualOuNovo) }
    }
  }

  if (eUrg) {
    if (!trans) {
      u._urgenteAudioBuffer = midia.buffer
      u._urgenteAudioMime = midia.mimeType
      u._urgenteAudioNome = nomeCliente
      u._urgenteAudioTexto = null
      setStage(u, STAGES.URGENTE_AUDIO_ERRO_TRANSCRICAO)
      return {
        handled: true,
        response: responderComTimer(from, {
          texto: "Não consegui ouvir esse áudio com clareza. Pode mandar de novo ou escrever em poucas palavras?",
          opcoes: [{ id: "urg_audio_corrigir", title: "✏️ Corrigir" }]
        })
      }
    }

    u._urgenteAudioBuffer = midia.buffer
    u._urgenteAudioMime = midia.mimeType
    u._urgenteAudioNome = nomeCliente
    u._urgenteAudioTexto = normalizarTextoCRM(trans)
    setStage(u, STAGES.URGENTE_AUDIO_CONFIRMA)
    return { handled: true, response: responderComTimer(from, await telaConfirmarUrgenteComAudio(from, u, u._urgenteAudioTexto)) }
  }

  if (eDescricao || eDescricaoLivre) {
    if (!trans) {
      const origemDescricao = u.stage
      setStage(u, STAGES.DESC_ERRO_TRANSCRICAO)
      u._descOrigemStage = origemDescricao
      return {
        handled: true,
        response: responderComTimer(from, {
          texto: "Não consegui ouvir esse áudio com clareza. Pode mandar de novo ou escrever em poucas palavras?",
          opcoes: [{ id: "desc_corrigir", title: "✏️ Corrigir" }]
        })
      }
    }

    u._audioDescBuffer = midia.buffer
    u._audioDescMime = midia.mimeType
    u._audioDescNome = nomeCliente
    return {
      handled: true,
      response: await iniciarConfirmacaoDescricao(from, u, trans, eDescricaoLivre ? u.stage : STAGES.COLETA_DESC_AUDIO)
    }
  }

  if (!eDescricao) {
    await hsCriarNota(
      u.contatoId,
      eUrg ? "ÁUDIO URGENTE" : `ÁUDIO — ${nomePasta.toUpperCase()}`,
      `De: ${u.nome} (${from})\nCaso: ${u.numeroCaso}\n\n${trans ? `Transcrição:\n"${trans}"` : "Transcrição indisponível"}${arquivoAud ? `\nDrive: ${arquivoAud.webViewLink}` : ""}`
    )
  }
  if (u.stage !== STAGES.CLIENTE) {
    u.documentosEnviados = true
    salvarEtapa(u._numero, "documentos")
  }
  if (u.stage === STAGES.AGUARDANDO_URGENTE) setStage(u, STAGES.CLIENTE)

  const msgAudio = trans
    ? `✅ Áudio salvo!\n\n🗣️ O que entendemos:\n"${trans.slice(0, 300)}${trans.length > 300 ? "..." : ""}"`
    : "✅ Áudio salvo na pasta do caso.\nNossa equipe vai ouvir em breve."
  return {
    handled: true,
    response: responderComTimer(from, { texto: msgAudio, opcoes: [{ id:"m_docs", title:"📎 Enviar documentos" }, { id:"m_adv", title:"👨‍⚖️ Falar com advogado" }, { id:"m_inicio", title:"🏠 Menu do cliente" }] })
  }
}

module.exports = {
  handleAudioIntake
}
