const assert = require("node:assert/strict")
const { createLiveCaseFlow, buildCanonicalPlan } = require("../src/domain/live-case-executor-bridge")

;(async () => {
  const deps = {
    HS_STAGE: { ANALISE: "presentationscheduled" },
    hsBuscarPorPhone: async () => null,
    hsCriarContato: async () => "contact-123",
    hsAtualizarContato: async () => true,
    hsBuscarNegocioAbertoDoContato: async () => null,
    hsCriarNegocio: async () => "deal-456",
    hsAtualizarNegocioSerializado: async () => {},
    hsAtualizarEtapaNegocio: async () => {},
    hsAssociar: async () => true,
    criarPastaCliente: async () => ({ id: "folder-789", webViewLink: "https://drive.example.com/folder-789" }),
    montarPropsContatoHubSpot: (phone, u) => ({ phone, firstname: u?.nome || "Cliente" }),
    montarPropsAusentesContatoHubSpot: (existing, props) => ({}),
    montarTituloNegocioHubSpot: (u, opts) => `Deal ${u.numeroCaso || "sem-numero"}`,
    getHubSpotDealStateProps: (u) => ({}),
    uploadDrive: async () => null,
    processarAnaliseDocumentalSegura: async () => ({}),
    enviarWhatsAppAdmin: async () => {},
    hsCriarNota: async () => {},
    hsCriarNotaNegocio: async () => {}
  }

  const flow = createLiveCaseFlow(deps)

  const u = {
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

  const result = await flow.executeLiveCaseFlow(u)
  assert.equal(result.result.completed, true)
  assert.equal(u.contatoId, "contact-123")
  assert.equal(u.negocioId, "deal-456")
  assert.equal(u.pastaDriveId, "folder-789")
  assert.equal(u.numeroCaso, "CASE.TEST.001")
  assert.equal(result.result.planStatus, "applied")
  assert.ok(result.plan.hash)

  const plan2 = buildCanonicalPlan(u, { source: "test" })
  assert.equal(plan2.identity.name, "Cliente Teste")
  assert.equal(plan2.identity.cpf, "12345678900")
  assert.equal(plan2.caseNumber.value, "CASE.TEST.001")

  console.log("live-case-executor-bridge.test.js: ok")
})().catch(error => { console.error(error); process.exitCode = 1 })
