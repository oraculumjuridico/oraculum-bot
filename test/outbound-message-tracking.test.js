"use strict"

const assert = require("node:assert/strict")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")
const axios = require("axios")
const persistence = require("../src/domain/state-persistence")
const { configurarLogging } = require("../src/utils/logging")
const { enviar, enviarComResultado, enviarTemplateComResultado } = require("../src/domain/whatsapp-transport")

async function main() {
  const originalPost = axios.post
  try {
    axios.post = async () => ({ status: 200, data: { messages: [{ id: "wamid.outbound-1" }] } })
    const accepted = await enviarComResultado("5511999999999", "teste", null, false)
    assert.equal(accepted.accepted, true)
    assert.equal(accepted.providerMessageId, "wamid.outbound-1")
    assert.equal(accepted.httpStatus, 200)
    assert.equal(accepted.channel, "freeform")
    assert.equal(await enviar("5511999999999", "compatibilidade", null, false), true)
    const templateAccepted = await enviarTemplateComResultado("5511999999999", "caso_atualizacao", ["Teste"])
    assert.equal(templateAccepted.accepted, true)
    assert.equal(templateAccepted.providerMessageId, "wamid.outbound-1")
    assert.equal(templateAccepted.channel, "template")

    const originalConsoleLog = console.log
    const debugOutput = []
    try {
      configurarLogging({ DEBUG_LOGS: true })
      console.log = (...args) => debugOutput.push(args.join(" "))
      await enviarTemplateComResultado("5511999999999", "caso_atualizacao", ["Teste"])
    } finally {
      console.log = originalConsoleLog
      configurarLogging({ DEBUG_LOGS: false })
    }
    assert.equal(debugOutput.join("\n").includes("5511999999999"), false, "debug de template nao deve expor o destino completo")

    const error = new Error("falha")
    error.response = { status: 400, data: { error: { code: 131000, message: "invalid" } } }
    axios.post = async () => { throw error }
    const failed = await enviarComResultado("5511999999999", "teste", null, false)
    assert.equal(failed.accepted, false)
    assert.equal(failed.httpStatus, 400)
    assert.equal(failed.immediateError, "131000")

    const fallbackError = new Error("parametro invalido")
    fallbackError.response = { status: 400, data: { error: { code: 131009, message: "invalid" } } }
    let calls = 0
    axios.post = async () => {
      calls++
      if (calls === 1) throw fallbackError
      return { status: 200, data: { messages: [{ id: "wamid.fallback-1" }] } }
    }
    const fallback = await enviarComResultado("5511999999999", "teste", [{ id: "a", title: "A" }], false)
    assert.equal(fallback.accepted, true)
    assert.equal(fallback.providerMessageId, "wamid.fallback-1")
    assert.equal(fallback.httpStatus, 200)

    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "oraculum-outbound-"))
    persistence.configurarStatePersistence({ DATA_DIR: dataDir })
    persistence.carregarMensagensOutbound()
    const record = persistence.registrarMensagemOutbound({
      providerMessageId: "wamid.outbound-1", numeroCaso: "CASE-1", contactId: "C-1", dealId: "D-1",
      action: "pedir_documentos", channel: "freeform", destinationMasked: "5511*****9999"
    })
    assert.equal(record.status, "accepted_by_meta")
    for (const status of ["sent", "delivered", "read"]) {
      assert.equal(persistence.atualizarStatusMensagemOutbound("wamid.outbound-1", status).status, status)
    }
    const lateDelivered = persistence.atualizarStatusMensagemOutbound("wamid.outbound-1", "delivered")
    assert.equal(lateDelivered.status, "read", "status atrasado nao pode rebaixar read")
    assert.equal(lateDelivered.statusHistory.filter(event => event.status === "delivered").length, 1, "callback repetido nao duplica historico")
    const asyncFailure = persistence.atualizarStatusMensagemOutbound("wamid.outbound-1", "failed", { failureCode: "131026", failureDescription: "Falha\nMeta" })
    assert.equal(asyncFailure.status, "failed")
    assert.equal(asyncFailure.failureCode, "131026")
    assert.equal(asyncFailure.failureDescription, "Falha Meta")
    assert.deepEqual(asyncFailure.statusHistory.map(event => event.status), ["accepted_by_meta", "sent", "delivered", "read", "failed"])
    const repeatedFailure = persistence.atualizarStatusMensagemOutbound("wamid.outbound-1", "failed", { failureCode: "131026", failureDescription: "Falha\nMeta" })
    assert.equal(repeatedFailure.statusHistory.filter(event => event.status === "failed").length, 1, "falha repetida nao duplica historico")
    assert.equal(persistence.atualizarStatusMensagemOutbound("wamid.outbound-1", "unknown"), null)
    assert.equal(persistence.atualizarStatusMensagemOutbound("wamid.unknown", "sent"), null)
    const persisted = JSON.parse(fs.readFileSync(path.join(dataDir, "outbound-messages.json"), "utf8"))
    assert.equal(persisted.records["wamid.outbound-1"].destinationMasked, "5511*****9999")
    assert.equal(JSON.stringify(persisted).includes("5511999999999"), false)
    assert.ok(persisted.records["wamid.outbound-1"].expiresAt, "expiresAt deve estar presente")
    const restored = persistence.carregarMensagensOutbound()
    assert.equal(restored.records["wamid.outbound-1"].status, "failed", "registro deve ser restaurado apos recarga")

    const expiredDir = fs.mkdtempSync(path.join(os.tmpdir(), "oraculum-outbound-expired-"))
    persistence.configurarStatePersistence({ DATA_DIR: expiredDir })
    persistence.carregarMensagensOutbound()
    persistence.registrarMensagemOutbound({
      providerMessageId: "wamid.expired", numeroCaso: "CASE-2", contactId: "C-2", dealId: "D-2",
      action: "pedir_documentos", channel: "freeform", destinationMasked: "5511*****8888"
    })
    const expiredFile = path.join(expiredDir, "outbound-messages.json")
    const expiredContent = JSON.parse(fs.readFileSync(expiredFile, "utf8"))
    expiredContent.records["wamid.expired"].expiresAt = new Date(Date.now() - 1000).toISOString()
    fs.writeFileSync(expiredFile, JSON.stringify(expiredContent))
    persistence.carregarMensagensOutbound()
    const loadedExpired = persistence.carregarMensagensOutbound()
    assert.equal(loadedExpired.records["wamid.expired"], undefined, "registro expirado deve ser removido no carregamento")

    const recentDir = fs.mkdtempSync(path.join(os.tmpdir(), "oraculum-outbound-recent-"))
    persistence.configurarStatePersistence({ DATA_DIR: recentDir })
    persistence.carregarMensagensOutbound()
    persistence.registrarMensagemOutbound({ providerMessageId: "wamid.recent", destinationMasked: "5511*****7777" })
    assert.ok(persistence.carregarMensagensOutbound().records["wamid.recent"], "limpeza nao deve remover mensagem recente")

    const legacyDir = fs.mkdtempSync(path.join(os.tmpdir(), "oraculum-outbound-legacy-"))
    persistence.configurarStatePersistence({ DATA_DIR: legacyDir })
    persistence.carregarMensagensOutbound()
    const legacyFile = path.join(legacyDir, "outbound-messages.json")
    fs.writeFileSync(legacyFile, JSON.stringify({ schemaVersion: 1, records: { "wamid.legacy": { providerMessageId: "wamid.legacy", status: "sent", acceptedAt: new Date(Date.now() - 100000).toISOString() } } }))
    persistence.carregarMensagensOutbound()
    const loaded = persistence.carregarMensagensOutbound()
    assert.equal(loaded.records["wamid.legacy"].status, "sent", "registro legado sem expiresAt deve ser preservado")
    assert.ok(loaded.records["wamid.legacy"].expiresAt, "registro legado deve receber prazo de retenção")

    fs.rmSync(expiredDir, { recursive: true, force: true })
    fs.rmSync(recentDir, { recursive: true, force: true })
    fs.rmSync(legacyDir, { recursive: true, force: true })
    fs.rmSync(dataDir, { recursive: true, force: true })
  } finally {
    axios.post = originalPost
  }
  console.log("outbound-message-tracking.test.js: ok")
}

main().catch(error => { console.error(error); process.exitCode = 1 })
