const fs = require("fs")
const path = require("path")

const USERS_FILE = path.join(__dirname, "..", "..", "data", "users-state.json")
const AUDIOS_DIR = path.join(__dirname, "..", "..", "audios", "atendentes")

// Apaga estado dos usuários
if (fs.existsSync(USERS_FILE)) {
  fs.writeFileSync(USERS_FILE, "{}")
  console.log("✅ users-state.json limpo")
} else {
  console.log("⚠️ users-state.json não encontrado")
}

// Apaga áudios temporários gerados
const audios = fs.readdirSync(AUDIOS_DIR).filter(f => f.endsWith(".ogg") || f.endsWith(".mp3"))
audios.forEach(f => fs.unlinkSync(path.join(AUDIOS_DIR, f)))
console.log(`✅ ${audios.length} áudio(s) removido(s)`)

console.log("🔄 Pronto! Reinicie o servidor para aplicar.")
