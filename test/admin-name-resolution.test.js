"use strict"

const { describe, it } = require("node:test")
const assert = require("node:assert/strict")

const {
  sanitizarNomeExibicao,
  montarNomeCompletoHubSpot,
  resolverNomeParaAdmin,
  primeiroEUltimoNome
} = require("../src/domain/admin-name-resolver")

describe("Resolução de nomes para Admin", () => {
  describe("sanitizarNomeExibicao", () => {
    it("deve remover espaços extras", () => {
      assert.strictEqual(sanitizarNomeExibicao("  João  Silva  "), "João  Silva")
    })

    it("deve rejeitar valores genéricos", () => {
      assert.strictEqual(sanitizarNomeExibicao("Cliente"), "")
      assert.strictEqual(sanitizarNomeExibicao("cliente"), "")
      assert.strictEqual(sanitizarNomeExibicao("Usuário"), "")
      assert.strictEqual(sanitizarNomeExibicao("WhatsApp"), "")
    })

    it("deve rejeitar apenas números", () => {
      assert.strictEqual(sanitizarNomeExibicao("5511987654321"), "")
      assert.strictEqual(sanitizarNomeExibicao("+55 11 98765-4321"), "")
    })

    it("deve rejeitar valores muito curtos", () => {
      assert.strictEqual(sanitizarNomeExibicao("A"), "")
      assert.strictEqual(sanitizarNomeExibicao(""), "")
    })

    it("deve aceitar nomes válidos", () => {
      assert.strictEqual(sanitizarNomeExibicao("João Silva"), "João Silva")
      assert.strictEqual(sanitizarNomeExibicao("Maria"), "Maria")
    })
  })

  describe("montarNomeCompletoHubSpot", () => {
    it("deve combinar firstname e lastname", () => {
      const contato = {
        properties: {
          firstname: "João",
          lastname: "Silva"
        }
      }
      assert.strictEqual(montarNomeCompletoHubSpot(contato), "João Silva")
    })

    it("deve retornar apenas firstname se lastname ausente", () => {
      const contato = {
        properties: {
          firstname: "Maria"
        }
      }
      assert.strictEqual(montarNomeCompletoHubSpot(contato), "Maria")
    })

    it("deve retornar apenas lastname se firstname ausente", () => {
      const contato = {
        properties: {
          lastname: "Santos"
        }
      }
      assert.strictEqual(montarNomeCompletoHubSpot(contato), "Santos")
    })

    it("deve retornar vazio se ambos ausentes", () => {
      const contato = {
        properties: {}
      }
      assert.strictEqual(montarNomeCompletoHubSpot(contato), "")
    })

    it("deve rejeitar valores genéricos no HubSpot", () => {
      const contato = {
        properties: {
          firstname: "Cliente"
        }
      }
      assert.strictEqual(montarNomeCompletoHubSpot(contato), "")
    })
  })

  describe("resolverNomeParaAdmin", () => {
    it("deve priorizar nome declarado e confirmado", () => {
      const item = {
        contato: {
          properties: {
            firstname: "João",
            lastname: "Silva"
          }
        },
        u: {
          nomeConfirmado: true,
          nome: "Outro Nome",
          nomeWA: "Apelido",
          nomePerfilWhatsApp: "Nome WhatsApp"
        }
      }
      assert.strictEqual(resolverNomeParaAdmin(item), "Outro Nome")
    })

    it("deve usar nome confirmado quando HubSpot não existe", () => {
      const item = {
        contato: null,
        u: {
          nomeConfirmado: true,
          nome: "Maria Santos",
          nomeWA: "Mari",
          nomePerfilWhatsApp: "Maria"
        }
      }
      assert.strictEqual(resolverNomeParaAdmin(item), "Maria Santos")
    })

    it("deve usar nomeHubspot da sessão quando não tem contato", () => {
      const item = {
        contato: null,
        u: {
          nomeConfirmado: false,
          nomeHubspot: "Pedro Oliveira",
          nomeWA: "Pedrinho",
          nomePerfilWhatsApp: "Pedro"
        }
      }
      assert.strictEqual(resolverNomeParaAdmin(item), "Pedro Oliveira")
    })

    it("deve usar nome do perfil WhatsApp quando completo", () => {
      const item = {
        contato: null,
        u: {
          nomeWA: "Ana",
          nomePerfilWhatsApp: "Ana Paula Costa"
        }
      }
      assert.strictEqual(resolverNomeParaAdmin(item), "Ana Paula Costa")
    })

    it("deve usar nomeWA quando é o único disponível", () => {
      const item = {
        contato: null,
        u: {
          nomeWA: "Carlos"
        }
      }
      assert.strictEqual(resolverNomeParaAdmin(item), "Carlos")
    })

    it("deve retornar Cliente quando todas as fontes falharem", () => {
      const item = {
        contato: null,
        u: {}
      }
      assert.strictEqual(resolverNomeParaAdmin(item), "Cliente")
    })

    it("não deve substituir nome válido por genérico", () => {
      const item = {
        contato: {
          properties: {
            firstname: "Cliente"
          }
        },
        u: {
          nomeWA: "Roberto Silva"
        }
      }
      assert.strictEqual(resolverNomeParaAdmin(item), "Roberto Silva")
    })
  })

  describe("primeiroEUltimoNome", () => {
    it("deve retornar primeiro e último nome", () => {
      assert.strictEqual(primeiroEUltimoNome("João Pedro Silva Santos"), "João Santos")
    })

    it("deve retornar nome único sem modificar", () => {
      assert.strictEqual(primeiroEUltimoNome("Maria"), "Maria")
    })

    it("deve retornar Cliente para string vazia", () => {
      assert.strictEqual(primeiroEUltimoNome(""), "Cliente")
      assert.strictEqual(primeiroEUltimoNome("   "), "Cliente")
    })

    it("deve lidar com dois nomes", () => {
      assert.strictEqual(primeiroEUltimoNome("Ana Paula"), "Ana Paula")
    })
  })
})
