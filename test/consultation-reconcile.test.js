const assert = require("node:assert/strict")
const { reconciliarSessoes } = require("../scripts/reconcile-consulta")

const futuro = new Date(Date.now() + 60 * 60 * 1000).toISOString()
const evento = {
  id: "evt-reconcile",
  status: "confirmed",
  start: { dateTime: futuro },
  end: { dateTime: futuro },
  extendedProperties: { private: { dealId: "deal-reconcile" } }
}
const estado = {
  users: {
    telefone: {
      negocioId: "deal-reconcile",
      consultaStatus: "sem_consulta",
      _eventoCalendarId: null
    }
  }
}

const primeira = reconciliarSessoes(estado, [evento])
assert.equal(primeira.length, 1)
assert.equal(estado.users.telefone.consultaStatus, "agendada")

const segunda = reconciliarSessoes(estado, [evento])
assert.equal(segunda.length, 0, "segunda reconciliacao nao repete alteracao")

const cancelado = { ...evento, status: "cancelled" }
const inconsistencia = reconciliarSessoes(estado, [cancelado])
assert.equal(inconsistencia.length, 1)
assert.equal(inconsistencia[0].de, "agendada")
assert.equal(inconsistencia[0].para, "cancelada")
assert.equal(estado.users.telefone.consultaStatus, "cancelada")

const idempotenteAposCorrecao = reconciliarSessoes(estado, [cancelado])
assert.equal(idempotenteAposCorrecao.length, 0)

console.log("consultation-reconcile: ok")
