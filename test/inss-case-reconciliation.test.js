"use strict"

const assert = require("node:assert/strict")
const {
  redactSecrets, parseMarkdownCases, matchMarkdownBlock, evidenceForCase,
  summarizeCase, preserve, similarity, extractCaseSignals
} = require("../src/domain/inss-case-reconciliation")

const markdown = [
  "# Base",
  "## Maria da Silva",
  "Segurado: Maria Aparecida da Silva",
  "Apelido: Mari",
  "Telefone: (11) 99999-0000",
  "Ref: João indicador",
  "Partes: Maria e representante legal",
  "Pedido no INSS: BPC",
  "Senha: jamais-versionar",
  "### Outro subtítulo",
  "Token: jamais-enviar"
].join("\n")

assert(!redactSecrets(markdown).includes("jamais"))
const blocks = parseMarkdownCases(markdown, "fixture")
assert.equal(blocks.length, 1)
assert.equal(matchMarkdownBlock("Maria da Silva", blocks).block.heading, "Maria da Silva")
assert(similarity("Maria da Silva", "MARIA  DA SILVA") === 1)
assert.equal(matchMarkdownBlock("Pessoa sem relação", blocks).block, null)

const evidence = evidenceForCase({
  record: { name: "Maria da Silva" },
  files: ["RG Maria.pdf", "laudo.pdf"],
  blocks: [blocks]
})
assert.equal(evidence.officialName, "Maria Aparecida da Silva")
assert.equal(evidence.clientPhone, "5511999990000")
assert.equal(evidence.referrer, "João indicador")
assert(evidence.thirdParties)
assert(!evidence.facts.join(" ").includes("jamais"))
assert.equal(preserve("válido", ""), "válido")
assert.equal(preserve("antigo", "melhor"), "melhor")

const summary = summarizeCase({
  caseNumber: "PRV.260726.001",
  classification: { label: "BPC LOAS" },
  evidence,
  categories: ["Documentos pessoais", "Documentos médicos"],
  driveUrl: "https://drive.google.com/drive/folders/sanitized",
  fileCount: 2
})
for (const section of ["RESUMO DO CASO", "IDENTIFICAÇÃO DO CLIENTE", "HISTÓRICO", "ANÁLISE DOCUMENTAL", "DOCUMENTOS PENDENTES", "ANÁLISE PRELIMINAR", "PRÓXIMA AÇÃO", "PROVENIÊNCIA"]) {
  assert(summary.includes(section))
}
assert(!summary.includes("jamais"))
assert.notEqual(summary, summarizeCase({ caseNumber: "PRV.2", classification: { label: "Aposentadoria" }, evidence: { ...evidence, facts: ["Fato distinto"] }, categories: [], driveUrl: "x", fileCount: 1 }))
const signals = extractCaseSignals("Nome completo: MARIA APARECIDA DA SILVA\nDER 12/03/2025\nNB: 123.456.789-0\nPedido indeferido em 14/04/2025.")
assert.equal(signals.officialNameCandidates[0], "Maria Aparecida da Silva")
assert.equal(signals.dates.length, 2)
assert.equal(signals.benefitNumbers.length, 1)
assert(signals.events.some(line => /indeferido/i.test(line)))

console.log("inss-case-reconciliation.test.js: ok")
