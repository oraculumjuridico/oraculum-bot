#!/usr/bin/env node
"use strict"

const fs = require("node:fs")
const path = require("node:path")
const crypto = require("node:crypto")
const { google } = require("googleapis")
const { Pool } = require("pg")
const { inventory } = require("./import-real-cases")
const { loadOperationalEnvironment } = require("../src/composition/oraculum-runtime-env")
const { createService, createPostgresAdapter } = require("../src/domain/case-number")
const { montarTituloNegocioHubSpot } = require("../src/domain/hubspot-deal-title")
const { comporPdfsDocumentais } = require("../src/domain/document-pdf-composer")

const APPLY_CONFIRMATION = "PROCESS_ALL_INSS_CASES_IDEMPOTENTLY"
const apply = process.argv.includes("--apply")
const confirmed = process.argv.includes(`--confirm=${APPLY_CONFIRMATION}`)
const root = "C:\\Users\\jesai\\Documents\\ARQUIVOS PESSOAIS\\Direito\\INSS"
const shardArg = process.argv.find(value => value.startsWith("--shard="))?.slice(8) || "0/1"
const shardMatch = shardArg.match(/^(\d+)\/(\d+)$/)
if (!shardMatch || Number(shardMatch[2]) < 1 || Number(shardMatch[1]) >= Number(shardMatch[2])) throw new Error("SHARD_INVALID")
const shardIndex = Number(shardMatch[1]), shardCount = Number(shardMatch[2])
const stateFile = path.resolve(`data/case-import/all-cases-batch-state-${shardIndex}-of-${shardCount}.json`)
const readJson = file => JSON.parse(fs.readFileSync(file, "utf8").replace(/^\uFEFF/, ""))
const sha = value => crypto.createHash("sha256").update(value).digest("hex")
const cleanName = value => String(value || "").replace(/\s+/g, " ").trim()
const queryEscape = value => String(value).replace(/\\/g, "\\\\").replace(/'/g, "\\'")

function walk(directory) {
  const files = []
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name)
    if (entry.isDirectory()) files.push(...walk(full))
    else if (entry.isFile() && !entry.name.startsWith("~$")) files.push(full)
  }
  return files
}

function category(file) {
  const n = path.basename(file).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
  if (/ctps|carteira.*trabalho|contrato.*trabalho/.test(n)) return "02 - Carteira de trabalho"
  if (/resid|endereco/.test(n)) return "03 - Residência"
  if (/laudo|atestado|exame|medic|receita|prontuario/.test(n)) return "04 - Documentos médicos"
  if (/inss|cnis|beneficio|requer|indefer|pericia|protocolo/.test(n)) return "05 - INSS e CNIS"
  if (/cras|cad.?unico/.test(n)) return "06 - CRAS e CadÚnico"
  if (/renda|socio|despesa/.test(n)) return "07 - Documentos socioeconômicos"
  if (/declar/.test(n)) return "08 - Declarações"
  if (/administrativ|recurso/.test(n)) return "09 - Processo administrativo"
  if (/judicial|processo|peticao|sentenca/.test(n)) return "10 - Processo judicial"
  if (/procur|contrato.*honor|termo/.test(n)) return "11 - Procuração e contrato"
  if (/cpf|rg|ident|nascimento|casamento|civil/.test(n)) return "01 - Documentos pessoais"
  return "13 - Outros documentos"
}

function classify(files) {
  const text = files.map(file => path.basename(file)).join(" ").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
  if (/bpc|loas|cad.?unico|cras/.test(text)) return { type: "inss_bpc", label: "BPC LOAS" }
  if (/incap|laudo|atestado|pericia|medic|exame/.test(text)) return { type: "inss_incapacidade", label: "Benefício por Incapacidade" }
  if (/aposent/.test(text)) return { type: "inss_aposentadoria", label: "Aposentadoria" }
  if (/pensao.*morte|óbito|obito/.test(text)) return { type: "inss_dependentes", label: "Benefício para Dependentes" }
  return { type: "inss_outros", label: "Demanda Previdenciária" }
}

function summary({ name, caseNumber, classification, files, groups, folderUrl }) {
  const categories = [...groups.keys()]
  return [
    "RESUMO DO CASO", `Cliente: ${name}`, `Número interno: ${caseNumber}`, "Área: Previdenciário (INSS)",
    `Tipo: ${classification.label}`, "Subtipo: não comprovado", "Situação atual: revisão documental inicial",
    "Estágio: análise jurídica", "Prioridade: não comprovada", "",
    "HISTÓRICO DO CLIENTE", "Relato inicial: não disponível no acervo importado.",
    "Como o caso começou: pasta histórica recebida pelo escritório; cronologia detalhada não comprovada.",
    "Fatos em ordem cronológica: dependem de revisão humana dos documentos consolidados.",
    "Pedidos, decisões e providências: não confirmados automaticamente.", "",
    "INFORMAÇÕES DO CASO", "NB/DER/DIB/DCB/protocolo/processo: não confirmados com segurança.",
    "Atividade, profissão e composição familiar: preencher após revisão quando aplicável.", "",
    "ANÁLISE DOCUMENTAL", `Arquivos originais inventariados: ${files.length}.`,
    `Categorias encontradas: ${categories.join("; ") || "nenhuma"}.`,
    "O conteúdo disponível foi preservado; documentos incompatíveis com consolidação permanecem nos originais.",
    "Conflitos e quarentena: revisão de identidade e conteúdo necessária.", "",
    "DOCUMENTOS PENDENTES", "Confirmar identidade, subtipo, números previdenciários, datas e histórico cronológico.", "",
    "ANÁLISE PRELIMINAR", `Enquadramento aparente: ${classification.label}.`,
    "Pontos favoráveis, fragilidades e riscos: não podem ser concluídos sem revisão jurídica humana.", "",
    "PRÓXIMA AÇÃO", "Providência: revisar índice e PDFs consolidados; validar identidade, subtipo e cronologia.",
    "Responsável/prazo: não definidos.", "", "GOOGLE DRIVE", `Pasta: ${folderUrl}`,
    "Originais: preservados.", "Índice documental: disponível na pasta.", "Pendências: registradas acima."
  ].join("\n")
}

async function main() {
  if (apply && !confirmed) throw new Error("LIVE_CONFIRMATION_REQUIRED")
  const env = loadOperationalEnvironment()
  const db = env.EXTERNAL_STATE_DATABASE_URL || env.DATABASE_URL
  if (!db || !env.HUBSPOT_TOKEN) throw new Error("OPERATIONAL_ENV_MISSING")
  const driveEnv = {
    id: env.GOOGLE_DRIVE_CLIENT_ID || env.GOOGLE_CLIENT_ID,
    secret: env.GOOGLE_DRIVE_CLIENT_SECRET || env.GOOGLE_CLIENT_SECRET,
    refresh: env.GOOGLE_DRIVE_REFRESH_TOKEN || env.GOOGLE_REFRESH_TOKEN,
    root: env.GOOGLE_DRIVE_ROOT_FOLDER_ID
  }
  if (!Object.values(driveEnv).every(Boolean)) throw new Error("DRIVE_ENV_MISSING")
  const auth = new google.auth.OAuth2(driveEnv.id, driveEnv.secret)
  auth.setCredentials({ refresh_token: driveEnv.refresh })
  const drive = google.drive({ version: "v3", auth })
  const pool = new Pool({ connectionString: db, ssl: { rejectUnauthorized: false }, max: 1 })
  const numbers = createService(createPostgresAdapter({ pool }), { maxAttempts: 1000 })
  const state = fs.existsSync(stateFile) ? readJson(stateFile) : { version: 1, cases: {} }
  const metrics = { folders: 0, processed: 0, completed: 0, review: 0, blocked: 0, contactsCreated: 0, contactsUpdated: 0, dealsCreated: 0, dealsUpdated: 0, associationsCreated: 0, driveFoldersCreated: 0, pdfsCreated: 0, indexesCreated: 0 }

  async function hs(method, endpoint, body, write = false) {
    if (write && !apply) return { dryRun: true }
    const r = await fetch(`https://api.hubapi.com${endpoint}`, { method, headers: { Authorization: `Bearer ${env.HUBSPOT_TOKEN}`, "Content-Type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) })
    if (!r.ok) throw new Error(`HUBSPOT_${r.status}`)
    return r.status === 204 ? {} : r.json()
  }
  async function search(object, property, value, properties = []) {
    const x = await hs("POST", `/crm/v3/objects/${object}/search`, { filterGroups: [{ filters: [{ propertyName: property, operator: "EQ", value }] }], properties, limit: 10 })
    return x.results || []
  }
  async function findFolder(parent, logicalId) {
    const x = await drive.files.list({ q: `'${queryEscape(parent)}' in parents and trashed=false and mimeType='application/vnd.google-apps.folder' and appProperties has { key='logicalId' and value='${queryEscape(logicalId)}' }`, fields: "files(id,name)", pageSize: 10 })
    if ((x.data.files || []).length > 1) throw new Error("DRIVE_FOLDER_AMBIGUOUS")
    return x.data.files?.[0]
  }
  async function folder(parent, logicalId, name, props = {}) {
    let item = await findFolder(parent, logicalId)
    if (!item && apply) {
      item = (await drive.files.create({ requestBody: { name, mimeType: "application/vnd.google-apps.folder", parents: [parent], appProperties: { logicalId, ...props } }, fields: "id,name" })).data
      metrics.driveFoldersCreated++
    }
    return item
  }
  async function upload(parent, name, bytes, props, mimeType) {
    const hash = sha(bytes)
    const existing = await drive.files.list({ q: `'${queryEscape(parent)}' in parents and trashed=false and appProperties has { key='sha256' and value='${hash}' }`, fields: "files(id)", pageSize: 10 })
    if (existing.data.files?.length) return existing.data.files[0]
    if (!apply) return null
    const { Readable } = require("node:stream")
    return (await drive.files.create({ requestBody: { name, parents: [parent], appProperties: { sha256: hash, ...props } }, media: { mimeType, body: Readable.from([bytes]) }, fields: "id" })).data
  }

  try {
    const discovered = await inventory()
    metrics.folders = discovered.totalFolders
    const area = await folder(driveEnv.root, "area:inss", "Previdenciário")
    for (let index = 0; index < discovered.records.length; index++) {
      if (index % shardCount !== shardIndex) continue
      const record = discovered.records[index]
      const ref = `case-${String(index + 1).padStart(3, "0")}`
      try {
        const source = findSourceFolder(record.importId)
        const files = walk(source)
        const classification = classify(files)
        let reservation = await numbers.findByKey(`case-import:${record.importId}`)
        if (!reservation && apply) reservation = { case_number: (await numbers.reserve({ key: `case-import:${record.importId}`, area: "INSS" })).numero }
        const caseNumber = reservation?.case_number || `PRV.PREVIEW.${index + 1}`
        const caseFolder = await folder(area.id, `case:${record.importId}`, `${caseNumber} - ${cleanName(record.name)} - ${classification.label}`, { caseImportId: record.importId })
        const originals = await folder(caseFolder.id, `originals:${record.importId}`, "00 - Originais preservados", { caseImportId: record.importId })
        const groups = new Map()
        const seen = new Set()
        for (const file of files) {
          const bytes = fs.readFileSync(file)
          const hash = sha(bytes)
          if (seen.has(hash)) continue
          seen.add(hash)
          const cat = category(file)
          if (!groups.has(cat)) groups.set(cat, [])
          groups.get(cat).push({ file, bytes })
          await upload(originals.id, path.basename(file), bytes, { caseImportId: record.importId, category: cat }, "application/octet-stream")
        }
        let pdfCount = 0
        for (const [cat, docs] of groups) {
          const catFolder = await folder(caseFolder.id, `category:${record.importId}:${sha(cat).slice(0, 12)}`, cat, { caseImportId: record.importId, category: cat })
          const images = docs.filter(item => /\.(jpe?g|png|webp|tiff?)$/i.test(item.file))
          if (images.length > 1) {
            const composed = await comporPdfsDocumentais({}, { definicoes: [{ tipo: cat, arquivo: `${cat.replace(/^\d+\s*-\s*/, "")}.pdf`, getDocumentos: () => images.map(item => ({ buffer: item.bytes, mimeType: "image/jpeg", nome: path.basename(item.file) })) }] })
            for (const pdf of composed.pdfsGerados) {
              await upload(catFolder.id, pdf.arquivo, pdf.buffer, { caseImportId: record.importId, kind: "consolidated" }, "application/pdf")
              pdfCount++
            }
          }
        }
        const folderUrl = `https://drive.google.com/drive/folders/${caseFolder.id}`
        const text = summary({ name: cleanName(record.name), caseNumber, classification, files, groups, folderUrl })
        await upload(caseFolder.id, "Índice do caso.md", Buffer.from(text, "utf8"), { caseImportId: record.importId, kind: "index" }, "text/markdown")
        const contacts = await search("contacts", "firstname", cleanName(record.name), ["firstname"])
        if (contacts.length > 1) throw new Error("CONTACT_AMBIGUOUS")
        let contact = contacts[0]
        if (!contact && apply) { contact = await hs("POST", "/crm/v3/objects/contacts", { properties: { firstname: cleanName(record.name), area_juridica: "Previdenciário (INSS)" } }, true); metrics.contactsCreated++ }
        const deals = await search("deals", "oraculum_case_import_id", record.importId, ["dealname", "description"])
        if (deals.length > 1) throw new Error("DEAL_AMBIGUOUS")
        const properties = { dealname: montarTituloNegocioHubSpot({ area: "INSS", numeroCaso: caseNumber, tipo_de_caso: classification.type }), numero_de_caso: caseNumber, area_juridica: "INSS", tipo_de_caso: classification.type, pipeline: "default", dealstage: "presentationscheduled", temperatura_lead: "Quente", origem_atendimento: "importacao_arquivo", pasta_drive: folderUrl, resumo_cliente: `Arquivos: ${files.length}. Categorias: ${[...groups.keys()].join("; ")}.`, descricao_completa: text, oraculum_case_import_id: record.importId, oraculum_document_status: "pending_review", oraculum_documents_received: [...groups.keys()].join("; "), oraculum_documents_pending: "Revisão humana de identidade, subtipo, cronologia e números previdenciários.", oraculum_review_required: "true", oraculum_analysis_status: "review_required" }
        let deal = deals[0]
        if (!deal && apply) { deal = await hs("POST", "/crm/v3/objects/deals", { properties }, true); metrics.dealsCreated++ }
        else if (deal && apply) { await hs("PATCH", `/crm/v3/objects/deals/${deal.id}`, { properties }, true); metrics.dealsUpdated++ }
        if (contact && deal) {
          const assoc = await hs("GET", `/crm/v4/objects/deals/${deal.id}/associations/contacts?limit=100`)
          if (!(assoc.results || []).some(item => String(item.toObjectId || item.id) === String(contact.id)) && apply) {
            await hs("PUT", `/crm/v4/objects/deals/${deal.id}/associations/contacts/${contact.id}`, [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: 3 }], true)
            metrics.associationsCreated++
          }
        }
        state.cases[record.importId] = { ref, status: "completed", reviewRequired: true, pdfCount, fileCount: files.length }
        metrics.processed++; metrics.completed++; metrics.review++; metrics.pdfsCreated += pdfCount; metrics.indexesCreated++
      } catch (error) {
        state.cases[record.importId] = { ref, status: "blocked", reason: String(error.message).replace(/[^\w:-]/g, "_") }
        metrics.processed++; metrics.blocked++
      }
      if (apply) fs.writeFileSync(stateFile, JSON.stringify(state, null, 2), { mode: 0o600 })
    }
    console.log(JSON.stringify({ ok: metrics.blocked === 0, mode: apply ? "apply" : "preview", metrics, cases: Object.values(state.cases).map(item => ({ ref: item.ref, status: item.status, review: Boolean(item.reviewRequired), pdfs: item.pdfCount || 0 })) }))
  } finally { await pool.end().catch(() => {}) }

  function findSourceFolder(importId) {
    const queue = [root]
    while (queue.length) {
      const current = queue.shift()
      for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue
        const full = path.join(current, entry.name)
        const relative = path.relative(root, full).toLowerCase()
        if (`inss-${sha(relative).slice(0, 20)}` === importId) return full
        queue.push(full)
      }
    }
    throw new Error("SOURCE_FOLDER_NOT_FOUND")
  }
}

if (require.main === module) main().catch(error => { console.error(JSON.stringify({ ok: false, error: String(error.message).replace(/[^\w:-]/g, "_") })); process.exitCode = 1 })
module.exports = { classify, category, summary, APPLY_CONFIRMATION }
