const fs = require("node:fs")
const path = require("node:path")

const args = process.argv.slice(2)
const valueAfter = name => {
  const index = args.indexOf(name)
  return index >= 0 ? args[index + 1] : null
}
const dealId = valueAfter("--deal-id") || process.env.CONSULTATION_DEAL_ID
const outputDir = path.resolve(valueAfter("--output-dir") || process.cwd())

if (!dealId) {
  console.error("Uso: npm run consultation:export:dossier -- --deal-id <dealId> [--output-dir pasta]")
  process.exit(1)
}

const { buildConsultaLegalDossier } = require("../domain/consultation")

function summaryText(summary) {
  return [
    `Dossiê jurídico da consulta — caso ${summary.dealId}`,
    `Gerado em: ${summary.generatedAt}`,
    `Estado final: ${summary.finalStatus}`,
    `Eventos: ${summary.eventCount}`,
    `Decisões auditadas: ${summary.decisionCount}`,
    `Replay consistente: ${summary.replayConsistent ? "sim" : "não"}`,
    `Hash da prova: ${summary.proofHash}`
  ].join("\n") + "\n"
}

buildConsultaLegalDossier(dealId)
  .then(({ dossier, summary, proof, verification }) => {
    if (!verification.admissible) throw new Error("dossie nao admissivel")
    fs.mkdirSync(outputDir, { recursive: true })
    fs.writeFileSync(path.join(outputDir, "dossier.json"), `${JSON.stringify(dossier, null, 2)}\n`, { flag: "wx" })
    fs.writeFileSync(path.join(outputDir, "summary.txt"), summaryText(summary), { flag: "wx" })
    fs.writeFileSync(path.join(outputDir, "proof.json"), `${JSON.stringify(proof, null, 2)}\n`, { flag: "wx" })
    console.log(JSON.stringify({
      event: "consultation_dossier_exported",
      dealId: String(dealId),
      outputDir,
      proofHash: proof.proofHash
    }))
  })
  .catch(error => {
    console.error(JSON.stringify({
      event: "consultation_dossier_export_failed",
      dealId: String(dealId),
      code: error.code || null,
      error: error.message
    }))
    process.exitCode = 1
  })
