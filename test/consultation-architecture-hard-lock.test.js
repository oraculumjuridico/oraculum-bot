const assert = require("node:assert/strict")
const fs = require("node:fs")
const path = require("node:path")
const { spawnSync } = require("node:child_process")
const {
  auditArchitecture
} = require("../src/scripts/consultation-architecture-audit")

const root = path.join(__dirname, "..")

function arquivosJs(diretorio) {
  return fs.readdirSync(diretorio, { withFileTypes: true }).flatMap(item => {
    if (["node_modules", ".git", "test"].includes(item.name)) return []
    const absoluto = path.join(diretorio, item.name)
    return item.isDirectory() ? arquivosJs(absoluto) : item.name.endsWith(".js") ? [absoluto] : []
  })
}

function auditarFixtureCalendar(arquivo, conteudo, controlledCalendarDirectAccess = {}) {
  const rootFixture = fs.mkdtempSync(path.join(require("node:os").tmpdir(), "calendar-hard-lock-"))
  try {
    const destino = path.join(rootFixture, arquivo)
    fs.mkdirSync(path.dirname(destino), { recursive: true })
    fs.writeFileSync(destino, conteudo)
    const baselinePath = path.join(rootFixture, "baseline.json")
    fs.writeFileSync(baselinePath, JSON.stringify({
      baselineVersion: 1,
      protectedModules: {},
      officialDomainEntries: [],
      allowedDependencies: {},
      controlledCalendarDirectAccess,
      registeredConsultationRoutes: [],
      scan: { include: ["scripts"], exclude: [] }
    }))
    return auditArchitecture({ root: rootFixture, baselinePath, mode: "strict" })
  } finally {
    fs.rmSync(rootFixture, { recursive: true, force: true })
  }
}

function main() {
  const permitidos = new Set([
    "src/domain/consultation-read-model.js",
    "src/domain/calendar-scheduling.js",
    "src/domain/consultation-guards.js",
    "src/domain/consultation/index.js",
    "src/domain/consultation/consultation-replay-engine.js",
    "src/scripts/consultation-architecture-audit.js",
    "scripts/audit-consulta-enforcement.js"
  ])
  const importProtegido = /require\s*\([^)]*(?:calendar-scheduling|consultation-events)/
  const violacoes = [path.join(root, "server.js"), ...arquivosJs(path.join(root, "src")), ...arquivosJs(path.join(root, "scripts"))]
    .map(arquivo => ({
      arquivo: path.relative(root, arquivo).replaceAll("\\", "/"),
      conteudo: fs.readFileSync(arquivo, "utf8")
    }))
    .filter(item => !permitidos.has(item.arquivo) && importProtegido.test(item.conteudo))
  assert.deepEqual(violacoes.map(item => item.arquivo), [], "import protegido fora do Read Model")

  const resultado = auditArchitecture({
    root,
    baselinePath: path.join(root, "consultation-architecture-baseline.json"),
    mode: "strict"
  })
  assert.equal(resultado.status, "ok")

  const caminhoControlado = "scripts/calendar-controlled-test.js"
  const metodosControlados = ["calendarList.get", "events.list", "events.insert", "events.get", "events.delete"]
  const excecaoExata = { [caminhoControlado]: { methods: metodosControlados } }
  const chamadasAutorizadas = "calendar.calendarList.get({}); calendar.events.list({}); calendar.events.insert({}); calendar.events.get({}); calendar.events.delete({});"
  assert.equal(auditarFixtureCalendar(caminhoControlado, chamadasAutorizadas, excecaoExata).status, "ok")
  assert.equal(auditarFixtureCalendar("scripts/outro.js", "calendar.events.list({});", excecaoExata).status, "failed")
  assert.equal(auditarFixtureCalendar(caminhoControlado, "calendar.events.patch({});", excecaoExata).status, "failed")
  assert.equal(auditarFixtureCalendar(caminhoControlado, "calendar.events.update({});", excecaoExata).status, "failed")
  assert.equal(auditarFixtureCalendar(caminhoControlado, "calendar.freebusy.query({});", excecaoExata).status, "failed")
  assert.equal(auditarFixtureCalendar(caminhoControlado, chamadasAutorizadas, {}).status, "failed")
  assert.equal(auditarFixtureCalendar(caminhoControlado, chamadasAutorizadas, { "scripts/*": { methods: metodosControlados } }).status, "failed")

  const direto = spawnSync(process.execPath, ["-e", `
    process.env.CONSULTATION_FIREWALL_MODE = "strict";
    require("./src/domain/consultation");
    require("./src/domain/calendar-scheduling");
  `], { cwd: root, encoding: "utf8" })
  assert.notEqual(direto.status, 0)
  assert.match(
    `${direto.stdout}${direto.stderr}`,
    /CONSULTATION_DEPENDENCY_FIREWALL|consultation-firewall/
  )

  const viaReadModel = spawnSync(process.execPath, ["-e", `
    process.env.CONSULTATION_FIREWALL_MODE = "strict";
    require("./src/domain/consultation");
  `], { cwd: root, encoding: "utf8" })
  assert.equal(viaReadModel.status, 0, viaReadModel.stderr)

  const fontesOperacionais = [
    fs.readFileSync(path.join(root, "server.js"), "utf8"),
    fs.readFileSync(path.join(root, "scripts", "reconcile-consulta.js"), "utf8"),
    fs.readFileSync(path.join(root, "scripts", "migrate-consulta-calendar.js"), "utf8")
  ].join("\n")
  assert.doesNotMatch(fontesOperacionais, /_eventoCalendarId/)
  assert.doesNotMatch(fontesOperacionais, /1343040832|HS_STAGE\.AGENDAMENTO/)

  console.log("consultation-architecture-hard-lock.test.js: ok")
}

main()
