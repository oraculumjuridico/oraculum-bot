const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")

const source = fs.readFileSync(
  path.join(__dirname, "..", "server.js"),
  "utf8"
)
const statusSource = fs.readFileSync(
  path.join(__dirname, "..", "src", "domain", "cliente-status-ui.js"),
  "utf8"
)
const contractSource = `${source}\n${statusSource}`

for (const termoAntigo of [
  "Agendar ligação",
  "agendar uma ligação",
  "Confirme seu agendamento",
  "Agendamento confirmado",
  "ligação com um especialista",
  "Mensagem registrada com urgência",
  "Falar equipe"
]) {
  assert.equal(source.includes(termoAntigo), false, `Termo antigo encontrado: ${termoAntigo}`)
}

for (const termoOficial of [
  "Agendar consulta",
  "agendar uma consulta",
  "Confirme sua consulta",
  "Consulta confirmada",
  "consulta com um advogado",
  "Mensagem urgente registrada",
  "Falar com advogado"
]) {
  assert.equal(source.includes(termoOficial), true, `Termo oficial ausente: ${termoOficial}`)
}

for (const contratoPreservado of [
  'id: "adv_agendar_ligacao"',
  'id: "adv_urg"',
  'id: "cliente_cancelar_consulta"',
  'id: "cliente_cancelar_consulta_sim"',
  'AGENDAMENTO_HORARIO: "agendamento_horario"',
  'AGENDAMENTO_DURACAO: "agendamento_duracao"',
  'AGENDAMENTO_CONFIRMAR: "agendamento_confirmar"'
]) {
  assert.equal(contractSource.includes(contratoPreservado), true, `Contrato alterado: ${contratoPreservado}`)
}

assert.equal(source.includes("Nosso advogado vai te ligar"), true)
assert.equal(source.includes("nosso advogado vai te ligar"), true)

console.log("client-consultation-terminology.test.js: ok")
