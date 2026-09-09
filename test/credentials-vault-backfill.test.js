"use strict"

const test = require("node:test")
const assert = require("node:assert/strict")
const { planejarCofresCasosAtivos } = require("../src/domain/credentials-vault-backfill")

test("seleciona somente negócios ativos com número de caso", () => {
  const finalStage = "final"
  const ativo = { id: "1", properties: { dealstage: "analise", numero_de_caso: "PRV.1" } }
  const resultado = planejarCofresCasosAtivos([
    ativo,
    { id: "2", properties: { dealstage: finalStage, numero_de_caso: "PRV.2" } },
    { id: "3", properties: { dealstage: "lead" } },
    { id: "4", properties: { numero_de_caso: "PRV.4" } },
    ativo
  ], finalStage)

  assert.deepEqual(resultado.map(item => item.id), ["1"])
})
