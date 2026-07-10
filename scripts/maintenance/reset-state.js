const fs   = require("fs")
const path = require("path")

const USERS_STATE_FILE = path.join(__dirname, "..", "..", "data", "users-state.json")

if (fs.existsSync(USERS_STATE_FILE)) {
  fs.unlinkSync(USERS_STATE_FILE)
  console.log("✅ users-state.json apagado — estado zerado.")
} else {
  console.log("ℹ️  users-state.json não encontrado — nada a apagar.")
}
