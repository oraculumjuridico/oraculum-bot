const http = require("node:http")
const { google } = require("googleapis")

require("dotenv").config({ quiet: true })

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID || ""
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || ""
const PORT = Number(process.env.GOOGLE_OAUTH_LOCAL_PORT || 3333)
const REDIRECT_URI = `http://127.0.0.1:${PORT}/oauth2callback`

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error("GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET precisam estar configurados no .env.")
  process.exit(1)
}

const oauth2 = new google.auth.OAuth2(
  CLIENT_ID,
  CLIENT_SECRET,
  REDIRECT_URI
)

const SCOPES = [
  "https://www.googleapis.com/auth/drive",
  "https://www.googleapis.com/auth/calendar"
]

function htmlResposta(titulo, mensagem) {
  return `<!doctype html>
<html lang="pt-BR">
<head><meta charset="utf-8"><title>${titulo}</title></head>
<body style="font-family: Arial, sans-serif; max-width: 720px; margin: 48px auto; line-height: 1.5;">
  <h1>${titulo}</h1>
  <p>${mensagem}</p>
  <p>Voce ja pode voltar para o terminal.</p>
</body>
</html>`
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, REDIRECT_URI)

  if (url.pathname !== "/oauth2callback") {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" })
    res.end("Rota nao encontrada.")
    return
  }

  const error = url.searchParams.get("error")
  const code = url.searchParams.get("code")

  if (error || !code) {
    res.writeHead(400, { "content-type": "text/html; charset=utf-8" })
    res.end(htmlResposta("Autorizacao nao concluida", error || "Codigo de autorizacao ausente."))
    server.close()
    return
  }

  try {
    const { tokens } = await oauth2.getToken(code)
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" })
    res.end(htmlResposta("Token gerado", "O novo token foi impresso no terminal."))

    if (!tokens.refresh_token) {
      console.log("\nNao recebi refresh token.")
      console.log("Revogue o acesso antigo do app na sua conta Google e rode este script novamente.\n")
    } else {
      console.log("\nSeu novo GOOGLE_REFRESH_TOKEN:\n")
      console.log(tokens.refresh_token)
      console.log("\nCole esse valor no seu .env e reinicie o servidor.\n")
    }
  } catch (e) {
    res.writeHead(500, { "content-type": "text/html; charset=utf-8" })
    res.end(htmlResposta("Falha ao gerar token", e.message))
    console.error("\nFalha ao gerar token:", e.message)
  } finally {
    server.close()
  }
})

server.listen(PORT, "127.0.0.1", () => {
  const url = oauth2.generateAuthUrl({
    access_type: "offline",
    scope: SCOPES,
    prompt: "consent"
  })

  console.log(`\nServidor local aguardando em ${REDIRECT_URI}`)
  console.log("\nAcesse esta URL no navegador:\n")
  console.log(url)
  console.log("\nDepois de autorizar, o Google deve redirecionar para o servidor local automaticamente.\n")
})

server.on("error", error => {
  if (error.code === "EADDRINUSE") {
    console.error(`A porta ${PORT} ja esta em uso. Defina GOOGLE_OAUTH_LOCAL_PORT no .env e tente novamente.`)
    return
  }
  console.error("Falha ao iniciar servidor local:", error.message)
})
