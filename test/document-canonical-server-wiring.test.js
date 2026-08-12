"use strict"

const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")

const source = fs.readFileSync(path.join(__dirname, "..", "server.js"), "utf8")

assert.match(source, /confirmCanonicalDocument/)
assert.match(source, /projectDocumentDecision/)
assert.match(source, /reevaluatePostHumanForDecision/)
assert.match(source, /sincronizarDocumentosHubSpot/)
assert.match(source, /aplicarDadosDocumentaisConfiaveisAoUsuario/)
assert.match(source, /validarContextoDocumentalHubSpot/)
assert.match(source, /atualizarEstadoDocumental/)
assert.doesNotMatch(source, /_postHumanDocumentChecklist|confirmedFileIds|reevaluatedPromotions/)
const canonicalHelper = source.slice(source.indexOf("async function confirmarDocumentoCanonicoSeguro"), source.indexOf("async function consolidarDocumentosDoCasoSeguro"))
assert.doesNotMatch(canonicalHelper, /if \(!projection\.changed\) return/)
assert.ok(canonicalHelper.indexOf("persistirUsersAgora") < canonicalHelper.indexOf("reevaluatePostHumanForDecision"))
assert.ok(canonicalHelper.indexOf("sincronizarDecisaoDocumentalCanonicaHubSpotSeguro") < canonicalHelper.indexOf("persistirUsersAgora"))

const hubspotHelper = source.slice(source.indexOf("async function sincronizarDecisaoDocumentalCanonicaHubSpotSeguro"), source.indexOf("async function confirmarDocumentoCanonicoSeguro"))
assert.match(hubspotHelper, /validarContextoDocumentalHubSpot/)
assert.match(hubspotHelper, /sincronizarDocumentosHubSpot/)
assert.match(hubspotHelper, /atualizarEstadoDocumental\(u\.pastaDriveId, \{ registry: sync\.registry \}\)/)
assert.match(hubspotHelper, /aplicarDadosDocumentaisConfiaveisAoUsuario/)
assert.doesNotMatch(hubspotHelper, /hsAtualizarNegocio/)

const analysisHelper = source.slice(source.indexOf("async function processarAnaliseDocumentalSegura"), source.indexOf("function dependenciasReavaliacaoDocumentalPosHumana"))
assert.match(analysisHelper, /resolvePartyRole:/)
assert.match(analysisHelper, /resolveDocumentPartyIdentity/)
assert.doesNotMatch(analysisHelper, /partyRole:.*"titular"/)

const guidedUpload = source.slice(source.indexOf("const resultadoAnaliseGuiada"), source.indexOf("async function proximaConfirmacaoProgressiva"))
assert.match(guidedUpload, /evaluateGuidedDocumentReceipt/)
assert.match(guidedUpload, /applyGuidedDocumentReceipt/)
assert.ok(guidedUpload.indexOf("resultadoAnaliseGuiada") < guidedUpload.indexOf("evaluateGuidedDocumentReceipt"))
assert.match(guidedUpload, /if \(docAtual\?\.id !== "doc_rg"\) u\.docAtualIdx/)

const avulso = source.slice(source.indexOf('if (text === "doc_cliente_anexar")'), source.indexOf('if (text === "doc_cliente_tipo_pessoal")'))
assert.ok(avulso.indexOf("confirmarDocumentoCanonicoSeguro(u, fileIdDoc") > avulso.indexOf("renomearArquivoDrive"))
assert.ok(avulso.indexOf("confirmarDocumentoCanonicoSeguro(u, fileIdDoc") < avulso.lastIndexOf("u._docClientePendenteId = null"))

const sameImage = source.slice(source.indexOf('if (comandoDoc === "docs_rg_verso_junto")'), source.indexOf('if (comandoDoc === "docs_rg_sem_verso")'))
assert.match(sameImage, /assertion: "front_and_back_same_image"/)
assert.match(sameImage, /marcarStatusDocumento\(u, docRg\.id, "docsEntregues"\)/)

const nextDocument = source.slice(source.indexOf('if (comandoDoc === "docs_proxdoc")'), source.indexOf('if (comandoDoc === "docs_depois")'))
assert.match(nextDocument, /marcarStatusDocumento\(u, docAtual4\.id, "docsEntregues"\)/)
assert.match(nextDocument, /confirmarDocumentoCanonicoSeguro/)

console.log("document-canonical-server-wiring.test.js: ok")
