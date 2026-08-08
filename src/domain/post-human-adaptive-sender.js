"use strict"

const crypto = require("node:crypto")
const { conversaDentroJanela24h } = require("./template-service")
const { sanitizeError } = require("./post-human-safe-log")

async function enviarSolicitacaoAdaptativa({ telefone, solicitacao, usuario, cycle, repository, deps, now = Date.now }) {
  const latest = await Promise.resolve(deps.getLatestCustomerMessage?.(telefone) ?? usuario.ultimaMsg)
  const startUltimaMsg = Number(deps.startUltimaMsg ?? 0)
  if (startUltimaMsg > 0 && latest > startUltimaMsg) {
    return { skipped: true, reason: "nova_atividade_cliente" }
  }
  const tipoEnvio = conversaDentroJanela24h(latest, now()) ? "livre" : "template"
  const sendAttemptId = crypto.randomUUID()
  await repository.updateStatus(cycle.cycleId, "sending", { tipoEnvio, sendAttemptId, resultadoEnvio: "pendente" })
  try {
    let response
    if (tipoEnvio === "livre") response = await deps.sendFree(telefone, solicitacao.texto)
    else {
      const template = deps.templateConfig
      if (!template) throw new Error("contrato oficial do template indisponivel")
      if (!template.nome || !Number.isInteger(template.parametrosEsperados) || !Array.isArray(template.componentes)) throw new Error("configuracao template incompleta")
      const imageHeader = template.componentes.some(component => component.tipo === "HEADER" && component.formato === "IMAGE")
      if (!template.contratoVerificado || (imageHeader && !template.headerImageUrl)) throw new Error("midia oficial do template indisponivel")
      const params = await Promise.resolve(deps.buildTemplateParams?.(solicitacao, template) || [])
      if (params.length !== template.parametrosEsperados) throw new Error("parametros do template invalidos")
      response = await deps.sendTemplate(telefone, template.nome, params, template.idioma, {
        components: template.componentes, headerImageUrl: template.headerImageUrl
      })
    }
    if (!response) throw new Error("resposta imediata de envio ausente")
    const providerMessageId = typeof response === "object" ? response.providerMessageId || response.id || null : null
    const updated = await repository.updateStatus(cycle.cycleId, "message_sent", {
      tipoEnvio, templateUsado: tipoEnvio === "template" ? deps.templateConfig.nome : null,
      sendAttemptId, providerMessageId, resultadoEnvio: "aceito_pelo_provider", entregaConfirmada: false
    })
    let clientMenuPresented = false
    let clientMenuError = null
    if (tipoEnvio === "livre" && solicitacao.tipo === "documentos" && typeof deps.presentClientMenu === "function") {
      try {
        clientMenuPresented = await deps.presentClientMenu(telefone, usuario) !== false
      } catch (error) {
        clientMenuError = sanitizeError(error)
      }
    }
    return { cycle: updated, tipoEnvio, providerMessageId, entregaConfirmada: false, clientMenuPresented, clientMenuError }
  } catch (error) {
    const uncertain = Boolean(error?.sendOutcomeUnknown)
    await repository.updateStatus(cycle.cycleId, uncertain ? "failed_transient" : "failed_terminal", {
      sendAttemptId, resultadoEnvio: uncertain ? "incerto" : "falha", erro: sanitizeError(error)
    })
    return { failed: true, uncertain, error: sanitizeError(error), sendAttemptId }
  }
}

module.exports = { enviarSolicitacaoAdaptativa }
