const assert = require("node:assert/strict")
const {
  configurarStatePersistence,
  serializarUsers,
  hidratarUsuarioPersistido
} = require("../src/domain/state-persistence")

const STAGES = {
  AUDIO_AGUARDANDO: "audio_aguardando",
  CLIENTE: "cliente"
}
const etapasValidas = new Set(Object.values(STAGES))
const users = {
  "5511000000000": {
    nomeWA: "Maria",
    nome: "Maria da Silva",
    contatoId: "contact-1",
    negocioId: "deal-2",
    negocioStageId: "processo",
    numeroCaso: "ORA-2026-002",
    area: "trabalhista",
    tipo: "demissao",
    stage: STAGES.CLIENTE,
    etapa: STAGES.CLIENTE,
    _menuClienteCasoAtivo: true,
    _casosMenuCliente: [
      { numeroCaso: "ORA-2026-001", negocio: { id: "deal-1" } },
      { numeroCaso: "ORA-2026-002", negocio: { id: "deal-2" } }
    ],
    _acaoPendente: "documentos",
    _mostrarPainelCasosCliente: true
  }
}

configurarStatePersistence({
  users,
  novoUsuario: nomeWA => ({
    nomeWA,
    stage: STAGES.AUDIO_AGUARDANDO,
    etapa: STAGES.AUDIO_AGUARDANDO
  }),
  podeMostrarMenuCliente: u => Boolean(u?.numeroCaso),
  etapaValida: etapa => etapasValidas.has(etapa),
  STAGES
})

const serializado = serializarUsers()["5511000000000"]
for (const campoTransitorio of [
  "_menuClienteCasoAtivo",
  "_casosMenuCliente",
  "_acaoPendente",
  "_mostrarPainelCasosCliente"
]) {
  assert.equal(campoTransitorio in serializado, false)
}
assert.equal(serializado.negocioId, "deal-2")
assert.equal(serializado.numeroCaso, "ORA-2026-002")
assert.equal(serializado.area, "trabalhista")
assert.equal(serializado.tipo, "demissao")

const hidratado = hidratarUsuarioPersistido({
  ...users["5511000000000"],
  _menuClienteCasoAtivo: true,
  _acaoPendente: "advogado",
  _mostrarPainelCasosCliente: true
})

assert.equal(hidratado._menuClienteCasoAtivo, false)
assert.equal(hidratado._casosMenuCliente, null)
assert.equal(hidratado._acaoPendente, null)
assert.equal(hidratado._mostrarPainelCasosCliente, false)
assert.equal(hidratado.negocioId, "deal-2")
assert.equal(hidratado.negocioStageId, "processo")
assert.equal(hidratado.numeroCaso, "ORA-2026-002")
assert.equal(hidratado.area, "trabalhista")
assert.equal(hidratado.tipo, "demissao")

console.log("client-case-selection-persistence.test.js: ok")
