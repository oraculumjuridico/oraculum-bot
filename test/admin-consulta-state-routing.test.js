"use strict"

const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const vm = require("node:vm")

const source = fs.readFileSync(path.join(__dirname, "..", "server.js"), "utf8")
const consultaStart = source.indexOf("function encerrarConsultaPendenteAdmin")
const consultaEnd = source.indexOf("\nfunction iniciarComplementacaoCasoAdmin", consultaStart)
const handlerStart = source.indexOf("async function processarAdminWhatsApp")
const handlerEnd = source.indexOf("\nfunction detalharErroHubspot", handlerStart)
assert.ok(consultaStart >= 0 && consultaEnd > consultaStart && handlerStart >= 0 && handlerEnd > handlerStart)

function criarHandler({ pagina = { ok: true, deals: [], after: null }, sessao = { acaoCasoPendente: "consultar" } } = {}) {
  const sessions = new Map([["admin", sessao]])
  const queries = []
  const noop = () => null
  const sandbox = {
    Date, Set, Map, sessoesAdminWhatsApp: sessions,
    ADMIN_IDS: { menu: "adm_menu", prioridades: "adm_prioridades", agenda: "adm_agenda", casos: "adm_casos", alertas: "adm_alertas", atendimentoAssistidoIa: "adm_ia", consultarCaso: "adm_consultar", casosNovos: "adm_casos_novos", casosDocs: "adm_casos_docs", alertasCriticos: "adm_alertas_criticos", alertasDocs: "adm_alertas_docs" },
    ADMIN_MENU_LABELS: { voltarMenu: "Menu" },
    normalizarTextoGatilho: value => String(value || "").trim().toLowerCase(), sanitizarTextoEntrada: value => String(value || "").trim(), normalizarNumeroWhatsAppEnvio: value => value,
    adminWhatsAppAutenticado: () => true, atendimentoAssistidoAdminAtivo: () => false,
    hsAdminBuscarNegociosDireto: async query => { queries.push(query); return pagina },
    normalizarItemAdminLocal: (_a, _b, deal) => deal, searchAdminCases: deals => deals.map(item => ({ item, numeroCaso: item.numeroCaso || "1", nomeMascarado: "***", cpfMascarado: "***", telefoneMascarado: "***" })),
    salvarListaCasosAdmin: noop, logInfo: noop, telaAdminFalhaHubSpot: () => ({ route: "erro" }),
    telaAdminPrioridades: async () => ({ route: "prioridades" }), telaAdminCasos: async () => ({ route: "casos" }), telaAdminPrincipal: async () => ({ route: "menu", texto: "menu" }), telaAdminAlertas: async () => ({ route: "alertas" }), telaConsultasAdmin: async () => ({ route: "consultas" }),
    telaAdminCasosNovos: async () => ({ route: "casos-novos" }), telaAdminCasosDocumentos: async () => ({ route: "casos-docs" }), telaAdminAlertasUrgentes: async () => ({ route: "alertas-criticos" }), telaAdminAlertasDocs: async () => ({ route: "alertas-docs" }), telaDetalheCasoAdmin: async () => ({ route: "caso" }), obterCasoAdmin: () => ({ u: {} }),
    finalizarCadastroAssistidoAdmin: noop, agendarPersistenciaSessoesAdminAssistidas: noop, logDebug: noop, logErro: noop, buscarPorCEP: noop, buscarCidadePorNomeInteligente: noop, baixarMidia: noop, transcrever: noop, adminAssistedMediaStaging: { stage: noop, promote: noop }, uploadDrive: noop, executarPipelineDocumental: noop,
    iniciarAtendimentoAssistidoAdmin: noop, processarAtendimentoAssistidoAdmin: noop, executarDocumentoCasoSelecionadoAdmin: noop, executarComplementacaoCasoAdmin: noop, executarAgendamentoCasoAdmin: noop,
    iniciarConsultaCasoAdmin: from => { sessions.set(from, { ...(sessions.get(from) || {}), acaoCasoPendente: "consultar" }); return { route: "consultar" } }, iniciarComplementacaoCasoAdmin: noop, iniciarEnvioDocumentoCasoAdmin: noop, iniciarAgendamentoCasoAdmin: noop, telaPreferenciaComunicacaoAdmin: noop, atualizarPreferenciaComunicacaoAdmin: noop,
    telaAdminCasosAnalise: noop, telaAdminCasosAtivos: noop, telaAdminAlertasSemResposta: noop, telaAdminAlertasAgenda: noop, telaAdminResumoDiario: noop, telaDetalheConsultaAdmin: noop, telaAdminListaCasos: noop,
    telaConfirmarCancelamentoAdmin: noop, cancelarConsultaAdmin: noop, telaLinksCasoAdmin: noop, pedirDocsCasoAdmin: noop, enviarLembreteCasoAdmin: noop, marcarCasoUrgenteAdmin: noop, enviarAnaliseCasoAdmin: noop, marcarCasoRevisadoAdmin: noop,
    handleAtendimentoRealizadoConfirmation: noop, ehWhatsAppAdmin: noop, postHumanCycleRepository: {}, processPostHumanCycle: noop, criarVerificadorCompletudePosHumana: noop, getDocumentosListaCaso: noop, listarArquivosDriveNaPasta: noop, carregarPendenciasComplementaresPosHumanas: noop, users: {}, enviar: noop, enviarTemplateWhatsApp: noop, META_TEMPLATES: { casoAtualizacao: {} }, opcoesAposAcaoCasoAdmin: () => []
  }
  vm.runInNewContext(`${source.slice(consultaStart, consultaEnd)}\n${source.slice(handlerStart, handlerEnd)}\nthis.handler = processarAdminWhatsApp`, sandbox)
  return { handler: sandbox.handler, sessions, queries }
}

;(async () => {
  for (const [command, route] of [["Prioridades", "prioridades"], ["Casos", "casos"], ["Filas de casos", "casos"], ["Alertas", "alertas"], ["Menu", "menu"], ["Voltar", "menu"], ["Cancelar", "menu"], ["admin_prioridades", "prioridades"], ["admin_consultas", "consultas"], ["admin_casos_novos", "casos-novos"], ["admin_alertas_criticos", "alertas-criticos"], ["admin_alertas_docs", "alertas-docs"], ["adm_prioridades", "prioridades"], ["1", "caso"]]) {
    const test = criarHandler({ sessao: command === "1" ? { acaoCasoPendente: "consultar", listaAtiva: "casos" } : undefined })
    assert.equal((await test.handler("admin", command)).route, route, command)
    assert.deepEqual(test.queries, [], command)
    assert.notEqual(test.sessions.get("admin").acaoCasoPendente, "consultar", command)
  }

  const vazio = criarHandler()
  await vazio.handler("admin", "inexistente")
  assert.deepEqual(vazio.queries, ["inexistente"])
  assert.equal(vazio.sessions.get("admin").acaoCasoPendente, null)
  await vazio.handler("admin", "texto comum")
  assert.deepEqual(vazio.queries, ["inexistente"], "texto após consulta encerrada não pesquisa")

  const erro = criarHandler({ pagina: { ok: false, errorCode: "FAIL" } })
  assert.equal((await erro.handler("admin", "termo")).route, "erro")
  assert.equal(erro.sessions.get("admin").acaoCasoPendente, null)

  const encontrado = criarHandler({ pagina: { ok: true, deals: [{ id: "1" }], after: null } })
  await encontrado.handler("admin", "PRV.260714.707")
  assert.deepEqual(encontrado.queries, ["PRV.260714.707"])
  assert.equal(encontrado.sessions.get("admin").acaoCasoPendente, null)

  const nova = criarHandler()
  assert.equal((await nova.handler("admin", "Consultar Caso")).route, "consultar")
  await nova.handler("admin", "texto real")
  assert.deepEqual(nova.queries, ["texto real"])
  console.log("admin-consulta-state-routing.test.js: ok")
})().catch(error => { console.error(error); process.exitCode = 1 })
