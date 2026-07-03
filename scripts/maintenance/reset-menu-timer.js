const fs = require("fs")
const path = require("path")

const USERS_FILE = path.join(__dirname, "..", "..", "data", "users-state.json")

function normalizarNumero(numero) {
  const digitos = String(numero || "").replace(/\D/g, "")
  if (!digitos) return ""
  if (digitos.startsWith("55")) return digitos
  if (digitos.length === 11) return "55" + digitos
  return digitos
}

function carregarEstado() {
  if (!fs.existsSync(USERS_FILE)) return { savedAt: new Date().toISOString(), users: {} }
  const raw = fs.readFileSync(USERS_FILE, "utf8")
  const parsed = JSON.parse(raw || "{}")
  if (parsed && parsed.users && typeof parsed.users === "object") return parsed
  return { savedAt: new Date().toISOString(), users: parsed && typeof parsed === "object" ? parsed : {} }
}

function limparTimerMenu(usuario) {
  if (!usuario || typeof usuario !== "object") return false
  const tinhaCampo = Object.prototype.hasOwnProperty.call(usuario, "_ultimoMenuClienteAt") ||
    Object.prototype.hasOwnProperty.call(usuario, "_menuClienteBoasVindas")
  delete usuario._ultimoMenuClienteAt
  delete usuario._menuClienteBoasVindas
  return tinhaCampo
}

function main() {
  const estado = carregarEstado()
  const users = estado.users || {}
  const alvo = normalizarNumero(process.argv[2] || "")
  let alterados = 0

  for (const [numero, usuario] of Object.entries(users)) {
    const numeroNormalizado = normalizarNumero(numero)
    const numeroUsuario = normalizarNumero(usuario?._numero || usuario?.whatsappContato || "")
    const deveLimpar = !alvo || alvo === numeroNormalizado || alvo === numeroUsuario
    if (!deveLimpar) continue

    if (limparTimerMenu(usuario)) alterados += 1
  }

  estado.savedAt = new Date().toISOString()
  fs.writeFileSync(USERS_FILE, JSON.stringify(estado, null, 2), "utf8")

  if (alvo) {
    console.log(`Timer do menu resetado para ${alterados} usuário(s) compatível(is) com ${alvo}.`)
  } else {
    console.log(`Timer do menu resetado para ${alterados} usuário(s).`)
  }
}

main()
