const path = require("node:path")

const SUPPLEMENTAL_DOCUMENT_TYPES = Object.freeze({
  cras: Object.freeze({
    id: "doc_extra_cras",
    label: "Comprovante de atualização do Cadastro Único/CRAS",
    shortLabel: "Comprovante do CRAS",
    fileLabel: "Comprovante atualizacao Cadastro Unico CRAS",
    category: "cadastro_social"
  }),
  prova: Object.freeze({
    id: "doc_extra_prova",
    label: "Prova ou comprovante adicional do caso",
    shortLabel: "Prova adicional",
    fileLabel: "Prova adicional do caso",
    category: "prova_adicional"
  }),
  outro: Object.freeze({
    id: "doc_extra_outro",
    label: "Outro documento complementar",
    shortLabel: "Documento complementar",
    fileLabel: "Documento complementar",
    category: "outros"
  })
})

function getSupplementalDocumentType(key = "") {
  return SUPPLEMENTAL_DOCUMENT_TYPES[String(key || "").trim().toLowerCase()] || null
}

function sanitizeFilenamePart(value = "") {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9 -]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function buildSupplementalFilename(type, clientName, originalName, sequence = 1) {
  const definition = typeof type === "string" ? getSupplementalDocumentType(type) : type
  if (!definition) return null
  const extension = path.extname(String(originalName || ""))
  const safeExtension = /^\.[a-zA-Z0-9]{1,5}$/.test(extension) ? extension.toLowerCase() : ".jpg"
  const safeClient = sanitizeFilenamePart(clientName || "Cliente") || "Cliente"
  const safeSequence = Math.max(1, Number(sequence) || 1)
  return `${definition.fileLabel} ${safeSequence} - ${safeClient}${safeExtension}`
}

function registerSupplementalDocument(user = {}, entry = {}) {
  if (!Array.isArray(user.documentosComplementares)) user.documentosComplementares = []
  const type = typeof entry.type === "string" ? getSupplementalDocumentType(entry.type) : entry.type
  const record = {
    id: type?.id || "doc_extra_outro",
    label: type?.label || "Documento complementar",
    category: type?.category || "outros",
    fileId: entry.fileId || null,
    fileName: entry.fileName || null,
    receivedAt: entry.receivedAt || new Date().toISOString()
  }
  if (record.fileId && user.documentosComplementares.some(item => item?.fileId === record.fileId)) {
    return user.documentosComplementares.find(item => item?.fileId === record.fileId)
  }
  user.documentosComplementares.push(record)
  return record
}

function supplementalDocumentCount(user = {}, type = null) {
  const entries = Array.isArray(user.documentosComplementares) ? user.documentosComplementares : []
  if (!type) return entries.length
  const definition = typeof type === "string" ? getSupplementalDocumentType(type) : type
  return entries.filter(item => item?.id === definition?.id).length
}

module.exports = {
  SUPPLEMENTAL_DOCUMENT_TYPES,
  getSupplementalDocumentType,
  buildSupplementalFilename,
  registerSupplementalDocument,
  supplementalDocumentCount
}
