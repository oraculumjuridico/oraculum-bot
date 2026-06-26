const { execFileSync } = require("child_process")
const axios = require("axios")
const path = require("path")
const fs = require("fs")

const VOZES = {
  Helena:  { lang: "pt" },
  Clara:   { lang: "pt" },
  Beatriz: { lang: "pt" },
  Rafael:  { lang: "pt" },
  Gabriel: { lang: "pt" },
}

const AUDIO_DIR = path.join(__dirname, "audios", "atendentes")
const AUDIO_TTL_MS = 24 * 60 * 60 * 1000
const GOOGLE_TTS_MAX_CHARS = 180
let ultimaLimpeza = 0

function limparAudiosAntigos() {
  const agora = Date.now()
  if (agora - ultimaLimpeza < 60 * 60 * 1000) return
  ultimaLimpeza = agora

  try {
    fs.mkdirSync(AUDIO_DIR, { recursive: true })
    for (const arquivo of fs.readdirSync(AUDIO_DIR)) {
      if (!arquivo.endsWith(".ogg") && !arquivo.endsWith(".mp3")) continue
      const caminho = path.join(AUDIO_DIR, arquivo)
      const stat = fs.statSync(caminho)
      if (agora - stat.mtimeMs > AUDIO_TTL_MS) fs.unlinkSync(caminho)
    }
  } catch (e) {
    console.error("[tts] Falha ao limpar audios antigos:", e.message)
  }
}

function dividirTextoTTS(texto, limite = GOOGLE_TTS_MAX_CHARS) {
  const partes = []
  const frases = String(texto || "")
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?;:])\s+/)
    .filter(Boolean)

  for (const frase of frases.length ? frases : [String(texto || "")]) {
    if (frase.length <= limite) {
      partes.push(frase)
      continue
    }

    let atual = ""
    for (const palavra of frase.split(/\s+/).filter(Boolean)) {
      if (!atual) {
        atual = palavra
      } else if ((atual + " " + palavra).length <= limite) {
        atual += " " + palavra
      } else {
        partes.push(atual)
        atual = palavra
      }
    }
    if (atual) partes.push(atual)
  }

  return partes
    .map(p => p.trim())
    .filter(Boolean)
    .map(p => p.length > limite ? p.slice(0, limite) : p)
}

function caminhoConcatFfmpeg(caminho) {
  return caminho.replace(/\\/g, "/").replace(/'/g, "'\\''")
}

async function baixarMp3GoogleTTS(texto, lang, destino) {
  const url = "https://translate.google.com/translate_tts"
  const resposta = await axios.get(url, {
    responseType: "arraybuffer",
    params: {
      ie: "UTF-8",
      client: "tw-ob",
      tl: lang,
      q: texto
    },
    headers: {
      "User-Agent": "Mozilla/5.0",
      "Accept": "audio/mpeg,*/*;q=0.8"
    }
  })

  fs.writeFileSync(destino, Buffer.from(resposta.data))
}

async function gerarAudioAtendente(atendente, texto) {
  fs.mkdirSync(AUDIO_DIR, { recursive: true })
  limparAudiosAntigos()

  const nomeAtendente = VOZES[atendente] ? atendente : "Helena"
  const sufixo = Math.random().toString(36).slice(2, 8)
  const nomeArquivo = `${nomeAtendente.toLowerCase()}_${Date.now()}_${sufixo}`
  const mp3Path = path.join(AUDIO_DIR, `${nomeArquivo}.mp3`)
  const concatListPath = path.join(AUDIO_DIR, `${nomeArquivo}.txt`)
  const oggPath = path.join(AUDIO_DIR, `${nomeArquivo}.ogg`)

  const textoLimpo = String(texto || "")
    .replace(/[\u{1F000}-\u{1FFFF}]/gu, "")
    .replace(/[\u{2600}-\u{27BF}]/gu, "")
    .replace(/\*/g, "")
    .replace(/\n+/g, ". ")
    .trim()

  const partesTexto = dividirTextoTTS(textoLimpo || "Mensagem da Oraculum.")
  const mp3Parts = partesTexto.map((_, idx) => path.join(AUDIO_DIR, `${nomeArquivo}_${idx + 1}.mp3`))

  try {
    for (let i = 0; i < partesTexto.length; i++) {
      await baixarMp3GoogleTTS(partesTexto[i], VOZES[nomeAtendente].lang, mp3Parts[i])
    }

    if (mp3Parts.length === 1) {
      fs.copyFileSync(mp3Parts[0], mp3Path)
      execFileSync("ffmpeg", ["-y", "-i", mp3Path, "-c:a", "libopus", "-b:a", "24k", oggPath], { stdio: "ignore" })
    } else {
      const lista = mp3Parts.map(p => `file '${caminhoConcatFfmpeg(p)}'`).join("\n")
      fs.writeFileSync(concatListPath, lista, "utf8")
      execFileSync("ffmpeg", ["-y", "-f", "concat", "-safe", "0", "-i", concatListPath, "-c:a", "libopus", "-b:a", "24k", oggPath], { stdio: "ignore" })
    }
  } finally {
    try { if (fs.existsSync(mp3Path)) fs.unlinkSync(mp3Path) } catch {}
    try { if (fs.existsSync(concatListPath)) fs.unlinkSync(concatListPath) } catch {}
    for (const parte of mp3Parts) {
      try { if (fs.existsSync(parte)) fs.unlinkSync(parte) } catch {}
    }
  }

  return oggPath
}

module.exports = { gerarAudioAtendente }
