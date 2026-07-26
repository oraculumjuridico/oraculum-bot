"use strict"

/**
 * Tratamento de rate limiting (HTTP 429) para chamadas HubSpot
 * 
 * Fornece retry automático com respeito a Retry-After e backoff limitado.
 */

function mascararErroHubSpot(erro) {
  const status = erro.response?.status || "unknown"
  const message = erro.response?.data?.message || erro.message || "erro desconhecido"
  const categoria = erro.response?.data?.category || "unknown"
  return `status=${status} category=${categoria} msg=${message.slice(0, 100)}`
}

async function executarComRetryHubSpot(fn, options = {}) {
  const {
    maxTentativas = 3,
    operacao = "hubspot_operation",
    idempotente = true,
    onRetry = null
  } = options

  if (!idempotente && maxTentativas > 1) {
    throw new Error("Operacao nao idempotente nao pode ter retry automatico")
  }

  let ultimoErro = null
  
  for (let tentativa = 1; tentativa <= maxTentativas; tentativa++) {
    try {
      return await fn()
    } catch (erro) {
      ultimoErro = erro
      const status = erro.response?.status
      
      // Somente retry em 429
      if (status !== 429) {
        throw erro
      }

      // Última tentativa não faz retry
      if (tentativa >= maxTentativas) {
        throw erro
      }

      // Calcular delay
      const retryAfterHeader = erro.response?.headers?.["retry-after"]
      let delayMs = 1000 // default 1s
      
      if (retryAfterHeader) {
        const retryAfterSeconds = parseInt(retryAfterHeader, 10)
        if (!isNaN(retryAfterSeconds) && retryAfterSeconds > 0) {
          delayMs = Math.min(retryAfterSeconds * 1000, 30000) // max 30s
        }
      } else {
        // Backoff exponencial limitado sem Retry-After
        delayMs = Math.min(1000 * Math.pow(2, tentativa - 1), 10000)
      }

      // Adicionar jitter de 0-20%
      const jitter = Math.random() * 0.2 * delayMs
      delayMs = Math.floor(delayMs + jitter)

      if (onRetry) {
        onRetry({
          tentativa,
          maxTentativas,
          delayMs,
          erro: mascararErroHubSpot(erro),
          operacao
        })
      }

      await new Promise(resolve => setTimeout(resolve, delayMs))
    }
  }

  throw ultimoErro
}

module.exports = {
  executarComRetryHubSpot,
  mascararErroHubSpot
}
