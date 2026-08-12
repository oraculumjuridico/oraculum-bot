"use strict"

const test = require("node:test")
const assert = require("node:assert/strict")
const { resolveComplementaryContext } = require("../src/domain/post-human-complementary-fields")

function base(overrides = {}) {
  const { usuario = {}, contact = {}, deal = {}, ...rest } = overrides
  return {
    usuario: {
      area: "INSS", nome: "Ana Silva", whatsappContato: "5511999999999",
      cidade: "Recife", uf: "PE", cpf: "529.982.247-25", dataNascimento: "01/01/1990",
      tipoCaso: "previdenciario", descricao: "Pedido de beneficio previdenciario.",
      ...usuario
    },
    contact: { id: "P", properties: {}, ...contact },
    deal: { id: "D", properties: { area_juridica: "INSS" }, ...deal },
    expectedContactId: "P", expectedDealId: "D", ...rest
  }
}

test("campo antigo preenchido nao permanece por previousPending", () => {
  const result = resolveComplementaryContext(base({ previousPending: ["cidade"] }))
  assert.equal(result.camposPendentes.includes("cidade"), false)
})

test("resposta valida nao reaparece como pendencia", () => {
  const result = resolveComplementaryContext(base({
    answered: { beneficio: { valor: "Auxilio por incapacidade", status: "confirmado" } }
  }))
  assert.equal(result.camposPendentes.includes("beneficio"), false)
})

test("resposta invalida nao elimina pendencia", () => {
  const result = resolveComplementaryContext(base({
    answered: { beneficio: { valor: "Aposentadoria", status: "invalido" } }
  }))
  assert.equal(result.camposJuridicosPendentes.includes("beneficio"), true)
})

test("INSS exige beneficio, mas nao inventa motivo sem decisao", () => {
  const result = resolveComplementaryContext(base())
  assert.equal(result.camposJuridicosPendentes.includes("beneficio"), true)
  assert.equal(result.camposJuridicosPendentes.includes("motivo"), false)
})

test("INSS exige motivo quando o relato informa indeferimento", () => {
  const result = resolveComplementaryContext(base({
    usuario: { tipoCaso: "beneficio por incapacidade indeferido", descricao: "Meu pedido foi negado." }
  }))
  assert.equal(result.camposJuridicosPendentes.includes("motivo"), true)
})

test("NB nao entra sem indicador objetivo", () => {
  assert.equal(resolveComplementaryContext(base()).camposJuridicosPendentes.includes("nb"), false)
})

test("NB aceita booleano e representacao legada Sim", () => {
  assert.equal(resolveComplementaryContext(base({ usuario: { recebeBeneficio: true } })).camposJuridicosPendentes.includes("nb"), true)
  assert.equal(resolveComplementaryContext(base({ usuario: { recebeBeneficio: "  SÍM  " } })).camposJuridicosPendentes.includes("nb"), true)
})

test("NB aceita apenas situacoes objetivas normalizadas", () => {
  for (const situacao of ["Benefício cessado", " benefício  CORTADO ", "BENEFÍCIO SUSPENSO", "beneficio revisado", "benefício concedido"]) {
    assert.equal(resolveComplementaryContext(base({ usuario: { situacao } })).camposJuridicosPendentes.includes("nb"), true, situacao)
  }
  for (const situacao of ["aposentadoria negada", "benefício em análise", "contrato", "consulta"]) {
    assert.equal(resolveComplementaryContext(base({ usuario: { situacao } })).camposJuridicosPendentes.includes("nb"), false, situacao)
  }
})

test("divergencia entre fontes exige revisao humana", () => {
  const result = resolveComplementaryContext(base({ contact: { id: "P", properties: { city: "Olinda" } } }))
  assert.equal(result.revisaoHumana, true)
  assert.deepEqual(result.divergencias.map(item => item.field), ["cidade"])
})

test("lista achatada mantem cadastral antes de juridico", () => {
  const result = resolveComplementaryContext(base({ usuario: { cidade: "" } }))
  assert.equal(result.camposCadastraisPendentes[0], "cidade")
  assert.equal(result.camposJuridicosPendentes[0], "beneficio")
  assert.equal(result.camposPendentes.indexOf("cidade") < result.camposPendentes.indexOf("beneficio"), true)
})

test("complementacao pos-humana inclui campos juridicos obrigatorios de outras areas", () => {
  const result = resolveComplementaryContext(base({
    usuario: {
      area: "Trabalhista",
      areaJuridica: "Trabalhista",
      tipoCaso: "Verbas rescisorias",
      descricao: "Contrato encerrado sem pagamento das verbas."
    },
    deal: { id: "D", properties: { area_juridica: "Trabalhista" } }
  }))
  assert.equal(result.camposJuridicosPendentes.includes("empresa"), true)
  assert.equal(result.camposJuridicosPendentes.includes("motivo"), true)
})

test("campo juridico respondido fora do INSS nao reaparece", () => {
  const result = resolveComplementaryContext(base({
    usuario: { area: "Trabalhista", areaJuridica: "Trabalhista", tipoCaso: "Verbas rescisorias" },
    deal: { id: "D", properties: { area_juridica: "Trabalhista" } },
    answered: { empresa: { valor: "Empresa Piloto Ltda", status: "confirmado" } }
  }))
  assert.equal(result.camposJuridicosPendentes.includes("empresa"), false)
})

test("fato juridico persistido no usuario continua reconhecido", () => {
  const result = resolveComplementaryContext(base({
    usuario: {
      area: "Trabalhista", areaJuridica: "Trabalhista", tipoCaso: "Verbas rescisorias",
      empresa: "Empresa Piloto Ltda", motivo: "Dispensa sem pagamento"
    },
    deal: { id: "D", properties: { area_juridica: "Trabalhista" } }
  }))
  assert.equal(result.camposJuridicosPendentes.includes("empresa"), false)
  assert.equal(result.camposJuridicosPendentes.includes("motivo"), false)
})
