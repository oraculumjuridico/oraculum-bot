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
const { analyzeCaseFolder, consolidateCase, renderPdfPages, writeAnalysisReports, readCache, normalizeName, ocrWithTimeout, sanitizeCaseAnalysis, shouldIgnoreInventoryFile, getBlockingReviewReasons } = require("../src/domain/local-case-document-analysis")
// Load import-real-cases BEFORE Module._load hook is set up (must be at top to avoid blocking on hubspot-deal-title)
const { inventory } = require("../scripts/import-real-cases")

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
  assert.match(missingCaseFolder.stderr, /ANALYSIS_CONFIRMATION_REQUIRED/)
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

  const zipFolder = path.join(root, "CASO ZIP FICTICIO")
  await fsp.mkdir(zipFolder)
  const zipFile = path.join(zipFolder, "SEGREDO-ARQUIVO-FICTICIO.zip")
  await fsp.writeFile(zipFile, Buffer.from("PK\x03\x04CONTEUDO ZIP FICTICIO NAO EXTRAIR"))
  const zipBefore = await fsp.readFile(zipFile)
  const zipCase = await analyzeCaseFolder(zipFolder, { relativeRoot: root, processPage: async () => { throw new Error("zip_nao_deve_executar_pipeline") } })
  assert.equal(zipCase.documentosClassificados.length, 0)
  assert.ok(zipCase.ignoredFiles.some(item => item.reason === "unsupported_or_invalid_content"))
  assert.deepEqual(await fsp.readFile(zipFile), zipBefore)
  const cliRun = childProcess.spawnSync(process.execPath, [
    path.join(__dirname, "..", "scripts", "analyze-real-case-documents.js"),
    `--case-folder=${zipFolder}`,
    "--max-files-per-case=2",
    "--ocr-timeout-ms=20"
  ], {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, CASE_DOCUMENT_ANALYSIS_CONFIRM: "ANALYZE_LOCAL_DOCUMENTS_SANITIZED" }
  })
  assert.equal(cliRun.status, 0, cliRun.stderr)
  for (const secret of ["CASO ZIP FICTICIO", "SEGREDO-ARQUIVO-FICTICIO.zip", zipFolder]) {
    assert.equal(`${cliRun.stdout}${cliRun.stderr}`.includes(secret), false)
  }

  const stateDir = path.join(root, "state")
  await writeAnalysisReports(stateDir, { version: 1, cases: [first] }, cache)
  const reportText = await fsp.readFile(path.join(stateDir, "latest-analysis.json"), "utf8")
  const csvText = await fsp.readFile(path.join(stateDir, "latest-analysis-summary.csv"), "utf8")
  const cacheText = await fsp.readFile(path.join(stateDir, "analysis-cache.json"), "utf8")
  for (const sensitive of ["CASO FICTICIO", "identidade.png", "CLIENTE FICTICIO", "52998224725", "5511999990000", "ficticio@example.test", "1234567890", "0000001-00.2026.8.00.0001", "1990-02-01", "Contato (11)"]) {
    assert.equal(reportText.includes(sensitive), false, `JSON nao pode conter ${sensitive}`)
    assert.equal(csvText.includes(sensitive), false, `CSV nao pode conter ${sensitive}`)
    assert.equal(cacheText.includes(sensitive), false, `cache nao pode conter ${sensitive}`)
  }
  const sanitized = sanitizeCaseAnalysis(first)
  assert.equal(sanitized.importId, "caso-001")
  assert.equal(sanitized.campos.identidade, "encontrado")
  assert.equal(sanitized.campos.cpf, "encontrado")
  assert.equal(sanitized.campos.contato, "encontrado")
  assert.equal(sanitized.campos.numeroOficial, "encontrado")
  assert.equal(sanitized.arquivos.every(item => /^arquivo-\d{3}$/.test(item.arquivoId)), true)
  assert.equal(sanitizeCaseAnalysis(differentCpfs).campos.cpf, "conflitante")
  const persistedReport = JSON.parse(reportText)
  assert.equal(Object.hasOwn(persistedReport, "rootHash"), false)
  assert.equal(reportText.includes(first.importId), false)
  assert.deepEqual(Object.keys((await readCache(path.join(stateDir, "analysis-cache.json"))).files).length > 0, true)

  // Run new tests for deep analysis fixes
  await testOfficeTemporaryFileExclusion()
  await testInventoryAnalysisConsistency()
  await testBlockingReviewReasonsClassification()
  await testSafeToPlanHubSpotConsistency()
  await testDocumentsPendingSemantics()
  await testTypeAndStageNotAutoFilled()
  await testModuleExports()

  // Security and no-write verification
  const analyzerSource = await fsp.readFile(path.join(__dirname, "..", "scripts", "analyze-real-case-documents.js"), "utf8")
  const domainSource = await fsp.readFile(path.join(__dirname, "..", "src", "domain", "local-case-document-analysis.js"), "utf8")
  assert.equal(/\bapply\s*\(/.test(analyzerSource), false)
  assert.equal(analyzerSource.includes("HUBSPOT_TOKEN"), false)
  assert.doesNotMatch(analyzerSource + domainSource, /require\(["'][^"']*(?:hubspot|googleapis|drive|neon|meta|make|microsoft.*todo)[^"']*["']\)/i)
  assert.equal((analyzerSource + domainSource).includes("newSet("), false)
  assert.equal(networkCalls, 0)
}

// TEST 17: Office temporary files must be excluded from analysis
async function testOfficeTemporaryFileExclusion() {
  assert.equal(shouldIgnoreInventoryFile("~$document.docx"), true, "~$ files must be ignored")
  assert.equal(shouldIgnoreInventoryFile("~$report.xlsx"), true, "~$ files must be ignored")
  assert.equal(shouldIgnoreInventoryFile("documento.pdf"), false, "regular files must not be ignored")
  assert.equal(shouldIgnoreInventoryFile("image.jpeg"), false, "regular files must not be ignored")
  assert.equal(shouldIgnoreInventoryFile(".hidden"), false, "hidden files are different from ~$")
  
  // Test in actual folder context
  const testDir = fs.mkdtempSync(path.join(os.tmpdir(), "temp-file-test-"))
  await fsp.writeFile(path.join(testDir, "documento.pdf"), pdfFixture())
  await fsp.writeFile(path.join(testDir, "~$documento.docx"), Buffer.from("fake lock file"))
  
  const result = await analyzeCaseFolder(testDir, { processPage: fakePipeline })
  
  // ~$ file should NOT be in the fileCount
  assert.equal(result.fileCount, 1, "~$ file should not be counted")
  assert.equal(result.ignoredFileCount, 0, "~$ file should be filtered before ignore tracking")
  
  // Physical file should still exist
  assert.equal(fs.existsSync(path.join(testDir, "~$documento.docx")), true, "~$ file must not be deleted")
}

// TEST 18: Inventory and analysis must count files identically
async function testInventoryAnalysisConsistency() {
  const testDir = fs.mkdtempSync(path.join(os.tmpdir(), "consistency-test-"))
  
  // Create test files
  await fsp.writeFile(path.join(testDir, "doc1.pdf"), pdfFixture())
  await fsp.writeFile(path.join(testDir, "doc2.pdf"), pdfFixture())
  await fsp.writeFile(path.join(testDir, "image.jpeg"), Buffer.alloc(100))
  await fsp.writeFile(path.join(testDir, "~$locked.docx"), Buffer.from("lock"))
  
  // Count inventory files (replicate walk() logic)
  let inventoryCount = 0
  for (const entry of await fsp.readdir(testDir, { withFileTypes: true })) {
    if (entry.isFile() && !shouldIgnoreInventoryFile(entry.name)) {
      inventoryCount++
    }
  }
  
  // Get analysis count
  const analysisResult = await analyzeCaseFolder(testDir, { processPage: fakePipeline })
  const analysisCount = analysisResult.fileCount
  
  // They should be identical
  assert.equal(analysisCount, 3, "analysis should count 3 files")
  assert.equal(inventoryCount, 3, "inventory should count 3 files")
  assert.equal(analysisCount, inventoryCount, "inventory and analysis must count files identically")
}

// TEST 19: blockingReviewReasons must be distinguished from all reasons
async function testBlockingReviewReasonsClassification() {
  const allReasons = [
    "cpf_missing",
    "official_number_missing",  // Resolvable
    "negocio_sem_numero_oficial",  // Resolvable
    "divergent_names",
    "documents_quarantined"
  ]
  
  const blocking = getBlockingReviewReasons(allReasons)
  
  // official_number_missing and negocio_sem_numero_oficial should not be in blocking
  assert.equal(blocking.includes("cpf_missing"), true, "cpf_missing should block")
  assert.equal(blocking.includes("divergent_names"), true, "divergent_names should block")
  assert.equal(blocking.includes("documents_quarantined"), true, "documents_quarantined should block")
  assert.equal(blocking.includes("official_number_missing"), false, "official_number_missing should not block")
  assert.equal(blocking.includes("negocio_sem_numero_oficial"), false, "negocio_sem_numero_oficial should not block")
}

// TEST 20: safeToPlanHubSpot must be false when blockingReviewReasons exist
async function testSafeToPlanHubSpotConsistency() {
  const testDir = fs.mkdtempSync(path.join(os.tmpdir(), "safe-plan-test-"))
  
  // Case with cpf_missing (blocking reason)
  await fsp.mkdir(path.join(testDir, "subdir1"), { recursive: true })
  await fsp.writeFile(path.join(testDir, "subdir1", "no-cpf.pdf"), pdfFixture())
  
  const mockPipeline = () => fakePipeline({ nome: "João Silva" })  // No CPF
  const result = await analyzeCaseFolder(testDir, { processPage: mockPipeline })
  
  // cpf_missing is a blocking reason, so safeToPlanHubSpot should be false
  assert.equal(result.blockingReviewReasons.includes("cpf_missing"), true)
  assert.equal(result.safeToPlanHubSpot, false, "safeToPlanHubSpot must be false when cpf_missing (blocking)")
  
  // Case with valid CPF, name, and phone
  const testDir2 = fs.mkdtempSync(path.join(os.tmpdir(), "safe-plan-test2-"))
  await fsp.writeFile(path.join(testDir2, "with-cpf.pdf"), pdfFixture())
  
  // Pass both fields and OCR text with phone number
  // Using valid CPF: 11144477735 (passes Brazilian CPF validation)
  const mockPipelineValid = () => fakePipeline(
    { cpf: "11144477735", nome: "João Silva" },
    "João Silva\nCPF: 111.444.777-35\nTelefone: (11) 98765-4321"  // Phone in OCR text
  )
  const result2 = await analyzeCaseFolder(testDir2, { processPage: mockPipelineValid })
  
  // Verify fields are extracted correctly
  if (result2.cpfsEncontrados.length === 0) {
    assert.fail(`Expected CPF to be extracted, got: ${JSON.stringify(result2.cpfsEncontrados)}`)
  }
  if (result2.nomesEncontrados.length === 0) {
    assert.fail(`Expected name to be extracted, got: ${JSON.stringify(result2.nomesEncontrados)}`)
  }
  if (result2.telefonesEncontrados.length === 0) {
    assert.fail(`Expected phone to be extracted, got: ${JSON.stringify(result2.telefonesEncontrados)}`)
  }
  
  // When all required fields are present and no blocking reasons, safeToPlanHubSpot should be true
  if (result2.blockingReviewReasons.length > 0) {
    assert.fail(`Expected no blocking reasons, got: ${JSON.stringify(result2.blockingReviewReasons)}`)
  }
  assert.equal(result2.safeToPlanHubSpot, true, "safeToPlanHubSpot should be true when all requirements met")
}

// TEST 21: documentsPending must use null for inconclusive analysis
async function testDocumentsPendingSemantics() {
  const testDir = fs.mkdtempSync(path.join(os.tmpdir(), "pending-test-"))
  
  // Create a PDF that will trigger pdf_page_limit
  await fsp.writeFile(path.join(testDir, "multi-page.pdf"), pdfFixture())
  
  let renderFailure = false
  const mockRenderWithFailure = async () => {
    renderFailure = true
    throw new Error("pdf_render_failed")
  }
  
  const result = await analyzeCaseFolder(testDir, {
    processPage: fakePipeline,
    limits: { maxPdfPages: 1 },
    renderPdfPages: mockRenderWithFailure
  })
  
  // When analysis fails (pdf_render_failed), documentsPending should be null
  assert.equal(result.documentsPending, null, "documentsPending must be null with pdf_render_failed")
}

// TEST 22: Type and stage must be null (not auto-filled)
async function testTypeAndStageNotAutoFilled() {
  const testDir = fs.mkdtempSync(path.join(os.tmpdir(), "type-stage-test-"))
  await fsp.writeFile(path.join(testDir, "doc.pdf"), pdfFixture())
  
  const result = await analyzeCaseFolder(testDir, { processPage: fakePipeline })
  
  // Deep analysis should not produce mappedType or plannedStage
  assert.equal(result.mappedType, null, "mappedType must be null (filled by planning stage)")
  assert.equal(result.plannedStage, null, "plannedStage must be null (filled by planning stage)")
}

// TEST 23: Verify module exports have helper functions
async function testModuleExports() {
  const module = require("../src/domain/local-case-document-analysis")
  
  assert.equal(typeof module.shouldIgnoreInventoryFile, "function", "shouldIgnoreInventoryFile must be exported")
  assert.equal(typeof module.getBlockingReviewReasons, "function", "getBlockingReviewReasons must be exported")
}

main().then(() => console.log("local-case-document-analysis.test.js: ok")).finally(() => {
  http.request = originalNetwork.httpRequest; http.get = originalNetwork.httpGet
  https.request = originalNetwork.httpsRequest; https.get = originalNetwork.httpsGet; net.connect = originalNetwork.netConnect
  global.fetch = originalNetwork.fetch; Module._load = originalNetwork.moduleLoad
  fs.rmSync(root, { recursive: true, force: true })
}).catch(error => { console.error(error); process.exitCode = 1 })
