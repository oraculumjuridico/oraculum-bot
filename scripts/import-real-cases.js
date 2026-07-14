#!/usr/bin/env node
"use strict"

require("dotenv").config({ quiet: true })
const fs = require("node:fs")
const fsp = require("node:fs/promises")
const path = require("node:path")
const crypto = require("node:crypto")
const axios = require("axios")
const { montarTituloNegocioHubSpot } = require("../src/domain/hubspot-deal-title")
let planejarSincronizacaoDocumentalHubSpot
try {
  planejarSincronizacaoDocumentalHubSpot = require("../src/domain/document-hubspot-sync").planejarSincronizacaoDocumentalHubSpot
} catch (e) {
  // allow tests to inject a global implementation
  planejarSincronizacaoDocumentalHubSpot = global.planejarSincronizacaoDocumentalHubSpot || function () { return { contato: { props: {}, bloqueados: [] }, negocio: { props: {}, bloqueados: [] } } }
}
if (global.planejarSincronizacaoDocumentalHubSpot) planejarSincronizacaoDocumentalHubSpot = global.planejarSincronizacaoDocumentalHubSpot

const DEFAULT_ROOT = "C:\\Users\\jesai\\Documents\\ARQUIVOS PESSOAIS\\Direito\\INSS"
const STATE_DIR = path.resolve(process.env.CASE_IMPORT_STATE_DIR || "data/case-import")
const CHECKPOINT = path.join(STATE_DIR, "checkpoint.json")
const REPORT = path.join(STATE_DIR, "latest-report.json")
const command = process.argv[2] || "help"
const option = name => {
  const prefix = `--${name}=`
  const item = process.argv.find(arg => arg.startsWith(prefix))
  return item ? item.slice(prefix.length) : null
}
const root = path.resolve(option("root") || process.env.CASE_IMPORT_ROOT || DEFAULT_ROOT)
const concurrency = Math.max(1, Math.min(5, Number(option("concurrency") || 2)))
const liveConfirmation = option("confirm-live-import")
const allowReadonlyHubSpot = option("allow-readonly-hubspot") === "true"
const pilotSize = Math.max(0, Math.min(10, Number(option("pilot-size") || 0)))
const usePilotSelection = String(option("use-pilot-selection") || "").trim().toLowerCase() === "true"
const pilotSelectionFile = option("pilot-selection-file") || path.join(STATE_DIR, "pilot-selection.json")

const sha = value => crypto.createHash("sha256").update(String(value)).digest("hex")
const normalizeDigits = value => String(value || "").replace(/\D/g, "")
const normalizeEmail = value => String(value || "").trim().toLowerCase()
const mask = value => value ? `${String(value).slice(0, 2)}***${String(value).slice(-2)}` : ""
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
const safeJson = async (file, fallback) => {
  try { return JSON.parse(await fsp.readFile(file, "utf8")) } catch { return fallback }
}
async function atomicWrite(file, value) {
  await fsp.mkdir(path.dirname(file), { recursive: true })
  const temporary = `${file}.${process.pid}.tmp`
  await fsp.writeFile(temporary, JSON.stringify(value, null, 2), { mode: 0o600 })
  await fsp.rename(temporary, file)
}

function extractVerified(text) {
  const emails = [...new Set((text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || []).map(normalizeEmail))]
  const digitRuns = text.match(/(?:\+?55\s*)?(?:\(?\d{2}\)?[\s.-]*)?9?\d{4}[\s.-]*\d{4}/g) || []
  const phones = [...new Set(digitRuns.map(normalizeDigits).map(v => v.startsWith("55") ? v : `55${v}`).filter(v => v.length >= 12 && v.length <= 13))]
  const cpfCandidates = text.match(/\b\d{3}[.-]?\d{3}[.-]?\d{3}-?\d{2}\b/g) || []
  const cpfs = [...new Set(cpfCandidates.map(normalizeDigits).filter(validCpf))]
  const cases = [...new Set((text.match(/\b\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}\b/g) || []))]
  return { emails, phones, cpfs, officialNumbers: cases }
}

function validCpf(value) {
  const cpf = normalizeDigits(value)
  if (cpf.length !== 11 || /^(\d)\1+$/.test(cpf)) return false
  for (let size = 9; size <= 10; size++) {
    let sum = 0
    for (let i = 0; i < size; i++) sum += Number(cpf[i]) * (size + 1 - i)
    const check = (sum * 10) % 11 % 10
    if (check !== Number(cpf[size])) return false
  }
  return true
}

async function walk(directory) {
  const result = []
  const queue = [directory]
  while (queue.length) {
    const current = queue.shift()
    for (const entry of await fsp.readdir(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name)
      if (entry.isDirectory()) queue.push(full)
      else if (entry.isFile()) result.push(full)
    }
  }
  return result
}

function conservativeName(folderName) {
  const withoutIds = folderName
    .replace(/\b\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}\b/g, " ")
    .replace(/\b\d{3}[.-]?\d{3}[.-]?\d{3}-?\d{2}\b/g, " ")
    .replace(/[\d_()[\]{}]+/g, " ").replace(/\s+/g, " ").trim()
  return /^[\p{L}][\p{L}' -]{2,}$/u.test(withoutIds) ? withoutIds : ""
}

async function inspectCase(folder) {
  const files = await walk(folder)
  const relativeNames = files.map(file => path.relative(folder, file))
  const evidenceText = [path.basename(folder), ...relativeNames].join("\n")
  const extracted = extractVerified(evidenceText)
  const importId = `inss-${sha(path.relative(root, folder).toLowerCase()).slice(0, 20)}`
  const extensions = {}
  let bytes = 0
  for (const file of files) {
    const stat = await fsp.stat(file)
    bytes += stat.size
    const ext = path.extname(file).toLowerCase() || "[sem-extensao]"
    extensions[ext] = (extensions[ext] || 0) + 1
  }
  const conflicts = Object.entries(extracted).filter(([, values]) => values.length > 1).map(([field]) => field)
  const record = {
    importId,
    sourceHash: sha(`${path.relative(root, folder)}|${files.length}|${bytes}`),
    name: conservativeName(path.basename(folder)),
    cpf: extracted.cpfs.length === 1 ? extracted.cpfs[0] : "",
    phone: extracted.phones.length === 1 ? extracted.phones[0] : "",
    email: extracted.emails.length === 1 ? extracted.emails[0] : "",
    officialNumber: extracted.officialNumbers.length === 1 ? extracted.officialNumbers[0] : "",
    area: "INSS",
    documents: { count: files.length, bytes, extensions },
    conflicts,
    sourceFolderHash: sha(folder).slice(0, 16)
  }
  record.reviewReasons = []
  if (!record.name) record.reviewReasons.push("nome_nao_comprovado")
  if (!record.cpf && !record.phone && !record.email) record.reviewReasons.push("contato_sem_chave_segura")
  if (!record.officialNumber) record.reviewReasons.push("negocio_sem_numero_oficial")
  if (conflicts.length) record.reviewReasons.push("identificadores_conflitantes")
  return record
}

function isOrganizationalFolder(folderName) {
  return /^\d+\s*-\s*/.test(folderName)
}

function isInternalFolder(folderName) {
  const internalPatterns = [
    /^(processo|processos)$/i,
    /^(documento|documentos|docs?)$/i,
    /^contrato$/i,
    /^(arq\s*comprimido|arquivos?\s*comprimido)$/i,
    /^procuração$/i,
    /^__pycache__$/,
    /^\.git/,
    /^node_modules$/
  ]
  return internalPatterns.some(pattern => pattern.test(folderName))
}

async function inventory() {
  const entries = await fsp.readdir(root, { withFileTypes: true })
  const allDirs = entries.filter(entry => entry.isDirectory())

  let folders = []

  // First, collect client folders directly in root (but exclude organizational & internal folders)
  for (const entry of allDirs) {
    if (isOrganizationalFolder(entry.name) || isInternalFolder(entry.name)) {
      continue
    }
    folders.push(path.join(root, entry.name))
  }

  // Then, collect client folders from within organizational folders
  for (const entry of allDirs) {
    if (!isOrganizationalFolder(entry.name)) {
      continue
    }
    const orgPath = path.join(root, entry.name)
    try {
      const subEntries = await fsp.readdir(orgPath, { withFileTypes: true })
      for (const subEntry of subEntries) {
        if (!subEntry.isDirectory() || isInternalFolder(subEntry.name)) {
          continue
        }
        folders.push(path.join(orgPath, subEntry.name))
      }
    } catch {
      // Skip if organizational folder can't be read
    }
  }

  const records = []
  for (let i = 0; i < folders.length; i += concurrency) {
    records.push(...await Promise.all(folders.slice(i, i + concurrency).map(inspectCase)))
  }
  return { rootHash: sha(root).slice(0, 16), totalFolders: folders.length, records }
}

const hsHeaders = () => ({ Authorization: `Bearer ${process.env.HUBSPOT_TOKEN}`, "Content-Type": "application/json" })
async function hsRequest(method, url, data, attempt = 0) {
  try {
    return await axios({ method, url: `https://api.hubapi.com${url}`, data, headers: hsHeaders(), timeout: 15000 })
  } catch (error) {
    const status = error.response?.status
    if (attempt < 3 && (status === 429 || status >= 500 || !status)) {
      await sleep((attempt + 1) * 750)
      return hsRequest(method, url, data, attempt + 1)
    }
    throw new Error(`hubspot_${status || "network"}`)
  }
}
async function search(object, propertyName, value, properties = []) {
  if (!value) return []
  const response = await hsRequest("post", `/crm/v3/objects/${object}/search`, {
    filterGroups: [{ filters: [{ propertyName, operator: "EQ", value }] }], properties, limit: 10
  })
  return response.data.results || []
}
async function resolveContact(record) {
  const checks = [
    ["cpf_do_cliente", record.cpf], ["phone", record.phone], ["email", record.email]
  ]
  for (const [property, value] of checks) {
    if (!value) continue
    const found = await search("contacts", property, value, ["firstname", "phone", "email", "cpf_do_cliente"])
    if (found.length) return { status: found.length === 1 ? "existing" : "duplicate", id: found[0].id, matchedBy: property, count: found.length }
  }
  return { status: "new" }
}
async function resolveDeal(record) {
  if (record.officialNumber) {
    const found = await search("deals", "numero_de_caso", record.officialNumber, ["dealname", "numero_de_caso"])
    if (found.length) return { status: found.length === 1 ? "existing" : "duplicate", id: found[0].id, matchedBy: "numero_de_caso", count: found.length }
  }
  const markerName = montarTituloNegocioHubSpot({ area: "INSS", numeroCaso: record.officialNumber }, {})
  const byName = await search("deals", "dealname", markerName, ["dealname", "numero_de_caso"])
  if (byName.length) return { status: byName.length === 1 ? "existing" : "duplicate", id: byName[0].id, matchedBy: "dealname", count: byName.length }
  return { status: "new" }
}

async function analyze(records, online) {
  const checkpoint = await safeJson(CHECKPOINT, { version: 1, records: {} })
  const results = []
  for (const record of records) {
    let contact = { status: "unknown" }, deal = { status: "unknown" }
    let error = ""
    if (online && (record.cpf || record.phone || record.email)) {
      try { contact = await resolveContact(record); deal = await resolveDeal(record) } catch (e) { error = e.message }
    }
    if (checkpoint.records[record.importId]?.status === "applied") {
      contact = { status: "checkpoint", id: checkpoint.records[record.importId].contactId }
      deal = { status: "checkpoint", id: checkpoint.records[record.importId].dealId }
    }

    results.push({ ...record, contact, deal, error })
  }
  return { results, checkpoint }
}

function summarize(inventoryResult, results, mode) {
  const count = (object, status) => results.filter(item => item[object]?.status === status).length
  const ready = results.filter(item => !item.reviewReasons.length && !item.error && !["duplicate"].includes(item.contact.status) && !["duplicate"].includes(item.deal.status))
  return {
    generatedAt: new Date().toISOString(), mode, rootHash: inventoryResult.rootHash,
    totalFolders: inventoryResult.totalFolders, recognizedCases: results.length,
    contactsExisting: count("contact", "existing") + count("contact", "checkpoint"),
    contactsNew: count("contact", "new"), dealsExisting: count("deal", "existing") + count("deal", "checkpoint"),
    dealsNew: count("deal", "new"), duplicates: count("contact", "duplicate") + count("deal", "duplicate"),
    incomplete: results.filter(item => item.reviewReasons.length).length,
    errors: results.filter(item => item.error).length,
    manualReview: results.filter(item => item.reviewReasons.length || item.error || item.contact.status === "duplicate" || item.deal.status === "duplicate").length,
    ready: ready.length,
    blocked: results.length - ready.length,
    pilotCandidates: pilotSize ? ready.slice(0, pilotSize).map(item => ({ importId: item.importId, sourceHash: item.sourceHash })) : [],
    cases: results.map(item => ({
      importId: item.importId, sourceFolderHash: item.sourceFolderHash, sourceHash: item.sourceHash,
      evidence: { name: Boolean(item.name), cpf: Boolean(item.cpf), phone: Boolean(item.phone), email: Boolean(item.email), officialNumber: Boolean(item.officialNumber), documents: item.documents },
      contactStatus: item.contact.status, dealStatus: item.deal.status, reviewReasons: item.reviewReasons, error: item.error
    }))
  }
}

async function apply(results, checkpoint) {
  // Reservation adapter is gated behind ENABLE_CASE_NUMBER_RESERVATION env var.
  // Allowed values: 'local' (file-backed test adapter), 'postgres' (requires EXTERNAL_STATE_DATABASE_URL and pool).
  const mode = String(process.env.CASE_NUMBER_RESERVATION_MODE || 'legacy').trim().toLowerCase()
  let caseNumberService = null
  if (mode === 'legacy') {
    // legacy: no reservation (behaviour preserved)
    caseNumberService = null
  } else if (mode === 'local-test') {
    // local-test allowed only in tests or when explicit override provided
    if (process.env.NODE_ENV !== 'test' && String(process.env.CASE_NUMBER_ALLOW_LOCAL_TEST || '').toLowerCase() !== 'true') {
      throw new Error('local-test mode not allowed in this environment')
    }
    const { createLocalAdapter, createService } = require('../src/domain/case-number')
    caseNumberService = createService(createLocalAdapter({ dataDir: process.env.CASE_NUMBER_DATA_DIR || (process.env.DATA_DIR || 'data') }))
  } else if (mode === 'postgres') {
    // postgres mode requires existing pool from external-state-repository
    const { createPostgresAdapter, createService } = require('../src/domain/case-number')
    const { getPool } = require('../src/infrastructure/external-state-repository')
    const pool = getPool()
    if (!pool) throw new Error('postgres pool not initialized — enable external state repository first')
    // verify migration/table exists
    try {
      const check = await pool.query("SELECT 1 FROM case_number_reservations LIMIT 1")
      // if query runs, table exists
    } catch (e) {
      throw new Error('case_number_reservations table missing or inaccessible — migration required')
    }
    caseNumberService = createService(createPostgresAdapter({ pool }))
  } else {
    throw new Error('unsupported CASE_NUMBER_RESERVATION_MODE')
  }

  if (liveConfirmation !== "I_UNDERSTAND_THIS_WRITES_TO_HUBSPOT") throw new Error("confirmacao_live_ausente")
  if (process.env.IMPORT_AUTOMATIONS_CONFIRMED_DISABLED !== "true") throw new Error("automacoes_nao_confirmadas_como_desativadas")
  if (!process.env.HUBSPOT_TOKEN) throw new Error("hubspot_token_ausente")
  for (const item of results) {
    if (checkpoint.records[item.importId]?.status === "applied") continue
    if (item.error || item.reviewReasons.length || item.contact.status === "duplicate" || item.deal.status === "duplicate") continue
    let contactId = item.contact.id
    if (!contactId) {
      const properties = { firstname: item.name, ...(item.phone && { phone: item.phone }), ...(item.email && { email: item.email }), ...(item.cpf && { cpf_do_cliente: item.cpf }), area_juridica: "Previdenciário (INSS)" }
      contactId = (await hsRequest("post", "/crm/v3/objects/contacts", { properties })).data.id
    }
    let dealId = item.deal.id
    if (!dealId) {
      // Determine numero_de_caso to use. Priority:
      // 1) existing officialNumber in item
      // 2) checkpoint stored caseNumber
      // 3) reserve via caseNumberService (if enabled)
      let numeroParaEnviar = item.officialNumber || null
      if (!numeroParaEnviar && checkpoint.records[item.importId] && checkpoint.records[item.importId].caseNumber) {
        numeroParaEnviar = checkpoint.records[item.importId].caseNumber
      }
      if (!numeroParaEnviar && caseNumberService) {
        // use idempotent key: importId (stable per source folder)
        const key = item.importId
        const res = await caseNumberService.reserve({ key, area: item.area })
        if (!res || !res.reserved) throw new Error('case_number_reservation_failed')
        numeroParaEnviar = res.numero
        // persist reservation in checkpoint immediately to ensure idempotence across retries
        checkpoint.records[item.importId] = checkpoint.records[item.importId] || {}
        checkpoint.records[item.importId].caseNumber = numeroParaEnviar
        await atomicWrite(CHECKPOINT, checkpoint)
      }

      const properties = {
        dealname: montarTituloNegocioHubSpot({ area: "INSS", numeroCaso: numeroParaEnviar }), pipeline: "default",
        dealstage: "presentationscheduled", area_juridica: "INSS", numero_de_caso: numeroParaEnviar,
        origem_atendimento: "importacao_arquivo", description: `Importacao segura ${item.importId}. Acervo: ${item.documents.count} arquivo(s).`
      }
      dealId = (await hsRequest("post", "/crm/v3/objects/deals", { properties })).data.id
    }
    await hsRequest("put", `/crm/v3/objects/deals/${dealId}/associations/contacts/${contactId}/deal_to_contact`, {})
    checkpoint.records[item.importId] = { status: "applied", contactId, dealId, sourceHash: item.sourceHash, appliedAt: new Date().toISOString(), caseNumber: checkpoint.records[item.importId]?.caseNumber || item.officialNumber || null }
    await atomicWrite(CHECKPOINT, checkpoint)
  }
  return checkpoint
}


async function applyPilotSelection(scanned, selectionFile) {
  const selection = await safeJson(selectionFile, null)
  if (!selection || !selection.selection || !Array.isArray(selection.selection)) {
    throw new Error('pilot_selection_file_invalid_or_missing')
  }

  const pilots = selection.selection
  if (pilots.length !== 3) {
    throw new Error(`pilot_selection_must_have_exactly_3_entries_found_${pilots.length}`)
  }

  // Validate uniqueness
  const importIds = new Set(pilots.map(p => p.importId))
  if (importIds.size !== 3) {
    throw new Error('pilot_selection_contains_duplicate_importIds')
  }

  // Filter records to match selection
  const selectedImportIds = new Set(pilots.map(p => p.importId))
  const filteredRecords = scanned.records.filter(r => selectedImportIds.has(r.importId))

  if (filteredRecords.length !== 3) {
    throw new Error(`pilot_selection_mismatch_found_${filteredRecords.length}_of_3_clients`)
  }

  // Merge selection metadata into records
  for (const record of filteredRecords) {
    const meta = pilots.find(p => p.importId === record.importId)
    if (meta) {
      record._pilotMeta = {
        phoneSource: 'pilot_manifest',
        phone: meta.phone || null,
        phoneRaw: meta.phone || null,
        type: meta.type,
        expectedDocuments: meta.expectedDocuments,
        notes: meta.notes
      }
    }
  }

  console.log(`[PILOT SELECTION] Loaded ${filteredRecords.length} clients`)
  console.log(`[PILOT SELECTION] ImportIds: ${Array.from(importIds).join(', ')}`)

  return { ...scanned, records: filteredRecords }
}

function buildCanonicalDryRunReport(results, scanned) {
  const reports = []

  for (const item of results) {
    const registry = item
    const plan = planejarSincronizacaoDocumentalHubSpot({ registry })
    const contato = plan.contato || { props: {}, bloqueados: [] }
    const negocio = plan.negocio || { props: {}, bloqueados: [] }

    // Analysis state: based on consolidatedCase (deep document analysis completion marker)
    // In dry-run, consolidatedCase is not created, so this will be <NÃO ANALISADO>
    // This is correct behavior for dry-run (no deep analysis, just planning)
    const analysisExecuted = Boolean(registry && registry.consolidatedCase)
    const analysisState = analysisExecuted ? '<PRESENTE>' : '<NÃO ANALISADO>'

    // Number of case logic (4 distinct states)
    const processState = (() => {
      if (!analysisExecuted) return '<NÃO ANALISADO>'
      const blocked = (negocio.bloqueados || []).some(b => b.campo === 'numero_de_caso')
      if (blocked) return '<BLOQUEADO>'
      if (negocio.props && negocio.props.numero_de_caso) return '<PRESENTE>'
      return '<SERÁ GERADO NO APPLY>'
    })()

    // Phone handling with normalization
    let phoneState = '<AUSENTE>'
    let phoneNormalized = null
    let phoneSource = 'not_found'

    if (registry._pilotMeta && registry._pilotMeta.phone) {
      try {
        const { normalizarTelefone } = require("../src/domain/phone-name.js")
        phoneNormalized = normalizarTelefone(registry._pilotMeta.phone)
      } catch {
        phoneNormalized = registry._pilotMeta.phone
      }
      phoneSource = 'pilot_manifest'
      phoneState = '<PRESENTE>'
    } else if (contato.props && contato.props.phone) {
      phoneNormalized = contato.props.phone
      phoneSource = 'hubspot'
      phoneState = '<PRESENTE>'
    } else {
      const phonesFound = registry.consolidatedCase?.telefonesEncontrados || registry.consolidatedCase?.phones || []
      if (Array.isArray(phonesFound) && phonesFound.length === 1) {
        phoneNormalized = phonesFound[0]
        phoneSource = 'inventory'
        phoneState = '<PRESENTE>'
      }
    }

    // Email handling
    let emailState = '<AUSENTE>'
    if (contato.props && contato.props.email) {
      emailState = '<PRESENTE>'
    } else {
      const emailsFound = registry.consolidatedCase?.emailsEncontrados || registry.consolidatedCase?.emails || []
      if (Array.isArray(emailsFound) && emailsFound.length === 1) {
        emailState = '<PRESENTE>'
      }
    }

    // CPF handling
    let cpfState = '<AUSENTE>'
    if (analysisExecuted) {
      const blocked = (contato.bloqueados || []).some(b => b.campo === 'cpf_do_cliente')
      if (blocked) {
        cpfState = '<BLOQUEADO>'
      } else if (contato.props && contato.props.cpf_do_cliente) {
        cpfState = '<PRESENTE>'
      } else {
        const cpfsFound = registry.consolidatedCase?.cpfsEncontrados || registry.consolidatedCase?.cpfs || []
        if (Array.isArray(cpfsFound) && cpfsFound.length === 1) {
          cpfState = '<PRESENTE>'
        }
      }
    } else {
      cpfState = '<NÃO ANALISADO>'
    }

    // Other unmapped fields
    const requerimentoInfo = {
      found: Boolean(registry?.consolidatedCase?.canonicalSuggestions?.numero_requerimento),
      hubspotProperty: false,
      plannedSend: false
    }
    const nbInfo = {
      found: Boolean(registry?.consolidatedCase?.canonicalSuggestions?.nb),
      hubspotProperty: false,
      plannedSend: false
    }

    const allBlocked = ((contato.bloqueados || []).concat(negocio.bloqueados || [])).map(b => ({
      field: b.campo,
      reason: b.motivo || 'bloqueado'
    }))

    const report = {
      importId: registry.importId || '<unknown>',
      name: registry.name || null,
      folder: registry.folder || null,
      analysisState,
      inventory: {
        cpf: Boolean(registry.cpf),
        phone: Boolean(registry.phone),
        email: Boolean(registry.email),
        officialNumber: registry.officialNumber || null
      },
      planning: {
        cpf: cpfState,
        phone: {
          state: phoneState,
          raw: registry._pilotMeta?.phoneRaw || null,
          normalized: phoneNormalized,
          source: phoneSource
        },
        email: emailState,
        caseNumber: processState,
        officialNumber: negocio.props?.numero_de_caso || null
      },
      blocked: allBlocked,
      unmappedFields: {
        requerimento: requerimentoInfo,
        nb: nbInfo
      },
      documentCount: Number(registry.documents?.count || 0),
      documentsPending: item.reviewReasons?.includes('incomplete_documents') || false
    }

    reports.push(report)
  }

  return {
    generatedAt: new Date().toISOString(),
    totalAnalyzed: results.length,
    reports
  }
}

function generateDryRunReport(results, scanned) {
  const canonical = buildCanonicalDryRunReport(results, scanned)
  return canonical
}

// runDryRun: testable, injectable dry-run flow that avoids any reservation/apply side-effects.
// Accepts optional injected functions to make tests deterministic and avoid global loader hooks.
async function runDryRun({ scanned, analyzeFn = analyze, buildReportFn = buildCanonicalDryRunReport, writeReportFn = async () => null } = {}) {
  if (!scanned || !Array.isArray(scanned.records)) throw new Error('invalid_scanned')
  // analyzeFn mirrors analyze(records, online) contract
  const { results, checkpoint } = await analyzeFn(scanned.records, false)
  const canonical = buildReportFn(results, scanned)
  await writeReportFn(canonical)
  return { canonical, results, checkpoint }
}

async function main() {
  if (command === "help") {
    console.log("Uso: node scripts/import-real-cases.js <audit|review|dry-run|apply|resume|report> [--root=...] [--concurrency=2]")
    return
  }
  if (command === "report") {
    const report = await safeJson(REPORT, null)
    if (!report) throw new Error("relatorio_ainda_nao_gerado")
    console.log(JSON.stringify({ ...report, cases: undefined }, null, 2))
    return
  }
  if (!fs.existsSync(root)) throw new Error("pasta_origem_inexistente")

  let scanned = await inventory()

  // Apply pilot selection if requested (default for dry-run)
  if (usePilotSelection && fs.existsSync(pilotSelectionFile)) {
    scanned = await applyPilotSelection(scanned, pilotSelectionFile)
  }

  const offlineByDefault = command === "audit" || command === "review" || command === "dry-run"
  const online = Boolean(process.env.HUBSPOT_TOKEN) && (!offlineByDefault || allowReadonlyHubSpot)
  const { results, checkpoint } = await analyze(scanned.records, online)

  let dryRunReport = null
  if (command === 'dry-run') {
    // Run planner for dry-run only to present a local non-network view; do not change apply behavior.
    dryRunReport = generateDryRunReport(results, scanned)
  }

  if (["apply", "resume"].includes(command)) await apply(results, checkpoint)

  const report = summarize(scanned, results, command)

  // Include dry-run canonical report in JSON if available
  if (dryRunReport) {
    report.dryRunReport = dryRunReport
  }

  await atomicWrite(REPORT, report)
  console.log(JSON.stringify({ ...report, cases: undefined, dryRunReport: undefined }, null, 2))
}

module.exports = { generateDryRunReport, applyPilotSelection, buildCanonicalDryRunReport, option, runDryRun, usePilotSelection, pilotSelectionFile }

if (require.main === module) {
  main().catch(error => { console.error(JSON.stringify({ ok: false, error: error.message })); process.exitCode = 1 })
}
