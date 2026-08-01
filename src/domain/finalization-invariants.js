function textoPreenchido(value, minLength = 1) {
  return typeof value === "string" && value.trim().length >= minLength
}

function isPlaceholderValue(value) {
  if (typeof value !== "string") return false
  const normalized = value.trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
  return ["", "informar depois", "nao informado", "nao sei", "sem informacao", "cliente", "voce", "placeholder"].includes(normalized) ||
    /^(nome|cpf|telefone|email|cidade|uf|descricao|beneficio|situacao|motivo|area|tipo|data de nascimento)\s+(do|da)\s+(cliente|caso)$/.test(normalized)
}

function collectFinalizationViolations({
  from,
  u,
  normalizarNumeroWhatsAppEnvio
}) {
  const violations = []
  const state = u || {}

  if (!state.nomeConfirmado || !textoPreenchido(state.nome, 3)) {
    violations.push("nome")
  }

  const telefoneBase = state.telefoneEhDoCliente === false
    ? state.whatsappContato
    : (state.whatsappContato || from)
  const telefone = normalizarNumeroWhatsAppEnvio(telefoneBase)
  const telefoneDigitos = String(telefone || "").replace(/\D/g, "")
  if (
    !state.whatsappVerificado ||
    !telefoneDigitos.startsWith("55") ||
    telefoneDigitos.length < 12 ||
    telefoneDigitos.length > 13
  ) {
    violations.push("telefone")
  }

  if (!textoPreenchido(state.cidade, 2)) {
    violations.push("cidade")
  }

  const relato = state.descricao || state._audioCanalTranscricao || state.assuntoResumo
  if (!textoPreenchido(relato, 3)) {
    violations.push("relato")
  }

  if (!textoPreenchido(state.area, 2)) {
    violations.push("area")
  }

  if (isPlaceholderValue(state.nome) || isPlaceholderValue(state.whatsappContato) || isPlaceholderValue(state.cidade) || isPlaceholderValue(state.area) || isPlaceholderValue(state.descricao)) {
    violations.push("placeholder")
  }

  const identidadeInvalida =
    typeof state.atendimentoParaTerceiro !== "boolean" ||
    typeof state.telefoneEhDoCliente !== "boolean" ||
    (state.atendimentoParaTerceiro === true && state.telefoneEhDoCliente !== false) ||
    (state._novoCasoParaTerceiro === true && state.atendimentoParaTerceiro !== true) ||
    (state.telefoneEhDoCliente === false && !textoPreenchido(state.whatsappContato, 10))

  if (identidadeInvalida) {
    violations.push("identidade")
  }

  return violations
}

function assertFinalizationInvariants(ctx) {
  const violations = collectFinalizationViolations(ctx)
  if (!violations.length) return

  const error = new Error(`cadastro incompleto: ${violations.join(", ")}`)
  error.code = "FINALIZATION_INVARIANTS_VIOLATION"
  error.violations = violations
  throw error
}

function assertFinalizationOperation(operation, result) {
  if (result) return result

  const error = new Error(`falha obrigatoria ao finalizar cadastro: ${operation}`)
  error.code = "FINALIZATION_INTEGRATION_FAILURE"
  error.operation = operation
  throw error
}

module.exports = {
  assertFinalizationInvariants,
  assertFinalizationOperation,
  collectFinalizationViolations
}
