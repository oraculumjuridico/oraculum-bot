"use strict"

const test = require("node:test")
const assert = require("node:assert/strict")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")
const {
  extractInssLegalFacts,
  buildInssLegalAnswerResult
} = require("../src/domain/inss-legal-facts")
const { resolveComplementaryContext } = require("../src/domain/post-human-complementary-fields")
const { construirSolicitacao } = require("../src/domain/post-human-solicitation-builder")
const { analisarEstadoDocumental, STATES } = require("../src/domain/post-human-document-analyzer")
const { PostHumanCycleRepository } = require("../src/domain/post-human-cycle-model")
const { processPostHumanCycle } = require("../src/domain/post-human-flow")
const { tratarRespostaClientePosAtendimento, classify } = require("../src/domain/post-human-response-handler")
const { questionCatalog } = require("../src/domain/admin-assisted-intake-catalog")

function completeUser(overrides = {}) {
  return {
    area: "INSS",
    nome: "Ana Silva",
    whatsappContato: "5511999999999",
    telefoneNormalizado: "5511999999999",
    cidade: "Recife",
    uf: "PE",
    cpf: "52998224725",
    dataNascimento: "01/01/1990",
    tipoCaso: "beneficio por incapacidade indeferido",
    descricao: "Pedi auxilio-doenca em maio, fiz pericia em 20/05/2026 e negaram porque disseram que eu estava apto.",
    contatoId: "CONTACT-LEGAL",
    negocioId: "DEAL-LEGAL",
    numeroCaso: "LEGAL-001",
    listaDocumental: ["doc_rg"],
    docsEntregues: ["doc_rg"],
    docsAusentes: [],
    docsParciais: [],
    ultimaMsg: Date.now(),
    ...overrides
  }
}

function resolve(overrides = {}) {
  const usuario = completeUser(overrides.usuario)
  return resolveComplementaryContext({
    usuario,
    contact: { id: usuario.contatoId, loaded: true, properties: {}, ...(overrides.contact || {}) },
    deal: { id: usuario.negocioId, loaded: true, properties: { area_juridica: "INSS", ...(overrides.dealProperties || {}) } },
    answered: overrides.answered || {},
    documents: overrides.documents || {},
    expectedContactId: usuario.contatoId,
    expectedDealId: usuario.negocioId
  })
}

async function makeRepo(file) {
  const target = file || path.join(await fs.promises.mkdtemp(path.join(os.tmpdir(), "inss-legal-state-")), "cycles.json")
  const repository = new PostHumanCycleRepository({ file: target, mode: "local" })
  await repository.initialize()
  return { repository, file: target }
}

async function awaiting(repository, extras = {}) {
  let cycle = await repository.createCycle({ negocioId: "DEAL-LEGAL", numeroCaso: "LEGAL-001", contatoId: "CONTACT-LEGAL" })
  cycle = await repository.updateStatus(cycle.cycleId, "analyzing")
  cycle = await repository.updateStatus(cycle.cycleId, "ready_to_send", extras)
  cycle = await repository.updateStatus(cycle.cycleId, "sending")
  cycle = await repository.updateStatus(cycle.cycleId, "message_sent")
  return repository.updateStatus(cycle.cycleId, "awaiting_response")
}

test("relato inicial responde beneficio, requerimento, pericia e motivo semanticamente", () => {
  const result = resolve()
  for (const field of ["beneficio", "dataRequerimento", "houvePericia", "dataPericia", "motivo"]) {
    assert.equal(result.camposJuridicosPendentes.includes(field), false, field)
    assert.notEqual(result.data[field].status, "ausente", field)
  }
})

test("uma resposta livre extrai varios fatos sem inventar os ausentes", () => {
  const facts = extractInssLegalFacts("Pedi auxilio-doenca em maio, fiz pericia dia 20/05/2026 e negaram porque disseram que eu estava apto.")
  assert.equal(facts.beneficio.valor, "Auxilio por incapacidade temporaria")
  assert.equal(facts.dataRequerimento.valor, "maio")
  assert.equal(facts.houvePericia.valor, true)
  assert.equal(facts.dataPericia.valor, "20/05/2026")
  assert.match(facts.motivo.valor, /apto/i)
  assert.equal(facts.inicioIncapacidade, undefined)
})

test("sim curto responde somente pergunta booleana esperada", () => {
  assert.equal(extractInssLegalFacts("sim", { expectedField: "houvePericia" }).houvePericia.valor, true)
  assert.deepEqual(extractInssLegalFacts("sim", { expectedField: "motivo" }), {})
})

test("incerteza semantica preserva conteudo sem confirmar data ou fato", () => {
  for (const text of [
    "Foi mais ou menos nessa época.",
    "Acho que foi em maio.",
    "Talvez em abril.",
    "Não lembro direito.",
    "Por volta dessa época.",
    "Acho que foi nessa data."
  ]) {
    const result = extractInssLegalFacts(text, { expectedField: "dataPericia" })
    assert.equal(result.dataPericia.status, "precisa_conferir", text)
  }
  assert.equal(extractInssLegalFacts("Foi em 20 de maio.", { expectedField: "dataPericia" }).dataPericia.status, "confirmado")
  assert.equal(extractInssLegalFacts("Foi dia 20/05/2026.", { expectedField: "dataPericia" }).dataPericia.valor, "20/05/2026")
})

test("correcao explicita atualiza fato anterior sem depender do campo corrente", () => {
  const previousAnswers = { dataPericia: { valor: "maio", status: "confirmado", origem: "cliente" } }
  const simple = buildInssLegalAnswerResult("incapacidadeAtual", "Corrigindo, foi em abril.", { previousAnswers })
  assert.equal(simple.correctedField, "dataPericia")
  assert.equal(simple.canonicalAnswers.dataPericia.valor.toLowerCase(), "abril")
  assert.equal(simple.canonicalAnswers.dataPericia.valorAnterior, "maio")
  const explicit = buildInssLegalAnswerResult("incapacidadeAtual", "Eu falei errado, não foi maio, foi abril.", { previousAnswers })
  assert.equal(explicit.canonicalAnswers.dataPericia.valor.toLowerCase(), "abril")
  assert.equal(Object.keys(explicit.canonicalAnswers).length, 1)
})

test("correcoes de beneficio, pericia e motivo usam o fato semanticamente indicado", () => {
  const benefit = buildInssLegalAnswerResult("incapacidadeAtual", "Correção: o benefício era auxílio-doença.", {
    previousAnswers: { beneficio: { valor: "BPC/LOAS", status: "confirmado" } }
  })
  assert.equal(benefit.canonicalAnswers.beneficio.valor, "Auxilio por incapacidade temporaria")
  assert.equal(benefit.canonicalAnswers.beneficio.valorAnterior, "BPC/LOAS")
  const exam = buildInssLegalAnswerResult("atividadeHabitual", "Na verdade, não houve perícia.", {
    previousAnswers: { houvePericia: { valor: true, status: "confirmado" } }
  })
  assert.equal(exam.canonicalAnswers.houvePericia.valor, false)
  const reason = buildInssLegalAnswerResult("atividadeHabitual", "Correção: o motivo foi falta de qualidade de segurado.", {
    previousAnswers: { motivo: { valor: "incapacidade não comprovada", status: "confirmado" } }
  })
  assert.match(reason.canonicalAnswers.motivo.valor, /qualidade de segurado/i)
})

test("correcao sem fato identificavel nao sobrescreve arbitrariamente", () => {
  const result = buildInssLegalAnswerResult("incapacidadeAtual", "Corrigindo, eu falei errado.", {
    previousAnswers: {
      dataPericia: { valor: "maio", status: "confirmado" },
      dataRequerimento: { valor: "abril", status: "confirmado" }
    }
  })
  assert.equal(result.correctionAmbiguous, true)
  assert.deepEqual(result.canonicalAnswers, {})
})

test("correcao conflitante com documento confiavel preserva evidencia forte e exige revisao", () => {
  const correction = buildInssLegalAnswerResult("incapacidadeAtual", "Corrigindo, foi em abril.", {
    previousAnswers: { dataPericia: { valor: "maio", status: "confirmado" } }
  })
  const state = resolve({
    answered: correction.canonicalAnswers,
    documents: { facts: [{ field: "dataPericia", value: "20/05/2026", trusted: true, partyRole: "titular" }] }
  })
  assert.equal(state.humanReviewRequired, true)
  assert.ok(state.divergences.some(item => item.field === "dataPericia"))
  assert.equal(state.data.dataPericia.valor.toLowerCase(), "abril")
})

test("documento confiavel do titular responde e documento em review ou de terceiro nao responde", () => {
  const trusted = resolve({ documents: { facts: [{ field: "inicioIncapacidade", value: "10/01/2026", status: "delivered", partyRole: "titular" }] } })
  assert.equal(trusted.camposJuridicosPendentes.includes("inicioIncapacidade"), false)
  const review = resolve({ documents: { facts: [{ field: "inicioIncapacidade", value: "10/01/2026", status: "review", partyRole: "titular" }] } })
  assert.equal(review.camposJuridicosPendentes.includes("inicioIncapacidade"), true)
  const thirdParty = resolve({ documents: { facts: [{ field: "inicioIncapacidade", value: "10/01/2026", status: "delivered", partyRole: "terceiro" }] } })
  assert.equal(thirdParty.camposJuridicosPendentes.includes("inicioIncapacidade"), true)
  const unknownParty = resolve({ documents: { facts: [{ field: "inicioIncapacidade", value: "10/01/2026", status: "delivered" }] } })
  assert.equal(unknownParty.camposJuridicosPendentes.includes("inicioIncapacidade"), true)
})

test("contradicao com documento confiavel exige revisao", () => {
  const result = resolve({
    answered: { incapacidadeAtual: { valor: true, status: "confirmado", origem: "cliente" } },
    documents: { facts: [{ field: "incapacidadeAtual", value: false, trusted: true, partyRole: "titular" }] }
  })
  assert.equal(result.humanReviewRequired, true)
  assert.ok(result.divergences.some(item => item.field === "incapacidadeAtual"))
})

test("Contact cadastral e Deal juridico sao reutilizados sem misturar categorias", () => {
  const result = resolve({ usuario: { cidade: "" }, contact: { properties: { city: "Recife" } }, dealProperties: { beneficio: "Auxilio por incapacidade temporaria" } })
  assert.equal(result.camposCadastraisPendentes.includes("cidade"), false)
  assert.equal(result.camposJuridicosPendentes.includes("beneficio"), false)
  assert.equal(result.camposCadastraisPendentes.some(field => result.camposJuridicosPendentes.includes(field)), false)
})

test("resposta fora de ordem preserva o fato reconhecido e mantem a pergunta atual", () => {
  const result = buildInssLegalAnswerResult("inicioIncapacidade", "Meu benefício é BPC/LOAS")
  assert.equal(result.canonicalAnswers.beneficio.valor, "BPC/LOAS")
  assert.equal(result.canonicalAnswers.inicioIncapacidade, undefined)
  const state = resolve({ answered: result.canonicalAnswers })
  assert.equal(state.camposJuridicosPendentes.includes("inicioIncapacidade"), true)
})

test("outras areas continuam sem perguntas pos-humanas exclusivas de INSS", () => {
  const ids = questionCatalog("Trabalhista", { data: {} }).map(item => item.id)
  assert.equal(ids.includes("houvePericia"), false)
  assert.equal(ids.includes("inicioIncapacidade"), false)
})

test("sem pendencia juridica nao ha proxima pergunta", () => {
  const answered = Object.fromEntries([
    ["inicioIncapacidade", "10/01/2026"], ["incapacidadeAtual", false], ["atividadeHabitual", "Pedreiro"],
    ["protocoloRequerimento", "12345678"], ["cartaDecisaoAdministrativa", true],
    ["recursoAdministrativo", false], ["beneficioAnterior", false]
  ].map(([field, value]) => [field, { valor: value, status: "confirmado", origem: "cliente" }]))
  assert.deepEqual(resolve({ answered }).camposJuridicosPendentes, [])
})

test("protocolo e opcional por padrao e so aparece com necessidade concreta", () => {
  const ordinary = resolve()
  assert.equal(ordinary.camposJuridicosPendentes.includes("protocoloRequerimento"), false)

  const multipleRequests = resolve({
    usuario: { descricao: "Tenho dois pedidos e preciso distinguir o requerimento correto." }
  })
  assert.equal(multipleRequests.camposJuridicosPendentes.includes("protocoloRequerimento"), true)

  const known = resolve({
    usuario: { descricao: "Tenho dois pedidos e preciso distinguir o requerimento correto." },
    answered: { protocoloRequerimento: { valor: "12345678", status: "confirmado", origem: "cliente" } }
  })
  assert.equal(known.camposJuridicosPendentes.includes("protocoloRequerimento"), false)
})

test("pendencia somente documental e somente juridica permanecem estados distintos", async () => {
  const noLegalPending = Object.fromEntries([
    ["inicioIncapacidade", "10/01/2026"], ["incapacidadeAtual", false], ["atividadeHabitual", "Pedreiro"],
    ["protocoloRequerimento", "12345678"], ["cartaDecisaoAdministrativa", true],
    ["recursoAdministrativo", false], ["beneficioAnterior", false]
  ].map(([field, value]) => [field, { valor: value, status: "confirmado" }]))
  const userDocumentPending = completeUser({ docsEntregues: [], docsAusentes: ["doc_rg"] })
  const documentState = await analisarEstadoDocumental(userDocumentPending, userDocumentPending.negocioId, {
    camposComplementaresPendentes: () => resolve({ usuario: userDocumentPending, answered: noLegalPending })
  })
  assert.equal(documentState.estado, STATES.SEM_DOCUMENTOS)
  const legalState = await analisarEstadoDocumental(completeUser(), "DEAL-LEGAL", {
    camposComplementaresPendentes: () => resolve()
  })
  assert.equal(legalState.estado, STATES.INFORMACOES_COMPLEMENTARES_PENDENTES)
})

test("resposta, correcao, repeticao e restart usam o mesmo ciclo duravel", async () => {
  const previousFlag = process.env.POST_HUMAN_COMPLEMENTATION_ENABLED
  const previousCases = process.env.POST_HUMAN_PILOT_CASES
  process.env.POST_HUMAN_COMPLEMENTATION_ENABLED = "true"
  process.env.POST_HUMAN_PILOT_CASES = "LEGAL-001"
  try {
    const { repository, file } = await makeRepo()
    const cycle = await awaiting(repository, { campoPendente: "houvePericia", camposPendentes: ["houvePericia"] })
    const input = content => tratarRespostaClientePosAtendimento({
      from: "5511999999999", msgType: "text", content,
      usuario: completeUser(), repository,
      deps: {
        normalizePhone: String,
        saveInformation: ({ cycle: current, content: answerText }) => buildInssLegalAnswerResult(current.payload.campoPendente, answerText),
        isComplete: () => false
      }
    })
    await input("sim")
    await input("sim")
    let saved = await repository.getCycle(cycle.cycleId)
    assert.equal(saved.payload.respostas.houvePericia.valor, true)
    assert.deepEqual(saved.payload.camposRespondidos, ["houvePericia"])
    await input("não")
    saved = await repository.getCycle(cycle.cycleId)
    assert.equal(saved.payload.respostas.houvePericia.valor, false)
    const restarted = (await makeRepo(file)).repository
    const afterRestart = await restarted.getCycle(cycle.cycleId)
    assert.equal(afterRestart.payload.respostas.houvePericia.valor, false)
    assert.equal((await restarted.getActiveCycles({ negocioId: "DEAL-LEGAL" })).length, 1)
  } finally {
    if (previousFlag === undefined) delete process.env.POST_HUMAN_COMPLEMENTATION_ENABLED; else process.env.POST_HUMAN_COMPLEMENTATION_ENABLED = previousFlag
    if (previousCases === undefined) delete process.env.POST_HUMAN_PILOT_CASES; else process.env.POST_HUMAN_PILOT_CASES = previousCases
  }
})

test("correcao posterior persiste no ciclo e mantem a pergunta corrente ainda pendente", async () => {
  const previousFlag = process.env.POST_HUMAN_COMPLEMENTATION_ENABLED
  const previousCases = process.env.POST_HUMAN_PILOT_CASES
  process.env.POST_HUMAN_COMPLEMENTATION_ENABLED = "true"
  process.env.POST_HUMAN_PILOT_CASES = "LEGAL-001"
  try {
    const { repository } = await makeRepo()
    const cycle = await awaiting(repository, {
      campoPendente: "incapacidadeAtual",
      respostas: { dataPericia: { valor: "maio", status: "confirmado", origem: "cliente" } }
    })
    await tratarRespostaClientePosAtendimento({
      from: "5511999999999", msgType: "text", content: "Corrigindo, foi em abril.",
      usuario: completeUser(), repository,
      deps: {
        normalizePhone: String,
        saveInformation: ({ cycle: current, content }) => buildInssLegalAnswerResult(
          current.payload.campoPendente,
          content,
          { previousAnswers: current.payload.respostas || {} }
        ),
        isComplete: () => false
      }
    })
    const saved = await repository.getCycle(cycle.cycleId)
    assert.equal(saved.payload.respostas.dataPericia.valor.toLowerCase(), "abril")
    assert.equal(saved.payload.respostas.dataPericia.valorAnterior, "maio")
    assert.equal(saved.payload.respostas.incapacidadeAtual, undefined)
    assert.equal(saved.payload.campoPendente, "incapacidadeAtual")
  } finally {
    if (previousFlag === undefined) delete process.env.POST_HUMAN_COMPLEMENTATION_ENABLED; else process.env.POST_HUMAN_COMPLEMENTATION_ENABLED = previousFlag
    if (previousCases === undefined) delete process.env.POST_HUMAN_PILOT_CASES; else process.env.POST_HUMAN_PILOT_CASES = previousCases
  }
})

test("documento recebido enquanto aguarda texto nao responde campo juridico", async () => {
  const previousFlag = process.env.POST_HUMAN_COMPLEMENTATION_ENABLED
  const previousCases = process.env.POST_HUMAN_PILOT_CASES
  process.env.POST_HUMAN_COMPLEMENTATION_ENABLED = "true"
  process.env.POST_HUMAN_PILOT_CASES = "LEGAL-001"
  try {
    const { repository } = await makeRepo()
    const cycle = await awaiting(repository, { campoPendente: "inicioIncapacidade" })
    await tratarRespostaClientePosAtendimento({
      from: "5511999999999", msgType: "document", content: { id: "FILE-1" }, usuario: completeUser(), repository,
      deps: { normalizePhone: String, saveDocument: async () => ({ persisted: true }), isComplete: () => false }
    })
    const saved = await repository.getCycle(cycle.cycleId)
    assert.equal(saved.payload.respostas, undefined)
    assert.equal(saved.payload.campoPendente, "inicioIncapacidade")
    assert.equal(classify("document", {}), "document")
  } finally {
    if (previousFlag === undefined) delete process.env.POST_HUMAN_COMPLEMENTATION_ENABLED; else process.env.POST_HUMAN_COMPLEMENTATION_ENABLED = previousFlag
    if (previousCases === undefined) delete process.env.POST_HUMAN_PILOT_CASES; else process.env.POST_HUMAN_PILOT_CASES = previousCases
  }
})

test("audio transcrito reutiliza o mesmo interpretador da resposta textual", async () => {
  const previousFlag = process.env.POST_HUMAN_COMPLEMENTATION_ENABLED
  const previousCases = process.env.POST_HUMAN_PILOT_CASES
  process.env.POST_HUMAN_COMPLEMENTATION_ENABLED = "true"
  process.env.POST_HUMAN_PILOT_CASES = "LEGAL-001"
  try {
    const { repository } = await makeRepo()
    const cycle = await awaiting(repository, { campoPendente: "houvePericia" })
    let transcriptions = 0
    await tratarRespostaClientePosAtendimento({
      from: "5511999999999", msgType: "audio", content: { audio: { id: "AUDIO-1" } }, usuario: completeUser(), repository,
      deps: {
        normalizePhone: String,
        transcribeInformationAudio: async () => { transcriptions++; return "sim" },
        saveInformation: ({ cycle: current, content }) => buildInssLegalAnswerResult(current.payload.campoPendente, content),
        isComplete: () => false
      }
    })
    const saved = await repository.getCycle(cycle.cycleId)
    assert.equal(transcriptions, 1)
    assert.equal(saved.payload.respostas.houvePericia.valor, true)
  } finally {
    if (previousFlag === undefined) delete process.env.POST_HUMAN_COMPLEMENTATION_ENABLED; else process.env.POST_HUMAN_COMPLEMENTATION_ENABLED = previousFlag
    if (previousCases === undefined) delete process.env.POST_HUMAN_PILOT_CASES; else process.env.POST_HUMAN_PILOT_CASES = previousCases
  }
})

test("integracao local atravessa relato, pendencias, respostas, persistencia e conclusao", async () => {
  const previousFlag = process.env.POST_HUMAN_COMPLEMENTATION_ENABLED
  const previousCases = process.env.POST_HUMAN_PILOT_CASES
  process.env.POST_HUMAN_COMPLEMENTATION_ENABLED = "true"
  process.env.POST_HUMAN_PILOT_CASES = "LEGAL-001"
  try {
    const { repository } = await makeRepo()
    const user = completeUser()
    const sent = []
    const contextFor = async cycle => resolve({ answered: (await repository.getCycle(cycle.cycleId))?.payload?.respostas || {} })
    const isComplete = async cycle => (await contextFor(cycle)).camposPendentes.length === 0
    const flowDeps = {
      camposComplementaresPendentes: (_usuario, _deal) => contextFor(activeCycle),
      isComplete: ({ cycle }) => isComplete(cycle),
      getLatestCustomerMessage: () => user.ultimaMsg,
      sendFree: async (_to, message) => { sent.push(message); return { id: `MSG-${sent.length}` } },
      presentClientMenu: async () => null
    }
    let activeCycle = await repository.createCycle({ negocioId: user.negocioId, numeroCaso: user.numeroCaso, contatoId: user.contatoId })
    await processPostHumanCycle({ cycle: activeCycle, usuario: user, repository, deps: flowDeps })
    activeCycle = await repository.getCycle(activeCycle.cycleId)
    assert.equal(activeCycle.payload.campoPendente, "inicioIncapacidade")
    assert.equal(sent.length, 1)

    const responseDeps = {
      normalizePhone: String,
      saveInformation: ({ cycle, content }) => buildInssLegalAnswerResult(cycle.payload.campoPendente, content),
      isComplete,
      continueCycle: ({ cycle }) => processPostHumanCycle({ cycle, usuario: user, repository, deps: flowDeps })
    }
    await tratarRespostaClientePosAtendimento({
      from: user.telefoneNormalizado, msgType: "text",
      content: "A incapacidade começou em 10/01/2026, ainda continuo incapaz, não consigo levantar peso e trabalhava como pedreiro.",
      usuario: user, repository, deps: responseDeps
    })
    activeCycle = await repository.getCycle(activeCycle.cycleId)
    assert.equal(activeCycle.payload.campoPendente, "cartaDecisaoAdministrativa")
    assert.equal(sent.length, 2)

    await tratarRespostaClientePosAtendimento({
      from: user.telefoneNormalizado, msgType: "text",
      content: "Recebi a carta, não recorri e nunca tive benefício anterior.",
      usuario: user, repository, deps: responseDeps
    })
    activeCycle = await repository.getCycle(activeCycle.cycleId)
    assert.equal(activeCycle.status, "completed")
    assert.equal((await contextFor(activeCycle)).camposJuridicosPendentes.length, 0)
    assert.equal(sent.length, 2, "conclusao nao envia pergunta adicional")
    assert.equal((await repository._read()).cycles.length, 1)
  } finally {
    if (previousFlag === undefined) delete process.env.POST_HUMAN_COMPLEMENTATION_ENABLED; else process.env.POST_HUMAN_COMPLEMENTATION_ENABLED = previousFlag
    if (previousCases === undefined) delete process.env.POST_HUMAN_PILOT_CASES; else process.env.POST_HUMAN_PILOT_CASES = previousCases
  }
})
