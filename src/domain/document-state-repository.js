const {
  lerJsonEmSubpastaDrive,
  salvarJsonEmSubpastaDrive
} = require("./drive-files")

const DOCUMENT_STATE_FOLDER = "00_ADMIN"
const DOCUMENT_STATE_FILE = "document-state.json"
const DOCUMENT_STATE_VERSION = 1

function nowISO(options = {}) {
  return options.now || new Date().toISOString()
}

function objeto(valor) {
  return valor && typeof valor === "object" && !Array.isArray(valor) ? valor : {}
}

function normalizarArray(valor) {
  return Array.isArray(valor) ? valor : []
}

function estadoVazio(options = {}) {
  return {
    analysis: {},
    registry: {},
    checklist: {},
    divergences: {},
    dossier: {},
    pdfs: [],
    updatedAt: nowISO(options),
    version: DOCUMENT_STATE_VERSION
  }
}

function normalizarEstadoDocumental(estado = {}, options = {}) {
  const base = estadoVazio(options)
  const entrada = objeto(estado)
  return {
    analysis: objeto(entrada.analysis),
    registry: objeto(entrada.registry),
    checklist: objeto(entrada.checklist),
    divergences: objeto(entrada.divergences),
    dossier: objeto(entrada.dossier),
    pdfs: normalizarArray(entrada.pdfs),
    updatedAt: entrada.updatedAt || base.updatedAt,
    version: DOCUMENT_STATE_VERSION
  }
}

function estadoValido(estado) {
  return Boolean(
    estado &&
    typeof estado === "object" &&
    !Array.isArray(estado) &&
    Number(estado.version) === DOCUMENT_STATE_VERSION
  )
}

function dependencias(deps = {}) {
  return {
    lerJsonEmSubpastaDrive: deps.lerJsonEmSubpastaDrive || lerJsonEmSubpastaDrive,
    salvarJsonEmSubpastaDrive: deps.salvarJsonEmSubpastaDrive || salvarJsonEmSubpastaDrive
  }
}

function assinaturaMaterialEstado(estado = {}) {
  const normalizado = normalizarEstadoDocumental(estado, { now: estado.updatedAt || "" })
  return JSON.stringify({
    analysis: normalizado.analysis,
    registry: normalizado.registry,
    checklist: normalizado.checklist,
    divergences: normalizado.divergences,
    dossier: normalizado.dossier,
    pdfs: normalizado.pdfs,
    version: normalizado.version
  })
}

async function carregarEstadoDocumental(pastaDriveId, deps = {}) {
  if (!pastaDriveId) return null
  const repo = dependencias(deps)
  const existente = await repo.lerJsonEmSubpastaDrive(
    pastaDriveId,
    DOCUMENT_STATE_FOLDER,
    DOCUMENT_STATE_FILE
  )
  if (!estadoValido(existente?.dados)) return null
  return normalizarEstadoDocumental(existente.dados)
}

async function estadoExiste(pastaDriveId, deps = {}) {
  return Boolean(await carregarEstadoDocumental(pastaDriveId, deps))
}

async function salvarEstadoDocumental(pastaDriveId, estado = {}, deps = {}) {
  if (!pastaDriveId) return null
  const repo = dependencias(deps)
  const completo = normalizarEstadoDocumental(estado, deps)
  const salvo = await repo.salvarJsonEmSubpastaDrive(
    pastaDriveId,
    DOCUMENT_STATE_FOLDER,
    DOCUMENT_STATE_FILE,
    completo
  )
  if (!salvo?.id) return null
  return { arquivo: salvo, estado: completo }
}

async function atualizarEstadoDocumental(pastaDriveId, parcial = {}, deps = {}) {
  if (!pastaDriveId) return null
  const atual = await carregarEstadoDocumental(pastaDriveId, deps)
  const base = atual || estadoVazio(deps)
  const candidato = normalizarEstadoDocumental({
    ...base,
    ...objeto(parcial),
    version: DOCUMENT_STATE_VERSION
  }, deps)
  const mudou = assinaturaMaterialEstado(base) !== assinaturaMaterialEstado(candidato)
  const atualizado = normalizarEstadoDocumental({
    ...candidato,
    updatedAt: mudou ? nowISO(deps) : base.updatedAt,
    version: DOCUMENT_STATE_VERSION
  }, deps)
  return salvarEstadoDocumental(pastaDriveId, atualizado, deps)
}

module.exports = {
  DOCUMENT_STATE_FOLDER,
  DOCUMENT_STATE_FILE,
  DOCUMENT_STATE_VERSION,
  estadoVazio,
  normalizarEstadoDocumental,
  salvarEstadoDocumental,
  carregarEstadoDocumental,
  atualizarEstadoDocumental,
  estadoExiste
}
