"use strict"

const test = require("node:test")
const assert = require("node:assert/strict")
const { resolverContatoExistenteComCaso } = require("../src/domain/hubspot-existing-client-resolver")

test("duplicidade de telefone escolhe somente o contato que possui caso oficial", async () => {
  const resultado = await resolverContatoExistenteComCaso({
    status: "ambiguous",
    contatos: [{ id: "lead-novo" }, { id: "cliente-antigo" }]
  }, async id => id === "cliente-antigo"
    ? { casosOficiais: [{ id: "caso-1", numeroCaso: "PRV.1" }], leads: [] }
    : { casosOficiais: [], leads: [{ id: "lead-1" }] })

  assert.equal(resultado.seguro, true)
  assert.equal(resultado.contato.id, "cliente-antigo")
  assert.equal(resultado.negocios.casosOficiais[0].numeroCaso, "PRV.1")
})

test("ambiguidade real falha fechada e não escolhe contato arbitrariamente", async () => {
  const resultado = await resolverContatoExistenteComCaso({
    status: "ambiguous",
    contatos: [{ id: "a" }, { id: "b" }]
  }, async () => ({ casosOficiais: [{ id: "caso" }] }))

  assert.equal(resultado.seguro, false)
  assert.equal(resultado.contato, null)
})
