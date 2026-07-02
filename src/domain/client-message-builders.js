const { sanitizarTextoEntrada } = require("../utils/text")

function telaAudioClienteCasoAtualOuNovo(transcricao) {
  const preview = sanitizarTextoEntrada(transcricao).slice(0, 360)
  return {
    texto: `🎙️ *Recebi seu áudio.*\n\nParece que você contou uma situação com detalhes:\n\n"${preview}${transcricao.length > 360 ? "..." : ""}"\n\nEssa mensagem é sobre o caso atual ou você quer abrir um novo caso?`,
    opcoes: [
      { id: "audio_cliente_caso_atual", title: "📄 Caso atual" },
      { id: "audio_cliente_novo_caso", title: "➕ Novo caso" },
      { id: "m_inicio", title: "🏠 Menu do cliente" }
    ]
  }
}

function telaClienteCasoAtualOuNovo(mensagem, origem = "mensagem") {
  const preview = sanitizarTextoEntrada(mensagem).slice(0, 360)
  const titulo = origem === "audio" ? "🎙️ *Recebi seu áudio.*" : "💬 *Entendi sua dúvida.*"
  return {
    texto: `${titulo}\n\nParece que você quer saber se esta situação entra no caso atual ou se precisa abrir outro atendimento:\n\n"${preview}${mensagem.length > 360 ? "..." : ""}"\n\nEssa mensagem é sobre o caso atual ou você quer abrir um novo caso?`,
    opcoes: [
      { id: "audio_cliente_caso_atual", title: "📄 Caso atual" },
      { id: "audio_cliente_novo_caso", title: "➕ Novo caso" },
      { id: "m_inicio", title: "🏠 Menu do cliente" }
    ]
  }
}

function telaAudioNoFluxo(transcricao, recomendacao) {
  const preview = (transcricao || "").length > 320 ? transcricao.slice(0, 320) + "..." : (transcricao || "")
  return {
    texto: `🎙️ *Áudio transcrito*\n\n"${preview}"\n\nMinha recomendação agora é *${recomendacao || "continuar o atendimento"}*.\n\nComo você quer seguir?`,
    opcoes: [
      { id: "audio_fluxo_seguir", title: "✅ Seguir recomendação" },
      { id: "audio_fluxo_recomecar", title: "🔄 Recomeçar" },
      { id: "audio_fluxo_encerrar", title: "👋 Encerrar" }
    ]
  }
}

function gerarFallbackEmpatico(areaLabel, urgencia) {
  const urgente = urgencia === "alta"
  const mapa = {
    "INSS":        urgente ? "Entendo que você está sem receber e isso pesa muito. Vamos cuidar disso juntos." : "Entendo o quanto essa situação com o INSS é desgastante. Pode contar comigo.",
    "Trabalhista": urgente ? "Sei que perder o emprego ou não receber é muito difícil. Estou aqui para ajudar." : "Questões de trabalho podem ser estressantes. Vou organizar tudo para nossa equipe analisar.",
    "Família":     urgente ? "Sei que situações de família são delicadas e doem. Vamos resolver isso com cuidado." : "Assuntos de família exigem atenção especial. Nossa equipe vai tratar com todo o cuidado.",
    "Consumidor":  "Você tem razão em buscar seus direitos. Nossa equipe vai analisar o que aconteceu.",
    "Penal":       urgente ? "Entendo que isso é muito sério e preocupante. Vamos agir com rapidez." : "Sei que essa situação gera muita preocupação. Nossa equipe vai analisar com atenção.",
    "Civil":       "Entendo a situação. Vamos organizar as informações para a equipe jurídica analisar.",
    "Imobiliário": "Problemas com imóvel são sérios. Nossa equipe vai verificar o que pode ser feito.",
  }
  return mapa[areaLabel] || "Entendi o que você está passando. Nossa equipe vai analisar seu caso com atenção."
}

module.exports = {
  telaClienteCasoAtualOuNovo,
  telaAudioClienteCasoAtualOuNovo,
  telaAudioNoFluxo,
  gerarFallbackEmpatico
}
