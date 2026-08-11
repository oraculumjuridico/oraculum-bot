const assert = require("node:assert/strict")
const fs = require("node:fs")
const {
  ATTENDANT_VOICE_PROFILES,
  normalizarTextoParaFala,
  perfilDaAtendente,
  gerarAudioAtendente,
  configurarDependenciasTtsParaTeste
} = require("../tts")

const wav = Buffer.concat([
  Buffer.from("RIFF"), Buffer.alloc(4), Buffer.from("WAVEfmt "), Buffer.alloc(32)
])
const env = {
  LIGHTNING_TTS_URL: "https://lightning.example",
  LIGHTNING_TTS_TOKEN: "token-de-teste",
  LIGHTNING_TTS_TIMEOUT_MS: "1234",
  AXIOS_TIMEOUT_MS: "1234",
  FFMPEG_TIMEOUT_MS: "1234"
}

function criarHttp({ lightning = "ok", google = "ok" } = {}) {
  const chamadas = []
  return {
    chamadas,
    async post(url, body, options) {
      chamadas.push({ tipo: "post", url, body, options })
      if (lightning === "timeout") {
        const erro = new Error("timeout")
        erro.code = "ECONNABORTED"
        throw erro
      }
      if (lightning === "http500") throw { response: { status: 500 } }
      if (lightning === "invalid") return { data: Buffer.from("nao-e-wav") }
      return { data: wav }
    },
    async get(url, options) {
      chamadas.push({ tipo: "get", url, options })
      if (google === "fail") throw new Error("google indisponivel")
      return { data: Buffer.from("mp3-de-teste") }
    }
  }
}

function ffmpegFalso(comandos) {
  return (_binario, args) => {
    comandos.push(args)
    fs.writeFileSync(args.at(-1), Buffer.from("OggS-audio-de-teste"))
  }
}

async function gerar(opcoes) {
  const http = criarHttp(opcoes)
  const comandos = []
  configurarDependenciasTtsParaTeste({ http, ffmpeg: ffmpegFalso(comandos) })
  const arquivo = await gerarAudioAtendente("Isabela", opcoes?.texto || "INSS e CPF", { env: opcoes?.env || env })
  try {
    return { http, comandos, arquivo }
  } finally {
    if (fs.existsSync(arquivo)) fs.unlinkSync(arquivo)
  }
}

async function main() {
  assert.deepEqual(Object.keys(ATTENDANT_VOICE_PROFILES), ["Helena", "Clara", "Beatriz", "Isabela", "Mariana"])
  for (const nome of Object.keys(ATTENDANT_VOICE_PROFILES)) assert.equal(ATTENDANT_VOICE_PROFILES[nome].voiceProfileId, "supertonic-f4")
  assert.equal(perfilDaAtendente("Isabela").attendant, "Isabela")
  assert.equal(perfilDaAtendente("Mariana").attendant, "Mariana")

  assert.equal(normalizarTextoParaFala("INSS, CPF e PVR."), "ieneésseésse, cêpêéfe e pê vê erre.")
  assert.equal(normalizarTextoParaFala("INSSalubre CPF123"), "INSSalubre CPF123")

  const textoEscrito = "INSS e CPF"
  const eventosTts = []
  const consoleInfoOriginal = console.info
  console.info = (...args) => eventosTts.push(args)
  const principal = await gerar({ texto: textoEscrito })
  console.info = consoleInfoOriginal
  assert.equal(textoEscrito, "INSS e CPF")
  assert.equal(principal.http.chamadas[0].tipo, "post")
  assert.equal(principal.http.chamadas[0].url, "https://lightning.example/tts")
  assert.deepEqual(principal.http.chamadas[0].body, { text: "ieneésseésse e cêpêéfe" })
  assert.equal(principal.http.chamadas.some(chamada => chamada.tipo === "get"), false)
  assert.equal(principal.comandos[0].includes("libopus"), true)
  assert.equal(eventosTts.some(([prefixo, evento]) =>
    prefixo === "[tts]" && JSON.parse(evento).motor === "SUPERTONIC_F4" &&
    JSON.parse(evento).voiceProfileId === "supertonic-f4" &&
    JSON.parse(evento).atendente === "Isabela"
  ), true)

  for (const lightning of ["timeout", "http500", "invalid"]) {
    const resultado = await gerar({ lightning })
    assert.equal(resultado.http.chamadas[0].tipo, "post")
    assert.equal(resultado.http.chamadas[1].tipo, "get")
  }

  const semUrl = await gerar({ env: { ...env, LIGHTNING_TTS_URL: "" } })
  assert.equal(semUrl.http.chamadas[0].tipo, "get")

  const httpFalho = criarHttp({ lightning: "timeout", google: "fail" })
  configurarDependenciasTtsParaTeste({ http: httpFalho, ffmpeg: ffmpegFalso([]) })
  await assert.rejects(() => gerarAudioAtendente("Helena", "teste", { env }))

  configurarDependenciasTtsParaTeste()
  console.log("tts.test.js: ok")
}

main().catch(erro => {
  configurarDependenciasTtsParaTeste()
  console.error(erro)
  process.exitCode = 1
})
