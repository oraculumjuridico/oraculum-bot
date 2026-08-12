const axios = require("axios")
const { validatePublicImageUrl } = require("./public-image-validator")
const {
  logDebug,
  logErro
} = require("../utils/logging")

const {
  PHONE_NUMBER_ID,
  WHATSAPP_TOKEN,
  WHATSAPP_TEMPLATE_LANG
} = process.env

const ultimosAudiosEnviados = new Map()

function mascararTelefoneLog(numero) {
  const texto = String(numero || "")
  const digitos = texto.replace(/\D/g, "")
  if (digitos.length < 8) return "***"
  return `${digitos.slice(0, 4)}*****${digitos.slice(-4)}`
}

async function digitando(to, messageId = null, texto = "") {
  if (!messageId) return
  try {
    await axios.post(
      `https://graph.facebook.com/v19.0/${PHONE_NUMBER_ID}/messages`,
      {
        messaging_product: "whatsapp",
        status: "read",
        message_id: messageId,
        typing_indicator: { type: "text" }
      },
      { headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}`, "Content-Type": "application/json" } }
    )
  } catch {}
  const chars = (texto || "").replace(/\s+/g, "").length
  const delay = Math.min(3000 + Math.floor(chars / 60) * 400, 6000)
  await new Promise(r => setTimeout(r, delay))
}

function validarDestinatarioWhatsApp(to) {
  if (!to) return { valido: false, motivo: "destinatario_ausente" }
  const texto = String(to).trim()
  const digitos = texto.replace(/\D/g, "")
  if (digitos.length < 10 || digitos.length > 15) {
    return { valido: false, motivo: "quantidade_digitos_invalida" }
  }
  if (!/^55/.test(digitos)) {
    return { valido: false, motivo: "prefixo_esperado" }
  }
  return { valido: true, numero: digitos }
}

function validarTextoWhatsApp(texto) {
  if (texto === null || texto === undefined) {
    return { valido: false, motivo: "texto_null_ou_undefined" }
  }
  const textoStr = String(texto).trim()
  if (!textoStr) {
    return { valido: false, motivo: "texto_vazio" }
  }
  return { valido: true, texto: textoStr }
}

function validarOpcoesWhatsApp(opcoes) {
  if (!Array.isArray(opcoes) || opcoes.length === 0) {
    return { valido: true, opcoes: [] }
  }

  const opcoesValidas = opcoes.filter(o => {
    if (!o || typeof o !== "object") return false
    const id = String(o.id || "").trim()
    const title = String(o.title || "").trim()
    return id && title
  }).map(o => ({
    id: String(o.id).slice(0, 256),
    title: String(o.title).slice(0, 100)
  }))

  // Garantir IDs únicos
  const idsVistos = new Set()
  const opcoesUnicas = []
  for (const opcao of opcoesValidas) {
    if (!idsVistos.has(opcao.id)) {
      idsVistos.add(opcao.id)
      opcoesUnicas.push(opcao)
    }
  }

  // Limitar quantidade
  const opcoesFinais = opcoesUnicas.slice(0, 10)

  return { valido: opcoesFinais.length > 0, opcoes: opcoesFinais }
}

function normalizarTituloOpcaoWhatsApp(title, maxChars) {
  let texto = String(title || "").trim()
  texto = texto
    .replace(/^\d+\s+/, "")
    .replace(/\p{Extended_Pictographic}/gu, "")
    .replace(/[\u200D\uFE0F]/g, "")
    .replace(/^\d+\s+/, "")
    .replace(/[•·]/g, " ")
    .replace(/\*/g, "")
    .replace(/\s+/g, " ")
    .trim()
  if (!texto) texto = "Opção"
  return Array.from(texto).slice(0, maxChars).join("")
}

function resultadoEnvio({ accepted = false, providerMessageId = null, httpStatus = null, channel = "freeform", destinationMasked = "", immediateError = null } = {}) {
  return { accepted, providerMessageId, httpStatus, channel, destinationMasked, immediateError }
}

async function enviarComResultado(to, texto, opcoes = null, comDelay = true, messageId = null, semFallback131009 = false) {
  try {
    // Validar destinatário
    const validacaoDestino = validarDestinatarioWhatsApp(to)
    if (!validacaoDestino.valido) {
      logErro("whatsapp", `destinatario_invalido: ${validacaoDestino.motivo} to=${mascararTelefoneLog(to)}`)
      return resultadoEnvio({ destinationMasked: mascararTelefoneLog(to), immediateError: validacaoDestino.motivo })
    }
    const numeroValidado = validacaoDestino.numero

    // Validar texto
    const validacaoTexto = validarTextoWhatsApp(texto)
    if (!validacaoTexto.valido) {
      logErro("whatsapp", `texto_invalido: ${validacaoTexto.motivo} to=${mascararTelefoneLog(to)}`)
      return resultadoEnvio({ destinationMasked: mascararTelefoneLog(to), immediateError: validacaoTexto.motivo })
    }
    const textoValidado = validacaoTexto.texto

    // Validar e normalizar opções
    const validacaoOpcoes = validarOpcoesWhatsApp(opcoes)
    const opcoesValidadas = validacaoOpcoes.opcoes

    if (comDelay) await digitando(numeroValidado, messageId, textoValidado)

    let body
    if (opcoesValidadas.length === 0) {
      body = { messaging_product: "whatsapp", to: numeroValidado, type: "text", text: { body: textoValidado } }
    } else if (opcoesValidadas.length <= 3) {
      body = {
        messaging_product: "whatsapp", to: numeroValidado, type: "interactive",
        interactive: { type: "button", body: { text: textoValidado }, action: { buttons: opcoesValidadas.map(o => ({ type: "reply", reply: { id: o.id, title: normalizarTituloOpcaoWhatsApp(o.title, 20) } })) } }
      }
    } else {
      const sections = []
      for (let i = 0; i < opcoesValidadas.length; i += 10)
        sections.push({ title: "Opções", rows: opcoesValidadas.slice(i, i + 10).map(o => ({ id: o.id, title: normalizarTituloOpcaoWhatsApp(o.title, 24) })) })
      body = {
        messaging_product: "whatsapp", to: numeroValidado, type: "interactive",
        interactive: { type: "list", body: { text: textoValidado }, action: { button: "Ver opções", sections } }
      }
    }

    const resp = await axios.post(`https://graph.facebook.com/v19.0/${PHONE_NUMBER_ID}/messages`, body, {
      headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}`, "Content-Type": "application/json" }
    })

    const messageIdResposta = resp.data?.messages?.[0]?.id
    logDebug(`[WHATSAPP_ENVIO] sucesso to=${mascararTelefoneLog(numeroValidado)} message_id=${messageIdResposta} tipo=${body.type}`)
    return resultadoEnvio({ accepted: true, providerMessageId: messageIdResposta || null, httpStatus: resp.status, destinationMasked: mascararTelefoneLog(numeroValidado) })
  } catch (e) {
    const codigoErro = e.response?.data?.error?.code
    const mensagemErro = e.response?.data?.error?.message || e.message
    const statusHttp = e.response?.status

    logErro("whatsapp", `envio_falhou to=${mascararTelefoneLog(to)} http=${statusHttp} codigo=${codigoErro} msg=${mensagemErro}`)

    // Fallback para texto simples se erro 131009 (parâmetro inválido)
    if (codigoErro === 131009 && opcoes && opcoes.length > 0 && !semFallback131009) {
      logDebug("[WHATSAPP_FALLBACK] Tentando envio como texto simples")
      try {
        const validacaoDestino = validarDestinatarioWhatsApp(to)
        const validacaoTexto = validarTextoWhatsApp(texto)
        if (validacaoDestino.valido && validacaoTexto.valido) {
          const bodyTexto = {
            messaging_product: "whatsapp",
            to: validacaoDestino.numero,
            type: "text",
            text: { body: validacaoTexto.texto + "\n\nNao consegui carregar o menu completo agora. Tente novamente em alguns segundos." }
          }
          const fallbackResp = await axios.post(`https://graph.facebook.com/v19.0/${PHONE_NUMBER_ID}/messages`, bodyTexto, {
            headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}`, "Content-Type": "application/json" }
          })
          logDebug("[WHATSAPP_FALLBACK] Fallback texto enviado com sucesso")
          return resultadoEnvio({ accepted: true, providerMessageId: fallbackResp.data?.messages?.[0]?.id || null, httpStatus: fallbackResp.status, destinationMasked: mascararTelefoneLog(validacaoDestino.numero) })
        }
      } catch (fallbackError) {
        logErro("whatsapp", `fallback_falhou: ${fallbackError.message}`)
      }
    }

    return resultadoEnvio({ httpStatus: statusHttp || null, destinationMasked: mascararTelefoneLog(to), immediateError: String(codigoErro || statusHttp || "send_failed") })
  }
}

async function enviar(to, texto, opcoes = null, comDelay = true, messageId = null, semFallback131009 = false) {
  return (await enviarComResultado(to, texto, opcoes, comDelay, messageId, semFallback131009)).accepted
}

async function enviarTemplateComResultado(to, templateName, params = [], languageCode = WHATSAPP_TEMPLATE_LANG, options = {}) {
  if (!templateName || !to) return resultadoEnvio({ channel: "template", destinationMasked: mascararTelefoneLog(to), immediateError: "template_or_destination_missing" })
  const components = []
  if (options.headerImageUrl) {
    components.push({
      type: "header",
      parameters: [{ type: "image", image: { link: options.headerImageUrl } }]
    })
  }
  if (params.length) {
    components.push({
      type: "body",
      parameters: params.map(p => ({ type: "text", text: String(p || "-") }))
    })
  }

  const url = `https://graph.facebook.com/v19.0/${PHONE_NUMBER_ID}/messages`
  const payload = {
    messaging_product: "whatsapp",
    to,
    type: "template",
    template: {
      name: templateName,
      language: { code: languageCode },
      ...(components.length ? { components } : {})
    }
  }
  const authorizationMascarado = WHATSAPP_TOKEN
    ? `Bearer ***${String(WHATSAPP_TOKEN).slice(-6)}`
    : "Bearer <ausente>"

  logDebug("[WHATSAPP_TEMPLATE_DIAG] URL:", url)
  logDebug("[WHATSAPP_TEMPLATE_DIAG] Authorization:", authorizationMascarado)
  logDebug("[WHATSAPP_TEMPLATE_DIAG] Payload:")
  logDebug(JSON.stringify({ ...payload, to: mascararTelefoneLog(to) }, null, 2))

  try {
    const resp = await axios.post(url, payload, {
      headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}`, "Content-Type": "application/json" }
    })
    const messageId = resp.data?.messages?.[0]?.id || "-"
    logDebug("[WHATSAPP_TEMPLATE_DIAG] Status HTTP:", resp.status)
    logDebug("[WHATSAPP_TEMPLATE_DIAG] Resposta Meta:")
    logDebug(JSON.stringify(resp.data, null, 2))
    console.log(`[WHATSAPP_TEMPLATE] template=${templateName} status=sucesso http=${resp.status} message_id=${messageId}`)
    return resultadoEnvio({ accepted: true, providerMessageId: messageId === "-" ? null : messageId, httpStatus: resp.status, channel: "template", destinationMasked: mascararTelefoneLog(to) })
  } catch (e) {
    const status = e.response?.status || "sem_status"
    const messageId = e.response?.data?.messages?.[0]?.id || "-"
    logDebug("[WHATSAPP_TEMPLATE_DIAG] Status HTTP:", status)
    logDebug("[WHATSAPP_TEMPLATE_DIAG] Resposta Meta:")
    logDebug(JSON.stringify(e.response?.data || { message: e.message }, null, 2))
    logErro("whatsapp", `template=${templateName} status=erro http=${status} message_id=${messageId} to=${mascararTelefoneLog(to)}`)
    return resultadoEnvio({ httpStatus: Number.isFinite(Number(status)) ? Number(status) : null, channel: "template", destinationMasked: mascararTelefoneLog(to), immediateError: String(e.response?.data?.error?.code || status || "template_send_failed") })
  }
}

async function enviarTemplateWhatsApp(to, templateName, params = [], languageCode = WHATSAPP_TEMPLATE_LANG, options = {}) {
  return (await enviarTemplateComResultado(to, templateName, params, languageCode, options)).accepted
}

async function enviarAudioComResultado(to, audioUrl) {
  const destinationMasked = mascararTelefoneLog(to)
  if (!audioUrl) return resultadoEnvio({ channel: "audio", destinationMasked, immediateError: "audio_url_missing" })
  try {
    const resp = await axios.post(`https://graph.facebook.com/v19.0/${PHONE_NUMBER_ID}/messages`, {
      messaging_product: "whatsapp",
      to,
      type: "audio",
      audio: { link: audioUrl }
    }, {
      headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}`, "Content-Type": "application/json" }
    })
    ultimosAudiosEnviados.set(String(to || ""), Date.now())
    return resultadoEnvio({ accepted: true, providerMessageId: resp.data?.messages?.[0]?.id || null, httpStatus: resp.status, channel: "audio", destinationMasked })
  } catch (e) {
    logErro("whatsapp", `>${to}: ` + (e.response?.data?.error?.message || e.message))
    return resultadoEnvio({ channel: "audio", destinationMasked, httpStatus: e.response?.status || null, immediateError: String(e.response?.data?.error?.code || e.response?.status || "audio_send_failed") })
  }
}

async function enviarAudio(to, audioUrl) {
  if (!audioUrl) return null
  await enviarAudioComResultado(to, audioUrl)
}

async function enviarImagemComResultado(to, imageUrl, caption = "", opcoes = null) {
  const destinationMasked = mascararTelefoneLog(to)
  if (!imageUrl) {
    logDebug("[IMAGEM] URL vazia — abortando")
    return resultadoEnvio({ channel: "freeform_image", destinationMasked, immediateError: "image_url_missing" })
  }

  const validation = await validatePublicImageUrl(imageUrl)
  if (!validation.ok) {
    logErro("whatsapp", `imagem indisponivel: ${validation.code}`)
    return resultadoEnvio({ channel: "freeform_image", destinationMasked, immediateError: validation.code || "image_url_invalid" })
  }

  // WhatsApp limita body/caption a 1024 chars em mensagens interativas
  const captionSeguro = caption && caption.length > 1024
    ? caption.slice(0, 1021).replace(/\s+\S*$/, "") + "..."
    : (caption || "")

  try {
    const base = { messaging_product: "whatsapp", to }
    let body

    if (Array.isArray(opcoes) && opcoes.length > 0 && opcoes.length <= 3) {
      body = {
        ...base,
        type: "interactive",
        interactive: {
          type: "button",
          header: { type: "image", image: { link: imageUrl } },
          body: { text: captionSeguro || "📋 Documentos do caso" },
          action: {
            buttons: opcoes.map(o => ({
              type: "reply",
              reply: { id: o.id, title: normalizarTituloOpcaoWhatsApp(o.title, 20) }
            }))
          }
        }
      }
    } else {
      body = {
        ...base,
        type: "image",
        image: { link: imageUrl }
      }
      if (captionSeguro) body.image.caption = captionSeguro
    }

    const resp = await axios.post(
      `https://graph.facebook.com/v19.0/${PHONE_NUMBER_ID}/messages`,
      body,
      { headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}`, "Content-Type": "application/json" } }
    )
    const providerMessageId = resp.data?.messages?.[0]?.id || null
    logDebug(`[IMAGEM] ? Enviada | message_id: ${providerMessageId}`)
    if (Array.isArray(opcoes) && opcoes.length > 3) {
      await new Promise(r => setTimeout(r, 500))
      await enviar(to, "Opções", opcoes, false)
    }
    return resultadoEnvio({ accepted: true, providerMessageId, httpStatus: resp.status, channel: "freeform_image", destinationMasked })
  } catch (e) {
    const httpStatus = e.response?.status || null
    const errorCode = String(e.response?.data?.error?.code || httpStatus || "image_send_failed")
    logDebug(`[IMAGEM] envio falhou to=${destinationMasked} http=${httpStatus || "-"} codigo=${errorCode}`)
    logErro("whatsapp", `imagem_envio_falhou to=${destinationMasked} http=${httpStatus || "-"} codigo=${errorCode}`)
    return resultadoEnvio({ channel: "freeform_image", destinationMasked, httpStatus, immediateError: errorCode })
  }
}

async function enviarImagemWhatsApp(to, imageUrl, caption = "", opcoes = null) {
  return (await enviarImagemComResultado(to, imageUrl, caption, opcoes)).accepted
}

module.exports = {
  digitando,
  normalizarTituloOpcaoWhatsApp,
  validarDestinatarioWhatsApp,
  validarTextoWhatsApp,
  validarOpcoesWhatsApp,
  enviar,
  enviarComResultado,
  enviarTemplateWhatsApp,
  enviarTemplateComResultado,
  enviarAudio,
  enviarAudioComResultado,
  enviarImagemComResultado,
  enviarImagemWhatsApp,
  ultimosAudiosEnviados
}
