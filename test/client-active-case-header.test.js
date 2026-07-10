const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const { cabecalhoCasoAtivo } = require("../src/domain/client-menu-ui")
const { montarTextoStatusCliente } = require("../src/domain/cliente-status-ui")
const { telaEnvioDoc } = require("../src/domain/documents-ui")

const casoA = {
  numeroCaso: "ORA-2026-001",
  area: "Previdenciário"
}
const casoB = {
  numeroCaso: "ORA-2026-002",
  area: "Trabalhista"
}

assert.equal(
  cabecalhoCasoAtivo(casoA),
  "📂 *Caso ativo:* ORA-2026-001 · ⚖️ Previdenciário"
)
assert.equal(
  cabecalhoCasoAtivo(casoB),
  "📂 *Caso ativo:* ORA-2026-002 · ⚖️ Trabalhista"
)
assert.notEqual(cabecalhoCasoAtivo(casoA), cabecalhoCasoAtivo(casoB))

const status = montarTextoStatusCliente({
  numeroCaso: casoB.numeroCaso,
  area: casoB.area,
  barra: "🔄 Em andamento"
})
assert.match(status, /📂 \*Caso ativo:\* ORA-2026-002 · ⚖️ Trabalhista/)

const telaDocumentos = telaEnvioDoc({
  ...casoB,
  tipo: "demissao",
  docsEntregues: [],
  docsAusentes: [],
  docsPulados: [],
  docsParciais: [],
  docsDispensados: [],
  docAtualIdx: 0
}, () => [
  { id: "docs_depois", title: "Continuar depois" },
  { id: "m_inicio", title: "Menu do cliente" }
])
assert.match(
  telaDocumentos.texto,
  /📂 \*Caso ativo:\* ORA-2026-002 · ⚖️ Trabalhista/
)
assert.deepEqual(
  telaDocumentos.opcoes.map(opcao => opcao.id),
  ["docs_depois", "m_inicio"]
)

const serverSource = fs.readFileSync(
  path.join(__dirname, "..", "server.js"),
  "utf8"
)
const consultationSource = fs.readFileSync(
  path.join(__dirname, "..", "src", "domain", "client-appointment-ui.js"),
  "utf8"
)
assert.equal(serverSource.includes("${TEXTO_INTRO_DOCS}\\n\\n${cabecalhoCasoAtivo(u)}"), true)
assert.equal(consultationSource.includes("*Falar com advogado*\\n${cabecalhoCaso}"), true)
assert.equal(consultationSource.includes("*Horários disponíveis:*\\n${cabecalhoCaso}"), true)
for (const botao of [
  'id: "adv_agendar_ligacao"',
  'id: "adv_urg"',
  'id: "m_inicio"'
]) {
  assert.equal(consultationSource.includes(botao), true)
}

console.log("client-active-case-header.test.js: ok")
