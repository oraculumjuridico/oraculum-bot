const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const {
  assertFinalizationOperation
} = require("../src/domain/finalization-invariants")

for (const operation of [
  "drive_folder",
  "hubspot_contact",
  "hubspot_deal",
  "hubspot_case_number",
  "hubspot_stage",
  "hubspot_association",
  "hubspot_state"
]) {
  assert.throws(
    () => assertFinalizationOperation(operation, null),
    error =>
      error.code === "FINALIZATION_INTEGRATION_FAILURE" &&
      error.operation === operation
  )
}
assert.equal(assertFinalizationOperation("hubspot_state", "deal-1"), "deal-1")

const server = fs.readFileSync(path.join(__dirname, "..", "server.js"), "utf8")
const inicio = server.indexOf("async function finalizarCadastro")
const fim = server.indexOf("async function tela_confirmacao", inicio)
assert.ok(inicio >= 0 && fim > inicio)
const finalizacao = server.slice(inicio, fim)

for (const operation of [
  "drive_folder",
  "hubspot_contact",
  "hubspot_deal",
  "hubspot_case_number",
  "hubspot_stage",
  "hubspot_association",
  "hubspot_state"
]) {
  assert.match(finalizacao, new RegExp(`assertFinalizationOperation\\("${operation}"`))
}

const sucesso = finalizacao.indexOf("Reflect.set(u, \"stage\", STAGES.CLIENTE)")
const ultimaGuarda = finalizacao.lastIndexOf("assertFinalizationOperation")
assert.ok(ultimaGuarda >= 0 && ultimaGuarda < sucesso)
assert.match(finalizacao, /u\.pastaDriveId\s+\?\s+\{ id: u\.pastaDriveId/)
assert.match(finalizacao, /let contatoId = u\.contatoId \|\| existente\?\.id/)
assert.match(finalizacao, /let negocioId = u\.negocioId \|\| null/)
assert.ok((finalizacao.match(/persistirUsersAgora\(\{ propagarErro: true \}\)/g) || []).length >= 4)

const drive = fs.readFileSync(
  path.join(__dirname, "..", "src", "domain", "drive-files.js"),
  "utf8"
)
const inicioPasta = drive.indexOf("async function criarPastaCliente")
const fimPasta = drive.indexOf("async function uploadDrive", inicioPasta)
const criarPasta = drive.slice(inicioPasta, fimPasta)
assert.match(criarPasta, /files\.list\(\{/)
assert.match(criarPasta, /name = '\$\{escapeDriveQueryValue\(nomePasta\)\}'/)
assert.ok(criarPasta.indexOf("files.list") < criarPasta.indexOf("files.create"))
assert.match(criarPasta, /return existentes\.data\.files\[0\]/)

const hubspot = fs.readFileSync(
  path.join(__dirname, "..", "src", "domain", "hubspot-core.js"),
  "utf8"
)
const inicioAssociacao = hubspot.indexOf("async function hsAssociar")
const fimAssociacao = hubspot.indexOf("function filtrarPropsHubSpot", inicioAssociacao)
const associacao = hubspot.slice(inicioAssociacao, fimAssociacao)
assert.match(associacao, /return true/)
assert.match(associacao, /return false/)

console.log("finalization-transaction.test.js: ok")
