const assert = require("node:assert/strict")
const { gerarMensagemAcolhimento } = require("../src/domain/pre-atendimento-ui")

assert.match(gerarMensagemAcolhimento("Estou desesperada e chorando"), /obrigada por confiar/i)
assert.match(gerarMensagemAcolhimento("Estou sem dinheiro e sem comida"), /situação muito séria/i)
assert.match(gerarMensagemAcolhimento("Estou com medo porque fui ameaçada"), /assustador/i)
assert.match(gerarMensagemAcolhimento("O prazo vence hoje"), /prioridade máxima/i)
assert.match(gerarMensagemAcolhimento("Preciso contar o que aconteceu"), /toda a atenção/i)

console.log("pre-atendimento-ui.test.js: ok")
