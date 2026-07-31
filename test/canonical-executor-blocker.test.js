const assert = require("node:assert/strict")
const { createLiveCaseFlow } = require("../src/domain/live-case-executor-bridge")
const {
  confirmarCriarCasoAdminAssistido,
  montarUsuarioFinalizacaoAdminAssistido,
  ADMIN_ASSISTIDO_ETAPA_EDITAR_CAMPO
} = require("../src/domain/admin-assisted-ai-flow")
const { normalizarNumeroWhatsAppEnvio } = require("../src/domain/phone-name")
const { PLAN_STATUS } = require("../src/domain/canonical-case-plan")

;(async () => {
  let pass = 0
  let fail = 0
  function ok(name) { pass++; console.log(`  ✓ ${name}`) }
  function bad(name, err) { fail++; console.error(`  ✗ ${name}: ${err.message}`) }

  function baseDeps(overrides = {}) {
    const calls = {
      criarPastaCliente: 0,
      hsCriarContato: 0,
      hsCriarNegocio: 0,
      hsAssociar: 0,
      uploadDrive: 0
    }
    return {
      calls,
      u: {},
      HS_STAGE: { ANALISE: "presentationscheduled", LEAD: "lead" },
      hsBuscarPorPhone: async () => null,
      hsCriarContato: async (...args) => { calls.hsCriarContato++; return "contact-123" },
      hsAtualizarContato: async () => {},
      hsBuscarNegocioAbertoDoContato: async () => null,
      hsCriarNegocio: async (...args) => { calls.hsCriarNegocio++; return "deal-456" },
      hsAtualizarNegocioSerializado: async () => {},
      hsAtualizarEtapaNegocio: async () => {},
      hsAssociar: async (...args) => { calls.hsAssociar++; return true },
      criarPastaCliente: async (...args) => { calls.criarPastaCliente++; return { id: "folder-789", webViewLink: "https://drive.example.com/folder-789" } },
      montarPropsContatoHubSpot: (phone, u) => ({ phone, firstname: u?.nome || "Cliente" }),
      montarPropsAusentesContatoHubSpot: (existing, props) => ({}),
      montarTituloNegocioHubSpot: (u, opts) => `Deal ${u.numeroCaso || "sem-numero"}`,
      getHubSpotDealStateProps: (u) => ({}),
      uploadDrive: async (...args) => { calls.uploadDrive++; return null },
      processarAnaliseDocumentalSegura: async () => ({}),
      enviarWhatsAppAdmin: async () => {},
      hsCriarNota: async () => {},
      hsCriarNotaNegocio: async () => {},
      ...overrides
    }
  }

  function baseU() {
    return {
      nome: "Cliente Teste",
      whatsappContato: "5511999990000",
      cpf: "12345678900",
      area: "INSS",
      situacao: "Aposentadoria",
      tipo: "previdenciario",
      contatoId: null,
      negocioId: null,
      pastaDriveId: null,
      numeroCaso: "CASE.TEST.001",
      documents: [],
      stage: "acolhimento",
      nomeConfirmado: true,
      _reviewRequired: false,
      _reviewBlockers: []
    }
  }

  // ============================================================
  // 8. CRIARPASTA CLIENTE LIGADA CORRETAMENTE
  // ============================================================
  try {
    const deps = baseDeps()
    const flow = createLiveCaseFlow(deps)
    const u = baseU()
    deps.u = u

    const result = await flow.executeLiveCaseFlow(u)
    assert.equal(result.result.completed, true, "fluxo deve completar")
    assert.equal(deps.calls.criarPastaCliente, 1, "criarPastaCliente deve ser chamada exatamente uma vez")
    assert.equal(u.pastaDriveId, "folder-789", "pastaDriveId deve ser definida")
    assert.equal(u.contatoId, "contact-123", "contatoId deve ser definida")
    assert.equal(u.negocioId, "deal-456", "negocioId deve ser definida")
    ok("criarPastaCliente ligada corretamente e executada pelo executor canônico")
  } catch (e) { bad("criarPastaCliente ligada corretamente", e) }

  // ============================================================
  // 9. EXECUTOR CANÔNICO SEM FALLBACK INDEVIDO
  // ============================================================
  try {
    const deps = baseDeps()
    const flow = createLiveCaseFlow(deps)
    const u = baseU()
    deps.u = u

    const result = await flow.executeLiveCaseFlow(u)
    assert.equal(result.result.completed, true, "executor canônico deve completar")
    assert.equal(result.result.error, undefined, "não deve haver erro")
    assert.equal(result.result.planStatus, PLAN_STATUS.APPLIED, "plano deve estar aplicado")
    ok("executor canônico sem fallback indevido — todas as etapas executadas")
  } catch (e) { bad("executor canônico sem fallback indevido", e) }

  // ============================================================
  // 10. FALHA ANTES DE ESCRITAS QUANDO ADAPTADOR AUSENTE
  //    Quando criarPastaCliente é undefined, o executor falha
  //    e o erro é capturado — sem fallback automático no executor
  // ============================================================
  try {
    const checkpointStore = new Map()
    const deps = baseDeps({
      criarPastaCliente: undefined,
      checkpointRepository: {
        async load(hash) { return checkpointStore.get(hash) || null },
        async save(hash, checkpoint) { checkpointStore.set(hash, checkpoint) }
      }
    })
    const flow = createLiveCaseFlow(deps)
    const u = baseU()
    deps.u = u

    const result = await flow.executeLiveCaseFlow(u)
    assert.equal(result.result.completed, false, "fluxo deve falhar")
    assert.ok(result.result.error.includes("criarPastaCliente"), "erro deve mencionar criarPastaCliente")
    assert.equal(result.result.interruptedStep, "drive", "passo interrompido deve ser drive")
    ok("falha capturada no executor quando adaptador obrigatório ausente — sem fallback automático")
  } catch (e) { bad("falha antes de escritas quando adaptador ausente", e) }

  // ============================================================
  // 11. NENHUMA AÇÃO EXTERNA REAL
  // ============================================================
  try {
    const deps = baseDeps()
    const flow = createLiveCaseFlow(deps)
    const u = baseU()
    deps.u = u

    await flow.executeLiveCaseFlow(u)
    assert.equal(deps.calls.criarPastaCliente, 1, "criarPastaCliente chamada 1x")
    assert.equal(deps.calls.hsCriarContato, 1, "hsCriarContato chamada 1x")
    assert.equal(deps.calls.hsCriarNegocio, 1, "hsCriarNegocio chamada 1x")
    assert.equal(deps.calls.hsAssociar, 1, "hsAssociar chamada 1x")
    ok("nenhuma ação externa real — todos os adaptadores são mocks chamados 1x")
  } catch (e) { bad("nenhuma ação externa real", e) }

  // ============================================================
  // 12. NENHUMA CRIAÇÃO DUPLICADA
  // ============================================================
  try {
    const deps = baseDeps()
    const flow = createLiveCaseFlow(deps)
    const u = baseU()
    deps.u = u

    const result = await flow.executeLiveCaseFlow(u)
    assert.equal(deps.calls.hsCriarContato, 1, "contato criado 1x (não duplicado)")
    assert.equal(deps.calls.hsCriarNegocio, 1, "negócio criado 1x (não duplicado)")
    assert.equal(deps.calls.criarPastaCliente, 1, "pasta criada 1x (não duplicada)")
    ok("nenhuma criação duplicada — cada adaptador chamado exatamente uma vez")
  } catch (e) { bad("nenhuma criação duplicada", e) }

  // ============================================================
  // 13. SEGUNDA CONFIRMAÇÃO NÃO REPETE PAYLOAD INVÁLIDO
  // ============================================================
  try {
    const sessoesAdminWhatsApp = new Map()
    const adminAssistido = {
      dados: {
        nomeCompleto: { valor: "Maria da Silva", status: "confirmado" },
        telefone: { valor: "5581999990000", status: "confirmado" },
        cidade: { valor: "Recife", status: "confirmado" },
        areaJuridica: { valor: "INSS", status: "confirmado" },
        descricao: { valor: "Preciso de ajuda jurídica", status: "confirmado" },
        email: { valor: "email do cliente", status: "inferido" }
      },
      analise: { areaJuridica: "INSS" }
    }
    const sessao = { adminAssistido }
    let chamadasFinalizar = 0

    const deps = {
      sessoesAdminWhatsApp,
      agendarPersistenciaSessoesAdminAssistidas: () => {},
      normalizarNumeroWhatsAppEnvio,
      finalizarCadastroAssistido: async () => {
        chamadasFinalizar++
        const err = new Error("falha obrigatoria ao finalizar cadastro: hubspot_contact")
        err.code = "FINALIZATION_INTEGRATION_FAILURE"
        err.operation = "hubspot_contact"
        throw err
      },
      registrarLogAdminAssistido: () => {},
      logErro: () => {},
      rollbackCriacaoCasoAssistido: async () => {}
    }

    const result = await confirmarCriarCasoAdminAssistido("5581999990000", "chave-test", sessao, adminAssistido, deps)

    assert.equal(chamadasFinalizar, 1, "finalizarCadastroAssistido chamado 1x")
    assert.ok(result.texto.includes("e-mail"), "deve mencionar e-mail")
    assert.ok(result.texto.includes("Corrigir"), "deve oferecer corrigir")
    assert.ok(result.opcoes.some(o => o.id === "admin_assistido_email_corrigir"), "deve ter opção corrigir e-mail")
    ok("segunda confirmação direciona ao campo e-mail, não repete payload")
  } catch (e) { bad("segunda confirmação não repete payload inválido", e) }

  // ============================================================
  // 14. SESSÃO PRESERVADA
  // ============================================================
  try {
    const sessoesAdminWhatsApp = new Map()
    const adminAssistido = {
      dados: {
        nomeCompleto: { valor: "Maria da Silva", status: "confirmado" },
        telefone: { valor: "5581999990000", status: "confirmado" },
        cidade: { valor: "Recife", status: "confirmado" },
        areaJuridica: { valor: "INSS", status: "confirmado" },
        descricao: { valor: "Preciso de ajuda jurídica", status: "confirmado" },
        email: { valor: "nao-email", status: "inferido" }
      },
      analise: { areaJuridica: "INSS" }
    }
    const sessao = { adminAssistido }

    const deps = {
      sessoesAdminWhatsApp,
      agendarPersistenciaSessoesAdminAssistidas: () => {},
      normalizarNumeroWhatsAppEnvio,
      finalizarCadastroAssistido: async () => {
        const err = new Error("falha obrigatoria ao finalizar cadastro: hubspot_contact")
        err.code = "FINALIZATION_INTEGRATION_FAILURE"
        err.operation = "hubspot_contact"
        throw err
      },
      registrarLogAdminAssistido: () => {},
      logErro: () => {},
      rollbackCriacaoCasoAssistido: async () => {}
    }

    await confirmarCriarCasoAdminAssistido("5581999990000", "chave-test", sessao, adminAssistido, deps)

    const sessaoSalva = sessoesAdminWhatsApp.get("chave-test")
    assert.ok(sessaoSalva, "sessão deve ser preservada")
    assert.ok(sessaoSalva.adminAssistido, "adminAssistido deve estar na sessão preservada")
    assert.equal(sessaoSalva.adminAssistido.etapa, ADMIN_ASSISTIDO_ETAPA_EDITAR_CAMPO, "deve estar na etapa de edição")
    assert.equal(sessaoSalva.adminAssistido.campoEmEdicao, "email", "deve estar editando e-mail")
    ok("sessão preservada com etapa de edição de e-mail")
  } catch (e) { bad("sessão preservada", e) }

  // ============================================================
  // 15. RETORNO AO CAMPO DE E-MAIL
  // ============================================================
  try {
    const sessoesAdminWhatsApp = new Map()
    const adminAssistido = {
      dados: {
        nomeCompleto: { valor: "Maria da Silva", status: "confirmado" },
        telefone: { valor: "5581999990000", status: "confirmado" },
        cidade: { valor: "Recife", status: "confirmado" },
        areaJuridica: { valor: "INSS", status: "confirmado" },
        descricao: { valor: "Preciso de ajuda jurídica", status: "confirmado" },
        email: { valor: "email do cliente", status: "inferido" }
      },
      analise: { areaJuridica: "INSS" }
    }
    const sessao = { adminAssistido }

    const deps = {
      sessoesAdminWhatsApp,
      agendarPersistenciaSessoesAdminAssistidas: () => {},
      normalizarNumeroWhatsAppEnvio,
      finalizarCadastroAssistido: async () => {
        const err = new Error("falha obrigatoria ao finalizar cadastro: hubspot_contact")
        err.code = "FINALIZATION_INTEGRATION_FAILURE"
        err.operation = "hubspot_contact"
        throw err
      },
      registrarLogAdminAssistido: () => {},
      logErro: () => {},
      rollbackCriacaoCasoAssistido: async () => {}
    }

    const result = await confirmarCriarCasoAdminAssistido("5581999990000", "chave-test", sessao, adminAssistido, deps)

    assert.ok(result.texto.includes("e-mail"), "mensagem deve mencionar e-mail")
    assert.ok(result.texto.includes("válido"), "mensagem deve dizer 'não é válido'")
    assert.ok(result.opcoes.some(o => o.id === "admin_assistido_email_revisar"), "deve ter opção revisar dados")
    ok("retorno ao campo de e-mail com mensagem clara")
  } catch (e) { bad("retorno ao campo de e-mail", e) }

  // ============================================================
  // 16. MONTAR USUÁRIO — EMAIL PLACEHOLDER NUNCA GRAVADO
  // ============================================================
  try {
    const adminAssistido = {
      dados: {
        nomeCompleto: { valor: "Maria da Silva", status: "confirmado" },
        telefone: { valor: "5581999990000", status: "confirmado" },
        cidade: { valor: "Recife", status: "confirmado" },
        areaJuridica: { valor: "INSS", status: "confirmado" },
        descricao: { valor: "Preciso de ajuda jurídica", status: "confirmado" },
        email: { valor: "email do cliente", status: "inferido" }
      }
    }
    const u = montarUsuarioFinalizacaoAdminAssistido("5581999990000", adminAssistido, {})
    assert.equal(u.email, null, "u.email deve ser null — placeholder nunca gravado")
    ok("placeholder 'email do cliente' nunca gravado como valor em u.email")
  } catch (e) { bad("placeholder nunca gravado", e) }

  console.log(`\ncanonical-executor-blocker.test.js: ${pass} pass, ${fail} fail`)
  if (fail > 0) process.exitCode = 1
})().catch(error => { console.error(error); process.exitCode = 1 })
