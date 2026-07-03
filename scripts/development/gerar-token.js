const { google } = require("googleapis")
const readline = require("readline")

require("dotenv").config({ quiet: true })

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID || ""
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || ""

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error("GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET precisam estar configurados no .env.")
  process.exit(1)
}

const oauth2 = new google.auth.OAuth2(
  CLIENT_ID,
  CLIENT_SECRET,
  "urn:ietf:wg:oauth:2.0:oob"
)

// Escopos: Drive + Calendar (cobre tudo que o projeto usa)
const SCOPES = [
  "https://www.googleapis.com/auth/drive",
  "https://www.googleapis.com/auth/calendar"
]

const url = oauth2.generateAuthUrl({
  access_type: "offline",
  scope: SCOPES,
  prompt: "consent"
})

console.log("\nAcesse esta URL no navegador:\n")
console.log(url)
console.log("\n")

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
})

rl.question("Cole aqui o codigo de autorizacao do Google: ", async (code) => {
  try {
    const { tokens } = await oauth2.getToken(code.trim())
    if (!tokens.refresh_token) {
      console.log("\nNao recebi refresh token. Revogue o acesso antigo no Google e tente novamente.\n")
    } else {
      console.log("\nSeu novo GOOGLE_REFRESH_TOKEN:\n")
      console.log(tokens.refresh_token)
      console.log("\nCole esse valor no seu .env\n")
    }
  } catch (e) {
    console.error("\nFalha ao gerar token:", e.message)
  } finally {
    rl.close()
  }
})
