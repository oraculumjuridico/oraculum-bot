function contextoConversaValido(contexto) {
  return Boolean(contexto && typeof contexto === "object" && !Array.isArray(contexto))
}

function contextoConversaExpirado(contexto, agora = Date.now()) {
  if (!contextoConversaValido(contexto)) return false
  const expiracao = Date.parse(contexto.expiracao || "")
  return Number.isFinite(expiracao) && expiracao <= agora
}

function normalizarContextoConversa(contexto, agora = Date.now()) {
  if (!contextoConversaValido(contexto)) return null
  if (contextoConversaExpirado(contexto, agora)) return null

  return {
    ...contexto,
    entidade: contexto.entidade && typeof contexto.entidade === "object" && !Array.isArray(contexto.entidade)
      ? contexto.entidade
      : {},
    dados: contexto.dados && typeof contexto.dados === "object" && !Array.isArray(contexto.dados)
      ? contexto.dados
      : {},
    metadata: contexto.metadata && typeof contexto.metadata === "object" && !Array.isArray(contexto.metadata)
      ? contexto.metadata
      : {}
  }
}

function obterContextoConversaAtivo(usuario, agora = Date.now()) {
  if (!usuario) return null
  const contexto = normalizarContextoConversa(usuario.contextoConversa, agora)
  if (!contexto && usuario.contextoConversa) usuario.contextoConversa = null
  return contexto
}

function limparContextoConversa(usuario) {
  if (!usuario) return false
  if (!usuario.contextoConversa) return false
  usuario.contextoConversa = null
  return true
}

module.exports = {
  contextoConversaValido,
  contextoConversaExpirado,
  normalizarContextoConversa,
  obterContextoConversaAtivo,
  limparContextoConversa
}
