"use strict"

const {
  carregarEstadoDocumental,
  atualizarEstadoDocumental,
  estadoVazio
} = require("./document-state-repository")
const { confirmAndDecide } = require("./document-requirement-engine")

async function confirmCanonicalDocument(input = {}, deps = {}) {
  if (!input.pastaDriveId || !input.fileId) return { ok: false, reason: "case_or_file_missing" }
  const load = deps.carregarEstadoDocumental || carregarEstadoDocumental
  const save = deps.atualizarEstadoDocumental || atualizarEstadoDocumental
  const state = await load(input.pastaDriveId, deps) || estadoVazio({ now: input.now })
  const result = confirmAndDecide(state.registry, {
    fileId: input.fileId,
    origem: input.origem || "client_callback",
    assertion: input.assertion || null,
    confirmationId: input.confirmationId,
    data: input.now
  })
  const saved = await save(input.pastaDriveId, { registry: result.registry }, deps)
  if (!saved?.arquivo) return { ok: false, reason: "document_state_persistence_failed" }
  return { ok: true, ...result, state: saved.estado, fileId: input.fileId }
}

module.exports = { confirmCanonicalDocument }
