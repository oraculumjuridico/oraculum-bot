"use strict"

require("dotenv").config()
const axios = require("axios")
const { CONTRACT_FINANCE_PROPERTY_DEFINITIONS: definitions, ensureContractFinanceProperties } = require("../src/adapters/hubspot-contract-finance-schema")

const CONFIRMATION = "CREATE_CONTRACT_FINANCE_PROPERTIES"

async function main() {
  const apply = process.argv.includes("--apply")
  const confirm = (process.argv.find(arg => arg.startsWith("--confirm=")) || "").split("=")[1]
  console.log(JSON.stringify({ mode: apply ? "apply" : "dry-run", properties: definitions.map(({ name, label, type }) => ({ name, label, type })) }, null, 2))
  if (!apply) return
  if (confirm !== CONFIRMATION) throw new Error(`CONFIRMATION_REQUIRED:${CONFIRMATION}`)
  const token = process.env.HUBSPOT_TOKEN
  if (!token) throw new Error("HUBSPOT_TOKEN_REQUIRED")
  const result = await ensureContractFinanceProperties({ token, client: axios })
  console.log(JSON.stringify(result, null, 2))
}

main().catch(error => {
  console.error(JSON.stringify({ ok: false, code: error.code || "HUBSPOT_PROPERTY_SETUP_FAILED", status: error.response?.status || null }))
  process.exitCode = 1
})
