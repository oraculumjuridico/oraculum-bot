const { sanitizarTextoEntrada } = require("./text")

let monitor = { erros: [] }
let DEBUG_LOGS = String(process.env.DEBUG_LOGS || "").toLowerCase() === "true"

function configurarLogging(opcoes = {}) {
  if (opcoes.monitor) monitor = opcoes.monitor
  if (Object.prototype.hasOwnProperty.call(opcoes, "DEBUG_LOGS")) DEBUG_LOGS = opcoes.DEBUG_LOGS
}

function logDebug(...args) {
  if (DEBUG_LOGS) console.log(...args)
}

function logContextoExecucao({ from = "", stage = "", flow = "", msg = "" } = {}) {
  logDebug(`[USER] ${sanitizarTextoEntrada(from) || "-"}`)
  logDebug(`[STAGE] ${sanitizarTextoEntrada(stage) || "-"}`)
  logDebug(`[FLOW] ${sanitizarTextoEntrada(flow) || "-"}`)
  logDebug(`[MSG] ${sanitizarTextoEntrada(msg) || "-"}`)
}

function logErro(tipo, msg, err = null) {
  monitor.erros.push({ tipo, msg, ts: new Date().toISOString() })
  if (monitor.erros.length > 100) monitor.erros.shift()

  const tipoNormalizado = sanitizarTextoEntrada(tipo).toUpperCase()
  if (tipoNormalizado === "STAGE_INVALIDO") {
    console.error(`[ERRO][STAGE_INVALIDO] ${msg}`)
  } else if (tipoNormalizado) {
    console.error(`[ERRO] [${tipoNormalizado}] ${msg}`)
  } else {
    console.error(`[ERRO] ${msg}`)
  }

  if (err?.stack) console.error(`[ERRO] ${err.stack}`)
}

module.exports = {
  configurarLogging,
  logDebug,
  logContextoExecucao,
  logErro
}
