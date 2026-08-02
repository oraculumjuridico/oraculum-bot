"use strict"

const { analisarEstadoDocumental, STATES } = require("./post-human-document-analyzer")
const { construirSolicitacao } = require("./post-human-solicitation-builder")
const { enviarSolicitacaoAdaptativa } = require("./post-human-adaptive-sender")

async function processPostHumanCycle({ cycle, usuario, repository, deps }) {
  await repository.updateStatus(cycle.cycleId, "analyzing")
  const analysis = await analisarEstadoDocumental(usuario, cycle.negocioId, deps)
  if (analysis.estado === STATES.REVISAO_HUMANA_NECESSARIA) {
    return repository.updateStatus(cycle.cycleId, "human_review_required", { estadoDocumental: analysis.estado })
  }
  if (typeof deps.applySafeHubspotUpdates === "function") {
    const hubspotResult = await deps.applySafeHubspotUpdates({ cycle, usuario, analysis })
    if (hubspotResult?.humanReviewRequired) {
      return repository.updateStatus(cycle.cycleId, "human_review_required", {
        estadoDocumental: STATES.REVISAO_HUMANA_NECESSARIA, divergencias: hubspotResult.divergences?.map(item => item.field) || []
      })
    }
  }
  const solicitation = construirSolicitacao(analysis, usuario)
  const cadastroCompleto = await Promise.resolve(deps.isComplete?.({ cycle, usuario, analysis }) || false)
  if (solicitation.tipo === "nenhuma" && cadastroCompleto) {
    return repository.updateStatus(cycle.cycleId, "completed", {
      estadoDocumental: analysis.estado,
      statusCadastro: "cadastro_completo",
      camposPendentes: [],
      ultimaPerguntaCliente: null
    })
  }
  const ready = await repository.updateStatus(cycle.cycleId, "ready_to_send", {
    estadoDocumental: analysis.estado, tipoSolicitacao: solicitation.tipo,
    campoPendente: solicitation.campo || null,
    camposPendentes: analysis.camposPendentes || [],
    ultimaPerguntaCliente: solicitation.texto,
    statusCadastro: solicitation.tipo === "documentos" ? "aguardando_documentos" : "aguardando_complementacao"
  })
  const sent = await enviarSolicitacaoAdaptativa({ telefone: usuario.telefoneNormalizado, solicitacao: solicitation, usuario, cycle: ready, repository, deps })
  if (sent?.cycle?.status === "message_sent") {
    sent.cycle = await repository.updateStatus(cycle.cycleId, "awaiting_response")
  }
  return sent
}

module.exports = { processPostHumanCycle }
