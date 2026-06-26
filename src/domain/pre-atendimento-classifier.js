const axios = require("axios")
const {
  sanitizarTextoEntrada,
  normalizarTextoGatilho
} = require("../utils/text")
const { logErro } = require("../utils/logging")

const { GROQ_KEY } = process.env

function textoNormalizadoPreAtendimento(texto = "") {
  return normalizarTextoGatilho(texto)
}

function pareceCasoParaTerceiroPreAtendimento(texto = "") {
  const t = textoNormalizadoPreAtendimento(texto)
  if (!t) return false
  const relacoes = "(minha mae|meu pai|minha filha|minha filho|meu filho|minha esposa|meu esposo|meu marido|minha mulher|minha irma|meu irmao|minha avo|meu avo|meu tio|minha tia|meu sobrinho|minha sobrinha|meu neto|minha neta|amigo|amiga|colega|vizinho|vizinha|outra pessoa|terceir[oa])"
  if (/\b(amig[oa]|colega|vizinh[oa])\b.{0,25}\b(indicou|indicaram|recomendou|recomendaram|passou|passaram|falou|disse|mandou|enviou)\b/.test(t)) return false
  if (/\b(indicacao|indicação|recomendacao|recomendação)\b.{0,25}\b(amig[oa]|colega|vizinh[oa])\b/.test(t)) return false
  if (/\b(nao e pra mim|nao sou eu|e para outra pessoa|eh para outra pessoa|e pra outra pessoa|eh pra outra pessoa|atendimento para outra pessoa|caso de outra pessoa|caso para outra pessoa|ajudar alguem|vou responder por alguem|posso responder por alguem)\b/.test(t)) return true
  const intencoes = [
    new RegExp(`\\b(e|eh|seria|atendimento|caso|problema|duvida|processo|beneficio|aposentadoria|inss|demissao)\\b.{0,35}\\b(de|da|do|para|pra)\\b.{0,20}\\b${relacoes}\\b`),
    new RegExp(`\\b(para|pra)\\b.{0,20}\\b${relacoes}\\b`),
    new RegExp(`\\b(quero|preciso|gostaria|vim|estou)\\b.{0,25}\\b(ajudar|responder|representar|abrir|cadastrar|registrar)\\b.{0,25}\\b${relacoes}\\b`),
    new RegExp(`\\b(vou|posso)\\b.{0,15}\\bresponder\\b.{0,15}\\b(por|pela|pelo)\\b.{0,20}\\b${relacoes}\\b`),
    new RegExp(`\\b${relacoes}\\b.{0,25}\\b(quer atendimento|precisa de atendimento|pediu atendimento|me pediu para|me pediu pra)\\b`),
    // "e o caso da minha mae", "a situacao da minha mae", "o problema do meu pai"
    new RegExp(`\\b(o caso|a situacao|o problema|a questao|o processo|o beneficio|a aposentadoria)\\b.{0,10}\\b(da|do|de)\\b.{0,15}\\b${relacoes}\\b`),
    // "minha mae teve o beneficio cortado" — terceiro e sujeito da frase
    new RegExp(`\\b${relacoes}\\b.{0,40}\\b(teve|tem|perdeu|cortou|cortaram|negou|negaram|recebe|recebia|precisa|quer|vai|foi|ficou|esta|estava)\\b`),
    // "quero ajudar ela", "vim aqui por ela" — pronome referindo a terceiro ja mencionado
    new RegExp(`\\b(quero|preciso|vim|estou aqui|to aqui)\\b.{0,20}\\b(ajudar|por|pela|pelo)\\b.{0,10}\\b(ela|ele)\\b`)
  ]
  return intencoes.some(rx => rx.test(t))
}

function relacaoTerceiroPreAtendimento(texto = "") {
  const t = textoNormalizadoPreAtendimento(texto)
  if (/\bamiga\b/.test(t)) return "amiga"
  if (/\bamigo\b/.test(t)) return "amigo"
  if (/\bminha mae\b/.test(t)) return "mãe"
  if (/\bmeu pai\b/.test(t)) return "pai"
  if (/\bminha filha\b/.test(t)) return "filha"
  if (/\bmeu filho\b|\bminha filho\b/.test(t)) return "filho"
  if (/\bminha esposa\b|\bminha mulher\b/.test(t)) return "esposa"
  if (/\bmeu esposo\b|\bmeu marido\b/.test(t)) return "esposo"
  if (/\bminha irma\b/.test(t)) return "irmã"
  if (/\bmeu irmao\b/.test(t)) return "irmão"
  if (/\bminha tia\b/.test(t)) return "tia"
  if (/\bmeu tio\b/.test(t)) return "tio"
  if (/\bminha avo\b/.test(t)) return "avó"
  if (/\bmeu avo\b/.test(t)) return "avô"
  if (/\bminha sobrinha\b/.test(t)) return "sobrinha"
  if (/\bmeu sobrinho\b/.test(t)) return "sobrinho"
  if (/\bminha neta\b/.test(t)) return "neta"
  if (/\bmeu neto\b/.test(t)) return "neto"
  if (/\bvizinha\b/.test(t)) return "vizinha"
  if (/\bvizinho\b/.test(t)) return "vizinho"
  return "pessoa atendida"
}

function parecePedidoAdvogadoDiretoPreAtendimento(texto = "") {
  const t = textoNormalizadoPreAtendimento(texto)
  return /\b(preciso|quero|queria|gostaria|necessito|pode|posso|tem|consegue|falar|conversar|chamar|atendimento|direto|diretamente)\b/.test(t) &&
    /\b(advogado|advogada|especialista|humano|pessoa)\b/.test(t)
}

function parecePerguntaFuncionalPreAtendimento(texto = "") {
  const t = textoNormalizadoPreAtendimento(texto)
  if (!t) return false
  if (/[?]/.test(texto)) return true
  return /^(como|quanto|quando|onde|quem|qual|quais|precisa|posso|pode|voces|vocês|tem|atende|funciona|e pago|é pago|custa)\b/.test(t) ||
    /\b(atende minha cidade|atendem minha cidade|voces atendem|vocês atendem|fazem inss|fazem trabalhista|fazem familia|fazem família|fazem penal|fazem consumidor)\b/.test(t)
}

function pareceDuvidaPreAtendimento(texto = "") {
  const t = textoNormalizadoPreAtendimento(texto)
  if (!t) return false
  if (/\b(duvida|dúvida|duvidas|dúvidas)\b/.test(t)) return true
  if (parecePedidoAdvogadoDiretoPreAtendimento(texto)) return true
  if (parecePerguntaFuncionalPreAtendimento(texto)) return true
  if (pareceRelatoJuridicoAntecipado(texto)) return false
  return /\b(gratuito|gratis|grátis|golpe|confiavel|confiável|seguro|audio|áudio|prazo|documento|documentos)\b/.test(t)
}

function pareceRelatoJuridicoAntecipado(texto = "") {
  const t = textoNormalizadoPreAtendimento(texto)
  if (t.length < 24) return false
  const marcadores = [
    "inss", "beneficio", "benefício", "aposentadoria", "auxilio", "auxílio",
    "demissao", "demissão", "trabalho", "salario", "salário", "rescisao", "rescisão",
    "pensao", "pensão", "guarda", "divorcio", "divórcio", "alimentos",
    "acidente", "processo", "audiencia", "audiência", "despejo", "banco",
    "divida", "dívida", "cobrança", "cobranca", "negativado", "contrato",
    "prisao", "prisão", "delegacia", "mandaram embora", "me mandou embora",
    "nao pagaram", "não pagaram", "meu acerto", "acerto", "fgts", "ferias",
    "férias", "decimo terceiro", "décimo terceiro", "doenca", "doença",
    "pericia", "perícia", "loas", "bpc", "auxilio doença", "auxílio doença"
  ]
  if (marcadores.some(m => t.includes(textoNormalizadoPreAtendimento(m)))) return true
  return /\b(fui|estou|tenho|tive|me|minha|meu|ela|ele)\b.{0,45}\b(demitid|mandad|cortad|bloquead|negad|afastad|acident|cobrad|ameac|processad|pres[oa]|despejad)\b/.test(t)
}

function temaJuridicoPreAtendimento(texto = "") {
  const t = textoNormalizadoPreAtendimento(texto)
  if (/\b(inss|aposentadoria|beneficio|benefício|bpc|loas|auxilio|auxílio|pericia|perícia)\b/.test(t)) return "INSS"
  if (/\b(trabalho|trabalhista|demissao|demissão|mandaram embora|acerto|fgts|salario|salário|ferias|férias|rescisao|rescisão)\b/.test(t)) return "trabalho"
  if (/\b(pensao|pensão|guarda|divorcio|divórcio|filho|filha|familia|família)\b/.test(t)) return "família"
  if (/\b(banco|cobranca|cobrança|divida|dívida|negativad|produto|servico|serviço|consumidor)\b/.test(t)) return "consumidor"
  if (/\b(aluguel|despejo|imovel|imóvel|condominio|condomínio)\b/.test(t)) return "imóvel"
  if (/\b(prisao|prisão|delegacia|boletim|crime|criminal|penal)\b/.test(t)) return "penal"
  return ""
}

async function classificarImprevistoPreAtendimentoIA(stage, texto = "") {
  const entrada = sanitizarTextoEntrada(texto)
  if (!GROQ_KEY || entrada.length < 4) return null
  try {
    const res = await axios.post(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        model: "llama-3.1-8b-instant",
        messages: [
          {
            role: "system",
            content: `Classifique uma mensagem recebida durante um pré-atendimento jurídico no WhatsApp. Responda APENAS JSON válido.
Categorias:
- etapa: a pessoa respondeu a pergunta atual com o dado pedido.
- correcao: a pessoa quer corrigir um dado já informado anteriormente, como nome, telefone, WhatsApp, cidade ou qualquer outro campo. Use quando houver expressões como "o telefone não é esse", "meu nome está errado", "a cidade está errada", "quero mudar o número", "esse não é meu WhatsApp", "coloquei o nome errado", "a cidade que eu disse está errada", "quero corrigir", "está errado". No campo "tema" retorne exatamente uma destas palavras: nome, whatsapp, cidade, situacao, detalhe, urgencia, descricao. Se não identificar o campo, retorne "outro".
- terceiro: caso claro para outra pessoa, somente quando houver intenção explícita como "é para minha mãe", "quero ajudar meu amigo", "vou responder por", "caso da minha mãe" ou "atendimento para meu pai". Não use apenas porque citou parente; em "meu marido me agrediu", "meu filho não paga pensão", "minha filha precisa de pensão" ou "minha mãe faleceu e quero inventário", classifique como relato ou etapa.
- advogado_direto: pedido claro para falar diretamente com advogado, advogada, especialista ou atendimento humano.
- duvida: pergunta sobre funcionamento, preço, documentos, advogado, segurança, cidade, áudio, urgência ou se o escritório atende certo assunto.
- relato: narrativa de problema jurídico já acontecendo, não apenas uma pergunta.
- desconhecido: não há segurança.
Retorne {"tipo":"etapa|correcao|terceiro|advogado_direto|duvida|relato|desconhecido","confianca":0-1,"tema":"texto curto ou null"}.
Se a mensagem disser "um amigo indicou vocês", classifique como etapa ou duvida, nunca terceiro.`
          },
          { role: "user", content: `Etapa atual: ${stage || "nao informada"}\nMensagem: ${entrada}` }
        ],
        temperature: 0,
        max_tokens: 120,
        response_format: { type: "json_object" }
      },
      { headers: { Authorization: `Bearer ${GROQ_KEY}`, "Content-Type": "application/json" } }
    )
    const out = JSON.parse(res.data.choices?.[0]?.message?.content || "{}")
    const tipo = sanitizarTextoEntrada(out.tipo).toLowerCase()
    if (!["terceiro", "advogado_direto", "duvida", "relato", "desconhecido", "etapa", "correcao"].includes(tipo)) return null
    return {
      tipo,
      confianca: Number(out.confianca) || 0,
      tema: sanitizarTextoEntrada(out.tema)
    }
  } catch (e) {
    logErro("groq", "classificarImprevistoPreAtendimentoIA: " + e.message)
    return null
  }
}

async function classificarEntradaPreAtendimento(stage, texto = "", opcoes = {}) {
  const entrada = sanitizarTextoEntrada(texto)
  const usarIA = opcoes.usarIA !== false
  if (!entrada) return { tipo: "desconhecido", confianca: 0, origem: "vazio" }
  if (pareceCasoParaTerceiroPreAtendimento(entrada)) return { tipo: "terceiro", confianca: 1, origem: "regra" }
  if (parecePedidoAdvogadoDiretoPreAtendimento(entrada)) return { tipo: "advogado_direto", confianca: 1, origem: "regra" }
  if (pareceDuvidaPreAtendimento(entrada)) return { tipo: "duvida", confianca: 1, origem: "regra" }
  if (pareceRelatoJuridicoAntecipado(entrada)) return { tipo: "relato", confianca: 1, origem: "regra" }

  if (!usarIA) return { tipo: "desconhecido", confianca: 0, origem: "sem_ia" }
  const ia = await classificarImprevistoPreAtendimentoIA(stage, entrada)
  if (ia?.tipo === "terceiro" && !pareceCasoParaTerceiroPreAtendimento(entrada)) {
    // Aceita classificação da IA como terceiro se confiança alta (>=0.85), mesmo sem regex confirmar
    if ((ia.confianca || 0) >= 0.85) {
      return { ...ia, origem: "ia_terceiro_alta_confianca" }
    }
    return { tipo: "desconhecido", confianca: ia.confianca || 0, origem: "ia_sem_intencao_terceiro" }
  }
  if (ia && ia.confianca >= 0.72) return { ...ia, origem: "ia" }
  return { tipo: "desconhecido", confianca: ia?.confianca || 0, origem: ia ? "ia" : "sem_ia" }
}

function respostaCurtaDuvidaPreAtendimento(texto = "") {
  const t = textoNormalizadoPreAtendimento(texto)
  const tema = temaJuridicoPreAtendimento(texto)
  if (parecePedidoAdvogadoDiretoPreAtendimento(texto)) {
    return "Eu te ajudo a chegar ao advogado pelo caminho certo. Primeiro preciso registrar o caso com os dados básicos; assim a equipe jurídica recebe tudo organizado e consegue analisar melhor."
  }
  if (tema) {
    return `Entendi, você quer falar sobre ${tema}. Tudo bem. Primeiro eu registro as informações principais e depois a equipe jurídica analisa o melhor caminho.`
  }
  if (/\b(como|funciona|atendimento)\b/.test(t)) {
    return "Funciona assim: primeiro eu registro as informações principais do caso, depois nossa equipe jurídica analisa e orienta o próximo passo."
  }
  if (/\b(paga|pago|custa|valor|preco|preço|honorario|honorário)\b/.test(t)) {
    return "Nesta etapa eu só registro seu atendimento. Se houver necessidade de consulta, documentos ou honorários, isso será explicado com clareza depois da análise inicial."
  }
  if (/\b(documento|documentos|prova|foto|pdf)\b/.test(t)) {
    return "Se precisar de documentos, eu vou pedir depois do cadastro. Agora o mais importante é registrar seus dados e entender o que aconteceu."
  }
  if (/\b(nao sei explicar|não sei explicar|nao sei como|não sei como|complicado|dificil explicar|difícil explicar)\b/.test(t)) {
    return "Sem problema. Pode explicar do seu jeito, em frases simples. Eu vou organizar as informações para a equipe jurídica."
  }
  if (/\b(depois eu mando|mando depois|nao tenho agora|não tenho agora|sem documento|sem documentos)\b/.test(t)) {
    return "Tudo bem. O atendimento pode começar com as informações básicas; se precisar de documentos, a equipe pede depois."
  }
  if (/\b(advogado|advogada|especialista|humano|pessoa)\b/.test(t)) {
    return "Depois que o caso for registrado, ele segue para análise da equipe jurídica. Se for urgente, você também poderá sinalizar isso no atendimento."
  }
  if (/\b(inss|trabalh|familia|família|civel|cível|penal|consumidor)\b/.test(t)) {
    return "Pode me contar sua situação em palavras simples. A própria triagem identifica a área do caso pelo que você explicar."
  }
  if (/\b(audio|áudio|voz)\b/.test(t)) {
    return "Pode mandar áudio ou digitar, como for mais fácil para você. Eu aproveito a mensagem para organizar o atendimento."
  }
  if (/\b(urgente|urgencia|urgência|prazo|hoje|amanha|amanhã)\b/.test(t)) {
    return "Entendi a urgência. Vou registrar o caso com atenção e você poderá sinalizar isso para a equipe jurídica analisar melhor."
  }
  if (/\b(golpe|confiavel|confiável|seguro|quem esta falando|quem está falando)\b/.test(t)) {
    return "Você está falando com a equipe da Oráculum Advocacia por este atendimento. Vou pedir só as informações necessárias para registrar o caso com segurança."
  }
  return "Posso tirar dúvidas simples por aqui, mas para não cadastrar errado eu preciso concluir esta etapa do atendimento."
}

module.exports = {
  textoNormalizadoPreAtendimento,
  pareceCasoParaTerceiroPreAtendimento,
  relacaoTerceiroPreAtendimento,
  parecePedidoAdvogadoDiretoPreAtendimento,
  parecePerguntaFuncionalPreAtendimento,
  pareceDuvidaPreAtendimento,
  pareceRelatoJuridicoAntecipado,
  temaJuridicoPreAtendimento,
  classificarImprevistoPreAtendimentoIA,
  classificarEntradaPreAtendimento,
  respostaCurtaDuvidaPreAtendimento
}
