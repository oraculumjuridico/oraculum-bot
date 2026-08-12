"use strict"

function sanitizarNomeExibicao(valor) {
  if (!valor || typeof valor !== "string") return ""
  const limpo = valor.trim()
  if (!limpo) return ""
  const lower = limpo.toLowerCase()
  if (lower === "cliente" || lower === "usuário" || lower === "whatsapp") return ""
  if (/^[0-9+\-\s()]+$/.test(limpo)) return ""
  if (limpo.length < 2) return ""
  return limpo
}

function validarNomePerfilWhatsApp(nome) {
  const sanitizado = sanitizarNomeExibicao(nome)
  if (!sanitizado) return { valido: false, nome: "" }
  if (!/\s/.test(sanitizado) && sanitizado.length < 2) return { valido: false, nome: "" }
  return { valido: true, nome: sanitizado }
}

function montarNomeCompletoHubSpot(contato) {
  if (!contato || !contato.properties) return ""
  const firstname = sanitizarNomeExibicao(contato.properties.firstname)
  const lastname = sanitizarNomeExibicao(contato.properties.lastname)
  if (firstname && lastname) {
    return `${firstname} ${lastname}`
  }
  return firstname || lastname || ""
}

function resolverNomeUnificado({ contato, u, nomePerfilWhatsApp = "" } = {}) {
  if (u?.nomeConfirmado) {
    const nomeConfirmado = sanitizarNomeExibicao(u?.nome)
    if (nomeConfirmado) {
      return { nome: nomeConfirmado, origem: "confirmed_intake" }
    }
  }
  const nomeHubSpotCompleto = montarNomeCompletoHubSpot(contato)
  if (nomeHubSpotCompleto) {
    return { nome: nomeHubSpotCompleto, origem: "hubspot" }
  }
  const nomeHubspotSessao = sanitizarNomeExibicao(u?.nomeHubspot)
  if (nomeHubspotSessao) {
    return { nome: nomeHubspotSessao, origem: "persisted_session" }
  }
  const { valido: perfilValido, nome: perfilSanitizado } = validarNomePerfilWhatsApp(nomePerfilWhatsApp || u?.nomePerfilWhatsApp)
  if (perfilValido) {
    return { nome: perfilSanitizado, origem: "whatsapp_profile" }
  }
  const nomeWA = sanitizarNomeExibicao(u?.nomeWA)
  if (nomeWA) {
    return { nome: nomeWA, origem: "whatsapp_profile" }
  }
  const nomeBase = sanitizarNomeExibicao(u?.nome)
  if (nomeBase && !u?.nomeConfirmado) {
    return { nome: nomeBase, origem: "persisted_session" }
  }
  return { nome: "Cliente", origem: "fallback" }
}

function resolverNomeParaAdmin(item) {
  const resultado = resolverNomeUnificado(item)
  return resultado.nome
}

function resolverNomeParaUsuario(u) {
  if (!u) return "Cliente"
  const item = { u, contato: null }
  return resolverNomeParaAdmin(item)
}

function primeiroEUltimoNome(nomeCompleto) {
  if (!nomeCompleto || typeof nomeCompleto !== "string") return "Cliente"
  const nome = nomeCompleto.trim()
  if (!nome) return "Cliente"
  const partes = nome.split(/\s+/).filter(Boolean)
  if (partes.length === 0) return "Cliente"
  if (partes.length === 1) return partes[0]
  return `${partes[0]} ${partes[partes.length - 1]}`
}

module.exports = {
  sanitizarNomeExibicao,
  validarNomePerfilWhatsApp,
  montarNomeCompletoHubSpot,
  resolverNomeUnificado,
  resolverNomeParaAdmin,
  resolverNomeParaUsuario,
  primeiroEUltimoNome
}
