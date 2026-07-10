const fs = require("fs")
const path = require("path")
const { execSync } = require("child_process")

require("dotenv").config({ quiet: true })

const serverPath = path.join(__dirname, "server.js")
const problemas = []

function ok(msg) {
  console.log(`✅ ${msg}`)
}

function falha(msg) {
  console.log(`❌ ${msg}`)
  problemas.push(msg)
}

function verificarNodeCheck() {
  try {
    execSync("node --check server.js", {
      cwd: __dirname,
      stdio: "pipe"
    })
    ok("node --check server.js")
  } catch (err) {
    const detalhe = err.stderr?.toString().trim() || err.message
    falha(`node --check server.js falhou${detalhe ? `: ${detalhe}` : ""}`)
  }
}

function lerServer() {
  try {
    return fs.readFileSync(serverPath, "utf8")
  } catch (err) {
    falha(`Não foi possível ler server.js: ${err.message}`)
    return ""
  }
}

function verificarIncludes(conteudo, titulo, itens) {
  console.log(`\n${titulo}`)
  for (const item of itens) {
    if (conteudo.includes(item)) ok(item)
    else falha(`${titulo}: ${item} não encontrado`)
  }
}

function verificarEnv(vars) {
  console.log("\nVariáveis de ambiente")
  for (const nome of vars) {
    if (process.env[nome]) ok(nome)
    else falha(`Variável de ambiente ausente: ${nome}`)
  }
}

console.log("Verificação Oráculum Bot\n")

verificarNodeCheck()

const server = lerServer()

verificarIncludes(server, "Funções esperadas", [
  "setStage",
  "finalizarCadastro",
  "gerarCaso",
  "processar",
  "processarInterno",
  "flowAssessoriaInicial",
  "menuCliente",
  "digitando",
  "gerarAudioAtendente"
])

verificarIncludes(server, "Stages esperados", [
  "ACOLHIMENTO_NOME",
  "CONFIRMACAO",
  "CLIENTE",
  "ASSESSORIA_INICIAL",
  "DOCUMENTOS",
  "AGENDAMENTO_HORARIO",
  "AGENDAMENTO_CONFIRMAR",
  "AGUARDANDO_URGENTE",
  "RETOMADA_MENU"
])

verificarEnv([
  "WHATSAPP_TOKEN",
  "PHONE_NUMBER_ID",
  "HUBSPOT_TOKEN",
  "GROQ_KEY",
  "ASSEMBLYAI_KEY",
  "GOOGLE_CLIENT_ID",
  "GOOGLE_REFRESH_TOKEN",
  "DRIVE_PASTA_CLIENTES_ID",
  "WHATSAPP_ADMIN",
  "GMAIL_USER"
])

console.log("\nResumo")
if (problemas.length === 0) {
  console.log("✅ Tudo ok. Pode reiniciar o servidor.")
} else {
  console.log("❌ Problemas encontrados. NÃO reinicie antes de verificar.")
  for (const problema of problemas) {
    console.log(`- ${problema}`)
  }
  process.exitCode = 1
}
