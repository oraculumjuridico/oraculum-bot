"use strict"

/**
 * Resolvedor unificado de nomes para WhatsApp Admin
 * 
 * Estabelece ordem clara de prioridade para exibição de nomes:
 * 1. Nome completo válido do contato HubSpot (firstname + lastname ou firstname)
 * 2. Nome confirmado pelo usuário durante atendimento
 * 3. Nome salvo na sessão (nomeHubspot)
 * 4. Nome do perfil WhatsApp
 * 5. Fallback "Cliente"
 */

function sanitizarNomeExibicao(valor) {
  if (!valor || typeof valor !== "string") return ""
  const limpo = valor.trim()
  if (!limpo) return ""
  const lower = limpo.toLowerCase()
  if (lower === "cliente" || lower === "usuário" || lower === "usuário" || lower === "whatsapp") return ""
  if (/^[0-9+\-\s()]+$/.test(limpo)) return ""
  if (limpo.length < 2) return ""
  return limpo
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

function resolverNomeParaAdmin(item) {
  const contato = item?.contato
  const u = item?.u || {}
  
  // 1. Nome completo do HubSpot (prioridade máxima se existir)
  const nomeHubSpotCompleto = montarNomeCompletoHubSpot(contato)
  if (nomeHubSpotCompleto) {
    return nomeHubSpotCompleto
  }
  
  // 2. Nome confirmado durante o atendimento
  if (u.nomeConfirmado) {
    const nomeConfirmado = sanitizarNomeExibicao(u.nome)
    if (nomeConfirmado) return nomeConfirmado
  }
  
  // 3. Nome já salvo do HubSpot na sessão
  const nomeHubspotSessao = sanitizarNomeExibicao(u.nomeHubspot)
  if (nomeHubspotSessao) return nomeHubspotSessao
  
  // 4. Nome do perfil do WhatsApp (preferir nomePerfilWhatsApp sobre nomeWA)
  const nomePerfilWhatsApp = sanitizarNomeExibicao(u.nomePerfilWhatsApp)
  const nomeWA = sanitizarNomeExibicao(u.nomeWA)
  
  // Se nomeWA não tem espaço mas nomePerfilWhatsApp tem, preferir o perfil
  if (nomeWA && nomePerfilWhatsApp) {
    const temEspacoWA = /\s/.test(nomeWA)
    const temEspacoPerfil = /\s/.test(nomePerfilWhatsApp)
    if (!temEspacoWA && temEspacoPerfil) {
      return nomePerfilWhatsApp
    }
  }
  
  if (nomeWA) return nomeWA
  if (nomePerfilWhatsApp) return nomePerfilWhatsApp
  
  // 5. Nome do objeto base
  const nomeBase = sanitizarNomeExibicao(u.nome)
  if (nomeBase) return nomeBase
  
  // 6. Fallback final
  return "Cliente"
}

function resolverNomeParaUsuario(u) {
  if (!u) return "Cliente"
  
  // Criar item simulado para usar o resolvedor
  const item = {
    u,
    contato: null
  }
  
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
  montarNomeCompletoHubSpot,
  resolverNomeParaAdmin,
  resolverNomeParaUsuario,
  primeiroEUltimoNome
}
