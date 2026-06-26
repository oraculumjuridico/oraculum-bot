const { calcularStatusDocumentos } = require("./documents-core")
const { sanitizarTextoEntrada } = require("../utils/text")

let deps = {
  ADMIN_IDS: {},
  labelStageAdmin: stage => sanitizarTextoEntrada(stage) || "⚪ Sem stage"
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

function resumoCasoAdmin({ from, u }, idx = null) {
  const prefixo = idx !== null ? `${idx}. ` : ""
  const caso = u.numeroCaso ? `📄 Caso ${u.numeroCaso}` : "📄 Sem caso"
  const area = u.area || "Area nao definida"
  const stage = deps.labelStageAdmin(u.negocioStageId)
  const docs = calcularStatusDocumentos(u)
  const faltantes = docs.faltantesCriticos.length ? `\n   📎 Docs: ${docs.faltantesCriticos.length} faltante(s)` : ""
  const telefone = from ? `\n   📱 WhatsApp: ${from}` : ""
  return `${prefixo}👤 *${u.nome || u.nomeWA || "Cliente"}*\n   ${caso}\n   ⚖️ ${area} · ${stage}${faltantes}${telefone}`
}

function tituloOpcaoCasoAdmin(item, idx) {
  const nome = sanitizarTextoEntrada(item?.u?.nome || item?.u?.nomeWA || "Cliente")
  return `${idx + 1}. ${nome.slice(0, 18)}`
}

function opcoesAposAcaoCasoAdmin() {
  return [
    { id: deps.ADMIN_IDS.casoRevisado, title: "✅ Revisado" },
    { id: deps.ADMIN_IDS.prioridades, title: "📌 Prioridades" },
    { id: deps.ADMIN_IDS.menu, title: "🏠 Menu admin" }
  ]
}

module.exports = {
  configurarAdminCaseUi,
  idadeUltimaInteracaoAdmin,
  minutosParaTexto,
  labelIdadeAdmin,
  resumoCasoAdmin,
  tituloOpcaoCasoAdmin,
  opcoesAposAcaoCasoAdmin
}
