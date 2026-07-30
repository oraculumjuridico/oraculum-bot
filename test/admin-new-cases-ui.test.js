"use strict"

const assert = require("node:assert/strict")
const {
  configurarAdminCaseUi,
  resumoCasoAdmin,
  tituloOpcaoCasoAdmin
} = require("../src/domain/admin-case-ui")
const { primeiroEUltimoNome, normalizarNomeComparacao } = require("../src/domain/phone-name")
const { resolverNomeParaAdmin } = require("../src/domain/admin-name-resolver")
const { mapearNegociosHubSpotAdmin } = require("../src/domain/admin-hubspot-deal-mapper")

function resolverNomeBriefing(u = {}) {
  return resolverNomeParaAdmin({
    contato: null,
    u,
    nomePerfilWhatsApp: u.nomePerfilWhatsApp
  })
}

assert.equal(resolverNomeBriefing({
  nomeWA: "pessoaficticiadasilva",
  nomePerfilWhatsApp: "Pessoa Ficticia da Silva"
}), "Pessoa Ficticia da Silva")
assert.equal(resolverNomeBriefing({ nomeWA: "pessoaficticiadasilva" }), "pessoaficticiadasilva")

const negociosMapeados = mapearNegociosHubSpotAdmin({
  results: [
    {
      id: "deal-1",
      properties: {
        dealname: "Caso Previdenciario",
        numero_de_caso: "PREV-001",
        area_juridica: "Previdenciario",
        dealstage: "appointmentscheduled",
        createdate: "2026-07-01T10:00:00Z",
        estado_bot_snapshot: "{\"cliente\":\"Ana\"}",
        urgencia: "Alta"
      }
    },
    {
      id: "deal-2",
      properties: {
        dealname: "Caso Trabalhista",
        numero_de_caso: "TRAB-002",
        area_juridica: "Trabalhista",
        dealstage: "qualifiedtobuy",
        createdate: "2026-07-02T11:00:00Z",
        estado_bot_snapshot: "{\"cliente\":\"Bruno\"}",
        urgencia: "Baixa"
      }
    }
  ]
})
assert.equal(negociosMapeados.length, 2)
assert.deepEqual(negociosMapeados.map(item => item.id), ["deal-1", "deal-2"])
assert.equal(negociosMapeados[0].stageId, "appointmentscheduled")
assert.equal(negociosMapeados[1].stageId, "qualifiedtobuy")
assert.equal(negociosMapeados[0].properties.dealname, "Caso Previdenciario")
assert.equal(negociosMapeados[1].properties.dealname, "Caso Trabalhista")
assert.equal(negociosMapeados[0].properties.numero_de_caso, "PREV-001")
assert.equal(negociosMapeados[1].properties.numero_de_caso, "TRAB-002")
assert.equal(negociosMapeados[0].properties.area_juridica, "Previdenciario")
assert.equal(negociosMapeados[1].properties.area_juridica, "Trabalhista")
assert.equal(negociosMapeados[0].properties.estado_bot_snapshot, "{\"cliente\":\"Ana\"}")
assert.equal(negociosMapeados[1].properties.urgencia, "Baixa")
assert.notStrictEqual(negociosMapeados[0].properties, negociosMapeados[1].properties)

configurarAdminCaseUi({
  ADMIN_IDS: {},
  labelStageAdmin: stage => stage === "acolhimento_modo" ? "Pré-atendimento" : stage || "Sem stage",
  resolverNomeBriefing,
  resolverTelefoneAdminAutenticado: (item, adminAutenticado) => adminAutenticado
    ? String(item?.from || item?.u?._numero || item?.u?.whatsappContato || "").replace(/\D/g, "")
    : "",
  primeiroEUltimoNome
})

const telefoneCompleto = "5511666661234"
const preCadastro = {
  from: telefoneCompleto,
  u: {
    nomeWA: "Cliente",
    nomePerfilWhatsApp: "Maria Ficticia da Silva",
    stage: "acolhimento_modo"
  }
}
const resumo = resumoCasoAdmin(preCadastro, 1, { adminAutenticado: true })
assert.match(resumo, /Cliente: Maria Ficticia da Silva/)
assert.match(resumo, new RegExp(`WhatsApp: ${telefoneCompleto}`))
assert.match(resumo, /Pré-atendimento/)
assert.match(resumo, /sem caso/)

const tituloUnico = tituloOpcaoCasoAdmin(preCadastro, 0, {
  nomeCurto: primeiroEUltimoNome(resolverNomeBriefing(preCadastro.u)),
  duplicado: false
})
assert.equal(tituloUnico, "1. Maria Silva")
assert.ok(tituloUnico.length <= 24)
assert.doesNotMatch(tituloUnico, /JUR|sem caso|1234/)

const nomes = [preCadastro, { from: "5511999995678", u: { nomePerfilWhatsApp: "Maria Ficticia da Silva" } }]
  .map(item => primeiroEUltimoNome(resolverNomeBriefing(item.u)))
const contagens = nomes.reduce((mapa, nome) => {
  const chave = normalizarNomeComparacao(nome)
  mapa.set(chave, (mapa.get(chave) || 0) + 1)
  return mapa
}, new Map())
const tituloDuplicado = tituloOpcaoCasoAdmin(preCadastro, 0, {
  nomeCurto: nomes[0],
  duplicado: contagens.get(normalizarNomeComparacao(nomes[0])) > 1
})
assert.equal(tituloDuplicado, "1. Maria Silva - 1234")
assert.ok(tituloDuplicado.length <= 24)

const tituloLongoDuplicado = tituloOpcaoCasoAdmin({
  from: telefoneCompleto,
  u: { nomePerfilWhatsApp: "Alexandria Ficticia de SobrenomeExtremamenteLongo" }
}, 0, {
  nomeCurto: primeiroEUltimoNome("Alexandria Ficticia de SobrenomeExtremamenteLongo"),
  duplicado: true
})
assert.equal(tituloLongoDuplicado.length, 24)
assert.match(tituloLongoDuplicado, / - 1234$/)

const semTelefone = resumoCasoAdmin({ u: { nomePerfilWhatsApp: "Pessoa Ficticia", stage: "acolhimento_modo" } }, 2)
assert.doesNotMatch(semTelefone, /WhatsApp:/)

const naoAutenticado = resumoCasoAdmin(preCadastro, 3)
assert.doesNotMatch(naoAutenticado, new RegExp(telefoneCompleto))
assert.doesNotMatch(naoAutenticado, /WhatsApp:/)

const porNumeroUsuario = resumoCasoAdmin({
  from: "",
  u: { _numero: "5511777774321", whatsappContato: "5511888889876", nomePerfilWhatsApp: "Pessoa Ficticia" }
}, 4, { adminAutenticado: true })
assert.match(porNumeroUsuario, /WhatsApp: 5511777774321/)

const porWhatsAppContato = resumoCasoAdmin({
  u: { whatsappContato: "5511888889876", nomePerfilWhatsApp: "Pessoa Ficticia" }
}, 5, { adminAutenticado: true })
assert.match(porWhatsAppContato, /WhatsApp: 5511888889876/)

console.log("admin-new-cases-ui.test.js: ok")
