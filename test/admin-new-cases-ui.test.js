"use strict"

const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const vm = require("node:vm")
const {
  configurarAdminCaseUi,
  resumoCasoAdmin,
  tituloOpcaoCasoAdmin
} = require("../src/domain/admin-case-ui")
const { primeiroEUltimoNome, normalizarNomeComparacao } = require("../src/domain/phone-name")

function resolverNomeBriefing(u = {}) {
  const valido = valor => {
    const nome = String(valor || "").trim()
    return nome && nome.toLowerCase() !== "cliente" ? nome : ""
  }
  return (u.nomeConfirmado ? valido(u.nome) : "") || valido(u.nomeHubspot) || valido(u.nomeWA) || valido(u.nomePerfilWhatsApp) || "Cliente"
}

const serverSource = fs.readFileSync(path.join(__dirname, "..", "server.js"), "utf8")
const inicioNome = serverSource.indexOf("function nomeValidoParaExibicao")
const fimNome = serverSource.indexOf("async function resolverUsuarioPorHubSpot", inicioNome)
const nomeSandbox = {
  sanitizarTextoEntrada: valor => String(valor || "").trim(),
  resolverNomeProdução: null
}
vm.runInNewContext(`${serverSource.slice(inicioNome, fimNome)}\nresolverNomeProdução = resolverNomeBriefing`, nomeSandbox)
assert.equal(nomeSandbox.resolverNomeProdução({
  nomeWA: "pessoaficticiadasilva",
  nomePerfilWhatsApp: "Pessoa Ficticia da Silva"
}), "Pessoa Ficticia da Silva")
assert.equal(nomeSandbox.resolverNomeProdução({ nomeWA: "pessoaficticiadasilva" }), "pessoaficticiadasilva")

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
