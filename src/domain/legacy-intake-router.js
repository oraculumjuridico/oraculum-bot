function criarLegacyIntakeRouter({
  STAGES,
  REGIOES,
  UF_MAP,
  extrairNomeDaCorrecaoExplicita,
  formatarNome,
  limparTextoSomenteLetras,
  ehNomeAparente,
  responderComTimer,
  prepararConfirmacaoEntrada,
  iniciarTimer,
  telaRegioes,
  setStage,
  telaUFsRegiao,
  formatarCidade,
  deveOferecerExplicarTudo,
  prepararOfertaExplicarTudoFinal,
  entrarEtapaDescricao,
  telaDescreverCaso,
  iniciarConfirmacaoDescricao
}) {
  return async function processarColetaLegada({ from, u, text }) {
    if (u.stage === "coleta_nome" && text) {
      const nomeLimpo = extrairNomeDaCorrecaoExplicita(text) || formatarNome(limparTextoSomenteLetras(text))
      const validacaoColetaNome = nomeLimpo ? ehNomeAparente(nomeLimpo, text) : false
      if (!nomeLimpo || validacaoColetaNome === false) return { handled: true, response: responderComTimer(from, { texto: "Informe um nome válido usando apenas letras e espaços.", opcoes: null }) }
      if (validacaoColetaNome === "incompleto") return { handled: true, response: responderComTimer(from, { texto: "Preciso do nome completo. Por favor, informe também o sobrenome.", opcoes: null }) }
      return { handled: true, response: await prepararConfirmacaoEntrada(from, u, "nome", nomeLimpo, "coleta_nome") }
    }
    if (u.stage === "coleta_regiao") {
      if (!REGIOES[text]) { iniciarTimer(from); return { handled: true, response: telaRegioes() } }
      u._regiao = text; u.regiao = REGIOES[text].label; setStage(u, "coleta_uf"); iniciarTimer(from)
      return { handled: true, response: telaUFsRegiao(text) }
    }
    if (u.stage === "coleta_uf") {
      const val = UF_MAP[text]
      if (!val) { iniciarTimer(from); return { handled: true, response: telaUFsRegiao(u._regiao || "reg_n") } }
      u.uf = val; setStage(u, "coleta_cidade_regiao"); iniciarTimer(from)
      return { handled: true, response: { texto: "●●●●●○ 📍 Etapa 5 de 6 · *Cidade*\n\nDigite a cidade onde você mora", opcoes: null } }
    }
    if (u.stage === "coleta_cidade_regiao" && text) {
      const cidadeLimpa = formatarCidade(limparTextoSomenteLetras(text))
      if (!cidadeLimpa || cidadeLimpa.length < 2) return { handled: true, response: responderComTimer(from, { texto: "Informe uma cidade válida usando apenas letras e espaços.", opcoes: null }) }
      return { handled: true, response: await prepararConfirmacaoEntrada(from, u, "cidade", cidadeLimpa, "coleta_cidade_regiao") }
    }
    if (u.stage === "coleta_contrib_regiao_v2") {
      const m = { col_c1: "Nunca", col_c2: "Pouco tempo", col_c3: "Mais de 1 ano", col_c4: "Muitos anos" }
      if (!m[text]) { iniciarTimer(from); return { handled: true, response: { texto: "Selecione uma opção:", opcoes: Object.entries(m).map(([id, title]) => ({ id, title })) } } }
      u.contribuicao = m[text]; setStage(u, "coleta_benef"); iniciarTimer(from)
      return { handled: true, response: { texto: "Você já recebe algum benefício do INSS?", opcoes: [{ id: "col_b1", title: "Sim, recebo" }, { id: "col_b2", title: "Não recebo" }] } }
    }
    if (u.stage === "__coleta_benef_regiao_v2__") {
      const m = { col_b1: "Sim", col_b2: "Não" }
      if (!m[text]) { iniciarTimer(from); return { handled: true, response: { texto: "Selecione uma opção:", opcoes: [{ id: "col_b1", title: "Sim" }, { id: "col_b2", title: "Não" }] } } }
      u.recebeBeneficio = m[text]
      if (deveOferecerExplicarTudo(u)) {
        return { handled: true, response: prepararOfertaExplicarTudoFinal(from, u, STAGES.CONFIRMACAO, null) }
      }
      entrarEtapaDescricao(u, STAGES.COLETA_DESC_AUDIO); iniciarTimer(from)
      return { handled: true, response: { texto: "●●●●●○ 📝 Etapa 5 de 6 · *Descrição*\n\nConte o que aconteceu e inclua os detalhes que considerar importantes.\n\nPode digitar ou enviar um áudio.", opcoes: null } }
    }
    if (u.stage === STAGES.DESC_ERRO_TRANSCRICAO) {
      if (text === "desc_corrigir") {
        u._descTemp = null
        entrarEtapaDescricao(u, u._descOrigemStage === "explicar_tudo" ? STAGES.COLETA_DESC_AUDIO : (u._descOrigemStage || STAGES.COLETA_DESC_AUDIO))
        iniciarTimer(from)
        return { handled: true, response: telaDescreverCaso() }
      }
      iniciarTimer(from)
      return {
        handled: true,
        response: {
          texto: "Não consegui ouvir esse áudio com clareza. Toque em *Corrigir* para enviar outro áudio ou escreva a situação em poucas palavras.",
          opcoes: [
          { id: "desc_corrigir", title: "✏️ Corrigir" }
          ]
        }
      }
    }
    if (u.stage === "coleta_contrib_regiao") {
      const m = { col_c1: "Nunca", col_c2: "Pouco tempo", col_c3: "Mais de 1 ano", col_c4: "Muitos anos" }
      if (!m[text]) { iniciarTimer(from); return { handled: true, response: { texto: "Selecione uma opção:", opcoes: Object.entries(m).map(([id, title]) => ({ id, title })) } } }
      u.contribuicao = m[text]; setStage(u, "coleta_benef"); iniciarTimer(from)
      return { handled: true, response: { texto: "🏥 Você já recebe algum benefício do INSS?", opcoes: [{ id: "col_b1", title: "✅ Sim, recebo" }, { id: "col_b2", title: "❌ Não recebo" }] } }
    }
    if (u.stage === "coleta_cidade" && text) {
      const cidadeLimpa = formatarCidade(limparTextoSomenteLetras(text))
      if (!cidadeLimpa || cidadeLimpa.length < 2) return { handled: true, response: responderComTimer(from, { texto: "Informe uma cidade válida usando apenas letras e espaços.", opcoes: null }) }
      return { handled: true, response: await prepararConfirmacaoEntrada(from, u, "cidade", cidadeLimpa, "coleta_cidade") }
    }
    if (u.stage === "__coleta_nome_legado__" && text) {
      const nomeLimpo = extrairNomeDaCorrecaoExplicita(text) || formatarNome(limparTextoSomenteLetras(text))
      const validacaoLegado = nomeLimpo ? ehNomeAparente(nomeLimpo, text) : false
      if (!nomeLimpo || validacaoLegado === false) return { handled: true, response: responderComTimer(from, { texto: "Informe um nome válido usando apenas letras e espaços.", opcoes: null }) }
      if (validacaoLegado === "incompleto") return { handled: true, response: responderComTimer(from, { texto: "Preciso do nome completo. Por favor, informe também o sobrenome.", opcoes: null }) }
      return { handled: true, response: await prepararConfirmacaoEntrada(from, u, "nome", nomeLimpo, "coleta_nome") }
    }
    if (u.stage === "__coleta_cidade_legado__" && text) {
      const cidadeLimpa = formatarCidade(limparTextoSomenteLetras(text))
      if (!cidadeLimpa || cidadeLimpa.length < 2) return { handled: true, response: responderComTimer(from, { texto: "Informe uma cidade válida usando apenas letras e espaços.", opcoes: null }) }
      return { handled: true, response: await prepararConfirmacaoEntrada(from, u, "cidade", cidadeLimpa, "__coleta_cidade_legado__") }
    }
    if (u.stage === "__coleta_regiao_legado__") {
      if (!REGIOES[text]) { iniciarTimer(from); return { handled: true, response: telaRegioes() } }
      u._regiao = text; setStage(u, "coleta_uf"); iniciarTimer(from)
      return { handled: true, response: telaUFsRegiao(text) }
    }
    if (u.stage === "__coleta_uf_legado__") {
      const val = UF_MAP[text]
      if (!val) { iniciarTimer(from); return { handled: true, response: telaUFsRegiao(u._regiao || "reg_n") } }
      u.uf = val; setStage(u, "coleta_contrib"); iniciarTimer(from)
      return { handled: true, response: { texto: "💼 Você já contribuiu para o INSS?", opcoes: [{ id:"col_c1", title:"❌ Nunca" }, { id:"col_c2", title:"⏰ Pouco tempo" }, { id:"col_c3", title:"📅 Mais de 1 ano" }, { id:"col_c4", title:"🏆 Muitos anos" }] } }
    }
    if (u.stage === "coleta_contrib") {
      const m = { col_c1: "Nunca", col_c2: "Pouco tempo", col_c3: "Mais de 1 ano", col_c4: "Muitos anos" }
      if (!m[text]) { iniciarTimer(from); return { handled: true, response: { texto: "Selecione uma opção:", opcoes: Object.entries(m).map(([id, title]) => ({ id, title })) } } }
      u.contribuicao = m[text]; setStage(u, "coleta_benef"); iniciarTimer(from)
      return { handled: true, response: { texto: "🏥 Você já recebe algum benefício do INSS?", opcoes: [{ id: "col_b1", title: "✅ Sim, recebo" }, { id: "col_b2", title: "❌ Não recebo" }] } }
    }
    if (u.stage === "coleta_benef") {
      const m = { col_b1: "Sim", col_b2: "Não" }
      if (!m[text]) { iniciarTimer(from); return { handled: true, response: { texto: "Selecione uma opção:", opcoes: [{ id: "col_b1", title: "Sim" }, { id: "col_b2", title: "Não" }] } } }
      u.recebeBeneficio = m[text]
      if (deveOferecerExplicarTudo(u)) {
        return { handled: true, response: prepararOfertaExplicarTudoFinal(from, u, STAGES.CONFIRMACAO, null) }
      }
      entrarEtapaDescricao(u, STAGES.COLETA_DESC_AUDIO); iniciarTimer(from)
      return { handled: true, response: { texto: "●●●●●○ 📝 Etapa 5 de 6 · *Descrição*\n\nConte o que aconteceu e inclua os detalhes que considerar importantes.\n\nPode digitar ou enviar um áudio.", opcoes: null } }
    }
    if ((u.stage === "coleta_desc" || u.stage === "coleta_desc_audio") && text) {
      return { handled: true, response: iniciarConfirmacaoDescricao(from, u, text, STAGES.COLETA_DESC_AUDIO) }
    }

    return { handled: false, response: null }
  }
}

module.exports = {
  criarLegacyIntakeRouter
}
