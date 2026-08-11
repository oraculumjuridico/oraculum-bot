const { normalizarTelefoneHubSpot } = require("./phone-name")
const { sanitizarTextoEntrada } = require("../utils/text")

function telefoneCanonico(...valores) {
  for (const valor of valores) {
    const normalizado = normalizarTelefoneHubSpot(valor)
    if (normalizado && /^55\d{10,11}$/.test(normalizado)) return normalizado
  }
  return ""
}

function obterContatoId(u = {}) {
  return String(u.contatoId || u.contactId || "").trim() || null
}

function definirContatoId(u, id) {
  const valor = String(id || "").trim() || null
  u.contatoId = valor
  u.contactId = valor
  return valor
}

function obterNegocioId(u = {}) {
  return String(u.negocioId || u.dealId || "").trim() || null
}

function definirNegocioId(u, id) {
  const valor = String(id || "").trim() || null
  u.negocioId = valor
  u.dealId = valor
  return valor
}

module.exports = {
  telefoneCanonico,
  obterContatoId,
  definirContatoId,
  obterNegocioId,
  definirNegocioId
}
