const assert = require("node:assert/strict")
const fs = require("node:fs")
const fsp = require("node:fs/promises")
const os = require("node:os")
const path = require("node:path")
const http = require("node:http")
const https = require("node:https")
const net = require("node:net")
const childProcess = require("node:child_process")
const Module = require("node:module")
const { createCanvas } = require("@napi-rs/canvas")
const { analyzeCaseFolder, consolidateCase, renderPdfPages, writeAnalysisReports, readCache, normalizeName, ocrWithTimeout } = require("../src/domain/local-case-document-analysis")

const root = fs.mkdtempSync(path.join(os.tmpdir(), "oraculum-case-analysis-"))
const originalNetwork = { httpRequest: http.request, httpGet: http.get, httpsRequest: https.request, httpsGet: https.get, netConnect: net.connect, fetch: global.fetch, moduleLoad: Module._load }
let networkCalls = 0
const blockNetwork = () => { networkCalls += 1; throw new Error("network_forbidden_in_case_analysis") }

function fakePipeline(fields, text = "") {
  return {
    preprocessamento: { erros: [], avisos: [] },
    ocr: { textoCompleto: text, erros: [], avisos: [], paginasProcessadas: 1, confianca: 95 },
    classificacao: { tipoDocumento: "RG frente", categoria: "documentos_pessoais", confianca: 0.95, erros: [] },
    extracao: { camposExtraidos: fields, confiancaPorCampo: {}, erros: [], avisos: [] }
  }
}

async function imageFixture(file) {
  const canvas = createCanvas(500, 220)
  const context = canvas.getContext("2d")
  context.fillStyle = "white"; context.fillRect(0, 0, 500, 220)
  context.fillStyle = "black"; context.font = "24px sans-serif"; context.fillText("DOCUMENTO FICTICIO", 30, 70)
  await fsp.writeFile(file, await canvas.encode("png"))
}

function pdfFixture() {
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 200] /Resources << >> /Contents 4 0 R >>",
    "<< /Length 27 >>\nstream\n0 0 0 rg 30 80 240 40 re f\nendstream"
  ]
  let output = "%PDF-1.4\n"
  const offsets = [0]
  objects.forEach((object, index) => { offsets.push(Buffer.byteLength(output)); output += `${index + 1} 0 obj\n${object}\nendobj\n` })
  const xref = Buffer.byteLength(output)
  output += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  for (let index = 1; index <= objects.length; index++) output += `${String(offsets[index]).padStart(10, "0")} 00000 n \n`
  return Buffer.from(output + `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`)
}

async function main() {
  http.request = blockNetwork; http.get = blockNetwork; https.request = blockNetwork; https.get = blockNetwork; net.connect = blockNetwork; global.fetch = blockNetwork
  const forbiddenModules = /(?:hubspot|googleapis|drive|neon|meta|make|microsoft.*todo)/i
  Module._load = function (request, parent, isMain) {
    if (forbiddenModules.test(request)) throw new Error(`forbidden_external_module:${request}`)
    return originalNetwork.moduleLoad.call(this, request, parent, isMain)
  }
  const missingCaseFolder = childProcess.spawnSync(process.execPath, [path.join(__dirname, "..", "scripts", "analyze-real-case-documents.js")], { encoding: "utf8", env: { ...process.env, CASE_IMPORT_ROOT: "" } })
  assert.notEqual(missingCaseFolder.status, 0)
  assert.match(missingCaseFolder.stderr, /case_folder_obrigatorio/)
  assert.equal(normalizeName("  CLIENTE   FICTICIO  "), "CLIENTE FICTICIO")
  const caseFolder = path.join(root, "CASO FICTICIO")
  await fsp.mkdir(caseFolder)
  const image = path.join(caseFolder, "identidade.png")
  await imageFixture(image)
  await fsp.copyFile(image, path.join(caseFolder, "identidade-copia.png"))
  await fsp.writeFile(path.join(caseFolder, "beneficio.pdf"), pdfFixture())
  await fsp.writeFile(path.join(caseFolder, "extensao-falsa.jpg"), "isto nao e uma imagem")

  const rendered = await renderPdfPages(await fsp.readFile(path.join(caseFolder, "beneficio.pdf")), 2)
  assert.equal(rendered.pages.length, 1)
  assert.ok(rendered.pages[0].subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])))

  let oversizedCanvasCreations = 0
  await assert.rejects(
    () => renderPdfPages(pdfFixture(), 1, { maxWidth: 100, maxHeight: 100, maxPixels: 10000 }, { createCanvas: () => { oversizedCanvasCreations += 1; throw new Error("canvas_nao_deveria_ser_criado") } }),
    error => error.code === "PDF_PAGE_DIMENSION_LIMIT" && error.pageNumber === 1
  )
  assert.equal(oversizedCanvasCreations, 0, "canvas nao pode ser criado para pagina acima do limite")

  const oversizedPdfFolder = path.join(root, "CASO PDF GRANDE FICTICIO")
  await fsp.mkdir(oversizedPdfFolder)
  await fsp.writeFile(path.join(oversizedPdfFolder, "documento-grande-ficticio.pdf"), pdfFixture())
  const oversizedPdfCase = await analyzeCaseFolder(oversizedPdfFolder, {
    relativeRoot: root,
    limits: { maxWidth: 100, maxHeight: 100, maxPixels: 10000 }
  })
  assert.ok(oversizedPdfCase.ignoredFiles.some(item => item.reason === "pdf_page_dimension_limit" && item.code === "PDF_PAGE_DIMENSION_LIMIT" && item.pageNumber === 1))
  assert.equal(oversizedPdfCase.documentosClassificados.length, 0)

  const cache = { version: 1, files: {} }
  let processCalls = 0
  const processPage = async () => {
    processCalls += 1
    return fakePipeline(
      { nome: "CLIENTE FICTICIO", cpf: "529.982.247-25", dataNascimento: "01/02/1990", nb: "1234567890", numero: "0000001-00.2026.8.00.0001", beneficio: "Aposentadoria" },
      "Contato (11) 99999-0000 email ficticio@example.test"
    )
  }
  const first = await analyzeCaseFolder(caseFolder, { cache, relativeRoot: root, processPage })
  assert.equal(first.fileCount, 4)
  assert.equal(first.analyzedFileCount, 3)
  assert.equal(first.ignoredFileCount, 1)
  assert.equal(first.cpfsEncontrados.length, 1)
  assert.equal(first.safeToPlanHubSpot, true)
  assert.equal(first.canonicalSuggestions.date_of_birth, "1990-02-01")
  assert.equal(first.canonicalSuggestions.numero_de_caso, "0000001-00.2026.8.00.0001")
  assert.equal(first.canonicalSuggestions.numero_beneficio, "1234567890")
  assert.equal(first.canonicalSuggestions.tipo_de_caso_suggestion, "Aposentadoria")
  assert.ok(first.ignoredFiles.some(item => item.reason === "unsupported_or_invalid_content"))
  assert.equal(processCalls, 3)
  const second = await analyzeCaseFolder(caseFolder, { cache, relativeRoot: root, processPage })
  assert.equal(processCalls, 6, "cache tecnico nao deve restaurar dados pessoais")
  assert.deepEqual(second.cpfsEncontrados, first.cpfsEncontrados)

  const base = { sourceFolder: caseFolder, files: ["a", "b"], ignored: [], hashes: ["a", "b"], relativeRoot: root }
  const analyzed = cpf => ({ file: cpf, names: ["CLIENTE FICTICIO"], cpfs: [cpf], phones: [], emails: [], benefitNumbers: [], processNumbers: [], benefitTypes: [], birthDates: [], confidence: 0.9 })
  const sameCpf = consolidateCase({ ...base, importId: "same", analyzed: [analyzed("52998224725"), analyzed("52998224725")] })
  assert.equal(sameCpf.conflicts.includes("multiple_valid_cpfs"), false)
  const differentCpfs = consolidateCase({ ...base, importId: "different", analyzed: [analyzed("52998224725"), { ...analyzed("16899535009"), names: ["OUTRA PESSOA"] }] })
  assert.ok(differentCpfs.conflicts.includes("multiple_valid_cpfs"))
  assert.ok(differentCpfs.conflicts.includes("documents_quarantined"))
  assert.equal(differentCpfs.safeToPlanHubSpot, false)
  const divergentNamesOnly = consolidateCase({ ...base, importId: "names", analyzed: [{ ...analyzed("52998224725"), names: ["CLIENTE FICTICIO"] }, { ...analyzed("52998224725"), names: ["PESSOA INVENTADA"] }] })
  assert.ok(divergentNamesOnly.conflicts.includes("divergent_names"))

  let terminated = 0
  const hangingWorker = { recognize: () => new Promise(() => {}), terminate: async () => { terminated += 1 } }
  await assert.rejects(() => ocrWithTimeout({ buffer: Buffer.from("fake") }, { timeoutMs: 10, createWorker: async () => hangingWorker }), error => error.code === "OCR_TIMEOUT")
  assert.ok(terminated >= 1, "worker deve ser encerrado no timeout")

  const timeoutFolder = path.join(root, "CASO TIMEOUT FICTICIO")
  await fsp.mkdir(timeoutFolder)
  await imageFixture(path.join(timeoutFolder, "documento-ficticio.png"))
  let integratedTerminations = 0
  const timedOutCase = await analyzeCaseFolder(timeoutFolder, {
    relativeRoot: root,
    limits: { ocrTimeoutMs: 10 },
    createWorker: async () => ({
      recognize: () => new Promise(() => {}),
      terminate: async () => { integratedTerminations += 1 }
    })
  })
  assert.ok(integratedTerminations >= 1, "worker integrado deve ser encerrado no timeout")
  assert.ok(timedOutCase.ignoredFiles.some(item => item.reason === "ocr_timeout" && item.code === "OCR_TIMEOUT"))
  assert.equal(timedOutCase.documentosClassificados.length, 0, "pagina com timeout nao pode ser classificada")

  const stateDir = path.join(root, "state")
  await writeAnalysisReports(stateDir, { version: 1, cases: [first] }, cache)
  const reportText = await fsp.readFile(path.join(stateDir, "latest-analysis.json"), "utf8")
  assert.equal(reportText.includes("Contato (11)"), false, "texto OCR bruto nao pode ser persistido")
  const cacheText = await fsp.readFile(path.join(stateDir, "analysis-cache.json"), "utf8")
  for (const sensitive of ["CLIENTE FICTICIO", "52998224725", "5511999990000", "ficticio@example.test", "1234567890", "0000001-00.2026.8.00.0001", "1990-02-01"]) assert.equal(cacheText.includes(sensitive), false)
  assert.deepEqual(Object.keys((await readCache(path.join(stateDir, "analysis-cache.json"))).files).length > 0, true)
  const analyzerSource = await fsp.readFile(path.join(__dirname, "..", "scripts", "analyze-real-case-documents.js"), "utf8")
  const domainSource = await fsp.readFile(path.join(__dirname, "..", "src", "domain", "local-case-document-analysis.js"), "utf8")
  assert.equal(/\bapply\s*\(/.test(analyzerSource), false)
  assert.equal(analyzerSource.includes("HUBSPOT_TOKEN"), false)
  assert.doesNotMatch(analyzerSource + domainSource, /require\(["'][^"']*(?:hubspot|googleapis|drive|neon|meta|make|microsoft.*todo)[^"']*["']\)/i)
  assert.equal((analyzerSource + domainSource).includes("newSet("), false)
  assert.equal(networkCalls, 0)
}

main().then(() => console.log("local-case-document-analysis.test.js: ok")).finally(() => {
  http.request = originalNetwork.httpRequest; http.get = originalNetwork.httpGet
  https.request = originalNetwork.httpsRequest; https.get = originalNetwork.httpsGet; net.connect = originalNetwork.netConnect
  global.fetch = originalNetwork.fetch; Module._load = originalNetwork.moduleLoad
  fs.rmSync(root, { recursive: true, force: true })
}).catch(error => { console.error(error); process.exitCode = 1 })
