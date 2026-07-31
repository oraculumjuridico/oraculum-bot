"use strict"

function same(value, expected, normalize = String) {
  return normalize(value || "") === normalize(expected || "")
}

function createLegacyDocumentPipeline({ processMedia, persistDocument }) {
  if (typeof processMedia !== "function") throw new TypeError("processMedia obrigatorio")
  if (typeof persistDocument !== "function") throw new TypeError("persistDocument obrigatorio")

  return async function legacyDocumentPipeline(context) {
    const { cycleId, contatoId, negocioId, numeroCaso, usuario, rawMessage } = context
    if (!cycleId || !usuario ||
        !same(contatoId, usuario.contatoId) ||
        !same(negocioId, usuario.negocioId) ||
        !same(numeroCaso, usuario.numeroCaso, value => String(value || "").toUpperCase())) {
      return { persisted: false, handled: false }
    }
    const tipo = String(rawMessage?.type || "").trim().toLowerCase()
    const ehAudio = ["audio", "voice"].includes(tipo)
    const ehDoc = ["image", "document", "pdf"].includes(tipo)
    if (!(ehAudio || ehDoc)) return { persisted: false, handled: false }

    const handoff = { contract: "legacy_document_pipeline_v1", cycleId, contatoId, negocioId, numeroCaso }
    usuario._postHumanDocumentHandoff = handoff
    try {
      const pipelineResponse = await processMedia({ context, tipo, ehAudio, ehDoc })
      const confirmed = await persistDocument({ context, tipo, handoff, pipelineResponse })
      if (!confirmed) {
        return { persisted: false, handled: true, pipelineResponse }
      }
      return {
        persisted: true,
        handled: true,
        metadata: { mediaType: tipo, pipeline: "legacy_document_pipeline_v1" },
        pipelineResponse
      }
    } finally {
      delete usuario._postHumanDocumentHandoff
    }
  }
}

module.exports = { createLegacyDocumentPipeline }
