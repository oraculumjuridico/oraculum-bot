const crypto = require("crypto")
const { sanitizarTextoEntrada } = require("../utils/text")
const { mascararTelefoneLog } = require("../utils/logging")

const ADMIN_WHATSAPP_PASSWORD = sanitizarTextoEntrada(process.env.ADMIN_WHATSAPP_PASSWORD)
const ADMIN_WHATSAPP_PASSWORD_HASH = sanitizarTextoEntrada(process.env.ADMIN_WHATSAPP_PASSWORD_HASH)
const ADMIN_AUTH_TTL_MS = 30 * 60 * 1000
const ADMIN_AUTH_MAX_TENTATIVAS = 3
const ADMIN_AUTH_BLOQUEIO_MS = 5 * 60 * 1000

let deps = {
  WHATSAPP_ADMIN: "",
  sessoesAdminWhatsApp: null,
  sessoesAdminAutenticadas: null,
  tentativasAdminWhatsApp: null,
  normalizarNumeroWhatsAppEnvio: valor => valor
}

function configurarAdminAuth(config = {}) {
  deps = { ...deps, ...config }
}

function ehWhatsAppAdmin(from) {
  const admin = deps.normalizarNumeroWhatsAppEnvio(deps.WHATSAPP_ADMIN)
  const origem = deps.normalizarNumeroWhatsAppEnvio(from)
  return Boolean(admin && origem && admin === origem)
}

function chaveAdminWhatsApp(from) {
  return deps.normalizarNumeroWhatsAppEnvio(from)
}

function logSegurancaAdmin(from, evento) {
  const numeroCheio = chaveAdminWhatsApp(from) || ""
  const numeroMascarado = numeroCheio ? mascararTelefoneLog(numeroCheio) : "-"
  console.warn(`[admin-seguranca] ${evento} numero=${numeroMascarado}`)
}

function hashSenhaAdmin(valor) {
  return crypto.createHash("sha256").update(String(valor || ""), "utf8").digest("hex")
}

function compararTextoSeguro(a, b) {
  const textoA = sanitizarTextoEntrada(a)
  const textoB = sanitizarTextoEntrada(b)
  if (!textoA || !textoB) return false
  const bufferA = Buffer.from(textoA, "utf8")
  const bufferB = Buffer.from(textoB, "utf8")
  if (bufferA.length !== bufferB.length) return false
  return crypto.timingSafeEqual(bufferA, bufferB)
}

function senhaAdminConfigurada() {
  return Boolean(ADMIN_WHATSAPP_PASSWORD || ADMIN_WHATSAPP_PASSWORD_HASH)
}

// Material estável usado apenas para derivar a chave do cofre. Nunca deve ser
// devolvido por endpoint, registrado em log ou persistido no banco.
function obterMaterialChaveAdmin() {
  return ADMIN_WHATSAPP_PASSWORD ? hashSenhaAdmin(ADMIN_WHATSAPP_PASSWORD) : (ADMIN_WHATSAPP_PASSWORD_HASH || "")
}

function senhaAdminValida(valor) {
  const senhaInformada = sanitizarTextoEntrada(valor)
  if (!senhaInformada || !senhaAdminConfigurada()) return false
  if (ADMIN_WHATSAPP_PASSWORD && compararTextoSeguro(senhaInformada, ADMIN_WHATSAPP_PASSWORD)) return true
  if (ADMIN_WHATSAPP_PASSWORD_HASH && compararTextoSeguro(hashSenhaAdmin(senhaInformada), ADMIN_WHATSAPP_PASSWORD_HASH)) return true
  return false
}

function obterTentativaAdminWhatsApp(from) {
  const chave = chaveAdminWhatsApp(from)
  if (!chave) return { chave: "", tentativas: 0, bloqueadoAte: 0 }
  const tentativa = deps.tentativasAdminWhatsApp.get(chave) || { tentativas: 0, bloqueadoAte: 0 }
  const bloqueadoAte = Number(tentativa.bloqueadoAte || 0)
  if (bloqueadoAte && Date.now() > bloqueadoAte) {
    deps.tentativasAdminWhatsApp.delete(chave)
    return { chave, tentativas: 0, bloqueadoAte: 0 }
  }
  return { chave, ...tentativa, bloqueadoAte }
}

function adminWhatsAppBloqueado(from) {
  const tentativa = obterTentativaAdminWhatsApp(from)
  return Boolean(tentativa.bloqueadoAte && Date.now() < tentativa.bloqueadoAte)
}

function registrarFalhaSenhaAdmin(from) {
  const tentativa = obterTentativaAdminWhatsApp(from)
  if (!tentativa.chave) return
  const tentativas = Number(tentativa.tentativas || 0) + 1
  if (tentativas >= ADMIN_AUTH_MAX_TENTATIVAS) {
    deps.tentativasAdminWhatsApp.set(tentativa.chave, {
      tentativas,
      bloqueadoAte: Date.now() + ADMIN_AUTH_BLOQUEIO_MS
    })
    logSegurancaAdmin(from, "admin bloqueado por tentativas")
    return
  }
  deps.tentativasAdminWhatsApp.set(tentativa.chave, { tentativas, bloqueadoAte: 0 })
  logSegurancaAdmin(from, "senha incorreta")
}

function adminWhatsAppAutenticado(from) {
  const chave = chaveAdminWhatsApp(from)
  const sessao = chave ? deps.sessoesAdminAutenticadas.get(chave) : null
  if (!sessao) return false
  if (Date.now() - Number(sessao.ts || 0) > ADMIN_AUTH_TTL_MS) {
    deps.sessoesAdminAutenticadas.delete(chave)
    return false
  }
  sessao.ts = Date.now()
  deps.sessoesAdminAutenticadas.set(chave, sessao)
  return true
}

function telaSenhaAdminWhatsApp({ tentativaInvalida = false, bloqueado = false, configuracaoAusente = false } = {}) {
  return {
    texto: [
      "*Admin Oraculum*",
      "",
      configuracaoAusente
        ? "Admin indisponivel. Configuracao de seguranca ausente."
        : bloqueado
          ? "Acesso temporariamente bloqueado. Tente novamente em alguns minutos."
          : tentativaInvalida
            ? "Senha incorreta."
            : "Digite a senha para acessar o menu admin."
    ].join("\n"),
    opcoes: null,
    registrarPergunta: false,
    audio: false
  }
}

function autenticarAdminWhatsApp(from) {
  const chave = chaveAdminWhatsApp(from)
  if (!chave) return
  deps.sessoesAdminAutenticadas.set(chave, { ts: Date.now() })
  deps.tentativasAdminWhatsApp.delete(chave)
  logSegurancaAdmin(from, "admin autenticado")
}

function bloquearAdminWhatsApp(from) {
  const chave = chaveAdminWhatsApp(from)
  if (!chave) return
  deps.sessoesAdminAutenticadas.delete(chave)
  deps.sessoesAdminWhatsApp.delete(chave)
  deps.tentativasAdminWhatsApp.delete(chave)
  logSegurancaAdmin(from, "logout manual")
}

module.exports = {
  configurarAdminAuth,
  ehWhatsAppAdmin,
  chaveAdminWhatsApp,
  logSegurancaAdmin,
  hashSenhaAdmin,
  compararTextoSeguro,
  senhaAdminConfigurada,
  obterMaterialChaveAdmin,
  senhaAdminValida,
  obterTentativaAdminWhatsApp,
  adminWhatsAppBloqueado,
  registrarFalhaSenhaAdmin,
  adminWhatsAppAutenticado,
  telaSenhaAdminWhatsApp,
  autenticarAdminWhatsApp,
  bloquearAdminWhatsApp
}
