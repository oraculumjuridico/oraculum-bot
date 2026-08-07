"use strict"

const assert = require("node:assert/strict")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")
const vm = require("node:vm")
const { createRequire } = require("node:module")
const { PostHumanCycleRepository } = require("../src/domain/post-human-cycle-model")
const { analisarEstadoDocumental, STATES } = require("../src/domain/post-human-document-analyzer")
const { construirSolicitacao } = require("../src/domain/post-human-solicitation-builder")
const { planSafeUpdate, atualizarHubSpotSeguro } = require("../src/domain/post-human-hubspot-updater")
const { processPostHumanCycle } = require("../src/domain/post-human-flow")
const { tratarRespostaClientePosAtendimento, resolverCiclo } = require("../src/domain/post-human-response-handler")
const { sanitizeSensitive } = require("../src/domain/post-human-safe-log")
const { montarBotaoAtendimentoRealizado, handleAtendimentoRealizadoConfirmation } = require("../src/domain/admin-post-human-complementation")
const { META_TEMPLATES } = require("../src/domain/meta-templates")

const root = path.join(__dirname, "..")
const serverPath = path.join(root, "server.js")
const serverRequire = createRequire(serverPath)

function carregarPoliticaRealPosHumana() {
  const axios = serverRequire("axios")
  const reads = []
  const source = fs.readFileSync(serverPath, "utf8").replace(
    "module.exports = {\n  app,",
    "module.exports = {\n  complementoPosHumanoEstaCompleto,\n  criarVerificadorCompletudePosHumana,\n  carregarPendenciasComplementaresPosHumanas,\n  app,"
  )
  const sandbox = {
    __dirname: root, __filename: serverPath, Buffer, URL, clearImmediate, clearInterval, clearTimeout,
    console, global, module: { exports: {} }, process, setImmediate, setInterval, setTimeout,
    require: request => request === "axios" ? {
      ...axios,
      get: async url => {
        reads.push(url)
        if (url.includes("/associations/contacts")) return { data: { results: [{ id: "P-REAL" }] } }
        if (url.includes("/objects/contacts/")) return { data: { id: "P-REAL", properties: {} } }
        if (url.includes("/objects/deals/")) return { data: { id: "D-REAL", properties: {} } }
        throw new Error(`leitura CRM inesperada: ${url}`)
      }
    } : serverRequire(request)
  }
  sandbox.exports = sandbox.module.exports
  vm.runInNewContext(source, sandbox, { filename: serverPath })
  return { ...sandbox.module.exports, reads }
}

function usuarioRealCompleto(overrides = {}) {
  return {
    negocioId: "D-REAL", contatoId: "P-REAL", numeroCaso: "REAL",
    telefoneNormalizado: "5511999999999", pastaDriveId: "DRIVE-EXISTENTE",
    nome: "Ana Silva", whatsappContato: "5511999999999", cidade: "Recife", uf: "PE",
    area: "Outros", tipoCaso: "orientacao", descricao: "Relato juridico suficientemente detalhado.",
    listaDocumental: ["RG"], docsEntregues: ["RG"], docsAusentes: [], docsParciais: [],
    revisaoDocumentalNecessaria: false, ultimaMsg: Date.now(),
    ...overrides
  }
}

let passed = 0
async function test(name, fn) {
  try { await fn(); passed++; console.log(`PASS ${name}`) }
  catch (error) { console.error(`FAIL ${name}: ${error.stack}`); process.exitCode = 1 }
}

async function makeRepo() {
  const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "post-human-"))
  const repo = new PostHumanCycleRepository({ file: path.join(dir, "cycles.json") })
  await repo.initialize()
  return repo
}

(async () => {
  const originalEnabled = process.env.POST_HUMAN_COMPLEMENTATION_ENABLED
  const originalCases = process.env.POST_HUMAN_PILOT_CASES
  process.env.POST_HUMAN_COMPLEMENTATION_ENABLED = "true"
  process.env.POST_HUMAN_PILOT_CASES = "C,C1,CA,CB"
  await test("modelo, sequencia, idempotencia, concorrencia e multiplos ciclos", async () => {
    const repo = await makeRepo()
    const input = { negocioId: "D1", numeroCaso: "C1", contatoId: "P1", telefoneNormalizado: "5511999999999" }
    const [a, b] = await Promise.all([repo.createCycle(input), repo.createCycle(input)])
    assert.equal(a.cycleId, b.cycleId)
    assert.equal([a, b].filter(c => c.alreadyExisted).length, 1)
    await repo.updateStatus(a.cycleId, "cancelled")
    const next = await repo.createCycle(input)
    assert.equal(next.sequencia, 2)
  })

  await test("transicoes invalidas e recuperacao excluem estados terminais e uncertain sending", async () => {
    const repo = await makeRepo()
    const cycle = await repo.createCycle({ negocioId: "D1", numeroCaso: "C1" })
    await assert.rejects(repo.updateStatus(cycle.cycleId, "completed"), /transicao invalida/)
    await repo.updateStatus(cycle.cycleId, "analyzing")
    assert.equal((await repo.listRecoverable()).length, 1)
    await repo.updateStatus(cycle.cycleId, "failed_terminal", { erro: "token=secret 529.982.247-25" })
    assert.equal((await repo.listRecoverable()).length, 0)
  })

  await test("classificacao cobre os seis estados sem inferir arrays vazios", async () => {
    const base = { negocioId: "D", listaDocumental: ["RG", "CPF"] }
    assert.equal((await analisarEstadoDocumental(base, "D")).estado, STATES.SEM_DOCUMENTOS)
    assert.equal((await analisarEstadoDocumental({ ...base, docsEntregues: ["RG"] }, "D")).estado, STATES.DOCUMENTOS_PARCIAIS)
    assert.equal((await analisarEstadoDocumental({ ...base, docsEntregues: ["RG", "CPF"] }, "D")).estado, STATES.DOCUMENTOS_COMPLETOS)
    assert.equal((await analisarEstadoDocumental({ negocioId: "D", docsEntregues: ["arquivo"] }, "D")).estado, STATES.DOCUMENTOS_NAO_ANALISADOS)
    assert.equal((await analisarEstadoDocumental({ ...base, docsEntregues: ["RG", "CPF"] }, "D", { camposComplementaresPendentes: () => ["cidade"] })).estado, STATES.INFORMACOES_COMPLEMENTARES_PENDENTES)
    assert.equal((await analisarEstadoDocumental({ negocioId: "D" }, "D")).estado, STATES.REVISAO_HUMANA_NECESSARIA)
    assert.equal((await analisarEstadoDocumental(base, "D", { requiredSources: ["drive"] })).estado, STATES.REVISAO_HUMANA_NECESSARIA)
    assert.equal((await analisarEstadoDocumental({ negocioId: "D", listaDocumental: ["RG"], docsEntregues: [], docsAusentes: [] }, "D", {
      listarArquivosDrive: async () => [{ id: "unclassified-file" }]
    })).estado, STATES.DOCUMENTOS_NAO_ANALISADOS)
  })

  await test("decisao nao solicita recebido e pergunta uma informacao por vez", async () => {
    const partial = construirSolicitacao({ estado: STATES.DOCUMENTOS_PARCIAIS, recebidos: ["RG"], ausentes: ["CPF"], parciais: [] })
    assert.match(partial.texto, /CPF/); assert.doesNotMatch(partial.texto, /Ainda precisamos de:\n.*RG/)
    const info = construirSolicitacao({ estado: STATES.INFORMACOES_COMPLEMENTARES_PENDENTES, camposPendentes: ["cidade", "estado"] })
    assert.equal(info.campo, "cidade"); assert.doesNotMatch(info.texto, /estado/)
    assert.equal(construirSolicitacao({ estado: STATES.INFORMACOES_COMPLEMENTARES_PENDENTES, camposPendentes: ["campo_inventado"] }).tipo, "revisao")
  })

  await test("hubspot preenche vazio, mantem igual, anota divergencia e preserva negocio", async () => {
    const plan = planSafeUpdate({ nome: "", cidade: "São Paulo", cpf: "111" }, { nome: "Ana", cidade: " são  paulo ", cpf: "222" }, ["nome", "cidade", "cpf"])
    assert.deepEqual(plan.updates, { nome: "Ana" }); assert.deepEqual(plan.unchanged, ["cidade"]); assert.equal(plan.divergences[0].field, "cpf")
    const calls = []
    const result = await atualizarHubSpotSeguro({
      objectType: "deal", objectId: "D", expectedDealId: "D", contactId: "P",
      current: { numero_de_caso: "C1", dealstage: "final", description: "x", resumo_cliente: "" },
      incoming: { numero_de_caso: "C2", dealstage: "lead", description: "y", resumo_cliente: "ok" },
      cycleId: "cycle",
      deps: { isAssociated: async () => true, update: async (...args) => calls.push(args), createReviewNote: async (...args) => calls.push(args) }
    })
    assert.equal(result.humanReviewRequired, true)
    assert.equal(calls.length, 1)
    assert.equal(calls[0][2].cycleId, "cycle")
    assert.deepEqual(calls[0][2].fields.sort(), ["dealstage", "description", "numero_de_caso"])
    const repo = await makeRepo()
    const cycle = await repo.createCycle({ negocioId: "D-HS", numeroCaso: "C" })
    let integratedCalls = 0
    const integrated = await processPostHumanCycle({
      cycle, repository: repo,
      usuario: { negocioId: "D-HS", numeroCaso: "C", listaDocumental: ["RG"], docsEntregues: ["RG"] },
      deps: { applySafeHubspotUpdates: async () => (++integratedCalls, { humanReviewRequired: true, divergences: [{ field: "cpf" }] }) }
    })
    assert.equal(integratedCalls, 1)
    assert.equal(integrated.status, "human_review_required")
  })

  await test("janela aberta usa livre, janela fechada usa template e nao presume entrega", async () => {
    for (const open of [true, false]) {
      const repo = await makeRepo()
      const cycle = await repo.createCycle({ negocioId: open ? "DO" : "DF", numeroCaso: "C" })
      const calls = []
      const result = await processPostHumanCycle({
        cycle, repository: repo,
        usuario: { negocioId: cycle.negocioId, numeroCaso: "C", telefoneNormalizado: "5511", ultimaMsg: open ? Date.now() : 1, listaDocumental: ["RG"], docsEntregues: ["RG"] },
        deps: {
          sendFree: async () => (calls.push("free"), { id: "m1" }),
          sendTemplate: async (_to, name, params) => (calls.push([name, params]), { id: "m2" }),
          templateConfig: {
            nome: "caso_atualizacao_v3", idioma: "pt_BR", contratoVerificado: true,
            headerImageUrl: "https://example.invalid/approved-header.png",
            parametrosEsperados: 1,
            componentes: [
              { tipo: "HEADER", formato: "IMAGE" },
              { tipo: "BODY", parametros: [{ tipo: "text", ordem: 1 }] },
              { tipo: "FOOTER" }
            ]
          },
          buildTemplateParams: solicitation => [solicitation.texto]
        }
      })
      assert.equal(result.tipoEnvio, open ? "livre" : "template")
      assert.equal(result.entregaConfirmada, false)
      if (!open) {
        assert.equal(calls[0][0], "caso_atualizacao_v3")
        assert.equal(calls[0][1].length, 1)
      }
      assert.equal(result.cycle.status, "awaiting_response")
    }
    const repo = await makeRepo()
    const cycle = await repo.createCycle({ negocioId: "DL", numeroCaso: "C" })
    let transport = ""
    const fixedLatest = Date.now() - 60000
    const latestResult = await processPostHumanCycle({
      cycle, repository: repo,
      usuario: { negocioId: "DL", numeroCaso: "C", telefoneNormalizado: "5511", ultimaMsg: 1, listaDocumental: ["RG"], docsEntregues: ["RG"] },
      deps: {
        getLatestCustomerMessage: async () => fixedLatest,
        sendFree: async () => (transport = "free", { id: "latest" }),
        sendTemplate: async () => (transport = "template", { id: "wrong" })
      }
    })
    assert.equal(transport, "free"); assert.equal(latestResult.tipoEnvio, "livre")
  })

  await test("nova atividade do cliente durante a analise aborta o envio e preserva o ciclo em ready_to_send", async () => {
    const repo = await makeRepo()
    const cycle = await repo.createCycle({ negocioId: "DL-NEW", numeroCaso: "C" })
    const calls = []
    const startUltimaMsg = 1000
    const latest = 2000
    let getLatestCallCount = 0
    const result = await processPostHumanCycle({
      cycle, repository: repo,
      usuario: { negocioId: "DL-NEW", numeroCaso: "C", telefoneNormalizado: "5511", listaDocumental: ["RG"], docsEntregues: ["RG"] },
      deps: {
        getLatestCustomerMessage: async () => (getLatestCallCount++ === 0 ? startUltimaMsg : latest),
        sendFree: async () => (calls.push("free"), { id: "m1" }),
        sendTemplate: async () => (calls.push("template"), { id: "m2" }),
        templateConfig: {
          nome: "caso_atualizacao_v3", idioma: "pt_BR", contratoVerificado: true,
          headerImageUrl: "https://example.invalid/approved-header.png",
          parametrosEsperados: 1,
          componentes: [
            { tipo: "HEADER", formato: "IMAGE" },
            { tipo: "BODY", parametros: [{ tipo: "text", ordem: 1 }] },
            { tipo: "FOOTER" }
          ]
        },
        buildTemplateParams: solicitation => [solicitation.texto]
      }
    })
    assert.equal(result.skipped, true)
    assert.equal(result.reason, "nova_atividade_cliente")
    assert.equal(result.cycle.status, "ready_to_send")
    assert.equal(calls.length, 0)
    const refreshed = await repo.getCycle(cycle.cycleId)
    assert.equal(refreshed.status, "ready_to_send")
  })

  await test("ligacao telefonica e evento agenda nao atualizam janela", async () => {
    const repo = await makeRepo()
    const cycle = await repo.createCycle({ negocioId: "D-CALL", numeroCaso: "C" })
    const calls = []
    const VINTE_CINCO_HORAS_ATRAS = Date.now() - (25 * 60 * 60 * 1000)
    const result = await processPostHumanCycle({
      cycle, repository: repo,
      usuario: {
        negocioId: "D-CALL",
        numeroCaso: "C",
        telefoneNormalizado: "5511",
        ultimaMsg: VINTE_CINCO_HORAS_ATRAS,
        ultimaLigacao: Date.now(),
        proximoEventoAgenda: Date.now() + 3600000,
        listaDocumental: ["RG"],
        docsEntregues: ["RG"]
      },
      deps: {
        sendFree: async () => { calls.push("free"); return { id: "m1" } },
        sendTemplate: async (to, name, params) => { calls.push(["template", name]); return { id: "m2" } },
        templateConfig: {
          nome: "caso_atualizacao_v3", idioma: "pt_BR", contratoVerificado: true,
          headerImageUrl: "https://example.invalid/header.png",
          parametrosEsperados: 1,
          componentes: [
            { tipo: "HEADER", formato: "IMAGE" },
            { tipo: "BODY", parametros: [{ tipo: "text", ordem: 1 }] },
            { tipo: "FOOTER" }
          ]
        },
        buildTemplateParams: solicitation => [solicitation.texto]
      }
    })
    assert.equal(result.tipoEnvio, "template", "Janela fechada (ultimaMsg > 24h) deve usar template")
    assert.equal(calls.length > 0 && calls[0][0], "template", "sendTemplate foi chamado")
    assert.equal(calls.length > 0 && calls[0][1], "caso_atualizacao_v3", "Template correto usado")
    assert.equal(calls.filter(c => c === "free").length, 0, "sendFree NÃO foi chamado")
  })

  await test("falha Meta e configuracao incompleta falham seguro sem retry apos reinicio", async () => {
    const repo = await makeRepo()
    const cycle = await repo.createCycle({ negocioId: "D", numeroCaso: "C" })
    const result = await processPostHumanCycle({
      cycle, repository: repo, usuario: { negocioId: "D", numeroCaso: "C", telefoneNormalizado: "5511", ultimaMsg: Date.now(), listaDocumental: ["RG"] },
      deps: { sendFree: async () => { throw new Error("token=abc telefone 11999999999") } }
    })
    assert.equal(result.failed, true)
    assert.equal((await repo.listRecoverable()).length, 0)
    assert.doesNotMatch(result.error, /abc|11999999999/)
    const uncertainRepo = await makeRepo()
    const uncertainCycle = await uncertainRepo.createCycle({ negocioId: "DU", numeroCaso: "C" })
    const uncertainError = new Error("timeout depois do envio"); uncertainError.sendOutcomeUnknown = true
    const uncertain = await processPostHumanCycle({
      cycle: uncertainCycle, repository: uncertainRepo,
      usuario: { negocioId: "DU", numeroCaso: "C", telefoneNormalizado: "5511", ultimaMsg: Date.now(), listaDocumental: ["RG"] },
      deps: { sendFree: async () => { throw uncertainError } }
    })
    assert.equal(uncertain.uncertain, true)
    assert.equal((await uncertainRepo.getCycle(uncertainCycle.cycleId)).resultadoEnvio, "incerto")
  })

  await test("resposta parcial, respondo depois e isolamento de negocios", async () => {
    const repo = await makeRepo()
    const a = await repo.createCycle({ negocioId: "A", numeroCaso: "CA", contatoId: "P", telefoneNormalizado: "55" })
    const b = await repo.createCycle({ negocioId: "B", numeroCaso: "CB", contatoId: "P", telefoneNormalizado: "55" })
    for (const cycle of [a, b]) {
      await repo.updateStatus(cycle.cycleId, "analyzing"); await repo.updateStatus(cycle.cycleId, "ready_to_send")
      await repo.updateStatus(cycle.cycleId, "sending"); await repo.updateStatus(cycle.cycleId, "message_sent"); await repo.updateStatus(cycle.cycleId, "awaiting_response")
    }
    const ambiguous = await resolverCiclo({ repository: repo, usuario: { contatoId: "P" }, from: "55" })
    assert.equal(ambiguous.ambiguous, true)
    const saved = []
    const result = await tratarRespostaClientePosAtendimento({ from: "55", msgType: "document", content: { id: "f" }, usuario: { negocioId: "A", contatoId: "P" }, repository: repo, deps: { saveDocument: async x => (saved.push(x), { persisted: true }) } })
    assert.equal(result.partial, true); assert.equal(saved[0].negocioId, "A")
    assert.equal((await repo.findActiveByBusiness("B")).cycleId, b.cycleId)
    const later = await tratarRespostaClientePosAtendimento({ from: "55", msgType: "text", content: "respondo depois", usuario: { negocioId: "A", contatoId: "P" }, repository: repo })
    assert.equal(later.deferred, true)
  })

  await test("atendimento realizado completo exerce a politica real e encerra somente o ciclo", async () => {
    const repo = await makeRepo()
    const {
      complementoPosHumanoEstaCompleto,
      criarVerificadorCompletudePosHumana,
      carregarPendenciasComplementaresPosHumanas,
      reads
    } = carregarPoliticaRealPosHumana()
    process.env.POST_HUMAN_PILOT_CASES = "REAL"
    const usuario = usuarioRealCompleto()
    const policy = criarVerificadorCompletudePosHumana(usuario, repo)
    const button = montarBotaoAtendimentoRealizado(usuario.negocioId, usuario.numeroCaso, {
      adminId: "ADMIN", contatoId: usuario.contatoId, customerPhone: usuario.telefoneNormalizado, customerPhoneConfirmed: true
    })
    const sends = []
    const hubspotUpdateAttempts = []
    const result = await handleAtendimentoRealizadoConfirmation({
      from: "ADMIN", interactionId: button.id, usuario, isAdmin: value => value === "ADMIN", repository: repo,
      processCycle: (cycle, currentUser) => processPostHumanCycle({
        cycle, usuario: currentUser, repository: repo,
        deps: {
          camposComplementaresPendentes: () => carregarPendenciasComplementaresPosHumanas({ usuario: currentUser, cycle, repository: repo }),
          isComplete: policy,
          applySafeHubspotUpdates: async input => {
            hubspotUpdateAttempts.push(input)
            return { humanReviewRequired: false, divergences: [] }
          },
          sendFree: async () => { sends.push("free") },
          sendTemplate: async () => { sends.push("template") }
        }
      })
    })
    assert.equal(result.cycle.status, "completed")
    assert.match(result.text, /Atendimento humano registrado.*não há complementação pendente/i)
    assert.deepEqual(sends, [])
    assert.equal(result.cycle.negocioId, usuario.negocioId)
    assert.equal(result.cycle.contatoId, usuario.contatoId)
    assert.equal(result.cycle.numeroCaso, usuario.numeroCaso)
    assert.equal(await repo.findActiveByBusiness(usuario.negocioId), null)
    assert.equal(await complementoPosHumanoEstaCompleto({ cycle: result.cycle, usuario, repository: repo }), true)
    assert.equal(await policy(result.cycle), true)
    assert.equal(reads.length >= 6, true, "politica real deve ler contato, negocio e associacao")
    assert.equal(hubspotUpdateAttempts.length, 1, "o unico updater permitido e o de complemento seguro")
    assert.equal(
      hubspotUpdateAttempts.some(({ incoming = {} }) =>
        incoming.dealstage || incoming.numero_de_caso || incoming.cliente_aceito ||
        incoming.accepted_client || incoming.status === "completed"),
      false,
      "completed do ciclo nao pode comandar conclusao juridica, aceite ou alteracao do caso"
    )
  })

  async function confirmarAtendimentoComPendencia({ nome, alteracoes, pergunta }) {
    process.env.POST_HUMAN_PILOT_CASES = "REAL"
    const { complementoPosHumanoEstaCompleto, criarVerificadorCompletudePosHumana, carregarPendenciasComplementaresPosHumanas } = carregarPoliticaRealPosHumana()
    const repo = await makeRepo()
    const usuario = usuarioRealCompleto(alteracoes)
    const policy = criarVerificadorCompletudePosHumana(usuario, repo)
    const button = montarBotaoAtendimentoRealizado(usuario.negocioId, usuario.numeroCaso, {
      adminId: "ADMIN", contatoId: usuario.contatoId, customerPhone: usuario.telefoneNormalizado, customerPhoneConfirmed: true
    })
    const sends = []
    const result = await handleAtendimentoRealizadoConfirmation({
      from: "ADMIN", interactionId: button.id, usuario, isAdmin: value => value === "ADMIN", repository: repo,
      processCycle: (cycle, currentUser) => processPostHumanCycle({
        cycle, usuario: currentUser, repository: repo,
        deps: {
          camposComplementaresPendentes: () => carregarPendenciasComplementaresPosHumanas({ usuario: currentUser, cycle, repository: repo }),
          isComplete: policy,
          sendFree: async (_to, text) => { sends.push(text); return { id: "mock" } },
          sendTemplate: async () => { throw new Error("template nao esperado") }
        }
      })
    })
    const cycle = await repo.findActiveByBusiness(usuario.negocioId)
    assert.equal(result.existing, false)
    assert.equal(cycle.negocioId, usuario.negocioId)
    assert.equal(cycle.contatoId, usuario.contatoId)
    assert.equal(cycle.numeroCaso, usuario.numeroCaso)
    assert.equal(cycle.status, "awaiting_response")
    assert.equal(sends.length, 1, `${nome} deve fazer somente uma pergunta`)
    assert.equal(await complementoPosHumanoEstaCompleto({ cycle, usuario, repository: repo }), false, `pendencia ${nome} deve reprovar politica real`)
    assert.equal(await policy(cycle), false, `verificador real deve reprovar pendencia ${nome}`)
    assert.match(sends[0], pergunta)
    return sends[0]
  }

  await test("atendimento realizado com pendencia cadastral seleciona uma pergunta cadastral", async () => {
    const pergunta = await confirmarAtendimentoComPendencia({ nome: "cadastral", alteracoes: { cidade: "" }, pergunta: /Em qual cidade/i })
    assert.doesNotMatch(pergunta, /Tipo do caso|envie/i)
  })

  await test("atendimento realizado com pendencia juridica seleciona uma pergunta juridica", async () => {
    const pergunta = await confirmarAtendimentoComPendencia({ nome: "juridica", alteracoes: { tipoCaso: "" }, pergunta: /Tipo do caso/i })
    assert.doesNotMatch(pergunta, /Em qual cidade|envie/i)
  })

  await test("atendimento realizado com pendencia documental preserva o fluxo documental", async () => {
    const pergunta = await confirmarAtendimentoComPendencia({
      nome: "documental", alteracoes: { docsEntregues: [], docsAusentes: ["RG"] }, pergunta: /envie/i
    })
    assert.doesNotMatch(pergunta, /Em qual cidade|Tipo do caso/i)
  })

  await test("flag, piloto, admin autorizado e template mapeado", async () => {
    const prior = process.env.POST_HUMAN_COMPLEMENTATION_ENABLED
    process.env.POST_HUMAN_COMPLEMENTATION_ENABLED = "false"
    assert.equal(montarBotaoAtendimentoRealizado("D", "C"), null)
    process.env.POST_HUMAN_COMPLEMENTATION_ENABLED = "true"
    process.env.POST_HUMAN_PILOT_CASES = "C"
    assert.equal(montarBotaoAtendimentoRealizado("D", "C", { allowedCases: ["OTHER"] }), null)
    assert.equal(montarBotaoAtendimentoRealizado("D", "C", { allowedCases: ["C"], adminId: "A", contatoId: "P", customerPhone: "5511999999999", customerPhoneConfirmed: true }).title, "✅ Atendimento realizado")
    const repo = await makeRepo()
    const unauthorized = await handleAtendimentoRealizadoConfirmation({ from: "x", interactionId: "admin_post_human_completed:D:C", usuario: { negocioId: "D", numeroCaso: "C" }, isAdmin: () => false, repository: repo })
    assert.match(unauthorized.text, /administrador/)
    assert.equal(META_TEMPLATES.casoAtualizacao.nome, "caso_atualizacao_v3")
    if (prior === undefined) delete process.env.POST_HUMAN_COMPLEMENTATION_ENABLED; else process.env.POST_HUMAN_COMPLEMENTATION_ENABLED = prior
  })

  await test("logs mascaram CPF telefone e segredo", async () => {
    const output = sanitizeSensitive("CPF 529.982.247-25 telefone +55 (11) 99999-9999 token=abc")
    assert.doesNotMatch(output, /529|99999|abc/)
  })

  console.log(`RESULT ${passed} passed`)
  if (originalEnabled === undefined) delete process.env.POST_HUMAN_COMPLEMENTATION_ENABLED
  else process.env.POST_HUMAN_COMPLEMENTATION_ENABLED = originalEnabled
  if (originalCases === undefined) delete process.env.POST_HUMAN_PILOT_CASES
  else process.env.POST_HUMAN_PILOT_CASES = originalCases
})()
