"use strict"

const assert = require("node:assert/strict")
const {
  HUBSPOT_URGENCY_PROPERTY,
  HUBSPOT_URGENCY_HIGH,
  normalizarUrgenciaHubSpotAdmin,
  resolverUrgenciaAdmin,
  persistirUrgenciaAltaAdmin
} = require("../src/domain/admin-urgency")

function criarItem() {
  return {
    u: {
      nome: "Cliente Teste",
      numeroCaso: "CASE-001",
      contatoId: "contact-1",
      negocioId: "deal-1",
      urgencia: "normal"
    }
  }
}

async function main() {
  assert.equal(HUBSPOT_URGENCY_PROPERTY, "urgencia")
  assert.equal(HUBSPOT_URGENCY_HIGH, "Alta")
  assert.equal(normalizarUrgenciaHubSpotAdmin("Alta"), "alta")
  assert.equal(normalizarUrgenciaHubSpotAdmin("Moderada"), "normal")
  assert.equal(normalizarUrgenciaHubSpotAdmin("Baixa"), "baixa")

  const itemSucesso = criarItem()
  const atualizacoes = []
  const notas = []
  const sucesso = await persistirUrgenciaAltaAdmin({
    item: itemSucesso,
    atualizarNegocio: async (id, props) => {
      atualizacoes.push({ id, props })
      return id
    },
    criarNotaContato: async (id, titulo, corpo) => {
      notas.push({ tipo: "contato", id, titulo, corpo })
      return true
    },
    criarNotaNegocio: async (id, titulo, corpo) => {
      notas.push({ tipo: "negocio", id, titulo, corpo })
      return true
    },
    gerarBriefing: () => ({ proximaAcao: "revisar agora" })
  })
  assert.equal(sucesso.persisted, true)
  assert.equal(sucesso.notesComplete, true)
  assert.deepEqual(sucesso.noteFailures, [])
  assert.equal(itemSucesso.u.urgencia, "alta")
  assert.deepEqual(atualizacoes, [{ id: "deal-1", props: { urgencia: "Alta" } }])
  assert.equal(notas.length, 2)
  assert.ok(notas.every(nota => nota.titulo === "CASO MARCADO URGENTE"))
  assert.ok(notas.every(nota => nota.corpo.includes("Proxima acao: revisar agora")))

  const itemFalha = criarItem()
  let notasNaFalha = 0
  const falha = await persistirUrgenciaAltaAdmin({
    item: itemFalha,
    atualizarNegocio: async () => null,
    criarNotaContato: async () => { notasNaFalha += 1; return true },
    criarNotaNegocio: async () => { notasNaFalha += 1; return true }
  })
  assert.equal(falha.persisted, false)
  assert.equal(falha.reason, "hubspot_update_failed")
  assert.equal(itemFalha.u.urgencia, "normal")
  assert.equal(notasNaFalha, 0)

  const itemFalhaNotaContato = criarItem()
  let notaNegocioAposFalhaContato = 0
  const falhaNotaContato = await persistirUrgenciaAltaAdmin({
    item: itemFalhaNotaContato,
    atualizarNegocio: async id => id,
    criarNotaContato: async () => {
      throw new Error("falha simulada na nota do contato")
    },
    criarNotaNegocio: async () => {
      notaNegocioAposFalhaContato += 1
      return true
    }
  })
  assert.equal(falhaNotaContato.persisted, true)
  assert.equal(itemFalhaNotaContato.u.urgencia, "alta")
  assert.equal(falhaNotaContato.notaContato, false)
  assert.equal(falhaNotaContato.notaNegocio, true)
  assert.equal(falhaNotaContato.notesComplete, false)
  assert.deepEqual(falhaNotaContato.noteFailures, ["contact_note_exception"])
  assert.equal(notaNegocioAposFalhaContato, 1)

  const itemFalhaNotaNegocio = criarItem()
  const falhaNotaNegocio = await persistirUrgenciaAltaAdmin({
    item: itemFalhaNotaNegocio,
    atualizarNegocio: async id => id,
    criarNotaContato: async () => true,
    criarNotaNegocio: async () => {
      throw new Error("falha simulada na nota do negócio")
    }
  })
  assert.equal(falhaNotaNegocio.persisted, true)
  assert.equal(itemFalhaNotaNegocio.u.urgencia, "alta")
  assert.equal(falhaNotaNegocio.notaContato, true)
  assert.equal(falhaNotaNegocio.notaNegocio, false)
  assert.equal(falhaNotaNegocio.notesComplete, false)
  assert.deepEqual(falhaNotaNegocio.noteFailures, ["deal_note_exception"])

  const itemNotasFalsas = criarItem()
  const notasFalsas = await persistirUrgenciaAltaAdmin({
    item: itemNotasFalsas,
    atualizarNegocio: async id => id,
    criarNotaContato: async () => false,
    criarNotaNegocio: async () => false
  })
  assert.equal(notasFalsas.persisted, true)
  assert.equal(notasFalsas.notaContato, false)
  assert.equal(notasFalsas.notaNegocio, false)
  assert.equal(notasFalsas.notesComplete, false)
  assert.deepEqual(notasFalsas.noteFailures, [
    "contact_note_returned_false",
    "deal_note_returned_false"
  ])

  const itemRetry = criarItem()
  let tentativas = 0
  let notasNoRetry = 0
  const depsRetry = {
    item: itemRetry,
    atualizarNegocio: async (id, props) => {
      tentativas += 1
      assert.equal(id, "deal-1")
      assert.deepEqual(props, { urgencia: "Alta" })
      return tentativas === 1 ? null : id
    },
    criarNotaContato: async () => { notasNoRetry += 1; return true },
    criarNotaNegocio: async () => { notasNoRetry += 1; return true }
  }
  const primeiraTentativa = await persistirUrgenciaAltaAdmin(depsRetry)
  assert.equal(primeiraTentativa.persisted, false)
  assert.equal(itemRetry.u.urgencia, "normal")
  const segundaTentativa = await persistirUrgenciaAltaAdmin(depsRetry)
  assert.equal(segundaTentativa.persisted, true)
  assert.equal(itemRetry.u.urgencia, "alta")
  assert.equal(tentativas, 2)
  assert.equal(notasNoRetry, 2)

  const itemRelido = {
    properties: { urgencia: segundaTentativa.hubspotValue },
    snapshot: { urgencia: "normal" }
  }
  assert.equal(normalizarUrgenciaHubSpotAdmin(itemRelido.properties.urgencia), "alta")
  assert.equal(resolverUrgenciaAdmin({
    hubspot: itemRelido.properties.urgencia,
    snapshot: itemRelido.snapshot.urgencia,
    local: "baixa"
  }), "alta")

  console.log("admin-urgency.test.js: ok")
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
