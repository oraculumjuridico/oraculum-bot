"use strict"

const { describe, it } = require("node:test")
const assert = require("node:assert/strict")

const {
  validarNomePerfilWhatsApp,
  montarNomeCompletoHubSpot,
  resolverNomeUnificado
} = require("../src/domain/admin-name-resolver")

describe("Resolução de nomes no fluxo do bot", () => {
  describe("validarNomePerfilWhatsApp", () => {
    it("deve aceitar nome válido do perfil", () => {
      const resultado = validarNomePerfilWhatsApp("João Silva")
      assert.strictEqual(resultado.valido, true)
      assert.strictEqual(resultado.nome, "João Silva")
    })

    it("deve aceitar nome simples", () => {
      const resultado = validarNomePerfilWhatsApp("Maria")
      assert.strictEqual(resultado.valido, true)
      assert.strictEqual(resultado.nome, "Maria")
    })

    it("deve rejeitar valores genéricos", () => {
      const resultado = validarNomePerfilWhatsApp("Cliente")
      assert.strictEqual(resultado.valido, false)
      assert.strictEqual(resultado.nome, "")
    })

    it("deve rejeitar apenas números", () => {
      const resultado = validarNomePerfilWhatsApp("5511987654321")
      assert.strictEqual(resultado.valido, false)
      assert.strictEqual(resultado.nome, "")
    })

    it("deve rejeitar valores muito curtos", () => {
      const resultado = validarNomePerfilWhatsApp("A")
      assert.strictEqual(resultado.valido, false)
      assert.strictEqual(resultado.nome, "")
    })

    it("deve sanitizar espaços extras", () => {
      const resultado = validarNomePerfilWhatsApp("  João  Silva  ")
      assert.strictEqual(resultado.valido, true)
      assert.strictEqual(resultado.nome, "João  Silva")
    })
  })

  describe("montarNomeCompletoHubSpot", () => {
    it("deve combinar firstname e lastname corretamente", () => {
      const contato = {
        properties: {
          firstname: "João",
          lastname: "Silva Santos"
        }
      }
      assert.strictEqual(montarNomeCompletoHubSpot(contato), "João Silva Santos")
    })

    it("deve retornar apenas firstname quando lastname ausente", () => {
      const contato = {
        properties: {
          firstname: "Maria"
        }
      }
      assert.strictEqual(montarNomeCompletoHubSpot(contato), "Maria")
    })

    it("deve retornar vazio quando ambos ausentes", () => {
      const contato = {
        properties: {}
      }
      assert.strictEqual(montarNomeCompletoHubSpot(contato), "")
    })

    it("deve lidar com contato null", () => {
      assert.strictEqual(montarNomeCompletoHubSpot(null), "")
    })
  })

  describe("resolverNomeUnificado - ordem de prioridade", () => {
    it("deve priorizar nome completo do HubSpot", () => {
      const contato = {
        properties: {
          firstname: "João",
          lastname: "Silva"
        }
      }
      const u = {
        nomeConfirmado: true,
        nome: "José Santos",
        nomeHubspot: "Antônio Costa",
        nomeWA: "Ze",
        nomePerfilWhatsApp: "José S"
      }
      const resultado = resolverNomeUnificado({ contato, u })
      assert.strictEqual(resultado.nome, "João Silva")
      assert.strictEqual(resultado.origem, "hubspot")
    })

    it("deve usar nome da sessão HubSpot quando contato não disponível", () => {
      const u = {
        nomeConfirmado: false,
        nomeHubspot: "Maria Santos",
        nomeWA: "Mari",
        nomePerfilWhatsApp: "Maria S"
      }
      const resultado = resolverNomeUnificado({ contato: null, u })
      assert.strictEqual(resultado.nome, "Maria Santos")
      assert.strictEqual(resultado.origem, "persisted_session")
    })

    it("deve usar nome confirmado quando HubSpot não tem nome", () => {
      const contato = {
        properties: {}
      }
      const u = {
        nomeConfirmado: true,
        nome: "Carlos Eduardo",
        nomeWA: "Cadu",
        nomePerfilWhatsApp: "Carlos E"
      }
      const resultado = resolverNomeUnificado({ contato, u })
      assert.strictEqual(resultado.nome, "Carlos Eduardo")
      assert.strictEqual(resultado.origem, "confirmed_intake")
    })

    it("deve usar nome do perfil WhatsApp quando não tem HubSpot nem confirmado", () => {
      const u = {
        nomeConfirmado: false,
        nomeWA: "Ana",
        nomePerfilWhatsApp: "Ana Paula Silva"
      }
      const resultado = resolverNomeUnificado({ 
        contato: null, 
        u,
        nomePerfilWhatsApp: "Ana Paula Silva"
      })
      assert.strictEqual(resultado.nome, "Ana Paula Silva")
      assert.strictEqual(resultado.origem, "whatsapp_profile")
    })

    it("deve usar nomeWA quando perfil não válido", () => {
      const u = {
        nomeConfirmado: false,
        nomeWA: "Roberto",
        nomePerfilWhatsApp: "R"
      }
      const resultado = resolverNomeUnificado({ contato: null, u })
      assert.strictEqual(resultado.nome, "Roberto")
      assert.strictEqual(resultado.origem, "whatsapp_profile")
    })

    it("deve usar fallback Cliente quando todas fontes falham", () => {
      const u = {
        nomeConfirmado: false,
        nomeWA: "",
        nomePerfilWhatsApp: "123"
      }
      const resultado = resolverNomeUnificado({ contato: null, u })
      assert.strictEqual(resultado.nome, "Cliente")
      assert.strictEqual(resultado.origem, "fallback")
    })

    it("não deve usar nome confirmado se flag nomeConfirmado é false", () => {
      const u = {
        nomeConfirmado: false,
        nome: "Pedro Souza",
        nomePerfilWhatsApp: "Pedro S"
      }
      const resultado = resolverNomeUnificado({ contato: null, u })
      assert.strictEqual(resultado.nome, "Pedro S")
      assert.strictEqual(resultado.origem, "whatsapp_profile")
    })
  })

  describe("resolverNomeUnificado - casos especiais", () => {
    it("deve lidar com sessão vazia", () => {
      const resultado = resolverNomeUnificado({ contato: null, u: {} })
      assert.strictEqual(resultado.nome, "Cliente")
      assert.strictEqual(resultado.origem, "fallback")
    })

    it("deve lidar com valores null", () => {
      const resultado = resolverNomeUnificado({ contato: null, u: null })
      assert.strictEqual(resultado.nome, "Cliente")
      assert.strictEqual(resultado.origem, "fallback")
    })

    it("deve ignorar nomes genéricos do HubSpot", () => {
      const contato = {
        properties: {
          firstname: "Cliente"
        }
      }
      const u = {
        nomePerfilWhatsApp: "Laura Oliveira"
      }
      const resultado = resolverNomeUnificado({ contato, u })
      assert.strictEqual(resultado.nome, "Laura Oliveira")
      assert.strictEqual(resultado.origem, "whatsapp_profile")
    })

    it("deve preservar acentos e caracteres especiais", () => {
      const contato = {
        properties: {
          firstname: "José",
          lastname: "Gonçalves"
        }
      }
      const resultado = resolverNomeUnificado({ contato, u: {} })
      assert.strictEqual(resultado.nome, "José Gonçalves")
    })
  })

  describe("integração webhook + persistência + resolução", () => {
    it("deve capturar nome do perfil WhatsApp corretamente", () => {
      // Simular captura do webhook
      const webhookContact = {
        profile: {
          name: "Fernanda Costa Lima"
        },
        wa_id: "5511987654321"
      }
      
      const nomeCapturado = webhookContact.profile.name
      const { valido, nome } = validarNomePerfilWhatsApp(nomeCapturado)
      
      assert.strictEqual(valido, true)
      assert.strictEqual(nome, "Fernanda Costa Lima")
    })

    it("deve persistir e restaurar nomePerfilWhatsApp", () => {
      // Simular sessão com nome do perfil
      const sessaoOriginal = {
        nomeWA: "Fer",
        nomePerfilWhatsApp: "Fernanda Costa",
        nomeConfirmado: false
      }
      
      // Serializar (simulando persistência)
      const serializado = JSON.stringify(sessaoOriginal)
      const restaurado = JSON.parse(serializado)
      
      // Resolver nome após restauração
      const resultado = resolverNomeUnificado({ contato: null, u: restaurado })
      assert.strictEqual(resultado.nome, "Fernanda Costa")
      assert.strictEqual(resultado.origem, "whatsapp_profile")
    })

    it("deve priorizar nome HubSpot mesmo com perfil disponível", () => {
      // Cenário: usuário já existe no HubSpot
      const contato = {
        properties: {
          firstname: "Fernanda",
          lastname: "Costa Lima"
        }
      }
      
      const u = {
        nomePerfilWhatsApp: "Fer Costa",
        nomeWA: "Fer",
        nomeConfirmado: false
      }
      
      const resultado = resolverNomeUnificado({ contato, u })
      assert.strictEqual(resultado.nome, "Fernanda Costa Lima")
      assert.strictEqual(resultado.origem, "hubspot")
    })
  })
})
