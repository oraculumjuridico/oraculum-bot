const axios = require("axios")
const { logDebug, logErro } = require("../utils/logging")

const { ASSEMBLYAI_KEY } = process.env

async function transcrever(buffer, mimeType, contexto = {}) {
  try {
    logDebug(`[ASSEMBLYAI] Iniciando transcricao | origem=${contexto.origem || "desconhecida"} | mime=${mimeType || "nao informado"} | bytes=${buffer?.length || 0}`)
    const up = await axios.post(
      "https://api.assemblyai.com/v2/upload",
      buffer,
      { headers: { authorization: ASSEMBLYAI_KEY, "content-type": "application/octet-stream" } }
    )
    const tr = await axios.post(
      "https://api.assemblyai.com/v2/transcript",
      { audio_url: up.data.upload_url, language_code: "pt", speech_models: ["universal-2"] },
      { headers: { authorization: ASSEMBLYAI_KEY } }
    )
    for (let i = 0; i < 18; i++) {
      await new Promise(r => setTimeout(r, 5000))
      const p = await axios.get(`https://api.assemblyai.com/v2/transcript/${tr.data.id}`, { headers: { authorization: ASSEMBLYAI_KEY } })
      logDebug(`[ASSEMBLYAI] Poll ${i + 1}/18 | status=${p.data.status}`)
      if (p.data.status === "completed") return p.data.text || ""
      if (p.data.status === "error") {
        logErro("assemblyai", `transcript error: ${p.data.error || "sem detalhe"}`)
        return null
      }
    }
    logErro("assemblyai", "transcricao expirou aguardando processamento")
    return null
  } catch (e) {
    logErro("assemblyai", `HTTP ${e.response?.status || "sem_status"}: ${e.response?.data?.error || e.response?.data?.message || e.message}`)
    return null
  }
}

module.exports = {
  transcrever
}
