const axios = require("axios")
const { getPrimeiroNomeRetomada } = require("./phone-name")
const { sanitizarTextoEntrada } = require("../utils/text")

async function montarTextoResumoRetomada(u, sortearAtendente) {
  const primeiroNome = getPrimeiroNomeRetomada(u)
  const nomeBaseResumo = sanitizarTextoEntrada(primeiroNome || u?.nome || u?.nomeWA || "Cliente")
  const nomeResumo = nomeBaseResumo.split(/\s+/).filter(Boolean)[0] || "Cliente"
  if (!u.atendente) u.atendente = sortearAtendente()
  const atendente = u.atendente
  const area = sanitizarTextoEntrada(u?.area || u?._areaDetectada) || "Não informada"
  const nomeCompleto = sanitizarTextoEntrada(u?.nomeHubspot || u?.nome || u?.nomeWA) || "Não informado"
  const textoOriginal = sanitizarTextoEntrada(u?.assuntoResumo || u?.descricao || u?._audioCanalTranscricao)
  const stageResumo = sanitizarTextoEntrada(u?._stageRetomadaOriginal || u?.etapa || u?.stage || "")
  const labelEtapa = {
    acolhimento_para_quem: "Confirmar para quem é o atendimento",
    acolhimento_nome: "Informar nome",
    acolhimento_confirma_nome_contato: "Confirmar nome de quem está no WhatsApp",
    acolhimento_confirma_nome: "Confirmar nome",
    acolhimento_confirma_titular_nome: "Confirmar titular do nome",
    acolhimento_confirma_whatsapp: "Confirmação do número de WhatsApp",
    acolhimento_cidade: "Informar cidade",
    escolha_area: "Escolha da área jurídica",
    area: "Escolha da área jurídica",
    inss_menu: "Detalhes do caso INSS",
    trab_menu: "Detalhes do caso Trabalhista",
    outros_menu: "Outros assuntos",
    audio_confirmar_transcricao: "Confirmação do áudio enviado",
    audio_confirmar_area_canal: "Confirmação da área",
    audio_confirmar_dados: "Confirmação dos dados",
    assessoria_inicial: "Escolha de como deseja ser atendido",
    coleta_desc: "Descrição do caso",
    gatilho: "Avaliação de urgência",
    confirmacao: "Confirmação final dos dados"
  }

  const formatarResumoValor = valor => {
    const texto = sanitizarTextoEntrada(valor)
    if (!texto) return null

    const mapa = {
      area_inss: "INSS",
      area_trab: "Trabalhista",
      area_familia: "Família",
      area_consumidor: "Consumidor",
      area_penal: "Penal",
      area_civil: "Civil",
      area_imovel: "Imobiliário",
      area_outros: "Outros"
    }

    if (mapa[texto]) return mapa[texto]

    return texto
      .replace(/_/g, " ")
      .split(" ")
      .filter(Boolean)
      .map(parte => parte.charAt(0).toUpperCase() + parte.slice(1))
      .join(" ")
  }

  const etapaLegivel = stageResumo
    ? (labelEtapa[stageResumo] || stageResumo.replace(/_/g, " "))
    : "Não informada"
  let resumoIA = textoOriginal || "Não informado"

  if (textoOriginal && process.env.GROQ_KEY) {
    try {
      const resposta = await axios.post("https://api.groq.com/openai/v1/chat/completions", {
        model: "llama3-8b-8192",
        messages: [
          { role: "system", content: "Você é um assistente jurídico. Resuma o relato do cliente em UMA frase curtíssima, no estilo 'que você foi agredido por um vizinho' ou 'sobre um problema com seu empregador'. Não use termos técnicos. Comece sempre com 'que você'." },
          { role: "user", content: textoOriginal }
        ],
        max_tokens: 300,
        temperature: 0.3
      }, { headers: { Authorization: `Bearer ${process.env.GROQ_KEY}` } })
      resumoIA = resposta.data.choices?.[0]?.message?.content?.trim() || textoOriginal
    } catch (e) {
      resumoIA = textoOriginal.slice(0, 200)
    }
  } else if (textoOriginal) {
    resumoIA = textoOriginal.slice(0, 200)
  }

  return [
    `🗂️ Seu último atendimento foi com a atendente *${atendente}*`,
    "",
    `👋 *${nomeResumo}*, você iniciou um atendimento, mas não chegou a concluir.`,
    "Vou te ajudar a relembrar onde você parou!",
    "",
    "📋 *O que você nos contou:*",
    "",
    `⚖️ *Área escolhida:* ${area}`,
    `👤 *Seu nome:* ${nomeCompleto}`,
    `📍 *Etapa em que parou:* ${etapaLegivel}`,
    `💬 *Resumo do seu caso:* ${resumoIA}`,
    "",
    "? Quer continuar de onde parou?"
  ].join("\n")
}

module.exports = {
  montarTextoResumoRetomada
}
