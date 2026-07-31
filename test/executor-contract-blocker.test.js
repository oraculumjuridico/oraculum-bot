const assert = require("node:assert/strict")
const { createLiveCaseFlow } = require("../src/domain/live-case-executor-bridge")

;(async () => {
  let pass = 0
  let fail = 0
  function ok(name) { pass++; console.log(`  ✓ ${name}`) }
  function bad(name, err) { fail++; console.error(`  ✗ ${name}: ${err.message}`) }

  function baseDeps(overrides = {}) {
    return {
      HS_STAGE: { ANALISE: "presentationscheduled" },
      hsBuscarPorPhone: async () => null,
      hsCriarContato: async () => "contact-123",
      hsAtualizarContato: async () => {},
      hsBuscarNegocioAbertoDoContato: async () => null,
      hsCriarNegocio: async () => "deal-456",
      hsAtualizarNegocioSerializado: async () => {},
      hsAtualizarEtapaNegocio: async () => {},
      hsAssociar: async () => true,
      criarPastaCliente: async () => ({ id: "folder-789", webViewLink: "https://drive.example.com/folder-789" }),
      montarPropsContatoHubSpot: (phone, u) => ({ phone, firstname: u?.nome || "Cliente" }),
      montarPropsAusentesContatoHubSpot: (existing, props) => ({}),
      montarTituloNegocioHubSpot: (u, opts) => "Deal",
      getHubSpotDealStateProps: (u) => ({}),
      uploadDrive: async () => null,
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
  // 1. typeof criarPastaCliente === "function" quando injetado
  // ============================================================
  try {
    const deps = baseDeps()
    assert.equal(typeof deps.criarPastaCliente, "function", "criarPastaCliente deve ser function")
    ok("typeof criarPastaCliente === 'function' quando injetado")
  } catch (e) { bad("typeof criarPastaCliente", e) }

  // ============================================================
  // 2. Executor canônico chamado uma vez — sucesso
  // ============================================================
  try {
    const checkpointStore = new Map()
    let executorCallCount = 0
    const deps = baseDeps({
      criarPastaCliente: async () => { executorCallCount++; return { id: "folder-789", webViewLink: "https://drive.example.com/folder-789" } },
      checkpointRepository: {
        async load(hash) { return checkpointStore.get(hash) || null },
        async save(hash, checkpoint) { checkpointStore.set(hash, checkpoint) }
      }
    })
    const flow = createLiveCaseFlow(deps)
    const u = baseU()

    const result = await flow.executeLiveCaseFlow(u)
    assert.equal(result.result.completed, true, "fluxo deve completar")
    assert.equal(executorCallCount, 1, "executor canônico chamado exatamente uma vez")
    ok("executor canônico chamado uma vez — sucesso")
  } catch (e) { bad("executor chamado uma vez", e) }

  // ============================================================
  // 3. Fallback legado chamado zero vezes (não existe fallback)
  // ============================================================
  try {
    let legacyFallbackCalled = false
    const checkpointStore = new Map()
    const deps = baseDeps({
      checkpointRepository: {
        async load(hash) { return checkpointStore.get(hash) || null },
        async save(hash, checkpoint) { checkpointStore.set(hash, checkpoint) }
      }
    })
    const flow = createLiveCaseFlow(deps)
    const u = baseU()

    const result = await flow.executeLiveCaseFlow(u)
    assert.equal(legacyFallbackCalled, false, "nenhum fallback legado chamado")
    ok("fallback legado chamado zero vezes")
  } catch (e) { bad("fallback zero vezes", e) }

  // ============================================================
  // 4. Adaptadores chamados na ordem esperada
  // ============================================================
  try {
    const order = []
    const checkpointStore = new Map()
    const deps = baseDeps({
      hsBuscarPorPhone: async () => { order.push("contact"); return null },
      hsCriarContato: async () => { order.push("contact_create"); return "contact-123" },
      hsCriarNegocio: async () => { order.push("deal_create"); return "deal-456" },
      hsAssociar: async () => { order.push("association"); return true },
      criarPastaCliente: async () => { order.push("drive"); return { id: "folder-789", webViewLink: "https://drive.example.com/folder-789" } },
      checkpointRepository: {
        async load(hash) { return checkpointStore.get(hash) || null },
        async save(hash, checkpoint) { checkpointStore.set(hash, checkpoint) }
      }
    })
    const flow = createLiveCaseFlow(deps)
    const u = baseU()

    const result = await flow.executeLiveCaseFlow(u)
    assert.equal(result.result.completed, true, "fluxo deve completar")
    assert.ok(order.includes("contact") && order.includes("deal_create") && order.includes("association") && order.includes("drive"), "todos os adaptadores foram chamados")
    const contactIdx = order.indexOf("contact")
    const dealIdx = order.indexOf("deal_create")
    const assocIdx = order.indexOf("association")
    const driveIdx = order.indexOf("drive")
    assert.ok(contactIdx < dealIdx, "contact antes de deal")
    assert.ok(dealIdx < assocIdx, "deal antes de association")
    assert.ok(assocIdx < driveIdx, "association antes de drive")
    ok("adaptadores chamados na ordem esperada: identity → contact → deal → association → drive")
  } catch (e) { bad("ordem dos adaptadores", e) }

  // ============================================================
  // 5. Ausência de dependência obrigatória interrompe sem fallback automático
  // ============================================================
  try {
    const checkpointStore = new Map()
    const writeAttempts = []
    const deps = baseDeps({
      hsCriarContato: async () => { writeAttempts.push("hsCriarContato"); return "contact-123" },
      hsCriarNegocio: async () => { writeAttempts.push("hsCriarNegocio"); return "deal-456" },
      hsAssociar: async () => { writeAttempts.push("hsAssociar"); return true },
      criarPastaCliente: undefined,
      uploadDrive: async () => { writeAttempts.push("uploadDrive"); return null },
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
    assert.equal(writeAttempts.includes("uploadDrive"), false, "uploadDrive não deve ser chamado após falha no drive")
    ok("ausência de criarPastaCliente interrompe no passo drive sem fallback automático")
  } catch (e) { bad("ausência de dependência obrigatória", e) }

  // ============================================================
  // 6. Nenhuma etapa executada duas vezes
  // ============================================================
  try {
    const callCounts = {}
    const checkpointStore = new Map()
    const deps = baseDeps({
      hsCriarContato: async () => { callCounts.hsCriarContato = (callCounts.hsCriarContato || 0) + 1; return "contact-123" },
      hsCriarNegocio: async () => { callCounts.hsCriarNegocio = (callCounts.hsCriarNegocio || 0) + 1; return "deal-456" },
      hsAssociar: async () => { callCounts.hsAssociar = (callCounts.hsAssociar || 0) + 1; return true },
      criarPastaCliente: async () => { callCounts.criarPastaCliente = (callCounts.criarPastaCliente || 0) + 1; return { id: "folder-789", webViewLink: "https://drive.example.com/folder-789" } },
      uploadDrive: async () => { callCounts.uploadDrive = (callCounts.uploadDrive || 0) + 1; return null },
      checkpointRepository: {
        async load(hash) { return checkpointStore.get(hash) || null },
        async save(hash, checkpoint) { checkpointStore.set(hash, checkpoint) }
      }
    })
    const flow = createLiveCaseFlow(deps)
    const u = baseU()

    const result = await flow.executeLiveCaseFlow(u)
    assert.equal(result.result.completed, true, "fluxo deve completar")
    assert.equal(callCounts.hsCriarContato, 1, "hsCriarContato chamado 1x")
    assert.equal(callCounts.hsCriarNegocio, 1, "hsCriarNegocio chamado 1x")
    assert.equal(callCounts.hsAssociar, 1, "hsAssociar chamado 1x")
    assert.equal(callCounts.criarPastaCliente, 1, "criarPastaCliente chamado 1x")
    ok("nenhuma etapa executada duas vezes")
  } catch (e) { bad("nenhuma etapa duas vezes", e) }

  console.log(`\ncanonical-executor-blocker.test.js (executor tests): ${pass} pass, ${fail} fail`)
  if (fail > 0) process.exitCode = 1
})().catch(error => { console.error(error); process.exitCode = 1 })
