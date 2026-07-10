#!/usr/bin/env node
"use strict"

require("dotenv").config({ quiet: true })
const fs = require("node:fs")
const fsp = require("node:fs/promises")
const path = require("node:path")
const crypto = require("node:crypto")
const axios = require("axios")
const { montarTituloNegocioHubSpot } = require("../src/domain/hubspot-deal-title")

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
  return {
    generatedAt: new Date().toISOString(), mode, rootHash: inventoryResult.rootHash,
    totalFolders: inventoryResult.totalFolders, recognizedCases: results.length,
    contactsExisting: count("contact", "existing") + count("contact", "checkpoint"),
    contactsNew: count("contact", "new"), dealsExisting: count("deal", "existing") + count("deal", "checkpoint"),
    dealsNew: count("deal", "new"), duplicates: count("contact", "duplicate") + count("deal", "duplicate"),
    incomplete: results.filter(item => item.reviewReasons.length).length,
    errors: results.filter(item => item.error).length,
    manualReview: results.filter(item => item.reviewReasons.length || item.error || item.contact.status === "duplicate" || item.deal.status === "duplicate").length,
    cases: results.map(item => ({
      importId: item.importId, sourceFolderHash: item.sourceFolderHash, sourceHash: item.sourceHash,
      evidence: { name: Boolean(item.name), cpf: Boolean(item.cpf), phone: Boolean(item.phone), email: Boolean(item.email), officialNumber: Boolean(item.officialNumber), documents: item.documents },
      contactStatus: item.contact.status, dealStatus: item.deal.status, reviewReasons: item.reviewReasons, error: item.error
    }))
  }
}

async function apply(results, checkpoint) {
  if (liveConfirmation !== "I_UNDERSTAND_THIS_WRITES_TO_HUBSPOT") throw new Error("confirmacao_live_ausente")
  if (process.env.IMPORT_AUTOMATIONS_CONFIRMED_DISABLED !== "true") throw new Error("automacoes_nao_confirmadas_como_desativadas")
  if (!process.env.HUBSPOT_TOKEN) throw new Error("hubspot_token_ausente")
  for (const item of results) {
    if (checkpoint.records[item.importId]?.status === "applied") continue
    if (item.error || item.reviewReasons.length || item.contact.status === "duplicate" || item.deal.status === "duplicate") continue
    let contactId = item.contact.id
    if (!contactId) {
      const properties = { firstname: item.name, ...(item.phone && { phone: item.phone }), ...(item.email && { email: item.email }), ...(item.cpf && { cpf_do_cliente: item.cpf }), area_juridica: "PrevidenciÃ¡rio (INSS)" }
      contactId = (await hsRequest("post", "/crm/v3/objects/contacts", { properties })).data.id
    }
    let dealId = item.deal.id
    if (!dealId) {
      const properties = {
        dealname: montarTituloNegocioHubSpot({ area: "INSS", numeroCaso: item.officialNumber }), pipeline: "default",
        dealstage: "presentationscheduled", area_juridica: "INSS", numero_de_caso: item.officialNumber,
        origem_atendimento: "importacao_arquivo", description: `Importacao segura ${item.importId}. Acervo: ${item.documents.count} arquivo(s).`
      }
      dealId = (await hsRequest("post", "/crm/v3/objects/deals", { properties })).data.id
    }
    await hsRequest("put", `/crm/v3/objects/deals/${dealId}/associations/contacts/${contactId}/deal_to_contact`, {})
    checkpoint.records[item.importId] = { status: "applied", contactId, dealId, sourceHash: item.sourceHash, appliedAt: new Date().toISOString() }
    await atomicWrite(CHECKPOINT, checkpoint)
  }
  return checkpoint
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
  const scanned = await inventory()
  const online = (command !== "audit" && command !== "review") && Boolean(process.env.HUBSPOT_TOKEN)
  const { results, checkpoint } = await analyze(scanned.records, online)
  if (["apply", "resume"].includes(command)) await apply(results, checkpoint)
  const report = summarize(scanned, results, command)
  await atomicWrite(REPORT, report)
  console.log(JSON.stringify({ ...report, cases: undefined }, null, 2))
}

main().catch(error => { console.error(JSON.stringify({ ok: false, error: error.message })); process.exitCode = 1 })