"use strict"

const assert = require("node:assert/strict")
const {
  formatarData,
  formatarHora,
  montarParametrosLembreteConsulta,
  montarMensagemLembreteConsulta
} = require("../src/domain/consultation-reminder-message")

const datetime = "2026-08-14T16:30:00.000Z"

assert.equal(formatarData(datetime), "14/08/2026")
assert.equal(formatarHora(datetime), "13:30")
assert.deepEqual(
  montarParametrosLembreteConsulta({ tipo: "24h", name: "Jesaías Belmiro", datetime }),
  ["Jesaías", "14/08/2026 às 13:30"]
)
assert.deepEqual(
  montarParametrosLembreteConsulta({ tipo: "1h", name: "Jesaías Belmiro", datetime }),
  ["Jesaías", "14/08/2026", "13:30"]
)
assert.deepEqual(
  montarParametrosLembreteConsulta({ tipo: "hoje", name: "Jesaías Belmiro", datetime }),
  ["Jesaías", "14/08/2026", "13:30"]
)

const texto = montarMensagemLembreteConsulta({ tipo: "1h", name: "Jesaías Belmiro", datetime })
assert.match(texto, /começa em 1 hora/)
assert.match(texto, /Jesaías/)
assert.match(texto, /14\/08\/2026, às 13:30/)

console.log("consultation-reminder-message.test.js: ok")
