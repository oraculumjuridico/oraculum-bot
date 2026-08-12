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
    "🟢 Prv-2026-00125 - Demanda Previdenciária"
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
      dealname: "🟢 CIV.260710.001 - Direito de Família"
    }
  )

  assert.equal(
    montarTituloNegocioHubSpot({ area: "INSS", numeroCaso: "PRV.260714.707", tipo_de_caso: "inss_incapacidade" }),
    "🟢 PRV.260714.707 - Benefício por Incapacidade"
  )
  assert.equal(
    montarTituloNegocioHubSpot({ area: "INSS", numeroCaso: "PRV.260714.707" }).includes("Prv-PRV"),
    false
  )
  assert.equal(
    montarTituloNegocioHubSpot({ area: "INSS", numeroCaso: "PRV.260725.427", tipo_de_caso: "inss_bpc" }),
    "🟢 PRV.260725.427 - BPC LOAS"
  )
  assert.equal(
    montarTituloNegocioHubSpot({ area: "INSS", numeroCaso: "PRV.260725.428", tipo_de_caso: "inss_bpc", subtipo: "bpc_idoso" }),
    "🟢 PRV.260725.428 - BPC LOAS Idoso"
  )
  assert.equal(
    montarTituloNegocioHubSpot({ area: "INSS", numeroCaso: "PRV.260725.429", tipo_de_caso: "inss_bpc", subtipo: "bpc_deficiencia" }),
    "🟢 PRV.260725.429 - BPC LOAS Deficiência"
  )
  assert.equal(
    montarTituloNegocioHubSpot({ area: "INSS", numeroCaso: "PRV.260725.430", tipo_de_caso: "inss_incapacidade", subtipo: "incapacidade_temporaria" }),
    "🟢 PRV.260725.430 - Auxílio por Incapacidade Temporária"
  )
  assert.equal(
    montarTituloNegocioHubSpot({ area: "INSS", numeroCaso: "PRV.260725.431", tipo_de_caso: "inss_incapacidade", subtipo: "incapacidade_permanente" }),
    "🟢 PRV.260725.431 - Aposentadoria por Incapacidade Permanente"
  )

  assert.equal(
    montarTituloNegocioHubSpot({
      area: "INSS",
      numeroCaso: "PRV.260812.001",
      descricao: "Pedi auxílio-doença e ainda estou aguardando a análise."
    }),
    "🟢 PRV.260812.001 - Benefício por incapacidade temporária"
  )

  assert.equal(
    montarTituloNegocioHubSpot({ area: "Trabalhista", numeroCaso: "TRB.260812.002", tipo_de_caso: "trab_demissao" }),
    "🟢 TRB.260812.002 - Demissão / Verbas Rescisórias"
  )

  assert.equal(
    montarTituloNegocioHubSpot({ area: "Família", numeroCaso: "FAM.260812.004" }),
    "🟢 FAM.260812.004 - Direito de Família"
  )

  assert.equal(
    montarTituloNegocioHubSpot({ area: "INSS", numeroCaso: "PRV.260812.003", descricao: "Talvez seja algum benefício." }),
    "🟢 PRV.260812.003 - Demanda Previdenciária"
  )

  assert.equal(
    montarTituloNegocioHubSpot({
      area: "Consumidor",
      numeroCaso: "PRV.260812.999",
      tipo_de_caso: "inss_outros",
      nomenclaturaJuridica: { type: "inss_outros", subtypeLabel: "Demanda Previdenciária" }
    }),
    "🟢 PRV.260812.999 - Direito do Consumidor"
  )

  console.log("hubspot-deal-title.test.js ok")
}

main()
