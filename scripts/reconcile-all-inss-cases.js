#!/usr/bin/env node
"use strict"

const fs = require("node:fs")
const path = require("node:path")
const crypto = require("node:crypto")
const { google } = require("googleapis")
const { Pool } = require("pg")
const { inventory } = require("./import-real-cases")
const { classify, category } = require("./process-all-inss-cases")
const { montarTituloNegocioHubSpot } = require("../src/domain/hubspot-deal-title")
const { loadOperationalEnvironment } = require("../src/composition/oraculum-runtime-env")
const { createService, createPostgresAdapter } = require("../src/domain/case-number")
const { normalizarTelefone } = require("../src/domain/phone-name")
const { analisarCasoJuridico } = require("../src/domain/legal-copilot")
const {
  parseMarkdownCases, evidenceForCase, summarizeCase, preserve, caseFingerprint,
  extractCaseSignals, similarity
} = require("../src/domain/inss-case-reconciliation")

const CONFIRMATION = "RECONCILE_EXISTING_55_INSS_CASES"
const apply = process.argv.includes("--apply")
const onlyRef = process.argv.find(value => value.startsWith("--only="))?.slice(7) || ""
if (apply && !process.argv.includes(`--confirm=${CONFIRMATION}`)) throw new Error("LIVE_CONFIRMATION_REQUIRED")
const ROOT = "C:\\Users\\jesai\\Documents\\ARQUIVOS PESSOAIS\\Direito\\INSS"
const MARKDOWNS = ["casos_oraculum_confidencial.md", "casos_oraculum_trabalho_mascarado.md"].map(name => path.join(ROOT, name))
const sha = value => crypto.createHash("sha256").update(String(value)).digest("hex")
const safeError = error => String(error?.message || error).replace(/[^\w:.-]/g, "_")

const DEAL_PROPERTIES = [
  { name: "oraculum_case_history", label: "Histórico cronológico Oráculum" },
  { name: "oraculum_preliminary_analysis", label: "Análise preliminar Oráculum" },
  { name: "oraculum_next_action", label: "Próxima ação Oráculum" },
  { name: "oraculum_data_provenance", label: "Proveniência dos dados Oráculum" },
  { name: "oraculum_review_reasons", label: "Motivos concretos de revisão Oráculum" },
  { name: "oraculum_referrer", label: "Indicado por Oráculum" },
  { name: "oraculum_third_parties", label: "Terceiros do caso Oráculum" }
  ,{ name: "oraculum_case_facts", label: "Fatos principais Oráculum" }
  ,{ name: "oraculum_case_periods", label: "Períodos relevantes Oráculum" }
  ,{ name: "oraculum_document_evidence", label: "Provas documentais Oráculum" }
  ,{ name: "oraculum_possible_strategies", label: "Estratégias possíveis Oráculum" }
  ,{ name: "oraculum_analysis_confidence", label: "Confiança da análise Oráculum" }
]
const CONTACT_PROPERTIES = [
  { name: "oraculum_nickname", label: "Apelido Oráculum" },
  { name: "oraculum_referrer", label: "Indicado por Oráculum" },
  { name: "oraculum_identity_provenance", label: "Proveniência da identidade Oráculum" }
]

function walk(directory) {
  const result = []
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name)
    if (entry.isDirectory()) result.push(...walk(full))
    else if (entry.isFile() && !entry.name.startsWith("~$") && !MARKDOWNS.includes(full)) result.push(full)
  }
  return result
}

function sourceFolder(importId) {
  const queue = [ROOT]
  while (queue.length) {
    const current = queue.shift()
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue
      const full = path.join(current, entry.name)
      const relative = path.relative(ROOT, full).toLowerCase()
      if (`inss-${sha(relative).slice(0, 20)}` === importId) return full
      queue.push(full)
    }
  }
  throw new Error("SOURCE_FOLDER_NOT_FOUND")
}

function field(block, labels) {
  if (!block) return ""
  const normalized = value => String(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
  for (const label of labels) {
    const target = normalized(label)
    const key = Object.keys(block.fields).find(item => normalized(item) === target)
    if (key) return block.fields[key]
  }
  return ""
}

function excerpt(text, heading, fallback) {
  const lines = String(text || "").split("\n")
  const index = lines.findIndex(line => line === heading)
  return index >= 0 ? lines.slice(index + 1, index + 5).filter(Boolean).join("\n").slice(0, 5000) : fallback
}

async function extractFastDocumentText(files) {
  const relevant = files.filter(file => /\.(pdf|txt|md)$/i.test(file) && /(rg|cpf|cnh|ident|inss|cnis|benef|requer|indefer|decis|process|laudo|atestado|cras|cad.?unico|contrato|procur)/i.test(path.basename(file))).slice(0, 12)
  const chunks = []
  let pdfjs = null
  for (const file of relevant) {
    try {
      if (/\.(txt|md)$/i.test(file)) {
        chunks.push(fs.readFileSync(file, "utf8").slice(0, 30000))
        continue
      }
      pdfjs ||= await import("pdfjs-dist/legacy/build/pdf.mjs")
      const bytes = new Uint8Array(fs.readFileSync(file))
      const document = await pdfjs.getDocument({ data: bytes, disableWorker: true, useSystemFonts: true }).promise
      try {
        for (let pageNumber = 1; pageNumber <= Math.min(document.numPages, 5); pageNumber++) {
          const page = await document.getPage(pageNumber)
          const content = await page.getTextContent()
          chunks.push(content.items.map(item => item.str).join(" ").slice(0, 12000))
          page.cleanup()
        }
      } finally { await document.destroy() }
    } catch {}
  }
  return chunks.join("\n")
}

async function main() {
  const environment = loadOperationalEnvironment()
  const databaseUrl = environment.EXTERNAL_STATE_DATABASE_URL || environment.DATABASE_URL
  if (!databaseUrl || !environment.HUBSPOT_TOKEN) throw new Error("OPERATIONAL_ENV_MISSING")
  for (const file of MARKDOWNS) if (!fs.existsSync(file)) throw new Error("MARKDOWN_REFERENCE_MISSING")
  const markdownGroups = MARKDOWNS.map(file => parseMarkdownCases(fs.readFileSync(file, "utf8"), path.basename(file)))
  const pilotSelectionPath = path.resolve("data/case-import/pilot-selection.json")
  const pilotSelection = fs.existsSync(pilotSelectionPath)
    ? JSON.parse(fs.readFileSync(pilotSelectionPath, "utf8").replace(/^\uFEFF/, ""))
    : {}
  const pool = new Pool({ connectionString: databaseUrl, ssl: { rejectUnauthorized: false }, max: 1 })
  const numbers = createService(createPostgresAdapter({ pool }), { maxAttempts: 1000 })
  const metrics = {
    folders: 0, reconciled: 0, blocked: 0, contactsUpdated: 0, namesCorrected: 0,
    phonesAdded: 0, referrersCorrected: 0, dealsUpdated: 0, reviews: 0,
    genericReviewsRemoved: 0, duplicateContactsCreated: 0, duplicateDealsCreated: 0
  }
  const caseResults = []

  async function hs(method, endpoint, body) {
    const response = await fetch(`https://api.hubapi.com${endpoint}`, {
      method, headers: { Authorization: `Bearer ${environment.HUBSPOT_TOKEN}`, "Content-Type": "application/json" },
      ...(body ? { body: JSON.stringify(body) } : {})
    })
    if (!response.ok) throw new Error(`HUBSPOT_${response.status}`)
    return response.status === 204 ? {} : response.json()
  }
  async function search(object, property, value, properties) {
    const response = await hs("POST", `/crm/v3/objects/${object}/search`, {
      filterGroups: [{ filters: [{ propertyName: property, operator: "EQ", value }] }],
      properties, limit: 10
    })
    return response.results || []
  }
  async function ensureProperty(object, definition) {
    const endpoint = `/crm/v3/properties/${object}/${definition.name}`
    try { await hs("GET", endpoint) } catch (error) {
      if (!apply || error.message !== "HUBSPOT_404") throw error
      await hs("POST", `/crm/v3/properties/${object}`, {
        groupName: object === "contacts" ? "contactinformation" : "dealinformation",
        name: definition.name, label: definition.label, type: "string", fieldType: "textarea"
      })
    }
  }

  try {
    for (const definition of CONTACT_PROPERTIES) await ensureProperty("contacts", definition)
    for (const definition of DEAL_PROPERTIES) await ensureProperty("deals", definition)
    const discovered = await inventory()
    metrics.folders = discovered.totalFolders
    if (metrics.folders !== 55) throw new Error("REAL_FOLDER_COUNT_CHANGED")

    for (let index = 0; index < discovered.records.length; index++) {
      const record = discovered.records[index]
      const ref = `case-${String(index + 1).padStart(3, "0")}`
      if (onlyRef && ref !== onlyRef) continue
      try {
        const folder = sourceFolder(record.importId)
        const files = walk(folder)
        const classification = classify(files)
        const pilot = (pilotSelection.selection || []).find(item => item?.importId === record.importId)
        const evidenceRecord = pilot?.name ? { ...record, name: pilot.name } : record
        const evidence = evidenceForCase({ record: evidenceRecord, files, blocks: markdownGroups })
        const documentText = await extractFastDocumentText(files)
        const signals = extractCaseSignals([evidence.facts.join("\n"), documentText].join("\n"))
        const supportedNames = signals.officialNameCandidates.filter(name =>
          similarity(name, evidence.officialName || evidenceRecord.name) >= 0.5
        )
        if (supportedNames.length === 1) {
          evidence.officialName = supportedNames[0]
          evidence.provenance.unshift("documento_oficial:texto_pdf")
          evidence.reviewReasons = evidence.reviewReasons.filter(reason => !/nome_sem_|identidade_sem_/.test(reason))
        } else if (supportedNames.length > 1) {
          evidence.reviewReasons.push("multiplos_nomes_oficiais_compativeis")
        }
        const legalAnalysis = analisarCasoJuridico({
          areaJuridica: "INSS",
          tipoCaso: classification.label,
          resumo: [...evidence.facts, ...signals.events].join(" "),
          documentosJaInformados: [...new Set(files.map(category))]
        })
        const deals = await search("deals", "oraculum_case_import_id", record.importId, [
          "dealname", "numero_de_caso", "pasta_drive", "descricao_completa", "resumo_cliente",
          "oraculum_review_required", "oraculum_case_subtype", "oraculum_documents_received",
          "oraculum_documents_pending", "oraculum_analysis_status"
        ])
        if (deals.length !== 1) throw new Error(deals.length ? "DEAL_DUPLICATE" : "DEAL_NOT_FOUND")
        const deal = deals[0]
        const associations = await hs("GET", `/crm/v4/objects/deals/${deal.id}/associations/contacts?limit=100`)
        const associatedContactIds = [...new Set((associations.results || []).map(item => String(item.toObjectId || item.id)))]
        if (associatedContactIds.length > 1 && pilot) {
          const expectedPhone = pilot.phone ? normalizarTelefone(pilot.phone) : ""
          const expectedName = String(pilot.name || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim()
          const matching = []
          for (const id of associatedContactIds) {
            const candidate = await hs("GET", `/crm/v3/objects/contacts/${id}?properties=firstname,phone`)
            let candidatePhone = ""
            try { candidatePhone = candidate.properties?.phone ? normalizarTelefone(candidate.properties.phone) : "" } catch {}
            const candidateName = String(candidate.properties?.firstname || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim()
            if ((expectedPhone && candidatePhone === expectedPhone) || (expectedName && candidateName === expectedName)) matching.push(id)
          }
          if (matching.length === 1) {
            const keep = matching[0]
            for (const id of associatedContactIds.filter(value => value !== keep)) {
              if (apply) await hs("DELETE", `/crm/v4/objects/deals/${deal.id}/associations/contacts/${id}`)
            }
            associatedContactIds.splice(0, associatedContactIds.length, keep)
          }
        }
        if (!associatedContactIds.length) {
          const candidates = await search("contacts", "firstname", record.name, ["firstname", "phone"])
          let byPhone = []
          if (candidates.length !== 1 && pilot?.phone) {
            const variants = [...new Set([pilot.phone, normalizarTelefone(pilot.phone)].filter(Boolean))]
            for (const variant of variants) {
              const found = await search("contacts", "phone", variant, ["firstname", "phone"])
              byPhone.push(...found)
            }
            byPhone = [...new Map(byPhone.map(item => [String(item.id), item])).values()]
          }
          const recoveredId = candidates.length === 1 ? candidates[0].id : byPhone.length === 1 ? byPhone[0].id : null
          if (!recoveredId) throw new Error(`CONTACT_ASSOCIATION_NOT_UNIQUE:${candidates.length}:${byPhone.length}`)
          associatedContactIds.push(String(recoveredId))
          if (apply) {
            await hs("PUT", `/crm/v4/objects/deals/${deal.id}/associations/contacts/${recoveredId}`, [
              { associationCategory: "HUBSPOT_DEFINED", associationTypeId: 3 }
            ])
          }
        }
        if (associatedContactIds.length !== 1) throw new Error("CONTACT_ASSOCIATION_NOT_UNIQUE")
        const contactId = associatedContactIds[0]
        const contact = await hs("GET", `/crm/v3/objects/contacts/${contactId}?properties=firstname,lastname,phone,mobilephone,email,cpf_do_cliente,date_of_birth,oraculum_nickname,oraculum_referrer,oraculum_identity_provenance`)
        const reservation = await numbers.findByKey(`case-import:${record.importId}`)
        if (!reservation?.case_number) throw new Error("CASE_NUMBER_NOT_FOUND")
        const driveUrl = deal.properties?.pasta_drive
        if (!/^https:\/\/drive\.google\.com\/drive\/folders\//.test(driveUrl || "")) throw new Error("DRIVE_LINK_INVALID")
        const categories = [...new Set(files.map(category))]
        const summary = summarizeCase({
          caseNumber: reservation.case_number, classification, evidence, categories,
          driveUrl, fileCount: files.length, signals, legalAnalysis
        })
        const nickname = field(evidence.block, ["Apelido"])
        const currentName = String(contact.properties?.firstname || "").trim()
        const contactProperties = {
          firstname: preserve(currentName, evidence.officialName),
          ...(evidence.clientPhone && !contact.properties?.phone ? { phone: evidence.clientPhone } : {}),
          oraculum_nickname: preserve(contact.properties?.oraculum_nickname, nickname),
          oraculum_referrer: preserve(contact.properties?.oraculum_referrer, evidence.referrer),
          oraculum_identity_provenance: evidence.provenance.join("; ").slice(0, 5000)
        }
        const reviewText = evidence.reviewReasons.join("; ")
        const dealProperties = {
          dealname: montarTituloNegocioHubSpot({ area: "INSS", numeroCaso: reservation.case_number, tipo_de_caso: classification.type }),
          resumo_cliente: summary.slice(0, 5000),
          descricao_completa: summary.slice(0, 65000),
          oraculum_case_history: excerpt(summary, "HISTÓRICO E RELATO DISPONÍVEL", "Sem relato inequivocamente associado."),
          oraculum_preliminary_analysis: excerpt(summary, "ANÁLISE PRELIMINAR", ""),
          oraculum_next_action: excerpt(summary, "PRÓXIMA AÇÃO", ""),
          oraculum_data_provenance: evidence.provenance.join("; ").slice(0, 5000),
          oraculum_review_reasons: reviewText,
          oraculum_referrer: evidence.referrer,
          oraculum_third_parties: evidence.thirdParties,
          oraculum_case_facts: signals.events.join("\n").slice(0, 5000),
          oraculum_case_periods: [...signals.dates, ...signals.periods].join("; ").slice(0, 5000),
          oraculum_document_evidence: categories.map(value => `${value}: documentos presentes no acervo`).join("\n").slice(0, 5000),
          oraculum_possible_strategies: excerpt(summary, "ESTRATÉGIAS POSSÍVEIS", ""),
          oraculum_analysis_confidence: supportedNames.length === 1 ? "alta_para_identidade" : evidence.block ? "moderada" : "baixa",
          oraculum_review_required: evidence.reviewReasons.length ? "true" : "false",
          oraculum_analysis_status: evidence.reviewReasons.length ? "review_required" : "analyzed",
          oraculum_documents_received: categories.join("; ").slice(0, 5000),
          oraculum_documents_pending: evidence.reviewReasons.length ? reviewText : "Nenhuma pendência documental concreta identificada automaticamente.",
          oraculum_document_status: evidence.reviewReasons.length ? "pending_review" : "analyzed"
        }
        if (apply) {
          await hs("PATCH", `/crm/v3/objects/contacts/${contactId}`, { properties: contactProperties })
          await hs("PATCH", `/crm/v3/objects/deals/${deal.id}`, { properties: dealProperties })
        }
        const verifiedContact = apply
          ? await hs("GET", `/crm/v3/objects/contacts/${contactId}?properties=firstname,phone,oraculum_nickname,oraculum_referrer,oraculum_identity_provenance`)
          : { properties: { ...contact.properties, ...contactProperties } }
        const verifiedDeal = apply
          ? await hs("GET", `/crm/v3/objects/deals/${deal.id}?properties=dealname,descricao_completa,oraculum_case_history,oraculum_next_action,oraculum_data_provenance,oraculum_review_required,oraculum_review_reasons,oraculum_case_facts,oraculum_case_periods,oraculum_document_evidence,oraculum_possible_strategies,oraculum_analysis_confidence,pasta_drive`)
          : { properties: { ...deal.properties, ...dealProperties } }
        if (verifiedContact.properties.firstname !== contactProperties.firstname) throw new Error("CONTACT_REREAD_MISMATCH")
        if (verifiedDeal.properties.descricao_completa !== dealProperties.descricao_completa) throw new Error("DEAL_REREAD_MISMATCH")
        for (const property of ["oraculum_case_history", "oraculum_next_action", "oraculum_data_provenance", "oraculum_document_evidence", "oraculum_possible_strategies", "oraculum_case_facts", "oraculum_case_periods", "oraculum_analysis_confidence"]) {
          const actual = String(verifiedDeal.properties?.[property] || "")
          const expected = String(dealProperties[property] || "")
          if (actual !== expected) throw new Error(`DEAL_STRUCTURED_REREAD_MISMATCH:${property}`)
        }
        metrics.reconciled++; metrics.dealsUpdated += apply ? 1 : 0; metrics.contactsUpdated += apply ? 1 : 0
        if (evidence.officialName && evidence.officialName !== currentName) metrics.namesCorrected++
        if (evidence.clientPhone && !contact.properties?.phone) metrics.phonesAdded++
        if (evidence.referrer) metrics.referrersCorrected++
        if (evidence.reviewReasons.length) metrics.reviews++
        if (/Revis.o humana de identidade/i.test(String(deal.properties?.oraculum_documents_pending || ""))) metrics.genericReviewsRemoved++
        caseResults.push({
          ref, fingerprint: caseFingerprint(record.importId), status: "reconciled",
          name: evidence.officialName ? "valid" : "concrete_review",
          phone: evidence.clientPhone ? "completed" : "not_proven",
          referrer: evidence.referrer ? "separated" : "not_found",
          thirdParties: evidence.thirdParties ? "separated" : "not_found",
          type: classification.type, subtype: "only_when_proven",
          review: evidence.reviewReasons.length ? "concrete" : "none",
          reasons: evidence.reviewReasons
        })
      } catch (error) {
        metrics.blocked++
        caseResults.push({ ref, fingerprint: caseFingerprint(record.importId), status: "blocked", reason: safeError(error) })
      }
    }
    console.log(JSON.stringify({ ok: metrics.blocked === 0, mode: apply ? "apply" : "preview", markdownFiles: MARKDOWNS.length, metrics, cases: caseResults }))
  } finally {
    await pool.end().catch(() => {})
  }
}

if (require.main === module) main().catch(error => {
  console.error(JSON.stringify({ ok: false, error: safeError(error) }))
  process.exitCode = 1
})

module.exports = { main, CONFIRMATION, walk, sourceFolder }
