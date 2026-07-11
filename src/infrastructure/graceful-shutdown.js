"use strict"

function criarGracefulShutdown(options = {}) {
  const { persistirUsersAgora, persistirSessoesAdminAssistidasAgora, sessoesAdminWhatsApp, fecharServidorHttp = async () => {}, closeExternalStateRepository, logErro = () => {}, exit = code => process.exit(code), timeoutMs = 15000 } = options
  let encerramento = null
  return function encerrarServidor(signal = "UNKNOWN") {
    if (encerramento) return encerramento
    encerramento = (async () => {
      let timer
      try {
        try { persistirUsersAgora({ propagarErro: true }) }
        catch (error) { logErro("shutdown", `falha persistencia users: ${error?.code || error?.name || "erro"}`) }
        try { persistirSessoesAdminAssistidasAgora(sessoesAdminWhatsApp, { propagarErro: true }) }
        catch (error) { logErro("shutdown", `falha persistencia sessoes: ${error?.code || error?.name || "erro"}`) }
        await Promise.race([
          Promise.resolve().then(async () => {
            await fecharServidorHttp()
            await closeExternalStateRepository()
          }),
          new Promise((_, reject) => {
            timer = setTimeout(() => { const error = new Error("shutdown_timeout"); error.code = "SHUTDOWN_TIMEOUT"; reject(error) }, timeoutMs)
          })
        ])
      } catch (error) {
        logErro("shutdown", `falha fechamento externo (${signal}): ${error?.code || error?.name || "erro"}`)
      } finally {
        if (timer) clearTimeout(timer)
        exit(0)
      }
    })()
    return encerramento
  }
}

module.exports = { criarGracefulShutdown }
