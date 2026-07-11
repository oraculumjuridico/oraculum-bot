#!/usr/bin/env node
"use strict"

require("dotenv").config({ quiet: true })
const fs = require("node:fs")
const path = require("node:path")
const crypto = require("node:crypto")
const { analyzeCaseFolder, readCache, writeAnalysisReports } = require("../src/domain/local-case-document-analysis")

const option = name => {
  const prefix = `--${name}=`
  const argument = process.argv.find(value => value.startsWith(prefix))
  return argument ? argument.slice(prefix.length) : null
}
const caseFolderOption = option("case-folder")
const stateDir = path.resolve("data/case-import")
const cacheFile = path.join(stateDir, "analysis-cache.json")
const numberOption = (name, fallback) => Math.max(1, Number(option(name) || process.env[`CASE_ANALYZE_${name.replace(/-/g, "_").toUpperCase()}`] || fallback))

async function main() {
  if (!caseFolderOption) throw new Error("case_folder_obrigatorio_use_--case-folder")
  const folders = [path.resolve(caseFolderOption)]
  for (const folder of folders) {
    if (!fs.existsSync(folder) || !fs.statSync(folder).isDirectory()) throw new Error("case_folder_inexistente")
  }
  const cache = await readCache(cacheFile)
  const cases = []
  const startedAt = Date.now()
  for (const folder of folders) {
    cases.push(await analyzeCaseFolder(folder, {
      cache,
      relativeRoot: path.dirname(folder),
      limits: {
        maxFileBytes: numberOption("max-file-bytes", 20 * 1024 * 1024),
        maxFilesPerCase: numberOption("max-files-per-case", 40),
        maxPdfPages: numberOption("max-pdf-pages", 12),
        maxPixels: numberOption("max-pixels", 25 * 1000 * 1000),
        maxDimension: numberOption("max-dimension", 10000),
        ocrTimeoutMs: numberOption("ocr-timeout-ms", 60 * 1000)
      }
    }))
  }
  const report = {
    version: 1,
    generatedAt: new Date().toISOString(),
    rootHash: crypto.createHash("sha256").update(path.dirname(folders[0])).digest("hex").slice(0, 16),
    caseCount: cases.length,
    durationMs: Date.now() - startedAt,
    cases
  }
  await writeAnalysisReports(stateDir, report, cache)
  console.log(JSON.stringify({
    ok: true,
    cases: cases.length,
    analyzedFiles: cases.reduce((sum, item) => sum + item.analyzedFileCount, 0),
    ignoredFiles: cases.reduce((sum, item) => sum + item.ignoredFileCount, 0),
    casesWithConflicts: cases.filter(item => item.conflicts.length).length,
    report: path.relative(process.cwd(), path.join(stateDir, "latest-analysis.json"))
  }))
}

if (require.main === module) main().catch(error => {
  console.error(JSON.stringify({ ok: false, error: error.message }))
  process.exitCode = 1
})

module.exports = { main }
