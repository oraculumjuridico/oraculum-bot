#!/usr/bin/env node
"use strict"

const fs = require("node:fs")
const path = require("node:path")
const crypto = require("node:crypto")
const { Pool } = require("pg")
const { google } = require("googleapis")
const { loadOperationalEnvironment } = require("../src/composition/oraculum-runtime-env")
const { createService, createPostgresAdapter } = require("../src/domain/case-number")
const { canonicalCaseFromAnalysis, canonicalCaseToHubSpot, mergeNonEmpty } = require("../src/domain/canonical-case")
const { validateHubSpotProperties } = require("../src/domain/hubspot-contract")

const APPLY_CONFIRMATION = "APPLY_THREE_PILOTS_IDEMPOTENTLY"
const STATE_ROOT = path.resolve("data/case-import")
const selectionPath = path.join(STATE_ROOT, "pilot-selection.json")
const requestedApply = process.argv.includes("--apply")
const confirmation = process.argv.find(value => value.startsWith("--confirm="))?.slice(10)
const warnings = []
const digits = value => String(value || "").replace(/\D/g, "")
const sha256File = file => new Promise((resolve, reject) => {
  const hash = crypto.createHash("sha256")
  fs.createReadStream(file).on("data", chunk => hash.update(chunk)).on("error", reject).on("end", () => resolve(hash.digest("hex")))
})

const DEAL_PROPERTY_DEFINITIONS = Object.freeze([
  { name: "oraculum_case_subtype", label: "Subtipo do caso", type: "string", fieldType: "text" },
  { name: "oraculum_case_import_id", label: "Chave externa Oráculum", type: "string", fieldType: "text" },
  { name: "oraculum_document_status", label: "Status documental", type: "enumeration", fieldType: "select", options: [
    { label: "Analisado", value: "analyzed", displayOrder: 0, hidden: false },
    { label: "Revisão pendente", value: "pending_review", displayOrder: 1, hidden: false }
  ] },
  { name: "oraculum_documents_received", label: "Documentos recebidos", type: "string", fieldType: "textarea" },
  { name: "oraculum_documents_pending", label: "Documentos pendentes", type: "string", fieldType: "textarea" },
  { name: "oraculum_review_required", label: "Revisão humana necessária", type: "bool", fieldType: "booleancheckbox", options: [
    { label: "Sim", value: "true", displayOrder: 0, hidden: false },
    { label: "Não", value: "false", displayOrder: 1, hidden: false }
  ] },
  { name: "oraculum_analysis_status", label: "Status da análise Oráculum", type: "enumeration", fieldType: "select", options: [
    { label: "Analisado", value: "analyzed", displayOrder: 0, hidden: false },
    { label: "Revisão necessária", value: "review_required", displayOrder: 1, hidden: false }
  ] }
])

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8").replace(/^\uFEFF/, ""))
}

function analysisFor(index) {
  const report = readJson(path.join(STATE_ROOT, `pilot-${index}-analysis.json`))
  const item = report.cases?.[0]
  if (!item) throw new Error(`PILOT_${index}_ANALYSIS_MISSING`)
  return {
    caseImportId: null,
    consolidatedResult: {
      mappedType: null,
      analyzedFileCount: item.contagens?.arquivosAnalisados,
      documentosClassificados: item.categoriasDocumentais || [],
      documentsPending: item.motivosRevisao || [],
      quarantinedDocuments: (item.conflitos || []).includes("documents_quarantined") ? [{ status: "quarantined" }] : [],
      reviewReasons: item.motivosRevisao || [],
      blockingReviewReasons: [],
      confidence: item.confianca,
      sourceFolder: null
    }
  }
}

function normalizePhone(value) {
  const valueDigits = digits(value)
  return valueDigits.startsWith("55") ? valueDigits : `55${valueDigits}`
}

function orderedPilots(selection) {
  // The existing operational Pilot 1 is the second entry of the historical
  // selection. Preserve that binding, then process the two remaining entries.
  return [selection[1], selection[0], selection[2]]
}

function walkFiles(directory) {
  const files = []
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name)
    if (entry.isDirectory()) files.push(...walkFiles(full))
    else if (entry.isFile() && !entry.name.startsWith("~$")) files.push(full)
  }
  return files
}

function driveCategory(file) {
  const value = path.basename(file).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
  if (/laudo|atestado|exame|medic|receita/.test(value)) return "Documentos médicos"
  if (/cadunico|cad.?unico|cras|social|renda/.test(value)) return "CRAS e CadÚnico"
  if (/resid|endereco|endereço/.test(value)) return "Comprovantes de residência"
  if (/requer|inss|beneficio|benefício|indefer|pericia|perícia/.test(value)) return "INSS"
  if (/processo|peticao|petição|judicial/.test(value)) return "Processo judicial"
  if (/cpf|rg|ident|nascimento|casamento|ctps/.test(value)) return "Documentos pessoais"
  if (/declar/.test(value)) return "Declarações"
  return "Outros documentos"
}

function escapeDriveQuery(value) {
  return String(value).replace(/\\/g, "\\\\").replace(/'/g, "\\'")
}

function reportPilot(index, state) {
  return {
    pilot: index,
    contact: state.contactAction,
    deal: state.dealAction,
    associationVerified: state.associationVerified,
    duplicateContacts: state.duplicateContacts,
    duplicateDeals: state.duplicateDeals,
    titleCanonical: state.titleCanonical,
    fieldsComplete: state.fieldsComplete,
    driveVerified: state.driveVerified
  }
}

async function main() {
  if (requestedApply && confirmation !== APPLY_CONFIRMATION) throw new Error("LIVE_CONFIRMATION_REQUIRED")
  const env = loadOperationalEnvironment()
  const databaseUrl = env.EXTERNAL_STATE_DATABASE_URL || env.DATABASE_URL
  if (!databaseUrl) throw new Error("DATABASE_ENV_MISSING")
  if (!env.HUBSPOT_TOKEN) throw new Error("HUBSPOT_ENV_MISSING")
  const selection = readJson(selectionPath)
  if (!Array.isArray(selection.selection) || selection.selection.length !== 3) throw new Error("PILOT_SELECTION_INVALID")

  const pool = new Pool({ connectionString: databaseUrl, ssl: { rejectUnauthorized: false }, max: 1 })
  const numbers = createService(createPostgresAdapter({ pool }), { maxAttempts: 1000 })
  let writes = { postgres: 0, hubspotPropertiesCreated: 0, contactsCreated: 0, contactsUpdated: 0, dealsCreated: 0, dealsUpdated: 0, associationsCreated: 0, driveFoldersCreated: 0, driveFilesUploaded: 0 }

  async function hs(method, endpoint, body, write = false) {
    if (write && !requestedApply) return { dryRun: true }
    const response = await fetch(`https://api.hubapi.com${endpoint}`, {
      method,
      headers: { Authorization: `Bearer ${env.HUBSPOT_TOKEN}`, "Content-Type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) })
    })
    if (!response.ok) throw new Error(`HUBSPOT_HTTP_${response.status}`)
    return response.status === 204 ? {} : response.json()
  }

  async function search(object, propertyName, value, properties) {
    const response = await hs("POST", `/crm/v3/objects/${object}/search`, {
      filterGroups: [{ filters: [{ propertyName, operator: "EQ", value }] }],
      properties,
      limit: 10
    })
    return response.results || []
  }

  async function ensureDealProperties() {
    for (const definition of DEAL_PROPERTY_DEFINITIONS) {
      const existing = await fetch(`https://api.hubapi.com/crm/v3/properties/0-3/${encodeURIComponent(definition.name)}`, {
        headers: { Authorization: `Bearer ${env.HUBSPOT_TOKEN}` }
      })
      if (existing.ok) continue
      if (existing.status !== 404) throw new Error(`HUBSPOT_PROPERTY_READ_${existing.status}`)
      if (!requestedApply) continue
      await hs("POST", "/crm/v3/properties/0-3", { groupName: "dealinformation", ...definition }, true)
      writes.hubspotPropertiesCreated++
    }
  }

  const driveCredentials = {
    clientId: env.GOOGLE_DRIVE_CLIENT_ID || env.GOOGLE_CLIENT_ID,
    clientSecret: env.GOOGLE_DRIVE_CLIENT_SECRET || env.GOOGLE_CLIENT_SECRET,
    refreshToken: env.GOOGLE_DRIVE_REFRESH_TOKEN || env.GOOGLE_REFRESH_TOKEN,
    rootFolderId: env.GOOGLE_DRIVE_ROOT_FOLDER_ID
  }
  if (!Object.values(driveCredentials).every(value => typeof value === "string" && value.trim())) throw new Error("GOOGLE_DRIVE_ENV_MISSING")
  const oauth = new google.auth.OAuth2(driveCredentials.clientId, driveCredentials.clientSecret)
  oauth.setCredentials({ refresh_token: driveCredentials.refreshToken })
  const drive = google.drive({ version: "v3", auth: oauth })

  async function findDriveFolder(parentId, logicalId) {
    const response = await drive.files.list({
      q: `'${escapeDriveQuery(parentId)}' in parents and trashed=false and mimeType='application/vnd.google-apps.folder' and appProperties has { key='logicalId' and value='${escapeDriveQuery(logicalId)}' }`,
      fields: "files(id,name,parents,appProperties)",
      pageSize: 10
    })
    if ((response.data.files || []).length > 1) throw new Error("DRIVE_FOLDER_AMBIGUOUS")
    return response.data.files?.[0] || null
  }

  async function ensureDriveFolder(parentId, logicalId, name, properties = {}) {
    let folder = await findDriveFolder(parentId, logicalId)
    if (!folder && requestedApply) {
      const response = await drive.files.create({
        requestBody: { name, mimeType: "application/vnd.google-apps.folder", parents: [parentId], appProperties: { logicalId, ...properties } },
        fields: "id,name,parents,appProperties"
      })
      folder = response.data
      writes.driveFoldersCreated++
    }
    return folder
  }

  async function ensureDriveCase({ selected, caseNumber, typeLabel }) {
    const area = await ensureDriveFolder(driveCredentials.rootFolderId, "area:inss", "Previdenciário")
    if (!area) return { folderId: null, reference: null, verified: false, uploaded: 0 }
    const caseFolder = await ensureDriveFolder(area.id, `case:${selected.importId}`, `${caseNumber} - ${selected.name} - ${typeLabel}`, { caseImportId: selected.importId })
    if (!caseFolder) return { folderId: null, reference: null, verified: false, uploaded: 0 }
    const sourceRoot = path.join("C:\\Users\\jesai\\Documents\\ARQUIVOS PESSOAIS\\Direito\\INSS", selected.folder)
    const files = walkFiles(sourceRoot)
    const hashes = new Set()
    let uploaded = 0
    for (const file of files) {
      const hash = await sha256File(file)
      if (hashes.has(hash)) continue
      hashes.add(hash)
      const category = driveCategory(file)
      const categoryFolder = await ensureDriveFolder(caseFolder.id, `category:${selected.importId}:${crypto.createHash("sha256").update(category).digest("hex").slice(0, 12)}`, category, { caseImportId: selected.importId, category })
      if (!categoryFolder) continue
      const existing = await drive.files.list({
        q: `'${escapeDriveQuery(categoryFolder.id)}' in parents and trashed=false and appProperties has { key='sha256' and value='${hash}' }`,
        fields: "files(id)",
        pageSize: 10
      })
      if ((existing.data.files || []).length > 1) throw new Error("DRIVE_FILE_AMBIGUOUS")
      if (!existing.data.files?.length && requestedApply) {
        await drive.files.create({
          requestBody: {
            name: path.basename(file),
            parents: [categoryFolder.id],
            appProperties: { sha256: hash, caseImportId: selected.importId, category }
          },
          media: { mimeType: "application/octet-stream", body: fs.createReadStream(file) },
          fields: "id"
        })
        uploaded++
        writes.driveFilesUploaded++
      }
    }
    const verified = Boolean(await findDriveFolder(area.id, `case:${selected.importId}`))
    return { folderId: caseFolder.id, reference: `https://drive.google.com/drive/folders/${caseFolder.id}`, verified, uploaded }
  }

  try {
    await ensureDealProperties()
    const results = []
    const pilots = orderedPilots(selection.selection)
    for (let offset = 0; offset < pilots.length; offset++) {
      const pilotNumber = offset + 1
      const selected = pilots[offset]
      const historicalIndex = selection.selection.indexOf(selected) + 1
      const phone = normalizePhone(selected.phone)
      const byPhone = await search("contacts", "phone", phone, ["firstname", "phone", "email", "cpf_do_cliente"])
      if (byPhone.length > 1) throw new Error(`PILOT_${pilotNumber}_DUPLICATE_CONTACT`)

      let contactId = byPhone[0]?.id
      let contactAction = contactId ? "reused" : "would_create"
      if (!contactId && requestedApply) {
        const properties = validateHubSpotProperties("contacts", {
          firstname: selected.name,
          phone,
          area_juridica: "Previdenciário (INSS)"
        }, item => warnings.push(item))
        const created = await hs("POST", "/crm/v3/objects/contacts", { properties }, true)
        contactId = created.id
        contactAction = "created"
        writes.contactsCreated++
      }

      const reservationKey = `case-import:${selected.importId}`
      let reservation = await numbers.findByKey(reservationKey)
      let caseNumber = pilotNumber === 1 ? "PRV.260714.707" : reservation?.case_number
      if (!caseNumber && requestedApply) {
        const reserved = await numbers.reserve({ key: reservationKey, area: "INSS" })
        if (!reserved.reserved) throw new Error(`PILOT_${pilotNumber}_CASE_NUMBER_RESERVATION_FAILED`)
        reservation = { case_number: reserved.numero }
        caseNumber = reserved.numero
        writes.postgres++
      }
      if (!caseNumber && !requestedApply) caseNumber = `PRV.DRYRUN.${pilotNumber}`

      const analysis = analysisFor(historicalIndex)
      analysis.caseImportId = selected.importId
      analysis.consolidatedResult.mappedType = selected.type
      const typeLabel = selected.type === "inss_bpc" ? "BPC LOAS" : "Benefício por Incapacidade"
      const driveState = await ensureDriveCase({ selected, caseNumber, typeLabel })
      analysis.consolidatedResult.sourceFolder = driveState.reference || `inss://${selected.importId}`
      analysis.consolidatedResult.telefonesEncontrados = [phone]
      analysis.consolidatedResult.nomesEncontrados = [selected.name]
      const model = canonicalCaseFromAnalysis({ analysis, selection: selected, caseNumber })
      const mapped = canonicalCaseToHubSpot(model)
      mapped.deal.oraculum_review_required = String(mapped.deal.oraculum_review_required)
      const plannedDeal = validateHubSpotProperties("deals", mergeNonEmpty({
        pipeline: "default",
        dealstage: "presentationscheduled",
        origem_atendimento: "importacao_arquivo",
        description: `Importação documental idempotente. Arquivos analisados: ${analysis.consolidatedResult.analyzedFileCount || 0}.`
      }, mapped.deal), item => warnings.push(item))

      const deals = await search("deals", "numero_de_caso", caseNumber, Object.keys(plannedDeal))
      if (deals.length > 1) throw new Error(`PILOT_${pilotNumber}_DUPLICATE_DEAL`)
      let dealId = deals[0]?.id
      let dealAction = dealId ? "unchanged" : "would_create"
      if (dealId) {
        const current = deals[0].properties || {}
        const changed = Object.fromEntries(Object.entries(plannedDeal).filter(([key, value]) =>
          String(value || "").trim() && String(current[key] || "").trim() !== String(value).trim()
        ))
        if (Object.keys(changed).length) {
          dealAction = requestedApply ? "updated" : "would_update"
          if (requestedApply) {
            await hs("PATCH", `/crm/v3/objects/deals/${encodeURIComponent(dealId)}`, { properties: changed }, true)
            writes.dealsUpdated++
          }
        }
      } else if (requestedApply) {
        const created = await hs("POST", "/crm/v3/objects/deals", { properties: plannedDeal }, true)
        dealId = created.id
        dealAction = "created"
        writes.dealsCreated++
      }

      let associationVerified = false
      if (contactId && dealId) {
        const associations = await hs("GET", `/crm/v4/objects/deals/${encodeURIComponent(dealId)}/associations/contacts?limit=100`)
        associationVerified = (associations.results || []).some(item => String(item.toObjectId || item.id) === String(contactId))
        if (!associationVerified && requestedApply) {
          await hs("PUT", `/crm/v4/objects/deals/${encodeURIComponent(dealId)}/associations/contacts/${encodeURIComponent(contactId)}`, [{
            associationCategory: "HUBSPOT_DEFINED",
            associationTypeId: 3
          }], true)
          writes.associationsCreated++
          const verified = await hs("GET", `/crm/v4/objects/deals/${encodeURIComponent(dealId)}/associations/contacts?limit=100`)
          associationVerified = (verified.results || []).some(item => String(item.toObjectId || item.id) === String(contactId))
        }
      }

      let fieldsComplete = false
      let titleCanonical = false
      if (dealId) {
        const verified = await hs("GET", `/crm/v3/objects/deals/${encodeURIComponent(dealId)}?properties=${encodeURIComponent(Object.keys(plannedDeal).join(","))}`)
        fieldsComplete = Object.entries(plannedDeal).every(([key, value]) => String(verified.properties?.[key] || "").trim() === String(value || "").trim())
        titleCanonical = verified.properties?.dealname === model.title && !model.title.includes("Prv-PRV")
      }
      results.push(reportPilot(pilotNumber, {
        contactAction, dealAction, associationVerified,
        duplicateContacts: Math.max(0, byPhone.length - 1),
        duplicateDeals: Math.max(0, deals.length - 1),
        titleCanonical, fieldsComplete,
        driveVerified: driveState.verified
      }))
    }
    console.log(JSON.stringify({ ok: true, mode: requestedApply ? "apply" : "preflight", results, writes, warnings: warnings.length }))
  } finally {
    await pool.end().catch(() => {})
  }
}

if (require.main === module) main().catch(error => {
  console.error(JSON.stringify({ ok: false, error: String(error.message || "THREE_PILOT_APPLY_FAILED").replace(/[^\w:-]/g, "_") }))
  process.exitCode = 1
})

module.exports = { main, APPLY_CONFIRMATION, orderedPilots }
