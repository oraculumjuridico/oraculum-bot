const fs = require("node:fs")
const path = require("node:path")

const ROOT = path.join(__dirname, "..")
const ALLOWED = new Set([
  "src/domain/calendar-scheduling.js",
  "src/domain/consultation-events.js",
  "src/domain/consultation-read-model.js",
  "src/domain/consultation/consultation-replay-engine.js",
  "src/domain/consultation-guards.js",
  "scripts/audit-consulta-phase1.js",
  "scripts/audit-consulta-enforcement.js"
])
const READ_APIS = [
  "obterEstadoConsulta",
  "obterEstadoEventoConsulta",
  "buscarEventoConsultaPorDeal",
  "listarEventosConsultaAtivos",
  "listarTodosEventosConsulta",
  "listarEventosConsultaPorDeal",
  "buscarPrimeiroEventoCalendarNoIntervalo",
  "classificarEstadoEvento",
  "selecionarEventoConsultaMaisRecente",
  "getConsultaHistory",
  "getConsultaTimeline"
]

function arquivosJs(diretorio) {
  return fs.readdirSync(diretorio, { withFileTypes: true }).flatMap(item => {
    if (["node_modules", ".git", "test"].includes(item.name)) return []
    const absoluto = path.join(diretorio, item.name)
    return item.isDirectory() ? arquivosJs(absoluto) : item.name.endsWith(".js") ? [absoluto] : []
  })
}

const candidatos = [
  path.join(ROOT, "server.js"),
  ...arquivosJs(path.join(ROOT, "src")),
  ...arquivosJs(path.join(ROOT, "scripts"))
]
const violacoes = []

for (const arquivo of candidatos) {
  const relativo = path.relative(ROOT, arquivo).replaceAll("\\", "/")
  if (ALLOWED.has(relativo)) continue
  const conteudo = fs.readFileSync(arquivo, "utf8")
  const linhas = conteudo.split(/\r?\n/)

  const importsDiretos = [
    ...conteudo.matchAll(
      /const\s*\{([^}]*)\}\s*=\s*require\(["'][^"']*(calendar-scheduling|consultation-events)["']\)/g
    )
  ]
  for (const importacao of importsDiretos) {
    const linhaImportacao = conteudo.slice(0, importacao.index).split(/\r?\n/).length
    for (const api of READ_APIS) {
      if (new RegExp(`\\b${api}\\b`).test(importacao[1])) {
        violacoes.push({ arquivo: relativo, linha: linhaImportacao, regra: `import direto ${api}` })
      }
    }
  }

  linhas.forEach((linha, index) => {
    if (/\.events\.(get|list)\s*\(/.test(linha)) {
      violacoes.push({ arquivo: relativo, linha: index + 1, regra: "leitura direta Google Calendar" })
    }
  })
}

if (violacoes.length) {
  console.error(JSON.stringify({
    evento: "consulta_enforcement_audit",
    status: "failed",
    violacoes
  }, null, 2))
  process.exitCode = 1
} else {
  console.log(JSON.stringify({
    evento: "consulta_enforcement_audit",
    status: "ok",
    arquivosVerificados: candidatos.length
  }))
}
