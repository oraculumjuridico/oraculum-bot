"use strict"

const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const {
  configurarAdminCaseUi,
  opcoesAposAcaoCasoAdmin,
  ADMIN_MENU_LABELS
} = require("../src/domain/admin-case-ui")
const { textoResumoDiarioOperacional } = require("../src/domain/admin-summary-ui")

const root = path.join(__dirname, "..")
const serverSource = fs.readFileSync(path.join(root, "server.js"), "utf8")
const caseUiSource = fs.readFileSync(path.join(root, "src", "domain", "admin-case-ui.js"), "utf8")
const summarySource = fs.readFileSync(path.join(root, "src", "domain", "admin-summary-ui.js"), "utf8")
const adminSource = serverSource.slice(
  serverSource.indexOf("const ADMIN_IDS"),
  serverSource.indexOf("function detalharErroHubspot")
)

function tituloNormalizado(value) {
  return String(value || "")
    .replace(/^\d+\s+/, "")
    .replace(/\p{Extended_Pictographic}/gu, "")
    .replace(/[\u200D\uFE0F]/g, "")
    .replace(/\s+/g, " ")
    .trim()
}

for (const [nome, label] of Object.entries(ADMIN_MENU_LABELS)) {
  assert.ok([...label].length <= 20, `${nome} excede 20 caracteres: ${label}`)
}

const titulosLiteraisAdmin = [...adminSource.matchAll(/title:\s*"([^"]+)"/g)]
  .map(match => tituloNormalizado(match[1]))
for (const titulo of titulosLiteraisAdmin) {
  assert.ok([...titulo].length <= 20, `título administrativo excede 20 caracteres: ${titulo}`)
}

assert.deepEqual(ADMIN_MENU_LABELS, {
  marcarRevisado: "Marcar como revisado",
  marcarUrgente: "Marcar como urgente",
  registrarAnalise: "Registrar análise",
  pedirDocumentos: "Pedir documentos",
  lembrarCliente: "Lembrar cliente",
  abrirLinksCaso: "Abrir links do caso",
  verConsultas: "Ver consultas",
  voltarLista: "Voltar à lista",
  voltarMenu: "Voltar ao menu admin"
})
assert.equal((adminSource.match(/title:\s*"📎 Documentos pendentes"/g) || []).length, 2)
assert.doesNotMatch(adminSource, /title:\s*"📎 Docs pendentes"/)

const ids = {
  menu: "adm_menu",
  prioridades: "adm_prioridades",
  casoRevisado: "adm_caso_revisado"
}
configurarAdminCaseUi({ ADMIN_IDS: ids })
assert.deepEqual(opcoesAposAcaoCasoAdmin(), [
  { id: "adm_caso_revisado", title: "Marcar como revisado" },
  { id: "adm_prioridades", title: "Prioridades" },
  { id: "adm_menu", title: "Voltar ao menu admin" }
])

for (const [id, valor] of Object.entries({
  menu: "adm_menu",
  agenda: "adm_agenda",
  casoLinks: "adm_caso_links",
  casoPedirDocs: "adm_caso_pedir_docs",
  casoLembrete: "adm_caso_lembrete",
  casoRevisado: "adm_caso_revisado",
  casoMarcarUrgente: "adm_caso_marcar_urg",
  casoEnviarAnalise: "adm_caso_enviar_analise"
})) {
  assert.match(adminSource, new RegExp(`${id}:\\s*"${valor}"`))
}

for (const [id, handler] of [
  ["casoLinks", "telaLinksCasoAdmin\\(from\\)"],
  ["casoPedirDocs", "pedirDocsCasoAdmin\\(from\\)"],
  ["casoLembrete", "enviarLembreteCasoAdmin\\(from\\)"],
  ["casoMarcarUrgente", "marcarCasoUrgenteAdmin\\(from\\)"],
  ["casoEnviarAnalise", "enviarAnaliseCasoAdmin\\(from\\)"],
  ["casoRevisado", "marcarCasoRevisadoAdmin\\(from\\)"]
]) {
  assert.match(adminSource, new RegExp(`ADMIN_IDS\\.${id}[^\\n]+${handler}`))
}

for (const tela of [
  "async function telaAdminCasos",
  "async function telaAdminAlertas",
  "async function telaAdminResumoDiario",
  "function telaDetalheCasoAdmin",
  "function telaLinksCasoAdmin",
  "async function telaConsultasAdmin",
  "function telaDetalheConsultaAdmin",
  "function telaConfirmarCancelamentoAdmin",
  "async function cancelarConsultaAdmin"
]) {
  const inicio = adminSource.indexOf(tela)
  assert.notEqual(inicio, -1, `tela não encontrada: ${tela}`)
  const proximaFuncao = adminSource.indexOf("\nfunction ", inicio + tela.length)
  const proximaAsync = adminSource.indexOf("\nasync function ", inicio + tela.length)
  const finais = [proximaFuncao, proximaAsync].filter(index => index > inicio)
  const fim = finais.length ? Math.min(...finais) : adminSource.length
  assert.match(adminSource.slice(inicio, fim), /ADMIN_MENU_LABELS\.voltarMenu/, `retorno ausente: ${tela}`)
}

const resumo = textoResumoDiarioOperacional({
  totais: {
    casosClientes: 0,
    consultasAtivas: 0,
    emAnalise: 0,
    documentosPendentes: 0,
    alertasUrgentes: 0,
    itensAnalisados: 0
  },
  fonte: "mock local",
  filas: {
    urgentes: [],
    documentosPendentes: [],
    alertasOperacionais: [],
    proximasAcoes: [],
    recentes: []
  },
  checklistProducao: [
    "node --check server.js",
    "node verificar.js",
    "node smoke.js",
    "Confirmar servidor/ngrok/webhook antes de reiniciar",
    "Teste WhatsApp pelo proprietario",
    "Registrar resultado no Resumo_bot.md"
  ]
})
assert.match(resumo, /Verificações técnicas são realizadas durante a validação e o deploy\./)
assert.doesNotMatch(resumo, /node --check|verificar\.js|smoke\.js|ngrok|Resumo_bot|Teste WhatsApp/)

for (const [arquivo, conteudo] of [
  ["server.js", serverSource],
  ["admin-case-ui.js", caseUiSource],
  ["admin-summary-ui.js", summarySource]
]) {
  assert.doesNotMatch(conteudo, /\uFFFD/, `U+FFFD encontrado em ${arquivo}`)
}

console.log("admin-menu-ux.test.js: ok")
