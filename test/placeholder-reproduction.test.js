const assert = require("node:assert/strict")
const {
  campoAdminAssistidoPreenchido,
  camposFaltantesAdminAssistido,
  valorENormalizadoInvalido,
  normalizarAreaJuridicaAdminAssistido
} = require("../src/domain/admin-assisted-ai-schema")
const {
  collectFinalizationViolations
} = require("../src/domain/finalization-invariants")
const {
  normalizarNumeroWhatsAppEnvio
} = require("../src/domain/phone-name")
const {
  confirmarCriarCasoAdminAssistido,
  montarUsuarioFinalizacaoAdminAssistido,
  labelInvariante
} = require("../src/domain/admin-assisted-ai-flow")

const CAMPOS_CRITICOS = new Set(["nomeCompleto", "telefone", "cidade", "areaJuridica", "descricao"])

const PLACEHOLDERS = {
  nomeCompleto: "nome do cliente",
  cpf: "cpf do cliente",
  dataNascimento: "data de nascimento do cliente",
  telefone: "telefone do cliente",
  email: "email do cliente",
  cidade: "cidade do cliente",
  uf: "uf do cliente",
  areaJuridica: "areaJuridica",
  descricao: "descricao do caso"
}

function dadosComPlaceholders(overrides = {}) {
  const dados = {}
  for (const [campo, valor] of Object.entries(PLACEHOLDERS)) {
    dados[campo] = { valor, status: "confirmado" }
  }
  return { ...dados, ...overrides }
}

function makeDepsMock(finalizarFn) {
  const logs = []
  const sessoes = new Map()
  return {
    deps: {
      sessoesAdminWhatsApp: sessoes,
      normalizarNumeroWhatsAppEnvio,
      finalizarCadastroAssistido: finalizarFn,
      logErro: (categoria, msg) => logs.push({ categoria, msg }),
      logDebug: (tag, msg) => logs.push({ tag, msg }),
      logAdminAssistido: (payload) => logs.push({ type: "admin_log", payload }),
      agendarPersistenciaSessoesAdminAssistidas: () => true
    },
    logs,
    sessoes
  }
}

function adminAssistidoComDados(dados) {
  return {
    ativo: true,
    etapa: "revisao_caso",
    iniciadoEm: new Date().toISOString(),
    dados,
    analise: { areaJuridica: "Civil" },
    pendentesPosterior: []
  }
}

const dadosReais = {
  nomeCompleto: { valor: "Maria da Silva", status: "confirmado" },
  cpf: { valor: "123.456.789-09", status: "confirmado" },
  dataNascimento: { valor: "15/03/1990", status: "confirmado" },
  telefone: { valor: "5581999999999", status: "confirmado" },
  email: { valor: "maria@example.com", status: "confirmado" },
  cidade: { valor: "Recife", status: "confirmado" },
  uf: { valor: "PE", status: "confirmado" },
  areaJuridica: { valor: "Civil", status: "confirmado" },
  tipoCaso: { valor: "Outros", status: "confirmado" },
  descricao: { valor: "Preciso de orientação jurídica sobre um contrato de locação.", status: "confirmado" }
}

;(async () => {
  // ============================================================
  // 1. Reprodução com placeholders reais → camada 1 detecta
  // ============================================================

  const dados = dadosComPlaceholders()
  const areaNormalizada = normalizarAreaJuridicaAdminAssistido("Civil")
  const faltantes = camposFaltantesAdminAssistido(dados, areaNormalizada)
  const faltantesCriticos = faltantes.filter(c => CAMPOS_CRITICOS.has(c))
  console.log("[TRACE] camposFaltantesAdminAssistido (placeholders):", faltantes)
  assert.ok(faltantesCriticos.includes("nomeCompleto"), "nomeCompleto com placeholder deveria ser faltante")
  assert.ok(faltantesCriticos.includes("telefone"), "telefone com placeholder deveria ser faltante")
  assert.ok(faltantesCriticos.includes("cidade"), "cidade com placeholder deveria ser faltante")
  assert.ok(faltantesCriticos.includes("descricao"), "descricao com placeholder deveria ser faltante")

  // ============================================================
  // 2. Placeholders nunca marcados como Confirmado
  // ============================================================

  assert.equal(campoAdminAssistidoPreenchido({ valor: "nome do cliente", status: "confirmado" }, "nomeCompleto"), false)
  assert.equal(campoAdminAssistidoPreenchido({ valor: "telefone do cliente", status: "confirmado" }, "telefone"), false)
  assert.equal(campoAdminAssistidoPreenchido({ valor: "cpf do cliente", status: "confirmado" }, "cpf"), false)
  assert.equal(campoAdminAssistidoPreenchido({ valor: "descricao do caso", status: "confirmado" }, "descricao"), false)

  // ============================================================
  // 3. Telefone textual recusado
  // ============================================================

  assert.equal(campoAdminAssistidoPreenchido({ valor: "telefone do cliente", status: "confirmado" }, "telefone"), false)
  assert.equal(campoAdminAssistidoPreenchido({ valor: "meu whatsapp", status: "confirmado" }, "telefone"), false)
  assert.equal(campoAdminAssistidoPreenchido({ valor: "5581999999999", status: "confirmado" }, "telefone"), true)

  // ============================================================
  // 4. CPF textual recusado
  // ============================================================

  assert.equal(campoAdminAssistidoPreenchido({ valor: "cpf do cliente", status: "confirmado" }, "cpf"), false)
  assert.equal(campoAdminAssistidoPreenchido({ valor: "123.456.789-09", status: "confirmado" }, "cpf"), true)
  assert.equal(campoAdminAssistidoPreenchido({ valor: "123", status: "confirmado" }, "cpf"), false)

  // ============================================================
  // 5. Data textual recusada
  // ============================================================

  assert.equal(campoAdminAssistidoPreenchido({ valor: "data de nascimento do cliente", status: "confirmado" }, "dataNascimento"), false)
  assert.equal(campoAdminAssistidoPreenchido({ valor: "01/01/1990", status: "confirmado" }, "dataNascimento"), true)
  assert.equal(campoAdminAssistidoPreenchido({ valor: "1990-01-01", status: "confirmado" }, "dataNascimento"), true)
  assert.equal(campoAdminAssistidoPreenchido({ valor: "nao sei", status: "confirmado" }, "dataNascimento"), false)

  // ============================================================
  // 6. Nome e relato genéricos recusados
  // ============================================================

  assert.equal(campoAdminAssistidoPreenchido({ valor: "nome do cliente", status: "confirmado" }, "nomeCompleto"), false)
  assert.equal(campoAdminAssistidoPreenchido({ valor: "descricao do caso", status: "confirmado" }, "descricao"), false)
  assert.equal(campoAdminAssistidoPreenchido({ valor: "Maria Silva", status: "confirmado" }, "nomeCompleto"), true)
  assert.equal(campoAdminAssistidoPreenchido({ valor: "Preciso de orientação jurídica.", status: "confirmado" }, "descricao"), true)

  // ============================================================
  // 7. Dados reais fictícios válidos aprovados
  // ============================================================

  const faltantesReais = camposFaltantesAdminAssistido(dadosReais, "Civil")
  const faltantesCriticosReais = faltantesReais.filter(c => CAMPOS_CRITICOS.has(c))
  assert.equal(faltantesCriticosReais.length, 0, "dados reais válidos não deveriam ter campos críticos faltando")

  // ============================================================
  // 8. Atendimento do Admin para terceiro
  // ============================================================

  const dadosTerceiro = {
    ...dadosReais,
    telefone: { valor: "5581888888888", status: "confirmado" },
    nomeCompleto: { valor: "João Terceiro", status: "confirmado" }
  }
  const faltantesTerceiro = camposFaltantesAdminAssistido(dadosTerceiro, "Civil")
  const faltantesCriticosTerceiro = faltantesTerceiro.filter(c => CAMPOS_CRITICOS.has(c))
  assert.equal(faltantesCriticosTerceiro.length, 0, "dados de terceiro válidos não deveriam ter campos críticos faltando")

  // ============================================================
  // 9. Telefone do Admin não copiado para o cliente
  // ============================================================

  const adminAssistidoTerceiro = {
    ativo: true, etapa: "revisao_caso", iniciadoEm: new Date().toISOString(),
    dados: dadosTerceiro, analise: { areaJuridica: "Civil" }, pendentesPosterior: [],
    atendimentoParaTerceiro: true, telefoneEhDoCliente: false
  }
  const uTerceiro = montarUsuarioFinalizacaoAdminAssistido("5581999999999", adminAssistidoTerceiro, { normalizarNumeroWhatsAppEnvio })
  assert.equal(uTerceiro.whatsappContato, "5581888888888", "telefone do cliente deveria ser o do terceiro, não do admin")
  assert.notEqual(uTerceiro.whatsappContato, "5581999999999", "telefone do admin não deveria ser copiado para o cliente")

  // ============================================================
  // 10. Revisão com placeholders → volta para coleta (camada 1)
  // ============================================================

  {
    let finalizarChamado = false
    const { deps } = makeDepsMock(() => { finalizarChamado = true; return "CASO-001" })
    const adminAssistido = adminAssistidoComDados(dadosComPlaceholders())
    const sessao = { adminAssistido }
    const result = await confirmarCriarCasoAdminAssistido("5581999999999", "chave-teste", sessao, adminAssistido, deps)
    assert.equal(finalizarChamado, false, "camada 1 (camposFaltantes) deveria bloquear antes da finalização")
    assert.ok(!result.texto.includes("Confirmar e criar caso"), "deveria voltar para coleta, não para confirmação")
  }

  // ============================================================
  // 11. Nova confirmação depois da correção
  // ============================================================

  {
    let finalizarChamado = false
    const { deps } = makeDepsMock(() => { finalizarChamado = true; return "CASO-123" })
    const adminComPlaceholder = adminAssistidoComDados(dadosComPlaceholders())
    const sessao1 = { adminAssistido: adminComPlaceholder }
    const result1 = await confirmarCriarCasoAdminAssistido("5581999999999", "chave-teste", sessao1, adminComPlaceholder, deps)
    assert.equal(finalizarChamado, false, "primeira tentativa com placeholders deveria falhar na camada 1")

    finalizarChamado = false
    const adminCorrigido = adminAssistidoComDados(dadosReais)
    const sessao2 = { adminAssistido: adminCorrigido }
    const result2 = await confirmarCriarCasoAdminAssistido("5581999999999", "chave-teste", sessao2, adminCorrigido, deps)
    assert.equal(finalizarChamado, true, "segunda tentativa com dados corretos deveria chamar finalizarCadastroAssistido")
    assert.ok(result2.texto.includes("Caso criado com sucesso"), "deveria retornar sucesso")
  }

  // ============================================================
  // 12. Nenhuma escrita antes da validação
  // ============================================================

  {
    let finalizarChamado = false
    let rollbackChamado = false
    const { deps } = makeDepsMock(() => { finalizarChamado = true; throw new Error("unexpected") })
    deps.rollbackCriacaoCasoAssistido = () => { rollbackChamado = true }
    const adminAssistido = adminAssistidoComDados(dadosComPlaceholders())
    const sessao = { adminAssistido }
    await confirmarCriarCasoAdminAssistido("5581999999999", "chave-teste", sessao, adminAssistido, deps)
    assert.equal(finalizarChamado, false, "nenhuma escrita deveria ocorrer antes da validação")
    assert.equal(rollbackChamado, false, "nenhum rollback deveria ocorrer — não houve escrita")
  }

  // ============================================================
  // 13. Nenhum loop de confirmação
  // ============================================================

  {
    let chamadas = 0
    const { deps } = makeDepsMock(() => {
      chamadas++
      if (chamadas < 3) throw new Error("simulado")
      return "CASO-OK"
    })
    const adminAssistido = adminAssistidoComDados(dadosReais)
    const sessao1 = { adminAssistido }
    const result1 = await confirmarCriarCasoAdminAssistido("5581999999999", "chave-loop", sessao1, adminAssistido, deps)
    assert.ok(result1.texto.includes("Não consegui criar"), "deveria mostrar falha")
    const sessao2 = { adminAssistido }
    const result2 = await confirmarCriarCasoAdminAssistido("5581999999999", "chave-loop", sessao2, adminAssistido, deps)
    assert.ok(result2.texto.includes("Não consegui criar"), "deveria mostrar falha")
    const sessao3 = { adminAssistido }
    const result3 = await confirmarCriarCasoAdminAssistido("5581999999999", "chave-loop", sessao3, adminAssistido, deps)
    assert.ok(result3.texto.includes("Caso criado com sucesso"), "deveria ter sucesso na terceira tentativa")
    assert.equal(chamadas, 3, "deveria ter chamado finalizarCadastroAssistido 3 vezes")
  }

  // ============================================================
  // 14. Logs sanitizados com failedInvariant (catch / fallback)
  // ============================================================

  {
    const errorComViolations = new Error("cadastro incompleto: telefone")
    errorComViolations.code = "FINALIZATION_INVARIANTS_VIOLATION"
    errorComViolations.violations = ["telefone"]
    errorComViolations.stage = "canonical_executor"
    errorComViolations.adapter = "hubspot"

    let finalizarChamado = false
    const { deps, logs } = makeDepsMock(() => {
      finalizarChamado = true
      throw errorComViolations
    })

    const adminAssistido = adminAssistidoComDados(dadosReais)
    const sessao = { adminAssistido }
    const result = await confirmarCriarCasoAdminAssistido("5581999999999", "chave-teste", sessao, adminAssistido, deps)

    assert.equal(finalizarChamado, true, "finalizarCadastroAssistido deveria ser chamado com dados válidos")
    assert.ok(result.texto.includes("Não consegui criar o caso com segurança"), "deveria retornar mensagem de falha")

    const logAdmin = logs.find(l => l.type === "admin_log" && l.payload?.evento === "criacao_caso_falhou_rollback_sessao")
    assert.ok(logAdmin, "deveria registrar log de falha com rollback")
    assert.equal(logAdmin.payload.code, "FINALIZATION_INVARIANTS_VIOLATION")
    assert.ok(logAdmin.payload.failedInvariant.includes("telefone"), "deveria incluir failedInvariant")
    assert.equal(logAdmin.payload.stage, "canonical_executor")
    assert.equal(logAdmin.payload.adapter, "hubspot")

    const logErro = logs.find(l => l.categoria === "admin_assistido")
    assert.ok(logErro, "deveria registrar logErro")
    assert.ok(logErro.msg.includes("FINALIZATION_INVARIANTS_VIOLATION"))
    assert.ok(logErro.msg.includes("failedInvariant=telefone"))
    assert.ok(logErro.msg.includes("stage=canonical_executor"))
    assert.ok(logErro.msg.includes("adapter=hubspot"))
  }

  // ============================================================
  // 15. Trace: collectFinalizationViolations com placeholders
  // ============================================================

  const uPlaceholders = montarUsuarioFinalizacaoAdminAssistido("5581999999999", adminAssistidoComDados(dadosComPlaceholders()), { normalizarNumeroWhatsAppEnvio })
  const violsPlaceholders = collectFinalizationViolations({
    from: "5581999999999",
    u: uPlaceholders,
    normalizarNumeroWhatsAppEnvio
  })
  console.log("[TRACE] collectFinalizationViolations (placeholders):", violsPlaceholders)
  assert.ok(violsPlaceholders.includes("telefone"), "telefone deveria falhar — placeholder não é número válido")

  // ============================================================
  // 16. labelInvariante
  // ============================================================

  assert.equal(labelInvariante("nome"), "Nome (mínimo 3 caracteres)")
  assert.equal(labelInvariante("telefone"), "Telefone/WhatsApp (com DDD e 9º dígito)")
  assert.equal(labelInvariante("cidade"), "Cidade (mínimo 2 caracteres)")
  assert.equal(labelInvariante("relato"), "Relato/descrição (mínimo 3 caracteres)")
  assert.equal(labelInvariante("area"), "Área jurídica (mínimo 2 caracteres)")
  assert.equal(labelInvariante("identidade"), "Identidade do atendimento (cliente/terceiro)")

  console.log("\n=== placeholder-reproduction.test.js: ok ===")
  console.log("  - Todos os placeholders rejeitados pela camada 1 (campoAdminAssistidoPreenchido)")
  console.log("  - Telefone textual recusado")
  console.log("  - CPF textual recusado")
  console.log("  - Data textual recusada")
  console.log("  - Nome e relato genéricos recusados")
  console.log("  - Dados reais fictícios válidos aprovados")
  console.log("  - Atendimento para terceiro validado")
  console.log("  - Telefone do admin não copiado para cliente")
  console.log("  - Revisão volta à coleta de campos inválidos (camada 1)")
  console.log("  - Nova confirmação após correção funciona")
  console.log("  - Nenhuma escrita antes da validação")
  console.log("  - Nenhum loop de confirmação")
  console.log("  - Logs sanitizados com failedInvariant (catch/fallback)")
  console.log("  - collectFinalizationViolations confirma: invariante 'telefone' falha com placeholders")
})().catch(e => { console.error(e); process.exit(1) })
