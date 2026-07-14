"use strict"
const fs = require("node:fs")
const fsp = require("node:fs/promises")
const path = require("node:path")
const crypto = require("node:crypto")
const sharp = require("sharp")
const { createWorker, OEM } = require("tesseract.js")
const { executarPipelineDocumental } = require("./document-pipeline-orchestrator")

// Shared file exclusion rule (must match import-real-cases.js)
function shouldIgnoreInventoryFile(fileName) {
  // Ignore Office temporary files (e.g., ~$document.doc, ~$report.xlsx)
  return path.basename(fileName).startsWith('~$')
}

// Classify which reasons block HubSpot planning
function getBlockingReviewReasons(reviewReasons = []) {
  // Reasons that can be resolved during apply should not block HubSpot planning
  const resolvableDuringApply = new Set([
    'negocio_sem_numero_oficial',  // Number is generated in apply
    'official_number_missing'      // Same as above in analysis context
  ])
  return reviewReasons.filter(reason => !resolvableDuringApply.has(reason))
}
const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg", "image/png", "image/webp", "image/tiff", "image/heic", "image/heif", "application/pdf"
])
const DEFAULT_LIMITS = Object.freeze({ maxFileBytes: 20 * 1024 * 1024, maxFilesPerCase: 40, maxPdfPages: 12, maxPixels: 25 * 1000 * 1000, maxDimension: 10000, maxWidth: 10000, maxHeight: 10000, ocrTimeoutMs: 60 * 1000 })
const CACHE_VERSION = 1
const sha256 = buffer => crypto.createHash("sha256").update(buffer).digest("hex")
const unique = values => [...new Set(values.filter(Boolean))]
const digits = value => String(value || "").replace(/\D/g, "")
const normalizeKey = value => String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "")
function validCpf(value) {
  const cpf = digits(value)
  if (cpf.length !== 11 || /^(\d)\1+$/.test(cpf)) return false
  for (let size = 9; size <= 10; size++) {
    let sum = 0
    for (let index = 0; index < size; index++) sum += Number(cpf[index]) * (size + 1 - index)
    if ((sum * 10) % 11 % 10 !== Number(cpf[size])) return false
  }
  return true
}
function normalizePhone(value) {
  let phone = digits(value)
  if (phone.startsWith("00")) phone = phone.slice(2)
  if (!phone.startsWith("55") && (phone.length === 10 || phone.length === 11)) phone = `55${phone}`
  return /^55\d{10,11}$/.test(phone) ? phone : ""
}
function normalizeEmail(value) {
  const email = String(value || "").trim().toLowerCase()
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) ? email : ""
}
function normalizeName(value) {
  return String(value || "").replace(/\s+/g, " ").replace(/^[\s:;,.\-]+|[\s:;,.\-]+$/g, "").trim()
}
function normalizeDate(value) {
  const text = String(value || "").trim()
  let match = text.match(/^(\d{2})[/-](\d{2})[/-](\d{4})$/)
  if (match) return `${match[3]}-${match[2]}-${match[1]}`
  match = text.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  return match ? text : ""
}
function detectMime(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 4) return ""
  if (buffer.subarray(0, 5).toString("ascii") === "%PDF-") return "application/pdf"
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "image/jpeg"
  if (buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png"
  if (buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "WEBP") return "image/webp"
  const header = buffer.subarray(0, 4).toString("hex")
  if (header === "49492a00" || header === "4d4d002a") return "image/tiff"
  if (buffer.subarray(4, 8).toString("ascii") === "ftyp") {
    const brand = buffer.subarray(8, 12).toString("ascii").toLowerCase()
    if (["heic", "heix", "hevc", "hevx"].includes(brand)) return "image/heic"
    if (["heif", "heim", "heis", "mif1", "msf1"].includes(brand)) return "image/heif"
  }
  return ""
}
function extensionMatchesMime(file, mimeType) {
  const extension = path.extname(file).toLowerCase()
  const expected = {
    ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp",
    ".tif": "image/tiff", ".tiff": "image/tiff", ".heic": "image/heic", ".heif": "image/heif", ".pdf": "application/pdf"
  }[extension]
  return expected === mimeType
}
async function renderPdfPages(buffer, maxPages, limits = DEFAULT_LIMITS, dependencies = {}) {
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs")
  const createCanvas = dependencies.createCanvas || (await import("@napi-rs/canvas")).createCanvas
  const document = await getDocument({ data: new Uint8Array(buffer), disableWorker: true, useSystemFonts: true }).promise
  const pageCount = Math.min(document.numPages, maxPages)
  const pages = []
  const pageErrors = []
  try {
    for (let pageNumber = 1; pageNumber <= pageCount; pageNumber++) {
      let page
      try {
        try {
          page = await document.getPage(pageNumber)
          const viewport = page.getViewport({ scale: 1.7 })
          if (viewport.width > limits.maxWidth || viewport.height > limits.maxHeight || viewport.width * viewport.height > limits.maxPixels) {
            const error = new Error("pdf_page_dimension_limit")
            error.code = "PDF_PAGE_DIMENSION_LIMIT"
            error.pageNumber = pageNumber
            throw error
          }
          const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height))
          const context = canvas.getContext("2d")
          context.fillStyle = "#ffffff"
          context.fillRect(0, 0, canvas.width, canvas.height)
          try {
            await page.render({ canvasContext: context, viewport }).promise
            pages.push(Buffer.from(await canvas.encode("png")))
          } catch (renderError) {
            // Falha no render, registra apenas código técnico
            pageErrors.push({ pageNumber, code: renderError.message || "PDF_RENDER_ERROR" })
          }
        } finally {
          if (page) page.cleanup()
        }
      } catch (pageError) {
        // Falha na obtenção da página ou validação
        pageErrors.push({ pageNumber, code: pageError.code || pageError.message || "PDF_PAGE_ERROR" })
      }
    }
    // Se não conseguiu renderizar nenhuma página, considera erro total
    if (pages.length === 0 && pageErrors.length > 0) {
      const firstError = pageErrors[0]
      const error = new Error(firstError.code)
      error.code = firstError.code
      error.pageNumber = firstError.pageNumber
      throw error
    }
    return { pages, totalPages: document.numPages, truncated: document.numPages > maxPages, pageErrors: pageErrors.length > 0 ? pageErrors : undefined }
  } finally {
    await document.destroy()
  }
}
async function ocrWithTimeout(input, options = {}) {
  let worker
  let timer
  const timeoutMs = options.timeoutMs
  try {
    worker = await (options.createWorker || createWorker)(options.language || "por", options.oem || OEM.LSTM_ONLY, options.workerOptions || {}, options.workerConfig || {})
    const recognition = worker.recognize(input.buffer)
    const timeout = new Promise((resolve, reject) => {
      timer = setTimeout(async () => {
        try { await worker.terminate() } catch {}
        const error = new Error("ocr_timeout")
        error.code = "OCR_TIMEOUT"
        reject(error)
      }, timeoutMs)
    })
    const result = await Promise.race([recognition, timeout])
    return { textoCompleto: result?.data?.text || "", paginasProcessadas: 1, confianca: Number.isFinite(result?.data?.confidence) ? result.data.confidence : null, avisos: [], erros: [] }
  } finally {
    clearTimeout(timer)
    if (worker) { try { await worker.terminate() } catch {} }
  }
}
async function processPage(buffer, mimeType, options = {}) {
  const language = require("@tesseract.js-data/por")
  return executarPipelineDocumental({ buffer, mimeType }, {
    mimeType,
    executarOCRImagem: (input, ocrOptions) => ocrWithTimeout(input, { ...ocrOptions, timeoutMs: options.timeoutMs, createWorker: options.createWorker }),
    ocrOptions: {
      language: language.code,
      workerOptions: { langPath: language.langPath, gzip: language.gzip, cacheMethod: "none" }
    }
  })
}
async function imageWithinLimits(buffer, limits) {
  const metadata = await sharp(buffer, { limitInputPixels: limits.maxPixels }).metadata()
  const width = Number(metadata.width || 0)
  const height = Number(metadata.height || 0)
  return width > 0 && height > 0 && width <= limits.maxDimension && height <= limits.maxDimension && width * height <= limits.maxPixels
}
function transientTextFields(text) {
  const phones = (String(text).match(/(?:\+?55\s*)?(?:\(?\d{2}\)?[\s.-]*)?9?\d{4}[\s.-]*\d{4}/g) || []).map(normalizePhone)
  const emails = (String(text).match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || []).map(normalizeEmail)
  // Extrair número de requerimento: procura por rótulo + número
  const reqPattern = /(?:requerimento|protocolo|n[uú]mero\s+(?:de\s+)?requerimento|n[uú]mero\s+(?:de\s+)?protocolo)\s*[:.-]?\s*(\d{5,})/gi
  const requestNumbers = []
  let reqMatch
  while ((reqMatch = reqPattern.exec(text)) !== null) {
    const num = String(reqMatch[1] || "").trim()
    if (num.length >= 5 && num.length <= 20 && !requestNumbers.includes(num)) {
      requestNumbers.push(num)
    }
  }
  return { phones: unique(phones), emails: unique(emails), requestNumbers: unique(requestNumbers) }
}
function canonicalizePipeline(pipeline, file, pageNumber) {
  const raw = pipeline?.extracao?.camposExtraidos || {}
  const fields = Object.fromEntries(Object.entries(raw).map(([key, value]) => [normalizeKey(key), value]))
  const textFields = transientTextFields(pipeline?.ocr?.textoCompleto || "")
  const names = unique([fields.nome, fields.nomecompleto].map(normalizeName))
  const cpfs = unique([fields.cpf].filter(validCpf).map(digits))
  const benefitNumbers = unique([fields.nb, fields.numerobeneficio].map(digits))
  const processNumbers = unique([fields.numero, fields.numeroprocesso, fields.numerodecaso].map(String).filter(value => /^\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}$/.test(value)))
  const benefitTypes = unique([fields.beneficio, fields.tipobeneficio].map(normalizeName))
  const birthDates = unique([fields.datanascimento, fields.datadenascimento].map(normalizeDate))
  return {
    file: path.basename(file), pageNumber,
    classification: pipeline?.classificacao?.tipoDocumento || "Documento desconhecido",
    confidence: Number(pipeline?.classificacao?.confianca || 0),
    names, cpfs, phones: textFields.phones, emails: textFields.emails,
    benefitNumbers, processNumbers, benefitTypes, birthDates, requestNumbers: textFields.requestNumbers,
    errors: [pipeline?.preprocessamento, pipeline?.ocr, pipeline?.classificacao, pipeline?.extracao]
      .flatMap(step => step?.erros || []).map(error => error.code || "processing_error")
  }
}
function normalizedNameSignature(value) {
  return normalizeName(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z ]/g, "").split(/\s+/).filter(part => part.length > 1).sort().join(" ")
}
function namesSignificantlyDiverge(names) {
  const signatures = unique(names.map(normalizedNameSignature))
  if (signatures.length < 2) return false
  const tokenSets = signatures.map(name => new Set(name.split(" ")))
  for (let left = 0; left < tokenSets.length; left++) {
    for (let right = left + 1; right < tokenSets.length; right++) {
      const intersection = [...tokenSets[left]].filter(token => tokenSets[right].has(token)).length
      const denominator = Math.max(tokenSets[left].size, tokenSets[right].size)
      if (!denominator || intersection / denominator < 0.6) return true
    }
  }
  return false
}
function consolidateCase({ sourceFolder, importId, files, analyzed, ignored, hashes, relativeRoot, humanReview }) {
  const { assertValidHumanReviewContext, reviewIdForSha256, HUMAN_REVIEW_DECISION } = require("./human-document-review")

  const collect = key => unique(analyzed.flatMap(item => item[key] || []))
  const cpfs = collect("cpfs")
  const conflicts = []
  if (cpfs.length > 1) conflicts.push("multiple_valid_cpfs")

  // When recalculating names for divergence check, use all extracted names.
  // Conservative fallback: human approval removes quarantine but DOES NOT exclude names from divergence calculation,
  // because the analyzer lacks identity-level attribution. This ensures divergent_names remains until fine-grained
  // identity attribution is available.
  const namesForDivergenceCheck = unique(
    analyzed.flatMap(item => item.names || [])
  )

  // Only add divergent_names if the remaining names (excluding legitimately approved additional identities) significantly diverge
  if (namesSignificantlyDiverge(namesForDivergenceCheck)) {
    conflicts.push("divergent_names")
  }

  const baselineQuarantined = analyzed.filter(item => {
    return (
      (cpfs.length > 1 && item.cpfs.length && item.cpfs.some(cpf => cpf !== cpfs[0])) ||
      (conflicts.includes("divergent_names") && item.names.length)
    )
  }).map(item => ({ file: item.file, pageNumber: item.pageNumber, sha256: item.sha256, reason: "identity_divergence" }))

  const approvedDocuments = new Set()
  if (humanReview) {
    const eligibleHashes = new Set(baselineQuarantined.map(item => item.sha256).filter(Boolean).map(value => value.toLowerCase()))
    const inventoryByHash = new Map()
    analyzed.forEach(item => {
      if (!item.sha256 || inventoryByHash.has(item.sha256.toLowerCase())) return
      inventoryByHash.set(item.sha256.toLowerCase(), {
        sha256: item.sha256,
        reviewId: reviewIdForSha256(item.sha256),
        eligibleForHumanReview: eligibleHashes.has(item.sha256.toLowerCase())
      })
    })
    assertValidHumanReviewContext(humanReview, { caseImportId: importId, documents: [...inventoryByHash.values()] })
    humanReview.documents
      .filter(document => document.decision === HUMAN_REVIEW_DECISION.APPROVE_AND_KEEP)
      .forEach(document => approvedDocuments.add(document.sha256.toLowerCase()))
  }

  const quarantined = baselineQuarantined.filter(item => !approvedDocuments.has(String(item.sha256 || "").toLowerCase()))
  if (quarantined.length) conflicts.push("documents_quarantined")

  // Collect all names (original behavior for field reporting, not for divergence checking)
  const names = collect("names")
  const reviewReasons = [...conflicts]
  if (!cpfs.length) reviewReasons.push("cpf_missing")
  if (!names.length) reviewReasons.push("name_missing")
  if (!collect("phones").length && !collect("emails").length) reviewReasons.push("safe_contact_key_missing")
  if (!collect("processNumbers").length) reviewReasons.push("official_number_missing")

  // Check if there are problematic ignored files (not just Office temps which are already filtered)
  const problematicIgnored = ignored.filter(item =>
    item.reason !== 'case_document_limit' &&
    !['unsupported_or_invalid_content', 'file_size_limit'].includes(item.reason)
  )
  if (problematicIgnored.length) reviewReasons.push("ignored_files_present")

  const confidences = analyzed.map(item => item.confidence).filter(Number.isFinite)
  const birthDates = collect("birthDates")
  const processNumbers = collect("processNumbers")
  const requestNumbers = collect("requestNumbers")
  const benefitNumbers = collect("benefitNumbers")
  const benefitTypes = collect("benefitTypes")

  // Calculate documentsPending:
  // null = analysis not conclusive (render failures, pdf_page_limit, etc)
  // false = analysis complete, no pending documents detected
  // true = analysis complete, pending documents detected (marked by analyzer)
  let documentsPending = false
  const hasAnalysisFailures = ignored.some(item =>
    ['pdf_render_failed', 'pdf_page_limit', 'extension_content_mismatch'].includes(item.reason)
  )
  const hasQuarantinedDocs = quarantined.length > 0
  if (hasAnalysisFailures || hasQuarantinedDocs || analyzed.length === 0) {
    documentsPending = null
  }

  const blockingReasons = getBlockingReviewReasons(reviewReasons)
  const safeToPlanHubSpot = blockingReasons.length === 0 && cpfs.length === 1 && names.length >= 1

  return {
    sourceFolder: path.relative(relativeRoot, sourceFolder) || path.basename(sourceFolder), importId,
    fileCount: files.length, analyzedFileCount: unique(analyzed.map(item => item.file)).length,
    ignoredFileCount: ignored.length, contentHashes: unique(hashes),
    nomesEncontrados: names, cpfsEncontrados: cpfs, telefonesEncontrados: collect("phones"),
    emailsEncontrados: collect("emails"), numerosBeneficioEncontrados: collect("benefitNumbers"),
    numerosProcessoEncontrados: processNumbers, numerosRequerimentoEncontrados: requestNumbers,
    tiposBeneficioEncontrados: benefitTypes, datasNascimentoEncontradas: birthDates,
    documentosClassificados: analyzed.map(item => ({ file: item.file, pageNumber: item.pageNumber, tipo: item.classification, confidence: item.confidence })),
    confidence: confidences.length ? Number((confidences.reduce((sum, value) => sum + value, 0) / confidences.length).toFixed(4)) : 0,
    conflicts, reviewReasons: unique(reviewReasons), blockingReviewReasons: unique(blockingReasons),
    documentsPending, mappedType: null, plannedStage: null,
    safeToPlanHubSpot, canonicalSuggestions: {
      date_of_birth: birthDates.length === 1 ? birthDates[0] : null,
      numero_de_caso: processNumbers.length === 1 ? processNumbers[0] : null,
      numero_requerimento: requestNumbers.length === 1 ? requestNumbers[0] : null,
      numero_beneficio: benefitNumbers.length === 1 ? benefitNumbers[0] : null,
      tipo_de_caso_suggestion: benefitTypes.length === 1 ? benefitTypes[0] : null
    },
    quarantinedDocuments: quarantined, ignoredFiles: ignored,
    humanReviewApplied: Boolean(humanReview && humanReview.status === "HUMAN_REVIEW_COMPLETED"),
    humanReviewStatus: humanReview ? humanReview.status : null
  }
}
async function walkFiles(directory) {
  const files = []
  const queue = [directory]
  while (queue.length) {
    const current = queue.shift()
    const entries = await fsp.readdir(current, { withFileTypes: true })
    for (const entry of entries) {
      const full = path.join(current, entry.name)
      if (entry.isDirectory()) queue.push(full)
      else if (entry.isFile() && !shouldIgnoreInventoryFile(entry.name)) files.push(full)
    }
  }
  return files.sort()
}
async function readCache(cacheFile) {
  try {
    const value = JSON.parse(await fsp.readFile(cacheFile, "utf8"))
    return value.version === CACHE_VERSION ? value : { version: CACHE_VERSION, files: {} }
  } catch { return { version: CACHE_VERSION, files: {} } }
}
async function atomicJson(file, value) {
  await fsp.mkdir(path.dirname(file), { recursive: true })
  const temporary = `${file}.${process.pid}.tmp`
  await fsp.writeFile(temporary, JSON.stringify(value, null, 2), { encoding: "utf8", mode: 0o600 })
  await fsp.rename(temporary, file)
}
async function analyzeCaseFolder(folder, options = {}) {
  const limits = { ...DEFAULT_LIMITS, ...(options.limits || {}) }
  const files = await walkFiles(folder)
  const selected = files.slice(0, limits.maxFilesPerCase)
  const ignored = files.slice(limits.maxFilesPerCase).map(file => ({ file: path.relative(folder, file), reason: "case_document_limit" }))
  const analyzed = []
  const hashes = []
  for (const file of selected) {
    const relativeFile = path.relative(folder, file)
    const stat = await fsp.stat(file)
    if (stat.size > limits.maxFileBytes) { ignored.push({ file: relativeFile, reason: "file_size_limit" }); continue }
    const buffer = await fsp.readFile(file)
    const hash = sha256(buffer)
    hashes.push(hash)
    const mimeType = detectMime(buffer)
    if (!ALLOWED_MIME_TYPES.has(mimeType)) { ignored.push({ file: relativeFile, reason: "unsupported_or_invalid_content" }); continue }
    if (!extensionMatchesMime(file, mimeType)) { ignored.push({ file: relativeFile, reason: "extension_content_mismatch" }); continue }
    let pages = [{ buffer, mimeType }]
    let pdfInfo = null
    if (mimeType === "application/pdf") {
      try {
        pdfInfo = await (options.renderPdfPages || renderPdfPages)(buffer, limits.maxPdfPages, limits)
        pages = pdfInfo.pages.map(page => ({ buffer: page, mimeType: "image/png" }))
      } catch (error) {
        ignored.push({
          file: relativeFile,
          ...(error.pageNumber ? { pageNumber: error.pageNumber } : {}),
          reason: error.code === "PDF_PAGE_DIMENSION_LIMIT" ? "pdf_page_dimension_limit" : "pdf_render_failed",
          code: error.code || "PDF_RENDER_ERROR"
        })
        continue
      }
    }
    const results = []
    for (let index = 0; index < pages.length; index++) {
      try {
        if (!await imageWithinLimits(pages[index].buffer, limits)) {
          ignored.push({ file: relativeFile, pageNumber: index + 1, reason: "image_dimension_limit" })
          continue
        }
        const pipeline = await (options.processPage || processPage)(pages[index].buffer, pages[index].mimeType, { timeoutMs: limits.ocrTimeoutMs, createWorker: options.createWorker })
        const pipelineErrors = [pipeline?.preprocessamento, pipeline?.ocr, pipeline?.classificacao, pipeline?.extracao]
          .flatMap(step => step?.erros || [])
        if (pipelineErrors.some(error => error?.code === "OCR_TIMEOUT")) {
          ignored.push({ file: relativeFile, pageNumber: index + 1, reason: "ocr_timeout", code: "OCR_TIMEOUT" })
          continue
        }
        results.push(canonicalizePipeline(pipeline, relativeFile, index + 1))
      } catch (error) {
        ignored.push({ file: relativeFile, pageNumber: index + 1, reason: error.code === "OCR_TIMEOUT" || error.message === "ocr_timeout" ? "ocr_timeout" : "processing_error", code: error.code || "PROCESSING_ERROR" })
      }
    }
    if (pdfInfo?.truncated) ignored.push({ file: relativeFile, reason: "pdf_page_limit", totalPages: pdfInfo.totalPages })
    analyzed.push(...results)
    if (options.cache) options.cache.files[hash] = { mimeType, byteLength: buffer.length, pageCount: pages.length, processed: results.length > 0 }
  }
   const importId = `inss-${sha256(Buffer.from(path.resolve(folder).toLowerCase())).slice(0, 20)}`
  return consolidateCase({ sourceFolder: folder, importId, files, analyzed, ignored, hashes, relativeRoot: options.relativeRoot || path.dirname(folder), humanReview: options.humanReview })
}
function csvEscape(value) {
  const text = Array.isArray(value) ? value.join(" | ") : String(value ?? "")
  return `"${text.replace(/"/g, '""')}"`
}
function sanitizedFieldState(count, conflicting = false, illegible = false) {
  if (conflicting || count > 1) return "conflitante"
  if (count === 1) return "encontrado"
  if (illegible) return "ilegível"
  return "não encontrado"
}

function sanitizeReviewReasons(reasons = []) {
  // Whitelist of known safe technical reason codes
  const SAFE_TECHNICAL_REASONS = new Set([
    "pdf_invalid_arg",
    "pdf_invalid_structure",
    "pdf_parse_error",
    "pdf_page_error",
    "pdf_render_error",
    "pdf_page_dimension_limit",
    "ocr_timeout",
    "ocr_no_text",
    "ocr_low_confidence",
    "arquivo_acima_do_limite",
    "arquivo_tamanho_zero",
    "arquivo_corrupto",
    "arquivo_vazio",
    "extensao_nao_suportada",
    "mime_invalido",
    "formato_nao_suportado",
    "documento_nao_suportado",
    "pagina_sem_texto",
    "pagina_ilegivel",
    "imagem_invalida",
    "canvas_error",
    "processing_error",
    "encoding_error",
    "buffer_error",
    "stream_error",
    "file_read_error",
    "file_access_denied",
    "sistema_indisponivel",
    "timeout",
    "limite_tempo_excedido",
    "memoria_insuficiente"
  ])

  const sanitized = []

  for (const reason of reasons) {
    if (!reason) continue

    const str = String(reason).toLowerCase().trim()

    // Strategy 1: If exactly matches a whitelisted technical code, accept
    if (SAFE_TECHNICAL_REASONS.has(str)) {
      sanitized.push(str)
      continue
    }

    // Strategy 2: If it matches a pure technical code format, check more carefully
    // Format: only lowercase letters, digits, underscores, hyphens
    if (/^[a-z0-9_-]+$/.test(str)) {
      // Check if it contains personal data patterns embedded in the code
      // Patterns to check: all digits, formatted numbers, keywords with data

      // Reject: only digits (likely a number without label)
      if (/^\d+$/.test(str)) continue

      // Reject: formatted number patterns (CPF: ###.###.###-##)
      if (/\d{3}\.\d{3}\.\d{3}-\d{2}/.test(str)) continue

      // Reject: contains 8+ consecutive digits (benefit, request, process, date)
      if (/\d{8,}/.test(str)) continue

      // Reject: contains 10+ consecutive digits (phone, CPF unformatted)
      if (/\d{10,}/.test(str)) continue

      // Reject: contains personal data keyword followed by number
      // Example: "erro_cpf_12345678909", "erro_telefone_5581999998888"
      if (/(cpf|rg|telefone|phone|email|beneficio|requerimento|request|processo|process|nascimento|birth|data|date|arquivo|file|documento|document|caminho|path)_\d/.test(str)) continue

      // Reject: contains personal data keyword followed by name-like pattern
      if (/(nome|name)_[a-z]+/.test(str)) continue

      // If passed all checks, it's likely a safe technical code
      sanitized.push(str)
      continue
    }

    // Strategy 3: If it contains uppercase letters, spaces, or special chars
    // it's likely not a controlled technical code → reject it
    // This catches: "JOÃO SILVA", "John Smith", mixed case codes, etc.
    if (/[A-Z]|[^\w-]/.test(str)) {
      // UNLESS it's a known safe code, reject
      continue
    }

    // If we get here and it's not in whitelist, reject (conservative approach)
  }

  return unique(sanitized)
}
function sanitizeCaseAnalysis(item = {}, caseIndex = 0) {
  const originalFiles = unique([
    ...(item.documentosClassificados || []).map(document => document.file),
    ...(item.ignoredFiles || []).map(document => document.file),
    ...(item.quarantinedDocuments || []).map(document => document.file)
  ]).sort()
  const fileIds = new Map(originalFiles.map((file, index) => [file, `arquivo-${String(index + 1).padStart(3, "0")}`]))
  const ignoredFiles = (item.ignoredFiles || []).map(document => ({
    arquivoId: fileIds.get(document.file) || "arquivo-não-identificado",
    ...(document.pageNumber ? { pagina: document.pageNumber } : {}),
    motivo: document.reason || "processing_error",
    ...(document.code ? { codigo: document.code } : {}),
    ...(document.totalPages ? { totalPaginas: document.totalPages } : {})
  }))
  const classified = (item.documentosClassificados || []).map(document => ({
    arquivoId: fileIds.get(document.file) || "arquivo-não-identificado",
    pagina: document.pageNumber,
    categoria: document.tipo || "Documento desconhecido",
    confianca: Number(document.confidence || 0)
  }))
  const categories = Object.entries(classified.reduce((result, document) => {
    result[document.categoria] = (result[document.categoria] || 0) + 1
    return result
  }, {})).sort(([left], [right]) => left.localeCompare(right)).map(([categoria, quantidade]) => ({ categoria, quantidade }))
  const conflicts = unique(item.conflicts || [])
  const illegible = !classified.length && ignoredFiles.length > 0
  const count = key => Array.isArray(item[key]) ? item[key].length : 0
  const fields = {
    identidade: sanitizedFieldState(count("nomesEncontrados"), conflicts.includes("divergent_names"), illegible),
    cpf: sanitizedFieldState(count("cpfsEncontrados"), conflicts.includes("multiple_valid_cpfs"), illegible),
    telefone: sanitizedFieldState(count("telefonesEncontrados"), false, illegible),
    email: sanitizedFieldState(count("emailsEncontrados"), false, illegible),
    contato: sanitizedFieldState(Math.min(1, count("telefonesEncontrados") + count("emailsEncontrados")), false, illegible),
    numeroBeneficio: sanitizedFieldState(count("numerosBeneficioEncontrados"), false, illegible),
    numeroRequerimento: sanitizedFieldState(count("numerosRequerimentoEncontrados"), false, illegible),
    numeroOficial: sanitizedFieldState(count("numerosProcessoEncontrados"), false, illegible),
    tipoPrevidenciario: sanitizedFieldState(count("tiposBeneficioEncontrados"), false, illegible),
    dataRelevante: sanitizedFieldState(count("datasNascimentoEncontradas"), false, illegible)
  }
  const limitsReached = unique(ignoredFiles.filter(document => /limit|timeout/.test(`${document.motivo} ${document.codigo || ""}`)).map(document => document.motivo))
  const unsupportedFormats = ignoredFiles.filter(document => ["unsupported_or_invalid_content", "extension_content_mismatch"].includes(document.motivo)).length
  const status = conflicts.length ? "CONFLITO DOCUMENTAL" : illegible ? "DOCUMENTOS ILEGÍVEIS" : Object.values(fields).some(value => value === "não encontrado") ? "DADOS AINDA INSUFICIENTES" : "CANDIDATO A REVISÃO HUMANA PARA LOTE PILOTO"
  // Diagnóstico sanitizado: apenas contagens e códigos, sem valores
  const diagnosticoCampos = {
    identidade: { candidatosDetectados: count("nomesEncontrados"), aceitos: Math.min(1, count("nomesEncontrados")), rejeitadosConflito: conflicts.includes("divergent_names") ? count("nomesEncontrados") - Math.min(1, count("nomesEncontrados")) : 0 },
    cpf: { candidatosDetectados: count("cpfsEncontrados"), aceitos: Math.min(1, count("cpfsEncontrados")), rejeitadosConflito: conflicts.includes("multiple_valid_cpfs") ? count("cpfsEncontrados") - Math.min(1, count("cpfsEncontrados")) : 0 },
    telefone: { candidatosDetectados: count("telefonesEncontrados"), aceitos: Math.min(1, count("telefonesEncontrados")) },
    email: { candidatosDetectados: count("emailsEncontrados"), aceitos: Math.min(1, count("emailsEncontrados")) },
    numeroBeneficio: { candidatosDetectados: count("numerosBeneficioEncontrados"), aceitos: Math.min(1, count("numerosBeneficioEncontrados")) },
    numeroRequerimento: { candidatosDetectados: count("numerosRequerimentoEncontrados"), aceitos: Math.min(1, count("numerosRequerimentoEncontrados")) },
    numeroProcesso: { candidatosDetectados: count("numerosProcessoEncontrados"), aceitos: Math.min(1, count("numerosProcessoEncontrados")) },
    tipoPrevidenciario: { candidatosDetectados: count("tiposBeneficioEncontrados"), aceitos: Math.min(1, count("tiposBeneficioEncontrados")) },
    dataNascimento: { candidatosDetectados: count("datasNascimentoEncontradas"), aceitos: Math.min(1, count("datasNascimentoEncontradas")) }
  }
  return {
    importId: `caso-${String(caseIndex + 1).padStart(3, "0")}`,
    status,
    contagens: {
      arquivos: Number(item.fileCount || 0),
      arquivosAnalisados: Number(item.analyzedFileCount || 0),
      arquivosIgnorados: Number(item.ignoredFileCount || 0),
      paginasClassificadas: classified.length,
      formatosNaoSuportados: unsupportedFormats
    },
    campos: fields,
    diagnosticoCampos,
    categoriasDocumentais: categories,
    confianca: Number(item.confidence || 0),
    conflitos: conflicts,
    motivosRevisao: sanitizeReviewReasons(item.reviewReasons),
    limitesAtingidos: limitsReached,
    avisosSeguranca: unique([
      ...(conflicts.length ? ["divergencia_documental"] : []),
      ...(unsupportedFormats ? ["formato_nao_suportado"] : []),
      ...(illegible ? ["conteudo_nao_analisado"] : [])
    ]),
    hashesTecnicos: unique(item.contentHashes || []),
    arquivos: classified,
    arquivosIgnorados: ignoredFiles
  }
}
function sanitizeAnalysisReport(report = {}) {
  return {
    version: report.version,
    generatedAt: report.generatedAt,
    caseCount: Number(report.caseCount || 0),
    durationMs: Number(report.durationMs || 0),
    cases: (report.cases || []).map((item, index) => sanitizeCaseAnalysis(item, index))
  }
}
function analysisSummaryCsv(cases) {
  const columns = ["importId", "status", "arquivos", "arquivosAnalisados", "arquivosIgnorados", "identidade", "cpf", "telefone", "email", "numeroRequerimento", "numeroOficial", "tipoPrevidenciario", "conflitos", "ilegibilidade", "formatosNaoSuportados", "confianca", "revisaoHumana"]
  const rows = cases.map(item => [item.importId, item.status, item.contagens.arquivos, item.contagens.arquivosAnalisados, item.contagens.arquivosIgnorados, item.campos.identidade, item.campos.cpf, item.campos.telefone, item.campos.email, item.campos.numeroRequerimento, item.campos.numeroOficial, item.campos.tipoPrevidenciario, item.conflitos.length, item.status === "DOCUMENTOS ILEGÍVEIS", item.contagens.formatosNaoSuportados, item.confianca, item.status !== "CANDIDATO A REVISÃO HUMANA PARA LOTE PILOTO"])
  return [columns, ...rows].map(row => row.map(csvEscape).join(",")).join("\n") + "\n"
}
async function writeAnalysisReports(stateDir, report, cache) {
  await fsp.mkdir(stateDir, { recursive: true })
  const sanitizedReport = sanitizeAnalysisReport(report)
  await atomicJson(path.join(stateDir, "latest-analysis.json"), sanitizedReport)
  await fsp.writeFile(path.join(stateDir, "latest-analysis-summary.csv"), analysisSummaryCsv(sanitizedReport.cases), { encoding: "utf8", mode: 0o600 })
  await atomicJson(path.join(stateDir, "analysis-cache.json"), cache)
}
module.exports = {
  ALLOWED_MIME_TYPES, DEFAULT_LIMITS, validCpf, normalizePhone, normalizeEmail, detectMime,
  shouldIgnoreInventoryFile, getBlockingReviewReasons,
  renderPdfPages, canonicalizePipeline, consolidateCase, analyzeCaseFolder, readCache, normalizeName, namesSignificantlyDiverge, ocrWithTimeout,
  writeAnalysisReports, analysisSummaryCsv, sanitizeCaseAnalysis, sanitizeAnalysisReport, sha256
}
