"use strict"

const crypto = require("node:crypto")

const DOCUMENT_EVIDENCE_CONTRACT_VERSION = 1

function texto(value) {
  return typeof value === "string" ? value.trim() : ""
}

function erroContrato(code, message) {
  return Object.assign(new Error(message), { code })
}

function exigirTexto(value, field) {
  const normalized = texto(value)
  if (!normalized) throw erroContrato("DOCUMENT_EVIDENCE_INVALID", `${field} obrigatorio`)
  return normalized
}

function normalizarSha256(value) {
  const normalized = texto(value).toLowerCase()
  if (!/^[a-f0-9]{64}$/.test(normalized)) {
    throw erroContrato("DOCUMENT_EVIDENCE_INVALID_SHA256", "sha256 invalido")
  }
  return normalized
}

function normalizarPageNumber(value) {
  if (value === null || value === undefined || value === "") return null
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw erroContrato("DOCUMENT_EVIDENCE_INVALID_PAGE", "pageNumber deve ser inteiro positivo")
  }
  return parsed
}

function sanitizarPersistivel(value) {
  if (Buffer.isBuffer(value) || value === undefined || typeof value === "function" || typeof value === "symbol") {
    return undefined
  }
  if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value
  }
  if (value instanceof Date) return value.toISOString()
  if (Array.isArray(value)) {
    return value.map(sanitizarPersistivel).filter(item => item !== undefined)
  }
  if (typeof value === "object") {
    return Object.fromEntries(Object.entries(value).flatMap(([key, item]) => {
      const sanitized = sanitizarPersistivel(item)
      return sanitized === undefined ? [] : [[key, sanitized]]
    }))
  }
  return undefined
}

function stableHash(value) {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex")
}

function criarEvidenceId(fileId, pageNumber = null) {
  const physicalId = exigirTexto(fileId, "fileId")
  const page = normalizarPageNumber(pageNumber)
  return page === null ? physicalId : `${physicalId}#page=${page}`
}

function criarArquivoFisico(input = {}) {
  return {
    fileId: exigirTexto(input.fileId, "fileId"),
    sha256: normalizarSha256(input.sha256),
    mimeType: texto(input.mimeType || input.arquivoFisico?.mimeType) || null
  }
}

function criarUnidadeLogica(input = {}) {
  const fileId = exigirTexto(input.fileId, "fileId")
  const pageNumber = normalizarPageNumber(input.pageNumber)
  const expectedEvidenceId = criarEvidenceId(fileId, pageNumber)
  const evidenceId = texto(input.evidenceId) || expectedEvidenceId
  if (evidenceId !== expectedEvidenceId) {
    throw erroContrato("DOCUMENT_EVIDENCE_ID_MISMATCH", "evidenceId nao corresponde ao fileId/pageNumber")
  }
  return { evidenceId, fileId, pageNumber }
}

function normalizarCoverage(value) {
  return [...new Set((Array.isArray(value) ? value : []).map(texto).filter(Boolean))]
}

function criarEvidenciaDocumental(input = {}) {
  const arquivoFisico = criarArquivoFisico(input)
  const unidadeLogica = criarUnidadeLogica(input)
  const version = Number(input.version ?? input.versao ?? 1)
  if (!Number.isInteger(version) || version < 1) {
    throw erroContrato("DOCUMENT_EVIDENCE_INVALID_VERSION", "version deve ser inteiro positivo")
  }
  const classificacao = sanitizarPersistivel(input.classificacao) ?? null
  const extracao = sanitizarPersistivel(input.extracao) ?? null
  const tipoDocumento = texto(input.tipoDocumento || classificacao?.tipoDocumento) || null
  return {
    evidenceId: unidadeLogica.evidenceId,
    fileId: arquivoFisico.fileId,
    sha256: arquivoFisico.sha256,
    mimeType: arquivoFisico.mimeType,
    pageNumber: unidadeLogica.pageNumber,
    tipoDocumento,
    classificacao,
    extracao,
    coverage: normalizarCoverage(input.coverage),
    status: texto(input.status) || "analyzed",
    version,
    arquivoFisico,
    unidadeLogica
  }
}

function criarConfirmationId(input = {}) {
  const explicit = texto(input.confirmationId)
  if (explicit) return explicit
  const material = {
    fileId: exigirTexto(input.fileId, "fileId"),
    origem: exigirTexto(input.origem, "origem"),
    assertion: texto(input.assertion) || null
  }
  return `confirmation:${stableHash(material).slice(0, 32)}`
}

function criarConfirmacaoDocumental(input = {}) {
  const fileId = exigirTexto(input.fileId, "fileId")
  const origem = exigirTexto(input.origem, "origem")
  const data = exigirTexto(input.data || input.confirmedAt, "data")
  return {
    confirmationId: criarConfirmationId({ ...input, fileId, origem }),
    fileId,
    data,
    origem,
    assertion: texto(input.assertion) || null
  }
}

function criarDivergenciaDocumental(input = {}) {
  const code = exigirTexto(input.code, "code")
  const evidenceIds = [...new Set((input.evidenceIds || []).map(texto).filter(Boolean))]
  const createdAt = exigirTexto(input.createdAt || input.data, "createdAt")
  const divergenceId = texto(input.divergenceId) || `divergence:${stableHash({ code, evidenceIds }).slice(0, 32)}`
  return {
    divergenceId,
    code,
    evidenceIds,
    status: texto(input.status) || "open",
    createdAt,
    details: sanitizarPersistivel(input.details) ?? null
  }
}

function criarDecisaoDocumental(input = {}) {
  const requirementId = exigirTexto(input.requirementId, "requirementId")
  const revision = Number(input.revision)
  if (!Number.isInteger(revision) || revision < 1) {
    throw erroContrato("DOCUMENT_DECISION_INVALID_REVISION", "revision deve ser inteiro positivo")
  }
  return {
    requirementId,
    revision,
    status: exigirTexto(input.status, "status"),
    evidenceIds: [...new Set((input.evidenceIds || []).map(texto).filter(Boolean))],
    confirmationIds: [...new Set((input.confirmationIds || []).map(texto).filter(Boolean))],
    reasonCode: exigirTexto(input.reasonCode, "reasonCode"),
    decidedAt: exigirTexto(input.decidedAt, "decidedAt")
  }
}

function materialIgual(left, right) {
  return JSON.stringify(left) === JSON.stringify(right)
}

function normalizarLista(input, factory) {
  const result = []
  for (const item of Array.isArray(input) ? input : []) {
    try {
      result.push(factory(item))
    } catch {}
  }
  return result
}

function normalizarContratoEvidencias(registry = {}) {
  const input = registry && typeof registry === "object" && !Array.isArray(registry) ? registry : {}
  return {
    ...input,
    evidenceContractVersion: DOCUMENT_EVIDENCE_CONTRACT_VERSION,
    evidencias: normalizarLista(input.evidencias, criarEvidenciaDocumental),
    confirmacoes: normalizarLista(input.confirmacoes, criarConfirmacaoDocumental),
    divergencias: (Array.isArray(input.divergencias) ? input.divergencias : [])
      .map(sanitizarPersistivel).filter(item => item && typeof item === "object"),
    decisoes: normalizarLista(input.decisoes, criarDecisaoDocumental)
  }
}

function adicionarVersionado(registry, field, item, identity, conflictCode) {
  const state = normalizarContratoEvidencias(registry)
  const index = state[field].findIndex(existing => identity(existing) === identity(item))
  if (index < 0) return { ...state, [field]: [...state[field], item] }
  if (!materialIgual(state[field][index], item)) {
    throw erroContrato(conflictCode, `${field} possui identidade conflitante`)
  }
  return state
}

function registrarEvidenciaDocumental(registry = {}, input = {}) {
  const evidence = criarEvidenciaDocumental(input)
  return adicionarVersionado(
    registry, "evidencias", evidence,
    item => `${item.evidenceId}:${item.version}`,
    "DOCUMENT_EVIDENCE_VERSION_CONFLICT"
  )
}

function registrarConfirmacaoDocumental(registry = {}, input = {}) {
  const state = normalizarContratoEvidencias(registry)
  const confirmation = criarConfirmacaoDocumental(input)
  if (!state.evidencias.some(evidence => evidence.fileId === confirmation.fileId)) {
    throw erroContrato("DOCUMENT_CONFIRMATION_FILE_NOT_FOUND", "confirmacao sem evidencia do fileId")
  }
  const existing = state.confirmacoes.find(item => item.confirmationId === confirmation.confirmationId)
  if (!existing) return { ...state, confirmacoes: [...state.confirmacoes, confirmation] }
  const sameConfirmation = existing.fileId === confirmation.fileId &&
    existing.origem === confirmation.origem && existing.assertion === confirmation.assertion
  if (!sameConfirmation) {
    throw erroContrato("DOCUMENT_CONFIRMATION_CONFLICT", "confirmacoes possui identidade conflitante")
  }
  return state
}

function registrarDivergenciaDocumental(registry = {}, input = {}) {
  const divergence = criarDivergenciaDocumental(input)
  return adicionarVersionado(
    registry, "divergencias", divergence,
    item => item.divergenceId || stableHash(item),
    "DOCUMENT_DIVERGENCE_CONFLICT"
  )
}

function registrarDecisaoDocumental(registry = {}, input = {}) {
  const decision = criarDecisaoDocumental(input)
  return adicionarVersionado(
    registry, "decisoes", decision,
    item => `${item.requirementId}:${item.revision}`,
    "DOCUMENT_DECISION_REVISION_CONFLICT"
  )
}

module.exports = {
  DOCUMENT_EVIDENCE_CONTRACT_VERSION,
  criarEvidenceId,
  criarArquivoFisico,
  criarUnidadeLogica,
  criarEvidenciaDocumental,
  criarConfirmacaoDocumental,
  criarDivergenciaDocumental,
  criarDecisaoDocumental,
  normalizarContratoEvidencias,
  registrarEvidenciaDocumental,
  registrarConfirmacaoDocumental,
  registrarDivergenciaDocumental,
  registrarDecisaoDocumental,
  sanitizarPersistivel
}
