"use strict"

const assert = require("node:assert/strict")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")
const {
  questionCatalog, pendingQuestions, reconcileDocuments, classifyInssDemand,
  registrationStatus, REGISTRATION_STATUS, safeOcrUpdates, normalizeUf, resolveCityOrCep
} = require("../src/domain/admin-assisted-intake-catalog")
const { criarQuestionarioAdminAssistido, proximaPerguntaAdminAssistido } = require("../src/domain/admin-assisted-questionnaire")
const { criarCampoAdminAssistido } = require("../src/domain/admin-assisted-ai-schema")
const { PostHumanCycleRepository } = require("../src/domain/post-human-cycle-model")
const { tratarRespostaClientePosAtendimento } = require("../src/domain/post-human-response-handler")
const {
  montarBotaoAtendimentoRealizado, configuredPilotCases,
  _clearActionContextsForTests, _resetLegacyAllowlistWarningForTests
} = require("../src/domain/admin-post-human-complementation")

let passed = 0
async function test(name, fn) { try { await fn(); passed++; console.log(`PASS ${name}`) } catch (error) { console.error(`FAIL ${name}: ${error.stack}`); process.exitCode = 1 } }
function field(value, status = "confirmado") { return criarCampoAdminAssistido(value, status) }
async function repository() { const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "complete-intake-")); const repo = new PostHumanCycleRepository({ file: path.join(dir, "cycles.json") }); await repo.initialize(); return repo }

(async () => {
  await test("catalogo unico preserva area e seleciona uma pergunta sem repetir", () => {
    const inss = questionCatalog("INSS", { data: {} })
    const family = questionCatalog("Família", { data: {} })
    assert.ok(inss.some(item => item.id === "beneficio")); assert.ok(!inss.some(item => item.id === "empresa"))
    assert.ok(family.some(item => item.id === "vinculoFamiliar")); assert.ok(!family.some(item => item.id === "beneficio"))
    const questionnaire = criarQuestionarioAdminAssistido("INSS")
    const data = { nomeCompleto: field("Ana Maria"), telefone: field("5511999999999") }
    const next = proximaPerguntaAdminAssistido({ questionario: questionnaire, dados: data, perguntados: ["cidade"] })
    assert.equal(next.campo, "uf"); assert.equal(typeof next.perguntaCliente, "string")
    assert.equal(pendingQuestions({ area: "INSS", data, asked: ["cidade"] }).filter(item => item.id === "cidade").length, 1, "pergunta só deixa de ser pendente quando respondida")
  })

  await test("cidade CEP e UF convergem pelo resolvedor existente", async () => {
    const city = async input => input.startsWith("Igarassu") ? { cidade: "Igarassu", uf: "PE" } : { multiplos: true, opcoes: [{ cidade: "Bom Jesus", uf: "PI" }, { cidade: "Bom Jesus", uf: "RS" }] }
    const cep = async input => ({ cidade: "Igarassu", uf: "PE", cep: input })
    assert.deepEqual(await resolveCityOrCep("53610-000", { searchCep: cep }), { cidade: "Igarassu", uf: "PE", cep: "53610000" })
    assert.deepEqual(await resolveCityOrCep("Igarassu", { searchCity: city }), { cidade: "Igarassu", uf: "PE" })
    assert.deepEqual(await resolveCityOrCep("Igarassu/PE", { searchCity: city }), { cidade: "Igarassu", uf: "PE" })
    assert.equal(normalizeUf("Pernambuco"), "PE"); assert.equal(normalizeUf("PE"), "PE")
    assert.equal((await resolveCityOrCep("Bom Jesus", { searchCity: city })).multiplos, true)
  })

  await test("classificacao previdenciaria nao transforma indeferimento com CNIS em revisao", () => {
    assert.equal(classifyInssDemand("A aposentadoria foi indeferida porque vínculos e contribuições não aparecem no CNIS"), "Aposentadoria indeferida com necessidade de acerto do CNIS")
  })

  await test("documentos genericos nao sao inventados e checklist respeita quarentena", () => {
    const generic = reconcileDocuments({ required: ["CNIS", "RG"], mentioned: ["alguns documentos"] })
    assert.deepEqual(generic.mentioned, []); assert.equal(generic.unidentified, true); assert.deepEqual(generic.missing, ["CNIS", "RG"])
    const cnis = reconcileDocuments({ required: ["CNIS", "RG"], mentioned: ["CNIS", "documentação"], received: ["CNIS"], quarantined: ["RG"] })
    assert.deepEqual(cnis.mentioned, ["CNIS"]); assert.deepEqual(cnis.missing, ["RG"]); assert.equal(cnis.unidentified, true)
    const only = reconcileDocuments({ required: ["CNIS"], mentioned: ["CNIS"], received: ["CNIS"], unidentified: false })
    assert.deepEqual(only.missing, []); assert.equal(only.unidentified, false)
  })

  await test("OCR preenche somente vazio permitido confiavel aprovado e do titular", () => {
    const allowed = ["cpf", "dataNascimento"]
    const safe = safeOcrUpdates({ current: { cpf: "" }, extraction: { cpf: { value: "52998224725", confidence: 0.99 }, nome: { value: "Outro", confidence: 1 } }, allowlist: allowed, approved: true, principalIdentityMatch: true })
    assert.deepEqual(safe.updates, { cpf: "52998224725" })
    assert.deepEqual(safeOcrUpdates({ current: {}, extraction: { cpf: { value: "1", confidence: 0.5 } }, allowlist: allowed, approved: true, principalIdentityMatch: true }).updates, {})
    assert.deepEqual(safeOcrUpdates({ current: {}, extraction: { cpf: { value: "1", confidence: 1 } }, allowlist: allowed, approved: true, principalIdentityMatch: false }).updates, {})
    const divergence = safeOcrUpdates({ current: { cpf: "111" }, extraction: { cpf: { value: "222", confidence: 1 } }, allowlist: allowed, approved: true, principalIdentityMatch: true })
    assert.equal(divergence.humanReviewRequired, true); assert.equal(divergence.divergences[0].field, "cpf")
  })

  await test("status completo exige pendencias documentos e recursos resolvidos", () => {
    const resources = { contatoId: "C", negocioId: "D", numeroCaso: "P", pastaDriveId: "F", associated: true }
    assert.equal(registrationStatus({ pending: ["cpf"], documents: {}, resources }), REGISTRATION_STATUS.COMPLEMENTATION)
    assert.equal(registrationStatus({ documents: { missing: ["RG"] }, resources }), REGISTRATION_STATUS.DOCUMENTS)
    assert.equal(registrationStatus({ documents: { quarantined: ["RG"] }, resources }), REGISTRATION_STATUS.REVIEW)
    assert.equal(registrationStatus({ documents: {}, resources: {} }), REGISTRATION_STATUS.INITIAL)
    assert.equal(registrationStatus({ documents: {}, resources }), REGISTRATION_STATUS.COMPLETE)
  })

  await test("destinatario exige telefone confirmado e nunca aceita administrador", () => {
    const oldFlag = process.env.POST_HUMAN_COMPLEMENTATION_ENABLED; const oldCases = process.env.POST_HUMAN_PILOT_CASES
    process.env.POST_HUMAN_COMPLEMENTATION_ENABLED = "true"; process.env.POST_HUMAN_PILOT_CASES = "P-1"; _clearActionContextsForTests()
    assert.equal(montarBotaoAtendimentoRealizado("D", "P-1", { adminId: "5511888888888", contatoId: "C", customerPhone: "5511999999999" }), null)
    assert.equal(montarBotaoAtendimentoRealizado("D", "P-1", { adminId: "5511888888888", contatoId: "C", customerPhone: "5511888888888", customerPhoneConfirmed: true }), null)
    assert.ok(montarBotaoAtendimentoRealizado("D", "P-1", { adminId: "5511888888888", contatoId: "C", customerPhone: "5511999999999", customerPhoneConfirmed: true }))
    if (oldFlag === undefined) delete process.env.POST_HUMAN_COMPLEMENTATION_ENABLED; else process.env.POST_HUMAN_COMPLEMENTATION_ENABLED = oldFlag
    if (oldCases === undefined) delete process.env.POST_HUMAN_PILOT_CASES; else process.env.POST_HUMAN_PILOT_CASES = oldCases
  })

  await test("alias de allowlist e prioridade canonica permanecem compativeis", () => {
    const oldCanonical = process.env.POST_HUMAN_PILOT_CASES; const oldLegacy = process.env.POST_HUMAN_COMPLEMENTATION_ALLOWLIST
    delete process.env.POST_HUMAN_PILOT_CASES; process.env.POST_HUMAN_COMPLEMENTATION_ALLOWLIST = "LEGACY-1"; _resetLegacyAllowlistWarningForTests()
    assert.equal(configuredPilotCases(), "LEGACY-1")
    process.env.POST_HUMAN_PILOT_CASES = "CANONICAL-1"; assert.equal(configuredPilotCases(), "CANONICAL-1")
    if (oldCanonical === undefined) delete process.env.POST_HUMAN_PILOT_CASES; else process.env.POST_HUMAN_PILOT_CASES = oldCanonical
    if (oldLegacy === undefined) delete process.env.POST_HUMAN_COMPLEMENTATION_ALLOWLIST; else process.env.POST_HUMAN_COMPLEMENTATION_ALLOWLIST = oldLegacy
  })

  await test("resposta do cliente persiste no mesmo ciclo e aciona proxima pergunta", async () => {
    const oldFlag = process.env.POST_HUMAN_COMPLEMENTATION_ENABLED; const oldCases = process.env.POST_HUMAN_PILOT_CASES
    process.env.POST_HUMAN_COMPLEMENTATION_ENABLED = "true"; process.env.POST_HUMAN_PILOT_CASES = "P-2"
    const repo = await repository(); const created = await repo.createCycle({ negocioId: "D", numeroCaso: "P-2", contatoId: "C" })
    let cycle = await repo.updateStatus(created.cycleId, "analyzing"); cycle = await repo.updateStatus(cycle.cycleId, "ready_to_send", { campoPendente: "cidade" }); cycle = await repo.updateStatus(cycle.cycleId, "sending"); cycle = await repo.updateStatus(cycle.cycleId, "message_sent"); cycle = await repo.updateStatus(cycle.cycleId, "awaiting_response")
    const calls = []
    const result = await tratarRespostaClientePosAtendimento({ from: "5511999999999", msgType: "text", content: "Igarassu", usuario: { contatoId: "C", negocioId: "D", numeroCaso: "P-2" }, repository: repo, deps: {
      saveInformation: async () => ({ persisted: true, canonicalPatch: { field: "cidade", value: "Igarassu" } }),
      updateCanonicalState: async input => calls.push(["state", input.patch]),
      isComplete: async () => false,
      continueCycle: async ({ cycle: same }) => (calls.push(["continue", same.negocioId]), { cycle: same })
    } })
    const persisted = await repo.getCycle(created.cycleId)
    assert.equal(result.handled, true); assert.deepEqual(calls.map(item => item[0]), ["state", "continue"])
    assert.equal(persisted.negocioId, "D"); assert.equal(persisted.payload.respostas.cidade.valor, "Igarassu")
    if (oldFlag === undefined) delete process.env.POST_HUMAN_COMPLEMENTATION_ENABLED; else process.env.POST_HUMAN_COMPLEMENTATION_ENABLED = oldFlag
    if (oldCases === undefined) delete process.env.POST_HUMAN_PILOT_CASES; else process.env.POST_HUMAN_PILOT_CASES = oldCases
  })

  console.log(`RESULT ${passed}/9 complete intake passed`)
  console.log(JSON.stringify({ realExternalActions: 0 }))
})()
