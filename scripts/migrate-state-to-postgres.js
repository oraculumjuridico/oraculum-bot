#!/usr/bin/env node
"use strict"

require("dotenv").config({ quiet: true })
const path = require("node:path")
const fs = require("node:fs")
const crypto = require("node:crypto")
const {
  initializeExternalStateRepository,
  migrateLocalState,
  externalStateHealth,
  closeExternalStateRepository
} = require("../src/infrastructure/external-state-repository")

async function main() {
  const force = process.argv.includes("--force")
  const dryRun = process.argv.includes("--dry-run")
  const directory = path.resolve(process.env.ORACULUM_DATA_DIR || path.join(__dirname, "..", "data"))
  if (dryRun) {
    const files = fs.existsSync(directory)
      ? fs.readdirSync(directory).filter(name => name.endsWith(".json") || name.endsWith(".jsonl")).map(name => {
          const content = fs.readFileSync(path.join(directory, name))
          return { namespace: name, bytes: content.length, checksum: crypto.createHash("sha256").update(content).digest("hex") }
        })
      : []
    console.log(JSON.stringify({ ok: true, dryRun: true, directoryExists: fs.existsSync(directory), files, totalBytes: files.reduce((sum, file) => sum + file.bytes, 0) }, null, 2))
    return
  }
  const initialized = await initializeExternalStateRepository({ directory, hydrate: false })
  if (!initialized.enabled) throw new Error("persistencia PostgreSQL nao configurada")
  const result = await migrateLocalState({ force })
  const health = await externalStateHealth({ probe: true })
  console.log(JSON.stringify({ ok: true, result, health }, null, 2))
}

main().catch(error => { console.error(JSON.stringify({ ok: false, error: error.message })); process.exitCode = 1 })
  .finally(() => closeExternalStateRepository().catch(() => {}))
