"use strict"

const assert = require("node:assert/strict")
const { textoResumoDiarioOperacional } = require("../src/domain/admin-summary-ui")

function item({ nome, numeroCaso, docs = 0, motivo = "Revisar caso", acao = "Analisar informações." }) {
  return {
    u: { negocioId: numeroCaso },
    briefing: {
      nome,
      numeroCaso,
      area: "INSS",
      stageLabel: "Em análise",
      proximaAcao: acao,
      documentos: { faltantesCriticos: Array.from({ length: docs }, (_, index) => `doc-${index}`) }
    },
    alertas: [{ texto: motivo }]
  }
}

const prioridade = item({ nome: "Jesaías Belmiro Leite Mendes", numeroCaso: "PRV.001", docs: 3 })
const documento = item({ nome: "Sadraque Luis de Araujo", numeroCaso: "PRV.002", docs: 5 })
const texto = textoResumoDiarioOperacional({
  totais: {
    casosClientes: 2,
    consultasAtivas: 0,
    emAnalise: 2,
    documentosPendentes: 2,
    alertasUrgentes: 1,
    preAtendimentos: 0
  },
  filas: {
    proximasAcoes: [prioridade],
    documentosComplementares: [documento]
  }
})

assert.match(texto, /Jesaías Mendes/)
assert.match(texto, /Sadraque Araujo/)
assert.equal((texto.match(/PRV\.001/g) || []).length, 1)
assert.equal((texto.match(/PRV\.002/g) || []).length, 1)
assert.match(texto, /5 documento\(s\) crítico\(s\) pendente\(s\)/)
assert.doesNotMatch(texto, /Validação técnica|Itens analisados|Fonte:|Recentes|Alertas operacionais/)

console.log("admin-summary-operational.test.js: ok")
