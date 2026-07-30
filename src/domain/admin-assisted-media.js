const crypto = require("node:crypto")

const SUPPORTED_ADMIN_MEDIA = new Set(["image", "document"])

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
    const sha256 = crypto.createHash("sha256").update(buffer).digest("hex")
    if (staged.has(sha256)) return { handled: true, ok: true, duplicate: true, document: staged.get(sha256).metadata }

    const pipeline = await deps.analyzeDocument({ buffer, mimeType: downloaded.mimeType || descriptor.mimeType })
    const classification = pipeline?.classificacao || {}
    const extraction = pipeline?.extracao || {}
    const integrity = await deps.resolveIntegrity?.({ descriptor, sha256, pipeline }) || {}
    const approved = integrity.approved === true && integrity.partyRole
    const metadata = {
      sha256,
      name: descriptor.fileName,
      mimeType: downloaded.mimeType || descriptor.mimeType,
      type: classification.tipoDocumento || null,
      category: classification.categoria || null,
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
      throw Object.assign(new Error("admin media upload verification failed"), { code: "ADMIN_MEDIA_UPLOAD_VERIFY_FAILED" })
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

module.exports = { SUPPORTED_ADMIN_MEDIA, mediaType, mediaDescriptor, createAdminAssistedMediaStaging }
