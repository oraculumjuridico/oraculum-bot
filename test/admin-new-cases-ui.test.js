"use strict"

const assert = require("node:assert/strict")
const {
  configurarAdminCaseUi,
  resumoCasoAdmin,
  tituloOpcaoCasoAdmin
} = require("../src/domain/admin-case-ui")
const { mascararTelefoneLog } = require("../src/utils/logging")
const { primeiroEUltimoNome, normalizarNomeComparacao } = require("../src/domain/phone-name")

function resolverNomeBriefing(u = {}) {
  const valido = valor => {
    const nome = String(valor || "").trim()
    return nome && nome.toLowerCase() !== "cliente" ? nome : ""
  }
  return (u.nomeConfirmado ? valido(u.nome) : "") || valido(u.nomeHubspot) || valido(u.nomeWA) || valido(u.nomePerfilWhatsApp) || "Cliente"
}

configurarAdminCaseUi({
  ADMIN_IDS: {},
  labelStageAdmin: stage => stage === "acolhimento_modo" ? "Pré-atendimento" : stage || "Sem stage",
  resolverNomeBriefing,
  mascararTelefoneLog,
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
const resumo = resumoCasoAdmin(preCadastro, 1)
assert.match(resumo, /Cliente: Maria Ficticia da Silva/)
assert.match(resumo, /WhatsApp: 5511\*{5}1234/)
assert.doesNotMatch(resumo, new RegExp(telefoneCompleto))
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

console.log("admin-new-cases-ui.test.js: ok")
