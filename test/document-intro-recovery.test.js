"use strict"

const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")

const source = fs.readFileSync(path.join(__dirname, "..", "server.js"), "utf8")
const introStart = source.indexOf("async function enviarIntroDocumentos")
const introEnd = source.indexOf("async function prepararFluxoResumoOutro", introStart)
const intro = source.slice(introStart, introEnd)

assert.match(intro, /u\.etapa = "documentos"/)
assert.match(intro, /registrarUltimaPergunta\(u, \{ texto: telaIntro\.texto, opcoes \}\)/)

const restoreStart = source.indexOf("const botoesClienteComCaso = new Set")
const restoreEnd = source.indexOf("])" , restoreStart)
const restoreButtons = source.slice(restoreStart, restoreEnd)
assert.match(restoreButtons, /"docs_intro_ok"/)

const handlerStart = source.indexOf('if (text === "docs_intro_ok")')
const handlerEnd = source.indexOf('if (text === "docs_confirmar_envio_extra")', handlerStart)
const handler = source.slice(handlerStart, handlerEnd)
assert.match(handler, /await enviarTelaDocumentosCaso\(from, u\)/)
assert.doesNotMatch(handler, /respostaRecomecoMenuPrincipal/)

assert.match(source, /function etapaPermitidaComCasoOficial/)
assert.match(source, /if \(u\.numeroCaso && !etapaPermitidaComCasoOficial\(u\.stage\)\)/)
assert.match(source, /Reflect\.set\(u, "stage", STAGES\.CLIENTE\)/)

console.log("document-intro-recovery.test.js: ok")
