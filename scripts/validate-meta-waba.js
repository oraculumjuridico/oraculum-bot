require("dotenv").config({ quiet: true })

const {
  validarMetaWaba,
  formatarRelatorioMetaWaba
} = require("../src/domain/meta-waba-validator")

async function main() {
  const report = await validarMetaWaba()
  console.log(formatarRelatorioMetaWaba(report))
  if (!report.ok) process.exitCode = 1
}

main().catch(error => {
  console.error(`[META WABA] Falha inesperada: ${error.message}`)
  process.exitCode = 1
})
