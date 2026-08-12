const assert = require("assert")
const fs = require("fs")
const path = require("path")

function main() {
  const source = fs.readFileSync(path.resolve(__dirname, "..", "server.js"), "utf8")
  const stateStart = source.indexOf("function getHubSpotDealStateProps(u)")
  const stateEnd = source.indexOf("\nfunction getHubSpotDealProps", stateStart)
  const stateBlock = source.slice(stateStart, stateEnd)
  assert.match(stateBlock, /garantirNomenclaturaJuridicaUsuario\(u\)/)
  assert.match(stateBlock, /oraculum_case_subtype:/)
  assert.match(stateBlock, /estado_bot_snapshot:\s*serializarEstado\(u\)/)

  const finalizationStart = source.indexOf("const dealnameFinal = montarTituloNegocioHubSpot")
  assert.ok(finalizationStart > 0)
  assert.match(source.slice(finalizationStart - 100, finalizationStart), /garantirNomenclaturaJuridicaUsuario\(u\)/)

  const adminStart = source.indexOf("function normalizarItemAdminLocal")
  const adminEnd = source.indexOf("\nasync function hsAdminContarNegociosPorStages", adminStart)
  const adminBlock = source.slice(adminStart, adminEnd)
  assert.match(adminBlock, /props\.oraculum_case_subtype/)
  assert.match(adminBlock, /garantirNomenclaturaJuridicaUsuario\(base\)/)

  console.log("hubspot-deal-nomenclature-server-static.test.js ok")
}

main()
