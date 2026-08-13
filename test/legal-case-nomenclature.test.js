"use strict"

const test = require("node:test")
const assert = require("node:assert/strict")
const {
  resolveLegalCaseNomenclature,
  projectLegalCaseNomenclature,
  applyLegalCaseNomenclatureToUser
} = require("../src/domain/legal-case-nomenclature")
const { resolveComplementaryContext } = require("../src/domain/post-human-complementary-fields")
const { montarTituloNegocioHubSpot } = require("../src/domain/hubspot-deal-title")
const { montarUsuarioFinalizacaoAdminAssistido } = require("../src/domain/admin-assisted-ai-flow")
const { criarCampoAdminAssistido } = require("../src/domain/admin-assisted-ai-schema")

function resolve(narrative, extra = {}) {
  return resolveLegalCaseNomenclature({ narrative, ...extra })
}

test("1 relato genérico mantém INSS sem inventar subtipo", () => {
  const result = resolve("Tenho um problema no INSS.")
  assert.equal(result.area, "INSS")
  assert.equal(result.subtype, null)
  assert.equal(result.status, "generic")
})

test("2 auxílio-doença define incapacidade temporária", () => {
  assert.equal(resolve("Pedi auxílio-doença.").subtype, "incapacidade_temporaria")
})

test("3 auxílio-doença negado separa subtipo e situação", () => {
  const result = resolve("Pedi auxílio-doença e foi negado.")
  assert.equal(result.subtype, "incapacidade_temporaria")
  assert.equal(result.situation, "indeferido")
})

test("4 indeferimento sem benefício não inventa subtipo", () => {
  const result = resolve("Meu benefício do INSS foi negado.")
  assert.equal(result.situation, "indeferido")
  assert.equal(result.subtype, null)
})

test("5 BPC criança só fica específico com deficiência comprovada no relato", () => {
  const result = resolve("Pedi BPC para minha filha com autismo.")
  assert.equal(result.subtype, "bpc_crianca_deficiencia")
})

test("6 BPC idoso é distinguido", () => {
  assert.equal(resolve("Pedi BPC para pessoa idosa.").subtype, "bpc_idoso")
})

test("7 BPC sem subtipo suficiente permanece genérico", () => {
  assert.equal(resolve("Quero informações sobre BPC/LOAS.").subtype, "bpc_generico")
  assert.equal(resolve("Pedi BPC para uma criança.").subtype, "bpc_generico")
})

test("8 benefício cessado é situação, não subtipo", () => {
  const result = resolve("Meu auxílio-doença foi cessado.")
  assert.equal(result.subtype, "incapacidade_temporaria")
  assert.equal(result.situation, "cessado")
})

test("9 benefício suspenso é situação", () => {
  assert.equal(resolve("O INSS suspendeu meu benefício.").situation, "suspenso")
})

test("10 pedido em análise é situação", () => {
  assert.equal(resolve("Meu pedido de aposentadoria no INSS está em análise.").situation, "em_analise")
})

test("11 recurso administrativo é situação e objetivo quando declarado", () => {
  const result = resolve("Entrei com recurso administrativo no INSS.")
  assert.equal(result.situation, "em_recurso")
  assert.equal(result.objective, "recurso_administrativo")
})

test("12 orientação não vira ação judicial", () => {
  const result = resolve("Quero apenas orientação para saber se tenho direito no INSS.")
  assert.equal(result.objective, "analisar_possibilidade")
  assert.equal(JSON.stringify(result).includes("ajuiz"), false)
})

test("13 pedido explícito de concessão define objetivo", () => {
  assert.equal(resolve("Quero conseguir o benefício do INSS.").objective, "obter_concessao")
})

test("14 correção explícita de benefício atualiza e preserva histórico", () => {
  const current = resolve("Pedi auxílio-doença.")
  const corrected = resolve("Corrigindo: o benefício que pedi foi BPC.", { current })
  assert.equal(corrected.subtype, "bpc_generico")
  assert.equal(corrected.history.at(-1).subtype, "incapacidade_temporaria")
  assert.equal(corrected.revision, current.revision + 1)
})

test("15 correção explícita de situação substitui valor ativo e preserva anterior", () => {
  const current = resolve("Meu pedido no INSS foi negado.")
  const corrected = resolve("Corrigindo: ainda está em análise no INSS.", { current })
  assert.equal(corrected.situation, "em_analise")
  assert.equal(corrected.history.at(-1).situation, "indeferido")
})

test("16 relato e Deal divergentes geram revisão sem overwrite silencioso", () => {
  const result = resolve("Pedi BPC/LOAS.", {
    deal: { properties: { oraculum_case_subtype: "incapacidade_temporaria" } }
  })
  assert.equal(result.subtype, "bpc_generico")
  assert.equal(result.status, "review")
  assert.equal(result.divergences.some(item => item.field === "subtype"), true)
})

test("17 documento confiável do titular pode confirmar subtipo", () => {
  const result = resolve("Problema no INSS.", {
    documents: { facts: [{ field: "beneficio", value: "Pensão por morte", status: "delivered", partyRole: "titular" }] }
  })
  assert.equal(result.subtype, "pensao_morte")
  assert.equal(result.sources.subtype, "documento_confirmado")
})

test("18 documento em review não define subtipo", () => {
  const result = resolve("Problema no INSS.", {
    documents: { facts: [{ field: "beneficio", value: "Pensão por morte", status: "review", partyRole: "titular" }] }
  })
  assert.equal(result.subtype, null)
})

test("19 benefício de terceiro não classifica o caso do titular", () => {
  const result = resolve("Tenho problema no INSS. Meu pai recebe aposentadoria.")
  assert.equal(result.area, "INSS")
  assert.equal(result.subtype, null)
  const document = resolve("Problema no INSS.", {
    documents: { facts: [{ field: "beneficio", value: "BPC/LOAS", trusted: true, partyRole: "terceiro" }] }
  })
  assert.equal(document.subtype, null)
})

test("20 restart conserva modelo persistido", () => {
  const persisted = resolve("Pedi auxílio-doença e foi negado.")
  const restored = resolve("", { current: JSON.parse(JSON.stringify(persisted)) })
  assert.deepEqual(restored, persisted)
})

test("21 webhook repetido é idempotente", () => {
  const first = resolve("Pedi auxílio-doença.")
  const repeated = resolve("Pedi auxílio-doença.", { current: first })
  assert.equal(repeated.revision, first.revision)
  assert.deepEqual(repeated.history, first.history)
})

test("22 classificação é refinada progressivamente", () => {
  const generic = resolve("Problema no INSS.")
  const benefit = resolve("Pedi auxílio-doença.", { current: generic })
  const denied = resolve("Foi negado.", { current: benefit })
  assert.equal(benefit.subtype, "incapacidade_temporaria")
  assert.equal(denied.subtype, "incapacidade_temporaria")
  assert.equal(denied.situation, "indeferido")
  assert.equal(denied.history.length, 2)
})

test("objetivo posterior considera indeferimento canônico de mensagens anteriores", () => {
  const generic = resolve("Tenho problema no INSS.")
  const benefit = resolve("Pedi auxílio-doença.", { current: generic })
  const denied = resolve("Foi negado.", { current: benefit })
  const objective = resolve("Quero conseguir o benefício.", { current: denied })
  assert.equal(objective.subtype, "incapacidade_temporaria")
  assert.equal(objective.situation, "indeferido")
  assert.equal(objective.objective, "reverter_indeferimento")
  assert.deepEqual(
    [generic.revision, benefit.revision, denied.revision, objective.revision],
    [1, 2, 3, 4]
  )
})

test("objetivo na mesma mensagem e pedido ainda não decidido permanecem compatíveis", () => {
  assert.equal(
    resolve("Pedi auxílio-doença e foi negado. Quero conseguir o benefício.").objective,
    "reverter_indeferimento"
  )
  assert.equal(
    resolve("Pedi auxílio-doença. Quero conseguir o benefício.").objective,
    "obter_concessao"
  )
})

test("intenção posterior curta usa situação indeferida persistida", () => {
  const denied = resolve("Meu pedido de auxílio-doença foi negado.")
  const objective = resolve("Quero o benefício.", { current: denied })
  assert.equal(objective.objective, "reverter_indeferimento")
})

test("correção atual da situação recalcula objetivo incompatível anterior", () => {
  const denied = resolve("Pedi auxílio-doença, foi negado e quero conseguir o benefício.")
  const corrected = resolve("Na verdade ainda está em análise.", { current: denied })
  assert.equal(corrected.situation, "em_analise")
  assert.equal(corrected.objective, "obter_concessao")
  assert.equal(corrected.history.at(-1).situation, "indeferido")
})

test("cessação e suspensão contextualizam intenção como restabelecimento", () => {
  for (const situation of ["cessado", "suspenso"]) {
    const current = resolve(`Meu benefício foi ${situation}.`)
    const objective = resolve("Quero voltar a receber o benefício.", { current })
    assert.equal(objective.objective, "restabelecer_beneficio")
  }
})

test("repetição, restart e webhook repetido não criam revisão extra", () => {
  const denied = resolve("Meu pedido de auxílio-doença foi negado.")
  const restored = JSON.parse(JSON.stringify(denied))
  const objective = resolve("Quero conseguir o benefício.", { current: restored })
  const repeated = resolve("Quero conseguir o benefício.", { current: objective })
  assert.equal(objective.objective, "reverter_indeferimento")
  assert.equal(repeated.revision, objective.revision)
  assert.deepEqual(repeated.history, objective.history)
})

test("23 caso antigo genérico continua legível", () => {
  const result = resolve("", { usuario: { area: "INSS", tipo: "inss_outros" } })
  assert.equal(result.area, "INSS")
  assert.equal(result.subtype, null)
})

test("24 refinamento não altera identidade nem cria caso", () => {
  const usuario = { numeroCaso: "PRV.260809.813", area: "INSS" }
  const first = resolve("Problema no INSS.", { usuario })
  const refined = resolve("Pedi auxílio-doença.", { current: first, usuario })
  assert.equal(usuario.numeroCaso, "PRV.260809.813")
  assert.equal(Object.prototype.hasOwnProperty.call(refined, "cycleId"), false)
  assert.equal(Object.prototype.hasOwnProperty.call(refined, "numeroCaso"), false)
})

test("25 objetivo desconhecido permanece nulo", () => {
  assert.equal(resolve("Pedi auxílio-doença no INSS.").objective, null)
})

test("26 ausência de informação suficiente permanece desconhecida", () => {
  const result = resolve("Preciso conversar com um advogado.")
  assert.equal(result.area, null)
  assert.equal(result.subtype, null)
  assert.equal(result.status, "unknown")
})

test("cenário integrado separa conceitos e evita perguntas sobre fatos conhecidos", () => {
  const narrative = "Pedi auxílio-doença, fiz perícia e o INSS negou. Quero conseguir o benefício porque continuo sem trabalhar."
  const model = resolve(narrative)
  assert.deepEqual(
    { area: model.area, subtype: model.subtype, situation: model.situation, objective: model.objective },
    { area: "INSS", subtype: "incapacidade_temporaria", situation: "indeferido", objective: "reverter_indeferimento" }
  )
  const context = resolveComplementaryContext({
    usuario: {
      area: "INSS", nome: "Cliente", cpf: "52998224725", dataNascimento: "01/01/1990",
      whatsappContato: "5581999999999", cidade: "Recife", uf: "PE", tipoCaso: "previdenciario",
      descricao: narrative, nomenclaturaJuridica: model
    },
    contact: { id: "C", properties: {} }, deal: { id: "D", properties: {} },
    expectedContactId: "C", expectedDealId: "D"
  })
  assert.equal(context.camposJuridicosPendentes.includes("beneficio"), false)
  assert.equal(context.camposJuridicosPendentes.includes("houvePericia"), false)
  assert.equal(context.nomenclaturaJuridica.subtype, "incapacidade_temporaria")
})

test("correção estrutural recalcula, preserva histórico e mantém conflito com Deal em review", () => {
  const initial = resolve("Pedi auxílio-doença e o INSS negou. Quero conseguir o benefício.")
  const corrected = resolve("Corrigindo: o benefício que pedi foi BPC.", {
    current: initial,
    deal: { properties: { oraculum_case_subtype: "incapacidade_temporaria" } }
  })
  assert.equal(corrected.subtype, "bpc_generico")
  assert.equal(corrected.history.at(-1).subtype, "incapacidade_temporaria")
  assert.equal(corrected.status, "review")
})

test("projeção e dealname usam nomenclatura canônica sem PII e preservam numeroCaso", () => {
  const model = resolve("Pedi auxílio-doença no INSS.")
  assert.deepEqual(projectLegalCaseNomenclature(model), {
    area: "INSS",
    tipoCaso: "inss_incapacidade",
    subTipo: "incapacidade_temporaria",
    situacao: "Requerido",
    objetivo: null
  })
  const title = montarTituloNegocioHubSpot({ numeroCaso: "PRV.260809.813", nomenclaturaJuridica: model, cpf: "52998224725" })
  assert.equal(title.includes("PRV.260809.813"), true)
  assert.equal(title.includes("Benefício por incapacidade temporária"), true)
  assert.equal(title.includes("52998224725"), false)
})

test("projeção local em u é idempotente, serializável e retomável", () => {
  const usuario = { numeroCaso: "PRV.260809.813", area: "INSS" }
  const model = resolve("Pedi auxílio-doença e foi negado. Quero conseguir o benefício.")
  assert.equal(applyLegalCaseNomenclatureToUser(usuario, model), true)
  assert.equal(usuario.numeroCaso, "PRV.260809.813")
  assert.equal(usuario.subTipo, "incapacidade_temporaria")
  assert.equal(usuario.situacao, "Indeferido")
  assert.equal(usuario.objetivo, "Obter concessão/reverter indeferimento")
  assert.equal(applyLegalCaseNomenclatureToUser(usuario, model), false)
  const restored = JSON.parse(JSON.stringify(usuario))
  assert.deepEqual(restored.nomenclaturaJuridica, model)
})

test("fonte de classificação existente é fallback de menor prioridade", () => {
  const result = resolve("Pedi BPC no INSS.", {
    classification: { tipo: "incapacidade_temporaria" }
  })
  assert.equal(result.subtype, "bpc_generico")
  assert.equal(resolve("", { classification: { subTipo: "incapacidade_temporaria" } }).subtype, "incapacidade_temporaria")
})

test("relato incerto e resposta marcada para conferir não confirmam subtipo", () => {
  assert.equal(resolve("Acho que pedi auxílio-doença no INSS.").subtype, null)
  assert.equal(resolve("", {
    usuario: { area: "INSS" },
    answered: { beneficio: { valor: "Auxílio-doença", status: "precisa_conferir" } }
  }).subtype, null)
})

test("Atendimento Assistido finaliza com a mesma estrutura canônica sem usar motivo como subtipo", () => {
  const field = value => criarCampoAdminAssistido(value, "confirmado")
  const usuario = montarUsuarioFinalizacaoAdminAssistido("5581999999999", {
    dados: {
      areaJuridica: field("INSS"),
      tipoCaso: field("Benefício previdenciário"),
      beneficio: field("Auxílio-doença"),
      situacao: field("Indeferido"),
      motivo: field("Falta de qualidade de segurado"),
      objetivo: field("Quero conseguir o benefício"),
      descricao: field("Pedi auxílio-doença e o INSS negou.")
    }
  })
  assert.equal(usuario.nomenclaturaJuridica.subtype, "incapacidade_temporaria")
  assert.equal(usuario.nomenclaturaJuridica.situation, "indeferido")
  assert.equal(usuario.subTipo, "incapacidade_temporaria")
  assert.notEqual(usuario.subTipo, "Falta de qualidade de segurado")

  const postHuman = resolveComplementaryContext({
    usuario,
    contact: { id: "C", properties: {} },
    deal: { id: "D", properties: {} },
    expectedContactId: "C",
    expectedDealId: "D"
  }).nomenclaturaJuridica
  assert.deepEqual(
    [postHuman.area, postHuman.subtype, postHuman.situation, postHuman.objective],
    [
      usuario.nomenclaturaJuridica.area,
      usuario.nomenclaturaJuridica.subtype,
      usuario.nomenclaturaJuridica.situation,
      usuario.nomenclaturaJuridica.objective
    ]
  )
})

test("legacy generic INSS classification is refined by a complete narrative", () => {
  const current = {
    area: "INSS",
    subtype: "inss_outros",
    type: "inss_outros",
    subtypeLabel: "Demanda Previdenciaria",
    status: "generic"
  }
  const result = resolve(
    "Pedi benef\u00edcio por incapacidade tempor\u00e1ria no INSS, mas foi negado depois da per\u00edcia. Quero recorrer da decis\u00e3o.",
    { current }
  )

  assert.equal(result.subtype, "incapacidade_temporaria")
  assert.equal(result.type, "inss_incapacidade")
  assert.equal(result.situation, "indeferido")
  assert.equal(result.status, "specific")
  assert.deepEqual(result.divergences, [])
  assert.equal(
    montarTituloNegocioHubSpot({
      area: "INSS",
      numeroCaso: "PRV.260801.813",
      nomenclaturaJuridica: result
    }),
    "\ud83d\udfe2 PRV.260801.813 - Benef\u00edcio por incapacidade tempor\u00e1ria"
  )
})
