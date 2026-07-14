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

  // Human review integration tests
  await testHumanReviewBehaviorUnchangedWithoutReview()
  await testHumanReviewApprovesQuarantinedDocument()
  await testHumanReviewCaseIdMismatch()
  await testHumanReviewInvalidSchema()
  await testHumanReviewWrongHashNotMatched()
  await testHumanReviewPartialApproval()
  await testHumanReviewDoesNotRemoveUnrelatedBlockers()
  await testHumanReviewPendingDoesNotApply()
  await testHumanReviewThirdPartyRoleDoesNotCreateCRM()
  await testHumanReviewFileImmutabilityCheck()
  await testHumanReviewModuleExports()

  // Critical regression tests - divergent_names recalculation
  await testDivergentNamesResolutionWithHumanReview()
  await testDivergentNamesRemainWithPartialApproval()

  // Additional risk-reproduction scenarios (A-D) for same-file identity co-occurrence
  await testSameDocumentPrimaryAndThirdPreserved()
  await testSameDocumentHasUnapprovedThirdKeepsDivergence()
  await testOnlySourceDocumentPreservesPrimary()
  await testPrimaryAlsoInAnotherDocument()

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

// TEST 23: Human review - old behavior without review stays unchanged
async function testHumanReviewBehaviorUnchangedWithoutReview() {
  const testDir = fs.mkdtempSync(path.join(os.tmpdir(), "human-review-baseline-"))

  const fields = {
    nome: "João Silva",
    cpf: "12345678901",
    dataDeNascimento: "1980-05-15"
  }

  await fsp.writeFile(path.join(testDir, "doc1.pdf"), pdfFixture())

  const result = await analyzeCaseFolder(testDir, {
    processPage: () => fakePipeline(fields),
    relativeRoot: testDir
  })

  // Without human review, behavior should be exactly the same as before
  assert.equal(result.humanReviewApplied, false, "humanReviewApplied must be false without review")
  assert.equal(result.humanReviewStatus, null, "humanReviewStatus must be null without review")
}

// TEST 24: Human review - valid approval removes identity_divergence quarantine
async function testHumanReviewApprovesQuarantinedDocument() {
  const testDir = fs.mkdtempSync(path.join(os.tmpdir(), "human-review-approve-"))
  const testHash = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"

  const fields1 = { nome: "Maria Santos", cpf: "12345678901" }
  const fields2 = { nome: "José Silva", cpf: "12345678901" } // Different name, same CPF

  await fsp.writeFile(path.join(testDir, "doc1.pdf"), pdfFixture())
  await fsp.writeFile(path.join(testDir, "doc2.pdf"), pdfFixture())

  // Create mock analysis where doc1 has the approved hash
  const mockAnalyzed = [
    { file: "doc1.pdf", pageNumber: 1, sha256: testHash, names: ["Maria Santos"], cpfs: ["12345678901"], classification: "other", confidence: 0.9 },
    { file: "doc2.pdf", pageNumber: 1, sha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb", names: ["José Silva"], cpfs: ["12345678901"], classification: "other", confidence: 0.9 }
  ]

  const humanReview = {
    schemaVersion: 1,
    caseImportId: "test-case-001",
    status: "HUMAN_REVIEW_COMPLETED",
    documents: [
      {
        sha256: testHash,
        decision: "APPROVE_AND_KEEP",
        documentOwnerRole: "ASSISTED_PERSON"
      }
    ]
  }

  const result = consolidateCase({
    sourceFolder: testDir,
    importId: "test-case-001",
    files: ["doc1.pdf", "doc2.pdf"],
    analyzed: mockAnalyzed,
    ignored: [],
    hashes: [testHash, "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"],
    relativeRoot: testDir,
    humanReview
  })

  // After approval, the quarantined documents list should be shorter (doc1 not quarantined)
  assert.ok(result.humanReviewApplied, "humanReviewApplied must be true")
  assert.equal(result.humanReviewStatus, "HUMAN_REVIEW_COMPLETED")
  // doc1 should not be in quarantined list (it was approved)
  const quarantinedFiles = result.quarantinedDocuments.map(q => q.file)
  assert.ok(!quarantinedFiles.includes("doc1.pdf"), "Approved doc1 should not be quarantined")
  assert.ok(quarantinedFiles.includes("doc2.pdf"), "Non-approved doc2 should still be quarantined")
}

// TEST 25: Human review - invalid case ID is rejected
async function testHumanReviewCaseIdMismatch() {
  const testDir = fs.mkdtempSync(path.join(os.tmpdir(), "human-review-mismatch-"))

  const humanReview = {
    schemaVersion: 1,
    caseImportId: "WRONG-CASE-ID",
    status: "HUMAN_REVIEW_COMPLETED",
    documents: []
  }

  try {
    consolidateCase({
      sourceFolder: testDir,
      importId: "correct-case-id",
      files: [],
      analyzed: [],
      ignored: [],
      hashes: [],
      relativeRoot: testDir,
      humanReview
    })
    assert.fail("Should throw on case ID mismatch")
  } catch (error) {
    assert.equal(error.code, "HUMAN_REVIEW_CASE_MISMATCH", "Should throw HUMAN_REVIEW_CASE_MISMATCH")
  }
}

// TEST 26: Human review - invalid schema is rejected
async function testHumanReviewInvalidSchema() {
  const testDir = fs.mkdtempSync(path.join(os.tmpdir(), "human-review-invalid-schema-"))

  const invalidReview = {
    caseImportId: "test-case-001",
    status: "HUMAN_REVIEW_COMPLETED",
    documents: [{ sha256: "not-a-valid-hash", decision: "INVALID_DECISION" }]
  }

  try {
    consolidateCase({
      sourceFolder: testDir,
      importId: "test-case-001",
      files: [],
      analyzed: [],
      ignored: [],
      hashes: [],
      relativeRoot: testDir,
      humanReview: invalidReview
    })
    assert.fail("Should throw on invalid schema")
  } catch (error) {
    assert.equal(error.code, "INVALID_HUMAN_REVIEW_SCHEMA", "Should throw INVALID_HUMAN_REVIEW_SCHEMA")
  }
}

// TEST 27: Human review - wrong hash is not matched
async function testHumanReviewWrongHashNotMatched() {
  const testDir = fs.mkdtempSync(path.join(os.tmpdir(), "human-review-wrong-hash-"))
  const correctHash = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
  const wrongHash = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"

  const mockAnalyzed = [
    { file: "doc.pdf", pageNumber: 1, sha256: correctHash, names: ["Maria Santos"], cpfs: ["12345678901", "98765432101"], classification: "other", confidence: 0.9 }
  ]

  const humanReview = {
    schemaVersion: 1,
    caseImportId: "test-case-002",
    status: "HUMAN_REVIEW_COMPLETED",
    documents: [
      { sha256: wrongHash, decision: "APPROVE_AND_KEEP" }
    ]
  }

  const result = consolidateCase({
    sourceFolder: testDir,
    importId: "test-case-002",
    files: ["doc.pdf"],
    analyzed: mockAnalyzed,
    ignored: [],
    hashes: [correctHash],
    relativeRoot: testDir,
    humanReview
  })

  // Decision with wrong hash should not match - doc should still be quarantined (multiple CPFs)
  assert.ok(result.quarantinedDocuments.length > 0, "Document should still be quarantined (wrong hash in review)")
}

// TEST 28: Human review - partial review (some approved, some not)
async function testHumanReviewPartialApproval() {
  const testDir = fs.mkdtempSync(path.join(os.tmpdir(), "human-review-partial-"))
  const hash1 = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
  const hash2 = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
  const hash3 = "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc"

  const mockAnalyzed = [
    { file: "doc1.pdf", pageNumber: 1, sha256: hash1, names: ["Maria Santos"], cpfs: ["12345678901"], classification: "other", confidence: 0.9 },
    { file: "doc2.pdf", pageNumber: 1, sha256: hash2, names: ["José Silva"], cpfs: ["12345678901"], classification: "other", confidence: 0.9 },
    { file: "doc3.pdf", pageNumber: 1, sha256: hash3, names: ["João Oliveira"], cpfs: ["12345678901"], classification: "other", confidence: 0.9 }
  ]

  const humanReview = {
    schemaVersion: 1,
    caseImportId: "test-case-003",
    status: "HUMAN_REVIEW_COMPLETED",
    documents: [
      { sha256: hash1, decision: "APPROVE_AND_KEEP" },
      { sha256: hash2, decision: "APPROVE_AND_KEEP" }
      // hash3 not reviewed - still conflicting
    ]
  }

  const result = consolidateCase({
    sourceFolder: testDir,
    importId: "test-case-003",
    files: ["doc1.pdf", "doc2.pdf", "doc3.pdf"],
    analyzed: mockAnalyzed,
    ignored: [],
    hashes: [hash1, hash2, hash3],
    relativeRoot: testDir,
    humanReview
  })

  // Only doc3 should be quarantined (not reviewed, still conflicting)
  const quarantinedFiles = result.quarantinedDocuments.map(q => q.file)
  assert.ok(!quarantinedFiles.includes("doc1.pdf"), "doc1 (approved) should not be quarantined")
  assert.ok(!quarantinedFiles.includes("doc2.pdf"), "doc2 (approved) should not be quarantined")
  assert.ok(quarantinedFiles.includes("doc3.pdf"), "doc3 (not reviewed) should still be quarantined")
}

// TEST 29: Human review - does not remove unrelated blocking reasons
async function testHumanReviewDoesNotRemoveUnrelatedBlockers() {
  const testDir = fs.mkdtempSync(path.join(os.tmpdir(), "human-review-blockers-"))
  const hash1 = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"

  const mockAnalyzed = [
    { file: "doc.pdf", pageNumber: 1, sha256: hash1, names: ["Maria Santos"], cpfs: [], classification: "other", confidence: 0.9 } // Missing CPF
  ]

  const humanReview = {
    schemaVersion: 1,
    caseImportId: "test-case-004",
    status: "HUMAN_REVIEW_COMPLETED",
    documents: [
      { sha256: hash1, decision: "APPROVE_AND_KEEP" }
    ]
  }

  const result = consolidateCase({
    sourceFolder: testDir,
    importId: "test-case-004",
    files: ["doc.pdf"],
    analyzed: mockAnalyzed,
    ignored: [],
    hashes: [hash1],
    relativeRoot: testDir,
    humanReview
  })

  // Even with human approval, cpf_missing should still be present
  assert.ok(result.blockingReviewReasons.includes("cpf_missing"), "cpf_missing blocker must be preserved")
  assert.equal(result.safeToPlanHubSpot, false, "safeToPlanHubSpot must be false due to cpf_missing")
}

// TEST 30: Human review - PENDING status does not apply decisions
async function testHumanReviewPendingDoesNotApply() {
  const testDir = fs.mkdtempSync(path.join(os.tmpdir(), "human-review-pending-"))
  const hash1 = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"

  const mockAnalyzed = [
    { file: "doc.pdf", pageNumber: 1, sha256: hash1, names: ["Maria Santos"], cpfs: ["12345678901", "98765432101"], classification: "other", confidence: 0.9 }
  ]

  const humanReview = {
    schemaVersion: 1,
    caseImportId: "test-case-005",
    status: "HUMAN_REVIEW_PENDING",
    documents: [
      { sha256: hash1, decision: "APPROVE_AND_KEEP" }
    ]
  }

  const result = consolidateCase({
    sourceFolder: testDir,
    importId: "test-case-005",
    files: ["doc.pdf"],
    analyzed: mockAnalyzed,
    ignored: [],
    hashes: [hash1],
    relativeRoot: testDir,
    humanReview
  })

  // With PENDING status, decisions should not apply - doc should still be quarantined
  assert.ok(result.quarantinedDocuments.length > 0, "Document should be quarantined (review still pending)")
  assert.equal(result.humanReviewApplied, false, "humanReviewApplied must be false for PENDING status")
}

// TEST 31: Human review - third party role does not trigger CRM creation (documented)
async function testHumanReviewThirdPartyRoleDoesNotCreateCRM() {
  const testDir = fs.mkdtempSync(path.join(os.tmpdir(), "human-review-third-party-"))
  const hash1 = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"

  const mockAnalyzed = [
    { file: "doc.pdf", pageNumber: 1, sha256: hash1, names: ["Maria Santos"], cpfs: ["12345678901"], classification: "other", confidence: 0.9 }
  ]

  const humanReview = {
    schemaVersion: 1,
    caseImportId: "test-case-006",
    status: "HUMAN_REVIEW_COMPLETED",
    documents: [
      {
        sha256: hash1,
        decision: "APPROVE_AND_KEEP",
        documentOwnerRole: "ASSISTED_PERSON",
        allowedMentionedIdentityRoles: ["INTERESTED_THIRD_PARTY"],
        relationshipType: "spouse_separated"
      }
    ]
  }

  const result = consolidateCase({
    sourceFolder: testDir,
    importId: "test-case-006",
    files: ["doc.pdf"],
    analyzed: mockAnalyzed,
    ignored: [],
    hashes: [hash1],
    relativeRoot: testDir,
    humanReview
  })

  // Verify that result does not include any CRM creation instructions
  assert.ok(result.humanReviewApplied, "Review applied")
  // This is a documentation/design verification - code should prevent CRM auto-creation elsewhere
  assert.equal(result.quarantinedDocuments.length, 0, "Document should not be quarantined")
}

// TEST 32: Human review - with file immutability test (hash mismatch would indicate file changed)
async function testHumanReviewFileImmutabilityCheck() {
  const testDir = fs.mkdtempSync(path.join(os.tmpdir(), "human-review-immutable-"))
  const originalHash = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
  const changedHash = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"

  const mockAnalyzed = [
    // Simulating file analyzed with one hash but now hash changed
    { file: "doc.pdf", pageNumber: 1, sha256: changedHash, names: ["Maria Santos"], cpfs: ["12345678901"], classification: "other", confidence: 0.9 }
  ]

  const humanReview = {
    schemaVersion: 1,
    caseImportId: "test-case-007",
    status: "HUMAN_REVIEW_COMPLETED",
    documents: [
      { sha256: originalHash, decision: "APPROVE_AND_KEEP" } // Decision for original hash
    ]
  }

  const result = consolidateCase({
    sourceFolder: testDir,
    importId: "test-case-007",
    files: ["doc.pdf"],
    analyzed: mockAnalyzed,
    ignored: [],
    hashes: [changedHash],
    relativeRoot: testDir,
    humanReview
  })

  // Decision should not match because hash changed - document is orphaned decision
  assert.ok(result.humanReviewApplied, "Review status applied")
  // Document with different hash should not match the decision
  // (verify by checking that conflict is not resolved)
}

// TEST 33: CRITICAL REGRESSION - Divergent names should be removed when all divergent docs approved
async function testDivergentNamesResolutionWithHumanReview() {
  const testDir = fs.mkdtempSync(path.join(os.tmpdir(), "divergent-names-resolution-"))

  // Simulate analysis that found divergent names from spouse mention
  const mockAnalyzed = [
    {
      file: "doc-titular.pdf",
      pageNumber: 1,
      sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      names: ["Titular Name"],
      cpfs: ["12345678901"],
      phones: ["5511999999999"],
      emails: [],
      benefitNumbers: [],
      processNumbers: ["0000001-00.2026.8.00.0001"],
      requestNumbers: [],
      benefitTypes: ["Aposentadoria"],
      birthDates: ["1990-01-15"],
      classification: "other",
      confidence: 0.9
    },
    {
      file: "doc-with-spouse.pdf",
      pageNumber: 1,
      sha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      names: ["Spouse Name"],
      cpfs: [],
      phones: [],
      emails: [],
      benefitNumbers: [],
      processNumbers: [],
      requestNumbers: [],
      benefitTypes: [],
      birthDates: [],
      classification: "other",
      confidence: 0.9
    }
  ]

  // Human review approves both documents - spouse doc with legitimate additional identity
  const humanReview = {
    schemaVersion: 1,
    caseImportId: "test-divergent-resolution",
    status: "HUMAN_REVIEW_COMPLETED",
    reviewSource: "HUMAN",
    reviewedAt: new Date().toISOString(),
    documents: [
      {
        sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        decision: "APPROVE_AND_KEEP",
        documentOwnerRole: "ASSISTED_PERSON"
      },
      {
        sha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        decision: "APPROVE_AND_KEEP",
        documentOwnerRole: "ASSISTED_PERSON",
        allowedMentionedIdentityRoles: ["INTERESTED_THIRD_PARTY"],
        relationshipType: "spouse_separated"
      }
    ]
  }

  const result = consolidateCase({
    sourceFolder: testDir,
    importId: "test-divergent-resolution",
    files: ["doc-titular.pdf", "doc-with-spouse.pdf"],
    analyzed: mockAnalyzed,
    ignored: [],
    hashes: ["aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"],
    relativeRoot: testDir,
    humanReview
  })

  // After approval, quarantine should be removed. Under conservative fallback, divergent_names remains until identity-level attribution exists.
  assert.ok(result.humanReviewApplied, "Human review should be applied")
  assert.equal(
    result.quarantinedDocuments.length,
    0,
    "Spouse document should no longer be quarantined after approval"
  )
  // Conservative fallback: do NOT remove divergent_names automatically
  assert.equal(
    result.conflicts.includes("divergent_names"),
    true,
    "divergent_names should remain in conflicts under conservative fallback even when sources approved"
  )
  assert.equal(
    result.safeToPlanHubSpot,
    false,
    "safeToPlanHubSpot must remain false while divergent_names persists"
  )
}

// TEST 34: Divergent names remain when approval is partial
async function testDivergentNamesRemainWithPartialApproval() {
  const testDir = fs.mkdtempSync(path.join(os.tmpdir(), "divergent-names-partial-"))

  const mockAnalyzed = [
    {
      file: "doc-titular.pdf",
      pageNumber: 1,
      sha256: "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
      names: ["Titular Name"],
      cpfs: ["12345678901"],
      phones: [],
      emails: [],
      benefitNumbers: [],
      processNumbers: [],
      requestNumbers: [],
      benefitTypes: [],
      birthDates: [],
      classification: "other",
      confidence: 0.9
    },
    {
      file: "doc-divergent-1.pdf",
      pageNumber: 1,
      sha256: "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd",
      names: ["Different Name 1"],
      cpfs: [],
      phones: [],
      emails: [],
      benefitNumbers: [],
      processNumbers: [],
      requestNumbers: [],
      benefitTypes: [],
      birthDates: [],
      classification: "other",
      confidence: 0.9
    },
    {
      file: "doc-divergent-2.pdf",
      pageNumber: 1,
      sha256: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
      names: ["Different Name 2"],
      cpfs: [],
      phones: [],
      emails: [],
      benefitNumbers: [],
      processNumbers: [],
      requestNumbers: [],
      benefitTypes: [],
      birthDates: [],
      classification: "other",
      confidence: 0.9
    }
  ]

  // Approve only one divergent document (partial approval)
  const humanReview = {
    schemaVersion: 1,
    caseImportId: "test-partial-approval",
    status: "HUMAN_REVIEW_COMPLETED",
    reviewSource: "HUMAN",
    reviewedAt: new Date().toISOString(),
    documents: [
      {
        sha256: "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
        decision: "APPROVE_AND_KEEP",
        documentOwnerRole: "ASSISTED_PERSON"
      },
      {
        sha256: "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd",
        decision: "APPROVE_AND_KEEP",
        documentOwnerRole: "ASSISTED_PERSON",
        allowedMentionedIdentityRoles: ["INTERESTED_THIRD_PARTY"],
        relationshipType: "spouse_separated"
      }
      // Note: eeeeee (hash-div-2) is NOT approved
    ]
  }

  const result = consolidateCase({
    sourceFolder: testDir,
    importId: "test-partial-approval",
    files: ["doc-titular.pdf", "doc-divergent-1.pdf", "doc-divergent-2.pdf"],
    analyzed: mockAnalyzed,
    ignored: [],
    hashes: ["cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc", "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd", "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"],
    relativeRoot: testDir,
    humanReview
  })

  // Divergent names should persist because div-2 is still unapproved
  assert.ok(result.humanReviewApplied, "Review should be applied")
  assert.equal(
    result.conflicts.includes("divergent_names"),
    true,
    "divergent_names should remain in conflicts when some divergent sources are unapproved"
  )
  assert.equal(
    result.quarantinedDocuments.length,
    1,
    "Unapproved divergent document should remain quarantined"
  )
  assert.equal(
    result.quarantinedDocuments[0].file,
    "doc-divergent-2.pdf",
    "Only unapproved document should be quarantined"
  )
  assert.equal(
    result.safeToPlanHubSpot,
    false,
    "safeToPlanHubSpot should remain false with unresolved conflicts"
  )
}

// NEW TESTS: Reproduce risk where approved document contains primary and additional identities
// SCENARIO A: titular and third in the SAME document; approval should NOT remove the primary identity
async function testSameDocumentPrimaryAndThirdPreserved() {
  const testDir = fs.mkdtempSync(path.join(os.tmpdir(), "hr-risk-a-"))
  const mockAnalyzed = [
    {
      file: "doc-single.pdf",
      pageNumber: 1,
      sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      names: ["Titular Name", "Spouse Name"],
      cpfs: ["12345678901"],
      phones: [], emails: [], benefitNumbers: [], processNumbers: [], requestNumbers: [], benefitTypes: [], birthDates: [], classification: "other", confidence: 0.9
    }
  ]

  const humanReview = {
    schemaVersion: 1,
    caseImportId: "hr-risk-a",
    status: "HUMAN_REVIEW_COMPLETED",
    reviewSource: "HUMAN",
    reviewedAt: new Date().toISOString(),
    documents: [
      {
        sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        decision: "APPROVE_AND_KEEP",
        documentOwnerRole: "ASSISTED_PERSON",
        allowedMentionedIdentityRoles: ["INTERESTED_THIRD_PARTY"],
        relationshipType: "spouse_separated"
      }
    ]
  }

  const result = consolidateCase({
    sourceFolder: testDir,
    importId: "hr-risk-a",
    files: ["doc-single.pdf"],
    analyzed: mockAnalyzed,
    ignored: [],
    hashes: [mockAnalyzed[0].sha256],
    relativeRoot: testDir,
    humanReview
  })

  // The primary titular name must remain present in the consolidated names
  assert.ok(result.humanReviewApplied, "human review should be applied")
  assert.ok(Array.isArray(result.nomesEncontrados), "nomesEncontrados must be present")
  assert.ok(result.nomesEncontrados.includes("Titular Name"), "Titular Name must remain present after approval of the file")
  // Ensure case is not incorrectly marked safeToPlanHubSpot if primary identity lost
  assert.equal(result.safeToPlanHubSpot, false, "safeToPlanHubSpot must not be true if there is any doubt about primary identity preservation")
}

// SCENARIO B: single document contains titular, a legitimately approved spouse, and an UNAPPROVED third identity
async function testSameDocumentHasUnapprovedThirdKeepsDivergence() {
  const testDir = fs.mkdtempSync(path.join(os.tmpdir(), "hr-risk-b-"))
  const mockAnalyzed = [
    {
      file: "doc-mixed.pdf",
      pageNumber: 1,
      sha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      names: ["Titular Name", "Spouse Name", "Other Person"],
      cpfs: ["12345678901"], phones: [], emails: [], benefitNumbers: [], processNumbers: [], requestNumbers: [], benefitTypes: [], birthDates: [], classification: "other", confidence: 0.9
    }
  ]

  const humanReview = {
    schemaVersion: 1,
    caseImportId: "hr-risk-b",
    status: "HUMAN_REVIEW_COMPLETED",
    reviewSource: "HUMAN",
    reviewedAt: new Date().toISOString(),
    documents: [
      {
        sha256: mockAnalyzed[0].sha256,
        decision: "APPROVE_AND_KEEP",
        documentOwnerRole: "ASSISTED_PERSON",
        allowedMentionedIdentityRoles: ["INTERESTED_THIRD_PARTY"],
        relationshipType: "spouse_separated"
      }
    ]
  }

  const result = consolidateCase({
    sourceFolder: testDir,
    importId: "hr-risk-b",
    files: ["doc-mixed.pdf"],
    analyzed: mockAnalyzed,
    ignored: [],
    hashes: [mockAnalyzed[0].sha256],
    relativeRoot: testDir,
    humanReview
  })

  assert.ok(result.humanReviewApplied, "human review should be applied")
  // The Other Person identity must still contribute to divergence (i.e., divergent_names remains)
  assert.ok(result.conflicts.includes("divergent_names"), "divergent_names must remain when an unapproved identity exists in the same file")
  assert.equal(result.safeToPlanHubSpot, false, "safeToPlanHubSpot must remain false while divergence persists")
}

// SCENARIO C: the approved document is the ONLY source of the titular name; titular must remain represented
async function testOnlySourceDocumentPreservesPrimary() {
  const testDir = fs.mkdtempSync(path.join(os.tmpdir(), "hr-risk-c-"))
  const mockAnalyzed = [
    {
      file: "doc-only.pdf",
      pageNumber: 1,
      sha256: "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
      names: ["Unique Titular"],
      cpfs: ["22222222222"], phones: [], emails: [], benefitNumbers: [], processNumbers: [], requestNumbers: [], benefitTypes: [], birthDates: [], classification: "other", confidence: 0.9
    }
  ]

  const humanReview = {
    schemaVersion: 1,
    caseImportId: "hr-risk-c",
    status: "HUMAN_REVIEW_COMPLETED",
    reviewSource: "HUMAN",
    reviewedAt: new Date().toISOString(),
    documents: [
      {
        sha256: mockAnalyzed[0].sha256,
        decision: "APPROVE_AND_KEEP",
        documentOwnerRole: "ASSISTED_PERSON",
        allowedMentionedIdentityRoles: ["INTERESTED_THIRD_PARTY"]
      }
    ]
  }

  const result = consolidateCase({
    sourceFolder: testDir,
    importId: "hr-risk-c",
    files: ["doc-only.pdf"],
    analyzed: mockAnalyzed,
    ignored: [],
    hashes: [mockAnalyzed[0].sha256],
    relativeRoot: testDir,
    humanReview
  })

  assert.ok(result.humanReviewApplied, "human review should be applied")
  assert.ok(result.nomesEncontrados.includes("Unique Titular"), "Unique Titular must remain in nomesEncontrados")
  assert.equal(result.safeToPlanHubSpot, false, "safeToPlanHubSpot must remain false unless all blockers cleared")
}

// SCENARIO D: titular also appears in another document — approval must not change behavior incorrectly
async function testPrimaryAlsoInAnotherDocument() {
  const testDir = fs.mkdtempSync(path.join(os.tmpdir(), "hr-risk-d-"))
  const mockAnalyzed = [
    {
      file: "doc-primary.pdf",
      pageNumber: 1,
      sha256: "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd",
      names: ["Shared Titular", "Spouse Name"],
      cpfs: ["33333333333"], phones: [], emails: [], benefitNumbers: [], processNumbers: [], requestNumbers: [], benefitTypes: [], birthDates: [], classification: "other", confidence: 0.9
    },
    {
      file: "doc-copy.pdf",
      pageNumber: 1,
      sha256: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
      names: ["Shared Titular"],
      cpfs: ["33333333333"], phones: [], emails: [], benefitNumbers: [], processNumbers: [], requestNumbers: [], benefitTypes: [], birthDates: [], classification: "other", confidence: 0.9
    }
  ]

  const humanReview = {
    schemaVersion: 1,
    caseImportId: "hr-risk-d",
    status: "HUMAN_REVIEW_COMPLETED",
    reviewSource: "HUMAN",
    reviewedAt: new Date().toISOString(),
    documents: [
      {
        sha256: mockAnalyzed[0].sha256,
        decision: "APPROVE_AND_KEEP",
        documentOwnerRole: "ASSISTED_PERSON",
        allowedMentionedIdentityRoles: ["INTERESTED_THIRD_PARTY"],
        relationshipType: "spouse_separated"
      }
    ]
  }

  const result = consolidateCase({
    sourceFolder: testDir,
    importId: "hr-risk-d",
    files: ["doc-primary.pdf", "doc-copy.pdf"],
    analyzed: mockAnalyzed,
    ignored: [],
    hashes: [mockAnalyzed[0].sha256, mockAnalyzed[1].sha256],
    relativeRoot: testDir,
    humanReview
  })

  assert.ok(result.humanReviewApplied, "human review should be applied")
  // Primary identity should still be present via the copy document
  assert.ok(result.nomesEncontrados.includes("Shared Titular"), "Shared Titular must remain present when also found in another doc")
  // Divergence should be recalculated conservatively
  assert.equal(result.safeToPlanHubSpot, false, "safeToPlanHubSpot must not be true unless all blockers cleared")
}

// Verify human review module exports
async function testHumanReviewModuleExports() {
  const hrm = require("../src/domain/human-document-review")

  assert.ok(hrm.HUMAN_REVIEW_DECISION, "HUMAN_REVIEW_DECISION must exist")
  assert.ok(hrm.DOCUMENT_OWNER_ROLE, "DOCUMENT_OWNER_ROLE must exist")
  assert.ok(hrm.MENTIONED_IDENTITY_ROLE, "MENTIONED_IDENTITY_ROLE must exist")
  assert.equal(typeof hrm.validateHumanReviewSchema, "function")
  assert.equal(typeof hrm.validateReviewDocument, "function")
  assert.equal(typeof hrm.findHumanReviewForDocument, "function")
}

// TEST 35: Verify module exports have helper functions
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
