"use strict"

const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")

const source = fs.readFileSync(path.join(__dirname, "..", "server.js"), "utf8")
const media = source.slice(source.indexOf("async function processarMidia"), source.indexOf("async function proximaConfirmacaoProgressiva"))
const callback = source.slice(source.indexOf('if (text === "doc_cliente_anexar")'), source.indexOf('if (text?.startsWith("doc_cliente_tipo_"))'))

assert.match(source, /id: "docs_outros"/)
assert.match(source, /id: "docs_extra_cras"/)
assert.match(media, /fluxoDocumento: "complementar"/)
assert.match(media, /documentoId: tipoComplementar\.id/)
assert.match(callback, /registerSupplementalDocument/)
assert.match(callback, /sincronizarNotaAnaliseCasoSegura/)
assert.match(callback, /calcularStatusDocumentos\(u\)\.faltantesCriticos\.length > 0 \? HS_STAGE\.AGUARDANDO_DOCS : HS_STAGE\.DOCS/)
assert.match(callback, /tipoComplementar \|\| isPilotCaseAllowed/)
assert.doesNotMatch(media, /consolidarDocumentosDoCasoSeguro/)

console.log("supplemental-document-flow-static.test.js: ok")
