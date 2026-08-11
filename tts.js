const { execFileSync } = require("child_process")
const axios = require("axios")
const path = require("path")
const fs = require("fs")
let clienteHttp = axios
let executarFfmpeg = execFileSync

const ATTENDANT_VOICE_PROFILES = Object.freeze({
  Helena: { voiceProfileId: "supertonic-f4", voice: "F4", lang: "pt" },
  Clara: { voiceProfileId: "supertonic-f4", voice: "F4", lang: "pt" },
  Beatriz: { voiceProfileId: "supertonic-f4", voice: "F4", lang: "pt" },
  Isabela: { voiceProfileId: "supertonic-f4", voice: "F4", lang: "pt" },
  Mariana: { voiceProfileId: "supertonic-f4", voice: "F4", lang: "pt" }
})

const AUDIO_DIR = path.join(__dirname, "audios", "atendentes")
const AUDIO_TTL_MS = 24 * 60 * 60 * 1000
const GOOGLE_TTS_MAX_CHARS = 180
let ultimaLimpeza = 0

function numeroPositivo(valor, padrao) {
  const numero = Number(valor)
  return Number.isFinite(numero) && numero > 0 ? numero : padrao
}

function normalizarTextoParaFala(texto) {
  const siglas = {
    INSS: "i ene esse esse",
    CPF: "cê pê efe",
    RG: "erre gê",
    BPC: "bê pê cê",
    PVR: "pê vê erre",
    DER: "dê e erre",
    DIB: "dê i bê",
    DCB: "dê cê bê"
  }
  let resultado = String(texto || "")
  for (const [sigla, fala] of Object.entries(siglas)) {
    resultado = resultado.replace(new RegExp(`\\b${sigla}\\b`, "g"), fala)
  }
  return resultado
}

function limparAudiosAntigos() {
  const agora = Date.now()
  if (agora - ultimaLimpeza < 60 * 60 * 1000) return
  ultimaLimpeza = agora
  try {
    fs.mkdirSync(AUDIO_DIR, { recursive: true })
    for (const arquivo of fs.readdirSync(AUDIO_DIR)) {
      if (!arquivo.endsWith(".ogg") && !arquivo.endsWith(".mp3") && !arquivo.endsWith(".wav")) continue
      const caminho = path.join(AUDIO_DIR, arquivo)
      if (agora - fs.statSync(caminho).mtimeMs > AUDIO_TTL_MS) fs.unlinkSync(caminho)
    }
  } catch (e) {
    console.error("[tts] Falha ao limpar audios antigos:", e.message)
  }
}

function dividirTextoTTS(texto, limite = GOOGLE_TTS_MAX_CHARS) {
  const partes = []
  const frases = String(texto || "").replace(/\s+/g, " ").split(/(?<=[.!?;:])\s+/).filter(Boolean)
  for (const frase of frases.length ? frases : [String(texto || "")]) {
    if (frase.length <= limite) { partes.push(frase); continue }
    let atual = ""
    for (const palavra of frase.split(/\s+/).filter(Boolean)) {
      if (!atual) atual = palavra
      else if ((atual + " " + palavra).length <= limite) atual += " " + palavra
      else { partes.push(atual); atual = palavra }
    }
    if (atual) partes.push(atual)
  }
  return partes.map(p => p.trim()).filter(Boolean).map(p => p.length > limite ? p.slice(0, limite) : p)
}

function caminhoConcatFfmpeg(caminho) {
  return caminho.replace(/\\/g, "/").replace(/'/g, "'\\''")
}

function motivoSanitizado(erro) {
  if (erro?.code === "ECONNABORTED") return "timeout"
  if (erro?.response?.status) return `http_${erro.response.status}`
  if (erro?.code) return String(erro.code).replace(/[^A-Z0-9_-]/gi, "_").slice(0, 48)
  return "erro_desconhecido"
}

function registrarTts(evento) {
  console.info("[tts]", JSON.stringify(evento))
}

function perfilDaAtendente(atendente) {
  const nome = ATTENDANT_VOICE_PROFILES[atendente] ? atendente : "Helena"
  return { attendant: nome, profile: ATTENDANT_VOICE_PROFILES[nome], attendantFallback: nome !== atendente }
}

function urlLightning(env) {
  return String(env.LIGHTNING_TTS_URL || "").trim().replace(/\/+$/, "")
}

function wavValido(buffer) {
  return Buffer.isBuffer(buffer) && buffer.length >= 44 &&
    buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
    buffer.subarray(8, 12).toString("ascii") === "WAVE"
}

async function baixarWavLightning(texto, profile, env = process.env) {
  const baseUrl = urlLightning(env)
  if (!baseUrl) {
    const erro = new Error("LIGHTNING_TTS_URL ausente")
    erro.code = "LIGHTNING_URL_AUSENTE"
    throw erro
  }
  const headers = { "Content-Type": "application/json" }
  if (String(env.LIGHTNING_TTS_TOKEN || "").trim()) headers.Authorization = `Bearer ${env.LIGHTNING_TTS_TOKEN.trim()}`
  const resposta = await clienteHttp.post(`${baseUrl}/tts`, {
    text: texto
  }, {
    timeout: numeroPositivo(env.LIGHTNING_TTS_TIMEOUT_MS, 20000),
    responseType: "arraybuffer",
    headers
  })
  const wav = Buffer.from(resposta.data || [])
  if (!wavValido(wav)) {
    const erro = new Error("Resposta WAV invalida")
    erro.code = "WAV_INVALIDO"
    throw erro
  }
  return wav
}

async function baixarMp3GoogleTTS(texto, lang, destino, env = process.env) {
  const resposta = await clienteHttp.get("https://translate.google.com/translate_tts", {
    timeout: numeroPositivo(env.AXIOS_TIMEOUT_MS, 15000), responseType: "arraybuffer",
    params: { ie: "UTF-8", client: "tw-ob", tl: lang, q: texto },
    headers: { "User-Agent": "Mozilla/5.0", "Accept": "audio/mpeg,*/*;q=0.8" }
  })
  fs.writeFileSync(destino, Buffer.from(resposta.data))
}

function converterParaOgg(entrada, destino, env = process.env) {
  executarFfmpeg("ffmpeg", ["-y", "-i", entrada, "-c:a", "libopus", "-b:a", "24k", destino], {
    stdio: "ignore", timeout: numeroPositivo(env.FFMPEG_TIMEOUT_MS, 60000)
  })
}

async function gerarComGoogle(texto, profile, nomeArquivo, env) {
  const mp3Path = path.join(AUDIO_DIR, `${nomeArquivo}.mp3`)
  const concatListPath = path.join(AUDIO_DIR, `${nomeArquivo}.txt`)
  const oggPath = path.join(AUDIO_DIR, `${nomeArquivo}.ogg`)
  const partesTexto = dividirTextoTTS(texto || "Mensagem da Oraculum.")
  const mp3Parts = partesTexto.map((_, indice) => path.join(AUDIO_DIR, `${nomeArquivo}_${indice + 1}.mp3`))
  try {
    for (let i = 0; i < partesTexto.length; i++) await baixarMp3GoogleTTS(partesTexto[i], profile.lang, mp3Parts[i], env)
    if (mp3Parts.length === 1) {
      fs.copyFileSync(mp3Parts[0], mp3Path)
      converterParaOgg(mp3Path, oggPath, env)
    } else {
      fs.writeFileSync(concatListPath, mp3Parts.map(p => `file '${caminhoConcatFfmpeg(p)}'`).join("\n"), "utf8")
      executarFfmpeg("ffmpeg", ["-y", "-f", "concat", "-safe", "0", "-i", concatListPath, "-c:a", "libopus", "-b:a", "24k", oggPath], { stdio: "ignore", timeout: numeroPositivo(env.FFMPEG_TIMEOUT_MS, 60000) })
    }
    return oggPath
  } finally {
    for (const arquivo of [mp3Path, concatListPath, ...mp3Parts]) try { if (fs.existsSync(arquivo)) fs.unlinkSync(arquivo) } catch {}
  }
}

async function gerarAudioAtendente(atendente, texto, opcoes = {}) {
  const env = opcoes.env || process.env
  fs.mkdirSync(AUDIO_DIR, { recursive: true })
  limparAudiosAntigos()
  const { attendant, profile, attendantFallback } = perfilDaAtendente(atendente)
  const inicio = Date.now()
  const nomeArquivo = `${attendant.toLowerCase()}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  const textoFala = normalizarTextoParaFala(String(texto || "").replace(/[\u{1F000}-\u{1FFFF}]/gu, "").replace(/[\u{2600}-\u{27BF}]/gu, "").replace(/\*/g, "").replace(/\n+/g, ". ").trim())
  const oggPath = path.join(AUDIO_DIR, `${nomeArquivo}.ogg`)
  const wavPath = path.join(AUDIO_DIR, `${nomeArquivo}.wav`)
  let lightningFailure = null
  try {
    const wav = await baixarWavLightning(textoFala || "Mensagem da Oraculum.", profile, env)
    fs.writeFileSync(wavPath, wav)
    converterParaOgg(wavPath, oggPath, env)
    registrarTts({ motor: "SUPERTONIC_F4", atendente: attendant, voiceProfileId: profile.voiceProfileId, sucesso: true, fallbackUsed: false, duracaoMs: Date.now() - inicio, tamanhoAudio: fs.statSync(oggPath).size, attendantFallback })
    return oggPath
  } catch (erroLightning) {
    lightningFailure = motivoSanitizado(erroLightning)
    registrarTts({ motor: "SUPERTONIC_F4", atendente: attendant, voiceProfileId: profile.voiceProfileId, sucesso: false, fallbackUsed: true, motivo: lightningFailure, duracaoMs: Date.now() - inicio, attendantFallback })
  } finally {
    try { if (fs.existsSync(wavPath)) fs.unlinkSync(wavPath) } catch {}
  }
  try {
    const resultado = await gerarComGoogle(textoFala, profile, nomeArquivo, env)
    registrarTts({ motor: "GOOGLE_TRANSLATE_TTS", atendente: attendant, voiceProfileId: profile.voiceProfileId, sucesso: true, fallbackUsed: true, motivoFallback: lightningFailure, duracaoMs: Date.now() - inicio, tamanhoAudio: fs.statSync(resultado).size, attendantFallback })
    return resultado
  } catch (erroGoogle) {
    registrarTts({ motor: "GOOGLE_TRANSLATE_TTS", atendente: attendant, voiceProfileId: profile.voiceProfileId, sucesso: false, fallbackUsed: true, motivoFallback: lightningFailure, motivo: motivoSanitizado(erroGoogle), duracaoMs: Date.now() - inicio, attendantFallback })
    throw erroGoogle
  }
}

function configurarDependenciasTtsParaTeste({ http, ffmpeg } = {}) {
  clienteHttp = http || axios
  executarFfmpeg = ffmpeg || execFileSync
}

module.exports = {
  ATTENDANT_VOICE_PROFILES,
  normalizarTextoParaFala,
  perfilDaAtendente,
  wavValido,
  baixarWavLightning,
  gerarAudioAtendente,
  configurarDependenciasTtsParaTeste
}
