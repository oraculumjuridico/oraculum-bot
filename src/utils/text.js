function sanitizarTextoEntrada(valor) {
  if (typeof valor === "string") return valor.trim()
  if (valor === null || valor === undefined) return ""
  return String(valor).trim()
}

function normalizarStageKey(stage) {
  return sanitizarTextoEntrada(stage).toLowerCase()
}

function normalizarTextoGatilho(valor) {
  return sanitizarTextoEntrada(valor)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
}

function ehMensagemEntradaGlobal(valor) {
  return [
    "oi",
    "ola",
    "menu",
    "inicio",
    "comecar",
    "bom dia",
    "boa tarde",
    "boa noite"
  ].includes(normalizarTextoGatilho(valor))
}

function normalizarNomeCidadeBusca(valor) {
  return sanitizarTextoEntrada(valor)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\b(cidade|municipio|munic[ií]pio|moro|em|de|do|da|dos|das|sou|resido|residente)\b/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function formatarNome(str) {
  if (!str) return str
  const preposicoes = new Set(["de", "da", "do", "das", "dos", "e"])
  return str.trim().replace(/\s+/g, " ").toLowerCase()
    .split(" ")
    .map((palavra, idx) => {
      if (idx !== 0 && preposicoes.has(palavra)) return palavra
      return palavra.charAt(0).toUpperCase() + palavra.slice(1)
    })
    .join(" ")
}
function formatarCidade(str) {
  if (!str) return str
  return str.trim().replace(/\s+/g, " ").toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/(?:^|\s)\S/g, c => c.toUpperCase())
    .normalize()
}

function normalizarTextoCRM(str) {
  if (!str) return str
  let texto = String(str)
    .replace(/\r/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/ *\n */g, "\n")
    .trim()

  texto = texto.replace(/(^|[.!?]\s+|\n+)([a-zà-ÿ])/g, (_, prefixo, letra) => `${prefixo}${letra.toUpperCase()}`)
  return texto
}

function limparTextoSomenteLetras(texto) {
  return String(texto || "")
    .replace(/[^A-Za-z\u00C0-\u00FF\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

module.exports = {
  sanitizarTextoEntrada,
  normalizarStageKey,
  normalizarTextoGatilho,
  ehMensagemEntradaGlobal,
  normalizarNomeCidadeBusca,
  formatarNome,
  formatarCidade,
  normalizarTextoCRM,
  limparTextoSomenteLetras
}
