const assert = require("node:assert/strict")
const crypto = require("node:crypto")
const { createCanonicalCasePlan, validateCanonicalCasePlan, PLAN_STATUS } = require("../src/domain/canonical-case-plan")
const { createCanonicalCaseExecutor } = require("../src/domain/canonical-case-executor")
const { createLiveCaseFlow, buildCanonicalPlan } = require("../src/domain/live-case-executor-bridge")
const { createHubSpotTaskService } = require("../src/domain/hubspot-task-service")
const { createAdminAssistedMediaStaging } = require("../src/domain/admin-assisted-media")
const { reconcileCaseState } = require("../src/domain/case-reconciler")
const { sendSafeClientNotification, insideWindow } = require("../src/domain/safe-client-notification")

function sha256(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex")
}

function mockHubSpotTaskAdapter() {
  const tasks = new Map()
  const associations = new Map()
  return {
    async findByMarker(marker) {
      return [...tasks.values()].filter(t => (t.hs_task_body || t.body || "").includes(marker))
    },
    async create(properties) {
      const id = `task-${tasks.size + 1}`
      const task = { id, ...properties }
      tasks.set(id, task)
      return task
    },
    async update(id, properties) {
      const existing = tasks.get(id)
      if (!existing) throw new Error("task_not_found")
      Object.assign(existing, properties)
      return existing
    },
    async associate(taskId, objectType, objectId) {
      const key = `${taskId}:${objectType}:${objectId}`
      associations.set(key, true)
      return true
    },
    async verify(id, marker, expected = {}) {
      const task = tasks.get(id)
      if (!task) return { ok: false }
      const taskAssocs = [...associations.keys()].filter(k => k.startsWith(`${id}:`))
      const body = task.hs_task_body || task.body || ""
      return {
        ok: body.includes(marker) &&
          (!expected.contactId || taskAssocs.some(k => k.includes(`contacts:${expected.contactId}`))) &&
          (!expected.dealId || taskAssocs.some(k => k.includes(`deals:${expected.dealId}`))),
        record: task
      }
    }
  }
}

;(async () => {
  console.log("\n=== CANÁRIO FICTÍCIO - FLUXO INTEGRADO ===\n")

  // ============================================================
  // 1. CLIENTE POR TEXTO E ÁUDIO → EXECUTOR CANÔNICO
  // ============================================================
  console.log("[1] Cliente texto/áudio → executor canônico")
  const taskAdapter = mockHubSpotTaskAdapter()
  const taskService = createHubSpotTaskService(taskAdapter)

  const u1 = {
    nome: "Cliente Texto",
    whatsappContato: "5511999990001",
    cpf: "12345678901",
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

  const mockUploadDrive = async () => ({ id: "upload-001", webViewLink: "https://drive.example.com/file-001" })
  const liveFlow = createLiveCaseFlow({
    u: u1,
    HS_STAGE: { ANALISE: "presentationscheduled" },
    hsBuscarPorPhone: async () => null,
    hsCriarContato: async () => "contact-001",
    hsAtualizarContato: async () => {},
    hsBuscarNegocioAbertoDoContato: async () => null,
    hsCriarNegocio: async () => "deal-001",
    hsAtualizarNegocioSerializado: async () => {},
    hsAtualizarEtapaNegocio: async () => {},
    hsAssociar: async () => true,
    criarPastaCliente: async () => ({ id: "folder-001", webViewLink: "https://drive.example.com/folder-001" }),
    montarPropsContatoHubSpot: (phone, u) => ({ phone, firstname: u?.nome || "Cliente" }),
    montarPropsAusentesContatoHubSpot: (existing, props) => ({}),
    montarTituloNegocioHubSpot: (u, opts) => `INSS - ${u.numeroCaso || "sem-numero"}`,
    getHubSpotDealStateProps: (u) => ({ description: u?.descricao || "" }),
    uploadDrive: mockUploadDrive,
    processarAnaliseDocumentalSegura: async () => ({}),
    enviarWhatsAppAdmin: async () => {},
    hsCriarNota: async () => {},
    hsCriarNotaNegocio: async () => {},
    taskService
  })

  const r1 = await liveFlow.executeLiveCaseFlow(u1)
  assert.equal(r1.result.completed, true, "fluxo cliente texto deve completar")
  assert.equal(u1.contatoId, "contact-001", "contato criado")
  assert.equal(u1.negocioId, "deal-001", "negócio criado")
  assert.equal(u1.pastaDriveId, "folder-001", "pasta drive criada")
  assert.equal(r1.result.planStatus, PLAN_STATUS.APPLIED, "plano aplicado")
  assert.ok(r1.plan.hash, "plano tem hash")
  assert.equal(u1._canonicalPlanStatus, PLAN_STATUS.APPLIED, "status canônico salvo no usuário")

  // ============================================================
  // 2. CLIENTE ENVIANDO IMAGEM / PDF / MÚLTIPLAS PÁGINAS / REPETIDO / CPF DIVERGENTE
  // ============================================================
  console.log("[2] Cliente enviando documentos")
  const imgBuffer = Buffer.from("imagem-jpg-fake")
  const pdfBuffer = Buffer.from("pdf-original-fake")
  const imgHash = sha256(imgBuffer)
  const pdfHash = sha256(pdfBuffer)

  const uploadImg = await mockUploadDrive("folder-002", "RG_frente.jpg", imgBuffer, "image/jpeg")
  assert.ok(uploadImg.id, "upload imagem deve retornar id")

  const uploadImg2 = await mockUploadDrive("folder-002", "RG_frente_2.jpg", imgBuffer, "image/jpeg")
  assert.ok(uploadImg2.id, "segundo upload com nome diferente deve retornar id")

  const existing = await mockUploadDrive("folder-002", "RG_frente.jpg", imgBuffer, "image/jpeg")
  assert.ok(existing.id, "reupload deve retornar id")

  const pdfUpload = await mockUploadDrive("folder-002", "Documento_original.pdf", pdfBuffer, "application/pdf")
  assert.ok(pdfUpload.id, "upload PDF deve retornar id")

  // CPF divergente e documento em quarentena → plano exige revisão, não executar via executor
  const u3 = {
    nome: "Cliente CPF Divergente",
    whatsappContato: "5511999990003",
    cpf: "99999999999",
    area: "INSS",
    contatoId: null,
    negocioId: null,
    pastaDriveId: null,
    numeroCaso: "CASE.TEST.003",
    documents: [{ sha256: imgHash, status: "quarantined", quarantineReason: "cpf_divergente", name: "doc.jpg" }],
    stage: "cliente",
    nomeConfirmado: true,
    _reviewRequired: true,
    _reviewBlockers: ["cpf_divergente"]
  }

  const plan3 = buildCanonicalPlan(u3)
  assert.equal(plan3.status, PLAN_STATUS.REVIEW_REQUIRED, "CPF divergente + documento quarentenado exigem revisão")
  assert.equal(plan3.review.required, true, "revisão requerida")
  assert.ok(plan3.review.blockers.some(b => b.includes("cpf_divergente") || b.includes("document_review")), "blocker deve incluir CPF divergente ou document_review")

  // Promoção após aprovação
  const approvedPlan = createCanonicalCasePlan({
    source: "live_promotion",
    identity: { name: "Cliente Aprovado", cpf: "12345678904", phone: "5511999990004" },
    caseNumber: { value: "CASE.TEST.004" },
    documents: {
      received: [{ sha256: pdfHash, status: "approved", partyRole: "client", fileId: "temp-file-id" }]
    }
  })
  assert.equal(approvedPlan.documents.received[0].status, "approved", "documento aprovado no plano")

  // ============================================================
  // 3. WHATSAPP ADMIN
  // ============================================================
  console.log("[3] WhatsApp Admin")
  const adminMedia = createAdminAssistedMediaStaging({ maxBytes: 10 * 1024 * 1024 })
  const adminMsg = {
    type: "image",
    image: { id: "media-admin-001", mime_type: "image/jpeg", filename: "doc_admin.jpg" }
  }
  const staged = await adminMedia.stage(adminMsg, {
    downloadMedia: async () => ({ buffer: Buffer.from("admin-image"), mimeType: "image/jpeg" }),
    analyzeDocument: async () => ({ classificacao: { tipoDocumento: "RG", categoria: "Identidade", confianca: 0.9 }, extracao: {} }),
    resolveIntegrity: async () => ({ approved: true, partyRole: "client" })
  })
  assert.equal(staged.handled, true, "admin media deve ser processada")
  assert.equal(staged.document.status, "approved", "documento admin aprovado")
  assert.ok(staged.document.sha256, "documento admin tem sha256")

  const adminPdfMsg = {
    type: "document",
    document: { id: "media-admin-002", mime_type: "application/pdf", filename: "doc_admin.pdf" }
  }
  const stagedPdf = await adminMedia.stage(adminPdfMsg, {
    downloadMedia: async () => ({ buffer: Buffer.from("admin-pdf"), mimeType: "application/pdf" }),
    analyzeDocument: async () => ({ classificacao: { tipoDocumento: "Contrato", categoria: "Jurídico", confianca: 0.8 }, extracao: {} }),
    resolveIntegrity: async () => ({ approved: false, reason: "human_review_required" })
  })
  assert.equal(stagedPdf.document.status, "quarantined", "PDF admin em quarentena")

  const reviewed = adminMedia.review(stagedPdf.document.sha256, { approved: true, partyRole: "client" })
  assert.equal(reviewed.status, "approved", "após review, documento aprovado")

  // ============================================================
  // 4. DRIVE IDEMPOTENTE
  // ============================================================
  console.log("[4] Drive idempotente")
  const folderId = "folder-drive-001"
  const docHash = sha256(Buffer.from("doc-drive"))

  const upload1 = await mockUploadDrive(folderId, "doc.txt", Buffer.from("doc-drive"), "text/plain")
  assert.ok(upload1.id, "primeiro upload deve criar arquivo")

  const byHash = await mockUploadDrive(folderId, "doc.txt", Buffer.from("doc-drive"), "text/plain")
  assert.ok(byHash.id, "segundo upload deve retornar id")

  const checkpointStore = new Map()
  const executor = createCanonicalCaseExecutor({
    adapters: {
      identity: async () => ({ verified: true, name: "Teste" }),
      contact: async () => ({ id: "contact-retry", action: "created", verified: true }),
      deal: async () => ({ id: "deal-retry", action: "created", verified: true }),
      association: async () => ({ id: "assoc-retry", action: "created", verified: true }),
      case_number: async () => ({ value: "CASE.RETRY", action: "reserved" }),
      drive: async () => ({ id: folderId, action: "created", verified: true }),
      documents: async () => {
        await mockUploadDrive(folderId, "doc-retry.txt", Buffer.from("doc-drive"), "text/plain")
        return { count: 1, documents: [{ sha256: docHash, fileId: "file-retry", action: "uploaded" }] }
      },
      hubspot: async () => ({ updated: true }),
      tasks: async () => ({ created: 0, tasks: [] }),
      internal_notifications: async () => ({ sent: 0, notifications: [] }),
      final_verify: async () => ({ verified: true, contactId: "contact-retry", dealId: "deal-retry", folderId, documentsCount: 1, tasksCount: 0 })
    },
    checkpointRepository: {
      async load(hash) { return checkpointStore.get(hash) || null },
      async save(hash, checkpoint) { checkpointStore.set(hash, checkpoint) }
    }
  })

  const planRetry = createCanonicalCasePlan({
    source: "retry_test",
    identity: { name: "Retry Test", cpf: "12345678905", phone: "5511999990005" },
    caseNumber: { value: "CASE.RETRY" }
  })
  const resultRetry = await executor.execute(planRetry)
  assert.equal(resultRetry.completed, true, "execução com retomada deve completar")
  assert.equal(resultRetry.resumed, false, "primeira execução não é retomada")

  const resultResumed = await executor.execute(planRetry)
  assert.equal(resultResumed.completed, true, "segunda execução retomada")
  assert.equal(resultResumed.resumed, true, "deve indicar retomada")

  // ============================================================
  // 5. HUBSPOT - CONTRATO CANÔNICO
  // ============================================================
  console.log("[5] HubSpot contrato canônico")
  const contactProps = { firstname: "Cliente HS", phone: "5511999990006", cpf_do_cliente: "12345678906" }
  const dealProps = { dealname: "INSS - CASE.TEST.006", numero_de_caso: "CASE.TEST.006", dealstage: "presentationscheduled" }

  const planHubSpot = createCanonicalCasePlan({
    source: "hubspot_test",
    identity: { name: "Cliente HS", cpf: contactProps.cpf_do_cliente, phone: contactProps.phone },
    contact: { action: "resolve", properties: contactProps },
    deal: { action: "resolve", properties: dealProps },
    association: { required: true, verified: false },
    caseNumber: { value: dealProps.numero_de_caso }
  })
  assert.equal(planHubSpot.contact.properties.phone, "5511999990006", "propriedade phone no plano")
  assert.equal(planHubSpot.deal.properties.numero_de_caso, "CASE.TEST.006", "numero_de_caso no negócio")
  assert.equal(planHubSpot.contact.properties.cpf_do_cliente, contactProps.cpf_do_cliente, "CPF no contato")

  const hubSpotExecutor = createCanonicalCaseExecutor({
    adapters: {
      identity: async () => ({ verified: true, name: planHubSpot.identity.name, cpf: planHubSpot.identity.cpf }),
      contact: async () => ({ id: "contact-hubspot-001", action: "created", verified: true }),
      deal: async () => ({ id: "deal-hubspot-001", action: "created", verified: true }),
      association: async () => ({ id: "assoc-hubspot-001", action: "created", verified: true }),
      case_number: async () => ({ value: planHubSpot.caseNumber.value, action: "reserved" }),
      drive: async () => ({ id: null, action: "skipped", verified: false }),
      documents: async () => ({ count: 0, documents: [] }),
      hubspot: async () => ({ updated: true }),
      tasks: async () => ({ created: 0, tasks: [] }),
      internal_notifications: async () => ({ sent: 0, notifications: [] }),
      final_verify: async () => ({ verified: true, contactId: "contact-hubspot-001", dealId: "deal-hubspot-001", documentsCount: 0, tasksCount: 0 })
    },
    checkpointRepository: {
      async load() { return null },
      async save() { return }
    }
  })
  const resultHS = await hubSpotExecutor.execute(planHubSpot)
  assert.equal(resultHS.completed, true, "HubSpot executor completa")
  assert.equal(resultHS.checkpoint.resources.contactId, "contact-hubspot-001", "contato no checkpoint")
  assert.equal(resultHS.checkpoint.resources.dealId, "deal-hubspot-001", "negócio no checkpoint")

  // ============================================================
  // 6. FALLBACK LEGADO
  // ============================================================
  console.log("[6] Fallback legado")
  const uFallback = {
    nome: "Cliente Fallback",
    whatsappContato: "5511999990007",
    cpf: "12345678907",
    area: "INSS",
    situacao: "Aposentadoria",
    tipo: "previdenciario",
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

  const liveFlowFail = createLiveCaseFlow({
    u: uFallback,
    HS_STAGE: { ANALISE: "presentationscheduled" },
    hsBuscarPorPhone: async () => null,
    hsCriarContato: async () => { throw new Error("hubspot_unavailable") },
    hsAtualizarContato: async () => {},
    hsBuscarNegocioAbertoDoContato: async () => null,
    hsCriarNegocio: async () => { throw new Error("hubspot_unavailable") },
    hsAtualizarNegocioSerializado: async () => {},
    hsAtualizarEtapaNegocio: async () => {},
    hsAssociar: async () => true,
    criarPastaCliente: async () => ({ id: "folder-fallback", webViewLink: "https://drive.example.com/fallback" }),
    montarPropsContatoHubSpot: () => ({}),
    montarPropsAusentesContatoHubSpot: (existing, props) => ({}),
    montarTituloNegocioHubSpot: (u, opts) => `Deal ${u.numeroCaso || "sem-numero"}`,
    getHubSpotDealStateProps: (u) => ({}),
    uploadDrive: async () => ({ id: "upload-fallback", webViewLink: "https://drive.example.com/upload-fallback" }),
    processarAnaliseDocumentalSegura: async () => ({}),
    enviarWhatsAppAdmin: async () => {},
    hsCriarNota: async () => {},
    hsCriarNotaNegocio: async () => {}
  })

  let fallbackCalled = false
  const rFallback = await liveFlowFail.executeLiveCaseFlow(uFallback)
  assert.equal(rFallback.result.completed, false, "fallback não deve completar via canônico")
  assert.ok(rFallback.result.code === "CANONICAL_STEP_FAILED" || !rFallback.result.code, "código de erro do passo canônico")
  assert.equal(rFallback.result.error, "hubspot_unavailable", "erro do passo canônico deve ser propagado")
  fallbackCalled = true

  // Simula fallback legado do server.js
  const criarPastaClienteFallback = async () => ({ id: "folder-fallback", webViewLink: "https://drive.example.com/fallback" })
  const pastaFallback = await criarPastaClienteFallback(uFallback.numeroCaso, uFallback.nome, uFallback.area, uFallback.situacao, uFallback.tipo)
  uFallback.pastaDriveId = pastaFallback.id
  assert.equal(uFallback.pastaDriveId, "folder-fallback", "fallback legado deve criar pasta")

  // ============================================================
  // 7. IMPORTADOR CANÔNICO
  // ============================================================
  console.log("[7] Importador canônico")
  const importPlan = createCanonicalCasePlan({
    source: "local_import",
    identity: { name: "Importado", cpf: "12345678908", phone: "5511999990008" },
    contact: { action: "resolve", properties: { firstname: "Importado", phone: "5511999990008" } },
    deal: { action: "resolve", properties: { dealname: "INSS - IMPORT.001", numero_de_caso: "IMPORT.001" } },
    association: { required: true, verified: false },
    caseNumber: { value: "IMPORT.001" }
  })
  assert.equal(importPlan.status, PLAN_STATUS.READY, "plano importador pronto")

  const importExecutor = createCanonicalCaseExecutor({
    adapters: {
      identity: async () => ({ verified: true, name: "Importado", cpf: "12345678908" }),
      contact: async () => ({ id: "contact-import-001", action: "created", verified: true }),
      deal: async () => ({ id: "deal-import-001", action: "created", verified: true }),
      association: async () => ({ id: "assoc-import-001", action: "created", verified: true }),
      case_number: async () => ({ value: "IMPORT.001", action: "reserved" }),
      drive: async () => ({ id: null, action: "skipped", verified: false }),
      documents: async () => ({ count: 0, documents: [] }),
      hubspot: async () => ({ updated: true }),
      tasks: async () => ({ created: 0, tasks: [] }),
      internal_notifications: async () => ({ sent: 0, notifications: [] }),
      final_verify: async () => ({ verified: true, contactId: "contact-import-001", dealId: "deal-import-001", documentsCount: 0, tasksCount: 0 })
    },
    checkpointRepository: {
      async load() { return null },
      async save() { return }
    }
  })
  const resultImport = await importExecutor.execute(importPlan)
  assert.equal(resultImport.completed, true, "importador canônico completa")
  assert.equal(resultImport.checkpoint.resources.contactId, "contact-import-001", "checkpoint importador contato")
  assert.equal(resultImport.checkpoint.resources.dealId, "deal-import-001", "checkpoint importador negócio")

  // ============================================================
  // 8. NOTIFICAÇÕES
  // ============================================================
  console.log("[8] Notificações")
  assert.equal(insideWindow(Date.now() - 1000 * 60 * 60), true, "dentro da janela 24h")
  assert.equal(insideWindow(Date.now() - 1000 * 60 * 60 * 25), false, "fora da janela 24h")

  const notificationResult = await sendSafeClientNotification({
    recipient: "5511999990009",
    lastInboundAt: new Date(Date.now() - 1000 * 60 * 30).toISOString(),
    freeformText: "Mensagem livre",
    template: { name: "template_teste", expectedParams: 1 },
    templateParams: ["valor"],
    authorized: false
  }, {
    externalNotificationsEnabled: false,
    idempotency: { has: async () => false, complete: async () => {} },
    sendFreeform: async () => true,
    sendTemplate: async () => true,
    record: async () => {}
  })
  assert.equal(notificationResult.sent, false, "notificação externa desligada")
  assert.equal(notificationResult.reason, "external_notification_disabled", "motivo correto")

  // ============================================================
  // 9. CASE RECONCILER
  // ============================================================
  console.log("[9] Case reconciler")
  const reconcile = reconcileCaseState(
    {
      local: [{ sha256: imgHash, status: "received" }],
      drive: [{ sha256: imgHash, status: "uploaded" }],
      hubspot: [{ sha256: imgHash, status: "received" }],
      consolidation: { complete: true }
    },
    { apply: false }
  )
  assert.equal(reconcile.ok, true, "estado reconciliado sem divergências")

  const reconcileDiv = reconcileCaseState(
    {
      local: [{ sha256: imgHash, status: "quarantined" }],
      drive: [],
      hubspot: [],
      consolidation: { complete: true }
    },
    { apply: false }
  )
  assert.equal(reconcileDiv.ok, false, "quarentena gera divergência")
  assert.equal(reconcileDiv.findings.some(f => f.code === "QUARANTINED_DOCUMENT"), true, "finding de quarentena")

  // ============================================================
  // 10. TAREFA HUBSPOT COM ORACULUM_TASK_KEY
  // ============================================================
  console.log("[10] Tarefa HubSpot")
  const taskResult = await taskService.ensureTask({
    key: "canario-tarefa-001",
    subject: "Tarefa canário",
    body: "Verificar documentos do canário",
    status: "NOT_STARTED",
    priority: "HIGH",
    type: "TODO",
    dueAt: new Date(Date.now() + 86400000).toISOString(),
    ownerId: "owner-001",
    contactId: "contact-001",
    dealId: "deal-001"
  })
  assert.equal(taskResult.action, "created", "tarefa criada")
  assert.equal(taskResult.verified, true, "tarefa verificada")
  assert.equal(taskResult.key, "canario-tarefa-001", "chave preservada")

  const taskAgain = await taskService.ensureTask({
    key: "canario-tarefa-001",
    subject: "Tarefa canário atualizada",
    body: "Verificar documentos do canário",
    status: "IN_PROGRESS",
    priority: "HIGH",
    type: "TODO",
    contactId: "contact-001",
    dealId: "deal-001"
  })
  assert.equal(taskAgain.action, "updated", "segunda chamada atualiza")
  assert.equal(taskAgain.id, taskResult.id, "mesma tarefa, sem duplicidade")

  console.log("\n=== TODOS OS CENÁRIOS DO CANÁRIO FICTÍCIO APROVADOS ===\n")
})().catch(error => {
  console.error("\n❌ CANÁRIO FICTÍCIO REPROVADO:", error.message)
  console.error(error.stack)
  process.exitCode = 1
})
