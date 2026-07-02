const {
  sanitizarTextoEntrada,
  normalizarTextoGatilho
} = require("../utils/text")

function detectarSofrimentoIntenso(texto = "") {
  const t = normalizarTextoGatilho(texto)
  if (!t) return false
  // Sofrimento emocional explícito
  if (/\b(desesperad[ao]|desesper[ao]|nao aguento|não aguento|nao consigo mais|não consigo mais|to mal|estou mal|chorando|choro|nao sei mais|não sei mais|sem saida|sem saída|sem esperanca|sem esperança)\b/.test(t)) return true
  // Impacto financeiro severo
  if (/\b(sem dinheiro|sem renda|nao tenho nada|nao tenho como pagar|nao tenho como comer|passando fome|sem comer|sem comida|despejad|vou perder minha casa|vao me despejar|vão me despejar)\b/.test(t)) return true
  // Vulnerabilidade de terceiros
  if (/\b(meu filho|minha filha|meu bebe|minha bebe|crianca doente|criança doente|idoso|minha mae doente|meu pai doente)\b.{0,40}\b(sem|nao tem|passando|sofrendo|doente|precisando|fome)\b/.test(t)) return true
  // Urgência extrema
  if (/\b(amanha perco|amanhã perco|hoje e o ultimo dia|hoje é o último dia|prazo vence hoje|audiencia amanha|audiência amanhã|intimad.{0,20}hoje|preso|vao me prender|vão me prender)\b/.test(t)) return true
  // Ameaça ou violência
  if (/\b(ameacad|ameaçad|violencia|violência|agredid|agresso|agressao|medo de|com medo|com muito medo)\b/.test(t)) return true
  return false
}

function detectarModoAtendimento(texto) {
  const original = sanitizarTextoEntrada(texto)
  if (original === "modo_audio") return "audio"
  if (original === "modo_texto") return "texto"

  const t = normalizarTextoGatilho(original)
  const partes = t.split(/\s+/).filter(Boolean)
  if (!partes.length || partes.length > 10 || t.length > 80) return null

  // Bloquear frases que indicam contexto alheio (pessoa terceira, duvida geral, etc.)
  if (/\b(advogado|advogada|mae|mãe|pai|filho|filha|outra pessoa|para mim|pra mim|duvida|problema|questao|questão|situacao|situação|preciso|quero falar com|me ajuda|nao sei|não sei)\b/.test(t)) return null

  // Padroes de audio: palavras-chave de voz/audio, com ou sem prefixo de preferencia
  const ehAudio =
    /\baudio\b/.test(t) ||
    /\b(voz|falando|falar|falo)\b/.test(t) ||
    /\bconvers(ar|ando)\b.*\b(voz|audio)\b/.test(t) ||
    /\b(voz|audio)\b.*\bconvers(ar|ando)\b/.test(t) ||
    /\brespond(er|endo)\b.*\b(voz|audio|falando)\b/.test(t) ||
    /\b(voz|audio|falando)\b.*\brespond(er|endo)\b/.test(t) ||
    /\bvou\b.*\b(falar|responder falando)\b/.test(t) ||
    /\bprefiro\b.*\b(voz|audio|falar|conversar)\b/.test(t) ||
    /\bquero\b.*\b(voz|audio|falar|responder por voz|responder por audio)\b/.test(t)

  if (ehAudio) return "audio"

  // Padroes de texto: palavras-chave de escrita/digitacao, com ou sem prefixo de preferencia
  const ehTexto =
    /\btexto\b/.test(t) ||
    /\bdigitar?\b/.test(t) ||
    /\bdigitando\b/.test(t) ||
    /\bescrever?\b/.test(t) ||
    /\bescrevendo\b/.test(t) ||
    /\bescrit[ao]\b/.test(t) ||
    /\bpor escrito\b/.test(t) ||
    /\bvou\b.*\bdigitar?\b/.test(t) ||
    /\bprefiro\b.*\b(texto|digitar?|escrever?|escrit[ao])\b/.test(t) ||
    /\bquero\b.*\b(texto|digitar?|escrever?|escrit[ao])\b/.test(t)

  if (ehTexto) return "texto"

  return null
}

module.exports = {
  detectarSofrimentoIntenso,
  detectarModoAtendimento
}
