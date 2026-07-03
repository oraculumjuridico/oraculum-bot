const fs = require("node:fs")
const path = require("node:path")

const args = process.argv.slice(2)
const valueAfter = name => {
  const index = args.indexOf(name)
  return index >= 0 ? args[index + 1] : null
}
const dealId = valueAfter("--deal-id") || process.env.CONSULTATION_DEAL_ID
const output = valueAfter("--output")

if (!dealId) {
  console.error("Uso: npm run consultation:export:legal -- --deal-id <dealId> [--output arquivo.json]")
  process.exit(1)
}

const { getConsultaFullAudit } = require("../domain/consultation")

getConsultaFullAudit(dealId)
  .then(snapshot => {
    const json = `${JSON.stringify(snapshot, null, 2)}\n`
    if (output) {
      const target = path.resolve(output)
      fs.mkdirSync(path.dirname(target), { recursive: true })
      fs.writeFileSync(target, json, { encoding: "utf8", flag: "wx" })
      console.log(JSON.stringify({
        event: "consultation_legal_export",
        dealId: String(dealId),
        output: target,
        legalSnapshotHash: snapshot.legalSnapshotHash
      }))
      return
    }
    process.stdout.write(json)
  })
  .catch(error => {
    console.error(JSON.stringify({
      event: "consultation_legal_export_failed",
      dealId: String(dealId),
      code: error.code || null,
      error: error.message
    }))
    process.exitCode = 1
  })
