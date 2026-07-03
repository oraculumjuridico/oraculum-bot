const assert = require("node:assert/strict")
const fs = require("node:fs")
const os = require("node:os")
const path = require("node:path")
const { spawnSync } = require("node:child_process")
const {
  auditArchitecture
} = require("../src/scripts/consultation-architecture-audit")

function criarProjeto(arquivos, allowedDependencies = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "consulta-architecture-"))
  fs.mkdirSync(path.join(root, "src"), { recursive: true })
  for (const [nome, conteudo] of Object.entries(arquivos)) {
    fs.writeFileSync(path.join(root, "src", nome), conteudo)
  }
  const baseline = {
    version: 1,
    protectedModules: {
      "calendar-scheduling": { readApis: ["obterEstadoConsulta"] },
      "consultation-events": { readApis: ["getConsultaTimeline"] }
    },
    officialDomainEntries: ["getConsultaView"],
    allowedDependencies,
    registeredConsultationRoutes: [],
    scan: { include: ["src"], exclude: [] }
  }
  const baselinePath = path.join(root, "consultation-architecture-baseline.json")
  fs.writeFileSync(baselinePath, JSON.stringify(baseline))
  return { root, baselinePath }
}

function main() {
  const direto = criarProjeto({
    "novo-fluxo.js": "const { obterEstadoConsulta } = require('./domain/calendar-scheduling')\n"
  })
  const resultadoDireto = auditArchitecture({ ...direto, mode: "strict" })
  assert.equal(resultadoDireto.status, "failed")
  assert.ok(resultadoDireto.violacoes.some(item => item.regra === "bypass_read_model"))

  const bypass = criarProjeto({
    "bypass.js": "async function carregar(calendar) { return calendar.events.list({}) }\n"
  })
  const resultadoBypass = auditArchitecture({ ...bypass, mode: "strict" })
  assert.ok(resultadoBypass.violacoes.some(item => item.regra === "calendar_direto"))

  const dinamico = criarProjeto({
    "dinamico.js": "const alvo = './domain/' + 'calendar-scheduling'\nmodule.exports = require(alvo)\n"
  })
  assert.ok(
    auditArchitecture({ ...dinamico, mode: "strict" }).violacoes
      .some(item => item.regra === "require_dinamico")
  )

  const indireto = criarProjeto({
    "barrel.js": "module.exports = require('./domain/calendar-scheduling')\n",
    "consumidor.js": "module.exports = require('./barrel')\n"
  })
  const resultadoIndireto = auditArchitecture({ ...indireto, mode: "strict" })
  assert.ok(resultadoIndireto.violacoes.some(item => item.regra === "barrel_bypass"))
  assert.ok(
    resultadoIndireto.violacoes.some(item =>
      item.arquivo === "src/consumidor.js" && item.regra === "import_indireto_protegido"
    )
  )

  const correto = criarProjeto(
    { "fluxo-correto.js": "const { getConsultaView } = require('./domain/consultation')\n" },
    { "src/fluxo-correto.js": { "consultation": ["getConsultaView"] } }
  )
  assert.equal(auditArchitecture({ ...correto, mode: "strict" }).status, "ok")

  const cli = spawnSync(
    process.execPath,
    [
      path.join(__dirname, "..", "src", "scripts", "consultation-architecture-audit.js"),
      "--root", direto.root,
      "--baseline", direto.baselinePath,
      "--mode", "strict"
    ],
    { encoding: "utf8" }
  )
  assert.equal(cli.status, 1)
  assert.match(cli.stderr, /consulta_architecture_audit/)

  const warning = auditArchitecture({ ...direto, mode: "warn" })
  assert.equal(warning.status, "warning")

  console.log("consultation-architecture-audit.test.js: ok")
}

main()
