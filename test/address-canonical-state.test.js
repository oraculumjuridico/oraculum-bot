"use strict"

const test = require("node:test")
const assert = require("node:assert/strict")
const {
  normalizeCep,
  buildAddressAnswerResult,
  extractSyntacticFacts
} = require("../src/domain/address-facts")
const { resolveComplementaryContext } = require("../src/domain/post-human-complementary-fields")
const { criarDadosVaziosAdminAssistido, criarCampoAdminAssistido } = require("../src/domain/admin-assisted-ai-schema")
const { atualizarCampoPendente } = require("../src/domain/admin-assisted-ai-flow")
const { tratarRespostaClientePosAtendimento } = require("../src/domain/post-human-response-handler")
const { CONTACT_UPDATE_FIELDS, planSafeUpdate } = require("../src/domain/post-human-hubspot-updater")

async function location(input) {
  const normalized = String(input).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
  const digits = normalized.replace(/\D/g, "")
  if (digits === "53600000") return { cidade: "Igarassu", uf: "PE", cep: digits }
  if (digits === "50000000") return { cidade: "Recife", uf: "PE", cep: digits }
  if (normalized.includes("igarasu") || normalized.includes("igarassu")) return { cidade: "Igarassu", uf: "PE" }
  if (normalized.includes("itapissuma")) return { cidade: "Itapissuma", uf: "PE" }
  if (normalized.includes("recife")) return { cidade: "Recife", uf: "PE" }
  if (normalized.includes("paulista") && normalized.includes("pe")) return { cidade: "Paulista", uf: "PE" }
  if (normalized.includes("paulista")) return { multiplos: true, opcoes: [{ cidade: "Paulista", uf: "PE" }, { cidade: "Paulista", uf: "PB" }] }
  return null
}

function build(field, text, options = {}) {
  return buildAddressAnswerResult(field, text, { resolveLocation: location, ...options })
}

function completeUser(overrides = {}) {
  return {
    nome: "Ana Silva", whatsappContato: "5511999999999", cidade: "Igarassu", uf: "PE",
    area: "Outros", tipoCaso: "orientacao", descricao: "Relato juridico completo.", ...overrides
  }
}

test("01 cidade correta fica canônica", async () => {
  const result = await build("cidade", "Igarassu")
  assert.equal(result.canonicalAnswers.cidade.valor, "Igarassu")
  assert.equal(result.canonicalAnswers.cidade.status, "confirmado")
})

test("02 erro simples só normaliza por resolução única", async () => {
  const result = await build("cidade", "Igarasu")
  assert.equal(result.canonicalAnswers.cidade.valor, "Igarassu")
  assert.equal(result.canonicalAnswers.cidade.estadoEndereco, "normalizado")
})

test("03 cidade ambígua exige confirmação", async () => {
  const result = await build("cidade", "Paulista")
  assert.equal(result.canonicalAnswers.cidade.status, "precisa_conferir")
  assert.equal(result.canonicalAnswers.cidade.reasonCode, "ambiguous_city")
})

test("04 cidade sem UF não inventa UF quando lookup não a fornece", async () => {
  const result = await buildAddressAnswerResult("cidade", "Cidade Única", { resolveLocation: async () => ({ cidade: "Cidade Única" }) })
  assert.equal(result.canonicalAnswers.cidade.status, "confirmado")
  assert.equal(result.canonicalAnswers.uf, undefined)
})

test("05 cidade e UF são estruturadas", async () => {
  const result = await build("cidade", "Recife, PE")
  assert.equal(result.canonicalAnswers.cidade.valor, "Recife")
  assert.equal(result.canonicalAnswers.uf.valor, "PE")
})

test("06 UF divergente não sobrescreve valor conhecido", async () => {
  const result = await build("uf", "PB", { known: { uf: "PE" } })
  assert.equal(result.canonicalAnswers.uf.status, "precisa_conferir")
  assert.equal(result.canonicalAnswers.uf.estadoEndereco, "divergente")
})

test("07 CEP com hífen vira oito dígitos", async () => {
  const result = await build("cep", "53600-000")
  assert.equal(result.canonicalAnswers.cep.valor, "53600000")
})

test("08 CEP sem hífen permanece canônico", async () => {
  assert.equal(normalizeCep("53600000"), "53600000")
})

test("09 CEP inválido é recusado", async () => {
  const result = await build("cep", "5360-000")
  assert.equal(result.canonicalAnswers.cep.status, "invalido")
})

test("10 CEP incompatível com cidade confirmada vira divergência", async () => {
  const result = await build("cep", "50000-000", { known: { cidade: "Igarassu", uf: "PE" } })
  assert.equal(result.canonicalAnswers.cep.status, "precisa_conferir")
  assert.equal(result.canonicalAnswers.cep.reasonCode, "cep_location_conflict")
})

test("11 endereço inteiro é decomposto sem CEP inventado", async () => {
  const result = await build("endereco", "Rua das Flores, 50, Igarassu-PE")
  assert.equal(result.canonicalAnswers.endereco.valor, "Rua das Flores")
  assert.equal(result.canonicalAnswers.numeroEndereco.valor, "50")
  assert.equal(result.canonicalAnswers.cidade.valor, "Igarassu")
  assert.equal(result.canonicalAnswers.cep, undefined)
})

test("12 logradouro sem número não inventa número", () => {
  const { facts } = extractSyntacticFacts("Rua das Flores", { expectedField: "endereco" })
  assert.equal(facts.endereco.valor, "Rua das Flores")
  assert.equal(facts.numeroEndereco, undefined)
  const complete = extractSyntacticFacts("Rua X, 123, Centro", { expectedField: "endereco" }).facts
  assert.equal(complete.numeroEndereco.valor, "123")
  assert.equal(complete.bairro.valor, "Centro")
})

test("13 número sem logradouro só preenche número", async () => {
  const result = await build("numeroEndereco", "120")
  assert.equal(result.canonicalAnswers.numeroEndereco.valor, "120")
  assert.equal(result.canonicalAnswers.endereco, undefined)
})

test("14 bairro explicitamente informado é separado", () => {
  const { facts } = extractSyntacticFacts("Bairro Centro", { expectedField: "bairro" })
  assert.equal(facts.bairro.valor, "Centro")
})

test("15 ponto de referência não vira logradouro", () => {
  const { facts } = extractSyntacticFacts("Perto do Lojão da Cerâmica.", { expectedField: "referenciaEndereco" })
  assert.match(facts.referenciaEndereco.valor, /Lojão da Cerâmica/)
  assert.equal(facts.endereco, undefined)
})

test("16 correção posterior de cidade preserva valor anterior", async () => {
  const result = await build("cidade", "Corrigindo, moro em Itapissuma.", { previousAnswers: { cidade: { valor: "Igarassu", status: "confirmado", origem: "cliente" } } })
  assert.equal(result.canonicalAnswers.cidade.valor, "Itapissuma")
  assert.equal(result.canonicalAnswers.cidade.valorAnterior, "Igarassu")
  assert.equal(result.canonicalAnswers.cidade.correcao, true)
})

test("17 correção posterior de CEP prevalece com histórico", async () => {
  const result = await build("cep", "Corrigindo, o CEP é 53600-000", { previousAnswers: { cep: { valor: "50000000", status: "confirmado" } } })
  assert.equal(result.canonicalAnswers.cep.valor, "53600000")
  assert.equal(result.canonicalAnswers.cep.valorAnterior, "50000000")
})

test("18 expressão acho que não confirma cidade", async () => {
  const result = await build("cidade", "Acho que é Recife")
  assert.equal(result.canonicalAnswers.cidade.status, "precisa_conferir")
})

test("19 não lembrar CEP mantém o campo pendente", async () => {
  const result = await build("cep", "Não lembro o CEP")
  assert.equal(result.canonicalAnswers.cep.status, "precisa_conferir")
})

test("20 resposta multifato resolve somente componentes presentes", async () => {
  const result = await build("endereco", "Moro na Rua das Flores, 50, bairro Centro, Recife-PE, CEP 50000-000")
  for (const field of ["endereco", "numeroEndereco", "bairro", "cidade", "uf", "cep"]) assert.ok(result.canonicalAnswers[field], field)
  assert.equal(result.canonicalAnswers.complementoEndereco, undefined)
})

test("21 áudio pós-humano é transcrito antes do interpretador canônico", async () => {
  const oldEnabled = process.env.POST_HUMAN_COMPLEMENTATION_ENABLED
  const oldCases = process.env.POST_HUMAN_PILOT_CASES
  process.env.POST_HUMAN_COMPLEMENTATION_ENABLED = "true"
  process.env.POST_HUMAN_PILOT_CASES = "ADDR-1"
  let cycle = { cycleId: "CY-1", contatoId: "C", negocioId: "D", numeroCaso: "ADDR-1", payload: { campoPendente: "cidade", respostas: {} } }
  const repository = {
    getActiveCycles: async () => [cycle],
    getCycle: async () => cycle,
    updateStatus: async (_id, status, extras = {}) => {
      cycle = { ...cycle, status, payload: { ...cycle.payload, ...extras } }
      return cycle
    }
  }
  let transcriptionUsed = false
  const result = await tratarRespostaClientePosAtendimento({
    from: "5511999999999", msgType: "audio", content: { audio: { id: "local" } },
    usuario: { contatoId: "C", negocioId: "D", numeroCaso: "ADDR-1" }, repository,
    deps: {
      transcribeInformationAudio: async () => "Recife, Pernambuco",
      saveInformation: async ({ content }) => {
        transcriptionUsed = content === "Recife, Pernambuco"
        return build("cidade", content)
      },
      updateCanonicalState: async () => true,
      isComplete: async () => false,
      continueCycle: async ({ cycle: current }) => ({ cycle: current })
    }
  })
  assert.equal(result.handled, true)
  assert.equal(transcriptionUsed, true)
  assert.equal(cycle.payload.respostas.cidade.valor, "Recife")
  assert.equal(cycle.payload.respostas.uf.valor, "PE")
  if (oldEnabled === undefined) delete process.env.POST_HUMAN_COMPLEMENTATION_ENABLED; else process.env.POST_HUMAN_COMPLEMENTATION_ENABLED = oldEnabled
  if (oldCases === undefined) delete process.env.POST_HUMAN_PILOT_CASES; else process.env.POST_HUMAN_PILOT_CASES = oldCases
})

test("22 estado canônico sobrevive a serialização e restart", async () => {
  const result = await build("cidade", "Igarasu")
  const restored = JSON.parse(JSON.stringify(result.canonicalAnswers))
  assert.deepEqual(restored, result.canonicalAnswers)
})

test("23 webhook repetido produz a mesma projeção sem histórico artificial", async () => {
  const first = await build("cep", "53600-000")
  const second = await build("cep", "53600-000", { previousAnswers: first.canonicalAnswers })
  assert.equal(second.canonicalAnswers.cep.valor, first.canonicalAnswers.cep.valor)
  assert.equal(second.canonicalAnswers.cep.historico, undefined)
})

test("24 endereço já conhecido em u resolve pendência", () => {
  const result = resolveComplementaryContext({ usuario: completeUser({ endereco: "Rua A", cep: "53600000" }) })
  assert.equal(result.data.endereco.valor, "Rua A")
  assert.equal(result.data.cep.valor, "53600000")
})

test("25 Contact preenche cidade ausente sem criar propriedade nova", () => {
  const result = resolveComplementaryContext({ usuario: completeUser({ cidade: "", uf: "" }), contact: { properties: { city: "Igarassu", state: "PE", address: "Rua A", zip: "53600000" } } })
  assert.equal(result.data.cidade.origem, "contato")
  assert.equal(result.data.endereco.valor, "Rua A")
  const compatible = resolveComplementaryContext({ usuario: completeUser({ endereco: "Rua A", numeroEndereco: "10", bairro: "Centro" }), contact: { properties: { address: "Rua A, 10, Centro" } } })
  assert.equal(compatible.divergences.some(item => ["endereco", "numeroEndereco", "bairro"].includes(item.field)), false)
})

test("26 resposta atual divergente do Contact é preservada e sinalizada", () => {
  const result = resolveComplementaryContext({ usuario: completeUser({ cidade: "" }), answered: { cidade: { valor: "Igarassu", status: "confirmado", origem: "cliente" } }, contact: { properties: { city: "Recife" } } })
  assert.equal(result.data.cidade.valor, "Igarassu")
  assert.ok(result.divergences.some(item => item.field === "cidade"))
})

test("27 documento confiável do titular pode suprir endereço", () => {
  const result = resolveComplementaryContext({ usuario: completeUser({ cidade: "", uf: "" }), documents: { facts: [{ field: "cidade", value: "Igarassu", trusted: true, partyRole: "titular", confidence: 0.99 }, { field: "uf", value: "PE", trusted: true, partyRole: "titular", confidence: 0.99 }] } })
  assert.equal(result.data.cidade.origem, "documento_confirmado")
})

test("28 documento em review não confirma endereço", () => {
  const result = resolveComplementaryContext({ usuario: completeUser({ cidade: "" }), documents: { facts: [{ field: "cidade", value: "Recife", trusted: true, partyRole: "titular", review: true }] } })
  assert.equal(result.camposPendentes.includes("cidade"), true)
})

test("29 documento de terceiro não confirma endereço do titular", () => {
  const result = resolveComplementaryContext({ usuario: completeUser({ cidade: "" }), documents: { facts: [{ field: "cidade", value: "Recife", trusted: true, partyRole: "terceiro" }] } })
  assert.equal(result.camposPendentes.includes("cidade"), true)
})

test("30 endereço resolvido não deixa pendência cadastral de localização", () => {
  const result = resolveComplementaryContext({ usuario: completeUser({ endereco: "Rua A", numeroEndereco: "10", bairro: "Centro", cep: "53600000" }) })
  assert.equal(result.camposCadastraisPendentes.some(field => ["cidade", "uf", "endereco", "numeroEndereco", "bairro", "cep"].includes(field)), false)
})

test("integração: pergunta, resposta livre, estado Admin e resolvedor convergem", async () => {
  const dados = criarDadosVaziosAdminAssistido()
  Object.assign(dados, {
    nomeCompleto: criarCampoAdminAssistido("Ana Silva", "confirmado"),
    telefone: criarCampoAdminAssistido("5511999999999", "confirmado"),
    areaJuridica: criarCampoAdminAssistido("Outros", "confirmado"),
    tipoCaso: criarCampoAdminAssistido("orientacao", "confirmado"),
    descricao: criarCampoAdminAssistido("Relato juridico completo", "confirmado")
  })
  const updated = await atualizarCampoPendente(
    { perguntaPendente: "endereco", dados },
    "Moro na Avenida 27 de Setembro, 120, Igarassu, Pernambuco. Perto do Lojão da Cerâmica.",
    dados,
    { resolverLocalizacaoAdminAssistido: location }
  )
  assert.equal(updated.endereco.valor, "Avenida 27 de Setembro")
  assert.equal(updated.numeroEndereco.valor, "120")
  assert.equal(updated.cidade.valor, "Igarassu")
  assert.equal(updated.uf.valor, "PE")
  assert.match(updated.referenciaEndereco.valor, /Lojão da Cerâmica/)
  assert.equal(updated.cep.status, "ausente")
  const context = resolveComplementaryContext({ answered: updated, usuario: completeUser({ cidade: "", uf: "" }) })
  assert.equal(context.camposPendentes.includes("cidade"), false)
  assert.equal(context.camposPendentes.includes("uf"), false)
  assert.equal(context.camposPendentes.includes("cep"), false, "CEP permanece opcional")
})

test("projeção HubSpot usa apenas propriedades existentes e não sobrescreve divergência", () => {
  const plan = planSafeUpdate(
    { address: "Rua Manual", city: "", state: "PE", zip: "" },
    { address: "Rua Nova", city: "Igarassu", state: "PE", zip: "53600000" },
    CONTACT_UPDATE_FIELDS
  )
  assert.deepEqual(plan.updates, { city: "Igarassu", zip: "53600000" })
  assert.deepEqual(plan.unchanged, ["state"])
  assert.deepEqual(plan.divergences, [{ field: "address" }])
})
