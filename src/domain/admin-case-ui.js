const { calcularStatusDocumentos } = require("./documents-core")
const { sanitizarTextoEntrada } = require("../utils/text")

let deps = {
  ADMIN_IDS: {},
  labelStageAdmin: stage => sanitizarTextoEntrada(stage) || "Sem stage"
}

function configurarAdminCaseUi(config = {}) {
  deps = { ...deps, ...config }
}

function idadeUltimaInteracaoAdmin(u = {}) {
  const ts = Number(u?.ultimaMsg || 0)
  if (!Number.isFinite(ts) || ts <= 0) return Infinity
  return Date.now() - ts
}

function minutosParaTexto(ms) {
  const minutos = Math.max(0, Math.floor(Number(ms || 0) / 60000))
  if (minutos < 60) return `${minutos} min`
  const horas = Math.floor(minutos / 60)
  if (horas < 24) return `${horas}h`
  const dias = Math.floor(horas / 24)
  return `${dias}d`
}

function labelIdadeAdmin(ms) {
  if (!Number.isFinite(ms)) return "tempo nao identificado"
  return minutosParaTexto(ms)
}

function normalizarSemAcentoAdmin(value = "") {
  return sanitizarTextoEntrada(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
}

function abreviarAreaAdmin(area = "") {
  const normalizada = normalizarSemAcentoAdmin(area)
  if (normalizada.includes("inss") || normalizada.includes("previd")) return "PREV"
  if (normalizada.includes("trabalh")) return "TRAB"
  if (normalizada.includes("consum")) return "CONS"
  if (normalizada.includes("famil")) return "FAM"
  if (normalizada.includes("banc") || normalizada.includes("financ")) return "BANC"
  if (normalizada.includes("penal") || normalizada.includes("crimin")) return "PEN"
  if (normalizada.includes("imob")) return "IMOB"
  if (normalizada.includes("civil") || normalizada.includes("civel")) return "CIV"
  return "JUR"
}

function nomeCurtoAdmin(nome = "") {
  const partes = sanitizarTextoEntrada(nome).split(/\s+/).filter(Boolean)
  if (!partes.length) return "Cliente"
  if (partes.length === 1) return partes[0]
  return `${partes[0]} ${partes[partes.length - 1]}`.slice(0, 28)
}

function tituloCasoCurtoAdmin(u = {}) {
  const caso = sanitizarTextoEntrada(u.numeroCaso || "")
  return `${abreviarAreaAdmin(u.area)} • Caso ${caso || "sem numero"}`
}

function resumoCasoAdmin({ from, u }, idx = null) {
  const prefixo = idx !== null ? `${idx}. ` : ""
  const titulo = tituloCasoCurtoAdmin(u)
  const cliente = nomeCurtoAdmin(u.nome || u.nomeWA || "Cliente")
  const stage = deps.labelStageAdmin(u.negocioStageId)
  const docs = calcularStatusDocumentos(u)
  const faltantes = docs.faltantesCriticos.length ? `\n   Docs: ${docs.faltantesCriticos.length} faltante(s)` : ""
  const telefone = from ? `\n   WhatsApp: ${from}` : ""
  return `${prefixo}*${titulo}*\n   Cliente: ${cliente}\n   ${stage}${faltantes}${telefone}`
}

function tituloOpcaoCasoAdmin(item, idx) {
  const u = item?.u || {}
  const caso = sanitizarTextoEntrada(u.numeroCaso || "")
  const titulo = `${abreviarAreaAdmin(u.area)} ${caso || "sem caso"}`
  return `${idx + 1}. ${titulo}`.slice(0, 24)
}

function opcoesAposAcaoCasoAdmin() {
  return [
    { id: deps.ADMIN_IDS.casoRevisado, title: "Revisado" },
    { id: deps.ADMIN_IDS.prioridades, title: "Prioridades" },
    { id: deps.ADMIN_IDS.menu, title: "Menu admin" }
  ]
}

module.exports = {
  configurarAdminCaseUi,
  idadeUltimaInteracaoAdmin,
  minutosParaTexto,
  labelIdadeAdmin,
  abreviarAreaAdmin,
  tituloCasoCurtoAdmin,
  resumoCasoAdmin,
  tituloOpcaoCasoAdmin,
  opcoesAposAcaoCasoAdmin
}
