const { describe, it } = require("node:test")
const assert = require("node:assert")
const {
  normalizarAnaliseIA,
  criarAnaliseFallback
} = require("../src/domain/admin-assisted-ai-intelligence")

describe("desambiguação INSS vs Trabalhista", () => {
  it("IA retorna Trabalhista para cenário ambíguo com auxílio-doença negado pelo INSS → INSS", () => {
    const resultado = normalizarAnaliseIA({
      confianca: 0.9,
      dados: {
        areaJuridica: { valor: "Trabalhista", status: "confirmado" }
      }
    }, "O cliente está afastado do trabalho por problemas de saúde. O pedido de auxílio-doença foi negado pelo INSS. Ele possui exames e laudos médicos recentes e deseja recorrer ou ingressar com ação para obter o benefício.")
    assert.strictEqual(resultado.areaJuridica, "INSS")
    assert.strictEqual(resultado.dados.areaJuridica.valor, "INSS")
    assert.strictEqual(resultado.dados.areaJuridica.status, "precisa_conferir")
  })

  it("IA retorna Trabalhista para caso trabalhista puro com menção incidental a INSS → permanece Trabalhista", () => {
    const resultado = normalizarAnaliseIA({
      confianca: 0.9,
      dados: {
        areaJuridica: { valor: "Trabalhista", status: "confirmado" }
      }
    }, "A empresa não pagou a rescisão e também não recolheu o INSS dos funcionários.")
    assert.strictEqual(resultado.areaJuridica, "Trabalhista")
    assert.strictEqual(resultado.dados.areaJuridica.valor, "Trabalhista")
  })

  it("IA retorna Trabalhista para INSS negou benefício após demissão → INSS", () => {
    const resultado = normalizarAnaliseIA({
      confianca: 0.9,
      dados: {
        areaJuridica: { valor: "Trabalhista", status: "confirmado" }
      }
    }, "INSS negou benefício após demissão. O cliente quer recorrer.")
    assert.strictEqual(resultado.areaJuridica, "INSS")
    assert.strictEqual(resultado.dados.areaJuridica.valor, "INSS")
    assert.strictEqual(resultado.dados.areaJuridica.status, "precisa_conferir")
  })

  it("fallback sem IA com cenário ambíguo → INSS", () => {
    const resultado = criarAnaliseFallback("O cliente está afastado do trabalho por problemas de saúde. O pedido de auxílio-doença foi negado pelo INSS. Ele possui exames e laudos médicos recentes e deseja recorrer ou ingressar com ação para obter o benefício.")
    assert.strictEqual(resultado.areaJuridica, "INSS")
  })
})
