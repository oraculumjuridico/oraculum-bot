const assert = require("node:assert/strict")
const {
  criarCaminhoAudioAssinado,
  validarUrlAudioAssinada
} = require("../src/domain/audio-url-security")

const ambienteOriginal = {
  AUDIO_URL_SECRET: process.env.AUDIO_URL_SECRET,
  INTERNAL_WEBHOOK_SECRET: process.env.INTERNAL_WEBHOOK_SECRET,
  APP_SECRET: process.env.APP_SECRET,
  META_APP_SECRET: process.env.META_APP_SECRET
}

function restaurarAmbiente() {
  for (const [chave, valor] of Object.entries(ambienteOriginal)) {
    if (valor === undefined) delete process.env[chave]
    else process.env[chave] = valor
  }
}

function executarMiddleware(url) {
  const parsed = new URL(url, "http://localhost")
  let status = null
  let nextCalled = false
  const headers = {}
  validarUrlAudioAssinada(
    {
      originalUrl: `${parsed.pathname}${parsed.search}`,
      query: Object.fromEntries(parsed.searchParams)
    },
    {
      sendStatus(code) {
        status = code
        return code
      },
      set(nome, valor) {
        headers[nome] = valor
      }
    },
    () => {
      nextCalled = true
    }
  )
  return { status, nextCalled, headers }
}

try {
  process.env.AUDIO_URL_SECRET = "segredo-de-teste-comprido"
  delete process.env.INTERNAL_WEBHOOK_SECRET
  delete process.env.APP_SECRET
  delete process.env.META_APP_SECRET

  const agora = Date.now()
  const url = criarCaminhoAudioAssinado("helena_123_abc.ogg", {
    agora,
    ttlSeconds: 900
  })

  assert.match(url, /^\/audios\/atendentes\/helena_123_abc\.ogg\?exp=\d+&sig=[a-f0-9]{64}$/)
  assert.equal(executarMiddleware(url).nextCalled, true)
  assert.match(executarMiddleware(url).headers["Cache-Control"], /^private, max-age=/)

  const adulterada = url.replace("helena_123_abc.ogg", "helena_123_xyz.ogg")
  assert.equal(executarMiddleware(adulterada).status, 403)

  const parsed = new URL(url, "http://localhost")
  parsed.searchParams.set("exp", String(Math.floor(Date.now() / 1000) - 1))
  assert.equal(executarMiddleware(`${parsed.pathname}${parsed.search}`).status, 403)

  assert.throws(
    () => criarCaminhoAudioAssinado("../arquivo.txt"),
    /Arquivo de audio invalido/
  )

  delete process.env.AUDIO_URL_SECRET
  assert.equal(executarMiddleware(url).status, 503)

  console.log("audio-url-security.test.js: ok")
} finally {
  restaurarAmbiente()
}
