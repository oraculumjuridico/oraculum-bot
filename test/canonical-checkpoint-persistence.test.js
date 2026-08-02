const assert = require("assert")
const fs = require("fs")
const os = require("os")
const path = require("path")

delete process.env.GROQ_KEY

const {
  configurarStatePersistence,
  serializarUsers,
  persistirUsersAgora,
  carregarUsersPersistidos
} = require("../src/domain/state-persistence")
const {
  iniciarAtendimentoAssistidoAdmin,
  processarAtendimentoAssistidoAdmin
} = require("../src/domain/admin-assisted-ai-flow")

function briefing() {
  return {
    scoreEmocional: { valor: 0, nivel: "baixo" },
    scoreOperacional: 0,
    documentos: { total: 1, recebidos: 1, faltantesCriticos: [], pendentesFluxo: [] },
    consultaAtiva: false,
    proximaAcao: null
  }
}

function checkpointCircular(u) {
  const checkpoint = {
    schemaVersion: 1,
    planHash: "plan-hotfix",
    status: "blocked",
    resources: {
      contactId: "CONTACT-1",
      dealId: "DEAL-1",
      associationId: "ASSOC-1",
      caseFolderId: "FOLDER-1",
      caseNumber: "CASE-1"
    },
    steps: {
      contact: { status: "completed", result: { id: "CONTACT-1", action: "verified", verified: true } },
      deal: { status: "completed", result: { id: "DEAL-1", action: "verified", verified: true } },
      drive: { status: "completed", result: { id: "FOLDER-1", action: "verified", verified: true } },
      documents: { status: "completed", result: { count: 1, documents: [{ sha256: "a".repeat(64), fileId: "FILE-1", action: "uploaded" }] } }
    },
    context: { u, adapter: () => {}, request: { live: true } }
  }
  u._canonicalCheckpoint = checkpoint
  return checkpoint
}

function configurar(tempDir, users) {
  configurarStatePersistence({
    DATA_DIR: tempDir,
    USERS_STATE_FILE: path.join(tempDir, "users.json"),
    users,
    monitor: { conversas: 0 },
    novoUsuario: nomeWA => ({ nomeWA, docsEntregues: [], docsAusentes: [], stage: "inicio" }),
    gerarBriefingCaso: briefing,
    podeMostrarMenuCliente: () => false,
    etapaValida: () => true,
    STAGES: { CLIENTE: "cliente", AUDIO_AGUARDANDO: "audio_aguardando" }
  })
}

async function main() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "oraculum-checkpoint-cycle-"))
  const users = {
    "5581999990000": {
      nomeWA: "Cliente Teste",
      nome: "Cliente Teste",
      contatoId: "CONTACT-1",
      negocioId: "DEAL-1",
      numeroCaso: "CASE-1",
      pastaDriveId: "FOLDER-1",
      respostas: { cidade: "Recife", uf: "PE" },
      pendencias: ["confirmar_documento"],
      documents: [{ sha256: "a".repeat(64), fileId: "FILE-1", status: "received" }],
      statusCiclo: "complementacao",
      ultimaPergunta: "Qual documento foi entregue?",
      context: { u: null },
      adapters: { save: () => {} }
    }
  }
  users["5581999990000"].context.u = users["5581999990000"]
  checkpointCircular(users["5581999990000"])
  configurar(tempDir, users)

  assert.throws(() => JSON.stringify(users), /circular/i, "fixture deve reproduzir o ciclo do log")
  const projected = serializarUsers()
  const json = JSON.stringify(projected)
  assert.ok(json.length > 0)
  assert.equal(projected["5581999990000"]._canonicalCheckpoint.context, undefined)
  assert.equal(projected["5581999990000"].context, undefined)
  assert.equal(projected["5581999990000"].adapters, undefined)

  persistirUsersAgora({ propagarErro: true })
  const validBeforeFailure = fs.readFileSync(path.join(tempDir, "users.json"), "utf8")
  users["5581999990000"].respostas.self = users["5581999990000"].respostas
  assert.throws(() => persistirUsersAgora({ propagarErro: true }), /circular/i)
  assert.equal(fs.readFileSync(path.join(tempDir, "users.json"), "utf8"), validBeforeFailure)
  delete users["5581999990000"].respostas.self

  const restored = {}
  configurar(tempDir, restored)
  carregarUsersPersistidos()
  const u = restored["5581999990000"]
  assert.equal(u.contatoId, "CONTACT-1")
  assert.equal(u.negocioId, "DEAL-1")
  assert.equal(u.numeroCaso, "CASE-1")
  assert.equal(u.pastaDriveId, "FOLDER-1")
  assert.deepEqual(u.respostas, { cidade: "Recife", uf: "PE" })
  assert.deepEqual(u.pendencias, ["confirmar_documento"])
  assert.equal(u.documents[0].fileId, "FILE-1")
  assert.equal(u.statusCiclo, "complementacao")
  assert.equal(u.ultimaPergunta, "Qual documento foi entregue?")
  assert.equal(u._canonicalCheckpoint.context, undefined)
  assert.equal(JSON.stringify(u).includes("context.u"), false)

  const sessoes = new Map()
  const depsAdmin = {
    sessoesAdminWhatsApp: sessoes,
    normalizarNumeroWhatsAppEnvio: value => String(value).replace(/\D/g, ""),
    agendarPersistenciaSessoesAdminAssistidas: () => {},
    logErro: () => {},
    logDebug: () => {}
  }
  iniciarAtendimentoAssistidoAdmin("5581999990000", depsAdmin)
  const resposta = await processarAtendimentoAssistidoAdmin(
    "5581999990000",
    "Caso trabalhista de Maria Silva sobre verbas rescisórias.",
    { type: "text" },
    depsAdmin
  )
  assert.ok(resposta.texto)
  persistirUsersAgora({ propagarErro: true })

  fs.rmSync(tempDir, { recursive: true, force: true })
  console.log("canonical-checkpoint-persistence.test.js: 8/8")
  console.log("realExternalActions=0")
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
