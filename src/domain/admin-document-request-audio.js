"use strict"

async function enviarAudioPedidoDocumentos({
  dentroJanela24h,
  usuario,
  from,
  texto,
  deveEnviarAudioAutomatico,
  gerarAudioAtendente,
  urlAudioAtendente,
  enviarAudio,
  logInfo = () => undefined,
  logErro = () => undefined
} = {}) {
  if (!dentroJanela24h || !deveEnviarAudioAutomatico?.(usuario, from)) return false

  try {
    const ogg = await gerarAudioAtendente(usuario?.atendente, texto)
    await enviarAudio(from, urlAudioAtendente(ogg))
    logInfo({ event: "admin.document_request_audio", status: "attempted", action: "pedir_documentos" })
    return true
  } catch (error) {
    logErro("tts", "Falha áudio pedir documentos admin", error)
    return false
  }
}

module.exports = { enviarAudioPedidoDocumentos }
