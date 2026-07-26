"use strict"

const { describe, it } = require("node:test")
const assert = require("node:assert/strict")

const {
  validarDestinatarioWhatsApp,
  validarTextoWhatsApp,
  validarOpcoesWhatsApp
} = require("../src/domain/whatsapp-transport")

const { executarComRetryHubSpot } = require("../src/utils/hubspot-retry")

describe("Correções WhatsApp Admin", () => {
  describe("validarDestinatarioWhatsApp", () => {
    it("deve rejeitar destinatário ausente", () => {
      assert.strictEqual(validarDestinatarioWhatsApp(null).valido, false)
      assert.strictEqual(validarDestinatarioWhatsApp(undefined).valido, false)
      assert.strictEqual(validarDestinatarioWhatsApp("").valido, false)
    })

    it("deve rejeitar número com poucos dígitos", () => {
      const resultado = validarDestinatarioWhatsApp("5511")
      assert.strictEqual(resultado.valido, false)
      assert.strictEqual(resultado.motivo, "quantidade_digitos_invalida")
    })

    it("deve rejeitar número sem prefixo 55", () => {
      const resultado = validarDestinatarioWhatsApp("11987654321")
      assert.strictEqual(resultado.valido, false)
      assert.strictEqual(resultado.motivo, "prefixo_esperado")
    })

    it("deve aceitar número válido brasileiro", () => {
      const resultado = validarDestinatarioWhatsApp("5511987654321")
      assert.strictEqual(resultado.valido, true)
      assert.strictEqual(resultado.numero, "5511987654321")
    })

    it("deve normalizar número válido removendo caracteres", () => {
      const resultado = validarDestinatarioWhatsApp("+55 (11) 98765-4321")
      assert.strictEqual(resultado.valido, true)
      assert.strictEqual(resultado.numero, "5511987654321")
    })
  })

  describe("validarTextoWhatsApp", () => {
    it("deve rejeitar texto null ou undefined", () => {
      assert.strictEqual(validarTextoWhatsApp(null).valido, false)
      assert.strictEqual(validarTextoWhatsApp(undefined).valido, false)
    })

    it("deve rejeitar texto vazio", () => {
      const resultado = validarTextoWhatsApp("   ")
      assert.strictEqual(resultado.valido, false)
      assert.strictEqual(resultado.motivo, "texto_vazio")
    })

    it("deve aceitar texto válido", () => {
      const resultado = validarTextoWhatsApp("Olá, bem-vindo!")
      assert.strictEqual(resultado.valido, true)
      assert.strictEqual(resultado.texto, "Olá, bem-vindo!")
    })

    it("deve converter número para string", () => {
      const resultado = validarTextoWhatsApp(123)
      assert.strictEqual(resultado.valido, true)
      assert.strictEqual(resultado.texto, "123")
    })
  })

  describe("validarOpcoesWhatsApp", () => {
    it("deve retornar vazio para array vazio", () => {
      const resultado = validarOpcoesWhatsApp([])
      assert.strictEqual(resultado.valido, true)
      assert.strictEqual(resultado.opcoes.length, 0)
    })

    it("deve filtrar opções inválidas", () => {
      const opcoes = [
        { id: "opt1", title: "Opção 1" },
        { id: "", title: "Sem ID" }, // inválida
        { id: "opt3", title: "" }, // inválida
        null, // inválida
        { id: "opt4", title: "Opção 4" }
      ]
      const resultado = validarOpcoesWhatsApp(opcoes)
      assert.strictEqual(resultado.valido, true)
      assert.strictEqual(resultado.opcoes.length, 2)
      assert.strictEqual(resultado.opcoes[0].id, "opt1")
      assert.strictEqual(resultado.opcoes[1].id, "opt4")
    })

    it("deve remover IDs duplicados", () => {
      const opcoes = [
        { id: "opt1", title: "Primeira" },
        { id: "opt1", title: "Duplicada" },
        { id: "opt2", title: "Segunda" }
      ]
      const resultado = validarOpcoesWhatsApp(opcoes)
      assert.strictEqual(resultado.opcoes.length, 2)
      assert.strictEqual(resultado.opcoes[0].title, "Primeira")
      assert.strictEqual(resultado.opcoes[1].title, "Segunda")
    })

    it("deve limitar a 10 opções", () => {
      const opcoes = Array.from({ length: 15 }, (_, i) => ({
        id: `opt${i}`,
        title: `Opção ${i}`
      }))
      const resultado = validarOpcoesWhatsApp(opcoes)
      assert.strictEqual(resultado.opcoes.length, 10)
    })

    it("deve truncar IDs e títulos longos", () => {
      const opcoes = [{
        id: "x".repeat(300),
        title: "y".repeat(150)
      }]
      const resultado = validarOpcoesWhatsApp(opcoes)
      assert.strictEqual(resultado.opcoes[0].id.length, 256)
      assert.strictEqual(resultado.opcoes[0].title.length, 100)
    })
  })

  describe("executarComRetryHubSpot", () => {
    it("deve executar função com sucesso sem retry", async () => {
      let chamadas = 0
      const fn = async () => {
        chamadas++
        return "sucesso"
      }
      const resultado = await executarComRetryHubSpot(fn, {
        maxTentativas: 3,
        idempotente: true
      })
      assert.strictEqual(resultado, "sucesso")
      assert.strictEqual(chamadas, 1)
    })

    it("deve fazer retry em erro 429", async () => {
      let chamadas = 0
      const fn = async () => {
        chamadas++
        if (chamadas < 2) {
          const erro = new Error("Rate limit")
          erro.response = { status: 429, headers: { "retry-after": "1" } }
          throw erro
        }
        return "sucesso após retry"
      }
      const resultado = await executarComRetryHubSpot(fn, {
        maxTentativas: 3,
        idempotente: true
      })
      assert.strictEqual(resultado, "sucesso após retry")
      assert.strictEqual(chamadas, 2)
    })

    it("não deve fazer retry em erro diferente de 429", async () => {
      let chamadas = 0
      const fn = async () => {
        chamadas++
        const erro = new Error("Not found")
        erro.response = { status: 404 }
        throw erro
      }
      await assert.rejects(
        async () => await executarComRetryHubSpot(fn, {
          maxTentativas: 3,
          idempotente: true
        }),
        (err) => {
          assert.strictEqual(err.message, "Not found")
          return true
        }
      )
      assert.strictEqual(chamadas, 1)
    })

    it("deve respeitar maxTentativas", async () => {
      let chamadas = 0
      const fn = async () => {
        chamadas++
        const erro = new Error("Rate limit")
        erro.response = { status: 429 }
        throw erro
      }
      await assert.rejects(
        async () => await executarComRetryHubSpot(fn, {
          maxTentativas: 2,
          idempotente: true
        })
      )
      assert.strictEqual(chamadas, 2)
    })

    it("deve rejeitar operação não idempotente com retry", async () => {
      const fn = async () => "teste"
      await assert.rejects(
        async () => await executarComRetryHubSpot(fn, {
          maxTentativas: 3,
          idempotente: false
        }),
        /nao idempotente nao pode ter retry/
      )
    })
  })
})
