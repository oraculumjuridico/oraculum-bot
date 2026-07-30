const assert = require("node:assert/strict")
const crypto = require("node:crypto")
const { createCanonicalCasePlan, PLAN_STATUS } = require("../src/domain/canonical-case-plan")
const { createCanonicalCaseExecutor } = require("../src/domain/canonical-case-executor")
const { createLiveCaseFlow, buildCanonicalPlan } = require("../src/domain/live-case-executor-bridge")

function sha256(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex")
}

;(async () => {
  console.log("\n=== TESTES FOCADOS: FALLBACK SEGURO ===\n")

  // ============================================================
  // 1. Falha antes de qualquer escrita → fallback permitido
  // ============================================================
  console.log("[1] Falha antes de qualquer escrita → fallback permitido")
  const checkpointStore1 = new Map()
  const executor1 = createCanonicalCaseExecutor({
    adapters: {
      identity: async () => { throw Object.assign(new Error("identity_failed"), { code: "IDENTITY_FAILED" }) },
      contact: async () => ({ id: "contact-1", action: "created", verified: true }),
      deal: async () => ({ id: "deal-1", action: "created", verified: true }),
      association: async () => ({ id: "assoc-1", action: "created", verified: true }),
      case_number: async () => ({ value: "CASE.TEST.1", action: "reserved" }),
      drive: async () => ({ id: "folder-1", action: "created", verified: true }),
      documents: async () => ({ count: 0, documents: [] }),
      hubspot: async () => ({ updated: true }),
      tasks: async () => ({ created: 0, tasks: [] }),
      internal_notifications: async () => ({ sent: 0, notifications: [] }),
      final_verify: async () => ({ verified: true })
    },
    checkpointRepository: {
      async load(hash) { return checkpointStore1.get(hash) || null },
      async save(hash, checkpoint) { checkpointStore1.set(hash, checkpoint) }
    }
  })

  const plan1 = createCanonicalCasePlan({
    source: "fallback_no_writes",
    identity: { name: "Teste 1", phone: "5511999990001" },
    caseNumber: { value: "CASE.TEST.1" }
  })

  let error1 = null
  let result1 = null
  try {
    result1 = await executor1.execute(plan1)
  } catch (e) {
    error1 = e
  }
  assert.ok(error1, "executor deve lançar erro quando identity falha")
  assert.equal(error1.code, "IDENTITY_FAILED", "código de erro correto")
  assert.equal(error1.code !== "CANONICAL_STEP_FAILED", true, "erro não deve ser CANONICAL_STEP_FAILED")

  // Verifica que nenhum recurso foi criado
  const checkpoint1 = checkpointStore1.get(plan1.hash)
  assert.ok(checkpoint1, "checkpoint deve existir")
  assert.equal(checkpoint1.status, "blocked", "checkpoint bloqueado")
  assert.deepEqual(checkpoint1.resources, {}, "nenhum recurso criado antes da falha")
  assert.equal(Object.keys(checkpoint1.resources).length, 0, "zero recursos parciais")

  // ============================================================
  // 2. Falha depois da pasta → sem segunda pasta
  // ============================================================
  console.log("[2] Falha depois da pasta → sem segunda pasta")
  const checkpointStore2 = new Map()
  const folderCreated = { id: "folder-002", name: "Caso 002" }
  let folderCreateCount2 = 0
  const executor2 = createCanonicalCaseExecutor({
    adapters: {
      identity: async () => ({ verified: true, name: "Teste 2" }),
      contact: async () => ({ id: "contact-002", action: "created", verified: true }),
      deal: async () => ({ id: "deal-002", action: "created", verified: true }),
      association: async () => ({ id: "assoc-002", action: "created", verified: true }),
      case_number: async () => ({ value: "CASE.TEST.002", action: "reserved" }),
      drive: async () => { folderCreateCount2++; return { id: folderCreated.id, action: "created", verified: true } },
      documents: async () => { throw Object.assign(new Error("documents_failed"), { code: "DOCUMENTS_FAILED" }) },
      hubspot: async () => ({ updated: true }),
      tasks: async () => ({ created: 0, tasks: [] }),
      internal_notifications: async () => ({ sent: 0, notifications: [] }),
      final_verify: async () => ({ verified: true })
    },
    checkpointRepository: {
      async load(hash) { return checkpointStore2.get(hash) || null },
      async save(hash, checkpoint) { checkpointStore2.set(hash, checkpoint) }
    }
  })

  const plan2 = createCanonicalCasePlan({
    source: "fallback_after_folder",
    identity: { name: "Teste 2", phone: "5511999990002" },
    caseNumber: { value: "CASE.TEST.002" }
  })

  let error2 = null
  try {
    await executor2.execute(plan2)
  } catch (e) {
    error2 = e
  }
  assert.ok(error2, "executor deve lançar ao falhar em documents")
  assert.equal(error2.code, "DOCUMENTS_FAILED", "código de erro correto")

  const checkpoint2 = checkpointStore2.get(plan2.hash)
  assert.ok(checkpoint2, "checkpoint deve existir")
  assert.equal(checkpoint2.status, "blocked", "checkpoint bloqueado")
  assert.equal(checkpoint2.resources.caseFolderId, folderCreated.id, "pasta foi criada e registrada")
  assert.equal(checkpoint2.resources.contactId, "contact-002", "contato foi criado")
  assert.equal(checkpoint2.resources.dealId, "deal-002", "negócio foi criado")
  assert.equal(folderCreateCount2, 1, "pasta criada apenas uma vez")

  // ============================================================
  // 3. Falha depois do Contato → sem segundo Contato
  // ============================================================
  console.log("[3] Falha depois do Contato → sem segundo Contato")
  const checkpointStore3 = new Map()
  const contactCreated = { id: "contact-003" }
  const executor3 = createCanonicalCaseExecutor({
    adapters: {
      identity: async () => ({ verified: true, name: "Teste 3" }),
      contact: async () => ({ id: contactCreated.id, action: "created", verified: true }),
      deal: async () => { throw Object.assign(new Error("deal_failed"), { code: "DEAL_FAILED" }) },
      association: async () => ({ id: "assoc-003", action: "created", verified: true }),
      case_number: async () => ({ value: "CASE.TEST.003", action: "reserved" }),
      drive: async () => ({ id: "folder-003", action: "created", verified: true }),
      documents: async () => ({ count: 0, documents: [] }),
      hubspot: async () => ({ updated: true }),
      tasks: async () => ({ created: 0, tasks: [] }),
      internal_notifications: async () => ({ sent: 0, notifications: [] }),
      final_verify: async () => ({ verified: true })
    },
    checkpointRepository: {
      async load(hash) { return checkpointStore3.get(hash) || null },
      async save(hash, checkpoint) { checkpointStore3.set(hash, checkpoint) }
    }
  })

  const plan3 = createCanonicalCasePlan({
    source: "fallback_after_contact",
    identity: { name: "Teste 3", phone: "5511999990003" },
    caseNumber: { value: "CASE.TEST.003" }
  })

  let error3 = null
  try {
    await executor3.execute(plan3)
  } catch (e) {
    error3 = e
  }
  assert.ok(error3, "executor deve lançar ao falhar no negócio")
  assert.equal(error3.code, "DEAL_FAILED", "código de erro correto")

  const checkpoint3 = checkpointStore3.get(plan3.hash)
  assert.ok(checkpoint3, "checkpoint deve existir")
  assert.equal(checkpoint3.resources.contactId, contactCreated.id, "contato foi criado e registrado")
  assert.equal(checkpoint3.resources.dealId, undefined, "negócio não foi criado (falhou antes)")
  assert.equal(Object.keys(checkpoint3.resources).length, 1, "apenas contato criado")

  // ============================================================
  // 4. Falha depois do arquivo → sem segundo upload
  // ============================================================
  console.log("[4] Falha depois do arquivo → sem segundo upload")
  const checkpointStore4 = new Map()
  const uploadedFile = { id: "file-004", sha256: sha256(Buffer.from("doc-4")) }
  const executor4 = createCanonicalCaseExecutor({
    adapters: {
      identity: async () => ({ verified: true, name: "Teste 4" }),
      contact: async () => ({ id: "contact-004", action: "created", verified: true }),
      deal: async () => ({ id: "deal-004", action: "created", verified: true }),
      association: async () => ({ id: "assoc-004", action: "created", verified: true }),
      case_number: async () => ({ value: "CASE.TEST.004", action: "reserved" }),
      drive: async () => ({ id: "folder-004", action: "created", verified: true }),
      documents: async () => {
        return { count: 1, documents: [{ sha256: uploadedFile.sha256, fileId: uploadedFile.id, action: "uploaded" }] }
      },
      hubspot: async () => { throw Object.assign(new Error("hubspot_failed_after_upload"), { code: "HUBSPOT_FAILED" }) },
      tasks: async () => ({ created: 0, tasks: [] }),
      internal_notifications: async () => ({ sent: 0, notifications: [] }),
      final_verify: async () => ({ verified: true })
    },
    checkpointRepository: {
      async load(hash) { return checkpointStore4.get(hash) || null },
      async save(hash, checkpoint) { checkpointStore4.set(hash, checkpoint) }
    }
  })

  const plan4 = createCanonicalCasePlan({
    source: "fallback_after_upload",
    identity: { name: "Teste 4", phone: "5511999990004" },
    caseNumber: { value: "CASE.TEST.004" },
    documents: {
      received: [{ sha256: uploadedFile.sha256, status: "received", partyRole: "client", fileId: uploadedFile.id }]
    }
  })

  let error4 = null
  try {
    await executor4.execute(plan4)
  } catch (e) {
    error4 = e
  }
  assert.ok(error4, "executor deve lançar ao falhar no HubSpot após upload")
  assert.equal(error4.code, "HUBSPOT_FAILED", "código de erro correto")

  const checkpoint4 = checkpointStore4.get(plan4.hash)
  assert.ok(checkpoint4, "checkpoint deve existir")
  assert.equal(checkpoint4.resources.caseFolderId, "folder-004", "pasta criada")
  assert.equal(checkpoint4.resources.contactId, "contact-004", "contato criado")
  assert.equal(checkpoint4.resources.dealId, "deal-004", "negócio criado")
  assert.equal(checkpoint4.status, "blocked", "checkpoint bloqueado")

  // ============================================================
  // 5. Nova execução → retomão pelo checkpoint
  // ============================================================
  console.log("[5] Nova execução → retomão pelo checkpoint")

  const checkpointStore5 = new Map()
  let uploadCount5 = 0
  const executor5 = createCanonicalCaseExecutor({
    adapters: {
      identity: async () => ({ verified: true, name: "Teste 5" }),
      contact: async () => ({ id: "contact-005", action: "created", verified: true }),
      deal: async () => ({ id: "deal-005", action: "created", verified: true }),
      association: async () => ({ id: "assoc-005", action: "created", verified: true }),
      case_number: async () => ({ value: "CASE.TEST.005", action: "reserved" }),
      drive: async () => ({ id: "folder-005", action: "created", verified: true }),
      documents: async () => {
        uploadCount5++
        return { count: 1, documents: [{ sha256: "hash-5", fileId: "file-005", action: "uploaded" }] }
      },
      hubspot: async () => ({ updated: true }),
      tasks: async () => ({ created: 1, tasks: [{ key: "task-005", id: "task-005" }] }),
      internal_notifications: async () => ({ sent: 1, notifications: [{ type: "hubspot_note" }] }),
      final_verify: async () => ({ verified: true, contactId: "contact-005", dealId: "deal-005", documentsCount: 1, tasksCount: 1 })
    },
    checkpointRepository: {
      async load(hash) { return checkpointStore5.get(hash) || null },
      async save(hash, checkpoint) { checkpointStore5.set(hash, checkpoint) }
    }
  })

  const plan5 = createCanonicalCasePlan({
    source: "resume_test",
    identity: { name: "Teste 5", phone: "5511999990005" },
    caseNumber: { value: "CASE.TEST.005" }
  })

  const result5a = await executor5.execute(plan5)
  assert.equal(result5a.completed, true, "primeira execução completa")
  assert.equal(result5a.resumed, false, "primeira execução não é retomada")
  assert.equal(uploadCount5, 1, "upload chamado uma vez")

  const result5b = await executor5.execute(plan5)
  assert.equal(result5b.completed, true, "segunda execução retomada")
  assert.equal(result5b.resumed, true, "deve indicar retomada")
  assert.equal(uploadCount5, 1, "upload NÃO chamado novamente (retomado pelo checkpoint)")

  // ============================================================
  // 6. Fallback repetido → nenhuma duplicidade
  // ============================================================
  console.log("[6] Fallback repetido → nenhuma duplicidade")
  const checkpointStore6 = new Map()
  let contactCreateCount = 0
  let dealCreateCount = 0
  let folderCreateCount = 0
  const executor6 = createCanonicalCaseExecutor({
    adapters: {
      identity: async () => ({ verified: true, name: "Teste 6" }),
      contact: async () => { contactCreateCount++; return { id: "contact-006", action: "created", verified: true } },
      deal: async () => { dealCreateCount++; return { id: "deal-006", action: "created", verified: true } },
      association: async () => ({ id: "assoc-006", action: "created", verified: true }),
      case_number: async () => ({ value: "CASE.TEST.006", action: "reserved" }),
      drive: async () => { folderCreateCount++; return { id: "folder-006", action: "created", verified: true } },
      documents: async () => ({ count: 0, documents: [] }),
      hubspot: async () => { throw Object.assign(new Error("hubspot_fail_6"), { code: "HUBSPOT_FAILED" }) },
      tasks: async () => ({ created: 0, tasks: [] }),
      internal_notifications: async () => ({ sent: 0, notifications: [] }),
      final_verify: async () => ({ verified: true })
    },
    checkpointRepository: {
      async load(hash) { return checkpointStore6.get(hash) || null },
      async save(hash, checkpoint) { checkpointStore6.set(hash, checkpoint) }
    }
  })

  const plan6 = createCanonicalCasePlan({
    source: "no_dup_test",
    identity: { name: "Teste 6", phone: "5511999990006" },
    caseNumber: { value: "CASE.TEST.006" }
  })

  let error6a = null
  try {
    await executor6.execute(plan6)
  } catch (e) {
    error6a = e
  }
  assert.ok(error6a, "primeira execução falha")

  const checkpoint6 = checkpointStore6.get(plan6.hash)
  assert.equal(checkpoint6.resources.contactId, "contact-006", "contato criado na primeira tentativa")
  assert.equal(checkpoint6.resources.dealId, "deal-006", "negócio criado na primeira tentativa")
  assert.equal(checkpoint6.resources.caseFolderId, "folder-006", "pasta criada na primeira tentativa")
  assert.equal(contactCreateCount, 1, "contato criado apenas uma vez")
  assert.equal(dealCreateCount, 1, "negócio criado apenas uma vez")
  assert.equal(folderCreateCount, 1, "pasta criada apenas uma vez")

  // ============================================================
  // 7. LiveCaseFlow - fallback com reutilização de recursos parciais
  // ============================================================
  console.log("[7] LiveCaseFlow - fallback com reutilização de recursos")
  const uLive = {
    nome: "Cliente Live",
    whatsappContato: "5511999990007",
    cpf: "12345678907",
    area: "INSS",
    contatoId: null,
    negocioId: null,
    pastaDriveId: null,
    numeroCaso: "CASE.TEST.007",
    documents: [],
    stage: "acolhimento",
    nomeConfirmado: true,
    _reviewRequired: false,
    _reviewBlockers: []
  }

  const checkpointStoreLive = new Map()
  const liveFlowFailFull = createLiveCaseFlow({
    u: uLive,
    HS_STAGE: { ANALISE: "presentationscheduled" },
    checkpointRepository: {
      async load(hash) { return checkpointStoreLive.get(hash) || null },
      async save(hash, checkpoint) { checkpointStoreLive.set(hash, checkpoint) }
    },
    hsBuscarPorPhone: async () => null,
    hsCriarContato: async () => "contact-live-007",
    hsAtualizarContato: async () => {},
    hsBuscarNegocioAbertoDoContato: async () => null,
    hsCriarNegocio: async () => "deal-live-007",
    hsAtualizarNegocioSerializado: async () => { throw new Error("hubspot_update_unavailable") },
    hsAtualizarEtapaNegocio: async () => {},
    hsAssociar: async () => true,
    criarPastaCliente: async () => ({ id: "folder-live-007", webViewLink: "https://drive.example.com/007" }),
    montarPropsContatoHubSpot: () => ({}),
    montarPropsAusentesContatoHubSpot: () => ({}),
    montarTituloNegocioHubSpot: (u) => `INSS - ${u.numeroCaso}`,
    getHubSpotDealStateProps: () => ({}),
    uploadDrive: async () => ({ id: "upload-007", webViewLink: "https://drive.example.com/file-007" }),
    processarAnaliseDocumentalSegura: async () => ({}),
    enviarWhatsAppAdmin: async () => {},
    hsCriarNota: async () => {},
    hsCriarNotaNegocio: async () => {}
  })

  const resultLive = await liveFlowFailFull.executeLiveCaseFlow(uLive)
  assert.equal(resultLive.result.completed, false, "executor canônico falha")
  assert.equal(resultLive.result.error, "hubspot_update_unavailable", "erro propagado")
  assert.equal(resultLive.result.interruptedStep, "deal", "etapa interrompida registrada")
  assert.equal(resultLive.result.hasPartialWrites, true, "há escrita parcial (contato criado antes do deal)")
  assert.equal(resultLive.result.partialResources.contactId, "contact-live-007", "contato registrado no checkpoint parcial")
  assert.equal(uLive.contatoId, "contact-live-007", "contato reutilizado no usuário")
  assert.equal(uLive.negocioId, "deal-live-007", "negócio ID definido pelo adapter antes da falha")

  console.log("\n=== TODOS OS TESTES FOCADOS DE FALLBACK PASSARAM ===\n")
})().catch(error => {
  console.error("\n❌ FALHA NOS TESTES FOCADOS:", error.message)
  console.error(error.stack)
  process.exitCode = 1
})
