"use strict"

const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")

const source = fs.readFileSync(path.join(__dirname, "..", "server.js"), "utf8")

function between(start, end) {
  const from = source.indexOf(start)
  const to = source.indexOf(end, from + start.length)
  assert.notEqual(from, -1, `início ausente: ${start}`)
  assert.notEqual(to, -1, `fim ausente: ${end}`)
  return source.slice(from, to)
}

const main = between("async function telaAdminPrincipal", "function iniciarConsultaCasoAdmin")
assert.match(main, /title: "📅 Consultas"/)
assert.match(main, /title: "👨‍⚖️ Novo atendimento IA"/)
assert.doesNotMatch(main, /title: "✏️ Completar dados"|title: "📎 Enviar documentos"/)

const detail = between("function telaDetalheCasoAdmin", "function botaoVoltarCasoAdmin")
assert.match(detail, /ADMIN_IDS\.casoDocumentos/)
assert.match(detail, /ADMIN_IDS\.casoComunicacao/)
assert.doesNotMatch(detail, /ADMIN_IDS\.casoEnviarDocumento|ADMIN_IDS\.casoRevisarDocumentos|ADMIN_IDS\.casoPedirDocs/)
const detailMenu = detail.slice(detail.indexOf("const montarTela"))
assert.equal((detailMenu.match(/\{ id:/g) || []).length, 9, "detalhe deve ter nove opções fixas e no máximo uma dinâmica")

const handler = between("async function processarAdminWhatsApp", "function detalharErroHubspot")
assert.match(handler, /ADMIN_IDS\.casoPedirDocsConfirmar[^\n]+pedirDocsCasoAdmin/)
assert.match(handler, /ADMIN_IDS\.casoLembreteConfirmar[^\n]+enviarLembreteCasoAdmin/)
assert.match(handler, /\["image", "document"\]\.includes\(tipoMidiaAdminSemContexto\)/)
assert.match(source, /sessao\.acaoCasoPendente === "enviar_documento"/)
for (const route of ["casosNovos", "casosAnalise", "casosDocs", "casosAtivos", "alertasCriticos", "alertasParados", "alertasDocs", "alertasAgenda"]) {
  assert.match(handler, new RegExp(`ADMIN_IDS\\.${route}`), `paginação sem rota ${route}`)
}

assert.match(source, /const ADMIN_CASE_PAGE_SIZE = 6/)
assert.match(source, /const ADMIN_PRIORITY_PAGE_SIZE = 7/)
assert.match(source, /Mensagens ao cliente sempre exigem confirmação/)

console.log("admin-whatsapp-coherence.test.js: ok")
