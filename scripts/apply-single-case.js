#!/usr/bin/env node
"use strict"
function parseArgs(argv) {
  if (!argv.includes("--case-import-id")) throw new Error("CASE_IMPORT_ID_MISSING")
  if (argv.length > 2) throw new Error("CLI_ARGUMENTS_EXCESS")
  const value = argv[argv.indexOf("--case-import-id") + 1]
  if (!value || !/^[A-Za-z0-9][A-Za-z0-9._:-]{2,127}$/.test(value)) throw new Error("CASE_IMPORT_ID_INVALID")
  return { caseImportId: value }
}
async function main({ argv = process.argv.slice(2), executor } = {}) { const args = parseArgs(argv); if (typeof executor !== "function") throw new Error("REAL_SINGLE_CASE_APPLY_NOT_CONFIGURED"); return executor({ caseImportId: args.caseImportId }) }
if (require.main === module) main().catch(error => { const allowed = new Set(["CASE_IMPORT_ID_MISSING", "CASE_IMPORT_ID_INVALID", "CLI_ARGUMENTS_EXCESS", "REAL_SINGLE_CASE_APPLY_NOT_CONFIGURED"]); console.error(JSON.stringify({ ok: false, error: allowed.has(error.message) ? error.message : "EXECUTOR_FAILED_CLOSED" })); process.exitCode = 1 })
module.exports = { parseArgs, main }
