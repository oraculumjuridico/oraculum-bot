"use strict"

const CASE_ORIGINALS_FOLDER = "00 - Originais preservados"
const CASE_ORIGINALS_LEGACY_FOLDERS = Object.freeze(["00 - Originais recebidos"])
const CASE_ADMIN_FOLDER = "00_ADMIN"
const CASE_AUDIO_FOLDER = "90 - Áudios do atendimento"
const CASE_ARCHIVE_FOLDER = "99 - Estrutura anterior"

const LEGACY_CATEGORY_NAMES = new Set([
  "01 - Documentos pessoais",
  "02 - Carteira de trabalho",
  "03 - Residência",
  "04 - Documentos médicos",
  "05 - INSS e CNIS",
  "06 - CRAS e CadÚnico",
  "07 - Documentos socioeconômicos",
  "08 - Declarações",
  "09 - Processo administrativo",
  "10 - Processo judicial",
  "11 - Procuração e contrato",
  "12 - Áudios",
  "13 - Outros documentos",
  "Documentos médicos",
  "Comprovantes de residência",
  "Documentos pessoais",
  "Outros documentos",
  "CRAS e CadÚnico",
  "INSS",
  "Processo judicial",
  "Declarações"
])

function texto(value) {
  return String(value || "").trim()
}

function isCaseFolderName(name) {
  return /^[A-Z]{2,5}\.\d{6}\.\d{3}(?:\s+-|$)/i.test(texto(name))
}

function isOriginalsFolder(name) {
  return name === CASE_ORIGINALS_FOLDER || CASE_ORIGINALS_LEGACY_FOLDERS.includes(name)
}

function isLegacyAudioFolder(name) {
  return /^Áudios\s+-\s+/i.test(texto(name))
}

function isLegacyCategoryFolder(item = {}) {
  const name = texto(item.name || item.title)
  const logicalId = texto(item.appProperties?.logicalId)
  return LEGACY_CATEGORY_NAMES.has(name) || logicalId.startsWith("category:")
}

function safeFilePart(value, fallback = "arquivo") {
  return texto(value)
    .normalize("NFKC")
    .replace(/[\\/:*?"<>|]+/g, " ")
    .replace(/\s+/g, " ")
    .trim() || fallback
}

function audioFileName({ clientName, label, mimeType, now = new Date() } = {}) {
  const extension = /mpeg|mp3/i.test(texto(mimeType)) ? ".mp3" : ".ogg"
  const timestamp = new Date(now).toISOString().replace(/[:]/g, "-").replace(/\.\d{3}Z$/, "Z")
  return `Áudio - ${safeFilePart(clientName, "Cliente")} - ${safeFilePart(label, "Atendimento")} - ${timestamp}${extension}`
}

module.exports = {
  CASE_ORIGINALS_FOLDER,
  CASE_ORIGINALS_LEGACY_FOLDERS,
  CASE_ADMIN_FOLDER,
  CASE_AUDIO_FOLDER,
  CASE_ARCHIVE_FOLDER,
  LEGACY_CATEGORY_NAMES,
  isCaseFolderName,
  isOriginalsFolder,
  isLegacyAudioFolder,
  isLegacyCategoryFolder,
  safeFilePart,
  audioFileName
}
