const {
  sanitizarTextoEntrada,
  normalizarTextoGatilho,
  formatarNome,
  limparTextoSomenteLetras
} = require("../utils/text")

function primeiroNomeCliente(u) {
  const nome = (u?.nome && u.nome !== "cliente" && u.nome !== "você" ? u.nome : null) ||
               (u?.nomeContato && u.nomeContato !== "cliente" ? u.nomeContato : null)
  if (!nome) return null
  return String(nome).split(" ")[0]
}

function getTelefoneContato(from, u) {
  const numero = (u.telefoneEhDoCliente === false && u.whatsappContato)
    ? u.whatsappContato
    : (u.whatsappContato || from)
  return normalizarNumeroWhatsAppEnvio(numero)
}

// DDDs que receberam o 9º dígito tardiamente e o WhatsApp ainda registra sem o 9
// Nordeste: 81-89 | Minas Gerais: 31-38 | Bahia: 71,73,74,75,77 | Sergipe: 79
const DDDS_SEM_NONO = new Set([
  31, 32, 33, 34, 35, 37, 38,
  71, 73, 74, 75, 77, 79,
  81, 82, 83, 84, 85, 86, 87, 88, 89
])

function normalizarNumeroWhatsAppEnvio(numero) {
  let digitos = String(numero || "").replace(/\D/g, "")
  if (!digitos) return ""

  // Garantir que começa com 55
  if (!digitos.startsWith("55")) {
    if (digitos.length === 11) digitos = "55" + digitos      // 11 dígitos: DDD + 9 + número
    else if (digitos.length === 10) digitos = "55" + digitos  // 10 dígitos: DDD + número (sem 9)
    else return digitos
  }

  // Agora digitos começa com 55
  // Formato esperado: 55 + DDD(2) + 9 + número(8) = 13 dígitos
  // Para DDDs que o WhatsApp registra sem o 9: remover o 9 se presente
  if (digitos.length === 13) {
    const ddd = parseInt(digitos.substring(2, 4), 10)
    const nono = digitos[4]
    if (DDDS_SEM_NONO.has(ddd) && nono === "9") {
      digitos = digitos.substring(0, 4) + digitos.substring(5) // remove o 9
    }
  }

  return digitos
}

function normalizarTelefone(texto) {
  const digitos = String(texto || "").replace(/\D/g, "")
  if (digitos.length < 10 || digitos.length > 13) return ""
  return normalizarNumeroWhatsAppEnvio(digitos)
}

function primeiroEUltimoNome(nome) {
  const partes = formatarNome(nome || "").split(/\s+/).filter(Boolean)
  if (!partes.length) return ""
  if (partes.length === 1) return partes[0]
  return `${partes[0]} ${partes[partes.length - 1]}`
}

function normalizarNomeComparacao(nome) {
  return String(nome || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
}

function formatarTelefoneExibicao(numero) {
  const n = String(numero || "").replace(/\D/g, "")
  if (n.length === 13 && n.startsWith("55")) return formatarTelefoneExibicao(n.slice(2))
  if (n.length === 12 && n.startsWith("55")) return formatarTelefoneExibicao(n.slice(2, 4) + "9" + n.slice(4))
  if (n.length === 11) return `(${n.slice(0,2)}) ${n.slice(2,7)}-${n.slice(7)}`
  if (n.length === 10) return `(${n.slice(0,2)}) ${n.slice(2,6)}-${n.slice(6)}`
  return n
}

function formatarTelefoneAudio(numero) {
  let n = String(numero || "").replace(/\D/g, "")
  if (n.length === 13 && n.startsWith("55")) n = n.slice(2)
  if (n.length === 12 && n.startsWith("55")) n = n.slice(2, 4) + "9" + n.slice(4)
  if (!n) return "não informado"
  if (![10, 11].includes(n.length)) return n.split("").map(digitoParaVozTelefone).join(", ")

  const ddd = n.slice(0, 2)
  const celular = n.length === 11
  const prefixo = celular ? n.slice(2, 3) : ""
  const corpo = celular ? n.slice(3) : n.slice(2)
  const grupos = []
  for (let i = 0; i < corpo.length; i += 2) grupos.push(corpo.slice(i, i + 2))

  return [
    `DDD ${numeroDoisDigitosParaVoz(ddd)}`,
    prefixo ? digitoParaVozTelefone(prefixo) : null,
    ...grupos.map(numeroDoisDigitosParaVoz)
  ].filter(Boolean).join(", ")
}

function digitoParaVozTelefone(d) {
  return ({
    "0": "zero",
    "1": "um",
    "2": "dois",
    "3": "três",
    "4": "quatro",
    "5": "cinco",
    "6": "meia",
    "7": "sete",
    "8": "oito",
    "9": "nove"
  })[String(d)] || String(d)
}

function numeroDoisDigitosParaVoz(valor) {
  const s = String(valor || "").replace(/\D/g, "").padStart(2, "0").slice(-2)
  if (s.includes("6")) return s.split("").map(digitoParaVozTelefone).join(" ")
  const n = Number(s)
  const especiais = {
    0: "zero",
    1: "um",
    2: "dois",
    3: "três",
    4: "quatro",
    5: "cinco",
    6: "meia",
    7: "sete",
    8: "oito",
    9: "nove",
    10: "dez",
    11: "onze",
    12: "doze",
    13: "treze",
    14: "quatorze",
    15: "quinze",
    16: "dez meia",
    17: "dezessete",
    18: "dezoito",
    19: "dezenove"
  }
  if (Object.prototype.hasOwnProperty.call(especiais, n)) return especiais[n]
  const dezenas = {
    2: "vinte",
    3: "trinta",
    4: "quarenta",
    5: "cinquenta",
    6: "sessenta",
    7: "setenta",
    8: "oitenta",
    9: "noventa"
  }
  const dezena = Math.floor(n / 10)
  const unidade = n % 10
  if (!unidade) return dezenas[dezena] || s.split("").map(digitoParaVozTelefone).join(" ")
  return `${dezenas[dezena] || digitoParaVozTelefone(s[0])} e ${digitoParaVozTelefone(String(unidade))}`
}

// Valida se um candidato a nome é plausível como nome próprio.
// Retorna:
//   true        → nome válido (ao menos nome + sobrenome)
//   "incompleto" → parece nome próprio mas tem apenas 1 palavra (pedir sobrenome)
//   false       → não é nome (frase de intenção, palavra funcional, texto genérico)
//
// Regras:
//   1. Mínimo 3 caracteres (herdado do check de comprimento).
//   2. Máximo 6 tokens — nomes reais raramente excedem.
//   3. Palavras funcionais/confirmações isoladas são rejeitadas.
//   4. Verbo de ação no início da frase indica intenção do usuário, não nome.
//   5. Frases com 4+ tokens sem nenhuma maiúscula no original são texto comum.
//   6. Token único: aceito como incompleto (pedir sobrenome) se não for palavra funcional.
//
// IMPORTANTE: textoOriginal é o texto ANTES de formatarNome/limpar — necessário
// para detectar ausência de capitalização em frases longas (após formatarNome tudo
// fica capitalizado, mascarando frases comuns em minúsculo).
const _PALAVRAS_FUNCIONAIS_NOME = new Set([
  "sim", "nao", "nao", "ok", "certo", "correto", "errado", "pronto", "claro",
  "exato", "obvio", "tudo", "nada", "isso", "esse", "essa", "ele", "ela",
  "eles", "elas", "voce", "eu", "nos", "meu", "minha", "meus", "minhas",
  "seu", "sua", "seus", "suas",
  // Primeiros tokens de frases de confirmação com 2+ palavras ("isso mesmo",
  // "está correto", "tá certo", "pode confirmar"). Nenhuma dessas palavras
  // inicia um nome próprio em português.
  "esta", "ta", "pode",
])
const _VERBOS_INTENCAO_NOME = /^(quero|preciso|tenho|estou|faltam|falta|podem|posso|gostaria|aguardo|sei|nao sei|ja|ainda|nunca|sempre|tinha|tive|fiz|foi|sao|seria|serei|terei|vou|vim|fui|falar|saber|ver|ajuda|ajudar|duvida|duvidas|processo|processos|documento|documentos|advogado|informacao|informacoes|precisa|preciso|faltam|aguardando)/

function normalizarTokenNome(s) {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
}

function ehNomeAparente(nomeLimpo, textoOriginal = "") {
  if (!nomeLimpo || nomeLimpo.length < 3) return false
  const tokens = nomeLimpo.trim().split(/\s+/)
  // Regra 2: máximo 6 tokens
  if (tokens.length > 6) return false
  const primeiroToken = normalizarTokenNome(tokens[0])
  // Regra 3: palavra funcional no início (isolada ou como primeiro token de frase)
  if (_PALAVRAS_FUNCIONAIS_NOME.has(primeiroToken)) return false
  // Regra 4: verbo de ação no início
  if (_VERBOS_INTENCAO_NOME.test(primeiroToken)) return false
  // Regra 5: frase com 4+ tokens sem nenhuma maiúscula no texto original
  if (tokens.length > 3) {
    const semPrimeira = textoOriginal.slice(1)
    const temMaiuscula = /[A-ZÁÉÍÓÚÂÊÎÔÛÃÕÀÈÌÒÙÇ]/.test(semPrimeira)
    if (!temMaiuscula) return false
  }
  // Regra 6: token único válido → incompleto (pedir sobrenome)
  if (tokens.length === 1) return "incompleto"
  return true
}

// Detecta se o texto do usuário é uma negação ou correção de nome antes de tentar
// extrair o nome puro. Retorna o nome corrigido extraído (string) ou null se não
// for uma correção/negação reconhecível.
// Exemplos que retornam nome: "Não. Meu nome é João Santos" → "João Santos"
//                              "Na verdade é Maria da Silva" → "Maria da Silva"
//                              "Me chamo Pedro Alves" → "Pedro Alves"
// Exemplos que retornam null: "João Santos" (nome direto, sem marcador de negação)
//                              "Quero falar com advogado" (imprevisto)
function extrairNomeDaCorrecaoExplicita(texto) {
  const t = sanitizarTextoEntrada(texto)
  if (!t) return null

  // Padrões de negação ou correção seguidos do nome correto
  const padroes = [
    // "Não. Meu nome é X" / "Não, meu nome é X" / "Nao meu nome e X"
    /^n[aã]o[\s.,!]*(?:meu nome [eé]|me chamo|sou o|sou a|na verdade [eé]|[eé])\s+(.+)/i,
    // "Está errado. É X" / "Errado, é X"
    /^(?:est[aá] errado|errado)[,.\s!]*(?:[eé]|meu nome [eé]|me chamo)\s+(.+)/i,
    // "Meu nome correto é X" / "Meu nome certo é X"
    /^meu nome (?:correto|certo|verdadeiro) [eé]\s+(.+)/i,
    // "Meu nome é X" — sozinho (sem negação prévia, mas com marcador explícito)
    /^meu nome [eé]\s+(.+)/i,
    // "Me chamo X" / "Chamo-me X"
    /^(?:me chamo|chamo[- ]me)\s+(.+)/i,
    // "Sou o X" / "Sou a X" / "Sou X"
    /^sou (?:o |a )?(.+)/i,
    // "Na verdade é X" / "Na verdade me chamo X"
    /^na verdade (?:[eé]|me chamo|meu nome [eé])\s+(.+)/i,
    // "Na verdade X" (mais curto)
    /^na verdade\s+(.+)/i,
    // "Coloquei errado, é X" / "Digitei errado, meu nome é X"
    /^(?:coloquei|digitei|escrevi|falei) errado[\s,]*(?:meu nome [eé]|[eé]|me chamo)?\s+(.+)/i,
    // "O certo é X" / "O correto é X"
    /^o (?:certo|correto) [eé]\s+(.+)/i,
    // "Não é isso, é X" / "Não é esse, é X"
    /^n[aã]o [eé] (?:isso|esse|essa|este|esta)[\s,]*(?:meu nome [eé]|[eé]|me chamo)?\s+(.+)/i,
    // "Não, na verdade X"
    /^n[aã]o[\s,]+na verdade\s+(.+)/i,
  ]

  for (const padrao of padroes) {
    const m = t.match(padrao)
    if (m && m[1]) {
      const candidato = formatarNome(limparTextoSomenteLetras(m[1].trim()))
      if (candidato && candidato.length >= 3) return candidato
    }
  }
  return null
}

// Detecta se o texto parece ser uma negação pura (sem nome junto), como "Não", "Nao", "Errado", etc.
function parecePuraNegacaoSemNome(texto) {
  const t = normalizarTextoGatilho(sanitizarTextoEntrada(texto))
  return /^(nao|não|errado|incorreto|nope|nah|ne|negativo|falso|nope|isso nao|isso não|nao esta certo|não está certo|nao e isso|não é isso)$/.test(t) ||
    /^(nao|não)[.,!?\s]*$/.test(t)
}

function getNomeAtualizado(u) {
  const nome = (u?.nome && String(u.nome).trim()) || (u?.nomeHubspot && String(u.nomeHubspot).trim()) || "cliente"
  return nome
}

function getPrimeiroNome(u) {
  return primeiroNomeCliente(u) || getNomeAtualizado(u).split(" ").filter(Boolean)[0] || "cliente"
}

function getPrimeiroNomeRetomada(u) {
  const nomeCompleto = sanitizarTextoEntrada(u?.nomeHubspot || u?.nome || u?.nomePerfilWhatsApp || u?.nomeWA || "")
  return nomeCompleto.split(" ").filter(Boolean)[0] || "Cliente"
}

module.exports = {
  primeiroNomeCliente,
  getTelefoneContato,
  normalizarNumeroWhatsAppEnvio,
  normalizarTelefone,
  primeiroEUltimoNome,
  normalizarNomeComparacao,
  formatarTelefoneExibicao,
  formatarTelefoneAudio,
  digitoParaVozTelefone,
  numeroDoisDigitosParaVoz,
  normalizarTokenNome,
  ehNomeAparente,
  extrairNomeDaCorrecaoExplicita,
  parecePuraNegacaoSemNome,
  getNomeAtualizado,
  getPrimeiroNome,
  getPrimeiroNomeRetomada
}
