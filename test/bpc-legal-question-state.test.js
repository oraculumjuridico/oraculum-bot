"use strict"

const test = require("node:test")
const assert = require("node:assert/strict")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")
const {
  extractBpcLegalFacts,
  buildBpcLegalAnswerResult,
  mergeBpcFacts,
  nextFamilyMember
} = require("../src/domain/bpc-legal-facts")
const { resolveComplementaryContext } = require("../src/domain/post-human-complementary-fields")
const { construirSolicitacao } = require("../src/domain/post-human-solicitation-builder")
const { STATES } = require("../src/domain/post-human-document-analyzer")
const { PostHumanCycleRepository } = require("../src/domain/post-human-cycle-model")
const { processPostHumanCycle } = require("../src/domain/post-human-flow")
const { tratarRespostaClientePosAtendimento } = require("../src/domain/post-human-response-handler")

function confirmed(value, origem = "cliente") {
  return { valor: value, status: "confirmado", origem }
}

function completeUser(overrides = {}) {
  return {
    area: "INSS",
    nome: "Maria Silva",
    whatsappContato: "5511999999999",
    telefoneNormalizado: "5511999999999",
    cidade: "Recife",
    uf: "PE",
    cpf: "52998224725",
    dataNascimento: "01/01/1990",
    tipoCaso: "BPC/LOAS para pessoa com deficiência",
    descricao: "Pedido de BPC/LOAS",
    beneficio: "BPC/LOAS",
    contatoId: "CONTACT-BPC",
    negocioId: "DEAL-BPC",
    numeroCaso: "BPC-001",
    listaDocumental: ["doc_rg"],
    docsEntregues: ["doc_rg"],
    docsAusentes: [],
    docsParciais: [],
    ultimaMsg: Date.now(),
    ...overrides
  }
}

function baseFamily() {
  return {
    members: [
      { memberId: "requerente", label: "crianca requerente", relation: "requerente", applicant: true, sameHousehold: true, minor: true, aliases: ["crianca requerente"], age: 8, workStatus: null, incomes: [], benefits: [] },
      { memberId: "mae", label: "mae", relation: "mae", applicant: false, sameHousehold: true, minor: false, aliases: ["mae", "eu"], age: null, workStatus: "sem_trabalho", incomes: [{ type: "sem_renda", amount: 0, status: "informado" }], benefits: [] },
      { memberId: "pai", label: "pai", relation: "pai", applicant: false, sameHousehold: true, minor: false, aliases: ["pai", "marido", "pai da crianca"], age: null, workStatus: "trabalha", incomes: [{ type: "trabalho", amount: 2000, status: "informado" }], benefits: [] }
    ]
  }
}

function completeAnswers(overrides = {}) {
  return {
    bpcRequerenteTipo: confirmed("crianca"),
    bpcDeficiencia: confirmed("Deficiencia informada pelo responsavel"),
    bpcImpedimentoLongoPrazo: confirmed(true),
    bpcComposicaoFamiliar: confirmed(baseFamily()),
    bpcDespesas: confirmed({ none: false, items: [{ type: "terapias", status: "informado" }] }),
    bpcCadUnico: confirmed("atualizado"),
    bpcSituacaoAdministrativa: confirmed("nao_requerido"),
    ...overrides
  }
}

function resolve({ usuario: userOverrides = {}, answered = {}, documents = {} } = {}) {
  const usuario = completeUser(userOverrides)
  return resolveComplementaryContext({
    usuario,
    contact: { id: usuario.contatoId, loaded: true, properties: {} },
    deal: { id: usuario.negocioId, loaded: true, properties: { area_juridica: "INSS" } },
    answered,
    documents,
    expectedContactId: usuario.contatoId,
    expectedDealId: usuario.negocioId
  })
}

async function makeRepo(file) {
  const target = file || path.join(await fs.promises.mkdtemp(path.join(os.tmpdir(), "bpc-legal-state-")), "cycles.json")
  const repository = new PostHumanCycleRepository({ file: target, mode: "local" })
  await repository.initialize()
  return { repository, file: target }
}

async function awaiting(repository, extras = {}) {
  let cycle = await repository.createCycle({ negocioId: "DEAL-BPC", numeroCaso: "BPC-001", contatoId: "CONTACT-BPC" })
  cycle = await repository.updateStatus(cycle.cycleId, "analyzing")
  cycle = await repository.updateStatus(cycle.cycleId, "ready_to_send", extras)
  cycle = await repository.updateStatus(cycle.cycleId, "sending")
  cycle = await repository.updateStatus(cycle.cycleId, "message_sent")
  return repository.updateStatus(cycle.cycleId, "awaiting_response")
}

function membersOf(facts) {
  return facts.bpcComposicaoFamiliar?.valor?.members || []
}

test("1 BPC crianca estrutura mae pai e irmaos sem perguntar profissao da crianca", () => {
  const facts = extractBpcLegalFacts("Meu filho tem deficiência, mora comigo, com o pai e dois irmãos. O pai trabalha e eu não estou trabalhando. Já pedi o BPC e foi negado.")
  assert.equal(facts.bpcRequerenteTipo.valor, "crianca")
  assert.deepEqual(membersOf(facts).map(member => member.memberId), ["requerente", "mae", "pai", "irmao_1", "irmao_2"])
  assert.equal(nextFamilyMember({ bpcComposicaoFamiliar: facts.bpcComposicaoFamiliar }).memberId, "pai")
  assert.equal(resolve({ answered: facts }).camposJuridicosPendentes.includes("atividadeHabitual"), false)
  assert.equal(extractBpcLegalFacts("Criança.", { expectedField: "bpcRequerenteTipo" }).bpcRequerenteTipo.valor, "crianca")
})

test("2 relato completo reaproveita composicao e rendas explicitas", () => {
  const facts = extractBpcLegalFacts("Eu moro com meu marido que ganha R$ 2.000 e dois filhos que não trabalham.", {
    previousAnswers: { beneficio: confirmed("BPC/LOAS"), bpcRequerenteTipo: confirmed("adulto") }
  })
  const members = membersOf(facts)
  assert.equal(members.length, 4)
  assert.equal(members.find(member => member.memberId === "marido").incomes[0].amount, 2000)
  assert.equal(members.filter(member => member.relation === "filho").every(member => member.workStatus === "sem_trabalho"), true)
})

test("3 integrante sem renda fica estruturado como ausencia informada", () => {
  const facts = extractBpcLegalFacts("Eu não estou trabalhando e estou sem renda.", {
    expectedField: "bpcDetalhesMembro__mae",
    previousAnswers: { bpcComposicaoFamiliar: confirmed(baseFamily()) }
  })
  const mother = membersOf(facts).find(member => member.memberId === "mae")
  assert.equal(mother.workStatus, "sem_trabalho")
  assert.equal(mother.incomes[0].amount, 0)
})

test("4 integrante com salario preserva fonte e valor", () => {
  const family = baseFamily(); family.members.find(member => member.memberId === "pai").incomes = []
  const facts = extractBpcLegalFacts("O pai trabalha e ganha R$ 2.350,50.", { previousAnswers: { bpcComposicaoFamiliar: confirmed(family) } })
  assert.equal(membersOf(facts).find(member => member.memberId === "pai").incomes[0].amount, 2350.5)
})

test("5 beneficio de membro nao vira beneficio do requerente", () => {
  const facts = extractBpcLegalFacts("O pai recebe aposentadoria de R$ 1.500.", { previousAnswers: { bpcComposicaoFamiliar: confirmed(baseFamily()) } })
  const father = membersOf(facts).find(member => member.memberId === "pai")
  assert.equal(father.benefits[0].type, "previdenciario")
  assert.equal(facts.beneficio, undefined)
})

test("6 pessoa mencionada fora da residencia e preservada sem integrar domicilio", () => {
  const facts = extractBpcLegalFacts("Minha irmã não mora comigo, mas me ajuda.", { previousAnswers: { beneficio: confirmed("BPC/LOAS") } })
  assert.equal(membersOf(facts)[0].sameHousehold, false)
})

test("7 parente que mora ao lado nao integra grupo residencial", () => {
  const facts = extractBpcLegalFacts("Minha irmã mora ao lado e me ajuda.", { previousAnswers: { beneficio: confirmed("BPC/LOAS") } })
  assert.equal(membersOf(facts)[0].sameHousehold, false)
})

test("8 correcao de renda substitui fato ativo e preserva anterior", () => {
  const result = buildBpcLegalAnswerResult("bpcCadUnico", "Corrigindo, meu marido está desempregado desde junho.", {
    previousAnswers: { bpcComposicaoFamiliar: confirmed(baseFamily()) }
  })
  const corrected = result.canonicalAnswers.bpcComposicaoFamiliar
  const father = corrected.valor.members.find(member => member.memberId === "pai")
  assert.equal(father.workStatus, "sem_trabalho")
  assert.equal(corrected.valorAnterior.workStatus, "trabalha")
})

test("9 correcao ambigua nao escolhe integrante arbitrariamente", () => {
  const family = baseFamily()
  family.members.push({ memberId: "avo", label: "avo", relation: "avo", applicant: false, sameHousehold: true, minor: false, aliases: ["avo"], workStatus: "trabalha", incomes: [{ type: "trabalho", amount: 1000, status: "informado" }], benefits: [] })
  const result = buildBpcLegalAnswerResult("bpcCadUnico", "Corrigindo, ele está desempregado.", { previousAnswers: { bpcComposicaoFamiliar: confirmed(family) } })
  assert.equal(result.correctionAmbiguous, true)
  assert.deepEqual(result.canonicalAnswers, {})
})

test("10 marido e pai da crianca convergem somente no contexto infantil seguro", () => {
  const first = extractBpcLegalFacts("Meu filho mora comigo e com meu marido.")
  const second = extractBpcLegalFacts("O pai da criança mora na mesma casa.", { previousAnswers: first })
  assert.equal(membersOf(second).filter(member => member.memberId === "pai").length, 1)
})

test("11 papeis diferentes nao sao fundidos fora do contexto seguro", () => {
  const first = extractBpcLegalFacts("Eu moro com meu marido.", { previousAnswers: { bpcRequerenteTipo: confirmed("adulto") } })
  const second = extractBpcLegalFacts("O pai da criança mora comigo.", { previousAnswers: { ...first, bpcRequerenteTipo: confirmed("adulto") } })
  assert.ok(membersOf(second).some(member => member.memberId === "marido"))
  assert.ok(membersOf(second).some(member => member.memberId === "pai_da_crianca"))
})

test("12 renda informal fica distinta de salario", () => {
  const facts = extractBpcLegalFacts("O pai faz bicos e tem renda informal de R$ 800.", { previousAnswers: { bpcComposicaoFamiliar: confirmed(baseFamily()) } })
  assert.equal(membersOf(facts).find(member => member.memberId === "pai").incomes.at(-1).type, "renda_informal")
})

test("13 despesas de terapia e medicacao sao coletadas sem calcular elegibilidade", () => {
  const facts = extractBpcLegalFacts("Temos gastos com terapia e medicamentos.")
  assert.deepEqual(facts.bpcDespesas.valor.items.map(item => item.type), ["medicamentos", "terapias"])
  assert.equal(facts.elegibilidade, undefined)
})

test("14 ausencia de despesa relevante e fato explicito", () => {
  assert.equal(extractBpcLegalFacts("Não temos nenhuma despesa relevante.").bpcDespesas.valor.none, true)
})

test("15 CadUnico objetivo e confirmado", () => {
  assert.equal(extractBpcLegalFacts("Tenho CadÚnico atualizado.").bpcCadUnico.valor, "atualizado")
})

test("16 CadUnico incerto nao e confirmado", () => {
  assert.equal(extractBpcLegalFacts("Acho que o CadÚnico está atualizado.").bpcCadUnico.status, "precisa_conferir")
  assert.equal(extractBpcLegalFacts("Acho que ainda está em análise.", { expectedField: "bpcSituacaoAdministrativa" }).bpcSituacaoAdministrativa.status, "precisa_conferir")
})

test("17 requerimento BPC indeferido aciona motivo sem protocolo generico", () => {
  const state = resolve({ answered: { ...completeAnswers(), bpcSituacaoAdministrativa: confirmed("indeferido") } })
  assert.equal(state.camposJuridicosPendentes.includes("motivo"), true)
  assert.equal(state.camposJuridicosPendentes.includes("protocoloRequerimento"), false)
})

test("18 BPC em analise preserva situacao sem inventar indeferimento", () => {
  const facts = extractBpcLegalFacts("Já pedi o BPC e ainda está em análise.")
  assert.equal(facts.bpcSituacaoAdministrativa.valor, "em_analise")
  assert.equal(facts.motivo, undefined)
  assert.equal(extractBpcLegalFacts("Foi negado.", { expectedField: "bpcSituacaoAdministrativa" }).bpcSituacaoAdministrativa.valor, "indeferido")
})

test("19 motivo do indeferimento no relato nao e perguntado novamente", () => {
  const facts = extractBpcLegalFacts("Já pedi o BPC e foi negado porque disseram que faltava CadÚnico.")
  assert.match(facts.motivo.valor, /CadÚnico/i)
  assert.equal(resolve({ answered: { ...completeAnswers(), ...facts } }).camposJuridicosPendentes.includes("motivo"), false)
})

test("20 resposta multifato atualiza dominios distintos sem pergunta fixa", () => {
  const facts = extractBpcLegalFacts("Tenho CadÚnico atualizado, gasto com terapia e já pedi o BPC, que está em análise.")
  assert.equal(facts.bpcCadUnico.valor, "atualizado")
  assert.equal(facts.bpcDespesas.valor.items[0].type, "terapias")
  assert.equal(facts.bpcSituacaoAdministrativa.valor, "em_analise")
})

test("21 audio multifato usa o mesmo interpretador e persiste", async () => {
  const previousFlag = process.env.POST_HUMAN_COMPLEMENTATION_ENABLED
  const previousCases = process.env.POST_HUMAN_PILOT_CASES
  process.env.POST_HUMAN_COMPLEMENTATION_ENABLED = "true"
  process.env.POST_HUMAN_PILOT_CASES = "BPC-001"
  try {
    const { repository } = await makeRepo()
    const cycle = await awaiting(repository, { campoPendente: "bpcCadUnico", respostas: completeAnswers({ bpcCadUnico: undefined, bpcDespesas: undefined }) })
    await tratarRespostaClientePosAtendimento({
      from: "5511999999999", msgType: "audio", content: { audio: { id: "AUDIO-BPC" } }, usuario: completeUser(), repository,
      deps: {
        normalizePhone: String,
        transcribeInformationAudio: async () => "Tenho CadÚnico atualizado e gasto com terapia.",
        saveInformation: ({ cycle: current, content }) => buildBpcLegalAnswerResult(current.payload.campoPendente, content, { previousAnswers: current.payload.respostas || {} }),
        isComplete: () => false
      }
    })
    const saved = await repository.getCycle(cycle.cycleId)
    assert.equal(saved.payload.respostas.bpcCadUnico.valor, "atualizado")
    assert.equal(saved.payload.respostas.bpcDespesas.valor.items[0].type, "terapias")
  } finally {
    if (previousFlag === undefined) delete process.env.POST_HUMAN_COMPLEMENTATION_ENABLED; else process.env.POST_HUMAN_COMPLEMENTATION_ENABLED = previousFlag
    if (previousCases === undefined) delete process.env.POST_HUMAN_PILOT_CASES; else process.env.POST_HUMAN_PILOT_CASES = previousCases
  }
})

test("22 restart preserva fatos BPC no mesmo ciclo", async () => {
  const { repository, file } = await makeRepo()
  const cycle = await awaiting(repository, { campoPendente: "bpcCadUnico", respostas: completeAnswers() })
  const restarted = (await makeRepo(file)).repository
  assert.equal((await restarted.getCycle(cycle.cycleId)).payload.respostas.bpcCadUnico.valor, "atualizado")
})

test("23 webhook repetido nao duplica membro nem ciclo", async () => {
  const previousFlag = process.env.POST_HUMAN_COMPLEMENTATION_ENABLED
  const previousCases = process.env.POST_HUMAN_PILOT_CASES
  process.env.POST_HUMAN_COMPLEMENTATION_ENABLED = "true"
  process.env.POST_HUMAN_PILOT_CASES = "BPC-001"
  try {
    const { repository } = await makeRepo()
    const initial = extractBpcLegalFacts("Meu filho mora comigo e com o pai.")
    const cycle = await awaiting(repository, { campoPendente: "bpcDetalhesMembro__pai", respostas: initial })
    const input = () => tratarRespostaClientePosAtendimento({
      from: "5511999999999", msgType: "text", content: "O pai está desempregado e sem renda.", usuario: completeUser(), repository,
      deps: {
        normalizePhone: String,
        saveInformation: ({ cycle: current, content }) => buildBpcLegalAnswerResult(current.payload.campoPendente, content, { previousAnswers: current.payload.respostas || {} }),
        isComplete: () => false
      }
    })
    await input(); await input()
    const saved = await repository.getCycle(cycle.cycleId)
    const fathers = saved.payload.respostas.bpcComposicaoFamiliar.valor.members.filter(member => member.memberId === "pai")
    assert.equal(fathers.length, 1)
    assert.equal(fathers[0].incomes.length, 1)
    assert.equal((await repository.getActiveCycles({ negocioId: "DEAL-BPC" })).length, 1)
  } finally {
    if (previousFlag === undefined) delete process.env.POST_HUMAN_COMPLEMENTATION_ENABLED; else process.env.POST_HUMAN_COMPLEMENTATION_ENABLED = previousFlag
    if (previousCases === undefined) delete process.env.POST_HUMAN_PILOT_CASES; else process.env.POST_HUMAN_PILOT_CASES = previousCases
  }
})

test("24 solicitacao contem no maximo uma pergunta por vez", () => {
  const state = resolve({ answered: { beneficio: confirmed("BPC/LOAS") } })
  const solicitation = construirSolicitacao({ estado: STATES.INFORMACOES_COMPLEMENTARES_PENDENTES, camposPendentes: state.camposPendentes })
  assert.equal((solicitation.texto.match(/\?/g) || []).length, 1)
})

test("25 documento em review nao responde fato BPC", () => {
  const result = mergeBpcFacts({ data: {}, usuario: { descricao: "BPC/LOAS" }, documents: { facts: [{ field: "bpcCadUnico", value: "atualizado", status: "review", partyRole: "titular" }] } })
  assert.equal(result.data.bpcCadUnico, undefined)
  const conflict = mergeBpcFacts({ data: { bpcCadUnico: confirmed("nao_possui") }, usuario: { descricao: "BPC/LOAS" }, documents: { facts: [{ field: "bpcCadUnico", value: "atualizado", status: "delivered", partyRole: "titular" }] } })
  assert.equal(conflict.divergences[0].field, "bpcCadUnico")
})

test("26 documento de terceiro nao responde fato BPC", () => {
  const result = mergeBpcFacts({ data: {}, usuario: { descricao: "BPC/LOAS" }, documents: { facts: [{ field: "bpcCadUnico", value: "atualizado", status: "delivered", partyRole: "terceiro" }] } })
  assert.equal(result.data.bpcCadUnico, undefined)
})

test("27 nenhum fato faltante deixa contexto pronto para analise", () => {
  assert.deepEqual(resolve({ answered: completeAnswers() }).camposJuridicosPendentes, [])
})

test("28 somente documento faltante nao cria pergunta juridica", () => {
  const state = resolve({ usuario: { docsEntregues: [], docsAusentes: ["doc_rg"] }, answered: completeAnswers() })
  assert.deepEqual(state.camposJuridicosPendentes, [])
})

test("29 crianca nunca recebe pergunta de atividade profissional", () => {
  const state = resolve({ answered: completeAnswers() })
  assert.equal(state.camposJuridicosPendentes.includes("atividadeHabitual"), false)
  assert.equal(state.camposJuridicosPendentes.some(field => /profiss|atividade/i.test(field)), false)
})

test("30 BPC adulto e idoso nao usam cegamente o fluxo infantil", () => {
  const adult = resolve({ answered: completeAnswers({ bpcRequerenteTipo: confirmed("adulto"), bpcComposicaoFamiliar: confirmed({ members: [{ memberId: "requerente", label: "requerente", relation: "requerente", applicant: true, sameHousehold: true, minor: false, aliases: ["requerente"], workStatus: "sem_trabalho", incomes: [{ type: "sem_renda", amount: 0, status: "informado" }], benefits: [] }] }) }) })
  const elderly = resolve({ answered: completeAnswers({ bpcRequerenteTipo: confirmed("idoso"), bpcDeficiencia: undefined, bpcImpedimentoLongoPrazo: undefined, bpcDespesas: undefined }) })
  assert.equal(adult.data.bpcRequerenteTipo.valor, "adulto")
  assert.equal(elderly.camposJuridicosPendentes.includes("bpcDeficiencia"), false)
  assert.equal(elderly.camposJuridicosPendentes.includes("bpcImpedimentoLongoPrazo"), false)
})

test("familia 1 mae singular residente e criada", () => {
  const facts = extractBpcLegalFacts("Minha mãe mora comigo.", { previousAnswers: { beneficio: confirmed("BPC/LOAS"), bpcRequerenteTipo: confirmed("adulto") } })
  const mother = membersOf(facts).find(member => member.memberId === "mae")
  assert.equal(mother.sameHousehold, true)
})

test("familia 2 irmao singular residente e criado", () => {
  const facts = extractBpcLegalFacts("Meu irmão mora comigo.", { previousAnswers: { beneficio: confirmed("BPC/LOAS"), bpcRequerenteTipo: confirmed("adulto") } })
  assert.equal(membersOf(facts).find(member => member.memberId === "irmao_1").sameHousehold, true)
})

test("familia 3 aposentadoria acompanha a mae residente", () => {
  const facts = extractBpcLegalFacts("Minha mãe mora comigo e recebe aposentadoria.", { previousAnswers: { beneficio: confirmed("BPC/LOAS"), bpcRequerenteTipo: confirmed("adulto") } })
  const mother = membersOf(facts).find(member => member.memberId === "mae")
  assert.equal(mother.benefits[0].description, "aposentadoria")
  assert.equal(membersOf(facts).find(member => member.applicant).benefits.length, 0)
})

test("familia 4 desemprego acompanha o irmao residente", () => {
  const facts = extractBpcLegalFacts("Meu irmão mora comigo e está desempregado.", { previousAnswers: { beneficio: confirmed("BPC/LOAS"), bpcRequerenteTipo: confirmed("adulto") } })
  const brother = membersOf(facts).find(member => member.memberId === "irmao_1")
  assert.equal(brother.workStatus, "sem_trabalho")
  assert.equal(brother.incomes[0].amount, 0)
})

test("familia 5 mae e irmao recebem somente seus proprios fatos", () => {
  const facts = extractBpcLegalFacts("Moro com minha mãe e meu irmão. Minha mãe recebe aposentadoria e meu irmão está desempregado.", { previousAnswers: { beneficio: confirmed("BPC/LOAS"), bpcRequerenteTipo: confirmed("adulto") } })
  const mother = membersOf(facts).find(member => member.memberId === "mae")
  const brother = membersOf(facts).find(member => member.memberId === "irmao_1")
  const applicant = membersOf(facts).find(member => member.applicant)
  assert.equal(mother.benefits[0].description, "aposentadoria")
  assert.equal(mother.workStatus, null)
  assert.equal(brother.workStatus, "sem_trabalho")
  assert.equal(brother.benefits.length, 0)
  assert.equal(applicant.benefits.length, 0)
  assert.equal(applicant.incomes.length, 0)
})

test("familia 6 irma ao lado permanece fora do domicilio", () => {
  const facts = extractBpcLegalFacts("Minha irmã mora ao lado e me ajuda.", { previousAnswers: { beneficio: confirmed("BPC/LOAS"), bpcRequerenteTipo: confirmed("adulto") } })
  assert.equal(membersOf(facts).find(member => member.relation === "irma").sameHousehold, false)
})

test("familia 7 ex-marido externo nao recebe pensao como beneficio proprio", () => {
  const facts = extractBpcLegalFacts("Meu ex-marido paga pensão e mora em outra casa.", { previousAnswers: { beneficio: confirmed("BPC/LOAS"), bpcRequerenteTipo: confirmed("adulto") } })
  const formerHusband = membersOf(facts).find(member => member.memberId === "ex_marido")
  assert.equal(formerHusband.sameHousehold, false)
  assert.equal(formerHusband.benefits.length, 0)
  assert.equal(facts.bpcComposicaoFamiliar.valor.unassignedFacts[0].type, "pensao_recebida")
})

test("familia 8 trabalhar fora nao contradiz morar comigo", () => {
  const facts = extractBpcLegalFacts("Meu marido trabalha fora, mas mora comigo.", { previousAnswers: { beneficio: confirmed("BPC/LOAS"), bpcRequerenteTipo: confirmed("adulto") } })
  assert.equal(membersOf(facts).find(member => member.memberId === "marido").sameHousehold, true)
})

test("familia 9 marido e pai da crianca seguro recebem a mesma renda", () => {
  const first = extractBpcLegalFacts("Eu moro com meu marido e nosso filho.", { previousAnswers: { beneficio: confirmed("BPC/LOAS"), bpcRequerenteTipo: confirmed("adulto") } })
  const second = extractBpcLegalFacts("O pai da criança ganha R$ 2.500.", { previousAnswers: { ...first, beneficio: confirmed("BPC/LOAS"), bpcRequerenteTipo: confirmed("adulto") } })
  const husbands = membersOf(second).filter(member => member.memberId === "marido")
  assert.equal(husbands.length, 1)
  assert.equal(husbands[0].incomes[0].amount, 2500)
  assert.equal(membersOf(second).some(member => member.memberId === "pai_da_crianca"), false)
})

test("familia 10 marido atual e pai externo permanecem distintos", () => {
  const first = extractBpcLegalFacts("Eu moro com meu marido atual.", { previousAnswers: { beneficio: confirmed("BPC/LOAS"), bpcRequerenteTipo: confirmed("adulto") } })
  const second = extractBpcLegalFacts("O pai da criança mora em outra cidade.", { previousAnswers: { ...first, beneficio: confirmed("BPC/LOAS"), bpcRequerenteTipo: confirmed("adulto") } })
  assert.equal(membersOf(second).find(member => member.memberId === "marido").sameHousehold, true)
  assert.equal(membersOf(second).find(member => member.memberId === "pai_da_crianca").sameHousehold, false)
})

test("familia 11 pai explicitamente diferente nao se funde ao marido", () => {
  const facts = extractBpcLegalFacts("Meu marido mora comigo, mas o pai da criança é outra pessoa.", { previousAnswers: { beneficio: confirmed("BPC/LOAS"), bpcRequerenteTipo: confirmed("adulto") } })
  assert.ok(membersOf(facts).find(member => member.memberId === "marido"))
  assert.ok(membersOf(facts).find(member => member.memberId === "pai_da_crianca"))
})

test("familia 12 dois homens possiveis nao recebem renda do pai arbitrariamente", () => {
  const first = extractBpcLegalFacts("Eu moro com meu marido e meu avô.", { previousAnswers: { beneficio: confirmed("BPC/LOAS"), bpcRequerenteTipo: confirmed("adulto") } })
  const second = extractBpcLegalFacts("O pai da criança ganha R$ 2.500.", { previousAnswers: { ...first, beneficio: confirmed("BPC/LOAS"), bpcRequerenteTipo: confirmed("adulto") } })
  assert.equal(second.bpcComposicaoFamiliar.status, "precisa_conferir")
  assert.equal(membersOf(second).filter(member => ["marido", "avo_1"].includes(member.memberId)).every(member => member.incomes.length === 0), true)
  assert.equal(second.bpcComposicaoFamiliar.valor.unassignedFacts.length, 1)
})

test("familia 13 correcao posterior de residencia substitui o fato ativo", () => {
  const first = extractBpcLegalFacts("Meu irmão mora comigo.", { previousAnswers: { beneficio: confirmed("BPC/LOAS"), bpcRequerenteTipo: confirmed("adulto") } })
  const correction = buildBpcLegalAnswerResult("bpcCadUnico", "Corrigindo, ele se mudou e mora em outra casa.", { previousAnswers: first })
  const brother = correction.canonicalAnswers.bpcComposicaoFamiliar.valor.members.find(member => member.memberId === "irmao_1")
  assert.equal(brother.sameHousehold, false)
  assert.equal(correction.canonicalAnswers.bpcComposicaoFamiliar.valorAnterior.sameHousehold, true)
})

test("familia 14 correcao posterior de renda mantem o membro correto", () => {
  const first = extractBpcLegalFacts("Meu marido mora comigo e ganha R$ 2.000.", { previousAnswers: { beneficio: confirmed("BPC/LOAS"), bpcRequerenteTipo: confirmed("adulto") } })
  const correction = buildBpcLegalAnswerResult("bpcCadUnico", "Corrigindo, ele ficou desempregado.", { previousAnswers: first })
  const husband = correction.canonicalAnswers.bpcComposicaoFamiliar.valor.members.find(member => member.memberId === "marido")
  assert.equal(husband.workStatus, "sem_trabalho")
  assert.equal(husband.incomes.length, 1)
  assert.equal(husband.incomes[0].amount, 0)
  assert.equal(correction.canonicalAnswers.bpcComposicaoFamiliar.valorAnterior.incomes[0].amount, 2000)
})

test("familia 15 repeticao do mesmo fato nao duplica membro ou renda", () => {
  const first = extractBpcLegalFacts("Minha mãe mora comigo e recebe aposentadoria.", { previousAnswers: { beneficio: confirmed("BPC/LOAS"), bpcRequerenteTipo: confirmed("adulto") } })
  const second = extractBpcLegalFacts("Minha mãe mora comigo e recebe aposentadoria.", { previousAnswers: { ...first, beneficio: confirmed("BPC/LOAS"), bpcRequerenteTipo: confirmed("adulto") } })
  assert.equal(membersOf(second).filter(member => member.memberId === "mae").length, 1)
  assert.equal(membersOf(second).find(member => member.memberId === "mae").benefits.length, 1)
})

test("familia 16 restart preserva alias seguro entre marido e pai", async () => {
  const first = extractBpcLegalFacts("Eu moro com meu marido e nosso filho.", { previousAnswers: { beneficio: confirmed("BPC/LOAS"), bpcRequerenteTipo: confirmed("adulto") } })
  const { repository, file } = await makeRepo()
  const cycle = await awaiting(repository, { campoPendente: "bpcDetalhesMembro__marido", respostas: first })
  const restarted = (await makeRepo(file)).repository
  const persisted = await restarted.getCycle(cycle.cycleId)
  const second = extractBpcLegalFacts("O pai da criança ganha R$ 2.500.", { previousAnswers: persisted.payload.respostas })
  assert.equal(membersOf(second).filter(member => member.memberId === "marido").length, 1)
  assert.equal(membersOf(second).find(member => member.memberId === "marido").incomes[0].amount, 2500)
})

test("integracao local atravessa relato, persistencia, recalculo e conclusao no mesmo ciclo", async () => {
  const previousFlag = process.env.POST_HUMAN_COMPLEMENTATION_ENABLED
  const previousCases = process.env.POST_HUMAN_PILOT_CASES
  process.env.POST_HUMAN_COMPLEMENTATION_ENABLED = "true"
  process.env.POST_HUMAN_PILOT_CASES = "BPC-001"
  try {
    const narrative = "Meu filho tem deficiência, mora comigo, com o pai e dois irmãos. O pai trabalha e eu não estou trabalhando. Já pedi o BPC e foi negado."
    const user = completeUser({ descricao: narrative })
    const initialFacts = extractBpcLegalFacts(narrative)
    assert.equal(initialFacts.bpcSituacaoAdministrativa.valor, "indeferido")
    assert.equal(membersOf(initialFacts).find(member => member.memberId === "mae").workStatus, "sem_trabalho")
    const { repository } = await makeRepo()
    const sent = []
    let activeCycle = await repository.createCycle({ negocioId: user.negocioId, numeroCaso: user.numeroCaso, contatoId: user.contatoId })
    const contextFor = async cycle => resolve({ usuario: { descricao: narrative }, answered: (await repository.getCycle(cycle.cycleId))?.payload?.respostas || {} })
    const isComplete = async cycle => (await contextFor(cycle)).camposPendentes.length === 0
    const flowDeps = {
      camposComplementaresPendentes: () => contextFor(activeCycle),
      isComplete: ({ cycle }) => isComplete(cycle),
      getLatestCustomerMessage: () => user.ultimaMsg,
      sendFree: async (_to, message) => { sent.push(message); return { id: `MSG-${sent.length}` } },
      presentClientMenu: async () => null
    }
    await processPostHumanCycle({ cycle: activeCycle, usuario: user, repository, deps: flowDeps })
    activeCycle = await repository.getCycle(activeCycle.cycleId)
    assert.equal(sent.length, 1)
    assert.ok(activeCycle.payload.campoPendente)

    const remaining = completeAnswers({
      ...initialFacts,
      bpcComposicaoFamiliar: confirmed({
        members: membersOf(initialFacts).map(member => member.memberId === "pai"
          ? { ...member, incomes: [{ type: "trabalho", amount: 2000, status: "informado" }] }
          : member)
      }),
      motivo: confirmed("renda familiar não comprovada"),
      dataRequerimento: confirmed("20/05/2026"),
      cartaDecisaoAdministrativa: confirmed(true),
      recursoAdministrativo: confirmed(false)
    })
    await repository.updateStatus(activeCycle.cycleId, "awaiting_response", { respostas: remaining })
    const completed = await processPostHumanCycle({ cycle: await repository.getCycle(activeCycle.cycleId), usuario: user, repository, deps: flowDeps })
    assert.equal(completed.status, "completed")
    assert.equal((await contextFor(completed)).camposJuridicosPendentes.length, 0)
    assert.equal((await repository._read()).cycles.length, 1)
  } finally {
    if (previousFlag === undefined) delete process.env.POST_HUMAN_COMPLEMENTATION_ENABLED; else process.env.POST_HUMAN_COMPLEMENTATION_ENABLED = previousFlag
    if (previousCases === undefined) delete process.env.POST_HUMAN_PILOT_CASES; else process.env.POST_HUMAN_PILOT_CASES = previousCases
  }
})
