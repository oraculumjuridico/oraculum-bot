"use strict"

const assert = require("node:assert/strict")
const axios = require("axios")
const {
  configurarHubSpotSync,
  hsBuscarNegociosComCasoDoContato,
  leadIncompletoRetomavel,
  selecionarLeadRetomavel,
  hsMoverStageSeguro
} = require("../src/domain/hubspot-sync")

const HS_STAGE = {
  LEAD: "lead",
  CADASTRO: "cadastro",
  ANALISE: "analise",
  AGUARDANDO_DOCS: "aguardando_docs",
  DOCS: "docs",
  AGENDAMENTO: "agendamento",
  PROTOCOLO: "protocolo",
  PROCESSO: "processo",
  FINAL: "final"
}

configurarHubSpotSync({ HS_STAGE })

const originalGet = axios.get

async function main() {
  const agora = new Date("2026-10-11T12:00:00.000Z").getTime()
  const recente = { properties: { hs_lastmodifieddate: "2026-09-12T12:00:00.000Z" } }
  const limite = { properties: { hs_lastmodifieddate: "2026-09-11T12:00:00.000Z" } }
  const antigo = { properties: { hs_lastmodifieddate: "2026-09-10T11:59:59.999Z" } }
  assert.equal(leadIncompletoRetomavel(recente, agora), true)
  assert.equal(leadIncompletoRetomavel(limite, agora), true)
  assert.equal(leadIncompletoRetomavel(antigo, agora), false)
  assert.equal(selecionarLeadRetomavel([antigo, limite, recente], agora), recente)
  assert.equal(await hsMoverStageSeguro("deal-1", HS_STAGE.ANALISE, HS_STAGE.DOCS, false), false)
  assert.equal(await hsMoverStageSeguro("deal-1", HS_STAGE.ANALISE, HS_STAGE.PROTOCOLO, false), false)

  axios.get = async url => {
    if (url.includes("/associations/deals")) {
      return { data: { results: [{ id: "ativo" }, { id: "final" }, { id: "lead" }] } }
    }
    if (url.includes("/ativo?")) {
      return { data: { id: "ativo", properties: { dealstage: "analise", numero_de_caso: "PRV.ATIVO", dealname: "Caso ativo" } } }
    }
    if (url.includes("/final?")) {
      return { data: { id: "final", properties: { dealstage: "final", numero_de_caso: "PRV.FINAL", dealname: "Caso finalizado" } } }
    }
    return {
      data: {
        id: "lead",
        properties: {
          dealstage: "lead",
          dealname: "Lead recente",
          hs_lastmodifieddate: "2026-10-01T12:00:00.000Z"
        }
      }
    }
  }

  try {
    const resultado = await hsBuscarNegociosComCasoDoContato("contact-1")
    assert.deepEqual(resultado.casosOficiais.map(caso => caso.id), ["ativo", "final"])
    assert.deepEqual(resultado.casosAtivos.map(caso => caso.id), ["ativo"])
    assert.deepEqual(resultado.casosFinalizados.map(caso => caso.id), ["final"])
    assert.deepEqual(resultado.leads.map(caso => caso.id), ["lead"])
  } finally {
    axios.get = originalGet
  }

  console.log("hubspot-case-lifecycle-routing.test.js: ok")
}

main().catch(error => {
  axios.get = originalGet
  console.error(error)
  process.exitCode = 1
})
