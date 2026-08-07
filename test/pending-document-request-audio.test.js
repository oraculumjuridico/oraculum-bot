"use strict"
const assert = require("node:assert/strict")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")
const persistence = require("../src/domain/state-persistence")
const server = fs.readFileSync(path.join(__dirname, "..", "server.js"), "utf8")

assert.match(server, /enviadoCliente && !templateService\.conversaDentroJanela24h\(u\.ultimaMsg\).*envioDocumentos\.channel === "template".*preferenciaAudioSempreCanonica/)
assert.match(server, /const resposta = await processar\(from, nomeWA, text, message\)[\s\S]*?await consumirPendenciaAudioPedidoDocumentos\(from\)[\s\S]*?await enviarAudioAutomaticoTela/)

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "oraculum-pending-doc-audio-"))
persistence.configurarStatePersistence({ DATA_DIR: dir })
const base = { activeKey: "admin_document_request_audio:C1:D1:CASE1", contactId: "C1", phoneNormalized: "5511999999999", dealId: "D1", numeroCaso: "CASE1", audioText: "Documentos pendentes" }
const reserve = identity => persistence.reservarPendenciaAudioPedidoDocumentos(identity)

// A criação somente é chamada pelo servidor após template aceito; estes testes
// validam o estado persistido, identidade e transições que tornam o fluxo seguro.
let created = persistence.criarPendenciaAudioPedidoDocumentos(base)
const baseOperationId = created.operationId
assert.equal(created.type, "admin_document_request_audio")
assert.equal(created.status, "pending")
assert.equal(created.providerMessageId, null)
assert.equal(persistence.criarPendenciaAudioPedidoDocumentos(base).operationId, baseOperationId, "pedido equivalente reutiliza pendencia ativa")
assert.equal(reserve({ ...base }).status, "sending")
assert.equal(reserve({ ...base }), null, "duas reservas concorrentes nao podem enviar duas vezes")
assert.equal(persistence.concluirPendenciaAudioPedidoDocumentos(baseOperationId, { status: "sent", providerMessageId: "wamid.audio-1" }).status, "sent")
assert.equal(reserve({ ...base }), null, "inbound duplicado nao repete pendencia concluida")
const novoCiclo = persistence.criarPendenciaAudioPedidoDocumentos(base)
assert.notEqual(novoCiclo.operationId, baseOperationId, "pedido posterior recebe uma nova identidade")
assert.equal(reserve(base).operationId, novoCiclo.operationId, "nova resposta consome apenas o novo ciclo")
assert.equal(persistence.concluirPendenciaAudioPedidoDocumentos(novoCiclo.operationId, { status: "sent" }).status, "sent")
// Duas tentativas realmente concorrentes compartilham a transição síncrona
// persistida: somente uma observa pending antes do envio assíncrono.
const concurrent = { ...base, activeKey: "admin_document_request_audio:C2:D1:CASE1", contactId: "C2" }
const concurrentCreated = persistence.criarPendenciaAudioPedidoDocumentos(concurrent)
Promise.all([Promise.resolve().then(() => reserve(concurrent)), Promise.resolve().then(() => reserve(concurrent))])
  .then(results => {
    assert.equal(results.filter(Boolean).length, 1, "Promise.all reserva uma unica vez")
    return persistence.concluirPendenciaAudioPedidoDocumentos(concurrentCreated.operationId, { status: "sent" })
  })
  .then(() => runRemaining())
  .catch(error => { throw error })

function runRemaining() {

const changed = { ...base, activeKey: "admin_document_request_audio:C1:D1:CASE2", numeroCaso: "CASE2" }
const changedCreated = persistence.criarPendenciaAudioPedidoDocumentos(changed)
assert.equal(reserve({ ...base }), null, "caso diferente nao consome")
assert.equal(reserve({ contactId: "OTHER", phoneNormalized: "5511999999999", dealId: "D1", numeroCaso: "CASE2" }), null, "cliente diferente nao consome")
assert.equal(reserve({ contactId: "C1", phoneNormalized: "5511999999999", dealId: "D1", numeroCaso: "CASE2" }).status, "sending")
assert.equal(persistence.concluirPendenciaAudioPedidoDocumentos(changedCreated.operationId, { status: "suppressed", reason: "preference_changed" }).status, "suppressed")

const retry = { ...base, activeKey: "admin_document_request_audio:C1:D2:CASE3", dealId: "D2", numeroCaso: "CASE3" }
const retryCreated = persistence.criarPendenciaAudioPedidoDocumentos(retry)
assert.equal(reserve(retry).status, "sending")
assert.equal(persistence.concluirPendenciaAudioPedidoDocumentos(retryCreated.operationId, { status: "pending", reason: "tts_failed" }).status, "pending", "falha nao marca sent e permite proximo inbound")
persistence.carregarPendenciasAudioPedidoDocumentos()
assert.equal(reserve(retry).status, "sending", "restart restaura pendencia recuperavel")
assert.equal(persistence.concluirPendenciaAudioPedidoDocumentos(retryCreated.operationId, { status: "sent" }).status, "sent")
persistence.carregarPendenciasAudioPedidoDocumentos()
assert.equal(reserve(retry), null, "restart posterior nao repete audio enviado")

const crashed = { ...base, activeKey: "admin_document_request_audio:C3:D3:CASE4", contactId: "C3", dealId: "D3", numeroCaso: "CASE4" }
const crashedCreated = persistence.criarPendenciaAudioPedidoDocumentos(crashed)
assert.equal(reserve(crashed).status, "sending")
persistence.carregarPendenciasAudioPedidoDocumentos()
assert.equal(reserve(crashed), null, "sending recuperado nao reenvia quando entrega e incerta")
const crashedNewCycle = persistence.criarPendenciaAudioPedidoDocumentos(crashed)
assert.equal(crashedNewCycle.status, "pending", "novo pedido apos estado terminal uncertain abre novo ciclo")
assert.notEqual(crashedNewCycle.operationId, crashedCreated.operationId)

const persisted = JSON.parse(fs.readFileSync(path.join(dir, "pending-document-request-audio.json"), "utf8"))
assert.equal(Object.keys(persisted.records).length, 7)
assert.equal(persisted.records[baseOperationId].sentProviderMessageId, "wamid.audio-1")
console.log("pending-document-request-audio.test.js: ok")
}
