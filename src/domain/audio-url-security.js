const crypto = require("crypto")
const path = require("path")
const { sanitizarTextoEntrada } = require("../utils/text")

const DEFAULT_TTL_SECONDS = 15 * 60
const MAX_TTL_SECONDS = 60 * 60

function obterSegredoAudio(env = process.env) {
  return sanitizarTextoEntrada(
    env.AUDIO_URL_SECRET ||
    env.INTERNAL_WEBHOOK_SECRET ||
    env.APP_SECRET ||
    env.META_APP_SECRET
  )
}

function caminhoAudioSeguro(arquivo) {
  const nome = path.basename(sanitizarTextoEntrada(arquivo))
  if (!nome || !/^[a-z0-9_-]+\.(?:ogg|mp3)$/i.test(nome)) return ""
  return `/audios/atendentes/${encodeURIComponent(nome)}`
}

function assinaturaAudio(caminho, expiraEm, segredo) {
  return crypto
    .createHmac("sha256", segredo)
    .update(`${caminho}\n${expiraEm}`)
    .digest("hex")
}

function criarCaminhoAudioAssinado(arquivo, opcoes = {}) {
  const segredo = obterSegredoAudio(opcoes.env)
  if (!segredo) throw new Error("AUDIO_URL_SECRET ausente")

  const caminho = caminhoAudioSeguro(arquivo)
  if (!caminho) throw new Error("Arquivo de audio invalido")

  const agora = Number(opcoes.agora || Date.now())
  const ttlSolicitado = Number(opcoes.ttlSeconds || DEFAULT_TTL_SECONDS)
  const ttlSeconds = Math.max(1, Math.min(MAX_TTL_SECONDS, ttlSolicitado))
  const expiraEm = Math.floor(agora / 1000) + ttlSeconds
  const assinatura = assinaturaAudio(caminho, expiraEm, segredo)
  return `${caminho}?exp=${expiraEm}&sig=${assinatura}`
}

function compararSeguro(a, b) {
  const bufferA = Buffer.from(String(a || ""), "utf8")
  const bufferB = Buffer.from(String(b || ""), "utf8")
  return bufferA.length === bufferB.length && crypto.timingSafeEqual(bufferA, bufferB)
}

function validarUrlAudioAssinada(req, res, next) {
  const segredo = obterSegredoAudio()
  if (!segredo) return res.sendStatus(503)

  const caminho = new URL(req.originalUrl || req.url || "", "http://localhost").pathname
  const expiraEm = Number(req.query?.exp)
  const assinatura = sanitizarTextoEntrada(req.query?.sig)
  const agora = Math.floor(Date.now() / 1000)

  if (!Number.isInteger(expiraEm) || expiraEm <= agora || expiraEm > agora + MAX_TTL_SECONDS) {
    return res.sendStatus(403)
  }

  const esperada = assinaturaAudio(caminho, expiraEm, segredo)
  if (!compararSeguro(assinatura, esperada)) return res.sendStatus(403)

  res.set("Cache-Control", `private, max-age=${Math.max(0, expiraEm - agora)}`)
  return next()
}

module.exports = {
  DEFAULT_TTL_SECONDS,
  MAX_TTL_SECONDS,
  obterSegredoAudio,
  caminhoAudioSeguro,
  criarCaminhoAudioAssinado,
  validarUrlAudioAssinada
}
