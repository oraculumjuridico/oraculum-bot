"use strict"

const assert = require("node:assert/strict")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")
const vm = require("node:vm")
const { PostHumanActionContextRepository } = require("../src/domain/post-human-action-context-repository")
const { handleAtendimentoRealizadoConfirmation } = require("../src/domain/admin-post-human-complementation")

const source = fs.readFileSync(path.join(__dirname, "..", "server.js"), "utf8")
const consultaStart = source.indexOf("function iniciarConsultaCasoAdmin")
const consultaEnd = source.indexOf("\nfunction iniciarComplementacaoCasoAdmin", consultaStart)
const handlerStart = source.indexOf("async function processarAdminWhatsApp")
const handlerEnd = source.indexOf("\nfunction detalharErroHubspot", handlerStart)
assert.ok(consultaStart >= 0 && consultaEnd > consultaStart && handlerStart >= 0 && handlerEnd > handlerStart)

function criarHandler({ pagina = { ok: true, deals: [], after: null }, sessao = { acaoCasoPendente: "consultar" }, handleConfirmation } = {}) {
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
    resolverConsultaCasoAdmin: async query => { queries.push(query); return pagina },
    normalizarItemAdminLocal: (_a, _b, deal) => deal, searchAdminCases: deals => deals.map(item => ({ item, numeroCaso: item.numeroCaso || "1", nomeMascarado: "***", cpfMascarado: "***", telefoneMascarado: "***" })),
    salvarListaCasosAdmin: noop, logInfo: noop, telaAdminFalhaHubSpot: () => ({ route: "erro" }),
    telaAdminPrioridades: async () => ({ route: "prioridades" }), telaAdminCasos: async () => ({ route: "casos" }), telaAdminPrincipal: async () => ({ route: "menu", texto: "menu" }), telaAdminAlertas: async () => ({ route: "alertas" }), telaConsultasAdmin: async () => ({ route: "consultas" }),
    telaAdminCasosNovos: async () => ({ route: "casos-novos" }), telaAdminCasosDocumentos: async () => ({ route: "casos-docs" }), telaAdminAlertasUrgentes: async () => ({ route: "alertas-criticos" }), telaAdminAlertasDocs: async () => ({ route: "alertas-docs" }), telaDetalheCasoAdmin: async () => ({ route: "caso" }),
    obterCasoAdmin: (from, idx = null) => {
      const sessaoAtual = sessions.get(from)
      const indice = idx === null ? sessaoAtual?.casoSelecionado : idx
      const item = sessaoAtual?.casos?.[indice]
      if (!item) return null
      sessions.set(from, { ...sessaoAtual, casoSelecionado: indice })
      return item
    },
    finalizarCadastroAssistidoAdmin: noop, agendarPersistenciaSessoesAdminAssistidas: noop, logDebug: noop, logErro: noop, buscarPorCEP: noop, buscarCidadePorNomeInteligente: noop, baixarMidia: noop, transcrever: noop, adminAssistedMediaStaging: { stage: noop, promote: noop }, uploadDrive: noop, executarPipelineDocumental: noop,
    iniciarAtendimentoAssistidoAdmin: noop, processarAtendimentoAssistidoAdmin: noop, executarDocumentoCasoSelecionadoAdmin: noop, executarComplementacaoCasoAdmin: noop, executarAgendamentoCasoAdmin: noop,
    iniciarComplementacaoCasoAdmin: noop, iniciarEnvioDocumentoCasoAdmin: noop, iniciarAgendamentoCasoAdmin: noop, telaPreferenciaComunicacaoAdmin: noop, atualizarPreferenciaComunicacaoAdmin: noop,
    telaAdminCasosAnalise: noop, telaAdminCasosAtivos: noop, telaAdminAlertasSemResposta: noop, telaAdminAlertasAgenda: noop, telaAdminResumoDiario: noop, telaDetalheConsultaAdmin: noop, telaAdminListaCasos: noop,
    telaConfirmarCancelamentoAdmin: noop, cancelarConsultaAdmin: noop, telaLinksCasoAdmin: noop, pedirDocsCasoAdmin: noop, enviarLembreteCasoAdmin: noop, marcarCasoUrgenteAdmin: noop, enviarAnaliseCasoAdmin: noop, marcarCasoRevisadoAdmin: noop,
    handleAtendimentoRealizadoConfirmation: handleConfirmation || (async () => ({ text: "ok" })), ehWhatsAppAdmin: () => true, postHumanCycleRepository: {}, postHumanActionContextRepository: {}, confirmarVinculoPosHumanoHubSpot: async () => ({ ok: true }), processPostHumanCycle: noop, criarVerificadorCompletudePosHumana: noop, getDocumentosListaCaso: noop, listarArquivosDriveNaPasta: noop, carregarPendenciasComplementaresPosHumanas: noop, users: {}, enviar: noop, enviarTemplateWhatsApp: noop, META_TEMPLATES: { casoAtualizacao: {} }, opcoesAposAcaoCasoAdmin: () => []
  }
  vm.runInNewContext(`${source.slice(consultaStart, consultaEnd)}\n${source.slice(handlerStart, handlerEnd)}\nthis.handler = processarAdminWhatsApp`, sandbox)
  return { handler: sandbox.handler, sessions, queries }
}

;(async () => {
  for (const [command, route] of [["PRIORIDADES", "prioridades"], ["Prioridades", "prioridades"], ["prioridades", "prioridades"], ["Casos", "casos"], ["Filas de casos", "casos"], ["Alertas", "alertas"], ["Menu", "menu"], ["Voltar", "menu"], ["Cancelar", "menu"], ["admin_prioridades", "prioridades"], ["admin_consultas", "consultas"], ["admin_casos_novos", "casos-novos"], ["admin_alertas_criticos", "alertas-criticos"], ["admin_alertas_docs", "alertas-docs"], ["adm_prioridades", "prioridades"]]) {
    const test = criarHandler()
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
  assert.match((await nova.handler("admin", "Consultar Caso")).texto, /Consultar caso/)
  await nova.handler("admin", "texto real")
  assert.deepEqual(nova.queries, ["texto real"])

  const criarSessaoListaAntiga = () => ({
    casos: [{ u: { numeroCaso: "ANTIGO" } }], casoSelecionado: 0, origemCasos: "adm_casos", listaAtiva: "casos",
    paginaAtual: 2, tamanhoPagina: 8, totalItens: 9, totalPaginas: 2, nextAfter: "cursor-antigo", dadosAdmin: "preservar"
  })
  for (const query of ["PRV.260714.707", "81999999999", "João Silva"]) {
    const test = criarHandler({ sessao: criarSessaoListaAntiga() })
    await test.handler("admin", "Consultar Caso")
    const limpa = test.sessions.get("admin")
    for (const campo of ["casos", "casoSelecionado", "origemCasos", "listaAtiva", "paginaAtual", "tamanhoPagina", "totalItens", "totalPaginas", "nextAfter"]) assert.equal(Object.hasOwn(limpa, campo), false, campo)
    assert.equal(limpa.dadosAdmin, "preservar")
    const resposta = await test.handler("admin", query)
    assert.deepEqual(test.queries, [query], query)
    assert.doesNotMatch(resposta.texto, /A lista anterior expirou/)
  }

  const selecaoNormal = criarHandler({ sessao: { listaAtiva: "casos", casos: [{ u: {} }] } })
  assert.equal((await selecaoNormal.handler("admin", "1")).route, "caso")
  assert.deepEqual(selecaoNormal.queries, [])
  const selecaoExpirada = criarHandler({ sessao: { listaAtiva: "casos", casos: [] } })
  assert.match((await selecaoExpirada.handler("admin", "1")).texto, /A lista anterior expirou/)
  assert.deepEqual(selecaoExpirada.queries, [])

  const oldEnabled = process.env.POST_HUMAN_COMPLEMENTATION_ENABLED
  const oldPilots = process.env.POST_HUMAN_PILOT_CASES
  process.env.POST_HUMAN_COMPLEMENTATION_ENABLED = "true"
  process.env.POST_HUMAN_PILOT_CASES = "CASE-1"
  const tempDirs = []
  try {
    async function routePostHumanToken(token, { persist = true } = {}) {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), "post-human-admin-route-")); tempDirs.push(dir)
      const actionRepo = new PostHumanActionContextRepository({ file: path.join(dir, "contexts.json") })
      if (persist) {
        await actionRepo.create({
          token, adminId: "ADMIN", negocioId: "D1", contatoId: "C1", numeroCaso: "CASE-1",
          customerPhone: "5511999999999", createdAt: Date.now(), expiresAt: Date.now() + 60_000, consumedAt: null
        })
      }
      let receivedInteractionId = null; let inspectedBefore = null; let domainResult = null
      const routed = criarHandler({
        sessao: { casos: [{ from: "5511999999999", u: { negocioId: "D1", contatoId: "C1", numeroCaso: "CASE-1" } }], casoSelecionado: 0 },
        handleConfirmation: async options => {
          receivedInteractionId = options.interactionId
          inspectedBefore = await actionRepo.inspect(token, "ADMIN")
          domainResult = await handleAtendimentoRealizadoConfirmation({
            ...options,
            repository: { createCycle: async input => ({ cycleId: `cycle-${token}`, ...input, alreadyExisted: false }) },
            actionContextRepository: actionRepo,
            confirmHubspotContext: async () => ({ ok: true }),
            processCycle: async cycle => ({ ...cycle, status: "completed" })
          })
          return domainResult
        }
      })
      const callback = `admin_post_human_completed_${token}`
      await routed.handler("admin", callback)
      return { actionRepo, callback, receivedInteractionId, inspectedBefore, domainResult }
    }

    for (const token of ["abcdefghijklmnopqrstuvwx", "AbCdEFghIJklMNopQRstUVwx"]) {
      const routed = await routePostHumanToken(token)
      assert.equal(routed.receivedInteractionId, routed.callback)
      assert.equal(routed.receivedInteractionId.slice(-24), token)
      assert.equal(routed.inspectedBefore.ok, true)
      assert.notEqual(routed.domainResult.reason, "context_missing")
      assert.equal((await routed.actionRepo.inspect(token, "ADMIN")).reason, "context_already_consumed")
    }

    const malformed = await routePostHumanToken("AbCdEFghIJklMNopQRstUVw", { persist: false })
    assert.equal(malformed.domainResult.reason, "context_missing")
  } finally {
    if (oldEnabled === undefined) delete process.env.POST_HUMAN_COMPLEMENTATION_ENABLED; else process.env.POST_HUMAN_COMPLEMENTATION_ENABLED = oldEnabled
    if (oldPilots === undefined) delete process.env.POST_HUMAN_PILOT_CASES; else process.env.POST_HUMAN_PILOT_CASES = oldPilots
    for (const dir of tempDirs) fs.rmSync(dir, { recursive: true, force: true })
  }
  console.log("admin-consulta-state-routing.test.js: ok")
})().catch(error => { console.error(error); process.exitCode = 1 })
