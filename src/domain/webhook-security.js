const crypto = require("crypto")
const { sanitizarTextoEntrada } = require("../utils/text")
const { logErro } = require("../utils/logging")

function ambienteProducao() {
  return ["production", "prod"].includes(sanitizarTextoEntrada(process.env.NODE_ENV).toLowerCase())
}

function compararAssinaturaSegura(a, b) {
  const bufferA = Buffer.from(a || "", "utf8")
  const bufferB = Buffer.from(b || "", "utf8")
  return bufferA.length === bufferB.length && crypto.timingSafeEqual(bufferA, bufferB)
}

let avisoAssinaturaMetaDevEmitido = false

function validarAssinaturaMeta(req, res, next) {
  const appSecret = sanitizarTextoEntrada(process.env.APP_SECRET || process.env.META_APP_SECRET)
  if (!appSecret) {
    if (ambienteProducao()) {
      logErro("config", "APP_SECRET ausente; webhook Meta recusado em producao.")
      return res.sendStatus(503)
    }
    if (!avisoAssinaturaMetaDevEmitido) {
      avisoAssinaturaMetaDevEmitido = true
      console.warn("[CONFIG] APP_SECRET/META_APP_SECRET ausente; assinatura Meta nao validada em modo desenvolvimento.")
    }
    return next()
  }

  const assinatura = sanitizarTextoEntrada(req.get("x-hub-signature-256"))
  if (!assinatura.startsWith("sha256=")) return res.sendStatus(401)

  const rawBody = Buffer.isBuffer(req.rawBody) ? req.rawBody : Buffer.from(JSON.stringify(req.body || {}), "utf8")
  const esperada = `sha256=${crypto.createHmac("sha256", appSecret).update(rawBody).digest("hex")}`
  if (!compararAssinaturaSegura(assinatura, esperada)) return res.sendStatus(401)
  return next()
}

function validarWebhookInterno(req, res, next) {
  const segredo = sanitizarTextoEntrada(process.env.INTERNAL_WEBHOOK_SECRET)
  if (!segredo) {
    logErro("config", "INTERNAL_WEBHOOK_SECRET ausente; rota interna recusada.")
    return res.sendStatus(503)
  }

  const auth = sanitizarTextoEntrada(req.get("authorization"))
  const bearer = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : ""
  const informado =
    sanitizarTextoEntrada(req.get("x-oraculum-secret")) ||
    bearer

  if (!compararAssinaturaSegura(informado, segredo)) return res.sendStatus(401)
  return next()
}

module.exports = {
  validarAssinaturaMeta,
  validarWebhookInterno
}
