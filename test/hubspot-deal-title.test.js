const assert = require("assert")

const {
  siglaAreaNegocio,
  montarTituloNegocioHubSpot,
  aplicarTituloNegocioHubSpot
} = require("../src/domain/hubspot-deal-title")

const HS_STAGE = {
  LEAD: "appointmentscheduled",
  CADASTRO: "qualifiedtobuy",
  ANALISE: "presentationscheduled",
  AGUARDANDO_DOCS: "decisionmakerboughtin",
  DOCS: "contractsent",
  PROTOCOLO: "1343040098",
  PROCESSO: "1337291921",
  FINAL: "1343039663"
}

function main() {
  assert.equal(siglaAreaNegocio("Previdenciário"), "Prv")
  assert.equal(siglaAreaNegocio("Trabalhista"), "Trb")
  assert.equal(siglaAreaNegocio("Consumidor"), "Cns")
  assert.equal(siglaAreaNegocio("Família"), "Fam")
  assert.equal(siglaAreaNegocio("Bancário"), "Bnc")
  assert.equal(siglaAreaNegocio("Cível"), "Civ")

  assert.equal(
    montarTituloNegocioHubSpot({
      area: "Previdenciário",
      numeroCaso: "2026-00125",
      negocioStageId: HS_STAGE.LEAD
    }, { HS_STAGE }),
    "🟢 Prv-2026-00125"
  )

  assert.equal(
    montarTituloNegocioHubSpot({
      area: "Trabalhista",
      stage: "inicio"
    }, { HS_STAGE, stage: HS_STAGE.LEAD }),
    "⚪ LF-Trb"
  )

  assert.equal(
    montarTituloNegocioHubSpot({
      area: "Consumidor",
      temperatura: "morno"
    }, { HS_STAGE, stage: HS_STAGE.CADASTRO }),
    "🟡 LM-Cns"
  )

  assert.equal(
    montarTituloNegocioHubSpot({
      area: "Bancário",
      temperatura: "quente"
    }, { HS_STAGE, stage: HS_STAGE.CADASTRO }),
    "🟠 LQ-Bnc"
  )

  assert.deepEqual(
    aplicarTituloNegocioHubSpot(
      { area: "Civil", numeroCaso: "CIV.260710.001" },
      { dealstage: HS_STAGE.ANALISE, area_juridica: "Família" },
      { HS_STAGE }
    ),
    {
      dealstage: HS_STAGE.ANALISE,
      area_juridica: "Família",
      dealname: "🟢 Fam-CIV.260710.001"
    }
  )

  console.log("hubspot-deal-title.test.js ok")
}

main()
