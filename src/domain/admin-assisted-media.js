const crypto = require("node:crypto")

const SUPPORTED_ADMIN_MEDIA = new Set(["image", "document"])
const ALLOWED_MEDIA_TYPES = new Map([
  ["application/pdf", new Set(["pdf"])],
  ["image/jpeg", new Set(["jpg", "jpeg"])],
  ["image/png", new Set(["png"])]
])

const ADMIN_DOCUMENT_STORAGE_CATEGORIES = Object.freeze([
  "Identificação",
  "Médicos",
  "Administrativos ou INSS",
  "Contratos e procurações",
  "Outros"
])

function normalizeCategoryText(value = "") {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim()
}

function resolveAdminDocumentStorageCategory(category = "", type = "") {
  const categoryText = normalizeCategoryText(category)
  const typeText = normalizeCategoryText(type)
  if (["documentos_pessoais", "pessoal", "identificacao", "identidade"].includes(categoryText)) return "Identificação"
  if (["medico", "medicos", "saude"].includes(categoryText)) return "Médicos"
  if (["previdenciario", "inss", "administrativo"].includes(categoryText)) return "Administrativos ou INSS"
  if (/\b(contrato|procuracao)\b/.test(typeText) || ["contratos", "procuracoes"].includes(categoryText)) return "Contratos e procurações"
  return "Outros"
}

function sanitizeMediaName(name = "documento", mimeType = "application/octet-stream") {
  const original = String(name || "documento").trim()
  const extension = original.includes(".") ? original.split(".").pop().toLowerCase() : ""
  const allowed = ALLOWED_MEDIA_TYPES.get(String(mimeType).toLowerCase())
  if (!allowed || !allowed.has(extension)) return null
  const stem = original.replace(/^.*[\\/]/, "").replace(/\.[^.]+$/, "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._ -]/g, "_").replace(/\.{2,}/g, ".").trim()
    .slice(0, 100) || "documento"
  return `${stem}.${extension}`
}

function mediaType(message = {}) {
  return String(message.type || "").trim().toLowerCase()
}

function mediaDescriptor(message = {}) {
  const type = mediaType(message)
  const payload = message[type] || {}
  return {
    type,
    mediaId: String(payload.id || "").trim(),
    mimeType: String(payload.mime_type || "application/octet-stream").trim(),
    fileName: String(payload.filename || `${type}-${Date.now()}`).trim()
  }
}

function createAdminAssistedMediaStaging(options = {}) {
  const staged = new Map()
  const maxBytes = Number(options.maxBytes || 20 * 1024 * 1024)

  async function stage(message = {}, deps = {}) {
    const descriptor = mediaDescriptor(message)
    if (!SUPPORTED_ADMIN_MEDIA.has(descriptor.type)) return { handled: false }
    if (!descriptor.mediaId) return { handled: true, ok: false, reason: "media_id_missing" }
    const downloaded = await deps.downloadMedia(descriptor.mediaId)
    const buffer = downloaded?.buffer
    if (!Buffer.isBuffer(buffer) || !buffer.length) return { handled: true, ok: false, reason: "media_download_failed" }
    if (buffer.length > maxBytes) return { handled: true, ok: false, reason: "media_too_large" }
    const mimeType = String(downloaded.mimeType || descriptor.mimeType).toLowerCase()
    const safeName = sanitizeMediaName(descriptor.fileName, mimeType)
    if (!safeName) return { handled: true, ok: false, reason: "media_type_not_allowed" }
    const sha256 = crypto.createHash("sha256").update(buffer).digest("hex")
    if (staged.has(sha256)) return { handled: true, ok: true, duplicate: true, document: staged.get(sha256).metadata }

    const pipeline = await deps.analyzeDocument({ buffer, mimeType: downloaded.mimeType || descriptor.mimeType })
    const classification = pipeline?.classificacao || {}
    const extraction = pipeline?.extracao || {}
    const integrity = await deps.resolveIntegrity?.({ descriptor, sha256, pipeline }) || {}
    const approved = integrity.approved === true && integrity.partyRole
    const metadata = {
      sha256,
      name: safeName,
      originalName: descriptor.fileName,
      mediaId: descriptor.mediaId,
      size: buffer.length,
      receivedAt: new Date().toISOString(),
      mimeType,
      type: classification.tipoDocumento || null,
      category: classification.categoria || null,
      storageCategory: resolveAdminDocumentStorageCategory(classification.categoria, classification.tipoDocumento),
      confidence: classification.confianca ?? null,
      partyRole: integrity.partyRole || null,
      status: approved ? "approved" : "quarantined",
      quarantineReason: approved ? null : integrity.reason || "human_review_required",
      originalPreserved: true
    }
    staged.set(sha256, { buffer, metadata, pipeline })
    return { handled: true, ok: true, duplicate: false, document: metadata }
  }

  async function promote(sha256, destination = {}, deps = {}) {
    const item = staged.get(String(sha256 || "").toLowerCase())
    if (!item) throw Object.assign(new Error("staged media not found"), { code: "ADMIN_MEDIA_NOT_FOUND" })
    if (item.metadata.status !== "approved") throw Object.assign(new Error("media requires human review"), { code: "ADMIN_MEDIA_REVIEW_REQUIRED" })
    const uploaded = await deps.uploadVerified({
      folderId: destination.folderId,
      name: item.metadata.name,
      buffer: item.buffer,
      mimeType: item.metadata.mimeType,
      sha256: item.metadata.sha256,
      idempotencyKey: `admin-media:${destination.caseNumber}:${item.metadata.sha256}`
    })
    if (!uploaded?.id || uploaded.sha256 && uploaded.sha256 !== item.metadata.sha256) {
      throw Object.assign(new Error("ADMIN_MEDIA_UPLOAD_VERIFY_FAILED: admin media upload verification failed"), { code: "ADMIN_MEDIA_UPLOAD_VERIFY_FAILED" })
    }
    item.metadata.fileId = String(uploaded.id)
    item.metadata.status = "promoted"
    staged.delete(item.metadata.sha256)
    return { ...item.metadata }
  }

  function review(sha256, decision = {}) {
    const item = staged.get(String(sha256 || "").toLowerCase())
    if (!item) return null
    if (decision.approved === true && decision.partyRole) {
      item.metadata.status = "approved"
      item.metadata.partyRole = decision.partyRole
      item.metadata.quarantineReason = null
    } else {
      item.metadata.status = "quarantined"
      item.metadata.quarantineReason = decision.reason || "human_review_required"
    }
    return { ...item.metadata }
  }

  function list() {
    return [...staged.values()].map(item => ({ ...item.metadata }))
  }

  return { stage, promote, review, list }
}

async function processExistingCaseAdminMedia({ staging, message, caseRecord, deps = {} } = {}) {
  if (!caseRecord?.numeroCaso || !caseRecord?.caseFolderId) {
    throw Object.assign(new Error("ADMIN_MEDIA_CASE_REQUIRED: selecione um caso com pasta confirmada"), { code: "ADMIN_MEDIA_CASE_REQUIRED" })
  }
  if (!staging?.stage || !staging?.promote) throw Object.assign(new Error("ADMIN_MEDIA_STAGING_REQUIRED"), { code: "ADMIN_MEDIA_STAGING_REQUIRED" })
  const staged = await staging.stage(message, deps)
  if (!staged?.handled || !staged?.ok) return { ok: false, reason: staged?.reason || "media_not_staged" }
  const existing = caseRecord.receivedDocuments?.[staged.document?.sha256]
  if (existing?.fileId) return { ok: true, duplicate: true, fileId: existing.fileId, sha256: staged.document.sha256, document: existing }
  if (staged.document?.status !== "approved") return { ok: false, reviewRequired: true, document: staged.document }
  const promoted = await staging.promote(staged.document.sha256, {
    folderId: caseRecord.caseFolderId,
    caseNumber: caseRecord.numeroCaso
  }, { uploadVerified: deps.uploadVerified })
  if (!promoted?.fileId) throw Object.assign(new Error("ADMIN_MEDIA_UPLOAD_VERIFY_FAILED"), { code: "ADMIN_MEDIA_UPLOAD_VERIFY_FAILED" })
  return { ok: true, fileId: promoted.fileId, sha256: promoted.sha256, document: promoted }
}

module.exports = {
  SUPPORTED_ADMIN_MEDIA,
  ALLOWED_MEDIA_TYPES,
  ADMIN_DOCUMENT_STORAGE_CATEGORIES,
  resolveAdminDocumentStorageCategory,
  mediaType,
  mediaDescriptor,
  sanitizeMediaName,
  createAdminAssistedMediaStaging,
  processExistingCaseAdminMedia
}
