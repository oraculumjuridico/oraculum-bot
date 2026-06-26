const axios = require("axios")
const { DOCS_EXTRA, normalizarChaveDoc } = require("./documents-core")
const { classificarAreaAudio } = require("./area-audio-classifier")
const { extrairNomeDaCorrecaoExplicita } = require("./phone-name")
const {
  sanitizarTextoEntrada,
  normalizarTextoCRM,
  formatarNome,
  limparTextoSomenteLetras
} = require("../utils/text")
const { logErro } = require("../utils/logging")

const { GROQ_KEY } = process.env

async function classificarResumoOutro(u, resumo) {
  if (!GROQ_KEY || !resumo) return null
  try {
    const contexto = u.area === "Trabalhista"
      ? `Categorias possíveis: demissao, direitos, acidente, assedio, generico.`
      : `Categorias possíveis: consultoria_inss, consultoria_trabalhista, consultoria_outra, revisao_contrato, revisao_processo, revisao_outro, generico.`

    const system = `Classifique resumos curtos de atendimento jurídico. Responda apenas JSON válido com as chaves "categoria", "confianca" e "rotulo". ${contexto}`
    const user = `Área atual: ${u.area}\nResumo: ${resumo}`
    const res = await axios.post(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        model: "llama-3.1-8b-instant",
        messages: [{ role: "system", content: system }, { role: "user", content: user }],
        temperature: 0.1,
        max_tokens: 120,
        response_format: { type: "json_object" }
      },
      { headers: { Authorization: `Bearer ${GROQ_KEY}`, "Content-Type": "application/json" } }
    )
    const content = res.data.choices?.[0]?.message?.content || "{}"
    const parsed = JSON.parse(content)
    if (!parsed?.categoria) return null
    return parsed
  } catch (e) {
    logErro("groq", "classificarResumoOutro: " + e.message)
    return null
  }
}

function aplicarClassificacaoJuridica(u, classificacao = {}) {
  if (!u) return
  u._areaDetectada = classificacao.area || "Outros"
  u.area = classificacao.area || "Outros"
  u.urgencia = classificacao.urgencia || "normal"
  u.situacao = classificacao.situacao || null
  u.detalhe = classificacao.detalhe || null
  u._docKey = classificacao.docKey && DOCS_EXTRA[classificacao.docKey]
    ? classificacao.docKey
    : normalizarChaveDoc(u.area, u.tipo, u.situacao, u.detalhe)
  u.recebe_beneficio = classificacao.recebe_beneficio
  u.recebeBeneficio = classificacao.recebe_beneficio
  u.contribuicao = classificacao.contribuicao
}

// ================================================================
//  HELPERS — qualidade de relato e esclarecimento
// ================================================================

function classificacaoEhFraca(classificacao, relato) {
  if (!classificacao) return true

  const palavras = sanitizarTextoEntrada(relato).trim().split(/\s+/).filter(Boolean).length
  const areaDefinida = classificacao.area && classificacao.area !== "Outros"
  const temSituacao = Boolean(classificacao.situacao || classificacao.detalhe)
  const confiancaBaixa = (classificacao.confianca || 0) < 0.55

  // Tem área e situação → relato suficiente, independente do tamanho
  if (areaDefinida && temSituacao) return false

  // Tem área definida mas sem situação/detalhe → aceita se confiança razoável
  if (areaDefinida && !temSituacao && !confiancaBaixa) return false

  // Relato muito curto (menos de 6 palavras) sem área definida → fraco
  if (palavras < 6 && !areaDefinida) return true

  // Área genérica e sem situação → fraco
  if (!areaDefinida && !temSituacao) return true

  // Confiança baixa e sem situação → fraco
  if (confiancaBaixa && !temSituacao) return true

  return false
}

function gerarPerguntaEsclarecimentoRelato(classificacao, relato) {
  const area = classificacao?.area
  if (!area || area === "Outros") {
    return `Entendi que você precisa de ajuda jurídica. 😊\n\nPara eu preparar seu caso da forma certa, pode me contar um pouco mais?\n\nPor exemplo:\n\n— É sobre *trabalho* (demissão, salário, acidente)?\n— Sobre *INSS* (aposentadoria, benefício)?\n— Sobre *família* (pensão, guarda, divórcio)?\n— Ou outro assunto?\n\n_Pode digitar ou enviar um áudio._`
  }
  if (!classificacao.situacao && !classificacao.detalhe) {
    return `Entendi que é sobre *${area}*. 😊\n\nPode me contar um pouco mais sobre o que aconteceu? Quanto mais detalhes você der, melhor o advogado chega preparado para te atender.\n\n_Pode digitar ou enviar um áudio._`
  }
  const tema = classificacao.situacao || classificacao.detalhe
  return `Entendi: *${tema}*. 😊\n\nSó mais um detalhe: quando isso aconteceu e qual é o principal problema que precisa resolver?\n\n_Pode digitar ou enviar um áudio._`
}

function acumularRelato(u, novoTexto) {
  const anterior = sanitizarTextoEntrada(u._audioCanalTranscricao)
  const novo = normalizarTextoCRM(novoTexto || "")
  if (!anterior) return novo
  // Evita duplicar texto idêntico
  if (anterior.includes(novo.slice(0, 40))) return anterior
  return `${anterior}\n${novo}`.slice(0, 2500)
}

function deveEsclarecerRelato(u, classificacao) {
  // Só pede esclarecimento na primeira classificação (não em revalidação ou retomada)
  if (u._revalidandoCampos || u._voltandoConfirmacao) return false
  // Só se ainda não tentou pedir esclarecimento para este relato
  if (u._jaEsclareceuRelato) return false
  return classificacaoEhFraca(classificacao, u._audioCanalTranscricao)
}

function aplicarSugestaoFluxoOutro(u, categoria) {
  if (u.area === "Trabalhista") {
    if (categoria === "demissao") { u.situacao = "Demissao"; u.tipo = "demissao"; return { stage: "trab_dem_tipo", texto: "Como foi a demissão?", opcoes: [{ id: "td_s", title: "📋 Sem justa causa" }, { id: "td_c", title: "⚖️ Com justa causa" }, { id: "td_p", title: "📝 Pedido de demissão" }] } }
    if (categoria === "direitos") { u.situacao = "Direitos nao pagos"; u.tipo = "direitos"; return { stage: "trab_dir_tipo", texto: "💰 Qual direito não foi pago?", opcoes: [{ id: "tdr_f", title: "💼 FGTS" }, { id: "tdr_fe", title: "🏖️ Férias" }, { id: "tdr_13", title: "🎁 13º salário" }, { id: "tdr_h", title: "⏰ Horas extras" }, { id: "tdr_o", title: "📋 Outro" }] } }
    if (categoria === "acidente") { u.situacao = "Acidente de trabalho"; u.tipo = "acidente"; return { stage: "trab_acid_af", texto: "🏥 Você se afastou pelo INSS?", opcoes: [{ id: "af_s", title: "✅ Sim" }, { id: "af_n", title: "❌ Não" }] } }
    if (categoria === "assedio") { u.situacao = "Assedio moral"; u.tipo = "assedio"; return { stage: "trab_ass_s", texto: "😰 O assédio ainda está acontecendo?", opcoes: [{ id: "as_s", title: "⚠️ Sim, ainda acontece" }, { id: "as_n", title: "✅ Não, já parou" }] } }
    u.situacao = "Outros"; u.tipo = "outros"
    return { stage: "gatilho", texto: "✅ Certo! Vamos registrar seu caso.", opcoes: [{ id: "cont", title: "▶️ Continuar" }] }
  }

  if (categoria === "consultoria_inss") { u.situacao = "Consultoria juridica"; u.subTipo = "INSS"; return { stage: "gatilho", texto: "✅ Entendi. Vamos seguir com essa consultoria.", opcoes: [{ id: "cont", title: "▶️ Continuar" }] } }
  if (categoria === "consultoria_trabalhista") { u.situacao = "Consultoria juridica"; u.subTipo = "Trabalhista"; return { stage: "gatilho", texto: "✅ Entendi. Vamos seguir com essa consultoria.", opcoes: [{ id: "cont", title: "▶️ Continuar" }] } }
  if (categoria === "consultoria_outra") { u.situacao = "Consultoria juridica"; u.subTipo = "Outra área"; return { stage: "gatilho", texto: "✅ Entendi. Vamos seguir com essa consultoria.", opcoes: [{ id: "cont", title: "▶️ Continuar" }] } }
  if (categoria === "revisao_contrato") { u.situacao = "Revisao de documentos"; u.tipo = "revisao"; u.subTipo = "Contrato"; return { stage: "gatilho", texto: "✅ Entendi. Vamos seguir com a revisão.", opcoes: [{ id: "cont", title: "▶️ Continuar" }] } }
  if (categoria === "revisao_processo") { u.situacao = "Revisao de documentos"; u.tipo = "revisao"; u.subTipo = "Processo"; return { stage: "gatilho", texto: "✅ Entendi. Vamos seguir com a revisão.", opcoes: [{ id: "cont", title: "▶️ Continuar" }] } }
  if (categoria === "revisao_outro") { u.situacao = "Revisao de documentos"; u.tipo = "revisao"; u.subTipo = "Outro"; return { stage: "gatilho", texto: "✅ Entendi. Vamos seguir com a revisão.", opcoes: [{ id: "cont", title: "▶️ Continuar" }] } }
  u.situacao = "Outro assunto"
  return { stage: "gatilho", texto: "✅ Certo! Vamos registrar sua solicitação.", opcoes: [{ id: "cont", title: "▶️ Continuar" }] }
}

async function classificarAcaoAudioFluxo(u, texto) {
  const fallback = (() => {
    const lower = String(texto || "").toLowerCase()
    if (/(encerrar|encerra|tchau|obrigad|finaliz|fechar|fecha|por hoje|ate logo|até logo|ate mais|até mais|nao quero continuar|não quero continuar|nao vou continuar|não vou continuar|nao quero seguir|não quero seguir|parar atendimento|pare atendimento|cancelar atendimento|cancela atendimento|desistir|desisto)/.test(lower)) {
      return { acao: "encerrar", recomendacao: "encerrar este atendimento" }
    }
    if (/(recome|comecar de novo|começar de novo|novo atendimento|do zero|reiniciar|trocar de assunto|outro assunto)/.test(lower)) {
      return { acao: "recomecar", recomendacao: "recomeçar o atendimento" }
    }
    return { acao: "continuar", recomendacao: "continuar no fluxo atual" }
  })()

  if (!GROQ_KEY || !texto) return fallback
  try {
    const system = `Classifique a intenção principal de um áudio recebido no meio de um atendimento jurídico. Responda apenas JSON válido com as chaves "ação" e "recomendação". "ação" deve ser exatamente uma destas: continuar, recomeçar, encerrar.`
    const user = `Stage atual: ${u.stage}\nÁrea: ${u.area || "não definida"}\nTexto transcrito: ${texto}`
    const res = await axios.post(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        model: "llama-3.1-8b-instant",
        messages: [{ role: "system", content: system }, { role: "user", content: user }],
        temperature: 0.1,
        max_tokens: 80,
        response_format: { type: "json_object" }
      },
      { headers: { Authorization: `Bearer ${GROQ_KEY}`, "Content-Type": "application/json" } }
    )
    const parsed = JSON.parse(res.data.choices?.[0]?.message?.content || "{}")
    if (!["continuar", "recomecar", "encerrar"].includes(parsed?.acao)) return fallback
    return {
      acao: parsed.acao,
      recomendacao: parsed.recomendacao || fallback.recomendacao
    }
  } catch (e) {
    logErro("groq", "classificarAcaoAudioFluxo: " + e.message)
    return fallback
  }
}

async function extrairNomeAudio(transcricao) {
  if (!GROQ_KEY || !transcricao) {
    // Sem IA: tenta extrair nome de correção explícita antes de limpar o texto
    return extrairNomeDaCorrecaoExplicita(transcricao) || formatarNome(limparTextoSomenteLetras(transcricao))
  }
  try {
    const res = await axios.post(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        model: "llama-3.1-8b-instant",
        messages: [
          { role: "system", content: "Extraia apenas o nome próprio completo do texto. Retorne somente JSON válido com a chave 'nome'. Sem explicações. Exemplo: {\"nome\": \"João Silva\"}. Se o nome aparecer repetido, retorne apenas uma vez." },
          { role: "user", content: transcricao }
        ],
        temperature: 0.1,
        max_tokens: 50,
        response_format: { type: "json_object" }
      },
      { headers: { Authorization: `Bearer ${GROQ_KEY}`, "Content-Type": "application/json" } }
    )
    const resultado = JSON.parse(res.data.choices[0].message.content)
    return formatarNome(resultado.nome) || extrairNomeDaCorrecaoExplicita(transcricao) || formatarNome(limparTextoSomenteLetras(transcricao))
  } catch (e) {
    logErro("groq", "extrairNomeAudio: " + e.message)
    return extrairNomeDaCorrecaoExplicita(transcricao) || formatarNome(limparTextoSomenteLetras(transcricao))
  }
}

async function extrairCidadeAudio(transcricao) {
  if (!transcricao) return ""
  if (!GROQ_KEY) {
    return transcricao.replace(/\D/g, "").length >= 8
      ? transcricao.replace(/\D/g, "")
      : transcricao.trim()
  }
  try {
    const res = await axios.post(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        model: "llama-3.1-8b-instant",
        messages: [
          {
            role: "system",
            content: `Você é um extrator de cidades brasileiras. Dado um texto transcrito por voz, identifique e retorne o nome oficial da cidade brasileira mencionada.
            Retorne somente JSON válido com a chave "cidade".
            Se houver CEP (8 dígitos numéricos), retorne {"cidade": "CEP:XXXXXXXX"}.
            Corrija erros fonéticos e de transcrição. Preserve nomes compostos integralmente.
            Exemplos de correção fonética e normalização:
            "ô linda" -> {"cidade": "Olinda"}
            "são paulo" -> {"cidade": "São Paulo"}
            "goiana" -> {"cidade": "Goiana"}
            "presidente quênedi" -> {"cidade": "Presidente Kennedy"}
            "presidente kenedi" -> {"cidade": "Presidente Kennedy"}
            "presidente kennedy" -> {"cidade": "Presidente Kennedy"}
            "santa cruz" -> {"cidade": "Santa Cruz"}
            "bom jesus" -> {"cidade": "Bom Jesus"}
            "são joão" -> {"cidade": "São João"}
            "são josé" -> {"cidade": "São José"}
            REGRA CRÍTICA: nunca truncar nomes compostos. "Presidente Kennedy" deve ser retornado completo, nunca apenas "Kennedy" ou "Presidente".
            Sem explicações. Apenas o JSON.`
          },
          { role: "user", content: transcricao }
        ],
        temperature: 0.1,
        max_tokens: 50,
        response_format: { type: "json_object" }
      },
      { headers: { Authorization: `Bearer ${GROQ_KEY}`, "Content-Type": "application/json" } }
    )
    const resultado = JSON.parse(res.data.choices[0].message.content)
    return resultado.cidade || transcricao.trim()
  } catch (e) {
    logErro("groq", "extrairCidadeAudio: " + e.message)
    return transcricao.trim()
  }
}

async function extrairCampoCorrecaoIA(campo, texto, u = {}) {
  const bruto = normalizarTextoCRM(texto || "")
  if (!bruto) return ""
  if (!GROQ_KEY) return bruto

  const instrucoes = {
    situacao: `Extraia do relato apenas a situação jurídica principal em um rótulo curto, com 2 a 5 palavras. Exemplos: "Assédio moral", "Benefício negado", "Demissão sem justa causa", "Cobrança indevida". Não copie a narrativa inteira.`,
    detalhe: `Extraia um resumo técnico curto dos detalhes relevantes do caso, com no máximo 18 palavras. Foque em agravantes, direitos violados, problemas de saúde, documentos, valores ou contexto importante. Não copie vícios de fala como "enfim" ou "preciso colocar tudo isso".`
  }

  try {
    const res = await axios.post(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        model: "llama-3.1-8b-instant",
        messages: [
          {
            role: "system",
            content: `Você ajusta campos de um atendimento jurídico por WhatsApp. ${instrucoes[campo] || "Extraia apenas o valor corrigido."} Responda somente JSON válido com a chave "valor". Linguagem simples, técnica e curta.`
          },
          {
            role: "user",
            content: `Área atual: ${u.area || "não informada"}\nSituação atual: ${u.situacao || "não informada"}\nDetalhe atual: ${u.detalhe || "não informado"}\nTexto informado pelo usuário: ${bruto}`
          }
        ],
        temperature: 0.1,
        max_tokens: 120,
        response_format: { type: "json_object" }
      },
      { headers: { Authorization: `Bearer ${GROQ_KEY}`, "Content-Type": "application/json" } }
    )
    const parsed = JSON.parse(res.data.choices[0].message.content)
    return normalizarTextoCRM(parsed.valor || bruto)
  } catch (e) {
    logErro("groq", `extrairCampoCorrecaoIA_${campo}: ` + e.message)
    return bruto
  }
}

async function consolidarDescricaoCorrecaoIA(u, textoNovo) {
  const relatoAnterior = normalizarTextoCRM(u.descricao || u._audioCanalTranscricao || "")
  const novaInformacao = normalizarTextoCRM(textoNovo || "")
  const base = [relatoAnterior, novaInformacao].filter(Boolean).join("\n\nCorreção/atualização informada pelo cliente:\n")
  const fallbackClassificacao = await classificarAreaAudio(base)

  if (!GROQ_KEY || !base) {
    return {
      descricao: base || novaInformacao,
      area: fallbackClassificacao.area || u.area || "Outros",
      situacao: fallbackClassificacao.situacao || u.situacao || null,
      detalhe: fallbackClassificacao.detalhe || u.detalhe || null,
      urgencia: fallbackClassificacao.urgencia || u.urgencia || "normal"
    }
  }

  try {
    const res = await axios.post(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        model: "llama-3.1-8b-instant",
        messages: [
          {
            role: "system",
            content: `Você consolida relatos jurídicos para uma tela de confirmação. Una o relato anterior com a correção nova sem repetir frases. Responda somente JSON válido com estas chaves: "area", "situacao", "detalhe", "urgencia", "descricao".
- area: uma de INSS, Trabalhista, Família, Consumidor, Penal, Civil, Imobiliário, Outros.
- situacao: rótulo jurídico curto, 2 a 5 palavras.
- detalhe: resumo técnico curto dos pontos principais, até 18 palavras.
- urgencia: alta, normal ou baixa.
- descricao: resumo consolidado em 1 a 2 frases, simples e técnico, sem copiar a transcrição literal.`
          },
          { role: "user", content: base }
        ],
        temperature: 0.15,
        max_tokens: 260,
        response_format: { type: "json_object" }
      },
      { headers: { Authorization: `Bearer ${GROQ_KEY}`, "Content-Type": "application/json" } }
    )
    const parsed = JSON.parse(res.data.choices[0].message.content)
    const areas = ["INSS", "Trabalhista", "Família", "Consumidor", "Penal", "Civil", "Imobiliário", "Outros"]
    return {
      descricao: normalizarTextoCRM(parsed.descricao || base),
      area: areas.includes(parsed.area) ? parsed.area : (fallbackClassificacao.area || u.area || "Outros"),
      situacao: normalizarTextoCRM(parsed.situacao || fallbackClassificacao.situacao || u.situacao || ""),
      detalhe: normalizarTextoCRM(parsed.detalhe || fallbackClassificacao.detalhe || u.detalhe || ""),
      urgencia: ["alta", "normal", "baixa"].includes(parsed.urgencia) ? parsed.urgencia : (fallbackClassificacao.urgencia || u.urgencia || "normal")
    }
  } catch (e) {
    logErro("groq", "consolidarDescricaoCorrecaoIA: " + e.message)
    return {
      descricao: normalizarTextoCRM(base || novaInformacao),
      area: fallbackClassificacao.area || u.area || "Outros",
      situacao: fallbackClassificacao.situacao || u.situacao || null,
      detalhe: fallbackClassificacao.detalhe || u.detalhe || null,
      urgencia: fallbackClassificacao.urgencia || u.urgencia || "normal"
    }
  }
}

async function gerarResumoDescricaoConfirmacao(u) {
  const descricao = u.descricao || u._audioCanalTranscricao || ""
  if (!descricao) return "—"

  // Cache: se já gerou para essa versão da descrição, retornar cached
  if (u._resumoDescricaoIA && u._resumoDescricaoIABase === descricao) {
    return u._resumoDescricaoIA
  }

  if (!GROQ_KEY || descricao.length < 30) {
    const preview = descricao.slice(0, 200) + (descricao.length > 200 ? "…" : "")
    u._resumoDescricaoIA = preview
    u._resumoDescricaoIABase = descricao
    return preview
  }

  try {
    const res = await axios.post(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        model: "llama-3.1-8b-instant",
        messages: [
          {
            role: "system",
            content: `Você é um assistente jurídico. Leia o relato do cliente e gere um resumo de 1 a 2 frases, em linguagem simples e humanizada, que capture o problema central. Seja técnico mas acessível. Não use gírias. Não comece com "O cliente" — escreva direto sobre a situação.`
          },
          { role: "user", content: `Área: ${u.area || "não informada"}\nRelato: ${descricao}` }
        ],
        max_tokens: 120,
        temperature: 0.3
      },
      { headers: { Authorization: `Bearer ${GROQ_KEY}`, "Content-Type": "application/json" } }
    )
    const resumo = res.data.choices?.[0]?.message?.content?.trim() || descricao.slice(0, 200)
    u._resumoDescricaoIA = resumo
    u._resumoDescricaoIABase = descricao
    return resumo
  } catch (e) {
    logErro("groq", "gerarResumoDescricaoConfirmacao: " + e.message)
    const fallback = descricao.slice(0, 200) + (descricao.length > 200 ? "…" : "")
    u._resumoDescricaoIA = fallback
    u._resumoDescricaoIABase = descricao
    return fallback
  }
}

module.exports = {
  classificarResumoOutro,
  aplicarClassificacaoJuridica,
  classificacaoEhFraca,
  gerarPerguntaEsclarecimentoRelato,
  acumularRelato,
  deveEsclarecerRelato,
  aplicarSugestaoFluxoOutro,
  classificarAcaoAudioFluxo,
  extrairNomeAudio,
  extrairCidadeAudio,
  extrairCampoCorrecaoIA,
  consolidarDescricaoCorrecaoIA,
  gerarResumoDescricaoConfirmacao
}
