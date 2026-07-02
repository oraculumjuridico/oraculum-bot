const assert = require("node:assert/strict")

const {
  detectarSofrimentoIntenso,
  detectarModoAtendimento
} = require("../src/domain/message-classifiers")

for (const [texto, esperado] of [
  ["modo_audio", "audio"],
  ["modo_texto", "texto"],
  ["Prefiro conversar por voz", "audio"],
  ["Vou responder falando", "audio"],
  ["Prefiro escrever por texto", "texto"],
  ["Vou digitar", "texto"],
  ["Quero falar com um advogado", null],
  ["Preciso de ajuda para minha mãe", null],
  ["mensagem sem preferência definida", null],
  ["", null]
]) {
  assert.equal(detectarModoAtendimento(texto), esperado)
}

for (const texto of [
  "Estou desesperada e não aguento mais",
  "Estou sem dinheiro e sem comida",
  "Minha filha está passando fome",
  "O prazo vence hoje",
  "Estou com muito medo e fui ameaçada"
]) {
  assert.equal(detectarSofrimentoIntenso(texto), true)
}

for (const texto of [
  "Quero entender meu processo",
  "Preciso conversar sobre meu benefício",
  ""
]) {
  assert.equal(detectarSofrimentoIntenso(texto), false)
}

console.log("message-classifiers.test.js: ok")
