#!/usr/bin/env node
"use strict"

const fs = require("node:fs")
const path = require("node:path")
const { reconcileCaseState } = require("../src/domain/case-reconciler")

const inputArg = process.argv.find(argument => argument.startsWith("--input="))
const apply = process.argv.includes("--apply")
const confirmation = process.argv.find(argument => argument.startsWith("--confirm="))?.split("=").slice(1).join("=")
if (!inputArg) {
  console.error("Uso: node scripts/reconcile-case-state.js --input=<arquivo.json> [--apply --confirm=APPLY_RECONCILIATION_FIXES]")
  process.exit(2)
}
if (apply && confirmation !== "APPLY_RECONCILIATION_FIXES") {
  console.error("Modo apply exige confirmação literal.")
  process.exit(2)
}

const inputPath = path.resolve(inputArg.slice("--input=".length))
const input = JSON.parse(fs.readFileSync(inputPath, "utf8"))
const report = reconcileCaseState(input, apply ? {
  apply: true,
  applyFixes: () => { throw new Error("adaptador externo de correção não configurado") }
} : {})
console.log(JSON.stringify(report, null, 2))
if (!report.ok) process.exitCode = 1
