"use strict"

const test = require("node:test")
const assert = require("node:assert/strict")
const { searchAdminCases, buildCaseComplement, applyComplementLocally, scheduleAdminCase } = require("../src/domain/admin-case-operations")

const cases = [
  { from: "5581999990000", u: { nome: "Pessoa Alfa", cpf: "52998224725", whatsappContato: "5581999990000", numeroCaso: "CIV.001", contatoId: "c1", negocioId: "d1" } },
  { from: "5581888880000", u: { nome: "Pessoa Beta", cpf: "11144477735", whatsappContato: "5581888880000", numeroCaso: "TRAB.002", contatoId: "c2", negocioId: "d2" } },
  { from: "5581777770000", u: { nome: "Pessoa Alfa", cpf: "93541134780", whatsappContato: "5581777770000", numeroCaso: "CIV.003", contatoId: "c3", negocioId: "d3" } }
]

test("consulta por protocolo, nome, CPF e telefone retorna somente correspondências mascaradas", () => {
  assert.deepEqual(searchAdminCases(cases, "TRAB.002").map(x => x.dealId), ["d2"])
  assert.deepEqual(searchAdminCases(cases, "529.982.247-25").map(x => x.dealId), ["d1"])
  assert.deepEqual(searchAdminCases(cases, "5581888880000").map(x => x.dealId), ["d2"])
  const ambiguos = searchAdminCases(cases, "Pessoa Alfa")
  assert.deepEqual(ambiguos.map(x => x.dealId), ["d1", "d3"])
  const serialized = JSON.stringify(ambiguos)
  assert.doesNotMatch(serialized, /52998224725|93541134780|5581999990000|5581777770000/)
  assert.match(serialized, /\*\*\*\d{4}/)
  assert.equal(serialized.includes("Pessoa Beta"), false)
})

test("complementação altera um campo, preserva os demais e não cria Contato ou Negócio", () => {
  const usuario = { ...cases[0].u, cidade: "Recife", uf: "PE", descricao: "Descrição original" }
  const operation = buildCaseComplement({ usuario, campo: "cidade", valor: "Olinda", adminId: "admin-synthetic", now: "2026-08-01T12:00:00.000Z" })
  const before = { ...usuario }
  applyComplementLocally(usuario, operation)
  assert.equal(usuario.cidade, "Olinda")
  assert.equal(usuario.uf, before.uf)
  assert.equal(usuario.descricao, before.descricao)
  assert.equal(usuario.contatoId, before.contatoId)
  assert.equal(usuario.negocioId, before.negocioId)
  assert.equal(operation.createsContact, false)
  assert.equal(operation.createsDeal, false)
  assert.deepEqual(operation.contactPatch, { cidade: "Olinda" })
  assert.deepEqual(operation.dealPatch, {})
  assert.equal(usuario.adminUpdateHistory.length, 1)
})

test("complementação rejeita ausência, placeholder e CPF inválido sem apagar valor", () => {
  const usuario = { ...cases[0].u, email: "preservado@example.test" }
  for (const valor of ["", "não informado", "123.456.789-00"]) {
    assert.throws(() => buildCaseComplement({ usuario, campo: valor.includes("123") ? "cpf" : "email", valor, adminId: "admin" }))
  }
  assert.equal(usuario.email, "preservado@example.test")
  assert.equal(usuario.cpf, "52998224725")
})

test("agendamento só confirma com eventId e indisponibilidade gera pendência humana", async () => {
  let externalCalls = 0
  const unavailable = await scheduleAdminCase({ usuario: cases[0].u, dataHora: "2026-08-10T13:00:00.000Z" })
  assert.equal(unavailable.ok, false)
  assert.equal(unavailable.pendingHuman, true)
  assert.equal(unavailable.message, "Solicitação registrada, aguardando confirmação")
  assert.equal(externalCalls, 0)

  const noId = await scheduleAdminCase({
    usuario: cases[0].u,
    dataHora: "2026-08-10T13:00:00.000Z",
    createEvent: async () => { externalCalls += 1; return null }
  })
  assert.equal(noId.ok, false)
  assert.equal(noId.message, "Solicitação registrada, aguardando confirmação")

  const confirmed = await scheduleAdminCase({
    usuario: cases[0].u,
    dataHora: "2026-08-10T13:00:00.000Z",
    createEvent: async () => { externalCalls += 1; return "event-synthetic" }
  })
  assert.equal(confirmed.ok, true)
  assert.equal(confirmed.eventId, "event-synthetic")
})
