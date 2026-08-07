"use strict"

const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const vm = require("node:vm")
const { inspecionarRespostaBuscaHubSpotAdmin } = require("../src/domain/admin-hubspot-search-response")

const source = fs.readFileSync(path.join(__dirname, "..", "server.js"), "utf8")

function loadFunction(name, nextName, sandbox) {
  const start = source.indexOf(`async function ${name}`)
  const end = source.indexOf(nextName, start)
  assert.ok(start >= 0 && end > start, `could not extract ${name}`)
  vm.runInNewContext(`${source.slice(start, end)}\nthis.loaded = ${name}`, sandbox)
  return sandbox.loaded
}

const HS_STAGE = { FINAL: "final", LEAD: "lead", CADASTRO: "cadastro", ANALISE: "analise", AGUARDANDO_DOCS: "docs", DOCS: "docs2" }
const failure = { texto: "hubspot-failure" }
const checks = []

for (const [name, nextName] of [
  ["telaAdminAlertasUrgentes", "async function telaAdminAlertasSemResposta"],
  ["telaAdminAlertasSemResposta", "async function telaAdminAlertasDocs"],
  ["telaAdminAlertasDocs", "async function telaAdminAlertasAgenda"]
]) {
  for (const [label, result, expected] of [
    ["items", { ok: true, items: [{ u: { numeroCaso: "X", urgencia: "alta", ultimaMsg: Date.now() } }], total: 1 }, "list"],
    ["empty", { ok: true, items: [], total: 0 }, "list"],
    ["error", { ok: false, items: [], total: 0, errorCode: "INVALID_HUBSPOT_RESPONSE" }, "failure"]
  ]) {
    const sandbox = {
      HS_STAGE, STAGES: { AGUARDANDO_URGENTE: "urgent", CLIENTE: "client" }, Date,
      ADMIN_IDS: { alertas: "alertas" },
      scoreEmocional: () => ({ nivel: "baixo" }), calcularStatusDocumentos: () => ({ faltantesCriticos: [] }),
      adminFonteCasos: async () => result,
      telaAdminFalhaHubSpot: () => failure,
      telaAdminListaCasos: (_from, _title, items) => ({ kind: "list", items })
    }
    const fn = loadFunction(name, nextName, sandbox)
    checks.push(fn("admin").then(value => {
      assert.equal(expected === "failure" ? value : value.kind, expected === "failure" ? failure : "list", `${name} ${label}`)
      if (expected === "list") assert.equal(value.items.length, result.items.length)
    }))
  }
}

async function run() {
  await Promise.all(checks)

  const prioridade = loadFunction("telaAdminPrioridades", "async function telaAdminCasos", {
    gerarPrioridadesAdmin: async () => ({ ok: false }), telaAdminFalhaHubSpot: () => failure
  })
  assert.equal(await prioridade("admin"), failure)

  const fila = loadFunction("telaAdminCasosNovos", "async function telaAdminCasosAnalise", {
    HS_STAGE, STAGES: { CLIENTE: "client" }, adminFonteCasos: async () => ({ ok: false }), telaAdminFalhaHubSpot: () => failure
  })
  assert.equal(await fila("admin"), failure)

  const todos = loadFunction("telaAdminCasosAtivos", "async function telaAdminAlertasUrgentes", {
    HS_STAGE, hsAdminBuscarTodosNegociosPorStages: async () => ({ ok: false }), telaAdminFalhaHubSpot: () => failure
  })
  assert.equal(await todos("admin"), failure)

  const pagina = loadFunction("hsAdminBuscarTodosNegociosPorStages", "async function hsAdminBuscarNegociosDireto", {
    Date, Set, logInfo: () => {},
    hsAdminBuscarNegociosPorStages: async (_stages, _limit, after) => after
      ? { ok: false, deals: [], total: 1, errorCode: "INVALID_HUBSPOT_RESPONSE" }
      : { ok: true, deals: [{ id: "page-1" }], total: 2, after: "page-2" }
  })
  const paginado = await pagina(["active"])
  assert.equal(paginado.ok, false)
  assert.equal(paginado.deals.length, 0)

  const consulta = loadFunction("executarConsultaCasoAdmin", "function iniciarComplementacaoCasoAdmin", {
    Date, Set, Map, normalizarNumeroWhatsAppEnvio: value => value,
    hsAdminBuscarNegociosDireto: async () => ({ ok: false, errorCode: "INVALID_HUBSPOT_RESPONSE" }),
    logInfo: () => {}, telaAdminFalhaHubSpot: () => failure, encerrarConsultaPendenteAdmin: () => {}, resolverConsultaCasoAdmin: async () => ({ ok: false, errorCode: "INVALID_HUBSPOT_RESPONSE" })
  })
  assert.equal(await consulta("admin", "x"), failure)

  const consultaVazia = loadFunction("executarConsultaCasoAdmin", "function iniciarComplementacaoCasoAdmin", {
    Date, Set, Map, normalizarNumeroWhatsAppEnvio: value => value,
    hsAdminBuscarNegociosDireto: async () => ({ ok: true, deals: [], after: null }),
    normalizarItemAdminLocal: () => null, searchAdminCases: () => [], logInfo: () => {},
    sessoesAdminWhatsApp: new Map(), ADMIN_IDS: { menu: "menu" }, ADMIN_MENU_LABELS: { voltarMenu: "Menu" }, telaAdminFalhaHubSpot: () => failure, encerrarConsultaPendenteAdmin: () => {}, resolverConsultaCasoAdmin: async () => ({ ok: true, deals: [], after: null })
  })
  assert.match((await consultaVazia("admin", "x")).texto, /Nenhum caso encontrado/)

  for (const [label, axiosResult, expectedCode] of [
    ["invalid-2xx", { status: 200, data: { results: null } }, "INVALID_HUBSPOT_RESPONSE"],
    ["axios-rejection", Object.assign(new Error("timeout"), { code: "ECONNABORTED" }), "ECONNABORTED"],
    ["http-500", { response: { status: 500 }, message: "server error" }, "500"]
  ]) {
    const direct = loadFunction("hsAdminBuscarNegociosDireto", "async function mapearComLimite", {
      Date, axios: { post: async () => { if (axiosResult instanceof Error || axiosResult.response) throw axiosResult; return axiosResult } },
      executarComRetryHubSpot: async fn => fn(), HS: () => ({}), logInfo: () => {}, logErroHubSpot: () => {},
      sanitizarTextoEntrada: value => String(value || "").trim(), mascararErroHubSpot: error => error.message || "error",
      inspecionarRespostaBuscaHubSpotAdmin, mapearNegociosHubSpotAdmin: data => data.results
    })
    const result = await direct("consulta")
    assert.equal(result.ok, false, label)
    assert.equal(result.errorCode, expectedCode, label)
  }
  console.log("admin-hubspot-error-propagation.test.js: ok")
}

run().catch(error => { console.error(error); process.exitCode = 1 })
