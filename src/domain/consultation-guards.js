const { AsyncLocalStorage } = require("node:async_hooks")

const consultaReadContext = new AsyncLocalStorage()

function enforcementMode() {
  const configurado = String(process.env.CONSULTA_ENFORCEMENT_MODE || "").toLowerCase()
  if (["strict", "warn", "off"].includes(configurado)) return configurado
  const ambiente = String(process.env.NODE_ENV || "").toLowerCase()
  if (ambiente === "production") return "strict"
  if (["development", "test"].includes(ambiente)) return "warn"
  return "off"
}

function withConsultaReadAccess(context, callback) {
  return consultaReadContext.run({ autorizado: true, context }, callback)
}

function assertConsultaReadAccess(context = "consulta.read") {
  if (consultaReadContext.getStore()?.autorizado) return true
  const mode = enforcementMode()
  if (mode === "off") return false

  const mensagem = `[consulta-enforcement] leitura direta proibida: ${context}. Use getConsultaView().`
  if (mode === "strict") {
    const erro = new Error(mensagem)
    erro.code = "CONSULTA_DIRECT_READ_FORBIDDEN"
    throw erro
  }
  console.warn(mensagem)
  return false
}

function validarStack(stackTraceCheck) {
  if (typeof stackTraceCheck === "function") return stackTraceCheck(new Error().stack)
  return true
}

function forbidDirectCalendarUsage(stackTraceCheck = true) {
  if (!validarStack(stackTraceCheck)) return true
  return assertConsultaReadAccess("calendar-scheduling")
}

function forbidDirectEventStoreUsage(stackTraceCheck = true) {
  if (!validarStack(stackTraceCheck)) return true
  return assertConsultaReadAccess("consultation-events")
}

module.exports = {
  assertConsultaReadAccess,
  forbidDirectCalendarUsage,
  forbidDirectEventStoreUsage,
  withConsultaReadAccess
}
