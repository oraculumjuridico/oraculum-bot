const assert = require("node:assert/strict")

const {
  detectarIntencaoCliente,
  pareceDuvidaCasoAtualOuNovo,
  pareceNovaSituacaoCliente
} = require("../src/domain/client-intent-detector")

for (const [texto, esperado] of [
  ["status", "status"],
  ["qual o andamento do meu caso", "status"],
  ["quero enviar documentos", "documentos"],
  ["mandar um pdf", "documentos"],
  ["quero falar com advogado", "advogado"],
  ["preciso de um atendente humano", "advogado"],
  ["tenho um prazo urgente hoje", "urgente"],
  ["assunto sem classificação conhecida", null],
  ["", null]
]) {
  assert.equal(detectarIntencaoCliente(texto), esperado)
}

assert.equal(
  detectarIntencaoCliente("não quero consulta"),
  "cancelar_consulta",
  "cancelamento de consulta deve manter prioridade sobre cancelamento geral"
)
assert.equal(detectarIntencaoCliente("quero marcar consulta"), "agendar")

assert.equal(
  pareceDuvidaCasoAtualOuNovo("Isso entra no meu caso atual ou preciso abrir outro atendimento?"),
  true
)
assert.equal(pareceDuvidaCasoAtualOuNovo("Quero ver meu caso"), false)

const relatoLongo = [
  "Estou com um novo problema relacionado ao meu benefício do INSS.",
  "Recebi uma resposta negativa e preciso entender se devo abrir outro atendimento.",
  "Já tentei resolver diretamente, mas não consegui e agora preciso de orientação sobre o processo."
].join(" ")
assert.equal(pareceNovaSituacaoCliente(relatoLongo), true)
assert.equal(pareceNovaSituacaoCliente("Problema com INSS"), false)

console.log("client-intent-detector.test.js: ok")
