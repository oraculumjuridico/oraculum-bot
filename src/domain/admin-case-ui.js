const { calcularStatusDocumentos } = require("./documents-core")
const { sanitizarTextoEntrada } = require("../utils/text")

let deps = {
  ADMIN_IDS: {},
  labelStageAdmin: stage => sanitizarTextoEntrada(stage) || "Sem stage",
  resolverNomeBriefing: u => sanitizarTextoEntrada(u?.nome || u?.nomeWA) || "Cliente",
  resolverTelefoneAdminAutenticado: () => "",
  primeiroEUltimoNome: nome => sanitizarTextoEntrada(nome)
}

const ADMIN_MENU_LABELS = Object.freeze({
  marcarRevisado: "Marcar como revisado",
  marcarUrgente: "Marcar como urgente",
  registrarAnalise: "Registrar análise",
  pedirDocumentos: "Pedir documentos",
  lembrarCliente: "Lembrar cliente",
  abrirLinksCaso: "Abrir links do caso",
  verConsultas: "Ver agendamentos",
  voltarLista: "Voltar à lista",
  voltarMenu: "Voltar ao menu admin"
})

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

function tituloCasoCurtoAdmin(u = {}, nome = "Cliente") {
  const caso = sanitizarTextoEntrada(u.numeroCaso || "")
  if (!caso) return `${nome} - sem caso`
  return `${abreviarAreaAdmin(u.area)} - Caso ${caso}`
}

function resumoCasoAdmin({ from, u }, idx = null, { adminAutenticado = false } = {}) {
  const prefixo = idx !== null ? `${idx}. ` : ""
  const cliente = deps.resolverNomeBriefing(u)
  const titulo = tituloCasoCurtoAdmin(u, nomeCurtoAdmin(cliente))
  const stage = deps.labelStageAdmin(u.negocioStageId || u.stage)
  const docs = calcularStatusDocumentos(u)
  const faltantes = docs.faltantesCriticos.length ? `\n   Docs: ${docs.faltantesCriticos.length} faltante(s)` : ""
  const telefoneAdmin = deps.resolverTelefoneAdminAutenticado({ from, u }, adminAutenticado)
  const telefone = telefoneAdmin ? `\n   WhatsApp: ${telefoneAdmin}` : ""
  return `${prefixo}*${titulo}*\n   Cliente: ${cliente}\n   ${stage}${faltantes}${telefone}`
}

function tituloOpcaoCasoAdmin(item, idx, options = {}) {
  const u = item?.u || {}
  const nome = options.nomeCurto || deps.primeiroEUltimoNome(deps.resolverNomeBriefing(u)) || "Cliente"
  const telefone = String(item?.from || u?._numero || u?.whatsappContato || "").replace(/\D/g, "")
  const sufixo = options.duplicado && telefone.length >= 4 ? ` - ${telefone.slice(-4)}` : ""
  const prefixo = `${idx + 1}. `
  const limiteNome = Math.max(1, 24 - prefixo.length - sufixo.length)
  return `${prefixo}${nome.slice(0, limiteNome).trim()}${sufixo}`
}

function opcoesAposAcaoCasoAdmin() {
  return [
    { id: deps.ADMIN_IDS.casoRevisado, title: ADMIN_MENU_LABELS.marcarRevisado },
    { id: deps.ADMIN_IDS.prioridades, title: "Prioridades" },
    { id: deps.ADMIN_IDS.menu, title: ADMIN_MENU_LABELS.voltarMenu }
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
  opcoesAposAcaoCasoAdmin,
  ADMIN_MENU_LABELS
}
