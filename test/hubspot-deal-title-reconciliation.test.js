const assert = require("assert")
const { planoTitulo } = require("../scripts/audit-hubspot-deal-titles")

function deal(id, properties) {
  return { id, properties }
}

function main() {
  const automatico = planoTitulo(deal("101", {
    dealname: "🟢 PRV.260812.010",
    dealstage: "presentationscheduled",
    area_juridica: "INSS",
    numero_de_caso: "PRV.260812.010",
    description: "Pedi auxílio-doença e aguardo análise."
  }))
  assert.equal(automatico.aplicavel, true)
  assert.deepEqual(automatico.propriedades, {
    dealname: "🟢 PRV.260812.010 - Benefício por incapacidade temporária",
    oraculum_case_subtype: "incapacidade_temporaria"
  })

  const semNumero = planoTitulo(deal("102", {
    dealname: "🟢 Prv",
    dealstage: "presentationscheduled",
    area_juridica: "INSS",
    tipo_de_caso: "inss_bpc"
  }))
  assert.equal(semNumero.aplicavel, false)
  assert.equal(semNumero.requerRevisaoHumana, true)
  assert.deepEqual(semNumero.propriedades, {})

  const divergente = planoTitulo(deal("103", {
    dealname: "🟢 PRV.260812.011 - BPC LOAS Idoso",
    dealstage: "presentationscheduled",
    area_juridica: "INSS",
    numero_de_caso: "PRV.260812.011",
    oraculum_case_subtype: "bpc_idoso",
    description: "Pedi auxílio-doença."
  }))
  assert.equal(divergente.aplicavel, false)
  assert.equal(divergente.requerRevisaoHumana, true)
  assert.deepEqual(divergente.propriedades, {})

  console.log("hubspot-deal-title-reconciliation.test.js ok")
}

main()
