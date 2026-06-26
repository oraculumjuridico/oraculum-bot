const { primeiroNomeCliente } = require("./phone-name")
const { normalizarTextoGatilho, sanitizarTextoEntrada } = require("../utils/text")

function descricaoRelacaoTerceiroPreAtendimento(relacao = "") {
  const r = sanitizarTextoEntrada(relacao)
  const mapa = {
    amiga: "sua amiga",
    amigo: "seu amigo",
    mãe: "sua mãe",
    pai: "seu pai",
    filha: "sua filha",
    filho: "seu filho",
    esposa: "sua esposa",
    esposo: "seu esposo",
    irmã: "sua irmã",
    irmão: "seu irmão",
    tia: "sua tia",
    tio: "seu tio",
    avó: "sua avó",
    avô: "seu avô",
    sobrinha: "sua sobrinha",
    sobrinho: "seu sobrinho",
    neta: "sua neta",
    neto: "seu neto",
    vizinha: "sua vizinha",
    vizinho: "seu vizinho"
  }
  return mapa[r] || "a pessoa atendida"
}

function perguntaAtualPreAtendimento(stage, u = {}) {
  const primeiroNome = primeiroNomeCliente(u) || u.nome || ""
  if (stage === "acolhimento_modo") {
    return {
      texto: `Como prefere ser atendido? *🎙️ Por áudio* ou *✍️ por texto*?`,
      audio: `Como prefere ser atendido? Por áudio ou por texto?`,
      opcoes: [
        { id: "modo_audio", title: "🎙️ Por áudio" },
        { id: "modo_texto", title: "✍️ Por texto" }
      ]
    }
  }
  if (stage === "acolhimento_para_quem") {
    const relacao = u.relacaoComAtendido
    const labelRelacao = {
      mae: "sua mãe", pai: "seu pai", filho: "seu filho", filha: "sua filha",
      esposa: "sua esposa", esposo: "seu esposo", conjuge: "seu cônjuge",
      irmao: "seu irmão", irma: "sua irmã", avo: "seu avô/avó", terceiro: "outra pessoa"
    }[relacao] || "outra pessoa"
    return {
      texto: `Esse atendimento é para *você* ou para *${labelRelacao}*?`,
      audio: `Esse atendimento é para você ou para ${labelRelacao}?`,
      opcoes: [
        { id: "para_quem_eu", title: "🙋 É para mim" },
        { id: "para_quem_outro", title: `👤 É para ${labelRelacao}` }
      ]
    }
  }
  if (stage === "acolhimento_nome_contato") {
    return {
      texto: `*👥 Atendimento para outra pessoa*\n\n✅ Combinado! Só me diga uma coisa antes: *qual é o seu nome*?\n\nPreciso saber quem está aqui no WhatsApp cuidando desse caso. 😊\n\n_Digite ou envie um áudio com seu nome._ 🎙️`,
      audio: "Combinado! Só me diga uma coisa antes: qual é o seu nome? Preciso saber quem está aqui no WhatsApp cuidando desse caso. Pode digitar ou enviar um áudio com seu nome.",
      opcoes: null
    }
  }
  if (stage === "acolhimento_confirma_nome_contato") {
    const nomeTemp = u._nomeContatoTemp || ""
    const textoNome = nomeTemp ? `*${nomeTemp}*` : "o nome informado"
    return {
      texto: `Preciso confirmar seu nome. ${nomeTemp ? `Você disse ${textoNome} — está correto?` : "Por favor, confirme seu nome."} Se não estiver, é só me dizer agora.`,
      audio: `Preciso confirmar seu nome. ${nomeTemp ? `Você disse ${nomeTemp}, está correto?` : "Por favor, confirme seu nome."} Se não estiver, me diga agora.`,
      opcoes: [
        { id: "confirma_nome_contato_sim", title: "✅ Sim, está certo" }
      ]
    }
  }
  if (stage === "acolhimento_nome" || stage === "acolhimento_confirma_nome") {
    const alvoTexto = u.atendimentoParaTerceiro ? "o *nome completo* da pessoa que será atendida" : "o *seu nome completo*"
    const alvoAudio = u.atendimentoParaTerceiro ? "o nome completo da pessoa que será atendida" : "o seu nome completo"
    return {
      texto: `Para continuar, me diga ${alvoTexto}.`,
      audio: `Para continuar, me diga ${alvoAudio}.`,
      opcoes: [
        { id: "pre_nome_informar", title: "👤 Informar nome" },
        { id: "pre_terceiro_continuar", title: "👥 Outra pessoa" }
      ]
    }
  }
  if (stage === "acolhimento_confirma_whatsapp" || stage === "acolhimento_confirma_whatsapp_outro") {
    if (u.atendimentoParaTerceiro) {
      return {
        texto: "Agora preciso confirmar o contato. Este WhatsApp pode ser usado para falar sobre o caso da pessoa atendida? Se for outro número, é só informar agora.",
        audio: "Agora preciso confirmar o contato. Este WhatsApp pode ser usado para falar sobre o caso da pessoa atendida? Se for outro número, é só me dizer agora.",
        opcoes: [
          { id: "whatsapp_sim", title: "✅ Confirmar" }
        ]
      }
    }
    return {
      texto: "Agora preciso confirmar se este WhatsApp é da pessoa atendida. Se for outro número, é só informar agora.",
      audio: "Agora preciso confirmar se este WhatsApp é da pessoa atendida. Se for outro número, é só me dizer agora.",
      opcoes: [
        { id: "whatsapp_sim", title: "✅ Confirmar" }
      ]
    }
  }
  if (stage === "acolhimento_cidade") {
    const alvoCidade = u.atendimentoParaTerceiro ? "onde a pessoa atendida mora" : "onde você mora"
    return {
      texto: `Para continuar${primeiroNome ? `, *${primeiroNome}*` : ""}, me diga a *cidade* ${alvoCidade}. Pode ser cidade e estado, ou CEP.`,
      audio: `Para continuar${primeiroNome ? `, ${primeiroNome}` : ""}, me diga a cidade ${alvoCidade}. Pode ser cidade e estado, ou CEP.`,
      opcoes: [
        { id: "pre_cidade_informar", title: "📍 Informar cidade" },
        { id: "pre_terceiro_continuar", title: "👥 Outra pessoa" }
      ]
    }
  }
  if (stage === "confirmacao" || stage === "audio_confirmar_dados") {
    return {
      texto: "Confira os dados na tela. Se estiver tudo certo, confirme. Se algo estiver errado, escolha corrigir.",
      audio: "Confira os dados na tela. Se estiver tudo certo, confirme. Se algo estiver errado, escolha corrigir.",
      opcoes: [
        { id: stage === "audio_confirmar_dados" ? "audio_dados_confirmar" : "conf_ok", title: "✅ Confirmar" },
        { id: stage === "audio_confirmar_dados" ? "audio_dados_corrigir" : "conf_corrigir", title: "✏️ Corrigir" }
      ]
    }
  }
  if (stage === "audio_aguardando" || stage === "entendimento_inicial") {
    return {
      texto: "Me conte, em palavras simples, o que está acontecendo no caso. Pode enviar áudio ou digitar.",
      audio: "Me conte, em palavras simples, o que está acontecendo no caso. Pode enviar áudio ou digitar.",
      opcoes: null
    }
  }
  return {
    texto: "Para continuar, me responda a pergunta anterior.",
    audio: "Para continuar, me responda a pergunta anterior.",
    opcoes: null
  }
}

function gerarMensagemAcolhimento(texto = "") {
  const t = normalizarTextoGatilho(texto)
  if (/\x08(desesperad|nao aguento|não aguento|nao consigo mais|não consigo mais|to mal|estou mal|chorando)\x08/.test(t)) {
    return "💙 Antes de qualquer coisa: obrigada por confiar em nós nesse momento difícil.\n\nEstou aqui com você. Vamos cuidar disso juntos, com calma e atenção."
  }
  if (/\x08(sem dinheiro|sem renda|passando fome|sem comer|sem comida|despejad|vou perder minha casa)\x08/.test(t)) {
    return "💙 Entendo que você está passando por uma situação muito séria.\n\nPode continuar me contando — nossa equipe vai analisar isso com prioridade."
  }
  if (/\x08(ameacad|ameaçad|violencia|violência|agredid|medo de|com medo)\x08/.test(t)) {
    return "💙 Entendo que isso é muito assustador.\n\nVocê não está sozinho. Nossa equipe vai analisar o que pode ser feito para te proteger."
  }
  if (/\x08(amanha perco|amanhã perco|prazo vence hoje|audiencia amanha|intimad|preso|vao me prender)\x08/.test(t)) {
    return "💙 Entendi a urgência da sua situação.\n\nVou garantir que nossa equipe receba isso com prioridade máxima."
  }
  return "💙 Entendo que o que você está passando é muito difícil.\n\nPode contar com a gente — vamos cuidar do seu caso com toda a atenção."
}

module.exports = {
  descricaoRelacaoTerceiroPreAtendimento,
  perguntaAtualPreAtendimento,
  gerarMensagemAcolhimento
}
