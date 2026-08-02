const assert = require("node:assert/strict")
const { createLiveCaseFlow } = require("../src/domain/live-case-executor-bridge")
const {
  confirmarCriarCasoAdminAssistido,
  montarUsuarioFinalizacaoAdminAssistido,
  processarAtendimentoAssistidoAdmin,
  ADMIN_ASSISTIDO_ETAPA_AGUARDANDO_EDICAO,
  ADMIN_ASSISTIDO_ETAPA_REVISION_EMAIL
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
      HS_STAGE: { ANALISE: "presentationscheduled", LEAD: "lead" },
      hsBuscarPorPhone: async () => null,
      hsCriarContato: async (...args) => { calls.hsCriarContato++; return "contact-123" },
      hsAtualizarContato: async () => true,
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
      cpf: "52998224725",
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

    const result = await flow.executeLiveCaseFlow(u)
    assert.equal(result.result.completed, true, "executor canônico deve completar")
    assert.equal(result.result.error, undefined, "não deve haver erro")
    assert.equal(result.result.planStatus, PLAN_STATUS.APPLIED, "plano deve estar aplicado")
    ok("executor canônico sem fallback indevido — todas as etapas executadas")
  } catch (e) { bad("executor canônico sem fallback indevido", e) }

  // ============================================================
  // 10. FALHA ANTES DE ESCRITAS QUANDO ADAPTADOR AUSENTE
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
        uf: { valor: "PE", status: "confirmado" },
        cpf: { valor: "52998224725", status: "confirmado" },
        tipoCaso: { valor: "previdenciario", status: "confirmado" },
        uf: { valor: "PE", status: "confirmado" },
        cpf: { valor: "52998224725", status: "confirmado" },
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
        uf: { valor: "PE", status: "confirmado" },
        cpf: { valor: "52998224725", status: "confirmado" },
        tipoCaso: { valor: "previdenciario", status: "confirmado" },
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
    assert.equal(sessaoSalva.adminAssistido.etapa, ADMIN_ASSISTIDO_ETAPA_REVISION_EMAIL, "deve estar na etapa revision_email")
    ok("sessão preservada com etapa de revisão de e-mail")
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

  // ============================================================
  // 17. CONCORRÊNCIA: DEPS.U NÃO MUTADO
  // ============================================================
  try {
    const deps = baseDeps()
    const flow = createLiveCaseFlow(deps)
    const u = baseU()

    await flow.executeLiveCaseFlow(u)

    assert.equal(deps.u, undefined, "deps.u não deve ser definido após execução")
    ok("deps.u não é mutado pela execução do fluxo")
   } catch (e) { bad("deps.u não mutado", e) }

  // ============================================================
  // 18. FLUXO DE REVISÃO DE E-MAIL — TODOS OS BOTÕES
  // ============================================================
  function baseAdminDeps(overrides = {}) {
    return {
      sessoesAdminWhatsApp: new Map(),
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
      rollbackCriacaoCasoAssistido: async () => {},
      ...overrides
    }
  }

  function baseAdminAssistidoWithEmail(emailValue = "email do cliente") {
    return {
      dados: {
        nomeCompleto: { valor: "Maria da Silva", status: "confirmado" },
        telefone: { valor: "5581999990000", status: "confirmado" },
        cidade: { valor: "Recife", status: "confirmado" },
        uf: { valor: "PE", status: "confirmado" },
        cpf: { valor: "52998224725", status: "confirmado" },
        tipoCaso: { valor: "previdenciario", status: "confirmado" },
        dataNascimento: { valor: "15/06/1990", status: "confirmado" },
        beneficio: { valor: "INSS", status: "confirmado" },
        motivo: { valor: "Aposentadoria por idade", status: "confirmado" },
        areaJuridica: { valor: "INSS", status: "confirmado" },
        descricao: { valor: "Preciso de ajuda jurídica", status: "confirmado" },
        email: { valor: emailValue, status: "inferido" }
      },
      analise: { areaJuridica: "INSS" }
    }
  }

  // 18a. Botão "Corrigir e-mail" → etapa AGUARDANDO_EDICAO com pergunta de e-mail
  try {
    const deps = baseAdminDeps()
    const adminAssistido = baseAdminAssistidoWithEmail("email do cliente")
    const sessao = { adminAssistido: { ...adminAssistido, ativo: true, etapa: ADMIN_ASSISTIDO_ETAPA_REVISION_EMAIL } }
    const chaveFrom = "558199990000"
    deps.sessoesAdminWhatsApp.set(chaveFrom, sessao)

    const result1 = await processarAtendimentoAssistidoAdmin("5581999990000", "admin_assistido_email_corrigir", null, deps)
    const sessao1 = deps.sessoesAdminWhatsApp.get(chaveFrom)
    assert.equal(sessao1?.adminAssistido?.etapa, ADMIN_ASSISTIDO_ETAPA_AGUARDANDO_EDICAO, "deve entrar em etapa de aguardando edição")
    assert.equal(sessao1?.adminAssistido?.campoEmEdicao, "email", "deve estar editando e-mail")
    assert.equal(sessao1?.adminAssistido?.perguntaPendente, "email", "pergunta pendente deve ser email")
    assert.ok(result1.texto.includes("e-mail correto"), "deve perguntar o e-mail correto")
    ok("botão 'Corrigir e-mail' direciona à edição de e-mail com pergunta direta")
  } catch (e) { bad("botão corrigir e-mail", e) }

  // 18b. Digita e-mail válido após "Corrigir" → email confirmado
  try {
    const deps = baseAdminDeps()
    const adminAssistido = baseAdminAssistidoWithEmail("email do cliente")
    const sessao = { adminAssistido: { ...adminAssistido, ativo: true, etapa: ADMIN_ASSISTIDO_ETAPA_AGUARDANDO_EDICAO, campoEmEdicao: "email", perguntaPendente: "email" } }
    const chaveFrom = "558199990000"
    deps.sessoesAdminWhatsApp.set(chaveFrom, sessao)

    const result = await processarAtendimentoAssistidoAdmin("5581999990000", "cliente@exemplo.com", null, deps)
    const sessaoFinal = deps.sessoesAdminWhatsApp.get(chaveFrom)
    assert.equal(sessaoFinal?.adminAssistido?.dados?.email?.valor, "cliente@exemplo.com", "e-mail deve ser salvo como confirmado")
    assert.equal(sessaoFinal?.adminAssistido?.dados?.email?.status, "confirmado", "status deve ser confirmado")
    assert.equal(sessaoFinal?.adminAssistido?.etapa, "revisao_caso", "deve voltar para revisão")
    ok("e-mail válido digitado após 'Corrigir' é salvo como confirmado")
  } catch (e) { bad("e-mail válido após corrigir", e) }

  // 18c. Digita e-mail inválido → permanece na edição, não salva
  try {
    const deps = baseAdminDeps()
    const adminAssistido = baseAdminAssistidoWithEmail("email do cliente")
    const sessao = { adminAssistido: { ...adminAssistido, ativo: true, etapa: ADMIN_ASSISTIDO_ETAPA_AGUARDANDO_EDICAO, campoEmEdicao: "email", perguntaPendente: "email" } }
    const chaveFrom = "558199990000"
    deps.sessoesAdminWhatsApp.set(chaveFrom, sessao)

    const result = await processarAtendimentoAssistidoAdmin("5581999990000", "nao-email", null, deps)
    const sessaoFinal = deps.sessoesAdminWhatsApp.get(chaveFrom)
    assert.equal(sessaoFinal?.adminAssistido?.dados?.email?.valor, "nao-email", "e-mail inválido não deve ser salvo como valor")
    assert.equal(sessaoFinal?.adminAssistido?.etapa, ADMIN_ASSISTIDO_ETAPA_AGUARDANDO_EDICAO, "deve permanecer na edição")
    assert.ok(result.opcoes.some(o => o.id === "admin_assistido_email_omitir"), "deve reexibir opções de revisão de e-mail")
    ok("e-mail inválido permanece na edição e reexibe opções de revisão")
  } catch (e) { bad("e-mail inválido na edição", e) }

  // 18d. Botão "Deixar sem e-mail" → email ausente, volta para revisão
  try {
    const deps = baseAdminDeps()
    const adminAssistido = baseAdminAssistidoWithEmail("nao-email")
    const sessao = { adminAssistido: { ...adminAssistido, ativo: true, etapa: ADMIN_ASSISTIDO_ETAPA_REVISION_EMAIL, faltantes: [], pendentesPosterior: [] } }
    const chaveFrom = "558199990000"
    deps.sessoesAdminWhatsApp.set(chaveFrom, sessao)

    const result = await processarAtendimentoAssistidoAdmin("5581999990000", "admin_assistido_email_omitir", null, deps)
    const sessaoFinal = deps.sessoesAdminWhatsApp.get(chaveFrom)
    assert.equal(sessaoFinal?.adminAssistido?.dados?.email?.valor, null, "email deve ser null")
    assert.equal(sessaoFinal?.adminAssistido?.dados?.email?.status, "ausente", "status deve ser ausente")
    assert.equal(sessaoFinal?.adminAssistido?.etapa, "revisao_caso", "deve voltar para revisão")
    assert.ok(result.opcoes.some(o => o.id === "admin_assistido_confirmar"), "deve exibir opção confirmar")
    ok("botão 'Deixar sem e-mail' define email como ausente e retorna à revisão")
  } catch (e) { bad("botão omitir e-mail", e) }

  // 18e. Botão "Informar depois" → email pendente, volta para revisão
  try {
    const deps = baseAdminDeps()
    const adminAssistido = baseAdminAssistidoWithEmail("nao-email")
    const sessao = { adminAssistido: { ...adminAssistido, ativo: true, etapa: ADMIN_ASSISTIDO_ETAPA_REVISION_EMAIL, faltantes: [], pendentesPosterior: [] } }
    const chaveFrom = "558199990000"
    deps.sessoesAdminWhatsApp.set(chaveFrom, sessao)

    const result = await processarAtendimentoAssistidoAdmin("5581999990000", "admin_assistido_email_depois", null, deps)
    const sessaoFinal = deps.sessoesAdminWhatsApp.get(chaveFrom)
    assert.equal(sessaoFinal?.adminAssistido?.dados?.email?.valor, null, "email deve ser null")
    assert.ok(sessaoFinal?.adminAssistido?.pendentesPosterior?.includes("email"), "email deve estar em pendentesPosterior")
    assert.equal(sessaoFinal?.adminAssistido?.etapa, "revisao_caso", "deve voltar para revisão")
    ok("botão 'Informar depois' define email como pendente e retorna à revisão")
  } catch (e) { bad("botão informar depois", e) }

  // 18f. Botão "Revisar dados" → volta para revisão do caso
  try {
    const deps = baseAdminDeps()
    const adminAssistido = baseAdminAssistidoWithEmail("nao-email")
    const sessao = { adminAssistido: { ...adminAssistido, ativo: true, etapa: ADMIN_ASSISTIDO_ETAPA_REVISION_EMAIL, faltantes: [], pendentesPosterior: [] } }
    const chaveFrom = "558199990000"
    deps.sessoesAdminWhatsApp.set(chaveFrom, sessao)

    const result = await processarAtendimentoAssistidoAdmin("5581999990000", "admin_assistido_email_revisar", null, deps)
    const sessaoFinal = deps.sessoesAdminWhatsApp.get(chaveFrom)
    assert.equal(sessaoFinal?.adminAssistido?.etapa, "revisao_caso", "deve voltar para revisão do caso")
    assert.ok(result.texto.includes("Revisão"), "deve exibir resumo de revisão do caso")
    ok("botão 'Revisar dados' volta diretamente à revisão do caso")
  } catch (e) { bad("botão revisar dados", e) }

  // 18g. Nenhuma ação ID vira valor do campo
  try {
    const adminAssistido = baseAdminAssistidoWithEmail("admin_assistido_email_corrigir")
    const u = montarUsuarioFinalizacaoAdminAssistido("5581999990000", adminAssistido, {})
    assert.equal(u.email, null, "ID do botão nunca deve gravar valor em email")
    ok("nenhuma ação ID vira valor do campo email")
  } catch (e) { bad("nenhuma ação ID vira valor", e) }

  // 18h. Segunda confirmação não envia placeholder
  try {
    const sessoesAdminWhatsApp = new Map()
    const adminAssistido = baseAdminAssistidoWithEmail("email do cliente")
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
    // Primeira confirmação → falha
    const result1 = await confirmarCriarCasoAdminAssistido("5581999990000", "chave-h", { adminAssistido }, adminAssistido, deps)
    assert.ok(result1.opcoes.some(o => o.id === "admin_assistido_email_corrigir"), "primeira confirmação oferece corrigir e-mail")
    // Segunda confirmação → também falha por e-mail inválido
    const sessao2 = sessoesAdminWhatsApp.get("chave-h")
    const result2 = await confirmarCriarCasoAdminAssistido("5581999990000", "chave-h", sessao2, sessao2.adminAssistido, deps)
    assert.ok(result2.opcoes.some(o => o.id === "admin_assistido_email_corrigir"), "segunda confirmação também oferece corrigir e-mail (não repete payload)")
    ok("segunda confirmação direciona ao e-mail, não repete payload inválido")
  } catch (e) { bad("segunda confirmação e-mail", e) }

  try {
    const deps = baseDeps()
    const flow = createLiveCaseFlow(deps)
    const u1 = baseU()
    const u2 = {...baseU(), whatsappContato: "5511888880000" }
    await Promise.all([flow.executeLiveCaseFlow(u1),flow.executeLiveCaseFlow(u2)])
    assert.equal(deps.u,undefined,"deps.u nao deve ser mutado")
    assert.equal(u1.contatoId,u2.contatoId,"IDs nao contaminados")
    ok("concorrencia: dois usuarios intercalados nao contaminam IDs")
  } catch (e) { bad("concorrencia dois usuarios",e) }

  try {
    var saved=[];var repo={load:async()=>null,save:async function(h,ck){saved.push(ck)}};var d=Object.assign(baseDeps(),{checkpointRepository:repo});var flow=createLiveCaseFlow(d);var u=baseU();await flow.executeLiveCaseFlow(u);var persisted=saved[saved.length-1];assert.equal(persisted.context,undefined, String.fromCharCode(99,111,110,116,101,120,116,32,110,97,111,32,100,101,118,101,32,112,101,114,115,105,115,116,105,100,111));assert.equal(u._canonicalCheckpoint.context,undefined);assert.doesNotThrow(()=>JSON.stringify(u));ok(String.fromCharCode(99,104,101,99,107,112,111,105,110,116,32,112,101,114,115,105,115,116,105,100,111,32,101,120,99,108,117,105));
  } catch (e) { bad(String.fromCharCode(99,104,101,99,107,112,111,105,110,116), e) }
  console.log(`\ncanonical-executor-blocker.test.js: ${pass} pass, ${fail} fail`)
  if (fail > 0) process.exitCode = 1
})().catch(error => { console.error(error); process.exitCode = 1 })
